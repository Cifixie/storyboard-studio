import { getStory, mutateStory, NotFoundError } from "@/lib/db";
import type { Frame, FrameMetadata, Story } from "@/lib/types";

export { NotFoundError };

export interface FramePatch {
  imageUrl?: string;
  audioUrl?: string;
  metadata?: FrameMetadata;
}

function findFrame(story: Story, frameId: string): Frame {
  for (const scene of story.scenes) {
    const frame = scene.frames.find((f) => f.id === frameId);
    if (frame) return frame;
  }
  throw new NotFoundError("Frame not found");
}

const statusOf = (f: Frame): Frame["status"] => (f.error ? "error" : f.imageUrl ? "ready" : "draft");

/**
 * Runs one image or voiceover job for a frame and saves the outcome to the
 * database, so the result survives the browser tab closing.
 */
export async function runFrameOp(
  storyId: string,
  frameId: string,
  run: (story: Story, frame: Frame) => Promise<FramePatch>
): Promise<Frame> {
  // A new attempt clears the old error. An error raised by a job that is still
  // running alongside this one is set later and therefore stays.
  const story = mutateStory(storyId, (s) => {
    const frame = findFrame(s, frameId);
    frame.error = null;
    frame.status = statusOf(frame);
    return structuredClone(s);
  });

  let patch: FramePatch;
  try {
    patch = await run(story, findFrame(story, frameId));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    mutateStory(storyId, (s) => {
      const frame = findFrame(s, frameId);
      frame.error = message;
      frame.status = "error";
    });
    throw e;
  }

  return mutateStory(storyId, (s) => {
    const frame = findFrame(s, frameId);
    Object.assign(frame, patch, { metadata: { ...frame.metadata, ...patch.metadata } });
    frame.status = statusOf(frame);
    frame.updatedAt = new Date().toISOString();
    return { ...frame };
  });
}

export function requireStory(id: string): Story {
  const story = getStory(id);
  if (!story) throw new NotFoundError("Story not found");
  return story;
}
