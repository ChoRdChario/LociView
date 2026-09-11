# Documentation authority index

This index prevents current v1/Native behavior, historical plans and the
accepted-but-not-yet-implemented v2 architecture from being treated as one
observed implementation.

## Purpose-specific authority

| Purpose | Authority |
|---|---|
| Working and collaboration rules | `AGENTS.md` |
| Currently observed implementation behavior | Current code and executable tests |
| v1 package/wire compatibility | Frozen v1 contract plus G0 golden fixtures |
| Accepted architecture/product invariants | Accepted ADR; constrains PoCs and specifications immediately |
| Candidate technology and performance guarantees | Adopted specification only after the relevant gate passes |
| Navigation and known current risks | `PROJECT_MAP.md` |
| Fresh-session checkpoint and stop boundary | `tasks/handoff.md`; navigation only, never a product specification |
| Active work sequencing | `tasks/todo.md`; never a product specification |
| Current implementation/connection coverage | [Whole-scope inventory](../tasks/implementation-inventory.md): 64 work groups and all 41 UI tasks; route-specific gaps, gates and recommended dependencies, not a new specification |
| Recurrent failure patterns | Task-relevant entries in `tasks/lessons.md`; advisory until promoted to a rule/ADR |
| Accepted UI/UX presentation principles | Blocks marked `Accepted requirement` in `ui-product-guidelines.md`; behavior and safety still come from the applicable product specification |

If observed code conflicts with the applicable compatibility or accepted future contract, stop and resolve the discrepancy explicitly. Neither side silently overwrites the other.

Latest bounded connection: metadata model-status candidates can be compared and
explicitly resolved without changing Caption data. The synthetic host also receives
model updates; ordinary-file, rendered/device and aggregate team acceptance remain
pending. Todo and the inventory retain remaining model-copy and adoption boundaries.
Model membership keep-one is also connected; independently editable model
keep-both still awaits its complete remap/content-fact implementation.

## Classification

