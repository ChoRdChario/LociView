# LociView active work

Completed v1 implementation history remains available in Git before the G-1 cleanup baseline (`4f6e481`). This file contains only active and next work.

## G-1 — Repository normalization

- [x] Confirm `G:/00_AI_dev/LociView` as the canonical Git repository and record baseline commit
- [x] Inventory current, generated, dependency, legacy, and research files
- [x] Archive legacy alpha, raw research workspace, and complete current Git history with SHA-256 manifests
- [x] Add repository working rules, project map, documentation authority index, and legacy provenance
- [x] Record accepted v2 foundation decisions and reconsideration triggers in an ADR
- [x] Remove active documentation links to the old `Locimyu2` workspace
- [x] Mark v1, historical, superseded, and proposed-v2 documents explicitly
- [x] Mark misleading mixed-document sections inline where a top-level status was insufficient
- [x] Merge curated lessons from the retired research workspace
- [x] Remove generated `dist`, verify one production rebuild, then remove the generated output again
- [x] Complete consolidated typecheck, full tests, build, archive verification, and independent Git review
- [x] Switch Codex and Claude workspace roots to `G:/00_AI_dev/LociView`
- [x] Move the old `Locimyu2` directory intact to the external archive after the workspace switch; do not permanently delete it in G-1

### G-1 review record

- Normalized local main baseline: `fc7054f` (one local commit ahead of remote; not pushed by this task)
- Legacy alpha, raw research workspace, and full Git history were archived externally with SHA-256 manifests before removal from active search
- Consolidated evidence before the switch: typecheck passed, 14 test files / 121 tests passed, production build passed, Markdown links passed, and two read-only reviewers reported no unresolved P0/P1
- Workspace switch was confirmed by the product owner on 2026-08-18; subsequent work uses `G:/00_AI_dev/LociView` as the explicit repository root

## S0 — v2 implementation contract

- [x] Draft the product/release contract
- [x] Draft the domain, frame, asset-revision, renderer-port, mode, picking, and iOS resource contract
- [x] Draft the metadata, CAS, package-purpose, transaction-recovery, conflict, and v1 conversion contract
- [x] Draft G0, blocking G0-S, G1 PoCs, feature flags, rollback, evidence, and delivery sequence
- [x] Complete independent adversarial review with no unresolved P0/P1
- [x] Obtain product-owner approval before production implementation

### S0 review record

- Normative package: `docs/specs/00-product-contract.md` through `03-gates-and-delivery.md`, with ADR/navigation summaries updated in the same change
- Independent read-only reviews covered storage/package/migration, renderer/profile/transform, and material/compositing boundaries; the final frozen working tree has no unresolved P0/P1
- Mechanical evidence: `git diff --check` passed, all Markdown relative links resolved, and 120 requirement/acceptance IDs were unique
- Regression evidence: typecheck passed, 14 test files / 121 tests passed, and the production build passed
- The production build still reports the existing `viewer` chunk above Vite's 500 kB warning threshold; this is performance evidence for G0/G1 rather than an S0 documentation failure
- Product owner formally approved S0 on 2026-08-19 and authorized G0 to begin; later production work remains gated by G0/G0-S/G1 evidence

### Product-owner decisions recorded 2026-08-19

- iPhone 14 Pro is the oldest physical iOS alpha target available for repeated testing; no iPad/iPadOS support claim is made yet, and the tablet PC is recorded separately after its OS/browser/RAM/GPU are supplied
- GS/proxy picks use the ordinary editable pin UI without a persistent approximation badge; method/confidence remains internal metadata and no measurement-grade claim is made
- smooth-alpha Integrated work is deferred to optional G1-D after the base renderer gate; transmission/refraction needs a later separate material/research decision, and neither blocks MVP delivery
- ordinary-point handling and the current binary default proceed to G0 visual/device validation
- hard `splatExclusion` is accepted as the rendering counterpart of a human-authored/imported `visualPatch`
- animation playback remains outside MVP
- semantic conflicts fail closed only for the affected unit and never silently choose a winner

