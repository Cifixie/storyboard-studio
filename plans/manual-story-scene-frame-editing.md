# Manual Story, Scene, and Frame Editing

## Goal

Let users create and maintain a complete story without requiring LLM calls, while
keeping optional prompt-driven generation and revision available in the editor.
Manual edits must be predictable, persist immediately, and clean up media when
content is removed or changed.

## Current behavior

- Stories are created through `POST /api/stories`, which requires a prompt and
  calls `generateOutline`. There is no blank-story path.
- The story editor displays scenes and a cast summary. Scene fields and frame
  fields have no manual edit forms.
- `POST /api/stories/[id]/scenes/[sceneId]/frames` generates or replaces the
  frames of a scene. There are no frame create, update, or delete operations.
- Scene ordering and frame ordering follow array order. There are no reorder
  controls or dedicated reorder mutation.
- `Story`, `Scene`, and `Frame` are persisted as story JSON in SQLite. Generated
  frame images and audio are files under `public/media`; deleting a story removes
  its frame media.
- Scene/frame asset links and generation state are attached to these records.
  Rewrites can replace frames and their generated media references.

## Product behavior

### Manual authoring without LLM

- Allow creating a blank story with user-supplied title and optional style; do
  not call an LLM to create it. It starts with empty cast, props, and scenes.
- Allow creating scenes manually with editable title, description, place, time,
  and turn fields. Allow editing these fields while the scene has no frames.
- Disallow scene edits once it has one or more frames. Require the user to remove
  the frames first; do not silently rewrite or invalidate them as a side effect.
- Allow creating, editing, and removing frames manually. The frame editor covers
  frame prompt, description, narration, shot type, and character membership.
  Generated output fields (image/audio URLs, metadata, status, errors, timestamps)
  are managed by the system, not editable form fields.
- Allow removing scenes and frames. Removing a scene removes its child frames
  from story data and removes all media files owned by those frames.
- Allow rearranging scenes in a story and frames within their scene. Provide
  reorder dialogs/modals rather than inline drag handles or noisy controls.
  Persist array order and recompute all derived frame numbering and scene IDs as
  appropriate; do not change stable IDs just to reorder records.
- Reordering must preserve scene/frame contents and media. It must not trigger
  LLM calls or regenerate assets.

### Prompt-assisted generation and revision

- Add a prompt input in the UI to request a new scene or frame. Requests target a
  specific story or scene and create content without replacing unrelated records.
- Add a prompt-assisted edit action to modify the selected scene or frame. Show
  the proposed changes for user review before applying; retain an explicit
  cancel path and never silently replace existing content.
- Prompted frame edits and manual frame edits both invalidate that frame's old
  generated image: remove the old image file, clear image URL and image metadata,
  and return its image status to draft. Preserve narration/audio unless that
  field itself changes; when narration changes, remove the old audio and clear
  audio metadata/URL too.
- Prompting a new frame must create one frame without rewriting neighboring
  frames. Prompting a new scene must add a scene without replacing the story or
  other scenes.
- Do not make LLM use a prerequisite for any create, edit, delete, or reorder
  operation.

## UI constraints

- Edit and reorder flows for scenes and frames use modal dialogs. Do not add
  inline editing, always-visible per-field controls, or inline drag handles.
- Keep primary scene/frame reading surfaces quiet. Put destructive operations
  behind a confirmation that names the affected item and warns about removed
  generated media where applicable.
- Use the existing story and scene panels where possible; blank-story creation
  should be discoverable alongside LLM-assisted story creation.

## Persistence and cleanup invariants

- Every manual mutation is saved to the database and reflected in the open
  Zustand story state and story library summary. Reloading the story reproduces
  the same content and order.
- Deleting a scene cascades to all its frames and each frame's image and audio
  files. Database changes and file cleanup must not leave live records pointing
  at removed files or orphan files owned by deleted records.
