# Product and release contract

> Status: `PRODUCT-OWNER APPROVED CONTRACT / IMPLEMENTATION AND GATE STATUS ARE SECTION-SPECIFIC`

## 1. Product outcome

LociView v2 is a local-first, offline-capable browser viewer for portable project packages. It MUST let a non-specialist open a project, place multiple visual Assets and formats as independent layers in one shared Project coordinate space, show or hide each Asset, place and edit captions, exchange project packages, and recover from unsupported or damaged inputs without silently losing work. Mesh, ordinary points and Gaussian Splatting (GS) are supported Representation kinds rather than the user's primary visibility grouping.

The current application remains the migration base. v2 replaces storage and rendering internals behind explicit ports while preserving the useful LociMyu/LociView viewing and recording workflow and the ability to open source v1 packages. Ordinary file, caption, merge, export and recovery flows target a person comfortable with normal Microsoft Office file workflows; they MUST NOT require developer, 3D-engine, storage-engine or synchronization-protocol knowledge.

When a deterministic non-lossy default can preserve every source record, the
product MUST apply that default without asking an ordinary user to decide
technical identity, storage or migration details. Uncertainty that does not
prevent safe preservation is retained in the bounded, adapter-specific form
approved for that conversion and disclosed in a concise summary. For the first
LociMyu adapter that form is the separately retained original ZIP plus an
exportable conversion report; it is not project-local review storage. The
product blocks only the affected unit or commit when continuing would lose a
record, guess a semantic relationship or violate an invariant. Exclusion,
destructive merge and silent guessed linkage are never defaults.

## 2. Non-negotiable user outcomes

