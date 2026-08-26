# Gates, evidence and delivery plan

> Status: `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED`

## 1. Gate discipline

Every high-risk gate follows the same sequence:

1. write hypothesis, fixtures, measurement method, hard pass values and fallback before coding;
2. implement a disposable harness on a short-lived branch;
3. save raw logs, environment, hashes, screenshots and failures;
4. obtain a read-only adversarial review from a context that did not implement the change;
5. obtain product-owner visual/physical-device acceptance where required;
6. record `ADOPT`, `REJECT`, or `RETRY` with evidence;
7. discard PoC code and implement the accepted contract cleanly in production.

Average results, a single successful run, or “it appears to work” do not pass a gate. Thresholds cannot be lowered after seeing a failure without documenting a changed product requirement and receiving approval.

Small deterministic fixtures and reports belong in Git. Large GS/package data, Safari traces and device captures remain external artifacts referenced by immutable hash and provenance; they MUST NOT bloat normal AI search scope.

Product Owner dependency amendment recorded 2026-08-26: G1-B may adopt the
base renderer for Mesh, GS, the simple opaque mixed pattern and shared-proxy
interaction without first closing advanced Integrated composition. The existing
`integratedOpaque` and `integratedTransparencyExperimental` controls remain off
until their later fixture/image acceptance passes. This is not a new gate and
does not delete those requirements; it removes them only from the base-renderer
and first paired-slice prerequisite chain.

## 2. G0 — baseline and acceptance inputs

### 2.1 Fixture registry

Each fixture records SHA-256, byte size, splat/triangle/texture counts, bounds, coordinates/units, provenance/license, anonymization, generation or restore instructions, and expected warnings/results.

Required fixtures:

- anonymized real v1 projects: small, medium and largest available operational example;
- a v1 project with caption tags, multiple ordered display sets and `__last`/named-view combinations;
- known divergent v1 copies, ops-only exchange, interrupted workspace and malformed log;
- GS around 100k, 500k and 2–4M splats;
- ordinary PLY and GS PLY with explicit expected classification;
- mesh-only and two-node indexed/reflected triangle models with frozen inspection,
  immutable-record golden bytes and source-occurrence/pick ground truth;
- static GLB fixtures with authored node transforms, initial morph weights, skin/joints and animation clips whose expected no-clip static pose, bounds and pick points are frozen, plus inputs that must be rejected or explicitly `staticPoseBake`d;
- anisotropic GS with nonzero view-dependent coefficients under translation, rotation, positive scale and reflection, with profile-derived finite support bounds and mesh-axis alignment ground truth;
- v1 captions with absent normals and with stored normals under Y-up, Z-up and transformed child nodes; migration output always omits `normalAsset` and emits the exact issue only when a source normal is present;
- 500 MiB incompressible streaming stress data, labelled non-product-guarantee;
- one same-logical-Asset/same-active-AssetRevision Mesh+GS pair with one
  unambiguous invisible proxy-to-GS binding; simple mixed, GS-only and Mesh-only
  visibility all raycast only that same selected-GS proxy, produce a coarse
  AssetFrame placement candidate, require gizmo adjustment/confirmation and
  preserve the resulting manual AssetFrame Caption through save/reopen without
  proxy source/triangle authority, with the simple opaque mixed rule and all five
  fixed incomplete-data outcomes; direct-GS and proxy generation are optional
  later;
- 10,000 captions and 50,000 metadata changes;
- deleted/private sentinel values for package privacy tests;
- parent-delete/concurrent-child and unknown-minor-only-blob fixtures;
- v1 media fixtures with equal bytes under distinct asset IDs plus later-copy attachment prepend/reorder/reviewed duplicate-count/content-revision changes;
- malicious package and model corpus.

Later feature fixtures are retained but do not block G0 exit, base G1-B adoption
or the first paired slice. Before the corresponding support claim or control is
enabled, the same registry discipline applies to:

- opaque/mask/dither plus blend/transmission redirect source-material axes,
  opacity/chroma/final-alpha, duplicate-key and invalid/redirected matrices;
- mesh/GS and ordinary-point/GS intersections, GS visual repair, patch/exclusion
  relationships, external repair/rebind/failure, target switching, mask union and
  excluded-region proxy picks;
