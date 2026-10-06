import OpenAI from "openai";
import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

function settings() {
  if (process.env.GENERATION_MODE === "cloud") {
    return {
      baseURL: process.env.CLOUD_LLM_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: process.env.CLOUD_LLM_API_KEY ?? "",
      model: process.env.CLOUD_LLM_MODEL ?? "gpt-4o",
    };
  }
  return {
    baseURL: process.env.LLM_BASE_URL ?? "http://localhost:8000/v1",
    apiKey: process.env.OMLX_API_KEY?.trim() || "omlx-api-key",
    model: process.env.LLM_MODEL ?? "om-mlx-1.0",
  };
}

/** One JSON-mode chat completion. Local 27B models can take minutes, and a retry would only start a second run. */
export async function chatJson(system: string, user: string, maxTokens: number): Promise<Record<string, unknown>> {
  const { baseURL, apiKey, model } = settings();
  const client = new OpenAI({ baseURL, apiKey, timeout: 15 * 60_000, maxRetries: 0 });

  // Local reasoning models (Qwen3) think for minutes before answering, at about
  // 12 tokens/second. Planning works fine without it, so thinking is off unless
  // LLM_THINKING=true. Cloud models reject the extra field.
  const local = process.env.GENERATION_MODE !== "cloud";
  const thinking = process.env.LLM_THINKING === "true";

  const params = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.8,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    ...(local && !thinking ? { chat_template_kwargs: { enable_thinking: false } } : {}),
  } as ChatCompletionCreateParamsNonStreaming;
  const response = await client.chat.completions.create(params);

  const choice = response.choices[0];
  const content = choice?.message?.content ?? "";
  if (choice?.finish_reason === "length") {
    throw new Error("The model ran out of room before finishing. Try a shorter premise or fewer scenes.");
  }

  // Some models wrap JSON in prose or code fences despite JSON mode.
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The model did not return JSON.");
  return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
}
