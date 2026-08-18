# ADR-0001: v2 foundation and staged evolution

- Status: Accepted architecture direction; technology selections remain conditional on PoC gates
- Date: 2026-08-18
- Baseline: LociView v1 at `4f6e48196041d7ae39a11aba04f647db99deb450`

## Context

The current local-first LociView is a useful TypeScript/PWA base, but its single-model Three.js viewer, whole-buffer package paths, and custom operation-log durability are not sufficient for large Gaussian Splatting assets, multiple coordinated representations, or robust file-exchange collaboration.

A full rewrite would discard working UI, legacy import, package behavior, and product knowledge. Adding GS directly to the current single-model viewer and storing more state in the current log would increase coupling and migration risk.

## Decision

1. Evolve the current application with a strangler approach. Keep v1 runnable while inserting renderer- and storage-neutral ports.
2. Use the fixed coordinate hierarchy `RepresentationFrame -> AssetFrame -> ProjectFrame`.
3. Represent source/display/proxy data as explicit representations inside immutable asset revisions.
4. Atomically bind an asset revision and project alignment through one immutable `AssetBindingRevision` and one active pointer.
5. Resolve persisted state into a renderer-neutral `SceneDocument`; keep renderer, storage paths, package structure, and Automerge types outside it.
6. Separate `ViewerController`, `RenderCoordinator`, `InteractionIndex`, `ResourceManager`, and replaceable `RenderBackend` responsibilities.
7. Support Mesh, GS, and Compare as formal product paths. Integrated initially guarantees opaque, mask/cutout, and dithered coverage. Smooth-alpha mesh/GS intersection is optional research and cannot block the base product.
8. Bind every immutable Representation to one versioned semantic FormatProfile and profile-derived bounds/material summary. A backend must reproduce the profile or reject it; extensions and loader defaults are not portable interpretation. The MVP uses a deterministic static pose rather than runtime animation.
9. Preserve original source data and store paged display derivatives, static-pose bakes and interaction proxies as derived representations with provenance.
10. Evaluate Automerge metadata plus OPFS SHA-256 content-addressed blobs as the leading persistence candidate. Adoption is conditional on streaming, multi-tab, durability, privacy-export, and migration PoCs.
11. Keep collaboration-history packages, history-free review/share packages, and clean editable copies as distinct purposes.
12. Migrate with dual-read/v2-only-write after explicit conversion. Preserve original v1 packages and create one canonical history epoch from known copies.

## Rejected as the default path

- Full application rewrite.
- Adding a GS loader directly to the current single `ViewerCore` without new scene/domain boundaries.
- Making exact unified triangle/GS transparency a prerequisite for GS support.
- Treating collision proxies as visual meshes or measurement-quality reconstruction.
- Repairing and indefinitely extending the custom v1 HLC/LWW log as the primary v2 persistence design.
- Combining the old alpha source, research workspace, and current product into a monorepo.

## Consequences

- Initial progress includes boundary and migration work before all new features are visible.
- Persisted data remains independent of Spark, PlayCanvas, Three.js, or a future custom renderer.
- Renderer and Automerge choices remain reversible until their gates pass.
- Exact smooth transparency may remain unsupported while comparison and opaque-integrated workflows ship.
- Topology-changing replacement can require explicit caption/material review rather than silent remapping.

## Reconsideration triggers

Reopen the relevant part of this ADR only when evidence shows one of the following:

- neither candidate renderer passes offline/iOS/paging/picking requirements;
- Automerge fails the agreed performance, history-privacy, durability, or migration gate;
- real users require exact smooth-alpha intersection strongly enough to justify a separate renderer research program;
- a local packer and web application require a genuinely shared schema/build package, making a small monorepo beneficial;
- the fixed three-frame/Sim(3) model cannot represent validated target data.

The concise accepted direction remains in `docs/v2/00-approved-direction.md`. Review-ready gate details and the MVP contract are now expanded under `docs/specs/`; they remain proposed until product-owner approval.