| ID | Outcome |
|---|---|
| `PROD-01` | A project remains portable as a bounded, inspectable package and does not require a LociView server or account. |
| `PROD-02` | Multiple visual Assets, including Mesh, ordinary-point and GS data, can coexist in one ProjectFrame and be aligned without rewriting source assets. Each loaded visual Asset is an independent layer that can be selected and shown or hidden regardless of its Representation kind. The standard GS interaction configuration may keep its GS and invisible interaction proxy in one logical Asset and active AssetRevision; Mesh-only, point-only and GS-only Assets remain valid. |
| `PROD-03` | A material or cross-Representation composition that cannot be rendered safely is diagnosed and degrades only the affected contribution; it does not require a separate Compare product mode or make unrelated visible Assets unusable. |
| `PROD-04` | The initial supported GS interaction path raycasts only the invisible same-asset proxy explicitly related to the selected visible GS family. It converts that approximate hit to a transient candidate in the GS Asset's AssetFrame; the user then adjusts or confirms the ordinary Caption gizmo before a source-less manual anchor is saved. Hiding that GS Asset also removes its proxy from interaction. A selected visible Mesh Asset raycasts itself; an unrelated visual Mesh is never substituted for a GS proxy. The proxy is never the saved-position authority, and a proxy-less GS Asset is view-only for new placement. Missing, invalid, ambiguous, cross-asset or unregistered interaction data is reported and never guessed; direct splat picking and automatic proxy generation are not initial MVP requirements. |
| `PROD-05` | A topology-changing asset replacement never moves captions or material overrides to a new surface silently. |
| `PROD-06` | Data shown as durably saved survives a reload or process interruption covered by the durability gate. |
| `PROD-07` | Collaboration import exposes unresolved concurrent edits instead of silently choosing a destructive winner. |
| `PROD-08` | Review/share export excludes edit history by construction; clean editable copy starts a new lineage. |
| `PROD-09` | Large GS and package paths degrade quality or refuse safely before browser memory pressure kills the page. |
| `PROD-10` | Unsupported schema, renderer capability, material policy or missing blob produces an actionable diagnosis, not a blank viewer. |
| `PROD-11` | The same validated static source produces the same pose, logical bounds, material class and canonical pick anchor/method across supported backends; candidate-local weak provenance may differ or be absent, and a decoder upgrade cannot reinterpret an existing Representation silently. |
| `PROD-12` | A non-specialist can complete ordinary open/import, caption, merge, export and recovery flows using familiar file/task language, without a Google/LociView account or exposure to actor, HLC, hash, CAS, OPFS, renderer-profile or similar implementation terminology. |
| `PROD-13` | A LociMyu save dataset consisting of an XLSX save, associated model and images, and an optional file-ID map remains convertible into a new LociView project without a Google account or Google API. Conversion never overwrites the selected source artifacts. Every otherwise-valid non-empty LociMyu caption data-row occurrence with a non-empty stable legacy ID is preserved independently. A row whose trimmed legacy-ID cell is empty is treated as an empty Caption row: it creates no Caption, affects no occurrence ordinal and is explicitly reported while the unchanged source remains available. Duplicate non-empty legacy caption identifiers do not identify one target entity: every occurrence becomes a distinct Caption, and no occurrence is dropped, merged or selected as a winner. Only a uniquely source-authoritative relationship may be activated automatically. An inferred or ambiguous sheet relationship and an unresolved or ambiguous media relationship remain inactive or unlinked; an exportable conversion report records the source sheet, row, ID, affected field, reason and impact. The original outer ZIP remains outside the Project under user control, and that ZIP plus the report are the audit record. The new native Project is the working source of truth. Invalid non-empty identity or collision blocks publication rather than inventing an ID. The ordinary-user flow reports aggregate results and does not require item-by-item decisions. |
| `PROD-14` | When an import or conversion can preserve every otherwise-valid record and isolate uncertain semantics, it MUST continue with the safe preserved result and the bounded accounting approved for that adapter instead of asking an ordinary user for fine-grained decisions. It MUST NOT silently drop, merge, choose a winner, invent a relationship or activate a guessed relationship. The first LociMyu adapter uses an exportable report and separately retained source ZIP; it adds no project-local sidecar, quarantine or review database. An ordinary-user choice is permitted only for a coarse source/target-authority decision, a destructive or irreversible action, or a condition that the accepted contract identifies as preventing any safe preserved result. |
| `PROD-15` | In the first public candidate, a Native Project is the only user-writable Project authority. Legacy v1 remains a compatibility source that can be safely inspected, imported without rewriting its operation text, opened explicitly in View, or converted non-destructively into a separate Native Project. The candidate exposes no legacy project creation, Edit mode, operation dispatch, CSV application, model/media mutation, legacy package/CSV export or ZIP merge. This restriction does not remove Native editing, Native backup/restore or Native Package Exchange, including its bounded Caption/new-image collaboration merge. |
| `PROD-16` | Caption video and audio are required LociView product capabilities after the first public candidate, even when absent from the current representative sample. The first public candidate completes supported still-image attachments, including single-still HEIC/HEIF, before video/audio; video/audio are not candidate blockers but are the first required major post-candidate media workstream. This makes no claim that LociMyu itself provides video/audio and does not justify a permanently image-only schema or UI. The ordinary-user concept is `添付メディア`: the candidate exposes only working still-image actions and uses one media-neutral viewing stage without advertising unavailable video/audio controls. HEIC/HEIF support must preserve the selected source bytes, work locally and completely offline through direct add and LociMyu conversion, and round-trip through applicable Native package purposes; it must not silently replace and discard the source with JPEG/WebP or use a CDN/server conversion path. Live Photo video, animated HEIF/HEIF image sequences, burst/depth/auxiliary selection, RAW/ProRAW, strict HDR/10-bit fidelity and image editing are outside the candidate. The approved bounded implementation uses dual-read Native snapshot schemas 1/2 and a locally built exact libheif/libde265 decoder candidate as specified in `02-storage-package-migration.md` section 29.1; this does not adopt a public-distribution license or resolve HEVC patents. Video/audio formats/codecs, streaming, viewer, privacy and physical-iOS support require their own later bounded contract and gate evidence. |

