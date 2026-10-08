// TTS generation API route

import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";
import { z } from "zod";
import { NotFoundError, runFrameOp } from "@/lib/frameOps";

// ─── Shared types ───────────────────────────────────────────────────────────

interface AudioGenerationConfig {
  voice?: string;
  speed?: number;
  audioFormat?: "wav" | "mp3" | "ogg";
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
    model: z.string().default("mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16"),
    defaultVoice: z.string().default("Ryan"),
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
      model: process.env.TTS_MODEL ?? "mlx-community/Qwen3-TTS-12Hz-0.6B-CustomVoice-bf16",
      defaultVoice: process.env.TTS_VOICE ?? "Ryan",
    },
  };

  cached = configSchema.parse(raw);
  return cached;
}

// ─── Audio provider interface ───────────────────────────────────────────────

interface AudioProvider {
  generate(
    text: string,
    config?: AudioGenerationConfig
  ): Promise<{ url: string; duration: number }>;
}

// ─── Local TTS provider ─────────────────────────────────────────────────────

class LocalTTSProvider implements AudioProvider {
  private mediaDir: string;
  private model: string;
  private defaultVoice: string;

  constructor() {
    const cfg = getConfig();
    this.mediaDir = cfg.tts.mediaDir;
    this.model = cfg.tts.model;
    this.defaultVoice = cfg.tts.defaultVoice;
    this.ensureDir();
  }

  private ensureDir(): void {
    if (!existsSync(this.mediaDir)) {
      mkdirSync(this.mediaDir, { recursive: true });
    }
  }

  async generate(
    text: string,
    config?: AudioGenerationConfig
  ): Promise<{ url: string; duration: number }> {
    this.ensureDir();

    const id = crypto.randomUUID().slice(0, 8);
    // mlx-audio appends a zero-based segment suffix, including for one-frame output.
    const outputName = `audio-${id}_000.wav`;
    const outputDir = this.mediaDir;
    const prefix = `audio-${id}`;

    const args = [
      "--model", this.model,
      "--text", text,
      "--voice", config?.voice ?? this.defaultVoice,
      "--output_path", outputDir,
      "--file_prefix", prefix,
    ];

    if (config?.speed) args.push("--speed", String(config.speed));
    if (config?.audioFormat) args.push("--audio_format", config.audioFormat);

    const { exitCode, stderr } = await this.runSpawn(args);

    if (exitCode !== 0) {
      throw new Error(`mlx_audio.tts.generate failed (exit ${exitCode}): ${stderr}`);
    }

    return {
      url: `/media/${outputName}`,
      duration: 0, // TODO: detect duration from output file
    };
  }

  private runSpawn(args: string[]): Promise<{ exitCode: number | null; stderr: string }> {
    const { promise, resolve } = Promise.withResolvers<{ exitCode: number | null; stderr: string }>();
    const proc = spawn("mlx_audio.tts.generate", args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
    });

    const chunks: Buffer[] = [];
    proc.stderr?.on("data", (data: Buffer) => chunks.push(data));
    proc.on("close", (code) => resolve({ exitCode: code, stderr: Buffer.concat(chunks).toString() }));
    proc.on("error", () => resolve({ exitCode: 1, stderr: "spawn failed" }));

    return promise;
  }
}

// ─── Factory ────────────────────────────────────────────────────────────────

let audioProvider: AudioProvider | null = null;

function getAudioProvider(): AudioProvider {
  if (!audioProvider) {
    audioProvider = new LocalTTSProvider();
  }
  return audioProvider;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { text, config, storyId, frameId } = body as {
      text?: string;
      config?: Record<string, unknown>;
      storyId?: string;
      frameId?: string;
    };

    // Frame mode: voice the saved narration and save the result on the frame.
    if (storyId && frameId) {
      const frame = await runFrameOp(storyId, frameId, async (_story, frame) => {
        if (!frame.narration) throw new Error("This frame has no narration.");
        const result = await getAudioProvider().generate(frame.narration, config);
        return { audioUrl: result.url, metadata: { audioDuration: result.duration } };
      });
      return NextResponse.json({ frame });
    }

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Missing required 'text' field" },
        { status: 400 }
      );
    }

    const provider = getAudioProvider();
    const result = await provider.generate(text, config as Record<string, unknown>);

    return NextResponse.json({ ...result });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("TTS generation failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
