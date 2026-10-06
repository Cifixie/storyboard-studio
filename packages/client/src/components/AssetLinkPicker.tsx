"use client";

import { useState } from "react";
import { fetchAssets } from "@/lib/assets";
import { linkAssets } from "@/lib/api";
import { useStoryStore } from "@/lib/store/StoryStore";
import type { Asset, AssetType, Frame, Scene } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, Link2, Loader2 } from "lucide-react";

interface AssetLinkPickerProps {
  /** Which story the links are saved on. */
  storyId: string;
  /** The scene being linked; when `frame` is set, links go to the frame instead. */
  scene: Scene;
  frame?: Frame;
  /** Asset types offered in this picker. */
  types: AssetType[];
  label: string;
  onSaved?: () => void;
}

/**
 * Toggles assets on/off the given scene or frame and saves the links on the
 * story, so they survive reloads and reach the image prompt composer.
 */
export function AssetLinkPicker({ storyId, scene, frame, types, label, onSaved }: AssetLinkPickerProps) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const applyStory = useStoryStore((s) => s.applyStory);

  const linkedIds = frame ? (frame.assetIds ?? []) : (scene.assetIds ?? []);

  const load = () => {
    fetchAssets()
      .then(setAssets)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load assets"));
  };

  const toggle = async (asset: Asset) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = linkedIds.includes(asset.id)
      ? linkedIds.filter((id) => id !== asset.id)
      : [...linkedIds, asset.id];
    try {
      const saved = await linkAssets(storyId, scene.id, next, frame?.id);
      applyStory(saved);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not link asset");
    } finally {
      setBusy(false);
    }
  };

  const offered = (assets ?? []).filter((a) => types.includes(a.type));

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger render={<Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" />}>
        <Link2 className="size-3.5" />
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <p className="px-1 pb-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {frame ? "Frame assets" : "Scene assets"}
        </p>
        {!assets ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Loading…
          </div>
        ) : offered.length === 0 ? (
          <p className="px-1 py-3 text-xs text-muted-foreground">
            No {types.join(" / ")} assets in the library yet. Add them in the Asset panel.
          </p>
        ) : (
          <ul className="max-h-64 space-y-0.5 overflow-y-auto">
            {offered.map((asset) => {
              const on = linkedIds.includes(asset.id);
              return (
                <li key={asset.id}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(asset)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs outline-none transition-colors hover:bg-accent ${
                      on ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`grid size-4 shrink-0 place-items-center rounded border ${
                        on ? "border-primary bg-primary text-primary-foreground" : "border-border"
                      }`}
                    >
                      {on && <Check className="size-3" strokeWidth={2.5} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{asset.name}</span>
                    <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{asset.type}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {error && (
          <p role="alert" className="px-1 pt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
