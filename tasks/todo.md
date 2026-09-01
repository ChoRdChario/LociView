# LociView active work

> Baseline checkpoint: `0bcb63652e93294007baaf6e40174c328502fe18` on
> `g0-baseline` (2026-08-31). Frozen-v1 -> native is accepted; the direct
> LociMyu receiver is complete, and its consolidated Desktop/iPhone product
> acceptance follows the active Caption-overlay slice below.
>
> The completed task ledger through `d32a6a0` is preserved at
> `docs/history/task-ledger-through-d32a6a0.md`. This file contains only the
> active delivery boundary, open decisions and non-blocking backlog.

## Consolidated native Product Owner acceptance

- [x] Desktop: exact-tree native route opened and the consolidated product flow
  was exercised, including visible GS rendering and the selected-Asset gizmo.
- [x] iPhone 14 Pro: the same consolidated native acceptance completed without
  a reported blocker.
- [x] The initial transform-gizmo target regression found during acceptance was
  fixed in `a2708cf`; typecheck/builds and focused checks passed, and the full
  suite's one unrelated timeout passed on immediate isolated rerun. Desktop
  visual confirmation passed before the physical-iPhone confirmation.
- [x] P0: none.
- [x] P1: none.
- [x] Classify this checkpoint as `CONSOLIDATED NATIVE ACCEPTANCE: PASS` without
  claiming G0, G0-S, G1, permanent renderer adoption or release approval.

## Completed native product boundary

The current native LociView path now supports, as one bounded product flow:

- project creation and ordinary home/open in explicit View or Edit mode;
- project-scoped single-writer locking, read-only fallback and durable reload on
  lock handoff;
- multiple independent Mesh, Graphdeco GS and ordinary Point Assets in one
  Project coordinate system;
- per-Asset visibility and independent position, rotation and uniform scale;
- explicit GS-to-Interaction-Proxy binding, Asset-specific picking and
  Asset-local Caption `positionAsset`;
- multiple Caption creation, selection, editing, search/filter and bounded
  deletion, plus Saved Views;
- Asset addition, replacement and guarded deletion;
- project snapshot save, close and completely offline reopen;
- streamed `.lociview` backup, local deletion, restore and offline reopen;
- native-only lazy Spark loading without loading the Spark chunk on the ordinary
  v1 route.

Mesh-only, GS-only and mixed display remain visibility combinations, not schema
modes. Compare remains outside the MVP/release critical path. Native LociView
project data is the durable source of truth; LociMyu is a read-only legacy input
path whose source is never overwritten.

## Completed critical path — first native migration

- [x] Inspect the existing frozen-v1 readers, LociMyu adapters, `ImportPlan`,
  native snapshot and storage boundaries without implementing migration.
- [x] Select opened frozen-v1 -> new native as the first input lane. The checked-in
  representative v1 package can use the existing validated import/open path;
  direct package conversion would duplicate that boundary. LociMyu remains a
  separate second adapter.
- [x] Keep the original v1 package/LociMyu ZIP outside the converted native
  project. The source remains read-only and the first converter emits an
  accounting report; it adds no automatic source copy or review sidecar.
- [x] Reproduce the concrete receiver gap with the representative v1 fixture:
  two DisplaySets, set-scoped material state, set views, image attachment and an
  unplaced Caption have no complete native snapshot-v1 destination today.
- [x] Verify the bounded implementation plan with the Product Owner. First add
  only the usable native receiver required by that input (DisplaySet,
  set-scoped Mesh appearance, Caption membership/media and unplaced Caption),
  then convert one opened frozen-v1 project end-to-end.
- [x] Keep snapshot v1 additions optional/defaultable, following the existing
  `savedViews` / `hiddenAssetIds` precedent. Image bytes require portable
  package v2, which the Product Owner approved; import remains dual-read v1/v2
  and media-free exports may remain v1.
- [x] Implement the native receiver: DisplaySet membership, exact set-scoped
  Mesh appearance, unplaced Captions and project-local Caption image media.
- [x] Implement the opened frozen-v1 -> new native converter and explicit
  accounting report for one representative fixture without changing the source.
- [x] Independent review: no open P0/P1 after fail-closed source-lock,
  DisplaySet-relation, media-closure, MIME and full-report fixes.
- [x] Desktop end-to-end: representative frozen-v1 import -> Edit open -> new
  native conversion -> DisplaySet/Caption/image use -> save/reopen -> portable
  backup/delete/restore passed Product Owner confirmation.
- [x] Final automated tree: typecheck and both production builds passed. The
  full suite passed 1,370 tests; two fixture suites failed only because their
  provenance specification was not yet indexed and passed 53/53 after staging,
  while one existing 5-second CLI timeout passed alone in 0.83 seconds.
