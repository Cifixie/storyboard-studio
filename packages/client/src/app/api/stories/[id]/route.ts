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
 * PATCH supports frame text edits, asset links, and story character assignments.
 * DELETE removes one frame when a frameId is provided; otherwise it deletes the story.
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
      frameEdits?: { prompt?: unknown; description?: unknown; narration?: unknown };
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

    // Frame text edit path
    if (typeof body.frameId === "string" && body.frameEdits) {
      const edits = body.frameEdits;
      if (
        (edits.prompt !== undefined && typeof edits.prompt !== "string") ||
        (edits.description !== undefined && typeof edits.description !== "string") ||
        (edits.narration !== undefined && typeof edits.narration !== "string")
      ) {
        return NextResponse.json({ error: "Invalid frame edits" }, { status: 400 });
      }

      const mediaToRemove: string[] = [];
      const story = mutateStory(id, (s) => {
        let frame: Frame | undefined;
        for (const scene of s.scenes) {
          frame = scene.frames.find((candidate) => candidate.id === body.frameId);
          if (frame) break;
        }
        if (!frame) throw new NotFoundError("Frame not found");

        const imageChanged =
          (edits.prompt !== undefined && edits.prompt !== frame.prompt) ||
          (edits.description !== undefined && edits.description !== frame.description);
        const narrationChanged = edits.narration !== undefined && edits.narration !== frame.narration;

        if (edits.prompt !== undefined) frame.prompt = edits.prompt as string;
        if (edits.description !== undefined) frame.description = edits.description as string;
        if (edits.narration !== undefined) frame.narration = edits.narration as string;

        if (imageChanged) {
          if (frame.imageUrl) mediaToRemove.push(frame.imageUrl);
          frame.imageUrl = null;
          delete frame.metadata.imageWidth;
          delete frame.metadata.imageHeight;
          delete frame.metadata.seed;
          delete frame.metadata.model;
          frame.status = "draft";
        }
        if (narrationChanged) {
          if (frame.audioUrl) mediaToRemove.push(frame.audioUrl);
          frame.audioUrl = null;
          delete frame.metadata.audioDuration;
          delete frame.metadata.voice;
        }
        if (imageChanged || narrationChanged) frame.error = null;
        frame.updatedAt = new Date().toISOString();
        return s;
      });
      for (const path of mediaToRemove) {
        try {
          media.remove(path.replace(/^\/media\//, ""));
        } catch (error) {
          console.error("Frame edited but generated media could not be removed:", path, error);
        }
      }
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

export async function DELETE(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const url = new URL(req.url);
  const hasFrameId = url.searchParams.has("frameId");
  const frameId = url.searchParams.get("frameId");
  if (hasFrameId && !frameId) return NextResponse.json({ error: "frameId is required" }, { status: 400 });

  if (typeof frameId === "string" && frameId) {
    const mediaToRemove: string[] = [];
    try {
      const story = mutateStory(id, (s) => {
        for (const scene of s.scenes) {
          const index = scene.frames.findIndex((frame) => frame.id === frameId);
          if (index < 0) continue;
          const [frame] = scene.frames.splice(index, 1);
          if (frame.imageUrl) mediaToRemove.push(frame.imageUrl);
          if (frame.audioUrl) mediaToRemove.push(frame.audioUrl);
          return s;
        }
        throw new NotFoundError("Frame not found");
      });
      for (const path of mediaToRemove) {
        try {
          media.remove(path.replace(/^\/media\//, ""));
        } catch (error) {
          console.error("Frame removed but generated media could not be removed:", path, error);
        }
      }
      return NextResponse.json({ story });
    } catch (error) {
      if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
      console.error("Removing frame failed:", error);
      return NextResponse.json({ error: "Could not remove frame" }, { status: 500 });
    }
  }

  const story = getStory(id);
  if (!story) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  if (!deleteStory(id)) return NextResponse.json({ error: "Story not found" }, { status: 404 });
  const files = story.scenes.flatMap((scene): string[] =>
    scene.frames.flatMap((frame: Frame) => [frame.imageUrl, frame.audioUrl].filter((path): path is string => Boolean(path)))
  );
  for (const path of files) {
    try {
      media.remove(path.replace(/^\/media\//, ""));
    } catch (error) {
      console.error("Story deleted but a media file could not be removed:", path, error);
    }
  }
  return NextResponse.json({ ok: true });
}
