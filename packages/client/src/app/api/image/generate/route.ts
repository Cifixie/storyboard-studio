// Image generation API route

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { z } from "zod";
import { NotFoundError, runFrameOp } from "@/lib/frameOps";
import { listAssets } from "@/lib/db";
import { composeImagePrompt } from "@/lib/storyGen";

// ─── Shared types ───────────────────────────────────────────────────────────

// mflux ships one binary per family; the qwen binaries ignore --model for
// qwen variants (verified: `mflux-generate-qwen --model qwen-image-2.1`
// silently downloaded Qwen/Qwen-Image-2512). Choose the binary instead.
const BINARY_BY_MODEL = {
  "qwen-image": "mflux-generate-qwen",
  "qwen-image-edit": "mflux-generate-qwen-edit",
  "qwen-image-2.1": "mflux-generate-qwen-2.1",
} as const;

const DEFAULT_MODEL = "qwen-image-2.1";
const DEFAULT_QUANTIZE = 6;

interface ImageGenerationConfig {
  model?: "qwen-image" | "qwen-image-edit" | "qwen-image-2.1";
  quantize?: number;
  timeoutSeconds?: number;
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  loraStyle?: "couple" | "font" | "home" | "identity" | "illustration" | "portrait" | "ppt" | "sandstorm" | "sparklers" | "storyboard";
  negativePrompt?: string;
  imageEdit?: {
    imagePath: string;
    strength: number;
  };
}

// ─── Configuration ──────────────────────────────────────────────────────────

const configSchema = z.object({
  // ─── Provider Mode ──────────────────────────────────────────────────────
  mode: z.enum(["local", "cloud"]).default("local"),

  // ─── LLM (Story Generation) ────────────────────────────────────────────
  llm: z.object({
    local: z.object({
      baseUrl: z.string().url().default("http://localhost:8000/v1"),
      apiKey: z.string().default("omlx-api-key"),
      model: z.string().default("om-mlx-1.0"),
    }).default({}),
    cloud: z.object({
      baseUrl: z.string().url().default("https://api.openai.com/v1"),
      apiKey: z.string().default(""),
      model: z.string().default("gpt-4o"),
    }).default({}),
  }).default({}),

  // ─── Image (mflux CLI) ─────────────────────────────────────────────────
  image: z.object({
    mediaDir: z.string().default("./public/media"),
  }).default({}),

  // ─── TTS (mlx_audio CLI) ───────────────────────────────────────────────
  tts: z.object({
    mediaDir: z.string().default("./public/media"),
    model: z.string().default("qwen3-tts"),
    defaultVoice: z.string().default("Vivian"),
  }).default({}),
});

type Config = z.infer<typeof configSchema>;

let cached: Config | null = null;

function getConfig(): Config {
  if (cached) return cached;

  const raw = {
    mode: process.env.GENERATION_MODE ?? "local",
    llm: {
      local: {
        baseUrl: process.env.LLM_BASE_URL ?? "http://localhost:8000/v1",
        apiKey: process.env.OMLX_API_KEY ?? "omlx-api-key",
        model: process.env.LLM_MODEL ?? "om-mlx-1.0",
      },
      cloud: {
        baseUrl: process.env.CLOUD_LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.CLOUD_LLM_API_KEY ?? "",
        model: process.env.CLOUD_LLM_MODEL ?? "gpt-4o",
      },
    },
    image: {
      mediaDir: process.env.IMAGE_MEDIA_DIR ?? "./public/media",
    },
    tts: {
      mediaDir: process.env.TTS_MEDIA_DIR ?? "./public/media",
      model: process.env.TTS_MODEL ?? "qwen3-tts",
      defaultVoice: process.env.TTS_VOICE ?? "Vivian",
    },
  };

  cached = configSchema.parse(raw);
  return cached;
}

// ─── Image provider interface ───────────────────────────────────────────────

interface ImageProvider {
  generate(
    prompt: string,
    config?: ImageGenerationConfig
  ): Promise<{ url: string; width: number; height: number; seed: number }>;

  edit(
    imagePath: string,
    prompt: string,
    config?: ImageGenerationConfig & { strength?: number }
  ): Promise<{ url: string; width: number; height: number; seed: number }>;
}

// ─── Local image provider ───────────────────────────────────────────────────

class LocalImageProvider implements ImageProvider {
  private mediaDir: string;