- [x] Physical iPhone 14 Pro minimal smoke: `.lociview` restore,
  DisplaySet switching, Caption list/selection, migrated image display, save
  and completely offline reopen all passed Product Owner confirmation.
- [x] Classify the first bounded input lane as `FIRST NATIVE MIGRATION: PASS` at
  production commit `9d973cd8f84e14cc1d72562a01034754e3a1ed42`, with no
  unresolved P0/P1. Stop before the separate LociMyu adapter.

Required conversion invariants:

- frozen v1 to native and LociMyu ZIP to native are distinct input adapters;
- input is read-only and conversion never overwrites the source;
- the converted native project becomes the new durable source of truth;
- reuse canonical LociMyu Caption identity and duplicate-retention behavior;
- unknown/unrepresentable source data is reported rather than guessed away.
- DisplaySet remains Caption membership + set-scoped material appearance + an
  optional Saved View; it never owns Asset visibility or transforms.

## Completed direct LociMyu ZIP -> native adapter

- [x] Product Owner approved the bounded direct adapter and the
  `LM-ADAPT-*` acceptance in `docs/specs/04-locimyu-conversion.md`.
- [x] Select one private representative outer ZIP read-only and record its path,
  bytes, SHA-256, workbook/model/media inventory without copying it into the
  repository or build.
- [x] Replace the superseded device-local sidecar requirement with the
  separately retained original ZIP plus exportable conversion report. Add no
  sidecar, quarantine/review database or portable review continuity.
- [x] Implement one direct in-memory LociMyu projection into the existing native
  receiver. Do not persist an intermediate v1 workspace or activate ordinal,
  first/last, case-folded or fuzzy relationships.
- [x] Preserve every otherwise-valid non-empty Caption occurrence with
  `locimyu-caption-id-2`; block before publication on identity
  impossibility/collision and report every converted, inactive/unlinked or
  blocking item.
- [x] Reuse verified binary/media writes, snapshot-last/marker-last publication,
  project write lock and portable package; verify the source ZIP unchanged.
- [x] Run one independent migration/input review and focused checks. The review
  found no remaining implementation P0/P1.
- [x] Run the final typecheck/full test/build matrix once on the completed tree.
- [x] Historical pre-correction private representative preflight found 109 non-empty
  Caption rows and stopped before publication because six rows on
  `モデル確認用（透過）` lack stable legacy IDs; all six are reported, converted
  counts are zero and the source hash is unchanged.
- [x] Classify that pre-correction result as `FIRST LOCIMYU NATIVE ADAPTER: RETRY`.
  Converted-project Desktop/iPhone and portable-restore acceptance cannot run
  and are not inferred while no Project is published.

The earlier source-correction requirement is superseded by the Product Owner
decision below. The private source must remain unchanged.

## Completed approved correction — ID-less Caption rows are empty input

- [x] Product Owner confirmed that the representative six-row condition is a
  valid real-world case and approved treating such rows as empty.
- [x] Freeze the narrow rule before implementation: only a Caption row whose
  legacy-ID cell is empty after `LociMyuTrimV1` is skipped and reported. Invalid
  non-empty IDs, duplicate canonical keys and digest collisions still block.
- [x] Implement the direct-adapter projection without changing source bytes,
  guessing an ID or shifting later Caption row/attachment/position alignment.
- [x] Update the focused regression from blocked publication to one valid
  Caption plus two explicitly reported/skipped ID-less rows.
- [x] Rerun the one private representative through publication and portable
  restore: 109 source rows produced 103 Captions, all six skipped rows were
  explicit, no Representation/media was missing after restore, and source
  byte/hash identity held.
- [x] Complete one independent review and the final matrix. The review's one P1
  source-retention notice was fixed and re-reviewed; no P0/P1 remains.
- [ ] Complete the approved Caption overlay slice below, then request one
  resulting bounded Desktop/iPhone product acceptance for the direct LociMyu
  result.

## Completed bounded receiver closure — native Caption and material appearance

- [x] Confirm the current native renderer uses one fixed Asset-local Caption
  marker radius and has no native pin-size control or durable pin-scale field.
- [x] Product Owner rejected the narrow `0.3`–`3.0` slider: model-authoring
  units can differ by roughly two orders of magnitude, so numeric and wide-range
  slider input are both required.
- [x] Confirm native Caption color is already converted, validated and portable,
  but the native renderer ignores it and the native editor has no color control.
- [x] Product Owner confirmed a logarithmic `0.001`–`1000` multiplier
  slider plus synchronized positive numeric input for the selected Asset.
- [x] The initial receiver audit found the Caption color/pin-scale gap. Product
  Owner visual acceptance then exposed a separate P1 in the direct material
  adapter; the native material receiver itself already exists.
- [x] Record the compatibility boundary: optional/defaultable `pinScale` on
  native Asset in snapshot v1, omission means `1`, portable package unchanged.