- the closed translucent-aircraft scene and its later transparency evidence.
- ordinary PLY/container-mixed/multi-node point rendering and picking, including
  profile footprint, overlap and radius-tie evidence;
- Compare and multiple assets with different origins, axes, units and Sim(3)
  alignment.

G0 owns the failing characterization tests for every known G0-S defect. G0-S begins only after those tests demonstrably fail on the recorded v1 baseline, then owns the minimal fixes that make them pass. The caption-attachment row is the sole approved exception: its Product-Owner-recorded disposition is `historical reproduction unavailable` because the testable production seam and its acceptance first appeared with the fix. That disposition is not a pre-fix failure or PASS, creates no general exception for another row and does not authorize reconstructing historical evidence. Characterization work and fixture collection may proceed in parallel, but G0 does not depend on unstarted G0-S implementation.

### 2.2 Target environments

Record iPhone 14 Pro / Safari PWA as the current oldest repeatedly testable physical-iOS alpha target. Record Windows 11 desktop and Windows 11 tablet PC as separate desktop and desktop/touch classes. Use Edge as their primary Chromium browser and Chrome as a secondary smoke browser, keeping the primary browser/version aligned where practical. Record exact hardware, OS/browser version, PWA versus tab, viewport, device pixel ratio, free storage and available power/thermal conditions without estimating an unavailable value or generalizing beyond the tested class. A newer iOS comparison device is desirable evidence but not an alpha prerequisite; iPad/iPadOS is not a supported release class until a physical iPad can be tested repeatedly. A device class the project cannot repeatedly test is not a supported release class.

### 2.3 Baseline measurements

Use fixed fixtures and camera/input traces to record:

- offline cold start and project open;
- package inspect/import/export;
- first preview and fully usable state;
- p50/p95/max frame time and frame drops;
- pick p50/p95 and method-appropriate placement evidence; the initial proxy path
  records its coarse target-region/depth outcome rather than surface-precision
  error;
- observable JS heap plus reload, memory-warning and context-loss symptoms;
- three background/foreground cycles;
- ten-minute continuous use;
- twenty load/unload cycles;
- storage used before/after and orphan cleanup.

G0 also fixes numeric acceptance for resource plateau and the simple Mesh, GS and opaque-mixed images. It ratifies the exact initial FormatProfile ID/specification-digest registry and goldens needed by the base renderer for static pose, Mesh/GS contribution/source-occurrence enumeration, bounds, minimal opaque source-material semantics and GS transform semantics before either backend may pass base G1-B. At minimum, the backend resource ledger returns to its declared baseline handle/byte count after unload; comparable heap samples from the final five cycles stay within a product-owner-approved percentage of the first stable five and show no approved positive slope. Later feature acceptance separately ratifies ordinary-point pick/diameter/coverage profiles, the complete material resolver, hard AssetFrame splat-mask predicate, chroma evaluator, stable dither matrix/seed/coordinate rule and supported opaque/mask/dither intersection images. A warning alone cannot waive the applicable base or later tolerance.

Changing ratified base profile bytes invalidates affected base G1-B evidence and
requires only those fixtures to run again. Changing point, complete material,
mask, chroma or dither rules invalidates the corresponding later feature
evidence, not an unrelated passing base lane. An implementation/library update
that still passes its applicable byte/image goldens does not create a new
semantic profile.

GS is “unsupported” in the v1 baseline; do not invent a comparison value.

### 2.4 G0 exit

- every base-required fixture can be restored by hash; later feature fixtures are
  required only before their corresponding support claim or control is enabled;
- physical-iOS raw evidence exists;
- v1 G0-S reproductions fail on the unfixed baseline, except for an explicitly
  Product-Owner-approved `historical reproduction unavailable` row as narrowly
  defined in section 2.1; the exception is recorded, never counted as a
  pre-fix failure or PASS;
- package bytes as well as splat counts are recorded;
- resource-plateau and base Mesh/GS/simple-mixed image tolerances are numeric and reproducible;
- initial base Mesh/GS FormatProfile specification/golden hashes are ratified and restorable;
- the product owner approves base support classes, degradation behavior and provisional hard metrics. Later Integrated support claims require their separately retained feature evidence.

## 3. G0-S — blocking v1 safety stabilization

