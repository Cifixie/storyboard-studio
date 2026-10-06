// File storage for generated media under public/media/. Server-side only.

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { dirname, join, extname, relative, resolve, sep } from "path";

const BASE = resolve("./public/media");

export interface MediaFile {
  name: string;
  relativePath: string;  // relative to public/media, e.g. "characters/barnaby.jpg"
  path: string;          // as served, e.g. "/media/characters/barnaby.jpg"
  size: number;
  type: "image" | "audio" | "other";
}

function kind(name: string): MediaFile["type"] {
  const ext = extname(name).toLowerCase();
  if (ext === ".wav" || ext === ".mp3" || ext === ".ogg") return "audio";
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp") return "image";
  return "other";
}

/** Resolves a relative path inside the media dir, rejecting `..` escapes. */
function inside(relativePath: string): string {
  const fullPath = resolve(BASE, relativePath);
  if (fullPath !== BASE && !fullPath.startsWith(BASE + sep)) {
    throw new Error("Path escapes the media directory");
  }
  return fullPath;
}

function walk(dir: string): MediaFile[] {
  if (!existsSync(dir)) return [];
  const files: MediaFile[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (entry.isFile()) {
      const rel = relative(BASE, fullPath);
      files.push({
        name: entry.name,
        relativePath: rel,
        path: `/media/${rel.split(sep).join("/")}`,
        size: statSync(fullPath).size,
        type: kind(entry.name),
      });
    }
  }
  return files;
}

export const media = {
  /** Every file under the media dir, recursively, ignoring dotfiles. */
  list: (): MediaFile[] => walk(BASE),

  read(relativePath: string): Buffer | null {
    const fullPath = inside(relativePath);
    return existsSync(fullPath) && statSync(fullPath).isFile() ? readFileSync(fullPath) : null;
  },

  write(relativePath: string, data: Buffer): string {
    const fullPath = inside(relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, data);
    return `/media/${relativePath}`;
  },

  remove(relativePath: string): void {
    const fullPath = inside(relativePath);
    if (existsSync(fullPath)) unlinkSync(fullPath);
  },

  /** A unique file name safe for URLs: `asset-<ts>-<rand>.jpg`. */
  uniqueName(prefix: string, ext: string): string {
    const ts = Date.now().toString(36);
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${ts}-${rand}${ext.startsWith(".") ? ext : "." + ext}`;
  },
};