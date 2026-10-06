"use client";

import { useState } from "react";
import type { Story } from "@/lib/types";
import { createStory } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sparkles, X, Loader2 } from "lucide-react";

interface GenerateStoryPanelProps {
  onClose: () => void;
  onGenerated: (story: Story) => void;
}

export function GenerateStoryPanel({ onClose, onGenerated }: GenerateStoryPanelProps) {
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const story = await createStory(prompt, { title: title || undefined, style: style || undefined });
      onGenerated(story);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not plan the story");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto p-6 md:items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleGenerate();
        }}
        className="w-full max-w-xl rounded-xl border border-border bg-card p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Generate a story</h2>
            <p className="mt-1 max-w-[46ch] text-sm leading-relaxed text-muted-foreground">
              Describe your idea. Studio plans the cast and scenes first. Then you write the frames scene by scene, and generate an image and voiceover for each frame.
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onClose}>
            <X />
            <span className="sr-only">Close</span>
          </Button>
        </div>

        <div className="mt-6 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="prompt">Premise</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="A cat named Barnaby crosses a magical forest to find his lost kitten"
              rows={5}
              required
              className="resize-none text-[15px] leading-relaxed"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Title <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Barnaby and the Lantern Wood" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="style">Visual style <span className="font-normal text-muted-foreground">(optional)</span></Label>
              <Input id="style" value={style} onChange={(e) => setStyle(e.target.value)} placeholder="Watercolor, pencil sketch" />
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-5 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-7 flex items-center justify-end gap-3">
          {generating && <span className="mr-auto text-sm text-muted-foreground">Planning can take a few minutes.</span>}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={generating || !prompt.trim()}>
            {generating ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {generating ? "Planning story…" : "Plan story"}
          </Button>
        </div>
      </form>
    </div>
  );
}