G0-S protects current users and remains a release barrier. After `G0S-TAB` is
implemented, the approved proxy-backed paired Mesh+GS technical vertical slice
may proceed while the remaining G0 and G0-S evidence/fixes continue in parallel,
unless an unresolved P0/P1 directly makes that slice unsafe. Starting that slice
does not complete G0/G0-S, adopt a G1 technology, authorize release, or permit an
unaccepted support claim. G0-S fixes remain the smallest root changes and do not
introduce v2 storage dependencies.

### 3.1 Multi-tab actor/sequence and append safety

Before the per-store actor fix, tabs could share an actor and initialize the same next sequence, so deduplication could silently keep one of two different operations. Each live `ProjectStore` now self-issues a distinct actor, but two tabs can still write the same project without one project-wide authority.

Required behavior:

- each tab/session gets a unique actor instance;
- one project has exactly one editable tab/session at a time; all other tabs are
  explicitly read-only;
- normal edits, merge, package import, model replacement and every other
  project mutation use the same project-scoped authority;
- acquisition failure or ownership loss stops new writes fail closed;
- a tab that receives ownership reopens the durable project state before it can
  become editable;
- `editable`, `read-only` and `lock-lost` are displayed accurately;
- production OPFS uses a browser cross-context lock; no local-storage or
  optimistic lease fallback may claim editable authority.

Acceptance `G0S-TAB`:

- while one tab owns the project, a second tab cannot add any operation or blob
  and is visibly read-only;
- after ownership transfer, the successor reloads durable state before editing,
  and sequential 1,000-operation phases retain every unique operation on reopen;
- package merge/replacement in a non-owner tab is rejected before its first
  project write;
- simulated acquisition failure/loss blocks dispatch, merge and filesystem
  writes without changing in-memory project state;
- target iOS demonstrates safe editing or read-only enforcement.

### 3.2 Recoverable durable-write queue

The recorded unfixed v1 baseline allowed a rejected append to poison the promise chain while memory/UI continued. The current production root now exposes `queued -> writing -> durable` or `failed/retryable` and remains under the acceptance regression below; device durability and overall G0-S exit remain open.

Acceptance `G0S-WRITE`:

- failure before append, after write/before close, transient quota, permanent failure and subsequent writes are injected;
- retry preserves original order and does not skip the failed operation;
- a commit-then-throw duplicate remains idempotent;
- reopened state equals every change acknowledged durable;
- permanent failure never displays “saved” and prevents normal export success;
- device durability and package generation/download-start are separate statuses.

### 3.3 Untrusted operation hardening

Use `Map` or null-prototype indexes. Apply the same duplicate-aware canonical parser and field-aware validator to local dispatch, JSONL open and package merge. Reject dangerous keys recursively, noncanonical structural HLC/ID/actor/member names, actor mismatch, non-finite numbers, excessive depth/nodes/fields/arrays/strings and a serialized line too large for reload. There is no blanket control-character rejection inside `v`: canonical v1 evidence preserves every JSON-escaped valid Unicode scalar as required by `LegacyJcsV1`. Before a known operation reaches the active reducer, its field policy rejects C0/C1 controls except that multiline caption body permits TAB (`U+0009`), LF (`U+000A`) and CR (`U+000D`) exactly as source text. Structural IDs, HLCs, package paths and v2 single-line portable fields remain governed by their stricter control-free grammars. Unknown nested evidence may round-trip without becoming active v2 state.

Acceptance `G0S-OP`:

- `__proto__`, `prototype` and `constructor` at every relevant level do not change `Object.prototype`;
- malformed HLC cannot crash project open after validation;
- invalid local operation reaches neither memory nor queue;
- caption bodies containing TAB/LF/CR produce the same canonical operation and reducer decision on dispatch, reopen, merge and v2 migration; a disallowed control in a known active field is retained as evidence but quarantined before reduction;
- an unknown entity kind or unknown recursively safe member inside `v` round-trips as v1 evidence; an extra top-level operation member is rejected/quarantined under the closed `V1CanonicalOperation` policy;
- same operation key with a different `canonicalOperationDigest` computed by `V1CanonicalOperation + LegacyJcsV1` is reported, never first-wins. G0-S and v1-to-v2 migration use the same golden corpus and collision decision.

### 3.4 Blob/operation consistency

The minimum safe order is:

```text
unique new blob write -> size/hash verify -> metadata operation -> durable barrier
-> old unreferenced blob cleanup
```

