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

### G0 characterization slice 7 — blob publication and cleanup order

- [x] Add a deterministic event/fault helper for text, binary, operation-log and cleanup mutations without fixing a production transaction API
- [x] Freeze native `.lociview` new-project import as inactive until both actors, both blobs and raw operation files are complete, with the manifest/completion marker last
- [x] Characterize existing-project merge across two incoming actors and two exclusive blobs, including partial prefixes and same-path/different-bytes collisions
- [x] Characterize model replacement at new-blob, metadata, durable-barrier and old-blob-cleanup boundaries while allowing safe temporary orphans
- [x] Keep unavailable verification/concurrency observations as explicit todos, then run focused/full tests, typecheck, build and independent false-green review

### G0 characterization slice 7 review record

- The shared helper now records method-neutral durable-write starts/commits, throw-before, exact prefix-write and commit-then-throw faults, cleanup boundaries, operation-log text at cleanup start, and point-in-time copied multi-file snapshots at the fault or publication instant
- Native `.lociview` import uses a two-actor/two-blob fixture. It checks semantic manifest identity, both raw actor logs, exact blob bytes and reopened state; expected-failure rows preserve the current marker-first, marker-prefix, actor-prefix and blob-prefix gaps while permitting inactive or complete recovery
- Existing-project merge starts with one incoming actor log already present and one new actor log. It separately observes durable log publication, every state/allOps notification, a paused blob write, prefix/commit-after crash snapshots, and both orphan-path and actively referenced same-path/different-bytes collisions
- Model replacement preserves exact asset identity, transform, pin scale and caption binding while checking old/new metadata-byte pairs, partial or unreadable logs, resolved-but-corrupt bytes, durable metadata before cleanup, and a second asset sharing the old blob. Deferred cleanup and temporary unreferenced bytes remain valid outcomes
- Seven todos keep unimplemented boundaries explicit: wizard/`applyImportPlan` marker-last behavior, verified size/hash read-back, cross-context package locking, typed binary-collision reporting, optimized GLB failure, restartable cleanup, and typed concurrent replacement resolution
- Verification passed: 5 focused files / 104 passing tests plus 7 todos, 25 full-suite files / 567 passing tests plus 12 todos, fixture verification (10 Git entries / 704,199 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Three independent package, model and false-green reviews reported no unresolved P0/P1. `src/**` is unchanged
- This remains tests-only characterization, not a transaction fix or G0-S completion. The seven todos above, malicious-package coverage, production ordering fixes, physical iPhone evidence and the broad G0/G0-S gates below remain open

### G0 characterization slice 8 — malicious package envelope

- [x] Build a deterministic, small ZIP-envelope corpus without adopting the unsafe 2 GiB / 1 GiB implementation defaults as product promises
- [x] Characterize duplicate, normalized/case/Unicode-colliding, invalid-text, duplicate-manifest and future-schema inspection boundaries that current dependencies can reproduce exactly
- [x] Prove mixed valid/invalid native import and existing-project merge either reject without mutation or remain entirely inactive, never partially activate a valid subset
- [x] Exercise currently observable encrypted, unsupported-compression, special-entry and recursive-archive boundaries while leaving device-derived budgets and typed durable issues explicit
- [x] Run focused/full tests, fixture/evidence verification, typecheck, build and independent false-green/security review before a separate commit

### G0 characterization slice 8 review record

- A tests-only fixed-date ZIP writer and raw central/local descriptor produce byte-identical small archives and freeze entry order, payloads, raw malformed UTF-8 names, Unix modes, exact duplicates and local/central filename disagreement without using production parsing as the fixture oracle
- The corpus covers native traversal/schema/nested/encrypted/unsupported controls; duplicate raw and normalized names; both orders of duplicate manifests, platform-case and NFC/NFD collisions; malformed manifest/name UTF-8; symlink/FIFO modes; unsafe/count-bypassing directories; duplicate JSON members; an unknown higher schema; and one foreign normalized-collision route
- Already-safe traversal, invalid schema, nested archive, encrypted and unsupported-compression rejection plus injected small entry/count/total limits are ordinary tests. Device-derived defaults and compression-ratio policy are not inferred from the unsafe current 2 GiB / 1 GiB implementation constants
- Expected-failure rows require structural rejection during side-effect-free inspection, zero workspace mutation and no completion marker, while allowing unpublished staging in a future transaction design. Reversed-order fixtures prevent a first-wins or last-wins-only repair from passing
- The mixed valid/malformed operation package is exercised through new-project import and existing-project merge without requiring throw-shaped rejection. Safety oracles preserve the completion-marker boundary, exact active log bytes, `allOps`, reduced and reopened state, the HLC clock and the local actor sequence while allowing non-active quarantine evidence
- Six todos retain the remaining API/policy boundaries: a typed blocked/quarantined mixed-operation issue, typed archive issues, ratified compression/device budgets, declared manifest size/digest/blob closure, major/minor schema discrimination, and non-NFC/NFC-colliding metadata keys. The broader section-10 malicious media/model and deep-budget corpus remains open
- Verification passed: 2 focused files / 128 passing tests plus 6 todos, 26 full-suite files / 682 passing tests plus 18 todos, fixture verification (10 Git entries / 704,199 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green and security/spec reviews reported no unresolved P0/P1. `src/**` is unchanged; this is characterization, not a parser/import fix or G0-S completion

### G0 characterization slice 9 — archive structural ambiguity

- [x] Add ordinary portable-path, explicit-directory, fixed-writer integrity and nested-suffix controls without freezing zip.js internal layout
- [x] Characterize C0/DEL/C1 and file/directory prefix ambiguity, including directory entries that currently bypass path/count checks
- [x] Characterize false size/CRC/flag and content-disguised nested-archive boundaries that current zip.js can reproduce safely
- [x] Keep valid RTL names and already-safe guards separate from narrow expected failures, and leave device-derived size/ratio and ZIP64 support policy unclaimed
- [x] Run focused/full tests, fixture/evidence verification, typecheck, build and independent false-green/security review before a separate commit

### G0 characterization slice 9 review record

- A tests-only fixed-date writer and raw ZIP32 descriptor verify deterministic valid archives without freezing numeric timestamps, CRC values, entry order beyond the fixture contract, or zip.js internal layout. Header mutation helpers are limited to small non-ZIP64 fixtures
- Ordinary controls cover portable path rejection, an NFC RTL filename through the production reader, explicit directories with one child, strict signature/payload verification, benign suffix-like names, and actual nested-archive bytes under every prohibited suffix. Matching false uncompressed sizes are already rejected
- Eleven narrow expected-failure cases preserve the current gaps for C0, DEL and C1 file paths, a C1 directory, exact and ASCII-case file/directory prefix collisions in both orders, a signature-valid archive hidden under a neutral filename, a bad CRC, and local/central encryption-flag disagreement
- The existing slice-8 directory-count fixture complements this slice by proving that directory entries currently bypass `maxEntries`; its raw shape and expected rejection remain independently fixed
- Valid RTL text is not conflated with Bidi Control policy. Device-derived byte/ratio budgets, Bidi Control interpretation and ZIP64 support or rejection remain unclaimed and outside this slice
- Verification passed: 3 focused files / 151 passing tests plus 6 todos, 27 full-suite files / 705 passing tests plus 18 todos, fixture verification (10 Git entries / 704,199 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent helper-layout and false-green reviews reported no unresolved P0/P1. `src/**` is unchanged; this is characterization, not an archive-reader fix or G0-S completion

### G0 characterization slice 10 — additional v1 operation wire-shape boundaries

- [x] Extend the shared operation corpus with missing `user`/`v`, noncanonical HLC/actor/user and malformed known-kind ULID boundaries already required by the approved v1 wire contract
- [x] Add a same-key NFC/NFD relation whose candidates differ only by Unicode scalar sequence and remain individually valid canonical evidence
- [x] Strengthen corpus self-validation so subject, log actor, dispatch projection and normalization-specific relation shape cannot drift from the raw wire fixtures
- [x] Exercise each added case through its applicable ingress and the NFC/NFD pair through all three relation paths, without claiming exhaustive parser, canonical digest, typed issue or G0-S completion
- [x] Update the pinned fixture size/hash, run focused/full verification and independent false-green/spec review, then commit the tests-only slice separately

### G0 characterization slice 10 review record

- Six additional opaque-evidence cases isolate one approved wire defect each: missing `user`, create without `v`, uppercase HLC counter, prohibited Crockford actor character with matching log/HLC suffix, noncanonical nonempty user ULID, and a correct caption prefix with malformed ULID suffix
- Corpus loading now requires every new fixture ID, the exact applicable-dispatch set, subject/log/wire agreement, wire-derived `t/e/id/v` dispatch projection, canonical surrounding fields, exact HLC reconstruction and `opaque`/`none`/`preserved` expectations. Fixture drift fails before any expected-failure assertion runs
- The NFC/NFD relation differs only at `v.future.label`: decoded scalar sequences differ while NFC forms match. Both candidates must succeed individually through JSONL open and package merge before the shared-key collision matrix runs
- Every relation path keeps raw evidence ordinary and separate from collision disposition: open preserves both ordered lines, package inspection preserves both ordered lines, and existing-target merge preserves the exact active base plus exact inspected incoming line. Quarantine/journal location and throw-shaped rejection remain unconstrained
- Missing-user and external create-without-`v` rejection are already-safe ordinary controls. Fifteen narrow expected-failure assertions retain the current HLC/actor/user/ID, invalid local-dispatch and NFC/NFD collision gaps; two existing todos still defer typed canonical-evidence-stage and durable quarantine-evidence queries
- The corpus registry binding is updated from real bytes to 19,424 bytes and SHA-256 `abbf4d4f2c3e214f315c4c58041a9eac431c530721d7ed9f1acf6938eafdd997`. Per-operation canonical digest goldens remain deliberately absent
- Verification passed: 1 focused file / 297 passing tests plus 2 todos, 27 full-suite files / 783 passing tests plus 18 todos, fixture verification (10 Git entries / 708,867 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent specification and false-green reviews reported no unresolved P0/P1. `src/**` is unchanged; this is additional characterization coverage, not an exhaustive parser, typed issue implementation, canonical digest gate or G0-S completion

### G0 characterization slice 11 — manifest JSON member ambiguity

- [x] Add decoded-equivalent duplicate and NFC/NFD-colliding manifest keys at both the top level and inside an unknown nested object, in both source orders
- [x] Freeze each raw ASCII manifest, member order, decoded-key relation, current schema, valid sentinel operation and deterministic ZIP shape without using the production manifest parser as the fixture oracle
- [x] Characterize new-project import without requiring throw-shaped rejection, zero private staging or a particular quarantine location; no candidate completion marker or valid sentinel may become active
- [x] Characterize existing-project merge with exact active manifest/log inventory and bytes, in-memory/reopened state, and HLC/own-sequence preservation while allowing non-authoritative evidence or orphan staging
- [x] Keep typed issue/reporting and non-NFC persisted value policy explicit, then run focused/full verification and independent false-green/spec review before a separate commit

### G0 characterization slice 11 review record

- The existing exact duplicate-member fixture is now joined by eight cases covering decoded-equivalent and NFC/NFD-colliding keys at top-level and nested-object depth in both source orders. A separate NFC/escaped-key singleton control prevents a blanket unknown-member rejection from appearing correct
- Every small fixed-date ZIP is byte-reproducible and carries the current v1 manifest plus exact canonical op1/op2 evidence. Ordinary fixture tests fatal-decode the ASCII payload, freeze the complete raw member tokens and values, independently measure their actual object depth, verify decoded equality or NFC collision, and keep the production manifest parser out of the raw-shape oracle
- New-project characterization records every completion-marker mutation and separately checks sentinel visibility. It permits private staging and quarantine bytes, but the expected-failure contract requires that an ambiguous manifest never publish the candidate marker or activate its otherwise-valid operation
- Existing-project characterization compares the exact manifest and every active `.jsonl` path/byte, in-memory operations and reduced state, every published state, reopened operations/state, and a fixed-time twin HLC/own-sequence probe. Non-`.jsonl` staging, journals, quarantine evidence and unreferenced orphans remain unconstrained
- Twenty-seven narrow expected-failure assertions preserve the current unsafe activation/merge behavior for the nine cases. Typed blocked/quarantined issue reporting and non-NFC persisted value policy remain explicit todos; no parser fix, evidence-location contract, canonical digest or G0-S completion is claimed
- Verification passed: 2 focused files / 165 passing tests plus 7 todos, 27 full-suite files / 820 passing tests plus 19 todos, fixture verification (10 Git entries / 708,867 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent specification, false-green and runtime/oracle reviews reported no unresolved P0/P1. `src/**` is unchanged; this remains tests-only characterization and the broad malicious-package and G0/G0-S gates below remain open

### G0 characterization slice 12 — manifest Unicode scalar validity

- [x] Add isolated escaped lone-high and lone-low surrogate manifests plus a valid astral-pair control at the same known-value and unknown-key boundaries
- [x] Freeze raw ASCII escapes, decoded scalar shape, current manifest identity, exact sentinel operations and deterministic ZIP bytes without using the production manifest parser as the fixture oracle
- [x] Characterize new-project import so an invalid scalar never publishes the candidate completion marker or activates its otherwise-valid sentinel, while permitting private staging or quarantine
- [x] Characterize existing-project merge with the existing authoritative manifest/log/state/reopen/HLC/sequence oracle, without requiring throw-shaped rejection or a particular evidence location
- [x] Keep raw-spelling retention, typed issue reporting and unratified JSON resource budgets explicit, then run focused/full verification and independent false-green/spec review before a separate commit

### G0 characterization slice 12 review record

- Two raw-ASCII manifests isolate a lone high surrogate in the known top-level `name` value and a lone low surrogate in an unknown nested key. Both fatal-decode as UTF-8 and remain syntactically valid JSON, so they exercise scalar validity rather than the existing malformed-byte boundary
- A paired `\\uD83D\\uDE00` control places the same code units at both locations. Ordinary tests require UTF-16 length two, one Unicode scalar, code point U+1F600, no replacement character, exact current manifest/sentinel inputs and byte-identical fixed-date ZIP generation
- The positive control succeeds through inspection, new-project import, reopen, existing-project merge and merge reopen. Semantic `name` preservation is required, but post-import retention of the original JSON escape spelling and unknown-member persistence are not claimed
- Six narrow expected-failure assertions preserve the current unsafe behavior for the two lone-surrogate inputs: the desired contract requires no candidate completion-marker publication, no otherwise-valid sentinel activation and no mutation of existing authoritative manifest/log/state/reopen/HLC/sequence state
- Private staging, quarantine, journals, unreferenced orphans, throw-versus-return shape and evidence location remain unconstrained. Typed issue access and injectable v1 depth/node/field/array/string budgets remain explicit todos rather than borrowing v2 semantic ceilings
- Verification passed: 2 focused files / 177 passing tests plus 9 todos, 27 full-suite files / 832 passing tests plus 21 todos, fixture verification (10 Git entries / 708,867 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green and specification/security reviews reported no unresolved P0/P1. `src/**` is unchanged; this remains tests-only characterization, not a parser fix, raw-evidence API, resource-budget ratification or G0-S completion

### G0 characterization slice 13 — recursive manifest reserved keys

- [x] Add an isolated 3 reserved keys × 3 object-depth matrix with representative literal and escaped spellings, one dangerous decoded key per manifest
- [x] Freeze raw ASCII key spelling, decoded own-key identity, lexical depth, current manifest identity, exact sentinel operations and deterministic ZIP bytes without object-literal fixture construction
- [x] Keep `Object` and `Object.prototype` descriptor/prototype integrity as an ordinary invariant around both new import and existing merge, restoring any mutation between cases
- [x] Characterize invalid new import and existing merge with the completion-marker, sentinel and full active-authority oracles while allowing private staging, quarantine and non-authoritative evidence
- [x] Add a near-miss/value-only positive control at the same three depths, then run focused/full verification and independent false-green/spec review before a separate commit
- [x] Keep reject stage, typed issue/evidence location, unknown/raw retention, v2-wide prototype defense, manifest-specific G0S-OP wording and G0-S completion explicitly outside this tests-only slice

### G0 characterization slice 13 review record

- Nine isolated raw manifests cross `__proto__`, `prototype` and `constructor` with root, unknown nested-object and array-traversed deep-object topology. Six spellings are literal and three diagonal cells use decoded-equivalent escapes, so every semantic key and depth sees both forms without expanding to an 18-case lexical product
- Each fixed-date ZIP contains exactly one dangerous decoded own key plus the canonical op1/op2 sentinel. Ordinary fixture oracles require fatal ASCII decoding, exact raw spelling, independently decoded key identity, object depth 1/2/3, one dangerous key in the entire tree, the case-specific pollution marker, current manifest identity and byte-identical regeneration
- A shared tests-only helper now snapshots own descriptors and prototype links for both `Object` and `Object.prototype`. New import and existing merge use separate snapshots, verify fresh-object marker invisibility, and restore between cases; an unremovable unexpected property fails the setup instead of contaminating later baselines. Existing operation-ingress coverage now imports the same helper without changing its contract
- The positive control uses safe near-miss keys at all three depths, including escaped nested/deep spellings, exact reserved words only as values and known `name: "__proto__"`. It succeeds through inspection, new import/reopen and existing merge/reopen, preventing blanket escape, prefix, unknown-member or string-value rejection from appearing correct
- Twenty-seven narrow expected-failure assertions preserve the current unsafe activation behavior. For each isolated case, the desired contract requires no root completion-marker publication, no valid-sentinel activation and no change to existing authoritative manifest/log bytes, mutation paths, in-memory/published/reopened state or HLC/own sequence
- This is tests-only characterization of the approved general JSON/package safety boundary. It does not claim a v1-manifest-specific G0S-OP clause, observable pre-construction rejection stage, typed issue/evidence location, unknown-field/raw-spelling retention, exhaustive v2 prototype defense, resource budgets or G0-S completion; private staging, quarantine, journals and non-authoritative evidence remain allowed
- Verification passed: 3 focused files / 515 passing tests plus 11 todos, 27 full-suite files / 873 passing tests plus 21 todos, fixture verification (10 Git entries / 708,867 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green and specification/security reviews reported no unresolved P0/P1 after their restore and wording findings were fixed. `src/**` is unchanged; the shared helper refactor and manifest characterization remain tests-only

### G0 characterization slice 14 — manifest finite-number validity

- [x] Add an isolated sign-by-location matrix for JSON exponent overflow at the known `schemaVersion`, unknown nested-object and array-traversed deep-object boundaries
- [x] Freeze each raw ASCII number token, decoded non-finite sign, exact lexical path/depth, current manifest identity, canonical sentinel operations and deterministic ZIP bytes without using the production manifest parser as the fixture oracle
- [x] Preserve the already-safe negative `schemaVersion` rejection as ordinary coverage, and characterize only the five unsafe cases with completion-marker, sentinel-applicability and existing-authority assertions appropriate to each current outcome
- [x] Add modest positive/negative finite-exponent controls at the same three locations and require inspection, new import/reopen and existing merge/reopen success without claiming unknown-field or raw-exponent retention
- [x] Keep typed issue/stage, evidence location, maximum finite magnitude, precision/subnormal/underflow/negative-zero policy and unratified v1 JSON resource budgets outside this tests-only slice
- [x] Run focused/full verification and independent false-green/spec/runtime review before staging and a separate commit

### G0 characterization slice 14 review record

- Six isolated raw manifests cross positive/negative overflow with the known root `schemaVersion`, an unknown nested-object number and an array-traversed deep-object number. The spellings are deliberately distributed across `1e400`, `1e309` and `2e308`, reducing dependence on one overflow spelling and preventing a one-token denylist from appearing sufficient
- Every fixed-date ZIP carries the current manifest identity and exact canonical op1/op2 sentinel. Ordinary fixture oracles require fatal ASCII decoding, exact raw token and path, object depth 1/2/3, the intended `Infinity` sign with exactly one non-finite decoded number, and byte-identical regeneration without using the production manifest parser as the shape oracle
- Two finite controls use known `schemaVersion:1e0` and unknown nested/deep `+2e0/+3e0` or `-2e0/-3e0`. Both succeed through inspection, new import/reopen and existing merge/reopen, while unknown-field retention and the original exponent spelling after import remain outside the contract
- Negative overflow in known `schemaVersion` is already rejected and remains three ordinary safety assertions. Fifteen narrow expected-failure assertions cover the other five cases: no completion-marker publication, no sentinel in active `.jsonl` authority under that marker, and no existing manifest/log/state/reopen/HLC/own-sequence mutation
- The active-log sentinel oracle is completion-marker-gated, so markerless staging, quarantine, journals and other non-authoritative evidence remain allowed. Throw versus return, exact reject stage, typed issue/evidence location, maximum finite magnitude, precision, subnormal/underflow/negative-zero behavior and v1 JSON resource budgets are not claimed
- Verification passed: 2 focused files / 247 passing tests plus 11 todos, 27 full-suite files / 902 passing tests plus 23 todos, fixture verification (10 Git entries / 708,867 bytes), zero-measurement evidence verification, typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green and runtime/oracle reviews reported no unresolved P0/P1 after exponent-diversity and signed-control findings were fixed. `src/**` is unchanged; this remains tests-only characterization, not a parser fix, numeric-policy ratification or G0-S completion

### G0 characterization slice 15 — operation reload-limit ingress parity

- [x] Add two otherwise-canonical rejection-only inputs derived from the current exported limits: one compact ASCII serialized line above `MAX_LINE_CHARS`, and one operation with too many direct `v` members
- [x] Independently freeze each input's canonical structural fields, exact ASCII/trimmed line shape, direct field count and lack of cross-budget confounding without treating the current numbers as product/device guarantees
- [x] Keep direct JSONL, project open and package inspection/merge safe exclusion plus exact source inspection as ordinary assertions without fixing error text, reject stage or durable evidence location
- [x] Characterize local dispatch with separate memory/listener, append/durable-log and reopen/next-operation consistency expected failures, while keeping a modest valid control ordinary across every ingress
- [x] Leave physical whitespace padding, UTF-8 byte/scalar accounting, total-operation count and recursive depth/node/field/array/string budgets as explicit unratified follow-up work
- [x] Run focused/full verification and independent false-green/spec/runtime review before staging and a separate commit

Review record:

- Added `tests/core/g0sOpBudgets.test.ts` only; `src/**` remains unchanged. The two rejection-only cases are derived dynamically from the current exported configuration: a compact ASCII serialized operation at `MAX_LINE_CHARS + 1`, and `LIMITS.maxFieldsPerOp + 1` direct `v` members while remaining below the line limit
- Direct JSONL, workspace open and package inspection/import/merge ordinary assertions preserve exact source bytes and exclude each invalid operation from active authority. They allow safe whole-package rejection, private diagnostics/quarantine and any diagnostic cardinality or error/result shape
- Ten ordinary cases, six narrow expected-failure cases and two todos characterize the current gap. Each invalid local dispatch has separate memory/listener, active-log mutation plus byte-exact, and reopen/next-operation queue/sequence/HLC oracles; active manifest/log mutation histories and transient non-baseline publication are also observed
- This slice does not ratify exact-limit acceptance, the exported numbers as product/device guarantees, physical whitespace accounting, UTF-8 byte/scalar accounting, total operation count, recursive depth/node/field/array/string budgets, v2 migration parity, a parser fix or G0-S completion
- Verification passed: 4 focused files / 45 passing tests plus 2 todos, 28 full-suite files / 918 passing tests plus 25 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Independent false-green and runtime/spec reviews reported no unresolved P0/P1 after active-authority history, byte-exactness, private-evidence freedom and async rejection isolation were corrected

### G0 characterization slice 16 — import-wizard publication closure

- [x] Build a fresh deterministic one-model/one-image import plan per scenario, with distinct original, optimized and image bytes and independently checked dynamic asset bindings
- [x] Characterize a successful `applyImportPlan` closure and separately require the root completion marker to start only after every active JSONL log and referenced blob is durably committed
- [x] Add method-neutral fault reachability for root-marker prefix and post-commit, initial-log prefix, optimized-blob prefix, second normal-blob prefix and final asset-log prefix without fixing random IDs or physical append counts
- [x] Keep each interruption safety oracle narrow: no completion marker, or an exact reopenable planned closure; allow optimized-write failure to omit `optimizedPath` and fall back to the original bytes
- [x] Keep write read-back/hash verification, crash/power-loss durability, orphan cleanup, project locking, optimizer quality, UI behavior, package merge/v2 and device budgets explicitly out of scope
- [x] Run focused/full verification and independent false-green/spec/runtime review before staging and a separate commit

Review record:

- Added `tests/assets/importWizardPublication.test.ts` and removed the matching deferred todo from `tests/assets/packagePublication.test.ts`; `src/**` remains unchanged. Every scenario uses a fresh one-model/one-image plan with distinct original-model, optimized-model and image bytes
- The ordinary success oracle relates the returned result to the reopened manifest and exact planned closure: the sole active actor log reparses to exactly four ordered create operations, state contains only the default set/profile and two fully specified assets, and every referenced original/image/optimized byte sequence is present at its dynamic binding
- Seven narrow expected-failure cases preserve the current baseline: the root marker starts before active logs/blobs, and six prefix/post-commit interruption rows currently leave the completion-marker path present without an exact reopenable closure. Only the optimized-blob interruption may satisfy the future oracle by omitting both optimized reference fields and falling back to the exact original bytes
- Fault reachability validates the complete intended set/image operation envelope and canonical final path family without fixing random IDs, JSON member order, mutation method or append count. Safety also treats every `projects/**/lociview.json` descendant as listing authority, matching the current home-project discovery boundary and preventing a nested staging marker from being ignored
- This tests-only characterization does not claim a production fix, resolved-write read-back/hash verification, crash/power-loss durability, orphan cleanup, locking, optimizer quality, UI-state completion, package merge/v2 coverage, device budgets or G0-S completion
- Verification passed: 3 focused files / 76 passing tests plus 3 todos, 29 full-suite files / 932 passing tests plus 24 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Three independent false-green, closure/spec and runtime/timing reviews reported no unresolved P0/P1 after exact authority, optimized fallback, marker-prefix, semantic reachability and listing-boundary gaps were corrected

### G0 characterization slice 17 — native-package required-blob verification closure

- [x] Add a one-shot resolved-corruption filesystem control that records exact requested bytes and in-action verification reads while allowing a future exact retry
- [x] Characterize new-project native-package copies under same-length bit-flip and truncation, separating fault reachability, read-back verification and marker-or-exact-closure safety
- [x] Characterize collaboration merge under a resolved same-length corruption, including transient state publication paired with the target blob bytes and final reopen safety
- [x] Build an actual native package whose otherwise-valid asset operation references one omitted required binary, then exercise shared inspection plus new-import and existing-merge safety without fixing error text; with the current API, an unchanged inactive/old result counts as blocked only when the action rejects
- [x] Allow private staging/quarantine and unreferenced orphan bytes; keep at-rest bit rot, declared package digests, incremental hashing, crash durability, wizard/model/attachment parity, UI status, typed issues and G0-S completion out of scope
- [x] Run focused/full verification and independent false-green/spec/runtime review before staging and a separate commit

### G0 characterization slice 17 review record

- Added `tests/helpers/resolvedCorruptingFs.ts` and expanded `tests/assets/packagePublication.test.ts`; `src/**` remains unchanged. The helper commits one deterministic same-length bit flip or truncation while resolving the canonical final write, records only in-action reads after that bad commit, leaves private staging alone and permits a later exact retry
- Eighteen ordinary controls independently bind the healthy native-package roles and bytes, resolved-corruption reachability, marker/history and HLC/own-sequence oracles, plus an actual ZIP that differs from its healthy source by exactly one still-referenced required binary. Nine narrow expected-failure assertions separately preserve read-back, transient-publication and final old-or-exact-new authority gaps; the representative package read-back todo was removed
- New-project history treats every `projects/**/lociview.json` descendant as listing authority. Existing-merge history accepts exact old or exact complete point-in-time authority, including same-byte rewrites, while rejecting transient public markers and partial/extra active JSONL logs; notification snapshots pair exact full state/operations/vector with the required blob bytes at the same observation point
- An inactive/old outcome is accepted only after the current import or merge action rejects, preventing fulfilled silent no-ops from masquerading as a typed blocked result. Complete exact authority may resolve normally. Error text, future typed disposition shape, private non-authoritative staging/quarantine and unreferenced orphan bytes remain unbound
- Verification passed: 4 focused files / 131 passing tests plus 5 todos, 29 full-suite files / 959 passing tests plus 23 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Three independent false-green, exact-closure/spec and runtime/timing reviews reported no unresolved P0/P1 after canonical-target gating, full marker/log history, complete-branch controls, wrong-result silent no-op and HLC/own-sequence findings were corrected. This remains tests-only characterization, not a production fix, declared-digest or crash-durability guarantee, wizard/model/attachment parity, device evidence or G0-S completion

### G0 characterization slice 18 — modeled package/replacement transaction interleaving

- [x] Add a method-neutral same-project transaction gate over one shared backing and two distinct `WorkspaceFS` facades; pause the first semantic active-log mutation, timeout-release a future serialized writer without deadlock, and record canonical log/blob start/commit order on one monotonic clock
- [x] Build a deterministic shared-workspace fixture with two identities/ProjectStore instances, one replacement target and one disjoint incoming package asset; independently bind operation envelopes, paths, actor logs and distinct source bytes
- [x] Exercise merge-first and replacement-first orders with future-safe exact whole-state candidates, separately isolating transaction serialization and point-in-time publication/blob closure as expected failures while allowing explicit safe rejection and commit-then-error
- [x] Add ordinary concurrent/serialized controls for the gate itself and allow private staging, deferred orphan cleanup and physical mutation-method changes; observe old-blob deletion for dangling-reference safety without treating cleanup as an append/blob-commit serialization boundary
- [x] Keep real `navigator.locks`/OPFS two-tab evidence, project-ID lock scoping, lock-unavailable read-only enforcement, crash/background release, same-asset typed conflict resolution, device evidence and G0-S completion out of this Node modeled-context slice
- [x] Run focused/full verification and independent false-green/spec/runtime review before staging and a separate commit

### G0 characterization slice 18 review record

- Added `tests/helpers/modeledTransactionGateFs.ts` and `tests/assets/packageReplacementConcurrency.test.ts`, and narrowed the existing browser-lock todo in `tests/assets/packagePublication.test.ts`; `src/**` remains unchanged
- The modeled gate uses one shared backing behind distinct frozen `WorkspaceFS` facades, records all mutation methods on one monotonic clock, snapshots the full backing at commit/publication time, and supports overlap, timeout-serialized and abort release without treating deferred cleanup as an authority-commit ordering boundary
- A real native-package inspection and a dynamically bound replacement operation exercise merge-first and replacement-first orders with disjoint actors, assets, paths and bytes. Exact semantic O/M/R/combined candidates cover manifest, active actor-log inventory, operations, state, vector and referenced blobs without fixing JSON member order, random IDs, mutation method or retry count
- Five ordinary tests independently cover the gate, candidate/outcome table, point-in-time snapshot behavior, private staging/orphans, cleanup freedom, semantic reformatting and negative oracle branches. Four narrow expected-failure assertions separately preserve the current cross-context serialization and published-blob-closure defects for both orders
- This is a same-process modeled-context characterization only. Real `navigator.locks`/OPFS two-tab evidence, project-ID lock scoping, lock-unavailable read-only enforcement, crash/background release, same-asset typed conflict resolution, device evidence, a production fix and G0-S completion remain open
- Verification passed: 3 focused files / 113 passing tests plus 5 todos, 30 full-suite files / 968 passing tests plus 23 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), TypeScript typecheck, and the production build (92 modules / 11 PWA precache entries). The existing approximately 789.61 kB viewer-chunk warning remains unchanged
- Three independent false-green, exact-closure and runtime/timing reviews reported no unresolved P0/P1 after transaction-local flush, semantic replacement, parsed-authority, retry-count, private-staging, cleanup, stale-HLC and isolated negative-control findings were corrected

### G0 stabilization slice 19 — verified model replacement

- [x] Add one reusable v1 exact read-back helper that copies the requested bytes, writes them, and rejects a missing, truncated or same-length-corrupt stored result before metadata dispatch
- [x] Route required replacement originals and optional optimized derivatives through verification; publish optimized path/size only after successful verification and otherwise fall back to the verified original
- [x] Make replacement metadata cross its existing `ProjectStore.flush()` durability barrier before any cleanup, and retain old blobs until a reference-aware durable cleanup/GC boundary exists
- [x] Promote only the now-satisfied replacement interruption, resolved-corruption and shared-reference expected failures to ordinary regressions; keep partial-JSONL repair, restart cleanup and typed concurrent-replacement work explicit
- [x] Keep add/import-wizard/caption write-path parity, streaming/incremental hashing, crash/power-loss durability, typed write status, project locking, at-rest corruption and G0-S completion out of this bounded root slice
- [x] Run focused/full verification and independent implementation/false-green/runtime review before staging and a separate commit

### G0 stabilization slice 19 review record

- Added `src/assets/verifiedWrite.ts` and routed `replaceModelAsset` original and optional optimized writes through an exact post-write read-back before metadata dispatch. The helper isolates both the caller buffer and comparison source from an adapter that mutates its write argument, and rejects missing, truncated and same-length-corrupt stored bytes
- Each replacement now uses one fresh ULID revision for its original/optimized pair, eliminating same-wall-clock path reuse. The operation is dispatched only after required verification, `store.flush()` is awaited as the existing durability barrier, and old blobs are retained for a future reference-aware durable cleanup/GC boundary
- Expanded replacement durability coverage with dynamic-path before/prefix/post-commit faults, bit-flip and truncation controls, same-timestamp consecutive replacements, exact live/reopened manifest-operation-state-vector/log authority, point-in-time referenced bytes, shared-old-blob preservation and attempted-versus-published fresh-path retry handling. The two modeled package/replacement publication-closure expectations now pass ordinarily; cross-context transaction serialization remains expected failure
- Partial JSONL recovery, optimized-path injection parity, restartable cleanup, typed concurrent replacement resolution, add/import-wizard/caption verification parity, streaming/incremental hashing, crash/power-loss durability, typed write status, project locking, at-rest corruption, device evidence and G0-S completion remain explicitly open
- Verification passed: 3 focused files / 58 passing tests plus 3 todos, 30 full-suite files / 981 passing tests plus 23 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), TypeScript typecheck, and the production build (93 modules / 11 PWA precache entries). The existing approximately 789.62 kB viewer-chunk warning remains
- Three independent implementation/runtime, exact-authority and false-green reviews reported no unresolved P0/P1 after unique-path collision, adapter mutation, fulfilled-silent-old, active-log inventory, shared point-in-time reference, future GC, dynamic naming and attempted-versus-published retry findings were corrected

### G0 stabilization slice 20 — verified model addition

- [x] Route the required `addModelAsset` original through the shared exact post-write verifier before any asset metadata is dispatched
- [x] Publish optional optimized path/size only after its candidate bytes verify exactly, otherwise continue from the verified original without a dangling optional reference
- [x] Make the returned asset ID cross the existing `ProjectStore.flush()` durability barrier inside `addModelAsset`
- [x] Add ordinary healthy, resolved bit-flip, resolved truncation and actor-log append-rejection scenarios with point-in-time referenced-byte and exact live/reopened authority oracles
- [x] Allow verified fresh-path retry, private staging and unreferenced corrupt orphans; keep optimized fault injection, partial-JSONL repair, typed durability status, cleanup and multi-context locking out of this bounded slice
- [x] Keep import-wizard/media/caption/native-package parity, new-project marker-last, streaming/incremental hashing, crash/power-loss durability, at-rest corruption, device evidence and G0-S completion explicit follow-up work
- [x] Run focused/full verification and independent implementation/false-green/runtime review before staging and a separate commit

### G0 stabilization slice 20 review record

- Routed `addModelAsset` required originals through the shared exact post-write read-back helper. Optional optimized metadata is assigned only after its candidate bytes verify, and the returned asset ID now crosses the existing internal `ProjectStore.flush()` barrier
- Added `tests/assets/modelAdditionDurability.test.ts` with nine ordinary assertions over a healthy STL addition, same-length bit flip, truncation and actor-log append rejection. The action boundary is reopened before any test-side settlement flush, so a missing internal barrier cannot be repaired into a false pass
- Exact O/N authority covers semantic manifest, canonical IDs/HLC/operation envelope, state, vector, all active JSONL inventory, returned ID and referenced bytes. Point-in-time notification snapshots bind the marker and active blob, while attempted corruption paths remain distinct from a future verified published retry path
- Ordinary controls reject manifest, malformed-ID, stale-HLC, extra-operation, extra-log, public-marker and referenced-blob corruption, while allowing semantic JSONL reformatting, private staging and unreferenced orphans. Retry/queue repair may finish as exact old or exact verified new authority; no error shape or physical write count is fixed
- Deterministic optimized-write fault injection, import-wizard/media/caption/native-package parity, new-project marker-last, partial-JSONL recovery, typed durability UI/status, cleanup/journal/GC, locks, streaming/digest/CAS, crash/power-loss and at-rest corruption remain explicit follow-up work; this slice does not claim device evidence or G0-S completion
- Verification passed: 6 focused files / 152 passing tests plus 5 todos, 31 full-suite files / 990 passing tests plus 23 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), TypeScript typecheck, and the production build (93 modules / 11 PWA precache entries). The existing approximately 789.62 kB viewer-chunk warning remains
- Three independent runtime/implementation, exact-closure and false-green reviews reported no unresolved P0/P1 after pre-settlement authority, retry freedom, canonical ULID/HLC, marker snapshots and positive/negative oracle controls were corrected

### G0 stabilization slice 21 — recoverable durable-write queue and truthful save status

- [x] Replace the poisoned promise chain with one recoverable FIFO that retains the failed head, retries it before later writes, and exposes immutable `queued` / `writing` / `durable` / `failed` plus retryable state
- [x] Within one trusted single-writer store, retain the acknowledged durable byte length, verify every newly appended tail exactly, accept an already committed desired result, repair only an exact partial tail prefix, and reject divergent suffixes without overwriting raw evidence
- [x] Keep normal writes automatic, make a later `flush()` retry a failed head, preserve exact FIFO under repeated quota/persistent failure, and continue blocking full/diff export until every acknowledged operation is durable
- [x] Make the viewer distinguish device-write durability from unexported changes; never display a failed in-memory state as saved and offer an explicit retry without conflating package generation or download start
- [x] Promote the existing `durableWriteQueue` recovery expectations to ordinary regressions and add only minimal state-transition/status formatting controls; do not add another broad fault matrix
- [x] Keep cross-tab/base-prefix mutation detection, crash/power-loss guarantees, background retry/journaling, typed issue persistence, package download completion and v2 storage/CAS out of this bounded v1 root fix
- [x] Run focused verification, then a gate/churn/xfail meta-audit before full verification and independent P0/P1 review; keep the commit atomic with a directly exposed dependent root fix when the exact intermediate tree is not green

### G0 stabilization slice 21 review record

- Replaced the rejected-promise chain with a retained-head FIFO drain. A later `flush()` retries the failed head before later operations; concurrent flushes share one drain, and failed writes no longer create an unhandled poisoned chain
- Each active log keeps its acknowledged durable length. Successful appends verify the exact new byte tail, commit-then-error is accepted only when the desired bytes are present, exact partial UTF-8 byte prefixes are repaired, and wrong/extra/shorter tails become nonretryable without overwriting evidence. OPFS treats only `NotFoundError` as absence and propagates transient lookup failures
- Added immutable durability status and subscriptions, and made queued observable before the new in-memory state. The viewer now separates persistent OPFS writes from MemoryFS tab-only retention and keeps package generation/download-started checkpoints independent from device durability; download start explicitly does not claim completion
- Existing recovery expectations now pass ordinarily across repeated quota, prefix, commit-then-error and persistent faults. Multi-store tests accept explicit fail-closed rejection but bind every fulfilled lane to exact raw/reopened operations and every rejected lane to failed pending status; the unresolved actor/serialization loss expectations remain expected failures
- Exact S21-only isolation exposed two existing package crash-boundary regressions because stricter queue verification changed the metadata-first timing. Rather than committing a red intermediate tree or weakening those ordinary assertions, the dependent blob-before-metadata S22 root fix is included in the same atomic commit
- Verification passed: 8 changed-area files / 213 passing tests plus 5 todos, 31 full-suite files / 1,004 passing tests plus 21 todos, fixture verification (10 Git entries / 708,867 bytes), evidence verification (3 pending device templates / 0 records), TypeScript typecheck, and the production build (95 modules / 11 PWA precache entries). The existing 796.08 kB viewer-chunk warning remains
- Cross-tab/base-prefix mutation detection, real OPFS crash/power-loss durability, background retry/journaling, durable typed issues, download completion/retention and v2 CAS remain open; this slice does not claim them

### G0 stabilization slice 22 — verified existing-project package merge

- [x] Preview the exact merged v1 state without mutating `ProjectStore`, then derive the visible asset original/optimized blob closure rather than trusting the package binary list alone
- [x] Validate one canonical unique package-binary registry, accept an existing destination only when its bytes are exact, and route missing writes through the shared exact post-write verifier before metadata application
- [x] Verify every final-state referenced blob before calling `mergeExternal`, including ops-only packages that rely on an already-present destination blob, then cross the existing `ProjectStore.flush()` durability barrier
- [x] Promote only the now-satisfied merge ordering, pending-write, resolved-corruption, missing-required, blob-interruption and same-path collision expected failures; keep new-project marker-last and actor-log partial-write recovery separate
- [x] Add or retain ordinary controls for byte-identical existing blobs, metadata-only/ops-only compatibility, optional optimized references, duplicate/path/size rejection and private unreferenced orphan freedom without fixing physical write counts or JSON member order
- [x] Keep typed collision evidence, package-declared digests, unknown future blob-reference fields, project locking, crash/power-loss recovery, cleanup/GC, streaming/device budgets, new-project/wizard/caption parity and G0-S completion explicitly out of scope
- [x] Run focused/full verification and independent implementation/false-green/spec review; commit atomically with S21 because the exact S21-only tree regresses existing package safety

### G0 stabilization slice 22 review record

- Existing-project merge now snapshots incoming operations, previews the merged state without publication, derives every visible `models/` / `media/` original and nonempty optimized reference, and validates the complete closure before calling `mergeExternal`
- Package binaries are copied into one canonical duplicate-free registry. Existing targets must be byte-identical, missing targets use exact post-write read-back, all required targets are re-read after writes, and target-operation drift aborts before metadata. Ops-only input may use exact existing bytes; an unchanged legacy asset may omit size, while a new or changed reference may not
- Merge publication, pending-I/O, resolved corruption, omitted required binary, blob interruption and same-path collision expectations now pass ordinarily. Exact final/reopened authority covers semantic manifest, active-log path inventory and actor-bound semantic operations while retaining existing raw prefixes, plus state, vector and original/optimized bytes; notification and fault histories reject unknown public markers or active logs
- Controls cover semantic manifest and appended-operation JSON formatting, empty/verified optimized references, caller mutation during async preflight, duplicate/noncanonical entries, missing path/size, invalid size, missing baseline target and unreferenced orphan freedom. Actor-log prefix/partial recovery remains expected failure rather than being hidden by fixed actor ordering
- Verification passed as part of the same 8-file / 213-pass integration run and 31-file / 1,004-pass full suite, with the same fixture, evidence, typecheck and 95-module production-build results recorded above
- Typed collision evidence, declared digests for ops-only identity, unknown future reference fields, locking, actor-log atomic recovery, new-project/wizard/caption marker-last parity, cleanup/GC, streaming/device budgets and crash/power-loss durability remain open; this is not full G0-S completion

### G0 stabilization slice 23 — unique actor per ProjectStore lifetime

- [x] Replace the deterministic user/device actor used by `ProjectStore` with one canonical CSPRNG actor fixed for that store lifetime
- [x] Keep operation actor, HLC suffix and active JSONL filename bound to the same session actor while retaining read compatibility with every existing actor log
- [x] Promote only the existing distinct-actor, two-seed 2 x 1,000 exact-operation and same-identity simultaneous-store expectations that this root fix satisfies
- [x] Require both healthy lanes to fulfill durably with all 2,000 exact raw/reopened operations and visible entities; do not accept fail-closed rejection as completion evidence
- [x] Adapt deterministic actor assumptions in exact publication fixtures to observed canonical actors without weakening manifest, operation, log-inventory or blob authority checks
- [x] Keep shared-external-actor append serialization, package/replacement transaction locking, `navigator.locks`, lock-unavailable read-only mode and physical-iOS evidence explicitly open
- [x] Run focused/full verification and independent implementation/false-green review, then record a short gate/churn meta-audit before choosing another slice

### G0 stabilization slice 23 review record

- Added a canonical 65-bit CSPRNG actor generator and made each live `ProjectStore` issue one actor for its lifetime. Local operation actor, HLC suffix and active JSONL filename remain bound, while reopening reads every legacy actor log and starts a fresh local writer actor
- Promoted five static expected-failure declarations, expanding to eight runtime cases: distinct simultaneous-store actors, two seeds times raw/reopened/visible exact 2,000-operation stress checks, and the same-identity simultaneous-store smoke. Healthy lanes must fulfill with durable zero-pending status; fail-closed rejection is not counted as completion
- Rebound wizard, package-publication, malicious-ingress and operation-budget fixtures to each observed store actor. Native package bytes, semantic operation multisets, manifest/state/vector, exact active-log inventory and referenced blobs remain checked rather than weakening authority to accommodate random actors
- The malicious own-actor case independently proves its raw ZIP shape and permits explicit inspection or merge rejection. A post-rejection probe now verifies each side's marker, sole actor log, exact semantic `[baseline, probe]` raw operations and live/reopened state/vector, so a delayed malicious append cannot hide behind rolled-back memory, sequence or clock state
- Focused verification passed 9 files / 418 tests plus 15 todos; the full suite passed 31 files / 1,006 tests plus 21 todos. Fixture verification reported 10 Git entries / 708,867 bytes and one unratified GS candidate; evidence verification reported 3 pending device templates and 0 run/environment/artifact records. Typecheck and the production build passed at 95 modules / 11 PWA precache entries, with the existing 795.94 kB viewer-chunk warning
- Three independent implementation/runtime, exact-closure and false-green reviews reported no unresolved P0/P1 after native reinspection, actor-order freedom, reopened-store rebinding, explicit rejection and post-probe durable-authority findings were corrected
- Shared external-actor append serialization, package/replacement transaction locks, real `navigator.locks`/OPFS two-tab proof, project-scoped locking, lock-unavailable read-only behavior and physical-iOS evidence remain open; this is a bounded local opId fix, not G0S-TAB completion

### Post-slice-23 gate/churn checkpoint

- S23 closes one high-severity, immediately implementable opId-collision root defect, but G0-S remains partial: 58 direct expected-failure declarations and 21 todos remain, with shared-actor/cross-context locking, untrusted ingress, new-project publication and external evidence still blocking the gate
- The slice changes only 11 production lines but requires substantial exact-fixture adaptation because earlier tests encoded deterministic actor identity. That one-time compatibility cost is justified by preserving closure strength, but another actor-only characterization slice is not: the next slice must remove a production blocker
- The best ready risk/size tradeoff is native `importNewProject` verified private publication with activation marker last. Its existing acceptance already covers resolved corruption, omitted required blobs, interruption history and marker/listing closure. Wizard activation, actor-log partial recovery and browser locking remain separate dependencies rather than expanding that slice

### G0 stabilization slice 24 — verified native-project activation

- [x] Snapshot and preflight one native `ZipInspection` before mutation: no existing completion marker, canonical unique direct actor-log paths, clean raw JSONL, canonical unique binary paths and no unexpected pre-existing active log
- [x] Derive the visible asset original/nonempty-optimized closure from the raw operation files, require exact package source bytes, and reject every missing, declared-size-mismatched, invalid-size or conflicting required binary before writing anything; an undeclared legacy size remains compatible because the package bytes themselves are verified
- [x] While the project remains inactive, preserve raw operation text and every package binary through exact post-write read-back, then recheck the complete active-log inventory and required referenced bytes
- [x] Write and verify the manifest/completion marker only after the full closure is exact; do not delete an unowned concurrent marker after failure, and leave prefix-write/process-crash/atomic-marker recovery explicitly open
- [x] Promote only the existing native-import marker/order, interruption, resolved-corruption and omitted-required-blob expectations now satisfied; retain unknown fields, private inactive orphans and unreferenced package binaries without fixing physical write count or JSON member order
- [x] Keep wizard/caption parity, full untrusted-operation policy, actor-log partial recovery, cross-context locking, atomic rename/transaction, cleanup/GC, streaming/CAS and device crash evidence out of this bounded slice
- [x] Run focused/full verification and independent implementation/closure/false-green review, record exact remaining xfails and gate impact, then commit separately

### G0 stabilization slice 24 review record

- `importNewProject` now snapshots the parsed manifest, raw actor-log text, reported parse disposition and every package binary before its first await. It reparses raw JSONL, binds each operation and HLC suffix to one canonical direct actor-log path, and ignores later caller mutation of the inspection object and buffers
- Native import derives the final visible original/nonempty-optimized blob closure from those raw operations. Every referenced blob must have package source bytes; declared size must be a valid exact match, while an undeclared legacy size remains compatible because those source bytes themselves become the exact read-back authority
- While no completion marker exists, every raw actor log and package binary is written through exact post-write verification, then active-log inventory, raw bytes, parse cleanliness and all required references are rechecked. The manifest marker is verified last. A failed marker write is not followed by an ownership-blind delete that could remove another context's authority
- Controls bind fulfilled actions to the expected project ID and exact manifest/log/allOps/state/vector/original/optimized closure. They exercise caller mutation of all binary buffers, unknown nested operation fields, unreferenced package bytes, private inactive bytes, undeclared legacy size, missing/invalid/mismatched optimized bytes, conflicting declared sizes, marker-before-all-package-bytes ordering, active-target and canonical-extra-log mutation-zero, resolved raw-log corruption and internal-or-explicit same-directory retry without fixing write versus append or text versus bytes methods
- Eleven native-import runtime expectations are now ordinary: the package smoke, marker-last, four newly safe interruption rows, four resolved-corruption assertions and omitted-required-blob rejection. Ten additional malicious-envelope assertions become ordinary only as incidental preflight defense-in-depth; inspection-stage typed rejection/quarantine and the broader malicious corpus remain open. The strict manifest-prefix history assertion remains expected failure because the current filesystem has no atomic activation primitive
- Verification passed: 4 focused files / 349 passing tests plus 13 todos, 31 full-suite files / 1,010 passing tests plus 21 todos, fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate), evidence verification (3 pending device templates / 0 run, environment or artifact records), TypeScript typecheck, and the production build (95 modules / 11 PWA precache entries). The existing 799.21 kB viewer-chunk warning remains
- Independent implementation/runtime, exact-closure and false-green reviews reported no unresolved P0/P1. Manifest-prefix/process-crash atomicity, same-directory cross-context locking, full G0S-OP and unknown-future-reference policy, wizard/caption parity, actor-log partial recovery, cleanup/GC, streaming/CAS, device durability and G0S-BLOB/G0-S completion remain explicitly unclaimed

### Post-slice-24 gate/strategy checkpoint

- [x] Re-rank the remaining G0/G0-S work by user-data severity, dependency, existing acceptance strength and bounded production readiness instead of continuing the previous slice sequence by inertia
- [x] Keep the production-fix lane active: S21-S24 retired separate queue, merge, actor-collision and native-activation defects, so another tests-only characterization slice is not justified
- [x] Rank full G0S-OP hardening highest by security severity but not as one immediate slice: duplicate-aware raw parsing, opaque evidence, known-field quarantine and canonical collision reporting must be separated before implementation
- [x] Keep G0S-TAB shared-path locking behind the real browser/OPFS, project-scoping and lock-unavailable read-only contract rather than substituting a same-process model
- [x] Select wizard inactive verified activation as the next bounded root fix because its marker-first and unverified-blob defects are live, its dependencies are local, and the existing S16 oracle already covers the publication boundary
- [x] Apply a stop rule: do not add a standalone characterization matrix; stop and re-plan if the fix requires a general transaction API, typed quarantine/digest policy, browser lock, or atomic filesystem primitive

### G0 stabilization slice 25 — verified import-wizard activation

- [x] Add one narrow unpublished `ProjectStore` initialization seam so wizard metadata can be built and flushed without exposing a completion marker; preserve the existing ordinary create path
- [x] Route wizard original model/media and optional optimized bytes through the shared exact post-write verifier, and publish optimized metadata only after its candidate bytes verify
- [x] Flush the complete operation log, recheck the referenced original/nonempty-optimized asset closure, then write and verify the manifest marker last
- [x] Bind fulfilled actions to the exact expected result/closure and rejected actions to marker-absent or exact-complete authority; retain caller-owned source isolation and allow private inactive orphans
- [x] Promote only the existing marker/order and handled interruption expectations satisfied by this root fix; keep marker-prefix/process-crash atomicity expected-failing
- [x] Add the smallest resolved-success integration controls needed to prove each distinct wizard write role reaches exact verification, reusing existing closure helpers rather than adding a broad new matrix
- [x] Keep caption attachment, native package, actor-log atomic recovery, same-directory locking, cleanup/GC, streaming/CAS, device evidence and full G0S-BLOB/G0-S completion out of scope
- [x] Run focused/full verification and three independent implementation/closure/false-green reviews, then record the exact promotion count and remaining blockers before commit

Review record:

- Added `ProjectStore.createUnpublished()` as a wizard-only initialization seam while preserving the existing marker-first `create()` behavior and its focused regression coverage
- `applyImportPlan()` now snapshots caller identity/options/migration/maps and one-shot source files before its first await, verifies original model/media and optional optimized bytes before publishing their metadata, flushes the full log, rechecks every referenced path with compact SHA-256 receipts, and verifies the manifest marker last
- The activation oracle now binds full state/all operations/vector/recursive active-log inventory/referenced bytes and every project marker at marker start/commit. It permits exact deactivate/no-op cleanup and inactive repair/republication, but rejects partial markers or mutation of active authority; caller aliases, mutable objects/options/identity and all three write roles are reached by ordinary controls
- Promoted 6 existing runtime expected failures to ordinary assertions (marker-last plus 5 handled interruption safety rows). The root-marker-prefix row remains expected-failing because WorkspaceFS has no atomic activation primitive. Added 5 ordinary runtime controls: 3 resolved wrong-byte roles, one post-verification receipt recheck control covering original/optimized/media, and one call-entry snapshot control
- Verification passed on the exact final tree: 4 focused files / 75 tests, 31 full-suite files / 1,015 passing tests plus 21 todos, TypeScript typecheck, fixture verification (10 Git entries / 708,867 bytes; one unratified GS candidate), evidence verification (3 pending device templates / 0 run, environment or artifact records), and production build (95 modules / 11 PWA precache entries, 884.03 KiB). The existing 799.39 kB viewer-chunk warning remains
- Three independent production/runtime, closure/future-correctness and false-green/scope reviews found no unresolved P0/P1. The test diff is intentionally larger than the production seam because the pre-existing publication oracle did not bind point-in-time authority; the scope review found no standalone characterization matrix or safely removable oracle group
- Manifest-prefix/process-crash atomicity, caption attachment, native-package behavior beyond S24, actor-log partial recovery, same-directory cross-context locking, cleanup/GC, streaming/CAS, device durability/evidence and full G0S-BLOB/G0-S completion remain explicitly unclaimed

### Post-slice-25 gate/strategy checkpoint

- [x] Recount the current expected failures and todos, reread the approved G0/G0-S exits, and rank remaining work by user-data risk, dependency and existing acceptance readiness
- [x] Keep full G0S-OP highest by security severity, but do not combine duplicate-aware raw parsing, known-field quarantine, canonical collision evidence and legacy-ID compatibility in one slice
- [x] Keep G0S-TAB, actor-log partial recovery and atomic marker-prefix recovery blocked on browser locking, transaction/journal or atomic filesystem primitives rather than substituting a Node-only model
- [x] Prefer the already-characterized local-dispatch budget defect over caption attachment and migration work: it is one production seam, has exact old-state/next-op/reopen acceptance, and prevents acknowledged local state from disappearing on reload
- [x] Continue the production-first stop rule: no standalone characterization slice, and no claim beyond parity with the two currently exported/configured local JSONL guards

### G0 stabilization slice 26 — local dispatch budget preflight

- [x] Reject a local dispatch whose direct `v` field count exceeds `LIMITS.maxFieldsPerOp` before sequence, HLC, memory state, listener, queue or filesystem mutation
- [x] Reject a local dispatch whose prospective serialized operation exceeds `MAX_LINE_CHARS`, using a pure fixed-width HLC preview rather than mutating and rolling back the live clock
- [x] Preserve the current valid dispatch path and prove that the next valid operation after rejection has the same actor-bound sequence/HLC position and durable authority as an untouched twin
- [x] Promote only the existing two budget rows' six runtime expected failures; do not add a new fault matrix
- [x] Keep recursive depth/node/string budgets, raw whitespace policy, reserved keys, canonical HLC/ID/actor/user, known-field quarantine, duplicate-aware parsing, collision evidence, package/open ingress and full G0S-OP completion explicitly open
- [x] Run focused/full verification, typecheck, fixture/evidence checks and production build; complete independent implementation/closure/false-green review before commit

Review record:

- `ProjectStore.dispatch()` now checks the direct payload field count and the complete prospective serialized operation before advancing its sequence or HLC. The HLC preview uses the production formatter with a fixed-width value, so the length check is pure and the accepted path still creates the real clock value exactly once
- Both configured maxima are inclusive, matching the existing JSONL parser/schema guards rather than creating a product/device budget guarantee. Ordinary controls cover modest input, exactly `MAX_LINE_CHARS`, exactly `LIMITS.maxFieldsPerOp`, and N+1 rejection with an explicit throw
- The existing two rejection rows now prove no allOps/state/listener/log mutation and no hidden sequence/HLC poisoning by comparing the next valid dispatch, durable log and reopen against an untouched actor-normalized twin. Six runtime expected failures became ordinary without adding another fault matrix
- Verification passed on the exact final tree: 3 focused files / 323 passing tests plus 4 todos; 31 full-suite files / 1,015 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (95 modules / 11 PWA precache entries, 884.42 KiB). The existing 799.79 kB viewer-chunk warning remains
- Independent production/runtime, exact-boundary/future-correctness and false-green/scope reviews found no unresolved P0/P1 after explicit rejection, exact-limit positive controls and guard-status wording were corrected. The tree retains 43 direct `it.fails` declarations plus 21 todos; parameterized G0S-OP expectations make the runtime expected-failure count larger
- Recursive budgets and hostile accessor snapshots, raw whitespace, reserved keys, canonical HLC/ID/actor/user, known-field quarantine, duplicate-aware parsing, collision evidence, package/open ingress, device-derived hard limits and full G0S-OP/G0-S completion remain explicitly unclaimed

### Post-slice-26 gate/strategy checkpoint

- [x] Re-rank the remaining immediately implementable work after the budget root fix instead of extending the G0S-OP characterization matrix
- [x] Keep full G0S-OP structural/canonical ingress work blocked on legacy-ID compatibility, duplicate-aware raw evidence and typed collision/quarantine design; keep G0S-TAB and atomic marker/log recovery behind browser locks or filesystem transaction primitives
- [x] Select caption attachment publication as the next bounded root fix because it is the remaining live UI path that writes an unverified blob, publishes asset metadata without an internal durability barrier and drops asynchronous failures
- [x] Limit the slice to verified media bytes, metadata-after-verification ordering, exact referenced closure, an internal flush and surfaced UI failure; do not introduce a general batch/transaction API
- [x] Apply the production-first stop rule: add only the smallest Node acceptance needed for this previously private DOM closure, and stop if correct behavior requires all-or-none multi-operation durability, cleanup/GC, locking or streaming/CAS

### G0 stabilization slice 27 — verified caption attachments

- [x] Extract one DOM-independent attachment action that snapshots File-bound descriptors before its first await, reads one source at a time and writes each fresh media blob through the shared exact post-write verifier
- [x] Keep only staged metadata in memory, publish asset operations only after every selected blob verifies, update the current caption attachments last without an intervening await, and return IDs only after `ProjectStore.flush()` succeeds
- [x] Preserve the existing caption Undo update, reset file inputs after capture and surface action rejection through the existing information dialog rather than leaving an unhandled `void` promise
- [x] Add a compact healthy two-file control plus resolved bit-flip/truncation and actor-log rejection coverage; bind notifications, action boundary and reopen to causal old/staged/complete authority in which every visible asset and caption reference has exact bytes
- [x] Permit verified unreferenced blobs and verified staged asset records after rejection, fresh-path retry and semantic JSONL formatting; reject fulfilled partial/no-op outcomes and never use a test-side flush to satisfy the action's durability barrier
- [x] Keep multi-operation all-or-none durability, actor-log prefix recovery, same-caption/cross-tab locking, MIME/content/decode validation, media limits, cleanup/GC, streaming/CAS, crash/power-loss and full G0S-BLOB/G0-S completion explicitly open
- [x] Run focused/full verification, typecheck, fixture/evidence checks and production build; complete independent implementation/closure/false-green review before commit

Review record:

- Added one DOM-independent caption-attachment action. It snapshots descriptor/read functions before the first await, reads and copies one immutable File payload at a time, writes every fresh direct `media/` child through exact post-write verification, retains metadata rather than aggregate source bytes, and publishes no asset operation until all selected blobs verify
- Immediately before publication the action rechecks the target caption and derives its latest string attachment list. It then dispatches all asset creates and the existing Undo-backed caption update without an intervening await, crosses an internal `ProjectStore.flush()` barrier, and only then returns the new IDs; metadata size comes from verified bytes rather than `File.size`
- The UI captures `FileList` membership into immutable File objects, resets the input for same-file reselection and reports rejection through `infoDialog`. It retains the prior caption Undo semantics and does not silently discard the asynchronous action failure
- Eleven ordinary tests cover healthy two-file publication, resolved bit-flip/truncation of the second source, and semantic append rejection at both the first asset and final caption update. Point snapshots and action-boundary reopen classify exact old, verified-asset prefix or complete authority; fulfilled requires complete durable authority, while rejected recovery may finish at any causal candidate without fixing retry count, write method, asset-op order or notification count
- The dedicated test is 700 lines versus 116 added production lines. This is intentionally not another tests-only slice: most of the test is the first Node-accessible manifest/operation/state/vector/log/blob point-in-time oracle for the previously private DOM closure. A shared model/addition publication-helper refactor could reduce duplication, but touching established tests solely for line count would widen this root fix; the next slice must reuse existing expected failures rather than add another matrix
- Verification passed on the exact final tree: 4 focused files / 94 passing tests plus 3 todos; 32 full-suite files / 1,026 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 885.21 KiB). The existing 799.79 kB viewer-chunk warning remains
- Independent production/runtime, exact-closure, false-green and final current-tree reviews found no unresolved P0/P1 after notification/retry freedom, semantic source-role mapping and durable-prefix direction were corrected
- Multi-operation all-or-none durability, actor-log prefix recovery, same-caption/cross-tab locking, MIME/content/decode validation, media limits, orphan cleanup/GC, streaming/CAS, crash/power-loss, physical-device evidence and full G0S-BLOB/G0-S completion remain explicitly unclaimed

### Post-slice-27 gate/strategy checkpoint

- [x] Recount the remaining expected-failure families and distinguish implement-now production seams from browser-lock, transaction, device-evidence and product-policy blockers
- [x] Confirm that the product blob-write paths now use exact verification; do not invent another blob characterization slice while structural archive and operation-ingress defects remain
- [x] Rank ZIP structural rejection ahead of the broader operation firewall for the next slice because its approved raw fixtures already isolate eleven failures and zip.js exposes strict ambiguity/signature checks without a new parser
- [x] Keep the next G0S-OP phase bounded to a later shared structural gate; do not mix typed evidence, legacy-ID policy, duplicate-aware raw parsing or collision resolution into this ZIP slice
- [x] Apply a stop rule: if ZIP safety requires a custom general ZIP parser, device-derived numeric limits, streaming, typed issue persistence or archive-format policy beyond the approved fixtures, stop and re-plan

### G0 stabilization slice 28 — strict ZIP structural guard

- [x] Enable zip.js strict archive/local-header ambiguity checks and CRC verification before an entry can be returned to package, XLSX or wizard inspection
- [x] Reject C0, DEL and C1 entry-path controls plus exact or case-folded file-versus-descendant prefix conflicts while preserving valid Unicode names and explicit directory parents
- [x] Reject content-disguised nested ZIP payloads by signature in addition to the existing archive-extension guard, while preserving the explicitly supported `.xlsx` container path needed by foreign LociMyu migration
- [x] Promote only the existing ZIP structural expected failures and directly satisfied malicious-package structural assertions; add no standalone characterization matrix
- [x] Keep native-versus-foreign `.xlsx` context policy, ZIP64/data-descriptor layout, entry ordering, compression algorithm, Unicode normalization/case collision beyond file-prefix ambiguity, symlink/special-mode policy, invalid UTF-8, ratio/device limits, streaming and full malicious-package/G0-S completion explicitly open
- [x] Run focused/full verification, typecheck, fixture/evidence checks and production build; complete independent implementation/closure/false-green review before commit

Review record:

- `readZipEntries()` now asks zip.js for strict central/local-header ambiguity validation and verifies every extracted file's CRC. Directory entries participate in entry-count, declared-size, control-path and namespace preflight rather than disappearing before safety checks
- Portable-path preflight rejects C0/DEL/C1 and exact normalized duplicates. An internal ASCII-only folded namespace detects a file used as an ancestor or as the same logical directory in either entry order; sorted lower-bound lookup avoids quadratic work on separator-heavy maximum-length names while leaving returned entry order and Unicode spelling unchanged
- Nested archive extensions remain blocked, and signature-valid ZIP payloads hidden under another extension are now rejected after verified extraction. `.xlsx` is the sole supported container-path exception needed by the LociMyu/Drive wizard; its inner workbook is parsed again through the same strict reader. Native-versus-foreign `.xlsx` context policy remains open rather than being invented here
- Promoted 32 existing runtime expected failures without adding a characterization matrix: 11 ZIP structural assertions and 21 directly dependent malicious-envelope inspection, no-mutation and inactive-authority assertions. Direct `.fails(` declarations fell from 43 to 34; parameterized G0S-OP and malicious expectations still make the runtime remainder larger
- Verification passed on the exact final tree: 4 focused files / 286 passing tests plus 12 todos; 32 full-suite files / 1,026 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 886.30 KiB). The existing large viewer-chunk warning is now approximately 800.90 kB
- Independent production/runtime, exact-oracle and false-green reviews found no unresolved P0/P1 after the legitimate nested-XLSX compatibility boundary and separator-heavy path complexity findings were corrected. ZIP64/data descriptors remain delegated to zip.js rather than fixed to the tests' ZIP32 layout
- Unicode normalization/general case collision, invalid UTF-8, symlink/special mode, native-package `.xlsx` context, compression-ratio/device limits, typed archive issues, streaming, MIME/decode/polyglot policy, cross-context locking, crash/device evidence and full malicious-package/G0-S completion remain explicitly unclaimed

### Post-slice-28 gate/strategy checkpoint

- [x] Re-read the approved G0/G0-S gates, current production ingress, remaining expected failures and the external-evidence state before selecting another slice
- [x] Keep the production lane moving while physical-device measurements, representative external fixtures, numeric thresholds and product-owner release approval remain a separate blocking evidence lane with zero completed records
- [x] Select one shared post-JSON operation firewall rather than splitting reserved names, HLC shape and envelope rules into repeated micro-slices: these rules are already approved and meet at the same validator seam
- [x] Rank browser cross-context locking, actor-log/marker crash atomicity and typed collision/quarantine behind this slice because they require a lock, transaction/journal or durable issue API that the current v1 surface does not provide
- [x] Apply a hard stop boundary: do not add a duplicate-aware raw parser, invent canonical digests, enforce legacy user/entity-ID migration policy, implement known-field quarantine or choose recursive resource limits in this slice

### G0 stabilization slice 29 — shared post-JSON operation firewall

- [x] Replace the permissive decoded-operation check with one shared validator/clone that enforces the closed top-level envelope, exact create/update/delete `v` presence rules, recursive dangerous-key rejection, finite JSON values, decoded NFC-key collision rejection and canonical HLC/actor binding
- [x] Apply the same gate to JSONL open/package parsing, local dispatch before sequence/clock/state/listener/queue mutation, and direct external merge as an all-input preflight before clock/state/publication mutation
- [x] Defend reducer and version-vector indexes with `Map` or null-prototype storage without changing the public semantic state, and retain recursively safe unknown evidence, escaped controls and NFC-distinct values unchanged
- [x] Promote only the existing operation-corpus and untrusted-operation assertions satisfied by this gate; reuse one existing next-valid/twin authority check for local rejection and strengthen the existing safe-unknown positive rather than adding a new matrix
- [x] Keep duplicate raw members, invalid Unicode raw decoding, raw evidence/digest generation, known-field control quarantine, canonical user/known-entity ID migration, same-key collision reporting, recursive budgets and full G0S-OP/G0-S completion explicitly open
- [x] Run focused tests, typecheck, then full tests, fixture/evidence verification and production build; complete an independent P0/P1/future-correctness audit and a short scope/churn check before commit

Review record:

- `cloneValidatedOp()` is now the shared decoded-operation firewall. It returns an ownership-isolated JSON clone only for the approved closed envelope, exact type-specific `v` shape, finite values, canonical actor-bound HLC, and recursively safe non-colliding decoded keys. JSONL parsing retains raw evidence while admitting only that clone
- `ProjectStore.dispatch()` validates a pure prospective operation before advancing sequence/HLC or changing memory, listeners or the durable queue. `mergeOps()` validates and clones both complete batches before reduction, so package preview and direct external merge share one fail-closed preflight and retain no caller-owned aliases
- Reducer entity, field and version-vector indexes use `Map` internally and materialize ordinary public records. Existing merge/JSONL/simulation fixtures now use deterministic canonical actor IDs; public semantic object prototypes and merge algebra remain unchanged
- Fifty existing runtime expected failures became ordinary (48 shared-corpus ingress assertions plus 2 direct untrusted-operation controls). One existing safe-unknown row now covers lowercase hexadecimal HLC counters, near-miss reserved names, reserved words as values and NFC-distinct keys across all three ingresses; one compact direct-store control covers both batch orders and caller-alias isolation without adding a new fixture or parameter matrix
- Rejected local/direct mutations are checked through point-in-time marker and complete active-log authority rather than physical write counts. Accepted open/package/local authority and the post-rejection probe are bound to independently derived semantic operation multisets, reduced state, vector, manifest and complete active-log inventory. Same-byte writes, no-op removes, JSONL formatting changes and private non-authoritative evidence remain free
- Scope/churn review found the slice upper-bound but justified: production is 5 files / +230/-69, while tests and deterministic fixture adaptation are 5 files plus one helper / +727/-60. The larger test side reuses the approved corpus and shared exact-authority helpers; there is no tests-only slice, new fixture matrix or unrelated production change. Direct `it.fails` declarations fall from 34 to 32
- Verification passed on the exact final source/test tree: 6 focused files / 332 passing tests plus 2 todos; 32 full-suite files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 888.38 KiB). The existing large viewer chunk warning is approximately 803.03 kB
- Independent production/runtime, closure/future-correctness and false-green reviews found no unresolved P0/P1 after public-authority checkpoints, independently derived direct-probe authority, exact accepted authority and canonical pure-test fixtures were corrected
- Duplicate raw JSON members, invalid raw Unicode, raw canonical evidence/digests, known-field control quarantine, canonical user/known-entity ID migration, same-key collision reporting, recursive resource budgets, hostile Proxy side effects and full G0S-OP/G0-S completion remain explicitly unclaimed

