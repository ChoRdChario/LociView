# LociView active work

> Baseline checkpoint: `56698f2ee0f13f6a716b5a4ceff53c8bc94af0ab` on
> `g0-baseline` (2026-08-31). The first frozen-v1 -> native implementation is
> complete at `9d973cd8f84e14cc1d72562a01034754e3a1ed42`; Desktop and
> physical-iPhone acceptance both passed.
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

## P2 backlog — not a completion blocker

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
- This result-only documentation synchronization does not trigger another full
  matrix under the approved stop rule.