Existing-project package merge verifies and places every required new blob before applying metadata. New-project import commits its manifest/completion marker last.

Acceptance `G0S-BLOB` injects failure before/after staging, blob write, verification, dispatch, flush and cleanup, plus concurrent replacement, missing referenced binary and same path/different bytes. Reopen MUST show either old metadata with old blob or new metadata with verified new blob. Temporary orphan bytes are acceptable; a visible dangling reference is not.

### 3.5 Malicious package corpus

Cover traversal, absolute/backslash/NUL/control paths, duplicate/normalized/case-colliding entries, Unicode NFC/NFD and bidi names, duplicate manifest, duplicate raw JSON members/NFC-colliding keys, special/symlink/encrypted/unsupported entries, nested archive, compression bomb/ratio, false sizes, entry/total/operation limits, invalid UTF-8, future major schema, deep JSON, huge line, extra/missing v1 operation members, absent/null payload mismatches, malformed HLC/actor/ID, divergent duplicate operation, missing binary, binary path collision, malicious snapshot, missing/cyclic/cross-asset derivation graphs, cross-owner active binding/revision/parent references, cross-asset/cross-role/cross-content VariantFamily reuse, cross-frame asset/project anchors and saved views, cross-asset/wrong-method/wrong-role/wrong-surface hit evidence, false MIME/extension, HTML/SVG polyglots, external-model URI probes, malformed media, pixel/decode bombs, HTML-like labels and CSV formula payloads.

Current 2 GiB/1 GiB ZIP limits are not safe promises while the implementation materializes whole buffers. G0-S MUST use conservative device-derived limits and MUST NOT claim 2 GiB support.

### 3.6 G0-S exit

- every available reproduction fails before and passes after the fix; the sole
  caption-attachment `historical reproduction unavailable` row retains current
  fix acceptance without being counted as a pre-fix failure or PASS;
- real-browser OPFS/cross-tab tests and malicious corpus pass without crash, prototype mutation or partial activation;
- queued/durable/package UI is accurate;
- typecheck, full tests and production build pass;
- read-only reliability/security review has no P0/P1;
- product owner approves release of the stabilized v1 path.

### 3.7 Stabilized-v1 candidate and release boundary

Candidate designation and release approval are different states. Before final
gate verification, designate one exact commit SHA as the stabilized-v1
candidate and record the prior known-good deployed SHA. Retain a named rollback
branch or tag that resolves to that known-good SHA until post-deploy acceptance;
`workflow_dispatch` is not assumed to accept an arbitrary historical SHA. The
candidate label grants no release status. Bind the final G0/G0-S evidence, typecheck, full test,
fixture/evidence verification, production Pages-path build and independent
review to that exact candidate tree. If a merge or other operation changes the
commit SHA, the resulting SHA is a new candidate and the affected verification
and review MUST run again.

A candidate is release-eligible only after both G0 and G0-S exit, the exact-tree
read-only review has no P0/P1, and the Product Owner approves that exact SHA and
deployment method. The current workflow can deploy either from a push to
`main` or from `workflow_dispatch`; neither trigger is authorized implicitly.
Before triggering either path, the release operator verifies that the checked
out branch/tag resolves to the approved candidate SHA. The resulting Actions
run record MUST report that same head SHA; a mismatch fails release acceptance.

For each authorized deployment, record the Actions run and Pages deployment
identities, URL, served `index.html` and service-worker digests, and the
candidate/local bytes used for comparison. Then run the approved online,
installed-PWA, offline, reload and representative package smoke on the required
device/browser classes. A failed deployment or smoke does not redefine the
candidate as stable: redeploy the retained prior-known-good branch/tag by an
approved manual run, or create and verify a non-destructive revert commit, and
record the rollback run/head SHA. Release assets and fixture-only Release assets
remain separate.

## 4. G1-A — bounded streaming and CAS PoC

PoC scope: File/entry stream to OPFS staging, incremental SHA-256, verified CAS publish, deduplication, blob-first journal/recovery, streamed import/export, cancellation, quota, corruption, concurrent duplicate import and orphan GC.

Hard pass:

- 500 MiB incompressible fixture uses no package/entry-wide `arrayBuffer()` or equivalent hidden copy;
- app-managed simultaneous I/O buffers stay at or below provisional 64 MiB;
- cancellation and every journal interruption leave no active dangling metadata;
- digest mismatch is rejected before metadata commit;
- duplicate input yields one physical verified blob;
- round-trip digest and semantic project match;
- export sink is also bounded; if iOS lacks one, a stated iOS limit or desktop packer fallback is accepted;
- offline/CSP build, license, lockfile and security audit pass.

The 500 MiB fixture is an I/O stress test, not a claim that iOS can display or export every 500 MiB project. `crypto.subtle.digest()` alone does not satisfy incremental hashing.

Failure stops CAS production work and triggers a format/sink/desktop-packer ADR update.

## 5. G1-B — renderer bakeoff

Spark/Three and PlayCanvas use identical source fixtures, camera traces, render scale, exposure/background and hard requirements. Engine-native derivatives are allowed only when preprocessing time, output size and provenance are included.

Base-adoption scenes are limited to the first supported renderer boundary: one
same-logical-Asset/same-active-AssetRevision Mesh+GS pair with one unambiguous
invisible proxy-to-GS interaction binding; simple Mesh+GS mixed, GS-only and
Mesh-only visibility all resolve the selected GS family to that exact proxy and
never include an unrelated visual Mesh. Each path produces a finite hit inside
the fixture's declared coarse target-region/depth envelope, exposes the ordinary
Caption gizmo, and after user adjustment/confirmation saves a manual AssetFrame
anchor with no proxy source/triangle authority. Save/reopen reproduces that
`positionAsset` even after the proxy provenance is unavailable. The mixed smoke
uses an opaque Mesh depth-writing/GS-against-depth rule. The base pack also covers
standalone GS and Mesh, reflected/raw versus identity-baked candidates, the
ratified static pose, anisotropic/view-dependent GS transforms against Mesh axes,
metadata-only bounds, paged/reordered GS input, the five incomplete-data
outcomes, context loss and twenty load/unload cycles.

Later feature acceptance retains the following scenes but does not block G1-B
base adoption or the first paired slice:

- `compareV2`: Compare and multiple aligned assets;
- ordinary-point support: point-only, container-mixed, profile footprint/pick and
  tie fixtures; this acceptance remains required before MVP ordinary-point
  display/picking support is claimed;
- `integratedOpaque`: complete source-material/opacity/chroma/final-alpha matrix,
  opaque/mask/dither intersections, visual patch/exclusion, external repair,
  compatibility/rebind negatives, target switching and excluded proxy picks;
- `integratedTransparencyExperimental`: the closed translucent aircraft and its
  G1-D evidence.

Direct-GS/GPU-ID picking and proxy generation remain optional later paths. A
later acceptance failure keeps only its feature/control unsupported; it does not
retroactively convert a passing base renderer into a failed first slice unless
it exposes a defect in the shared base invariant.

Provisional physical-iOS hard floor, confirmed in G0:

- 500k drawn GS plus representative mesh on the oldest target device;
- 120-second fixed camera trace;
- median at least 24 fps and p95 frame time at most 66.7 ms; 30 fps/50 ms are goals;
- initial preview within 5 seconds from a defined offline local cold open;
- ten minutes without page reload or context loss;
- three successful background/foreground restores;
- bound-surface pick p95 at most 100 ms desktop and 150 ms iOS;
- bound-proxy initial placement is finite and lies inside the fixture's declared
  coarse target-region/depth envelope; no surface-precision pixel threshold is
  imposed on this initial path;
- resource usage reaches a stable plateau after twenty load/unload cycles.

A bound proxy path passes only if it meets its assigned
latency/availability/coarse-envelope requirement and completes gizmo-confirmed
AssetFrame save/reopen without reraycast; merely having bytes is insufficient.
Direct-GS/GPU-ID paths may be evaluated later through their own telemetry, while
the normal pin UI remains one editable gizmo-correctable presentation without a
persistent approximation badge.

Hard functional requirements:

- no external runtime request;
- unknown/digest-mismatched FormatProfiles and profile-summary/decode mismatches fail explicitly without extension-based fallback;
- progressive paging and bounded lifecycle;
- Mesh, GS and the simple opaque mixed visibility pattern;
- one explicit invisible same-asset proxy selected by an exact GS-family
  relationship across the three first-slice visibility patterns; it supplies
  only the initial candidate, and direct-GS, visual-Mesh fallback and proxy
  generation are not required;