- [x] Render and edit the existing per-Caption `color` without changing Caption
  schema or package version. Preserve source color; show selection/review state
  through scale/emphasis rather than replacing it with a fixed color.
- [x] Persist and render per-Asset `pinScale`, preserve it across Asset
  replacement and map valid frozen-v1 values into the native Asset.
- [x] Add field-level report entries for non-durable view/sheet-registry
  timestamps; do not create native history records.
- [x] Do not add per-Caption pin size, screen-space marker architecture,
  per-view appearance or generalized styling state in this slice.
- [x] Add only the focused clamp/render wiring coverage genuinely missing from
  existing acceptance, then run typecheck, full test and production build once.
- [x] Product Owner confirmed native Caption color and pin scale visually.
- [x] Trace the material P1: exact same-name source rows were rejected when they
  matched multiple slots, and source-enabled chroma was forced off.
- [x] Preserve the approved no-guess GID boundary. The representative source has
  exact authority only for GID `0`; rows for the other three Caption sheets stay
  inactive/report-only rather than using sheet order or first-seen inference.
- [x] Correct only the source-defined exact-name fan-out, source chroma enabled
  value and LociMyu blank-tolerance default; do not add a generalized material
  system or inferred mapping workflow.
- [x] Re-run the representative conversion: the one authoritative DisplaySet
  now has 18 explicit slot appearances, including 13 transparent and 3
  chroma-enabled slots; 17 source rows without exact GID authority remain
  inactive/report-only.
- [x] Product Owner confirmed the re-converted representative Desktop Project
  visibly applies the authoritative set's inherited opacity and chroma.
- [x] Stop receiver work after independent review and final verification. The
  native Caption overlay/window is the separate approved UI/UX slice below.

Review: Caption-focused schema/storage/converter coverage was 45/45 green and
the Product Owner accepted the visible pin result. Representative material
inspection then found all 14 transparent groups and all 3 chroma-enabled groups
inactive: four authoritative rows were blocked by the converter's repeated-name
bug, while 17 rows lack exact GID authority in the source. The latter remains an
explicit compatibility limitation under the approved no-guess rule. The bounded
fix produces 18 explicit appearances (13 transparent, 3 chroma-enabled) for the
authoritative set, passed focused 46/46, typecheck, production build and the
final failing-suite reruns; one independent reviewer found no P0/P1. Product
Owner then confirmed the inherited opacity/chroma in the re-converted Project.

Stop condition: stop before expanding into HEIC/video conversion, Caption tags,
legacy history, orthographic fallback, inferred GID mapping, new material
controls or a generalized appearance system. Those are not required by this
approved receiver closure.

## Active approved UI/UX closure — native Caption selection overlay

- [x] Product Owner selected the native Caption overlay/window as the next slice
  after receiver completeness.
- [x] Record the bounded contract before implementation in
  `docs/specs/02-storage-package-migration.md` §29.
- [x] Selecting a placed Caption from its marker or list shows one stage card
  for that same stable Caption with saved color, title, body, up to three
  available image thumbnails and a visual connection to the marker.
- [x] Keep `selectedCaptionId` and the existing side editor as the single
  selection/edit source. Add no snapshot/package/converter, Caption, anchor,
  media or material schema.
- [x] Empty-stage click/tap clears selection. DisplaySet change, deletion,
  hidden owning Asset, unplaced Caption or missing marker closes/hides the card
  without creating, moving or guessing data.
- [x] Reuse project-local image reads for a simple fit/previous/next/close
  viewer and discard stale asynchronous results after selection changes.
- [x] Allow the selected card header to move the card temporarily within the
  stage, resetting on selection change, and let image previews use the available
  card width without changing stored bytes or project state.
- [x] Allow a bottom-right handle to resize the selected card temporarily in
  both dimensions, clamp it to the current stage, keep content scrollable, and
  reset to automatic size when the selection changes or closes.
- [x] Cover View/Edit and bounded Desktop/mobile layout. Reuse existing
  selection, visibility and media persistence acceptance; add only focused
  overlay-resolution/stale-load coverage and Desktop visual evidence.
- [x] Complete one independent read-only review and the final
  typecheck/test/production-build matrix with no unresolved P0/P1.
- [x] Close the Desktop visual regression found before acceptance: a visibly
  rendered Caption pin must remain selectable with a small CSS-pixel hit
  tolerance, and a pin that is only partially inside the stage must not cause
  the selected card to disappear. Do not change Caption data or persistence.

Stop condition: stop before attachment add/remove/reorder, video/HEIC, image
processing/zoom tooling, durable overlay placement or size, multiple overlays,
tags/history,
inferred GID mapping, generalized responsive redesign or unrelated Caption
authoring polish. Physical iPhone is batched into the single consolidated
direct-LociMyu acceptance rather than repeated for this slice alone.