## G0 — Baseline fixtures and acceptance contracts

Start only after G-1 passes and the product owner approves S0.

### G0 baseline slice 1 — authorized 2026-08-19

- [x] Add a machine-readable fixture registry and verifier for the existing deterministic smoke samples
- [x] Separate Git fixtures, generated stress artifacts, and external hash-addressed evidence without adding large data to the repository
- [x] Add the initial executable `it.fails` characterizations for multi-tab, durable-write, untrusted-operation, and blob-ordering defects
- [x] Add empty, privacy-safe device/run evidence schemas and a repeatable runbook; do not invent measurements
- [x] Run fixture verification, typecheck, focused tests, the full test suite, and the production build
- [x] Obtain an independent read-only review of the slice before commit

### G0 baseline slice 1 review record

- The registry pins 4 small Git fixtures (651,630 bytes total); ordinary-point `points.ply` is explicitly not treated as Gaussian splatting data, and generated/external fixture tiers remain empty until their bytes and provenance exist
- Evidence templates cover the physical iPhone 14 Pro, Windows desktop, and Windows tablet-PC classes without invented measurements; there are 0 completed run, environment, or external-artifact records
- Seven initial `it.fails` characterizations preserve the desired multi-tab, durable-write, untrusted-operation, package/merge, and model-replacement safety invariants while keeping the unfixed v1 baseline green; they are the first slice, not the complete G0-S matrix
- Verification passed: fixture/evidence verification, TypeScript typecheck, 15 test files / 128 tests, and the production build (92 modules, 11 PWA precache entries)
- The existing minified `viewer` chunk remains about 789.61 kB and above Vite's 500 kB warning threshold; it is retained as G0 performance evidence rather than hidden by changing the warning threshold
- Three independent read-only reviews reported no unresolved P0/P1. Before accepting the first real measured run, harden the evidence command with direct schema validation, duplicate-record rejection, all-record privacy scanning, Git/generated trace verification, and an explicit local-versus-deployed completion rule; generated/external fixtures must also become verifiable before either tier is populated

### G0 characterization slice 2 — shared v1 operation corpus

- [x] Freeze a small raw-JSON corpus for approved `V1CanonicalOperation` accept/quarantine decisions without inventing migration digests
- [x] Run the same corpus through local dispatch, JSONL open, and package inspect/merge where each input is representable
- [x] Separate already-safe assertions from one-case/one-ingress `it.fails` characterizations on baseline `5791413`
- [x] Characterize canonical-equal and divergent same-key pairs in both input orders without inventing a collision-report API
- [x] Verify registry/hash, typecheck, focused/full tests, production build, and independent read-only review before commit

### G0 characterization slice 2 review record

- The authored ASCII corpus contains 19 single-operation cases and 2 same-key relation cases, is pinned at 14,756 bytes / SHA-256 `5f095ff089e32141a5c685d4ce1be39bffa7655e05e73ebb1c08a745fba0f2e4`, and deliberately contains no unratified canonical bytes or operation digests
- Local dispatch, JSONL open, package inspection/merge, same-incoming-log order, and existing-target-versus-incoming-package order are characterized without changing production code; already-safe reopen, raw-source, base-candidate, queue, and intrinsic invariants are not hidden inside broad expected failures
- Focused evidence is 219 passing tests plus 2 explicit todos. The todos are the typed canonical-evidence stage before known-field quarantine and a storage-location-neutral query for durable package quarantine evidence; neither is counted as completed `G0S-OP`
- A future non-throwing typed collision/paused-unit report must replace the current rejection-only local-versus-incoming characterization before full `G0S-OP` can pass
- Consolidated verification passed: fixture/evidence verification, TypeScript typecheck, 16 test files / 347 passing tests plus 2 todos, and the production build (92 modules, 11 PWA precache entries). The existing approximately 789.61 kB minified viewer-chunk warning remains unchanged
- Independent read-only reviews reported no unresolved P0/P1 after the accepted/field-quarantine distinction, append/reopen isolation, prototype restoration, relation self-validation, and local-versus-incoming collision boundary were corrected