### Post-slice-29 gate/strategy checkpoint

- [x] Recount the remaining expected failures and todos by production root, recheck the approved G0/G0-S dependencies and keep the external evidence lane explicit before selecting another implementation slice
- [x] Confirm that the last three slices each shipped a production root fix, while treating the S27/S29 exact-authority test churn as an upper bound rather than a pattern to extend
- [x] Rank mixed valid/malformed existing-project merge above manifest/parser expansion because it is a live partial-authority defect with five existing acceptance assertions, one production seam and no API, device or product-policy blocker
- [x] Keep decoded manifest validation, duplicate-aware raw JSON parsing, typed quarantine/evidence, cross-tab locking, actor-log/marker atomicity and the six independent migration roots outside the next slice

### G0 stabilization slice 30 — malformed-operation merge preflight

- [x] Snapshot the inspection error disposition, incoming operations and binary bytes before the first await in `mergeFromInspection()`, and reject any nonzero operation-error count before target flush, blob I/O, preview, clock/state change, notification or durable append
- [x] Preserve the healthy exact-complete merge path and strengthen the existing caller-owned inspection control so operation and binary aliases mutated immediately after invocation cannot change the snapshotted authority
- [x] Promote only the five existing mixed-valid/malformed existing-project merge assertions, binding explicit rejection to exact old manifest/log/allOps/state/vector/reopen authority and an unchanged next-valid HLC/own-sequence probe
- [x] Add no new fixture or fault matrix, and keep typed issue/quarantine reporting, raw duplicate detection, evidence location/digest, known-field/user/ID policy, private evidence, cross-context locking and crash/transaction guarantees explicitly open
- [x] Run focused/full tests, typecheck, fixture/evidence verification and production build; complete independent P0/P1/future-correctness and scope/churn review before a separate commit

