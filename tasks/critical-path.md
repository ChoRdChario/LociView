# LociView critical-path execution plan

> Status: `PROPOSED DELIVERY REFOCUS / PAIRED INTERACTION POLICY APPROVED / PRODUCTION RESTART NOT AUTHORIZED`
>
> Recorded: 2026-08-26 at `fa3e423` on `g0-baseline`.
>
> This is an execution plan, not a gate amendment. The paired Mesh+GS interaction
> policy is Product-Owner-approved and recorded in the existing product/domain
> specifications; the delivery/gate-refocus proposal otherwise remains proposed.
> The current G0/G0-S ordering remains binding until separately amended.
> No implementation, new test, external acquisition, Release action, upload,
> publication, adoption, push or deployment is authorized by this plan.

## 1. Delivery objective and present position

The target is the approved public-candidate MVP, not a perfectly characterized
v1 codebase. G-1 and S0 are complete. G0 is active/incomplete, G0-S is a
parallel release blocker, and G1-A/B/C plus v2 production remain unstarted.

```text
G0 evidence and approval ─┐
                          ├─> G1 technology gates -> v2 production -> release
G0-S current-user safety ─┘
```

The current critical path has two parallel lanes that join before G1:

1. **G0 evidence lane:** make inputs/instrumentation executable, acquire and
   adopt exact external bytes, run the three device classes, then ratify the
   measured limits;
2. **G0-S safety lane:** close only the pre-fix ledger and three remaining
   production roots while external evidence proceeds;
3. **Join:** satisfy the applicable G0/G0-S barriers, pass the G1 PoCs, then
   build and harden the MVP.

The completed LociMyu identity slice stays closed. Browser vector evidence is
collected with the next consolidated browser/device run. Local review storage,
portable review and additional identity hardening do not reopen that slice.

## 2. Operating rules

These rules apply to subsequent work:

- A slice closes one release blocker or one gate-exit row. Reducing an xfail or
  todo count is not sufficient justification.
- P2 findings go to backlog by default. A P1 enters the active slice only when
  it is required by that slice's acceptance, the active gate exit, prevention
  of data destruction/major security/major compatibility harm, or avoidance of
  substantial downstream rework.
- Use one independent reviewer normally. Security, storage, migration or wire
  compatibility may use a second specialist; a third reviewer requires a new,
  explicit risk class.
- Review consists of one initial pass and targeted confirmation of accepted
  P0/P1 fixes. Re-review does not reopen general exploration.
- Reuse existing acceptance. Add a test only for an uncovered acceptance gap,
  a demonstrated false green or a previously recurring defect.
- Run focused checks while working and the full matrix once on the final
  executable tree. A result-only task note does not trigger another full matrix.
  The exact release-candidate tree receives its separately required final run.
- Close the slice when approved acceptance passes, the required final matrix
  passes, the required reviewer reports no unresolved P0/P1, and every other
  finding is recorded as backlog or an external/approval dependency. P2-zero is
  not a completion condition.

## 3. G0 evidence acquisition units

Classification:

- `R` — repository-side preparation is possible;
- `C` — Codex can execute it after the applicable approval;
- `P-DEVICE` — Product Owner/device operator must use physical hardware;
- `EXT` — exact external asset or source data is required;
- `P-APPROVE` — Product Owner must approve exact bytes, policy or numbers;
- `WAIT` — the named predecessor must finish first.