## 3. Asset visibility and composition support

The primary user-visible display model is an ordered collection of loaded visual
Assets in one ProjectFrame. Each Asset is independently selectable and visible or
hidden. Mesh, ordinary points and GS identify Representation/rendering kinds;
they do not divide the project into mandatory product modes.

The first proxy-backed native slice retains `mixed`, `gs-only` and `mesh-only`
as project-wide convenience filters for its bounded one-Mesh/one-GS snapshot v1.
They are not the final multi-Asset visibility model and do not justify a new
mode framework. Its simple shared view uses an opaque depth-writing Mesh
contribution followed by ordinary GS rendering against that depth. Smooth Mesh
alpha, transmission and exact cross-Representation multi-layer composition are
not base acceptance.

A separate diagnostic comparison presentation—such as wipe, split, flicker,
side-by-side or independently composited outputs—is optional later work. It is
not an MVP or release prerequisite and requires a new explicit Product Owner
decision before implementation.

Support labels MUST appear in UI and diagnostics:

- **Supported**: covered by release acceptance tests and a documented fallback.
- **Experimental**: opt-in, may be disabled automatically under resource pressure, and never changes saved intent silently.
- **Unsupported**: blocked with a route to hiding the affected Asset/contribution, another supported material presentation, or an explicit material conversion.

Smooth alpha blend, transmission/refraction and arbitrary multi-layer intersection between closed mesh and GS are not **Supported** in the MVP. After G1-D, a backend MAY offer an explicitly experimental smooth-alpha approximation while preserving the requested semantic material policy. Transmission/refraction remains **Unsupported** and redirected until a separate later material/research gate; G1-D does not authorize it.

Display sets preserve the LociMyu sheet-switching outcome: one appearance set combines Caption membership, set-scoped material appearance and an optional default saved view. Per-Asset visibility remains a separate required capability and may be recalled by that saved view; this amendment does not introduce a second layer/domain model or decide a new persistence framework. V2 MUST preserve Caption tags, portable set ordering and an explicit per-set default view.

## 4. Primary flows

### 4.1 Open and inspect

1. Inspect package header, schema, limits and integrity without committing data.
2. Estimate storage and rendering feasibility.
3. Stream verified content to staging storage.
4. Commit metadata only after required blobs are verified.
5. Open the safest supported visible subset and explain any degradation.

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

The first supported flow opens a GS Asset whose active AssetRevision contains a
GS family and one unambiguous invisible `interactionProxy`. An independent Mesh
Asset may be visible in the same ProjectFrame, but it need not describe the same
object, extent, origin or logical Asset. For initial placement, the user targets
the visible GS family and the runtime raycasts exactly the same-Asset proxy whose
`proxyForGsVariantFamilyId` names that family. Hiding that GS Asset removes both
its visual contribution and proxy from interaction. A normal visual Mesh,
another proxy or any nearby surface is never substituted by array order,
filename, label, bounds, transform similarity, visibility or proximity. The
proxy only needs to supply a useful coarse target region and depth; it need not
reproduce the GS surface precisely and never contributes color, visual depth,
screenshots or fit bounds.

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

Incomplete data degrades exactly as follows:

- a usable independent Mesh plus missing/unusable GS leaves the Mesh available
  and reports the GS issue;
- usable GS plus missing/unusable proxy: keep the GS surface view-only for new
  Caption placement; existing Captions retain their saved AssetFrame positions
  and remain editable with the ordinary gizmo;
- invalid, ambiguous or cross-asset proxy binding: disable proxy interaction and
  report it, without selecting another surface;
- unknown required transform/registration disables only the affected Asset or
  interaction path and never assumes identity or infers alignment;
- when neither visual Asset is usable, activate neither one; failure of one Asset
  never disables an unrelated valid Asset.

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
- multiple-format, multiple-Asset shared-coordinate display with per-Asset visibility and manual alignment;
- a GS AssetRevision with one explicit invisible same-asset proxy, coexisting
  with independent Mesh, point or other GS Assets;
