# LociView v2 approved direction

> Status: `ACCEPTED DIRECTION SUMMARY / NON-NORMATIVE / NOT IMPLEMENTED`
> Updated: 2026-08-26
> Technology choices marked as candidates remain subject to the listed PoC gates.

This is a navigation summary, not an independent requirements source. Rationale, decisions, rejected defaults and reconsideration triggers are normative in `docs/adr/0001-v2-foundation.md`. Review-ready implementation contracts are indexed in `docs/specs/README.md`; after product-owner approval they provide the detailed normative contract. Until then they remain proposed and do not authorize implementation.

## Objective

Evolve the current offline LociView without a full rewrite so it can:

- convert LociMyu XLSX/model/image datasets without Google-account or Google-API dependence while leaving selected source bytes unchanged, preserving duplicate source occurrences independently and retaining uncertain relationships for later expert review;
- display Gaussian Splatting data;
- support mesh and GS data in the same project, with the standard interactive
  configuration keeping both in one logical Asset and one active AssetRevision;
- provide reliable Mesh, GS, and comparison workflows;
- keep Mesh-only and GS-only assets valid, while treating GS without a registered
  same-asset interaction surface as view-only rather than guessing a surface;
- remain portable, local-first, and practical on iOS;
- replace the unsafe parts of the custom persistence layer without losing v1 projects.

The current UI and useful v1 behavior remain available while renderer and storage internals are replaced behind explicit ports.

## Fixed domain direction

- Coordinate hierarchy: `RepresentationFrame -> AssetFrame -> ProjectFrame`.
- User alignment is non-destructive Sim(3): translation, quaternion rotation, and positive uniform scale.
- A ready logical `Asset` points to one immutable `AssetBindingRevision`; a migrated missing-source placeholder is explicitly unresolved, has no fabricated binding/blob, and may retain portable pending alignment for later verified assignment.
- A binding atomically combines an immutable `AssetRevision` with `assetToProject`; do not keep independent active asset/alignment pointers.
- An asset revision can contain mesh, ordinary-point, GS, visual-patch, and interaction-proxy representations with explicit roles.
- Caption position is authored in `AssetFrame`, retains compatibility evidence and optional non-resolving authored-revision provenance, and is never silently rebound after incompatible replacement.
- Material overrides target asset/variant-family/material-layout/logical-slot identities and store renderer-neutral appearance plus independent coverage/optics intent, not Three.js flags. Source material semantics are profile-derived immutable metadata; revision-to-revision remapping is explicit.
- Every immutable Representation names a versioned semantic FormatProfile and carries a profile-derived family bounds envelope/material summary; a backend either reproduces that profile or reports Unsupported. SceneResolver derives fit bounds from those envelopes without loading the blobs.
- The MVP is a deterministic static-scene viewer. Animation clips never autoplay; unsupported skin/morph state is explicitly baked to a derived static representation or rejected.
- `SceneDocument` is a derived renderer-neutral read model. It is never the persisted source of truth.

## Rendering scope

Formal product modes:

1. Mesh
2. GS
3. Compare
4. Integrated

The first proxy-backed vertical slice uses three visibility patterns of the same
active AssetRevision rather than adding another mode: simple Mesh+GS mixed,
GS-only and Mesh-only. They map to the existing Integrated, GS and Mesh requests;
Compare remains a later comparison workflow. The initial mixed pattern draws an
opaque depth-writing Mesh contribution and then GS against that depth. Smooth
Mesh alpha, transmission and exact cross-representation multi-layer composition
remain later work.

Guaranteed Integrated coverage for the first release is opaque, mask/cutout, and dithered coverage. Arbitrarily intersecting smooth-alpha mesh and GS fragments are not guaranteed by separate conventional renderers.

GS alignment transforms means, covariance and view-dependent basis consistently; mean-only transforms are forbidden. Ordinary-point size is CSS-pixel intent resolved once into a RenderPlan, and drawing and picking use the same effective footprint.

Spark/Three and PlayCanvas must be evaluated with the same disposable fixture harness. If both pass with comparable results, prefer the lower migration cost. Do not commit the persisted domain to either engine.

Exact unified triangle/GS rasterization is research, not a v2 dependency. A WBOIT feasibility spike may be run after the base renderer gate; failure leaves Mesh, GS, and Compare as fully supported product paths.

## GS assets and interaction

An asset may carry:

- source representation;
- paged/streaming display representation;
- optional preview representation;
- optional invisible interaction proxy.

The first standard interactive configuration is one `meshPrimary`, one
`gsPrimary` and one unambiguous invisible `interactionProxy` in the same logical
Asset and active AssetRevision. The same proxy remains the raycast target while
the user switches among simple Mesh+GS mixed, GS-only and Mesh-only visibility;
it is not a display mode and never contributes visual output. The existing
`interactionProxy.proxyForGsVariantFamilyId` relation is reused without another
domain model or schema field. The selected GS family resolves only to the exact
same-Asset proxy naming that family; an unrelated visual Mesh, nearby surface or
another GS proxy is never inferred. A GS-only asset without a usable proxy
remains view-only for new placement. Direct splat/GPU ID picking, normal-Mesh
binding and automatic proxy generation are outside the first vertical
slice and may be reconsidered later.

Degradation is fixed: a usable Mesh with missing GS opens Mesh-only with a
diagnosis; a usable GS with no usable proxy opens GS view-only with caption
placement disabled, while existing Captions remain at their saved AssetFrame
positions and stay gizmo-editable; an invalid, ambiguous or cross-asset proxy
binding disables new interaction and reports the problem without guessing; unknown
registration remains unregistered; and an asset with neither usable Mesh nor GS
does not enter the active scene. Ordinary-point Representations remain valid but
are not part of the first paired acceptance.