| ID | Acquisition unit | Class | Completion evidence | Predecessor / present state |
|---|---|---|---|---|
| `E0` | Build/evidence identity packet | `R C` | Exact app commit, lockfile SHA-256, delivery mode, served `index.html`/service-worker SHA-256, evidence-source commit, fixture-registry SHA-256 and fixed fixture/trace IDs | A deployed-v1 baseline exists, but no complete measurement packet is frozen |
| `E1` | Real-v1 small/medium/largest fixture family | `EXT R C P-APPROVE WAIT` | Three independently reviewable anonymized derivatives, which may come from one operational source only if PO accepts all three size classes; exact bytes/hashes, provenance, privacy/license record, restore locator and semantic oracle covering tags, ordered sets and views | PO/external source supply; no raw private source enters Git |
| `E2` | Representative GS 100k/500k/2–4M family | `EXT C P-APPROVE WAIT` | Exact source/derived relation, bytes, SHA-256, splat count, bounds, format, attribution, privacy/license approval and restorable transport for all three sizes | Exact candidate acquisition and review; current 2–4M URL is only a candidate |
| `E3` | External fixture Release/restore/adoption | `EXT C P-APPROVE WAIT` | Approved draft, unchanged public-but-unadopted asset, indexed descriptor, verified transport under `.artifacts/acquisition/verified-transport/`, real Mode-B receipt under `.artifacts/acquisition/receipts/`, independent receipt review and separately approved registry entry | `E1` or `E2`; Mode B exists but no real descriptor/receipt/asset exists |
| `E4-A` | G1-A I/O input pack | `R C` | Deterministic 500 MiB incompressible recipe/output/hash/restore command and bounded package round-trip input | No external bytes required; execution evidence remains G1-A |
| `E4-B` | G1-B base-renderer input pack | `R C EXT P-APPROVE WAIT` | One same-logical-Asset/same-active-AssetRevision Mesh+GS pair using one unambiguous invisible proxy. Simple mixed, GS-only and Mesh-only visibility resolve the selected GS family only to that exact proxy, produce a coarse AssetFrame target-region/depth candidate, then require ordinary Caption gizmo adjustment/confirmation. The source-less manual `positionAsset` survives save/reopen without proxy reraycast or authority under the simple opaque mixed rule and five fixed incomplete-data outcomes. Base inputs also cover standalone Mesh/GS, required static pose/GS transforms/bounds, fixed trace/oracle, context restore and resource lifecycle. Direct-GS, automatic proxy generation, ordinary points, Compare, material/intersection/repair matrices and advanced composition are retained for later feature acceptance rather than E4-B | Candidate base-profile semantics and selected GS bytes; no normal-Mesh interaction relation is required; final base numeric/support ratification is `E9` |
| `E4-C` | G1-C metadata/privacy input pack | `R C P-APPROVE WAIT` | Exact divergent/interrupted/malformed v1 inputs, 10k-caption/50k-change recipe, conflict/privacy/later-copy fixtures and semantic outcomes; map the existing malicious package/model/media corpus to restorable threat/result rows without starting new corpus exploration | Collision/migration/privacy decisions |
| `E5` | Measurement instrumentation and operator kit | `R C` | Identifiable frame samples, pick compute/gesture split, resource handle/byte ledger, load/unload samples, storage checkpoints, fixed trace and a run card that produces the existing run schema | Existing schema/runbook are ready; runtime instrumentation is incomplete |
| `E6` | Three target-environment records | `P-DEVICE C` | Measured iPhone 14 Pro/Safari PWA, Windows 11 desktop/Edge and Windows 11 tablet-PC/Edge records under `evidence/g0/devices/`; Chrome remains secondary smoke | Device facts can start now; never record serial, hostname or account ID |
| `E7` | Physical device baseline runs | `P-DEVICE C WAIT` | Complete run records for the three classes, fixed build/fixture/trace identity, raw logs and package results | `E0`, applicable `E1`/`E2`/`E4`, `E5`, `E6` |
| `E8` | External raw-artifact preservation and review | `EXT C WAIT` | Git-external logs/traces/screenshots/video/package bytes plus manifest SHA-256, byte size, restorable locator, capture UTC, sensitivity and retention; reviewer checks served bytes | Each `E7` run; video is a separate run because capture changes load |
| `E9` | Base profile and numeric/support ratification | `R C P-APPROVE WAIT` | Before `E7`, freeze the exact base candidate profile/spec/oracle bytes and hashes without a support claim. After reviewed `E7`/`E8`, approve the base resource plateau, Mesh/GS/simple-mixed image tolerance, proxy-placement latency/availability/coarse-envelope result, support classes, degradation and hard metrics. Surface-precision error is not a base-proxy threshold. Point/chroma/dither/full-material hashes and images are ratified with their later feature evidence rather than blocking this base decision. A changed final digest invalidates only the affected evidence lane | Base candidate freeze depends on `E4-B`; final base ratification depends on reviewed `E7`/`E8` |
| `E10` | Aggregate G0 exit package | `C P-APPROVE WAIT` | All seven G0 exit rows trace to reproducible bytes/evidence; verifier and one independent review pass; PO records the G0 decision | `E1`–`E9` and the G0-S pre-fix ledger |