Review record:

- `mergeFromInspection()` now rejects any nonzero inspected operation-error count synchronously, then ownership-clones the accepted operation batch and builds a unique registry of copied binary bytes before its first await. The target flush, blob reads/writes, preview, clock/state/listener changes and durable append are therefore unreachable for a reported malformed mix
- The existing caller-owned inspection control now mutates the error count, nested and top-level operation fields, operation-array membership, binary path/data aliases and binary-array membership immediately after invocation. The action still publishes the original exact complete authority, proving the merge uses one call-entry operation/binary snapshot rather than a later live view
- Five existing mixed-valid/malformed existing-project expectations are ordinary. Explicit rejection retains the exact manifest and complete recursive active-log inventory, semantic `allOps`, reduced state, vector and reopen authority; a target/twin next-valid probe independently verifies unchanged local sequence and HLC position
- Method-neutral write/append/remove checkpoints compare point-in-time active authority bytes with the baseline, so transient public corruption followed by restoration is rejected while same-byte writes, no-op removal and private non-authoritative evidence remain free. No new fixture, parameter matrix or fault row was added
- Scope/churn stayed bounded: production is one file / +6/-2, while the two existing acceptance files are +117/-33 to strengthen shared exact-authority and caller-alias controls. Direct `it.fails(` declarations fall from 32 to 27; typed quarantine/evidence, raw duplicate parsing/digests, known-field/user/ID policy, cross-context locking, crash transactions and full malicious-package/G0-S completion remain open
- Verification passed on the exact source/test tree: 2 focused files / 322 passing tests plus 13 todos; 32 full-suite files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 888.47 KiB). The existing large viewer chunk warning is approximately 803.13 kB
- Independent production/runtime, exact-closure and false-green/scope reviews found no unresolved P0/P1 after method-neutral active-authority checkpoints and point-in-time notification authority were bound into the promoted assertions

