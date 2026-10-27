# LociView project map

This is a navigation map, not a progress log. [Current work](tasks/todo.md) owns
the active boundary and checks; [inventory](tasks/implementation-inventory.md)
owns feature coverage. Read [document authority](docs/README.md) for contracts.

## Start here

- Fresh session: [current todo](tasks/todo.md), this map, document authority, then relevant contracts. [Handoff](tasks/handoff.md) is the short resume guide.
- Existing bounded task: target source, its tests and direct imports.
- UI work: [approved UI/UX principles](docs/ui-product-guidelines.md).
- Historical claims: [preserved records](docs/history/development-through-2026-09-14/README.md), only when needed. Do not reconstruct current scope from them.

## Application routes

| Entry | Scope | Do not infer |
|---|---|---|
| `index.html` → `src/main.ts` → `src/ui/app.ts` | Ordinary home and legacy v1 route, with Native entry | New ProjectScene adoption |
| `src/nativeGs/app.ts` | Bounded Native Mesh/Point/GS, DisplaySets, media and package exchange | New continuing-history team workflow or general format support |
| `dev.html` → `src/dev-entry.ts` → `src/harness/projectScene/entry.ts` | Nondefault ProjectScene development host; memory, old saved, metadata and limited static GLB/approved XYZ-RGB ASCII PLY/01c binary SH0–4 GS plus PNG/JPEG/WebP/GIF photo validation routes | Ordinary-home, device, offline or release acceptance |
| `project-scene-validation` build → `dev.html` → `validationEntry.ts` | Same limited GLB/point/01c GS and photo validation screen, static-only entry; separate `validation-dist`, no public assets or Service Worker | Ordinary-home activation, offline/PWA, profile/device or release acceptance |

Within validation, `editor=project` selects the bounded typed product composition
in `src/ui/projectScene/projectWorkspace.ts`; its viewport/file adapter is
`src/harness/projectScene/productWorkspace.ts`. The existing editor remains available.
The approved [01a point companion](docs/specs/01a-point-project-scene-proposal.md)
connects `projectFiles/pointPly.ts`/`content.ts`, the checked Session point-anchor port,
`viewer/pointSurface.ts` and the validation point visibility/pick adapters. Point
Projects use the typed composition inside validation; exact evidence/status stays
in todo. This adds no ordinary-home, smooth/dither or device/adoption credit.
The approved [01c companion](docs/specs/01c-gs-sh4-proxy-workflow-proposal.md) connects
`projectFiles/gsPly.ts`, closed GS/Proxy Session commands and `gsProxyWorkflow.ts`,
with optional interaction geometry in `validationRender.ts`. `viewer/gsRender.ts`
is lazy and validation-only; its linear target and global decode ownership queue
never own Project/storage/package access. Todo owns exact executed acceptance;
large sources/SH4 paging and renderer adoption remain separate.
The composition's model, Saved View, material and attachment panels reuse their pure controls;
`projectMedia.ts` connects attachment management to the common `mediaPreview.ts` viewer.
The composition reuses `captionWindowControls.ts` for Scene-local comparison
windows and their galleries, sharing the workspace-level image viewer.

`playwright.config.ts`, `scripts/run-e2e.mjs` and `tests/e2e/*.spec.ts` own the
dedicated Chromium regression lane for the built validation entry. See the
[browser runbook](docs/browser-testing.md) for setup/ownership and todo for evidence.
`playwright.normal.config.ts` selects the separate normal-entry compatibility
smoke for existing Native/v1 routes; it grants no ProjectScene adoption credit.

Caption deletion confirmation and explicit parent proposals use the same workspace
guards and typed commands, with impact/coordinate reads adapted by `productSources.ts`.
Scene names and the next-open Scene use the same captured draft/retry owner;
`captionIncludeControls.ts` consumes `projectRead.ts`'s complete Caption inventory
for membership-only changes without copying content or showing the owner.
`projectRecovery.ts` presents whole-Project Scene/Caption and attachment decisions from checked
`productSources.ts` descriptors, using the workspace's existing typed retry owner.
The validation adapter reuses startup recovery before creating a Scene editor
when the persisted default is unresolved; warm resolution retains that editor.
`productSources.ts` supplies bounded read projections and command preparation.
Inventory and todo own its exact feature and verification scope.

