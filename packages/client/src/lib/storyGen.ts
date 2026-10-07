import { chatJson } from "@/lib/llm";
import { normalizeStory } from "@/lib/normalize";
import { SHOT_TYPES, type Asset, type AssetType, type Character, type Frame, type Scene, type ShotType, type Story } from "@/lib/types";

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

// ─── Step 1: outline ────────────────────────────────────────────────────────

const OUTLINE_SYSTEM = `You are a professional storyboard writer for children's picture books. You plan a story as an outline. Frames are written later, one scene at a time.

Output ONLY valid JSON, no markdown. Structure:
{
  "title": "Story title",
  "synopsis": "One-paragraph summary of the whole story",
  "style": "Visual style, e.g. 'warm watercolor storybook illustration'",
  "characters": [
    { "name": "Name", "description": "Fixed look: species or age, colors, clothing, distinctive features" }
  ],
  "props": [
    { "name": "Name", "description": "Fixed look: material, shape, color" }
  ],
  "scenes": [
    {
      "title": "Scene title",
      "description": "What the character wants in this scene and what stands in the way (1-2 sentences)",
      "place": "Where it happens, short",
      "time": "When it happens, 1-3 words",
      "turn": "What is different by the end of the scene"
    }
  ]
}

Rules:
- 4-6 scenes, unless the premise asks for a number.
- A scene is one place at one time. If either changes, start a new scene.
- "turn" is a change in a feeling, a discovery, or a new situation. It must differ from how the scene began.
- Plan "time" as one timeline across the story. Each scene's time follows the previous one's (for example "Evening", "Late that night", "Dawn"). Do not give every scene the same time unless the whole story is one moment.
- "characters" lists every named or recurring character. Descriptions are purely visual because they are pasted into image prompts, and they never change between scenes.
- "props" lists prominent items the plot hinges on (a letter to deliver, a key, a lantern). Only items that matter to the story, not every object mentioned. Descriptions are purely visual, like the characters'.`;

export async function generateOutline(
  premise: string,
  hints: { title?: string; style?: string }
): Promise<Story> {
  const user = [
    `Premise: ${premise}`,
    hints.title && `Use this title: ${hints.title}`,
    hints.style && `Use this visual style: ${hints.style}`,
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await chatJson(OUTLINE_SYSTEM, user, 6000);
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) {
    throw new Error("The model returned no scenes.");
  }

  const now = new Date().toISOString();
  const characters: Character[] = (Array.isArray(raw.characters) ? raw.characters : [])
    .map((c: Record<string, unknown>) => ({ name: text(c?.name), description: text(c?.description) }))
    .filter((c: Character) => c.name);

  const props: Character[] = (Array.isArray(raw.props) ? raw.props : [])
    .map((p: Record<string, unknown>) => ({ name: text(p?.name), description: text(p?.description) }))
    .filter((p: Character) => p.name);

  const scenes: Scene[] = raw.scenes.map((s: Record<string, unknown>, i: number) => ({
    id: `scene-${i + 1}`,
    title: text(s?.title) || `Scene ${i + 1}`,
    description: text(s?.description),
    place: text(s?.place),
    time: text(s?.time),
    turn: text(s?.turn),
    frames: [],
    order: i,
  }));

  return normalizeStory({
    id: crypto.randomUUID(),
    title: hints.title || text(raw.title) || "Untitled story",
    synopsis: text(raw.synopsis),
    style: hints.style || text(raw.style),
    characters,
    props,
    scenes,
    createdAt: now,
    updatedAt: now,
  });
}

// ─── Step 2: frames for one scene ───────────────────────────────────────────

const FRAMES_SYSTEM = `You are a professional storyboard writer for children's picture books. You write the frames for ONE scene of an existing story. A frame is a single image with narration.

Output ONLY valid JSON, no markdown. Structure:
{
  "frames": [
    {
      "shotType": "establishing | wide | medium | close-up | insert | reaction",
      "description": "What happens visually in this frame",
      "characters": ["Names of cast members visible in this frame"],
      "prompt": "Image prompt for this single frame",
      "narration": "Voiceover for this frame"
    }
  ]
}

Rules:
- 3-6 frames.
- The first frame is "establishing" or "wide" and shows the place and time. Use "close-up", "insert" or "reaction" to emphasize an important moment, then go back to a wider shot.
- The last frame shows the scene's turn.
- "prompt": start with the framing of the shot type (for example "Close-up of ..."), name the place and the time of day, then describe the action, composition, lighting and mood. Refer to characters and prominent props by name only. Their appearance and the art style are added automatically, so do not describe them.
- "narration": 1-2 child-friendly sentences. Continue from the previous scene without repeating it.
- Keep the place, time and cast consistent with the scene brief.`;

function sceneLine(s: Scene, i: number) {
  return `${i + 1}. ${s.title} (${s.place || "unknown place"}, ${s.time || "unknown time"}). ${s.description} Turn: ${s.turn}`;
}