### Post-slice-30 gate/strategy checkpoint

- [x] Recount the remaining expected failures and todos after the malformed-merge root fix, separating decoded manifest defects from raw JSON/UTF-8 parsing, schema policy, operation identity, migration, browser-lock and transaction roots
- [x] Rank the decoded manifest firewall first because 58 approved existing expectations share one post-JSON/pre-projection seam and have positive compatibility controls, while future-schema, strict raw decoding, cross-tab and atomic publication roots still have policy, parser, lock, journal or device blockers
- [x] Keep the production-first limit explicit: no new fixture or parameter matrix, no raw duplicate-aware parser, no schema-version decision, no resource-budget invention and no typed evidence/quarantine API in the next slice

### G0 stabilization slice 31 — decoded manifest firewall

- [x] Reuse the S29 safe decoded-JSON ownership clone for manifest objects before known-field projection, with a manifest-only valid-Unicode-scalar requirement that leaves the accepted v1 operation set unchanged
- [x] Reject recursive exact `__proto__` / `prototype` / `constructor` own keys, NFC-equivalent decoded key collisions, lone-surrogate strings or keys and non-finite decoded numbers before inspection can return a candidate manifest
- [x] Preserve the ordinary public `ProjectManifest` shape and safe unknown/near-miss/value-only, finite exponent, distinct-normalization and paired-astral controls across inspection, import, reopen and existing-project merge
- [x] Promote exactly the 58 existing decoded-manifest runtime expectations and bind explicit rejection to zero candidate activation plus exact old manifest/log/allOps/state/vector/reopen/next-probe authority without adding another test matrix
- [x] Keep raw exact/escaped-equivalent duplicate members, malformed UTF-8 bytes/names, non-NFC values, future-schema major/minor policy, known-field semantics, depth/node/string budgets, typed evidence and full malicious-package/G0-S completion explicitly open
- [x] Run focused/full tests, typecheck, fixture/evidence verification and production build; complete independent P0/P1/future-correctness and scope/churn review before a separate commit

