import { create } from "zustand";
import type { Frame, Story } from "@/lib/types";
import type { StorySummary } from "@/lib/db";

export type SceneWork = { state: "writing" } | { state: "error"; message: string };

export interface ImageQueueItem {
  storyId: string;
  sceneId: string;
  frameId: string;
  frameIndex: number;
  prompt: string;
  onlyIfMissing: boolean;
}

export interface ImageQueueState {
  pending: ImageQueueItem[];
  active: ImageQueueItem | null;
  completed: number;
  failed: number;
  lastError: string | null;
}


interface StoryState {
  story: Story | null;
  activeSceneIndex: number;
  activeFrameIndex: number;
  library: StorySummary[];
  /** Scenes whose frames are being written, or failed to be. Not saved. */
  sceneWork: Record<string, SceneWork>;
  /** Progress of "Write all"; null when it is not running. */
  writeAll: { current: number; total: number; stopping: boolean } | null;
  /** In-memory image queue; never persisted to the story. */
  imageQueue: ImageQueueState;

  setLibrary: (library: StorySummary[]) => void;
  /** Opens a different story and returns to its first scene. */
  setStory: (story: Story | null) => void;
  /** Takes a newer saved copy of the open story and keeps the current scene. */
  applyStory: (story: Story) => void;
  replaceFrame: (frame: Frame) => void;
  enqueueImages: (items: ImageQueueItem[]) => void;
  startNextImage: () => ImageQueueItem | null;
  finishImage: (item: ImageQueueItem, outcome: "success" | "failure" | "skipped", error?: string) => void;
  setActiveScene: (index: number) => void;
  setActiveFrame: (index: number) => void;
  setSceneWork: (sceneId: string, work: SceneWork | null) => void;
  setWriteAll: (progress: StoryState["writeAll"]) => void;
}

export const EMPTY_IMAGE_QUEUE: ImageQueueState = {
  pending: [],
  active: null,
  completed: 0,
  failed: 0,
  lastError: null,
};

export const useStoryStore = create<StoryState>((set) => ({
  story: null,
  activeSceneIndex: 0,
  activeFrameIndex: 0,
  library: [],
  sceneWork: {},
  writeAll: null,
  imageQueue: EMPTY_IMAGE_QUEUE,

  setLibrary: (library) => set({ library }),

  setStory: (story) =>
    set((state) => ({
      story,
      activeSceneIndex: 0,
      activeFrameIndex: 0,
      sceneWork: {},
      writeAll: null,
      ...(state.story?.id !== story?.id
        ? { imageQueue: { ...EMPTY_IMAGE_QUEUE, active: state.imageQueue.active } }
        : {}),
    })),

  applyStory: (story) => set({ story }),

  replaceFrame: (frame) =>
    set((state) => {
      if (!state.story) return state;
      const scenes = state.story.scenes.map((scene) =>
        scene.frames.some((f) => f.id === frame.id)
          ? { ...scene, frames: scene.frames.map((f) => (f.id === frame.id ? frame : f)) }
          : scene
      );
      return { story: { ...state.story, scenes } };
    }),

  setActiveScene: (index) => set({ activeSceneIndex: index, activeFrameIndex: 0 }),

  setActiveFrame: (index) => set({ activeFrameIndex: index }),

  setSceneWork: (sceneId, work) =>
    set((state) => {
      const sceneWork = { ...state.sceneWork };
      if (work) sceneWork[sceneId] = work;
      else delete sceneWork[sceneId];
      return { sceneWork };
    }),

  setWriteAll: (writeAll) => set({ writeAll }),

  enqueueImages: (items) =>
    set((state) => {
      if (items.length === 0) return state;
      const storyId = state.story?.id;
      if (!storyId) return state;
      const { imageQueue } = state;
      const known = new Set([
        ...(imageQueue.active ? [`${imageQueue.active.storyId}:${imageQueue.active.frameId}`] : []),
        ...imageQueue.pending.map((item) => `${item.storyId}:${item.frameId}`),
      ]);
      const additions = items.filter((item) => {
        const key = `${item.storyId}:${item.frameId}`;
        if (item.storyId !== storyId || known.has(key)) return false;
        known.add(key);
        return true;
      });
      if (additions.length === 0) return state;
      const hasCurrentStoryWork = imageQueue.active?.storyId === storyId || imageQueue.pending.some((item) => item.storyId === storyId);
      return {
        imageQueue: {
          ...imageQueue,
          pending: [...imageQueue.pending, ...additions],
          ...(!hasCurrentStoryWork ? { completed: 0, failed: 0, lastError: null } : {}),
        },
      };
    }),

  startNextImage: () => {
    let item: ImageQueueItem | null = null;
    set((state) => {
      const { imageQueue } = state;
      if (imageQueue.active || imageQueue.pending.length === 0) return state;
      item = imageQueue.pending[0];
      return {
        imageQueue: { ...imageQueue, pending: imageQueue.pending.slice(1), active: item },
      };
    });
    return item;
  },

  finishImage: (item, outcome, error) =>
    set((state) => {
      const { imageQueue } = state;
      if (imageQueue.active?.storyId !== item.storyId || imageQueue.active.frameId !== item.frameId) return state;
      const countsTowardCurrentStory = state.story?.id === item.storyId;
      return {
        imageQueue: {
          ...imageQueue,
          active: null,
          ...(countsTowardCurrentStory && outcome === "success" ? { completed: imageQueue.completed + 1 } : {}),
          ...(countsTowardCurrentStory && outcome === "failure"
            ? { failed: imageQueue.failed + 1, lastError: error ?? "Image generation failed" }
            : {}),
        },
      };
    }),


}));

