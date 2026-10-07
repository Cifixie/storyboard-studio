# Storyboard Studio

Turn a one-line premise into an illustrated, narrated children's storyboard. A local LLM plans the story and writes it scene by scene, a diffusion model draws each frame, and a TTS model reads the narration. Everything is editable on a scene and frame timeline.

Built with Next.js, TypeScript and SQLite. The models run locally on Apple Silicon, so there are no per-call costs and nothing leaves your machine.

<!-- Add a screenshot or GIF of the timeline editor here:
![Storyboard Studio](docs/screenshot.png) -->

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
- An OpenAI-compatible chat endpoint for the LLM. A local MLX server (the defaults assume one on port 8000) works, as does any hosted OpenAI-compatible API.
- [`mflux`](https://github.com/filipstrand/mflux) on your `PATH`, providing `mflux-generate-qwen-2.1`, `mflux-generate-qwen` and `mflux-generate-qwen-edit` (image generation; `…-2.1` is the default)
- [`mlx-audio`](https://github.com/Blaizzy/mlx-audio) on your `PATH`, providing `mlx_audio.tts.generate` (narration)

The image and voice commands are started by name, so they must be on the `PATH` of the shell that runs the dev server. If you installed them in a virtualenv, activate it first.

## Getting started

```bash
pnpm install
cp packages/client/.env.example packages/client/.env.local   # then edit
pnpm dev                                                      # http://localhost:3000
```

If `better-sqlite3` fails to load, make sure pnpm is allowed to run its build script (`pnpm approve-builds`, or check `allowBuilds` in `pnpm-workspace.yaml`).

### Configuration

All settings are environment variables, listed with their defaults in [`packages/client/.env.example`](packages/client/.env.example).

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
  client/            Next.js 15 app (App Router): UI, API routes, SQLite
    src/app/api/     stories, frames, image and TTS generation, assets, media
    src/components/  story editor, scene timeline, frame cards, asset studio
    src/lib/         LLM client, story generation, prompt composition,
                     normalisation, Zustand store, database
```

## Status

A working prototype. Not done yet:

- Cloud providers for image and voice (only the LLM can use a hosted API today)
- The interactive reader/player (synced narration, text and images)
- Audio duration detection
- Automated tests

The original design notes are in [`storyboard_studio_architecture_blueprint.md`](storyboard_studio_architecture_blueprint.md).