Review record:

- `parseManifest` now validates and ownership-clones the complete decoded JSON tree before known-field projection, reusing the S29 dangerous-key, NFC-key-collision and finite-number gate while enabling Unicode-scalar validation only for manifests. The returned `ProjectManifest` remains an ordinary projected object, and operation/dispatch validation keeps its prior accepted set
- The existing malicious-package corpus promoted 58 runtime expectations: 12 decoded NFC-key-collision, 6 lone-surrogate, 27 recursive reserved-key and 13 non-finite-number assertions. Every invalid case now requires direct parser rejection plus explicit import/inspection and existing-merge rejection, zero candidate activation and the existing exact old manifest/log/allOps/state/vector/reopen/next-probe authority
- Existing compatibility controls remain ordinary and non-vacuous for safe unknown nested members, NFC-singleton/distinct keys, paired astral scalars, dangerous-name near misses and string values, and finite exponents. No new test fixture, test helper or parameter matrix was added
- Raw exact/escaped-equivalent duplicate members, malformed UTF-8 bytes or names, isolated non-NFC value policy, future-schema policy, known-field semantics, depth/node/string budgets, typed evidence/quarantine and full malicious-package/G0-S completion remain open
- Verification passed on the exact source/test tree: the focused malicious-package file had 235 passing tests plus 11 todos; the full suite had 32 files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 888.79 KiB). The existing large viewer chunk warning is approximately 803.46 kB
- Independent production/runtime and exact-closure reviews found no unresolved P0/P1 after the trailing-high-surrogate range check was made NaN-safe. Production changed only `schema.ts` and `manifest.ts` (+48/-11); the existing malicious-package test changed +57/-29, and direct `it.fails` declarations fell from 27 to 17 while runtime promotion remained exactly 58