### 3.1 Exact external-asset lifecycle

Every redistributable external fixture follows these separate units. Completion
of one unit never authorizes the next:

1. Codex records a candidate source, intended fixture role and known license.
2. The Product Owner authorizes acquisition of those exact candidate bytes, or
   supplies a local copy without granting publication rights.
3. Codex inspects SHA-256, byte count, format/counts/bounds, embedded metadata,
   provenance and candidate attribution without uploading or adopting it.
4. One independent privacy/license reviewer checks the exact digest.
5. The Product Owner approves the exact digest, fixture tag, asset filename and
   draft fixture-only Release upload.
6. The approved bytes are uploaded only to the draft Release.
7. The Product Owner separately authorizes publication of the unchanged asset as
   public but unadopted.
8. Codex adds the exact stage-0 indexed Mode-B descriptor only after publication.
9. The Product Owner separately authorizes the real-network Mode-B restore.
10. Codex runs Mode B; one independent reviewer verifies the receipt and bytes.
11. The Product Owner separately approves registry adoption.
12. Adoption remains input availability, not G0/profile/renderer/device credit.

## 4. Product Owner evidence work cards

No performance run should begin until Codex supplies the `E0`/`E5` operator kit.
Before that point, the Product Owner may collect source candidates and the
non-sensitive `E6` environment facts only.

### `PO-1` — supply representative real-v1 source data

- **Device/data:** the Windows machine or offline medium holding the original
  LociMyu/LociView archives; select a small real project, a typical project and
  the largest available project. Ki84 remains private diagnostic source unless
  separately approved.
- **Action:** keep originals unchanged; provide Codex an explicit absolute path
  or attached copy and state whether public redistribution is prohibited,
  undecided or potentially allowed. Do not move it into the repository.
- **What Codex returns:** exact source digest/inventory, proposed irreversible
  derivative, redaction/reconstruction report, semantic oracle and size-class
  rationale.
- **What PO approves:** the exact derivative digest, whether it is representative
  and whether it may be published or must remain private evidence.
- **Save:** original at a durable private locator; its digest/bytes/retention in
  private evidence; approved derivative, oracle and review record at the chosen
  Git or external tier.

### `PO-2` — approve an external GS asset

- **Data/environment:** the exact public candidate URL and license page supplied
  by Codex; no account credential or mutable landing page becomes fixture ID.
- **Action:** approve only candidate acquisition first. After inspection, review
  Codex's short digest/count/license/attribution report; then approve or reject
  the exact digest. Draft upload, public publication, real restore and registry
  adoption are four later, separate approvals.
- **Save:** candidate report, exact SHA-256/bytes/splat count, captured license
  binding and attribution, each PO decision, final descriptor and Mode-B receipt.

### `PO-3` — record the three device environments

- **iPhone:** physical iPhone 14 Pro, current Safari, installed PWA. Record exact
  iOS/Safari versions, launch mode, viewport, DPR and drawing-buffer dimensions.
  RAM/GPU/free-storage/charge/low-power/thermal values may be `null`/`unknown`
  only when genuinely unavailable.
- **Windows desktop:** record exact hardware model or non-identifying description,
  CPU, RAM, GPU, Windows version, Edge version, viewport/DPR/drawing buffer,
  free storage and available power/thermal facts.
