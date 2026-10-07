// Shared types for Storyboard Studio

// ─── Story ───────────────────────────────────────────────────────────────────

export interface Story {
  id: string;
  title: string;
  synopsis: string;
  style: string;          // global visual style prompt
  characters: Character[]; // recurring cast, with a fixed look used in every image prompt
  props: Character[];      // prominent items, same fixed-look shape
  scenes: Scene[];
  createdAt: string;
  /** Story-level mapping from character name → character asset id. Resolved before the cast description fallback. */
  characterAssetIds?: Record<string, string>;
  updatedAt: string;
}

export interface Character {
  name: string;
  description: string;     // purely visual: species, colors, clothing, distinctive features
}

export interface Scene {
  id: string;
  title: string;
  description: string;
  place: string;           // where the scene happens, e.g. "Lighthouse cellar"
  time: string;            // when, e.g. "Night"
  turn: string;            // what has changed by the end of the scene
  /** Asset library ids explicitly linked to this scene (its place). Missing = not curated yet. */
  assetIds?: string[];
  frames: Frame[];
  order: number;
}

export interface Frame {
  id: string;
  sceneId: string;
  frameIndex: number;      // position in the story, 1..N
  shotType: ShotType | null;
  characters: string[];    // names of the cast members visible in this frame
  description: string;     // what happens in this frame
  prompt: string;          // assembled image generation prompt
  imageUrl: string | null; // path relative to public/media/
  audioUrl: string | null; // path relative to public/media/
  narration: string;       // voiceover text for this frame
  status: FrameStatus;
  error: string | null;    // last failed image/voiceover request, cleared on the next one
  /** Asset library ids explicitly linked to this frame (characters, props, the setting). Missing = not curated yet. */
  assetIds?: string[];
  metadata: FrameMetadata;
  createdAt: string;
  updatedAt: string;
}

export const SHOT_TYPES = ["establishing", "wide", "medium", "close-up", "insert", "reaction"] as const;
export type ShotType = (typeof SHOT_TYPES)[number];

export type FrameStatus = "draft" | "generating" | "ready" | "error";

export interface FrameMetadata {
  imageWidth?: number;
  imageHeight?: number;
  seed?: number;
  model?: string;
  audioDuration?: number;
  voice?: string;
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  name: string;
  type: AssetType;
  filePath: string;        // relative to public/media/
  metadata: AssetMetadata;
  createdAt: string;
}

export const ASSET_TYPES = ["character", "prop", "environment"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export interface AssetMetadata {
  triggerToken?: string;   // e.g. "BARNABY_CAT"
  description?: string;
  tags?: string[];
}

// ─── Generation Config ──────────────────────────────────────────────────────

export interface ImageGenerationConfig {
  model?: "qwen-image" | "qwen-image-edit" | "qwen-image-2.1";
  width?: number;
  height?: number;
  steps?: number;
  guidance?: number;
  seed?: number;
  loraStyle?: "couple" | "font" | "home" | "identity" | "illustration" | "portrait" | "ppt" | "sandstorm" | "sparklers" | "storyboard";
  negativePrompt?: string;
  imageEdit?: {
    imagePath: string;
    strength: number;
  };
}

export interface AudioGenerationConfig {
  voice?: string;
  speed?: number;
  audioFormat?: "wav" | "mp3" | "ogg";
}

// ─── UI State ────────────────────────────────────────────────────────────────

export interface GenerationJob {
  id: string;
  type: "image" | "audio";
  frameId: string;
  status: "queued" | "running" | "done" | "failed";
  progress: number;         // 0-100
  resultUrl?: string;
  error?: string;
}
