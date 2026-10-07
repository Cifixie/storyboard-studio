"use client";

import { useCallback, useEffect, useState } from "react";
import { useStoryStore } from "@/lib/store/StoryStore";
import { stopWriteAll, writeAllScenes, writeScene } from "@/lib/generation";
import { fetchAssets } from "@/lib/assets";
import { type Asset } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FrameCard } from "./FrameCard";
import { AssetLinkPicker } from "./AssetLinkPicker";
import { Loader2, PenLine, RefreshCw, Sparkles } from "lucide-react";

export function SceneTimeline() {
  const story = useStoryStore((s) => s.story);
  const activeSceneIndex = useStoryStore((s) => s.activeSceneIndex);
  const activeFrameIndex = useStoryStore((s) => s.activeFrameIndex);
  const sceneWork = useStoryStore((s) => s.sceneWork);
  const writeAll = useStoryStore((s) => s.writeAll);
  const setActiveScene = useStoryStore((s) => s.setActiveScene);
  const replaceFrame = useStoryStore((s) => s.replaceFrame);

  // Cached character assets for the assignment dropdown.
  const [charAssets, setCharAssets] = useState<Asset[]>([]);
  useEffect(() => {
    fetchAssets().then((assets) => setCharAssets(assets.filter((a): a is Asset => a.type === "character")));
  }, []);

  /** Assign or clear a character asset for one story character. */
  const assignCharAsset = useCallback(async (charName: string, assetId: string | null) => {
    if (!story) return;
    await fetch(`/api/stories/${story.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ characterName: charName, characterAssetId: assetId }),
    }).then((r) => r.json()).then((body) => {
      if (body.story) useStoryStore.getState().applyStory(body.story);
    });
  }, [story]);

  if (!story) return null;

  const scene = story.scenes[activeSceneIndex];
  if (!scene) return null;

  const work = sceneWork[scene.id];
  const writing = work?.state === "writing";
  const pendingCount = story.scenes.filter((s) => s.frames.length === 0).length;

  const rewrite = () => {
    const hasMedia = scene.frames.some((f) => f.imageUrl || f.audioUrl);
    const warning = hasMedia
      ? "Rewriting replaces these frames, including their images and voiceovers. Continue?"
      : "Rewrite the frames for this scene?";
    if (window.confirm(warning)) writeScene(scene.id);
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Scene outline */}
      <nav aria-label="Scenes" className="flex w-64 shrink-0 flex-col border-r border-border">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <span className="text-sm font-medium text-muted-foreground">Scenes</span>
          {writeAll ? (
            <Button variant="ghost" size="xs" onClick={stopWriteAll} disabled={writeAll.stopping}>
              {writeAll.stopping ? "Stopping…" : "Stop"}
            </Button>
          ) : (
            pendingCount > 0 && (
              <Button variant="secondary" size="xs" onClick={writeAllScenes}>
                <PenLine />
                Write all
              </Button>
            )
          )}
        </div>
        {writeAll && (
          <p className="px-4 pb-2 text-xs text-muted-foreground" aria-live="polite">
            Writing scene {writeAll.current} of {writeAll.total}
          </p>
        )}
        <ScrollArea className="flex-1">
          <ol className="space-y-0.5 px-2 pb-3">
            {story.scenes.map((s, i) => {
              const active = activeSceneIndex === i;
              const w = sceneWork[s.id];
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => setActiveScene(i)}
                    className={`flex w-full items-baseline gap-3 rounded-md px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
                      active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <span className={`font-mono text-xs ${active ? "text-primary" : ""}`}>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{s.title}</span>
                      <span
                        className={`flex items-center gap-1 text-xs ${
                          w?.state === "error" ? "text-destructive" : "text-muted-foreground"
                        }`}
                      >
                        {w?.state === "writing" ? (
                          <>
                            <Loader2 className="size-3 animate-spin" />
                            Writing frames…
                          </>
                        ) : w?.state === "error" ? (
                          "Could not write frames"
                        ) : s.frames.length === 0 ? (
                          "No frames yet"
                        ) : (
                          `${s.frames.length} ${s.frames.length === 1 ? "frame" : "frames"}`
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </ScrollArea>

        {story.characters.length > 0 && (
          <details className="border-t border-border px-4 py-3">
            <summary className="cursor-pointer select-none text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
              Cast ({story.characters.length})
            </summary>
            <dl className="mt-3 max-h-56 space-y-3 overflow-y-auto pr-1">
              {story.characters.map((c) => {
                const assignedId = story.characterAssetIds?.[c.name];
                const assigned = assignedId ? charAssets.find((a) => a.id === assignedId) : undefined;
                return (
                  <div key={c.name} className="space-y-1">
                    <dt className="flex items-center justify-between text-sm font-medium">
                      <span>{c.name}</span>
                      <Select
                        value={assignedId ?? ""}
                        onValueChange={(val) => assignCharAsset(c.name, val === "" ? null : val)}
                      >
                        <SelectTrigger className="h-6 w-[140px]">
                          <SelectValue placeholder="— none —" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— none —</SelectItem>
                          {charAssets.map((a) => (
                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </dt>
                    <dd className="text-xs leading-relaxed text-muted-foreground">{c.description}</dd>
                    {assigned && (
                      <div className="flex items-center gap-1">
                        <Sparkles className="size-3 text-amber-500" />
                        <Badge variant="secondary" className="h-4 rounded-sm px-1 font-mono text-[9px] leading-none">
                          {assigned.metadata.triggerToken ?? assigned.name}
                        </Badge>
                      </div>
                    )}
                  </div>
                );
              })}
            </dl>
          </details>
        )}
      </nav>

      {/* Scene frames */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-5xl px-6 py-6">
            <header className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[60ch]">
                <h2 className="text-2xl font-semibold tracking-tight">{scene.title}</h2>
                {(scene.place || scene.time) && (
                  <p className="mt-1 text-sm font-medium text-primary">
                    {[scene.place, scene.time].filter(Boolean).join(", ")}
                  </p>
                )}
                {scene.description && (
                  <p className="mt-2 leading-relaxed text-muted-foreground">{scene.description}</p>
                )}
                {scene.turn && (
                  <p className="mt-3 border-l-2 border-primary/50 pl-3 text-sm leading-relaxed">
                    <span className="text-muted-foreground">By the end: </span>
                    {scene.turn}
                  </p>
                )}
                <div className="mt-3">
                  <AssetLinkPicker storyId={story.id} scene={scene} types={["environment"]} label="Scene setting" />
                </div>
              </div>
              {scene.frames.length > 0 && (
                <Button variant="outline" size="sm" onClick={rewrite} disabled={writing} className="shrink-0">
                  {writing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  {writing ? "Writing…" : "Rewrite frames"}
                </Button>
              )}
            </header>

            {writing && scene.frames.length === 0 ? (
              <div className="space-y-4" aria-busy="true">
                <p className="text-sm text-muted-foreground">Writing frames for this scene. This can take a minute or two.</p>
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-56 rounded-xl" />
                ))}
              </div>
            ) : scene.frames.length === 0 ? (
              <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
                <p className="font-medium">No frames yet</p>
                <p className="max-w-[52ch] text-sm leading-relaxed text-muted-foreground">
                  Studio will write 3 to 6 frames for this scene, each with a shot type, an image prompt and narration.
                  Scenes before this one are used as context, so writing in order gives the best continuity.
                </p>
                {work?.state === "error" && (
                  <p role="alert" className="text-sm text-destructive">
                    {work.message}
                  </p>
                )}
                <Button onClick={() => writeScene(scene.id)} disabled={Boolean(writeAll)}>
                  <PenLine />
                  {work?.state === "error" ? "Try again" : "Write frames"}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {work?.state === "error" && (
                  <p role="alert" className="text-sm text-destructive">
                    {work.message}
                  </p>
                )}
                {scene.frames.map((frame, i) => (
                  <FrameCard
                    key={frame.id}
                    storyId={story.id}
                    frame={frame}
                    scene={scene}
                    isActive={i === activeFrameIndex}
                    onUpdated={replaceFrame}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
