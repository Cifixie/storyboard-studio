// API client helpers. All generation is saved by the server; these return the saved result.

import type { Frame, Story } from "@/lib/types";
import type { StorySummary } from "@/lib/db";

export type { StorySummary };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

/** Plans a story: title, cast and scene outline. Frames come later, per scene. */
export async function createStory(prompt: string, hints?: { title?: string; style?: string }): Promise<Story> {
  return (await request<{ story: Story }>("/api/stories", post({ prompt, ...hints }))).story;
}

/** Writes (or rewrites) the frames of one scene. Returns the whole story, since frame numbers shift. */
export async function writeSceneFrames(storyId: string, sceneId: string): Promise<Story> {
  return (await request<{ story: Story }>(`/api/stories/${storyId}/scenes/${sceneId}/frames`, post())).story;
}

/** Explicitly links assets to a scene (or one frame inside it) and returns the saved story. */
export async function linkAssets(storyId: string, sceneId: string, assetIds: string[], frameId?: string): Promise<Story> {
  return (await request<{ story: Story }>(`/api/stories/${storyId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sceneId, frameId, assetIds }),
  })).story;
}

export interface FrameImageProgress {
  current: number;
  total: number;
}

export async function generateFrameImage(
  storyId: string,
  frameId: string,
  onProgress?: (progress: FrameImageProgress) => void,
): Promise<Frame> {
  const res = await fetch("/api/image/generate", {
    ...post({ storyId, frameId }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  if (!res.body) throw new Error("Image generation returned no progress stream");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const block of events) {
      const event = block.match(/^event: (.+)$/m)?.[1];
      const data = block.match(/^data: (.+)$/m)?.[1];
      if (!event || !data) continue;
      const payload = JSON.parse(data);
      if (event === "progress") onProgress?.(payload as FrameImageProgress);
      if (event === "done") return (payload as { frame: Frame }).frame;
      if (event === "error") throw new Error(payload.error ?? "Image generation failed");
    }
    if (done) break;
  }
  throw new Error("Image generation stream ended without a result");
}

export async function generateFrameAudio(storyId: string, frameId: string): Promise<Frame> {
  return (await request<{ frame: Frame }>("/api/tts/generate", post({ storyId, frameId }))).frame;
}

export async function fetchStories(): Promise<StorySummary[]> {
  return (await request<{ stories: StorySummary[] }>("/api/stories")).stories;
}

export async function fetchStory(id: string): Promise<Story> {
  return (await request<{ story: Story }>(`/api/stories/${id}`)).story;
}

export async function removeStory(id: string): Promise<void> {
  await request(`/api/stories/${id}`, { method: "DELETE" });
}

/** Assign or clear a character asset for one story character. Returns the saved story. */
export async function assignCharacterAsset(
  storyId: string,
  characterName: string,
  characterAssetId: string | null,
): Promise<Story> {
  return (
    await request<{ story: Story }>(`/api/stories/${storyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName, characterAssetId }),
    })
  ).story;
}