  constructor() {
    this.mediaDir = getConfig().image.mediaDir;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.mediaDir)) {
      mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  async generate(
    prompt: string,
    config?: ImageGenerationConfig
  ): Promise<{ url: string; width: number; height: number; seed: number }> {
    this.ensureDir();

    const seed = config?.seed ?? Math.floor(Math.random() * 2147483647);
    const id = crypto.randomUUID().slice(0, 8);
    const outputName = `img-${id}.png`;
    const outputPath = join(this.mediaDir, outputName);

    const args = [
      "--prompt", prompt,
      "--seed", String(seed),
      "--output", outputPath,
    ];

    if (config?.width) args.push("--width", String(config.width));
    if (config?.height) args.push("--height", String(config.height));
    if (config?.steps) args.push("--steps", String(config.steps));
    if (config?.guidance) args.push("--guidance", String(config.guidance));
    if (config?.loraStyle) args.push("--lora-style", config.loraStyle);
    if (config?.negativePrompt) args.push("--negative-prompt", config.negativePrompt);
    if ((config?.quantize ?? DEFAULT_QUANTIZE)) args.push("--quantize", String(config?.quantize ?? DEFAULT_QUANTIZE));

    const { exitCode, stderr } = await this.runSpawn(BINARY_BY_MODEL[config?.model ?? DEFAULT_MODEL], args, config?.timeoutSeconds);

    if (exitCode !== 0) {
      throw new Error(`mflux failed (exit ${exitCode}): ${stderr}`);
    }


    return {
      url: `/media/${outputName}`,
      width: config?.width ?? 1024,
      height: config?.height ?? 1024,
      seed,
    };
  }

  async edit(
    imagePath: string,
    prompt: string,
    config?: ImageGenerationConfig & { strength?: number }
  ): Promise<{ url: string; width: number; height: number; seed: number }> {
    this.ensureDir();

    const seed = config?.seed ?? Math.floor(Math.random() * 2147483647);
    const id = crypto.randomUUID().slice(0, 8);
    const outputName = `edit-${id}.png`;
    const outputPath = join(this.mediaDir, outputName);

    // mflux-generate-qwen-edit takes --image-paths (plural, no strength flag);
    // edit intent belongs in the prompt text per the CLI's own help.
    const args: string[] = [
      "--image-paths", imagePath,
      "--prompt", prompt,
      "--seed", String(seed),
      "--output", outputPath,
    ];

    if (config?.width) args.push("--width", String(config.width));
    if (config?.height) args.push("--height", String(config.height));
    if (config?.steps) args.push("--steps", String(config.steps));
    if (config?.guidance) args.push("--guidance", String(config.guidance));
    if (config?.loraStyle) args.push("--lora-style", config.loraStyle);
    if (config?.negativePrompt) args.push("--negative-prompt", config.negativePrompt);
    if (config?.quantize ?? DEFAULT_QUANTIZE) args.push("--quantize", String(config?.quantize ?? DEFAULT_QUANTIZE));

    const { exitCode, stderr } = await this.runSpawn(BINARY_BY_MODEL[config?.model ?? "qwen-image-edit"], args, config?.timeoutSeconds);

    if (exitCode !== 0) {
      throw new Error(`mflux failed (exit ${exitCode}): ${stderr}`);
    }


    return {
      url: `/media/${outputName}`,
      width: config?.width ?? 1024,
      height: config?.height ?? 1024,
      seed,
    };
  }

  private runSpawn(
    cmd: string,
    args: string[],
    timeoutSeconds?: number
  ): Promise<{ exitCode: number | null; stderr: string }> {
    const { promise, resolve } = Promise.withResolvers<{ exitCode: number | null; stderr: string }>();
    const proc = spawn(cmd, args, {
      stdio: ["ignore", "ignore", "pipe"],
      timeout: ((timeoutSeconds ?? Number(process.env.IMAGE_TIMEOUT_SECONDS)) || 300) * 1000,
    });

    const chunks: Buffer[] = [];
    proc.stderr?.on("data", (data: Buffer) => chunks.push(data));
    proc.on("close", (code) => resolve({ exitCode: code, stderr: Buffer.concat(chunks).toString() }));
    proc.on("error", () => resolve({ exitCode: 1, stderr: "spawn failed" }));

    return promise;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

let imageProvider: ImageProvider | null = null;

function getImageProvider(): ImageProvider {
  if (!imageProvider) {
    imageProvider = new LocalImageProvider();
  }
  return imageProvider;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt, config, storyId, frameId } = body as {
      prompt?: string;
      config?: Record<string, unknown>;
      storyId?: string;
      frameId?: string;
    };

    // Frame mode: the server builds the prompt from the saved story and saves the result.
    if (storyId && frameId) {
      const frame = await runFrameOp(storyId, frameId, async (story, frame) => {
        const result = await getImageProvider().generate(composeImagePrompt(story, frame, listAssets()), config);
        return {
          imageUrl: result.url,
          metadata: { imageWidth: result.width, imageHeight: result.height, seed: result.seed },
        };
      });
      return NextResponse.json({ frame });
    }

    if (!prompt || typeof prompt !== "string") {
      return NextResponse.json(
        { error: "Missing required 'prompt' field" },
        { status: 400 }
      );
    }

    const provider = getImageProvider();
    const result = await provider.generate(prompt, config as Record<string, unknown>);

    return NextResponse.json({ ...result });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Image generation failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
