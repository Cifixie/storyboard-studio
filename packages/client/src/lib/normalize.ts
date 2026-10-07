import { listAssets } from "@/lib/db";
import type { Frame, Story } from "@/lib/types";

/**
 * Makes a story's structural fields consistent, whatever the LLM returned:
 * unique scene/frame ids, scene order by position, frames pointing at their
 * scene, and frames numbered 1..N across the story. Also migrates the
 * old `beatIndex` field, which was this app's earlier name for `frameIndex`.
 */
export function normalizeStory(story: Story): Story {
  const seen = new Set<string>();
  const unique = (id: string, fallback: string) => {
    let next = id && !seen.has(id) ? id : fallback;
    while (seen.has(next)) next = `${next}-${seen.size}`;
    seen.add(next);
    return next;
  };
  // An asset can be deleted while story JSON still references it; drop those
  // links at read time so the composer never sees a dangling id.
  const knownIds = new Set(listAssets().map((a) => a.id));
  const prune = (ids: string[] | undefined): string[] =>
    (ids ?? []).filter((id) => knownIds.has(id));
  story.characters ??= [];
  story.props ??= [];
  // Prune character asset assignments whose character was removed or whose asset no longer exists.
  if (story.characterAssetIds) {
    const charNames = new Set(story.characters.map((c) => c.name));
    story.characterAssetIds = Object.fromEntries(
      Object.entries(story.characterAssetIds).filter(([name, id]) => charNames.has(name) && knownIds.has(id)),
    );
  }

  let n = 0;
  story.scenes = story.scenes.map((scene, i) => {
    const sceneId = unique(scene.id, `scene-${i + 1}`);
    return {
      ...scene,
      id: sceneId,
      place: scene.place ?? "",
      time: scene.time ?? "",
      turn: scene.turn ?? "",
      assetIds: prune(scene.assetIds),
      order: i,
      frames: scene.frames.map((frame, j) => {
        const { beatIndex: _legacy, ...rest } = frame as Frame & { beatIndex?: number };
        return {
          ...rest,
          id: unique(frame.id, `${sceneId}-frame-${j + 1}`),
          sceneId,
          shotType: frame.shotType ?? null,
          characters: frame.characters ?? [],
          assetIds: prune(frame.assetIds),
          error: frame.error ?? null,
          // Generation runs on the server now; a stored "generating" is a leftover.
          status: frame.status === "generating" ? "draft" : frame.status,
          frameIndex: ++n,
        };
      }),
    };
  });
  return story;
}