- **Windows tablet PC:** make a separate record with the same fields and note the
  physical touch configuration. It is not the desktop record with another label.
- **Privacy:** never record a serial number, hostname, account name, advertising
  ID or a local path containing a personal account name.
- **Collection timing:** hardware/OS/browser facts may be drafted now. Viewport,
  DPR and drawing-buffer facts are finalized through the `E5` operator kit so
  the Product Owner is not asked to infer developer-facing values manually.
- **Save:** one schema-valid JSON record per class in `evidence/g0/devices/`.
  Codex may prepare/fill machine-readable fields; the device operator confirms
  facts that require seeing or touching the hardware.

### `PO-4` — execute a complete device run after the kit is ready

- **Bundle supplied by Codex:** exact build URL/mode and SHA, fixture and trace
  IDs/hashes, a non-sensitive local package, run ID, operator card and raw-log
  export path. On iPhone, save fixture bytes to “On My iPhone” before going
  offline; do not use an undownloaded iCloud placeholder.
- **Per required class:** update/identify the PWA or Edge build, go offline as
  directed, perform five warm-service-worker cold-process launches, record open/
  first-preview/fully-usable separately, warm up ten seconds, run the fixed
  120-second camera trace, perform at least 30 ground-truth picks, perform three
  background/foreground cycles, ten minutes continuous use and twenty load/
  unload cycles, then inspect/import/export/reopen the fixed package.
- **Storage checkpoints:** record observable storage bytes before the run, after
  the operation/cycles and after the contracted orphan-cleanup step; save the
  cleanup result or truthful inability to observe it rather than estimating.
- **Browser matrix:** full run on Safari PWA, Edge desktop and Edge tablet-PC;
  Chrome on Windows is a separate secondary smoke and never substitutes for Edge.
- **Accuracy:** do not estimate unavailable values. Do not label CPU render time
  as GPU time. Do not invent v1 GS measurements; v1 GS remains unsupported.
- **Save:** environment JSON, run JSON, raw log/trace, exported package and reopen
  result. Keep large screenshots/video/logs outside Git and add an external
  artifact manifest. Record video in a separate run because capture affects load.

### `PO-5` — ratify measured product limits

After one independent reviewer accepts the records, Codex presents an ordinary-
language table of measured distributions, failures, fallbacks and proposed
limits. The Product Owner approves or rejects exact values and hashes for:

- resource plateau/heap trend and storage cleanup;
- supported-image masks/difference tolerances;
- base proxy-placement latency/availability/coarse-envelope outcome and
  Mesh/GS/simple-mixed image limits; surface-precision error belongs only to a
  later precision path;
- supported base device classes, degradation behavior and hard Go/No-Go metrics;
- in later feature decisions, point radius/diameter/coverage, binary point default
  and point/chroma/dither/full-material companion hashes.

Save the decision with exact run IDs, fixture/profile digests and rejected
alternatives. Approval is not inferred from a successful verifier.

## 5. G0-S work allowed while external evidence waits

Only the following gate/root units qualify. No new edge-case search is planned.

