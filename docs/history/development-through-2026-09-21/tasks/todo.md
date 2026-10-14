# Historical task record through 2026-09-21

Captured from tasks/todo.md on 2026-10-15 before the development-policy refresh.
This preserves preceding plans, executed checks, failures and approval context.
The task text below is historical evidence, not current instructions or a queue.
Use [current work](../../../../tasks/todo.md) for the active boundary and sequence.
Only relative Markdown link targets were rebased; the original task text and
line endings are retained. Earlier snapshots remain in
[the September 14 history](../../development-through-2026-09-14/README.md).

---
# LociView active work

## Current boundary — whole practical-team workflow first

Updated 2026-09-21. This file owns current work, executed checks and next actions.
[Inventory](../../../../tasks/implementation-inventory.md) owns feature coverage; contracts are routed
by [docs/README.md](../../../README.md). Git owns actual branch/commit identity.

Complete the practical team candidate: ordinary home → real Project/Scene/Caption/
media work → file handoff/update → continued local editing → named manual backup,
resume and recovery. Desktop, physical iPhone and offline acceptance must cover
the new route. Scope is 61 of the original 64 inventory groups: M13/M14 remain
later work; F09 (continued old-format updates after migration) was withdrawn by
the PO on 2026-09-14. This scope reduction is not completed implementation.
Neither component counts nor synthetic-host success is product completion or release approval.

PO approved both requested boundaries on 2026-09-20: the local static validation
build and 07 §5.1's reduced internal-format amendment. The dedicated static build
is implemented and its final code checks passed; browser/device adoption remains
pending. The full practical-team goal is not complete. The approved version-bound
field/package behavior in 07 §5.1 is connected and its final serial checkpoint
passed. The PO completed the prescribed Chrome operations, but reports roughly
5 seconds for pin confirmation and more than one minute for backup output.
Functional completion is recorded separately; performance acceptance is open.
The bounded latency fix is implemented and the static preview is refreshed;
the PO reports only slight improvement. Performance remains open. The approved
second pass now batches only explicit pure reads; writes/publication and restore
staging remain strict. Measured root listings fell from 689 to 381 for pin
confirmation, 3,298 to 1,422 for backup generation plus panel refresh, 345 to 21
for download, and 1,093 to 177 for panel refresh alone. These are synthetic-host
I/O counts, not browser speed guarantees. The second-pass final verification and
independent review are complete, with the same two known fixture/index suite
failures retained below. The static preview is refreshed. Browser latency remains
unaccepted; observe only pin confirmation and backup, not a whole walkthrough redo.
The final suite also exposes a fixture-source/index mismatch; keep that failure
visible and resolve it at an authorized Git checkpoint. Preserve source data;
do not record supplied private paths, names, hashes or contents in tracked files.
This is rendering/input/storage/download verification, not ordinary-entry,
iPhone or offline acceptance. No repeat approval
of those field additions is needed. The PO approved the independently reviewed
first Native conversion recipe in 07 §5.3 on 2026-09-21.
Preserve the tested Caption/edit/file/static-entry worktree. Ordinary entry,
formal profiles, remaining conversion recipes, physical-iPhone/HTTPS and release
boundaries not covered by the current approvals remain explicit.
The PO-approved one-time migration cutover removes continuing legacy-update work.
The PO reports one
overnight goal run consumed 90% of the allowance; estimates must respect that
observed constraint rather than assume unlimited daily agent time. No per-action
quota attribution has been measured. Real-file material resolution is verified
at `e6fc15b`. The old 07 §11 bridge-oriented compatibility request is superseded;
remaining initial-conversion gaps need a smaller implementation plan, not approval
of the superseded migration-control format.

## Current checkpoint — initial Native conversion through edit and file reopen

PO approved 07 §5.3. Connect existing file-open → Native subset preview → new
map-2 Project → edit/first-place → named save/Workspace → reopen in the existing
nondefault validation route. Root is the only writer; integration research and
final review are read-only. Reuse Native inspection, content services, original
initialization bytes and journal recovery. Preserve raw input privately, outside
normal exports. No new PoC, dependency, profile adoption or ordinary-entry change.

Acceptance: faithful multi-Scene/hidden/unplaced/distinct-media conversion,
unsupported input rejected before publication, four exact identity vectors,
interrupted initialization retry and completed retry preserving later edits,
and one connected converted-file editing/export/reopen flow. Use exact filtered
existing tests during editing; run the tiny architecture suite early for new
imports, then final serial checks/review once at the connected boundary. Do not
repeat prior latency checks or broad focused suites just before the checkpoint.
Stop only for an actual contract conflict, new compatibility scope, or the
existing grouped device/adoption boundary; known denied Git/browser operations
remain denied. Broader Native/v1/LociMyu conversion remains later work.

