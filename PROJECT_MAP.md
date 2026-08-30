# LociView project map

> Status: `CURRENT` map; repository-normalization baseline `fc7054f` (2026-08-18).
> That baseline is a historical normalization anchor, not a checkout target. Use Git `HEAD` and `tasks/todo.md` for the active checkpoint.
> A bounded, nondefault native production path now supports repeated ordinary Mesh, exact ASCII XYZ+RGB Point, or Graphdeco SH2/SH3 GS Asset imports, optional explicit per-GS Proxies, streamed portable backup, independent visibility and per-Asset manual position/rotation/uniform-scale alignment. It does not pass G0/G0-S/G1 or adopt Spark permanently. Additional point profiles, full Alignment workflows, Automerge, content-addressed storage, and renderer backends remain `PROPOSED`.
> Product visibility is per loaded Asset/layer, not per Mesh/GS kind. The current native `mixed` / `gs-only` / `mesh-only` values are bounded convenience filters; formal Compare is neither implemented nor selected as the next workstream.

## Start here

```text
index.html
  -> src/main.ts
    -> src/ui/app.ts
      -> Home / ViewerScreen
      -> ProjectStore / WorkspaceFS / ViewerCore
    -> src/nativeGs/app.ts              # ?mode=native-gs; bounded first production GS path

dev.html
  -> src/dev-entry.ts
    -> src/devharness.ts                 # default manual v1 harness
    -> src/harness/sparkHarness.ts       # ?mode=spark; isolated candidate only
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
| `src/nativeGs` | Version-1 native snapshot, streamed project-local binaries/package, exact ASCII Point and SH2/SH3 GS admission, lazy Spark runtime, repeated Asset import, per-Asset visibility/alignment, and nondefault production UI |
| `src/ui` | App shell, home, viewer screen, dialogs, tabs, and UI-only state |
| `tests` | Executable contracts for core, assets, I/O, and UI logic |
| `public/samples` | Small deterministic files used by the manual viewer and iOS runbook |
| `fixtures` | G0 fixture registry, provenance, hashes and small committed fixture metadata |
| `evidence/g0` | Pending device/run schemas and small evidence manifests; large artifacts remain external |
| `docs/g0` | Active G0 coverage map, device/performance runbook and unratified source-profile preflight |

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

- The default v1 `ViewerCore` keeps one active model and treats PLY as ordinary mesh/points.
- The separate `?mode=native-gs` path can add repeated Mesh, one exact ordinary-Point profile and GS Assets with an optional same-GS-Asset Proxy. It does not claim other point profiles, DisplaySet integration or a general v2 scene/layer implementation.
- ZIP import/export and OPFS reads can materialize complete buffers in memory.
- Viewer, OPFS, PWA, and physical-iOS behavior are not fully covered by automated tests.
- Some 2026-07 documents describe intended behavior that the code never implemented. Consult `docs/README.md` before treating prose as current.

The following residual risks are observed in the current code:

| Risk | Reproduction condition / impact | Evidence area |
|---|---|---|
| Incomplete operation field/collision policy | Decoded structural validation and Map-backed internal indexes are hardened, but known-field control/identity policy and typed divergent-key reporting/resolution remain incomplete | `src/core/schema.ts`, `src/core/merge.ts`, `src/core/reduce.ts` |
| Crash consistency across multi-file publication | The project-scoped write lock prevents concurrent tabs from publishing project mutations, and bounded blob-first/marker-last paths are hardened, but a crash can still interrupt merge/replacement or actor-log plus metadata publication without recovery | `src/assets/package.ts`, `src/assets/modelAsset.ts`, `src/core/store.ts` |
| Whole-buffer large-file path | Package and asset paths can hold full ZIP/entry buffers, conflicting with large GS and iOS memory goals | `src/assets/zipio.ts`, `src/assets/package.ts`, `src/platform/fs.ts` |

The former poisoned-write-queue and concurrent cross-tab append roots are fixed and remain under regression coverage; they are not current unimplemented risks. View mode is lock-free/read-only, while Edit mode requires the one project-scoped browser write lock and reloads durable state before writing after handoff. The residual rows above are G0 regression inputs and blocking items for the `G0-S` v1 safety-stabilization gate in `tasks/todo.md`. The write lock does not itself provide crash recovery across a multi-file publication, so do not claim crash-consistent transactions from the current v1 implementation.

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
