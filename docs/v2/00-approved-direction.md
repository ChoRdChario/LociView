# LociView v2 approved direction

> Status: `APPROVED DIRECTION / NOT IMPLEMENTED`
> Updated: 2026-08-18
> Technology choices marked as candidates remain subject to the listed PoC gates.

Rationale, rejected defaults, and reconsideration triggers are recorded in `docs/adr/0001-v2-foundation.md`.

## Objective

Evolve the current offline LociView without a full rewrite so it can:

- display Gaussian Splatting data;
- support mesh and GS data in the same project;
- provide reliable Mesh, GS, and comparison workflows;
- retain usable caption picking when no authored mesh exists;
- remain portable, local-first, and practical on iOS;
- replace the unsafe parts of the custom persistence layer without losing v1 projects.

The current UI and useful v1 behavior remain available while renderer and storage internals are replaced behind explicit ports.

## Fixed domain direction

- Coordinate hierarchy: `RepresentationFrame -> AssetFrame -> ProjectFrame`.
- User alignment is non-destructive Sim(3): translation, quaternion rotation, and positive uniform scale.
- A logical `Asset` points to one immutable `AssetBindingRevision`.
- A binding atomically combines an immutable `AssetRevision` with `assetToProject`; do not keep independent active asset/alignment pointers.
- An asset revision can contain mesh, GS, visual patch, and interaction-proxy representations with explicit roles.
- Caption position is authored in `AssetFrame`, records its authored revision, and is never silently rebound after incompatible replacement.
- Material overrides target revision-scoped representation/material-slot identities and store semantic intent, not Three.js flags.
- `SceneDocument` is a derived renderer-neutral read model. It is never the persisted source of truth.

## Rendering scope

Formal product modes:

1. Mesh
2. GS
3. Compare
4. Integrated

Guaranteed Integrated coverage for the first release is opaque, mask/cutout, and dithered coverage. Arbitrarily intersecting smooth-alpha mesh and GS fragments are not guaranteed by separate conventional renderers.

Spark/Three and PlayCanvas must be evaluated with the same disposable fixture harness. If both pass with comparable results, prefer the lower migration cost. Do not commit the persisted domain to either engine.

Exact unified triangle/GS rasterization is research, not a v2 dependency. A WBOIT feasibility spike may be run after the base renderer gate; failure leaves Mesh, GS, and Compare as fully supported product paths.

## GS assets and interaction

An asset may carry:

- source representation;
- paged/streaming display representation;
- optional preview representation;
- optional invisible interaction proxy.

No mesh is required for the first caption attempt. Use direct GS picking first; introduce GPU ID/depth picking or an interaction proxy when latency or normal quality fails the agreed threshold.

Automatic proxy generation is a desktop/local preprocessing option, not an iOS runtime requirement. A proxy is derived collision evidence, not a visual or measurement-quality mesh.

## Persistence candidate

The leading candidate is:

- Automerge metadata;
- Automerge Repo with browser storage for document durability and multi-tab coordination;
- OPFS content-addressed blobs keyed by verified SHA-256;
- bounded-memory package import/export;
- blob-first staging journal followed by metadata commit.

This candidate is not adopted until the Automerge and streaming gates pass. Persisted metadata must not contain OPFS paths, renderer objects, or backend-specific material state.

Package purposes remain distinct:

- collaboration package: mergeable history;
- review/share package: current snapshot without private edit history;
- clean editable copy: new project/history epoch.

## Migration

- Read v1 and v2; write only v2 after explicit conversion.
- Never overwrite the source v1 package.
- Convert known copies to one canonical genesis/history epoch.
- Represent imported v1 assets as synthetic legacy revisions.
- Preserve ambiguous anchors/material mappings for review instead of guessing.
- Unknown future major schemas open read-only or fail clearly; they are not auto-migrated.

## Mobile constraints

- No product path may require full package or full large-GS materialization in memory.
- Import streams to staging storage, incrementally hashes, validates, then commits.
- Runtime uses paging and explicit draw/resident budgets.
- Raw large-GS optimization and collision generation occur on desktop/local tooling, not on iOS.
- DPR, MSAA, render-target count, context loss, background restore, and peak memory are acceptance measurements, not implementation details to defer.

## Development governance

- The user owns UX guarantees, irreversible data decisions, PoC adoption, migration acceptance, and release approval.
- Codex is the single primary implementer for an approved change.
- A separate model/context reviews specifications and diffs read-only; the implementer does not approve its own work.
- Multiple AIs do not edit the same files concurrently.
- Chat history is not a specification. Approved requirements, contracts, evidence, and decisions live in this repository.
- High-risk work starts with a disposable PoC and predeclared acceptance/fallback criteria. PoC code is not promoted directly into production.
- Each production change has a small task card, characterization/contract tests, automated evidence, independent review, and human visual/iOS acceptance where applicable.
- Keep the current application runnable behind adapters or feature flags; do not perform a big-bang rewrite.

## Gate order

1. `G-1` repository normalization and source-of-truth cleanup.
2. `G0` golden projects, reference scenes, target devices, and baseline measurements.
3. `G0-S` current-v1 safety stabilization for multi-tab collisions, durable-write failure, untrusted keys, and operation/blob consistency.
4. Bounded-memory streaming/CAS package PoC.
5. Spark/Three versus PlayCanvas renderer bakeoff.
6. Automerge multi-tab/package/privacy/durability PoC.
7. Renderer/storage-neutral ports inserted with unchanged v1 behavior.
8. v2 binary storage and metadata productionization.
9. Canonical v1 migration.
10. GS vertical slice: import -> display -> pick -> caption -> save -> reload.
11. Multiple assets, alignment, Compare, and opaque/mask/dither Integrated.
12. Optional smooth-transparency research.
13. iOS, migration, corruption, privacy, and security hardening.

## MVP boundary

Included:

- bounded-memory package I/O;
- v2 metadata/blob storage and v1 conversion;
- Mesh, GS, and Compare;
- multiple assets and coordinate alignment;
- direct GS picking and external interaction-proxy support;
- captions, collaboration merge, and clean share export;
- opaque/mask/dither Integrated rendering;
- mobile LOD and resident-budget degradation.

Excluded from the MVP:

- exact smooth-alpha mesh/GS intersection;
- custom front-K or exact unified rasterizer;
- automatic high-quality visual mesh reconstruction from GS;
- large raw-GS preprocessing on iOS;
- silent topology-changing caption remapping.