### Post-slice-31 gate/strategy checkpoint

- [x] Recount the clean `e95c180` baseline as 17 direct `it.fails` declarations, 79 runtime expected failures and 21 todos: raw duplicate JSON members 17, operation field/identity policy 14, same-key operation collisions 6, residual ZIP envelope risks 24, future-schema edit policy 2, transaction/tab publication 10 and migration 6
- [x] Re-rank portable ZIP logical-name collisions first after independent review found that 12 approved NFC/ASCII-case expectations share the existing namespace seam and need only a bounded production change; keep the duplicate-aware raw JSON preflight second rather than adding its scanner in the same slice
- [x] Keep the production-first stop rule explicit: preserve raw returned ZIP names/order/bytes, add no dependency or test matrix, and stop if the change expands into general filename rewriting, Unicode case folding, malformed UTF-8, platform-specific filesystem behavior, schema/evidence or transaction work

### G0 stabilization slice 32 — portable ZIP logical namespace

- [x] Derive an internal logical namespace key as NFC followed by ASCII-only case folding, while returning every accepted ZIP path with its original normalized spelling, entry order and bytes unchanged
- [x] Reject two entries with the same logical key in either order and retain the existing file/directory and file-as-ancestor checks on segment boundaries without making the scan worse than O(entries log entries × path length)
- [x] Preserve isolated NFC, NFD, mixed-case and RTL names plus an explicit directory parent with its child; add at most one narrow positive self-control rather than another fixture matrix
- [x] Promote exactly the 12 existing Unicode-normalization and ASCII-case collision runtime expectations (two input orders × inspection/no-mutation/no-marker) with failure before any workspace mutation
- [x] Keep malformed UTF-8 names/payloads, symlink/special-mode policy, Unicode-wide case folding, platform-specific filesystem rules, raw duplicate JSON, future-schema, evidence and transaction roots explicitly open
- [x] Run focused/full tests, typecheck, fixture/evidence verification and production build; complete independent namespace-correctness, exact-closure, complexity and scope/churn review before a separate commit

