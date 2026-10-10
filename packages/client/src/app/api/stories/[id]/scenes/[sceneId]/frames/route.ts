import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mutateStory, NotFoundError } from "@/lib/db";
import { requireStory } from "@/lib/frameOps";
import { generateFrames } from "@/lib/storyGen";
import { SHOT_TYPES, type Frame, type ShotType } from "@/lib/types";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

type Context = { params: Promise<{ id: string; sceneId: string }> };
/** Creates a blank draft frame without invoking generation. */
export async function PUT(req: NextRequest, { params }: Context) {
  const { id, sceneId } = await params;
  let body: { prompt?: unknown; description?: unknown; narration?: unknown; shotType?: unknown; characters?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  if (
    !body ||
    (body.prompt !== undefined && typeof body.prompt !== "string") ||
    (body.description !== undefined && typeof body.description !== "string") ||
    (body.narration !== undefined && typeof body.narration !== "string") ||
    (body.shotType !== undefined && body.shotType !== null && !SHOT_TYPES.includes(body.shotType as ShotType)) ||
    (body.characters !== undefined && (!Array.isArray(body.characters) || !body.characters.every((name) => typeof name === "string")))
  ) {
    return NextResponse.json({ error: "Invalid frame fields" }, { status: 400 });
  }

  try {
    const now = new Date().toISOString();
    const story = mutateStory(id, (s) => {
      const scene = s.scenes.find((candidate) => candidate.id === sceneId);
      if (!scene) throw new NotFoundError("Scene not found");
      const characterNames = new Set(s.characters.map((character) => character.name));
      const characters = Array.isArray(body.characters) ? [...new Set(body.characters as string[])] : [];
      if (characters.some((name) => !characterNames.has(name))) {
        throw new Error("Frame characters must be members of this story's cast");
      }
      const frame: Frame = {
        id: randomUUID(),
        sceneId,
        frameIndex: 0,
        shotType: body.shotType == null ? null : body.shotType as ShotType,
        characters,
        description: typeof body.description === "string" ? body.description : "",
        prompt: typeof body.prompt === "string" ? body.prompt : "",
        imageUrl: null,
        audioUrl: null,
        narration: typeof body.narration === "string" ? body.narration : "",
        status: "draft",
        error: null,
        metadata: {},
        createdAt: now,
        updatedAt: now,
      };
      scene.frames.push(frame);
      return s;
    });
    return NextResponse.json({ story }, { status: 201 });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: error.message }, { status: 404 });
    if (error instanceof Error && error.message.startsWith("Frame characters")) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Creating frame failed:", error);
    return NextResponse.json({ error: "Could not create frame" }, { status: 500 });
  }
}


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
