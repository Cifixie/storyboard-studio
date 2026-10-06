// Asset detail: rename/retype/refill a slot, or delete it.

import { NextRequest, NextResponse } from "next/server";
import { assetExists, deleteAsset, getAsset, saveAsset } from "@/lib/db";
import { media } from "@/lib/media";
import { ASSET_TYPES, type AssetType } from "@/lib/types";

type Context = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  return NextResponse.json({ asset });
}

export async function PATCH(req: NextRequest, { params }: Context) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const body = await req.json();
  const type = body.type === undefined ? (asset.type as string) : String(body.type);
  if (!ASSET_TYPES.includes(type as AssetType)) {
    return NextResponse.json({ error: "Unknown asset type" }, { status: 400 });
  }
  const name = body.name === undefined ? asset.name : String(body.name).trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (assetExists(type, name, asset.id))
    return NextResponse.json({ error: `A ${type} asset named "${name}" already exists` }, { status: 409 });

  const updated = saveAsset({
    ...asset,
    name,
    type: type as AssetType,
    metadata: {
      ...asset.metadata,
      triggerToken: body.triggerToken === undefined ? asset.metadata.triggerToken : (String(body.triggerToken).trim() || undefined),
      description: body.description === undefined ? asset.metadata.description : (String(body.description).trim() || undefined),
    },
  });
  return NextResponse.json({ asset: updated });
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  const { id } = await params;
  const asset = getAsset(id);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  deleteAsset(id);
  if (asset.filePath) {
    try {
      media.remove(asset.filePath);
    } catch (e) {
      console.error("Asset row deleted but its file could not be removed:", e);
    }
  }
  return NextResponse.json({ ok: true });
}