Review record:

- ZIP namespace checks now derive a private `NFC → ASCII-only casefold` key for each sanitized entry. Any file/file, directory/directory or file/directory logical duplicate is rejected independent of input order, and file-as-ancestor checks use the same key and `/` segment boundary while retaining the sorted/lower-bound O(entries log entries × path length) design
- Accepted entries retain their original path spelling, order and bytes. The existing portable-name control now also proves an isolated NFD path and a mixed-case path round-trip unchanged alongside the existing NFC RTL and explicit-directory-parent controls
- The existing four Unicode-normalization/ASCII-case collision fixtures were added to the strict envelope set, promoting exactly 12 runtime expectations: both input orders must reject during inspection, perform zero workspace mutation and publish no completion marker. No new fixture, parameter matrix or test case was added
- Malformed UTF-8 names or payloads, symlink/special-mode policy, Unicode-wide or locale case folding, platform-specific filesystem rules, raw duplicate JSON, future-schema policy, typed evidence and transaction/lock roots remain open
- Verification passed on the exact source/test tree: focused 2 files / 258 passing tests plus 11 todos; full 32 files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (96 modules / 11 PWA precache entries, 888.80 KiB). The existing large viewer chunk warning is approximately 803.47 kB
- Independent production/runtime and exact-closure reviews found no unresolved P0/P1 or future-correct complexity obstruction. Production changed only `zipio.ts` (+20/-18), while the two existing test files changed +15/-9; direct `it.fails` declarations remain 17 because the 12 promotions are data-driven

### Post-slice-32 gate/strategy checkpoint

- [x] Recount the clean `2017a5a` baseline as 67 runtime expected failures, 17 direct `it.fails` declarations and 21 todos: raw duplicate JSON 17, operation field/identity policy 14, same-key collision 6, invalid ZIP UTF-8/special mode 12, future schema 2, transaction/tab publication 10 and migration 6
- [x] Rank duplicate-aware raw JSON ingress first because one shared preflight closes 15 manifest and 2 operation expectations with existing exact authority and escaped-singleton/different-scope controls; keep special-mode and payload/raw-name UTF-8 roots separate
- [x] Keep the parser stop rule explicit: reuse the audited iterative grammar shape, delegate value construction to standard `JSON.parse`, add no dependency or test matrix, and stop if work expands into byte decoding, raw NFC rewriting, canonical serialization/digest, budgets, typed evidence or schema policy

### G0 stabilization slice 33 — duplicate-aware raw JSON ingress

- [x] Add one iterative O(text length) preflight that parses exactly one JSON value, tracks decoded member names in a separate Set for every object scope and rejects exact or escape-equivalent duplicates before ordinary value construction
- [x] Route `parseManifest` and every nonempty `parseOpsJsonl` line through the shared preflight, preserving manifest throw semantics, JSONL line-error/skip behavior, raw persisted operation evidence and the S29/S31 decoded ownership/shape gate
- [x] Preserve unique escaped keys, identical decoded keys in different object scopes, arrays, string-contained punctuation, whitespace and standard number/literal syntax without rewriting raw spelling, order or values
- [x] Promote exactly the 17 existing runtime expectations: five manifest ambiguity cases × inactive/sentinel/old-authority assertions plus the one operation duplicate case at open and package ingress
- [x] Keep malformed UTF-8 bytes/names, raw NFC rewriting, schema policy, canonical digest/same-operation collision, typed evidence/quarantine and depth/node/string budgets explicitly open
- [x] Run focused/full tests, typecheck, fixture/evidence verification and production build; complete independent grammar, complexity, exact-closure and scope/churn review before a separate commit

Review record:

- A new core preflight scans exactly one JSON value with an iterative root/object/array state machine. Each live object owns its decoded-key Set, so exact and escape-equivalent duplicates are rejected while identical names in parent, child or sibling objects remain valid; final value construction and number/string semantics stay with standard `JSON.parse`
- `parseManifest` now rejects duplicate members before decoded validation/projection, while `parseOpsJsonl` records the affected line as invalid JSON and continues. Existing manifest throw behavior, JSONL skip/error handling, raw persisted operation evidence and the S29/S31 ownership/shape checks remain unchanged
- Five manifest ambiguity cases now satisfy all three inactive/sentinel/old-authority assertions, and the existing operation duplicate case satisfies open and package ingress, promoting exactly 17 runtime expectations. No new fixture, parameter matrix or test case was added
- The existing ordinary ambiguity control now proves an escaped singleton and equal decoded names in different scopes; a paired direct control accepts nested JSON-like punctuation and escaped quotes, then rejects only its post-nesting root escape-equivalent duplicate, fixing parent-scope restoration and string-boundary reach without constraining error wording
- Malformed UTF-8 bytes/names, raw NFC rewriting, schema policy, canonical serialization/digest and same-operation collision, typed evidence/quarantine and depth/node/string budgets remain open
- Verification passed on the exact source/test tree: focused 2 files / 534 passing tests plus 13 todos; full 32 files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (97 modules / 11 PWA precache entries, 890.73 KiB). The existing large viewer chunk warning is approximately 805.44 kB
- Independent production/runtime and exact-closure reviews found no unresolved P0/P1 after the punctuation success/reject pair was added. Production changed three files (+184/-2, including the 180-line shared scanner); the two existing tests changed +17/-2, direct `it.fails` declarations remain 17 and runtime expected failures fall from 67 to 50

### Post-slice-33 gate/strategy checkpoint

- [x] Recount the clean `b976ebc` baseline as 50 runtime expected failures, 17 direct `it.fails` declarations and 21 todos: operation field/identity policy 14, same-key collision 6, invalid ZIP UTF-8/special entry type 12, future-schema edit policy 2, transaction/tab publication 10 and migration 6
- [x] Confirm across slices 31–33 that production changed +252/-31 versus tests +89/-40 with no tests-only commit, and select one more production-first envelope root rather than extending the recent parser/test surface
- [x] Rank strict UTF-8 first because six approved payload/name expectations share mutation-free package inspection, while keeping Unix special entry types as the next independent one-file root and stopping operation identity/collision work at its policy/evidence boundary
- [x] Keep the next slice bounded to the package manifest payload plus EFS-flagged central filename bytes; preserve non-EFS CP437 fallback and Unicode path-extra behavior, and stop before ops payload policy, filename rewriting, typed issues, budgets or device claims

### G0 stabilization slice 34 — strict package UTF-8 boundary

- [x] Decode the native package manifest with fatal UTF-8 semantics before manifest construction and reject malformed bytes during inspection
- [x] Validate only EFS-flagged central filename bytes as fatal UTF-8 before path normalization or extraction, preserving non-EFS CP437 and Unicode path-extra compatibility
- [x] Promote exactly the six existing invalid-manifest-payload and malformed-EFS-filename runtime expectations, binding inspection rejection to zero workspace mutation and no candidate completion marker
- [x] Preserve ordinary valid Unicode manifest/name, non-EFS compatibility and raw fixture self-validation without adding a fixture file, helper, parameter matrix or standalone test case
- [x] Keep operation payload decoding, ZIP comments/Unicode-extra precedence, filename rewriting, special Unix entry types, typed evidence/error wording, budgets, device behavior and full G0-S completion explicitly open
- [x] Run focused/full tests, typecheck, fixture/evidence verification and production build; complete independent compatibility, exact-closure and scope/churn review before a separate commit

Review record:

- Native package inspection now uses a dedicated fatal UTF-8 decoder only for `lociview.json`; operation JSONL decoding and durable readback retain their previous behavior. ZIP envelope inspection independently validates the raw central filename only when the central general-purpose language-encoding flag is set, before path normalization or entry extraction
- The existing invalid-manifest and malformed-EFS-name cases now satisfy all three ordinary envelope assertions: inspection rejects explicitly, candidate import performs zero workspace mutations, and no completion marker becomes active. This promotes exactly six runtime expectations while direct `it.fails(` declarations remain 17 and remaining runtime expected failures fall from 50 to 44
- The existing writer archive control was extended with an EFS-off CP437 high byte plus a valid Info-ZIP Unicode Path extra field. It proves the raw central/local bytes are not valid UTF-8, both EFS bits are clear, zip.js reports its post-extra `filenameUTF8` convenience as true, and production still returns the exact Unicode path and payload. This prevents either all-name fatal decoding or a post-extra convenience flag from becoming the trust boundary
- Valid EFS Unicode names and valid manifests remain covered. Operation payload decoding, ZIP comments and Unicode-extra precedence policy, path rewriting, Unix special entry types and permissions, typed evidence/error wording, budgets, device behavior and full G0-S completion remain explicitly unclaimed
- Verification passed on the exact final source/test tree: focused 2 files / 258 passing tests plus 11 todos; full 32 files / 1,028 passing tests plus 21 todos; TypeScript typecheck; fixture verification (10 Git entries / 708,867 bytes, one unratified GS candidate); evidence verification (3 pending device templates / 0 run, environment or artifact records); and the production build (97 modules / 11 PWA precache entries, 890.87 KiB). The existing large viewer-chunk warning is approximately 805.59 kB
- Independent production/runtime, compatibility and exact-closure reviews found no unresolved P0/P1. Production changed two files (+6/-1), while the two existing test files changed +42/-6; no new fixture file, helper, parameter matrix or test case was added

### Post-slice-34 session checkpoint

- [x] Confirm `g0-baseline` at clean S34 commit `8be3098`; S34 promoted six runtime expectations without adding an expected failure or todo, leaving 44 runtime expected failures, 17 direct `it.fails` declarations and 21 todos
- [x] Reclassify the remaining runtime failures as operation field/identity policy 14, same-key collision 6, Unix symlink/FIFO 6, future-schema edit policy 2, transaction/tab publication 10 and migration 6
- [x] Reconfirm that G0/G0-S remain active: the durable queue and several operation/blob/package roots are fixed, but physical-iOS evidence, measured baselines and approved thresholds are absent; shared-path locking/journaling, typed quarantine/collision resolution and migration recipe authority remain blocked
- [x] Audit the production-first trend: slices 31–34 changed production +258/-32 versus tests +131/-46, added no expected failure/todo and promoted 93 runtime expectations, but S34's six added production lines and repeated ZIP/manifest micro-slices show declining marginal gate value
- [x] Select a fresh Codex session instead of continuing this compressed thread. Start it at absolute canonical root `G:/00_AI_dev/LociView`, use one writer plus at most two parallel read-only auditors, and run focused/typecheck/diff-check/full/fixture/evidence/build verification serially
- [x] Complete a repository-only cold-start handoff audit and reconcile stale current-risk, approval-state, queue-baseline and evidence-verifier wording without production, test or slice-35 changes

Handoff:

- The longest-lead G0 critical path is now the external-evidence/product-decision lane, while G0-S remains a parallel release blocker: three device templates remain pending with zero run, environment or artifact records; desktop/tablet details, physical iPhone 14 Pro evidence, remaining GS/rendering fixtures, numeric thresholds/ratified profile goldens and G0-exit product-owner acceptance remain open
- If repository-only safety work is explicitly selected in a fresh session, the bounded candidate is the existing `symlink-entry` / `special-mode-entry` six-assertion cluster in `tests/assets/maliciousPackage.test.ts`, rooted in `src/assets/zipio.ts`; preserve the ordinary compatibility controls in `tests/assets/zipioStructure.test.ts`. Re-audit the central `externalFileAttributes` type authority and ordinary type-0/regular/directory/DOS-lower-only controls before implementation; do not extend into permissions, mode rewriting, typed issue policy, device claims or extraction semantics
- Do not begin operation-policy, same-key collision, transaction/tab, future-schema or migration fixes until their field-quarantine/evidence, canonical digest/resolution, lock/journal/physical-browser, schema-version or migration-recipe dependencies are approved and testable
- This session stops at the checkpoint. No slice 35 production or test change has started

### G0 restart plan — decision capture and coverage map

Product-owner direction was approved on 2026-08-24. This section is the
approved implementation plan for the bounded documentation slice. The Product
Owner explicitly authorized writer work and approved the LociMyu conversion
outcome, the exact-candidate/both-gates release boundary and the bounded deploy/
post-deploy/rollback procedure on 2026-08-24. Checklist completion still requires
the recorded verification and independent final review below.

First slice — documentation and coverage only:

- [x] Record the approved short meta-audit triggers, critical-path check and human-stop boundaries in `AGENTS.md` without creating a separate audit workstream
- [x] Record in the approved product contract that LociView preserves the useful LociMyu viewing/recording workflow while remaining account-independent and offline-capable, that ordinary flows target a non-specialist with roughly Microsoft Office file-workflow literacy, and that LociMyu XLSX/model/image/file-ID-map datasets remain convertible without silently mutating or guessing source meaning
- [x] Fix the repeatable environment matrix as iPhone 14 Pro / Safari PWA plus separate Windows 11 desktop and tablet-PC classes using Edge as the primary Chromium browser and Chrome as a secondary smoke browser; record exact measured versions/hardware without generalizing beyond tested classes
- [x] Add a one-to-one coverage map for every fixture, trace, device, measurement, threshold and exit requirement in `docs/specs/03-gates-and-delivery.md` sections 2.1–2.4, classifying each row as covered, candidate, external-blocked, specification-blocked, implementation-blocked or deferred
- [x] Distinguish the deployed-v1 baseline `4f6e48196041d7ae39a11aba04f647db99deb450`, development HEAD and not-yet-designated stabilized-v1 candidate; designate the exact candidate before final verification, but permit release only after both G0/G0-S exit, exact-tree no-P0/P1 review and Product Owner approval of the SHA and trigger
- [x] Record that both `main` push and `workflow_dispatch` can deploy, and bind either trigger to the same exact-SHA approval, Actions head-SHA check, live digest capture, post-deploy PWA/offline smoke and retained named rollback ref/non-destructive rollback record
- [x] Record the fixture-only GitHub Release convention for redistribution-approved external fixtures: approve schema/attribution/local hash/privacy/license first, upload only as draft/non-adopted, then fetch/hash/register exact Release bytes before adoption or gate credit
- [x] Record Ki84 only as private operational source evidence bound by SHA-256 and aggregate shape: it has no durable private locator, is not anonymized, must not be uploaded to a public Release or fixture registry, and earns no G0/STO-MIG gate credit in that state; any derivative reconstructs text/IDs/media/model/spatial values and container metadata from an explicit privacy-safe whitelist
- [x] Keep GS and any third-party aircraft source at candidate status until bytes, provenance, license, semantic checks and restore are verified; allow a deterministic project-authored aircraft/intersection oracle so external acquisition does not create an unnecessary G0 dependency
- [x] Update documentation indexes for the new coverage map, then obtain independent read-only completeness and privacy/specification reviews of the final writer diff

First-slice acceptance:

- [x] Map every requirement in G0 sections 2.1–2.4 exactly once and make every missing prerequisite, owner and next action explicit
- [x] Do not conflate available, discovered, restorable, measured, ratified or gate-passing states
- [x] Close the open coverage-mapping item below only after the independent review finds no omitted G0 row; leave fixture acquisition, measurements, pre-fix ledger and threshold approvals open
- [x] Preserve `0` completed run, environment and artifact records; this slice creates no measurement, manifest, fixture byte, GitHub Release or support guarantee
- [x] Run, serially, `git diff --check`, fixture verification, evidence verification, typecheck, the full test suite and the production build on the final tree

Explicit first-slice exclusions:

- production, test, schema or verifier changes;
- artifact download/upload, GitHub Release creation, Ki84 anonymization or converter changes;
- physical-device runs, performance thresholds or support-class ratification;
- the G0-S pre-fix ledger, ZIP special-entry fix, lock/journal, collision/quarantine or migration fixes;
- `main` push, deploy or stabilized-v1 release.

Planned follow-on order after the first-slice review:

1. resolve evidence-contract blockers before measurement: reconcile nullable unavailable iPhone fields with the measured-environment schema, add complete external-license attribution fields, separate external GS transport bytes from a small Git semantic oracle, and verify acquisition/restore bytes rather than trusting a locator;
2. specify and close `PROD-13` conversion reporting for inferred sheet mappings, duplicate IDs and unresolved media links, then implement a dev-only whitelist-reconstructed Ki84 derivative and public external-fixture acquisition verification; require independent privacy/license review and exact-SHA Product Owner approval before a fixture Release upload;
3. acquire/verify public GS, evaluate the aircraft candidate or author deterministic closed geometry, and start reproducible device evidence; use unavoidable acquisition/physical-run wait time for the bounded ZIP symlink/FIFO production fix, without letting it replace the external G0 critical path.

First-slice review — 2026-08-24:

- Scope stayed documentation/governance-only: no `src/**`, test, fixture bytes, registry/schema, verifier, artifact, Release, deploy or dependency change.
- The coverage reviewer passed the corrected 135-row G0/product-dependency map with no P0/P1/P2. The independent privacy/workflow reviewer passed `PROD-12/13`, Ki84, external-fixture publication and exact-SHA release/rollback boundaries with no P0/P1/P2.
- Initial serial verification passed: `git diff --check`; untracked-map whitespace check; fixture registry 10 Git entries / 708,867 bytes / 0 external or generated entries; evidence verifier 3 pending templates / 0 run / 0 environment / 0 artifact records; typecheck; full test 32 files / 1,028 passed / 21 todo; production build with the pre-existing large-chunk warning.
- Serial verification of the review-record tree passed with the same results. This result/checkbox update is the only subsequent content change; the same commands run once more before staging, and any failure reopens this item.
- Meta-audit: G0 external evidence and evidence-contract blockers remain the longest lead, while G0-S remains a parallel release blocker. A follow-up audit split device nullability from the attribution/acquisition contract: close the already-approved device mismatch independently, obtain the remaining Product Owner fixture-policy decisions, then return to the longest-lead external contract. The ready ZIP special-entry fix is useful only during unavoidable external/device wait time.

### G0 evidence-contract slice 2 — honest iPhone environment records

The post-first-slice meta-audit split the previously grouped evidence-contract
work into independent schema boundaries. External fixture adoption remains the
longest-lead lane, but its registry lifecycle, redistribution-license policy and
Release retention details require Product Owner decisions. This bounded slice
therefore closes the already-approved, immediately executable device contract
without pre-empting those policies.

Target and purpose:

- [x] Permit a measured iPhone 14 Pro environment to record genuinely
  unavailable RAM, GPU, free-storage, power and thermal facts as `null` or
  `unknown`, rather than inventing values that Safari/PWA operation did not
  expose
- [x] Keep environment identity and comparison-critical facts non-null:
  environment ID, exact device/OS/browser identity and version, launch mode,
  CSS viewport, device-pixel ratio and drawing-buffer dimensions
- [x] Keep the current measured Windows desktop/tablet resource requirements;
  do not weaken all device classes merely to accommodate the iPhone boundary

Implementation and acceptance boundary:

- [x] Change only the measured conditional in
  `evidence/g0/schema/device-environment.schema.json`; keep every field and the
  `power` object structurally required, and avoid a duplicate policy in the
  verifier implementation
- [x] Add focused acceptance proving (1) a complete synthetic iPhone run with
  only the approved unavailable values succeeds, (2) a missing comparison-
  critical iPhone value fails schema validation and (3) the same resource
  omissions on a measured Windows environment fail schema validation
- [x] Preserve the existing fully populated complete-run control, neutral
  pending-template rule, privacy scan, duplicate and cross-record checks, and
  the current zero-real-record evidence baseline
- [x] Synchronize the runbook, evidence README if needed and coverage map so
  schema-valid does not mean measured, representative, threshold-ratified or
  G0-passing
- [x] Run focused tests, `npm run evidence:verify`, typecheck, full tests,
  fixture verification, production build and `git diff --check` serially; then
  obtain an independent read-only schema/evidence review

Explicit exclusions:

- physical-device measurement, fabricated or copied device specifications,
  performance thresholds, support guarantees or completed evidence records;
- external fixture registry/acquisition, license policy, GitHub Release work,
  fixture bytes, Ki84 conversion/anonymization or `PROD-13` decisions;
- production runtime/UI, run-record schema, dependencies, ZIP special-entry
  handling, deployment or release.

Stop conditions:

- Stop before introducing a general availability taxonomy or weakening Windows
  requirements; either change expands the accepted evidence policy.
- Stop if the verifier requires behavior beyond schema enforcement, or if a
  real environment/run/artifact record would be needed to prove this slice.
- Stop rather than interpreting a nullable field as evidence that the value was
  unavailable; human evidence review remains authoritative for that fact.

Slice-2 review — 2026-08-24:

- The measured conditional now keeps identity, version, launch mode, viewport,
  DPR and drawing-buffer dimensions non-null for every device class. Only an
  iPhone 14 Pro measured environment may retain unavailable RAM/GPU/storage and
  power facts as the field-specific `null`/`unknown` values; measured Windows
  desktop/tablet records retain every prior non-null requirement.
- The verifier implementation and run-record schema did not change. The trusted
  device schema remains the single machine authority, and no production
  runtime/UI, fixture byte, dependency, measurement, artifact, support claim,
  deploy or Release was added.
- Focused verifier acceptance passed 72/72. The full suite passed 32 files /
  1,038 tests with 21 existing todos. Evidence verification still reports three
  pending device templates and zero run/environment/artifact records; fixture
  verification still reports 10 Git entries / 708,867 bytes, zero external or
  generated entries and one unratified GS candidate. Typecheck and production
  build passed; the pre-existing approximately 805.59 kB viewer-chunk warning
  and 11-entry PWA precache remain unchanged.
- Independent schema review initially found that one Windows negative case
  changed seven facts together. A valid Windows control and seven isolated
  table-driven negatives now bind every retained constraint. Independent docs/
  scope review found stale grouped-critical-path and generic-null wording; both
  were corrected. Final re-reviews report no unresolved P0/P1/P2.
- The result record is the only change after that verification/review pass. The
  same serial verification matrix runs once more on the exact final tree before
  staging; any failure reopens this checklist item.

- [ ] Freeze representative v1 projects and migration fixtures
- [ ] Add small/medium/large GS fixtures with provenance and expected results
- [ ] Add mesh/GS intersection and closed translucent aircraft reference scenes
- [ ] Complete target-device record: iPhone 14 Pro is fixed as the oldest physical-iOS alpha target; add desktop and tablet-PC OS/browser/RAM/GPU details
- [ ] Measure current load, memory, frame-time, picking, and package baselines
- [x] Map every `03-gates-and-delivery.md` section 2.1–2.4 fixture, trace, device and threshold requirement to a restorable source/status before claiming G0 evidence coverage; the high-level checklist and a successful `evidence:verify` are not completion proof
- [ ] Complete the G0-S pre-fix reproduction ledger: for each known case record the unfixed code commit, compatible test revision, exact reproduction command/procedure, observed failing assertion/disposition and restorable evidence locator; current green regressions do not retroactively prove the baseline
- [ ] Approve support guarantees, degradation behavior, and Go/No-Go thresholds

## G0-S — v1 safety stabilization (blocking before G1 feature work)

- [ ] Make the G0 multi-tab actor/sequence characterization pass without silent operation loss
- [x] Make the G0 rejected-append characterization pass with recovery and accurate durable-state UI
- [ ] Make the G0 untrusted-operation characterization pass with reserved-key and canonical HLC/ID defenses
- [ ] Make the G0 package/model interruption characterization pass without dangling blob references
- [ ] Implement the smallest root fixes without coupling them to the v2 storage rewrite
- [x] Distinguish queued, durably saved, and exported state in user-visible status
- [ ] Run malicious-package and regression tests, then update the deployed v1 build before G1

## G1+ — Proposed v2 gates

Start only after G0 and G0-S pass. See `docs/v2/00-approved-direction.md`. Order:

1. bounded-memory streaming/CAS package PoC;
2. Spark/Three versus PlayCanvas renderer bakeoff;
3. Automerge durability/merge/privacy PoC;
4. renderer/storage-neutral ports with unchanged v1 behavior;
5. v2 persistence, canonical migration, and the GS vertical slice.
