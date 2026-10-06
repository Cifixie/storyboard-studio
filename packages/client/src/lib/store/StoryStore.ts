import { create } from "zustand";
import type { Frame, Story } from "@/lib/types";
import type { StorySummary } from "@/lib/db";

export type SceneWork = { state: "writing" } | { state: "error"; message: string };

interface StoryState {
  story: Story | null;
  activeSceneIndex: number;
  activeFrameIndex: number;
  library: StorySummary[];
  /** Scenes whose frames are being written, or failed to be. Not saved. */
  sceneWork: Record<string, SceneWork>;
  /** Progress of "Write all"; null when it is not running. */
  writeAll: { current: number; total: number; stopping: boolean } | null;

  setLibrary: (library: StorySummary[]) => void;
  /** Opens a different story and returns to its first scene. */
  setStory: (story: Story | null) => void;
  /** Takes a newer saved copy of the open story and keeps the current scene. */
  applyStory: (story: Story) => void;
  replaceFrame: (frame: Frame) => void;
  setActiveScene: (index: number) => void;
  setActiveFrame: (index: number) => void;
  setSceneWork: (sceneId: string, work: SceneWork | null) => void;
  setWriteAll: (progress: StoryState["writeAll"]) => void;
}

export const useStoryStore = create<StoryState>((set) => ({
  story: null,
  activeSceneIndex: 0,
  activeFrameIndex: 0,
  library: [],
  sceneWork: {},
  writeAll: null,

  setLibrary: (library) => set({ library }),

  setStory: (story) => set({ story, activeSceneIndex: 0, activeFrameIndex: 0, sceneWork: {}, writeAll: null }),

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
}));