Implementation: existing file-open now offers a Native conversion preview and
confirmation; the mapper preserves exact admitted values, array order, hidden
resources, unplaced Captions, media identities, tags and Saved Views. The same
editor supports first placement/edit, named backup, Workspace and independent
reopen. Private original ZIP/mapping evidence stays outside exported inventories.
Initial source bytes and IDs are retained once; missing acknowledged originals
are not recreated. Later edit retries use the ordinary edit journal, not the
permanent conversion receipt's initialization path.

Focused evidence: four existing-file cases passed (ID vectors; unsupported input
and independent conversions; recorded-DOM preview/cancel/initialization recovery/
edit/first-placement/backup/Workspace/reopen; original-byte recovery and later-edit
preservation). The tiny architecture suite passed before later host imports.
Independent final review found one later-edit retry-routing issue; corrected the
initialization-only predicate and extended the same connected case with an actual
unprepared edit interruption at blobsVerified.json, warm retry and cold reopen.
That case passed. No new PoC, framework or per-field file roundtrip was added.
The just-started full run was stopped on this finding. On the corrected final
source/test tree: typecheck PASS; complete root suite 112 files / 2,280 cases PASS,
21 existing todo, and the same two suites fail before cases
(tests/scripts/fixtureRegistryV2.test.ts, tests/scripts/gsRegistryBinding.test.ts:
fixture generation source differs from its indexed regular Git blob). One full
run completed in 515.59 seconds; no second large focused suite preceded it.
The final architecture/import checks passed in that run. Independent review has
no remaining actionable finding. Ordinary, harness and validation builds all
passed serially, with existing mixed-import/chunk warnings only.

The 7-file validation artifact's path-sorted manifest SHA-256 is
`7750fcf39aa5b3d93874001a16a5ef2bf49c3c09743288d9404fe6a672a0f8fa`.
Port 4182 returns exact emitted HTML, both JS modules, CSS and WASM (HTTP 200).
No SW/manifest/samples in that validation output. This is HTTP/Node/recorded-DOM
evidence, not browser/device/offline adoption. Four updated records' 218 local
links and the diff check passed. No runtime repeat for result-only prose.

Next: retain this bounded converter as the checkpoint and group conversion/edit/
output/reopen plus the still-open latency observation into the existing static
browser/adoption check. Broader Native appearance/exchange/other model-media
profiles and initial v1/LociMyu conversion remain unimplemented; prepare their
remaining concrete mappings under 07 before extending this immutable recipe.
Ordinary-entry activation and physical-iPhone/HTTPS remain their existing gates.
No additional manual-check request in this unit. Commit/push remains unperformed
because the known managed Git-write denial must not be retried unchanged or
bypassed; the fixture/index failure is retained, not weakened or called PASS.

## Completed bounded fix — pin confirmation and backup latency (browser timing open)

Outcome: keep the accepted edit/save behavior while removing demonstrated
redundant computation and unrelated storage traversal. The approved second pass
changes pure-read structural audit timing only; no storage-format, dependency,
write/publication fence, release or migration-policy change.

- [x] Inspect the supplied backup read-only; record only aggregate evidence here.
  Its size is not evidence of browser workspace size or traversal cost.
- [x] Retain each owned metadata source's deeply frozen physical inspection.
  Editing/reopening still creates and validates a new instance. On the same input,
  20 token reads measured 79.2 → 0.1 ms and 20 snapshot reads 79.6 → <0.1 ms in
  Node. These are CPU micro-measurements, not Chrome interaction timings.
- [x] Prune unrelated OPFS directory branches, retaining sorted lexical-prefix
  matches, fresh results and relevant errors. The generation-selection fence
  invokes two listings before and after each read; previously each listing
  traversed the entire origin. Fences and durable verification remain unchanged.
  A synthetic tree with 100 unrelated old runs visits 4 rather than 308
  directories for the scoped query. No user data was deleted or relocated.
- [x] Focused checks: metadata suite 21 passed; scoped OPFS/snapshot/backup
  checks 23 passed (167 unselected). Independent read-only review: no findings.
- [x] Final checks executed once: typecheck passed; 112 test files / 2,272 tests
  passed, 21 existing todo. Two fixture-registry suites failed before running their
  cases: `scripts/gen-samples.mjs` is 4,934 worktree bytes versus 4,580 indexed bytes
  after the preceding approved walkthrough-fixture fix. The verifier deliberately
  requires index equality. Do not call this an overall PASS, weaken the verifier,
  stage unrelated changes or retry/bypass the known managed Git-write denial.
  A permitted Git checkpoint and these two focused suites remain to be completed;
  unchanged successful runtime tests do not need another whole-suite run for staging.