Prepared/imported proxies may be consumed in the first slice. Automatic proxy
generation is later optional desktop/local preprocessing and is not an initial
product path or an iOS runtime requirement. A proxy is an approximate initial-
placement aid, not a visual, measurement-quality or saved-position mesh. Its hit
is converted through `representationToAsset` into a transient AssetFrame
candidate. The user then adjusts or confirms the ordinary Caption gizmo; the
current saved anchor is the existing source-less `manual` variant whose
`positionAsset` and GS compatibility class are authoritative. Save/reopen does
not reraycast the proxy, and its absence or replacement alone cannot move the
Caption. Any proxy hit details retained outside that current anchor are weak
diagnostics and never require a persistent approximation badge.

## Persistence candidate

The leading candidate is:

- Automerge metadata;
- Automerge Repo with browser storage for document durability and multi-tab coordination;
- OPFS content-addressed blobs keyed by verified SHA-256;
- bounded-memory package import/export;
- blob-first staging plus exact-change recovery, preserving remote Automerge history rather than squashing it.

This candidate is not adopted until the Automerge and streaming gates pass. Persisted metadata must not contain OPFS paths, renderer objects, or backend-specific material state.

Package purposes remain distinct:

- collaboration package: mergeable history;
- review/share package: separately keyed nonmergeable current snapshot with no source lineage identity;
- clean editable copy: topologically re-keyed new project/history epoch after conflicts and orphans are resolved.

## Migration

- LociMyu dataset conversion and LociView v1-package-to-v2 migration are distinct compatibility paths; the former may remain integrated or use a separate tool, but both must follow the accepted product contract rather than fork semantics silently.
- Apply a deterministic non-lossy default instead of asking ordinary users for technical identity or mapping decisions. Preserve uncertain semantics as durable expert-review items; never silently drop, merge, choose a winner or activate a guessed relationship.
- New LociMyu conversions use `locimyu-caption-id-2` from `specs/04-locimyu-conversion.md`; the approved first source/review stock is device-local and intentionally omitted from ordinary package export, but its storage/wire contract remains blocked until the separate gate passes.
- Read v1 and v2; write only v2 after explicit conversion.
- Never overwrite the source v1 package.
- Convert known copies to one canonical genesis/history epoch.
- Keep deterministic v1 ID/decision/mapping continuity in collaboration packages so a reviewed later v1 copy can migrate on another device; review/share and clean copies intentionally omit that lineage.
- Represent imported v1 assets as synthetic legacy revisions.
- Preserve caption tags, display-set ordering and explicit per-set default views.
- Preserve ambiguous anchors/material mappings for review instead of guessing.
- Unknown future major schemas open read-only or fail clearly; they are not auto-migrated.

## Mobile constraints

- The repeatable G0 classes are iPhone 14 Pro/Safari PWA, Windows 11 desktop and Windows 11 tablet PC; Edge is the primary Windows browser and Chrome is secondary smoke evidence. Exact measured facts are recorded per device/run and are not generalized to an untested class.
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
5. Spark/Three versus PlayCanvas base-renderer bakeoff for Mesh, GS, the simple
   mixed pattern and shared-proxy interaction; later feature packs do not block
   this adoption decision.
6. Optional time-boxed smooth-transparency feasibility after the renderer decision; it records evidence only and may be deferred without blocking the MVP.
7. Automerge multi-tab/package/privacy/durability PoC.
8. Renderer/storage-neutral ports inserted with unchanged v1 behavior.
9. v2 binary storage and metadata productionization.
10. Ratified byte-exact v1 migration recipe, then canonical v1 migration.
11. Proxy-backed paired Mesh+GS vertical slice in one logical Asset/active
    AssetRevision: import -> switch simple mixed/GS-only/Mesh-only visibility ->
    select GS -> raycast only its explicitly related invisible proxy -> coarse
    AssetFrame candidate -> Caption gizmo adjust/confirm -> manual
    `positionAsset` -> save -> reload without proxy reraycast.
12. Multiple assets, alignment, Compare, and opaque/mask/dither Integrated.
13. iOS, migration, corruption, privacy, and security hardening.
14. Productionize an adopted smooth result only after core hardening and a separate production review; otherwise leave it off. Exact-renderer/transmission research remains later and separate.

The exact stabilized-v1 candidate SHA is designated before final verification so
evidence and review can bind to it. It becomes release-eligible only after both
G0 and G0-S exit, independent exact-tree review has no P0/P1, and the Product
Owner approves that SHA and deployment method; a `main` push or manual workflow
dispatch is never implicit approval.

## MVP boundary

Included:

- account-independent conversion of LociMyu save datasets under one accepted compatibility contract;
- bounded-memory package I/O;
- v2 metadata/blob storage and v1 conversion;
- Mesh, GS, and Compare;
- multiple assets and coordinate alignment;
- paired Mesh+GS interaction through one explicit invisible same-asset proxy;
- ordinary-point display and caption picking for v1-compatible point data;
- captions, collaboration merge, and clean share export;
- opaque/mask/dither Integrated rendering;
- mobile LOD and resident-budget degradation.

Excluded from the MVP:

- exact smooth-alpha mesh/GS intersection;
- direct splat or GPU ID/depth picking as an initial product dependency;
- custom front-K or exact unified rasterizer;
- automatic high-quality visual mesh reconstruction from GS;
- large raw-GS preprocessing on iOS;
- silent topology-changing caption remapping.
