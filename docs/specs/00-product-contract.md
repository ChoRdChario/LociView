# Product and release contract

> Status: `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED`

## 1. Product outcome

LociView v2 is a local-first, offline-capable browser viewer for portable project packages. It MUST let a non-specialist open a project, inspect mesh and Gaussian Splatting (GS) representations in a shared coordinate space, place and edit captions, exchange project packages, and recover from unsupported or damaged inputs without silently losing work.

The current application remains the migration base. v2 replaces storage and rendering internals behind explicit ports while preserving useful v1 workflows and the ability to open source v1 packages.

## 2. Non-negotiable user outcomes

| ID | Outcome |
|---|---|
| `PROD-01` | A project remains portable as a bounded, inspectable package and does not require a LociView server or account. |
| `PROD-02` | Mesh and GS can exist in one project and be aligned without rewriting source assets. |
| `PROD-03` | Mesh, GS and Compare remain reliable even when Integrated cannot correctly compose a material. |
| `PROD-04` | A user can attempt a caption pick on GS without first supplying a mesh. A derived proxy is a fallback, not a prerequisite. |
| `PROD-05` | A topology-changing asset replacement never moves captions or material overrides to a new surface silently. |
| `PROD-06` | Data shown as durably saved survives a reload or process interruption covered by the durability gate. |
| `PROD-07` | Collaboration import exposes unresolved concurrent edits instead of silently choosing a destructive winner. |
| `PROD-08` | Review/share export excludes edit history by construction; clean editable copy starts a new lineage. |
| `PROD-09` | Large GS and package paths degrade quality or refuse safely before browser memory pressure kills the page. |
| `PROD-10` | Unsupported schema, renderer capability, material policy or missing blob produces an actionable diagnosis, not a blank viewer. |
| `PROD-11` | The same validated static source produces the same pose, logical bounds, material class and canonical pick anchor/method across supported backends; candidate-local weak provenance may differ or be absent, and a decoder upgrade cannot reinterpret an existing Representation silently. |

## 3. Product modes and support levels

The four modes are user-visible concepts, not renderer implementation details.

| Mode | Contract |
|---|---|
| **Mesh** | Draw selected non-GS mesh and ordinary point-cloud representations. GS and interaction proxies do not contribute color. |
| **GS** | Draw selected GS representations without Integrated-only exclusions. Mesh proxies do not contribute color. |
| **Compare** | Render Mesh and GS independently with the same project camera, exposure and background, then compare by wipe, split, flicker or side-by-side. It does not promise cross-representation depth composition. |
| **Integrated** | Draw selected non-GS mesh/ordinary-point contributions and GS in one view. The MVP guarantees opaque, alpha-mask/cutout and explicit dithered coverage only. |

Support labels MUST appear in UI and diagnostics:

- **Supported**: covered by release acceptance tests and a documented fallback.
- **Experimental**: opt-in, may be disabled automatically under resource pressure, and never changes saved intent silently.
- **Unsupported**: blocked with a route to Mesh, GS, Compare or an explicit material conversion.

Smooth alpha blend, transmission/refraction and arbitrary multi-layer intersection between closed mesh and GS are not **Supported** in the MVP. After G1-D, a backend MAY offer an explicitly experimental smooth-alpha approximation while preserving the requested semantic material policy. Transmission/refraction remains **Unsupported** and redirected until a separate later material/research gate; G1-D does not authorize it.

Display sets remain distinct from product modes. Existing workflows use a set to combine caption membership, material appearance and a saved view; v2 MUST preserve caption tags, portable set ordering and an explicit per-set default view rather than removing that concept merely because mode selection exists.

## 4. Primary flows

### 4.1 Open and inspect

1. Inspect package header, schema, limits and integrity without committing data.
2. Estimate storage and rendering feasibility.
3. Stream verified content to staging storage.
4. Commit metadata only after required blobs are verified.
5. Open in the safest supported mode and explain any degradation.

### 4.2 Add or replace an asset

1. Preserve source bytes.
2. Create immutable representations, an asset revision and a binding candidate.
3. Validate coordinate and compatibility metadata.
4. Atomically activate one binding only after its required blobs are durable.
5. Mark incompatible captions and material mappings for review.

### 4.3 Align representations

The user selects a reference asset and adjusts another asset non-destructively. The MVP MUST provide numeric and gizmo translation, quaternion-backed rotation, positive uniform scale, reset/undo, bounds-based coarse alignment, and a saved alignment revision. Point-correspondence fitting MAY follow after the manual path is stable; ICP is not an MVP requirement.

### 4.4 Add a visual repair pair

1. Select the existing logical asset and target GS families.
2. Import a human-authored repair mesh while preserving its source bytes.
3. Align its RepresentationFrame into the target AssetFrame with a temporary Sim(3) repair gizmo; this does not create a second logical asset or change the asset's ProjectFrame alignment.
4. Optionally author/import the paired hard exclusion in AssetFrame and preview patch plus mask together.
5. Commit the patch, optional exclusion, new immutable asset revision and binding atomically after every required blob is durable; the binding copies the prior `assetToProject`. Unchanged base-surface pin classes remain valid, while the repair family receives its own class so later patch replacement/removal reviews only repair-authored pins.

### 4.5 Caption a GS

The app first attempts direct GS picking. If the backend cannot meet the accepted latency or quality threshold, it offers GPU ID/depth picking or a precomputed interaction proxy. The stored anchor retains its current internal hit method/confidence for validation and diagnostics, but the ordinary pin UI does not add a persistent “approximate” badge: every created pin is movable with the same gizmo correction flow. A manual gizmo correction preserves a still-active compatibility class; if the old class is no longer active, the user explicitly targets one active visual family and rebinds to its current class. In either case the command records the active revision, changes the current method to `manual`, and removes stale normal/source/confidence evidence. LociView does not present any GS- or proxy-derived anchor as survey-grade measurement.