- [x] After the checkpoint command stopped at that failure, ordinary, harness and
  validation builds each passed serially. Existing mixed-import/chunk warnings
  remain. Static artifact digest (same path-sorted manifest method as below):
  `685393a73c44e6b8d7c71d2d11e07f2a04eb8b80258d8e87eb62ec0dd95091d7`.
  Port 4182 serves exact emitted HTML, JS, CSS and WASM bytes (HTTP 200); no
  SW/manifest/public samples in validation output. This is HTTP, not browser proof.
- [ ] Chrome performance acceptance: the PO reports slight improvement only.
  The PO's functional success is retained; no iPhone/offline credit is claimed.

Second-pass diagnosis: a disposable, ignored
measurement reuses the existing validation host/recorded DOM with a generated GLB,
one pin, MemoryFS and no restore history. Root listing counts were **689** for pin
confirmation, **3,298** for backup generation including output refresh, **345** for
download and **1,093** for a full file-panel refresh. Node CPU/MemoryFS times were
126/292/36/79 ms respectively; these are not Chrome/OPFS timings. The structural
amplification remains after prefix pruning: the generation fence audits restore
controls before/after low-level operations, with two root listings per audit.

Independent contract review confirms that 06's namespace capability/fencing and
lightweight-control clauses explicitly require those per-I/O structural checks.
The PO approved the failure-detection timing amendment on 2026-09-20. The initial
bounded implementation uses full audits at entry/before returning results,
explicit lifetime-bound ports and no ambient cache. Journal/Repo, output discovery,
base choices, file-panel inspection and download use that boundary. Selected/
original generations opt in; restore staging retains per-I/O audits. Writes and
publication remain strict, with unchanged root serialization and bytes verification.
Four focused regressions cover read-only ports, expired lazy capabilities,
concurrent public reads, closing refusal, strict non-opt-in scopes and owned
proof/heads/descriptors. Existing connected recovery cases cover missing controls,
exact restore continuation and failed writes; do not duplicate them in a new PoC.
Measured after this change: 135/280/34/69 ms for pin/backup/download/panel refresh
on Node/MemoryFS. No meaningful CPU-time win is claimed: the measured reduction
is in expensive structural I/O.

Second-pass final outcome:
- Targeted storage/file/host tests: 330 passed; the isolation test initially found
  the new type-only Repo import absent from its exact allowlist. Added that precise
  approved boundary, then its 12-test suite passed. No product assertion weakened.
- Independent read-only review of the connected diff: no outstanding findings.
- Final serial checkpoint: typecheck passed; 112 files / 2,276 tests passed, 21
  existing todo. The same two fixture/index suites above still fail before cases;
  this is not an overall PASS. No retry or bypass of denied Git writes.
- Ordinary, harness and validation builds passed serially after that known stop.
  Validation artifact digest (same manifest method):
  `3e2e6db39c943e7247fac2e05788a362f6e064a04c9eae4072356718d6116a88`.
  Port 4182 serves the exact current HTML, JS, CSS and WASM with HTTP 200; validation
  output contains no Service Worker, manifest or public samples. HTTP is not browser,
  physical-iPhone or offline acceptance.
- Verification economy: the broad targeted run took 370 s and the final suite
  398 s. Avoid this overlap next time: use narrowly filtered regressions while
  editing, then the required final suite once. Do not pre-run entire large
  integration suites immediately before a full checkpoint.
- Next: assess the refreshed build's pin/backup latency only. Existing functional
  acceptance stays recorded; no new broad manual test request. Preserve the
  storage failure evidence and the original pending adoption/conversion boundaries.

Stop only for a failed invariant or genuinely new authority. Do not broaden into
storage redesign, new profiling infrastructure or repeated full manual testing.

## Previous checkpoint — one-time migration cutover (documentation only)

- [x] Record the accepted scope in ADR/specifications and remove late Native/v1
  bridge delivery and gate requirements from active plans/indexes.
- [x] Preserve initial conversion, source bytes, current-format team exchange,
  existing files/jobs and paused product work; identify actual code impact.
- [x] Review the bounded documentation diff, links and retired requirement status;
  checkpoint separately from unverified feature code. No runtime suite or new PoC.

Outcome: convert an old source once, distribute that converted Project to the
team, and continue only with new-format files. Further old-format updates are not
merged into it. Product implementation remains paused; this decision does not
authorize an arbitrary replacement schema or remove old-reader compatibility.

Read-only code audit found the legacy bridge only in an isolated synthetic PoC,
not in production metadata/file/package services. No code/tests were deleted.
Fourteen Markdown files' local links and diff checks passed; the old 07 draft was
verified unchanged in Git at e3830ef. Independent review's sole finding (include
02 §§3.2–3.3 in the later-copy supersession) is corrected. No runtime/browser/
device checks were rerun or claimed; paused Caption-list changes remain separate.