### G0 baseline slice 3 — evidence verifier hardening

- [x] Validate every template and record against the trusted bundled Draft 2020-12 schemas with a direct, test-only Ajv dependency and bounded input handling
- [x] Distinguish complete local and deployed runs without requiring deployment metadata for a local production build
- [x] Reject duplicate record/artifact/fixture identities and privacy-sensitive strings before cross-record indexing
- [x] Verify Git/external trace evidence, reject recipe-less generated traces, and verify complete-run fixture metadata instead of trusting hash/size claims alone
- [x] Add focused verifier tests, run the full regression/build matrix, and obtain independent read-only review before accepting measured evidence

### G0 baseline slice 3 review record

- Ajv 8.20.0 is a direct dev-only dependency; schemas, templates, and records are validated strictly with bounded input handling and explicit local/deployed completion semantics
- The verifier rejects duplicate JSON keys and duplicate IDs, scans privacy-sensitive strings, verifies Git/external trace evidence and Git/generated/external fixture sources, and rejects complete generated traces until a durable recipe contract exists; generated fixtures are confined to `.artifacts/fixtures`
- Verification passed: 17 test files / 409 passing tests plus 2 todos, including 62/62 focused verifier tests; 5 Git fixtures total 666,386 bytes, while evidence remains 3 pending templates and 0 records
- The production build passed with 92 modules and 11 PWA precache entries; the existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Production and full `npm audit` both report 0 vulnerabilities after safe transitive lock updates to fast-uri 3.1.5, brace-expansion 5.0.9 / 2.1.4, nanoid 3.3.18, and postcss 8.5.26
- Independent security review reported no unresolved P0/P1, and no measured evidence was created

### G0 baseline slice 4 — representative v1 migration fixtures

- [x] Add a deterministic synthetic LociMyu Drive project and a native v1 base/branch lineage as small Git fixtures
- [x] Freeze logical ZIP entries, workbook cells, raw ops, binary hashes, and manually authored, independently reviewed semantic projections without treating container metadata or random migration IDs as semantic truth
- [x] Add LociMyu import/round-trip and native v1 open/import/export/two-order merge golden tests
- [x] Keep migration-specific known defects as narrow `it.fails` characterizations instead of changing production behavior in the fixture slice
- [x] Run registry verification, focused/full tests, typecheck, production build, and independent read-only review before accepting the fixtures

### G0 baseline slice 4 review record

