"use client";

import { useState } from "react";
import { generateFrameAudio } from "@/lib/api";
import { enqueueFrameImage } from "@/lib/generation";
import { useStoryStore } from "@/lib/store/StoryStore";
import type { Frame, Scene } from "@/lib/types";
import { AssetLinkPicker } from "./AssetLinkPicker";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ImageIcon, Mic, RefreshCw, Loader2 } from "lucide-react";

interface FrameCardProps {
  storyId: string;
  frame: Frame;
  scene: Scene;
  isActive: boolean;
  onUpdated: (frame: Frame) => void;
}

const STATUS: Record<Frame["status"], { label: string; dot: string }> = {
  draft: { label: "Draft", dot: "bg-muted-foreground/60" },
  generating: { label: "Generating", dot: "bg-primary animate-pulse" },
  ready: { label: "Ready", dot: "bg-chart-5" },
  error: { label: "Error", dot: "bg-destructive" },
};


export function FrameCard({ storyId, frame, scene, isActive, onUpdated }: FrameCardProps) {
  const imageQueue = useStoryStore((state) => state.imageQueue);
  const [audioGenerating, setAudioGenerating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const generating = imageQueue.active?.storyId === storyId && imageQueue.active.frameId === frame.id;
  const queued = imageQueue.pending.some((item) => item.storyId === storyId && item.frameId === frame.id);
  const imageBusy = generating || queued;
  const busy = imageBusy || audioGenerating;
  const status = busy
    ? queued && !generating
      ? { label: "Queued", dot: "bg-primary/70" }
      : STATUS.generating
    : STATUS[frame.status];
  const error = requestError ?? frame.error;

  const handleGenerateImage = () => {
    setRequestError(null);
    enqueueFrameImage(storyId, frame.id);
  };

  const handleGenerateAudio = async () => {
    setAudioGenerating(true);
    setRequestError(null);
    try {
      onUpdated(await generateFrameAudio(storyId, frame.id));
    } catch (e) {
      setRequestError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setAudioGenerating(false);
    }
  };

  return (
    <article
      className={`grid grid-cols-1 gap-5 rounded-xl border bg-card p-4 transition-colors md:grid-cols-[minmax(0,26rem)_1fr] ${
        isActive ? "border-primary/50" : "border-border hover:border-primary/25"
      }`}
    >
      {/* Panel */}
      <div className="space-y-2.5">
        <div className="relative aspect-video overflow-hidden rounded-md bg-background ring-1 ring-border">
          {generating ? (
            <Skeleton className="size-full rounded-none" />
          ) : frame.imageUrl ? (
            <img src={frame.imageUrl} alt={frame.description} className="size-full object-cover" />
          ) : (
            <div className="crop-marks absolute inset-2 flex items-center justify-center">
              <ImageIcon className="size-7 text-primary/40" strokeWidth={1.25} />
            </div>
          )}
          <span className="absolute left-2 top-2 flex h-6 items-center gap-1.5 rounded bg-background/85 px-1.5 text-xs backdrop-blur">
            <span className="font-mono font-medium text-foreground">{frame.frameIndex}</span>
            {frame.shotType && (
              <span className="border-l border-border pl-1.5 capitalize text-muted-foreground">{frame.shotType}</span>
            )}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className={`size-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <AssetLinkPicker storyId={storyId} scene={scene} frame={frame} types={["character", "prop"]} label="Assets" />
          <Button variant="outline" size="sm" onClick={handleGenerateImage} disabled={!frame.prompt.trim() || imageBusy || audioGenerating}>
            {generating ? <Loader2 className="animate-spin" /> : frame.imageUrl ? <RefreshCw /> : <ImageIcon />}
            {generating ? "Generating…" : queued ? "Queued" : frame.imageUrl ? "Regenerate image" : "Generate image"}
          </Button>
        </div>
      </div>

      {/* Script */}
      <div className="flex min-w-0 flex-col gap-4">
        <p className="max-w-[60ch] text-[15px] leading-relaxed text-foreground">{frame.description}</p>

        {frame.narration && (
          <blockquote className="max-w-[56ch] border-l-2 border-primary/50 pl-4 font-serif text-lg italic leading-relaxed text-foreground/85">
            {frame.narration}
          </blockquote>
        )}

        <div className="flex items-center gap-2">
          {frame.audioUrl ? (
            <audio controls src={frame.audioUrl} className="h-8 w-full max-w-sm" />
          ) : (
            <Button variant="secondary" size="sm" onClick={handleGenerateAudio} disabled={audioGenerating || !frame.narration}>
              {audioGenerating ? <Loader2 className="animate-spin" /> : <Mic />}
              {audioGenerating ? "Recording…" : "Generate voiceover"}
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <details className="group mt-auto">
          <summary className="cursor-pointer select-none text-xs text-muted-foreground transition-colors hover:text-foreground">
            Image prompt
          </summary>
          <p className="mt-2 max-h-28 overflow-y-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed text-muted-foreground">
            {frame.prompt || <span className="italic">No prompt</span>}
          </p>
        </details>
      </div>
    </article>
  );
}