## Previous checkpoint — user-facing simplicity guidance (documentation only)

Outcome: make ordinary work understandable without learning storage/package or
reference-management internals. The PO approved the review's presentation direction;
this request updates guidance, not product code or compatibility semantics.

- [x] Update the existing UI guidelines: core flow, save/send, meaningful choices,
  temporary visibility versus Scene inclusion, cleanup and progressive settings.
- [x] Correct stale guidance that conflicts with this direction; retain established
  safety, useful viewing features, route-specific evidence and visual tone.
- [x] Check links/diff and obtain one bounded read-only review; checkpoint only
  documentation, preserve the paused product changes and stop.

The [UI guidelines](../../../ui-product-guidelines.md) own the detailed rules in
§§2.1/4.4–4.5/6.1/9.2 and the existing acceptance section. Local links and diff checks
passed; one read-only review found no mandatory findings. Documentation only:
no runtime tests or browser/device acceptance were claimed. Product work is still paused.
No new matrix, PoC, runtime suite,
dependency, schema, release or feature-deletion decision belongs to this unit.

## Previous checkpoint — economical verification and complexity audit

- [x] Make focused/related checks and the serial final checkpoint easy to invoke
  with existing Vitest; keep all acceptance, failure exits and final checks intact.
- [x] Group related implementation under one connected-workflow final verification
  and independent review; remove completed logs from the startup status record.
- [x] Read-only audit of reuse, file/recovery workflows and migration complexity:
  separate necessary safety from duplication and unapproved simplification.
- [x] Validate the tooling/document diff proportionately, record findings and stop.

No feature work, dependency, test deletion, relaxed assertion, automatic winner,
schema/compatibility change, deployment or another PoC. Preserve the paused dirty
Caption-list work below; do not include it in a tooling checkpoint or claim it passes.

Findings (read-only; no product simplification implemented):

- [Conflict-control assembly](../../../../src/harness/projectScene/validationWorkspace.ts)
  and [metadata receive assembly](../../../../src/harness/projectScene/metadataReceiveControls.ts)
  repeat registration/pending/disposal. Share that assembly when next touched, not
  whole hosts: the real-file route already reuses the saved/development workspace.
- [Review output](../../../../src/projectPackage/reviewOutputJob.ts) and
  [clean output](../../../../src/projectPackage/cleanOutputJob.ts) duplicate receipt-chain
  validation/append. A narrow pure helper may reduce maintenance; preserve purpose
  closures, byte formats and Workspace bases. No new general job framework.
- [Output controls](../../../../src/harness/projectScene/validationOutputControls.ts) put
  save/send/copy in one five-purpose selector. During ordinary-entry connection,
  apply the existing 06 §11.4 intent split, with review/clean as secondary actions.
  These are existing functions to organize, not a request for five new features.
- Native loaders/rendering are not all rewritten; existing reuse is present.
  Original-byte recovery and external-save confirmation remain necessary. Manual
  output reselection is already optional. At that audit, 07 §11 was proposed,
  not an implemented redundancy. The later one-time-cutover decision above now
  supersedes its bridge-oriented compatibility request.

Executed tooling probes: installed Vitest 3.2.7 supports the aliases. `test:focus`
preserved the paused list failure and exit 1 (10 PASS / 1 FAIL, 561ms); a nonexistent
test filter also exited 1. `test:related` selected 9 dependent files and passed the
single requested existing case (328 skipped, 5.76s); this is selector evidence, not
nine-suite coverage. The full checkpoint alias preserves the serial required
typecheck/root suite/ordinary build/harness build with stop-on-failure. It was not
run against the known-unverified paused product tree. No test source, config,
assertion, dependency or runtime budget was changed. No quota saving is measured
yet; compare the next connected workflow's usage rather than promise a percentage.
Independent read-only review of these four tooling/instruction/status files found
no mandatory findings. Diff checks passed. The active todo was reduced from about
42,000 to 13,000 characters; removed completed records remain verbatim in the Git
checkpoint linked below. Product implementation remains paused, not reverified.

## Current connected unit — find/edit Captions, then save or send

Resumed/uncommitted: Caption list controls/CSS, new `captionRowLayout.ts`, host
pin/review connections, existing recorder tests and the 05 §13.2 list-scale note.
The old reveal failure (250 vs 194) is fixed. A 10k logical list mounts only nearby
rows plus a retained focused row; full search/color/recovery semantics remain.
The preceding goal turn made progress by completing the serial final code checks
and reducing the initial-conversion plan. Current Git remains
g0-baseline at c474f13 with this unit's uncommitted changes. The connected final
serial checkpoint completed successfully; its process is terminal, not a wait.

