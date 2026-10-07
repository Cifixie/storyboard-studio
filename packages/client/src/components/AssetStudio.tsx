"use client";

import { useEffect, useRef, useState } from "react";
import { useStoryStore } from "@/lib/store/StoryStore";
import { fetchAssets, createAsset, uploadAsset, removeAsset, triggerTokenFor, suggestAllAssets, generateReferenceImage, attachAssetImage, type AssetSuggestion, type NewAsset } from "@/lib/assets";
import type { Asset, AssetType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, ImagePlus, Trash2, FolderOpen, Loader2, Sparkles, Bolt } from "lucide-react";

const FILTERS: AssetType[] = ["character", "prop", "environment"];

export function AssetStudio() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeFilter, setActiveFilter] = useState<AssetType>("character");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<NewAsset>>({});
  const [mediaOpen, setMediaOpen] = useState(false);
  const [generatingSuggestion, setGeneratingSuggestion] = useState<string | null>(null);
  const [chipError, setChipError] = useState<Partial<Record<string, string>>>({});
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number } | null>(null);
  const bulkAbortRef = useRef(false);
  const story = useStoryStore((s) => s.story);
  const refresh = () => fetchAssets().then(setAssets).catch((e) => console.error("Could not load assets", e));
  useEffect(() => { refresh(); }, []);

  // Show the same uncapped suggestion set that bulk generation will process.
  const suggestions = suggestAllAssets(story, assets).filter((s) => s.type === activeFilter);
  const visible = assets.filter((a) => a.type === activeFilter);
  const missing = suggestions.length + visible.filter((a) => !a.filePath).length;

  const toastIds = useRef(new Map<string, string>());
  const showProgress = (key: string, asset: string, current: number, total: number, stage?: string) => {
    const description = progressDescription(asset, current, total, stage);
    const toastId = toastIds.current.get(key);
    if (toastId) {
      toast.update(toastId, { type: "loading", description, timeout: 0 });
      return;
    }
    toastIds.current.set(key, toast.add({ type: "loading", title: `Generating ${asset}`, description, timeout: 0 }));
  };
  const finishProgress = (key: string, asset: string, error?: string) => {
    const toastId = toastIds.current.get(key);
    if (!toastId) return;
    toast.update(toastId, error
      ? { type: "error", title: `Could not generate ${asset}`, description: error, timeout: 0 }
      : { type: "success", title: `${asset} ready`, description: "Reference image saved.", timeout: 4500 });
    toastIds.current.delete(key);
  };
  const progressDescription = (asset: string, current: number, total: number, stage?: string) => (
    <div className="w-full">
      <p>{stage ?? (total > 0 ? `Image step ${current} of ${total}` : "Starting image generation…")}</p>
      {!stage && total > 0 && (
        <div role="progressbar" aria-label={`Generating ${asset}`} aria-valuemin={0} aria-valuemax={total} aria-valuenow={current} className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.min(100, current / total * 100)}%` }} />
        </div>
      )}
    </div>
  );

  /** Generate an image and attach it to an existing asset slot. */
  const generateAndAttach = async (s: AssetSuggestion & { id: string }, toastKey?: string) => {
    const prompt = [story?.style, `Reference sheet: ${s.description ?? `${s.type} named ${s.name}`}`]
      .filter(Boolean)
      .join(". ");
    const { url } = await generateReferenceImage(prompt, toastKey ? (progress) => {
      showProgress(toastKey, s.name, progress.current, progress.total);
    } : undefined);
    if (toastKey) showProgress(toastKey, s.name, 0, 0, "Saving reference image…");
    const blob = await fetch(url).then((r) => r.blob());
    return attachAssetImage(s.id, { name: s.name, type: s.type, triggerToken: s.triggerToken, description: s.description }, blob);
  };

  /** Generate all missing images sequentially. */
  const generateAllMissing = async () => {
    // Double-start guard
    if (bulkProgress) return;

    const existingWithoutImages = visible.filter((a) => !a.filePath);
    if (suggestions.length === 0 && existingWithoutImages.length === 0) return;

    const originalStoryId = story?.id;
    bulkAbortRef.current = false;

    // Build one queue: [suggestions (new) ..., existing (attach-only) ...]
    const toSuggestion = (a: Asset): AssetSuggestion => ({
      name: a.name,
      type: a.type,
      description: a.metadata.description,
      triggerToken: a.metadata.triggerToken ?? triggerTokenFor(a.name),
      id: a.id,
    });
    const queue = [
      ...suggestions,
      ...existingWithoutImages.map(toSuggestion),
    ];
    const total = queue.length;

    setBulkProgress({ current: 0, total });

    for (let i = 0; i < queue.length; i++) {
      if (bulkAbortRef.current || useStoryStore.getState().story?.id !== originalStoryId) break;
      const item = queue[i];
      const key = `bulk:${item.type}:${item.name}`;
      setGeneratingSuggestion(`${item.type}:${item.name}`);
      showProgress(key, item.name, 0, 0);
      try {
        let result: Asset;
        if (item.id) {
          result = await generateAndAttach({ ...item, id: item.id }, key);
        } else {
          const slot = await createAsset({
            name: item.name,
            type: item.type,
            triggerToken: item.triggerToken,
            description: item.description,
          });
          result = await generateAndAttach({ ...item, id: slot.id }, key);
        }
        setAssets((current) => [...current.filter((asset) => asset.id !== result.id), result]);
        finishProgress(key, item.name);
      } catch (e) {
        setChipError((prev) => ({ ...prev, [`${item.type}:${item.name}`]: "Generation failed" }));
        finishProgress(key, item.name, e instanceof Error ? e.message : "Generation failed");
      } finally {
        setBulkProgress({ current: i + 1, total });
        setGeneratingSuggestion(null);
      }
    }

    setBulkProgress(null);
    await refresh();
  };


  const stopBulk = () => { bulkAbortRef.current = true; };
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
          <Button variant="ghost" size="icon-sm" className="size-7" disabled={!!bulkProgress} onClick={() => setMediaOpen(true)}>
            <FolderOpen className="size-3.5" />
            <span className="sr-only">Browse media files</span>
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-7" disabled={!!bulkProgress} onClick={() => openAdd({ type: activeFilter })}>
            <Plus className="size-3.5" />
            <span className="sr-only">Add asset</span>
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-3 p-3">
          {missing > 0 && (
            <section className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <h3 className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  <Sparkles className="size-3" />
                  Missing reference images
                </h3>
                <div className="flex items-center gap-2">
                  {bulkProgress && bulkProgress.current < bulkProgress.total ? (
                    <Button variant="ghost" size="sm" className="h-6 gap-1 px-2 text-[11px] text-destructive" onClick={stopBulk}>
                      <Loader2 className="size-3 animate-spin" />
                      {bulkProgress.current} / {bulkProgress.total}
                    </Button>
                  ) : bulkProgress ? (
                    <span className="text-[11px] text-muted-foreground">{bulkProgress.current} / {bulkProgress.total}</span>
                  ) : (
                    <Button variant="outline" size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={generateAllMissing} disabled={!story}>
                      <Bolt className="size-3" />
                      Generate all
                    </Button>
                  )}
                </div>
              </div>
              {bulkProgress && (
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
              )}
            </section>
          )}

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
                    <div className="flex min-w-0 items-center gap-2">
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
                      <Badge variant="secondary" className="min-w-0 max-w-[35%] truncate shrink font-mono text-[10px] leading-none">
                        {s.triggerToken}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="size-7 shrink-0"
                        disabled={!!bulkProgress}
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
        onGenerateImage={async (asset) => {
          setDialogOpen(false);
          const key = `single:${asset.id}`;
          showProgress(key, asset.name, 0, 0);
          try {
            const generated = await generateAndAttach({
              id: asset.id,
              name: asset.name,
              type: asset.type,
              description: asset.metadata.description,
              triggerToken: asset.metadata.triggerToken ?? triggerTokenFor(asset.name),
            }, key);
            setAssets((current) => [...current.filter((item) => item.id !== generated.id), generated]);
            finishProgress(key, asset.name);
            return generated;
          } catch (error) {
            finishProgress(key, asset.name, error instanceof Error ? error.message : "Generation failed");
            throw error;
          }
        }}
      />
      <MediaBrowser open={mediaOpen} onClose={() => setMediaOpen(false)} />
    </div>
  );
}

// ─── Add / edit asset ────────────────────────────────────────────────────────

function AddAssetDialog({ open, prefill, onClose, onSaved, onGenerateImage }: {
  open: boolean;
  prefill: Partial<NewAsset>;
  onClose: () => void;
  onSaved: (asset: Asset) => void;
  onGenerateImage: (asset: Asset) => Promise<Asset>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<AssetType>("character");
  const [token, setToken] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [createdSlot, setCreatedSlot] = useState<Asset | null>(null);
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
    setCreatedSlot(null);
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
      const asset = file
        ? createdSlot
          ? await attachAssetImage(createdSlot.id, slot, file)
          : await uploadAsset(slot, file)
        : createdSlot ?? await createAsset(slot);
      setCreatedSlot(asset);
      onSaved(asset);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the asset");
    } finally {
      setSaving(false);
    }
  };

  const generateImage = async () => {
    const trimmed = name.trim() || prefill.name?.trim() || "";
    if (!trimmed) { setError("Give it a name."); return; }
    setSaving(true);
    setError(null);
    try {
      const slot = createdSlot ?? await createAsset({
        name: trimmed,
        type,
        triggerToken: token.trim() || triggerTokenFor(trimmed),
        description: description.trim() || undefined,
      });
      setCreatedSlot(slot);
      const generated = await onGenerateImage(slot);
      onSaved(generated);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not generate the image");
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
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          {!file && (
            <Button variant="outline" onClick={generateImage} disabled={saving || (!name.trim() && !prefill.name?.trim())}>
              {saving && <Loader2 className="animate-spin" />}
              Generate image
            </Button>
          )}
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="animate-spin" />}
            {file ? "Create asset" : "Create slot"}
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
          <DialogDescription>Everything under public/media — generated frames, audio, and asset images.</DialogDescription>
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