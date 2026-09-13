# LociView project map

This is a navigation map, not a progress log. [Current work](tasks/todo.md) owns
the active boundary and checks; [inventory](tasks/implementation-inventory.md)
owns feature coverage. Read [document authority](docs/README.md) for contracts.

## Start here

- Fresh session: [handoff](tasks/handoff.md), current todo, then relevant contracts.
- Existing bounded task: target source, its tests and direct imports.
- UI work: [approved UI/UX principles](docs/ui-product-guidelines.md).
- Historical claims: [preserved records](docs/history/development-through-2026-09-14/README.md), only when needed. Do not reconstruct current scope from them.

## Application routes

| Entry | Scope | Do not infer |
|---|---|---|
| `index.html` → `src/main.ts` → `src/ui/app.ts` | Ordinary home and legacy v1 route, with Native entry | New ProjectScene adoption |
| `src/nativeGs/app.ts` | Bounded Native Mesh/Point/GS, DisplaySets, media and package exchange | New continuing-history team workflow or general format support |
| `dev.html` → `src/dev-entry.ts` → `src/harness/projectScene/entry.ts` | Nondefault ProjectScene development host; memory, old saved, metadata and limited GLB/PNG validation routes | Ordinary-home, device, offline or release acceptance |

The new practical-team workflow uses Project-wide Assets/Caption resources and
Scene membership. New file services are partially connected in the limited
validation route. Old Native acceptance remains valid only for its tested scope.
See inventory for individual connections and todo for the unverified worktree.

## Current directories

| Path | Responsibility / primary boundary |
|---|---|
| `src/core` | Legacy v1 operation validation, reduction, merge and `ProjectStore` |
| `src/domain`, `src/scene` | New typed records, source/candidate evidence, pure Scene commands/composition |
| `src/projectMetadata` | New metadata Session, original history, commands, retained journal/recovery and storage generations |
| `src/projectFiles` | Limited real-file admission, Project creation, content and team send/receive services |
| `src/projectPackage` | Five-purpose wire/control inspection and bounded Workspace/Contribution/backup jobs; implementation is section-specific |
| `src/platform` | `WorkspaceFS`, OPFS, browser locks and platform integration |
| `src/assets`, `src/io` | Legacy asset/package I/O, local XLSX/CSV and LociMyu conversion |
| `src/viewer` | Three.js loaders, material patches and legacy `ViewerCore` |
| `src/nativeGs` | Bounded Native snapshot, assets, DisplaySets, media, conversion and exchange |
| `src/ui` | Ordinary app shell and UI-only state |
| `src/ui/projectScene`, `src/harness/projectScene` | Reusable Scene controls and their nondefault host/storage/file/viewport connections |
| `tests` | Existing executable contracts; connection and platform evidence are distinct |
| `fixtures`, `evidence/g0`, `docs/g0` | Fixture metadata, evidence manifests and gated device/performance procedures |
| `poc` | Isolated experiments, not automatic production adoption |

## Dependency and write boundaries

- Legacy v1 interactive edits → `ProjectStore.dispatch()`; Native → its accepted services.
- New ProjectScene edits → metadata Session commands; file merge → file/package integration services.
- Binary I/O → `WorkspaceFS` and content/package helpers. UI must not write storage directly.
- Temporary camera, filters and window layout stay separate from shared Project edits.
- `core`, `platform`, `viewer` must not import UI; viewer must not depend on storage/package formats.
- The legacy directory-level `assets`/`io` cycle exists; do not expand it.

## Contracts and checks

[AGENTS.md](AGENTS.md) owns working rules and verification cadence.
[docs/README.md](docs/README.md) routes to frozen compatibility contracts,
accepted architecture, UI principles and section-specific implementation/adoption gates.
Default-v1 whole-buffer/crash-consistency risks and new storage/device gates are
not erased by success in another route. Current evidence and remaining work belong
in todo/inventory, not a second status ledger here.
