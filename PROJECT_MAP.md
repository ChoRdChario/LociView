# LociView project map

> Status: `CURRENT` map; repository-normalization baseline `fc7054f` (2026-08-18).
> That baseline is a historical normalization anchor, not a checkout target. Use Git `HEAD` and `tasks/todo.md` for the active checkpoint.
> Gaussian Splatting, multiple simultaneous models, Automerge, content-addressed storage, and renderer backends are `PROPOSED`, not current behavior.

## Start here

```text
index.html
  -> src/main.ts
    -> src/ui/app.ts
      -> Home / ViewerScreen
      -> ProjectStore / WorkspaceFS / ViewerCore

dev.html
  -> src/devharness.ts   # manual harness; not the product entry point
```

For a normal task, read only the target file, its matching tests, and direct imports first.

## Current directories

| Path | Current responsibility |
|---|---|
| `src/core` | IDs, HLC, operation validation, JSONL, reduction, merge, manifest, and `ProjectStore` |
| `src/platform` | `WorkspaceFS`, OPFS, memory filesystem, PWA and browser integration |
| `src/assets` | ZIP/package handling, model asset registration/replacement, GLB optimization, import wizard |
| `src/io` | CSV, minimal XLSX reader, and legacy LociMyu conversion |
| `src/viewer` | Three.js loaders, material shader patch, single-model `ViewerCore` |
| `src/ui` | App shell, home, viewer screen, dialogs, tabs, and UI-only state |
| `tests` | Executable contracts for core, assets, I/O, and UI logic |
| `public/samples` | Small deterministic files used by the manual viewer and iOS runbook |
| `fixtures` | G0 fixture registry, provenance, hashes and small committed fixture metadata |
| `evidence/g0` | Pending device/run schemas and small evidence manifests; large artifacts remain external |

## Actual dependency direction

```text
main -> ui
ui -> assets / io / core / platform / viewer
assets -> core / io / platform / viewer-loaders
io -> core / assets-zipio
core-store -> core-pure / platform-fs
viewer -> three
platform-opfs -> platform-fs
```

There is an existing directory-level `assets`/`io` cycle. Do not expand it. New v2 boundaries must remove rather than normalize this coupling.

## Main data flows

```text
interactive entity edit
  -> UI
  -> ProjectStore.dispatch
  -> per-actor JSONL operations
  -> reduce
  -> AppContext
  -> UI and ViewerCore

.lociview package import as a new workspace
  -> inspect and validate package
  -> package/project service writes manifest, raw operations, and binaries through WorkspaceFS
  -> ProjectStore.open
  -> reduce
  -> AppContext
  -> UI and ViewerCore

.lociview merge into an opened workspace
  -> inspect and validate external package
  -> ProjectStore.mergeExternal immediately reduces/notifies and enqueues per-actor log appends
  -> package service copies accepted binaries
  -> ProjectStore.flush
  -> AppContext
  -> UI and ViewerCore
```

For v1, distinguish:

- logical truth: validated operation log;
- active durable workspace: OPFS through `WorkspaceFS`;
- exchange/backup container: `.lociview` ZIP.

## Current constraints and known risks

- One model is active in `ViewerCore` at a time.
- PLY means ordinary mesh/point rendering, not Gaussian Splatting.
- ZIP import/export and OPFS reads can materialize complete buffers in memory.
- Viewer, OPFS, PWA, and physical-iOS behavior are not fully covered by automated tests.
- Some 2026-07 documents describe intended behavior that the code never implemented. Consult `docs/README.md` before treating prose as current.

The following residual risks are observed in the current code:

| Risk | Reproduction condition / impact | Evidence area |
|---|---|---|
| Non-atomic cross-tab append | OPFS append obtains size then writes at that position without a cross-tab lock | `src/platform/opfs.ts` |
| Incomplete operation field/collision policy | Decoded structural validation and Map-backed internal indexes are hardened, but known-field control/identity policy and typed divergent-key reporting/resolution remain incomplete | `src/core/schema.ts`, `src/core/merge.ts`, `src/core/reduce.ts` |
| Non-atomic shared transaction | Bounded blob-first and marker-last paths are hardened, but shared merge/replacement and actor-log publication still lack one browser-proven lock/journal transaction | `src/assets/package.ts`, `src/assets/modelAsset.ts`, `src/core/store.ts` |
| Whole-buffer large-file path | Package and asset paths can hold full ZIP/entry buffers, conflicting with large GS and iOS memory goals | `src/assets/zipio.ts`, `src/assets/package.ts`, `src/platform/fs.ts` |

The former poisoned-write-queue root is fixed and remains under regression coverage; it is not a current unimplemented risk. The residual rows above are G0 regression inputs and blocking items for the `G0-S` v1 safety-stabilization gate in `tasks/todo.md`. Local stores now self-issue distinct writer actors, but shared external-actor paths and multi-file transactions still lack a browser-proven lock; do not claim conflict-free multi-tab durability from the current v1 implementation.

The executable `G0S-*` cases use Vitest `it.fails` while the defects remain in
v1. They assert the desired safe invariant: an unexpected pass makes the suite
fail and requires the G0-S fix to convert that case to an ordinary test.

## Verification matrix

| Change | Required evidence |
|---|---|
| Pure core/I/O logic | typecheck + relevant unit tests + full test suite |
| Package/storage | above + round trip + interruption/quota/error path |
| Migration | above + anonymized real fixture + idempotence + original preserved |
| Viewer/material | above + browser/manual visual evidence |
| Mobile-sensitive render/storage/PWA | above + physical iOS smoke/stress result |
| Dependency | above + lockfile review + `npm audit` |

Default commands:

```powershell
npm run typecheck
npm test
npm run build
```

## Proposed v2 boundary

The approved direction is summarized in `docs/v2/00-approved-direction.md`; the proposed implementation contracts are indexed by `docs/specs/README.md`. The eventual flow is:

```text
ProjectDocV2 + BlobStore + ResourceManager
  -> SceneDocument resolver
  -> ViewerController
  -> RenderCoordinator + InteractionIndex
  -> RenderBackend
```

No proposed dependency or type may leak into current UI/storage code before its gate passes.