Make a long Scene Caption list usable: scroll/find a distant record → select or
reveal its pin → keep text/recovery details and keyboard access → continue editing.
Source inspection found that the existing list mounts every row; 03 §6 explicitly
requires virtualization for the 10,000-Caption UI. This is an implementation gap,
not a failed device measurement or a reason to raise the metadata limits.

- [x] Window the existing list's DOM with measured variable row heights, keeping
  complete search/color/count/selection semantics, stable keyed rows and inner-list reveal.
- [x] Preserve focus, keyboard reachability, IME, variable-height wrapping, scroll
  memory and visible recovery messages. Reuse the existing list/host tests, not a PoC.
- [x] Finish focused and final serial checks plus independent review.
- [ ] Record live browser/iPhone/scale-budget evidence separately; no rendering
  acceptance or verified Push checkpoint is claimed from authored DOM evidence.

Executed: early boundary/list checks 23 PASS; final focused list/viewport checks
36 PASS. The added dimension-injection cases are authored DOM evidence, not browser
layout. Review found measured-pixel drift on Scene/filter/hidden-tab return; fixed
measurement retention, logical Scene anchors and synchronous local scroll-memory
acknowledgement, including the host's double render. Independent narrow review
closed the finding after both hosts acknowledged scrolling through list-only
refresh and the development host reread its second-pass context. Scrolling no
longer requests an entire editor/3D refresh.

The root-suite run completed: 111 files PASS / 1 FAIL; 2,292 tests PASS / 1 FAIL /
21 todo (599s). Failure: `tests/projectFiles.test.ts`, received-Caption restoration
and independent-copy return, at the copy-only body edit assertion near line 2263.
This run started before the final list-only fixes. Its broad transitive selection
overlapped the affected-route related run, an avoidable verification cost. Both
processes are terminal; do not weaken assertions or conceal this earlier failure.
The final affected-route run completed: 9 files / 333 tests PASS, including the
previously failing case. A serial, single-case diagnostic also passed with explicit
editable/actionable assertions and failure-only status information (18.58s test).
Root-load sensitivity is plausible but not proven; retain its failure evidence,
do not change timeouts or assert it was a product defect. The final serial
checkpoint below also passed this case. No browser acceptance is claimed.

Browser skill was read; the current tool session has no existing browser binding.
The recorded bootstrap denial is not retried unchanged. Rendering and physical-iOS
evidence stay pending at the grouped adoption/candidate boundary. The subsequent
approved static-build work below starts only a loopback preview; no tunnel,
browser-repair task or public fixture was created.

Continue this user workflow in the existing limited route: separate manual
file saving from sending a Workspace/Contribution and progressively disclose
review/independent copy, using unchanged jobs/bytes and truthful download status
(06 §11.4, UI guidelines §4.4). This is not ordinary-home adoption. Do not add more
small conflict forms or revive the withdrawn migration bridge.

- [x] Make Save the default named-checkpoint action; separate Send (Workspace or
  explicitly based Contribution), with Scene sharing/independent copy secondary.
- [x] Reuse existing generation/download/retry jobs in one user action where
  possible. Download start is not a verified save; failures retain the generated
  result and an explicit retry. Keep optional file verification, stale notices,
  IME/draft protection and review/clean preflight. No new sink, bytes or format.
- [x] Update representative existing file-flow tests and review only this new
  integration diff; run final typecheck/root test/build/harness serially. Stop
  ordinary activation, new schema/profile/SW/HTTPS or source deletion at its gate.

Save/Send implementation evidence: six representative existing file cases passed;
the final two-case check also passed for named backup/download failure with same-job
retry and warm output recovery. Name input stays mounted through IME, Save uses
the named backup as the suggested filename, and completed jobs are secondary.
Interrupted generation remains visible. Independent read-only review found an
active-button contrast issue and a resumed output hidden without handoff; both
were corrected and narrowly re-reviewed. No new wire, storage authority or file
completion receipt follows a download click.

Final `npm run check:checkpoint` completed with exit 0 on this source/test tree:
typecheck; 112 root test files / 2,294 tests PASS, 21 existing todo (573.78s);
ordinary build; existing harness build. These ran serially, with no source/test
edits during the run. Builds retain the existing chunk-size and mixed-import
warnings; neither deploys or grants offline/PWA acceptance. Required reviews are
closed for the list and file-output changes. This is the preceding checkpoint;
the subsequent static entry/build changes below require their own final checks.
Do not repeat runtime checks solely for documentation or staging.
Work is uncommitted and unpushed. Recorded browser/device evidence and the
new-route adoption remain pending; prior push/bootstrap denials are not bypassed.

No dependency, schema/profile/budget, ordinary entry, new data or private fixture.
A future 10k recorded-DOM check proves a bounded mount and behavior only: it cannot
prove whole-Project cold open/edit latency, storage capacity or native layout.
The current validation metadata cap is 1,000 changes; the approved 50,000-change
workload and two-tab workload remain a separate implementation/adoption boundary.

