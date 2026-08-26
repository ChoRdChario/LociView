# Product and release contract

> Status: `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED`

## 1. Product outcome

LociView v2 is a local-first, offline-capable browser viewer for portable project packages. It MUST let a non-specialist open a project, inspect mesh and Gaussian Splatting (GS) representations in a shared coordinate space, place and edit captions, exchange project packages, and recover from unsupported or damaged inputs without silently losing work.

The current application remains the migration base. v2 replaces storage and rendering internals behind explicit ports while preserving the useful LociMyu/LociView viewing and recording workflow and the ability to open source v1 packages. Ordinary file, caption, merge, export and recovery flows target a person comfortable with normal Microsoft Office file workflows; they MUST NOT require developer, 3D-engine, storage-engine or synchronization-protocol knowledge.

When a deterministic non-lossy default can preserve every source record, the
product MUST apply that default without asking an ordinary user to decide
technical identity, storage or migration details. Uncertainty that does not
prevent safe preservation is retained as a bounded review item and disclosed in
a concise summary; a knowledgeable user or support operator can inspect and
resolve such items in batches later. The product blocks only the affected unit or
commit when continuing would lose a record, guess a semantic relationship or
violate an invariant. Exclusion, destructive merge and silent guessed linkage
are never defaults.

## 2. Non-negotiable user outcomes

| ID | Outcome |
|---|---|
| `PROD-01` | A project remains portable as a bounded, inspectable package and does not require a LociView server or account. |
| `PROD-02` | Mesh and GS can exist in one project and be aligned without rewriting source assets. The standard interactive configuration keeps its Mesh, GS and invisible interaction proxy in the same logical Asset and active AssetRevision, and offers simple Mesh+GS mixed, GS-only and Mesh-only visibility without changing that asset closure; Mesh-only and GS-only assets remain valid. |
| `PROD-03` | Mesh, GS and Compare remain reliable even when Integrated cannot correctly compose a material. |
| `PROD-04` | The initial supported GS interaction path raycasts only the invisible same-asset proxy explicitly related to the selected GS family. It converts that approximate hit to a transient candidate in the logical Asset's AssetFrame; the user then adjusts or confirms the ordinary Caption gizmo before a source-less manual anchor is saved. The same proxy is used in simple Mesh+GS mixed, GS-only and Mesh-only visibility, but it is never the saved-position authority and an unrelated visual Mesh is never substituted automatically. A proxy-less GS-only asset is view-only for new placement. Missing, invalid, ambiguous, cross-asset or unregistered interaction data is reported and never guessed; direct splat picking and automatic proxy generation are not initial MVP requirements. |
| `PROD-05` | A topology-changing asset replacement never moves captions or material overrides to a new surface silently. |
| `PROD-06` | Data shown as durably saved survives a reload or process interruption covered by the durability gate. |
| `PROD-07` | Collaboration import exposes unresolved concurrent edits instead of silently choosing a destructive winner. |
| `PROD-08` | Review/share export excludes edit history by construction; clean editable copy starts a new lineage. |
| `PROD-09` | Large GS and package paths degrade quality or refuse safely before browser memory pressure kills the page. |
| `PROD-10` | Unsupported schema, renderer capability, material policy or missing blob produces an actionable diagnosis, not a blank viewer. |
| `PROD-11` | The same validated static source produces the same pose, logical bounds, material class and canonical pick anchor/method across supported backends; candidate-local weak provenance may differ or be absent, and a decoder upgrade cannot reinterpret an existing Representation silently. |
| `PROD-12` | A non-specialist can complete ordinary open/import, caption, merge, export and recovery flows using familiar file/task language, without a Google/LociView account or exposure to actor, HLC, hash, CAS, OPFS, renderer-profile or similar implementation terminology. |
| `PROD-13` | A LociMyu save dataset consisting of an XLSX save, associated model and images, and an optional file-ID map remains convertible into a new LociView project without a Google account or Google API. Conversion never overwrites the selected source artifacts. Every non-empty LociMyu caption data-row occurrence is preserved independently. Duplicate legacy caption identifiers do not identify one target entity: every otherwise valid occurrence becomes a distinct Caption, and no occurrence is dropped, merged or selected as a winner. A uniquely source-authoritative relationship may be applied automatically. An inferred or ambiguous sheet relationship and an unresolved or ambiguous media relationship remain non-authoritative while the source row, reference, candidates and provenance are preserved in the durable expert-review backlog. Such issues do not block the conversion while a bounded, durable and deterministic preserved result can be committed. The ordinary-user flow reports the aggregate result and permits later review; it does not require item-by-item dispositions. Transient caller buffers may be consumed or cleared after ownership transfer; they are not the durable source artifact. |
| `PROD-14` | When an import or conversion can preserve all source facts and isolate uncertain semantics, it MUST continue with the safe preserved result and a durable expert-review item instead of asking an ordinary user for fine-grained decisions. It MUST NOT silently drop, merge, choose a winner, invent a relationship or activate a guessed relationship. An ordinary-user choice is permitted only for a coarse source/target-authority decision, a destructive or irreversible action, or a condition that the accepted contract identifies as preventing any safe preserved result. |

