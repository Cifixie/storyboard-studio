import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname, resolve } from "path";
import type { Asset, AssetMetadata, AssetType, Story } from "@/lib/types";
import { normalizeStory } from "@/lib/normalize";

export interface StorySummary {
  id: string;
  title: string;
  updatedAt: string;
  sceneCount: number;
}

const DB_PATH = resolve(process.env.DB_PATH ?? "./data/storyboard.db");

// Reuse one connection across Next.js dev hot reloads.
const globalForDb = globalThis as unknown as { storyboardDb?: Database.Database };

function open(): Database.Database {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS stories (
      id         TEXT PRIMARY KEY,
      title      TEXT NOT NULL,
      data       TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      type        TEXT NOT NULL,
      file_path   TEXT NOT NULL DEFAULT '',
      metadata    TEXT NOT NULL DEFAULT '{}',
      created_at  TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS assets_type_name_unique
      ON assets (type, name COLLATE NOCASE);
  `);
  return db;
}

function db(): Database.Database {
  return (globalForDb.storyboardDb ??= open());
}

export function listStories(): StorySummary[] {
  const rows = db()
    .prepare(
      `SELECT id, title, updated_at AS updatedAt,
              json_array_length(data, '$.scenes') AS sceneCount
       FROM stories ORDER BY updated_at DESC`
    )
    .all() as StorySummary[];
  return rows;
}

export function getStory(id: string): Story | null {
  const row = db().prepare("SELECT data FROM stories WHERE id = ?").get(id) as { data: string } | undefined;
  return row ? normalizeStory(JSON.parse(row.data) as Story) : null;
}

export function saveStory(story: Story): void {
  const now = new Date().toISOString();
  story = { ...story, updatedAt: now };
  db()
    .prepare(
      `INSERT INTO stories (id, title, data, created_at, updated_at)
       VALUES (@id, @title, @data, @now, @now)
       ON CONFLICT(id) DO UPDATE SET title = @title, data = @data, updated_at = @now`
    )
    .run({ id: story.id, title: story.title, data: JSON.stringify(story), now });
}

/**
 * Reads, changes and saves a story in one synchronous step. better-sqlite3 is
 * synchronous, so concurrent requests (an image finishing while a scene is
 * being written) cannot overwrite each other's changes.
 */
export function mutateStory<T>(id: string, change: (story: Story) => T): T {
  const story = getStory(id);
  if (!story) throw new NotFoundError("Story not found");
  const result = change(story);
  saveStory(normalizeStory(story));
  return result;
}

export class NotFoundError extends Error {}

export function deleteStory(id: string): boolean {
  return db().prepare("DELETE FROM stories WHERE id = ?").run(id).changes > 0;
}

/** True when another asset of the same type already carries the same normalized name. */
export function assetExists(type: string, name: string, selfId?: string): boolean {
  const key = name.trim().toLowerCase().replace(/[.!,;:]+$/g, "");
  return listAssets().some(
    (a) => a.type === type && a.id !== selfId && a.name.trim().toLowerCase().replace(/[.!,;:]+$/g, "") === key
  );
}

// ─── Assets ──────────────────────────────────────────────────────────────────

interface AssetRow {
  id: string;
  name: string;
  type: string;
  file_path: string;
  metadata: string;
  created_at: string;
}

const ASSET_COLUMNS = "id, name, type, file_path, metadata, created_at";

export function listAssets(): Asset[] {
  const rows = db()
    .prepare(`SELECT ${ASSET_COLUMNS} FROM assets ORDER BY created_at DESC`)
    .all() as AssetRow[];
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type as AssetType,
    filePath: row.file_path,
    metadata: JSON.parse(row.metadata) as AssetMetadata,
    createdAt: row.created_at,
  }));
}

export function saveAsset(asset: Asset): Asset {
  db()
    .prepare(
      `INSERT INTO assets (id, name, type, file_path, metadata, created_at)
       VALUES (@id, @name, @type, @filePath, @metadata, @createdAt)
       ON CONFLICT(id) DO UPDATE SET
         name = @name, type = @type, file_path = @filePath, metadata = @metadata`
    )
    .run({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      filePath: asset.filePath,
      metadata: JSON.stringify(asset.metadata),
      createdAt: asset.createdAt,
    });
  return asset;
}

export function getAsset(id: string): Asset | null {
  const row = db()
    .prepare(`SELECT ${ASSET_COLUMNS} FROM assets WHERE id = ?`)
    .get(id) as AssetRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: row.type as AssetType,
    filePath: row.file_path,
    metadata: JSON.parse(row.metadata) as AssetMetadata,
    createdAt: row.created_at,
  };
}

export function deleteAsset(id: string): boolean {
  return db().prepare("DELETE FROM assets WHERE id = ?").run(id).changes > 0;
}