## Following boundary — ordinary-entry adoption

Prioritize ordinary entry → real Project work and file exchange → exit/reopen,
not another small conflict-form expansion. `src/main.ts` still opens only Native/v1,
`entry.ts` stays DEV-only, and the existing harness production build deliberately
excludes this storage path. The approved dedicated static entry below admits only
its exact build mode; that is not ordinary-entry adoption. This remains a shared
missing boundary across the connected user flows, separate from implementing
Native conversion 07's approved amendment.

- [ ] Reconcile only missing 05 §13.2 / G1-A/C, profile, browser/storage and
  physical-iOS acceptance against executed evidence, using existing gate records.
- [ ] Prepare one bounded candidate/ordinary-entry connection plan and grouped
  human procedure. Resolve the actual built-execution/adoption/SW/HTTPS authority
  differences before changing guarded entry behavior; identify exact build and one
  temporary HTTPS path if needed. Do not count a dev server as offline evidence.
- [ ] Execute approved browser/device acceptance and then ordinary-entry connection;
  keep failures/unsupported behavior explicit. Native, frozen-v1 and LociMyu
  conversion and other profiles remain full practical-team requirements, not waived.

PO-approved executable step (2026-09-20; implemented, final code checks passed): build the
existing ProjectScene validation screen for local static execution, with an exact
nondefault build-mode guard and a separate output directory. Keep its current
GLB/PNG admission and validation storage namespace. Do not include the legacy PoC
writers, private/public sample assets or a new test page. Preserve both existing
ordinary and Spark/PWA build graphs, registration and Service Workers unchanged;
the validation build itself registers no Service Worker. This permits real
browser rendering/download/storage checks, not offline or general adoption credit.
An iPhone HTTPS path requires a subsequent exact-build/one-route approval; none
has been started. The unchanged 1,000-change caller cap cannot prove the separate
10k-Caption/50k-change gate. Remaining performance/profile/adoption decisions are
not silently ratified by adding a static execution mode.

Implemented: `build:validation` emits `validation-dist/dev.html`; the compile-time
entry cannot dispatch old writers even when URL `mode`/`storage` changes. Reused
the existing validation browser, services, CSS and storage namespace, with an
honest loading/failure state. `preview:validation` binds only 127.0.0.1:4182 with
a strict port; open http://127.0.0.1:4182/dev.html, not a filesystem HTML file.
Typecheck, the 14 focused boundary/build tests and the actual validation build
passed. Bundle-map inspection found the intended entry and no legacy PoC,
ordinary entry or PWA graph; output has no samples, SW, registration or manifest.
HTTP HTML/compiled JS/WASM checks passed, including a legacy-looking URL query.
These are build/HTTP checks, not browser input, device or offline acceptance.
Independent review's unreachable-test-branch finding was fixed and rechecked.
The first static-entry final root run ended with 112 files / 2,295 tests PASS,
one failure and 21 existing todo (457.84s). The existing independent-Caption-copy
case failed while the actual write was still `checking`; selection, editable
body and actionable Apply assertions had passed. Unlike the earlier overlapping
run, this one was serial, so suite overlap is not a sufficient explanation.
The test now observes and awaits the original command Promise dispatched by the
real button, then waits for the next visible control's UI acknowledgment. An
intermediate focused run exposed that adjacent acknowledgment race at the media
edit; both are corrected. No mocked write, relaxed value assertion, added timeout,
automatic retry or product-storage change. The final focused case passed (19.13s
test); bounded independent review confirmed the completion boundary. Typecheck
passed again for the test change. The fresh final root run passed: 113 files /
2,296 tests, with 21 existing todo (587.62s). Ordinary and harness builds then
passed serially. No source/test changes or concurrent heavy suites occurred during
that final run. Existing chunk-size/mixed-import warnings remain. The unchanged
static artifact did not need rebuilding for this test-only change. Six changed
Markdown files' local links and the final diff check passed. Preserve the earlier
failure results; these are not browser, offline or latency evidence. The worktree
remains uncommitted/unpushed; no denied Git/browser action was retried.
System-wide listening-port enumeration was denied; it was not retried. Only the
owned strict-port loopback preview was started, without stopping other processes.

Group the next human walkthrough around one Project: open an admitted model/image,
place/edit/find Captions, preserve window/list state, named file save and retry,
switch/reopen, then Workspace/Contribution two-round exchange with a second copy.
Use existing interruption/recovery cases for actual backend evidence. Publish
concrete button labels, supplied nonprivate inputs and the exact URL in chat when
the build is ready; do not give a filesystem HTML link or anonymous A/B instructions.