## P2 backlog — not a completion blocker

- Give the native home one clear LociMyu ZIP conversion entry (or unified file
  intake) and distinguish it from `.lociview` backup restore; users should not
  need to enter the conventional-project screen to discover the correct lane.
- Replace format-specific Mesh/GS/Point input controls with one model-file
  picker; determine the supported format from file contents after selection.
- Group add, replace, remove and placement under one user-facing model-management
  area and reconsider the current section/tab names.
- Ordinaryize Caption placement/editing around the LociMyu user flow instead of
  exposing storage/Proxy/snapshot steps as separate technical controls.
- Improve wording such as `所属モデル` so it clearly includes Mesh, GS and Point
  Assets.
- Add Unity-style numeric dragging and immediate live placement preview during
  later UI/UX closure.
- Ensure Point-only appearance controls remain visually hidden for non-Point
  selections; do not reopen the accepted renderer path solely for this polish.
- Use visually judgeable representative data for future visual acceptance;
  retain tiny GS fixtures for format and round-trip characterization only.

## Parallel release barriers

- G0 external evidence and numeric/support ratification remain incomplete.
- G0-S remaining crash-consistency/quarantine closure remains incomplete.
- G1 adoption decisions remain incomplete; Spark is only the provisional first
  production GS path unless a new hard blocker appears.
- Release/device evidence is not inferred from this consolidated product smoke.

## Review record

- The first converter reads an already-opened, durable frozen-v1 workspace and
  creates a separate native Project. It does not flush, overwrite or embed the
  source, and publication is guarded immediately before snapshot and marker.
- Native snapshot v1 retains optional/defaultable DisplaySet, exact Mesh
  appearance, unplaced Caption and image-media metadata. Image bytes remain
  separate project-local media inside the same user-visible package; packages
  containing media use portable package v2 while v1 remains readable.
- Supported first image media are PNG, JPEG, WebP and GIF. Explicit unsupported
  or conflicting MIME blocks conversion; unknown/unrepresentable values remain
  complete in the accounting report rather than being guessed or truncated.
- Independent read-only review found no remaining P0/P1. P2 remains whole-buffer
  legacy Mesh material inspection, report-download completion polish and
  inactive staged-byte cleanup after a publication guard failure.
- Final executable tree verification for `9d973cd`: typecheck and both
  production builds passed. The full suite passed 1,370 tests; two fixture
  suites passed 53/53 after the modified provenance specification was staged,
  and one unrelated verifier timeout passed on immediate isolated rerun.
- Desktop conversion/restore and physical-iPhone `.lociview` restore,
  DisplaySet/Caption/image, save and completely offline-reopen checks were
  accepted by the Product Owner. No unresolved P0/P1 was reported.
- The direct LociMyu adapter reuses the exact identity/source-authority parser,
  native receiver, verified binary/media writes and marker-last publication;
  it adds no durable intermediate v1 workspace, sidecar or generalized
  migration system.
- The private representative retained 94,063,937 bytes and SHA-256
  `3736aa3bb5cffcf9b9aaffb70cc210878069d4876b63ced8441f79da8a9da01c`.
  Under the approved correction, 109 source Caption rows produce 103 Captions;
  rows 43–48 are explicit reported empty input. Native publication and portable
  package-v2 restore pass with no missing Representation or media.
- Independent read-only review found and closed one P1: the missing-ID wizard
  branch now repeats that the original ZIP must be retained. No P0/P1 remains;
  media-attachment-specific row-alignment coverage stays P2 because position,
  source-row and representative restore evidence already exercise the seam.
- Final correction-tree verification passed: typecheck; 54 full-suite files with
  1,431 tests passing and 21 existing todo; normal production build; and the
  `/LociView/` base-path build. Spark remains outside the service-worker
  precache and the representative PLY bytes are absent from repository/build.
- The stale current-action wording found by final documentation review was
  corrected after executable verification; this result-only synchronization
  does not trigger a second full matrix under the approved stop rule.
- The bounded native Caption overlay now reuses the existing Caption selection
  authority for marker/list selection, saved title/body/color and on-demand
  project-local images. Product Owner Desktop acceptance passed for selection,
  header drag, responsive images and temporary bottom-right resize; size and
  position reset with selection and add no snapshot/package state.
- Overlay verification passed typecheck, focused 4/4 and production build. The
  one final full run passed 53 files/1,384 tests before two registry suites
  stopped at their intentional index/worktree identity guard because this
  specification was partly staged. Staging the exact final bytes resolved that
  condition and the two affected suites passed 53/53. Independent read-only
  review found no P0/P1; physical iPhone remains batched into consolidated
  direct-LociMyu product acceptance.