- context restore and explicit disposal;
- no backend type in persistent data.
- identical profile-derived static pose, bounds, minimal opaque material class and transformed GS footprint/color basis across both backends, or an explicit Unsupported result.

If both pass comparably, adopt the lower migration/maintenance cost. A hard failure cannot be hidden by a weighted score. If neither passes, stop at the ADR reconsideration trigger.

## 6. G1-C — metadata/Automerge PoC

Scenarios:

- two live tabs and a third-tab restart;
- two offline package copies in both merge orders;
- model-based random commands over multiple seeds;
- 10,000 captions and 50,000 changes;
- process kill at each persistence boundary;
- blob staging versus metadata commit;
- exact detached-change replay after metadata durability/before journal update, with a concurrent same-field replacement;
- exact remote package batches with linear and diamond dependencies, pre-existing changes, duplicate import and a crash after every durable prefix;
- a second tab observing/editing/exporting/GC-attempting while a remote batch is unfinished;
- concurrent active bindings and delete/edit;
- parent deletion versus concurrent child/tag/attachment addition;
- missing-model v1 asset with scale-100/Z-up placement and later verified assignment preserving caption/camera projection;
- device-A conversion/package followed by device-B later-copy migration with stable IDs and v2-only attachment edits;
- invalid/unknown domain values;
- collaboration, review/share and clean-copy export.

Hard merge/durability pass:

- two tabs x 1,000 commands converge after reload and package exchange;
- all domain invariant violations are stopped before SceneDocument;
- every acknowledged-durable change survives injected interruption;
- every crash point recovers to a valid old or new binding with no dangling blob;
- the pinned adapter proves detached change bytes, original dependencies, change-hash presence and hash-idempotent exact replay; recovery never rebuilds a stale command on current heads;
- remote merge preserves original actor/message/dependency/change bytes, verifies the complete source-derived change set and exact final heads, and publishes no partial prefix across tabs or restart;
- a missing final conflict/opaque blob fails before application, while a blob referenced only by a hidden intermediate or weak historical state is not required;
- metadata-only command/recovery verifies existing large resources through the durable inventory without rereading or rehashing their payload bytes;
- same-lineage package order yields equal semantic state; different lineage is rejected;
- multi-tab live coordination is demonstrated, not inferred from IndexedDB safety;
- the 10,000-caption UI remains usable with virtualization and stays within the G0 open/edit budgets; metadata-only speed is insufficient;
- provisional desktop/iOS cold open, edit-to-durable and merge thresholds are approved in G0.

Hard privacy pass:

- collaboration output is labelled history-bearing;
- review/share is built from a validated snapshot without Automerge bytes;
- clean copy blocks until every included semantic conflict is explicitly resolved, then creates a new project and history epoch;
- clean copy topologically re-keys every included record/reference and contains no source lineage/parent/provenance sentinel;
- review/clean re-keying includes anchor-compatibility and composite-group equality classes, while proxy-derived anchors retain internal method/confidence without retaining out-of-closure source provenance or requiring a persistent approximation badge;
- deleted secret, old actor/profile values and unreferenced blobs are absent by semantic parse and raw sentinel scan;
- an unknown-minor-only blob remains protected through old-writer edit, GC attempt and collaboration re-export; unrecognized minor fields block history-free export until a pinned explicit field policy exists;
- non-resolving caption revision provenance does not pull omitted historical blobs into a history-free package;
- collaboration, clean and review manifests accept only their discriminator-specific lineage fields; review is nonmergeable and has no source identity, while clean copy cannot merge into the source lineage.
- migrated collaboration retains the portable migration case and active/conflicting baseline closure across devices; review/clean omit every registry/baseline sentinel and disclose that later-v1-copy continuity is lost.

If the candidate fails, record a replacement ADR. Do not automatically extend the custom v1 HLC/LWW log.

## 7. Optional G1-D — smooth transparency feasibility

This starts only after a base renderer passes and is time-boxed to ten focused workdays. It evaluates a shared-context WBOIT-style compositor, not two completed canvases overlaid by CSS.

The feasibility spike may run immediately after G1-B (before or alongside G1-C) so it can inform scope without changing the base product. Passing evidence records only `ADOPT`/`REJECT` for later use; productionization and any default/feature-flag change wait until the core MVP has passed iOS, migration, corruption, privacy and security hardening plus a separate production review.

