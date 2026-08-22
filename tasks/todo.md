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

- [ ] Freeze representative v1 projects and migration fixtures
- [ ] Add small/medium/large GS fixtures with provenance and expected results
- [ ] Add mesh/GS intersection and closed translucent aircraft reference scenes
- [ ] Complete target-device record: iPhone 14 Pro is fixed as the oldest physical-iOS alpha target; add desktop and tablet-PC OS/browser/RAM/GPU details
- [ ] Measure current load, memory, frame-time, picking, and package baselines
- [ ] Add and confirm failing G0-S characterization tests on the unfixed v1 baseline
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
