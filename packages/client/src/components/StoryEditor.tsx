"use client";

import { useState } from "react";
import { useStoryStore } from "@/lib/store/StoryStore";
import type { Story } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { SceneTimeline } from "./SceneTimeline";
import { GenerateStoryPanel } from "./GenerateStoryPanel";
import { refreshLibrary } from "@/lib/persistence";
import { Sparkles, Clapperboard, BookOpen } from "lucide-react";
import Link from "next/link";

export function StoryEditor() {
  const { story, setStory } = useStoryStore();
  const [showGenerator, setShowGenerator] = useState(false);

  const handleGenerated = (newStory: Story) => {
    setStory(newStory);
    setShowGenerator(false);
    refreshLibrary();
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
        <h1 className="truncate text-base font-semibold tracking-tight">
          {story ? story.title : "Storyboard Studio"}
        </h1>
        <div className="flex items-center gap-2">
          {story && story.scenes.some((scene) => scene.frames.length > 0) && (
            <Button render={<Link href={`/play/${story.id}`} />} variant="outline" size="sm">
              <BookOpen /> Read story
            </Button>
          )}
          {story && (
            <Button variant="outline" size="sm" onClick={() => setStory(null)}>
              Close story
            </Button>
          )}
          {!showGenerator && (
            <Button size="sm" onClick={() => setShowGenerator(true)}>
              <Sparkles />
              {story ? "New story" : "Plan story"}
            </Button>
          )}
        </div>
      </header>

      {showGenerator ? (
        <GenerateStoryPanel
          onClose={() => setShowGenerator(false)}
          onGenerated={handleGenerated}
        />
      ) : story ? (
        <SceneTimeline />
      ) : (
        <EmptyState onGenerate={() => setShowGenerator(true)} />
      )}
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="crop-marks mb-6 grid aspect-video w-64 place-items-center">
          <Clapperboard className="size-8 text-primary/60" strokeWidth={1.25} />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">Start with a premise</h2>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Describe a story and Studio plans the cast and scenes. Then you write the frames for each scene, and every frame gets an image and a voiceover.
        </p>
        <Button size="lg" onClick={onGenerate} className="mt-6 h-10 px-4">
          <Sparkles />
          Plan story
        </Button>
      </div>
    </div>
  );
}