- caption edit, package merge conflict review and clean share export;
- opaque/mask/dither shared-view composition;
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
5. disable unsupported/experimental composition while preserving supported visible Assets and explaining the affected contribution.

It MUST NOT evict the only source copy, an attachment, or an irreplaceable display resource automatically. Safari does not expose a reliable universal GPU-memory limit, so physical-device stability, context loss, background/restore and frame-time evidence are release criteria.

## 8. Compatibility and rollback

- LociMyu dataset conversion and LociView v1-package-to-v2 migration are distinct compatibility paths. The user outcome in `PROD-13` is required; whether it is delivered by the integrated importer or a separately packaged tool is an implementation decision, but implementations MUST share one accepted conversion contract rather than silently diverging.
- v1 input remains readable after v2 ships. In the first public candidate it is
  not a user-writable Project format.
- LociView v1-package-to-v2 conversion writes a new v2 project and never overwrites the selected v1 source.
- After explicit v1-package-to-v2 conversion the new project is v2-only-write; no reverse synchronization to v1 is implied.
- Unknown future major versions are read-only or rejected clearly.
- Every new storage or renderer path remains behind a feature flag until its rollback test passes.
- A failed v2 open MUST leave source packages and the last durable local project unchanged.

## 9. Planning envelope

The historical broader v2/support-planning envelope was **28–44 focused
weeks**; one focused week meant roughly 25–30 hours of concentrated work. That
estimate does not govern the separately approved Native-only first public
candidate in `PROD-15` and is not a delivery promise.

Productionizing an acceptable WBOIT approximation may add roughly 3–7 focused weeks. A general exact mesh/GS rasterizer is a separate research programme and cannot be scheduled as an MVP task from the current evidence.

## 10. Product-owner decisions and remaining approvals

Recorded on 2026-08-19:

- the oldest physical iOS target available for repeated alpha testing is iPhone 14 Pro; no iPad/iPadOS support claim is made without a repeatedly testable iPad, while a tablet PC is a separate desktop/touch test class;
- GS/proxy-derived candidates use the ordinary editable pin UI without a persistent approximation badge and the product makes no measurement-grade claim. The later 2026-08-26 two-stage rule makes the initial proxy candidate transient and commits a `manual` current anchor; nonmanual method/confidence remains portable metadata only for a path that actually persists such evidence;
- smooth-alpha shared-view composition is deferred to optional G1-D after a base renderer passes and does not block the MVP; transmission/refraction remains Unsupported until a later explicit material/research scope because G1-D alone cannot validate it;
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
- the bounded first interactive configuration recorded at that time used one
  logical Asset and active AssetRevision containing Mesh, GS and one invisible
  interaction proxy. The 2026-08-29 clarification below supersedes that pairing
  as the general product model: the required relationship is only between a GS
  family and its same-Asset proxy, while visual Mesh Assets may be independent;
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
  ordinary-point or broader composition evidence. Ordinary-point support and
  any claimed advanced composition class require their own later evidence;
  Compare has no required support claim/control unless separately approved;
- the five incomplete-data outcomes in section 4.5 are fixed product behavior;
  no implementation may infer registration or interaction binding.

Recorded on 2026-08-31, superseding only the 2026-08-26 local review-stock
delivery mechanism (not its identity or source-authority rules):

- the user retains the exact outer LociMyu ZIP separately and the converter
  emits an exportable accounting report;
- the first direct adapter does not copy the ZIP into the native Project and
  does not add a device-local sidecar, quarantine/review database or portable
  review continuity;
- an otherwise-valid Caption remains active while an ambiguous relationship is
  inactive or unlinked and reported;
- a non-empty source row whose trimmed legacy-ID cell is empty is treated as an
  empty Caption row by the direct adapter, creates no Caption or occurrence and
  is reported without changing the source;
- an invalid non-empty identity, duplicate canonical identity or digest
  collision still blocks publication.