## 3. Product modes and support levels

The four modes are user-visible concepts, not renderer implementation details.

| Mode | Contract |
|---|---|
| **Mesh** | Draw selected non-GS mesh and ordinary point-cloud representations. GS and interaction proxies do not contribute color. |
| **GS** | Draw selected GS representations without Integrated-only exclusions. Mesh proxies do not contribute color. |
| **Compare** | Render Mesh and GS independently with the same project camera, exposure and background, then compare by wipe, split, flicker or side-by-side. It does not promise cross-representation depth composition. |
| **Integrated** | Draw selected non-GS mesh/ordinary-point contributions and GS in one view. The MVP guarantees opaque, alpha-mask/cutout and explicit dithered coverage only. |

The first proxy-backed vertical slice exercises only three visibility patterns on
one paired active AssetRevision: simple Mesh+GS mixed, GS-only and Mesh-only.
These reuse Integrated, GS and Mesh rather than creating a persisted fifth mode;
Compare remains a later workflow. The initial mixed fixture uses an opaque
depth-writing Mesh pass followed by ordinary GS rendering against that depth.
Smooth Mesh alpha, transmission and exact cross-representation multi-layer
composition are not first-slice acceptance.

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

The first supported flow opens one logical Asset whose active AssetRevision
contains a normal Mesh, GS and one unambiguous invisible `interactionProxy`.
For initial placement, the user targets the displayed GS family and the runtime
raycasts exactly the proxy whose `proxyForGsVariantFamilyId` names that family.
The same proxy is used while visibility switches among simple Mesh+GS mixed,
GS-only and Mesh-only. A normal visual Mesh, another proxy or any nearby surface
is never substituted by array order, filename, label, bounds, transform
similarity, visibility or proximity. The proxy only needs to supply a useful
coarse target region and depth; it need not reproduce the GS surface precisely
and never contributes color, visual depth, screenshots or fit bounds.

Caption placement is explicitly two-stage. The proxy intersection is converted
through `representationToAsset` into a transient candidate in the target GS
logical Asset's AssetFrame; no current Caption anchor is committed yet. The user
then adjusts or explicitly confirms the ordinary Caption gizmo. Confirmation
writes `AssetAnchor.positionAsset`, the active GS compatibility class and
`hitEvidence:{method:'manual'}`, omitting proxy normal/source/confidence and any
triangle locator. `positionAsset` is the saved position authority. Proxy hit
details need not be persisted; if retained outside the current anchor for
diagnostics, they are weak evidence, not proxy-frame coordinates or a recipe for
reconstructing the position. Save and reopen use `positionAsset` directly and
never reraycast the proxy; later proxy absence or replacement alone does not
move, invalidate or hide an existing Caption. The ordinary pin UI does not add
a persistent “approximate” badge, and LociView makes no survey-grade claim.
Direct splat/GPU ID picking, normal-Mesh binding and automatic proxy
generation are later optional paths, not first-slice acceptance.

Incomplete paired data degrades exactly as follows:

- usable Mesh plus missing/unusable GS: open Mesh-only and report the GS issue;
- usable GS plus missing/unusable proxy: keep the GS surface view-only for new
  Caption placement; existing Captions retain their saved AssetFrame positions
  and remain editable with the ordinary gizmo;
- invalid, ambiguous or cross-asset proxy binding: disable proxy interaction and
  report it, without selecting another surface;
- unknown registration: keep the pair unregistered and never assume identity or
  infer alignment;
- neither usable Mesh nor usable GS: exclude the asset from the active scene.

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
- a paired Mesh+GS AssetRevision with one explicit invisible same-asset proxy;
- caption edit, package merge conflict review and clean share export;
- opaque/mask/dither Integrated rendering;
- mobile LOD, resident budgets and deterministic degradation;
- missing/corrupt resource diagnosis and recovery paths;
- versioned static-format profiles, deterministic asset bounds and one renderer-neutral ordinary-point footprint contract.

Excluded:

- exact smooth-alpha mesh/GS intersection;
- direct splat or GPU ID/depth picking as an initial product dependency;
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

- LociMyu dataset conversion and LociView v1-package-to-v2 migration are distinct compatibility paths. The user outcome in `PROD-13` is required; whether it is delivered by the integrated importer or a separately packaged tool is an implementation decision, but implementations MUST share one accepted conversion contract rather than silently diverging.
- v1 input remains readable after v2 ships.
- LociView v1-package-to-v2 conversion writes a new v2 project and never overwrites the selected v1 source.
- After explicit v1-package-to-v2 conversion the new project is v2-only-write; no reverse synchronization to v1 is implied.
- Unknown future major versions are read-only or rejected clearly.
- Every new storage or renderer path remains behind a feature flag until its rollback test passes.
- A failed v2 open MUST leave source packages and the last durable local project unchanged.

## 9. Planning envelope

For one developer working with AI, the current public-candidate envelope is **28–44 focused weeks**; one focused week means roughly 25–30 hours of concentrated work. A closed alpha may be reachable after roughly **14–22 focused weeks** if the first candidates pass. These are planning ranges, not delivery promises, and are re-estimated after G0-S and the renderer decision.

