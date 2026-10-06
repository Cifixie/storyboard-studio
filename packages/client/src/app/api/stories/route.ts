import { NextRequest, NextResponse } from "next/server";
import { listStories, saveStory } from "@/lib/db";
import { generateOutline } from "@/lib/storyGen";

export const dynamic = "force-dynamic";
export const maxDuration = 900;

export async function GET() {
  try {
    return NextResponse.json({ stories: listStories() });
  } catch (error) {
    console.error("Listing stories failed:", error);
    return NextResponse.json({ error: "Failed to list stories" }, { status: 500 });
  }
}

/** Plans a new story (title, cast, scene outline) and saves it. Frames are written per scene afterwards. */
export async function POST(request: NextRequest) {
  try {
    const { prompt, title, style } = (await request.json()) as { prompt?: string; title?: string; style?: string };
    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "Missing required 'prompt' field" }, { status: 400 });
    }
    const story = await generateOutline(prompt.trim(), { title: title?.trim(), style: style?.trim() });
    saveStory(story);
    return NextResponse.json({ story });
  } catch (error) {
    console.error("Story outline failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
