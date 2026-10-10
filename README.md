# Storyboard Studio

Turn a one-line premise into an illustrated, narrated children's storyboard. A language model plans the story and writes it scene by scene, a diffusion model draws each frame, and a text-to-speech model reads the narration. Edit stories on a scene and frame timeline, then read them in the built-in player.

Built with Next.js, TypeScript, and SQLite. Image and voice generation use local MLX tools on Apple Silicon. Story planning and writing can use a local OpenAI-compatible endpoint or an optional hosted LLM. Prompts sent to a hosted endpoint leave your machine and may incur provider charges.

<!-- Add a screenshot or GIF of the editor here once a redistributable image is available. -->

## How it works

1. **Plan.** Enter a premise (and optionally a title and visual style). The LLM returns an outline: characters with a fixed visual description, and scenes, each with a place, a time and a "turn" (what changes by the end of the scene).
2. **Write.** Frames are written one scene at a time. Each request includes the full outline, how the previous scene ended and what comes next, so the story stays coherent. "Write all" runs the scenes in order and can be stopped after the current scene.
3. **Illustrate and narrate.** For every frame, the image prompt is assembled from the global art style, the frame's shot description and the fixed look of each character in the shot, so characters don't drift between images. Images and voice-over are generated per frame, and a failure is stored on that frame so it can be retried alone.
4. **Edit.** Rewrite, reorder or regenerate anything. Stories and reference assets are saved in SQLite.

Details worth knowing:

- Prompts ask for JSON with a fixed schema. Output is parsed defensively, because some models wrap JSON in prose, and truncated responses are reported with a clear error.
- Local reasoning models (e.g. Qwen3) can think for minutes, so thinking is disabled unless `LLM_THINKING=true`.
- Shot types (establishing, wide, medium, close-up, insert, reaction) are part of the data model and shape the image prompts.

## Requirements

- macOS on Apple Silicon (the image and voice tools are MLX-based)
- Node.js 20+ and [pnpm](https://pnpm.io)
- An OpenAI-compatible chat endpoint for the LLM. The default local endpoint listens on port 8000; hosted OpenAI-compatible APIs are optional.
- [`mflux`](https://github.com/filipstrand/mflux) on your `PATH`, providing `mflux-generate-qwen-2.1`, `mflux-generate-qwen`, and `mflux-generate-qwen-edit` (image generation; `…-2.1` is the default).
- [`mlx-audio`](https://github.com/Blaizzy/mlx-audio) on your `PATH`, providing `mlx_audio.tts.generate` (narration).
- The workspace allows the `better-sqlite3` native build. If installation fails because `node-gyp` is unavailable, install the Xcode Command Line Tools and ensure pnpm can resolve `node-gyp` in its build environment before retrying.

The image and voice commands are started by name, so they must be on the `PATH` of the shell that runs the dev server. If you installed them in a virtualenv, activate it first.

## Getting started

```bash
pnpm install
cp packages/client/.env.example packages/client/.env.local   # then edit
pnpm dev              # http://localhost:3000
```

## Configuration
Environment variable defaults are documented in [`packages/client/.env.example`](packages/client/.env.example).

| Variable | Purpose |
| --- | --- |
| `GENERATION_MODE` | `local` (default) or `cloud`. Cloud switches the **LLM only**; image and voice stay local. |
| `LLM_BASE_URL`, `LLM_MODEL`, `OMLX_API_KEY` | Local OpenAI-compatible endpoint |
| `CLOUD_LLM_BASE_URL`, `CLOUD_LLM_API_KEY`, `CLOUD_LLM_MODEL` | Hosted endpoint, used when mode is `cloud` |
| `LLM_THINKING` | Let local reasoning models think before answering (slow) |
| `TTS_MODEL`, `TTS_VOICE` | Narration model and voice |
| `DB_PATH`, `IMAGE_MEDIA_DIR`, `TTS_MEDIA_DIR` | Where the database and generated media are stored |
| `IMAGE_STEPS` | Image inference steps (default 20; mflux Qwen 2.1 defaults to 40). Lower is faster; higher may add detail. |
| `FRAME_IMAGE_WIDTH`, `FRAME_IMAGE_HEIGHT` | Frame resolution in pixels (default 768×432). Dimensions must be multiples of 16; fewer pixels reduce generation time. |
| `IMAGE_WIDTH`, `IMAGE_HEIGHT` | Reference/standalone image resolution (default 768×768). |
| `IMAGE_TIMEOUT_SECONDS` | Hard cap on one `mflux` spawn, in seconds (default 3600). Override for slower inference or a cold model download. |
| `HF_TOKEN` | HuggingFace token used by `mflux` for model weight downloads. Inference stays local; only the first download hits HF. |

## Project layout

```
packages/
  client/                Next.js app: UI, API routes, SQLite
    src/app/api/         stories, frames, image/TTS generation, assets, media
    src/app/play/        story reader/player
    src/components/      story editor, scene timeline, frame cards, asset studio
    src/lib/             LLM client, story generation, prompt composition,
                         normalisation, Zustand store, database
```

## Status

The app supports story planning and writing, image and narration generation, manual editing, asset linking, and a reader/player. Current limitations:
- Image and voice generation require local MLX tools on Apple Silicon; only the LLM can use a hosted provider.
- Narration duration is not detected automatically.
- Automated tests are not configured; `pnpm typecheck` checks TypeScript types.

## License

No license has been selected. Until one is added, the source remains under its default copyright; public visibility alone does not grant permission to reuse, modify, or redistribute it.
