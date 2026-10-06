"use client";

import { useStoryStore } from "@/lib/store/StoryStore";
import { writeSceneFrames } from "@/lib/api";

const store = () => useStoryStore.getState();

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