| Order | Unit | Why it is critical | Existing acceptance reuse | Prerequisite | Startability after this plan |
|---|---|---|---|---|---|
| `S0` | Pre-fix reproduction ledger | Directly closes `G0-EXIT-03`; green regressions alone do not prove the unfixed baseline | Existing Git characterization history and commands only; no new tests | None; never reconstruct missing results | `YES`, documentation/evidence only, reviewer 1 |
| `S1` | Project-scoped cross-context mutation authority | Prevents silent operation loss; closes `G0S-TAB` and unlocks the transaction root | Existing multi-tab and package/replacement concurrency acceptance; add no Node matrix | PO confirms lock lifetime, second-tab read-only behavior and lock-loss handling; real browser/iPhone evidence later | `YES` only after the mechanism is explained and approved |
| `S2` | Crash-consistent v1 publication/recovery | Prevents a visible project from pointing at missing/partial blobs or actor-log prefixes; closes `G0S-BLOB` | Existing manifest/root-marker/actor-prefix/fault acceptance; add no fault matrix | `S1` lock plus PO approval of a minimal v1 journal/recovery boundary | `NO`, predecessor/approval wait |
| `S3` | Operation activation/quarantine and divergent-key resolution | Stops malformed active fields and silent first-wins for the same actor/sequence; closes `G0S-OP` | Existing operation-ingress/collision corpus; add no new corpus | PO confirms durable typed issue location/lifecycle and keep-A/keep-B/export review boundary; keep distinct from LociMyu local review | `NO`, approval wait |
| `S4` | Exact stabilized-v1 closure | Binds real-browser malicious/cross-tab, iOS, full matrix and review to one SHA | Existing malicious corpus and full suite | `S1`–`S3`, G0 evidence, exact candidate designation | `NO`, final wait |

Explicit backlog/non-selections:

- future-schema policy, speculative Unicode/ZIP/media permutations and error-copy polish;
- retry/range/resume or Mode-A expansion;
- guessed replacement of the current large-file limits before device evidence;
- whole-buffer streaming rewrite, which belongs to G1-A;
- additional malicious-corpus discovery when current acceptance already exposes
  the root defect;
- any slice justified only by reducing expected-failure/todo counts.

## 6. Read-only G0/G1 dependency assessment

Decision: **propose a dependency-based gate split to the Product Owner**.

The present gate is not changed by this plan. It currently requires aggregate G0
and G0-S completion before any G1 work. The dependency analysis found:

| G1 gate | Actual G0 inputs it consumes | Unrelated aggregate-G0 inputs currently serializing it |
|---|---|---|
| G1-A streaming/CAS | 500 MiB I/O fixture, package round trip, buffer/storage/quota/cancel conditions, target environment and I/O budget | Renderer profiles/images/GS transforms/material/dither and metadata migration conflicts |
| G1-B base renderer | Paired same-logical-Asset Mesh+GS with one invisible same-asset proxy shared by simple mixed/GS-only/Mesh-only visibility, the simple opaque mixed rule, fixed incomplete-data outcomes, representative Mesh/GS, base transforms/bounds, fixed trace, base FormatProfiles/image tolerance and physical-iOS render/resource thresholds | Ordinary-point, Compare and advanced Integrated feature packs now block only their own later support controls; divergent/later-copy metadata and Automerge privacy/conflict families remain unrelated |
| G1-C metadata | Real/divergent/interrupted/malformed v1, 10k/50k stress, canonical operation/collision, privacy/deletion/migration inputs and open/edit/durable/merge budgets | Renderer images, chroma/dither, translucent-aircraft rendering and backend choice |

The proposed amendment, if separately approved, is:

- `G0-COMMON`: exact build/environment identity, evidence schema, hash/provenance/
  restore discipline and the G0-S pre-fix ledger;
- `G0-IO-READY`: `E4-A` plus I/O measurement conditions for G1-A;
- `G0-RENDER-READY`: `E2`, paired `E4-B`, trace/profile/image/pick/device conditions for G1-B;
- `G0-METADATA-READY`: `E1`, `E4-C`, conflict/privacy/migration/budget conditions for G1-C;
- aggregate `G0 COMPLETE`: retain the current seven exit rows as the final state.

G0-S remains a common barrier because it protects current users. The resulting
dependency proposal is `G0-S + COMMON + IO-READY -> G1-A`, then G1-A plus the
applicable READY bundle permits G1-B and G1-C without forcing those two lanes to
wait on each other's unrelated evidence. A READY result is PoC entry only; it is
not G0 completion, release authority or permission to promote PoC code.

The Product Owner's proxy/simple-mixed decision additionally narrows G1-B here to
base renderer adoption. Ordinary-point, Compare and Integrated feature packs are
retained, but their evidence blocks only the corresponding later support claim or
feature control. This is dependency removal inside the existing feature-control
model, not a new gate and not permission to skip those checks before release of
those features.