`ui/resumeReference.ts` shares the small UI-only last-Project hint with UiState.
The browser adapter `harness/projectScene/browserUiState.ts` owns its advisory key;
`validationWorkspace.ts` validates the catalog and actual mounted host before
remembering it. The product header calls the same guarded Project selector.
Project data and ordinary entry remain separate; todo owns the executed evidence.

The validation selector uses one content-inspected file input. Raw models/photos
reveal name/create controls; packages retain their existing purpose/conversion
services. `validationWorkspace.ts` owns selection generations and exact creation
attempts, while an adopted Host owns durable retry. The approved
[first-backup companion](docs/specs/06a-first-backup-open-proposal.md) adds a
recovery-only entry for a provably absent original Project; it transfers the same
root lease to the real selected generation without opening the original database.
Existing ready-Project replacement remains the separate Start-1 path.

Fresh photo selection uses `projectFiles/photo.ts`'s negative HEIF guidance only
at the three fresh entry points. The product workspace owns explicit cancellation
of an unapplied media attempt; durable retry remains the Session/host's authority.
Its help panel consumes an optional read-only storage estimate from the browser
adapter through existing UI ports, without changing Project or pending state.

The new practical-team workflow uses Project-wide Assets/Caption resources and
Scene membership. New file services are partially connected in the limited
validation route. Old Native acceptance remains valid only for its tested scope.
See inventory for individual connections and todo for executed checks and remaining adoption conditions.

The same validation file entry connects bounded Native, frozen-v1 and LociMyu
initial conversions. The approved frozen-v1 recipe-4 in `frozenV1Source.ts` /
`frozenV1Mapping.ts` preserves explicit saved starting Views without changing old
conversion domains or model profiles. The approved recipe-5 maps saved model
scale/Y-or-Z-up/offset only into the binding, preserving original GLB and local
pin coordinates; source inspection checks new5 display readiness before creation.
The approved 07i recipe-6 uses temporary occurrence decode to prove exact saved
material addresses, then persists the original base catalog/profile and Scene
overrides. Source-only latent values and private captured witnesses follow the
existing converter/report lifetime; typed editing and file/restore use existing ports.
`projectFiles/lociMyuSource.ts` owns raw workbook inspection,
`lociMyuMapping.ts` verifies source identity and constructs typed records, and
`lociMyuConversion.ts` retains the private source/receipt and validates recovery
and explicit report export. Workspace UI exposes coarse workbook choice and the
approved complete relation confirmation; ordinary package outputs exclude that
private evidence. Exact subset, executed checks and pending gates belong to todo
and inventory.
The approved 07h material recipe expands exact source names to distinct selected
GLB material indices, using the existing catalog and Scene-local overrides.
The same source/map/receipt path keeps the private witness/report phases and
disabled-chroma source-only values; no occurrence profile or renderer is added.

The approved JPEG companion adds `projectFiles/jpeg.ts` for bounded photo/texture
admission, two exact GLB profiles and four new converter domains. Existing typed
content/provider/display and file/generation ports carry inspected MIME/profile;
photos keep their original bytes and metadata. Old PNG paths and prepared jobs
retain their meanings. See 07d and todo for the bounded scope and evidence; this
does not activate ordinary entry or complete browser/device/offline adoption.

The approved WebP/GIF photo companion adds `projectFiles/photo.ts` for complete
bounded container inspection and temporary default/first-bitmap validation. Its
four additive conversion domains reuse the same source/content/file/recovery
ports. The common viewer keeps original Blob bytes and browser animation behavior;
the four PNG/JPEG GLB profiles remain fixed. See 07e and todo for exact scope and
executed evidence, without broader browser/device or ordinary-entry credit.

## Current directories

| Path | Responsibility / primary boundary |
|---|---|
| `src/core` | Legacy v1 operation validation, reduction, merge and `ProjectStore` |
| `src/domain`, `src/scene` | New typed records, source/candidate evidence, pure Scene commands/composition |
| `src/projectMetadata` | New metadata Session, original history, commands, retained journal/recovery and storage generations |
| `src/projectFiles` | Limited real-file admission, Project creation, Native one-time conversion, content and team send/receive services |
| `src/projectPackage` | Five-purpose wire/control inspection and bounded file jobs; inventory records which user flows are connected |
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