export async function generateFrames(story: Story, sceneIndex: number): Promise<Frame[]> {
  const scene = story.scenes[sceneIndex];
  const previous = story.scenes[sceneIndex - 1];
  const next = story.scenes[sceneIndex + 1];
  const lastFrame = previous?.frames[previous.frames.length - 1];

  const user = [
    `Story: ${story.title}`,
    `Synopsis: ${story.synopsis}`,
    story.characters.length &&
      `Cast:\n${story.characters.map((c) => `- ${c.name}: ${c.description}`).join("\n")}`,
    (story.props?.length ?? 0) &&
      `Props:\n${story.props.map((p) => `- ${p.name}: ${p.description}`).join("\n")}`,
    `Scene outline:\n${story.scenes.map(sceneLine).join("\n")}`,
    previous &&
      `Previous scene ended: ${previous.turn}${lastFrame ? ` Its last narration: "${lastFrame.narration}"` : ""}`,
    next && `Next scene: ${next.title} (${next.place}, ${next.time})`,
    `Write the frames for scene ${sceneIndex + 1}: ${scene.title}\nPlace: ${scene.place}\nTime: ${scene.time}\nWhat happens: ${scene.description}\nTurn: ${scene.turn}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await chatJson(FRAMES_SYSTEM, user, 6000);
  if (!Array.isArray(raw.frames) || raw.frames.length === 0) {
    throw new Error("The model returned no frames for this scene.");
  }

  const now = new Date().toISOString();
  const cast = new Map(story.characters.map((c) => [c.name.toLowerCase(), c.name]));

  return raw.frames.slice(0, 8).map((f: Record<string, unknown>, j: number): Frame => {
    const names = (Array.isArray(f?.characters) ? f.characters : [])
      .map((n) => cast.get(text(n).toLowerCase()))
      .filter((n): n is string => Boolean(n));
    return {
      id: `${scene.id}-frame-${j + 1}`,
      sceneId: scene.id,
      frameIndex: 0, // numbered across the story by normalizeStory
      shotType: SHOT_TYPES.includes(f?.shotType as ShotType) ? (f.shotType as ShotType) : null,
      characters: [...new Set(names)],
      description: text(f?.description),
      prompt: text(f?.prompt),
      imageUrl: null,
      audioUrl: null,
      narration: text(f?.narration),
      status: "draft",
      error: null,
      metadata: {},
      createdAt: now,
      updatedAt: now,
    };
  });
}

// ─── Image prompt ───────────────────────────────────────────────────────────

/**
 * Style + the frame's prompt + the fixed look of every explicitly linked asset:
 * linked character/prop assets (description and `[TRIGGER]` token) and the scene's
 * linked environments as `Setting:` lines. Unlinked cast members fall back to the
 * story's own text, so a story never loses its baseline when assets are unrelated.
 */
export function composeImagePrompt(story: Story, frame: Frame, assets: Asset[] = []): string {
  const byId = new Map(assets.map((a) => [a.id, a]));
  // Scene links (usually the environment) apply to every frame in the scene;
  // frame links win for the same asset id.
  const scene = story.scenes.find((s) => s.id === frame.sceneId);
  const linkedIds = new Set([...(scene?.assetIds ?? []), ...(frame.assetIds ?? [])]);
  const linked = [...linkedIds].map((id) => byId.get(id)).filter((a): a is Asset => Boolean(a));

  const describe = (name: string, description: string | undefined, token: string | undefined) => {
    const text = description?.trim() ?? "";
    const tok = token?.trim() ?? "";
    return text ? `${name} is ${text}${tok ? ` [${tok}]` : ""}` : name;
  };

  // Resolve each frame character through three tiers:
  //   1. Frame-level explicit asset link with a matching name
  //   2. Story-level characterAssetIds mapping
  //   3. Story.characters description fallback
  // Deduplicate: same asset id emits only once even when resolved at multiple scopes.
  const seenAsset = new Set<string>();
  const cast = frame.characters
    .map((name) => {
      // Tier 1: frame-level link
      const frameAsset = frame.assetIds
        ?.map((id) => byId.get(id))
        .find((a) => {
          if (!a) return false;
          return a.type === "character" && a.name === name;
        });
      if (frameAsset && !seenAsset.has(frameAsset.id)) {
        seenAsset.add(frameAsset.id);
        return describe(frameAsset.name, frameAsset.metadata.description, frameAsset.metadata.triggerToken);
      }
      // Tier 2: story-level assignment
      const storyAssetId = story.characterAssetIds?.[name];
      const storyAsset = storyAssetId ? byId.get(storyAssetId) : undefined;
      if (storyAsset && !seenAsset.has(storyAsset.id)) {
        seenAsset.add(storyAsset.id);
        return describe(storyAsset.name, storyAsset.metadata.description, storyAsset.metadata.triggerToken);
      }
      // Tier 3: story description fallback
      const fallback = story.characters.find((c) => c.name === name);
      if (fallback) return describe(fallback.name, fallback.description, undefined);
      return null;
    })
    .filter((s): s is string => Boolean(s && s.trim()));
  const castPart = cast.length ? `Characters: ${cast.join(". ")}` : "";

  const props = linked
    .filter((a) => a.type === "prop")
    .map((a) => describe(a.name, a.metadata.description, a.metadata.triggerToken))
    .filter((s) => s.trim());
  const propPart = props.length ? `Props: ${props.join(". ")}` : "";

  const settings = linked
    .filter((a) => a.type === "environment" && a.metadata.description?.trim())
    .map((a) => `Setting: ${a.metadata.description!.trim()}`);

  const sentence = (s: string) => (/[.!?]$/.test(s) ? s : `${s}.`);
  const parts = [
    story.style && !frame.prompt.includes(story.style) ? story.style : "",
    frame.prompt,
    castPart,
    propPart,
    ...settings,
  ];
  return parts.filter(Boolean).map(sentence).join(" ");
}
