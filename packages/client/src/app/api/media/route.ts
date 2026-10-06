// Media listing API route

import { NextResponse } from "next/server";
import { media } from "@/lib/media";

export async function GET() {
  try {
    return NextResponse.json({ files: media.list() });
  } catch (error) {
    console.error("Failed to list media:", error);
    return NextResponse.json({ error: "Failed to list media" }, { status: 500 });
  }
}