The existing browser bootstrap denial is not retried unchanged. Do not turn this
into another browser-repair workstream or ask for every helper check. A concrete
new permission or product/profile decision is grouped and explained to the PO;
known approvals for isolated implementation are retained. No release/Pages/main,
unratified wire, new profile or ordinary activation follows from this plan alone.

## Next migration planning boundary — initial conversion only

The PO withdrew continued old-format updates on 2026-09-14. The former 07 §11
map/wire/control-graph package is superseded, not awaiting approval. Do not revive
its legacy baseline/ancestor, portable managed-unit or parallel-introduction work.

Plan Native/v1/LociMyu source → inspected
conversion → one new Project → edit/save/reopen → distribute the converted
Workspace and continue through normal new-format exchange. Initial unplaced
records, pin scale, effective order and material mapping still need faithful
target representation. Reuse existing services; specify and review only remaining
necessary schema/profile/recipe differences, rather than assuming the former
bridge-oriented upgrade is still required.

The reduced source-backed findings live in 07 §5. Its PO-approved §5.1 now fixes
the three field additions (unplaced anchor, optional Native-range pinScale and
retained inactive chroma) and the minimal compatibility combinations. ZIP wire 1
and physical atomic-map grammar stay unchanged. A new closed map-2 semantic
profile, summary-2 and review-2 distinguish the new data while retaining all
map-1 unknown-field interpretations and exact old-job builders. A domain minor
alone is not sufficient evidence: the old reader accepts arbitrary minors.

- [x] Inspect the actual field/summary/snapshot/retry boundaries and specify the
  reduced target amendment; independent read-only review found no blockers.
- [x] PO approval of 07 §5.1 and the local static build (2026-09-20).
- [x] Implement the approved version-bound additions and retained old-file/job
  behavior; do not claim the whole converter or formal adoption from this unit.
- [ ] Close the initial source-profile/material mapping and immutable recipe
  vectors before durable conversion; implement one connected conversion→edit→
  file/reopen flow, not a revived old-format-update bridge.

Effective order can be remapped without a new order schema; occurrence-specific
material/profile mapping cannot be collapsed. Reuse creation/blob/session recovery
with one narrow conversion receipt. Full Native/frozen-v1/LociMyu inputs remain in
scope beyond the first connected subset. The format extension now uses one explicit domain
profile carried from the retained source proof through candidate/provider reads,
whole-record validation, command/copy readers and package summaries. Retain the
literal map-1 field registry and validators; do not infer this profile from minor
version or globally reinterpret overwritten unknown scalars. Unplaced owner
references, review/clean remapping, material toggle/capability checks and exact
old-job retries belong to the same connected acceptance boundary. Reuse the
existing metadata/persistence/file tests rather than adding another PoC.

Current connected unit: retain all three approved fields through new-profile
edit/reopen, independent copy and current-format file exchange while reproducing
old-file/job bytes unchanged. Carry the verified profile through domain/provider
and command readers first, then proof-derived causal summaries and schema-derived
review/clean builders. Existing output manifests already retain proof/summary;
do not add another persisted selector or job format. Acceptance includes old
minor-1 opaque/overwritten values, new unplaced owner retention and explicit first
placement, pin scale, inactive-chroma toggle, mismatched-profile rejection and
retained-builder cold retry. Use focused tests during edits and one final connected
checkpoint/review. Initial conversion recipes, formal content profiles, ordinary
entry, browser/iPhone/HTTPS, offline/PWA and release are outside this unit; only a
new contract conflict or authority boundary should stop the affected work.

Implemented in this unit: a root-byte-bound map-2 discriminator, profile-specific
records/history/commands, map-2/summary-2 causal output and review-2, clean/review
owner remapping and cold capture replay. The map-1 path stays literal and retains
opaque historical extensions. Unplaced first placement uses the same Caption,
keeps text/media/memberships and requires a verified surface before numeric/gizmo
adjustment. Known owners cannot be reassigned in this first-placement operation.
Pin scale changes marker size only; unresolved size is explicitly provisional.
Disabled chroma retains parameters while contributing no display effect.

Focused evidence: old/new package tests, pin/material controls and viewport
projection passed; one saved-service flow covers both unplaced forms, nonempty
media, forbidden owner changes, numeric/stale refusal, cancel/restart and exact
originals after cold reopen. Independent package/profile and UI reviews are
closed; the first-placement surface gate and stale option-list findings were
fixed. Early type/test fixture failures are not acceptance. The serial final
`check:checkpoint` passed on the final source/test tree: typecheck; 113 files /
2,309 tests PASS, 21 existing todo (536.55s); ordinary, harness and validation
builds. Existing mixed-import/chunk-size warnings remain. Seven changed Markdown
files / 220 local links and the diff check passed. No runtime rerun is needed for
these result-only document updates. No browser/iPhone/offline evidence is claimed.