- Four deterministic synthetic artifacts cover a LociMyu Drive import and a native v1 base/A/B lineage. They add 34,240 bytes; the registry now pins 9 Git fixtures totaling 700,626 bytes
- The LociMyu oracle freezes logical ZIP and workbook content, numeric-GID evidence, normalized sets/captions/views/materials/assets, model transform and pin scale, and blob hashes across apply, export, and reimport
- The native oracle freezes base/A/B states and vectors, noncanonical raw JSON spelling, stale-cache rejection, tombstones, branch-exclusive blob union, idempotent remerge, and same-field LWW with actor order deliberately opposite timestamp order
- Six narrow `it.fails` cases preserve migration defects, including the current noncanonical generated `cap_LM...` IDs, while one explicit todo reserves a storage-location-neutral assertion for durable original-source evidence. None is counted as completed G0-S behavior
- Verification passed: fixture/evidence verification, TypeScript typecheck, 14 focused passing tests plus 1 todo, 19 test files / 423 passing tests plus 3 todos, and the production build (92 modules, 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent semantic and filesystem-security reviews reported no unresolved P0/P1. The generator is intentionally scoped to a trusted local developer CLI with four fixed outputs, one approved source file, repository containment, and non-link parent/target checks
- These are privacy-safe synthetic characterizations, not anonymized real projects. The broader fixture gate and `STO-MIG-01` remain incomplete until an anonymized real v1 fixture is obtained and reviewed

### G0-GSF-A — GS source-profile preflight

- [x] Record a proposed, non-ratified Gaussian PLY source envelope without changing the approved specifications or current v1 behavior
- [x] Generate one deterministic eight-splat transport artifact and generator-produced diagnostic characterization
- [x] Fix the ordinary mesh/point, exact candidate, partial GS-like, and malformed PLY boundaries with fail-closed executable tests
- [x] Bind the candidate specification, diagnostic characterization, and PLY bytes into the fixture registry without permitting self-declared ratification
- [x] Run focused/full tests, fixture/evidence verification, typecheck, production build, and independent read-only review

### G0-GSF-A review record

- The candidate fixes one strict binary-little-endian PLY envelope with 62 float32 values / 248 bytes per splat. Its eight synthetic splats occupy 3,573 bytes and are pinned at SHA-256 `d62becb6b21de9e2f7b24e51f05e2327ae261439b0b4af3c90bc4e75acf3cf5f`
- The preflight inspector routes ordinary mesh/point-shaped PLY headers without using the filename extension and fully validates exact candidate GS payloads, partial/ambiguous GS-like input, malformed headers, non-finite values, invalid quaternions, truncation, trailing bytes and bounded-count failures. Ordinary payload acceptance remains the responsibility of its existing format validator
- The registry now verifies 10 Git fixtures / 704,199 bytes. Its version-1 `semanticContract` is candidate-only, hashes the proposed specification and generated diagnostic characterization, checks the actual PLY classification/count/mean bounds, and rejects self-declared ratification
- Transport identity and the future manually authored, independently reviewed normative semantic oracle remain separate; the generator-produced `expected.v1.json` cannot certify its own complete meaning
- Support cutoff, finite bounds, covariance and transformed SH/color semantics, budgets, immutable upstream source/license references and normative profile/golden digests remain product-owner ratification inputs
- Large/generated/external fixtures, runtime derivatives, iPhone 14 Pro measurements and G1-B remain out of scope. Current v1 still treats GS as unsupported, `src/**` is unchanged, and the broad small/medium/large GS fixture task below remains open
- Verification passed: 2 focused files / 26 tests, 21 full-suite files / 449 passing tests plus 3 todos, fixture and zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent core and registry reviews reported no unresolved P0/P1. Generator write mode remains a trusted local developer operation; atomic multi-output replacement is deferred as non-blocking hardening

### G0 characterization slice 5 — multi-tab actor and shared append

- [x] Characterize per-tab actor-instance uniqueness separately from aggregate data retention
- [x] Run two stores through 1,000 deterministic operations each over multiple seeds and verify raw operation keys plus reopened state
- [x] Reproduce OPFS-style lost updates when two stores append different operations for one shared external actor
- [x] Keep setup, reopenability and already-safe invariants outside narrow one-invariant `it.fails` assertions
- [x] Run focused/full tests, typecheck, production build and independent false-green review before commit

### G0 characterization slice 5 review record

- The tests separate the current deterministic same-identity actor reuse from durable retention, then exercise two stores with 1,000 fixed canonical caption operations each over two deterministic schedules
- Every planned payload is present exactly once in raw JSONL and after reopen, while narrow `it.fails` assertions preserve the current duplicate `(actor, sequence)` keys and resulting reduced-state loss without treating the defect as fixed
- An OPFS-style snapshot-before-write helper reproduces two different external operations racing on one actor log. A normal test also proves its timeout path remains valid if a future project-scoped lock serializes the writers
- Setup, append attempts, exact raw payloads, parsing, reopenability and helper event counts are ordinary assertions; the 10 expected-failure test instances perform no I/O or catch and assert only already-captured outcomes
- Verification passed: 3 focused files / 244 passing tests plus 2 todos, 22 full-suite files / 464 passing tests plus 3 todos, fixture and zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green, specification and runtime reviews reported no unresolved P0/P1. The new 15-test file was stable across six repeated runs, and `src/**` remains unchanged
- This is a tests-only characterization slice, not G0-S completion. Browser cross-context locking/read-only fallback, simultaneous package merge/replacement, typed collision resolution and physical iPhone evidence remain open

### G0 characterization slice 6 — recoverable durable-write queue

- [x] Add a deterministic durable-mutation fault helper for healthy, throw-before, partial-write, commit-then-throw and persistent-failure stages
- [x] Freeze healthy FIFO and identical-duplicate reducer behavior as ordinary controls
- [x] Characterize retry ordering after transient, repeated-quota, partial-write and commit-then-throw failures with exact raw and reopened-state oracles
- [x] Confirm failed queues block full/diff package generation, while leaving UI persistence phases explicit as an unimplemented API boundary
- [x] Run focused/full tests, typecheck, production build and independent false-green review before commit

### G0 characterization slice 6 review record

- The byte-level helper applies one deterministic fault plan to `appendText`, `writeText` and `writeBytes`, so a future batch or atomic-rewrite repair cannot bypass throw-before, prefix-write, real `QuotaExceededError`, commit-then-throw or persistent-failure stages
- Every recovery case first makes operation P durably acknowledged, then queues A/B under fault. All rejected checkpoints retain the exact P prefix; any resolved `flush()` must already expose the complete P/A/B durable form
- Expected-failure raw and reopen oracles require exact P/A/B. Commit-then-throw alone permits the byte-identical idempotent form P/A/A/B; the oracles reject loss, reordering, unrelated duplication and stale-P replacement
- Healthy FIFO and duplicate-reducer controls are ordinary tests. Sixteen narrow expected-failure cases preserve the current poisoned-queue behavior. A separate oracle requires future recovery to traverse the planned second quota failure, which the current baseline does not reach
- Persistent failure is observed before B is queued. Full and diff package generation remain blocked, P cannot be overwritten before release, and post-release recovery is checked independently at request, raw and reopened-state boundaries
- UI/API support for queued, writing, durable, failed/retryable, device-durable, package-generated and download-started phases remains explicitly deferred in two todos; `src/**` is unchanged
- Verification passed: 3 focused files / 49 passing tests plus 2 todos, 23 full-suite files / 490 passing tests plus 5 todos, fixture and zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green, specification and runtime reviews reported no unresolved P0/P1. The new 28-test file was stable across 11 repeated runtime runs
- This remains characterization, not a fix or G0-S completion. Blob-before-metadata publication, replacement cleanup ordering, UI durability status and physical iPhone evidence remain open

- [ ] Freeze representative v1 projects and migration fixtures
- [ ] Add small/medium/large GS fixtures with provenance and expected results
- [ ] Add mesh/GS intersection and closed translucent aircraft reference scenes
- [ ] Complete target-device record: iPhone 14 Pro is fixed as the oldest physical-iOS alpha target; add desktop and tablet-PC OS/browser/RAM/GPU details
- [ ] Measure current load, memory, frame-time, picking, and package baselines
- [ ] Add and confirm failing G0-S characterization tests on the unfixed v1 baseline
- [ ] Approve support guarantees, degradation behavior, and Go/No-Go thresholds

## G0-S — v1 safety stabilization (blocking before G1 feature work)

- [ ] Make the G0 multi-tab actor/sequence characterization pass without silent operation loss
- [ ] Make the G0 rejected-append characterization pass with recovery and accurate durable-state UI
- [ ] Make the G0 untrusted-operation characterization pass with reserved-key and canonical HLC/ID defenses
- [ ] Make the G0 package/model interruption characterization pass without dangling blob references
- [ ] Implement the smallest root fixes without coupling them to the v2 storage rewrite
- [ ] Distinguish queued, durably saved, and exported state in user-visible status
- [ ] Run malicious-package and regression tests, then update the deployed v1 build before G1

## G1+ — Proposed v2 gates

Start only after G0 and G0-S pass. See `docs/v2/00-approved-direction.md`. Order:

1. bounded-memory streaming/CAS package PoC;
2. Spark/Three versus PlayCanvas renderer bakeoff;
3. Automerge durability/merge/privacy PoC;
4. renderer/storage-neutral ports with unchanged v1 behavior;
5. v2 persistence, canonical migration, and the GS vertical slice.