### 4.6 Exchange work

Users choose one of three explicit outputs:

- a mergeable collaboration package with history;
- a non-mergeable review/share package containing current visible state only;
- a clean editable copy with a new project and history lineage.

The UI MUST explain that these outputs serve different purposes; changing a filename does not change their merge or privacy semantics.

## 5. MVP boundary

Included:

- bounded-memory package import/export;
- v2 metadata/blob storage and explicit v1 conversion;
- Mesh, GS and Compare;
- multiple assets and manual shared-coordinate alignment;
- direct GS picking plus external interaction-proxy support;
- caption edit, package merge conflict review and clean share export;
- opaque/mask/dither Integrated rendering;
- mobile LOD, resident budgets and deterministic degradation;
- missing/corrupt resource diagnosis and recovery paths;
- versioned static-format profiles, deterministic asset bounds and one renderer-neutral ordinary-point footprint contract.

Excluded:

- exact smooth-alpha mesh/GS intersection;
- a custom exact or front-K unified rasterizer;
- automatic high-quality visual mesh reconstruction from GS;
- raw large-GS optimization or collision generation on iOS;
- silent remapping across topology-changing revisions;
- cloud accounts, a LociView synchronization server or background upload;
- measurement-grade geometry inferred from GS;
- runtime animation playback or an editable animation timeline; skin/morph/animation inputs require the profile-defined static pose or an explicit baked derivative.

## 6. Offline, privacy and security contract

- Production runtime MUST NOT depend on a CDN or network service after installation and package acquisition.
- OAuth credentials and Google APIs are not part of the v2 runtime data model.
- Imported ZIP, JSON, Automerge bytes, model data, filenames and metadata are untrusted.
- Parsing and migration MUST run with explicit entry, byte, depth, string and operation budgets. Malformed input cannot partially become the active project.
- Blob URLs, OPFS paths, renderer objects, tokens, absolute source paths and local usernames MUST NOT enter portable metadata.
- A review/share package MUST be constructed from an allowlisted snapshot; redacting an existing history-bearing document is insufficient.
- Exported human-readable CSV MUST neutralize spreadsheet formulas.
- Source images may contain EXIF or other embedded metadata. History-free export and media-metadata stripping are separate guarantees and MUST be described separately.

## 7. Mobile behavior

iOS is a required release-candidate target, not yet a released support guarantee and not a raw-processing target. iPhone 14 Pro is the current physical-alpha baseline; support wording and limits require G0 evidence and product-owner approval. Runtime MUST use paged derivatives, explicit CPU/GPU/render-target budgets, cancellation and progressive restore. Under pressure it SHOULD degrade in this order:

1. evict invisible derived resources;
2. reduce GS draw/resident budgets;
3. reduce render scale/DPR;
4. disable experimental compositor targets;
5. fall back from Integrated to GS, Mesh or Compare with an explanation.

It MUST NOT evict the only source copy, an attachment, or an irreplaceable display resource automatically. Safari does not expose a reliable universal GPU-memory limit, so physical-device stability, context loss, background/restore and frame-time evidence are release criteria.

## 8. Compatibility and rollback

- v1 input remains readable after v2 ships.
- Conversion writes a new v2 project and never overwrites the selected v1 source.
- After explicit conversion the project is v2-only-write; no reverse synchronization to v1 is implied.
- Unknown future major versions are read-only or rejected clearly.
- Every new storage or renderer path remains behind a feature flag until its rollback test passes.
- A failed v2 open MUST leave source packages and the last durable local project unchanged.

## 9. Planning envelope

For one developer working with AI, the current public-candidate envelope is **28–44 focused weeks**; one focused week means roughly 25–30 hours of concentrated work. A closed alpha may be reachable after roughly **14–22 focused weeks** if the first candidates pass. These are planning ranges, not delivery promises, and are re-estimated after G0-S and the renderer decision.

Productionizing an acceptable WBOIT approximation may add roughly 3–7 focused weeks. A general exact mesh/GS rasterizer is a separate research programme and cannot be scheduled as an MVP task from the current evidence.

## 10. Product-owner decisions and remaining approvals

Recorded on 2026-08-19:

- the oldest physical iOS target available for repeated alpha testing is iPhone 14 Pro; no iPad/iPadOS support claim is made without a repeatedly testable iPad, while a tablet PC is a separate desktop/touch test class;
- GS/proxy picks create ordinary editable pins without a persistent approximation badge; internal hit method/confidence remains portable metadata and the product makes no measurement-grade claim;
- smooth-alpha Integrated implementation is deferred to optional G1-D after a base renderer passes and does not block the MVP; transmission/refraction remains Unsupported until a later explicit material/research scope because G1-D alone cannot validate it;
- ordinary-point profiles and the current binary default may proceed to G0 visual/device validation;
- `visualPatch + splatExclusion` is the rendering pair for a human-authored/imported repair model, with the MVP hard-mask contract accepted;
- runtime animation playback remains outside the MVP;
- semantic collaboration conflicts fail closed for the affected unit rather than silently selecting a winner.

Still required later:

- tablet-PC hardware/OS/browser details and any additional repeatedly testable release classes;
- G0 performance, memory, package-size, support-class and degradation guarantees after baseline measurement;
- adoption, wording and default behavior for experimental smooth transparency only if G1-D passes, and a separate future decision before any transmission/refraction claim;
- final merge-conflict interaction design and privacy labels; the fail-closed behavior itself is accepted;
- approval of the v1-to-v2 conversion report, stabilized-v1 release and public release.
