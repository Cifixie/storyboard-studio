"use client";

import { useEffect, useRef, useState } from "react";
import { useStoryStore } from "@/lib/store/StoryStore";
import { fetchAssets, createAsset, uploadAsset, removeAsset, triggerTokenFor, suggestAssets, generateReferenceImage, attachAssetImage, type AssetSuggestion, type NewAsset } from "@/lib/assets";
import type { Asset, AssetType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ImagePlus, Trash2, FolderOpen, Loader2, Sparkles } from "lucide-react";

const FILTERS: AssetType[] = ["character", "prop", "environment", "reference"];

export function AssetStudio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeFilter, setActiveFilter] = useState<AssetType>("character");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<NewAsset>>({});
  const [mediaOpen, setMediaOpen] = useState(false);
  const [generatingSuggestion, setGeneratingSuggestion] = useState<string | null>(null);
  const [chipError, setChipError] = useState<Partial<Record<string, string>>>({});
  const story = useStoryStore((s) => s.story);

  const refresh = () => fetchAssets().then(setAssets).catch((e) => console.error("Could not load assets", e));
  useEffect(() => { refresh(); }, []);

  const suggestions = suggestAssets(story, assets).filter((s) => s.type === activeFilter);
  const visible = assets.filter((a) => a.type === activeFilter);

  const generateReference = async (s: AssetSuggestion) => {
    setGeneratingSuggestion(`${s.type}:${s.name}`);
    try {
      // Create the slot first so a failed upload can never orphan the image;
      // then generate and attach the file to it.
      const slot = await createAsset({
        name: s.name,
        type: s.type,
        triggerToken: s.triggerToken,
        description: s.description,
      });
      const prompt = [
        story?.style,
        `Reference sheet: ${s.description ?? `${s.type} named ${s.name}`}`,
      ]
        .filter(Boolean)
        .join(". ");
      const { url } = await generateReferenceImage(prompt);
      const blob = await fetch(url).then((r) => r.blob());
      await attachAssetImage(slot.id, { name: slot.name, type: slot.type, triggerToken: s.triggerToken, description: s.description }, blob);
      refresh();
    } catch (e) {
      console.error("Reference generation failed", e);
      setChipError((prev) => ({ ...prev, [`${s.type}:${s.name}`]: e instanceof Error ? e.message : "Generation failed" }));
      setGeneratingSuggestion(null);
    }
  };

  const openAdd = (slot?: Partial<NewAsset>) => {
    setPrefill(slot ?? {});
    setDialogOpen(true);
  };

  const handleDelete = async (asset: Asset) => {
    if (!window.confirm(`Delete "${asset.name}"?`)) return;
    await removeAsset(asset.id);
    refresh();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between border-b border-sidebar-border px-4">
        <h2 className="text-base font-semibold tracking-tight">Assets</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => setMediaOpen(true)}>
            <FolderOpen className="size-3.5" />
            <span className="sr-only">Browse media files</span>
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-7" onClick={() => openAdd({ type: activeFilter })}>
            <Plus className="size-3.5" />
            <span className="sr-only">Add asset</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {suggestions.length > 0 && (
            <section aria-label={`Matching needs from ${story?.title}`} className="space-y-2">
              <h3 className="flex items-center gap-1.5 px-0.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                <Sparkles className="size-3" />
                {story ? "This story asks for" : "Suggestions"}
              </h3>
              {suggestions.map((s) => {
                const key = `${s.type}:${s.name}`;
                const busy = generatingSuggestion === key;
                const error = chipError[key];
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-dashed border-border/70 px-2.5 py-2 outline-none transition-colors hover:border-primary/50 hover:bg-accent"
                  >
                    <div className="flex items-center gap-2">
                      {busy ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-primary" strokeWidth={1.5} />
                      ) : (
                        <ImagePlus className="size-4 shrink-0 text-primary/60" strokeWidth={1.5} />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium">{s.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {busy ? "generating reference…" : "needs a reference image"}
                        </span>
                      </span>
                      <Badge variant="secondary" className="shrink-0 font-mono text-[10px] leading-none">
                        {s.triggerToken}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 shrink-0 px-2 text-[11px]"
                        disabled={busy}
                        onClick={() => generateReference(s)}
                      >
                        Generate reference
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 shrink-0"
                        onClick={() => openAdd(s)}
                        aria-label={`Add ${s.name} manually`}
                      >
                        <Plus className="size-3.5" />
                        <span className="sr-only">Add manually</span>
                      </Button>
                    </div>
                    {error && <p className="mt-1 truncate text-[11px] text-destructive">{error}</p>}
                  </div>
                );
              })}
            </section>
          )}

          {visible.length === 0 ? (
            suggestions.length === 0 ? (
              <div className="flex flex-col items-center px-4 py-12 text-center">
                <ImagePlus className="mb-3 size-6 text-primary/50" strokeWidth={1.25} />
                <p className="text-sm font-medium">No {activeFilter}s yet</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Add reference images to keep looks consistent across frames.
                </p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => openAdd({ type: activeFilter })}>
                  <Plus />
                  Add {activeFilter}
                </Button>
              </div>
            ) : null
          ) : (
            <div className="space-y-2">
              {visible.map((asset) => (
                <div
                  key={asset.id}
                  className="group relative rounded-lg border border-border/50 bg-card transition-colors hover:border-border hover:bg-accent"
                >
                  {asset.filePath && (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-t-lg bg-muted">
                      <img src={`/media/${asset.filePath}`} alt={asset.name} className="size-full object-cover" />
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 pr-8">
                    <span className="truncate text-xs font-medium">{asset.name}</span>
                    {asset.metadata.triggerToken && (
                      <Badge variant="secondary" className="ml-auto shrink-0 font-mono text-[10px] leading-none">
                        {asset.metadata.triggerToken}
                      </Badge>
                    )}
                  </div>
                  {!asset.filePath && (
                    <span className="absolute right-2 bottom-2 rounded border border-dashed px-1 text-[10px] leading-4 text-muted-foreground">
                      no image
                    </span>
                  )}
                  <button
                    type="button"
                    aria-label={`Delete ${asset.name}`}
                    onClick={() => handleDelete(asset)}
                    className="absolute top-1.5 right-1.5 grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition hover:bg-destructive/15 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      <div role="tablist" aria-label="Asset type" className="flex gap-1 border-t border-sidebar-border p-2">
        {FILTERS.map((type) => (
          <button
            key={type}
            type="button"
            role="tab"
            aria-selected={activeFilter === type}
            className={`flex-1 rounded-md px-2 py-1.5 text-sm capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
              activeFilter === type
                ? "bg-sidebar-accent font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveFilter(type)}
          >
            {type}
          </button>
        ))}
      </div>

      <AddAssetDialog
        open={dialogOpen}
        prefill={prefill}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); refresh(); }}
      />
      <MediaBrowser open={mediaOpen} onClose={() => setMediaOpen(false)} />
    </div>
  );
}

// ─── Add / edit asset ────────────────────────────────────────────────────────

function AddAssetDialog({ open, prefill, onClose, onSaved }: {
  open: boolean;
  prefill: Partial<NewAsset>;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("character");
  const [token, setToken] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(prefill.name ?? "");
    setType(prefill.type ?? "character");
    setToken(prefill.triggerToken ?? "");
    setDescription(prefill.description ?? "");
    setFile(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }, [open, prefill]);

  const save = async () => {
    const trimmed = name.trim() || prefill.name?.trim() || "";
    if (!trimmed) { setError("Give it a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const slot: NewAsset = {
        name: trimmed,
        type,
        triggerToken: token.trim() || triggerTokenFor(trimmed),
        description: description.trim() || undefined,
      };
      const asset = file ? await uploadAsset(slot, file) : await createAsset(slot);
      onSaved(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the asset");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
          <DialogDescription>A reference that keeps this {type} looking the same in every frame.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div role="radiogroup" aria-label="Asset type" className="flex gap-1">
            {FILTERS.map((t) => (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={type === t}
                onClick={() => setType(t)}
                className={`flex-1 rounded-md px-2 py-1.5 text-sm capitalize outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/60 ${
                  type === t ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Barnaby" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-token">Trigger token</Label>
            <Input
              id="asset-token"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="BARNABY"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">Used to reference this asset in generated prompts.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-desc">Description</Label>
            <Textarea
              id="asset-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Purely visual: colors, clothing, distinctive features"
              className="min-h-16"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="asset-file">Reference image</Label>
            <Input
              id="asset-file"
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
          </div>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            Create asset
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Media browser ───────────────────────────────────────────────────────────

interface MediaEntry { name: string; path: string; relativePath: string; size: number; type: "image" | "audio" | "other"; }

function MediaBrowser({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [files, setFiles] = useState<MediaEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/media", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setFiles(d.files ?? []))
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [open]);

  const images = files.filter((f) => f.type === "image");
  const audio = files.filter((f) => f.type === "audio");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Media files</DialogTitle>
          <DialogDescription>Everything under public/media — generated frames, audio and references.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing in public/media yet. Generated frames and audio land here.</p>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            {images.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Images</h3>
                <div className="grid grid-cols-3 gap-2">
                  {images.map((f) => (
                    <figure key={f.relativePath} className="overflow-hidden rounded-md border border-border/50 bg-muted">
                      <img src={f.path} alt={f.relativePath} loading="lazy" className="aspect-square w-full object-cover" />
                      <figcaption className="truncate px-1.5 py-1 text-[10px] text-muted-foreground" title={f.relativePath}>
                        {f.relativePath}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            )}
            {audio.length > 0 && (
              <section className="mt-4 space-y-2">
                <h3 className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Audio</h3>
                <ul className="space-y-1.5">
                  {audio.map((f) => (
                    <li key={f.relativePath} className="space-y-1">
                      <p className="truncate text-xs" title={f.relativePath}>{f.relativePath}</p>
                      <audio controls preload="none" src={f.path} className="h-8 w-full" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}