import { NextRequest, NextResponse } from "next/server";
import { deleteStory, getStory, listAssets, mutateStory, NotFoundError } from "@/lib/db";
import { media } from "@/lib/media";
import type { Frame, Story } from "@/lib/types";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  return NextResponse.json({ story });
}

/**
 * Two mutation modes on one route:
 *
 * **Asset links** (scene / frame): body carries `sceneId` (and optionally
 * `frameId`) plus `assetIds`.  Assets not in the library are dropped so a
 * deleted asset cannot leave a dangling link behind.
 *
 * **Character assignment**: body carries `characterName` and optionally
 * `characterAssetId`.  When `characterAssetId` is present (even `null`) the
 * story-level mapping is updated — `null` clears the assignment for that
 * character.
 */
export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  try {
    const body = (await req.json()) as {
      sceneId?: string;
      frameId?: string;
      assetIds?: unknown;
      characterName?: string;
      characterAssetId?: string | null;
    };

    // Character assignment path
    const charName = body.characterName;
    if (typeof charName === "string") {
      const story = mutateStory(id, (s): Story | null => {
        const charNames = new Set(s.characters.map((c) => c.name));
        if (!charNames.has(charName)) throw new NotFoundError("Character not found in cast");
        if (!s.characterAssetIds) s.characterAssetIds = {};
        if (body.characterAssetId == null) {
          delete s.characterAssetIds[charName];
        } else {
          s.characterAssetIds[charName] = body.characterAssetId;
        }
        return s;
      });
      if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
      return NextResponse.json({ story });
    }

    // Asset-link path (scene / frame)
    if (typeof body.sceneId !== "string" || !Array.isArray(body.assetIds)) {
      return NextResponse.json({ error: "sceneId and assetIds are required" }, { status: 400 });
    }
    const known = new Set(listAssets().map((a) => a.id));
    const assetIds = body.assetIds.filter((v): v is string => typeof v === "string" && known.has(v));

    const story = mutateStory(id, (s): Story | null => {
      if (body.frameId) {
        for (const scene of s.scenes) {
          const frame = scene.frames.find((f: Frame) => f.id === body.frameId);
          if (frame) {
            frame.assetIds = assetIds;
            return s;
          }
        }
        throw new NotFoundError("Frame not found");
      }
      const scene = s.scenes.find((x) => x.id === body.sceneId);
      if (!scene) throw new NotFoundError("Scene not found");
      scene.assetIds = assetIds;
      return s;
    });
    if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
    return NextResponse.json({ story });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Linking assets failed:", error);
    return NextResponse.json({ error: "Failed to link assets" }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  if (!deleteStory(id)) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  // The media files belong to this story alone; nothing else reclaims them.
  const files = story.scenes.flatMap((scene): string[] =>
    scene.frames.flatMap((frame: Frame) => [frame.imageUrl, frame.audioUrl].filter((p): p is string => Boolean(p)))
  );
  for (const path of files) {
    try {
      media.remove(path.replace(/^\/media\//, ""));
    } catch (e) {
      console.error("Story deleted but a media file could not be removed:", path, e);
    }
  }
  return NextResponse.json({ ok: true });
}