- Deleting a frame removes its image and audio files and clears the frame from
  the persisted story. Recompute story-wide `frameIndex` values after add,
  delete, or reorder.
- Editing a frame's image-relevant prompt, description, character list, or shot
  type removes its previous image and clears image metadata. Editing narration
  removes its prior audio only when narration actually changes.
- Coordinate deletion/edit operations with in-flight generation so a late job
  cannot restore media or write a result onto a deleted or superseded frame.
- Reuse existing media path safety and story mutation conventions. File cleanup
  errors must be surfaced/logged consistently; database state must not claim a
  removed file is still current.

## Work plan

### 1. Establish mutation and media lifecycle primitives

- Add server-side story mutation operations for scene/frame create, edit, delete,
  and reorder, validating target IDs and parent-child relationships.
- Centralize frame media cleanup and invalidation, including images, audio, and
  relevant metadata. Ensure path handling uses the existing `media` helper.
- Ensure frame indexes are derived from scene/frame order and normalized after
  any structural operation.
- Prevent stale in-flight generation from committing to a frame after that
  frame is deleted or its prompt-relevant content changes. Define a revision or
  equivalent concurrency check before enabling destructive mutations during
  generation.

### 2. Add blank story and manual editing flows

- Add a blank-story creation endpoint and UI path that does not invoke
  `generateOutline`.
- Add modal create/edit forms for scenes and frames. Persist forms through the
  new mutation operations and refresh/apply the returned story.
- Enforce the no-scene-edit-when-frames-exist rule on both client and server.
- Add confirmation-backed remove actions and modal-based scene/frame reorder
  flows.
- Keep create/edit/delete/reorder usable when the LLM provider is unavailable.

### 3. Add prompt-assisted generation and revision

- Add separate prompted create operations for a scene and a frame. Scope each
  request to its parent story/scene and append the result without replacing
  existing content.
- Add prompted edit operations for selected scenes and frames. Return a proposed
  patch for review, then apply only after explicit confirmation.
- Route accepted frame changes through the same invalidation and media cleanup
  rules as manual edits.
- Preserve scene edit restrictions when a scene has frames; prompting must not
  bypass the restriction.

## Acceptance criteria

- A user can create a blank story and add/edit/remove/reorder scenes without any
  LLM request.
- A user can add/edit/remove/reorder frames within scenes without any LLM
  request.
- Scene and frame edits and reorder interactions are modal, not inline.
- Scene edits are rejected while frames exist, including when invoked through
  the API rather than the UI.
- Removing a scene removes its frames and their image/audio files.
- Removing a frame removes its image/audio files and updates persisted frame
  ordering/indexes.
- Editing image-relevant frame fields clears and deletes the previous image;
  changing narration clears and deletes the previous audio.
- Prompted scene/frame creation adds only the requested record and leaves
  unrelated scenes/frames intact.
- Prompted edits show a reviewable proposal and require explicit application.
- Reorder operations preserve content and generated media while updating order
  and frame numbering.
- A late generation result cannot resurrect deleted media or overwrite a newer
  edit.
- Manual authoring still works when LLM calls fail or are unavailable.

## Deferred: story continuity invalidation

Editing a scene may make later scenes or frames inconsistent (for example, a
character joins the party and is then omitted later). Do not implement automatic
continuity reevaluation or an `invalidated` flag in this work. Keep this as a
follow-up design question: what scope becomes stale after a scene edit, how is
staleness shown, and should the system use a per-record invalidation flag or a
review workflow? Scene editing is currently disallowed once frames exist, which
limits immediate downstream inconsistency; revisit this question if that rule
changes or cross-scene edits are introduced.

## Out of scope

- Automatic continuity repair or regeneration of later scenes/frames after edits.
- Inline editing and drag-and-drop reordering.
- Editing generated image/audio files directly in the scene/frame forms.
- Rewriting all frames when adding one prompted frame.
- Silently removing or regenerating media after an edit without user-visible
  consequences.
