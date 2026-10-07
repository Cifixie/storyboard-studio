// Asset API client and story-driven asset suggestions.

import type { Asset, AssetType, Story } from "@/lib/types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchAssets(): Promise<Asset[]> {
  return (await request<{ assets: Asset[] }>("/api/assets")).assets;
}

export interface NewAsset {
  name: string;
  type: AssetType;
  triggerToken?: string;
  description?: string;
}

/** Creates an empty slot (possibly without an image). */
export async function createAsset(slot: NewAsset): Promise<Asset> {
  return (await request<{ asset: Asset }>("/api/assets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slot),
  })).asset;
}

/** Uploads a reference image, with the slot metadata in one request. */
export async function uploadAsset(slot: NewAsset, file: File): Promise<Asset> {
  const form = new FormData();
  form.set("file", file);
  form.set("name", slot.name);
  form.set("type", slot.type);
  if (slot.triggerToken) form.set("triggerToken", slot.triggerToken);
  if (slot.description) form.set("description", slot.description);
  return (await request<{ asset: Asset }>("/api/assets", { method: "POST", body: form })).asset;
}

/** Generates a reference image from a bare prompt (no story/frame context). */
export async function generateReferenceImage(prompt: string): Promise<{ url: string }> {
  const res = await fetch("/api/image/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}


/** Uploads an image blob onto an existing asset slot (updates it in place). */
export async function attachAssetImage(id: string, slot: Partial<NewAsset>, blob: Blob): Promise<Asset> {
  const form = new FormData();
  form.set("id", id);
  if (slot.name) form.set("name", slot.name);
  if (slot.type) form.set("type", slot.type);
  if (slot.triggerToken) form.set("triggerToken", slot.triggerToken);
  if (slot.description) form.set("description", slot.description);
  form.set("file", blob instanceof File ? blob : new File([blob], "reference.png", { type: "image/png" }));
  return (await request<{ asset: Asset }>("/api/assets", { method: "POST", body: form })).asset;
}

export async function removeAsset(id: string): Promise<void> {
  await request(`/api/assets/${id}`, { method: "DELETE" });
}

// ─── Suggestions ─────────────────────────────────────────────────────────────

export interface AssetSuggestion {
  name: string;
  type: AssetType;
  description?: string;
  triggerToken: string;
  /** Existing asset id (for attaching images to pre-existing slots). */
  id?: string;
}

/** `Barnaby` → `BARNABY`, `Lighthouse cellar` → `LIGHTHOUSE_CELLAR` */
export const triggerTokenFor = (name: string): string =>
  name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "ASSET";

export const keyOf = (name: string) => name.trim().toLowerCase().replace(/[.!,;:]+$/g, "");

/**
 * What the open story would want a reference image for, minus slots that already exist:
 * every cast member, plus every named place — sets images must keep redrawing each other
 * even when a place appears once. Reused places sort first. Pure text, re-run on every edit.
 */
export function suggestAssets(story: Story | null, assets: Asset[], capPerType = 4): AssetSuggestion[] {
  if (!story) return [];

  const suggestions: AssetSuggestion[] = [];
  const has = (type: AssetType, name: string) =>
    assets.some((asset) => asset.type === type && keyOf(asset.name) === keyOf(name));

  for (const character of story.characters) {
    if (has("character", character.name)) continue;
    suggestions.push({
      name: character.name,
      type: "character",
      description: character.description,
      triggerToken: triggerTokenFor(character.name),
    });
  }
  for (const prop of story.props ?? []) {
    if (has("prop", prop.name)) continue;
    suggestions.push({
      name: prop.name,
      type: "prop",
      description: prop.description,
      triggerToken: triggerTokenFor(prop.name),
    });
  }

  // A scene can name more than one place ("kitchen and garden"); count each.
  const sceneCountByPlace = new Map<string, { name: string; scenes: number }>();
  for (const scene of story.scenes) {
    for (const place of scene.place.split(/[,;]|\band\b/i).map((p) => p.trim()).filter(Boolean)) {
      const key = keyOf(place);
      if (key === "unknown place") continue;
      const seen = sceneCountByPlace.get(key);
      if (seen) seen.scenes += 1;
      else sceneCountByPlace.set(key, { name: place, scenes: 1 });
    }
  }
  const places = [...sceneCountByPlace.values()].sort((a, b) => b.scenes - a.scenes);
  for (const { name } of places) {
    if (has("environment", name)) continue;
    suggestions.push({ name, type: "environment", triggerToken: triggerTokenFor(name) });
  }

  if (capPerType === Infinity) return suggestions;
  return suggestions.filter((s) => s.type === "character").slice(0, capPerType)
    .concat(suggestions.filter((s) => s.type === "prop").slice(0, capPerType))
    .concat(suggestions.filter((s) => s.type === "environment").slice(0, capPerType));
}

export function suggestAllAssets(story: Story | null, assets: Asset[]): AssetSuggestion[] {
  return suggestAssets(story, assets, Infinity);
}