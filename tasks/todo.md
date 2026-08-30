# LociView active work

> Current checkpoint: `a2708cf3e1163eeca98113a4166ce6345fa9e723` on
> `g0-baseline` (2026-08-30).
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

## Next critical-path candidate — read-only conversion gap

- [x] Inspect the existing frozen-v1 readers, LociMyu adapters, `ImportPlan`,
  native snapshot and storage boundaries without implementing migration.
- [ ] Product Owner decision: make the first conversion slice accept one opened
  frozen-v1 project, one valid v1 package, or both in the first boundary.
- [ ] Product Owner decision: choose the smallest non-lossy native destination
  for legacy DisplaySet/material/media/tag/unplaced-Caption/provenance fields;
  the current snapshot v1 has no complete home for all of them.
- [ ] Product Owner decision: retain the exact outer LociMyu ZIP privately inside
  the converted project for broad-user recovery/audit, or require the user to
  retain it externally.
- [ ] After those decisions, specify one non-destructive conversion slice. Do
  not start implementation automatically and do not add Compare, CAS,
  Automerge or a generalized migration framework.

Required conversion invariants:

- frozen v1 to native and LociMyu ZIP to native are distinct input adapters;
- input is read-only and conversion never overwrites the source;
- the converted native project becomes the new durable source of truth;
- reuse canonical LociMyu Caption identity and duplicate-retention behavior;
- unknown/unrepresentable source data is reported rather than guessed away.

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

- Final executable tree verification for `a2708cf`: typecheck and builds passed;
  the full suite passed except one unrelated verifier CLI timeout that passed on
  immediate isolated rerun.
- Desktop and physical iPhone 14 Pro consolidated checks were accepted by the
  Product Owner. No unresolved P0/P1 was reported.
- This result-only documentation synchronization does not trigger another full
  matrix under the approved stop rule.
