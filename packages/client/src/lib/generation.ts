"use client";
import { createElement } from "react";

import { toast } from "@/components/ui/toast";
import { generateFrameImage, writeSceneFrames } from "@/lib/api";
import { type ImageQueueItem, useStoryStore } from "@/lib/store/StoryStore";

const store = () => useStoryStore.getState();
let draining = false;
let queueToast: { id: string; storyId: string; title: string } | null = null;

function updateQueueToast(progress?: { current: number; total: number; frameIndex: number }): void {
  const currentStoryId = store().story?.id;
  if (!queueToast || currentStoryId !== queueToast.storyId) return;
  const { imageQueue } = store();
  const active = imageQueue.active?.storyId === currentStoryId ? imageQueue.active : null;
  const waiting = imageQueue.pending.filter((item) => item.storyId === currentStoryId);
  const description = createElement(
    "div",
    { className: "space-y-1" },
    createElement("p", null, `${waiting.length} queued${active ? ` · frame ${active.frameIndex} generating` : ""}${progress && active ? ` · step ${progress.current} of ${progress.total}` : ""}`),
    createElement("p", null, `${imageQueue.completed} completed · ${imageQueue.failed} failed`),
    imageQueue.lastError && createElement("p", { role: "alert", className: "text-destructive" }, imageQueue.lastError),
  );
  if (!active && waiting.length === 0) {
    toast.update(queueToast.id, imageQueue.failed
      ? { type: "error", title: `${imageQueue.failed} image${imageQueue.failed === 1 ? "" : "s"} failed`, description, timeout: 0 }
      : { type: "success", title: "Images generated", description, timeout: 4500 });
    queueToast = null;
    return;
  }
  toast.update(queueToast.id, { type: "loading", title: queueToast.title, description, timeout: 0 });
}

function ensureQueueToast(storyId: string): void {
  if (store().story?.id !== storyId) return;
  if (queueToast && queueToast.storyId !== storyId) {
    toast.close(queueToast.id);
    queueToast = null;
  }
  if (!queueToast) {
    queueToast = {
      id: toast.add({ type: "loading", title: "Generating images", description: "Queued", timeout: 0 }),
      storyId,
      title: "Generating images",
    };
  }
  updateQueueToast();
}

useStoryStore.subscribe((state, previous) => {
  if (state.story?.id !== previous.story?.id && queueToast && queueToast.storyId !== state.story?.id) {
    toast.close(queueToast.id);
    queueToast = null;
  }
});

function frameJob(storyId: string, sceneId: string, frameId: string, onlyIfMissing: boolean): ImageQueueItem | null {
  const story = store().story;
  if (!story || story.id !== storyId) return null;
  const scene = story.scenes.find((candidate) => candidate.id === sceneId);
  const frame = scene?.frames.find((candidate) => candidate.id === frameId);
  if (!scene || !frame || !frame.prompt.trim() || (onlyIfMissing && frame.imageUrl)) return null;
  return { storyId, sceneId, frameId, frameIndex: frame.frameIndex, prompt: frame.prompt, onlyIfMissing };
}

function enqueueImages(items: ImageQueueItem[], storyId: string): void {
  if (items.length === 0 || store().story?.id !== storyId) return;
  store().enqueueImages(items);
  const { imageQueue } = store();
  if (!imageQueue.pending.some((item) => item.storyId === storyId) && imageQueue.active?.storyId !== storyId) return;
  ensureQueueToast(storyId);
  scheduleImageWorker();
}

export function enqueueFrameImage(storyId: string, frameId: string): void {
  const story = store().story;
  if (!story || story.id !== storyId) return;
  const scene = story.scenes.find((candidate) => candidate.frames.some((frame) => frame.id === frameId));
  const item = scene && frameJob(storyId, scene.id, frameId, false);
  if (item) enqueueImages([item], storyId);
}

export function enqueueSceneImages(storyId: string, sceneId: string): void {
  const story = store().story;
  const scene = story?.id === storyId ? story.scenes.find((candidate) => candidate.id === sceneId) : null;
  if (!scene) return;
  const items = scene.frames.flatMap((frame) => {
    const item = frameJob(storyId, sceneId, frame.id, true);
    return item ? [item] : [];
  });
  enqueueImages(items, storyId);
}

function isCurrentFrame(item: ImageQueueItem): boolean {
  const story = store().story;
  return story?.id === item.storyId && story.scenes.some((scene) =>
    scene.id === item.sceneId && scene.frames.some((frame) => frame.id === item.frameId && frame.prompt === item.prompt),
  );
}

async function runImageJob(item: ImageQueueItem): Promise<void> {
  const frame = frameJob(item.storyId, item.sceneId, item.frameId, item.onlyIfMissing);
  if (!frame || frame.prompt !== item.prompt) {
    store().finishImage(item, "skipped");
    if (store().story?.id === item.storyId) updateQueueToast();
    return;
  }

  try {
    const saved = await generateFrameImage(item.storyId, item.frameId, (progress) => {
      if (isCurrentFrame(item)) updateQueueToast({ ...progress, frameIndex: item.frameIndex });
    });
    if (saved.id === item.frameId && isCurrentFrame(item)) store().replaceFrame(saved);
    store().finishImage(item, "success");
  } catch (error) {
    store().finishImage(item, "failure", error instanceof Error ? error.message : "Image generation failed");
  }
  if (store().story?.id === item.storyId) updateQueueToast();
}

async function drainImageQueue(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const item = store().startNextImage();
      if (!item) break;
      updateQueueToast();
      await runImageJob(item);
    }
  } finally {
    draining = false;
    if (store().imageQueue.pending.length > 0 && !store().imageQueue.active) queueMicrotask(scheduleImageWorker);
  }
}

function scheduleImageWorker(): void {
  if (!draining) void drainImageQueue();
}
/** Writes the frames of one scene. Returns false if it failed; the reason is kept on the scene. */
export async function writeScene(sceneId: string): Promise<boolean> {
  const story = store().story;
  if (!story) return false;

  store().setSceneWork(sceneId, { state: "writing" });
  try {
    const saved = await writeSceneFrames(story.id, sceneId);
    // Ignore the result if a different story was opened in the meantime.
    if (store().story?.id === saved.id) store().applyStory(saved);
    store().setSceneWork(sceneId, null);
    return true;
  } catch (e) {
    store().setSceneWork(sceneId, {
      state: "error",
      message: e instanceof Error ? e.message : "Could not write frames",
    });
    return false;
  }
}

/** Writes every scene that has no frames yet, one after another, so each continues from the one before. */
export async function writeAllScenes() {
  const story = store().story;
  if (!story || store().writeAll) return;

  const pending = story.scenes.filter((s) => s.frames.length === 0).map((s) => s.id);
  if (pending.length === 0) return;

  store().setWriteAll({ current: 0, total: pending.length, stopping: false });
  for (const [i, sceneId] of pending.entries()) {
    const run = store().writeAll;
    if (!run || run.stopping || store().story?.id !== story.id) break;
    store().setWriteAll({ ...run, current: i + 1 });
    if (!(await writeScene(sceneId))) break;
  }
  store().setWriteAll(null);
}

/** Finishes the scene being written, then stops. */
export function stopWriteAll() {
  const run = store().writeAll;
  if (run) store().setWriteAll({ ...run, stopping: true });
}
