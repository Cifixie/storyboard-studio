// Asset API: list slots, create an empty slot, or attach a reference image.

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { assetExists, listAssets, saveAsset, getAsset } from "@/lib/db";
import { media } from "@/lib/media";
import { triggerTokenFor } from "@/lib/assets";
import { ASSET_TYPES, type Asset, type AssetType } from "@/lib/types";

const FOLDERS: Record<AssetType, string> = {
  character: "characters",
  prop: "props",
  environment: "environments",
  reference: "references",
};

function badAssetType(type: string): boolean {
  return !ASSET_TYPES.includes(type as AssetType);
}

export async function GET() {
  try {
    return NextResponse.json({ assets: listAssets() });
  } catch (error) {
    console.error("Failed to list assets:", error);
    return NextResponse.json({ error: "Failed to list assets" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data")) {
      const body = await request.json();
      const name = String(body.name ?? "").trim();
      const type = String(body.type ?? "character");
      if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
      if (badAssetType(type)) return NextResponse.json({ error: "Unknown asset type" }, { status: 400 });
      if (assetExists(type, name))
        return NextResponse.json({ error: `A ${type} asset named "${name}" already exists` }, { status: 409 });

      const asset = saveAsset({
        id: randomUUID(),
        name,
        type: type as AssetType,
        filePath: "",
        metadata: {
          triggerToken: String(body.triggerToken ?? "").trim() || triggerTokenFor(name),
          description: String(body.description ?? "").trim() || undefined,
        },
        createdAt: new Date().toISOString(),
      });
      return NextResponse.json({ asset }, { status: 201 });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "An image file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Only image files can be reference images" }, { status: 400 });
    }

    const existingId = String(form.get("id") ?? "");
    const existing = existingId ? getAsset(existingId) : null;
    if (existingId && !existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const name = String(form.get("name") ?? "").trim() || existing?.name || file.name.replace(/\.[^.]+$/, "");
    const type = (String(form.get("type") ?? "") || existing?.type) as string;
    if (badAssetType(type)) return NextResponse.json({ error: "Unknown asset type" }, { status: 400 });
    // Refills keep their identity; only brand-new slots must not collide.
    if (!existing && assetExists(type, name))
      return NextResponse.json({ error: `A ${type} asset named "${name}" already exists` }, { status: 409 });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "asset";
    const ext = file.type === "image/png" ? ".png" : file.type === "image/webp" ? ".webp" : ".jpg";
    const served = media.write(`${FOLDERS[type as AssetType]}/${media.uniqueName(slug, ext)}`, Buffer.from(await file.arrayBuffer()));
    const filename = served.replace(/^\/media\//, ""); // filePath is stored relative to public/media

    const asset = saveAsset({
      id: existing?.id ?? randomUUID(),
      name,
      type: type as AssetType,
      filePath: filename,
      metadata: {
        ...existing?.metadata,
        triggerToken: String(form.get("triggerToken") ?? "") || existing?.metadata.triggerToken || triggerTokenFor(name),
        description: String(form.get("description") ?? "") || existing?.metadata.description || undefined,
      },
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    });
    return NextResponse.json({ asset }, { status: existing ? 200 : 201 });
  } catch (error) {
    console.error("Failed to save asset:", error);
    return NextResponse.json({ error: "Failed to save asset" }, { status: 500 });
  }
}