Previous field-unit static validation artifact (superseded by the performance
fix above): SHA-256 of the path-sorted JSON array of
`{path,sha256,byteLength}` for every emitted file is
`64983548a538a5c4068aa2791aabcffb61ffe0f2d36beea76b36fa46e5340a8c`.
The owned 4182 preview returned exact local HTML, entry JS, application JS and
WASM bytes (HTTP 200); the output has no SW/manifest/samples. Keep it available
for the PO. The initially recommended public triangle was rejected in the PO's
Chrome check: its generator had the nonstandard PBR key `roughness` instead of
`roughnessFactor`. This is a supplied-fixture failure, not a passed creation check.
The generator is corrected and supports an explicit local output directory.
The replacement `validation-triangle.glb` is under the ignored
`.artifacts/fixtures/project-scene-walkthrough/`; select it through the file dialog
with an optional user PNG. Public sample bytes and the application build are
unchanged; no fixture is newly published and admission is not relaxed.
The focused regression runs the real generator, reads the emitted bytes, confirms
the typo remains rejected, creates a Project/Caption and cold-reopens exact stored
history. It and typecheck passed; independent review found no required changes. This small
fixture/instruction correction does not re-open the unchanged product build's
whole-workspace checks. The PO subsequently completed the prescribed operations
with the replacement, including file output, but reported unacceptable pin/output
latency. Functional completion is retained; the bounded performance fix and its
remaining Chrome recheck are recorded at the top of this file.
Later two-round team/device/offline acceptance stays separate; this procedure
does not claim the not-yet-connected initial converter is available.

Read-only recheck: branch remains g0-baseline, HEAD c474f13; local origin tracking
reports 0 behind / 89 ahead (not a fresh remote fetch). Current changes are
uncommitted and unpushed. Managed Git/browser/system-enumeration denials were not
retried or bypassed. These restrictions do not change the executed local results.

[Specification 07](../../../specs/07-project-scene-migration.md) owns the reduced
contract and historical draft reference. Initial source preservation, complete
mapping and durable failure/retry stay required. Ordinary adoption/device checks
remain separate; this scope decision does not authorize a release or new format.

## Remaining sequence and stop conditions

1. The independent-copy checkpoint is preserved. The connected file/edit/reopen
   flow, not an increased helper/test count, is the completed unit; normal entry
   and adoption remain incomplete. Address data-loss, save-misrepresentation
   and operation-blocking faults immediately.
2. Replan only initial Native/frozen-v1/LociMyu conversion under the reduced 07.
   Real-model update/correction/return and independent copy are verified in the
   limited new-format route. Initial source preservation and unplaced-record
   retention stay approved; do not re-ask those policies. Continued old-input
   bridges and the old 07 §11 approval package are withdrawn. Close any genuinely
   necessary target-format differences before implementation; do not add another
   PoC or silently change existing map-1 files/jobs.
3. Satisfy applicable storage/renderer/profile/device adoption conditions, then
   connect the ordinary entry. Unratified migration/wire differences need a concrete,
   grouped decision; they do not stop already-approved isolated implementation.
4. Fix the integrated candidate; verify TEAM-FLOW-01 and the target inventory on
   Desktop/physical iPhone, restart/offline, IME/keyboard/short screens and recovery.

Current policies remain: explicit conflicts and independent keep-both; no source
relation/filename-purpose inference; known-position needsReview pins stay visible
and selectable; parent reassignment is explicit. Internal resume is not external
file saving. Latest automatic resume and named manual checkpoints are distinct.

Human checks are grouped at the approved adoption/candidate boundaries, unless a
specific new risk requires earlier evidence. Give the steps in chat. Any temporary
iPhone HTTPS route needs approval of the exact build and one route. Do not claim
offline/PWA PASS from a dev server or use old Native acceptance for the new route.
M13/M14, unsupported media/formats, general Undo/tags and release expansion stay out.
New policy/compatibility/major architecture decisions retain their explicit approval boundaries.

## Git and handoff

PO renewed permission for timely checkpoint Push on 2026-09-14. Use existing
`g0-baseline`; verify remote, scope, privacy and triggered workflows first.
At `e6fc15b`, cached origin was 0 behind / 86 ahead; no live fetch was used for that
observation. Previous environment denial is separate from PO permission:
do not retry a denied action unchanged or bypass it. Local implementation need not wait.
`main`, Pages, Service Worker, license/version and public release remain separately gated.
Completed checkpoint details remain unchanged in Git at `e6fc15b:tasks/todo.md`
(`git show e6fc15b:tasks/todo.md`). Read them only for a concrete evidence question;
[current inventory](../../../../tasks/implementation-inventory.md) remains the feature-coverage record.