| Document | Status | Use |
|---|---|---|
| `00-design-philosophy.md` | `CURRENT PRINCIPLES / V1 EXAMPLES` | Long-lived principles; operation-log examples are v1-specific |
| `01-vision-requirements.md` | `V1 BASELINE / PARTLY SUPERSEDED` | Original goals and v1 requirements; not the new v2 scope |
| `02-data-format.md` | `FROZEN V1 FORMAT` | Compatibility and migration reference only; do not extend for v2 writes |
| `03-architecture.md` | `HISTORICAL DESIGN` | Contains implementation drift; use code and `PROJECT_MAP.md` for current behavior |
| `04-formats-rendering.md` | `V1 RENDERING BASELINE` | Default-v1 GLB/OBJ/STL/ordinary PLY; the bounded native GS path is outside this legacy contract |
| `05-ui-ux.md` | `V1 PRODUCT + SUPERSEDED DRAFTS` | Current UI intent mixed with earlier proposals; code wins on conflict |
| `06-device-offline.md` | `V1 PRODUCT + UNVERIFIED TARGETS` | OPFS/PWA intent; size, streaming, sharing, and single-file claims are not guarantees |
| `07-roadmap.md` | `SUPERSEDED 2026-07 ROADMAP` | Historical only; never use as the active plan |
| `08-ios-test-guide.md` | `V1 QA RUNBOOK` | Current manual v1 check, not a v2 GS performance specification |
| `09-locimyu-migration.md` | `V1 LEGACY RUNBOOK` | Existing legacy import guidance; ambiguous filename cases remain possible |
| `ui-product-guidelines.md` | `PRODUCT-OWNER APPROVED UI/UX PRINCIPLES / IMPLEMENTATION AND ACCEPTANCE STATUS ARE SECTION-SPECIFIC` | Accepted-labelled interaction, information architecture, writing and visual principles; `Current implementation`, `Evidence pending` and `Proposed` blocks are informative and gain no authority from this index |
| `licensing-and-ownership.md` | `PRODUCT-OWNER APPROVED DIRECTION / PROPOSED ADOPTION / NO LICENSE GRANT` | Ownership/relicensing record, freedom-first MPL-2.0 candidate, material scopes and formal adoption gate |
| `sponsorship-policy.md` | `PRODUCT-OWNER APPROVED DIRECTION / PROPOSED OPERATIONAL POLICY` | Sponsor acknowledgement, individual consultation, privacy, influence and release boundaries; no sponsor is accepted by the document |
| `g0/device-performance-runbook.md` | `G0 EVIDENCE CONTRACT / NO MEASUREMENTS RECORDED` | Repeatable device/performance procedure and provisional, unapproved observations |
| `g0/g0-coverage-map.md` | `G0 ACTIVE COVERAGE MAP / NO GATE CLAIM` | One-to-one status and blocker map for every G0 section 2.1–2.4 requirement |
| `g0/gs-source-profile-candidate.md` | `G0 PREFLIGHT CANDIDATE / NOT RATIFIED / NO RENDERER GUARANTEE` | Exact Gaussian PLY source-envelope preflight and ratification inputs; companion tiny artifacts remain characterization, not a FormatProfile, renderer or support claim |
| `g0/fixture-acquisition-contract.md` | `PRODUCT-OWNER RATIFIED / MODE B IMPLEMENTED OFFLINE / MODE A NOT IMPLEMENTED` | Exact Mode-B CLI/core/schemas exist and are offline-verified; real network, Release, publication and adoption actions remain unexecuted and retain separate stops |
| `v2/00-approved-direction.md` | `ACCEPTED DIRECTION SUMMARY / NON-NORMATIVE / NOT IMPLEMENTED` | Navigation summary; ADR and approved specifications are authoritative |
| `adr/0001-v2-foundation.md` | `ACCEPTED DIRECTION / CONDITIONAL TECHNOLOGY` | Rationale, rejected alternatives, and reconsideration triggers |
| `adr/0002-project-scenes-and-continuing-team-history.md` | `ACCEPTED DIRECTION / CONDITIONAL TECHNOLOGY` | Project-as-workspace, Scene composition, Project-wide model revisions and continuing causal file collaboration |
| `history/legacy-locimyu-alpha.md` | `PROVENANCE` | Location and hashes of archived legacy evidence |
| `history/task-ledger-through-d32a6a0.md` | `HISTORICAL TASK LEDGER` | Completed development records through the pre-consolidation native checkpoint; not an active plan or product specification |
| `specs/README.md` | `PRODUCT-OWNER APPROVED CONTRACT / NOT IMPLEMENTED` | Index and authority for the gated v2 implementation contract |
| `specs/00-product-contract.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | Product guarantees, MVP boundary, privacy and mobile behavior |
| `specs/01-domain-rendering.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | Frames, revisions, SceneDocument, modes, picking and renderer gates |
| `specs/02-storage-package-migration.md` | `PRODUCT-OWNER APPROVED / BOUNDED NATIVE SECTIONS 13–31 IMPLEMENTED WHERE MARKED / §29.1 DIRECT HEIC DEFERRED / GENERAL V2 NOT IMPLEMENTED` | General metadata/CAS candidate boundaries plus implemented Native snapshot/package, multi-Asset, DisplaySet/media receiver, package exchange, Native-only write authority and §29.3 device-side HEIC compatibility boundary |
| `specs/03-gates-and-delivery.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | G0/G0-S/G1 evidence, thresholds, feature flags, rollback and schedule |
| `specs/04-locimyu-conversion.md` | `PRODUCT-OWNER APPROVED / BOUNDED DIRECT ADAPTER IMPLEMENTED / PRODUCT ACCEPTANCE PASS` | Exact LociMyu identity/source authority and report boundary; six representative rows with an empty trimmed ID are reported as empty input, while 103 Captions publish and survive portable restore without changing the source; Desktop and physical-iPhone acceptance passed |
| `specs/05-project-scene-team-workflow.md` | `PRODUCT-OWNER APPROVED / BOUNDED CORE, PROVIDER, SYNTHETIC UI AND METADATA SERVICE` | Reusable core/provider and separate memory/old-saved/new-metadata paths exist. New service saves bounded synthetic edits, full-source receive, Caption resolution/copies and prepared-model/pin team rounds through storage ports. No ordinary-app/real-file adoption, general renderer or rendered/device acceptance. Product wire/migration remains unimplemented; current Native bytes unchanged. Current coverage is in the implementation inventory |
| `specs/06-project-package-wire.md` | `PROPOSED / UNRATIFIED / NOT IMPLEMENTED` | Five-purpose wire companion draft; explicit delta/journal, base-receipt, budget and snapshot-builder ratification inputs. No adopted format/version, production bytes or gate credit |
| `specs/07-project-scene-migration.md` | `PROPOSED / UNRATIFIED / NOT IMPLEMENTED` | New migration identity/portable Native bridge draft, source-managed guards, shared unit/birth artifacts and prepared-migration source; calculated identity and scoped candidate feasibility are not converter/adoption proof. §10.1 owns the finite service-level next slice |

## Known implementation drift

2026-09-11 decision package: `tasks/todo.md` distinguishes reused G1-A/C evidence,
actual remaining platform/scale/security inputs and the separate S2 wire gates.
The PO-approved amendment in 05 §13.2 allows earlier S1 implementation and the
three pinned root dependencies, limited to new synthetic development workspaces
until product adoption. It does not waive the empty-root contract or gate status.
The approved Repo-only uuid 11.1.1 override closes the dependency preflight hold:
runtime audit is clear and actual Repo API compatibility passes. The five unchanged
toolchain findings remain separate; this is not product service/adoption credit.
The reusable `src/projectMetadata` foundation now creates empty-root lineage,
preserves original atomic histories and prepares Caption text without a winner
shortcut. The new Repository/Session/journal now connects that source to fenced
Repo storage, independent stored readback and marker-last publication, with exact
retained retry. Persistent immutable content facts exclude the metadata token and
require current inventory/presence. Synthetic memory-port tests cover this service;
the new `storage=metadata` development mode now wires OPFS/IndexedDB/Web Locks,
exact synthetic-body inventory and the existing editor to that service. Typed
Caption text/color, manual pin add/move and Scene Caption/model include/exclude
now share its journal and exact retry; one added pin is one original change.
Saved View create/recapture/name/order/delete and Scene entry set/clear also use
that path; exact original field versions protect retained captures and entry drafts.
Optional entry clear preserves domain absence rather than adding a nullable schema.
Exact Project/Scene material create/appearance-edit/confirmed reset now shares
the same retained save/retry. Complete original routing reservations guard the
existing lighting/sidedness/hard-chroma UI; no base-color input was added.
Explicit known-PNG introduction/attachment and description/order/confirmed deletion
now use that same service. Existing run seeds stay unchanged and the gallery
uses verified saved image bytes. The blob delta is sealed with retained originals;
unattached media inspection does not change strong roots. Project-wide model
translation now uses a fresh binding/status change, same-provider model projection
and the shared translation gizmo for preview/cancel/confirm. Original Caption
coordinates, memberships and saved model payloads remain unchanged. Geometry
replacement, real-file input and exchange stay
unconnected in this new mode, not removed from old modes or product requirements.
Old saved runs and ordinary home remain unchanged. Actual browser/input and
physical iOS evidence remain pending; source-only `reopen` itself is still not a
saved-workspace receipt. Current todo and uiux-handoff now lead to the consolidated
new-host Desktop check, not repeated old probe acceptance.

Current readiness review (2026-09-10): `tasks/todo.md` top separates approved
outcomes, exact wire/migration design gaps and remaining storage/device evidence.
05 §9.4 records PO-approved unplaced-Caption preservation and the proposed atomic
schema/bridge mapping. 06 §§4.1/5.1/8–9 define retained base evidence, nonvisual
owners and full/delta recovery with structural vectors. Runtime still lacks the
unplaced branch; no adopted wire/recipe or executed byte goldens are claimed.
The next recipe portion is now drafted in 07: source identity/ID keys, portable
baseline/registrations, source-managed Scene/attachment guards and shared original
artifacts. Four identity examples were computed, not a whole converter proven.
Sections 5–7.2 now draft that managed-unit/introduction/prepared-migration interface.
Four added existing-candidate tests pass (10 harness tests total), limited to
shared bytes/objects and explicit guards, not admitted domain or durable conversion.
The isolated journal now has a dedicated preparedMigration seam with exact retained
source and recovery, exercised by eight added synthetic cases. The complete
existing development source now also reaches same-head managed/birth inspection,
actual temporary-CAS content verification and the journal under an explicit
candidate-only flat profile. Seven service cases cover local work, scoped review,
retained original bytes and reopen/replay. No new browser page or durable UI
activation; exact wire/profile/whole-converter and adoption inputs remain open.
05 §13.4's finite intermediate step was PO-approved on 2026-09-11: explicit opt-in
synthetic-only save/reopen in the same development host. The journal-backed pair,
separate retained bases, acknowledged-head UI and exact retry now connect to
dedicated development OPFS/IDB ports. Node/mounted checks are distinct from the
subsequent PO-reported four-group Desktop PASS at served `f341833`: text exchange,
both-participant reload, explicit title choice and replay/final reload. This
closes that saved-host batch, not faults, devices, offline or a technology gate.
No ordinary-runtime change or renewed unplaced-preservation question.

2026-09-10: PO reports the five prescribed camera/pin/window groups PASS at
`7540478`; their earlier pending status below is historical. Broader rendered,
IME/iPhone/storage acceptance remains open. PO-approved Scene-first UX and the
later-adjustment entry now exist in the same synthetic development host under
spec 05 §13.4 / UI guidelines §4.3. Internal model-relative anchors remain; this
new arrangement has executable checks, not new rendered acceptance.

Latest C implementation: the isolated candidate has canonical original-field
source correspondence and an async verified driver. Its two-actor/equivalent
model/independent Caption copy/retry service loop reaches the full scoped pair.
The served development entry now mounts that verified pair and shares async draft
acknowledgment/retry across editors and team commands. Mounted tests cover two
rounds, independent Caption/model copies, exact retry and source-based material
review while rendering stays withheld. This connects C in development scope;
it does not activate the ordinary UI, real storage, files or adoption.
New Caption/pin creation now also connects explicit model/coordinates/surface to
the same verified acknowledgment. Created records support subsequent edits/media,
independent keep-both copies and continuing exchange; anchors on verified model
copies remain owned by that model. Direct viewport picking/preview now connects
the exact selected resident surface to confirmation/cancellation and retry.
CPU/mounted checks cover transforms, clipping, material/occlusion and rejected
gestures; they do not prove native input or raster output. A PO correction now
connects transient translate handles and Shift+click addition, moves pin actions
beside the viewport, and exposes detail/comparison actions in the right task area.
Numeric input is supplemental. The old UI test request is withdrawn; corrected
native interaction/layout remains unverified, not a new provider campaign.
Current execution counts and remaining gates
are recorded at the top of todo; no new browser/device/storage credit.

Current scheduling amendment (2026-09-09): specification 05 §13.4 is PO approved
for a thin connected synthetic development host using the existing core/UI parts.
The first in-memory workspace loop is implemented in `src/harness/projectScene`:
Scene/task navigation, shared Caption editing/list and model membership. It is not
integrated production v2. `tasks/todo.md` top owns exact checks and remaining
connections; rendered/device acceptance, production storage, wire/migration and
ordinary-app activation remain pending. The components above are no longer all
test-only. The served development host also connects the isolated candidate to
two independent memory histories and explicit scalar choices/replay. This is not
product file exchange. Known synthetic model-binding updates and manual pin
correction now participate in the same two-round loop, preserving local work and
Scene references. Explicit membership keep-one and independent Caption copies now
connect in the known synthetic fixture. Exact synthetic model copies
also connect, with fresh closed IDs, fixture-byte/immutable-digest checks and
independent placement edits through a second exchange. General model-copy
admission, migration and the full provider remain unimplemented; current todo
owns exact scope/checks and the still-pending rendered UI lane. Exact fixture
triangle/pin display now connects fit, six axes and projection with retained
temporary cameras. Multiple retained Caption windows now connect confirmed text,
pin lines, close/reopen, front order and UI-only positioning. Object/DOM tests
do not prove raster or native input behavior.
The same host also connects Scene-owned Saved View authoring/recall and entry
settings: exact camera/solid-background captures, field-version-aware conflict
handling and two-round memory exchange. Real storage and rendered/device
acceptance remain pending.
Exact fixture material catalogs now connect scoped editing, explicit conflict
choices/reset and independent model-copy material re-keying to lit/unlit,
sidedness and hard chroma. This is fixed opaque triangle evidence only, not
blend/dither adoption. Fixed PNG media now connects add/description/order/removal,
window images, causal delete/edit choices and independent attachment copies in
the same host. Tags remain empty-fixture-only; real media files/storage and
gated durable-file services remain pending. The following records the successive
provider stages, not new next tasks; C's current connection is summarized above.
Its stage A now has one decoded whole-root record admission entry, covering the
amended 14 maps and canonical known values while preserving unknown data. A
`valid-records` result is not a valid Project/provider. Stage B now additionally
inspects whole-record references and actual immutable metadata digests/prior
identity, with scoped diagnoses and known strong/weak edges. This still returns
no authoritative projection: complete candidate/causal/exact blob-profile evidence
(B) and same-host authority (C) remain required; see 05 §13.4. Neutral original
change inspection now retains absent and concurrent candidates and reviews
immutable/lifecycle history. The existing served candidate supplies exact raw
flat-string evidence; candidate composition now checks all current values and
known reference reservations without a winner, retaining diagnostic partial
records. The actual flat-map candidate tests a full synthetic Project through
two rounds/save/reload. Executable external-content checks now bind the exact
snapshot/records and keep individual missing/unsupported/failed/stale results.
Known triangle/PNG bytes are checked in development scope; weak-only source bytes
are not fetched. A pure scope-labelled provider now maps affected closures/fields
into same-token SceneState/resources and detail fields, preserving source and all
diagnoses. The actual two-round candidate test reaches that pair and resolver.
C's same-host source-adapter/authority switch now has code/mounted evidence as
recorded above; no ordinary-app, ratified profile, general source-adapter or
rendered/device credit.

- Legacy-v1 ZIP/package code is not bounded-memory streaming despite older architecture text. The bounded Native portable and exchange packages use their separate streamed path.
- Current XLSX reading is the local minimal reader in `src/io/xlsx.ts`, not SheetJS.
- Strict CSP and single-file distribution are goals, not current implemented controls.
- Current export is download-based; File System Access/Web Share flows described in older documents are incomplete.
- Default-v1 viewer holds one model and its PLY support is not Gaussian Splatting; the isolated `?mode=native-gs` production path has separate exact ASCII ordinary-point and SH2/SH3 GS admission and remains bounded.
- Current material identity and loader behavior differ from parts of `04-formats-rendering.md`.

Do not repair these documents opportunistically during unrelated code changes. Update the relevant current contract or v2 specification in a dedicated documentation change with code evidence.
