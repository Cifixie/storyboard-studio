import { NextRequest, NextResponse } from "next/server";
import { mutateStory, NotFoundError } from "@/lib/db";
import { requireStory } from "@/lib/frameOps";
import { generateFrames } from "@/lib/storyGen";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

type Context = { params: Promise<{ id: string; sceneId: string }> };

/** Writes (or rewrites) the frames of one scene and returns the saved story. */
export async function POST(_req: NextRequest, { params }: Context) {
  const { id, sceneId } = await params;
  try {
    const story = requireStory(id);
    const index = story.scenes.findIndex((s) => s.id === sceneId);
    if (index < 0) throw new NotFoundError("Scene not found");

    const frames = await generateFrames(story, index);

    // Re-read the story: images may have finished for other scenes meanwhile.
    const saved = mutateStory(id, (s) => {
      const scene = s.scenes.find((x) => x.id === sceneId);
      if (!scene) throw new NotFoundError("Scene not found");
      scene.frames = frames;
      return s;
    });
    return NextResponse.json({ story: saved });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    console.error("Writing frames failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