Productionizing an acceptable WBOIT approximation may add roughly 3–7 focused weeks. A general exact mesh/GS rasterizer is a separate research programme and cannot be scheduled as an MVP task from the current evidence.

## 10. Product-owner decisions and remaining approvals

Recorded on 2026-08-19:

- the oldest physical iOS target available for repeated alpha testing is iPhone 14 Pro; no iPad/iPadOS support claim is made without a repeatedly testable iPad, while a tablet PC is a separate desktop/touch test class;
- GS/proxy-derived candidates use the ordinary editable pin UI without a persistent approximation badge and the product makes no measurement-grade claim. The later 2026-08-26 two-stage rule makes the initial proxy candidate transient and commits a `manual` current anchor; nonmanual method/confidence remains portable metadata only for a path that actually persists such evidence;
- smooth-alpha Integrated implementation is deferred to optional G1-D after a base renderer passes and does not block the MVP; transmission/refraction remains Unsupported until a later explicit material/research scope because G1-D alone cannot validate it;
- ordinary-point profiles and the current binary default may proceed to G0 visual/device validation;
- `visualPatch + splatExclusion` is the rendering pair for a human-authored/imported repair model, with the MVP hard-mask contract accepted;
- runtime animation playback remains outside the MVP;
- semantic collaboration conflicts fail closed for the affected unit rather than silently selecting a winner.

Recorded on 2026-08-24:

- the useful LociMyu viewing and recording workflow remains a product asset while Google-account dependence is removed and offline/local package use remains the core path;
- LociMyu XLSX/model/image datasets, including an optional file-ID map, remain convertible to LociView without mutating the selected source; this is a product outcome rather than a commitment to an integrated or standalone UI architecture;
- ordinary flows target a non-specialist with roughly Microsoft Office file-workflow literacy; internal storage, merge-clock and renderer terminology is diagnostic detail, not required user knowledge;
- the repeatedly available alpha classes are iPhone 14 Pro/Safari PWA, Windows 11 desktop and Windows 11 tablet PC. G0 records exact measured hardware/browser versions and does not generalize a support guarantee from one model.

Recorded on 2026-08-26:

- deterministic LociMyu Caption identity uses the exact versioned recipe in `04-locimyu-conversion.md`; every duplicate legacy-ID occurrence remains distinct, and the digest-derived ULID-shaped ID is explicitly not a wall-clock creation timestamp or time-sortable migration ID;
- only exact one-to-one source-authoritative sheet/media relationships may activate automatically; unresolved relationships are stocked for later expert batch review rather than presented as ordinary-user questions;
- the first review stock is a private device-local bridge and is deliberately excluded from ordinary package export. It does not satisfy portable-project completion; portable collaboration/resolution requires a separate package/privacy contract.
- landing the identity correction before that private stock is an integration slice, not a claim that unread source can already be recovered later; the original outer ZIP remains required and the transitional slice is not release-complete without the disclosure in `04-locimyu-conversion.md`.
- the standard first interactive configuration is one logical Asset and one
  active AssetRevision containing Mesh, GS and one invisible interaction proxy;
  the same proxy supplies raycasts in simple mixed, GS-only and Mesh-only
  visibility and never becomes a display mode;
- direct splat picking and ordinary-point acceptance are outside the first paired
  vertical slice, while Mesh-only and GS-only assets remain schema-valid;
- automatic proxy generation and advanced mixed transparency/compositing are
  outside the first slice; prepared/imported proxies and the simple opaque mixed
  rule are sufficient;
- the initial GS Caption flow is approximate proxy candidate -> ordinary gizmo
  adjustment/confirmation -> source-less manual AssetFrame anchor. Save/reopen
  uses `positionAsset` and never reraycasts or treats proxy triangle data as the
  position authority;
- mixed visibility selects only the same-Asset proxy whose
  `proxyForGsVariantFamilyId` exactly names the selected GS family; it never
  substitutes an unrelated visual Mesh, nearby surface or another GS proxy;
- base renderer adoption and the first paired slice do not wait for
  ordinary-point, Compare or broader Integrated feature evidence; those
  requirements remain mandatory before their later support claim/control is
  enabled;
- the five incomplete-data outcomes in section 4.5 are fixed product behavior;
  no implementation may infer registration or interaction binding.

Still required later:

- a scripted Product Owner usability walkthrough before public release, using the intended non-specialist persona to complete open/import, caption, merge, export and recovery without implementation terminology; `PROD-12` remains unaccepted until this succeeds;
- tablet-PC hardware/OS/browser details and any additional repeatedly testable release classes;
- G0 performance, memory, package-size, support-class and degradation guarantees after baseline measurement;
- adoption, wording and default behavior for experimental smooth transparency only if G1-D passes, and a separate future decision before any transmission/refraction claim;
- final merge-conflict interaction design and privacy labels; the fail-closed behavior itself is accepted;
- approval of the v1-to-v2 conversion report, stabilized-v1 release and public release.
