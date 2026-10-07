# Story-level Character Asset Linking

## Goal

Link a story's recurring characters to library assets once, then include each
linked character asset in image prompts for every frame whose `characters` list
contains that character. Keep scene-level setting links and frame-level links for
local exceptions and non-character assets.

## Current behavior

- `Story.characters` stores names and visual descriptions; it has no asset mapping.
- `Scene.assetIds` apply to all frames in that scene. The scene picker currently
offers `environment` assets.
- `Frame.assetIds` apply only to that frame. The frame picker currently offers
`character` and `prop` assets.
- `composeImagePrompt` uses explicitly linked character assets only when their
name exactly matches a name in `frame.characters`; otherwise it falls back to
`Story.characters` text. There is no automatic character-to-asset lookup.
- Links are asset IDs and are pruned against the asset library by
`normalizeStory` when stories are read.

## Proposed behavior

Add a story-level mapping from character identity to a character asset ID. In the
story editor, let the user assign or clear a library character asset for each
story character. During prompt composition, for each name in `frame.characters`,
resolve its character asset in this order:

1. An explicit frame-level character asset link with a matching name, if present.
2. The story-level asset assignment for that character, if present.
3. The existing `Story.characters` description fallback.

Scene-level environment links continue to apply to every frame in that scene;
frame links continue to be local to one frame and retain their existing behavior
for props. Avoid linking a character asset at scene scope implicitly: frame
membership is the source of truth for character presence.

## Work plan

### 1. Define the story mapping

- Extend the story model with an optional mapping from story character name to
  library asset ID. Optional keeps existing persisted stories readable.
- Normalize the mapping by removing entries whose asset ID no longer exists.
- Keep old stories unchanged until a user assigns an asset; preserve current
  description fallback for unmapped characters.
- Decide and implement the matching policy for character renames. Prefer a
  stable character ID if the story model already gains one; otherwise make name
  changes update the mapping as part of the same edit. Do not silently match by
  approximate name.

### 2. Add assignment controls

- Add per-character asset assignment in the story editor, drawing candidates
  from library assets of type `character`.
- Show the current assignment and allow clearing or replacing it.
- Persist the assignment with the story using the existing story mutation/save
  path; refresh the editor state from the returned story.
- Do not add a separate story-global list of active characters: the existing
  story cast is already the canonical set.

### 3. Compose prompts from assignments

- Resolve each `frame.characters` entry to its assigned asset and use its
  description and trigger token, even if that asset was not also placed in
  `frame.assetIds`.
- Keep exact frame-name membership as the gate, so a character assigned at the
  story level is included only in frames where it appears.
- Preserve explicit frame asset behavior. If explicit frame links can conflict
  with story assignments, define and implement deterministic precedence; the
  proposed rule is frame-level matching assignment wins over story-level
  assignment.
- Deduplicate assets when the same ID appears in multiple scopes; do not emit
  duplicate character prompt text.

### 4. Handle lifecycle and consistency

- Removing an asset clears/prunes story mappings as well as scene/frame links.
- Reassigning a character changes subsequent generated prompts without changing
  frame membership.
- Existing prompts continue to use the story description when no valid mapping
  exists.
- Ensure normal save, load, and story generation paths retain mappings. Newly
  generated stories start with no asset assignments unless the user assigns
  them afterward.

## Acceptance criteria

- A character can be assigned a character asset once at story scope.
- For a frame containing that character by name, image prompt composition uses
  the assigned asset description and trigger token without requiring a per-frame
  link.
- Frames that do not list the character do not get that character's asset text.
- Unassigned characters retain the existing story-description fallback.
- A frame-level explicit character link overrides the story mapping for that
  frame only; other frames continue using the story assignment.
- Deleting an assigned asset does not leave a dangling mapping or break story
  loading; prompt composition falls back to the story character description.
- Scene environment links and frame prop links continue to work as before.
- Assignment UI supports assign, replace, and clear, and persists through reload.

## Out of scope

- Automatically matching library assets to story characters by approximate
  names, trigger tokens, or generated text.
- Story-scope prop or environment assignments.
- Changing how frame character membership is authored or generated.
- Migrating existing frame links into story-level assignments automatically.

## Open implementation choice

The current `Character` model has no stable ID; frame membership and prompt
composition use exact names. Before implementation, either introduce persistent
character IDs and migrate/resolve existing frame-name references, or key the
assignment map by exact character name and ensure character renames update the
map. Do not combine both identity systems without a migration rule.