Recorded on 2026-08-29:

- the primary display unit is each loaded visual Asset/layer in one ProjectFrame;
  Mesh, ordinary points and GS are Representation kinds rather than mandatory
  user-visible modes;
- multiple-format and multiple-Asset projects require per-Asset selection,
  visibility, placement, editing and durable restore;
- the native snapshot-v1 `mixed` / `gs-only` / `mesh-only` values remain bounded
  convenience filters for the implemented one-Mesh/one-GS path, not the final
  multi-Asset interaction model;
- formal Compare is not an MVP, release or next-workstream requirement. It may be
  reconsidered only as an optional diagnostic workflow after a separate Product
  Owner decision;
- the LociMyu-derived DisplaySet remains an appearance set joining Caption
  membership, set-scoped material appearance and an optional default SavedView.
  Per-Asset visibility is required, but this decision does not invent a second
  layer model or force its exact persistence placement without the bounded
  implementation design.

Recorded on 2026-09-03:

- the first public candidate uses option A: Native is the sole user-writable
  Project authority, while legacy v1 is limited to safe import, explicit View
  and non-destructive conversion into a separate Native Project;
- the absence of video/audio from the current private representative is not a
  product-scope decision. Caption video/audio remain required post-candidate
  development under `PROD-16` and the media boundary in
  `01-domain-rendering.md` section 4.4; this clarification does not itself
  select codecs, dependencies, package versions or a production implementation;
- legacy v1 new-project creation, Edit, operation dispatch, CSV application,
  model/media mutation, package/CSV export and ZIP merge are not
  public-candidate functions. Native
  backup/restore and Native Package Exchange remain available, including the
  accepted Caption/new-image collaboration merge;
- this decision defers rather than completes or waives the remaining writable-v1
  G0S-S2/S3 work. Re-enabling legacy writes requires a later Product Owner
  decision and completion of the applicable gates;
- the Product Owner's selection and follow-up confirmation authorize only the
  bounded `RC-A-01`–`RC-A-07` implementation and verification. They do not
  adopt a license, choose an application/package version or release SHA,
  integrate `main`, create a Release or deploy GitHub Pages.
- single-still HEVC HEIC/HEIF stores the original selected bytes as the only
  durable media authority. Decoded pixels are runtime-only, discardable and
  reproducible presentation resources and never enter Project packages;
- Native snapshot schema `2` is introduced for this bounded capability. New
  readers accept schemas `1` and `2`; an existing schema-1 Project remains at
  schema 1 until HEIC/HEIF is first admitted, then upgrades monotonically to
  schema 2 and never automatically downgrades, including after HEIC removal;
- the approved decoder candidate is a reproducible LociView-managed local build
  from exact libheif `v1.23.3` and libde265 `v1.1.1` upstream sources with an
  exact pinned Emscripten toolchain, a small bridge and a same-origin module
  Worker. This is not approval to implement a codec, adopt an LGPL compliance
  position, resolve HEVC patent exposure or distribute the resulting binary;
- a one-time current-wrapper check and a physical-iPhone native-HEIC smoke
  precede the local WASM build. A successful iPhone Safari native path remains
  first choice there; failure makes iPhone part of the WASM fallback path.

Still required later:

- a scripted Product Owner usability walkthrough before public release, using the intended non-specialist persona to complete open/import, caption, merge, export and recovery without implementation terminology; `PROD-12` remains unaccepted until this succeeds;
- tablet-PC hardware/OS/browser details and any additional repeatedly testable release classes;
- G0 performance, memory, package-size, support-class and degradation guarantees after baseline measurement;
- adoption, wording and default behavior for experimental smooth transparency only if G1-D passes, and a separate future decision before any transmission/refraction claim;
- final merge-conflict interaction design and privacy labels; the fail-closed behavior itself is accepted;
- approval of the exact Native-only candidate and public release; stabilized-v1
  approval remains required before any future candidate re-enables legacy writes.