Reasons to propose rather than maintain the monolith:

- G1-A's hard pass is I/O/CAS/journal/quota and does not consume renderer or
  metadata-specific goldens;
- G1-B and G1-C consume materially different fixture/profile families;
- the current monolith has exceeded its original 1–2 focused-week planning
  envelope while downstream technology decisions remain unstarted;
- exact digests and existing invalidation rules already provide a safe way to
  rerun only a lane affected by a semantic change.

Risks retained by the proposal: profile changes can invalidate prior evidence,
READY may be confused with completion, and parallel lanes can duplicate harness
work. Mitigations are exact digest binding, explicit `READY` language, aggregate
G0/G0-S release barriers, disposable PoCs and one writer.

## 7. Major workstreams to completion

| Workstream | Completion condition | Blocker | Owner | Dependency | Start now? |
|---|---|---|---|---|---|
| `WS1` G0 evidence inputs/acquisition | `E0`–`E5` inputs are exact/restorable; external bytes complete the approved Release/restore/adoption lifecycle | Source bytes, privacy/license, profile decisions, instrumentation | Codex / PO / external / reviewer | None, units run in parallel | `YES`, only approved repository preparation and source requests |
| `WS2` G0 device evidence/ratification | `E6`–`E10`; three device classes, complete raw runs, reviewed artifacts and all seven G0 exit rows approved | `WS1`, physical devices, PO numeric decisions | PO/device operator / Codex / reviewer | WS1 | Environment facts only now; full runs `WAIT` |
| `WS3` G0-S current-user safety | Ledger plus `S1`–`S4`; real-browser/iOS evidence, exact-tree matrix, no unresolved P0/P1 and PO stabilized-v1 approval | Lock/journal/quarantine decisions and physical evidence | Codex / PO / reviewer | Ledger first; S2 after S1; final closure also WS2 | Ledger now; production waits for approval |
| `WS4` G1 technology decisions | G1-A, G1-B base renderer and G1-C each record reproducible `ADOPT`, `REJECT` or `RETRY` with rollback/fallback; later renderer features retain separate acceptance before their controls turn on | Current base G0/G0-S, or a separately approved READY amendment | Codex / PO / device operator | WS2/WS3 under current gate | `NO` |
| `WS5` v2 MVP and release | Reuse the existing Asset/AssetBindingRevision/AssetRevision/Representation closure; one logical Asset and active AssetRevision durably preserve a Mesh+GS pair and one invisible proxy. Simple mixed, GS-only and Mesh-only visibility resolve the selected GS only to that proxy; approximate proxy hit -> ordinary Caption gizmo adjustment/confirmation -> source-less manual AssetFrame `positionAsset` survives save/reopen without proxy authority under the simple opaque mixed rule and five fixed incomplete-data outcomes. Then complete production storage, canonical migration, separately approved LociMyu local-review/source-retention work, ordinary-point display/picking acceptance, multiple assets/Compare/later Integrated classes, iOS/privacy/security/usability/rollback and exact release approval. Direct-GS, automatic proxy generation, ordinary points and advanced composition do not close the first slice, but ordinary-point acceptance remains required before MVP release | WS4 choices, local-review wire/capability approval and remaining product approvals; no new normal-Mesh interaction relation is required for the first slice | Codex / PO / external reviewer | WS4 | `NO` |

## 8. Approval stop

The Product Owner reviewed and amended the paired Mesh+GS policy, then selected
the existing proxy-backed path and three visibility patterns as the initial
standard. Recording that policy does not approve the remaining delivery/
gate-refocus proposal or authorize `S0`, `S1`, fixture authoring,
instrumentation, acquisition, device runs, schema implementation or a gate
amendment. Commit these docs, report that the first slice needs no schema
addition, then stop until a separate production restart is authorized.
