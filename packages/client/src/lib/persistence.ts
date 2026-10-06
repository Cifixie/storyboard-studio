"use client";

import { useEffect } from "react";
import { useStoryStore } from "@/lib/store/StoryStore";
import { fetchStories, fetchStory, removeStory } from "@/lib/api";

export async function refreshLibrary() {
  try {
    useStoryStore.getState().setLibrary(await fetchStories());
  } catch (e) {
    console.error("Could not load saved stories", e);
  }
}

export async function openStory(id: string) {
  useStoryStore.getState().setStory(await fetchStory(id));
}

export async function deleteSavedStory(id: string) {
  await removeStory(id);
  if (useStoryStore.getState().story?.id === id) useStoryStore.getState().setStory(null);
  await refreshLibrary();
}

/** Reopens the most recently changed story on load. The server saves everything itself. */
export function useResumeLastStory() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [latest] = await fetchStories();
        if (latest && !cancelled && !useStoryStore.getState().story) await openStory(latest.id);
      } catch (e) {
        console.error("Could not resume last story", e);
      }
      await refreshLibrary();
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
