# G0 coverage map

> Status: `G0 ACTIVE COVERAGE MAP / NO GATE CLAIM`
>
> Slice-entry checkpoint: branch `g0-baseline`, commit
> `b847279ba06b8f74b6e0d71ab5e611894921cf54`.

This document maps every independent requirement in
[`03-gates-and-delivery.md` sections 2.1–2.4](../specs/03-gates-and-delivery.md#2-g0--baseline-and-acceptance-inputs)
exactly once. It is a coverage and blocker inventory, not evidence that G0 has
passed. The authoritative requirements remain in that approved specification.

## State language

| State | Meaning |
|---|---|
| `covered` | The row's bounded contract/input is present and restorable. This does not imply another row or the overall gate passed. |
| `candidate` | Partial coverage or an unadopted source exists; it earns no gate credit yet. |
| `external-blocked` | Progress requires source bytes, a durable external locator, a physical device/run, privacy/license review or human evidence. |
| `specification-blocked` | A Product Owner decision, numeric guarantee or ratified semantic contract is still required. |
| `implementation-blocked` | A harness, schema, verifier or production capability needed to collect/accept the evidence is absent. |
| `deferred` | The specification explicitly makes the item optional or outside the current supported class. |

`available`, `discovered`, `restorable`, `measured`, `ratified` and
`gate-passing` are different states. A source URL, successful local diagnostic,
GitHub Release upload or green verifier does not advance a row unless the row's
own restore, semantic and review conditions are satisfied.

Owner labels name the role that must close a row: `Writer` authors repository
contracts/fixtures/tooling; `Device operator` performs physical runs; `PO`
ratifies product policy, numeric guarantees and exact release bytes;
`Privacy/license reviewer` is independent of derivation/acquisition; and
`Independent reviewer` judges the final accepted tree/evidence read-only. One
person may hold more than one human role, but the writer never fills an
independent-review role for the same change.

## Build and artifact identities

| Identity | Current status | Consequence |
|---|---|---|
| Deployed v1 baseline | `4f6e48196041d7ae39a11aba04f647db99deb450` at [the public Pages URL](https://chordchario.github.io/LociView/), deployed by [Actions run 30379038193](https://github.com/ChoRdChario/LociView/actions/runs/30379038193) | This is the current deployed-v1 measurement baseline, not a stabilized release. |
| Development checkpoint | Slice entry `b847279ba06b8f74b6e0d71ab5e611894921cf54`; the current map revision is the Git commit containing this file | No development commit is automatically a release candidate. |
| Stabilized-v1 candidate | None designated | Designate and freeze an exact SHA before final verification so evidence/review can bind to it. The label alone grants no release status. |
| Fixture-only GitHub Release | Not created | Only redistribution-approved bytes may be uploaded. Asset existence alone does not adopt a fixture. |

The current workflow can deploy from a successful `main` push or an explicit
`workflow_dispatch`. Neither is authorized by this map. Under the approved
[release boundary](../specs/03-gates-and-delivery.md#37-stabilized-v1-candidate-and-release-boundary),
the exact candidate becomes release-eligible only after both G0 and G0-S exit,
exact-tree review has no P0/P1 and the Product Owner approves the SHA and trigger.

## Section 2.1 — fixture registry

Each row below is one atomic subcase. Shared family wording is not a second
requirement. A fixture may satisfy multiple rows only when its registry entry
and independent oracle identify each subcase explicitly. The following source
requirements are conjunctive even though their status is atomized here:
`G0-FX-02A`–`02C` close on one v1 project; `09A`–`09E` form one combined
material/override matrix; `08A`–`08D` form one anisotropic-GS/mesh-axis family;
`14A`–`14J` form one relationship family;
`17A`–`17D` form one multi-asset alignment scene; `18A`–`18B` form one stress
scenario; and `21A`–`21E` form one later-copy media family. A subset cannot pass
its parent requirement independently.

| ID | Atomic requirement | State | Present evidence or exact gap | Owner / next action |
|---|---|---|---|---|
| `G0-REG-01` | Per-fixture digest/bytes, geometry counts, bounds, coordinates/units, provenance/license/privacy, restore instructions and expected warnings/results | `external-blocked` | Registry v2 can bind complete reviewed attribution, canonical license terms, exact versioned fixture-Release transport and external GS plus Git specification/oracle. All ten current entries intentionally remain `NOASSERTION`/unreviewed and Git-tier; no external asset has passed acquisition/restore or entry-specific privacy/license review. | `Writer` implements and runs explicit acquisition verification; `Privacy/license reviewer` reviews each exact candidate; `PO` approves any upload/adoption and later project-license scope. |
| `G0-FX-01A` | Small anonymized real v1 operational project | `external-blocked` | No anonymized real fixture or durable locator. | `Writer` derives/restores exact bytes; `Privacy/license reviewer` and `PO` approve the derivative SHA and redistribution. |
| `G0-FX-01B` | Medium anonymized real v1 operational project | `external-blocked` | No anonymized real fixture or accepted size classification. | `Writer` derives/restores exact bytes; `Privacy/license reviewer` approves them; `PO` decides whether one source-derived size class is representative. |
| `G0-FX-01C` | Largest available anonymized real v1 operational project | `external-blocked` | Private Ki84 is the only known operational source and is diagnostic-only. | `Writer` derives/restores it or another largest example; `Privacy/license reviewer` audits it; `PO` approves the exact bytes and why this is the largest available class. |
| `G0-FX-02A` | v1 caption tags | `candidate` | The registered synthetic native-v1 fixture contains caption tags, but no single adopted v1 project yet covers the complete `02A`–`02C` family and no anonymized-real oracle is adopted. | `Writer` binds the derivative's tag relations to an independently authored oracle. |
| `G0-FX-02B` | Multiple ordered v1 display sets | `candidate` | Synthetic/private shapes exist; operational gate fixture is absent. | `Writer` preserves exact set membership/order in the reviewed derivative and oracle. |
| `G0-FX-02C` | `__last` and named-view combinations | `candidate` | Synthetic/private shapes exist; known default-camera migration expectations remain open. | `Writer` freezes the source combinations and expected converted default views. |
| `G0-FX-03A` | Known divergent v1 copies | `candidate` | Registered native base/A/B packages are restorable, but their accepted merge/migration decision is not complete. | `Writer` completes the semantic oracle after the canonical recipe/collision policy is approved. |
| `G0-FX-03B` | Ops-only exchange | `candidate` | Registered operation corpus covers ingress decisions, not a complete restorable exchange result. | `Writer` binds an exact ops-only input and expected state/collision report. |
| `G0-FX-03C` | Interrupted workspace | `candidate` | Test-local interruption cases exist; no registered input plus old/new durable-state oracle. | `Writer` reuses the minimal existing case and registers only its missing restorable boundary. |
| `G0-FX-03D` | Malformed operation log | `candidate` | Malformed-line tests exist; no gate fixture maps preserved source, report and active-state outcome together. | `Writer` binds the smallest existing corpus and oracle without broad new characterization. |
| `G0-FX-04A` | GS near 100k splats | `external-blocked` | No adopted bytes. | `Writer` acquires or deterministically derives licensed bytes, records source relation/count/hash and verifies Release restore. |
| `G0-FX-04B` | GS near 500k splats | `external-blocked` | No adopted bytes. | `Writer` acquires/derives licensed bytes and verifies exact count/hash/restore; `Privacy/license reviewer` approves redistribution. |
| `G0-FX-04C` | GS in the 2–4M range | `external-blocked` | [SuperSplat Demo Ply2Splat](https://superspl.at/scene/3bb7ffd5) exposes a CC-BY-4.0 download and publisher page metadata, but exact splat count, bytes and attribution record are unverified locally. | `Writer` acquires/inspects exact bytes; `Privacy/license reviewer` approves attribution before fixture Release publication. |
| `G0-FX-05A` | Ordinary PLY with explicit ordinary-point classification | `covered` | Registered `smoke-points-ply-v1` binds bytes, 20,000 points and expected ordinary classification. | `Writer` keeps this routing result separate from GS support claims. |
| `G0-FX-05B` | GS PLY with explicit GS classification | `covered` | Registered eight-splat fixture binds bytes and expected GS classification. | `Writer` keeps its semantic profile `candidate`; classification does not ratify rendering. |
| `G0-FX-06A` | Mesh-only model with frozen inspection, immutable-record golden bytes and source-occurrence/pick ground truth | `candidate` | Registered cube/triangle smoke bytes lack the immutable-record golden and full inspection/pick oracle. | `Writer` extends one minimal authored model/oracle rather than adding a parallel fixture family. |
| `G0-FX-06B` | Points-only model with the same frozen ground truth | `candidate` | Registered ordinary PLY lacks immutable-record and pick ground truth. | `Writer` adds the missing oracle to the existing bytes if semantics permit. |
| `G0-FX-06C` | One-container mixed mesh plus ordinary points with the same ground truth | `implementation-blocked` | No registered mixed container/generator/oracle. | `Writer` authors one minimal format-neutral input and independent oracle during G0. |
| `G0-FX-06D` | Multi-primitive, two-node-instanced point model with the same ground truth | `implementation-blocked` | No registered input/oracle. | `Writer` authors and freezes the occurrence/instance pick expectations during G0. |
| `G0-FX-06E` | Two-node indexed/reflected triangle model with the same ground truth | `implementation-blocked` | No registered input/oracle. | `Writer` authors and freezes index/reflection inspection and picks during G0. |
| `G0-FX-07A` | Static GLB with authored node transforms and frozen no-clip pose/bounds/picks | `specification-blocked` | Initial static-pose profile is unratified. | `Writer` proposes source/spec/oracle; `PO` ratifies profile bytes and golden hashes. |
| `G0-FX-07B` | Static GLB with initial morph weights and frozen no-clip pose/bounds/picks | `specification-blocked` | Static-pose profile is unratified; no fixture. | `Writer` proposes source/spec/oracle; `PO` ratifies profile bytes and golden hashes. |
| `G0-FX-07C` | Static GLB with skin/joints and frozen no-clip pose/bounds/picks | `specification-blocked` | Static-pose profile is unratified; no fixture. | `Writer` proposes source/spec/oracle; `PO` ratifies profile bytes and golden hashes. |
| `G0-FX-07D` | Static GLB with animation clips, no autoplay and frozen no-clip pose/bounds/picks | `specification-blocked` | Static-pose profile is unratified; no frozen no-clip oracle. | `Writer` proposes source/spec/oracle; `PO` ratifies profile bytes and golden hashes. |
| `G0-FX-07E` | Inputs frozen as reject versus explicit `staticPoseBake` | `specification-blocked` | Bake/reject profile and derived-byte oracle are unratified. | `Writer` supplies both positive/negative inputs; `PO` ratifies the rule before G1-B. |
| `G0-FX-08A` | Anisotropic GS with nonzero view-dependent coefficients under translation, rotation and positive scale | `specification-blocked` | Eight-splat preflight is not a transform/render oracle. | `Writer` authors the ground truth; `PO` ratifies transform semantics. |
| `G0-FX-08B` | The same GS under reflection | `specification-blocked` | Reflection behavior is unratified. | `Writer` authors reflection ground truth; `PO` ratifies transform semantics. |
| `G0-FX-08C` | Profile-derived finite-support GS bounds | `specification-blocked` | Current fixture records means-only bounds. | `Writer` proposes support rule/goldens; `PO` ratifies exact profile bytes. |
| `G0-FX-08D` | Transformed GS aligned against mesh-axis ground truth | `specification-blocked` | No paired scene/oracle. | `Writer` authors a format-neutral pair in G0 after semantics are fixed. |
| `G0-FX-09A` | Opaque, mask, blend and transmission source-material axes in the combined resolver matrix | `specification-blocked` | No ratified source-material resolver/profile matrix. | `Writer` authors matrix and oracle; `PO` ratifies supported/redirected outcomes. |
| `G0-FX-09B` | Opacity plus hard/soft chroma override axes combined with `G0-FX-09A` | `specification-blocked` | Chroma evaluator is unratified. | `Writer` proposes evaluator/golden; `PO` ratifies it. |
| `G0-FX-09C` | Final transparent-background alpha | `specification-blocked` | No accepted alpha/image oracle. | `Writer` supplies masks/images after resolver semantics are fixed. |
| `G0-FX-09D` | Duplicate catalog and override keys | `specification-blocked` | No accepted resolver decision/oracle. | `Writer` supplies duplicate cases; `PO` ratifies deterministic handling. |
| `G0-FX-09E` | Invalid and redirected material combinations | `specification-blocked` | Redirect/support outcomes remain unratified. | `Writer` maps every invalid/redirected class; `PO` ratifies user-visible behavior. |
| `G0-FX-10A` | Ordinary-point footprints at target CSS diameters, DPRs and render scales for binary/dither/smooth profiles | `specification-blocked` | Profile IDs exist only provisionally; sizes/coverage are unratified. | `Writer` authors pixels/picks; `Device operator` measures; `PO` ratifies. |
| `G0-FX-10B` | Triangle/ordinary-point pixel overlap | `specification-blocked` | No accepted image/pick oracle. | `Writer` authors the deterministic overlap scene after profile rules are fixed. |
| `G0-FX-10C` | Radius-fallback ties | `specification-blocked` | Tie rule/golden is unratified. | `Writer` authors symmetric indexed/unindexed cases; `PO` ratifies the rule. |
| `G0-FX-11A` | v1 caption with absent normal | `candidate` | Synthetic migration cases are partial. | `Writer` freezes output with omitted `normalAsset` and no stored-normal issue. |
| `G0-FX-11B` | v1 stored normal under Y-up | `candidate` | Migration recipe/issue oracle remains incomplete. | `Writer` freezes omitted `normalAsset` plus exact issue. |
| `G0-FX-11C` | v1 stored normal under Z-up | `candidate` | Migration recipe/issue oracle remains incomplete. | `Writer` freezes omitted `normalAsset` plus exact issue. |
| `G0-FX-11D` | v1 stored normal under transformed child node | `candidate` | Migration recipe/issue oracle remains incomplete. | `Writer` freezes omitted `normalAsset` plus exact issue. |
| `G0-FX-12` | 500 MiB incompressible streaming stress data labelled non-product-guarantee | `implementation-blocked` | No adopted deterministic recipe/output/restore command. A G1-A harness is not required to freeze the G0 input. | `Writer` defines and verifies a bounded generator now; execution remains G1-A evidence. |
| `G0-FX-13A` | Mesh/GS intersection scene | `implementation-blocked` | No deterministic pair/oracle. External realism data is optional, not a prerequisite. | `Writer` authors the smallest exact geometry/GS intersection in G0. |
| `G0-FX-13B` | Ordinary-point/GS Integrated overlap scene | `implementation-blocked` | No deterministic pair/oracle. | `Writer` authors it in G0 independent of renderer implementation. |
| `G0-FX-13C` | GS gap repaired by visual patch | `implementation-blocked` | No deterministic gap/patch oracle. | `Writer` authors it in G0; later external data may supplement load realism. |
| `G0-FX-14A` | Visual patch plus same-asset atomic splat-exclusion group | `implementation-blocked` | Contract exists; format-neutral bytes/oracle do not. | `Writer` authors/fixes the family in G0; execution waits for G1-B. |
| `G0-FX-14B` | Differently oriented/scaled external repair import | `implementation-blocked` | No source/alignment/correct-result oracle. | `Writer` authors exact frames/Sim(3) and expected binding. |
| `G0-FX-14C` | Repair import cancel and failure path | `implementation-blocked` | No negative input/unchanged-state oracle. | `Writer` freezes failure points and atomic unchanged result. |
| `G0-FX-14D` | Base versus singleton-patch anchor compatibility through add/update/remove | `implementation-blocked` | No compatibility-partition fixture/oracle. | `Writer` authors immutable revision sequence and expected classes. |
| `G0-FX-14E` | Manual C1-to-C2 rebind and ambiguous-target refusal | `implementation-blocked` | No command/pick oracle. | `Writer` authors positive and refusal cases in G0. |
| `G0-FX-14F` | Ungrouped, cross-asset and missing-patch relationship failures | `implementation-blocked` | No negative matrix bytes/oracle. | `Writer` authors one minimal record family covering all three. |
| `G0-FX-14G` | Nonidentity-mask and wrong-role relationship failures | `implementation-blocked` | No negative matrix bytes/oracle. | `Writer` authors exact invalid records and rejection codes. |
| `G0-FX-14H` | Raw/paged/preview target switching | `implementation-blocked` | No family/revision oracle. | `Writer` freezes representation-role switching semantics in G0. |
| `G0-FX-14I` | Overlapping hard-mask union | `implementation-blocked` | No predicate/image oracle. | `Writer` authors exact AssetFrame predicates and expected union. |
| `G0-FX-14J` | Excluded-region direct and proxy picks | `implementation-blocked` | No paired pick oracle. | `Writer` authors both methods against the same exclusion family. |
| `G0-FX-15` | Closed translucent aircraft with at least six surfaces on representative rays | `candidate` | Pinned [A380 model](https://github.com/amvlab/aircraft-models/blob/91d835e8e851b2317fe79af291c9fed6153fd525/models/A380_nologo.glb) and [CC-BY-4.0 repository license](https://github.com/amvlab/aircraft-models/blob/91d835e8e851b2317fe79af291c9fed6153fd525/README.md#license) are candidates; watertightness/rays/bytes are unverified. | `Writer` audits the candidate; if unsuitable, author closed geometry. `Privacy/license reviewer` approves attribution before using third-party bytes. |
| `G0-FX-16A` | Direct-GS pick ground truth | `implementation-blocked` | No frozen source occurrence, screen target and error oracle. A backend is not required to define it. | `Writer` authors the source/trace/oracle during G0; execution waits for G1-B. |
| `G0-FX-16B` | External interaction proxy paired to the same visual source | `implementation-blocked` | No proxy bytes, transform or expected hit mapping. | `Writer` authors/fixes proxy provenance and ground truth during G0. |
| `G0-FX-17A` | Multiple assets with different origins | `implementation-blocked` | No multi-asset input/oracle; current single-model UI is not a fixture blocker. | `Writer` authors format-neutral metadata/bounds now. |
| `G0-FX-17B` | Multiple assets with different axes | `implementation-blocked` | No input/oracle. | `Writer` authors axis conversions and expected ProjectFrame result. |
| `G0-FX-17C` | Multiple assets with different units | `implementation-blocked` | No input/oracle. | `Writer` authors exact units/scales and expected result. |
| `G0-FX-17D` | Multiple assets with saved Sim(3) alignment | `implementation-blocked` | No input/oracle. | `Writer` freezes exact translation/quaternion/positive-scale result during G0; execution remains G1-B evidence. |
| `G0-FX-18A` | 10,000 captions in the joint stress scenario | `implementation-blocked` | No adopted deterministic generator/state oracle. | `Writer` creates/fixes the input during G0; execution remains G1-C evidence. |
| `G0-FX-18B` | 50,000 metadata changes in the same joint stress scenario | `implementation-blocked` | No adopted deterministic change recipe/final heads/state oracle. | `Writer` creates/fixes it during G0 without claiming a product limit; execution remains G1-C evidence. |
| `G0-FX-19A` | Deleted sentinel values for privacy tests | `candidate` | Test-local privacy shapes exist; no registered allowlist oracle. | `Writer` maps/reuses the minimal case. |
| `G0-FX-19B` | Private sentinel values for privacy tests | `candidate` | Same gap. | `Writer` maps/reuses the minimal case and expected absence. |
| `G0-FX-20A` | Parent-delete versus concurrent-child input | `candidate` | Operation/domain cases exist but are not bound to one restorable fixture/oracle. | `Writer` binds the shared corpus after merge semantics are approved. |
| `G0-FX-20B` | Unknown-minor-only-blob input | `candidate` | Package characterizations exist; exact retained/rejected blob oracle is not registered. | `Writer` binds the smallest current case. |
| `G0-FX-21A` | Equal media bytes under distinct v1 asset IDs | `candidate` | Synthetic migration coverage is partial. | `Writer` freezes distinct identity plus equal digest behavior. |
| `G0-FX-21B` | Later-copy attachment prepend | `candidate` | No complete canonical migration oracle. | `Writer` adds exact ordering expectation after recipe approval. |
| `G0-FX-21C` | Later-copy attachment reorder | `candidate` | No complete canonical migration oracle. | `Writer` adds exact ordering expectation after recipe approval. |
| `G0-FX-21D` | Reviewed duplicate-count change | `candidate` | No complete canonical migration oracle. | `Writer` adds exact duplicate-count expectation after recipe approval. |
| `G0-FX-21E` | Attachment content-revision change | `candidate` | No complete canonical migration oracle. | `Writer` adds exact revision/content expectation after recipe approval. |
| `G0-FX-22A` | Malicious package corpus | `candidate` | Extensive deterministic test-local ZIP/JSON/operation/domain cases exist, but no registered test-to-input/result manifest covers traversal/structure, parser budgets, operation policy, graph/reference and privacy/export classes. | `Writer` maps the existing corpus by threat/result and registers only missing restorable boundaries. |
| `G0-FX-22B` | Malicious model/media corpus | `candidate` | Model URI/MIME/polyglot/decode cases exist only as dispersed tests; no registered source/oracle envelope. | `Writer` maps current model/media threats and adds only an uncovered accepted threat. |
| `G0-CHAR-01` | G0 owns a failing characterization for every known G0-S defect | `candidate` | Slice entry has 17 direct `it.fails`, 44 runtime expected failures and 21 todos, but this count is not an ownership ledger. | `Writer` maps each known defect to one test/evidence row. |
| `G0-CHAR-02` | Each reproduction demonstrably fails on its recorded unfixed v1 baseline before repair | `candidate` | Many fixes already landed; compatible pre-fix test revisions and raw failures are incomplete. | `Writer` records unfixed commit/test revision/command/failure; `Independent reviewer` verifies provenance. |
| `G0-CHAR-03` | G0-S owns only the minimal root fix after its failing reproduction exists | `covered` | The approved gate contract fixes this ownership rule. | `Writer` enforces it per G0-S task; reviewer rejects unrelated expansion. |
| `G0-CHAR-04` | Characterization and fixture collection may proceed in parallel | `covered` | Governance permits parallel lanes with one writer and read-only auditors. | `Writer` keeps heavy verification serial and does not infer gate credit across lanes. |
| `G0-CHAR-05` | G0 fixture/input closure does not depend on unstarted G0-S production implementation | `covered` | Approved contract is explicit; no fixture row above waits for a G1/G0-S product harness. | `Writer` freezes format-neutral inputs/oracles in G0 and defers only execution evidence. |

### Private Ki84 source boundary

The private operational source archive is bound for diagnostic purposes by
SHA-256 `b285a491a304ebc546f1f4dca8c265a80b6fea6ab146c3c6c8fcc78888185b4a`
and size `94,067,887` bytes. Its privacy-safe aggregate shape is one GLB,
78 images, two LociMyu XLSX saves and one file-ID map. Current integrated-import
diagnostics observe four sets, 103 source captions, 23 material records and four
views; known ID collisions reduce visible captions to 99, and only 42 of 64
image references link by the current exact-name rule.

These observations guide production fixes but earn no fixture or gate credit.
The raw archive is operational, non-anonymized, non-redistributable by default
and has no durable private restore locator. A future public derivative must be
whitelist-reconstructed with replacement text, identifiers, timestamps,
media pixels/metadata and project-owned or licensed model bytes while retaining
only approved structural relations. Caption positions must be deterministically
transformed or replaced with synthetic coordinates, and workbook/custom/ZIP
metadata and other hidden container properties must be stripped or replaced
with fixed deterministic values. It requires independent privacy review and
Product Owner approval of the exact derivative digest before upload.

## Product acceptance dependencies outside sections 2.1–2.4

These rows do not count as duplicate G0 requirements; they record the newly
approved product outcomes that constrain later production/release work.

| ID | Product outcome | State | Present evidence or exact gap | Owner / next action |
|---|---|---|---|---|
| `PROD-12-ACCEPT` | Office-literacy open/import/caption/merge/export/recovery flow without implementation terminology | `external-blocked` | Target persona and required flow are approved, but no scripted walkthrough or Product Owner usability acceptance exists. | `Writer` prepares the bounded walkthrough after the flows exist; `PO` performs/accepts it before public release. |
| `PROD-13-CONTRACT` | Exact non-lossy disposition for duplicate/ambiguous IDs, inferred sheet mappings and unresolved media links | `specification-blocked` | `PROD-13` forbids silent/lossy commit but intentionally does not yet choose preserve-both, block-affected-unit or manual-mapping UX for each case. | `Writer` proposes one conversion report/decision contract; `PO` approves the user-visible dispositions before implementation. |
| `PROD-13-IMPL` | LociMyu XLSX/model/image/optional-map conversion preserves durable source artifacts and applies the accepted explicit dispositions | `implementation-blocked` | The integrated importer is the existing conversion boundary, but private Ki84 diagnostics show an inferred sheet GID applied without acknowledgement and duplicate legacy IDs collapsing 103 source captions to 99 visible captions. No public real-derived acceptance fixture exists. | After contract approval, `Writer` fixes/reuses the integrated service; a standalone tool may wrap it but must not fork semantics. `Independent reviewer` verifies unchanged source artifacts, unambiguous-record preservation and explicit dispositions. |

## Section 2.2 — target environments

| ID | Requirement | State | Present evidence or decision | Owner / next action |
|---|---|---|---|---|
| `G0-ENV-01` | Repeated physical iPhone 14 Pro / Safari PWA as the current oldest physical-iOS alpha target | `candidate` | Device remains repeatedly available; pending template exists and the measured schema can represent genuinely unavailable iPhone resource facts. | `Device operator` records exact facts and raw runs; `Independent reviewer` checks unavailable dispositions. |
| `G0-ENV-02` | Windows 11 desktop baseline | `external-blocked` | Device class is repeatedly available; Edge primary and Chrome smoke are approved. | `Device operator` records exact CPU/RAM/GPU/OS/browser/viewport/storage in a measured environment record. |
| `G0-ENV-03` | Windows 11 tablet-PC desktop/touch class | `external-blocked` | Device class is repeatedly available; same browser policy applies. | `Device operator` records exact hardware/OS/browser/touch/viewport facts separately from desktop. |
| `G0-ENV-04` | Safari PWA plus Edge-primary/Chrome-secondary browser matrix, aligning the primary Edge version across Windows where practical | `covered` | Browser roles are approved for the three repeatable classes. | `Device operator` records exact versions and aligns Edge where practical; Chrome smoke never substitutes for required Edge evidence. |
| `G0-ENV-05` | Newer iOS comparison device is desirable but not alpha-required | `deferred` | No repeatedly available newer device is recorded. | `PO` adds it only after repeated access exists; no current action. |
| `G0-ENV-06` | iPad/iPadOS is not a supported class without a repeatable physical iPad | `deferred` | No physical iPad class is available. | `PO` keeps it unsupported until evidence can be repeated. |
| `G0-ENV-07` | Untestable device classes receive no support claim | `covered` | Policy is approved; availability alone is not a guarantee. | `PO` ratifies support/degradation wording only after reviewed evidence. |
| `G0-ENV-08` | Record exact hardware, OS/browser, PWA/tab, viewport, DPR, free storage and available power/thermal facts without estimating unavailable values or generalizing | `external-blocked` | The privacy-safe schema now permits genuinely unavailable iPhone resource/power facts while retaining comparison-critical fields and Windows requirements; zero physical records exist. | `Device operator` records observed facts; `Independent reviewer` rejects guessed values and unsupported unavailable dispositions. |

## Section 2.3 — baseline measurements and ratification

| ID | Atomic requirement | State | Present evidence or exact gap | Owner / next action |
|---|---|---|---|---|
| `G0-TRACE-01` | Comparable runs use fixed, restorable fixtures and camera/input traces | `implementation-blocked` | Runbook/fields exist; no complete fixture/trace pair is adopted. | `Writer` binds a Git trace or same-run external manifest and verifies source bytes before measurement. |
| `G0-MEAS-01` | Offline cold start and project-open timing | `external-blocked` | Pending templates only; zero completed runs. | `Device operator` runs the fixed build/fixture/trace after fixture, trace and instrumentation prerequisites close; `Writer` validates records. |
| `G0-MEAS-02` | Package inspect/import/export timing and result | `external-blocked` | No completed run. | `Device operator` uses a restorable non-sensitive package; private Ki84 remains diagnostic-only. |
| `G0-MEAS-03` | First-preview and fully-usable timing | `external-blocked` | Procedure exists; zero measurements. | `Device operator` records both events on the fixed pair. |
| `G0-MEAS-04` | p50/p95/max frame time and frame drops | `implementation-blocked` | App lacks all required identifiable instrumentation. | `Writer` audits/reuses telemetry and adds only the missing collection boundary before device runs. |
| `G0-MEAS-05` | Pick p50/p95 and ground-truth error | `implementation-blocked` | Sampling rule exists; fixed targets/trace/oracle do not. | `Writer` freezes targets and separates gesture from computation; `Device operator` executes. |
| `G0-MEAS-06` | Observable JS heap plus reload, memory-warning and context-loss symptoms | `implementation-blocked` | The environment schema represents unavailable iPhone facts, but the runtime resource ledger and complete observable symptom capture still do not exist. | `Writer` fixes instrumentation; `Device operator` records unavailable samples honestly and captures symptoms. |
| `G0-MEAS-07` | Three background/foreground cycles | `external-blocked` | Procedure exists; zero physical runs. | `Device operator` executes on each required class after build/fixture identity is valid. |
| `G0-MEAS-08` | Ten-minute continuous use | `external-blocked` | Procedure exists; zero physical runs. | `Device operator` executes the fixed trace without measurement-distorting capture. |
| `G0-MEAS-09` | Twenty load/unload cycles | `implementation-blocked` | Procedure exists, but the declared resource ledger/baseline is absent. | `Writer` closes ledger instrumentation, then `Device operator` executes. |
| `G0-MEAS-10` | Storage before/after and orphan cleanup | `implementation-blocked` | No accepted observable checkpoint/cleanup ledger. | `Writer` defines observable storage evidence without inferring hidden browser storage; `Device operator` records it. |
| `G0-THR-01` | Numeric resource plateau/heap trend acceptance | `specification-blocked` | Provisional percentage seed is unapproved and no measured baseline exists. | `Writer` presents reviewed measurements; `PO` ratifies or changes the product requirement. |
| `G0-THR-02` | Numeric masks/difference tolerances for supported-rendering reference images | `specification-blocked` | No ratified image set/tolerance. | `Writer` produces reviewed images after semantics are fixed; `PO` ratifies values. |
| `G0-THR-03` | Ordinary-point pick radius, provisionally 6 CSS pixels | `specification-blocked` | No ratified device/visual evidence. | `Device operator` measures authored fixtures; `PO` ratifies the radius. |
| `G0-THR-04` | Common default/minimum/maximum CSS diameter and coverage threshold for binary/dither/smooth point profiles | `specification-blocked` | Values and visual evidence are unratified. | `Writer` supplies fixture results; `Device operator` measures; `PO` ratifies. |
| `G0-PROFILE-01` | Distinct companion specification digests for binary/dither/smooth point profiles | `specification-blocked` | IDs are provisional; companion bytes/hashes are not ratified. | `Writer` authors companions; `Independent reviewer` checks separation; `PO` ratifies hashes. |
| `G0-PROFILE-02` | Binary point profile is chosen as the product default | `specification-blocked` | Current direction allows validation but G0 device/visual acceptance is absent. | `PO` ratifies the default after reviewed profile evidence. |
| `G0-PROFILE-03` | Exact initial FormatProfile ID-to-specification-digest registry | `specification-blocked` | No ratified one-to-one ID/digest table exists. | `Writer` authors the exact registry; `Independent reviewer` checks uniqueness and byte bindings; `PO` ratifies it. |
| `G0-PROFILE-04` | Initial FormatProfile static-pose specification and goldens | `specification-blocked` | No accepted bytes/hashes. | `Writer` proposes source/spec/oracle; `PO` ratifies exact bytes. |
| `G0-PROFILE-05` | Initial contribution/material/source-occurrence enumeration specification and goldens | `specification-blocked` | No accepted bytes/hashes. | `Writer` proposes source/spec/oracle; `Independent reviewer` audits separation; `PO` ratifies exact bytes. |
| `G0-PROFILE-06` | Initial bounds specification and goldens | `specification-blocked` | Means-only GS candidate is insufficient. | `Writer` proposes support/bounds source/spec/oracle; `Independent reviewer` audits; `PO` ratifies exact bytes. |
| `G0-PROFILE-07` | Initial source-material-semantics specification and goldens | `specification-blocked` | v1 renderer behavior is not a ratified profile. | `Writer` proposes source/spec/oracle; `Independent reviewer` audits; `PO` ratifies exact bytes. |
| `G0-PROFILE-08` | Initial GS-transform-semantics specification and goldens | `specification-blocked` | No accepted covariance/view-dependent transform oracle. | `Writer` proposes source/spec/oracle; `Independent reviewer` audits; `PO` ratifies exact bytes. |
| `G0-PROFILE-09` | Initial hard AssetFrame splat-mask predicates and goldens | `specification-blocked` | No accepted predicate bytes/hash. | `Writer` proposes source/spec/oracle; `Independent reviewer` audits; `PO` ratifies exact bytes. |
| `G0-PROFILE-10` | Chroma evaluator and golden | `specification-blocked` | No ratified evaluator. | `Writer` authors evaluator/oracle; `PO` ratifies exact bytes. |
| `G0-PROFILE-11` | Stable dither matrix, seed and coordinate rule with golden | `specification-blocked` | No ratified deterministic rule. | `Writer` authors rule/image oracle; `PO` ratifies exact bytes. |
| `G0-RESOURCE-01` | After unload, backend ledger returns to declared baseline handle and byte counts | `implementation-blocked` | No declared baseline/complete handle-byte ledger. | `Writer` defines observable handles/bytes and instruments lifecycle before G1-B runs. |
| `G0-RESOURCE-02` | Comparable heap samples from final five cycles meet the PO-approved percentage against first stable five and have no approved positive slope | `implementation-blocked` | Sampling can be unavailable and no approved percentage/slope or complete run exists. | `Writer` enables honest samples; `Device operator` records them; `PO` ratifies numeric rule through `G0-THR-01`. |
| `G0-IMAGE-01` | Supported opaque/mask/dither intersection references include masks and difference tolerances | `specification-blocked` | No ratified image artifacts. | `Writer` produces them after material/profile rules; `PO` ratifies through `G0-THR-02`. |
| `G0-IMAGE-02` | A warning cannot waive supported-image tolerances | `covered` | Approved gate contract states the rule. | `Writer` and `Independent reviewer` enforce it in future evidence disposition. |
| `G0-INVALIDATE-01` | Changing ratified FormatProfile bytes invalidates affected G1-B evidence and reruns fixtures | `covered` | Approved invalidation rule exists. | `Writer` binds future evidence to exact profile digest. |
| `G0-INVALIDATE-02` | Changing point-footprint rules invalidates affected G1-B evidence and reruns fixtures | `covered` | Approved invalidation rule exists. | `Writer` binds future evidence to exact rule digest; `Independent reviewer` checks rerun scope. |
| `G0-INVALIDATE-03` | Changing material-resolver rules invalidates affected G1-B evidence and reruns fixtures | `covered` | Approved invalidation rule exists. | `Writer` binds future evidence to exact rule digest; `Independent reviewer` checks rerun scope. |
| `G0-INVALIDATE-04` | Changing dither rules invalidates affected G1-B evidence and reruns fixtures | `covered` | Approved invalidation rule exists. | `Writer` binds future evidence to exact rule digest; `Independent reviewer` checks rerun scope. |
| `G0-INVALIDATE-05` | Library/implementation updates that still pass byte/image goldens do not create a new semantic profile | `covered` | Approved profile identity rule exists. | `Writer` records implementation revision separately; `Independent reviewer` checks unchanged goldens. |
| `G0-BASE-01` | GS remains unsupported in the v1 baseline | `covered` | Current v1 supports ordinary PLY, not GS. | `Writer` records no invented v1 GS comparison value. |

## Section 2.4 — exit criteria

| ID | Exit criterion | State | What remains | Owner / acceptance action |
|---|---|---|---|---|
| `G0-EXIT-01` | Every fixture restorable by hash | `external-blocked` | Operational derivatives, representative GS/scene assets, stress inputs and semantic families are absent/unratified. | `Writer` runs repository and external acquisition verification; `Independent reviewer` checks every row/locator. |
| `G0-EXIT-02` | Physical-iOS raw evidence exists | `external-blocked` | Zero measured iPhone runs; the environment schema is ready, while fixed fixture/trace and instrumentation dependencies remain. | `Device operator` captures raw runs after those dependencies close; `Writer` verifies; `PO` accepts required physical evidence. |
| `G0-EXIT-03` | G0-S reproductions fail on the recorded unfixed baseline | `candidate` | Expected failures exist, but the exact pre-fix ledger is incomplete. | `Writer` completes provenance; `Independent reviewer` reproduces or verifies raw failing evidence. |
| `G0-EXIT-04` | Package bytes and splat counts are recorded | `external-blocked` | No adopted representative external GS/package run records. | `Writer` binds exact counts/bytes to restored inputs and run manifests. |
| `G0-EXIT-05` | Resource plateau and supported-image tolerances are numeric/reproducible | `specification-blocked` | Measurements and approved numeric limits are absent. | `Device operator` measures; `Writer` presents reproducibility; `PO` ratifies values. |
| `G0-EXIT-06` | FormatProfile, point, chroma and dither specifications/golden hashes are ratified/restorable | `specification-blocked` | Only a candidate GS source envelope exists. | `Writer` supplies exact bytes/restore; `Independent reviewer` audits; `PO` ratifies. |
| `G0-EXIT-07` | PO approves support classes, degradation behavior and provisional hard metrics | `specification-blocked` | Reviewed measurements do not exist; device availability is insufficient. | `PO` decides only after the complete reviewed evidence package. |

G0 is therefore active and incomplete. G0-S remains a parallel release blocker;
neither gate may be represented as passed by completing this map.

## Evidence-contract status and remaining blockers

Registry v2 closes two representation blockers without claiming fixture or G0
completion: approved content now binds complete attribution plus a canonical
license URI and/or hashed Git license text, and representative GS transport may
be external while its candidate specification and diagnostic oracle remain
distinct hashed Git files. External registration still cannot self-ratify a
FormatProfile, renderer result or device evidence. The current inventory has no
approved or external entry, so these are capabilities rather than gate credit.
Run contract v2 separately binds the measured application build and the later
immutable evidence-source revision, allowing the pre-registry deployed-v1
baseline to use fixed G0 inputs without pretending they shipped together.

1. The evidence verifier validates a supplied external locator/hash but never
   fetches it. The fixture Release path therefore needs a separate acquisition,
   restore and streamed-hash verification step with focused tests.
2. A private operational package is not a render fixture for a complete device
   run. Keep raw Ki84 conversion diagnostics separate; use a reviewed derivative
   for migration acceptance and an appropriate registered render fixture for
   device measurements rather than broadening the run contract merely to fit
   one archive.
3. Served `index.html` and service-worker digests have no byte locator in the
   current run schema. A reviewer must compare them with the identified local or
   deployed response until a later contract explicitly automates that step.
4. The deploy workflow exposes both `main` push and `workflow_dispatch` without
   enforcing an approved candidate SHA. The release operator must apply section
   3.7's exact-ref check and explicit Product Owner approval before either
   trigger; a green workflow alone is not release authority.

## Current critical path and stop rules

1. Implement the separate explicit acquisition/restore verifier, then inspect
   candidate public GS bytes without uploading or adopting them. Exact-asset
   privacy/license review and Product Owner approval remain mandatory before a
   fixture Release upload or registry adoption.
2. Specify the `PROD-13` conversion dispositions, produce and privacy-review the
   Ki84 derivative, acquire/license-review public GS and author deterministic
   intersection/aircraft inputs where external bytes do not materially improve
   the acceptance oracle.
3. Close the remaining trace/instrumentation blockers, then collect Windows and
   physical-iPhone baselines while completing the G0-S
   pre-fix ledger. A bounded ZIP symlink/FIFO root fix may use unavoidable
   acquisition/device wait time but cannot replace the external lane.
4. Ask the Product Owner to ratify numeric support/degradation/profile decisions
   only after reviewed measurements exist.
5. Designate an exact stabilized-v1 candidate before final verification and bind
   all affected evidence/review to it. Release only after both G0 and G0-S exit,
   exact-tree review has no P0/P1 and the Product Owner approves the exact SHA
   and trigger. Stop before `main` push, `workflow_dispatch` or deployment.

Re-run a short meta-audit after each meaningful slice or whenever a new
external/specification blocker changes this order. If auxiliary artifacts grow
without closing one of the rows above, stop and move back to the applicable
production or external boundary.
