# Gotchas

Things that cost real debugging time in this project. Read before touching image
generation, assets, or the mflux pipeline. Every claim is tagged:
`[run]` = verified by execution this session, `[code]` = read from source, never
run, `[inferred]` = best available reasoning, not demonstrated.

## mflux binaries

- **The qwen mflux binaries silently ignore [run] `--model` for qwen variants.**
  `mflux-generate-qwen --model qwen-image-2.1` runs happily and downloads
  `Qwen/Qwen-Image-2512` anyway (verified live, 2026-10-05). `--model` is only
  real for cross-family names (`krea-2`, `dev`, `schnell`, …). **Pick the
  binary, not the flag** — that's why `app/api/image/generate/route.ts` has
  `BINARY_BY_MODEL` instead of passing `--model` through.

- **Binary → default repo → disk footprint:**

  | Binary | Default repo | Full weights | Notes |
  |---|---|---|---|
  | `mflux-generate-qwen-2.1` | `Qwen/Qwen-Image-2.1` | 28 files (total size unmeasured) | **route default** |
  | `mflux-generate-qwen` | `Qwen/Qwen-Image-2512` | ~58 GB pull, 20 files | not needed unless asked |
  | `mflux-generate-qwen-edit` | `Qwen/Qwen-Image-Edit-2509` | ~58 GB | takes `--image-paths` (plural) |
  | `mflux-generate-qwen-2.1 --image ref.png [strength]` | — | — | init-image form; **this** is the asset-embedding path (the repo is warm) |
- **Spawn cap:** [code] `runSpawn` defaults to 300 s; raise via `config.timeoutSeconds`
  or `IMAGE_TIMEOUT_SECONDS` in `.env.local`. A cold multi-GB download cannot
  finish inside 300 s — either raise the cap or pre-warm the cache once by
  running the binary by hand (HF resumes partial downloads, so nothing is lost
  except patience).

## HuggingFace auth

- **`HF_TOKEN` only authorizes/downloads weights. Inference is local MLX.** `[run]`
  Nothing about adding a token makes mflux a cloud tool.

- **Where `huggingface_hub` (1.x) actually reads the token:** `HF_TOKEN` env,
  else `HF_HOME/token` = `~/.cache/huggingface/token` (verified in mflux's own
  venv, `constants.py:250-257`). `[code]` There is **no**
  `~/.config/huggingface/token` convention. Two ways to land the token, with
  different restart semantics: **token file** → read at call time by the spawned
  process, no server restart needed `[run]`; **`HF_TOKEN` in
  `packages/client/.env.local`** → the spawn inherits the Next server's env and
  Next loads `.env.local` only at boot, so the dev server MUST be restarted
  (`route.ts` itself never reads `HF_TOKEN`). `[run]`

- **Every mflux spawn contacts HF for revision/metadata, even with a warm
  cache** — `snapshot_download` runs each time; it only short-circuits the
  payload blobs, not the Hub check. `[code]` So auth matters on every
  generation, not just the first download.

- **Symptom of a missing/stalled token:** the route's error is
  `mflux-generate-qwen failed (exit null): Fetching 20 files: 0%` — `exit null`
  = SIGKILLed by the spawn timeout, `0%` after minutes = stalled auth, not slow
  network. `[run]` With a valid token the same fetch completes (2512's 20 files
  took ~8 min; direct `snapshot_download` resumes `.incomplete` blobs in
  seconds).

- **Don't trust `du` on the HF cache** [run] — snapshot symlinks double-count, and
  `.incomplete` blobs inflate the number. Judge cache completeness by
  `find .../blobs -name '*.incomplete'` and by an actual run, not by size.

- Gated-repo probe behavior: [run] `curl https://huggingface.co/...` with a bad/absent
  license acceptance answers **401**; a valid token answers 307 (redirect to
  CDN) on resolve endpoints. `whoami-v2` returning 200 is the cheap
  "token works" check.

## Assets & generation (updated 2026-10-06)

- **Assets link to stories explicitly now.** [code] `Frame.assetIds`/`Scene.assetIds`
  (optional arrays, JSON-blob stories — no SQL migration), persisted via
  `PATCH /api/stories/[id]`; `composeImagePrompt` composes only from linked assets,
  falling back to the story's own cast text when a frame has none. Name-matching and
  the prop prose-regex (`mentioned()`) were deleted (commit `9340432`).

- **Assets no longer reference prompts implicitly.** The old "curation library only"
  note above is historical; links are the single channel. Deleting an asset prunes
  dangling `assetIds` at read time (`normalizeStory`).

- **Thumbnails gate was character-only; fixed 2026-10-06** (`6e7e123`): any asset with a
  `filePath` renders its image.

- **Duplicate `(type, name)` assets are now rejected** (2026-10-06, commit `260de1f` + `d205f23`):
  the API answers **409** and a UNIQUE index enforces it at the DB level, so races can't
  slip a duplicate past the guard.

- **Frame rewrite resets `assetIds` to `[]`** [code] — `scene.frames = frames` in
  `scenes/[sceneId]/frames/route.ts:25` replaces the whole frame array, so explicit asset
  links are lost on "Rewrite frames" and must be re-linked afterwards.

## Testing this app

- **No test suite exists.** [run] Verification = run the real thing: curl the API on
  :3000, read `data/storyboard.db`, POST a story and wait out the LLM (~1 min
  per scene/plan). `tsc --noEmit` catches types only — the interesting bugs in
  this repo have all been runtime/behavioral.

- **React controlled inputs defeat automation [run] `fill()`-style DOM writes** that
  don't dispatch a trusted input event: the DOM shows the text, React state
  stays `""`, submit fails with "Give it a name." and the form "clears" on
  re-render. When driving the UI, set values via the native setter +
  `dispatchEvent(new Event("input", {bubbles:true}))`, and verify React state
  through effects (`/api/assets`), never through DOM text.

- **`evaluate` on the browser surface [run] is synchronous-only**; async in-page work
  needs the tab-runtime `run`, which caps at ~30 s per call. Keep probe cells
  small and stateless.

## Concurrency & persistence

- **Two concurrent story/frame writes can clobber each other** [inferred] — the API routes
  read-modify-write the whole story row. Serialize multi-scene frame writes
  (chain requests, don't parallelize them).

- **Nothing reclaims generated frame images.** [code] `media.remove` runs only when
  deleting an asset with a `filePath`. Deleting a story leaves its
  `img-*.png`/`edit-*.png` files in `public/media/` forever, and image
  generation writes into the media **root** (not the `characters/`/`props/`/
  `environments/` subfolders assets use). Budget for orphaned files.

- **`better-sqlite3` needs pnpm build approval** [code]+[run] (`pnpm approve-builds` /
  `allowBuilds` in `pnpm-workspace.yaml`) or the server 500s on every DB read.