Fixtures include the closed aircraft, six-plus layers on a ray, intersecting mesh/GS, a 360-degree camera sweep, draw-order permutations and physical-iOS context restore.

Candidate pass:

- no major popping, full-surface disappearance or order-dependent inversion in accepted reference views;
- product owner judges it useful for comparison, with “approximate” wording;
- p95 frame-time degradation versus base Integrated is no more than 30%;
- extra managed render-target bytes, calculated from actual resolution/formats, remain under the provisional 64 MiB budget;
- the result still meets the absolute G1-B physical-iOS frame-time floor and the total accepted resource ceiling;
- ten-minute iOS and background restore pass;
- feature flag and fallback work.

Passing WBOIT does not guarantee transmission, refraction or exact closed-mesh composition. Failure does not block the MVP and does not automatically authorize front-K or unified-rasterizer scope.

## 8. Exact compositor/rasterizer research

A common fragment-order rasterizer is a separate research track, opened only after real user evidence shows Compare and supported Integrated are insufficient. A disposable WebGPU prototype is expected to require roughly 6–12 focused weeks; a maintainable product backend with fallbacks, mobile work and material coverage could require 12–24 or more focused weeks after that. These are uncertainty ranges, not commitments.

The research track requires its own material scope. Base-color alpha success does not imply glTF metallic/roughness, transmission, volume, refraction or every extension. It cannot become the default through a PoC-code merge.

## 9. Feature controls and legal states

```text
rendererV2
v2WorkspaceCreation
gsStandalone
gsDirectPicking
proxyGeneration
compareV2
integratedOpaque
integratedTransparencyExperimental
```

| Control | Requires | Disabled or unsupported behavior |
|---|---|---|
| `v2WorkspaceCreation` | storage gate adopted | Hides new conversion/creation only. It never chooses a writer for an existing workspace. |
| `rendererV2` | renderer gate adopted | v1 uses the legacy viewer. A v2 workspace opens metadata-only/read-only diagnostics; it is never handed to the v1 viewer or writer. |
| `gsStandalone` | `rendererV2` | GS is diagnosed but not drawn. Use Mesh when available; a GS-only project remains read-only/view-metadata until enabled. |
| `gsDirectPicking` | later optional gate after `rendererV2`, `gsStandalone` | This future control never gates the first paired slice. When disabled, the explicitly bound same-asset proxy remains available in all three visibility patterns; a GS without a usable proxy is view-only. |
| `proxyGeneration` | later optional desktop packer path | Prepared/imported proxies may still be consumed. Generation is outside the first slice and unavailable on iOS. |
| `compareV2` | `rendererV2`, Mesh and GS capability, later Compare acceptance | Offer independent Mesh or GS modes without comparison. |
| `integratedOpaque` | `rendererV2`, simple mixed base, later opaque/mask/dither Integrated acceptance | Keep the first simple mixed pattern plus Mesh, GS and any accepted Compare path; never expose unaccepted advanced Integrated classes. |
| `integratedTransparencyExperimental` | `integratedOpaque`, optional G1-D and production review | Preserve smooth intent and offer supported fallback; experimental smooth compositor stays off. Transmission/refraction remains Unsupported pending a separate future gate. |

The bounded simple opaque Mesh+GS pattern is part of `rendererV2` base adoption;
`integratedOpaque` gates the broader material/intersection/patch classes, not that
first smoke path. No additional persisted mode or feature-control field is added.

`v2WorkspaceCreation` is a migration-cohort control, not a runtime `storageV2` toggle. An existing workspace selects its repository/writer by validated schema major. A build without the required v2 implementation can only diagnose/read safely; a v2-written workspace MUST NOT be opened by a v1 writer.

The control resolver rejects illegal combinations before project mutation. Every legal state has an open mode, read/write permission, diagnostic and fallback test. Turning any control off MUST leave persistent bytes unchanged. Controls are build/local diagnostics, not remotely controlled and not persisted as project truth.

Rollback means preserving the source v1 package/workspace, opening conversion in a new workspace, cleaning incomplete staging, retaining the old history epoch, and falling back to renderer-neutral Mesh/diagnostic paths without modifying metadata. It is never described as flipping a storage flag after v2-only writes.

## 10. Production sequence after gates

