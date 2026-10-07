"use client";
import { createElement } from "react";

import { toast } from "@/components/ui/toast";
import { generateFrameImage, writeSceneFrames } from "@/lib/api";
import type { ImageQueueItem } from "@/lib/store/StoryStore";
import { useStoryStore } from "@/lib/store/StoryStore";

const store = () => useStoryStore.getState();
let draining = false;
let queueToastId: string | null = null;
let queueToastStoryId: string | null = null;
let observedStoryId = store().story?.id ?? null;

function queueDescription(storyId: string) {
  const { imageQueue, story } = store();
  const active = imageQueue.active?.storyId === storyId ? imageQueue.active : null;
  const waiting = imageQueue.pending.filter((item) => item.storyId === storyId).length;
  const queuedLine = active ? `Frame ${active.frameIndex} generating · ${waiting} queued` : `${waiting} queued`;
  const counts = story?.id === storyId ? imageQueue : { ...imageQueue, completed: 0, failed: 0, lastError: null };
  return createElement(
    "div",
    { className: "space-y-1" },
    createElement("p", null, queuedLine),
    createElement("p", null, `${counts.completed} completed · ${counts.failed} failed`),
    counts.lastError && createElement("p", { role: "alert", className: "text-destructive" }, counts.lastError),
  );
}

function updateQueueToast(storyId: string, terminal = false) {
  if (store().story?.id !== storyId || queueToastStoryId !== storyId || !queueToastId) return;
  const { imageQueue } = store();
  const hasJobs = imageQueue.active?.storyId === storyId || imageQueue.pending.some((item) => item.storyId === storyId);
  if (terminal || !hasJobs) {
    const failed = imageQueue.failed;
    toast.update(queueToastId, failed
      ? { type: "error", title: `${failed} image${failed === 1 ? "" : "s"} failed`, description: queueDescription(storyId), timeout: 0 }
      : { type: "success", title: "Images generated", description: queueDescription(storyId), timeout: 4500 });
    queueToastId = null;
    queueToastStoryId = null;
    return;
  }
  toast.update(queueToastId, { type: "loading", title: "Generating images", description: queueDescription(storyId), timeout: 0 });
}

function ensureQueueToast(storyId: string) {
  if (store().story?.id !== storyId) return;
  if (queueToastId && queueToastStoryId !== storyId) {
    toast.close(queueToastId);
    queueToastId = null;
    queueToastStoryId = null;
  }
  if (!queueToastId) {
    queueToastStoryId = storyId;
    queueToastId = toast.add({ type: "loading", title: "Generating images", description: queueDescription(storyId), timeout: 0 });
  }
  updateQueueToast(storyId);
}
useStoryStore.subscribe((state, previous) => {
  const previousStoryId = previous.story?.id ?? null;
  const storyId = state.story?.id ?? null;
  if (storyId === previousStoryId) return;
  if (queueToastId && queueToastStoryId === previousStoryId) toast.close(queueToastId);
  if (queueToastStoryId === previousStoryId) {
    queueToastId = null;
    queueToastStoryId = null;
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

export function enqueueFrameImage(storyId: string, frameId: string): void {
  const story = store().story;
  if (!story || story.id !== storyId) return;
  const scene = story.scenes.find((candidate) => candidate.frames.some((frame) => frame.id === frameId));
  const item = scene && frameJob(storyId, scene.id, frameId, false);
  if (!item) return;
  store().enqueueImages([item]);
  const queue = store().imageQueue;
  if (queue.pending.some((job) => job.storyId === storyId && job.frameId === frameId) || (queue.active?.storyId === storyId && queue.active.frameId === frameId)) {
    ensureQueueToast(storyId);
    drainImageQueue();
  }
}

export function enqueueSceneImages(storyId: string, sceneId: string): void {
  const story = store().story;
  if (!story || story.id !== storyId) return;
  const scene = story.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return;
  const items = scene.frames.flatMap((frame) => {
    const item = frameJob(storyId, sceneId, frame.id, true);
    return item ? [item] : [];
  });
  if (items.length === 0) return;
  store().enqueueImages(items);
  const queue = store().imageQueue;
  if (queue.pending.some((job) => job.storyId === storyId) || queue.active?.storyId === storyId) {
    ensureQueueToast(storyId);
    drainImageQueue();
  }
}

function isCurrentFrame(item: ImageQueueItem): boolean {
  const story = store().story;
  return story?.id === item.storyId && story.scenes.some((scene) =>
    scene.id === item.sceneId && scene.frames.some((frame) => frame.id === item.frameId),
  );
}

async function drainImageQueue() {
  if (draining) return;
  draining = true;
  try {
    while (true) {
      const item = store().startNextImage();
      if (!item) break;
      updateQueueToast(item.storyId);

      const frame = frameJob(item.storyId, item.sceneId, item.frameId, item.onlyIfMissing);
      if (!frame || frame.prompt !== item.prompt) {
        store().finishImage(item, "skipped");
        updateQueueToast(item.storyId);
        continue;
      }

      try {
        const saved = await generateFrameImage(item.storyId, item.frameId, (progress) => {
          if (store().story?.id === item.storyId && queueToastStoryId === item.storyId && queueToastId && isCurrentFrame(item)) {
            const queuedLine = `Frame ${item.frameIndex} generating · ${store().imageQueue.pending.filter((job) => job.storyId === item.storyId).length} queued`;
            toast.update(queueToastId, {
              type: "loading",
              title: "Generating images",
              description: createElement(
                "div",
                { className: "space-y-1" },
                createElement("p", null, queuedLine),
                createElement("p", null, `Image step ${progress.current} of ${progress.total}`),
                queueDescription(item.storyId),
              ),
              timeout: 0,
            });
          }
        });
        if (saved.id === item.frameId && isCurrentFrame(item)) store().replaceFrame(saved);
        store().finishImage(item, "success");
      } catch (error) {
        store().finishImage(item, "failure", error instanceof Error ? error.message : "Image generation failed");
      }
      updateQueueToast(item.storyId);
    }
  } finally {
    draining = false;
    const { imageQueue, story } = store();
    if (story && (imageQueue.pending.some((item) => item.storyId === story.id) || imageQueue.active?.storyId === story.id)) {
      ensureQueueToast(story.id);
      if (!imageQueue.active) drainImageQueue();
    } else if (story && imageQueue.failed > 0 && !imageQueue.active && imageQueue.pending.length === 0) {
      updateQueueToast(story.id, true);
    }
  }
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
