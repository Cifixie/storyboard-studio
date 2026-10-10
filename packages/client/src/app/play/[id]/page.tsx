import { getStory } from "@/lib/db";
import { StoryPlayer } from "@/components/StoryPlayer";
import { notFound } from "next/navigation";

export default async function PlayStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const story = getStory(id);
  if (!story) notFound();

  return <StoryPlayer story={story} />;
}