This remains the release/adoption sequence. The Product Owner has approved one
narrow scheduling exception: after the bounded `G0S-TAB` production root fix is
committed, the proxy-backed paired Mesh+GS technical vertical slice in item 9 may
start on existing accepted seams while external G0 evidence and remaining G0-S
work continue in parallel. It earns no G0/G0-S exit, G1 adoption, support or
release credit, and an unresolved P0/P1 that directly endangers the slice stops
it. This exception does not authorize the intervening CAS, renderer-port,
journal, transaction or v2-storage work merely because those items precede it
below.

1. G0 fixtures, devices, measurements and contracts, with allowed G0-S work proceeding in parallel only after its failing baseline characterizations exist.
2. G0-S safety fixes; both G0 and G0-S must exit before the exact stabilized-v1 candidate is released under section 3.7.
3. G1-A streaming/CAS decision.
4. G1-B renderer decision.
5. G1-C metadata decision.
6. renderer/storage-neutral domain and ports with unchanged v1 characterization.
7. production blob journal, metadata repository and package classes.
8. ratify the immutable `v1-migration-recipe-1` companion/golden manifest and its one-to-one descriptor, then implement canonical v1 conversion; no durable conversion exists before this sub-gate passes.
9. Proxy-backed paired Mesh+GS vertical slice in one logical Asset/active
   AssetRevision: import -> stream -> switch simple mixed/GS-only/Mesh-only
   visibility -> select GS -> raycast only its explicitly related invisible
   proxy -> coarse AssetFrame candidate -> Caption gizmo adjustment/confirmation
   -> source-less manual `positionAsset` -> durable save -> reload without proxy
   reraycast, including the simple opaque mixed rule and five fixed incomplete-
   data outcomes. Normal-Mesh binding, direct-GS, automatic proxy generation,
   ordinary points and advanced composition do not block this slice.
10. ordinary-point display/picking acceptance, multiple assets, alignment and
    Compare.
11. opaque/mask/dither Integrated and patch/exclusion.
12. iOS, migration, corruption, privacy and security hardening.
13. after core iOS/migration/corruption/privacy/security hardening, productionize a previously adopted G1-D result only through production review; if the feasibility spike was deferred, it may instead run now. Exact-renderer research remains a separate later gate.

## 11. Solo developer plus AI workflow

- The product owner approves UX guarantees, irreversible data choices, gate adoption, conversion and release.
- One implementation branch has one writer. Other models are read-only reviewers.
- Each task cites requirement and acceptance IDs, adds characterization first, changes one boundary, then runs focused and full evidence.
- Architecture, storage, migration and renderer diffs receive an independent review before merge.
- AI may accelerate adapters, validators, fixtures and tests; it does not replace physical iOS, visual judgement, source-data validation or release approval.
- Chat is never the only record. Reports, decisions and failed hypotheses live in the repository or hash-referenced evidence.
- No push, deploy, dependency adoption, migration default or public release occurs merely because an automated test passed.

## 12. Planning ranges and re-estimation

Initial focused-week ranges:

| Work | Range |
|---|---:|
| G0 | 1–2, excluding unavailable fixtures/devices |
| G0-S | 2–4 |
| G1-A streaming/CAS | 2–4 |
| G1-B renderer bakeoff | 2–4 |
| G1-C metadata | 2–4 |
| Optional G1-D WBOIT | maximum 2 for feasibility; 3–7 more if productionized |

G0 through the three required PoCs is therefore roughly 9–18 focused weeks before full productionization. A realistic public-candidate envelope is **28–44 focused weeks** for one developer plus AI, with a closed alpha around **14–22 focused weeks** if the first-choice candidates pass. Re-estimate after G0-S and after the renderer decision using measured throughput. Calendar duration grows substantially below 25–30 focused hours per week.

Metrics must always state fixture, device, format bytes/splat, render resolution and source location. The 64 MiB number is managed buffer/target budget, not total memory; splat count is not memory; average FPS does not replace frame-time distribution.

## 13. Definition of gate completion

A gate is complete only when:

- the implementation/harness and all raw evidence are reproducible;
- failure paths and rollback pass, not only the happy path;
- typecheck, relevant tests, full tests and build pass;
- browser/manual and physical-iOS evidence exists where required;
- independent review has no unresolved P0/P1;
- decision and rejected alternatives are recorded;
- the product owner supplies any listed human acceptance.
