# LociView active work

Updated2026-11-14. This is the single current plan and check record.
[Inventory](implementation-inventory.md) owns route-specific coverage;
[map](../PROJECT_MAP.md) and [document index](../docs/README.md) route contracts/code.
Git owns checkpoint identity. [Retained checkpoint evidence](../docs/history/development-through-2026-10-29/tasks/todo-before-daily-authoring.md)
and [earlier working records](../docs/history/development-through-2026-10-28/tasks/todo-before-desktop.md)
retain qualifications and failures. Their Current/Next headings are not an active
queue or renewed approval requirements.

## Current — editing one record and sharing selected scenes

- Target for the ordinary Ki-84 text edit: about one second from Apply to
  visible durable acknowledgment. Profile preparation, stored document and
  content checks separately; remove duplicate work within existing verification
  fences. Compare the same real edit on the baseline and final builds, inspect
  the actual backup and cold reopen, and retain rejection and crash recovery.
  A cheaper acknowledgment with weaker storage evidence is outside this target.
- PO accepted checking untouched material loss at open/reopen/output. A ready
  restored Session now proves the exact text-only delta and matches its prior
  journal controls, restore binding and current document before writing. Existing
  source facts project the new version through the normal domain checks.
  Actual written document bytes, current change, publication and lease closure
  remain independently checked. Failed full inspection invalidates reuse.
  Verify consecutive edits against a cold provider, older-source loss, altered
  controls and real renderer termination on PC and touch layouts. Compare normal
  builds separately from the diagnostic/profiler lane; retain failed evidence.

- Ordinary Ki-84 edit, Windows Chromium 156, 1280×720, new isolated profiles.
  Alternating the previous checkpoint `1e6fad2` and this candidate on the same
  backup, actual click → painted durable success (ms, three runs each):
  3869/3945/3891 → 1433/1406/1255. Median 3891 → 1406 ms (64% shorter);
  each run remains above the 1000 ms target. External file handoff median
  23.826 → 25.663 s; browser relaunch through edited body 26.030 → 27.526 s.
  All six downloaded files retained the same 43 original hashes, 103 captions
  and three original changes plus exactly one new edit. No private input
  or output file belongs in the repository.
- PC/touch Chromium: six checks passed, including renderer termination
  before writing, before publication and immediately after visible success,
  quota recovery, cold reopening, input continuity and output. Repaired
  missing earlier history and an unexpected database head separately: same-window
  retry refused while evidence was bad, then recovered exactly once.
- Separate instrumented candidate click: 739 ms to first journal write,
  1055 ms in the edit command, 1164 ms to success in the DOM and 1211 ms
  through paint. First write: 39 successful file snapshots, none for an
  original, its Origin receipt or its content evidence. The document write
  and independent reopen/compare took 46 ms. The outer storage owner,
  pending edit-copy checks and stage boundaries dominate the remaining delay.
  Retain PC measurements separately from touch correctness; iPhone Safari
  timing is pending. Next measure the first lease check and edit-copy lookup
  separately on projects with different lengths of editing history.
- Final local checkpoint: typecheck, 156 test files (3554 passing, 16 expected
  failures, 21 TODO), five builds, offline isolation and HEIC isolation passed.
  Independent reviews covered same-window recovery, selected-store writes and
  the PC/touch UI. Browser acceptance above is Chromium; device Safari is open.

- Restored project, ordinary title/body edit. After a full read of the
  written document and its provider, confirm the new exact bytes from both
  the journal and the current document, predecessor chain, restored binding
  and selected writer. Adopt the verified read only after the lease closes.
  Cold recovery, export and a subsequent full read inspect their own inputs.
  Loss of an unrelated file after the last full check is detected on the
  next full inspection. A changed or unreadable base before writing leaves
  no pending edit; a fresh attempt on the same open project can succeed.
- Ki-84, baseline `db8af2d`, final Windows Chromium 156, 1280×720, same
  private input, isolated profiles, three interleaved runs per build.
  Apply → visible success (seconds): 4.903/5.997/7.650 → 3.797/3.957/5.796.
  The post-publication stage (ms): 1115/1251/2056 → 56/57/85.
  Browser file snapshots in that stage: 280 → 20 in each pair, including
  88 content receipts, 88 Origin receipts and 44 originals → zero for all
  three families. These counts are successful OPFS getFile calls, excluding
  IndexedDB. Before the first write, distinct receipt/original counts stayed
  44/43/43. Six downloaded backups kept all 43 original bodies, three exact
  original changes plus one new edit, 103 captions and cold-reopened text.
  Download handoff medians 28.719 → 22.126 s, cold launch through edited
  text 31.558 → 24.069 s; these paths were unchanged and varied across runs.
- Verification: five PC/touch Chromium tests passed, including renderer
  termination before staging, before publication and immediately after
  on-screen success, then cold reopening and backup inspection. Repaired
  damaged journal, exact edit and restore-binding cases reopened once.
  Final checkpoint: 156 suites, 3,549 passing, 16 expected failures and
  21 todo; five builds, offline isolation and HEIC isolation all passed.
- Next: apply still interrupts writing. Before the first write the new median
  was 1.636 s; pre-persist and post-persist provider checks were 0.561 and
  0.568 s. Measure CPU vs storage inside the first interval before changing
  its checks. Physical iPhone Safari latency is still unmeasured.

- Ki-84 body edit, baseline `ac5102d`. Each of 44 distinct content receipts,
  43 Origin receipts and 43 originals is now opened once during preparation.
  The source/edited providers validate their own token, records, facts and
  original presence. The edit also reuses its freshly checked restore parts and
  manifest inventory. Each post-write phase and cold recovery uses fresh reads.
- Dedicated Chromium 156 on Windows, 1280×720, isolated restored profiles, same
  source and history, alternating builds, three runs each. Apply to the first
  staging write (seconds): 3.561/3.509/3.435 → 1.957/2.154/2.126. Apply to
  visible acknowledgment: 8.619/8.004/7.548 → 5.938/6.933/6.002.
  Content-receipt elapsed totals (ms): 748/731/807 → 236/224/262.
  Original-presence elapsed totals, including suspect-marker, receipt and size:
  854/762/873 → 280/256/310. Stage times are not additive with wall time.
- Before the first write, non-control metadata/Origin readStream calls:
  290 → 151 (291 in the earlier measurement, including an overlapping UI read).
  Corresponding readBytes calls: 198 → 17. Successful native file snapshots
  for content receipts, Origin receipts and originals: 176+176+88 → 44+43+43.
  These counts exclude unrelated control reads. All six external files preserved
  43 original body hashes and three original changes plus the one text edit;
  the edited text reopened in a newly launched browser. Median download handoff
  30.636 → 29.082 s and cold launch to the chosen text 32.902 → 32.932 s.
- A first cache-only pilot still opened each receipt twice. The next iteration
  consumed the same bounded snapshot for size and content and removed repeat
  restore evidence reads. The final local edit extracts its exact delta and
  reuses an identical in-memory history reconstruction only when the base is
  the same object. Missing inputs fail before staging; losing evidence or an
  original after staging prevents publication and a cold retry applies once.
- Verification: the six Ki-84 journeys and five PC/touch browser checks passed,
  including an actual renderer crash before staging and another before
  publication. The first full run found two diagnostic-order assertions and
  one file-specific import-boundary mismatch. After correction all three
  passed. Final checkpoint: 156 suites, 3,542 passing, 16 expected failures,
  21 todo, five builds and offline isolation passed. HEIC isolation passed for
  all five artifacts. The final diagnostic/import correction preserves the
  measured edit path. Physical iPhone testing was outside this measurement.
- Previous run's post-staging medians for final-content, saved-content and
  published readback were 0.836, 0.733 and 1.234 s, respectively.

- Measure a restored Ki-84 body edit from the Apply click to its first journal
  write. Attribute selection checks to the edit and independent readers. Group
  the edit's read-only preparation while holding its writer lease, then test
  refusal before staging, durable readback, interrupted recovery, external backup
  and cold reopening. Compare with the same input on `12c6c52`.
- The traced edit owned ten selection checks before writing: one lease entry,
  two for the review-copy slot, two for reading the published state, two each
  for the original and edited provider, and one write entry. Four more came
  from a concurrently finishing conversion-report availability read after open.
  The edited route now checks selection at lease entry and write entry. The
  report reader keeps its independent boundary.
- Isolated Chromium, same restored Ki-84 and interleaved builds, three runs
  per version. Click to first staging write in seconds: 3.807/3.634/3.610 →
  3.180/3.048/3.055. All concurrent selection scans: 15/16/15 → 7/7/7;
  management-file opens: 105/112/105 → 56/55/52. Edit completion in seconds:
  8.874/8.153/8.088 → 9.074/7.514/7.580. After the first write both builds
  made eleven selection checks and opened 77 control files on every run.
  No model/photo rewrites. All six actual ZIPs and independent cold starts
  preserved the exact edited body, all 43 originals and three original
  changes plus one edit. External download handoff medians were 34.440 →
  34.529 s. Cold launch through edited text varied from 74.8 to 92.3 s.
- Five Desktop browser scenarios passed, including PC/touch capacity and
  input continuity and actual renderer crashes before staging and publication.
  The recovery test now waits for the restored project's own title using the
  existing first-restore completion budget. Two earlier runs stopped during
  setup at the 15-second control wait. The final build's checkpoint passed
  (3,540 passing tests, 16 expected failures and 21 todo), plus HEIC isolation.
  The first offline suite passed seven of eight. Its mixed 500k workflow
  hit the 20-minute aggregate limit after verifying offline restoration and
  editing. The isolated browser run of that exact scenario, under the same
  limit, completed the return to static and exact histories in 10.3 minutes.
  The subsequent breakdown of those pre-write reads is recorded above.

- Use the restored Ki-84 daily edit as the baseline. Count restore-control opens
  and measure the visible edit, external backup and cold reopening. Preserve fresh
  authority at every write, durable readback, publication and recovery decision.
- Collect the selected scenes' memberships before resolving their sources. Keep
  each physical original once, scene-specific records and camera choices intact,
  and a repeated download within the user's last chosen scope. Check both ends
  with a shared asset, a shared photo and a third scene outside the selection.
- Record and isolate any change to an existing recovery or file contract before
  connecting it. Use independent review and exercise the actual recipient file.
- Start Share with the scene choice. On touch-sized phones select a pin into
  the record detail, read its photo there and return to 3D with the same selection.
- The practical comparison used the same Ki-84 backup (103 records, 43 original
  bodies) and clean, isolated Chromium profiles. On one PC we alternated the
  fixed `800bc2c` build and candidate in three pairs (old/new, new/old, old/new).
  Old → new medians in seconds: apply 16.015 → 12.356, file generation through
  download handoff 40.541 → 32.717, cold launch through edited text 37.424 →
  34.434. First list 7.817 → 8.542; no first-list speedup. Individual runs
  in pair order: apply 16.015/18.021/15.881 → 12.356/12.663/12.270,
  handoff 37.118/42.281/40.541 → 32.707/32.717/36.172, cold edited text
  37.124/37.424/38.929 → 34.434/40.574/32.885. All six actual backups retained
  the starting identity, all original changes and bytes, and exactly one new
  change. An earlier separated three-before/three-after series ran slower on
  the candidate (9.464 → 12.409, 23.174 → 32.794, 24.262 → 36.685 s).
  Its median restore-control opens fell from 1,277 to 623 on edit, 2,860 to
  1,540 on export. Text edits issued no original model or photo writes.
- Rechecked when saving actually starts. Three interleaved candidate edits each
  issued four metadata text writes, one change-body write and one DB save.
  Input, navigation and previews do not start that commit. The design review
  compares command-scoped checks, a single-store text commit, and reopening
  the UI after the existing recovery record becomes durable, with separate
  acceptance for crashes, stale drafts and outbound content. These changes
  are not in the measured build. The PO subsequently authorized the first
  candidate only, conditional on measured benefit and crash/recovery checks.
  [Save timing review](../docs/specs/06e-selected-generation-output-read-proposal.md#本文編集の保存タイミング再検討2026-11-13設計案).
- Repeated that journey against the frozen immediately preceding 623-open
  candidate and the transaction-scoped title/body candidate, alternating three
  fresh Chromium profiles per build. Median visible Apply 8.494 → 6.108 s
  (9.052/7.995/8.494 → 6.278/5.594/6.108). Restore-control lists
  89/90/90 → 24/25/24; file opens 623/630/630 → 174/179/175. Each edit
  still wrote four journal receipts, one change and one document save; no
  model/photo write. Actual external file handoff 22.942 → 23.159 s;
  cold edited text 26.254 → 25.450 s. No export speedup. All six downloads
  and cold opens retained the original identity, all 43 original bodies,
  all three original changes and exactly one new edit. Keep preparation before
  a complete durable change distinct from retrying the exact prepared change.
- Adopted the scoped text commit after the comparison and independent review.
  An actual Chromium renderer crash immediately before publication, followed by
  a fresh browser on the same profile, recovered one edit. Its real backup and
  second cold restart preserved model/photo bytes and the exact original history.
  All 58 distinct Desktop scenarios passed across the regression and targeted
  corrections, including PC/touch. All eight offline scenarios passed. The
  156-suite checkpoint passed (3,535 passing tests, 16 expected failures,
  21 marked todo), plus HEIC isolation across all five outputs. On the short
  1280×720 dense workspace, the independent layout correction increased list
  height from 116.5 to 155.8 px; short-detail, filtered, draft/IME, phone
  and cancellation paths were exercised. Physical iPhone remains unverified.
  Next: attribute the edit preflight and model/media evidence reads before
  proposing any further change to when the application can declare a save.

## Outcome and authority

Complete open → Project/Scene/model/Caption/media work → save/send → receive/resolve
→ edit/restore/cold-resume. The historical practical-team tally was61 of the64
inventory groups, excluding later M13. PO's current grouped1–4 instruction brings
bounded alignment and daily authoring into current work; those dated counts do
not exclude it. M14 visual repair remains optional and outside completion
requirements; F09 continuing old-format updates was withdrawn.
Initial Native/frozen-v1/LociMyu conversion and new-format teamwork remain required.
The inventory classification counts are dated observations, not completion rates
or a ranking of user value. The priority correction below governs sequencing;
the older61-group boundary does not exclude evaluating daily-use operations.

PO prioritizes missing integrated features before readiness-stage tuning. Preserve
originals/history, typed Session commands and existing write/readback/recovery fences.
Fix latency when it prevents use or risks data. Keep the existing
[comfortable UI targets](../docs/ui-product-guidelines.md); no new numeric guarantee.
One implementation writer; bounded independent reviewers are read-only. No small manual
test or helper approvals. Continue in-scope work while device evidence is pending.

## Product sequencing —daily-use workflows first

PO2026-10-29 places the everyday-use features previously labelled later/additional
ahead of compatibility expansion and maintenance. Do not equate an unsettled
operation contract with low product value or let the dated inventory decide order.
Start with Scene organization, then repeated Caption editing/copy/undo and record
organization/settings. Evaluate alignment and media by the user task they enable,
not by whether a basic internal path already exists. Completed Point/GS replacement
and conversion paths remain represented in inventory; this priority does not mark
them pending. General GC and deferred scalability are not the default next work.
Data-loss/security defects still take precedence.

This is a sequencing decision, not implementation evidence or blanket ratification
of every optional feature, undo/concurrency rule, media codec or dependency.
Keep accepted originals/history and Session/file/recovery fences. No new numeric
capacity guarantee, general adoption or release is inferred.

## Retained priority correction —defer large Caption qualification

PO2026-10-29 defers10k-Caption support for the foreseeable future and assigns it
very low priority for completion. The combined10k-Caption/50k-change qualification
is retained later, not a practical-team completion or sequencing blocker and not
PASS. Aligned product/storage/gate/team clauses and inventory, retaining existing
list behavior, fixtures/history, admission limits and all durability/conflict/
privacy/recovery/smaller-test obligations. Documentation-only diff/local-link and
unchanged-feature-classification checks pass; independent review has no findings.
No runtime change or new capacity guarantee; no runtime suite is needed for this
documentation checkpoint.

## Verified workflow —photo-linked records shared across scenes

One record now connects point/GS placement, a photo, and any scenes that use it.
Returning from the image viewer keeps the current record. A received scene recalls
its saved entry by ID; other saved views remain usable even when their names match.
PC and touch browser testing uses separate sending and receiving profiles and a
downloaded scene file. Track physical iPhone file selection, touch and Safari memory
as device acceptance, plus unaided first use. Display-lightening remains paused.

The four PC/touch × Point/GS browser paths verify actual image decoding, same-record
editing from two scenes, keyboard focus, camera orientation and projection. Additional
checks cover GS coordinate placement without a Proxy, narrow-screen windows, invalid
file reselection, Point roundtrip/restore and SH4 replacement/return. Regression
checks distinguish scene search from the existing-record picker and exercise read-only
search during output, initial recovery and a changed source. See
[workspace design](../docs/ui-workspace-design.md) and the executable cases in
[desktop-spatial-note-sharing.spec.ts](../tests/e2e/desktop-spatial-note-sharing.spec.ts).

Final local checks: six PC/touch browser cases passed. The 156-file regression
suite passed with 3,523 passing cases, 16 expected failures and 21 TODOs.
All five builds, offline isolation and HEIC isolation passed. All eight offline
browser scenarios passed, including the 500k SH4 cold edit/save/reopen and
same-address return after correcting the recent-project selector in that test.

## Verified checkpoint —first-use open, record, save and resume

PO authorizes continuing the novice-path review from g0/9add3d3. Root is the only
writer; bounded practical-UX and test/contract reviewers are read-only. First
finish a PC/touch walkthrough and consolidate actionable problems in the existing
design review, then repair that connected workflow through existing UI commands.
Preserve originals, drafts/IME/focus, multiple windows/active Next, file readback,
recovery/publication fences and current UI ownership. No rendering/performance
work, new dependency, format, onboarding manager or release. Physical iPhone-only
checks become grouped residual acceptance; they do not block ordinary fixes.

Review first file selection/creation, first surface pin to text+photo, apply versus
file save, and warm/cold or file-based continuation. Reuse existing small PC/touch
tests and service fault coverage; collect before/after screens and check adjacent
cancel, readonly, failure and small-screen input. At final source run independent
review, required checkpoint/HEIC checks and affected browser/offline flows serially;
commit/Push a suitable g0 checkpoint and confirm exact CI. Preserve private251
draft lines and unrelated EOL changes. Evidence: .artifacts/e2e/first-use-20261113/.
Stop only affected work for an actual new policy/contract decision or unsafe result.

Before inventory complete: actual first surface selection (no XYZ rewrite), direct
new detail, text+photo, real Backup, explicit recent-row edit and separate-context
file restart PASS on PC/touch2. Preview geometry probe PASS at320/390/1280: no
horizontal overflow; missing insets/hierarchy are the rendered issue. Existing
readiness/input fences survive this baseline. Independent practical/test reviews
plus images consolidated FU1–6 before product edits. Implement this same workflow;
leave physical-device and display/performance acceptance pending.

Grouped repairs are implemented in4 UI files only: no-file picker without
auto-creation, ordinary empty-record/apply-to-file guidance, stable list progress,
consistent saved-file names and absent-Project restart presentation. Existing
Project time-switch/recovery warnings and all command/I/O fences remain.
Focused detail24 and connected6 PASS; a test-only textOnly argument type error
was corrected by using the existing render props (retained failing log), then
that case/typecheck/builds PASS. Existing PC/touch input flows2 PASS through
surface pick without XYZ rewriting, direct details, header save, explicit recent
row and retained separate-context/cold/IME cases. Same source's rendered after2
PASS, including cancel/reselect,320px long file name and CSS zoom2 layout only.
Independent source/test reviews have no unresolved findings. Final serial
checkpoint, affected browser/offline checks and Push/CI follow at this boundary.

First required checkpoint stopped at full Vitest:155 files PASS,5 failures/3518
PASS. Two assertions still bound old preview/history copy; align the same consent
and named generated job to current wording. Three cases (stale-open2 and named
startup scope1) exposed an unintended source change: the picker-only early guard
also swallowed already-selected file events before the existing async boundary.
Limit that new guard to the empty-selection picker branch; selected files must
use the original execute/openSelection path. Preserve all stale Host ownership,
changed-work refusal, full-catalog lookup and output-job identity assertions.
Retain failed log/source identity; run the exact failures and adjacent guards,
then a clean final checkpoint. No retries or wait/assertion relaxation.

Corrected exact failures plus adjacent guards7 PASS; independent limited review
has no findings. Final corrected source/test tree: check:checkpoint PASS
(156 files/3523 PASS,16 expected-fail and21 todo retained, all five builds and
offline isolation), HEIC isolation PASS. Frozen final candidate: connected
Desktop6 PASS, first-use/rendered2 PASS (including picker cancellation, direct
detail, save and recent-row/file continuation,320px/long name/CSS zoom2), installed
Edge/Chrome2 PASS and two-window offline update1 PASS. Original model/record/photo
continuation checks, output-time reading and real downloads remain. No retry,
exclusion or timeout relaxation. Do not claim all Desktop/offline cases, physical
Safari, real novice participants or performance acceptance from this scope.

Review/source/test and rendered findings are closed for this connected unit.
Prepare the verified g0 checkpoint after public-doc filtering and staged identity
checks, Push and confirm exact CI; serve the final frozen candidate on the owned
loopback preview. Model and saved-file samples are generated from the same tested
small fixture in final-visual/results. Git and the local checkpoint.json retain
identity; private originals/drafts and generated evidence stay out of the Push.
Next UI review: format-specific first record for Point/GS/Proxy and recovery from
failed opening within existing contracts. Keep display-lightening paused.

Physical iPhone residual acceptance (not a wait dependency): Safari's real IME,
software keyboard/dynamic toolbars and native zoom; Files download completion,
cancel/reselection and reopening the actual saved ZIP; app switch, memory-pressure
recovery/Safari full termination and offline restart. Touch Chromium/CSS zoom is not this evidence.
First-use human observation and assistive-technology acceptance also remain;
automated walkthroughs do not certify novice comprehension or AAA quality.

## Verified checkpoint —clear save state and coherent first-record workflow

PO2026-11-12 authorizes grouped UI/UX repairs after the progress review. Base
g0/ff9b3cd, root sole writer; bounded independent reviews are read-only. First
complete a PC/touch walkthrough and record source/rendered issues together in
ui-design-review; do not patch controls before that inventory is complete.
Then improve saving-state clarity, hierarchy/spacing and first-use
open → record text+photo → apply → real file → cold reopen through existing UI.

Preserve ordinary multiple windows/active Next, drafts/IME/focus, readonly and
failure/recovery gates; no new manager screens, schema, dependencies, renderer,
validation lifetime or publication. Display-lightening/performance remains
parked, including the diagnostic checkpoint below and its proposed next work.
Preserve251 private draft lines and semantic-zero dirt. Stop only affected work
for a genuine new policy/contract decision or unsafe result; no small PO waits.

Use existing small connected PC/touch and service fault tests, plus screenshots
before/after, original-byte/record checks and cold continuation. Final source:
independent diff review, serial check:checkpoint/HEIC isolation and relevant
Desktop/file/offline checks; suitable g0 checkpoint Push and exact CI. Actual
iPhone/Safari/assistive-technology acceptance stays separate. Evidence under
.artifacts/e2e/ux-journey-20261112/; refresh only the owned4191 preview after
verification. Outcome and remaining work, not per-control counts, govern exit.

Inventory UX1–6 completed before product edits: fixed ff9 PC1280×720/touch390×844
walkthrough through one text+photo and actual file, plus independent source,
visual/contract and test-mapping reviews. Preserve initial focus/setup failures;
corrected baseline2 PASS. Implemented browser/file status groups (generic unknown
means save unconfirmed, not missing destination), existing empty-scene CTA,
consistent home/recent rows and save-name label, target descriptions, and explicit
close of completed output feedback. Cleanup partial/uncertain warnings remain
nondismissible and propagate when closing. No Session/FS/renderer changes.

Editing checks: UI/import46 PASS; existing connected file cases4 PASS including
busy dismissal, partial cleanup/uncertain retention and unchanged token; matching
editing screenshots2 PASS. Existing PC/touch input workflows2 PASS include actual
surface selection, text+photo one apply, IME, real file, restore and cold reopen.
Visual review found first-CTA/search crowding and an ambiguous generic
save-destination phrase; refined toolbar order/primary styling and copy before
final qualification. All original guards and limits retained.

First final root run:155 files PASS, connected-files5 FAIL/3517 PASS overall.
Four failures depended on the previous paragraph/combined-title/direct-button
home markup. Bind the same exact Project/title/ready state and buttons through
the new row semantics, retaining readiness/IME checks. The held-render product
case still used the old add-button label; correct it and release the held mock
renderer in finally so a selector error is not masked by disposal timeout.
No production change or timeout/assertion relaxation: exact corrected5 PASS.
Preserve the failed full log. Check adjacent browser paths before a clean final
checkpoint run; do not relabel the failed invocation as passing.

Final unchanged source/test tree: check:checkpoint PASS (typecheck,156 Vitest
files/3522 PASS,16 expected-fail and21 todo retained, all five builds and offline
isolation); HEIC isolation PASS. Preflight adjacent4 PASS. Final frozen artifact
bytes differed despite the same source/test fingerprint, so reran all6 connected
Desktop cases rather than reuse preflight: PC/touch first-record→text+photo→apply
→real file→restore/cold reopen; small/short mobile and output-time reading;
cancelled file/receive/restore continuity, long Japanese Project title and320px
recent rows. All6 PASS; matched before/after visual2, installed Edge/Chrome2 and
two-window offline update1 PASS. Offline covers retained unapplied input, wrong200/
missing resources, retry and full close; it is not the entire offline suite.
Independent final visual review closes CTA/search crowding, generic save copy
and long-title clipping. Contract/test reviews have no unresolved findings.

UX outcome: distinguish browser resumability, file freshness, download handoff
and actual selected-file comparison; retain draft/failure gates. The one existing
empty-scene add action is visible before search; home/recent rows/save naming
share the work area's language. Explicitly closing completed output removes the
duplicate top notice, while busy/error/partial-cleanup warnings remain visible.
No source changes after the tested freeze. Required checks were serial, without
retries, exclusions or relaxed assertions/timeouts. No full Desktop, full offline,
large-data speed, physical Safari, screen-reader, novice-user or release pass is
claimed. Screenshots/sample and exact manifests remain local under the evidence
root; never add source data, private drafts or generated artifacts to the Push.

Connected workflow is verified locally; suitable g0 checkpoint Push and exact CI
PASS after privacy/staged identity checks. The owned4191 preview serves the frozen
candidate (HTTP200 and exact index); final identity/CI live in the local evidence
root's checkpoint.json and Git rather than duplicated commit logs. Next: grouped physical iPhone/Safari
IME, file save/reopen and offline acceptance plus first-use observation on this
integrated candidate; continue any evidenced UI repair within existing contracts.
Display-lightening and large-data performance work stay parked until resumed.

## Parked checkpoint —first-restoration diagnosis and recovery

PO2026-11-12 resumes large-data comfort work after g0/61507a7. Root is the sole
writer; independent contract/source/evidence reviews are read-only. Preserve251
private draft lines and semantic-zero dirt. No dependency, format, profile,
capacity, validation lifetime, recovery/publication fence or release change.

Outcome: isolate Ki-84/500k SH4 first-restoration waits, then retain only changes
with useful elapsed benefit and no reproduced regression. Measure receipt read,
fresh inventory, executor and receipt write/readback within fact-save; never sum
parent and child totals. Normal source/body/history checks, real Backup and cold
continuation remain the acceptance boundary. Physical Safari remains unqualified.

Implemented only optional data-only fact-stage timing, with observer exceptions
unable to alter success/failure. No callback means no added promise wrapper.
Existing fact checks, full body validation, write/readback and ordering remain.
First baseline Ki-84: model-stage22.220s, body-save1.772s, fact-save20.260s;
executor6.608s and receipt-write11.444s are child totals. Receipt-write includes
its required control audits and readback; it is not pure storage-write time.

Evaluated invocation-local GS/GLB scratch and unused size-only SHA removal.
Independent source reviews found no blocking issue, but these candidates were
WITHDRAWN: the performance/no-regression gate was not established. Their exact
patch, immutable before/after artifacts and every result remain local under
.artifacts/e2e/first-restore-facts-20261112/. No parser/control optimization is
in the final product diff. No further cohort was added to seek a favourable result.

Primary before/after each ran3 complete journeys per dataset, including exact
records/history/all-body hashes, real Backup and cold/touch continuation:12 PASS.
Median seconds (before → evaluated candidate; not adopted):

| Dataset | Restore editable | Apply body | Download begins | File acquired | Cold body readable |
| --- | ---: | ---: | ---: | ---: | ---: |
| Ki-84 |120.287 →135.187|10.518 →17.850|29.957 →37.028|31.435 →38.696|10.778 →14.051|
|500k SH4|185.317 →149.694|9.006 →7.915|63.202 →57.604|67.043 →61.070|13.724 →10.876|

The predeclared one ABBAAB control retains those primary observations. Ki-84
6 PASS, mixed endpoints and one142.958s host-generation/137.021s archive stage;
SH4 1 PASS/5 FAIL at the unchanged240s normal-record readiness wait after the
early text preview. Both frozen versions fail; this does not prove the cause or
qualify either version. No retry, wait extension, assertion relaxation or failure
exclusion. Host memory pressure was observed but is only a cause hypothesis.

The initial retained failed BEFORE3 snapshot has all3 CAS receipts/bodies and5
content evidence receipts, but staging only: no blobsVerified/durable/publication
or Selection. Read-only OPFS snapshot captured without running application code.
The original failed Project state is retained. A separate owned copy, same BEFORE
artifact/origin and normal explicit retry reached editing-ready. Independent
post-recovery reading checks the original ZIP/all3 CAS SHA-256, original identity
and heads, matching journal/durable/publication and exactly1 Selection. This is
one successful recovery, not qualification of the other4 failures, stall cause,
post-recovery output or performance improvement. Recovery initialization34.511s
is not a new initial-restoration timing comparison.

Next smallest investigation: retain existing completed measures/IO snapshot in
the journey failure-finally before closing its browser. The original5 failures
cannot be reconstructed afterward. In session.resume, the stagedBlobs branch
between before-journal-bodies and journal-stage reopens metadata and performs a
second readonly checked() without a separate timing name. Absence of a completed
journal-stage measure does not distinguish that interval from an in-progress
journal write. Do not infer model re-decoding or remove either check from this
gap alone. No further performance cohort or repeated recovery attempt was added
to explain this measurement gap.

Focused diagnostic baseline11 PASS. Candidate GS/stream/persistence113 PASS;
file faults25 PASS/1 author-written expected-value error (triangle minimum-6,
not-5), corrected exact case1 PASS. Those withdrawn-candidate tests are not
claimed as final-tree regression. Diagnostic-only final checkpoint, HEIC
isolation and small PC/touch restore/save/cold validation are complete:
check:checkpoint PASS (156 files,3522 PASS,16 expected failures,21 existing todo;
all5 builds and offline isolation), HEIC isolation PASS, small input/first-backup
restore/save/cold PC+touch2 PASS, installed Edge+Chrome2 PASS. Final source/test
fingerprint6a04ebacebed. Independent final source/contract/evidence review has no
unresolved findings. No new full Desktop/offline-browser or physical iOS claim.

Meta-audit: still g0/61507a7, no release/deploy; private inputs/profiles and
failed evidence stay local. Prioritize the unresolved prepublication stall and
recovery state over more numerical micro-optimization. Changes to evidence
reuse across CAS writes or check timing require a concrete reviewed decision;
they are not authorized by diagnostic scope. Finish unaffected verification and
push the verified diagnostic development checkpoint, without claiming speedup.

## Previous checkpoint —open multiple Caption windows without retention controls

PO2026-11-12 explicitly restores normal multiple-window opening. Base g0/fba9960;
root is the sole writer, with bounded read-only state/contract and test mapping
reviews. Preserve the251 private draft lines and semantic-zero dirt in
sendWorkspace/backupOutputJob. No new format, dependency, Session/storage,
renderer, recovery fence, device guarantee or release change.

Outcome: explicit list/pin selection opens that Caption or brings its existing
window forward without closing others. Previous/next uses the active window as
its starting record and replaces only that window; opening an already visible
target focuses it without duplicating or closing other windows. Remove the
retention button and its extra required step from product and Review paths.
Keep per-Scene ownership, window move/resize/order/close, plain-text/media safety,
draft/IME/fault guards and hidden-mobile resource suspension. Pure UI memory is
not persisted as Project edits. With no active window, navigation changes the
detail selection without opening windows implicitly.

Before implementation, update the accepted workspace interaction description and
review active-versus-selected identity, duplicate targets and placement handoff.
Implement through existing window plans and host boundaries. Reuse pure state,
DOM/connection tests and existing Desktop PC/touch workflows for multiple open,
active switching, duplicate/closed target, close/reopen, Scene changes, IME,
photo suspension and normal save/cold continuation. No new giant roundtrip.
At the final tree run independent diff review, serial check:checkpoint and
appropriate Desktop/browser/isolation checks; freeze verified artifacts, Push
suitable g0 scope and check exact CI. Refresh only the owned4191 preview.
Stop only affected work for a new genuine contract conflict; no small PO waits.
Physical Safari/IME/memory acceptance remains separate.

Milestone audit: window state/Controls own only page-local open/order/placement;
Session, storage/package and renderer code are unchanged. Independent diff review
found and closed the output-reading Next origin bug: while windows are frozen,
sequential detail reading uses detail selection, not the unchanged active window.
Focused state/DOM/connection/import tests69 PASS, selected file-service cases4
PASS (other714 filtered, not executed), and focused-v3 phone/output PC+phone3
PASS. Initial browser startup used the config directory as cwd and ran no cases;
v2's hidden role lookup and fixture setup were corrected. V3's PC case passed
window/frame/media/cold behavior but retained the old two-record deletion count
after adding a third fixture; the final expectation now matches the three inputs.
Keep all failed logs/images; no timeout/assertion relaxation or automatic retry.

Read-only test mapping selects13 relevant Desktop cases: direct PC+phone window
and output-reading4, plus daily-authoring/file-continuation/view-mode2/input-
continuity2/image-inspection/portable-HEIC/workspace-completion9. A subsequent
touch-image/CSS review found that camera hit areas could cover window controls.
Set windows always above ordinary camera controls, closed camera-position UI below
windows and its open sheet above, keeping pin completion above both. Add an actual
touch close/reopen with camera focused and center-hit verification. This is a CSS-
only product follow-up, then existing help text/description nodes were reused to
identify keyboard-focused camera/projection controls without lifting their hit
areas above windows. No mutation/navigation/renderer behavior changes in this
follow-up. The final camera/help/views/import unit files48 PASS on that final
presentation code; the full unit run also completes3520 PASS/16 expected-fail/
21todo in1934.62s. Final builds/rendered checks cover final styling and descriptions;
final typecheck passes for the additional browser-test code. V3 phone/output
passes remain earlier-candidate evidence. The final13 affected/adjacent cases,
one navigation-only Ki-84 check, mandatory checkpoint and installed2 completed
as detailed below. No new giant file roundtrip is added.
No all-Desktop52 or giant GS/receive roundtrip credit is inferred for this tree.

Final2026-11-12: required checkpoint, all5 builds, offline/HEIC isolation and final
test typecheck PASS. Final rendered Desktop scope is13 selected cases: the first
adjacent run has9 PASS/1 test-only responsive-navigation failure; use the existing
revealCaptionList helper rather than requiring a touch-only Back button on narrow
mouse PC. The corrected case passes32.4s; the three direct final cases pass1.0min,
including actual Tab/tooltip/close/reopen and uninterrupted readonly output reading.
Original failures remain retained. No test limit, retry or product code changed
after freeze; `test-revision.json` records this one browser-test-file change.
Final source/test fingerprint is21e3cfea29b1996bfa07b0ac89947e2ea2e6648394a7ea2e1c56cdc716944ff2;
frozen runtime bytes are unchanged from the mandatory builds.

Ki-84 navigation-only PASS1.3min: checked original input SHA, restored in an empty
owned browser, opened two normal windows, stepped from an active window different
from the detail selection, kept the other DOM/frame intact, deduplicated an already
open target, reopened a third normal window and retained input SHA. It is not a
new Ki-84 save/phone/offline/performance qualification. Installed Edge/Chrome2
PASS59.8s. Window operations retain existing typed command, save, recovery and
hidden-resource authority; no renderer/storage/format change or latency guarantee.
Independent source/contract, final executed-evidence and settled touch-image reviews
have no remaining findings; exact staged source/artifact/privacy checks remain
the checkpoint condition. Git owns checkpoint/CI identity, with local proofs in
`.artifacts/e2e/multi-caption-windows-20261112/`.

Next: return to the existing large-data comfort work—measure validation/CAS/receipt
write/readback inside first-restoration fact-save, preserve every save/recovery
fence, and remove only demonstrated authorized duplicate work. Physical iPhone/
Safari memory, IME and file handling remain pending; no release or general adoption.

## Previous checkpoint —read verified text during first backup restoration (06g)

PO2026-11-12 approved06g. Base g0/baaca7e; prior frozen6ecc checkpoint, Desktop52,
offline8, installed Edge/Chrome2 and exact pushed CI43079185587 all pass. Root is
sole implementation writer; bounded contract/UI/test reviewers remain read-only.
Preserve the251 private draft lines and semantic-zero source dirt; use the existing
public-document filter for a verified checkpoint, not a broad add.

Outcome: input-verified startup-Scene Caption titles/body can be searched/read while
first restoration writes. Keep progress/recovery visible; edit/save/media/3D and
normal Session authority wait for canonical initialization/Selection/adoption.
No new wire/schema/ID/dependency/renderer/limit or public release. Preview is not
save success and is never reused as validation evidence for retry or final Session.

First map canonical Scene/lifecycle/membership resolution and exact input-proof
lifetime, and independently review them before code. Then add operation-owned
Host notification/plain text UI, guarded handoff and invalidation; reuse normal
reader and existing commands/ports. UI never reads package/storage directly.
Focused tests cover hold-write, malformed input/fault/owner/stale/IME/handoff;
reuse service faults and one connected PC/touch save→separate restore path.
Measure fixed Ki-84/500k GS3 runs each, input inspection→text→editable→3D separately,
with saved source/history/assets checks. Keep existing write/readback/recovery
fences, unchanged performance criteria and offscreen-resource release.

At final meaningful source/test boundary: independent diff review, serial
check:checkpoint and HEIC isolation, Desktop/offline/installed-browser relevant
whole lanes. Freeze the verified candidate, commit/Push suitable g0 scope, check
exact CI and update the owned4191 preview. Physical Safari acceptance remains
pending. Stop only affected work for a genuine unresolved spec conflict or new
policy; ordinary implementation/tests/fixes are authorized without another PO ask.

Implementation2026-11-12: canonical candidate field/membership selection is shared
with the full provider. The optional Host text DTO has no Session token or asset
authority. Each attempt owns its preview; success rechecks the real Host/proof/
history before consuming selection after IME. Producer failure, owner end and
restore failure withdraw text. A second confirm after a first-write failure
derives fresh text. The existing initialized-display callback remains fallback.
Read-only contract/UI reviews found and closed preview-seed reuse, an unnecessary
normal-route subscription, compact flex sizing and duplicated progress. Focused
PC/touch2 browser cases pass, including pre-initialize hold,320x365/844x390,
composition handoff, actual save and cold continuation. Focused service tests
cover delayed callback rejection, changed history and failed-first-write retry.
Final execution and its qualifications are recorded below; focused results alone
are not final qualification. Evidence: `.artifacts/e2e/first-restore-reading-20261112/`.

First final checkpoint:3518 PASS/1 stale UI-test expectation (outer progress was
intentionally replaced by the single reader status);16 expected-fail/21todo are
separate. Corrected the expectation to require empty outer status while retaining
the exact inner status and all write-hold/IME/save/cold checks. Exact case passes;
final checkpoint restarted as v2. No product-code change or timeout relaxation.
Read-only next-bottleneck mapping found3 full ZIP inspections before confirmation
(selector→Host→first Job preparation). Existing06a explicitly requires the Host
recheck; Job reuse is outside06b/e/f/g lifetimes. This is call-count evidence only,
not an elapsed-time saving or authority to skip input/persist/readback checks.

Initial frozen source/test fingerprint is1c59cd200d3a91237e9502b3e56c45e26edb51c2554e9a7a4776d2372851e268.
Checkpoint-v2: typecheck,3519 PASS/16 expected-fail/21todo, all5 builds and offline
isolation PASS; HEIC public isolation PASS. Candidate is frozen under the evidence
root `final/candidate/`. The later offline-test-only correction below changes no
product source or frozen artifact; `test-revision.json` retains both fingerprints.
Fixed-input primary n3 per artifact/dataset all PASS, including real output and
all retained-body hashes/original changes/records checks. Milliseconds below are
before→after triplets in repeat order; they are not new guarantees:

| Endpoint | Ki-84 |500k SH4 |
|---|---|---|
| Confirm→visible body |61844/59959/56559→236/237/170 |98046/105096/104036→193/150/141 |
| Confirm→editable |83636/82048/78373→82140/81024/79779 |125899/134979/135883→133651/136279/134354 |
| Apply body |9374/10393/10521→8324/10084/10860 |4078/3549/4593→3571/4097/3630 |
| Save→download event |24400/28779/25785→25259/27417/27861 |34257/32777/35752→34913/33741/30350 |
| Save→actual file |25529/29820/26901→26596/28586/29339 |37132/35359/38376→37606/36309/33165 |
| Cold→visible saved body |7747/8443/6777→10312/9224/6879 |7229/7658/8272→7550/7002/8049 |

Input-open→confirmation is separate (median5063→4959ms Ki-84,10396→10337ms GS).
Primary cold/3D barriers include sequential waits; no new actual-frame/pixel or
physical-device credit follows. The phone Drawing navigation retained the same
context with no additional source reads and released hidden resources as before;
its busy/2RAF timings are diagnostic only.

Ki-84 primary cold and output medians increased; do not waive them as noise.
Additional same-closed-profile control warmed both builds, cloned fresh owned
profiles and alternated A B B A A B: cold-readable before10583/7969/8264ms,
after8887/10178/8058ms; ready med20755→20872ms. All6 continuations PASS and IO-call
counts/source inspection show no new ordinary-route read, but this is not proof
of universal non-regression. Preserve both cohorts. The additional same-data
normal-Backup control below includes actual-file/all-hash/history verification
and cold continuation per clone. No product-source change, numeric tolerance
or retry waiver was used.
Full Desktop52 PASS (104min). Offline initially7 PASS/1 failed test: the new
recipient continuation waited for a hidden phone3D canvas while the Caption
panel intentionally released it. The failure image retains the correct restored
body. Corrected only this test's explicit3D navigation, with the same readiness
assertion/deadline, then reran the affected case; preserved the seven unchanged
passing cases and original failure. Revised source/test fingerprint is
87583685c14e5e5f40e8ea8d195efe4801962edced550041353799efc1cc5be8.
The corrected offline case passes17.4min, including empty-recipient pre-initialize
text, subsequent edit/save/full browser close, exact history and own-unregister
preservation. Together with the original seven unchanged passes this covers all
eight cases; it is not a second clean whole-suite run. Installed Edge/Chrome2
PASS51.6s. Controlled save/continuation PASS10.3min: each of six fresh clones
keeps all43 body hashes, all4 prior changes, exactly1 added change, full proof
and every semantic record except the intended body edit. No page/remote errors.
Same closed data, warmed artifacts, A B B A A B; each column below lists its three
runs in phase order. File audit is outside output/cold timing intervals:

| Controlled Ki-84 endpoint (ms) | Before | After | Median before→after |
|---|---|---|---|
| Apply body |8375/10180/7857 |11256/8326/7597 |8375→8326 |
| Save→download event |20852/20436/21806 |28725/20031/20177 |20852→20177 |
| Save→actual file |22755/21525/23334 |29799/21954/21183 |22755→21954 |
| Cold→saved body |7722/6040/7567 |7723/7108/5914 |7567→7108 |
| Cold→ready |21953/18842/21096 |20425/20566/16593 |21096→20425 |

The additional control does not reproduce a consistent ordinary-save/cold
slowdown. It supports this bounded connection together with unchanged ordinary
I/O counts/source and the full functional regression; it does not replace the
slower primary observations or establish a universal no-regression guarantee.
Controlled actual-file mean is22.538→24.312s, with after-first29.799s despite the
lower median. Do not present this as an ordinary-save optimization or suppress
the slower observation. The independent evidence reviewer has no blocking06g
finding and accepts a bounded development checkpoint after byte/scope checks.
The early-text improvement is confirmed in both real datasets; no speedup of
complete initialization or ordinary saving is claimed. Physical Safari remains
unexecuted. Required source/artifact/index and exact CI/served-byte checks belong
to this checkpoint; Git owns its identity, with final proofs under the evidence
root. No aggregate adoption, general publication or physical-device credit.

Next: isolate validation/CAS/receipt write/readback within first-restoration
fact-save and remove only measured, authorized duplicate work. Keep all current
write/publication/recovery fences. A new evidence lifetime or validation timing
would need a concrete reviewed proposal, not a call-count-only optimization.
First initialization still dominates: Ki-84 first model-stage25.394s
(fact-save21.470s), GS25.582s (fact-save22.148s) plus separate full-body fences.
Fact-save includes validation/CAS/receipt I/O; those totals are not duplicate-only
or pure-write time. Next performance diagnostics should isolate these stages.

## Previous checkpoint —complete regression and reduce large-data waits (2026-11-12)

Outcome: finish Desktop/offline regression and reduce real Ki-84/500k SH4 waits
on PC and touch. Compare with61c5f9a, fixed converted backups, isolated profiles
and repeated elapsed observations. Root is the sole writer; independent UI,
contract and test reviewers are read-only. Preserve originals/quality, all
write/readback/recovery fences and existing frame limits. No dependency, format,
numeric guarantee, publication or physical-Safari acceptance is added.

Baseline: frozen61 application completes Desktop51 PASS/1 diagnostic failure;
the repaired image diagnostic then passes the complete affected case separately.
Its actual image assertion/deadline is unchanged. Offline8 and installed
Edge/Chrome2 pass. Keep original failed/full and corrected evidence distinct.
Host memory headroom recovered; old pressured measurements are not a baseline.
Evidence and fixed input identities remain private under
`.artifacts/e2e/comfort-regression-20261111/`.

Chosen change: compact3D exposes the same task tab list; Drawing opens directly
without hiding/reloading the single viewport. Caption/model navigation still
releases hidden resources. Move only that tab list at compact/PC boundary;
consume resize focus fallback once, preserve explicit blur and other focus.
Keep intrinsic wrapping and44px targets without forcing an extra navigation row.
Drawing's scrolling content gets the same12px scroll padding as Caption content;
measured input bottom292.40625 versus scrollport bottom292.0 explains the short
phone clipping. No input/footer size or visibility assertion is relaxed.

Independent product/contract/test reviews have no remaining source findings.
The public change is UI2 plus five relevant test files; storage/package/Session,
dependencies and renderer are unchanged. Corrected focus-v3 passes all8 connected
cases. Final2 checkpoint passes156 files/3510 tests, all builds and offline/HEIC
isolation; frozen final-v2 source/test fingerprint is6ecc51e7b284. Native compact
continuity passes in31.1s. No product source/test changes follow that freeze.

Retain failed candidates: final-v1 checkpoint passes156 files/3510 tests
(existing16 expected-fail/21 todo remain separate), all builds and offline/HEIC
isolation. Its whole Desktop completes49 PASS/3 FAIL: two compact CSS regressions
(short list and enlarged-text wrapping), and an existing random membership-order
assumption in the record-window test. Follow the actual list's direction and
assert destinations/end boundaries; do not change product ordering. Focus-v1
then exposes squeezed narrow navigation buttons; focus-v2 fixes those but finds
the fractional Drawing input clip. Original screenshots/logs and source snapshots
remain available. Verify the connected workflows after the final padding fix,
then run the final source checkpoint and whole native/offline/installed lanes.

Performance evaluation: readonly discovery (§06e9.2) is rejected before coding
because its measured upper bound is small. ZIP task-source candidate (§06e9.3)
passes safety checks but gives no useful save improvement and worsens GS resume;
restore its three source/test files exactly toHEAD, keeping the experiment
privately. Do not keep its candidate-only tests as product complexity.

Visual meta-audit invalidates the old phone navigation timing credit: final-v1
Ki-84 Drawing PNGs0/2 are black during transparent compositor preparation.
Busy=false plus2RAF is not actual current-size presentation acceptance. Keep PC
file/body timings separately; no PC save improvement is established. Re-measure
both artifacts with the same post-edit backup, actual model pixels, current
buffer extent and selected pin, masking DOM overlays. Use the existing model
readiness ceiling; no fixed sleep, camera adjustment or relaxed assertion.
Run three fully closed observations per input/artifact without extra large output
roundtrips; preserve hidden-resource reconstruction and saved-body checks.

Final2 fixed-input PC workflows pass3 Ki-84 plus3 GS cases, with all file/body/
identity/history/asset checks and no remote/page errors. Median seconds below;
raw three observations remain in private `final2-after-comparison.json`. Phone
busy/2RAF values in that artifact are explicitly unqualified; use actual pixels.
These small PC differences are observations, not an attributed optimization.

| PC action | Ki-84 before→final2 | 500k SH4 before→final2 |
|---|---:|---:|
| Initial backup restoration→records | 58.999→59.872 | 112.375→108.751 |
| Apply one body edit | 6.071→6.327 | 2.455→2.434 |
| Output→actual file obtained | 18.412→18.948 | 28.896→29.571 |
| Fully closed resume→visible saved body | 5.393→5.417 | 6.298→6.718 |
| Fully closed resume→3D ready | 15.609→15.862 | 18.300→18.815 |

A private orchestration call selected Windows PowerShell5 and treated a normal
native stderr warning as an error before the first pixel case completed. Retain
that failed evidence, verify unchanged frozen source/artifact bytes and all6
passed primary cases, and resume remaining lanes under actual PowerShell7.6.9.
Do not rerun or relabel the passed checkpoint/primary measurements.

Actual-pixel phone preflight passes all4 cases, with3 fully closed observations
per input/artifact. Ki-84 before[6532,6482,7009]→after[354,368,332]ms; median
6532→354ms. GS before[10635,10624,10620]→after[160,141,155]ms; median10624→155ms.
Model pixels/current extent/selected pin, same canvas, no additional context/source/
splat load, and hidden-resource reconstruction all pass. This includes screenshot
observation overhead and is not a physical-device or general performance guarantee.
The separate pixel status qualifies only that lane; whole-workflow status stays
pending until Desktop/offline/installed cases actually complete.

Milestone audit: g0/61 remains the base; frozen6ecc product code and all write/
readback/recovery boundaries are unchanged. One writer, independent review and
real navigation/save workflows have closed. Continue the existing whole-regression
gate; no new helper or optimization workstream is needed before that result.

Final qualification completes on frozen6ecc source: Desktop52 PASS in86.9min,
offline8 PASS in11.3min, installed Edge/Chrome2 PASS in40.7s. No skip, unexpected
failure, flaky result or automatic retry. Offline covers fully closed browser/server
Mesh/Point/500k SH4/Proxy/media work, editing/output/cold resume, initial conversion,
updates, exact boot-resource repair and same-address return without Project changes.
The matched120s camera pair and20 resize/target retirement cycles preserve existing
1.30/64MiB criteria; functional and performance checks remain separate.
Final aggregate evidence re-verifies the four actual-pixel lanes without rerunning
them. All final source/test and artifact bytes match the reviewed/tested candidate.

Prepare only the verified13-file source/test/document checkpoint for g0. Preserve
251 original private draft lines locally while excluding them, originals and all
.artifacts from the index. GitHub Pages is workflow-based frommain; the intended
g0 push runs CI, not deployment. Git and the exact pushed CI run own identity/status;
keep the CI result with this checkpoint's local evidence and report it separately.
Do not repeat passed runtime checks for staging, commit or result prose alone.

Remaining critical path: baseline first restoration exposes records after~59s
(Ki-84)/112s(GS); normal cold saved-body viewing is~5.4/6.3s. These are distinct
operations. Independent mapping finds no discarded successful Session read in
body apply. Further large read reduction or showing text before first-restore
initialization requires an explicit contract design:06a currently excludes raw
archive candidates, and normal early-resume observers exclude first restore.
Do not invent a ready Session/Scene token or weaken publication/readback fences.
The independently reviewed [06g proposal](../docs/specs/06g-first-restore-caption-preview-proposal.md)
defines that next decision; it is unapproved/unimplemented and does not stop
the current final qualification. Only initial-Scene plain text would advance;
all editing, saving, write/readback, Selection and recovery acceptance remains.
Large-GS whole-flow case passes in22.0min, including all5 internal wire purposes,
return, Review copy, restoration and cold resume. Its single Review-copy command
endpoint is165.039s to editor and175.244s to3D; this is a remaining comfort issue,
not a three-run performance improvement. Independent read-only mapping finds no
high-impact read reusable under current authority: child and parent completion
receipts intervene between the apparently discarded reads. Parent retry→admission
sharing would expand06b's explicitly limited inspection lifetime; do not adopt
it as a UI cache or combine older stage timings with this run's endpoints.

Physical iOS/Safari memory, IME, saving and fully closed offline use remain pending.

## Previous checkpoint —complete one record, save and resume (2026-11-11)

PO authorized the grouped review repairs and restrained motion. Root is the only
writer; independent contract/UI/test mapping is read-only. Implement honest file
freshness, nonblocking unexecuted export preferences, consistent transient versus
retained windows and compact Drawing visibility, then explicit text+one selected
media completion through the existing serial commands. Keep partial success and
retry ownership visible; no automatic apply, new atomicity, durable queued Files,
grouped Undo, dependency/schema/ID change or weakened validation/recovery fence.
Also simplify filenames/unique verified bases and stale open-state copy within the
same file workflow. Motion is brief state feedback, with reduced-motion fallback.
Update08/UI design before code; focused state/product/service tests during edits,
then PC/touch existing connected save/restore tests, final independent review,
serial checkpoint/HEIC/Desktop/offline/installed-browser evidence. Preserve the
existing120s/1.30/64MiB frame guard. Only a genuine new contract/product authority
or unsafe data outcome stops the affected work. Suitable verified g0 checkpoints
may be committed/Pushed; no publication. Physical Safari acceptance remains pending.

Milestone audit: branch/HEAD remain g0/040a462, one writer, UI/file orchestration
only; storage/schema/renderer checks and old private changes are preserved.
Independent final contract/UI/file-operation reviews have no unresolved findings.
Focused ownership, partial-success/retry, disposal and hidden-gallery checks pass.
Final checkpoint passes typecheck, full root suite (3505 passed; the pre-existing
16 expected-fail/21 todo remain separate), all candidate builds and offline/HEIC
isolation. Frozen candidate and source/test fingerprints are recorded locally.
The first Desktop full execution passed51/52, offline8 and installed Edge/Chrome2
passed. Named-card image inspection corrected an unstable global img index while
retaining dimensions/hash/time conditions. That exposed a genuine focus-return
defect after phone background/foreground: released thumbnail cards had replaced
the modal's old opener. Keep resource release, resolve only the same live scope/
attachment/resource button, and reject stale/disposed owners. Update UI design,
focused lifecycle/browser checks and independent review before final-v2 source
qualification. Preserve all failed evidence; no new policy or authority needed.
The native image workflow now passes unchanged original-byte/dimension/focus
assertions after the opener fix; gallery/picker replacement and stale owner cases
pass38 focused media tests. Independent UI lifecycle review has no findings.
Final-v2 checkpoint passes all156 files/3510 tests (16 existing expected-fail and
21 todo remain separate), all builds and offline/HEIC isolation. Its exact source/
test and50 build-file fingerprints match the fixed focused candidate. The native
PC/phone image workflow and small PC/touch body+photo/save/restore/window flows
pass. Final file-exit/IME/partial-output choice retention also passes on the same
frozen source. Independent contract, UI lifecycle and file/test-delta reviews are clear.

Shared-host commit remained about97% and ordinary test/build operations slowed.
Only the owned full-validation process tree was stopped before the large-GS
cases; source/failed evidence and unrelated applications were preserved. This
is an interrupted run, not a current-source Desktop52/offline8/performance pass.
The older final-v1 Desktop51/52, offline8, installed2 and frame observations retain
their own source fingerprint. Do not relabel them as final-v2 or compare elapsed
times collected under these different host conditions.

Checkpoint scope: bounded verified UI development only; Git and its exact GitHub
run own commit/CI identity. Next: resume full Desktop/offline/installed-browser
and Ki-84/500k elapsed qualification
when host resources permit. Preserve the unchanged120s/1.30/64MiB conditions and
all write/readback/recovery checks. Physical iOS acceptance and release stay pending.

Post-checkpoint local evidence: source61c5f9a's exact CI completed successfully.
On the same fixed source/build, converted Ki-84 backup → one body edit → actual
external backup → all blob hashes/history/records → full-browser-close resume
passes, with unchanged input and no remote/page errors. The shared-load single
observation was apply35.836s, output handoff48.901s, cold readable body12.435s;
it is not a paired performance result. Full GS/offline/installed-browser and
matched-performance requalification remain pending; evidence is local under
`record-completion-20261111/ki84-current-ui-v1` and `ki84-functional-proof.json`.
The additional same-build Ki-84 photo check passes real JPEG decode,1:1 original
width, close/focus return and3D continuation; displayed506x390/61029-byte JPEG
SHA-256 also matches the existing independently derived source oracle. Retain
v1's incorrect region-locator and v2's browser-cache setup failures separately;
v3 uses the existing dedicated runner without assertion/deadline relaxation.
See local `ki84-photo-proof.json`; no broader qualification or source change.

## Completed review —third-party product evaluation (2026-11-11)

Completed read-only review of040a462 with3 independent AI reviews and fresh owned
Chromium profiles: converted Ki-84 backup and small sample on1440x900 PC; small
sample on390x844 touch and320x365 input. Confirmed selection/window inconsistency,
phone preview occlusion, file-freshness visibility, serial body/media entry,
unexecuted export-choice close guard and stale checking text at restore confirmation.
Ki-84 search/photo real decode/drawing and sample body edit/actual backup/normal
reopen were exercised. Source-only concerns and physical Safari/screen-reader
unknowns are separated in the current [design review](../docs/ui-design-review.md).
Existing source/checkpoint/performance evidence stays unchanged; product source,
contracts/dependencies, user profiles/data and release state were not modified.
Next: group normal-flow status/exit/selection fixes, then measure one note+photo
through apply/save/reopen; retain all durability fences. This review does not
authorize implementation of a new policy or turn untested device acceptance into PASS.

## Previous verified boundary —frame CPU cleanup; resume waits remain (2026-11-11)

Completed bounded frame notification cleanup againstabd59b7. Only GS sort/draw
invalidation during an active gesture uses the existing presentation path;
ready/progress/error/end notifications, pick generations and fallback remain.
Known-invalid capture attempts are skipped. No storage/package/model/profile/
ID/dependency change or persistent cache/authority extension remains.

The same-read Backup state/open/step candidate passed safety flows but did not
improve elapsed waits, so both product files and its test changes were restored
exactly to the baseline. Rejected source fingerprints and all observations stay
private; no output-read exception is adopted. Preserve private165todo/86design
lines, originals and the earlier performance failure evidence.

Independent source/contract/frame/evidence reviews have no findings. Final serial
checkpoint, HEIC isolation, Desktop52, offline8 and Edge/Chrome2 pass; final
source/test and frozen artifacts are fixed as recorded below. The unchanged
120s/1.30/64MiB frame criterion passes. This is a suitable g0 development
checkpoint; Git owns commit/Push/exactCI identity. No release/adoption or physical
iPhone/Safari/weak-PC qualification is implied.

Next outcome: reduce time to usable3D/editing by evaluating overlap of owned
model preparation with the existing readonly history inquiry. First specify
staged ownership/handoff/abort/drain and review; retain every current Host,
selection, write/readback/publication/recovery fence and existing memory budget.
Do not reconnect withdrawn candidates or infer a new inspection lifetime.
Ki-84 resume/save, large-GS copy and the small-save target remain measured gaps.
No fine PO testing waits; ask only for a genuine new policy/architecture authority.

## Measurement record —frame CPU and resume inquiry (2026-11-11)

Final candidate-v2 has4 source/test files, fingerprint
`da1b2358f55f3019bc2afb35de5040e3debe45dfe52c0c1b285058c10fbbd017`.
The frozen baseline is actualabd59b7 (its retained commit proof binds the earlier
dirty-build manifest to the committed source). No output/metadata/package code
change remains. Diagnostic-only30s profiles show the full UI observation callback
at projectWorkspace:503 taking12.823s→0.008s (inclusive sampling);
no repeated capture exception is sampled in the final trace. Native driver/FBO
waiting remains; the two per-pass framebuffer checks concern different targets,
not a duplicated same-target check. Sampling is not process CPU or120s acceptance.

Final Ki-84 B,C,C,B,B,C, fresh profiles, retries0, timings-only, all6 save/reopen/
103-Caption/43-asset/hash/identity/history checks PASS. Same converted Backup and
original input hash are retained. Values below are ms, each3 runs then median;
browser launch/navigation/search/select are included in cold visible body.
OS file-picker wait is excluded. Initial restore and normal cold reopen differ.

| Endpoint | Before3 | Final3 | Median before→after |
|---|---|---|---|
| Visible saved body |11800 /6665 /6830|12043 /7145 /7181|6830→7181|
| Editable |28705 /18166 /19585|31270 /20244 /20548|19585→20548|
| 3D ready |29147 /18699 /20021|32191 /20695 /20966|20021→20966|
| Body apply |18082 /8940 /8474|24820 /8779 /10513|8940→10513|
| Download handoff |42387 /21912 /29863|39002 /25935 /29673|29863→29673|
| Actual file acquired |43860 /23272 /32663|40318 /27360 /31046|32663→31046|

Final cold overview median2.772s→2.997s, generation4.821s→5.166s, independent
Host read1.072s→1.383s, model load6.486s→6.444s. These nested medians must not
be summed. Do not claim a Ki-84 resume/save speedup from the frame-only change;
the wide variations and actual remaining waits stay visible. V1's rejected
Backup-only observations are separate, not final-source performance credit.
No hash/write/readback/publication/recovery inspection was removed.

Next user-flow candidate: overlap owned offscreen resident preparation with the
existing readonly output inquiry, then adopt only after every current Host fence.
Simply moving projectView earlier is ineffective: actual binary preparation starts
in Browser after Host return. Reuse staged-render ownership/retirement, specify
handoff/abort/drain first and independently review; no early Host/edit/save, extra
memory budget or persistent cache is accepted by this note.

Final serial checkpoint1271.372s PASS: typecheck,156 files/3497PASS,
16 expected-fail and21todo retained, all5 builds and offline isolation. HEIC
isolation PASS. Frozen final Desktop30files/40,472,664bytes equals the measured
Desktop bytes. Offline20files/27,493,619bytes was built independently at the same
fixed source. Source fingerprint/install stay unchanged; all50 frozen files are
verified. The Desktop timing cohort did not measure offline boot-resource checks.
The separately executed final browser outcomes follow; build success alone
is not their qualification.

During the final full Desktop lane, the connected500k SH4 all-five-purpose/
return/Review-copy/restore/cold case PASS(26.5min), including original preservation.
Its unmatched single observation is187.063s to copy editor and199.835s to3D;
these are remaining waits, not a paired speedup or a new capacity/latency promise.
The separate partial-loading Caption/ready-Point/save invariant also PASS.
The final phone viewport-shrink/record-list/body/completion case PASS, with an
unmatched small whole-output handoff11.426s (previous-output availability7ms).
Retain the10s small-save development-target miss; do not infer a timing guarantee
or physical Safari acceptance from this functional pass.

Milestone audit: same g0/abd59b7 and final4-file source; no scope/dependency/
contract expansion. The exact500k SH4 matched120s camera/20-resize case31 now
PASS(6.1min), including unchanged<=1.30 interval ratio, actual rendering/GPU/sort
checks, stable target counts and<64MiB budget. Retain the prior Q ratio failure;
no unchanged rerun or filter was used to obtain this result.

Full Desktop52PASS,0retry/0flaky/0skip/global errors[],7783.978s. All50 frozen
files, measured Desktop/source fingerprint and installed toolchain still match.
Actual passed-case31 results against fixed5e5bb9e with approved shared tools:
120s each,1792×1008,DPR1; frame interval p95=18.2→6.2ms, ratio0.340659<=1.30;
draw callback p95=7.0→4.1ms; all instrumented RAF p95=7.0→4.1ms;
GPU query p95=0.596352→0.676736ms(+13.5% against the historical comparator);
sort RPC p95=14.0→9.9ms. RPC includes
scheduling/dispatch, RAF intervals are scheduling proxies and callback times
are not whole-process CPU. Actual draws/500k instances and GPU validity checks
PASS; all20 target-resize cycles PASS with stable counts and max67,099,032bytes
(<64MiB),27 textures/7 FBO stable. Both traces use NVIDIA RTX5080 via D3D11
and dedicated Chromium. Do not turn this scope into a weaker-PC/iOS/FPS guarantee
or claim reduced GPU cost; the comparator predates the additional compositor.
Offline8PASS(788.057s) and installed Edge/Chrome2PASS(50.424s), each0retry/
0flaky/0skip/global errors[]. Full-close/server-stop offline continuation includes
Mesh/Point/500k SH4/Proxy/media, update/repair and exact history. Frozen50 files,
source4 and installed tools still match after every lane. The earlier ratio1.315
failure stays retained separately. No physical iOS, weak-PC or release credit.
Git owns the qualified checkpoint/Push/CI identity; final local verdict and exact
CI response are retained with the private frame/resume execution evidence.

## Verification record —earlier readable saved body (2026-11-11)

Completed opening-read text now reaches the existing readonly reader after a
fresh selection check and before the later independent Host read. Keep only owned
frozen strings; no Session/source/provider authority is reused. Host/catalog timing
purpose is explicit, first-backup recovery remains excluded and the old-generation
fallback stays. Optional observer/formatting failures do not alter Host authority;
selection-check failure still rejects. Independent contract/source review has no
findings. Existing typed commands, writes, all content checks and recovery remain.

Executed focused service tests10PASS; typecheck passes. The extended real Backup
PC/touch input workflow holds fresh native reads after opening, checks saved body/
search and absent edit/save controls, releases actual I/O during composition and
checks Host completion before IME handoff. Touch320px passed input-v5; PC passed
input-v6, including selection before the final user selection. Source-context
cleanup and the existing90s first-backup setup budget are used; ordinary UI15s and
whole-case180s are unchanged. Actual PC setup12.913s is recorded, not a new SLA.
All initial typecheck/config/fault-injection/setup failures are retained privately
in failure-history.md; these focused passes are not the final full Desktop result.
Independent rendered UI review found no additional issue in the PC/touch images.

Matched Ki-84 B,C,C,B,B,C, all6PASS, retries0, fresh independent profiles, frozen
Desktop artifacts, Chromium1280×720/DPR1 and timings-only instrumentation. Input
is the same converted51,270,879-byte Backup, not the raw original ZIP. Cold direct
reopening fully closes the browser first. Actual body time includes launch,
navigation, title search and target selection, ending at exact visible saved body
before waiting for editing. No OS picker wait or extra CPU/native/heap probe.

| Observed endpoint | Baseline trials (s) | Candidate trials (s) | Median before→after (s) |
|---|---|---|---|
| First readable saved body |6.886 /12.175 /12.120|11.107 /10.192 /12.014|12.120→11.107|
| First list/title |6.789 /12.076 /11.967|10.739 /9.788 /11.602|11.967→10.739|
| Editing available |17.078 /28.952 /28.398|33.512 /26.900 /25.722|28.398→26.900|
| Body apply acknowledgement |12.317 /17.409 /14.094|11.451 /18.066 /14.155|14.094→14.155|
| Save action→download event |18.555 /33.021 /42.963|33.354 /37.951 /32.470|33.021→33.354|
| Save action→actual file acquired |19.500 /34.259 /44.141|34.777 /39.448 /33.526|34.259→34.777|

Body median improves1.013s (8.36%) in this cohort; large variation, including the
faster first baseline, is retained without correction/discard. This is a modest
direct-resume result, not a general speed guarantee or top/catalog improvement.
Body mean10.394→11.104s does not improve; consistent speedup is not established.
Editing/save are not optimized here; their remaining waits stay open. Initial
restore normal-editor list median109.157→107.599s is setup context, not an adoption
claim or a measurement of first-backup's earlier readonly display.
Later normal records/body/3D endpoints are sequential observation barriers, not
independently observed earliest event timestamps. Prior06f6.609s was first title/
list, not actual readable body. Raw old numbers are unchanged.

All6 journeys compare exact103 Caption records except the one intended body edit,
identity, original history plus exactly one change, all43 asset sizes/fullSHA-256,
downloaded Backup inspection and cold saved body. Original input hash unchanged;
all pageerror/remote arrays empty. First checkpoint-v1 passed151 files but failed
5 native fixture-script files (62 cases,4 cascading errors): sandbox hard-link/
junction creation is denied with EPERM before their intended assertions. A small
owned preflight reproduces that denial and succeeds under authorized native
execution. Checkpoint-v2 passes with identical source/tests/deadlines and the
required native permissions:156 files,3496PASS,16 expected-fail and21todo retained;
typecheck, all five builds and offline isolation pass. HEIC isolation passes.
No case is skipped or weakened to address the initial permission failure.

Full Desktop executes all52 cases:51PASS,1FAIL,0retry/flaky/skipped/global errors.
The current PC/touch resume cases both pass. Case31's matched120s camera P95 is
baseline18.4ms/candidate24.2ms, ratio1.315217 above unchanged1.30. Both modes reach
frame/sort/GPU-query checks; candidate reaches all20 target/resource cycles.
The final errors-array assertion follows the failed ratio and did not execute;
its retained raw array was independently inspected and is empty. This does not
turn the case or the whole Desktop run into PASS. Keep the failed run; no threshold
relaxation, unchanged retry or environment-cause claim. Renderer code is unchanged
and this fresh-creation case excludes the new direct-resume notification.

Independent raw-trace review finds the same baseline bytes/toolchain/inputs as
the earlier passing comparison. Three of four candidate30s windows are similarly
slow, so no startup portion is discarded. Measured RAF callback work without
WebGL draws totals49.139s/120s; the earlier passing run already had49.731s. This is
instrumented callback time, not process CPU, and does not identify an owner or
prove new-reader overhead. GPU p95 changes little; investigate callback stacks
and demonstrated redundant work before changing code. Preserve the original120s
and1.30 requirement for the next substantive change.

Short meta-audit: close this data-only reading unit, keeping its independent Host
read and source fingerprint. [03§7](../docs/specs/03-gates-and-delivery.md) says this
render-performance failure does not block the MVP; [01g](../docs/specs/01g-desktop-smooth-display-proposal.md)
and the existing g0 authority permit a bounded development checkpoint after the
remaining checks/review. No full Desktop/01g qualification or release credit is
granted. Offline8 and installed Edge/Chrome2 pass, with no retry, skipped/flaky
case or global error. Root/frozen files match before offline's intentional new
build UUIDs; afterward the50 frozen files, all6 source/test hashes and installation
still match. The measured Desktop bytes match the final Desktop bytes exactly.
Source/test fingerprint:6fa25e2e0c3155a14dc7c8e40c1af059633cc1b9a10e69179c9305f99872d8ee.
The local4191 development preview serves all20 exact frozen root-offline files;
only the identified previous owned preview was replaced, with no Project storage
or user browser operation and no forced Worker activation. Public-doc filtering,
staging and exact-commit CI are the final delivery checks; Git records their commit.

Remaining comfort debt: Ki-84 body apply14.155s, editing readiness26.900s and actual
file acquisition34.777s medians in this cohort. First-generation preparation and
output overview cost7.925s and3.483s medians in the candidate cold phase; these are
nested stage observations, not additive independent totals. During the separate
full regression,500k SH4 Review-copy editor/display took199.846/211.579s once; this
is unmatched diagnostic context, not a new speedup/regression or capacity claim.
The01g failure/cause remains open. Physical Safari IME/storage/memory/offline is
unverified. Evidence stays private under
`.artifacts/e2e/resume-reading-20261111/`; source/test fingerprint and final frozen
HTTP artifact must match before delivery. Do not distribute originals/audits.

## Verification record —06f (2026-11-10–11)

PO explicitly approves [06f](../docs/specs/06f-opfs-parent-lookup-proposal.md).
Baseline12a5f78; preserve private drafts, original quality, all fresh file/content
and full write/readback/publication/recovery/Selection fences. Root sole writer,
read-only independent reviews. Implement one private parent hint in OpfsFS four
readonly methods, bounded to one handle and invalidated on native mutations with
pending-read ownership checked. Keep writes/list/exists/exclusive cleanup on
old lookup. resolve checks locator/path only, never existence or ABA; every
file handle/File remains fresh and content errors never trigger re-open.

Executed plan: implement/test owner/concurrency/freshness/missing/permission/unsupported
and mutation isolation in existing OPFS suite; native isolated observations
already retained, add integration on the implemented path. Freeze, compare both
fixed Ki-84 and500k SH4 with matched3+3 profiles, no retry/tolerance change.
Only adopt after elapsed benefit+safety; meaningful diff review and required
checkpoint/HEIC/fullPC+touch/offline/installed-browser checks serially, then
verified g0 checkpoint/push/exact CI. No new API/dependency/cache framework,
schema/ID/route, numeric guarantee or release. Physical Safari stays pending.
Keep the rejected06e§10 source/tests and all measurements private, never
restore its rejected per-receipt audit grouping into this next candidate.

Implementation is limited to OpfsFS plus its existing tests. Root files and
unsupported API use original lookup; path/root mismatches discard the hint;
mutations invalidate pending-read publication. Optional resolve NotSupported
falls back once to the original implementation, while file-handle/content
failures remain refusals. Independent source review and focused follow-ups find
no remaining issue. V1 review caught a hint-discard lifetime mismatch: stop its
partial measurement, retain baseline0PASS/candidate0 interruption, and fix it
with2 regressions. No elapsed claim/retry is made from that incomplete cohort.
The sandboxed broad process query was unavailable; the narrower known-worker
check confirms the interrupted owned worker exited; no other process is stopped.

V2: OPFS71PASS, prior connected4files240PASS, typecheckPASS, Desktop buildPASS.
The implemented source in a separate private Native build matches fresh lookup
in8 actual Chromium156 states including ancestor replacement without an
intermediate missing read and parent becoming a file. One browser testPASS;
no source-only/mock/device claim. Candidate source/test fingerprint
adb8e97d9145c9dbe22d6e810f726cc88d93c3d259b8217384cbf5ecc076d7da.
Same-input primary Ki-84/SH4 comparisons each complete3+3 in ABBAAB order with
no retries, no Native/CPU/heap/trace probe and unchanged source/test fingerprint.
All12 external-file and cold-resume journeys pass original input SHA, all asset
hashes/lengths, all records except one body, all original changes plus exactly1,
Project identity and error/remote-request emptiness. No schema/ID or image/SH4
coefficient changes. Seconds, all3 trials and medians:

| Input / endpoint | Baseline3 | Parent hint3 | Median before→after |
|---|---|---|---|
| Ki-84 initial restore edit-ready |64.834/68.435/67.475|61.248/60.940/61.746|67.475→61.248|
| Ki-84 body apply |7.658/7.642/7.464|6.617/6.530/6.548|7.642→6.548|
| Ki-84 download event |20.290/19.713/20.048|18.976/18.117/18.752|20.048→18.752|
| Ki-84 actual file |21.245/20.674/21.501|19.963/19.120/19.766|21.245→19.766|
| Ki-84 cold readonly list/title |6.312/7.023/6.447|6.866/6.609/6.289|6.447→6.609|
| Ki-84 cold edit-ready |16.423/16.744/16.432|16.138/16.253/16.320|16.432→16.253|
| Ki-84 cold3D |16.780/17.178/16.829|16.567/16.636/16.710|16.829→16.636|
| SH4 initial restore edit-ready |112.511/112.441/125.373|110.325/110.793/113.353|112.511→110.793|
| SH4 body apply |2.975/2.955/3.519|2.963/2.450/2.481|2.975→2.481|
| SH4 download event |27.242/27.332/30.534|25.495/25.723/26.473|27.332→25.723|
| SH4 actual file |29.713/29.678/33.353|29.680/28.027/28.902|29.713→28.902|
| SH4 cold readonly list/title |6.687/8.122/7.286|6.684/6.647/6.237|7.286→6.647|
| SH4 cold edit-ready |17.179/18.618/17.865|16.668/16.674/16.345|17.865→16.668|
| SH4 cold3D |19.285/21.195/19.916|19.235/19.274/18.939|19.916→19.235|

Measurements start at body apply/save generation confirmation and include full
browser launch for cold endpoints; OS picker wait is excluded. Bounded elapsed
benefit is established for body/save, with Ki-84 cold text not improved and
edit-ready largely unchanged. Do not infer a general-PC/phone speed guarantee
or normalize results for host load. Existing100ms/1s/10s development targets
remain unmet in these large workflows. Final qualification completed serially
as recorded below. Private evidence: `.artifacts/e2e/opfs-parent-20261110/`.
No general-PC/device/release acceptance is inferred.

Initial checkpoint on the Opfs-only source: PASS typecheck, root155files with3482PASS,
16 existing expected-fail and21 existing TODO (not feature/adoption credit),
all five builds and offline isolation; root suite1079.12s, checkpoint1155.40s.
HEIC isolationPASS. Final immutable Desktop30/offline20 files retain the same
adb8 source/test fingerprint. The complete Desktop run then exposed the
comparison-preparation issue below; the final repaired tree/checks follow it.

Final Desktop case31 stopped before rendering: the smooth comparison preparer
requires its historical5e5bb9e full lock to equal today's lock, while approved
2f98fe9 changed Vite/Vitest development tooling. Runtime dependency roots and
all29 non-dev lock records remain identical. Preserve this failure and let the
other cases finish against unchanged source; do not lower the120s/1.30 camera
criterion or substitute an old prebuilt artifact. Test-only repair criteria: retain
the fixed product source and runtime dependency closure, explicitly pin the
approved shared toolchain, use a distinct immutable artifact/stamp, and verify
the changed comparison independently. No dependency install or product change.
Stop this repair if runtime equality or the approved toolchain identity fails.

Initial Desktop run:51PASS/1pre-render preparation failure, no skip/flaky,
5105.45s. Changed only the comparison preparer, its existing case and9 focused
guard cases (9PASS); independent read-only review has no findings. Both the
historical full lock and explicitly approved2f lock require identical runtime
roots/full closure; unknown tools, direct/transitive/integrity/flag drift refuse.
Every comparison gets a fresh private build and success-only manifest; no cache
reuse, dependency install or old artifact overwrite.120s/1.30/dimensions/GPU
and lifecycle assertions remain unchanged; result labels name shared tooling.
Qualify the fixed case separately and the final source/test checkpoint; retain
the51 unchanged passes only after proving exact app build bytes and unchanged
remaining test sources, followed by dedicated offline8 and installed Edge/Chrome2.
Do not rerun the unchanged51-case journeys or unchanged-byte HEIC merely for a
new record. V1 logs/failure remain separate from the repaired result.

Repaired comparison1PASS,378.65s. Both120s/1792×1008 traces, validGPU samples,
20resize cycles, existing1.30/64MiB/counter criteria pass. Independent review
confirms fixed source,29runtime records, identical installed Node24.22.1/Vite6.4.6
and installation metadata; the51 unchanged passes can be retained. This RTX5080
test does not establish ordinary-PC/iOS performance or attribute renderer changes
to06f. Before completing checkpoint-v2, removed the root guard unit's unnecessary
historical-Git dependency; actual fixed-history equality is already exercised
by the passed browser preparer. Interrupted and retained the partial checkpoint,
verified no newly started node worker remained, and replaced only that unit with
missing/extra-runtime rejection. The interrupted suite is not PASS; the unchanged
browser comparison was retained, not rerun.

Final qualification: typecheckPASS;156root files,3491PASS/16existing expected-fail/
21existingTODO (not feature credit); root1108.15s; full checkpoint1176.69s, all
five builds and offline isolationPASS. Final9guard casesPASS without historical
Git dependence. Source/test/preparer5-file fingerprint:
e2c1849222d0531568b57632d87c04a07c13285e601612d5b6604d4486191a2e.
Desktop coverage is51 unchanged passes from the complete run plus the repaired
comparison1PASS, not a rewritten52PASS initial report. Independent review and
hash checks confirm unchanged other definitions/helpers, original Opfs code/test
hashes, and all30Desktop/20frozen-offline files. Live Node/Vite/installed-lock
identity also matches the captured candidate and comparison installation.

Dedicated offline8PASS730.40s: root/subpath cold repair, two-window repair/update,
Mesh/Point/500k SH4/Proxy/media edit/save/full-close resume, conversion, safe
removal, storage failure and foreign-worker refusal. Installed Edge/Chrome2PASS
52.75s use independent profiles and the frozen root offline build. Full-close
offline evidence comes from the dedicated suite, not a dev server. Each freshly
rebuilt root offline has its own random build UUID; its static isolation and
inventory are recorded separately, never passed off as frozen-byte identity.
HEIC isolation v1 remains valid on unchanged app source/bytes. All final frozen
inventories/source/install checksPASS; no retry/deadline/assertion relaxation.

Preview at http://127.0.0.1:4191/ now serves the qualified frozen candidate;
all20HTTP bodies match. The owned server was replaced only after exact process,
listener, executable, start-time and old served-byte checks. An initial guard
refusal exposed JSON date conversion losing fractional seconds; exact ticks
were retained with a direct typed conversion, without weakening the guard.
Project storage/forced SW activation were not changed. Normal update prompts
may still need accepting in an existing browser. The synthetic sample remains
`.artifacts/samples/comfort-20261110.zip`; originals and audit material stay local.

Remaining: Ki-84 early list/title6.447→6.609s did not improve; earliest readable
body was not measured by that endpoint. Large output is still
about20–30s and cold editable readiness about16s on this PC. The next readonly
display candidate is described at the current boundary. Physical Safari memory,
IME/save/heat/offline acceptance and ordinary-PC guarantees remain unverified.
Git owns the suitable g0 checkpoint and its actual CI check; private qualification
records preserve the complete failed/interrupted/completed attempts.

## Previous boundary —receipt evaluation closed (2026-11-10)

PO2026-11-10 approves [06e §10](../docs/specs/06e-selected-generation-output-read-proposal.md#10-管理記録1件の読取を独立した単位にする).
Baseline12a5f78 retains the same qualified product source asb211347. Root writes;
independent reviewers remain read-only. Outcome: shorten body edit→checked file
save→cold resume with one existing readonly callback around one receipt read.
Keep fresh size/open and separate bytes, canonical/length/content checks, distinct
prewrite and postwrite phases, write/publication/recovery/download fences, original
quality and offline use. No dependency, format, UI route or policy expansion.

Plan: record approval before code; add focused opening/closing, raw/staging/nested,
concurrent, torn/write/readback/owner/readonly regressions to the existing suite;
implement centrally without adding a new capability/cache framework. Compare the
same Ki-84 and500k SH4 with independent profiles3+3, unchanged primary timings
and no new tolerance/retry. If beneficial and safe, freeze final diff, review,
run checkpoint/HEIC plus complete Desktop/touch/offline and installed-browser
representatives serially, then qualified g0 checkpoint/push/exact CI. Stop only
new contract/authority conflicts; reject ineffective candidates. Preserve private
drafts and prior failure evidence. Physical Safari acceptance remains pending.

Implementation: only `persistence.readReceipt` wraps the unchanged size-open,
fresh bytes, length and decode in existing `withMetadataRead`, without a staging
consumer or new registry. Existing outer/write/readback logic is unchanged.
Independent security/contract/final source review: no findings. Existing fixture
tests cover normal original/create/restored, nested/concurrent/readonly access,
closing retirement/dispose, invalid content, independent write phases, held
pre-read closing with no write and held post-read closing with no success.
Focused3files192PASS; typecheck and Desktop buildPASS. First test invocation
ran zero tests because managed C TEMP rename was denied; retain that log, switch
only task TEMP/TMP to its writable G directory, then execute the real checks.
Freeze candidatefaadd44df5a6681b216ca7cb0cb4d0916c0bb5a39aa3da4f3ce5c3d1627d428a;
new primary3+3 Ki-84/SH4 cohorts are complete below. Final candidate qualification
was not started because the elapsed gate failed.
Private evidence is `.artifacts/e2e/receipt-phase-20261110/`; prior failure and
rejected-candidate directories remain intact. Preview remains qualified baseline.

### Outcome and next boundary

**Not adopted.** Same input/history/browser conditions, one worker, no retries,
no extra CPU/native/heap/trace probe, new3+3 profiles in ABBAAB order per dataset.
No tolerance change or timing normalization. All12 primary flows complete actual
external files and full browser close/reopen, retaining every original change
with exactly1 new body edit, all records except that body, Project identity and
all blob hashes/lengths. Ki-84 has103 records/43 assets; SH4 has1/3, with all
500k SH4 coefficients and Proxy/image originals retained. The original fixed
Ki-84 backup SHA is c714c6cd04f99ac7aa0b84e9e2ca82a0147bbbc0eeb029be475d94e68ccf501c;
the178,012,280B SH4 input SHA is214dbbbdab3525f37d507b47bce136bf9a4e250b229267943cd7b8b2d028da0c.
No page errors/remote requests. Seconds, all3 trials and medians:

| Input / endpoint | Baseline3 | Receipt candidate3 | Median before→after |
|---|---|---|---|
| Ki-84 body apply |10.440/7.513/7.733|9.059/8.750/8.418|7.733→8.750|
| Ki-84 download event |22.100/19.812/20.085|26.745/25.033/21.397|20.085→25.033|
| Ki-84 actual file |23.002/21.009/21.004|28.335/26.047/22.440|21.009→26.047|
| Ki-84 cold text |6.403/7.443/7.990|8.218/6.612/6.683|7.443→6.683|
| Ki-84 cold edit-ready |17.058/17.631/18.190|18.578/17.910/16.594|17.631→17.910|
| Ki-84 cold3D |17.641/18.022/18.578|18.958/18.289/17.002|18.022→18.289|
| SH4 body apply |3.491/2.976/2.965|2.981/3.546/2.984|2.976→2.984|
| SH4 download event |31.262/28.539/27.522|28.855/29.657/27.262|28.539→28.855|
| SH4 actual file |33.725/30.908/29.863|31.905/32.801/29.587|30.908→31.905|
| SH4 cold text |6.738/7.288/6.606|8.495/7.296/7.193|6.738→7.296|
| SH4 cold edit-ready |17.295/18.808/17.115|20.501/18.876/17.728|17.295→18.876|
| SH4 cold3D |19.829/21.365/19.650|23.160/22.079/19.745|19.829→22.079|

Save endpoints start at generation confirmation; cold includes full browser
launch. OS picker time is excluded. Do not infer causality from these medians.
The completed first-pair diagnostic snapshots show apply control lists97→87,
output220→210, cold71→71. Reducing only this receipt unit removes a small part
of total control audits; call counts alone do not satisfy the elapsed gate.
An independent baseline audit finds source/build configs unchanged095f→12a,
both package/lock/fixture manifest hashes equal2f/HEAD,17 installed direct versions
matching lock and fixed facts matching both drivers. No baseline defect or
justification to repeat the same cohort until a favorable median is found.

Candidate source/tests are retained privately then restored byte-for-byte to
HEAD; Desktop30 files are restored to qualified baseline too. Dependencies and
preview are unchanged. No new full checkpoint/Desktop52/offline8/installed2/
physical-iOS acceptance is claimed. This final tree is documentation-only;
check public diff/links/private exclusion, independently review, then suitable
g0 checkpoint/push and exact-head CI. Do not rerun unchanged runtime suites only
to stage or commit. Existing physical Safari acceptance remains pending.

Meta-audit: the receipt exception failed its practical gate; do not keep a
parallel read mode or continue tiny wrapper variants. Next investigate the
dominant native parent-path lookup, retaining all fresh file/byte/metadata
audits. The isolated native probe (one test, five compared states) confirms
Windows Chromium156 uses current bytes after same-name parent/ancestor rebuild;
resolve still returns the same path while deleted, so it is NOT freshness proof.
Directory move is unavailable/unverified. Its first URL typo failed before any
native operation; fixed script writes to a separate retained output and passes.
No original/user browser storage is used and this is not performance evidence.

[06f](../docs/specs/06f-opfs-parent-lookup-proposal.md) is the concrete next
proposal: keep just one parent-location hint inside OpfsFS readonly methods,
while every getFileHandle/getFile and full integrity/fence remains fresh.
Write/list/exclusive cleanup keep original lookup. Directory-handle lifetime
would span multiple read calls, beyond the previously bounded low-level path,
so its implementation was stopped pending independent review and PO decision;
PO subsequently approves it in the current boundary above.
No new cache/port framework, feature, dependency, file format or release is
authorized. Native observations do not grant whole-browser/device acceptance.

## Previous boundary —ordinary I/O evaluation closed (2026-11-10)

PO authorizes end-to-end latency improvement through implementation and automated
verification, without small confirmation waits. Baselineb211347, same product
source as2f98fe9. Preserve private drafts, originals/full quality, Native SHA,
Session commands, complete write/readback/publication/recovery fences and the
qualified preview. No new dependencies, formats, input policies or release.
Root is the sole writer; bounded cause/contract/final reviewers are read-only.

Plan: use existing per-stage/per-file browser evidence to choose the actual
edit→save→cold-resume bottleneck; inspect its code/tests and already rejected
trials before adding another experiment. Measure native stream writes/close,
receipt persistence and readback separately where current evidence cannot decide.
Implement a small reversible internal fix under the current contracts, then
verify the same original reproduction and adjacent corruption/cancellation/
write failure/recovery paths. Compare a fixed Ki-84 input in fresh matched trials;
include500k SH4 when the changed path handles large binary bodies. Keep diagnostics
separate from primary elapsed endpoints. Require independent final review,
appropriate complete Desktop/touch/offline/checkpoint/HEIC qualification and
exact-head CI before a suitable g0 checkpoint. Stop only the affected genuine
contract/authority/product-policy change. Do not weaken tests, repeat until PASS,
skip full checks or revive rejected SHA/proof-cache trials. Current state:
both ordinary candidates are NOT ADOPTED; source/tests/dependencies and the
qualified Desktop artifact are restored to baseline. No product speedup is claimed.
The exact next receipt-read exception is proposed below, not implemented.

Closing cause audit: native write/close is a small part of current save latency;
root-control path traversal and repeated fresh reads dominate native call counts.
These overlapping native totals are not elapsed acceptance. Direct-directory seek
and duplicate-SHA proof reuse already failed earlier practical gates and are not
revived. Under [06e §9.1](../docs/specs/06e-selected-generation-output-read-proposal.md#91-同じfreshな管理情報と出力streamの内部整理2026-11-10),
evaluate same-fresh-native-control byte materialization plus removal of an internal
identity stream and empty flush await. Exact-view descriptors keep custom/lazy
guards on the unchanged stream path; no earlier inventory view or proof is reused.
Independent contract review confirms ordinary internal scope, requiring descriptor
checks before/after copy. Existing corruption/cleanup cases remain unchanged.
Candidate implementation review has no findings. Existing package/OPFS/import
checks124PASS; Native/root-control/guarded-view tests plus imports40PASS; targeted
existing recovery/readback/generation checks45PASS (757 intentionally unselected
by the editing filter, not final-suite acceptance). Typecheck passes after fixing
a test-only Blob subclass return signature; retain its first failed check. Freeze
source/test candidate26f071cef9b25f76cf4c99cba6dfca6490f05908dc3b7559555b216fc7548f2c
and compare the same Ki-84 and500k SH4 in new uninstrumented3+3 cohorts before
adoption. The current user flow, not native call totals, decides the next action.
V1 Ki-84 completes6 safe flows but does not qualify: body apply13.510→19.664s,
actual file37.143→45.392s, cold edit29.374→38.555s medians. Observed host CPU63%
includes40.6% from other applications; load also varies later. Do not normalize,
attribute causation or count the last fast trial alone as a benefit. Preserve
all values; do not extend this failed candidate to SH4. Its source/tests and
Native read module are retained privately and removed from production. V2
isolates only the remaining small stream-chain cleanup, retaining the original
JSON stream reader and all fences. This was the last ordinary ablation, not a
new tolerance or an indefinite search for passing timing values.

### Completed ordinary evaluation and next decision

V2 has only the identity ZIP bridge removal and empty OPFS flush-await removal.
Existing package sink/cancel/backpressure tests2PASS, Desktop buildPASS; an
independent final review finds no ownership/abort/close/drain issue. The added
late sink-close refusal test also passes. Candidate source/test fingerprint:
497250d8f4171a7a8d36811d212248da610ec499d411396478325ca033bc398e.
All candidate code/tests are retained privately after non-adoption, not shipped.

Use the same existing Ki-84 converted backup,51,270,879 bytes, SHA-256
c714c6cd04f99ac7aa0b84e9e2ca82a0147bbbc0eeb029be475d94e68ccf501c.
This is the converted backup, not a new evaluation of the raw94MB LociMyu ZIP.
Each side has3 new dedicated-Chromium profiles,1280×720, one worker, no retries,
ABBAAB order; primary measurements have only timings=1, no native/CPU/heap/trace
probe. No original file or other application is changed. V2 values in seconds:

| User endpoint | Baseline3 trials | V2 candidate3 trials | Median before→after |
|---|---|---|---|
| Body applied |7.116 /7.608 /7.594|7.095 /7.541 /7.636|7.594→7.541|
| Save→download event |19.870 /20.110 /19.322|19.534 /19.059 /19.335|19.870→19.335|
| Save→actual external file |20.891 /21.059 /20.570|21.362 /20.037 /20.277|20.891→20.277|
| Cold readonly text |6.028 /6.394 /6.277|5.999 /6.289 /6.436|6.277→6.289|
| Cold edit-ready |15.485 /15.631 /16.345|16.343 /15.818 /15.885|15.631→15.885|
| Cold3D |15.782 /15.980 /16.742|16.733 /16.216 /16.260|15.980→16.260|

Save endpoints start at generation confirmation; cold endpoints include launching
the completely restarted browser. OS file-picker waiting is excluded.

V2 does not establish a useful whole-workflow benefit; do not count the small
output decrease as a completed comfort improvement. Stop before SH4 and broader
candidate qualification rather than add a tolerance or repeat until PASS.
V1 andV2 together complete12 primary browser journeys: all103 records equal
except the intended body, all43 model/media blobs retain SHA/length, original
history is retained with exactly1 new change, Project identity is preserved,
the external file passes complete inspection, and full browser restart reopens
the edited body/3D. Page errors and remote requests are empty. The2 separately
instrumented diagnostic journeys are PASS but are not primary timing evidence.

Private evidence: `.artifacts/e2e/comfort-io-20261110/` owns the immutable V1/V2
artifacts, raw reports/screenshots,3+3 comparisons, retained candidate sources,
failure history and exact qualified-artifact restoration. The qualified preview
remains http://127.0.0.1:4191/; no unqualified candidate is served to the PO.
No new Desktop52/offline8/installed-browser/physical-iOS acceptance is claimed.
The final source/test/dependency tree is byte-identical to baseline, so this is
a documentation-only checkpoint; validate diff/links/privacy and exact-head CI
without rerunning unchanged whole-workspace runtime checks merely to commit.

Next decision at closure: [06e §10](../docs/specs/06e-selected-generation-output-read-proposal.md#10-管理記録1件の読取を独立した単位にする)
proposes one ordinary `readReceipt` size-open/fresh-byte/decode phase using the
existing readonly ports. Each successful phase has full opening/closing audits;
separate prewrite and postwrite reads, actual write, Journal/publication,
saved-file inspection and recovery remain distinct. Include the already
registered original-generation creation scope, not staging or new registrations.
Detection of intermediate restore-control changes can move to closing; external
ABA remains explicitly unguaranteed. This changes the exact §4 audit contract,
and was PROPOSED and unimplemented at this closure. PO subsequently approves it
in the current boundary above. Independent design
review findings about target-receipt semantics, exception closing and readonly
permissions are resolved. Do not introduce a thin-selection guard/cache framework.
After approval, implement this single connected phase, prove fault/readback/
recovery safety, compare Ki-84/500k SH4, then run complete final PC/touch/offline/
checkpoint/HEIC qualification and review before adoption. Existing physical-iOS
IME/save/memory/heat/offline acceptance and general release remain pending.

## Previous boundary —SHA evaluation closed; Native retained (2026-11-10)

PO2026-11-10 approved [specification11](../docs/specs/11-streaming-sha256-evaluation-proposal.md):
evaluate fixed hash-wasm4.13.0 and conditionally connect only checkedBlobStream /
PackageArchive.inspect after demonstrated safety and practical benefit. The
connected unit is closed without adoption: keep both Native implementations.
Baseline2f98fe9, original quality, all write/readback/publication/recovery fences,
private drafts and the previously qualified preview are preserved. One writer;
bounded independent source, contract, UI and evidence reviewers are read-only.

Completed evaluation: reviewed package integrity, lock and all three notices
(one evaluation node;449 prior entries unchanged). Audit reported6 pre-existing
development findings, none for hash-wasm; this is not an overall security PASS.
The generic ESM V1 distribution keeps22 kernels in maps and is not adopted.
V2's SHA-only UMD distribution has the identical SHA binary, one bundled kernel
and all notices. V1's observed external load and all negative/failure logs remain
private evidence, not speed credit. No private source or audit material is pushed.

Both-caller V2 and Archive-only V3 complete their12 safe file workflows but fail
the SH4 ordinary-output gate:30.087→33.302s and31.528→33.731s respectively. The
last allowed combination, BlobStream-only V4, completes12 safe workflows. SH4
restore/output improves; Ki-84 does not establish a clear overall benefit and
its download-event median is worse. Independent evidence review agrees that
actual-file transfer alone cannot waive this. Overlapping ranges do not prove
WASM caused a regression, but also do not establish11 §4.6. Do not add a new
tolerance, GS-only choice, pooling/proof cache or repeated trials until PASS.

Final V4 matched comparison, seconds. Each side uses3 fresh dedicated Chromium
profiles, the same converted Ki-84 backup (51,270,879bytes;103Captions/43assets)
or edited500k full-SH4/Proxy backup (178,012,280bytes;1Caption/3assets), full input
SHA identity,1280×720/DPR1 and the same ABBAAB order. No retry, CPU/native/heap
probe or trace is active during these primary endpoints. OS file-picker wait is
excluded. Restored full controls are not the earlier read-only text endpoint.
Cold timing includes complete browser close/relaunch. These are local samples,
not new speed, capacity, memory or device guarantees.

| Input / endpoint | Native3 trials (s) | Blob-only3 trials (s) | Median (s) |
|---|---|---|---|
| Ki-84 preview | 4.628 / 4.613 / 4.100 | 5.040 / 4.638 / 4.659 | 4.613 → 4.659 |
| Ki-84 restore full controls | 67.871 / 66.381 / 63.462 | 66.508 / 67.270 / 62.438 | 66.381 → 66.508 |
| Ki-84 restore editable | 67.944 / 66.447 / 63.528 | 66.577 / 67.337 / 62.509 | 66.447 → 66.577 |
| Ki-84 restore3D | 67.954 / 66.459 / 63.540 | 66.587 / 67.350 / 62.522 | 66.459 → 66.587 |
| Ki-84 body apply | 8.197 / 7.515 / 6.990 | 8.208 / 7.522 / 7.623 | 7.515 → 7.623 |
| Ki-84 download event | 22.119 / 19.046 / 18.641 | 20.854 / 19.989 / 19.139 | 19.046 → 19.989 |
| Ki-84 actual file | 23.170 / 21.216 / 19.580 | 21.801 / 20.954 / 20.146 | 21.216 → 20.954 |
| Ki-84 cold text | 7.323 / 6.396 / 6.492 | 6.429 / 5.770 / 6.060 | 6.492 → 6.060 |
| Ki-84 cold editable | 17.277 / 15.428 / 15.665 | 15.599 / 15.109 / 15.418 | 15.665 → 15.418 |
| Ki-84 cold3D | 17.665 / 15.741 / 16.069 | 15.957 / 15.518 / 15.774 | 16.069 → 15.774 |
| 500k SH4 preview | 10.283 / 9.711 / 9.705 | 10.199 / 9.732 / 9.713 | 9.711 → 9.732 |
| 500k SH4 restore full controls | 118.581 / 120.719 / 121.037 | 112.300 / 112.313 / 110.120 | 120.719 → 112.300 |
| 500k SH4 restore editable | 118.634 / 120.737 / 121.052 | 112.317 / 112.355 / 110.164 | 120.737 → 112.317 |
| 500k SH4 restore3D | 121.342 / 124.385 / 124.069 | 115.483 / 115.638 / 113.518 | 124.069 → 115.483 |
| 500k SH4 body apply | 3.482 / 3.486 / 3.485 | 2.964 / 4.001 / 2.964 | 3.485 → 2.964 |
| 500k SH4 download event | 28.844 / 30.674 / 28.624 | 27.257 / 27.294 / 26.811 | 28.844 → 27.257 |
| 500k SH4 actual file | 31.066 / 33.072 / 31.601 | 29.604 / 29.810 / 29.100 | 31.601 → 29.604 |
| 500k SH4 cold text | 7.280 / 7.260 / 6.677 | 6.482 / 7.642 / 6.363 | 7.260 → 6.482 |
| 500k SH4 cold editable | 17.876 / 18.815 / 17.172 | 16.455 / 18.263 / 17.427 | 17.876 → 17.427 |
| 500k SH4 cold3D | 20.471 / 21.377 / 19.815 | 19.035 / 21.350 / 20.069 | 20.471 → 20.069 |

All12 V4 file workflows preserve all records except the intended body edit,
Project identity, original change bytes plus exactly1 new change, every asset's
SHA/length and the unchanged input SHA; actual download and cold reopened body/3D
are checked. Page errors and external requests remain empty. Targeted
import/digest/chunk/ownership/fault checks pass: V2=121, V3=114, V4=115 cases in
four files. The first adapter mock setup failure and V4's no-test C: cache EPERM
are retained; fixing mock ownership / using task-owned G: TEMP does not relax
assertions or limits. V2's real compile-failure/cache/reload/reselection browser
case passes. The later V4 retained-recovery UI case has read review only and was
not executed; do not count it as browser or recovery acceptance. Scalar SHA,
initialization, forced-GC and secondary warm CPU/heap diagnostics are separate
from primary latency; faster sampled SHA cannot establish user-flow benefit.

Closing audit: the evaluation source/tests and installed module are retained
privately. All tracked src/tests, package declarations/lock and build configs
equal2f98fe9 again, and no evaluation file remains in src/tests. Neither caller
is connected and no dependency is adopted. Generated Desktop/offline outputs are
restored byte-for-byte to the qualified Native artifacts (30/20files); the live
4191 preview's20 HTTP files also match that qualified frozen candidate. Full
new-candidate Desktop/offline /
installed-browser/checkpoint qualification is not run after the performance gate
fails; previous candidate evidence is not relabelled as Spec11 qualification.
This final change is documentation only: verify the diff, local links, private
draft preservation and independent review; source identity is explicit evidence.
Git owns checkpoint identity and Actions owns exact-head CI. No release or
physical iPhone/Safari acceptance is implied; device memory/IME/save/heat/offline
and the6 existing development advisories remain outside this evaluation result.

Next connected workflow: improve the same ordinary edit→save→cold-resume path
at its actual I/O bottleneck. Measure large-body-add, stream close and finish /
readback separately and inspect avoidable waits outside mandatory safety fences.
Keep Native and the existing ports/contracts; do not expand SHA scope or weaken
inspection/publication/recovery timing to rescue this experiment. Make another
candidate only for a concrete measured cause, not to accumulate comparisons.

## Previous verified boundary —comfortable use and verification maintenance

PO authorizes repeated comfort review, implementation and verification without
small human-test/approval waits. Baseline70c9d9f was pushed with exact-head CI PASS.
Preserve originals/full quality/offline, typed Session authority, every accepted
write/readback/publication/recovery fence and private drafts. One writer; bounded
independent cause/contract/UI reviewers are read-only. No new formats, dependencies,
limits, numeric guarantees,10k qualification, adoption or release.

The comfort implementation below is qualified and pushed as the current development
checkpoint; its exact-head CI passed in Actions. The separate unit is
existing-development-tool security maintenance under
[the browser-testing contract](../docs/browser-testing.md#existing-development-tool-security-maintenance-2026-11-10).
Only existing Vite/Vitest declarations and necessary reviewed development-tree
versions may change; no new direct/runtime dependency or application contract.
Baseline collection remains155 files across the same five Node project groups.
Its local qualification is complete, preserving tests/isolation/limits/faults and
comparing actual bundles. Both checkpoints are pushed to g0-baseline; exact-head
CI passes, including the maintenance checkpoint2f98fe9 in
[Actions42699817604](https://github.com/ChoRdChario/LociView/actions/runs/42699817604).
The specification11 decision above supersedes the earlier dependency wait.

Outcome: open/read/edit/export/cold resume with less blocked reading and stable
input/focus. Fixed implementation: normal direct opening reuses the existing
verified-text reader; full Host/receive/output preparation still completes before
commands. Stable attachment/review DOM, guarded completion focus and automatic
reveal of its live control preserve the next input. Same-note label geometry keeps
numeric help off its own field name/?/value. Completion-only focus now suppresses
automatic help during that synchronous focus event; intentional keyboard/help/hover
activation remains available. Same-observation pin Map and per-update
immutable display signature avoid repeated lookup/RAF serialization. Owned SHA/CRC
pieces yield through per-call released MessageChannels; raw budgets/full checks and
outer ZIP yields remain. Archive open/add/close/pipeline diagnostics are data-only.

The comfort checkpoint is preserved in immutable final-v4, source/test fingerprint
9b68eff35e8864ee6c1f84472ca40d85bd93eec31b3d1bb78e422eb373bc8462.
The final checkpoint passes3474 tests/155files with21existing TODO, all five builds
and offline/HEIC isolation. Desktop52PASS/5634.5s, offline8PASS/730.5s and independent
installed Edge/Chrome2PASS/43.7s are complete, with0skip/0unexpected/0flaky and retry0.
The installed-browser check also verifies quiet Drawing completion/focus and records
actual browser versions. The retained final-v3 full scan was49PASS/3FAIL:
automatic numeric help opened on completion focus and covered the model. The
renderer assertions and screenshot helper remain unchanged. The narrow synchronous
focus correction passes all five focused browser cases5.0min, including the three
original failures, PC/touch completion and source-material5uses/2rounds/restore/cold.
Collection or earlier interrupted scans are NOT aggregate passes. The owned4191
preview now serves final-v4; all20 HTTP file hashes/lengths match its manifest.
The327052-byte synthetic sample is copied from the passed image-inspection Backup
with SHA-256 checked after copy; no source/private material is distributed.
The private draft blocks stayed local; the verified checkpoint is pushed to g0.
Follow its CI and continue the separate development-tool security maintenance below.
Do not repeat unchanged passed boundaries just for docs/staging or commit identity.

Focused browser evidence reproduced and fixed lost attachment focus, offscreen
Drawing completion and overlapping numeric help. Latest PC/touch connected flow
2PASS51.8s before the final quiet-focus correction includes13attachments/detached-page rejection, scrolled Apply/Cancel,
Tab/Escape and label nonoverlap. Existing help/draft/file/reopen1PASS12.1s;
help/material43PASS, final typecheck. Independent meaningful source/after-image
reviews have no findings. Retained setup/type failures, earlier passing builds,
slower timer prototype and deliberately interrupted5-case scans remain private
evidence, not relabelled passes. Optional DTO production logging was auto-review
rejected before execution, immediately removed and replaced with fixture-only
boolean assertions; no built candidate contains it.

Matched Ki-84 milliseconds, baseline70c9d9f plus diagnostic spans versus current
candidate-v4 (timing-cohort label, predating final-v4); same converted Backup,103Captions/43asset hashes/3original changes,
Chromium156,1280x720/DPR1,serial dedicated profile per trial. Three runs each;
machine load uncontrolled, no retries/limit changes or I/O-ratio correction.
The native/CPU probes are separate from these elapsed cohorts using timings=1
only, without native hooks or CPU profiling.

| User endpoint | Before three runs | After three runs | Median before → after |
|---|---|---|---|
| First-Backup restore: full Caption controls | 79882 / 79270 / 79050 | 77429 / 76000 / 75359 | 79270 → 76000 |
| Cold resume: verified text searchable | 11975 / 12004 / 11889 | 7176 / 6665 / 6745 | 11975 → 6745 |
| Cold resume: full Caption controls | 12062 / 12009 / 11893 | 11520 / 11613 / 11258 | 12009 → 11520 |
| Cold resume: edit enabled | 17629 / 17565 / 17587 | 16919 / 16996 / 16503 | 17587 → 16919 |
| Cold resume: 3D ready | 18045 / 17996 / 18095 | 17334 / 17375 / 16840 | 18045 → 17334 |
| One body edit applied | 11121 / 10200 / 10153 | 9663 / 9631 / 9529 | 10200 → 9631 |
| Save primary to download event | 26418 / 25702 / 26075 | 24792 / 24558 / 24705 | 26075 → 24705 |
| Save primary to actual downloaded file | 27779 / 27205 / 26973 | 25638 / 25425 / 25754 | 27205 → 25638 |

All six flows retain input, original history, Project identity, exact old+one new
change and every asset digest/length; saved body survives full browser close.
The restore endpoint waits for .lv-caption-select, not the earlier readonly
.lv-resume-reading;76s must not be called its first readable text. The existing
restore callback already presents that reader after staging initialize/projection.
Its first visible-text latency was not separately measured in these trials.
Separate output probe: Long Tasks37/5349ms/max508ms →34/4715ms/max338ms;
maximum RAF gap503.3→333.6ms. Each probe is one observation, not a bound/guarantee.
Native getFile count5221 unchanged; writes58/165.7→161.4ms, closes10/17.1→15.4ms.
Both total latency and stopped-frame observations support adopting the cooperative
check. Do not attribute all elapsed difference to one change or native write time.
The later UI corrections reveal the completed Drawing input, align its help and
keep completion focus quiet; the measured Ki-84 body-edit/Backup/reopen path does
not use that completion. These timings
remain v4 observations, not fabricated reruns of the later build.

Remaining measured work and stop boundary: first-restore initialize median47.782s
contains model-stage22.466s and44fact-save spans20.444s. Their adjacent snapshots
show616control lists/5544control reads, not native elapsed times. No large unwired
readonly restore callback or safe existing-scope shortcut was found. The
allowNewEvidence=true path is expressly outside06c's named readonly scope; do not
reuse planning results across CAS/executor/receipt writes as stored evidence.
The investigated receipt Blob shortcut also loses the existing post-body closing
audit and remains rejected. The roughly0.7s initial-hint scan stays fresh rather
than introducing another mutable initialization cache. No inspection skip or
cross-operation SHA proof cache was adopted.

Next performance evidence is per-fact receipt/inventory/executor/write/readback
latency before choosing any further optimization. A preview before fully checked
ready provider/publication would be a new policy. Stop only an affected genuine
policy/inspection-lifetime/compatibility/dependency/release decision; continue
other authorized fixes. The inspected workflows have no further concrete safe
source change identified. Physical iPhone/Safari IME, memory/heat, save and offline
acceptance remain pending, separate from Windows touch-layout evidence. Do not
claim universal comfort, a release gate or a speed guarantee.

2026-11-10 meta-audit: fresh npm audit reports16 aggregated package findings
(2critical/5high), all17 affected lock nodes marked dev:true. The separate
omit=dev audit exits0 with no findings. Independent read-only triage found no
path from imported Project files to these Node build/test worker options or
editor middleware; this is not proof of general security and dev dependencies
still need maintenance. Critical counts include tinypool and its Vitest parent,
not two demonstrated application RCEs. Official prerequisites are retained in
[Tinypool worker](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3),
[Tinypool run](https://github.com/advisories/GHSA-85c8-ppgw-ccpr),
[mocker](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) and
[Vite editor](https://github.com/advisories/GHSA-698v-4r3x-3vcv).
The frozen candidate's checks are complete. Next separate ordinary compatible
development-tool patches from comfort changes; inspect the patched Vitest
chain's actual API/Node/config conditions before deciding whether a substantial
architecture choice is needed. Do not install while current tests use node_modules,
blindly force audit fixes, downgrade PWA or override tinypool across incompatible
majors. The independently reviewed Vite6.4.6/Vitest4.1.12 tree is installed without
install scripts. Runtime29 versions/URLs/integrities, direct runtime declarations,
product version/license/overrides and all test commands remain identical. Tinypool
is removed. File/project collection remains exactly155 across the same five groups.
Initial typecheck found one changed mock inference: the recovery render mock now
names its existing port type explicitly, retaining every assertion/fault/deadline.
Typecheck,77 focused core/UI checks and the original recovery case pass. The final
full checkpoint passes155 files:3458 ordinary PASS/16existing expected failures/
21TODO,1035.63s, with all five builds and offline/HEIC isolation. Application source
is unchanged. Immutable security-final-v1 records the exact three changed package/
test paths with fingerprint c30dc438a45659160b829612df787e6d553ce813896b3738174c819cf6526271.
All30 Desktop output files match final-v4 byte-for-byte; its executed52-case
evidence is retained for those identical bytes. Offline has14 changed resources
from fresh generation, with no normalization/inferred equivalence. New-build
offline8PASS/708.2s, PC/touch continuation2PASS/57.0s and installed-browser2PASS/43.6s
are complete with0skip/0unexpected/0flaky, retry0. The same4191 preview now serves
security-final-v1; all20 HTTP files match its manifest. The synthetic sample remains
unchanged. The separate checkpoint is pushed and exact-head CI passes: typecheck,
the full Node suite, build and HEIC isolation. Git/Actions own its identity/result,
without repeating unchanged runtime checks for result prose. Retain this result
with the connected work rather than create a separate status-only commit.
No public release is authorized.

The first Vitest4 full run found one genuine test-harness isolation failure: the
shared decoder retained previous call history. The unchanged valid-PNG→capacity
rejection pair reproduces it; explicit standalone-mock reset in afterEach restores
the old cleanup intent and the pair passes without changing the rejection assertion.
The second full run passes. Vitest4 separately reports16 pre-existing it.fails
that Vitest3 included in its pass total:4 old publication cases,4 old migration
expectations,6 writable-ProjectStore ingress checks and2 old merge collision reports.
Independent static reachability review finds the current Desktop old-format path
opens read-only (dispatch rejects), offline excludes that old app, and current
ProjectScene uses its separate validated conversion/Session/package services.
These are not16 new regressions or16 ordinary assertions proved true. The older
__last expectation also differs from the accepted07c mapping; do not redefine it.
One old-readonly weakness remains: a missing referenced blob may be detected only
when displaying the model; the new conversion rejects it. No current-edit loss
path was found. Keep that late warning and the original legacy gates as residual
scope, without widening this development-dependency unit into old writer repair.

Final reviewed-lock audit is critical0/high0/low2/moderate4. Remaining6 are package
aggregation of development-only deepmerge/minimatch and their build parents.
[deepmerge](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) has no fixed release;
[glob14.0.2](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4) and
[minimatch11.0.1](https://github.com/advisories/GHSA-g3hv-75wg-m249) are outside the
current Workbox ranges. Independent review confirms no compatible upstream fix
identified and no imported-Project path to this Node build configuration. Keep
these as residual developer/build findings, not a security PASS or release waiver;
do not downgrade PWA or force major overrides merely to clear audit counts.

Independent maintenance design review and official fixed-tag/registry metadata
identify existing Vite6.x + Vitest4.1.12 as the bounded next candidate. Pre-install
audit found a query-deny regression in6.4.4; it was never installed. The reviewed
same-major patch candidate is now6.4.6, with compatible development-only child
patches checked against the protected runtime tree. The latter Vitest update
removes tinypool; no incompatible tinypool override or new direct/runtime dependency
is needed. Node22/24 and Vite6 remain supported. Preserve five Node project groups,
isolation, group order,2workers, exact collection/21TODO/deadlines/assertions and
fault cases. Document acceptance in the existing browser-testing contract before
changing the lock; inspect lock/runtime-tree/actual bundle differences and audit,
then run relevant checks and independent review/CI. A version-major label alone
does not create a PO decision. Stop only if real authority/isolation/product
contracts or an unapproved direct dependency must change. Specification11 remains
a separate evaluation, with its final non-adoption outcome recorded above.

The earlier proposed [evaluation11](../docs/specs/11-streaming-sha256-evaluation-proposal.md)
was subsequently approved, evaluated and closed without adoption. Its current
result and all required conditions are recorded above; this retained maintenance
record is not another dependency wait or an active evaluation queue. Total SHA
CPU is not the target callers' reducible time.

Task-owned evidence is under.artifacts/e2e/comfort-cycle-20261109; original/private
material is never staged or distributed. Current CI identity/result belongs to
Git/Actions and the final report rather than duplicated per-commit logs here.

## Previous boundary —Ki-84 practical edit, save and cold resume

PO2026-11-09 authorizes measurement, implementation and automated qualification,
including a fresh review of needless complexity/repeated checks. Baseline23cc1ac;
one writer and bounded read-only cause/contract/final reviewers. Preserve all
private draft blocks and source/evaluation evidence; no human helper-test wait.

Final local status2026-11-09: approved06e §§7–8 implemented and independently
reviewed. Fixed-input Ki-84 three-run file/hash/history/cold flow PASS; core3446
PASS with21existing TODO, all five builds and both isolation checks PASS.
Desktop: full49PASS/1FAIL plus repaired Native workflow1PASS (all50 covered, no
single50PASS scan claimed). Edge/Chrome2PASS; full-offline8PASS. Delivery4191
serves all20 frozen files exactly; final source/test fingerprint81037ee9… with
unchanged measured product bytes. No further product changes for staging.
Stage only public filtered docs and reviewed/tested source; retain165/86private
draft lines and all artifacts locally. Save/Push suitableg0 checkpoint and check
the resulting exact head in Actions; Git/Actions own that identity/result.
Remaining: large-file waits and physical iPhone Safari acceptance. Next engineering
target is per-body/ZIP/write pipeline timing and records-first startup; don't
extend inspection lifetimes or add caches from counts alone. No release/Pages.

Outcome: same fixed Ki-84 input/history, one body edit→real external backup→full
browser-close/cold reopen with exact edited text, original model/image digests,
Project identity and original history retained. Reuse existing private journey
and native/high-level timers; measure apply, package/receipt/overview/handoff,
records-first display and edit-ready/3D-ready separately. Compare three isolated
before/after runs under the same browser/viewport/data, heavy work serially.
Separate diagnostic setup failures from product/performance failures; preserve
existing timeouts/rejections and cold/independent-file checks.

Choose fixes from observed elapsed time and a connected user workflow, not I/O
counts or helper count. Remove demonstrated duplicate work/branches inside
accepted lifetimes; retain original/full quality/offline, all write/readback/
Journal/publication/recovery fences and06b ZIP proof lifetime. No new dependency,
format/ID/capacity guarantee, acknowledged-data deletion, main/Pages or release.
Before storage/security change update the relevant spec/acceptance and review;
stop only an affected genuine new policy/contract/authority decision. Final
meaningful source diff independently reviewed; final serial checkpoint/HEIC,
PC/touch and full-offline qualification, exact candidate delivery, suitableg0
commit/Push and exact CI. Next work follows measured remaining critical path.

### Measurement and simplicity decision (2026-11-09)

Measured seconds; each cell lists all3runs then its median. Same fixed private
input/history, Chromium156,1280×720,DPR1; no retries. External system load was not
controlled. These are observations, not a causal speed claim or a new guarantee.

| Tree/cohort | Body apply | Download start | Cold records text |
|---|---|---|---|
| Initial old | 16.317/15.721/16.983; median16.317 | 35.972/40.550/36.523; median36.523 | 19.347/21.251/22.489; median21.251 |
| SHA prototype —not adopted | 38.107/24.434/32.281; median32.281 | 68.900/51.003/62.498; median62.498 | 35.107/25.524/30.232; median30.232 |
| Unchanged old control | 30.223/23.886/34.712; median30.223 | 48.109/55.625/66.747; median55.625 | 27.341/28.908/31.610; median28.908 |

All9completed flows preserved the input backup, all43body hashes, Project
identity and the3original changes plus exactly1newedit, with an actual downloaded
file and complete-browser-close continuation. They do not qualify the later
minimal final tree; that requires its own connected flow. The three default-
sandbox connection failures never reached the product and remain in the private
failure record. No claim that every attempted run passed.

Initial fixed-input three-run baseline PASS. The same-consumption SHA fast-path
prototype also passed three full file/hash/history/cold journeys, but the native
I/O stages varied broadly with competing system load; do not infer elapsed benefit
from hash counts or adjust wall time by an I/O ratio. The unchanged old-build
three-run control also passed, with no elapsed benefit established for the prototype.
Retain all three cohorts and failure evidence. No deadline,
retry, input, original quality or acceptance assertion is relaxed.

The WeakMap/SHA fast path is not adopted: it did not demonstrate a workflow benefit.
Retain its source/tests/build privately, and keep the final source small: intrinsic
owned Uint8Array copies, no completion after cancelled EOF, and same-owned-source
sorted heads without rebuilding its history. Original capture/writer SHA paths
remain. Final qualifying Ki-84 journey must use the new final artifact, not borrow
prototype PASS. Later PO-approved §§7–8 add their own three-run qualification;
do not use the rejected prototype to qualify those changes or force a positive result.

PO2026-11-09 approves spec06e §§7–8 after independent design review: scope each
normal selected Session read until its closing audit, then adopt; publish only
the actual new Backup display row after successful Session and Sender fences.
Keep readonly/pending reads, distinct write/publication/recovery checks, actual
manifest disclosure, full fresh download and failure/retry/cold discovery. Old
history damage may be detected at next full discovery. Implement with focused
failure/ownership tests, then compare three fixed Ki-84 flows and qualify the final
tree. These new substantive improvements supersede the minimal-tree single-flow
qualification above; do not use prototype results as their evidence.

Qualification replan: the first final checkpoint failed after2449.69s with
3437passed/3timeouts/21todo (154files). Builds did not run. The07n LociMyu
five-purpose case exceeded60s, Scene-name cold acknowledgement exceeded30s,
and fixture-acquisition success exceeded15s. All three passed focused diagnostics
under those same original deadlines (product two73.19s combined; acquisition7.21s).
This does not replace the failed whole run. Preserve its log and retained evidence.

Separate ordinary product tests, the700-case connected-file suite, other fixture
scripts, native acquisition restore and evidence CLI in existing Vitest projects.
The known heavy files each have their own phase; the other files retain2workers
and fresh per-file forks. Independent review rejected a singleFork draft because
it would batch14files into one environment lifetime despite isolate:true; it was
never executed as qualification. No case/assertion/deadline/retry changes. Compare
the collected file union before/after, review this meaningful orchestration diff,
then execute the whole checkpoint again at the final tree. Do not claim an elapsed
gain from different background load or from collection-only results.

The grouped second checkpoint also failed:3007.38s,3435passed/5timeouts/21todo,
153/154files passed; builds did not run. Acquisition and evidence CLI passed.
The remaining timeouts are all connected-file cases (07n, two07m, Scene names,
Caption parents). Preserve both failed full runs. Fixture inspection found
stubGlobal is not undone by restoreAllMocks, and late timed-out case-finally
unstub can erase the next case's decoder. Centralize cleanup after owned case
disposals; preserve all cases/assertions/deadlines. This fixes a real harness
leak but is not by itself proof of the primary timeout's cause or resolution.

Implementation checkpoint2026-11-09: §§7–8 source and focused tests implemented;
independent final/contract reviews have no remaining findings. Public read adopts
only after closing audit; failed A cannot roll back successful B. Completed Backup
display uses actual manifest flags (including named base evidence with anonymous
current source), both outer-success fences and exact Host ownership guards. Old
rows/bases are retained; strict download and explicit refresh detect damaged old
history. Missing/late/nonready observations and failures keep fresh discovery.
No new authority, body cache, schema, IDs or dependencies.

Focused checks:113persistence/stream/boundary tests PASS33.67s;8output/Host/portable
tests PASS28.88s;9previous-timeout/restore-pending/outer-fence tests PASS108.42s
under original deadlines; named-base disclosure test PASS3.59s. Selection overlap
is not a unique-test tally. Deferred-test cleanup and full old observer replay
were reviewed; final whole-tree checks still pending. Dedicated Chromium fixed
Ki-84 three-run measurement uses the immutable approved candidate. Do not infer
full-suite or device acceptance from these focused passes.

Final candidate's fixed Ki-84 three-run flow PASS8.1min, source/test/config
hash7ff434fa…; includes actual save-status/handoff assertion after the UI fixes
below. Prior ce6e6d8f three-run evidence remains private, not final qualification.
Same43body hashes,103Captions,3unchanged original changes plus1edit,
actual file bytes and full-browser-close continuation; no page errors/external
requests. Compare seconds below (three runs, median). Initial old and later
unchanged-old control remain distinct because external machine load varied.

| Action | Initial old | Unchanged old control | Approved candidate |
|---|---|---|---|
| Body apply |16.317/15.721/16.983;16.317 |30.223/23.886/34.712;30.223 |13.271/12.325/9.896;12.325 |
| Download start |35.972/40.550/36.523;36.523 |48.109/55.625/66.747;55.625 |32.011/32.700/24.856;32.011 |
| Actual file handoff complete |37.392/42.039/37.589;37.589 |49.255/57.059/68.210;57.059 |33.592/33.785/25.809;33.592 |
| Cold records text |19.347/21.251/22.489;21.251 |27.341/28.908/31.610;28.908 |13.784/13.789/11.488;13.784 |
| Cold edit-ready |27.404/30.131/30.203;30.131 |35.409/40.148/42.166;40.148 |20.210/19.529/16.818;19.529 |
| Cold3D-ready |28.003/30.976/30.817;30.817 |36.145/41.204/43.155;41.204 |20.882/19.944/17.190;19.944 |

Fresh restore-to-records median108.115→91.392s; this is distinct from normal cold
reopen. No wall-time correction by I/O ratios and no fixed speed guarantee.
All three approved saves have no post-success whole-history overview span, as
intended; generation median28.714s and fresh download2.986s remain. Generation
includes capture5.917s,persist2.880s,finish13.935s/job11.243s (nested spans; do not
add parent/child). All three fresh ready fences remain, roughly1.5–1.7s each.
The workflow is faster in these observations but still misses comfortable-use
targets. Bounded independent tracing identifies stream-close7.728s as the whole
concurrent ZIP/write pipeline (final measurement7.779s; CAS opens/body SHA/copies, CRC, archive SHA,1MiB
coalescing/backpressure, native write/close and closing guard), not disk-close
time. Next split per-body open/add, ZIP close/pipeline completion and native
write/chunk/close waits; do not sum overlapping branches. Existing1MiB batching
and ownership copies serve a purpose. Tiny repeated prefix checks are not a
workflow-priority optimization. Continue generation and records-first startup
from these measurements; do not re-add body caches/inspection exceptions without
a measured need.
The subsequent full checkpoint-v3 failed in1262.30s (3444passed/2assertions/21todo,
153/154files); all original timeouts resolved, but builds did not run. Preserve
this failure: disclosure's synthetic flag update found a frozen DTO exposed as
the Host's ordinary mutable display row; project status required stale:false and
therefore hid an observed handoff for the intentionally freshness-unknown new row.
Fixed Host-owned copy and separate observed handoff from verified-file claims.
Do not guess stale:false; actual file verification still requires fresh matching
discovery. New assertion rejects a verified claim from unknown-freshness state.
Eight focused cases PASS31.65s; independent bounded review has no findings.
The final-source Ki-84 repetition and checkpoint below supersede that provisional
qualification. Prior browser PASS remains distinct evidence, not qualification
of the changed tree.

Final-source Ki-84 repetition above is complete. Full checkpoint-v4 PASS1089.383s:
typecheck,154files/3446passed/21existing TODO, all five builds and offline isolation;
no timeout/retry/exclusion. Unit-test phase1015.56s; previous failed runs retained,
not equivalent successful baseline runs or a controlled speed guarantee. HEIC
isolation PASS. Frozen final Desktop30files and offline20files share source/test
hash7ff434fa…; every Desktop file is byte-identical to the three measured runs.
No further product edits during qualification.
For large-GS/installed-browser/full-offline acceptance, use a task-ownedG-drive
TEMP/TMP directory (C: had9.7GiB free). This is a process-local test-environment
choice, not a storage policy or new capacity claim; do not touch personal browser
profiles or delete prior failure evidence. The before/after Ki-84 trials retained
their originalC-drive profile conditions. Full Desktop uses the same test set,
workers/retries/deadlines with immutable checkpoint artifacts, avoiding identical
rebuilds merely to start another owned preview; verify collected-case equality.
Canonical/frozen Desktop collection equality PASS50cases with identical limits;
this is not execution credit. The initial private-driver run stopped before any
test because WebServer cwd resolved beside that private config. Explicit root cwd
fix only; retain v1 failure and execute all50 in v2. Its result follows.

Full Desktop v2 finished49PASS/1FAIL, no retries or skips (all50 executed).
Native07k small-spatial failed because the one-shot GS ray left placement in
choosing, then positionX remained hidden. The Native loop omitted the existing
Mesh counterpart's prepared-canvas-before-fit condition. Bounded independent
review confirms cameraReady differs from model/picking ready; it is a plausible
cause, not yet a runtime proof. Repair only that test's readiness and proposal
visibility preconditions, preserving all original deadlines, one-shot ray and
file/hash/history assertions; run the complete affected workflow. Product source
and all compiled artifacts remain unchanged. Reuse the unchanged49cases and
core/build evidence rather than repeat them for a test-navigation-only change.

Native focused workflow after that exact repair PASS5.0min: same one-shot point/GS
selection, coordinate expectations, two returns, five outputs, restore and cold
resume; no extra clicks/deadline change/assertion removal. Typecheck PASS and
bounded independent test-diff review clear. Desktop evidence is explicitly the
full49PASS/1FAIL scan plus this changed-case PASS, not a single50PASS scan.
The no-test-selected first focus driver (bad start-anchor against qualified
titles) is retained separately and gives no product credit.

Final artifact/test record81037ee9… adds only that E2E file to the earlier
7ff434fa… source/test list. Every prior source/test/config hash and all30Desktop/
20offline artifact hashes match; no product code changed after the measured
three-run candidate or the passing core/build/HEIC checks. Installed Edge and
Chrome independent-context representative flow2PASS41.7s (create, actual backup,
Review controls, explicit edit-copy confirmation, independent save). Full offline
8PASS722.794s including test builds: actual browser/server-close mixed500k SH4/
Mesh/Point/Proxy/media, edit/save/cold, initial conversion, safe update/repair/
removal, unchanged Project/history and foreign-worker refusal. No retry/skip/flaky;
not physical iOS acceptance. Test-only a/b/subpath builds did not replace the
frozen root candidate. Delivery4191 replaces only the identity-checked old owned
preview; all20 served file hashes and final source/test files match81037ee9… .

Remaining large-data weakness: the full500k SH4 flow logs edit-copy editor-ready
163.911s and3D-ready172.466s after confirmation. These are current G-profile
functional observations, not a matched performance comparison or capacity/speed
guarantee. Keep large-GS and91.392s first Ki-84 restore distinct from the12.325s
body apply/32.011s ordinary download/13.784s cold-records median. Physical iPhone
Safari IME/save/memory/heat/offline acceptance remains pending; touch Chromium,
Edge and Chrome do not replace it.

## Completed boundary —normal-save per-file persistence

PO2026-11-08 authorizes measurement and implementation through automated
qualification. Baseline53d36f4. One writer; bounded read-only cause/contract/final
reviewers. Preserve private draft blocks and all original/evaluation evidence.

Outcome: shorten normal restored-project save→download, not just error/retry.
Measure native handle lookup, writer creation, write, close and readback by file,
and selected-control audits separately, using the same fixed source/history and
three isolated browser runs before/after. Retain original deadlines/failures.
Then implement only demonstrated redundant work, document relevant invariants
before storage changes, and verify tamper/failure/cancellation/recovery plus
connected PC/touch, cold/offline continuation. Existing ZIP1MiB/OPFS64KiB buffers
are not missing features. Do not merge writes/readbacks/Journal/publication/recovery
fences, change formats/IDs/dependencies/capacity, delete acknowledged files or
release/deploy. Stop only the affected change if a new contract/policy is needed;
continue unaffected measurement and improvements. Final meaningful diff receives
independent review, serial checkpoint/HEIC checks, suitableg0 Push and exact CI.

Measured and implemented2026-11-08: normal save→download under Windows dedicated
Chromium156, PC1440×1000 DPR1, fresh isolated profiles, same7840B backup/source/
history as06e. No concurrent heavy runs; original15s criterion and cold file/history
inspection retained. Native probes are private, bounded aggregates, record no body
contents and preserve original failures; File.stream/backpressure is untouched.

Short meta-audit: detailed native timing shows tiny writes, expensive repeated
lookups/enumeration. No larger buffer, receipt batching, writer cache or extra
format branch is justified. First direct-directory candidate reduced iterator
calls but added native directory opens; instrumented action7840→7907ms and
uninstrumented7365→7330ms medians do not show a useful gain. Removed it; retained
all comparison evidence. The adopted candidate overlaps independent native
directory waits within ONE fresh list, max4workers globally per call, serial
fallback without a handle queue, complete drain/iterator cleanup on failure,
original first error and sorted-only complete success. No audit cadence, semantic
receipt-read order, write/readback/Journal/publication/recovery fence changed.
Specification06e§5 preceded implementation; independent contract/source review
has no findings. No new PO policy/gate is needed for raw-list scheduling.

Uninstrumented action milliseconds (median [each run]):
- Baseline53d36f4:7365 [7323,7365,7489].
- Rejected direct-lookup candidate:7330 [7287,7435,7330].
- Bounded-list candidate:6508 [6574,6508,6499], all3PASS (~11.6% shorter).
These are this turn's matched runs; do not use the earlier12.64s as its baseline.
Native-probed action:7840.1 [7879.1,7840.1,7400.9]→6669.5 [6663.9,6802.9,6669.5].
Full persist including all original/control/index/Start writes, fresh readbacks
and their guards:2033.2 [2283.3,2033.2,1987.7]→1750 [1722.4,1750,1754.1]ms.
Probe itself adds overhead; cumulative native waits overlap and are not wall time.

Per-file native timings, medians in milliseconds. W/C/R are write/close/first
native byte-read; final column is native writer acquisition→first native read
completion, including intervening guard/path work. It EXCLUDES the final
post-read audit and in-memory reference comparison; the persist wall interval
above includes those. No base-evidence originals exist in this small fixture;
production still persists/verifies ALL declared originals, not a fixed4.

| File | W/C/R before | W/C/R after | Writer→first read before→after |
| --- | --- | --- | --- |
| manifest.json |1.2/1.5/0.8|1.0/1.4/0.8|75.7→64.2|
| metadata.am |0.9/1.5/0.8|0.9/1.4/0.8|74.2→64.4|
| protected-inventory.json |0.9/1.9/0.9|0.9/1.5/0.8|81.5→66.1|
| exchange-bases.json |0.8/1.5/1.0|0.8/1.5/0.8|77.4→65.0|
| capture.json |1.1/1.7/0.9|1.1/1.5/0.7|153.3→131.5|
| prepared.json |1.0/1.5/1.1|0.9/1.5/0.8|146.6→129.2|
| index.json |1.1/1.4/0.8|0.8/1.4/0.7|157.2→130.9|
| start.json |1.3/1.8/0.8|0.8/1.4/0.7|149.3→130.0|

Focused OPFS47PASS covers lexical prefixes/empty/missing/file ancestors, fresh
new/deleted/replaced directories, deep/wide global bounds and same-iterator
serialization, held-sibling drain and secondary-close primary-error preservation,
plus existing stream/receipt safety. Initial separator bug and optional iterator
test-type failure retained, fixed without changing assertions/deadlines. Typecheck
PASS. Final source/test tree independently reviewed: no findings. Serial checkpoint
PASS:153files,3435executed casesPASS/21existingTODO unexecuted,867.02s root-suite
wall time; typecheck, all five builds, offline-isolation and HEIC isolationPASS.
Fixed final Desktop/offline candidate source/testSHA256
3c418a7f89cbbc4f114dfac4cc695a8d01ea9771db896e4fce8cad515fdcd1a9
matches the measured source/test tree. Connected PC/touch native quota→retained
draft/retry/cleanup/same output/download/cold reopen and Review-copy/save/reopen
3PASS (59.4s). Additional normal-save touch emulation1PASS,7053ms; one observation,
not a physical iPhone performance claim. Complete offline8PASS: exact-resource
repair, two-window update/input retention, Mesh/Point/500k SH4/Proxy/media edit/
save/full browser-server close/history reopen, initial conversion/unsupported
refusal, subpath/foreign-worker and scoped removal protections. No runtime checks
repeated solely for result prose/staging. Actual iPhone Safari resource/IME/file/
thermal/offline acceptance remains unexecuted.

Remaining native acquired-writer cleanup concern is code-only and pre-existing:
do not infer a native lock leak from a JS stub. Reproduce a genuine native
write/close failure plus same-path reopen before selecting any awaited abort fix;
never delete partial receipts or replenish acknowledged loss. Next normal-save
optimization must be selected from elapsed stage time, preserving fresh fences.
This unit's implementation and Windows automated qualification are complete;
deliver the fixed4191 candidate and suitableg0 checkpoint, with exact CI tracked
by Git/Actions. Existing251 private draft lines and evaluation material stay local.
Next apply the same measurements to Ki-84's edit→save→cold-resume flow before
choosing larger-data changes; current small-fixture results are no large-data or
device speed guarantee. Saving still takes several seconds and remains a target
for improvement; no new validation lifetime or write/recovery policy is assumed.

## Completed boundary —restored-generation output read scopes06e

PO2026-11-08 approves [06e](../docs/specs/06e-selected-generation-output-read-proposal.md)
implementation and automated before/after qualification. Baselineea347db; one writer
and bounded read-only cause/contract/final reviewers. Preserve the251 private draft
lines and all existing source/evaluation material locally.

Outcome: reduce restored-project save/recovery waiting by grouping only each
outputReady, Backup capture's pure source/base/inventory reads and outputOverview's
remaining original-Session escapes. Use the SAME operation-owned readonly fs/factory;
return plain results and adopt no Session state until the closing audit succeeds.
Keep all raw/source/model/image/SHA checks and the exact06b ZIP-proof lifetime.
No aggregation across ready calls, capture→persist, writes/readbacks, Journal writes,
publication, Selection, recovery, retry or cold resume. No dependency/wire/profile/
capacity change, acknowledged-output deletion, main/Pages or release activation.

1. Bind acceptance and measurement to the approved scope; measure three baseline
   runs of identical small restored-project output, cleanup/retry and cold reopen,
   separating user latency, phase time and selected-control I/O. Preserve original
   deadlines/failures; diagnostics never relabel a failed performance run PASS.
2. Implement private non-adopting projections and same-fs/factory read plumbing.
   Test closing tamper/selection/lease/ownership/expired reader/illegal write and
   preserved write/readback/recovery faults, including no preclosing state adoption.
3. Re-measure the same workflow three times. Confirm original/body/metadata/history,
   same output ID, file download/inspection, PC/touch/two-window recovery and full
   cold/offline continuity. Use existing services for hostile combinations.
4. Independently review final meaningful diff; run focused checks while editing and
   the required final serial checkpoint/HEIC/connected/offline checks at completion.
   Deliver exact tested candidate and suitableg0 checkpoint/Push with exact CI.

Stop only for a new genuine contract/policy/authority beyond06e. Opening/closing
audit timing and the documented raw-external ABA limitation are now approved; do not
ask again per helper. Physical Safari acceptance remains pending and separate.

Implemented the three scoped paths; early independent source review findings fixed.
- outputReady uses one readonly fs/factory for Journal/repository/append/receive
  readers and one nested06b integrity lifetime. Each ready call remains separate.
- Backup capture owns its own pure scope and frozen data; persist/write/readback
  and recovery continue through their original fresh public ports.
- Overview keeps one Session-owned exact-owner scope, passes the same non-adopting
  projection into only its two former original-Session escapes, and never mutates
  last/acknowledgments. Standalone jobs/availableBases contracts are unchanged.
- Owned unfinished projections are drained on callback return/error and rejected;
  active is checked after await too. Ready/capture recheck signal and authority
  immediately before adopting, after both relevant closing audits.
- Constructor-bound content/CAS observers intentionally remain strict. No generic
  generationScope failure semantics or staging-consumer policy was changed.
- Focused12PASS (8new lifecycle/owner/fault cases plus existing closing/proof/
  presentation cases);688 unselected cases are not execution credit. Typecheck and
  SceneCore12PASS. Failed fixture/measurement setup evidence stays local.
- Fixed backup7840B SHA256765eca3add9cefd03c12193ec1f43025b68f31026421ea2c7627c62475e49b8d
  completed three isolated baseline browser recovery/cold runs. Original-root
  control uses a separately fixed Workspace with identical source/original history;
  it additionally records an exchange base, so absolute route-to-route time is not
  a causal improvement comparison. Compare each route only with its own input.
  The copied measurement candidate binds the production source; later changes only
  move existing display test spies to the real candidate-read boundary. Independent
  delta review and10 affected focused casesPASS, preserving all freshness oracles.

Measured Windows dedicated Chromium156,1440×1000 DPR1, separate fresh profiles,
same fixed input per route; no concurrent heavy tests/builds. Three-run milliseconds,
median followed by each run. Input/archive, original-history and post-download
inspection/cold continuation assertions completed, including the performance failure.

| Restored route | Beforeea347db |06e |
| --- | --- | --- |
| Normal fresh output → download |13721 [13613,13721,22052]|12639 [10690,13821,12639]|
| Native capacity error visible |14311 [14311,14344,13360]|7665 [7665,7733,7602]|
| Temporary cleanup after shared reader released |6771 [6771,7140,6484]|2908 [2908,2908,2388]|
| Same frozen output retry → download |7151 [7151,7085,7445]|5570 [5570,5622,5367]|

The normal baseline's third run exceeds the original15s window and remains FAIL;
all three changed-code runs satisfy15s, but ALL still miss the10s small-save goal.
Do not present the capacity-error improvement as successful fresh-save time. Mobile
touch emulation normal save10107ms also misses10s; functional file/cold checksPASS.
Node archive inspection and OS file-picker waiting are outside the handoff endpoint.

In the capacity case, phase medians ready-before1569.6→358.1ms,
capture1944.8→724.6ms, ready-final1508.3→327.9ms, ready-finish1582.5→354.4ms,
overview2311.4→918.2ms confirm useful work in all three approved read scopes.
Owning-page cumulative-counter DIFFERENCES for the normal action: restore-control
readStream3562→1742, list274→134 (medians); these are I/O counts, not elapsed time
or physical disk-read guarantees. Nested phase times are not summed.

Original-root control (fixed Workspace, same source/history, different retained
exchange base): capacity error6039→4518ms, cleanup3423→2892ms, retry3108→2646ms
medians. Compare this route only against itself; do not infer causality from the
absolute root-versus-restored gap. All6 route-control runsPASS. Restored quota
comparison6PASS, changed touch quota1PASS and the unchanged old strict15s selected
recovery flow1PASS; old failure evidence stays retained. Normal output baseline
2PASS/1performanceFAIL, changed3PASS and touch1PASS, with originals/history intact.

Remaining: genuine normal save10s remains unmet. Its unmodified persist phase is
variable (before median2751.5ms, after3779.1ms); no write optimization or causal
speedup/regression is claimed for that interval. Existing ZIP1MiB and OPFS64KiB
buffering are ALREADY implemented. Next measure each persisted file's handle/
writer/write/close/readback plus control-audit time before choosing a change;
keep original→prepared→index→start order and every write/readback/recovery fence.
Do not add another buffer or collapse receipt checks without supporting evidence.
Final qualification retained the first root failure:3421PASS/1FAIL/21TODO,
153files,2228.97s. The sole failure was the existing Git trace-hash rejection
CLI case timing out at30s; all product cases passed. The complete83-case CLI
file alone then passed55.65s (versus607.99s under full contention), with original
assertions/deadlines and existing child/workspace phase diagnostics. This does
not relabel the failed root run PASS. The exact failed case alone took1.73s;
its failed workspace and all logs are retained privately.

Short meta-audit: production scope and the next persistence measurement remain
unchanged. Address final qualification execution conditions first: built-in Vitest
projects run152 product files before the one Git-heavy CLI file, retaining all
153unique files,3443declared cases, two workers and30s deadlines; no retries or
test exclusions. Independent review confirms the scheduling boundary and focused/
related selection semantics. Final serial checkpointPASS:153files,3422executed
casesPASS/21existingTODO unexecuted,888.87s root-suite wall time; typecheck, all
five builds and offline-isolationPASS. This is test scheduling, not a claimed
product-speed improvement or runtime guarantee. No timing limit/retry was relaxed.

HEIC production isolationPASS. Fixed final Desktop/offline candidates match the
reviewed production/test/config tree (aggregateSHA256
8101a00670a2728cf508c87e9fb9d255fe92df3cdbbf5b3ef88e4c2d304b000b).
The measured two production files are byte-identical after LF normalization;
only test-spy/config scheduling changes followed browser measurement. Existing
connected PC/touch native-quota/retry/download/cold-reopen and Review-copy/save/
reopen flows3PASS, unchanged deadlines. Complete offline8PASS (11.9m): corrupt/
missing exact-resource repair, two-window repair/update, full browser/server close,
Mesh/Point/500k SH4/Proxy/media editing/save/history reopen, initial conversion,
unsupported-source refusal, exact subpath ownership and scoped removal/foreign
worker rejection. No dev-server observation substitutes for this evidence.

Implementation and Windows automated qualification are complete. Deliver the fixed
candidate at4191 and suitable verifiedg0 checkpoint; Git/Actions own commit and
exact pushed-CI identity. No public deployment. Normal small save10s remains unmet;
physical iPhone Safari memory/IME/file saving/thermal/offline acceptance remains
unexecuted. Next is per-file persistence measurement described above, preserving
every write/readback/recovery fence; no new buffer or durability policy is assumed.

## Completed boundary —progressive full-quality GS and safe output retention

PO2026-11-08 explicitly authorizes implementation and automated verification of
large-GS progressive loading and safe accumulated-output cleanup. Baselineacdfd89;
one writer with bounded readonly renderer/retention reviewers. Preserve original
bytes/all SH/full quality/offline and every save/readback/recovery/lineage fence.
Retain the251 private draft lines and all original/evaluation material locally.

Outcome: keep captions and ready residents responsive through GS preparation;
measure actual worker/packed/sort stages before selecting progressive display.
Pinned SDK already streams Blob input; do not claim a new raw-copy saving. Remove
strictly regenerable attempt ZIPs while retaining every acknowledged artifact. No new visible file-type choice,
management screen, codec dependency, blanket file cap, silent SH/quality reduction,
canonical/history/base deletion, main/Pages or release activation is authorized.

Implementation supplement: [GS loading/output attempts](../docs/specs/10-gs-loading-and-output-attempt-cleanup.md).
True partial drawing remains subject to global-order/pixel evidence. The first
owned measurement found a4259.9ms synchronous packed check; the fixed-condition
three-run comparison below is the comparison evidence, not that single run.

1. Review pinned public APIs, source/display ownership and exact output/read/base/
   recovery dependencies; record the ports and acceptance before implementation.
   Measure full vs bounded loading and storage before/after using owned data/profiles.
2. Implement the largest safe connected workflow through existing decode/admission,
   WorkspaceFS and Session/package boundaries. Latest cleanup authorization covers
   redundant output data, not indiscriminate GC. Determine terminal eligibility and
   live-reader/cross-tab/recovery fences before any removal.
3. Verify SH0–4 complete coefficients/final rendering, first usable stage, bounded
   transient input, cancellation/stale/context/teardown and no new source identity.
   Verify output history/base/return/hash integrity, no concurrent download loss,
   exact cancellation/retry/interruption, independent PC/touch and cold/offline.
4. Independently review the meaningful final diff, run required checks serially at
   the connected boundary, deliver an exact artifact, then suitableg0 Push/CI.

Implemented and independently reviewed. A connected retry-form defect found after
qualificationV1 was reproduced and fixed; qualificationV2 is the final source/test
tree. V2 root checkpoint/HEIC/native PC/touch and all8 dedicated cold/offline cases
PASS. This is a verified development checkpoint; actual partial GS drawing,
acknowledged-output retirement,06e and physical iPhone acceptance remain distinct:
- Preserve the already-streamed Blob transport, one complete mesh per source/global Morton order and
  every packed predicate. Cooperative packed checking reduces checker-owned
  allocation, returns to input/render tasks and reports its own checking stage.
  Native settlement plus checking remains one queue lifetime; cancellation and
  idle cannot release/adopt early. Independent renderer review findings resolved.
- Five output kinds use the same cleanup-only, exact-owner read capability and
  typed Session/WorkspaceSender command. Delete only canonical unacknowledged
  attempt ZIPs; retain acknowledged ZIPs/all controls/bodies/bases/history. Ordinary
  admission remains strict. Malformed namespace inventory stops cleanup before
  any deletion; invalid bindings remain untouched; lost authority stops removals.
  Project/publication checks and package/Project/artifact reader fences retained.
- One contextual cleanup action remains beside failed output, including when older
  successful history exists, otherwise inside existing history. It retains the
  typed output name and the exact frozen job; no forced draft cancellation or new
  storage-management screen. Fresh normal discovery follows the exclusive lifetime.
- Focused GS/output/import-boundary30PASS; adjacent UI/host/residency121PASS.
  PC/390px touch native preflight bothPASS: real8MiB failed ZIP, separate-page shared
  Web Lock, cleanup, same backup retry/download and browser cold reopening. Final
  mixed acknowledged-history scenario is also covered by the final V2 runs below.
- V1 root checkpoint:3413PASS/21 existing TODO in153files,994.59s root suite;
  typecheck/all five serial builds/offline isolation/HEIC isolationPASS. Source/test
  and copied artifacts are bound by the local candidate manifest. No source-control
  staging or prose change alone requires repeating this evidence.
- Additional connected UX finding: a failed named backup's matching form remained
  choicePending even after successful retry/download, blocking drawer close. The
  existing connected test reproduced it. After retry, only the exact generated
  backup matching the current token and normalized name consumes its form; a new
  different name remains. Both focused regressionsPASS. PC/touch final assertions
  now include closing the drawer. Independent read-only UI review has no findings.
  This substantive fix receivedV2 final qualification; it is not merely a prose retry.
- V2 root checkpointPASS:3414PASS/21 existing TODO in153files;1187.03s root suite;
  typecheck/all five serial builds/offline isolation/HEIC isolationPASS. V2 native
  PC/touch2PASS includes prior acknowledged output, real8MiB orphan cleanup, shared
  observer, same job retry/download, matching-form consumption, drawer close and cold.
  V1 Desktop5PASS includes the500k whole five-purpose/return/copy/restore/cold flow
  and PC/phone reading during output. Source hashes prove V1→V2 changed only retry UI
  and its two tests; renderer/storage qualification is unchanged, not silently rerun.
- Extra selected-generation driver initially exceeded its original15s quota-display
  condition after restore; preserve that failure. A separate timings-enabled diagnostic
  kept every original15s comparison, recorded zero breaches, and completed restore →
  shared-reader-preserved8MiB file → cleanup → retry/download/close/cold. One observation:
  quota display14.193s, cleanup7.052s, retry-to-download6.872s. This demonstrates the
  functional path, not stable performance acceptance. Small-save10s remains unmet.
  The spinner includes generation plus post-error output discovery. Generation took
  10.070s, total13.739s; repeated selected-generation audits are the code-backed
  candidate, not a proven artifact-lock deadlock. OPFS list is already prefix-pruned.
- At the GS checkpoint [06e](../docs/specs/06e-selected-generation-output-read-proposal.md) was PROPOSED:
  three pure output observations with per-observation opening/closing audits. Current
  06b exceptions do not ratify this extension. No write/readback/Journal-write/publication/
  restore fence is consolidated. Stop only that new timing contract pending PO
  decision; the existing safe implementation received its own delivery qualification.
  PO's subsequent approval and implementation are the current boundary above;
  this retained checkpoint description does not renew that approval requirement.
  Independent proposal review clarified the already-existing outputOverview wrapper,
  non-adopting same-fs/factory Session projections, no adoption before closing, and
  the external-control ABA detection limit; all findings addressed. No06e code added.
- Exact tested V2 immutable offline candidate is served at http://127.0.0.1:4191/.
  All20 served file hashes match the candidate manifest, and all25 changed source/test
  files still match its source/test digest. Sample remains local at
  `.artifacts/fixtures/quality-pass/sample-project.zip`. No private source/evaluation
  material is included in tracked delivery. Source/test equality, rather than unchanged
  prose or staging, controls the need for repeated runtime checks.
- Dedicated cold/offline8PASS in12.1min (run1794108386311-34748): browser/server fully
  stopped; Mesh/Point/500k SH4/Proxy/media edits, file output, same history and initial
  conversion; root/subpath same-build cache repair; two-window update with draft
  preservation and wrong/missing/interrupted resources; scope/foreign-cache protection;
  Project-storage startup failure and safe own removal. Original static return retains
  source/history and unrelated cache. This is separate runtime evidence from builds.
- Checkpoint scope: source/test staged content must matchV2 manifest; filtered public
  todo/review exclude the pre-existing165/86 private lines, retained unchanged locally.
  No fixture/profile/original/evaluation file is staged. Push onlyg0-baseline, whose
  verified workflow triggers CI rather than Pages; Git owns checkpoint identity and
  Actions the exact-commit CI result. No main/Pages/release activation.

The500k full workflow also shows pre-existing high-impact latency: create-to-ready
59.6s, Review-copy editor188.4s/display200.1s; its copy command169.2s and later backup
70.5s. These are single connected-workflow observations, not controlled before/after
comparisons. Renderer-only readiness improvements must not be sold as end-to-end
file-import/copy improvements. Next performance work follows these larger user waits.

Owned500k SH4,178002206B, Windows dedicated Chromium156,800×600 DPR1,
same source/browser/instrumentation; each sequence uses three isolated profiles.
Values milliseconds; median followed by all runs:

| Stage | acdfd89 baseline | Cooperative checking |
| --- | --- | --- |
| Complete 3D readiness |5376.2 [4950.9,5376.2,6434.8]|2920.4 [3007.0,2778.9,2920.4]|
| Packed verification including yields |3643.8 [3189.5,3643.8,4412.9]|1037.1 [1037.1,1033.3,1097.0]|
| Native decode plus setup before first checked row |1141.9 [1141.4,1141.9,1402.5]|1222.0 [1265.4,1122.6,1222.0]|
| Sort/display after last checked row |619.4 [620.0,590.5,619.4]|623.0 [704.5,623.0,601.4]|
| Longest observed frame gap |3649.2 [3195.0,3649.2,4420.5]|597.7 [683.3,597.7,581.7]|

All six final800×600 RGBA hashes match; every run checked500000 rows/full SH4.
The inspection source is unchanged. This is one Windows synthetic-source sample,
not Safari/RAM/throughput qualification. Remaining initial sort/upload frame gaps
are visible, not relabelled as100ms compliance. Raw records remain local under
`.artifacts/e2e/gs-output-lifetime-20261108/gs-proof/results/`.

Meta-audit: rejected the stale full-raw-copy premise after inspecting pinned worker
streaming. A four-point equal-depth SH4 probe shows full global order vs raw2+2
pages changes15230 RGBA components (maximum15/255). Thus a partial-render profile
is not activated or described as implemented. Preserve the accepted full-quality
renderer while improving the measured synchronous stage. A later paging connection
needs an ordering/quality solution and its actual profile gate. Likewise acknowledged
output ZIP retirement remains separate: current download/base/recovery depends on
those bytes. This unit makes no wire/schema/capacity/adoption/release change.

Stop only the affected genuine profile/quality, substantial architecture/schema/
compatibility, new dependency or destructive-authority decision. Do not merely
repeat old 'cleanup unapproved' now that the user requested it. If an existing
binding contract conflicts with the necessary deletion/rendering semantics, make
that precise rule and concrete safe alternative reviewable before asking.
Physical iPhone Safari memory/thermal/IME/native-save/offline evidence stays pending,
not inferred from Windows touch, SDK counters or two-point proof. Continue other
in-scope work while physical evidence is unavailable. No retries, dropped safety
checks or longer deadlines to relabel failures.

## Completed boundary —mobile large-data work and storage capacity

Status2026-11-08: implemented and independently reviewed; final V8 local checks
PASS at fixed source/test/contract inputs. Git owns the g0 checkpoint identity;
GitHub Actions owns its exact-commit CI status. Confirm that status when reporting
Push completion. The remaining engineering scope below is not release acceptance.

PO accepts mobile large-data handling/storage capacity, practical latency, then
candidate delivery. Compare against411710c. One writer, bounded read-only reviews.
Preserve originals/full quality/full SH, offline, typed Session commands, identity
and every existing write/readback/publication/recovery fence. No new dependency,
wire/source format, capacity guarantee, canonical-data GC or main/Pages/release.

Outcome: retain drafts and the same output job through native capacity failure;
release owned temporary resources; remove measured unnecessary startup/pure work;
verify actual file/cold/offline continuation and deliver the exact tested build.

Implemented:
- Scratch cleanup attempts every owned path, joins concurrent release, retains
  failed debt and retries it before allocation. Successful live leases are safe.
  Browser teardown attempts all owners independently and preserves their errors.
- Native testing found a fresh0B receipt after createWritable quota rejection.
  [02 §7.0.1](../docs/specs/02-storage-package-migration.md) compensates only before
  acquiring a writer, under exclusive fresh ownership and same-entry/empty checks.
  Existing/torn/nonempty/unreadable/lost-owner/postwriter/write/close ambiguity
  remains strict repair. Project/generation wrappers forward the ownership port.
- Header/detail show one matched capacity explanation, keep input/the same job,
  distinguish inspection budget and later integrity errors, and warn that deleting
  site data also loses browser resume data. No uncertain file becomes accepted.
- Automatic reopen inspects only the exact strict-string remembered namespace,
  retaining all selected catalog/recovery/job checks and fresh Host opening.
  Full selector/import/fallback discovery remains; targeted results never mark
  the complete catalog loaded. Invalid coercion and post-disposal updates refuse.
- Contribution verification parses its owned base once inside one invocation.
  New/exported calls still verify anew, retaining summary/closure/opaque/budget
  and hostile mutation checks ([06 §8.2](../docs/specs/06-project-package-wire.md)).
  No cross-operation cache or caller-supplied trusted proof was introduced.
- History selection skips self-comparison for one already validated candidate;
  clone/shape/identity/DAG/head and multiversion work stay intact
  ([05 §3.4](../docs/specs/05-project-scene-team-workflow.md)). Broader source/original
  audit merging was rejected because raw overwritten values must remain checked.

Executed final verification:
- All3395 executable root cases PASS/21existing TODO (3416declared),151files.
  Standard npm test, verbose+JSON/fail-fast, local Windows1worker, existing30s
  default and existing case overrides; no retries/exclusions/deadline increases.
  Internal concurrency cases remain. CI's existing2worker lane is separate evidence.
- Required checkpoint commands ran serially: typecheck, complete root, normal/
  harness/validation/Desktop/offline builds, offline isolation. HEIC isolation PASS.
  Root2693.17s; checkpoint2806.581s. This is the required command sequence, not a
  literal invocation of the opaque check:checkpoint wrapper. Do not equate the
  longer whole-suite duration with an app action or compare unequal load as speedup.
- All8 normal-SW offline cases PASS13.8min: boot/base repair, two-window update,
  missing/wrong/interrupted resources, bootstrap/foreign-worker refusal, mixed
  Mesh/Point/500k SH4/Proxy/photos, edit/save/full-close/cold and ordinary return.
  Mixed flow11.2min is the whole many-output scenario, not one action's latency.
- Current immutable offline artifact: selected Desktop4 PASS3.2min, no retries:
  native quota recovery PC18.0s/touch16.9s, Review→editable-copy/save/cold26.5s,
  receive-interruption/reselection/local edit/restore continuation1.7min.
  These are whole-case times. Prior411 Desktop48 is prior, not current full50 credit.
- Fresh4191 delivery2 PASS43.3s: small backup and8192²-original image backup;
  actual received HTML/JS hashes and all20 served files match the frozen candidate.
  Original image decodes8192² and renders8192CSSpx at native view; closing returns
  focus. These SW-blocked delivery checks do not replace the normal-SW offline lane.
- Focused metadata/package/atomic/lifecycle/OPFS/input and25 named-resume cases
  support the final full-root. Independent review findings, including deferred
  fallback cleanup/disposal and strict scope validation, are closed.
- Post-check documentation formatting removes exactly one terminal blank line from
  01e; the tested hash plus that exact-byte difference is retained separately.
  Runtime source/tests/config/artifacts are unchanged; no runtime rerun is needed.
- Private evidence: `.artifacts/e2e/mobile-capacity-20261107/final-v8/`,
  run1794082419601-51660, source/candidate/served hashes and delivery screenshots.
  Earlier V2–V7 failures remain retained, never relabelled PASS. V7 was7/8 offline:
  final ordinary return exceeded20s. V8 retains that assertion and now passes.
  Fixture02 provenance stayed bound to its reviewed Git-index bytes. Test fixture
  consolidation retains07m's two actual returns and all original fault assertions.

Action measurements (individual observations; variable load, not guarantees):

| Browser action | Earlier | Final |
|---|---:|---:|
| Same retained-profile ordinary reopening, navigation→global idle |24.783s|15.649s|
| Its catalog discovery |12.797s|5.169s|
| Small original output, enabled primary→download event |4.638s|1.956s|
| Small Review edit-copy output, same endpoint |9.808s|4.245s|
| Its reopened output, same endpoint |8.910s|4.749s|

The retained source profile is copied independently at its original loopback
origin; preliminary targeted measurement19.107s is also retained. Only the final
reviewed build supplies15.649s. Small-output comparisons use the same synthetic
fixture/operations, not identical random actor/file identities; archive audit and
OS picker time are excluded. Actual saved-file plus idle endpoints are separately
recorded2.236/4.405/4.935s. The observed small cases fit10s; this is not general
large-file acceptance. Whole-suite load was not controlled; a late sample was71%
CPU/free30.5GiB. Earlier synthetic recovery26.21→21.28s and private comparison
counts are diagnostic, not browser/Safari evidence or isolated causal estimates.

Candidate: `http://127.0.0.1:4191/` serves immutable
`final-v8/candidate/offline-desktop-dist`; rollback V9 remains local. No forced SW
activation or personal4182 access. Small and8K synthetic samples stay local under
`.artifacts/fixtures/quality-pass/` and `.artifacts/fixtures/safari-residency/`.
Keep251 pre-existing private draft lines and all original/audit/profile files local.

Next / genuine boundaries:
1. Advance SH4 loading ownership/full-quality/scale/disposal evidence. The public
   API proof ([01b §9](../docs/specs/01b-gs-proxy-project-scene-proposal.md)) passed
   two1-point pages vs full2-point PLY: exact rows/all24RGB coefficients and zero
   image differences in two512×256 views; SH3 negative control differs. Cancellation
   transfers0/disposes1/owns0 pending. Partial SDK counters do not prove total RAM
   or native idle. This is not500k/mobile/LOD/paging/adoption acceptance; the pinned
   standard page generator drops SH4 and cannot be adopted unchanged.
2. Large-data output/initial preparation still need comfortable-action measurement
   and optimization. Retained-output cleanup needs precise live-reader and durable
   recovery authority: acknowledged ZIPs remain return/recovery proof; URL revoke
   is not download completion. No prefix sweep, canonical deletion or new durable
   job rule is authorized by this cleanup repair.
3. Physical iPhone Safari/PWA memory/thermal/jetsam, IME/codec/native save/offline
   acceptance is pending, distinct from Windows touch/WebKit. Runtime audit reports
   zero known vulnerabilities with unchanged dependencies; it is not a full security
   or device acceptance. Ask only for genuine new product/architecture/compatibility/
   destructive/release authority; device absence does not block other in-scope work.

## Completed boundary —Safari image and3D residency

PO2026-11-06 authorizes thumbnails, on-demand reads and simultaneous-residency
control while preserving original bytes, full-quality explicit originals, offline
use and all save/recovery fences. Compare against8c7fc3c; one implementation
writer with bounded read-only resource/lifecycle/contract reviewers. Retain the
existing private audit drafts and source samples locally.

Outcome: browse small images and open/close full-quality originals without
unnecessarily retaining/decompressing photos and3D together, including hidden
pages, rapid switching, cancellation and resource failure.

1. Review the connected media/viewport lifetime and accepted01i contract before
   editing. Measure representative actual decode dimensions/concurrency/retention,
   thumbnail reuse, photo+3D transitions and offline cold reuse using owned profiles.
2. Record precise resource ports and acceptance before implementation. Reuse the
   existing queue/ledger, typed commands and binary I/O. Prefer UI-only derivatives
   and source-bound lifetimes; no new source format/recipe or original alteration.
   No new dependency, blanket file cap, Safari capacity guarantee or release.
3. Implement the connected flow, preserve camera/pins/drafts/focus/quality, visible
   preparation/retry and non-abortable native cleanup. Verify missing/corrupt/stale
   derivatives never grant source authority or silently replace originals.
4. Focused fault/lifecycle tests and actual PC/touch/installed-browser image/model
   flows, offline/save/cold/body hashes. Then independently review the meaningful
   final diff, run checkpoint/isolation serially, verify preview, suitableg0 push
   and exact-head CI. Do not mask failures with retries/deadline relief.

Physical iPhone Safari/PWA peak/residual memory, background/jetsam, codec, IME,
save and offline acceptance stays separate. Installed Windows WebKitr2370 has
the retained0B OPFS reproduction before media; never bypass saved-byte checks.
Stop only a genuinely new storage/compatibility/product policy or contract conflict;
continue other authorized improvements. Evidence is private under
`.artifacts/e2e/safari-residency-20261106/`.

Automated source/browser qualification completed2026-11-07. V9 freezes687 source/test inputs after the
renderer-owner correction and independent review. Standard check:checkpoint
PASS:148files/3362tests/21existing TODO; units1047.32s, complete checkpoint1157.371s.
All five builds, offline isolation, HEIC isolation and Pages-base build PASS.
Original Desktop48 PASS with zero retry/failure/skip,6861.818s (about114m).
Offline8 PASS,738.428s; matched8K/installed-browser lanes PASS. All original
browser cases pass with no retry/failure/skip. Delivery verification follows below.
V8 is retained failed evidence, not qualification. V7 is supporting evidence only.

Delivery PASS: immutable V9 offline candidate at `http://127.0.0.1:4191/`, all20
served files match its recorded hashes. Two fresh owned profiles actually restore
the small sample and the3150979B synthetic8K backup; editable record/model and
8192px original/zoom/focus PASS,44.1s total. The latter is locally available at
`.artifacts/fixtures/safari-residency/high-resolution-8k-backup.zip`. No remote
request/error; this delivery check blocks SW and is not offline evidence. The
separate offline8 above owns that evidence. Private originals,251 draft lines,
source archives/profiles/netlogs and.artifacts stay out of public staging.
Git owns the suitableg0 checkpoint identity; its exact-head CI result lives in
GitHub Actions. No ordinary-entry/adoption/release or physical-device gate is
inferred from this checkpoint.

V9 matched8K six conditions PASS: same PNG input in the model and attachment,
Chromium before/after fine pointer and touch, independent installed Chrome/Edge.
Touch original display held model ImageBitmaps1→0; observed peak bitmap pixels
134,217,728→67,108,864. These are instrumented bitmap observations, not total RAM
or GPU bytes. Original-ready2711→2462ms;3D-return45→1789ms (one observation per
condition, no speed guarantee). PC2266→2590ms/return88→44ms; Chrome2521/44ms,
Edge2717/46ms. Actual original decode,100%/pan, source hashes and saved history
pass. No background thumbnails remain during the original modal. Full Desktop48
and offline8 also pass. This qualifies the tested Windows/browser conditions;
physical iPhone/Safari and broader adoption remain pending.
V6's185m/43PASS+5FAIL is retained; changed runtime/profile/source conditions mean
this114m complete run is regression throughput evidence, not a product latency
or isolated cause guarantee. Assertions/deadlines/workers/retries stay unchanged.
The main media/retirement implementation, Review handoff and readonly preflight
cancellation are independently reviewed. V7 standard check:checkpoint PASS:148
files,3349 tests,21 existing TODO, unit912.11s; five builds/offline isolation plus
HEIC isolation and Pages-base build PASS. Existing Node24.22.1 is explicit for this
condition; no assertion/timeout/retry/config relaxation. The original Desktop
runner freshly rebuilt both artifacts inside its unchanged120s preparation fence.
Its first9 cases pass, including500k SH4 replacement/two original generations/
cold restart and PC/touch photo detail/source hashes. V7 was subsequently
interrupted as explained below and has no aggregate browser PASS of its own.

V7 browser qualification is deliberately INTERRUPTED after9passes, while case10
was in progress; no case10 assertion failure or aggregate PASS is inferred.
Independent lifecycle follow-up found a concrete owner-handoff gap: after closing
an original with native decode pending, synchronous UI disposal discarded the
media retirement Promise and a new workspace could allocate GS first. Image and
GS queues are separate. The correction joins exact old media/viewport retirement
through UI/product/Review disposal and awaited closeCurrent, retaining synchronous
abort/DOM removal, idempotent joins, safe failure and all storage fences. V7 and
its evidence are retained. A held small native decode verifies Project/Scene
handoff and repeated disposal, without another giant fault-combination roundtrip.
The owner-handoff correction is now implemented and independently reviewed:
shared retirement through viewer/core/product/Review, awaited restore/mount-failure
replacement, abort-before-wait, persistent selector failure and independent host
closure. DeferredViewport also retains retired concrete runtime idle promises,
serializes replacements/new canvases, rejects stale attachment and sticky cleanup
failure, and keeps an error/retry port after a failed pre-attached construction.
Normal Scene navigation reuses its core and retains the pending photo job.
Focused real application-port Project/Scene/Restore +failure/retry checks:7PASS;
UI/GS/import regression:99PASS; subsequent bridge/viewport/media/import:83PASS.
V8 standard checkpoint stopped in units:3359PASS/2FAIL/21existing TODO,
148 files,1380.39s. Caption-parent/duplicate recovery exceeded its unchanged30s
whole-case fence; GLB-copy UI acknowledgment exceeded incidental1s polling.
The exact two pass alone in15.426s/19.122s; this does not erase the mixed-run failure.
Fixture completion now observes actual receive status, not a button disabled
for several unrelated reasons; the two GLB operations use existing acknowledgment
notifications. No timeout, retry, worker or assertion relaxation.

Follow-up review found that stopping a presentation race could discard the
underlying factory Promise. Root now owns render-only jobs through late disposal
and exact resident idle, forwards that capability across restore wrappers, and
keeps construction cleanup failures distinct from retryable load failures. Abort
current owners before joining; IME composition is not a resource teardown job.
Focused first-restore/late factory/native idle/failure and the two retained failure
flows PASS9 before V9's completed standard checks, original Desktop/offline and
matched8K/Chrome/Edge lanes. Earlier PASS is supporting evidence only for the
source it actually tested.

V9's500k flow now completes all five purposes, return, Review editing, restoration
and cold restart (23.2m for the whole automated scenario). Its actual Review-copy
step takes169,738ms to edit and183,260ms to3D. This remains a latency weakness;
whole-scenario duration is not a single user-action time. The interrupted V7
observed197,717/214,046ms; differing runs are not a controlled improvement claim.
Neither number is the small-input12,515ms diagnostic.

Retained failed conditions: the original globalNode24.12 unit runs include CLI30s
and worker/RPC failures; the Vitest scheduling experiment was reverted. A direct
same-CLI probe hangs with that executable but exits as expected in2.48s using the
already installed Node24.22.1. This does not isolate version from executable/cache
conditions. Final standard unfiltered check uses that explicit runtime with only
its children's PATH prefix changed; global settings, assertions and timeouts stay.

The complete V6 Desktop run1794005165709-12468 was43PASS/5FAIL, zero retries/skips,
3h5m. Native10 Review-copy exceeded240s; Native selection exposed a disabled cancel
before its first64KiB/ZIP classification; two body-input actions and one create
button timed out before their downstream assertions. These are retained failures,
not82 separate feature defects or proof of failed downstream package semantics.
Read-only input diagnostics passed at their original15s limits; complete affected
workflows still require final candidate execution.

Native10's92,846B input was measured using the same artifact/runtime and original
240s limit: active Review copy exceeded240s, existing full3D retirement yielded
an editor in12,515ms and restored3D. SHA work was59ms; native filesystem callbacks
were the dominant wait. Bare-profile listing was already fast, so no OPFS prefix
optimization/cache or validation-fence change was adopted. Review copy/Scene-add
now retire their owned3D and await idle before handoff, restore on failure and
refuse handoff after cleanup failure/disposal. Focused tests cover both held
handoffs, mutual exclusion, failure and disposal. Initial readonly sniff/ZIP
classification now shares the existing cancellation owner; execution remains
owned until pending native work settles, with source/generation/draft checks and
all durable-opening boundaries unchanged.

The owned Temp browser fixture replaces only newly allocated synthetic profiles;
paths persist through cold reopen, checked success removes its owner and failure
preserves evidence. No user's browser/4182/profile/settings were touched. Original
startup traces include107.7s before one app request; fresh synthetic profiles
reached controls in327/531ms. This does not identify disk/encryption/AV causality.
V6 large500k and photo PC/touch source-hash workflows passed, but those passes do
not erase the five failed scenarios or substitute for the changed final source.

Final required checks ran serially on V9. Retain prior failed logs/configs/profiles
under the private evidence directory. Reuse immutable artifacts only with exact
source/build-input/file-hash proof; do not count collection or a stale preview as
execution. Preserve the user's251 private draft lines locally and exclude them,
source ZIPs, netlogs and artifacts from public staging. Physical iPhone acceptance
and release remain separate.

Next engineering step: measure the remaining large Review-copy source capture,
initialization and publication waits, and3D reconstruction after original viewing.
Retain source-only/no-decoded-cache lifetimes and all write/readback/recovery
fences; stop only a genuinely new contract or product decision. Group physical
iPhone Safari/PWA checks for8K/multiple images/GS, background/foreground and OS
memory termination, IME, real file save, and fully cold offline launch. Current
bitmap observations are not actual Safari RAM/capacity acceptance.

## Completed boundary —bounded output integrity and boot recovery

PO2026-11-06 approves06b§6.2 and09§10, through implementation, independent review,
automated safety/elapsed-time evidence and a suitable g0 checkpoint. Compare
againstc9a0940. One implementation writer; bounded read-only design/security/
Safari reviews. Keep private audit drafts and source samples local.

Outcome: save a completed Review editing copy without repeating the same archive
scan inside one ready check; reopen the same offline app after a boot resource is
missing/corrupt when the exact original build can be fetched and verified.

1. Record approval and precise ports/lifetimes before implementation. Measure the
   existing Review backup workflow on the same500kSH4 artifact/history; distinguish
   whole scans from nested stage durations. Keep3fresh ready fences and all capture,
   write/readback, artifact verification and retry/cold checks independent.
2. Share only PackageArchive integrity for exact artifacts inside one outputReady;
   repeat metadata/recipe/binding/Start/Journal/publication/CAS checks. No global
   cache, Session-wide read operation or retained archive evidence. Preserve failure
   state and closing/owner checks; verify stale/foreign scopes and tampering.
3. Implement same-build manifest/SRI boot repair with per-resource single-flight,
   independent cancellation and cache readback. Read-only checks never fetch;
   no unknown-URL fallback, foreign cache/Project writes or forced activation.
4. Audit Safari RAM separately from storage quotas and Desktop admission budgets.
   Fix proven redundant ownership/copies within accepted01i lifetimes; use local
   WebKit representative evidence without claiming iPhone/Safari/jetsam acceptance.
   New mobile capacity policy/numeric guarantees remain a genuine decision gate.
5. Focused service/fault and real browser tests; root/subpath cold boot repair,
   offline failure, ordinary cold edit/save/resume, same-file timed backup and
   body/history checks. Then final independent diff review, full checkpoint and
   offline/HEIC isolation, relevant Desktop integration, served artifact and
   suitableg0 push/exact-head CI. Heavy runs are serial; no retries/deadline relief.

Stop only the affected path for a specification conflict, genuinely new product/
capacity/compatibility policy or environment denial. No new dependencies, formats,
recipes, release or public source fixtures. Complete other authorized improvements.
Evidence stays private under `.artifacts/e2e/quality-followup-20261106/`; executed
results and next actions are maintained here, not in a second task matrix.

Completed regression follow-up: keep pin-task actions visible while its content scrolls
on short screens, including context loss. Preserve warnings, eligibility and44px
targets. Diagnose the phone's consecutive scene/whole download failure using passive
click/phase evidence; no deadline relief or automatic retries. Recheck these routes
before final delivery and review the substantive follow-up diff independently.

Implemented and automatically verified at candidatev3. Independent final review has
no mandatory finding. Safari/iPhone acceptance and general release remain pending:

- Each outputReady scans3distinct artifacts once and rebuilds current semantics;
  next ready scans again. Keep3fresh ready fences, capture, write/readback and
  recovery independent. Tampering/changed controls/foreign or expired owner/
  cancellation/closing audit/unawaited reads are rejected in focused checks.
- Boot repair focused46PASS and full offline8PASS, including enhanced
  SW-response/cache-hash assertions for root/subpath/parallel repair.
  Read-only inspection never fetches. No foreign cache/Project writes or activation.
- Same178,011,532B/500kSH4 Review, matching initial closed profiles/history,
  dedicated Chromium1440x1000, one timed output each; OS chooser excluded:

  | Observation (seconds) | c9 before | after |
  |---|---:|---:|
  | Page open to3D ready | 62.454 | 92.525 |
  | Save action to download event | 185.147 | 100.393 |
  | Save action to actual file obtained | 190.231 | 117.476 |
  | Three separate ready checks combined | 135.912 | 44.836 |
  | Source capture | 25.446 | 34.238 |
  | Generated ZIP inspection after writing | 4.477 | 3.550 |
  | Closed browser to cold body displayed | 41.003 | 41.425 |

  Stages can nest; do not add this table. After has9actual fresh archive scans,
 3per ready. Both actual ZIPs inspected; proof/token/all2original changes and
 3body refs match, each bodySHA256 checked. Save improves; startup/capture remain
  heavy and these single observations are not a capacity or timing guarantee.
  Preserve the first after startup240s failure and c9/current bounded diagnosis;
  no deadline was raised. Before driver failed after download on missing Node
  Automerge initialization; its retained output was validated in a separate cold
  continuation, without rerunning output. Helper failures remain in private logs.
- First full checkpoint stopped at6FAIL/3242PASS/83skip/21todo in1805.10s.
  Replace obsolete public-read call counting with primed cold Session + stale
  token/missing-publication refusals and unchanged output files/job IDs. Existing
  display/base checks remain. DOM2/07m2 failures pass focused under unchanged
  waits; sceneCore12PASS. No hidden retry/exclusion/deadline relief.
- Verifier preparation was12.640s, of which7Git startups cost12.60s. Use actual
 2commit fast-import plus index synchronization in3startups:2.870s forSHA1 and
 3.084s forSHA256. Exact root tree/parent/3added files and per-case independent
  copies are checked;83cases PASS in511.18s under original10s/30s conditions.
  Marks retain40/64-digit compatibility. Cleanup awaits owned setup before removal;
  it cannot turn a timed-out preparation into PASS. No FS parallelism added.
- Windows WebKit r2370 refused small-project creation on saved-content mismatch;
  native5payload diagnostic returned0B after successful write/close, with correct
  input Blob bytes/stream. Keep rejection; this is not a proven RAM or Safari bug.
  Photo/save/cold acceptance remains pending beyond creation. Removed only the
  second private nonoccurrence GLB copy; padded/caller-mutation/bitmap cleanup
  checks pass. PC raster budgets remain on phone; iPhone peak/residual/background
  acceptance is pending, separate from disk quota and mobile Chromium evidence.
- Independent reviewers resolved lifetime, timeout, unused-body and fixture marks
  findings; no mandatory final production finding remains. The complete native-Git checkpoint passes148files/3331tests/21knownTODOs
  in1108.13s, plus typecheck/all5builds/offline isolation. Offline8PASS in968.998s
  with stronger SW-response/cache-hash assertions, full shutdown, mixed500k and
  preserved history. Integrated Desktop7 has5PASS/2FAIL: the full500k all-output/
  return/Review-copy/restore/cold flow passed26.1min and Native10 material flow
  passed17.2min. Retain the phone's15s consecutive-download timeout and the
  short720x500 context-loss pin Cancel clipping failure. No full7-case PASS claimed.
- Pin content now scrolls separately while44px actions remain visible, with
  warnings/eligibility/canvas extent unchanged. Independent review has no finding.
  The original phone and record/camera cases then2PASS in2.5min. Phone scene/whole
  download handoff4.811/7.261s under unchanged15s; a passive diagnostic before the
  layout fix passed7.387/11.169s. Its whole path measured generation7.612s,
  overview2.476s, download1.028s. No silent-click race reproduced or proven fixed;
  host timing varies and neither input-deadline relief nor automatic retry is used.
  Empty-scope audit cost is not isolated; retain the reviewed integrity path rather
  than introduce a second authority lifetime for an unmeasured gain.
  Candidatev3 differsv2 only in pin-task DOM/CSS. Final checkpoint PASS in1000.575s:
  typecheck,148files/3331PASS/21knownTODO in906.42s, all5builds,14-resource offline
  isolation. Pages-path build and HEIC isolation also PASS. No test exclusion,
  automatic retry, wait extension or weaker safety assertion.
- Healthy empty-home cold offline startup, same owned browser/profile/build per
  phase, closed browser/server,3trials including browser launch. Before home:
 871/974/829ms (median871), readiness919/1023/880ms (median919); after home:
 980/990/998ms (median990), readiness1040/1086/1054ms (median1054). Do not claim
  startup speedup or Ki84/device evidence. Missing boot assets formerly refused
  even online; current root/subpath HTML/entry repair reaches checked Project in
 2.622–3.750s. Fully offline missing assets, wrong200 and redirects still refuse.
- Installed Edge156.0.4314.58 and Chrome156.0.8078.80 each PASS representative
  missing-HTML repair, offline/wrong200/redirect refusal, actual save/full close/
  resume and exact original changes/body inventory. Restore2.849/2.159s; these are
  small owned profiles, not the full four-damage cohort or physical mobile tests.
- Verification/source hashes and actual failures remain private. Candidate4191
  serves an immutable root-base copy; all20HTTP file hashes match. Fresh synthetic
  sample restoration is checked separately from SW/offline acceptance. No forced
  activation, Project migration, user4182 changes or general publication.

- The second unfilteredv2 run has3330PASS/1FAIL/21todo in2285.39s: only the
  external-fixture-locator CLI exceeded30s. All product/fault/DOM/material cases
  pass. Same Git2.53.0 core/version/effective config were compared without logging
  config values; using its native executable before the launcher in this process's
  PATH makes that exact case PASS in4.12s. No machine setting, assertion, timeout,
  retry or exclusion changed. The complete final checkpoint passes with that
  recorded driver condition (same source/tests, no exclusions or auto retries). Previous failures are retained, not called full PASS.
  Installed Vitest also overwrites file durations after focused runs; cached
 59.905s placed projectFiles behind longer files. This explains a possible late
  start, not a confirmed dispatch trace; no sequencer/config change was introduced.


Next: measure the still-heavy source capture and cold Review reopening before
choosing further work; no new lifetime extension is authorized by these results.
Qualify physical iPhone Safari/PWA peak/residual RAM, original-photo decode with3D,
background return, IME/save/offline. Windows WebKit's0B write reproduction blocks
that runner before media, not evidence about iPhone RAM. Consider narrower
simultaneous resource residency from those measurements, not blanket file caps.
Keep mobile performance and the phone15s output variability as explicit remaining
risks; do not turn this bounded checkpoint into universal-device/AAA acceptance.

## Completed boundary —PC and phone integrated quality pass

PO2026-11-05 approved open/search/record/save/share/resume improvements against
939d8a6, through independent review, automated verification and suitable g0 push.
Root is the sole implementation writer. Preserve originals, history, typed
Session commands and every write/readback/publication/recovery fence. No new
dependency/schema/recipe, decoded cache beyond its owner,10k qualification,
ordinary-public activation or release. Existing private audit drafts stay local.

Implemented as one connected workflow:

- Reuse the fresh settled Host result for receive/adoption/refresh display reads;
  pending, failed, void-result and changed-owner paths remain fresh.
- Add optional fixed-stage initialization/resume/model diagnostics without giving
  the observer authority. Nested durations are not additive.
- Share one readonly report for the exact same Worker within one offline inspect;
  retain final registration/Worker/generation checks and fresh later inspections.
- Keep one visible3D stage above phone Drawing, with bounded rows, narrow-header
  layout and real draft/IME priority. Caption hides still release their resources.
- Clarify3D/search/whole-sharing copy and camera contrast; pre-disclose checked
  portable-media requirements and recheck the completed job. Reuse download URLs
  only for the same job and freshly verified artifact hash/length; every download
  still validates. Distinct jobs may retain distinct URLs until workspace close.
- Allow same-owner/token saved Caption reading/search during output, retaining
  all mutation/switch/receive/restore guards. File close/reopen keeps its job and
  progress; new windows/attachments do not start while reading that saved text.
- Give Review copy/append one handoff owner. Recovery controls register native
  disabled state immediately, so a visible Scene-resume action cannot be ignored
  while opening still awaits its source check. File/owner/readonly guards remain.

Evidence and current checks (private artifacts: `.artifacts/e2e/quality-pass-20261105/`):

| Lane | Executed result and qualification |
|---|---|
| Baseline | Immutable939 artifacts; initial Desktop7-case tour stopped deliberately before the full cohort, not a matrix PASS. Ki84 PC/touch daily3 trials each complete, streamed43-body hashes and closed-browser continuation. Point/500kSH4+Proxy tour4PASS. Phone Drawing cycles13.667/11.512/11.136s,9 new bitmaps each |
| Independent review | UI, resources/performance, safety and later substantive UI/test corrections reviewed read-only; resolved inherited layout, closing-observer and progress-lifetime findings |
| Final Desktop cohort |48 executed:46PASS/2FAIL, no retries/flaky/skips,1.8h. One failure was premature GS fit/pick; the other was one stale exact-copy assertion. All production-file hashes stayed identical for their repair |
| Repaired original cases |2PASS10.4min: full Native07n conversion/edit/2-rounds/all outputs/restore/cold and workspace completion/receive/conflict flow. This is46 cohort PASS plus2 repaired cases, not one all-green48-case command. New assertions were not retrospectively executed in the other Native fixtures |
| GS failure analysis | Retained small source: GS selected/fit/pick all occurred during public loading; rectangle/buffer stayed fixed. Same artifact/input with ready-before-fit, then one pick and visible coordinates, passes59.8s. Fix test preconditions/visibility only; no target/global-ready/renderer-math change. Independent review agrees |
| Phone recovery | Held-mount unit and original browser prepared-Scene resume pass; native disabled state, single explicit resume, saved output/cold and no double addition. Also passes in the full cohort |
| Offline |5PASS9.8min, including browser/server full shutdown, Mesh/Point/500kSH4/Proxy/media, edit/save/cold, initial conversion, update/removal/ownership and retained Project data. Same-source root/A/B/directory-base test builds; not physical-iOS evidence |
| Final checkpoint | PASS17.0min: typecheck;147 files/3304 tests PASS and21 pre-existing TODO; ordinary/harness/validation/Desktop/offline builds; offline isolation14SRI resources. Earlier incomplete checkpoint is not substituted |
| Final additional lanes | HEIC isolation PASS; Drawing cycles0.886/0.788/0.748s with0 new bitmaps, one visible canvas; Ki84 after3PC+3touch PASS; installed Edge and Chrome each actual restore/edit/output/body hashes/closed-browser continuation PASS. Small ordinary create/Caption/PNG/save/reload PASS, create-ready1.437s. Real Ki84390×844 Drawing footer initial/Tab full44px and hit/cancel-selection PASS; no new layout defect reproduced |

All earlier failures/stops remain in the private logs, including corrected
diagnostic ZIP buffering/locator mistakes, a sandbox socket setup that never
started browser acceptance and an overlong diagnostic profile that failed before
GS. Do not count those as product passes or erase their evidence.

Measured limits already known:

- The identical178MB Review pair reaches editor167.051→165.599s and
  display178.464→178.118s (one pair; no demonstrated speed gain). Candidate
  backup155.480s; its existing saved output's3 bodies and cold body29.423s pass.
  An invalid anonymous-Review identity assumption in the private driver failed
  after download; finish that saved profile instead of rerunning the long copy.
- In that backup, separate ready-before/final/finish take39.121/38.227/37.042s.
  Their114.390s sum is not the nested finish/generation sum or promised savings.
  The full-cohort500k copy does pass its unchanged240s condition at162.314s;
  this does not make its waiting time comfortable or a general PC guarantee.
- Small whole output varies:12.619s in one focused run,9.922s in the full cohort.
  Do not declare the10s development target stably met from the faster run.

Remaining judgment boundaries are isolated and **unimplemented**:
1. [06b§6.2](../docs/specs/06b-staging-read-operations-proposal.md): first prove
   actual repeated artifacts, then share ZIP integrity evidence inside one
   outputReady only. Keep3fresh ready fences, capture, write/readback and recovery
   separate. Same-read external corruption detection may move to the next fresh
   check; existing§6.1 does not authorize this lifetime. Reviewed proposal only.
2. [09§10](../docs/specs/09-desktop-offline-candidate-proposal.md): same-build/SRI
   boot-resource repair needs an exception to§8's network-fallback prohibition.
   Missing HTML/entry JS currently cannot reach in-app repair even online. No
   fallback, force activation/reload, Project change or adoption credit is added.

Performance interpretation and next boundary:

- Same Ki84 input/history, dedicated Chromium,1280×720 PC and390×844/DPR2 touch,
  three trials each before/after. Original backup SHA256 and all43 output bodies
  checked; streamed body validation retained. OS chooser waiting is excluded.
  Trial1 contains the same extra Drawing inspection before/after. These are
  observed local timings, not an ordinary-PC/iPhone guarantee or proof of one
  optimization's isolated effect. Preparation measures are nested/non-additive.
- Top resume first text is distinct from ready record controls and ready3D.
  Apply/download remain slower than100ms/1s targets; small output10s is variable.
  Drawing↔3D median11.512→0.788s with9→0 new bitmaps is bounded to keeping the
  existing visible stage; Caption hides still release/reprepare it.
- Installed Edge/Chrome actual backup chain passes, including saved-text reading
  during output135/121ms. No remote request or page error was recorded. This is
  not iOS/native IME/file/thermal, actual browser200% zoom or low-spec-PC evidence.
- Existing21TODOs remain unexecuted: legacy typed evidence/admission policy,
  future envelope/optimized cleanup and real-lock evidence API qualifications.
  They were neither added nor counted as PASS. Current ProjectScene fault and
  two-window browser coverage does not retrospectively satisfy those legacy TODOs.
- Initial restore stages (PCtrial1 seconds): input1.247, model-plan3.547,
  model-stage15.635, journal-stage2.531, prepared-bodies2.406, restore-bodies2.312,
  persist/readback0.643, saved-content0.374, publish1.297, published-readback1.080.
  Model-stage includes actual body work; restore.resume31.045 is a parent, not
  an additional cost. Normal small create has resume stages, not restore-input.
- Top PCtrial1 still spends catalog5.009s, generation-open3.970s and Session-open
  1.152s before model load5.311s(content1.960/decode3.349). Cross-owner reuse is
  not silently added. The next performance work is the reviewed06b§6.2 decision;
  boot repair09§10 is a separate reliability decision. Neither is implemented.

### Matched Ki84 timings

Seconds; entries show trial1/2/3 and median in parentheses. File generation is the
action→browser download event; transfer adds saving that generated file in the
test environment, not a guarantee that every user's chosen disk has persisted it.


PC:

| Action | Before | After |
|---|---|---|
| File preview | 7.512/6.778/8.597 (7.512) | 4.223/4.314/4.157 (4.223) |
| Initial restore: text | 88.304/114.046/97.550 (97.550) | 43.642/46.237/47.443 (46.237) |
| Initial restore: records ready | 127.436/160.538/139.527 (139.527) | 62.776/65.308/67.000 (65.308) |
| Initial restore:3D ready | 127.656/160.795/139.761 (139.761) | 62.871/65.408/67.093 (65.408) |
| Top resume: text | 14.635/15.756/13.386 (14.635) | 5.237/5.380/5.136 (5.237) |
| Top resume: records ready | 34.613/38.104/28.435 (34.613) | 12.386/12.567/12.001 (12.386) |
| Top resume:3D ready | 46.600/52.467/38.424 (46.600) | 18.631/19.409/18.068 (18.631) |
| Apply body | 14.249/35.833/10.786 (14.249) | 7.642/8.053/7.606 (7.642) |
| Generate→download event | 46.010/74.173/59.144 (59.144) | 23.523/24.129/23.691 (23.691) |
| Generate→file transfer | 48.597/77.963/62.704 (62.704) | 24.494/25.762/24.671 (24.671) |
| Direct resume: records | 27.876/36.284/25.562 (27.876) | 10.508/11.732/10.522 (10.522) |
| Direct resume:3D | 40.763/51.048/37.428 (40.763) | 16.846/18.462/16.587 (16.846) |
| Direct resume: edited body verified | 41.343/51.768/38.432 (41.343) | 17.122/18.759/16.914 (17.122) |

TOUCH:

| Action | Before | After |
|---|---|---|
| File preview | 8.583/7.078/7.966 (7.966) | 4.255/4.266/4.358 (4.266) |
| Initial restore: text | 135.238/95.356/117.083 (117.083) | 43.632/43.848/45.303 (43.848) |
| Initial restore: records ready | 179.061/129.066/164.579 (164.579) | 61.665/62.118/64.681 (62.118) |
| Initial restore:3D ready | 193.386/140.523/179.961 (179.961) | 67.483/67.975/71.087 (67.975) |
| Top resume: text | 19.634/12.714/19.849 (19.634) | 5.231/5.296/5.270 (5.270) |
| Top resume: records ready | 42.223/27.828/43.006 (42.223) | 12.031/12.139/12.131 (12.131) |
| Top resume:3D ready | 67.227/51.225/69.960 (67.227) | 23.756/23.360/23.417 (23.417) |
| Apply body | 20.858/17.815/20.513 (20.513) | 7.563/7.487/7.396 (7.487) |
| Generate→download event | 50.459/56.053/59.562 (56.053) | 22.465/22.607/22.465 (22.465) |
| Generate→file transfer | 53.482/61.182/60.985 (60.985) | 23.401/23.585/23.360 (23.401) |
| Direct resume: records | 25.433/28.203/32.905 (28.203) | 11.115/10.825/11.168 (11.115) |
| Direct resume:3D | 46.548/51.025/56.418 (51.025) | 21.740/21.677/21.862 (21.740) |
| Direct resume: edited body verified | 47.391/51.806/57.390 (51.806) | 22.107/22.012/22.195 (22.107) |

Source/test final hashes673 remain fixed after verification. The4191 preview
serves an immutable final artifact; all20 served files match SHA256/size.
The checked synthetic sample is kept locally. Deliver this suitable checkpoint
to g0; exact-head CI status belongs to GitHub Actions and the delivery report.
No private ZIP/audit/fixture is staged; no main/deploy/release.
The local checked sample is synthetic, not the private Ki84 source. Device and
unapproved-contract qualifications above remain open rather than being passed.

## Completed boundary —restore and reopen latency

PO2026-11-05 authorizes this integrated implementation, automatic verification,
independent review and suitable g0 checkpoint. No per-control/Todo approval or
human-test dependency. Preserve originals/history and all write/readback/recovery
fences; stop only a genuinely new policy/architecture/release decision.

Implemented within existing ownership: actual Host passes its fresh ready read
only to settled output discovery; persist returns its own exact-byte-verified
saved source to adjacent resume, retaining content/capability/publication checks
and independent post-publication readback. Specifications07§6 and06a's text-reader
clause constrain these lifetimes; no general Session/ZIP/body cache is inferred.

First restore also exposes checked startup-Scene title/body text after initial
verification while display/Selection/adoption continue. No raw archive candidates,
ordinary workspace, edit/file/image/pin/camera authority or guessed Scene enter
that preview. Scene scope and restore status are explicit; redundant global
selection-cancel chrome is hidden. Existing actual-token/Scene checks gate the
query/selection/focus handoff. IME, stalled render return/ready, failures, late
residents and pre-handoff Host disposal are covered and independently reviewed.

Ki84 Windows Chromium measurements (one local run per fixed procedure, no speed
promise):
| Stage | Baseline | Final integrated candidate |
|---|---:|---:|
| Touch first readable records/text |74.856s|48.211s|
| Touch ordinary records |74.856s|68.858s|
| Touch visible3D after restore |81.792s|75.524s|
| Touch records after explicit-run reload |10.959s|9.342s|
| Touch visible3D after reload |24.923s|20.660s|
Independent PC first text49.975s/ordinary records70.168s/3D70.404s. Separate matched
metadata-only run measured initialization44.936→41.189s and reload overview
2.084→0.396s. Instrumented results are not paired with the earlier uninstrumented
76s/22s. All43 body digests/identity/original bytes and further edits/save/reopen
match; no page errors/external requests. Current-source PC→touch→independent-PC
case passes4.9m; screenshots reviewed. Physical iOS/native-HEIC and actual offline
cold boot are not inferred from these SW-blocked PC/touch runs.

Evidence stays private under .artifacts/e2e/restore-reopen-profile: results is
baseline, results-after is metadata-only, results-text-complete is final UI flow.
Earlier driver/fixture failures and the stopped hidden-search-focus case remain
separate; no automatic retry, deadline relaxation or skipped assertion. Six new
metadata/fault checks and six UI/boundary/lifecycle checks pass; typecheck passes.
The metadata-only full boundary passed147files/3291tests (21existing TODOs), all
five builds and both isolation checks. Subsequent substantive UI changes were
checked at the final fixed nine-input source/test manifest.
Final workflow checks PASS:147files/3295tests,21existing TODOs; Vitest1018.07s,
typecheck, all five builds, Desktop offline isolation and HEIC public-path
isolation. Independent final reviews have no blockers; no source change followed
the final PC/touch flow except documentation/result updates.
The4191 preview serves all15 final non-map resources with exact hashes; receipt
is private `preview-final.json`. Git's current TLS/ALPN issue is avoided with a
per-command HTTP/1.1 setting; certificate verification and user settings stay on.

Remaining: initialization still~41s; canonical model validation followed by later
visible decode is required by current zero-hidden-residency rules. Do not claim
that decoder cost removed or extend06b/06c to model/body caches. Next isolate that
cost and design a safe separation of validation/display work before changing its
contract. Direct-run reopen remains distinct from catalog-only text preview;
catalog results never become actual Host authority. Ordinary release/device and
aggregate adoption gates remain separate. Preserve the private165-line evaluation,
design-review draft and source artifacts outside the checkpoint.

The verified unit is [conversion preparation and recovery](#current-unit-simplify-conversion-preparation-and-recovery).
Current inputs still require the existing recipe identities. Consolidate only
duplicated preparation/decision code, retain exact saved work, and keep the
LociMyu source alive through Session settlement. Focused checks and independent
review, current PC/touch file flows and the final checkpoint pass; that record
retains the first test-prerequisite failure and final evidence.
No new format, dependency, capacity guarantee or release is part of this unit.

### Retained short-PC workflow evidence

The approved06c restore workflow is complete in the bounded PC candidate and
pushed to g0. Its Windows checkpoint, real Ki84 file/cold/independent-resume
evidence, independent reviews, exact preview and actual Linux CI all pass; see
the completed boundary below. This does not pass aggregate device/adoption/release
gates or finish the whole app. Preserve originals, histories and private evidence.

PO2026-11-03 authorizes this connected unit and self-evident follow-on repairs:
fix PCQ-30 so the
Caption list/detail remain useful at1280×720 and smaller available heights with
four Scenes/long Japanese names. Review existing Scene chrome and height allocation
first; use existing controls and typed commands, retain selection/search/manual
scroll/drafts/IME/focus/apply/cancel and viewing-mode behavior. Avoid adding a
separate screen or user setting. Reuse focused UI tests and a representative
current-artifact Ki84 visual/keyboard flow, including narrow/200%-equivalent states;
run final required checks once at the resulting connected boundary. Stop only for
a real new policy/contract conflict or safety dependency. Later restore/image/ZIP
work must keep existing lifetime gates; do not broaden06c or invent guarantees.

Working direction after readonly layout review: measure current d595908 UI using
the immutable39517f6f artifact and a copy of the closed private Ki84 profile.
Keep Scene buttons/management, fit their chrome on one horizontal row with native
scroll and keyboard/selected visibility. Replace absolute Caption row minima by
available-height proportions; contain scroll within the list/detail content and
retain the existing completion footer. Align few-row/empty/short-height branches;
never change allocation merely on focus. Extend the existing responsive browser
case rather than adding large file roundtrips per layout. Root is sole writer;
independent reviewers are readonly. Reuse one final source/check boundary for
adjacent in-scope layout repairs, then safe g0/CI/owned-preview delivery. No format,
storage, renderer, dependency, new guarantee or release change is planned.

PCQ-30 baseline reproduced at1280×720, d595908/immutable39517f6f: Scene chrome
152px, task401.36px but468px intrinsic rows, list111px and detail bottom770.64
outside720. Exact6 loaded app-response hashes match; original private profile was
copied while closed, no user profile/original changed. Evidence is private
`ki84-evaluation/pcq30-before-20261103/before-small.{json,png}`.
Implemented one-row Scene strip, mount-only existing-control toolbar, available-
height read/edit tracks, bounded few-result allocation and intrinsic empty-state
fallback. Scroll stays in the two panes; footer and input/IME ownership persist.
Focused Vitest46pass. Existing4 rendered camera/view/file/cold/offline workflows
pass on the current production UI. The added responsive case initially passed
its dense/filter/IME/cancel checks; its new empty-Scene extension exposed two
test-identity assumptions (already-current first button, then a live false-state
selector changing after activation). Both failed runs are retained; the test now
captures a stable noncurrent name and keeps its assertions. Added native horizontal
wheel→scrollend→unrelated filter check as independently requested. Its final run,
real Ki84 after-layout review and final source/check boundary were then pending.
The final responsive case passes, including Scene-strip manual scroll preservation
and stable noncurrent-Scene switching; neither expected state nor timeouts were
relaxed. Fixed source4605fb3b… (719+7 inputs) matches the20-file immutable candidate.
Real Ki84 at1280×720: Scene chrome152→56px; list111→207.39px; selected detail bottom
770.64→703.98 within720, task scroll497=client497. View/edit/IME/draft cancellation,
native empty media chooser and saved-file match pass at small CSS viewports.
Fresh-process normal-SW cold boot at720×500/DPR2 with offline1/serverOff1/bypass0
gets9 exact current-artifact responses; same Scene/Caption body/save-match retained.
This is CSS/DPR equivalence, not actual browser zoom, iOS or real-GPU acceptance.

Milestone meta-audit: same g0 base/approved UI scope, no storage/renderer/format
change or new safety finding. The original dense-layout failure is repaired and
adjacent empty/IME/chooser/focus cases are covered. Because the shared workspace
UI serves all Desktop workflows, finish the canonical full Desktop and offline
browser lanes once at this fixed tree, then final serial root checks/HEIC and
safe delivery. These broadened checks are pending, not inherited from earlier
sources; retain previous failure records and avoid further source edits unless
a relevant failure/finding requires them.

Rendered independent review found that the720×500 view initially displayed only
previous/next navigation. Interrupted the first full Desktop run after1/42;
it is not a completed pass. Complete the same UI unit with compact heading
navigation, preserved accessible names/warnings, balanced short reading tracks
and a600–760px Scene/tab row. The added strict checks now pass: whole first list
row, selected heading/body and44px navigation at720×500, alongside existing
dense/filter/manual-scroll/IME/cancel/empty-Scene checks (7.8s). Retain failed
pre-refinement runs, including the glyph accessible-name finding; no assertions
or timeouts were weakened. Requalify actual Ki84/current artifact and readonly
review before the final full Desktop/offline/root checks.

Source52b68f91… and immutable candidate-v2 have exact6-response
qualification and real Ki84 review. At1280×720 in view mode, list256.36px and
detail189px both fit the505px task (bottom704); at720×500, first complete list
row, selected heading/body and44px navigation are readable. Scene creation/name
change→cancel works within its own scroll at720×500, without horizontal overflow.
Real resize/IME/focus/draft cancellation, actual empty media chooser, footer hit
targets and unchanged body/save-match pass. Independent code/drawing review has
no further findings. Fresh browser process, offline1/serverOff1/bypass0/allowSW1,
720×500/DPR2 loads9 exact candidate-v2 responses through normal SW and retains
the same body/save-match; browser/server closed before final heavy checks.
The second full Desktop attempt was interrupted after2/42 when independent final
diff review identified two old direct-child tab selectors. Retargeted the existing
sticky CSS and existing focus-boundary test to the mount-only wrapper; assertions
and sticky behavior remain intact. Fresh focused small-screen and complete
model/View/material→external-file→peer-reopen workflows pass (6.5s/22.8s).
Final source8d74d98e…/candidate-v3 is frozen; fresh Ki846-response and normal-SW
offline/server-off9-response body/save-match proofs pass on that exact artifact.
Final Desktop42→offline5→literal checkpoint→HEIC are now running serially at this
source. No aggregate quality, physical device or new speed guarantee.

Final8d74 Desktop run1793650164733-29648 found one concrete adjacent layout
failure at case20, record/camera numeric preview→Escape: original canvas960×934,
held960×901, restored960×934 but raw pixels still differ in the triangle region.
The inline approximation notice adds/removes33px above the display; value100
returns, so do not weaken the pixel rollback assertion or count this as passed.
Retain the full failure images/context; independent readonly cause review is
running. Let the remaining Desktop cases finish before grouped repairs. Keep
the source frozen while they run; later final checks must cover the actual fix.
Readonly pixel/code review separates two findings: original/restored geometry is
unchanged but color differs, and the raster test leaves identical A/B meshes
coplanar. Material cloning can reorder their opaque draw; this is a fixture
confounder, not proved camera corruption. Isolate A through the existing model
visibility UI before raster assertions, retain both-model/reparent tests earlier,
and keep exact rollback pixels/values/history assertions. The independent33px
status layout shift still merits an out-of-flow, bounded readable notice/retry
repair; review placement against floating windows/gizmo/pin form before edits.
Do not claim a causal renderer fix or introduce tolerance, retries or new limits.
The complete8d74 Desktop scan finishes39PASS/3FAIL in6970.9s; canonical result
is runs/1793650164733-29648/result.json. Offline/checkpoint/HEIC did not run:
the serial script stopped at Desktop Exit1 as intended. Failures are record/camera
exact raster rollback, standard-material Apply intercepted by plain tooltip, and
fresh-mesh chroma raster comparison selecting an arbitrary first material option.
The last image shows material2 selected while the sampled lower-right triangle
is unchanged; independently verify fixture face/label mapping before correction.
Group the already reviewed bottom status/pin stack, pointer-transparent readable
help and deterministic raster subjects/selectors. Preserve pointer/keyboard/touch,
exact pixel/value/file assertions and all failure evidence; no source was changed
during the completed scan. Finish focused actual UI/GPU failure/retry/hit checks,
readonly final diff/render review, then final serial checks at the repaired tree.
Grouped repairs pass the original3 cases (run1793657954171-46572): deterministic
source material1, isolated raster subject with unchanged exact rollback pixels,
and actual Apply-through-explanation. Added real context loss/recovery at720×500
with notice/retry/pin/camera/Caption-close44px hits and constant canvas extent.
Bottom-stack and event lifetime/hover/readability reviews have no remaining findings.
Long explanation testing found a genuine touch race: portal layout generated a
stationary mouse boundary event, reverting native touch reading. Retained event
evidence, ignored layout-only boundaries until real move/down/key, removed the
diagnostic logger and preserved the native reader.12help unit tests and the
complete mouse/wheel/keyboard/emulated-native-touch→Apply→file/reopen case pass.
The initial added keyboard-entry failure was a test starting from an already
dismissed focused trigger; it now starts from the real title input and uses Tab.
Final Ki84 review also exposed pale generic hover overriding white-text primary
buttons. The bounded workspace/file hover selector preserves dark backgrounds,
disabled/focus styles; rendered contrast plus existing view/save/reopen cases pass.

Milestone meta-audit: g0 remains on d595908; only UI placement/help/hover and
direct tests/records changed, with no renderer/storage/package/dependency or
product-policy expansion. Fixed sourcef947df74… (719+7 inputs) and immutable
candidate-v5 are the final boundary; real Ki846-response qualification/body and
dark hover are confirmed. Finish draft/cancel/cold checks, then execute the
complete serial Desktop/offline/checkpoint/HEIC at this source. Preserve all
failed/interrupted evidence, the private5633bytes and golden; no release credit.

The fixed f947 Desktop scan finished with41 passes and one failure in6647.4s
(run1793659867510-15376). The old notice-above-Caption assertion assumed the old
placement. The corrected case checks the notice text, full viewport inclusion,
44px close-button width and an unobstructed trial click. It passes in77.0s
(run1793666530285-45452), including the unchanged narrow-photo, edit, conflict,
save and resume checks. The390×844 initial layout shows the full160px photo at
scrollTop0. Follow-up typecheck corrected three style-element type annotations in
the help test. Full Vitest identified one old retry DOM-parent assertion, which now
checks the overlay alongside the canvas and retains the retry and card checks.
The help browser and overlay unit cases passed again. All production inputs match
f947. Desktop evidence is the full scan plus focused passes of affected cases.

Final source/test freeze4be636b5…: Desktop42 cases covered, offline5 passed
in608.2s, checkpoint passed in1042.1s (typecheck,147 suites,3279 passed/21 todo,
five builds and offline isolation), and HEIC public-path isolation passed.
The exact v5 Ki84 cold and small-screen evidence applies to the unchanged product
sources. Browser evidence is dedicated Chromium, with physical device acceptance
still pending.

The approved normal Desktop receive continuation passed (85.1s test,84.3s through return/save) on the final
static Desktop artifact (seven served resource hashes matched). Two isolated
Chromium profiles exchanged actual files. One injected AbortError after durable
binding and before input.zip creation left a recoverable receive. A different
file was refused with the same pending state. The receiver browser then closed
fully, reopened its profile and published the same job after reselecting the exact
original. Its applied Caption body and PNG survived, and the returned Contribution
used the original Workspace as its base. The sender received it, saw both edits,
and saved a backup with the retained original change hashes and exact PNG bytes.
The first driver attempt stopped at model selection before the fault. The passing
driver uses the same focus-then-select action as the existing Desktop tests.
Synthetic GLB/PNG and the existing Playwright setup supply this evidence; there
were no product changes for the recovery check or changes to package contracts.

Delivery: the independently reviewed16-path checkpoint was pushed to g0-baseline.
The local4191 preview serves the verified v5 candidate with20 matching HTTP
resources, and fresh Chromium opened the home file chooser. GitHub Actions
41560782818 passed on that exact pushed tree, including the full test suite,
public-base build and HEIC isolation. Local delivery evidence is retained with
the browser receipts.

### Current performance unit —Review opening and edit-copy diagnosis

The normal PC path now uses the same full, selector-owned ZIP inspection to
route a Review file and to derive its View. Snapshot/closure/model/media
validation, selection fences and all durable copy and recovery checks remain.
The connected DOM test observes one full archive scan. The architecture test
passes with a single type-only archive import at this composition boundary.

One paired browser measurement used the same retained178,011,532B 500k SH4
Review and fresh dedicated profiles. Open action to visible 3D went from32.516s
to27.326s. Copy confirmation to editor was272.650s and276.553s respectively,
both beyond240s. Display completion after confirmation was290.640s and292.555s.
The baseline measured238.603s in the copy command; CPU sampling attributes
about95s to SHA compression self time. This is diagnostic sampling, not an
independent count or a measurement of all repeated archive scans.

The candidate's edited copy wrote an actual backup in268.223s. The first
post-save Node oracle stopped before reading metadata because it had not
initialized Automerge. Follow-up inspection of those exact files verified a
separate Project ID and all three original body hashes (GS/Proxy/PNG); reopening
the same closed Chromium profile displayed the applied Caption text again.
The baseline's separate180s download observation ended before its export
completed. This pair measures opening only as an improvement, and the candidate
copy's extended diagnostic does not pass the original240s readiness condition.

The first two canonical runs timed out in the existing07m LociMyu material
case, which does not enter the changed Review selector. The unchanged focused
case passed in24.47s. Its shared test helper now uses the read returned by each
completed command instead of extra reads to acquire the next token. Both round
trips, all assertions, independent cold reads and the30s limit remain. All four
affected07m/07n cases passed. The final source/test freezebfd515d2… passed the
147-suite checkpoint (3279 passed,21 todo), five builds, offline isolation and
HEIC public-path isolation.

Delivery: the seven-path checkpoint is on g0-baseline. CI41623434024 passed
on that exact tree. The owned4191 preview serves20 matching resources from
the final candidate and opens the file chooser in fresh Chromium. Independent
inspection of the exported backup also confirmed the edited Caption body.

### Current performance unit —500k SH4 edit-copy checks

Measure exact SHA-256 input, scan count and elapsed time by phase on the
normal Desktop route, using the same 500k Review file and a fresh Chromium
profile. Remove duplicate inspection of an already owned immutable input where
this keeps the existing fresh durable verification boundaries. Compare the same
flow before and after, then verify write/readback, saved originals and cold
interruption/reselection. Any change to when tampering or evidence loss is
detected needs separate design review and a Product Owner decision.

Paired same-file Desktop diagnostics through editor readiness, with identical
private instrumentation and fresh Chromium profiles:

| SHA phase | Full ZIP scans before → after | SHA input GB before → after | SHA execution s before → after |
|---|---:|---:|---:|
| Scratch generation/readback | 1 → 1 | 0.71 → 0.71 | 5.7 → 6.4 |
| Fresh durable parent original/copy | 30 → 30 | 10.68 → 10.68 | 83.9 → 84.0 |
| Re-scan of earlier immutable copy during child preparation | 1 → 0 | 0.356 → 0 | 2.75 → 0 |
| Child ZIP readback, journal, completion and discovery | 9 → 9 | 3.20 → 3.20 | 24.9 → 24.4 |
| Remaining SHA work | 0 → 0 | 1.96 → 1.96 | 15.3 → 15.6 |

The candidate derives child input from the unchanged second, fully inspected
parent read. The first parent read supplies only the expected descriptor.
Exactly one full ZIP scan and about356MB of SHA input are removed; both fresh
parent reads and subsequent durable checks remain. Actual editor readiness was
302.983s/304.486s and 3D readiness331.529s/328.217s in these diagnostic builds.
Both missed240s; the paired elapsed samples do not show a copy-start improvement.
Architecture12 and focused Review6 pass, including a same-length ZIP structural
mutation between parent reads, two scans on intact admission, three cold
interruption stages and refusal of acknowledged evidence loss. Independent
review found no remaining issue in the bounded source/test change.

On the normal uninstrumented Desktop build, one test fault before original.zip
creation left the parent bound and the child unstarted. After full Chromium
shutdown, the same profile reselected the exact retained Review file and
finished the same parent/child publication. Reselection to editor took268.863s,
backup212.044s and later cold reopen165.105s. The backup retains all three
exact original body hashes, the same independent copy ID and the new Caption
body, which was also read on reopen. The first driver attempt selected the
ordinary receive region instead of the dedicated Edit Copy region; correction
is limited to the private Playwright driver.

Final source/test freeze64ff4474… passed the147-suite checkpoint (3280 passed,
21 todo), typecheck, all five builds and offline/HEIC isolation.

Delivery: seven reviewed paths pushed to g0-baseline. CI41665725849 passed
on the same commit. The owned4191 preview serves20 matching resources from
the final candidate and opened the chooser in fresh Chromium.

### Current unit —06b §6.1 and practical PC review

PO approved both read-only inspection changes in [06b §6.1](../docs/specs/06b-staging-read-operations-proposal.md#61-工程別計測後の改善)
on2026-11-04. Keep independent write/readback and recovery checks, compare the
same500k SH4 file and prove tamper refusal, interruption, saved bytes and reopen.
In parallel review open → find → edit → save/share → resume as a whole on the PC
candidate. Distinguish usability observed on this machine from typical-PC/user
qualification, and prioritize unnecessary user work by impact. Changes beyond
the two approved verification phases require a separate decision.

On the same178,011,532B Review with matched diagnostic hooks and fresh Chromium
profiles, full ZIP scans fell40→36, and SHA input16.556GB→15.132GB. The parent
phase fell30→26 scans and66.05→60.63s instrumented SHA execution. Child ZIP
readback/journal/completion/discovery stayed at9 scans, scratch at1. Wall time
from copy confirmation to the editor heading was192.325s/194.284s; 3D-ready
indication207.219s/217.478s. Both editor runs passed the existing240s check in
this pair. The single pair does not establish a wall-time gain or a regression.
The separate preceding pair measured over240s, so ordinary-PC latency
acceptance is still open. Architecture12 and focused Review7 passed.

The uninstrumented Desktop candidate recovered the same500k job after one
injected interruption before original.zip creation and a full browser close.
Original-file reselection to editor244.158s, backup186.962s and cold reopen
122.136s. The backup and cold Profile retain the edited Caption, and the saved
GS/Proxy/PNG bytes match their three original hashes. Focused coverage also
refuses altered parent/child archives, wrong Prepared binding, missing child
publication and preserves the exact parent receipt after failed readback.

The current Ki84 browser journey completes new-profile restore, search,
four-record browsing, edit, saved-file inspection and full-browser reopen.
Confirmation→restore105.7s, search58ms, apply31.1s, download63.99s and cold
resume37.6s. Sequential browse leaves four overlapping windows, and the
header says ファイル未確認 both before and after download. See the
[practical PC review](../docs/ui-design-review.md#2026-11-04-pc版の実用性と操作の重複)
for observations, priority and hardware limits. Next prioritize repeated
Caption apply and save, then navigation and clearer save/share state.

Typecheck, all five builds, offline/HEIC isolation and the small Caption
continuation case passed. The existing small Workspace download case exceeded
its15s wait on both the first current run and previous-artifact control; the
current instrumented follow-up completed at the boundary (15.000s to handoff).
Generation9.846s, full output overview4.230s and handoff0.861s were measured
on that follow-up. The next audit should separate exact generated-file/privacy
evidence needed for handoff from refreshing the entire output list.

Final checkpoint remains red on three30s test timeouts (07m v1 and LociMyu
roundtrips and Scene-name cold recovery;3278 passed/21 todo). All three
repeated under the unchanged focused threshold; the exact previous source
control reproduced the v1 timeout and passed the other two. Cause is not
established for all failures. Required checks are retained without threshold
changes. The approved change and review remain local pending that check.

### Current unit —Ki84 daily edit, export and resume

First isolate the three existing timeout cases without changing assertions or
deadlines. Then use the same retained Ki84 backup and fresh normal Desktop
profiles for paired one-Caption edit → external backup → cold-resume runs.
Measure commit, display, package, output overview and handoff separately. Keep
the exact source/history/body/receipt and recovery checks. Improve only proven
duplicate work inside the accepted operation boundaries, and require the
edited body, exact original asset digests and independent review.

Baseline on the pending06b tree: the three exact cases passed at 17.372s,
14.395s and 14.652s under their unchanged 30s limit. The fixed Ki84 file
passed with apply11.646s, download45.544s and cold35.873s. Apply and export
issued 2,083 and 7,722 restore control opens. First refine OPFS directory
listing for ordinary slash-terminated directory paths: resolve the directory
fresh by name before walking it. Retain lexical partial-prefix behavior,
sorted results and storage errors. Do not change any restore audit, receipt
read, write, close, publication or recovery fence. The directory experiment
passed content checks but was slower in all three stages (15.912s, 50.420s,
40.756s) and was reverted. The independent follow-up reviewed one complete
control scan for both write conditions at each existing before/after fence,
only in the already selected restored generation. Preserve every original,
staging, read, mutation, close, acknowledgement and recovery boundary. Add
targeted pre/post refusal and expiry checks and rerun the same browser journey.

Final selected-fence diff passes independent review. The initial timing process
ended without a result; reran in a fresh dedicated Chromium profile with the
same source, fixture, browser and viewport. The edited Caption and exact
Project identity, 3 prior changes plus exactly 1 new change, and all 43
retained payload lengths/digests pass independent archive inspection; the
fully restarted browser opens the edited body. On the i9-10850K/64GiB/RTX5080
host (Chromium156, 1280x720, DPR1), apply11.646→9.209s, download45.544→25.897s,
cold35.873→27.781s. First-restore ready77.604→69.354s is ancillary. Apply
and export control opens fall 2,083→1,720 and 7,722→4,550; export ZIP
stream/close16.876→4.676s. Cold observed control opens stay936, so do not
attribute the cold time difference to this change. These are paired local
measurements, not a PC-class time guarantee. The saved file's independent
inspection and same-profile cold start are separate checks. Baseline and
candidate timings are in the private `ki84-daily-edit` journey results.
The final Windows `check:checkpoint` passed on source/test freeze `f142bf54`:
147 files, 3,282 passed, 21 existing TODOs, no failed/timeout cases under the
unchanged threshold. Vitest took978.68s; the serial checkpoint took1090.9s.
All builds and offline isolation passed, followed by HEIC isolation (3.4s).
The three earlier timeouts are no longer reproduced; no common cause was
established and their assertions and deadlines were retained.
After the verified checkpoint push, an independent empty Chromium context
restored the exported ZIP alone and displayed the exact edited Caption. From
restore to the confirmed body took66.406s, with no page errors. This is an
additional local evidence note, without a doc-only verification or push cycle.
Checkpoint `fbca92d` is on `g0-baseline`; [Linux CI41732083737](https://github.com/ChoRdChario/LociView/actions/runs/41732083737)
passed in16m47s including typecheck, full root tests, build and HEIC isolation.
Next isolate cold selection/destination checks from rendering and review the
actual save feedback: the external download succeeds but the workspace still
shows `ファイル未確認`. Keep exact verification semantics and clarify the
difference between a successful export and comparison with an external file.

### Current unit —whole PC workflow and response times

Review the connected workflow at fbca92d, including opening and cold resume,
Scene/search/photo/camera, edits, file output, sharing, interruption and offline
use. Use the same retained Ki84 fixture for real-data timing and existing small
browser fixtures for fault paths. Keep direct observation separate from prior
evidence and code concerns. Optimize measured repeat work within accepted
boundaries, and keep write, archive, publication and recovery verification.
Review the diff independently, compare the same user operations and run the
required final checks. Report any remaining delays and redundant user steps.

Baseline browser tour ran eight scenarios. Seven passed across Caption and
photos, loading, short-layout reading, file/receive, editing exclusion and
offline restart. The camera workflow exposed a real 720×500 recovery issue:
when WebGL stops during pin adjustment, only 1.7% of the retry button intersected
the viewport. A vertical flex container inherited wrapping and put the button
outside the clipped panel. Keep the stage extent, the pin input and both exits;
use the original browser case to verify real pointer hits and recovery.
The first change restored the retry button and exposed a second clipping issue
in the pin Cancel button. Allow the pin actions to use a single row when there
is width in a short window. The final original browser case passed with both
buttons, camera controls, Caption-window hit targets, unchanged canvas extent,
and actual 3D recovery. The updated file/receive browser case also passed.

Same Ki84 input, static candidate, Chromium and 1280×720: alternated three
fresh contexts per build. File-open to enabled Restore median5.431→4.334s
(before5.332/5.431/5.539, after4.395/4.334/4.251), matching four→three reads
of the exact archive tail. Reuse is limited to the first selection; checks at
restore and durable readback retain separate source observations.

Final Ki84 practical pass on the desktop candidate: four Scenes and103
Captions; cached Scene switch216ms, search56ms and one506×390 photo436ms to
decoded display, then original-size view. Real camera drag moved the camera;
74 requestAnimationFrame intervals, median6.1ms, one interval over50ms
(78.9ms), a local main-thread/display observation rather than GPU FPS or INP.
Apply9.122s; download28.197s; initial restored readiness73.314s. Cold restart
from launch to Caption22.048s, 3D/edit-ready28.429s, checked edited text28.696s.
Export independently verified identity, all 43 original payloads and all3
previous changes plus one Caption change. The updated file/receive case passed
with `外部ファイル未照合`, distinct from a confirmed external-file comparison.
The first private tour test used a self-changing Scene locator; fixed the probe
and reran without any product change. Wrong-purpose/modified backup, restored
write fences and backup parity focused cases passed. The first full checkpoint
reported one composition assertion still using the old Japanese status label.
Align the three assertions for that exact status, retain the file-verification
checks, and rerun the affected composition and the final checkpoint.
The affected composition passed (including its external verification and two
round trips). Final source/test freeze `beb54700` passed Windows checkpoint
and HEIC isolation:147 files,3,282 passed,21 existing TODOs, no failures.
Vitest1032.13s and serial checkpoint1101.8s. No product code changed between
the paired browser observation and that final freeze.
Checkpoint `38b6097` is on `g0-baseline`; [Linux CI41742178916](https://github.com/ChoRdChario/LociView/actions/runs/41742178916)
passed typecheck, full root tests, build and HEIC isolation in19m17s.

Remaining by observed impact: (1) large restore/cold resume delays reading;
catalog and actual host each inspect the retained restore evidence independently,
and the ~22s before Caption needs separate catalog/host measurement before any
contract decision; (2) three Next actions grew one 3D Caption window to four;
review panel-only sequential reading while keeping explicitly opened windows;
(3) write/export still takes seconds and this GPU showed a frame stall during a
short drag; qualify sustained rotation and the ordinary PC range separately;
(4) Clean/Workspace have a similar dispatch duplicate and download URLs are
retained until leaving the workspace in code, unmeasured in this tour. Earlier
500k Review-copy and current Ki84 timing are different workloads. Treat the
short-window recovery fix, eight representative browser journeys (including
actual offline relaunch), and retained narrow fault checks as bounded evidence.

### Current unit —cold resume and sequential Caption reading

Measure the same saved Ki84 Project from a fully closed dedicated browser,
including catalog eligibility, actual host checks, first Caption and 3D ready.
Preserve actual open, recovery, identity, receipts and write authority; isolate
any proven redundant reads under the accepted scope. Previous/Next should
select the detail without creating a floating window. Verify explicit window
opening, navigation/draft behavior, corruption refusal and cold restore.

Paired dedicated Chromium156 /1280×720 run, two fresh copies per build of
one fully closed Ki84 profile with a saved Caption change and backup output.
Baseline included only opt-in timing instrumentation. Time to first Caption
21.555/23.096s→19.104/20.817s (mean22.326→19.961s); 3D/edit-ready
28.030/30.112s→26.170/27.273s. Mean catalog10.937→9.060s, selected-generation
open inside catalog5.903→5.575s, separate catalog Session1.477s→folded into
that already verified read. Actual host generation4.618→4.453s, discovery
overview2.953→2.871s, and host Session1.481→1.369s all retained. Do not
attribute their small timing differences to skipped checks or a speed guarantee.
Both before/after paths reopened the edited body. Explicit list selection
opened one window. Three Next and three Previous steps grew it to four on
baseline and kept it at one in the candidate, with the expected detail values.
Independent diff review found no blocker. The import check detected new direct
type references; resolved through the existing validation host type boundary
and reran without changing runtime behavior or the allowlist.
Focused architecture and window-state17 cases and selected restore/output
safety16 cases passed. The retained ZIP corruption added after a ready row
rejected actual open and the next catalog, retaining original DB and changed
evidence for repair. The normal-PC authoring browser case passed with a closed
window staying closed on step and reopening on explicit list selection, plus
search, undo, saved output and full browser restart.
The first root suite caught one implementation-spy expectation for the old
Backup completion helper. Assert the new single row check and keep the actual
missing-artifact refusal, protected base and strict generation assertions.
The affected output cases (6) and final Windows serial checkpoint passed on
freeze `31c04c1e` (147 files,3,282 tests,21 existing TODOs). Vitest989.75s,
checkpoint1059s, followed by HEIC isolation. No product runtime code changed
after the paired browser run. Next measure retained ZIP scan, durable DB and
protected body verification separately within the still-dominant generation
opening stage, and keep ordinary-PC/device qualification separate.
Checkpoint `bfb962e` is on `g0-baseline`; [Linux CI41751040247](https://github.com/ChoRdChario/LociView/actions/runs/41751040247)
passed typecheck, full root tests, build and HEIC isolation in11m53s.

### Current unit —simplify selected-generation verification

Break the selected-generation step into retained archive, journal, provider,
durable repository, protected bodies and base table spans. Compare the exact
same cold Ki84 profile on timing-only and candidate builds. Remove repeat work
inside one owned operation where the same checks can supply the needed result.
Keep fresh catalog/host observations, archive and body hashes, write/selection
fences, repair and recovery behavior. Verify with the existing corruption and
recovery cases, independent review and final checks. Report observed wall time
and residual cost separately.

Same dedicated Chromium156 and saved Ki84 profile, two clean copies per build.
Baseline was timing instrumentation only. Caption readiness21.562/19.415s
to18.993/19.327s (mean20.489→19.160); 3D ready27.173→25.421s mean.
Combined catalog/host protected-body phase1.696→1.392s mean. Each pass
checks43 bodies: OPFS receipt/body `readStream` opens172→86 and receipt
`readBytes`86→43, while stream SHA-256 and byte-length verification remain.
Archive inspection still runs twice (~2.8s combined). Session projection and
overall variance are separate from the observed direct savings. Metadata uses
one decoded change per selected-head lookup and one validated reconstructed
source; exact ordered bytes, matching heads, fresh durable reads and selection
boundaries remain. Read-only CAS opens use their one fresh checked file handle;
the next open still detects missing storage, and current bytes are still hashed.
Diagnostic and writer paths retain their checks. Independent diff review PASS;
97 targeted persistence/architecture tests passed, including exact chunk,
same-size corruption, subsequent missing-body and no diagnostic write checks.
The normal Desktop Ki84 journey passed first restore, Scene/search/photo and
Caption navigation, one body edit, external backup and full browser restart.
Exact identity, 43 retained blobs and three previous changes plus one edit
passed archive inspection. One observed edit9.355s and export25.288s are
acceptance observations; the cold comparison above is the paired experiment.
Windows final checkpoint and HEIC isolation passed on freeze `577bd59f`
(147 files,3,282 passing,21 existing TODOs; Vitest870.95s, checkpoint947.1s).
Next examine the record-display boundary separately from full edit readiness
and profile the remaining Session/ZIP work before proposing any change to
when verification completes. Preserve existing selection and write authority.
Checkpoint `456e2d3` is on `g0-baseline`; [Linux CI41805636144](https://github.com/ChoRdChario/LociView/actions/runs/41805636144)
passed typecheck, full root tests, build and HEIC isolation in13m45s.

### Completed unit —read saved Captions while automatic resume verifies

Expose text/search for the remembered restored Project from the catalog's
already fully verified selected-generation read. Measure first readable text,
archive/session checks, and normal edit readiness on the same cold Ki84 profile.
The temporary reader has no command, file, media or lease ports. Keep the final
catalog-ready gate, independent host and all durable verification. Remove the
reader on refusal or disposal. Keep its query and selection only when the
authoritative editor matches the exact saved token and Scene. Verify valid,
pending and failed reopen plus final checks. No new persistent data or limits.

Final Ki84 comparison, two alternating clean copies per build on dedicated
Chromium156,1280×720: first readable20.346/20.333s→7.080/7.535s
(mean20.340→7.308s); full3D/edit-ready26.777→27.612s mean. Combined
archive verification2.898→2.987s; combined observed Session reads4.679→4.709s.
This improves time to text by overlapping reading with the remaining startup,
without promising faster edit-ready. Preview uses only the resolved starting
Scene, and is withdrawn for catalog/actual-open failures. No preview from a
corrupt selected archive. Browser tests pause then corrupt the independent
actual-open ZIP scan after showing checked saved text: no action controls,
correct search/body, refusal back to selector on corruption. Successful resume
waits for active IME; exact query, focus and selected body survive the handoff,
no floating window opens, then a real Caption edit and ZIP download pass.
Independent review PASS after fresh Selection, status placement, IME/disposal
and recovery-surface fixes. Focused 11 restore/recovery cases pass, including
latest saved text and refusal to preview corrupt input. First test fixture had
no Caption membership; assigned one through the existing typed command.
The real exported ZIP passes independent original-byte checks for all43 blobs,
preserves Project identity and the four prior changes, and adds exactly one
Caption edit. Final Windows checkpoint and HEIC isolation pass on freeze
`4e9fb2a8` (147 files,3,282 passing,21 existing TODOs; Vitest977.76s,
checkpoint1050.7s). Next profile the independently verified host preparation
and 3D build between first text and edit-ready; qualify on an ordinary PC.
The existing connected-to-cold-offline PC restart browser case also passed.

### Completed unit —mobile recording and touch fixes

Keep the desktop panel and storage contracts. In the phone layout, give list
and selected record usable space, preserve selection and draft through size
changes, make the active input and completion reachable above a keyboard, and
separate pin taps from touch orbit. Align photo pinch with the 3D interaction
and localize unrecognized input at the existing UI boundary. Re-run the
record/phone layouts and Ki84 save/reopen, review the final diff independently,
then run the checkpoint. Physical iOS and any changed storage behavior need
separate evidence; retain all write/readback checks.

Touch mobile now uses one reading surface at a time, restores the selected row
and search, keeps retry/revise above the keyboard, and uses the same coarse
short-landscape predicate for UI and canvas. 320×568/100 rows: 44px baseline,
125px initial and114px after returning to the selection. At320×365 and
390×420 body and Apply had real center hits; no native keyboard claim.
Ki84 on the final Desktop artifact: drag from pin orbits, photo pinch125→347.2%,
tap/close/focus works, 51,271,139-byte backup with five changes, all43 input
bodies SHA-256 matched, cold reopen retained the edit. Small mobile context
import→surface pin→Caption→PNG→download→independent restore passed. Same
geometry and PC direct-camera regression passed in the standard Desktop
browser lane. A genuine overlapping Ki84 marker tap selected the nearer
center despite another marker intercepting the event. Windows WebKit refusal preserves a retriable
creation and reports the mismatch in Japanese, with no ready Project.
Independent reviewers' layout/failed-edit, focus and dependency findings
were resolved and rechecked. No persisted formats, write or recovery
inspection rules were changed.
Short 320px fault check: a one-shot failure before creating the next
receipt left the draft intact, showed a hittable Retry and then applied.
An injection after creating an empty receipt retained the draft and
remained blocked by receipt-invalid on retry. Do not conflate a recoverable
transient write failure with a torn persisted receipt.
The sandboxed checkpoint was interrupted after a focused confirmation that
the temporary fixture Git repository could not write .git/config. Retain
the failed log and run the unchanged checkpoint under managed approval.
The first approved run passed3281 tests and found two stale RecordedDOM
assumptions. Keep keyboard/mouse/secondary-touch guards, assert primary
touch threshold/orbit/cancellation, and distinguish coarse-pointer
queries from a narrow fine-pointer layout. The six affected cases passed.
The tested browser product artifact did not change after these test edits.
Final freeze `d8a85381` passed the serial Windows checkpoint:147 files,
3283 tests passed and21 existing TODOs. Normal/harness/validation/Desktop/
offline builds and offline/HEIC isolation passed. No actual smartphone or
iOS acceptance credit. Next, verify native Japanese input, safe-area,
file pickup/download/restore and network-off cold restart on physical
iPhone Safari and its Home Screen app, beginning with the OPFS write/read
probe. Retain failed writes and all verification boundaries.
The exact final offline artifact also passed the Chromium mobile
server-off/cold-reopen/edit/cold-reopen route. The tracked phone layout
and desktop record/camera cases both passed on that same build.

### Completed unit —PC and phone daily edit, save and reopen

Evaluate both PC and phone for each connected product change. First align the
read-only resume layout and normal Caption workflow, and identify the exact
edition and stage of a save without claiming an OS download completed.
Use the existing selected-restore, command, output and recovery boundaries.
Compare Ki84 in both layouts and verify unreadable restore, IME, draft,
browser resume, download and external verification separately. Keep device,
offline and publication evidence scoped to their actual environments.

Ki-84 in isolated Chromium profiles passed PC 1280×720 and touch390×844:
read during verification, preserve search/selection/focus, apply one Caption
edit, download and select the ZIP for verification, cancel an unapplied
draft, and retain the applied edit after a cold browser restart. Both ZIPs
contain five changes and match all43 original asset hashes. The PC panel
kept its position and size. The touch panel retained its width and surface;
the active workspace controls moved its top down105px. An injected corruption
at the later archive check removed the phone preview and left editing closed.
Independent review found and addressed short-window sizing, offline home
padding and the stale rendered assertion. Save/restore integrity review had
no blocking findings. The first full run found one more stale text assertion
after successful handoff, with the other3282 tests passing. The updated test
checks both download and confirmation states. All three focused cases passed.
Final freeze `26b7811e`: the Windows checkpoint passed with147 test files,
3283 passes and21 existing TODOs, all five builds and offline isolation.
HEIC isolation passed. The final offline candidate passed the Ki-84 reader
at1024×360 PC,844×390 landscape touch and390×844 portrait touch. Its tracked
PC file continuation/receive/restore, PC camera and phone short-editor cases
passed. A separate touch cold restart with the server stopped, an offline
edit and a second cold restart passed in Chromium. Physical iOS remains open.

### Completed unit —whole or selected export checkbox

PO approved two export scopes and a checkbox for selected output. Use the same
surface on PC and touch. Reveal Scene or changes only for selected output, keep
the existing selection, contents/privacy confirmation and download guards, and
remove the ordinary clean-copy writer entry. Preserve existing ZIP compatibility.
Use the accepted same-Project receive and standalone View/edit-copy routes.
Adding an imported Scene into a different Project requires a separate import
design covering identity, coordinates and recovery. Verify real export packages,
selection/reset and keyboard/touch, receiving and old Clean import, and review
the connected difference before a checkpoint. Revisit the105px touch reader
shift separately and retain native iOS acceptance.

Product Share uses an unchecked native checkbox for whole output. Checking it
shows Scene or changes. Choose an exact Scene or retained shared base before
generation. Cancel or uncheck returns to whole output, with no pending choice.
Keyboard focus survives scope and target selection. Existing outputs and Clean
reading remain available. No manifest, source, receipt or recovery changes.

Chromium verified PC workspace flow and keyboard/cancel, real whole Workspace,
two file exchange rounds with local edits, Review→edit, old Clean input with
original model digest, restore and cold resume. Touch 390×844 opened File →
Share, tapped the checkbox, and downloaded and inspected a real Review ZIP.
Pinned old-reader cases passed for named histories and portable HEIC. The first
combined rendered run's phone selector targeted the PC-only shortcut; the
actual compact File menu passed in the corrected dedicated run. The first
Windows checkpoint exposed a stale test that could observe transient generated
status during recovery. Its updated settled-state check and focused cases passed.
Final freeze `ceb84759` passed the Windows checkpoint:147 files,3283 passes,
21 existing TODOs, all five builds, offline isolation and HEIC isolation.

### Completed unit —confirm the destination of an update from Open File

Use one file selection, classify by validated contents and
show only available actions. A standalone file may open on its own. For a
recognized Project and an eligible local destination, show the exact destination
before using the existing update receipt and base/lineage checks. A catalog row
is a routing hint, and the destination and input must be checked again under the
actual edit lease. Missing base uses the existing full-workspace path. A Scene
snapshot opens in View or makes the existing independent editable Project;
appending it to an existing Project requires a separate coordinate, ID and
atomic-recovery specification.

Keep standalone first import and explicit existing-project receive distinct
under the actual edit lease. Preserve the selection on a refusal before
durable receive state, and use the existing recovery surface after staging.
Verify cancel, PC/touch, a missing or changed destination, and the exact-file
retry, then run the full checkpoint. No change to input profiles or storage.

Independent review closed a live-vs-catalog eligibility gap for unfinished
output, and the focused tests passed for cancel with no persisted changes,
standalone refusing a live destination, locked destination, absent destination guidance,
and exact Contribution ZIP recovery after a write fault. Four Chromium cases
passed, covering confirmed PC Contribution/conflict/reopen, confirmed touch
Workspace import, Review opening and existing receive/restore. In a separate
private Ki-84 run a51,265,332-byte Workspace produced a2,230-byte Caption
Contribution with no asset entries. The phone-sized receiver confirmed its
destination, kept its local body and received the peer title. Its backup
matched all43 original asset entries and reopened with both edits. These are
Chromium touch results. The independent PC and mobile device gates stay separate.
The first full run exposed six conversion-cancel checks that selected the
hidden update Cancel in recorded DOM order. Preserve conversion control order
and keep the update decision visually distinct. All eight affected focused
cases and both final PC/touch rendered cases passed.
Final freeze `57ed8aa6` passed the Windows checkpoint with147 test files,
3284 passes,21 existing TODOs, all five builds and offline/HEIC isolation.

### Current unit —define and verify the 06d Scene append transaction

PO approved the local journal boundary and excluded downgrading to pre-release
builds from acceptance. Implement additive planning, bound retry and single
publication, then connect destination confirmation and recovery to PC and touch.
Verify exact-file refusal, write interruption, duplicate prevention and export /
reopen using the current build. Audit downgrade-only code separately from real
data import and recovery. Stop on unsafe publication or an unresolved contract.

PO approved the [06d product behavior](../docs/specs/06d-scene-append-proposal.md).
At fd17c3c, specify and review the exact
additive batch, source binding and recovery before implementation. Reuse the
Review reconstruction and prove the destination-frame remap on existing ZIP
fixtures. Keep the wire unchanged. The current local journal accepts one
ordinary body (or a portable media pair), so explicitly decide old-local-reader
behavior before adding a journal kind. Preserve the present Review and update
routes while that decision is pending.

The independent read-only reviews confirmed the existing mapping and the
new local journal compatibility boundary. §5 binds the exact ZIP, ID recipe,
single change, base and all included bodies without retaining a second ZIP.
An isolated Node probe applied a meter-unit exported material Scene as one
current-format Automerge change (5840 bytes), preserving the target header,
existing records and history. A generated Review with Project and asset pins,
an unplaced pin, entry view, material and media also passed (7772 bytes).
The phone Review sample declares unknown units and remains a standalone case.
Four existing Review package tests and three design probes passed at the
design-only checkpoint `8bae2d5`.

06d implementation connects Review → destination confirmation → one additive
change → save / reopen. It uses the selected generation's existing locks and
publication authority. Both model and media originals survive, and the target
header, default Scene and prior history are preserved. The operation validates
saved change operations against the frozen record mapping and source, and after
preparation can verify and publish without the original ZIP. A completed job
is recognized by the exact local transaction even after later edits.

Chromium 06d cases passed on fresh Desktop and offline candidate builds, with
the Service Worker blocked in this lane. Desktop covered confirmation, cancel,
other-tab lock and stale preview, plus an interrupted write before preparation
requiring exact-file reselection. The 320 × 568 touch case interrupted publication
after preparation and recovered after closing and reopening the page without
the ZIP. All three verified a single added Scene, external backup, original
GLB and PNG hashes, and browser reopen. The focused service replay confirmed
no duplicate or rollback after a later local edit. Physical iOS is a separate
evidence lane. Browser logs and screenshots are local development evidence.

Final verification was split. The sandbox run hit temporary Git/symlink write
restrictions. The Windows rerun passed typecheck and 3228 tests, with four
existing timeouts and two fixture suites stopped at source provenance. All four
timed-out cases passed with the original assertions and deadlines in isolation.
The fixture provenance binds the original storage specification as an exact Git
blob. Reverted the companion link there and retained the 06d contract in its own
file. The two registry suites then passed all 53 cases. Aggregate coverage is
3285 passed, 21 existing TODOs. The combined checkpoint command exited nonzero.
All five builds and offline/HEIC isolation passed separately. Two rendered
regressions passed for Review camera/standalone edit copy and mobile recording /
update receipt. Independent reviews closed the exact-write validation, verified
completion, and the confirmation-to-recovery handoff findings.

Pre-release cleanup audit: old-development-build rebuilds used by the 08b/08c
reader rejection checks are the first removable duplication. Keep current-reader
privacy, unknown-capability, sharing and restore checks. Map1 and old conversion
recipes also serve actual saved candidate Projects. Inventory them before any
retirement. Native/v1/LociMyu imports, exact material matching and current-build
offline write protection serve existing data and remain in scope.

### Current unit —test attribution and portable HEIC on the current build

PO approved removing the two fixed development-reader builds from regular
verification. Preserve connected current-browser sharing, export privacy, restore
and reopen, and exercise unsupported package capability refusal in the existing
package suite. Keep local journal / wire validation and real legacy import in
scope as existing contracts. Review the test diff independently and run the
affected desktop and focused service cases. Stop if coverage depends on changing
product behavior.

Removed the two fixed-reader rebuild and route substitution branches and their
shared build helper. Current Desktop coverage retains 08b exchange, conflict,
export privacy, Backup restore, cold reopen and GS confirmation attribution.
08c covers a decoder-incapable recipient, offline editing and saving in an
open app, cold reopen, and importing the portable-only Clean copy without using
the decoder. All three Chromium cases passed in one run. The 08c creation uses
the controlled decode fixture. Independent test/contract review found no blocker.
Eight focused cases passed across the corrected package assertions and the
portable media tests. Both supported metadata profiles reject a Workspace with
a valid checksum and an unknown required capability at manifest admission.
The final Windows checkpoint passed in one invocation with all 147 test files,
3285 tests and 21 existing TODOs, typecheck, all five builds and offline isolation.
HEIC isolation also passed. This completes the full-run confirmation pending
after the prior 06d split check. The Chromium cases took 6.8 minutes including
current-build setup. No matched old-build timing comparison is claimed.
Next, inventory old conversion recipes and saved development Projects before
retiring any data-reading path. Unreleased-build downgrade checks are outside
acceptance; opening the user's actual source files and saved work remains required.

### Current unit —simplify conversion preparation and recovery

PO authorizes continuing connected refactoring through verification and review.
The recipe audit finds that current inputs still select Native1–10, frozen-v1
1–8 and LociMyu1–7; saved recipe identities remain necessary. Consolidate the
identical inspected GLB/image verifier for the three ordinary converters, keep
Native spatial's distinct authority, derive the initial-origin type and guard
from one literal registry, and centralize frozen-v1's material-family checks.
Keep a LociMyu source open until recovery settles. Preserve original recipes,
exact bytes, record matching and every write/readback/publication fence.
Verify focused conversion/mismatch/recovery cases, representative PC/touch and
Ki84 operation, then the required final checkpoint and independent review.
Stop the affected change on a real contract discrepancy or a new product choice.

Implementation and readonly independent review are complete. The three GLB/image
preparation verifiers share one exact-record implementation; Native spatial stays
separate. The initial-origin registry and frozen-v1 material-family predicates
now have one definition. One digest of captured initial bytes serves both input
receipts; durable readback/recovery still rehashes. Recovery now awaits Session
settlement before releasing the LociMyu source, including failure.
Focused boundary/content/lifetime checks4pass, then conversion identity/refusal/
interruption/recovery cases40pass; typecheck passes. Current-build Native phone
conversion/edit/selected+whole output/receive passes at320px with reduced input
height (34.3s browser work,1.0m including fresh builds).
The first real Ki84 PC→touch run stopped on a test prerequisite: compact layout
defaults to the work panel and intentionally defers its hidden3D renderer. Both
source inspection and independent review confirm this. Preserve that failure;
the amended private scenario selects the actual3D surface before checking the
same canvas-ready assertion. No product guard, assertion or deadline was relaxed.
Source/test tree is frozen for the remaining browser/final checks.

Final fresh-original Ki84 PC→independent touch case passes in3.4m on current
offline-desktop-dist with SW blocked. Preview9.783s, conversion-to-visible3D
28.368s, PC save+Node archive inspection15.839s, touch restore-to-visible3D76.255s,
and touch reload-to-visible3D21.548s. These are current-path measurements, not a
matched before/after speed claim. Verified4Scenes/103Captions/42images, real image
decode/original-size view, PC body edit, external backup, independent touch
restore/body edit/reload and second output. All43 model/image digest records and
Project identity match after both outputs; source ZIP hash stays unchanged;
browser errors/external requests are empty. Screenshots and failed/final logs are
private in `.artifacts/e2e/conversion-refactor`; no private source fixture ships.
This is Chromium PC/touch emulation evidence; physical iOS/native-HEIC and actual
offline cold boot are not inferred from this SW-blocked scenario.
Final checks PASS on the unchanged reviewed source/test tree:147files/3288passed,
21existing TODOs; full Vitest948.32s, typecheck, all five builds, Desktop offline
isolation and HEIC public-path isolation. No automatic test retry or exclusion.
Owned product preview restored at http://127.0.0.1:4191/; HTTP200 and all15served
non-map files match the final offline candidate (private `preview.json`).
Standing g0 push authority applies; stage only this unit and leave the existing
private165-line evaluation block, design-review draft and source artifacts local.
Next user-visible performance work should split time-to-records from visible3D
and profile the76s restore/22s reopen path before further optimization. Reuse the
accepted operation lifetimes and write/readback/recovery fences; no broader cache
or verification-timing contract is authorized by this cleanup.

## Completed boundary —06c bounded restore content inspection

PO explicitly approves06c on2026-11-03. Starting checkpoint85fe474 on g0-baseline;
preserve local delivery notes, the5633-byte private block, golden and all originals.
Outcome: reduce actual Ki84 restore wait while retaining every receipt/content/
inventory check and strict downstream write/readback/publication/Selection fence.
No new screen, dependency, format, limit, cache or ordinary release.

Record acceptance in06/06c before source edits. First observe the actual eligible
readonly content callback in a fresh private baseline using existing Chromium/
driver and content-free timing/IO snapshots; retain custom detail explicitly.
Same probe/backup/source qualification/viewport/profile conditions for candidate.
Then name only false-verifier withReadonlyContent in the closed staging allowlist;
leave standalone verify/hasEvidence, true verifier and weak-media fallback alone.
Reuse existing content/staging/recovery tests with minimal integrated closing,
expiry/ownership/freshness checks, and independent read-only meaningful-diff review.
Run the complete real restore→edit→file/integrity→cold workflow and final required
serial checks once at the final source/test boundary. Check actual CI/owned preview
for a suitable g0 checkpoint. Human control-by-control confirmation is not a gate.

Stop only affected work for a genuine contract conflict, new policy or failed
integrity/connection condition. No unmeasured IO count or older differing run is
speed acceptance; if this hook is unused or benefit unproven, do not broaden it.
Short-PC list/detail UX remains the following ordinary unit.

Baseline06c: immutable85fe/source1d56 artifact, fixed Ki84 backup SHA c714c6cd…,
Chromium156/1440×1000/DPR1/new private profile, explicit SW bypass for online
diagnostics. Corrected private logpoint probe observes9 complete hooks×44requests,
no probe/app errors or truncation; first6 staging bodies5.751–8.238s with1584
restore-control readStream calls each. Whole restore176.873s, Caption/edit175.429s,
model175.841s. Body spans exclude opening/closing audits; elapsed and stage IO
must be compared separately.43 original bodies and3 retained source/control facts
captured. Earlier175.223s diagnostic has request-key lexical probe errors and is
retained/excluded from matched acceptance, not an application failure. Evidence:
`.artifacts/e2e/ki84-evaluation/06c-before-valid-20261103/restore-observed.json`.
Implementation names only the existing readonly hook. Source39517f6f… frozen
(719 source/test/script files+7 support inputs). Focused content/persistence/core117
and actual staging10 cases pass; independent meaningful-diff review has no finding.
Same-condition candidate whole restore124.559s, Caption/edit123.144s,
model123.751s, initialize105.852→71.651s.9×44 requests, image preparation240/8K20
and2853 hashes are unchanged. First5 hooks are initialize, sixth Selection,
last3 adopt (already no staging body audits before); do not attribute all9 to06c.
Initialize control readStream15931→8101, list1770→900, consistent with5 exact
operation scopes retaining entry/closing audits. ArrayBuffer records reach4000
on both runs and are not total-byte/memory evidence. The matched single pair
observes29.6% whole-time reduction, not an all-environment guarantee. Independent
evidence review confirms source/runtime qualification, matched inputs and all43
bodies/3 retained facts. Photo8 original/full HTML-decoded pixels and one actual
Caption edit pass. Actual edit22.358s and backup69.548s/stream-close23.296s are
observations, not a claimed improvement outside restore. Saved ZIP6f120985… is
51,271,012B: all3 original AMchanges retained, only the intended Caption body
adds1 change; every body/base is exact. Real file chooser verification reaches
saved-file match. Normal SW cold startup after full browser/server stop, offline,
no CDP bypass preserves body/photo/full pixels/draft cancellation/save-match;
9 current response bodies all match candidate. Explicit executed launch/exit
conditions are in private `06c-20261103/orchestration.json`, not inferred only
from SW/online flags. New saved ZIP also restores in a third fresh profile;
all43 bodies and3 retained archive originals match, actual reedit survives reload.
Its initial diagnostic tried old response.body after navigation and failed only
after the real edit/reload; no write repeated. Readonly confirmation qualifies
the current reload's6 responses and durable body, not the lost old responses.
Independent file/byte/evidence review has no integrity finding. The literal
`npm run check:checkpoint` exits0 at the final source:147files/3276PASS/21existing
TODO,1903.27s for tests,2064.12s for the full serial sequence. Typecheck, all5
builds and offline isolation pass; supplementary HEIC isolation exits0. The
actual immutable browser-tested candidate also passes its own14-resource exact
SRI/worker/manifest isolation. Final rebuilds have fresh generated build tokens;
delivery retains the immutable artifact actually tested, not a silent artifact
substitution. No new
whole Desktop41/offline5, iOS/device/GPU/adoption/release credit is claimed.

Milestone meta-audit: branch/HEAD and exact source are unchanged, the accepted
restore→edit→file→cold/independent-resume workflow is closed in browser evidence,
and no new integrity/P0/P1 issue was established. The small06c change follows the
critical path; finish required serial checks and safe delivery, then address the
known short-height Caption UX. Do not expand into a general cache/audit bypass.

Final documentation/privacy review found one stale historical approval instruction;
it now explicitly says that85fe-era pending06c state is superseded by current PO
approval. Private5633B block and golden stay exact,163 local document links pass.
Source/test content is unchanged after review/testing. Suitable g0 delivery,
actual CI and owned4191 HTTP/fresh-browser verification followed this prepared
checkpoint; results below remain local without a doc-only CI loop or repeating
runtime checks. Next outcome: keep the Caption list/detail usable on short PC screens,
using existing controls/commands and preserving selection/drafts/focus/recovery.

Delivery: the independently reviewed10-path checkpoint is committed/pushed to
g0 (Git owns identity). Owned4191 now serves the exact browser-tested immutable
source39517f6f candidate: all20 HTTP resources and7 fresh normal-SW-allowed
Chromium responses match; home/product statement/native file picker pass with
errors/failed/remote0. Canonical ownership record has PID13668; replaced only
verified owned45480, never personal4182/Chrome. Actual CI41498629403 on
d59590873aaca42ba61e0f13904c1f5c04cee0ce completes successfully: actual checkout
log matches,147files/3276PASS/21existingTODO(844.98s), npm ci/typecheck/test,
BASE_PATH=/LociView/ normal build and HEIC isolation all succeed. Job125460066685
and the selected primary logs are retained in private `ci-receipt.json`; this is
not remote browser/device/offline or release acceptance.
The private receipt/proof directory is `.artifacts/e2e/06c-20261103/`.

## Completed boundary —whole-PC review and restore performance checkpoint

PO requested overall review first, then performance improvement. Three independent
readonly UI/safety/verification reviews completed before product edits, using
current c47 rendering and qualified retained exact-source file/cold evidence.
No established new P0/P1 was found in the sampled flow. Current P2:1280x720 four-
Scene chrome leaves111px of Caption list and pushes detail below the viewport.
Coverage gap, not an observed product bug: the richest interrupted-reselection/
keep-both browser chain is validation-route evidence, not current Desktop proof.
See [the existing design ledger](../docs/ui-design-review.md) PCQ29–31.

Implemented the independently reviewed adjacent-result clarification in
[06](../docs/specs/06-project-package-wire.md): initializeBackup immediately uses
THIS resume's fresh persisted postpublication read under the same lease, retaining
ready/job/source-token and closing checks. Reentry, retry, full content and all
writes/readback/publication/Selection remain fresh. No new staging consumer,
cache, persisted field, dependency, admission limit, compatibility or release.

Final source/test fingerprint1d560b16a60f2b7a86acb8e38509b83153938edfb52488a7ae634c8ee4efabe5
pins719 files plus7 unchanged supporting inputs. Literal check:checkpoint passes
with actual Exit0: typecheck, unfiltered147-file Vitest3273 PASS/21 existing TODO
(2139.68s), all five builds and offline isolation. Additional HEIC isolation passes.
Source/support bytes match afterward. Architecture and meaningful source/test
diff review are clean; later changes are records/proposal only.

Same51,270,879-byte backup c714c6cd04f99ac7aa0b84e9e2ca82a0147bbbc0eeb029be475d94e68ccf501c,
fresh private profiles, Chromium156/DPR1/1440x1000 and actual runtime SHA matching:

| Observation | Before | After |
|---|---:|---:|
| Confirmation through diagnostic capture |160.625s|169.547s|
| Caption/edit ready |159.304s|167.858s|
| Model ready |159.725s|168.398s|
| initialize |98.695s|110.641s|
| Native bitmap preparations /8K preparations |240/20|240/20|

**No wall-time improvement is established.** One exact published Session read is
removed and the real-reader identity/fault tests pass; this is not latency
acceptance. The older unchanged-c47 run90.934s is separate evidence, not a speed
comparison or proof of an environment cause. PerformanceEntry.toJSON omitted
custom IO detail from this pair, so no paired stage-IO count claim is made.

All43 model/image payload hashes and retained source/inventory/base bytes match.
Actual restored Caption edit succeeds; host.edit24.249s, display data19.4ms /
prepare5.3ms, no8K decode during that edit. Actual backup/download69.200s (stream-
close23.602s); the selected saved file is verified by the app. Independent full
archive CRC/content/history check preserves all3 original changes, adds only the
one intended Caption body change, and keeps all payloads/exchange bases exact.
Saved backup SHA d102b88322b38e19bac687c944f61e9b3cab97e9a930602f19df3ce86a429f9e.

Normal-SW cold evidence after complete browser/server close: first9 recorded
responses are current candidate bytes/fromSW, offline true, server stopped and
no bypass; Caption20.105s/model+edit28.240s. Saved body and original Photo8 encoded
SHA match; actual506x390 HTML-native pixels match independent same-API decoding
and cold reopening. Editing/draft-confirmed cancellation and verified-file state
work. Nonblank3D is rendered. Browser errors/remote requests0; owned QA browser/
server closed. This is not a new whole Desktop41/offline5 run, physical-device
proof or a third-profile restoration of the newly generated output.

Private evidence: .artifacts/e2e/whole-review-performance-20261102 and
.artifacts/e2e/ki84-evaluation/whole-{ui-review,restore-before,restore-after,restore-cold}-20261102.
Keep originals, private audit and all.artifacts out of Git/public builds. The
5633-byte private todo block and exact CRLF golden remain unchanged.

Retained failures: initial sandbox Git-init permission refusal prevents shared
setup (83 bodies unrun); authorized setup9 passes. An interrupted initial full
attempt is incomplete. A later full3272PASS/1FAIL has an incidental1s DOM poll
failure in second conflict resolution. Reviewed test-only correction waits for
the existing real mounted owner's checking→idle confirmation in that case; exact
data/history/replay assertions and30s budget remain, then final full3273 passes.
Failed diagnostic attachment produced no CPU profile. Browser helper failures
are preserved: submit mistaken for picker; omitted IO JSON detail; historical
sample/full or cross-API pixel comparison; wrong verification-label wait; missing
the existing draft-discard confirmation. Continued actual state/source checks
resolve those without repeating writes, loosening validators or hiding failures.

At85fe, [06c](../docs/specs/06c-staging-content-inspection-proposal.md) was
design-reviewed, PROPOSED, PO-unapproved and unimplemented. The candidate named
only the existing readonly hook as a fifth staging consumer, retaining fresh
receipts/inventory and downstream strict fences. Graph42media/46active attachments
suggested eligibility; actual hook/time evidence was still pending at that point.
The subsequent explicit PO approval and executed evidence in the current boundary
above supersede that dated state. Weak-media fallback and general Session/write
lifetimes remain outside06c; physical iOS/real-GPU/adoption/release gates remain pending.

Independent index/privacy review confirms all726 frozen inputs, Git-clean-filter
source/test equivalence, exact9-path scope, no private block/media/artifacts and
unchanged golden. The suitable reviewed checkpoint is committed/pushed to g0;
Git owns its identity. The owned4191 preview now serves this immutable candidate
with explicit root base: all20 HTTP resources and7 actual fresh normal-SW-allowed
browser responses match; home/product statement/file picker work, errors/remote0.
Personal4182/Chrome are untouched. [Actual CI41465782994](https://github.com/ChoRdChario/LociView/actions/runs/41465782994)
completes successfully on the exact85fe474 checkout:147 files/3273 PASS/21 existing
TODO (991.84s), npm ci/typecheck/test, BASE_PATH=/LociView/ normal build and HEIC
isolation all success. Actual checkout log and job125346162415 agree; the private
ci-receipt.json retains the selected evidence. This is not remote Desktop/offline
browser acceptance or a new release.
These delivery notes were retained locally at that checkpoint without a doc-only
Push/CI loop or repeating completed runtime checks. The grouped06c decision was
then pending; the current explicit PO approval above supersedes that state.

## Completed boundary —Drawing, camera synchronization and image relationships

The PO-requested connected group is implemented: organized Drawing targets and
appearance controls, camera-frame pin/window presentation, and the explicitly
approved [07o](../docs/specs/07o-locimyu-image-extension-link-proposal.md) extension-
only relationship rule for a separate new conversion. Existing Projects/edits and
recipe1–6 replay remain unchanged. No new dependency, storage schema, renderer
method, numeric limit, write/recovery lifetime, adoption or release is introduced.

Drawing uses one target group, aligned maximum-two-column appearance fields,
full-width advanced disclosure and the existing Apply/Cancel footer; narrow
panels use one column. Scrub/live preview/raw precision/IME/draft/token/Scene and
Session ownership remain. Actual normal/narrow draft/Cancel/scrub/Esc/Apply/file/
reopen and small Mesh/GS checks pass, with independent code/rendered review. The
subsequent image/report/ephemeral-display differences leave camera/Drawing/JPEG
and Session/package authority code unchanged, as qualified by saved manifests.

The source-qualified matched Ki84 camera pair observes GL-call-end to marker
completion49.7→0.7ms median (p95 75.6→1.7ms); candidate combined draw/DOM callback
2.4ms median/p95 4.1ms. All64 marker nodes and172 existing OPFS payloads remain
unchanged with no readback/decode/Blob/hash work. This is one CPU/DOM pair, not GPU
completion or general FPS; the cached-runtime attempts remain excluded evidence.
The actual PC deferred bridge and lifecycle/import-boundary checks also pass.

Real Ki84 conversion admits42 media/46 attachments:19 new references to16 bodies.
An independent raw-source-to-archive association oracle verifies all37 originally
missing references;18 remain excluded (15 HEIC, two source ID/name mismatches,
one structurally nonconforming JPEG). Every one of the43 model/image payloads
matches the original bytes. A separate new Project preserves the old Project's
edited body/materials. New-image display, viewer zoom/pan, body edit, real backup
and independent persistent-profile restore pass; the original ZIP is unchanged.
The whole legacy ZIP/unattached images stay outside ordinary exports, so retain
that ZIP and the separate report. The JPEG validator is unchanged; a separately
created display-derived PNG is a manual option, not an automatic attachment or
new photo-admission policy. See [T.81 B.2.1](https://www.w3.org/Graphics/JPEG/itu-t81.pdf)
and [07d](../docs/specs/07d-jpeg-project-scene-proposal.md).

Final source345d adds a typed, nonpersistent18-entry omission disclosure with
Caption/Scene-row/filename/reason and truthful busy/IME native readiness for home
row buttons. Independent source/actual-image review is clean, typecheck and16
focused cases pass, and Desktop/offline builds pass. Actual old/new home keyboard
opening,44px inline summary and its18 explanations pass; the small report is byte-
identical to the preceding core candidate. Normal SW update→complete close→server-
off offline cold verifies the final HTML/runtime bytes, saved body, photo pixels
and nonblank3D drawing, with no page errors/remote requests. Earlier failed home/File
observations and the first CSS metric failure remain separate failed evidence.

The source/test tree is frozen (719 files plus supporting build inputs). Final
unfiltered installed Vitest passes147 files/3272 tests with21 known TODOs in
1457.87s, actual Exit0. The equivalent required serial sequence completes with
every Exit0: remaining normal/harness/validation builds, offline isolation,
BASE_PATH normal build and HEIC isolation, plus exact-source/settings successful
typecheck/Desktop/offline builds reused from this same final tree. This is not a
literal check:checkpoint invocation. No retries, exclusions or timeout/assertion
relaxation were introduced, and post-check source/supporting hashes match.
The reviewed checkpoint c47ac3b is committed and pushed to g0. Root's owned4191
preview (PID37448 at verification) serves the immutable final root-base345d
artifact: all20 HTTP resources/HTML references/manifest match, and fresh normal-SW
Chromium verifies home/file selection plus seven loaded response hashes with no
page errors. Actual [Linux CI41437540951](https://github.com/ChoRdChario/LociView/actions/runs/41437540951)
(job125251005129) succeeds on the exact c47ac3b checkout:147 files/3272 PASS/21 TODO,
845.54s, with typecheck, npm ci, BASE_PATH=/LociView/ normal build, HEIC isolation and all
steps successful. Personal4182/Chrome, original profiles, private audit block and
dated prior CI results remain intact. These are local delivery-result notes;
no doc-only commit/push or repeated completed runtime checks are planned.

The one additional diagnostic is complete: the same unchanged51,270,879-byte
backup restored into a fresh private profile on final345d in90.934s. Existing
restore.first measures show persist4.10s, open-staging2.82s, initialize58.62s,
projection0.010s, display5.83s, select10.33s and adopt7.88s. No edit/export/cold
loop, retry, source/format/limit change occurred; all owned browsers closed.
This is a distinct unchanged-code run, not an improvement claim versus the prior
150.755s restore or proof of an environment cause.

During initialize, the IO path-family counter records17,659 restore-controls
readStream calls,1,962 restore-controls list and1,962 other list calls. This
family also includes generation paths; it is not a proven count of redundant
owner audits. IO durations overlap/nest and must not be summed into wall time.
Across the measured restore, the diagnostic records240 bitmap decodes (aggregate9.50s), including20 at8192x8192
(6.61s) and10 at4096x4096. The arrayBuffer diagnostic reaches its4000-entry cap:
310.6MB is a lower bound, not total input traffic. Display preparation5.83s is a
scope duration, not total GPU time.

Next bounded latency work should isolate initializeBackup's input inspection,
model-fact planning, resume/staging/publication and final readback before choosing
an optimization. Investigate pure-read/control-audit amplification and duplicate
image inspection inside one owned invocation; keep existing strict writes,
readbacks, publication and Selection fresh fences. Do not wrap all initialize in
one read callback or reuse earlier archive evidence across those boundaries.
The next change must be selected from measured work, not a blind GPU adjustment.
Previously recorded Ki84 save-stage and large-GS copy latency, plus short/high-zoom
editing chrome (37px body viewport in the earlier 720x500/DPR2 check), remain next
work; no general comfort/performance guarantee follows from this measurement.

Short milestone audit: g0/c47ac3b binds tested345d; implementation, real file/cold
acceptance, final Windows checks, actual Linux CI and preview delivery are closed.
The additional diagnosis narrows the next performance unit without new product
policy or source changes. Stop only affected future work for a genuine authority/
policy conflict; do not weaken validation or manufacture a new check/commit loop.

## Completed boundary —pin, camera and Caption/drawing comfort

PO prioritizes the six connected UI repairs in the workspace design and PCQ23–28:
unobstructed pin roots/outlined window lines; ordinary left-orbit/right-pan;
reading-first Caption list space; Asset pin scale in Caption; numeric material
drag with local preview and explicit Apply/Cancel; concise contextual transparency
warnings. The concrete ports/specifications precede the implemented group and its
independent resource/lifetime review. Preserve saved values/Session commands,
IME/drafts, target/token/Scene checks and placement/picking/resource ownership.
No new schema, dependency, renderer method, numeric policy or deployment.

Focused checks, dedicated Chromium/file/reopen and copied private Ki84 layout
acceptance are complete. Final whole Desktop41 and normal-SW offline5 pass, followed
by the required Windows checks on the aligned test tree. Keep the original seed,
personal4182/Chrome, private audit block and prior CI-result notes intact. Independent
index/privacy verification, the g0 commit/Push and actual Linux CI are complete.
These result notes remain local, without a doc-only commit/CI loop or runtime
repetition for record/stage-only changes. Broader Ki84 save
latency remains follow-up work. No timeout/assertion relaxation or extra large
file roundtrip per control; stop only a genuinely new authority/policy decision.


Current implementation: the six UI groups and bounded material/program handover
are connected; independent source/resource and rendered-UI reviews have no open
mandatory finding. Focused lifecycle/guard/import tests pass. Dedicated Chromium
record-camera passes numeric held pixels/Esc/explicit Apply, Asset pin scale,
native media selection, actual backup and reopening. The small mixed Mesh+GS
preview/cancel/camera case also passes. Private Ki84 confirms wider reading-first
list, pin-only selection, outlined line, View guards,720×500/DPR2 reachability and
final44px nonoverlapping help. DPR2 is200%-equivalent, not native browser zoom or
physical-device evidence.

One warm same-action Ki84 pair reduces each create/link/delete program count
114→2. All six3D-only images match between versions and Esc restores the original
exactly; motion performs no native image/Blob/hash work. Arrival→last observed GL
draw-call entry is534/368/432/405/425/457→516/260/248/222/204/217ms. Value/wait endpoints
vary (including a slower first new step); PNG time is separate. This is one pair,
not GPU completion, continuous presentation/fps or a general speed guarantee.
The earlier helper's unnecessary post-Esc Cancel wait stays separate from product
latency. Shader-class/coverage changes may still compile legitimately.

The first full Review camera run passes the camera/copy transition but its first
independent-copy backup exceeds the unchanged15s download assertion. Both that
normal failure and the approved timed diagnostic are retained. Diagnostic state
is genuinely busy, without
page/remote errors: three ready reads take3.481/3.242/4.113s and capture2.886s;
artifact inspection is reached before observation ends. Do not infer a deadlock,
click rejection or environment-only cause, skip the case, or relax a fence/budget.
Do not turn these failed attempts into PASS.
The old-UI fixed-artifact/HEAD-test control also exceeds15s, overlapping a known
read-only scan; it is neither an elapsed comparison nor an environment-only cause.
One private Clean-open probe identifies five discarded discovery-opens≈2.53s
inside the ready-before→finish interval. Spec06's strict static fresh-validator
composition is implemented, retaining the last actual open and every fresh
fence. Independent delta review is clean and seven related clean/Review recovery
cases pass, including held-instance/static rejection after acknowledged ZIP loss.
The normal queryless Review case now passes its original15s assertions through
copy→actual backup→reopen: independent handoff11.956s/save-and-idle12.180s,
reopened14.315s/14.556s (archive auditing excluded). This is finite budget evidence,
not a general latency guarantee. The no-draft preview proposal now
returns before projecting material context; active-draft admission stays intact.
The initial frozen-source complete Desktop group finishes35PASS/6FAIL, with no
skips/retries/unhandled errors, actual Exit1 and148.19min. This41-case run (the
prior40 plus the small mixed case) collects findings; it is not the final PASS.
Do not substitute old-source PASS; retain the earlier500k copy performance failure
as dated evidence. On this cohort source the complete500k SH4 five-purpose/return/
Review-copy/restore/cold case now passes in28.5min: copy editor180.213s (original
240s assertion), display191.144s. This closes that current threshold, not a general
speed guarantee or a matched percentage against the old314/374s diagnostics.
The six findings are three unsettled save/preflight deadlines (reopened Review
backup, first named-editor Clean preview, first Workspace output), no-selection
Undo intercepted by detail/aside after deletion, one stale viewport-notice
expectation and one incidental six-axis-center overlap assumption. The standalone
Review PASS does not establish stable full-group latency.

Retained pre-repair milestone audit (2026-11-02): g0/HEAD and the tested source
were fixed; large original/file/cold workflows had completed, with no new dependency,
release, architecture or safety P0/P1. The chosen path was executed: copy the closed
owned editor-A profile and measure one Clean-preview click, then the original
Workspace failure and Clean completion duplicate, serially. The measured bounded
work received exact ports/specifications and independent review before sensitive
edits, grouped with intrinsic Undo sizing and the two fixture alignments. Failed
attempts and fresh/write/closing/source fences were retained. The resulting final
tree subsequently passed whole41, offline5 and the Windows required sequence as
recorded below; Linux CI was still the delivery step at that audit. No timeout/assertion/
exclusion changes, helper-level full-suite repetitions or old-source PASS
substitution were used.

Current grouped repair: the retained editor-A one-click probe finishes10.590s,
including7.611s post-preview output overview; no history/body mutation or writes.
The original Workspace probe retains its15.006s failure: generation completes
12.042s, then output rediscovery is still pending (no terminal overview duration).
Its test owns a separate server rooted at the frozen FFD artifact; actual response
hashes were not captured, so do not claim a page-runtime hash receipt. Preserve
the719-file FFD cohort manifest separately. Spec06 records three exact ports:
Clean-only same-call terminal/completion validation, guarded successful readonly
preview history retention, and post-both-fences Workspace metadata-only display
handover with fresh new-base/protection/inventory. Those ports were independently
reviewed before code and their meaningful implementation delta has no mandatory
finding. No-selection Undo intrinsic sizing, viewport-copy expectation and
deterministic axis-overlap setup are grouped with them. Fifteen relevant output/
preview cases pass: fourteen initially plus the new write-fault case after its
injected failure was correctly disabled for the explicit retry oracle. Preserve
that14PASS/1FAIL attempt; it is not a product failure or a whole-suite result.
Typecheck and same-production offline/Desktop builds pass. The original six failed
Desktop cases finish4PASS/2FAIL (18.0min): all three original save/preview deadlines
are passed, while newly reached View short-edit Apply and Workspace narrow-photo
viewport assertions fail. A two-case bbox-only diagnostic preserves both failures:
short edit reserves428px in381px, and one-row reading allocates325px to the list
while photo content has179px and retained scroll clips the image. Group a small-
list intrinsic cap and contained short-edit allocation, keeping dense-list reading
space and all original viewport assertions. Backend code stays fixed. The corrected
two original cases pass on the fixed candidate (View23.2s, Workspace1.3min), with
both short-edit actions fully visible/44px/hit-tested. Narrow reading initially
shows the body and about118px of the160px photo; the remainder uses ordinary detail
scroll. Ki84 retains64rows in447×276px, and720×500/DPR2 supports44px Apply/Cancel
and restores the body after cancellation. Seven actual runtime resources match
the fixed artifact; wide is alsoDPR2, not a pixel/timing pair with oldDPR1 evidence.
Private helper setup/selector failures remain separate from product acceptance.
The final frozen-source Desktop run passes all41 (105.05min), with zero retries,
skips, unexpected/flaky results or unhandled errors and actual Exit0. Both actual
Desktop/offline output directories are preserved as immutable tested snapshots
before subsequent builds; source/tests/supporting bytes remain unchanged.
In this final queryless run, Review original/independent/reopened backup handoff
is1313/4217/4990ms and actual save+idle2021/4821/5668ms; Workspace handoff6820ms
and save+idle6941ms, busy terminal/errors/remote clean. Archive inspection is
outside those endpoints. Earlier focused timings stay tied to their own runs.
Offline5 also passes all five through its normal SW path (10.01min, actual Exit0,
zero skips/retries/flaky/unhandled errors). Its20-resource tested snapshot has
the same source/settings with a distinct build nonce from the Desktop snapshots.
The first Windows root terminal remains147files,3251PASS/2FAIL/21TODO (948.09s),
actual Exit1, stopped before builds. Independent review identifies two stale
fixture observations: placement reserves only an actual left gesture, and pin
color belongs to the dot CSS variable. Test-only alignment retains idle/down/up
ownership, target/data/retry/cold oracles and records the actual rendered CSS
variable through a generic style setter; the two focused cases pass. Its719-file
test freeze differs from the browser tree only in tests/projectFiles.test.ts;
production/scripts/E2E/supporting bytes remain identical, preserving the41+5
runtime qualification. The immutable browser manifest is retained separately.
The repaired Windows root passes147files/3253cases/21TODO (936.95s), actual Exit0.
The required checks complete as an equivalent serial sequence, not a literal
check:checkpoint invocation: typecheck, unfiltered root, normal/harness/validation/
Desktop/offline builds, offline isolation, BASE_PATH=/LociView/ normal build and
HEIC isolation all Exit0. Source/test identity is unchanged after all ten steps.
The reviewed g0 checkpoint is committed/pushed. Its exact checkout passes
[actual Linux CI](https://github.com/ChoRdChario/LociView/actions/runs/41389266006):
147files/3253PASS/21TODO (640.01s), with all steps successful, including typecheck,
BASE_PATH=/LociView/ build and HEIC isolation. The owned
[4191 preview](http://127.0.0.1:4191/) now serves the immutable Desktop41-tested
`final-tested-offline` root-base build, explicitly started with `--base /`.
The delivery repair on2026-11-02 corrects a blank page: the post-offline5
snapshot had `/LociView/` HTML references and was incorrectly served at `/`.
HTTP200 and hashes checked by filenames alone missed the actual script failure.
Corrected HTML references and all20 HTTP resource bytes now match; a fresh
dedicated Chromium displays the home/file chooser with no failed requests or
page errors (`link-check-fixed.json`). The directory-base offline5 snapshot stays
separate evidence. Personal4182/Chrome and existing Project data are untouched.
The initial35/6 run and every failed/focused/diagnostic attempt
remain separately qualified; no matched speed percentage, environment-only cause
or general no-regression guarantee is claimed.

Milestone audit: g0/798 to the fixed browser source and test-only observation
alignment closes the six UI repairs and bounded output deadlines, with41+5 and
Windows checks passed; no dependency/schema/migration/adoption/release change.
Index/privacy verification, normal g0 delivery, actual Linux CI and the owned
preview update are complete. Next are the retained save-stage and short-height
editing refinements; no release or public deployment was performed.

Follow-up UI refinement: short/high-magnification editing still has only37px of
body content viewport in the Ki84 DPR2 sample. Scroll access and safe Apply/Cancel
work, but this is cramped rather than broad comfort acceptance. Reduce surrounding
chrome in a later bounded UI unit. The final500k GS Review-copy still takes191.549s
to its editor and201.781s to display, within the original240s assertion but far from
a comfortable wait. Continue stage measurement for that path and the retained
Ki84 save wait, without treating environment alone as the cause or claiming a
general no-regression result. No further source/test change in this completed unit.


## Completed boundary —Windows heavy workflows and daily-use latency

PO authorizes product/backend performance work so the07m v1/LociMyu material
exchange and Caption restore/duplicates workflows pass their original Windows
budgets, followed by meaningful Windows and actual Linux CI verification.
Start from the pushed CI repair and the retained failures; preserve the dirty
CI-result notes, private audit block and every original data/assertion oracle.

Reuse the bounded private07m phase diagnostic on current code, recording CPU and
wall time across creation, persistence, read/validation, generation, receive and
cold reopening. Identify one measured production hot path; record concrete
ports/specification intent and independent boundary review before sensitive
changes. Confirm elapsed impact in a representative actual browser workflow,
then focused original-budget cases before one meaningful final serial check.

No timeout/assertion/exclusion/retry changes, test-only token savings, new
dependencies/schema, unchecked cache, inspection-lifetime expansion or altered
write/publication/recovery fences. Stop only affected work if the measured fix
requires a new policy/authority/large architecture decision; continue other
authorized work. Root reviews the final diff/index before g0 commit/Push; no
release or public deployment. Synthetic IO counts are diagnostic, not latency
acceptance. Keep all private artifacts outside Git.

The retained baseline-code07m diagnostic reaches Clean at26.623s and times out at30s. A20.198s
worker CPU sample places4.061s of sample time under decoded-value cloning and
1.784s under canonical serialization (nested timings are not additive); the
repository-only second history application accounts for0.376s. A reviewed private
path-stack implementation passes the nine domain guard cases but still times
out in the original07m workflow. Its comparable Clean-start boundary worsens
26.623→28.535s wall/30.282→32.672s CPU, so it is not accepted as faster and the
runtime/specification experiment is reverted. Keep the two general frozen-path/
shared-copy regressions. No unchecked trust flag, clone bypass or cross-read cache.

The selected05 candidate gives one whole-root inspection a private zero-argument
history inspector using its own frozen numeric configuration. Only the known
original-source composition uses it; public unknown-input/default inspectors
remain strict. Preserve schema/work/error ordering, final projection cloning,
cross-input/call independence and every storage/content/write/recovery fence.
Independent meaningful source/fault review is clean. Focused guards/import
boundaries and the final atomic ownership regressions pass. All five unchanged
original-budget workflows pass:07m v1/LociMyu, received Caption restoration and
07n v1/LociMyu. These are functional budget results, not a speed percentage.

One new actual Ki84 pair uses two exact copies of one closed seed, original and
new fixed assets, identical Chromium/viewport/controller and saved operation
code. Body edit takes27.544→16.163s (host27.223→15.895s). Each side then fully
closes, reopens and saves:79.157→100.272s, so save/overall speed improvement and
absence of regression are not established. Capture/early readiness shrink but
stream-close/job/overview grow; do not assign that difference to environment
alone. Both actions have real start/end IO snapshots. Native/HTML observations
are zero; hash/array counts and bytes agree below the observation cap. Owner
read counts also agree; diagnostics do not prove elapsed causality.

Both real outputs pass the existing archive oracle: six original changes remain
byte-exact plus the intended one body change, all4Scenes/103Captions/27attachments/
26media/4Views/23materials and27payloads (49,671,020bytes) are preserved. Normal
SW preparation followed by a new offline context confirms exact candidate
assets, saved body, draft cancellation/focus and real aircraft/pin/photo paint.
The first Windows all-root run exits1:145files pass/one fails,3231PASS/one FAIL/21TODO
(2032.22s), stopping before builds. All original heavy workflows pass. The new
failure is selector UI9617: selected/null and an existing row do not imply the
previous return/list owner has finished, so recorded-DOM fire can be ignored
while busy. Its reviewed case-local observer now waits for the actual normal
back/open owner transitions; blocked-pending assertions and the original budget
remain. Focus passes in2.39s and typecheck passes; late-render failure cleanup
releases its gate before awaiting disposal. This is fixture synchronization,
not a product delay. Preserve the full failed run. Final all-root verification
passes146files/3232cases with21TODO in1994.54s (Exit0) on the new test freeze,
with unchanged product code and every original budget/assertion retained.
The one planned old-artifact edit→close→cold→save control on a third exact seed
copy completes in122.165s. Retain old79.157→candidate100.272→old122.165s; this
does not establish a reproducible candidate-specific regression, general
no-regression, environment-only causality or save improvement. Control IO/quality
counts agree and its archive passes the same original-history/records/payload
oracle. No further speed controls. Required local verification is complete:
latest typecheck and final all-root, normal/harness/validation/Desktop builds,
offline isolation, the existing CI BASE_PATH normal build and adjacent HEIC
isolation all exit0. The earlier offline build is reused with identical product/
build inputs; the final delta is the reviewed selector fixture only. This is a
qualified serial sequence, not a literal checkpoint-script exit0.

Independent code/fault/data/UI evidence reviews have no mandatory findings.
The verified g0 checkpoint is committed and pushed. Root confirms
[actual Linux CI](https://github.com/ChoRdChario/LociView/actions/runs/41336198389)
on its exact checkout:146files/3232PASS/21TODO in601.33s, all steps successful,
including typecheck, the BASE_PATH build and HEIC isolation; no FAIL, EEXIST
SystemError or unhandled error. Index/privacy and actual remote identity checks
pass. This result update is local only; no doc-only Push/CI loop or repeated
runtime check. Remaining save latency
needs stage-specific investigation of validation, write/stream and refresh cost;
the control does not settle its cause. No raw-ZIP proof-lifetime/section6/01h
implementation, new dependency/policy, capacity guarantee or release is included.

## Completed boundary —portable CI fixture and immutable golden bytes

PO authorizes repairing the86 CI failures on the verified daily-use checkpoint:
82 synthetic-workspace copies reject an already existing destination on Linux;
four composition cases receive Git-normalized LF instead of the approved CRLF
golden. Outcome: clean Windows/Linux checkouts run the same immutable fixtures
without changing runtime policy, expected hashes or verifier refusal behavior.

Keep mkdtemp as the registered cleanup parent and copy the immutable template
into its absent workspace child. Preserve per-case Git/bytes isolation and the
existing no-clobber options; reuse the existing isolation regression. Before the
byte repair, document in01g that only the exact golden path bypasses text/EOL
normalization. Preserve its approved5265bytes/288CRLF/SHA4e47993f…97ef and JSON
values; no alternate hash, runtime normalization or regenerated vectors.

The three CI-target files pass101cases (381.52s, Exit0); typecheck passes.
Raw Git index and checkout under autocrlf=false/true retain the exact approved
golden bytes and identical JSON values. Independent source/spec review is clean.
The bounded checkpoint is committed and pushed to g0-baseline.
[Actual Linux CI](https://github.com/ChoRdChario/LociView/actions/runs/41320308352)
succeeds on that exact checkout:146filesPASS/3226PASS/21TODO (610.06s),
all steps successful, including the BASE_PATH build and HEIC isolation. The
terminal log contains no EEXIST SystemErrors or FAIL lines. This is actual remote
evidence, separate from the local Windows results below.

The Windows all-root run is FAIL:145files pass/1fails,3222PASS/4FAIL/21TODO
(1921.00s, Exit1), stopping before builds. Three cases hit30s (07m v1/LociMyu
and received Caption restoration); one file-check UI case hit an incidental1s
busy poll. Its test now awaits the real changed/render owner completion, keeps
all assertions and20s budget, and registers failure cleanup. That exact focused
case passes17.930s; this does not turn the original all-root result into PASS.

A six-case fixture-token experiment returned2PASS/4timeoutFAIL (235.44s),
including a60s07n v1 timeout. It was not accepted; only its helper/peer-token
hunks were reverted, preserving the verified UI synchronization repair. One
private unchanged-budget phase diagnostic reached Clean generation after both
rounds at26.229s, then hit30s; it did not establish a stalled await. Concurrent
machine load was observed, without proving that it caused the failures. Retain
all failed evidence; do not claim the three Windows heavy cases are repaired.

Meta-audit narrows this checkpoint to the original portable-CI repairs plus the
verified UI-test synchronization/cleanup. No product, timeout, assertion, cache
or validation change. Final-scope typecheck, five builds, offline isolation,
then the CI-required BASE_PATH normal build and HEIC isolation pass serially
(all nine steps Exit0). This is not a successful whole checkpoint script.
Do not repeat an untargeted Windows whole run just to toggle its result.
Actual index, raw golden bytes and privacy were independently reviewed before
commit/Push. Windows whole-suite qualification remains pending. Next stabilize
the three heavy Windows cases, then return to Ki84 editing/saving stage latency
(write, validation, streaming and refresh). Keep private audits/all.artifacts
outside Git; stop affected work for a contract/authority conflict or managed
denial. No dependency, policy, workflow or release expansion. Record the CI result
locally without a documentation-only commit that would trigger another CI run.

## Completed boundary —comfortable daily reading, editing and saving

Completed the approved daily-use unit from a fixed-c155 tour on a closed copy
of the owned Ki84 profile. Inspect first, then group the five repairs in the
[design ledger](../docs/ui-design-review.md): explicit pin/previous-next reveal
and stable marker focus; owned apply/discard/save focus; one empty-selection
prompt and coherent apply progress with a non-inert live owner; the Save tab;
readable camera help positioned inside its stage. No new screen or setting.

The [spec06](../docs/specs/06-project-package-wire.md) domain-owned void invocation
now groups one pure readonly content inspection only when every admitted media
record belongs to its active strong closure. Weak-media cases use the old path
and retained-callback order. Keep original bytes/identity/history, typed commands,
strict staging and all write/readback/publication/recovery checks. No new policy,
dependency, capacity guarantee, broad Session cache or payload-proof lifetime.

One normal same-snapshot c155/d6 edit pair is53.022→22.209s actual and
52.735→21.919s host edit. Both record native/HTML0,638 digests/1,160,318B and
428 Blob arrays/964,178B. This is one bounded pair, not a general guarantee.
The probe omitted its IO start listener: terminal IO is cumulative, not an action
delta. Do not infer owner-count/seconds savings from it. Focused scope tests
independently verify two boundary audits while retaining every receipt/inventory
check. Baseline save overlapped focused tests and after save followed the tour;
151.187s/79.466s are functional observations, not a matched save-speed comparison.

Both actual files49,728,444B preserve all five input change byte sequences plus
the expected edit, all records and27payloads:4Scenes/103Captions/27attachments/
26media/4Views/23materials. Archive audit passes. The d6 real UI repro confirms
selected-row visibility/marker focus, discard→body focus/manual scroll, camera
help with a reachable model tab, and one empty prompt/no empty form. A later
refresh still removed the Save primary, so final4d keeps that node/listener stable
with the current action. The d6 backend/file evidence is reused with this exact
File-only source difference. Actual download focus passes in final4d's small
Desktop workspace case; the loading/workspace cases both pass (2cases/3.6min).
Their config rebuilt the same code with a separate build nonce from the fixed
cold candidate. Earlier source-qualified cohorts are not new all40-case evidence.

Final4d normal SW preparation → full browser/server close → new offline/server-off/
no-bypass context retains exact index/six assets, saved body, writable editing,
discard/body focus, decoded320px photo and presented model. Its later1730ms command
is not boot latency. Source/test freeze is
4d04b0d7ebd8888268bd49ae1f67f07a909e37f5269f29eeb5403e532a78cbc4 (746files).
All-root npm test exits0:146files/3226PASS,21 separate todo,1840.01s. Typecheck,
all five builds and offline/HEIC isolation pass serially, reusing the same-tree
Desktop/offline builds; no literal checkpoint-script Exit0 is claimed. Independent
code/UI/data/runtime review has no mandatory findings. The suitable verified g0
checkpoint contains only this scope; keep private sources/audits/all.artifacts out.

The owned4191 preview serves the fixed final4d candidate; all20HTTP resources match
its receipt. The existing synthetic local sample is unchanged. Push is not release.
Next: measure remaining edit/output stages with complete IO start/end observations,
separating writes, validation, streaming and presentation before choosing a fix.
The large-GS fresh-copy performance failure and raw-ZIP repetition remain separate;
§6/01h are unimplemented, physical-device/adoption/release gates remain pending.

## Completed boundary —existing evidence during an ordinary Caption edit

Outcome: apply a Caption body change, save and continue/cold-reopen without
repeating per-I/O owner audits inside one accepted pure receipt read. First
measure the readonly evidence contribution within the existing edit stage on
the verified873 baseline. A private diagnostic build may record only method/
receipt/inventory start/end intervals; it grants no new production evidence and
does not postpone validation. Reuse the owned Ki84 profile/input and browser
driver, not another restore matrix.

Before production changes, specify and independently review one consumer:
`PersistentContentVerifier.verify` only when `allowNewEvidence=false`. Capture
owned request/key before awaiting, read the same current receipt through the
existing selected/original readonly callback and retain the existing origin-CAS
`VerifiedInventoryPort.inspect` on every call. CAS is a separate namespace; do
not reconstruct its store through a Project-generation facade. The callback's
receipt reader has no executor/store authority and returns only owned facts.
Unregistered/staging calls stay strict; do not add a staging tag or broaden06b.
Keep `hasEvidence`, new-evidence execution/writes, model/parser/CAS put, whole
Session/provider checks and all write/Prepared/publication/recovery fences out.

Acceptance covers repeated fresh reads, exact facts, missing/corrupt receipts or
inventory, denied writes, closing/expiry and no executor call in the readonly
path, followed by actual edit → file inspection → continued edit/cold. Run the
required final checks once on the meaningful final tree. Stop only the affected
change if the reader needs a new authority or validation lifetime; no global
cache, §6/01h implementation, dependency, numeric guarantee or release.

The private873 diagnostic completes one actual edit:168 readonly verifications,
about25.2s union inside34.1s outer edit, receipt IO about24.3s and inventory0.9s
(nested, not additive). Its1346 rows have no drops/errors; two background photo
decodes are recorded. The global snapshot publisher reached its lifetime cap,
so its terminal IO counts/absent host span are not complete edit observations.
This supports choosing the receipt consumer, not normal latency acceptance.
The [concrete ports](../docs/specs/06-project-package-wire.md) are specified before
production changes. Use a normal873/new-candidate edit on copies of the same
closed profile for acceptance; do not rebuild the diagnostic benchmark.

Implemented the single-module reader extraction and readonly branch; the shared
helper validates receipt structure/key/digest only, preserving conditional facts
order. New6 fault/invariant cases plus the existing capability case pass (7),
sceneCore12 and typecheck pass; independent source/test review has no mandatory
findings. A fixture-only readonly assignment was corrected before typecheck
passed. Frozen source/test is
c155ab2ebcb6bf43c6a218d3931a7d3a022e94d302ab09e1b3a988d2087b7493
(same746paths); its offline candidate builds. The normal same-state873/c155 pair
is33.810→23.104s actual and33.223→21.2512s host edit. Complete outer IO snapshots
show owner reads10634→6292; metadata.readBytes243, crypto630/1,153,310B and
native/HTML0 remain equal. Metadata.readStream246→247, so do not claim all IO
counts match. This is one bounded pair, not a latency/no-regression guarantee.
Actual backup49,728,344B preserves the previous4 change byte sequences plus the
expected edit, all records and27payloads; continued editing/draft cancellation
passes. Its57.358s output has different history/job count from earlier samples
and is not a save-speed comparison. Normal SW preparation → full browser/server
close → new offline context (server stopped, no bypass) retains saved body,
writable editing/cancellation and decoded thumbnail/presented model. Exact
candidate index/six loaded asset hashes match. Full/canvas model/photo painting
was independently confirmed, including exact model-ROI pixel bytes. Independent
data/runtime/cold review has no mandatory findings. Final all-root suite passes
on this frozen tree:146files/3203tests,21 separate todo cases,1053.31s, one
process Exit0. Typecheck and all five builds plus offline/HEIC isolation pass,
executed serially with the earlier exact-tree offline build reused; this is the
required sequence, not one literal checkpoint-script Exit0. Earlier Desktop/
offline cohorts retain their source qualifications; this unit's current browser
evidence is the normal edit/file/cold path above. The suitable g0 checkpoint
contains only this reviewed scope; keep private source/audits and all.artifacts
outside Git. The existing4191 local link serves the fixedc155 candidate, with
all20HTTP resource hashes/lengths matched. Git owns its checkpoint identity.

Short meta-audit: grouping content requests needs a bounded invocation port
keeping inspection domain-owned, plus a retained-media callback rule. Fresh
admission must stay inside that trusted inspection; exactly-once invocation,
await/late-result refusal and the return boundary remain design questions.
The bulk candidate is unimplemented, with provider/Session/decoder/executor
outside; do not change authority or validation timing within this unit.
Next is the bounded inspection-port design/decision, not automatic promotion of
that candidate. Larger-copy latency, device/adoption and release gates remain
pending; the measured23s edit/57s output are still long operations.

## Completed boundary —continue editing after an ordinary backup

After the verified06b g0 checkpoint, close one connected save/display consumer.
Outcome: real backup → output state shown → editing continues, without reading
the same ready metadata again solely for presentation. Existing5f baseline is
host.backup.total43.6595s, generate38.408s, post-save overview5.2512s and
download2.076s (actual46.272s). Measure actual contribution;5.2512s is not an
eliminable-time guarantee. Body editing22.632s is separate.

Specify the ephemeral success/read ports in06 before code. Keep the final ready
read from the same successful backup command only for pure output presentation;
exact host/Session/sender/token and ready state must match. Default/failed/nonready/
mismatched/later calls stay fresh. Preserve every job/control/protection and
write/Prepared/readback/publication/Selection/recovery check. No retained global
read cache, new user setting or §6/01h implementation. Existing base-display
callers and tests keep their previous defaults. Focused success/fault/fallback
checks → actual save/edit/file/cold → independent review and required final checks
precede the next suitable g0 checkpoint. Stop only the affected optimization if
the result also grants command authority or needs a new validation lifetime.

Implemented three-source port connection preserves public ID returns and all
three ready fences. Session observes its actual final read after outer write
success; Sender forwards after package-operation success; Host uses a guarded
closure-local result for the immediate overview only. Old base-only/default
callers remain fresh. Focused10 (new7 plus existing3), sceneCore12 and typecheck
pass; independent source/test review has no mandatory findings. Frozen tree is
873e92d9d7a96a0cf7f4e922a7aad98a9169b68fa1a9dcce2a178b5b5666f818
(746files). Actual Ki84 backup49,728,227B passes full archive inspection:
the original3 change byte sequences, expected single edit, all records and27
payloads are exact. Editing continues after save; a new draft can be cancelled
without changing the saved body. Full browser/server close → network-off restart
uses the normal SW without bypass, with exact candidate index/six runtime asset
hashes, writable saved body, cancellation, decoded320×180 thumbnail and presented
3D. No browser errors or external requests were observed.

One retained5f/new873 pair reduces post-save overview5.2512→1.8806s and its owner
control reads1716→26; package job/control reads remain the same. All three ready
fences still run. Generation38.408→50.4745s and actual output46.272→55.917s were
slower in this pair, so this is a narrower presentation improvement, not an overall
save-speed gain or guarantee. Native decode remains zero during output; observed
crypto calls1456→1320. Environment/elapsed variation in the other stages is not
isolated by that pair. One additional same-state second-backup pair uses the
existing owned profiles: same records/original history plus one edit, one existing
generated backup, same label, Chromium/origin/viewport/DPR, SW blocked/bypassed
with no controller, and verified actual assets. Actual output61.961→55.728s,
generate50.9757→50.1021s, overview7.6657→2.5167s and download2.7179→2.4183s.
Overview owner reads again1716→26; package list/readStream/readBytes36/146/34
and all three ready fences remain. Both archives retain exact records/history
and27payloads. One late thumbnail bitmap crossed the before output phase; after
had none, so this is not a claim of identical native timing. These finite
observations support the narrow presentation change, not a general save-speed
or no-regression guarantee. Do not broaden validation lifetimes to fit a target.
Final all-root Vitest passes on the same frozen tree:146files,3197tests and21
separate todo cases,1067.57s, one process Exit0. Typecheck, all five builds and
offline/HEIC isolation pass on this same tree, executed serially using the already
passed exact-tree offline build; this is the required sequence, not a claim of
one literal checkpoint-script Exit0. Independent source/test and actual-file/
image evidence reviews have no mandatory findings. At that checkpoint4191 served
the fixed873 candidate, all20HTTP resource hashes/lengths matched; current delivery
is recorded above and old immutable candidates remain evidence. Only the
verified, reviewed scope may
enter the g0 checkpoint; private source/audits and all.artifacts remain outside
Git. Earlier06b and01i checks retain their own source/environment qualifications.

Next: ordinary Caption edit → save → continue editing still has long command
and generation stages. Measure the readonly receipt-verification contribution
before selecting its bounded consumer. Keep new evidence/model/parser/CAS/write
work and all Prepared/publication/recovery checks strict; no whole-Session cache,
§6 or01h implementation. Physical-device, larger-copy latency and release gates
remain separately pending.

## Completed boundary —owned pure reads during backup restore

PO2026-11-01 explicitly accepts [06b §§1–5](../docs/specs/06b-staging-read-operations-proposal.md).
Outcome: restore the confirmed high-resolution backup, edit, write an actual
backup and reopen separately/cold, with exact originals/history/identity retained.
Connect only Journal entries/parts/restored-bases and Repository pure reads to
the exact staging Job/FS/factory/lease, with entry and closing audits, denied
writes and operation expiry. Ordinary public accesses remain strict. Do not wrap
initialization, Session read/resume, validateRestore, model/media/CAS work,
receipts, publication or Selection. Keep every full ZIP/content inspection and
write/readback/recovery fence; no validation cache or global staging opt-in.

Before code changes, measure the fixed1308788 artifact using the same confirmed
4Scene/103Caption/27attachment/26image/4View/23material backup in a new owned
profile. Repeat with the new artifact at the same origin/Chromium/viewport and
another fresh profile; record phase elapsed times, IO/native counts and content
hashes. Relevant invariant/fault checks, actual file/cold flow, independent
review and serial final checks precede a suitable g0 checkpoint. Personal4182,
existing4191 and old profiles are untouched. Stop only the affected work for a
new authority/contract decision; §6/50 raw-ZIP repetitions,01h, new dependencies,
iPhone qualification and release remain excluded.

Implemented named four-consumer registration reuses the existing readonly
facade; the exact staging Job supplies live lease/pair checks and failure-path
closing audits. Focused12 (including real opening-signal abort, parallel lifetimes,
expiry and closing faults) and sceneCore12 pass. Independent boundary review
has no mandatory findings. Frozen source/test is
5f96447146bf049b0cf1ba65ebfd8f30a295ccd8753a7bd021f6ab61442aea14,
using the same746-file manifest as baseline. No validation/assertion relaxation
or new product capacity limit was introduced.

Fresh baseline on fixed130 (same confirmed backup, dedicated Chromium156,
1440×1000/DPR1, new profile, service workers blocked/controller absent, actual
asset SHA matched): confirm→Caption/edit91.483s,3D91.729s; native160/HTMLdecode0.
Full phase/IO and actual asset/profile/t0 receipts are retained privately.
Existing4191/4182/old profiles remain unchanged. Private selector/completion
probe errors were corrected and are not product failures or elapsed metrics.

Same-condition fresh-profile after: Caption appearance/edit-mode marker77.640s and3D77.857s, compared
with91.483/91.729s above. Initialize51.352→43.240s; its owning-control reads
14,005→12,187. Select11.899→8.003s, adopt14.850→13.609s; all-restore control
readStream22,831→19,411. Native count stays160 and HTMLdecode0; metadata/CAS and
write counts are unchanged. This is one measured pair, not a speed guarantee.
The later output47.224s before/46.272s after is functional evidence only because
the before lane had an extra cold opening. Both actual49,728,227-byte outputs
pass full BackupArchive inspection: same identity, all original change bytes
preserved with exactly one intended edit, identical expected projection and all
27 payload hashes/lengths (4Scene/103Caption/27attachments/26images/4Views/23materials).
The edit-mode marker is the enabled mode control; actual body commands are
confirmed separately. Array observations reach the4000-row instrumentation cap
and are not a total-allocation count. Actual execution/profile/t0 notes and
runtime SHA receipts are retained; independent metric/UI evidence review agrees.

The actual after output restores in a third fresh profile; the saved body is
writable and explicit discard retains it. That profile then prepares the normal
SW, fully closes browser/server, and cold-starts offline with the server stopped,
no bypass and document.fromServiceWorker=true. Index/all six actual runtime
asset hashes match the new candidate; body/3D/edit availability, page errors0
and external requests0 pass. Cold boot markers are24.911s Caption/29.897s3D/mode.
These are functional cold observations, not the before/after restore pair.

Milestone audit: accepted06b-only5-source diff on g0-baseline, source5f unchanged,
connected workflow and boundary/UI evidence reviewed. Full root completes in
one process:146files/3190PASS/21todo,899.00s/Exit0. No retries,
exclusions or relaxed assertions. Typecheck/all five required builds and
offline/HEIC isolation pass on the same5f tree, serially (equivalent required
sequence, not a literal one-command checkpoint run). Small offline2–5 and the
additional cold real-paint check pass: offline2–5 are4PASS/1.5min; cold actual
canvas and visible320×180 thumbnail decode/2RAF capture are independently seen.
The offscreen lazy-image probe and writer image-reading error were corrected
using visible-window decode and identical screenshot SHA/independent inspection;
no rendering defect or source fix resulted.
The unchanged huge offline first case retains130 evidence with an explicit
source-diff qualification (selected/original/SW implementation unchanged;
new staging, real-data cold and all root cases checked separately).
Final checks/review qualify this as a verified bounded g0 development checkpoint;
actual-index privacy, remote and deployment scope are checked at delivery. Git
owns commit/Push identity; this is not main/Pages release. A separate owned52962
preview serves the fixed5f artifact; all20 HTTP resources match byte/SHA.
Next connected candidate prioritizes ordinary Ki84 save/continued editing:
existing5f metrics show backup.generate38.408s plus post-save overview5.2512s
(total43.6595s, download2.076s; actual output46.272s). A same-command owned ready
result may feed pure presentation only, with fresh fallback and every job/control/
protection/write check retained; measure its actual contribution before claiming
improvement. Do not assume the whole overview is removable. Body command22.632s
is separate (display refresh is milliseconds). No new PoC, cross-command cache,
§6/01h or unapproved validation/receipt lifetime change belongs to this completion.

## Completed boundary —integrated current-PC quality improvement

PO approved the connected quality plan and the01i sequential-import/real-thumbnail/
active-original/hidden-resource direction. Preserve originals and full inspection;
manage live work/residency instead of treating compressed file size as RAM usage.
[01i](../docs/specs/01i-high-resolution-pc-workflow-proposal.md) owns the accepted
ports and acceptance. The old128MiB/2GiB/3GiB proposal is not adopted. No new wire,
recipe/ID, dependency, total-RAM/capacity guarantee, iPhone qualification or release.
One writer; independent reviewers are read-only. No per-control PO testing waits.

### Implemented workflow and quality repairs

- LociMyu conversion uses a verified streamed catalog and one-body parser ownership,
  preserving exact legacy analysis/recipe/receipt identity. All-entry CRC/hash and
  fresh retained-source/report semantic inspection remain. Bounded unused XLSX
  auxiliary XML is preserved, with consumed targets still strictly inspected.
- PC PNG/JPEG raster work is separate from geometry work. Shared model/native
  queues and explicit CPU/GPU intents cover inspection, loaders, thumbnails and
  the one original-image viewer. Canonical Project inspection stays complete;
  hidden display templates are releasable/reloadable. GPU failures remain local
  to their model, with a reason/retry and safe already-prepared viewing retained.
- Actual320px derivatives and immutable keys replace original-sized card images.
  Fit/100%/zoom/pan use one viewer. Existing unpaired HEIC and Photo inspection
  share ownership; actual native bitmap identity reaches canvas, and late encoder
  cleanup preserves the old standalone cancellation contract. No new codec.
- Conversion summaries lead with inherited counts and unresolved items. File
  intents/report feedback, relation confirmation, success-only passive notices,
  keyed Scene focus and pending GS/Proxy demand/retry are integrated. The existing
  [design ledger](../docs/ui-design-review.md) owns PCQ issues and rendered findings.
- Actual compact visibility now releases3D without blocking Caption metadata or
  safe saving. Deferred position/parent actions retain exact target/IME/draft and
  cancellation guards; ready coordinates inherit only their waiting-task focus.
  File sticky insets and short-height Caption scrolling fix covered/zero-height
  inputs without adding screens or changing the normal-height list/detail layout.

### Executed evidence and qualifications

Exact Ki84 at the earlier01i candidate completes conversion/read/edit/real backup/
fresh restore/team return and browser+server-stop offline/reopen. It preserves
4Scenes/103Captions/27attachments/26unique media and all27 binary payload hashes/
lengths;4 duplicate legacy IDs each remain independent twice. Missing-ID6 rows and
unattached37 candidates are explained. Safe-default relations retain1View and3
source-only Views; separately confirmed relations retain4Views/23material overrides.
The earlier runs did not retain runtime asset SHA receipts and are not final130
full-workflow credit. Their source freezes and later affected-media/UI/file lanes
qualify reuse; the catalog/conversion/PNG-JPEG/ZIP/restore core is unchanged.

Current frozen source/test fingerprint is1308788de2d74ec576bc6920f872fc4ed7bfc4192d6a0bd755bd9eb3780bb0c3
(746files). A20-file final offline artifact snapshot and all file SHA receipts are
retained privately. Final actual main/entry JS/CSS HTTP hashes match that snapshot.
On real Ki84 at1440×1000→720×500CSS/DPR2→wide, all9 old8K/4K bitmaps close while
3D is hidden; Caption search/edit/confirmed discard work. Re-show prepares in
6.342s with64 pin identities/projections unchanged (maximum difference0) and saved
body retained. New short-height detail is239px instead of0; actual Apply hit and
Tab/Shift+Tab pass. File name bottom327.3px stays above footer347.3px; save hit,
long Japanese input, keyboard return/cancel/close and no horizontal overflow pass.
This is200%-equivalent layout, not native browser zoom or physical memory/GPU
qualification. Owned profile's stale-SW attempts are separated; latest HTTP was
explicitly bypassed/hashed for this UI lane, which is not offline/SW acceptance.

The broad Desktop39+image sweep executed all40:35PASS/5busy FAIL. Later exact
affected cases close point team/restore/cold, GS body replacement/Proxy/returns/
five-purpose restoration, mixed GS, point GPU and workspace sharing/conflict/
narrow focus/cold paths with unchanged waits/assertions. Qualified coverage is
39PASS/1 remaining performance FAIL across source-qualified cohorts, not a single
final40-process PASS. Current short-height CSS is additionally checked in the
final-artifact Ki84 lane above. Original failures and stage/file evidence remain.

Root unit run:145/146files pass,3157PASS/22FAIL/21todo,967.87s. Its22 failures are
obsolete named-resume inert synchronization, Scene rebuild counting, global raw
image memo counting and synchronous Review image paint observations. Test-only
repairs retain all data/remember/race/RAF/marker/file/cold assertions and pass25
focused cases. Later owned waiting-focus coverage adds4 cases; related29 pass.
Qualified unique root coverage is3183PASS/21todo, without double counting focus
overlap or claiming one-process npm-test Exit0. Other145files/unchanged cases are
reused with exact change/call-site review. Earlier sandbox Temp Git refusal and
dot/Tee diagnostic interruptions remain non-PASS evidence; approved-environment
verbose execution resolves the fixture permission issue without product changes.

Typecheck passes at the final TypeScript tree; the last delta is CSS only. All five
required builds and offline/HEIC isolation pass at1308788, serially. Independent
boundary/UI reviews have no unresolved mandatory findings, including later local
changes. This sequence is not described as a single check:checkpoint Exit0.

### Latency and remaining boundary

Lazy first-backup projection improves2.876s/+26native→0.0205s/0; post-mount native
work9→0, total195→160, Caption→3D7.841s→0.490s. Total restore nevertheless grows
148.608s→182.450s as storage/control stages vary: overall latency is not solved.
The tiny traced copy backup improves27.090s→23.067s, separately from queryless
original-case success. Do not compare this with the historical different-data94s.

The500k Review copy remains busy at240s in normal conditions and later completes;
private phase measurement374.358s includes50 archive inspections/20.116GB SHA input
and5 fresh GS inspections. Nested durations are not additive. A small SHA candidate
was rejected; production hashing/fresh validation/write/readback/publication/
selection/recovery fences are unchanged. Extended private functional completion
does not turn this performance case into PASS.
No same-condition pre-change500k full-copy PASS/time was found in the bounded
retained runs. Its archive/copy/SHA core is unchanged, but the current change's
latency contribution versus environment variance has not been isolated; neither
"no performance regression" nor "pre-existing defect" is established.

The same owned interrupted500k copy now resumes in137.177s, edits in46.503s and
actually saves a178,012,308B backup in233.196s. Full browser/server shutdown and
cold reopening retain the edit (138.356s from launch); a second actual backup takes
234.246s. Independent Archive/oracle checking passes: a distinct Project identity,
unchanged full SH4 source hash/length/profile, Proxy/manual pin/media/attachment,
identical cold token and all records. Whole-GS arrayBuffer attempts/pageerrors/
external requests remain0. This closes the functional tail, not its latency FAIL.

All existing offline5 pass in10.3min using normal SW behavior without bypass:
cold Mesh/Point/500k/Proxy/media/initial conversion/edit/save/reopen and same-address
static return; two-window safe update and wrong200/missing-resource recovery;
directory base; storage-bootstrap failure; foreign-worker refusal. Owned4191 now
serves only the frozen20-file candidate; independent HTTP200/byte/SHA checking
matches every resource, including index and worker. This HTTP check itself does
not claim browser SW registration. The small local synthetic sample is prepared.

The verified g0-baseline development checkpoint is committed and pushed2026-11-01
after actual-index privacy/content review. Git owns its identity; private
originals/audits and all.artifacts remain outside the commit. No main/Pages release.
This completed01i checkpoint's subsequent06b decision is now accepted; its
implementation and actual current checks are recorded at the top of this file.
Large raw-ZIP validation lifetime still needs a separate design. Performance,
device/adoption/release gates remain separate. Section6 remains NOT SELECTED and
does not remove payload inspection or solve the large-copy50 archive scans.
Broader payload lifetime, physical iOS/HEIC/GPU qualification and publication remain
separate decisions. Stop only the affected work for a genuine new policy/wire/
authority/safety conflict; do not reopen ordinary implementation approvals.

### Retained review basis —Ki84 and high-resolution workflow

This is the earlier review/proposal boundary, retained as evidence. The accepted
01i implementation and current remaining work are above; this history does not
make that work unapproved or restart its original proposal steps.

PO asks to reconcile the pasted practical evaluation with the saved audit evidence
and current contracts, then summarize improvements. This is a review/proposal,
not product implementation or publication at that prior boundary. High-pixel originals and reasonable
file-size growth are an accepted product direction; do not ask that decision again.

Plan: inspect the private audit logs/screenshots → verify the current input,
decode/render and file/recovery limits → distinguish current-PC blockers from
legacy-only observations → propose one exact-Ki84 open/read/edit/external-save/
fresh-profile-reopen workflow with actionable errors and usable initial display.
Keep originals, offline use and safety fences. Numeric budgets/display strategy
remain proposals until measured and specified; no guard removal, source reduction,
dependency, format, release or runtime changes are part of this review. Preserve
existing private evaluation records/artifacts; use bounded read-only reviewers.

Review complete: current/normal audit JSON, screenshots and current source were
checked with three bounded read-only reviews. The original ZIP stops at the input
cap; a separate attempt with its extracted GLB stops at the embedded-JPEG pixel
cap. Normal/Native pin, edit and local-reopen
observations do not establish current-PC acceptance. The external-save audit
records cancellation, not a demonstrated write failure. Command-log ms values
are not end-to-end conversion/save timings. No browser run or product change was
made in this review.

Additional source findings: JPEG framing also charges entropy bytes against
maxValues=8,000,000, so changing only64MiB/maxPixels is insufficient. ZIP input,
expanded total and entry size currently share maxFileBytes; first conversion and
retained-source reinspection need the same revised policy as content/file/recovery
reads. Ki84's extracted GLB has two8K JPEGs and a4K PNG; RGBA8 base-bitmap sizing
alone is576MiB (arithmetic estimate, not measured RAM/GPU use). Keep the existing
Three180 correspondence proof, original integrity and Session/publication fences.

The high-resolution user workflow proposal is:
1. Define PC admission and execution budgets separately for source/archive bytes,
   expanded entries, image validation work, decoded residency and GPU residency;
   reuse existing Caption-first/lazy-image/model preparation and bound image-level
   decode lifetimes. Apply consistently through import, retry, receive, output,
   restore and cold reopen. Preserve originals/quality; a display-only lower-detail
   path is an optional future design, not silent source resizing or current approval.
2. Report capacity, unsupported input and actual invalid structure separately,
   beside the affected input. Summarize planned records and warning counts before
   optional details. Missing-ID rows already have approved warning/exclusion/report
   behavior; do not call these nonempty rows blank or add a new migration rule.
3. Extend the existing media viewer with whole-image/100%, zoom and pan so retained
   high-pixel images are useful for inspection. Current viewer has only navigation/
   close and fitted rendering. Keep one viewer and image-owned loading/release.
4. Reassess initial pins on current-PC after exact input opens. The giant spheres
   were legacy Native observations; current unselected markers use a12px visual
   inside44px interaction area with saved scale. Do not copy0.03 as a new default
   or alter coordinates/retained scale to match the old screenshot.
5. Complete one exact-source conversion explanation → read/search/detail viewing
   → edit → real external file → separate dedicated environment restore → re-edit
   workflow, including interruption/retry and retained originals/history. Derive
   Scene/Caption/media/view/material expectations from original tables and approved
   mapping; old4displaySets/24media are comparison evidence, not new-route oracles.

The private original ZIP remains separately retained under the current conversion
contract; high-resolution support does not imply putting it into shared/backup
files. Existing unsupported-material/ambiguous-source refusal rules remain until
their exact input is evaluated. Next is measured capacity/lifetime specification
with concrete candidate budgets and acceptance, then an authorized integrated
implementation. High-pixel direction does not need another approval question;
this review ratifies no numeric guarantee, new display degradation or release.

## Completed boundary —reproducible browser coverage and efficient regression

PO authorizes the audited sequence: first fix browser execution/build prerequisites
and missing auto-offline/update/same-Project two-window evidence, then consolidate
heavy redundant tests while preserving all safety/compatibility checks. Report
comparable before/after wall times and the next stage; no small manual test waits.

Plan: establish one reproducible tracked current-PC lane with owned origins and
fresh correct artifacts → adapt existing multi-build offline faults and add one
same-profile same-Project exclusion/release workflow → independent review and
execute these lanes → profile/consolidate the costly immutable preparation and
shared full-roundtrip work with a retained-assertion mapping → focused/fault tests,
full final serial checkpoint and before/after execution timings → docs/handoff and
verified g0 checkpoint/Push. One implementation writer; parallel review is read-only.
No new framework/dependency, production/storage/format/gate relaxation, arbitrary
count target, automatic retry, assertion reduction or timeout increase. Distinct
privacy/profile/recipe/original/lease/publication/recovery risks remain covered.
Stop only the affected unit for a genuinely new product/architecture contract.

Preserve the unrelated pre-existing investigation record and private artifacts;
they are outside this implementation/commit. The initial task record is saved
under ignored artifacts. Base f1f636e, g0-baseline.
Baseline full run1058.78s,140 files/3126PASS/21existingTODO; file-time sum1280.93s
with projectFiles879.61s, metadataHost167.23s, G0 verifier103.97s. New browser fault
coverage has no valid old-runtime baseline; distinguish restored coverage from
speedup, and compare the full root suite with the same flags/environment.


Phase1 implemented: the tracked Desktop runner selects an owned free loopback
origin, strictly refuses reuse and freshly builds both required artifacts; all
Desktop URL/allowlists use that origin, including manually launched contexts.
The existing five-case offline lane now waits for automatic preparation and reads
hidden healthy status, with current Settings/repair labels and pre-app foreign
worker seeding. New actual same-profile/same-Project exclusion/release/save/reload
case PASS23.1s (55.1s with fresh builds), inspecting exact backup identity, old
change bytes and original GLB bytes. Static Desktop entry PASS4.0s. New-test
creation failures (unfocused model selector/Node Automerge initialization) remain
in ignored run artifacts; no production defect or relaxed assertion resulted.
The five existing offline cases now PASS:500k static→cold edit/save/reopen,
admitted conversion/refusal, removal/static return681.056s (fresh4-build wall
738.70s); A/B two-window update with wrong200/missing/interruption/quota/repair,
cache/controller/draft preservation and full-close cold-B46.739s; directory scope
7.087s, Project bootstrap failure5.395s, foreign worker5.402s. Runs
1793432699852-57128 and1793432213271-67004 retain exact evidence. Earlier failures
were old File/help overlays and an ambiguous two-gallery image locator; helpers
now close actual owned menus and scope the Caption window, without forceclick,
DOM writes, relaxed assertions or retries. Phase1 adds/restores coverage, not an
old-versus-new speed comparison. Phase2 begins with a serial same-command G0
before measurement; all four recipe-specific return flows remain unchanged.


Phase2 retains every existing test/assertion and changes only G0 immutable
preparation: one synthetic Git repository per suite, physical case-local copies
including .git and deep-cloned metadata, separate failure-safe case/template
cleanup. New isolation case proves A write/commit does not alter B/template
HEAD, registry/fixture bytes or nested metadata. Both independent reviews have
no required findings. Same-command serial G0 measurements: before82PASS,
Vitest107.60s/npm process wall108.91s; after83PASS (one isolation case),
82.44s/83.98s, about25s/23% less observed elapsed time. Single before/after
observations are not a numeric guarantee. Production verifier, four recipe returns,
media matrices and all fault/privacy/version/routing assertions remain unchanged.
Final verification at the frozen source/test tree: serial check:checkpoint PASS
(typecheck, full root suite, normal/harness/validation/Desktop/offline builds,
offline isolation);140files/3127PASS/21existingTODO. Full Vitest1228.65s versus
baseline1058.78s (+169.87s); complete checkpoint wall1333.89s. This is a qualified
reference comparison, not an overall speedup. File durations before→after:
projectFiles879.61→1219.20s, metadataHost167.23→185.67s, G0103.97→76.17s.
The unchanged large file dominates elapsed time; collect27.71→68.07s and
transform6.14→12.90s also increased. Causes are not separated. Summed file/test
time1280.93→1733.78s is not parallel wall time. No numeric-driven rerun or
removal of distinct safety coverage was used.

Five-artifact HEIC public-path isolation PASS. Desktop collection PASS39cases in
24files; collection is not execution of all those cases. The bounded executed
browser cases are listed above; no aggregate browser/device/adoption claim.
The existing4191 preview returns200 and exact final offline-artifact HTML and
entry JS/CSS bytes. Frozen source/test19-file hashes match before/after the final
checkpoint. Evidence is under ignored .artifacts/e2e/test-strategy; earlier failed
runs and profiles remain. Documentation links/diff and staged scope are checked
before the verified g0 checkpoint/Push; no release or normal PWA activation.

Next: close this test-infrastructure slice and return to an integrated real-data
operation/UI/UX pass, fixing concrete issues there. Retain the recipe-specific
file workflows and recorded runtime bottleneck; do not continue auxiliary test
consolidation without a concrete coverage-preserving need. Physical iOS, native
IME, trusted HTTPS and real disk-full acceptance remain pending; existing21TODO
are not counted as passes. No small PO test waits are introduced.

## Previous boundary —test value, execution cost and coverage review

PO requests reviewing whether the regression suite is optimal: identify duplication
and unnecessary cost, and check for missing important behavior. This boundary is
read-only investigation/reporting; no test removal, assertion relaxation, CI/gate
change or production implementation is authorized by this review alone.
Plan: inspect existing full-run timings/config selection, sample the expensive
integration/fixture patterns, independently review redundancy and route/fault gaps,
then report a prioritized retain/consolidate/add proposal with evidence. Reuse
recorded runs; do not rerun the full suite merely to count tests. Stop before
altering accepted coverage or final-check requirements. Root and two bounded
reviewers remain read-only except this current task record.

Review completed using the last full-run log and its matching140-file Vitest cache
(sum of file durations1280.93s; parallel wall1058.78s). projectFiles879.61s,
ui/projectMetadataHost167.23s and scripts/g0EvidenceVerifier103.97s account for
about90% of summed file durations, not90% of wall. No new full run was needed.
Independent reviews found both consolidation candidates and evidence gaps:
- projectFiles exerciseOpaqueFileReturns repeats two-peer/two-round-trip/copy/cold
  work for four07m/07n variants. Keep recipe/profile/original/privacy checks per
  variant; evaluate shared round-trip coverage only after proving common paths.
  Media-format package/restore matrices have a similar layering opportunity.
- Explicit Caption/material/view test owners can replace ambiguous generic button
  lookup; recent hidden/removed-control failures cost full-suite reruns. Evidence
  verifier fixtures also repeatedly create Git repositories/commits and spawn CLI;
  share immutable preparation while isolating mutations, retaining real CLI/Git
  identity/redaction/environment boundary tests. Measure before claiming savings.
- Restore receipt mutations, generation/lease/late-completion faults, field-specific
  conflicts and original-byte/privacy assertions cover distinct risks; retain them.
- Current PC browser specs read offline-desktop-dist, but the shared Desktop lane
  builds only desktop-dist. Align tracked commands/artifact prerequisites so a
  fresh checkout cannot use absent/stale offline output. Root check:checkpoint
  does not execute browser specs and is not evidence of all browser routes.
- Old09 multi-build fault helper still requires manual preparation/old UI. Adapt
  existing tests to auto startup and rerun A-to-B update failure/old-cache retention,
  quota/repair, two-window pending-update and ownership/scope cases. The passing
  single-build cold/removal flow is not equivalent evidence.
- A representative same-profile/same-Project two-window write-exclusion/release
  browser case needs explicit confirmation; injected LockManager tests, separate
  recipient contexts and package-lock GS tests do not alone prove that workflow.
  Existing21TODO concern mostly old-v1/G0 contracts, not21 current feature defects;
  physical iOS/native IME/HTTPS evidence remains separate.
Recommended sequencing: repair reproducible/current browser coverage first, then
profile expensive cases and consolidate setup/shared round-trips with unchanged
risk coverage. Do not set a target test count or remove checks merely by count.
Production/tests/configs are unchanged by this audit. Next implementation requires
its own bounded plan; accepted final-check/release gates have not been weakened.

## Previous verified boundary —measured file output and one intent per operation

PO explicitly requests improving file-output wait while preserving save safety,
automatic verification and a careful check for meaningless development-era splits.
Outcome: edit → export the intended file → verify/save → reopen or hand over with
the same exact originals/history and existing recovery guarantees, with less wait.
Baseline: direct-ui-cleanup diagnostic after-delete14.1s; backup.total12.80s,
generate9.64s, overview3.16s. Treat prior figures as a baseline to reproduce, not
a new numeric guarantee. No small manual test dependencies.

Plan: measure browser action plus storage/validation/refresh/archive/download
stages on the existing connected sample → audit File entry/handler/service mapping
for duplicate intent or redundant refresh → specify any lifetime or boundary
change before implementation → implement a bounded improvement → fault/invariant
tests, comparable owned-browser timing and exact file/reopen verification →
independent review and final required checks, then suitable g0 checkpoint/Push.
One implementation writer; independent audit/review is read-only. Preserve all
validation, write/readback/publication, leases, metadata/privacy, cancellation and
recovery fences. No new dependency/schema, capacity, adoption or release scope.
If evidence requires changing validation timing or recovery/publication contracts,
record the precise discrepancy and stop only that affected decision for review.

Current implementation/evidence:
- Reproduced the same owned-Chromium two-Mesh/two-Caption/PNG sample: edit → four
  backups → exact archive inspection/
  reopen flow. Fresh before observations: after-delete10.206s and9.567s. Adding
  optional diagnostic spans changed no control flow; ZIP stream work was about0.08s
  in the second observation, while readiness/previous-output inspection and display
  refresh dominated. These individual observations are not a performance guarantee.
- Kept the complete prior-output gate within one existing metadata-read callback;
  ownId, abandoned/state/open/terminal/completion checks and closing-generation
  refusal remain. A fresh backup open now owns copied bytes and reuses only that
  open's exact validated immutable source instead of decoding it twice. Later opens
  and prepare still inspect independently; no cross-operation cache or write fence
  was introduced. [Spec06](../docs/specs/06-project-package-wire.md) records the scope.
- Scope-only after-delete9.756s did not show a whole-action improvement. With the
  fresh-open duplicate decode removed, same-flow after-delete8.970s; generate5.492s
  versus6.273s in the diagnostic-before observation, slot-before0.726/slot-finish0.808s
  versus0.932/1.318s. Refresh remained2.839s versus2.625s. Overall benefit is modest
  and subject to runtime variance. The final-artifact repeat completed at7.639s
  (generate4.943s, refresh1.992s, download0.398s); the earlier after8.970s and both
  before observations remain in .artifacts/e2e/output-latency/timing-summary.json.
  This limited sample supports a bounded improvement, not a general speed claim.
- Closing-audit faults before capture and after persistence refuse subsequent work;
  post-persist originals remain as a started job and cold retry succeeds. Removing a
  prior artifact still blocks a later output. Alias-mutation regression verifies
  immediate ownership of fresh-open originals. Focused faults and existing backup/
  interrupted/abandon paths pass; optional observer failure retains output authority.
- File purposes/lineage/privacy contracts and valid shortcuts/download recovery remain.
  UI audit also covered model/media/team/recovery: no other meaningless feature
  branches found. Kept one update/repair primary action; cache-only recheck is under
  closed Details, with unchanged ports/lifecycle. Proxy help now limits the required
  surface to model-surface selection, preserving the numeric/manual placement path.
- Independent read-only final source/test/spec review: no required findings. Required
  serial checkpoint PASS: typecheck,140 root files/3126PASS/21existingTODO
  (unexecuted), normal/harness/validation/Desktop/offline builds, offline isolation
  with14 exact SRI resources. HEIC isolation PASS for all5 artifacts. The frozen
  source/test tree is unchanged after the check. Final connected Chromium flow
  PASS: generated/downloaded ZIP inspection, exact camera-only unchanged history,
  editing, material apply, deletion and page-reopen persistence. The4191 HTML and
  main assets match the final offline artifact. Physical/device/HTTPS/adoption and
  release gates are unchanged. Final cold-offline/removal Chromium flow also PASS:
  complete browser close → stopped-server cached startup → edit/download → normal
  reconnect/removal/reopen; exact Project identity/history/media remain.

Next: reduce the remaining output-history/display-refresh analysis within the
accepted read lifetime; preserve immediate download verification and recovery. Do
not merge the five file purposes or remove retained file verification as UI cleanup.
Old09 multi-build fault qualification remains pending: its manual-prepare helper
still needs adaptation to automatic startup. Do not count this small-sample timing
or current cold test as that full lane, practical-device, aggregate or release
qualification.10k-Caption qualification remains deferred. No PO test dependency.


## Previous verified boundary —record-first editing and direct camera navigation

Latest PO steering (after this checkpoint): simplify further before the older
model/recovery follow-up. Collect the entire correction group before source edits:
remove the generic record-organization entrance; add list-top creation and row edit/
delete actions with existing draft, confirmation, membership and virtualization
fences. Remove the visible projection label, retaining its accessible name. Make
camera recording serve each Scene's initial view without a general recorded-view
picker; preserve existing view data and clarify initial-view update ownership.
Clarify material target naming and make supported editing discoverable. Explain/
remove the comparison-window manager entirely (latest explicit PO instruction),
retaining normal stacking and active-window behavior, and expose file import/export intent.
PO approved initial automatic app-only preparation with one online/offline product path. Accepted09§9.1 records same-origin/profile preservation, cached cold startup, one boot attempt, foreign-worker refusal and same-page removal suppression; no forced activation/reload or OS install. Implementation now removes comparison manager, activates windows by pointer/focus, places creation and row edit/delete in the list, retains membership/tags as secondary operations, records Scene entry atomically with old views retained, exposes direct material edits and clear File intents. Plus is primary, with color/coordinates in a secondary disclosure. Existing source/history and Session/write/readback/IME/virtual-row boundaries remain.

Verification complete for this bounded PC workflow:
- Required serial checkpoint PASS: typecheck,140 root files/3122PASS/21existingTODO (unexecuted), normal/harness/validation/Desktop/offline builds and offline isolation (14 exact SRI resources). Source and root-unit tree remain unchanged after this run.
- HEIC isolation PASS for all five artifacts. Independent read-only reviews have no outstanding P1/P2.
- Four connected Chromium flows PASS: records/camera/material/save, view/edit/IME, automatic cold-offline/removal, keyboard drafts/independent file. Final-build cold/removal PASS; final record flow (including deletion focus/geometry, compact rows, material apply, file inspection and cold reopen) PASS. The4191 HTML and its main assets match the final offline candidate;4182 is untouched.
- First full root failures were3 obsolete UI references (removed manager, moved search scope, old material label); all were adapted without losing geometry/IME/owner/token/history/readiness checks and pass. Failure log/freeze remain in .artifacts/e2e/direct-ui-cleanup/checkpoint-before-selector-adaptation.*.
- Final record export exceeded the generic15s Playwright input wait while still generating. Measured equivalent flow completed all data assertions: after-delete output14.1s, backup.total12.80s (generate9.64s, overview3.16s). This is known latency, not an improvement or performance guarantee. Only the download wait now uses the existing90s file-action diagnostic budget; other15s/overall240s deadlines and all data assertions remain. The changed E2E spec is outside Vitest's .test.ts selection; typecheck and that browser case were rerun, without rerunning unchanged root units/builds. Preserve final-browser failure, diagnostic-result and last-result under .artifacts/e2e/direct-ui-cleanup.

Next priority: improve the measured user-facing file-output wait without weakening validation/recovery fences. Continue the remaining model/media/teamwork/recovery action audit at the same simple, intent-based UI standard. The old09 multi-build fault lane was not rerun and still needs its manual-preparation helper adapted to automatic startup before qualification; current cold evidence does not pass that full lane, physical-device/HTTPS, aggregate adoption or release gates. Keep10k-Caption qualification deferred.

No PO testing dependency or new dependency/release authority.

Verified development checkpoint2026-10-31; Git owns its commit identity. PO's
actual-use directions cover unclear controls, persistent list/detail, list-owned
pin work, 描画 completion and direct camera navigation. They supersede old layout
choices, not data/command contracts. Root is sole writer; three bounded read-only
reviewers cover operation meaning, input/ports and integration/rendered layout.
No small PO testing waits or renewed ordinary implementation approvals.

Outcome: select a record in the list → read/edit alongside it → start pin move,
parent change or organization there → visibly finish/cancel → navigate beside3D
→ apply drawing edits → save/share/reopen the same Project.

Delivered: common Scene context and three tabs (Caption/model/描画); list/detail
with stable form owners outside virtual rows; selected-record toolbar; symbol-only
unselected pins preserving accessible names/color/scale/review; secondary coordinate
and classification-tag controls; no empty comparison menu. Scene order means list
order. Existing recorded camera/background/entry data lives in カメラ位置 beside3D,
with retained input and visible close/completion, not a Saved View task tab.
Active drawing/Caption completion stays visible; ファイルに保存 remains a separate result.
Projection, left-drag orbit and hand-icon/keyboard pan are by the gizmo.

Typed local navigation owns controls/display identity and gesture ID, releases on
cancel/blur/disposal/Scene or display changes, and never writes Project history or
places pins. Optional cameraReady distinguishes current local camera/controls from
strict all-model ready, with legacy fallback and current display/Scene/token checks.
Partial-ready content remains navigable; editing/files/pick/assetIds retain their
existing strict preparation/write fences. Original data, Session authority, drafts,
IME, selection, conflict, privacy and recovery rules are retained. No dependency,
format/schema, migration, renderer/composition policy, capacity or release change.

Final checks at the frozen44-file source/test tree:
- Typecheck and complete root suite:140 files,3116PASS,21existingTODO (unexecuted).
- Normal/harness/validation/Desktop/offline builds pass serially; dedicated offline
  isolation passes14 exact SRI resources with the existing worker/manifest boundary.
- HEIC isolation passes for all five artifacts; no local decoder PoC enters them.
- Dedicated owned-Chromium connected cases cover record list/detail/pin actions,
  orbit/pan/projection, unchanged metadata from navigation, drawing apply/save/reopen,
  view/edit return, keyboard model/View/drawing drafts and independent-file reopening,
  Review independent copy, tag-draft return and team conflict/file completion.
- Held-texture loading flow passes (19.0s): readable/searchable records, actual
  axis/orbit/pan pixel changes, edit/pin/file fences and exact completed metadata.
- Final generated artifact's same-app connected → full browser/server shutdown →
  cold offline edit/save → reconnect/remove preparation → reopen passes (39.5s).
  Project identity, original changes and model/media bodies are retained.
- Owned http://127.0.0.1:4191/ returns200 and exact final index/reference bytes.
  Original4182/browser data are untouched. Preview process/hash receipt and frozen
  source manifest are in .artifacts/e2e/record-camera-cleanup/preview.json and
  checkpoint-verified-source.json. Source/test bytes remain unchanged after checks.

Evidence and retained failures are in that same artifact folder. Initial browser runs and independent review exposed ambiguous old selectors, late organization nodes
outside their sheet, covered close controls, short-layout toolbar overlap and
intermediate-width clipping. Repaired and independently reviewed actual layout,
owner return/focus, outside dismissal, unsupported-axis pointer and transparent-
gizmo-corner behavior; final short/intermediate/narrow images and related cases pass.
Tag draft return was corrected to focus inside its retained sheet, with dispatch0,
unchanged token and actual browser coverage. The first root attempt was interrupted
for that real fix; another environment transition stopped a run before a result.
Their checkpoint-before-tag-focus-* and checkpoint-before-environment-interruption
logs remain non-PASS evidence. A completed run's3114PASS/2FAIL is retained in
checkpoint-before-two-selector-fixes-*: one hidden Apply selector and the partial-
ready camera regression were fixed, preserving all exact assertions. The final
full run is3116PASS; no automatic retry, timeout increase, exclusion or assertion weakening.
The compact PC pin-color disclosure is an explicit documented layout exception;
existing color matching/selection and noncompact direct controls are unchanged.

Meta-audit: this closes the approved actual-use workflow with independent input,
integration, visual and document review. Existing g0-baseline/origin and main-only
Pages deployment boundary remain. No general AAA-quality/device/adoption/release
pass is inferred; physical iOS/native IME/touch and grouped human acceptance remain
pending. A staged-content/status update is not a reason to repeat runtime checks.

Next: use this navigation for the already accepted model replacement → pin correction
→ interrupted recovery and retained local editing flows. Reuse their service and
owned-browser evidence, fix actual usability defects, then group user acceptance
on an integrated candidate. No new format, capacity, public entry or deployment.

## Previous verified boundary —audit and simplify the complete PC control flow

PO2026-10-31 requests checking each button/UI against its actual function, finding
duplicates and development-only separation residue, and repairing unnecessary
steps as part of final UX organization. Primary scope is the unified09 PC app:
home/open/create/convert/recover → read/edit/organize/model/view/media → files/
team/conflict/restore → Settings. Retained legacy and harness routes are internal
compatibility evidence, not a reason to expose multiple PC user workflows.

Plan: enumerate the complete rendered-state/control inventory with independent
read-only audits before product fixes → record grouped findings and minimal repair
acceptance in the existing UI review/design → repair one coherent product flow
using existing ports → focused behavior and dedicated-Chromium verification →
final serial checkpoint/5-build/isolation, independent diff review and verified Push.
Root is sole writer. Start at clean/synced0da3f8e. Existing model/team continuation
is subordinate to this latest UI audit; do not begin unrelated feature expansion.

Acceptance: each retained action has a distinct user result or justified shortcut;
labels and enabled/visible state match its handler; no empty/nonfunctional panels,
avoidable repeated choice, or internal route/build/purpose selection masquerading
as a user task. Review View/Edit and empty/selected/draft/busy/failure/recovery
states, not just the default screen. Preserve all actual functions, originals,
commands, unsaved/IME/write/recovery/privacy/worker fences and necessary warnings.
No dependency, storage/schema, renderer, capacity, public-entry or release change.
Stop only the affected item for a real product/compatibility/architecture conflict.
No small PO test/approval waits; run the relevant automated checks autonomously.

Complete source/control inventories from three independent read-only scopes and
root's standalone Review/file adapter inspection are consolidated in the existing
[UI review R1–R10](../docs/ui-design-review.md#2026-10-31-操作と機能の棚卸し), before
product edits. Repair scope: one-purpose File/navigation; existing gizmo on Review
and no duplicate axes; target/draft disclosure and placement mode; real issue
navigation; local Point size in View; truthful tags; startup recovery; conversion
recheck; human copy/optional diagnostics; single attachment cards. UI slots/import
boundaries are recorded in the workspace design. Preserve the functional file
purposes, Scene creation vs duplication, membership vs local hiding, independent
copy, local/shared names and offline prepare/recheck/removal distinctions.

Implemented R1–R10 through existing UI/file/Session ports. File now shows one
purpose with four keyboard-operable tabs; opening does not create an unfinished
choice. The retained Project-navigation node lives there rather than Help.
Review uses the accepted gizmo; product saved-view controls retain projection
without duplicate axes. Target/draft controls, actual candidate navigation,
View-local Point size/tag membership, recovery/convert messages, optional technical
details and one attachment card retain their original command/data authority.
Source/control and final-diff reviews by three read-only reviewers have no remaining
findings after their bounded fixes; reviewers did not execute browser tests.

Focused component/import checks56PASS; representative project-file selection checks
7PASS, then the corrected single-card description case1PASS. A separate earlier
164-case focused run and typecheck pass are retained, not final-tree completion.
Dedicated Chromium: workspace-completion handoff/conflict/save/reload case PASS;
View/Edit case PASS28.2s; final empty Review/gizmo/cancel/copy/save/reload case
PASS41.1s. File continuation PASS134.7s: empty tag-focus and cancelled verification
retain navigation/editing; receive preserves local body, restore feedback respects
reduced motion, post-restore File has one selected purpose, saved original changes
match, reload and320/640/1280px layouts remain usable. This uses the owned09 artifact
with Service Workers blocked, not a personal origin or offline-launch proof.
Same-app cold/preparation/removal also passed the intermediate artifact. The final
regenerated artifact's full same-app connected→prepared cold offline edit/save→
remove→connected restart PASS40.0s (final-artifact-result.json): Project identity,
original changes and model/media bytes retained, no automatic registration or
foreign-cache removal. Owned4191 preview responds200 and matches the final index
hash (preview.json). The first full
checkpoint completed typecheck/root tests with3110PASS/1FAIL/21 existing TODO:
the deletion-confirmation assertion counted both4 public effects and4 folded
technical rows. Scoped it to the direct public list, retained all dependency names,
and separately asserted4 technical rows in a closed disclosure. The complete
delete/retry/files/cold case then PASS; independent review confirms no invariant
was relaxed. No production source changed. Retain checkpoint-before-assertion-fix.log.
Final serial check:checkpoint PASS on checkpoint-verified-source.json (50 source/
test files): typecheck;140 files/3111PASS/21 existing TODO; all5 builds;14 exact
offline resources/SRI and retained runtime separation. HEIC public-path isolation
PASS across all5 artifacts. No source/test edits during or after that check.

Retain all failed receipts under .artifacts/e2e/ui-control-cleanup. Failures corrected
without weakening fences/assertions: exact import allowlist; canonical attachment
description assertion after card consolidation; Node-side Automerge initialization;
formatted conflict-option label matching with exact final value; renamed projection
summary; duplicate empty-message locator; existing closed organization/comparison
disclosures and navigation locators that included a hidden startup button. One
obsolete continuation run was intentionally interrupted while it attempted to
select a Caption behind the open File sheet; partial artifacts are retained, not
counted as PASS. The final test explicitly closes File before returning to editing.
Tests
use actual UI disclosure/tab controls, not forced DOM changes; no deadline extension,
automatic retry, skip or personal4182 access. Result files distinguish each tree.

Meta-audit: R1–R10 close the requested action/function cleanup within existing UI
ports and safety contracts. Independent implementation/input/document reviews have
no remaining findings. The57 source/test/document files form the suitable verified
g0 checkpoint; Git owns its final commit and remote identity. No package, dependency,
capacity, renderer policy, ordinary-entry activation or deployment change. Local
links/diff and frozen source/test equality remain the final staging checks;
documentation/staging/Push alone does not justify repeating runtime verification.

Next connected product unit is representative model replacement,
pin correction and interrupted team/recovery through the simplified UI, then one
grouped PC acceptance review. Physical devices/OS install/adoption/release remain
separate; no fine PO testing dependency or aggregate AAA-quality pass.

## Previous verified boundary —one PC application across connected/offline startup

PO2026-10-30 approves one startup and the same application UI, with offline
preparation/state in Settings. Use the existing09 PC candidate as that user entry;
retain internal static/legacy verification builds and all publication gates.
Outcome: unprepared connected start → prepare → full-close offline start → edit/
save → reconnect → remove preparation → full-close connected start of the same
artifact, retaining the same Project, history and bodies without re-registration.

Plan: update09's approved direction and DOM/ownership acceptance → move home
preparation into Settings and remove static-redeployment copy → focused controls/
lifecycle checks and the connected dedicated-Chromium flow → final required
checkpoint/5 builds/isolation and independent review → verified g0 checkpoint.
Root is sole writer; lifecycle/contract/UX reviewers are read-only. Work started
from clean/synced41f3e7f; no new dependency or actual deployment is needed.

Acceptance: no online/offline startup selector; one mounted offline-control node
across home/recovery/editor; explicit preparation remains independent of Project
commands. Removal retains current screens until close, Project/foreign caches and
all ownership checks; next connected start uses the same app and saved content.
Keep original Native/v1 reader boundaries, SW identity/SRI, phase distinctions,
write/IME/recovery fences and update/full-close rules. No origin/profile migration,
old-viewer offline expansion, main/Pages activation, forced reload or auto-register.
Stop only affected work for an actual contract conflict or new authority.

Implemented: preparation/state in the same Settings envelope on home and editor;
same control returned to its original owner; one product introduction; same-app
connected reopening after removal. Loading shows status only; bootstrap failure
retains preparation/removal in Settings. Registration, worker and storage algorithms
are unchanged. Independent lifecycle/contract review has no remaining findings;
wide/narrow home and narrow bootstrap-error Settings have no mandatory visual issue.
Recovery-header spacing was checked from DOM/CSS, not a physical-device result.

Focused lifecycle/control/import checks28PASS and typecheck PASS. Dedicated Chromium
3 connected cases PASS164.0s (final-result.json): view/edit presentation, complete
file handoff/receive/cold flow, and the same-artifact connected→prepared cold offline
edit/save→remove→connected restart. The latter compares Project identity, original
change bytes and model/media bytes; no registration reappears and foreign cache/
registration survive. Bootstrap-storage failure and foreign-controller refusal
PASS2 cases12.1s (lifecycle-final-result.json). No personal browser/profile is used.
Evidence is in .artifacts/e2e/unified-startup; tested-source.json freezes10 changed
source/test files. Final serial check:checkpoint PASS (typecheck;140 files,
3110PASS/21 existing TODO; all5 builds;14 exact offline resources/SRI). HEIC
isolation PASS across all5 artifacts. The final generated artifact's full same-app
connected/cold/removal cycle PASS1 case45.7s (artifact-cycle-result.json), with no
retry or skipped case. Owned4191 preview responds200 and matches the final index
hash. No OS-native IME, physical-device, adoption or release claim.

Retain earlier failed browser receipts: concurrent reads by the new ZIP-inspection
test hit the existing sequential-reader guard (fixed to sequential reads without
changing that guard); initial temporary controls could be replaced while startup
settled (removed from loading, with Settings created only on bootstrap failure).
Tests wait for the actual Settings owner, retaining existing deadlines/assertions.
The preliminary whole check was intentionally stopped before its result to add
three missing Settings-readiness awaits to retained offline E2E cases; its log
is retained separately and is not counted as a completed check. Required checks
were then run once on the frozen final source/test tree above.

Meta-audit: the same-app startup workflow closes09§9 without a new dependency,
storage/renderer policy or public-entry change. Independent final documentation
review found no remaining gate/ownership discrepancy. Commit/Push only the18
reviewed source/test/document files to the authorized g0-baseline checkpoint;
Git owns its final identity. No runtime rerun is needed for result prose/staging.

Next connected unit: exercise representative model replacement/pin correction and
team conflicts/interrupted receive through this unified PC UI, fixing concrete
usability defects within the accepted contracts. Reuse existing service cases and
connected browser flows; then prepare one grouped PC acceptance review. Keep
physical-device/OS-install/adoption/release evidence separate; no fine PO tests.

## Previous verified boundary —content-first workspace completion

PO2026-10-30 authorizes repairing the eight grouped review findings below.
Outcome: choose a Scene/record → read/edit text and media → adjust a pin in3D →
confirm/cancel → save/share/return, with relevant controls and coherent hierarchy.
Root is sole writer; bounded port/contract/visual reviewers are read-only.
Keep accepted gizmo, commands, data/history, separate drafts, IME/pointer guards,
read-only authority and all write/recovery/choice fences. No dependency, schema,
renderer, codec, capacity, ordinary activation or release change.

Plan: record UI ports/layout acceptance → group information/disclosure and active
task/file exits → align visual/copy/settings/comparison → focused behavior checks
and actual wide/narrow/short browser workflows → serial required checkpoint and
independent final review → verified g0-baseline checkpoint/Push. Stop only affected
work for a genuine contract conflict or new authority. No per-control PO tests.
Required acceptance: optional forms stay closed until invoked; title/body/media
precede attributes;3D pin work exposes the same guarded confirm/cancel; unsupported
material inputs are absent without hiding unresolved data; file purpose is retained
with a clear path to cancel/exit; existing comparisons/manual placements remain;
targets/focus/warnings and separate local/shared name scopes stay legible.

Implemented within this boundary: idle Scene/model management disclosure; stable
Caption title/body/media before secondary attributes; the same guarded pin controls
on the3D surface with narrow focus/return; contextual material values/unsupported
targets; larger media comparison defaults without replacing manual rectangles;
purpose-carrying save/share and explicit pending-choice exits; quieter navigation,
44px targets, compact header and separate local/shared name Settings. Success-only
notices expire; persistent failures and disclosure remain. View/placement footers
are at their panel end. A static notice row sits above the shared canvas/overlay
origin. Mode switches retain existing verification and show busy text/spinner.
No Session/storage/file/renderer authority or accepted gizmo behavior changes.

Focused source/behavior checks pass, including inherited material canonical values,
retained color/source-loss drafts, file choice/reset and held mode-switch fences.
Independent bounded source/input/contract and rendered wide reviews have no
remaining required findings. Final dedicated Chromium3 connected cases PASS127.8s:
view hides edit controls while retaining reading/local display/downloads; full
browser close/server stop → cold offline resume; new Scene/Caption/media/Point and
Mesh-material editing → backup/workspace download → isolated second browser
edits/returns a contribution → receive → narrow read/pin IME/cancel → reload.
Narrow pin confirm/cancel are fully in view; media ordering/comparison, contextual
file reset/exit, name-IME and busy mode transitions are asserted. No page errors
or external requests. Evidence: final-fixed-browser and result.json in
.artifacts/e2e/workspace-completion. This is dedicated Chromium evidence, not
physical device, OS-native IME, general adoption or release acceptance.
Independent final wide/narrow rendered review has no remaining required findings.
Final required serial checkpoint PASS: typecheck;140 root files/3110 tests PASS,
21 existing TODOs; all five builds; offline isolation14 exact SRI resources.
HEIC isolation across all five artifacts PASS. The offline build intentionally
mints a fresh build ID; final generated artifact cold browser-close/server-stop
offline startup PASS11.3s after those builds (final-artifact-cold-result.json).
Final source/test hashes in .artifacts/e2e/workspace-completion/tested-source.json
match the reviewed and checked tree. Final log: checkpoint.log; no subsequent
source/test change. This is a verified g0-baseline checkpoint; Git records commit
identity and remote status. No adoption, physical-device or release credit.

Retained diagnosis: the earlier full run passed139 files/3086 tests but found24
projectFiles failures from a new comparison reading group named `本文` preceding
the textarea in generic recorded-DOM lookup. Renamed it `比較ウィンドウの本文`,
retaining focus/scroll and all old assertions/helpers; added a connected identity
regression. Affected and related file cases PASS41 in193.3s, then the final browser
and full checkpoint above PASS. Retain checkpoint-body-label-collision-failures.log.
Retain earlier browser attempts and UI fixture-index failures in that folder:
numeric owner selection needs focus; hidden retained notes are not visible copy;
unselected color state incorrectly opened attributes (fixed); post-receive mode
verification was observed complete at5048ms, just beyond a new test's5s assertion (diagnostic,
not a performance pass). The new connected test waits for actual mode completion
within its existing15s page-action budget and checks immediate busy/disabled state;
no existing test assertion, timeout or safe publication fence is relaxed. All
browser fixtures are synthetic and local; no private source files are committed.
The first full checkpoint was stopped before completion after independent static
review found two additional old DOM scopes in projectFiles tests. Focused runs
reproduced both failures; corrected view-footer scope and explicit stage/shared
overlay-parent assertions PASS2/2. The original command/source guards, captured
values, stale-token and retry-count assertions remain. Retain the stopped log and
retained-dom-scope-failures.log; the final full check uses the updated test manifest.

Next connected unit: verify representative model replacement/pin correction and
collaboration conflict/interrupted receive through this navigation, using dedicated
browser contexts and owned test origins. Keep existing strict data/history/recovery
assertions and cancellation paths. Then consolidate remaining grouped device/user
acceptance on one integrated candidate. Large-Caption qualification remains deferred;
no new product policy, compatibility expansion, general adoption or release follows.

## Previous boundary —review likely next UI direction (repair authorized)

PO accepts the compact gizmo and requests a fresh review against previous orders.
Read-only product scope: inspect the current PC candidate and representative task
states for content priority, cognitive/operation flow, progressive disclosure,
short accurate copy, view-mode relevance and coherent polish. Group concrete
findings and proposed repair order before implementation. Root inspects current
screens; bounded independent reviewers read code/evidence. Record observed versus
code-only concerns; do not repeat historical issues as current without checking.
No product-code change, dependency, policy, release or external write authorized
by this review. Dedicated isolated browser fixtures only; no per-control PO tests.

Plan: current criteria/screens → targeted real-screen inspection of missing states
→ consolidate reviewer findings and priorities → report remaining decisions and
next engineering unit. Stop for a genuine scope/authority conflict only.

Review outcome: current HEAD7352e2a, dedicated Chromium/isolated synthetic Project,
17 captured states with no page errors in .artifacts/e2e/direction-review/stable
(final capture14.4s; mode transitions explicitly awaited).
Three bounded independent read-only reviews converged with current screenshots
and targeted code. This is layout/flow evidence, not a new feature/acceptance pass.
The two initial capture attempts stopped on existing draft/choice cancellation
guards; the final script follows the actual confirmation/cancel routes. Retain
those attempts as inspection evidence rather than claiming product regressions.

Grouped findings before any repair:
- High: Scene creation form remains visible with management collapsed; model
  membership/management also consumes the everyday selection area.
- High: Caption pin HEX/attributes and utilities precede attachments; content
  should follow title→body→media before secondary metadata.
- High: narrow pin adjustment hides confirm/cancel/instructions in the other
  pane while the3D gesture is active; editing actions need coherent placement.
- High: view material speaks about editing/applying, and an unsupported Point
  material view/draft exposes repeated development-worded unavailable fields.
- Medium: comparison's default280×200 makes images a clipped strip after text.
- Medium: save/share repeats purpose selection; pending choices make the close
  and cancellation relationship difficult to see at one location.
- Medium: large framed navigation/disabled controls, full-width colour input,
  native file input and stacked model checkboxes obscure hierarchy. Narrow edit
  header and local task navigation still spend substantial space above content.
- Medium: Settings mixes local display name and shared editor-name controls with
  awkward inline wrapping; group the distinct scopes and align labels/fields.
Success-feedback lifetime/overlap and some model/view footer conditions remain
code-led follow-up checks, not newly browser-proven defects.

Product source/tests and accepted gizmo are unchanged. Only this review record is
updated; no commit/Push or new implementation follows from the read-only request.
Next proposed connected repair groups: information order/disclosure → active-task
completion and file exit routes → shared visual/copy/layout consistency. Preserve
44px targets, keyboard focus, all features and existing draft/write/recovery rules;
do not answer the density problem by adding more menus or shrinking all text.

## Previous boundary —compact orientation gizmo (accepted)

PO2026-10-30 requests Blender/Unity-style camera orientation: remove face-name
text, status text and enclosing frame. Outcome: transparent RGB XYZ axes with
small tips, six-direction selection and an icon-only fit action; retain actual
camera orientation, keyboard focus,44px hit areas and existing input/write fences.
Use existing axis/fit ports; no renderer, dependencies, coordinates or stored data
change. Root writes; independent UI review is read-only. Keep Y-up/+Z-front.

Plan: specify exact projection/depth/hit handling → replace the framed widget →
focused geometry/input checks and real-screen wide/narrow/dark views → required
serial checkpoint and independent review → verified g0-baseline checkpoint.
Stop only for a genuine new authority/contract conflict. No per-control PO testing.

Implementation:112px transparent XYZ compass,20px positive tips/smaller negative
rings, exact camera projection/depth, six signed keyboard destinations, pointer
reselection to the opposite side, icon-only fit and44px hit areas. The existing
Y-up/+Z-front and viewAction/write/IME/window-move fences are retained. Narrow
layout keeps the comparison close control reachable. No format, dependency or
renderer change. The shared optional-help manager has one UI-owned nearest-tip
pointer registration; hover/help/focus/click agree and disposal unregisters it.

Focused geometry/input/import checks17PASS and existing connected composition
regressions4PASS. Dedicated Chromium2 connected cases PASS36.1s: real native-hit
overlap versus nearest tip, correct hover/help/focus/action, signed keyboard and
pointer flip, camera-orbit tracking, transparent styles and44px targets, light/dark
screens, narrow comparison close, IME fences, edit/save/reload and full browser
close/server-stop offline resume. No page errors or external requests. Independent
read-only final/substantive-fix review has no remaining required findings.
The reviewer found hover/help disagreement and a test helper that skipped refit;
both are corrected. The first browser failure used left drag instead of the
existing middle-button orbit; its failure evidence is retained. A recorder-only
missing pointerId case prompted an explicit down guard; no assertion was relaxed.

Final serial checkpoint PASS: typecheck,140 root files/3104 tests with21 existing
TODO, all five builds and offline exact-resource isolation. HEIC public-path
isolation across those five artifacts also PASS. The22-file source/test manifest
in .artifacts/e2e/gizmo/tested-source.json is unchanged through verification.
Browser results/images, logs and retained failure evidence live in that directory.
Independent review has no remaining required fixes; the verified checkpoint uses
the existing g0-baseline Push authority. Existing chunk-size/dynamic-import build
warnings remain. Changed-document local links51PASS; source/test whitespace PASS.
Native IME/assistive technology/physical-device,
general adoption, ordinary-entry activation and release remain separate.

Next: broaden the integrated workspace's Scene/model/material/media organization
and share/receive/restore scenarios using the revised navigation, and finish the
connected copy/density/keyboard pass. Do not replace that work with10k qualification.

## Previous boundary —verified first workspace candidate

Outcome2026-10-30: the first grouped workspace UI is integrated and verified on
the approved PC candidate. Its g0-baseline checkpoint follows the existing Push
authorization; Git owns commit/remote identity. This is not general adoption,
ordinary-entry activation, physical-device acceptance or release.

Final checks PASS: typecheck;139 root test files/3099 tests, with21 existing TODO;
ordinary, harness, validation, Desktop and offline builds; offline exact-resource
isolation; HEIC public-path isolation across all five artifacts. The final54 changed
source/test hashes match .artifacts/e2e/workspace/tested-source.json. Dedicated
Chromium2 connected cases PASS30.9s; final source/input and test-diff reviews have
no remaining required fixes. Full logs, images and retained failures are under
.artifacts/e2e/workspace. Existing chunk-size/dynamic-import build warnings remain.
Staged whitespace checking removed one trailing blank line in the test-only
navigation helper; formatting.json retains the before/after hashes and exact
trailing-newline-only proof. No executable code changed or runtime rerun was needed.

Owned product preview: http://127.0.0.1:4191/ serves offline-desktop-dist (HTTP200,
exact index hash; receipt preview.json, owned exec session72952). It is a separate
origin from the existing validation screen, so existing resumption data stays at
its original address. Open an exported file to try it here. The4190 design preview
remains a separate presentation-only reference.

Next connected workflow: broaden real-screen scenarios on the new navigation,
including Scene/model/material/media organization and share/receive/restore, then
finish copy, density, keyboard departure/Escape and conditional view controls as
one UX pass. Existing broader E2E matrices need their remaining old-layout
assumptions aligned and rerun; the focused pair does not substitute for them.
Native IME/assistive technology/physical iOS remain grouped acceptance lanes.
Do not return to10k qualification or comfort-only optimization as the next priority.

### Implementation authority and retained check history

PO2026-10-30 approves implementing the reviewed workspace design. Root is the
sole writer; independent failure analysis, composition/copy mapping and final
review are read-only. Outcome: one compact application bar, stage-local camera
and comparison tools, Scene-first Caption list/detail, retained editing context,
four coherent task panels, and file/recovery sheets that do not reflow the stage.
Use the existing provider, typed commands, camera and file services. Presentation
state stays local to the mounted UI; no schema, package, renderer, dependency,
ordinary-entry or deployment change. Preserve selection-open comparison behavior,
draft/IME/gesture/pending/privacy/readback/recovery fences and all existing features.

Plan: classify the held GLB recovery failure → integrate layout/state/copy through
the approved design → focused behavior checks and dedicated Chromium real-file
flows at wide/narrow/short sizes → serial final checkpoint and independent review
→ verified g0-baseline checkpoint/Push. Stop only affected work for a demonstrated
contract conflict, new product policy or managed permission boundary. No per-control
human testing waits. Native IME, assistive technology and physical iOS remain
explicitly unverified; mockup screenshots do not verify production behavior.

Implementation status: compact shared bar, retained list/detail and task drafts,
stage-local six-axis camera/fit, compact stage/panel switch, read-only values and
edit-only visibility, contextual material/media controls, and purpose-based file
sheet are connected. Existing offline UI moves into Settings during work and
returns to its original owner at home. No storage/format/render authority changed.
Scene-wide inclusion/recovery stays reachable with no selected Caption. Files,
Help and Settings coordinate presentation without discarding active input.

The held GLB failure was a checking observation at the old polling deadline.
The existing terminal-acknowledgment helper now waits for completion; strict failed/
idle, injected error, pending publication, byte retention and cold idempotence
assertions pass. No production recovery condition or timeout was relaxed.
Focused core/input/material/window checks pass (latest5 files/68 cases), plus the
three existing connected product-file flows. Independent source/input reviews
found and closed empty-Scene access, hidden recovery, retained-owner/focus,
compact IME/gesture guards, overlay scope and narrow HUD overlap findings.

Dedicated Chromium prior pass: real file edit/save/reload, modes/search/comparison,
retained drafts, compact and short layouts, plus prepared cold offline startup and
utility reparent/home return. The offline test first failed with a long title-based
Windows profile; the documented short owned profile passed, with original failure
report/profile retained. This is test-environment evidence, not an SW repair.
Final source integration and browser run are complete; the final checkpoint is
recorded above.
Existing E2E navigation helpers/copy are being aligned with the approved disclosures;
older broad E2E matrices are not claimed rerun by the focused proof.

Short meta-audit: g0-baseline at964999f, one writer, UI-only production scope and
existing command/file/recovery contracts remain the critical path. Bound auxiliary
work to changed navigation and concrete failures; no new matrix, technology, format
or performance guarantee. Finish the grouped checkpoint rather than expanding
test-count targets. Physical-device/adoption/release evidence remains separate.

Final Chromium pair PASS:2 cases/30.9s on the final product source, including
cross-tab Settings draft/focus, content-only header sheets and existing offline
utilities after full close/server stop. No page errors; this is the owned Desktop
candidate evidence in .artifacts/e2e/workspace/result.json and verified images.
The first full checkpoint passed typecheck and3094 tests, with5 failed/21 existing
TODO. All5 failures were recorded-DOM selectors tied to old Caption/media action
order, the former out-of-stage retry location, or the old material region name.
Their corrected checks retain the exact cancel/recovery/data assertions and now
pass (2 files/5 cases). Product source hashes are unchanged from the browser run;
no production recovery/guard change was required. Failure log/old hashes remain
in .artifacts/e2e/workspace/*before-selector-fixes*. Final whole checkpoint restarts
on the corrected test tree; its completed builds/HEIC isolation are recorded above.

## Reviewed design evidence

The following is the completed design-only unit. The current implementation
authority and verification plan are above; its earlier no-edit/no-Push boundary
does not prohibit the newly authorized production work.

PO2026-10-30 accepts the AAA review and requests a design satisfying it, with short,
precise wording. Outcome: a whole-workspace design, self-contained interactive
screen proposals, and a reviewed copy/meaning table covering view/edit, list/detail,
camera/placement, models/views/materials, comparison, file exchange and recovery.
This is design/prototype work, not production implementation or publication.
Root is sole writer; three independent design/copy/input reviewers are read-only.
Keep current product source/test WIP, originals/history, four task tabs, Scene-first
Caption navigation and all draft/IME/write/recovery/privacy contracts unchanged.
Do not silently introduce auto-apply, new persisted settings, automatic conflict
selection, reference removal, input loss, new dependencies or game-only features.

Plan: specify layout/visual/state/copy rules together → build one local HTML
prototype with representative states and input-neutral labels → inspect rendered
wide/narrow/short views and exercise prototype navigation/retained drafts → review
the meaningful result independently and update this record/handoff. Reuse installed
dedicated Playwright/Chromium; no product suite/build or per-control PO test waits.
Record what the prototype simulates and what still needs production/device evidence.
Stop only affected design for a real contract conflict or new product policy.
No commit/Push or production-code repair in this design unit.

Design result: [workspace/copy design](../docs/ui-workspace-design.md) and
[interactive screen proposal](../docs/mockups/loci-workspace.html) cover the
shared frame, list/detail, existing four tabs, spatial labels/comparison, target/
apply/cancel and purpose-based file/recovery sheets. Copy distinguishes apply,
browser resumption, file generation/download/verification, restore/recovery and
five file purposes. Important scope/name/privacy/source-archive consequences stay
visible. Explicit selection still opens/retains its comparison window; no new
mandatory comparison step or auto-apply policy was introduced.

Dedicated Chromium prototype verification PASS on the final HTML, with no page
errors or remote requests. It exercised Caption/material/pin/model draft values
across tabs, model-versus-pin targets, comparison media identity, close/reselect,
dirty guards/confirmation, unselected conflict candidates, keyboard tab navigation,
2s-help/transfer/Escape, narrow320/390px and low600px layouts, long title wrapping,
visible end actions, dark HUD and reduced motion. This is presentation simulation,
not product/real3D/fileIO/storage/nativeIME/AT/device acceptance. Evidence:
.artifacts/design-preview/workspace/result.json and screenshots; the recorded
HTML SHA256 matches cba1e8a6… and independent final reviews. The owned local preview
at http://127.0.0.1:4190/ returns the same source (HTTP200/expected identity);
.artifacts/design-preview/server.json records the owned process. It serves only
the proposal, without product data/services/SW.

Independent visual, copy/contract and input/accessibility reviews have no remaining
material findings after fixing draft retention, comparison identity, model scope,
dark HUD/help transfer, compact/start state attribution and precise package/name
wording. The27 held product source/test hashes still match; no production suite,
build, commit or Push was performed. Documentation links/diff PASS, and the final
prototype source matches the verified images/report. Held failed recovery
evidence is unchanged.

Next: use this coherent design for grouped product implementation through existing
typed commands and provider UI, first classify the held failed recovery check,
then integrate shared frame/state/copy, panels/spatial UI and file/recovery flows.
Retain real camera, formats/history, privacy, validation and write/recovery fences;
the disposable prototype code itself is not promoted into production.

## Completed review boundary —AAA-quality whole-screen review

Latest PO steering2026-10-30: repeat the design review at AAA-game-production
UI/UX quality. This is a review target for clarity, coherence, interaction/state
feedback and visual finish, not a WCAG AAA certificate or permission to implement.
Evaluate the full visual/interaction system against current evidence and official
game/accessibility guidance; distinguish existing strengths, redesign blockers,
observable acceptance and unverified input/device lanes. Root updates review
records only; three bounded independent reviews are read-only. No product edits,
test/build reruns, commit/Push or new dependencies during this review. Preserve
the held WIP and failed-test evidence. Deliver a consolidated direction and grouped
plan before any implementation; concrete new product/interaction policies remain
separate decisions.

AAA review result: [full design review](../docs/ui-design-review.md) consolidates
three independent visual/interaction/accessibility lanes and checked primary game
design/accessibility sources. U01–U19 below remain the location-based issue list;
Q1–Q8 in the review describe the missing system-level quality and observable
acceptance for composition, target context, typography/visual hierarchy, input/
state, spatial HUD, feedback, file/recovery and all-state adaptation. Current UI is
not judged AAA-ready. Keep the low-chroma tone, existing input/data protections
and useful viewing/comparison features. Marker re-render focus, focus behind
comparison windows and repeated status narration are code-derived risks, not new
browser-confirmed failures. Color contrast example is declared-value analysis,
not a rendered conformance check. No runtime test or build was rerun.

Next deliverable is one coherent placement/flow + visual/state specification and
representative screen proposals, before grouped product implementation. Do not
start by polishing isolated controls or assume that motion/input/device quality
passed from screenshots. Independent final document reviews have no material
findings. Review-only records are the only new changes this turn; the earlier
uncommitted source/test WIP and failed-check evidence remain held.

PO2026-10-30 corrects the order: enumerate the UI/UX issues across operation screens
and connected tasks before implementing individual fixes. Keep current view-mode
work uncommitted; no further product changes or Push during this review. The
already-running checkpoint is evidence for that WIP, not authority to ship or
continue piecemeal fixes. It has now stopped on one failed existing recovery
assertion (details below). HEAD remains964999f on g0-baseline.

Outcome: one consolidated issue list and grouped repair order covering the48
captured operation states, current source and the latest view-mode WIP renders.
Review visual hierarchy/proximity, target and state recognition, navigation,
view/edit presentation, text/media flow, saves/sharing/recovery and offline entry.
Root owns the integrated record; independent reviewers are read-only. Distinguish
observed structural issues, older screenshots changed by tooltips/WIP, hypotheses
and uncaptured device/conditional states. Do not claim an exhaustive bug proof.
Record the consolidated findings here; reuse the existing screenshots/source,
without reviving the old-route audit as current, adding a feature inventory/PoC
or running per-control tests.
Stop only affected review for missing evidence/authority. Further implementation
follows the consolidated groups, retaining all existing data/safety contracts.

### Consolidated UI review —2026-10-30

Scope: the[48-screen gallery](../.artifacts/e2e/ui-screenbook-2026-10-30/index.html)
at8e20984, current source at964999f plus held view-mode WIP, and its three latest
renders. Independent visual/flow reviews cover all six groups: start/file5,
record/media13, Scene/settings6, model/View/material13, save/share/recovery9 and
offline2. These are rendered/code-backed design findings, not user-study results
or a proof that all possible defects have been found. Old-route audit documents
remain historical; optional copy already moved to help and WIP hidden edit-only
controls are not counted again as wholly unimplemented.

| ID | 修正項目・利用時の困り方 | 画面／現行根拠 | まとめる修正 |
|---|---|---|---|
| U01 | オフライン・モード・保存・Project状態・カメラが上部に積み重なり、3Dと記録が押し下がる。 | 04/06/23a、最新view-caption、workspace.cssのshell配置 | A: 全体の枠と共通状態 |
| U02 | 通常の更新中にもファイル欄が自動展開し、作業領域が動く。終了後も開いたまま残る。 | 05a/06/08a、productWorkspace.tsのhost.hasPending→fileMenu.open | A: 処理中も安定する作業領域 |
| U03 | カメラの向き・全体表示・投影と視点管理が上部／タブに分散する。 | 04/21/22、viewControls.ts | A: 3D内ギズモとカメラ操作、視点管理の区分 |
| U04 | Scene選択より管理・作成が目立ち、全タブの前に同じ長いScene領域がある。 | 15/16/17、projectWorkspace.tsの共通sceneArea | A: 現在Sceneと管理入口を分ける |
| U05 | 検索一覧・ピン・Undo・本文・競合・添付・削除・タグが狭い縦列に直列で並び、一覧／詳細／比較の役割が曖昧。 | 04–14、captionPanel.append順と比較窓 | B: 記録を選ぶ・編集する・見比べる配置 |
| U06 | 長い入力で対象名・編集状態・確定／取消が離れ、別の位置へ戻らないと完了できない。 | 05a/08a/18a/23a、各panelフォーム | B: 全タブ共通の対象表示と完了操作 |
| U07 | 本文が未適用のまま添付へ進むと無効になり、必要な適用操作が画面外になる。 | 06/08、projectWorkspace.tsのmediaInput.disabled | B: 本文適用→添付の既存手順を近接表示 |
| U08 | 別タブの下書きなどで無効になった際、原因と戻る先を特定しづらい。 | projectWorkspace.tsの全体dirty/guard、モード切替 | A/B: 原因の対象名と適用／取消への入口。保護条件は維持 |
| U09 | モデル所属の「このシーンに表示」と一時的な「隠す／表示」が、共有範囲の異なる操作と分かりにくい。 | 17/20、modelListControls.ts | B: 選択・所属・一時表示を区別 |
| U10 | 配置・位置合わせ・差し替え・削除が連続し、基準／移動対象や削除を妨げる参照の確認先が遠い。 | 18–20c、projectModels.ts | B: 通常操作・配置・危険操作を分け、対象と影響を同じ場所に |
| U11 | 現在のカメラ／保存視点／開始視点／背景、材質の対象／適用範囲／詳細調整が連続して見える。 | 21–23a、projectViews/materialControls | B: 閲覧・保存管理・開始設定と、材質の通常／詳細項目を整理 |
| U12 | 添付閲覧カードと別の編集一覧に同じメディアが重複し、順序・解除等の操作が並ぶ。 | 08/08a、projectMedia.ts | B: 同じ添付の閲覧・編集・再利用を対象単位で整理 |
| U13 | 保存／渡す／受け取る／復元／生成済み履歴が同じ領域に積まれ、目的・対象・結果が離れる。 | 26–29c、validationReceive/OutputControls | C: 目的別の一連の操作。共有範囲・保存未確認・原本保持を維持 |
| U14 | 競合の候補を読んだ後、離れたselectで選び直す。対象・比較結果・確定が結びつきにくい。 | 29b、projectRecovery.tsとモデル／材質候補 | C: 比較→選択→結果→確定を一続きに。自動選択はしない |
| U15 | 要点検：開く／変換／新規作成の段階・戻るの配置と、再開一覧でのProject識別。安全な内容判定の入口を大きく変える必然性は未確認。 | 01–03/33、validationWorkspace.ts。32画像は読み込み中 | C: 現在対象と戻るの一貫性を点検。完成した再開一覧は追加観察し、不要な再設計はしない |
| U16 | オフライン・名前設定・ヘルプ等が主作業と競合し、狭い／短い画面では上部の折返しと縦移動が大きい。 | 24–25/30–31、最新390px画像、workspace.css | A/D: 管理入口と作業枠を統合。最後に幅・focus・説明配置を横断確認 |
| U17 | 比較窓が重なって開き、画像は小さな窓内スクロールになり、整列操作はCaption列の末尾にある。 | 07/14、最新view-caption、captionWindowControls.tsと比較tools | B: 比較対象・窓・整列を近接。手動配置と複数窓を維持し、初期配置の変更は具体案で扱う |
| U18 | 直前の成功通知が別作業でも上部に残り、持続すべき保存状態・失敗と同じ強さで見える。 | 18/19、最新view-material、projectWorkspace.tsのfeedback保持 | A: 現在状態と処理結果を分ける。未適用・失敗・復旧・保存未確認の情報を消す変更はしない |
| U19 | ピン追加・窓表示・再生・並べ替え・解除などの主従と見た目が画面間で揃わない。 | 04/06/08a/19/23a/26、componentごとのprimary指定 | D（A/B設計時に規則を決める）: 主操作・補助・危険操作、余白・見出し・確定取消を共通化 |

Grouped order: **A** stable application frame/current context/status and camera
placement → **B** coherent list/detail/comparison and target/apply/cancel across
all panels → **C** start/resume/save/share/receive/conflict/restore presentation →
**D** integrated keyboard/focus/width/long-text/reduced-motion/help and regression
verification. Define the complete layout and shared interaction rules before
implementing A; bring held view-mode WIP into that plan, rather than shipping it
as another independent repair. Do not alternate individual fields and full checks.

Keep original commands/drafts/IME/drag, file/restore fences, source/history and
privacy/ownership scopes. New combined text/media drafts or autosave, automatic
conflict choices, reference removal/reparenting, changed save guarantees or forced
single comparison windows require a distinct concrete PO decision. None is
needed merely to enumerate or arrange existing actions. No new dependency,
renderer/package policy, adoption, release or deployment is inferred.

Evidence gaps remain explicit:32-project-list is not a completed-list capture;
all conditional failure/install states, physical devices, native IME/200% browser
zoom and assistive technology were not newly verified by these screenshots.
Targeted observation may fill those gaps during layout design; they do not
authorize starting another isolated product fix now.

Review checkpoint: the consolidated U01–U19 list and group order passed independent
read-only review for coverage, evidence limits and unchanged decision boundaries.
Documentation diff/local links pass; product source/test hashes are unchanged.
No commit or Push was made. Next is the whole-screen placement/flow proposal,
including held view-mode work; do not ship that WIP as a standalone patch merely
because the issue list is now available. Retain the failed recovery check for
cause analysis before the next verified implementation checkpoint.

## Retained uncommitted work —viewing without edit-only controls

PO2026-10-30 authorizes hiding controls that function only in edit mode. Audit:
g0-baseline HEAD964999f, clean starting tree; root is sole writer and bounded
control/authority reviewers are read-only. Outcome: view a Project with useful
camera/Scene/record/media/search/comparison controls, then return to edit with the
same working context and all ordinary editing controls available.

Use explicit pure UI edit-only/view-only markers and actual view/edit mode from
the existing host. An optional typed mode display field separates true viewing
from aggregate readOnly/loading/operation guards. Keep existing disabled checks,
commands, drafts/IME/drag/pending switch fences and storage/package semantics.
Render Caption values as text in view; do not hide records, attached media,
diagnostic evidence, pending/recovery notices or generated-file downloads.
Retain working local background, visibility, comparison/anchor preview and browser
settings; no newly enabled feature or stricter authority policy is inferred.
Mode changes must also dismiss help whose editing anchor disappears.

Mark actual edit-only actions/inputs across core, models/views/materials/media,
organization/recovery and file generation/receive/restore. Preserve each control's
own conditional state rather than restoring all hidden/disabled flags on edit.
Verify focused existing typed and mounted checks; actual dedicated Chromium
view→camera/search/media/panel work→edit→save/reload, including transient guards,
then independent diff/rendered review and one final serial checkpoint.
No camera-gizmo/general layout rewrite, new dependency/schema/format or release.
Stop only affected work for a genuine authority/product/contract change.

Implementation and independent source/test/rendered reviews are complete with no
remaining findings. Caption/material inspection uses canonical text and retains
field warnings; edit-only startup/recovery and material-review actions are hidden.
The dedicated Chromium connected workflow PASS31.2s on the built offline candidate:
create model/Caption/photo/View → view → search/window/media/model visibility/
camera/View/background/material inspection/existing download → edit with retained
search/selection → guarded draft → apply/backup metadata inspection/reload.
No page errors or remote requests. Screenshots at1440×1000 and390×844 are desktop
emulation, with Service Workers blocked; no physical-device/offline-launch credit.
Recorded DOM checks also verify actual edit mode survives transient loading guards.
Final full serial checkpoint against the frozen27 source/test hashes in
.artifacts/e2e/view-mode/tested-source.json: typecheck PASS; root138 files PASS/1
failed,3098 PASS/1 failed/21 existing TODO,1491.77s. The existing new-GLB-body
failure/cold-recovery case in tests/projectFiles.test.ts:8780 observed `checking`
instead of the expected `failed` within its wait. Cause is unclassified; do not
label it flaky/pre-existing or weaken the wait/assertion. Preserve the raw
checkpoint.log and defer cause analysis/repair to the grouped plan. No automatic
retry. The serial build stages did not run after this failure; the separately
built offline candidate and browser result are narrower evidence only. The log,
browser result and images remain in the same ignored directory. Documentation
diff/local links pass. No dependencies or data/write/format/recovery semantics
changed. This is uncommitted WIP, not a verified completion checkpoint.

Superseded sequencing: this WIP is held for the full UI review above. Complete
already-running checks as evidence, but do not commit/push or start another
isolated fix before the consolidated issue list and repair groups are ready.

## Previous boundary —delayed contextual explanations

PO2026-10-30 authorizes moving explanatory prose into delayed hover help to keep
the operation screens clean. Audit: g0-baseline HEAD8e20984; only the completed
screenshot task record is initially dirty and retained. Root is the sole writer;
copy mapping and UI/lifecycle review are read-only parallel tasks.

Outcome: optional app-authored explanations across the ProjectScene workspace,
models/views/materials/settings/offline controls become contextual help after2s mouse hover,
with immediate keyboard/help-button access. Current errors, input/unsaved state,
conflicts, affected targets/sharing/deletion/recovery consequences and user content
stay visible. Keep original commands, drafts, storage/package/renderer and capacities.
No camera-gizmo or general header redesign is bundled into this unit.

UI boundary: a pure local UI helper produces explicit text-only help markup;
UI-owned scopes manage delegated hover/focus/click/Escape events, timers and one
viewport-clamped explanation layer per Document. No paragraph scanning or runtime
dependency. Shared scopes are released at normal host/component disposal. Review
the exact application import edge before connecting validation composition.

Acceptance: no early mouse popup; leaving cancels pending display; explanation
remains readable while hovered; Escape closes only active help; focus/touch can
open help without changing commands/input; scrolling/removal/disposal cannot leave
orphan popups. Existing visible warnings and accessible descriptions remain.
Use focused Vitest/boundary checks, actual wide/narrow dedicated Chromium editing
and save/reopen flow, independent review, then one serial final checkpoint.
Stop only affected work for a new product/storage/format/renderer/dependency policy
or release/deletion authority; no helper confirmation waits.

Implemented: explicit text-only help and one reference-counted Document controller,
with own component/host lifetimes including shared harness controls. Existing labels
and inputs also provide hover targets; the separate explanation button supports
keyboard/touch. The viewport-clamped layer remains outside scroll clipping; moving
onto the text retains it. Pending Escape preserves ordinary cancellation; visible
help consumes only its own dismissal. Shared-anchor focus, cancelled touch, hidden/
removed anchors and final disposal have focused regressions. No paragraph scan,
user-text conversion, Session edit, storage write or dependency was added.

Copy/scope and final code review PASS. Important warning/unsaved/conflict/privacy/
restore/removal copy remains visible; normal Undo guidance is separated from its
warning, and MASK teaching is separated from field validation. Focused connected
UI checks76PASS preceded the final small interaction fixes; final helper/boundary
checks18PASS and typecheck PASS. The current15 source/test inputs are frozen in
.artifacts/e2e/context-help/tested-source.json. Required full serial checkpoint PASS:
139files/3097PASS/21existingTODO, root1054.66s; typecheck and all5 builds pass,
with exact14-resource offline SRI/worker/manifest isolation. Log:
.artifacts/e2e/context-help/checkpoint.log. Source/test hashes still match; no
runtime checks are repeated merely for final prose/staging/commit. All5 built
artifacts also pass HEIC public-path isolation. Lock/dependencies, public fixtures,
workflows and deployment settings are unchanged.

Actual dedicated Chromium connected case PASS10.8s at the final source tree:
2s hover/no early popup, readable pointer transfer, native Tab/Escape, emulated
touch open/close,320px bounds, retained Caption draft, real saved-backup metadata
and reload continuation. Wide rendered tooltip review PASS. The narrow full-page
PNG records reflow/draft only: screenshot scroll hid its fixed tooltip after the
visible/bounds assertions. Additional viewport-only capture PASS5.2s with the
tooltip visible before and after capture, bounded at320×740 and draft retained;
narrow rendered review PASS. Image/evidence: narrow-tooltip-viewport.png and
narrow-viewport-evidence.json in the same ignored context-help directory. This
artifact-only capture did not change the15 frozen source/test inputs. SW is blocked;
no physical-device, offline-launch, installation or adoption acceptance is inferred.

PO's subsequent steering explicitly adds cognitive placement and operation-flow
review to the next UI design. Judge target/state recognition without remembering
offscreen details, proximity of related fields/actions, clear visual priority and
the complete open→select→pin→Caption/media→apply→save/share→resume path. Current
screens show management controls dominating, separated targets/confirmation and
mixed list/edit/compare roles. These are design observations, not human usability
test findings or a ratified new layout. Required state/next action must be apparent
without opening optional help; keep existing drafts/undo/conflict/recovery fences.

Next: close this verified development checkpoint on existing g0-baseline. Concrete
camera-gizmo/header/panel proposals will follow the cognitive and flow review,
with an integrated task walkthrough before implementation. They are not included
in the current explanatory-copy change.
Flow review also confirms that current unapplied Caption text blocks media addition.
The next layout must expose the existing text→apply→media order and nearby paths
out of input guards, rather than implying a new combined draft or automatic apply.
List selection, right-side editing and3D comparison windows need visibly distinct
roles with the same selected record. Any change to automatic window opening or
compound-draft/command semantics remains a separate product decision.

## Previous boundary —PC operation-screen screenshots

PO2026-10-30 requests screenshots of the operation screens before further UI/UX
changes. Audit: g0-baseline HEAD8e20984, clean starting tree. Root is sole writer;
read-only screen mapping may run independently. Use the existing dedicated
Chromium and current built offline PC candidate on an owned loopback origin,
with a fresh owned profile and synthetic example data only.

Outcome: a labelled local screenshot gallery and original PNGs covering startup,
file opening, Caption/media work, models/placement, saved views/materials,
Scene/tag/settings, save/share/receive/recovery and offline preparation where
reachable. Capture real rendered states, identify examples and any uncaptured
conditional screen; do not fabricate product screens or alter UI for the images.
Product code, formats, data authorities, adoption and deployment remain unchanged.
Check screenshot completeness/readability, local gallery links and capture errors;
no full runtime suite/build is needed for this artifact-only unit. Stop affected
capture only for real user data, destructive/global browser changes or new authority.

Completed: [local gallery](../.artifacts/e2e/ui-screenbook-2026-10-30/index.html)
contains48 actual1440×1000/DPR1 screenshots across6 groups, original PNGs,
7 overview sheets and a ZIP (~15.5MB). The HTML embeds its images and supports
enlargement; the ZIP includes the gallery, originals, overviews and captions only,
not profiles, source packages or capture diagnostics. The example Project includes
owned Mesh/Point/smallSH4/Proxy/PNG/video/audio and copied Scenes/records.
Separate owned environments produce actual same-record conflicts and absent-Project
backup-restore preview. Long pin/placement/material panes have lower-panel shots;
save/share purpose controls and view/background settings were captured in their
actual scrolled positions. Offline preparation is a displayed state, not new cold/
OS-install/device/adoption acceptance. Conditional failures/install prompts and all
possible control combinations are not claimed captured.

Checks: all48 original PNGs exist with matching captions/dimensions; all48 embedded
images decode;6 navigation targets and zoom open/close pass in dedicated Chromium.
ZIP inspection confirms48 originals and gallery. Independent read-only visual review
passes for overview, lower-panel controls, conflict and restore. Initial capture-driver
iterations needed normal focus, exact selectors and completed cancellation; their
diagnostics remain local and are not relabelled a complete functional-suite PASS.
Product source/tests/build inputs remain unchanged; only this task record is tracked.
No release/deployment or full runtime rerun for this screenshot-only work.

Next: use this screenbook for the requested UI/UX and connected-function review,
then fix identified issues and organize affected processing with existing behavior
and storage/file safety preserved. No product change was made during photography.

## Previous boundary —approved09 PC offline workflow

PO2026-10-30 approved [09](../docs/specs/09-desktop-offline-candidate-proposal.md).
Audit: g0-baseline HEAD11c46d6 before implementation, clean starting tree; root is
sole writer. This connected unit follows the missing offline daily-use boundary.
Dependency lock, data/schema/rendering semantics, capacity and deployment policy
remain;09 adds the explicit app-shell integration and lifecycle only.

Implemented: separate project-scene-offline build/bootstrap; same historical
ProjectScene namespace; exact owned app precache/SRI and same-build repair; local
preparation/install affordance, safe waiting updates and exact-own unregister.
Original app/viewer entries are excluded from this artifact while admitted
converters remain. Normal/static builds, originals/history and typed Session/
package/storage fences stay unchanged. Failed updates retain old usable resources;
late notifications cannot hide failure or undo a successful removal. No automatic
registration, skipWaiting, claim, reload-on-update or cross-build cache GC.

Independent source/contracts, final lifecycle, UI/dismissal/layout and docs/scope
reviews PASS. Executed dedicated Chromium evidence (no retry/skip/flaky):
- Main case PASS in run1793313130554-37420 (873.896s): static same-origin/profile
  mixed Mesh/Point/500kSH4/Proxy/PNG Project → offline preparation → entire browser
  close/server stopped/network off → cold read/edit/save/full-close reopen with
  exact history; admitted Native initial conversion/edit/save/reopen; unsupported
  whole-input refusal; own unregister/full-close/same-address reachable static
  return with catalog-opened histories, foreign cache/registration and source bytes.
  That run's aggregate is1PASS/1FAIL; its separate update failure is retained.
- Latest run1793315090511-58816:4PASS/0FAIL/0skip/0flaky,90.977s total. Current
  two-window update keeps X=2.75 draft/oldA through wrong200, missing and interrupted
  B assets, then full-close/server-off cold B exact-history resume. Corrupt/missing
  same-build entries repair; worker Cache.put quota refusal is explicitly simulated.
  Directory-base cold/index-only scope, Project-bootstrap failure with preparation/
  removal, and foreign-SW/original-viewer-query refusal also pass.
- Main data-flow evidence predates only later popup and registration-failure fences;
  current popup/first-install/update/remove paths were separately rechecked above.
  Main media is owned PNG; legacy-retain is an OPFS source sentinel plus reachable
  original app entry, not oldNative/v1 catalog or old-viewer offline acceptance.
- Rendered independent review PASS: combined Offline/files/Help/Settings at1280×800
  leaves~238px stage; native Tab leaves popup to visible controls; update guidance,
  unapplied input, saved-status distinctions and cold Caption/photo are readable.
- Focused3-file checks28PASS; validation-build/Scene-boundary checks15PASS after
  correcting the exact approved-mode assertion and adding explicit artifact isolation.
  Frozen25source/test inputs are in ignored
  .artifacts/e2e/pc-offline/tested-source.json and currently match the tested tree.

Final serial check PASS at the frozen25-input tree:138files,3091PASS,
21existingTODO; root879.53s. Typecheck, normal/harness/validation/static Desktop/
offline Desktop builds and exact14-resource SRI/worker/manifest isolation pass.
Log: .artifacts/e2e/pc-offline/checkpoint.log. All5artifacts pass HEIC public-path
isolation. Normal /LociView/ base build also passes (pages-build.log; ignored output).
Independent source/rendered/evidence review PASS. The verified checkpoint belongs
on existing g0-baseline; Git owns commit/remote identity, no release/deployment.
Initial serial run: typecheck PASS,3089tests PASS/21existingTODO and1stale guard
assertion FAIL (validationBuild still expected only the two earlier approved modes).
Approved09 already requires the additional explicit mode; source behavior agrees
with that contract. Corrected the exact assertion, kept strict exclusion of all
other modes, added static/offline/PWA/OS-handler isolation coverage; focused PASS.
No runtime source/contract was weakened. Retain checkpoint-initial.log as failure
evidence. The complete final serial rerun above passes after this correction.
No repeated runtime checks merely for staging/docs. Earlier failed runs remain in
.artifacts/e2e/runs:1793310977128-660 (duplicate post-transform manifest),
1793311586766-23772 (fixture preconditions),1793312137206-35920 (startup fixture
race +142px layout),1793313130554-37420 (popup toggle),1793314271135-52948
(healthy oldA masking failedB). Relevant code/fixtures were fixed; these aggregates
are not relabelled PASS. Intermediate4PASS run1793314726220-67092 is retained too.

Pending: actual OS install, physical Edge/Chrome/iOS, trusted HTTPS, general
adoption/ordinary PWA replacement and publication. Local automation grants none.
No origin migration or automatic install; own removal keeps caches/Project data.
Stop only affected work for a new schema/reader/renderer/dependency, foreign-cache
or Project deletion, scope/guarantee or deployment authority.

Next: close the verified09 development checkpoint, then prepare grouped PC-candidate
acceptance for everyday editing/exchange/recovery/offline and actual browser/install
conditions. Keep10k-Caption qualification and comfort-only tuning deferred; ask
only for the real device/install/adoption/publication decisions at that boundary.

## Previous boundary —Saved View organization and reachable task navigation

PO2026-10-30 authorizes the next daily-use unit. Audit: g0-baseline HEAD6ded664,
clean worktree, prior file-continuation/layout checkpoints verified and pushed.
Outcome: model work → record/recall/organize Saved Views → material work → save
and reopen, with task navigation readable/reachable and impossible moves explained
before selection. Root is the sole writer; contract/navigation reviewers read-only.

Ports before implementation: ViewAuthorContext gets a required synchronous pure
`orderBetween(before,after):string` allocator. Product supplies existing
`ProjectWorkspacePorts.viewOrder`; harness supplies its already-imported allocator.
Planner probes the same remove-selected/exact-neighbor interval as the existing
host write; existing relative plan, typed editView, token/field/runtime guards and
dispatch-time allocation remain. UI state imports no application/storage code.
No new import edge, command, key format, collection rebalance or tie-group jump.
Specification05's exact-neighbor allocation-or-no-write-refusal contract remains.

Acceptance: impossible equal/tight/exhausted intervals disable only the affected
direction and show a useful reason; representable middle moves stay enabled.
Stale source/selection/neighbors remain no-write; free-camera movement does not
block ordering, and real View/name/background/material drafts retain their guards.
Assess adjacent task presentation from rendered evidence; do not change shared
data or cancel input to make navigation easier. Reuse pure/mounted controls plus
one connected typed file flow and a dedicated Chromium model→views→material→
save/reopen flow, then independent review and one final serial checkpoint.
Stop only affected work for a genuine policy/architecture/authority decision.
No dependency, storage/package/renderer change, capacity promise, device/offline
adoption or release is part of this unit.
Read-only navigation assessment confirms the tab strip scrolls away with the
long task pane, and equal-width columns split the Caption label. Use whole-label
wrapping tabs with existing names/roles/keyboard sequence and a sticky strip only
in the bounded wide Desktop pane. Preserve all panel nodes and drafts; normal
narrow/short document scrolling remains. Verify scroll→keyboard task switch→return
with a pending material/View draft plus cancel/apply and saved-file reopen.
Implementation and focused evidence: direct regression first reproduced the
impossible move still being offered. The allocator/context connection now passes
pure author/background14, typed equal-key no-dispatch + existing view/material
file2, and existing harness-authoring/Caption-model-IME2 selections. Typecheck PASS.
One test queried a same-named region instead of the select; corrected by role/tag,
retaining exact field/history assertions. Field narrowing and style-handle typing
were test-only corrections. Independent move and CSS reviews PASS. Removed an
unreliable alternative-move suggestion; directional refusal alone stays accurate.
Review also identified wrapped keyboard tabs could be focused offscreen because
of preventScroll; use normal focus scrolling with the same key mapping/guards.
Dedicated Chromium workflow is running, including emulated wrapped text, pending
model/View/material drafts and actual Workspace save/import/re-save/reload.
First Chromium run1793307992966-20984 passed model draft return/commit and first
View creation, then timed out on a test-only region query: the composition exposes
the View root as the named tabpanel. Correct the query to its actual role/name;
retain all operation/assertion scope. New-test action waits use the existing15s
browser-runbook pattern, with90s explicit operation waits/420s total unchanged;
no global runner/product limit or retry is added. This stopped run is not PASS.
Connected Chromium run1793308477663-36960 PASS; visual review found leading pane
padding let scrolled labels peek above the sticky strip. Offset the strip by the
existing12px padding and add actual focus/next-Tab visibility checks, without
scroll compensation. Final run1793308631792-56796 PASS:26.833s test/40.455s total,
two independent owned-Mesh contexts; model/View/material draft keyboard return,
cancel/apply, View projection/capture/order, material values, actual Workspace
download/import/re-save with exact originalChanges and page reload. Wide tabs
remain whole-label/44px/reachable;320px with20px tab text exercises wrapped End-
focus reveal. This is text/viewport emulation, not actual browser zoom/device or
full browser restart/offline-shell evidence. Impossible intervals/no-dispatch are
covered by pure/mounted Node controls; browser flow checks ordinary reorder.
Independent source/delta and final rendered-evidence reviews PASS. Final serial
`check:checkpoint` PASS at the frozen9 source/test files: typecheck,136 root files/
3074 passed/21 unchanged TODO and all4 builds; root923.73s. Log:
`.artifacts/e2e/pc-view-task/checkpoint.log`. Four-artifact HEIC isolation PASS;
frozen hashes match. Staging must retain the reviewed/tested tree. Do not repeat
runtime checks for unchanged staging or result prose. Next: consolidate the PC everyday candidate and its remaining
offline/device acceptance conditions, distinguishing missing implementation from
an external/activation gate before selecting further maintenance or UI helpers.
Next-boundary audit (design only while the tested implementation stays frozen):
Desktop offline cold launch is actually missing, not merely unexecuted evidence.
01e§5 and current build/registration code explicitly forbid its SW/manifest/install
activation. Prepare one reviewable PC-only shell/cache/update/origin proposal;
preserve the static candidate/normal PWA and in-place data, and request the one
genuine grouped activation decision only after the current verified checkpoint.
No SW/cache/PWA implementation, registration or publication before that decision.

## Previous boundary —PC workspace stays visible during file work

Audit start: g0-baseline HEAD5708e91, verified continuation checkpoint pushed;
worktree clean. The next missing accepted UI condition is visible3D plus task
pane at normal PC height, not another format or helper lane. Root remains sole
writer; bounded layout/diff reviewers are read-only.

Outcome: record/compare Captions → expand/save/check files → continue editing,
without pushing the stage offscreen. Apply available-height sizing only to the
compact Desktop active core; retain file tools outside inert core, input and
comparison-window DOM. Bound the expanded file body with its own scroll, and
retain ordinary document flow at narrow/short sizes and for home/startup/recovery/
Review/legacy. Project name is the active heading; routine product explanation
can stay in Help while the complete first-open introduction remains.

Acceptance: stage and sidebar remain within1280×800/1440×900 PC views, including
expanded files; sidebar/file scrolling leaves the stage visible. Existing cancel,
failure/retry and comparison-window controls remain reachable, input and windows
survive pane toggling/resize, and narrow/short/long-Japanese views have no page-wide
horizontal overflow. Reuse the connected save/receive/restore browser lane plus
geometry/gesture assertions, focused guards and the final serial checkpoint.
Stop affected work only for a new product/architecture/authority decision; no
package/storage/renderer/dependency change, numeric guarantee or device/offline/
release acceptance is included. Independent baseline layout assessment PASS.

Implementation: compact active-layout marker/content hook, shrinkable host→core→
stage/sidebar chain and bounded file-body scrolling; project title becomes the
active heading and the complete product explanation remains in Help. Focused
continuation/review-copy guards7 PASS and typecheck PASS. Independent review found
that separately capping Help/Settings could still collapse the stage when both
were open; fixed by capping/scrolling their shared header, preserving both states.
First browser run1793305064916-62136 stopped at the new gesture assertion: the
test assumed DOM-last meant visually frontmost and dragged an overlapping other
card. Read-only cause review confirmed the distinct drag state; now use the
existing front selector and assert the hit target before the same real pointer/
resize cancellation assertion. No product gesture change or assertion relaxation.
Second run1793305182771-33900 passed the new layout/gesture/disclosure and real
receive/restore operations, then exposed another test-order assumption: after
adding a second Caption, DOM-first is not a stable identity. Select the intended
record by its distinct title throughout the flow; preserve the same field/history
assertions. Neither stopped run is a final PASS or a product data-loss finding.
Final connected Chromium run1793305360486-58860 PASS,123.282s test/138.068s total:
two independent contexts, two comparison windows, preserved Caption/settings
drafts, real pointer+resize cancellation, bounded shared disclosures/file scrolling,
save/cancel/reopen, disjoint receive, exact restored history and page reload.
Wide1280×800/1440×900 geometry and320×740/640×400/1280×600 reflow assertions pass.
Rendered evidence review PASS.640×400 is an equivalent CSS viewport, not actual
browser zoom; no physical-device, full browser restart, native OS-dialog or offline
shell acceptance is claimed. Final serial `check:checkpoint` PASS at the frozen5
source/test files: typecheck,136 root files/3071 passed/21 unchanged TODO and all4
builds. Root suite1520.17s; log `.artifacts/e2e/pc-layout/checkpoint.log`. The slower
root run completed without retry or changed limits; its CPU activity was observed
while waiting. No application-latency conclusion is inferred from suite duration.
Frozen hashes match; final staging must retain the reviewed/tested source tree.
Four-artifact HEIC isolation PASS. Independent source/delta and rendered-evidence
reviews PASS; documentation diff/local links pass. This is a verified development
checkpoint, with device/zoom/offline and release gates retained.
After this unit, continue the same daily-use review across models/saved views/
materials and reachable task navigation; do not return by default to wider legacy
compatibility,10k qualification or new feature/profile guarantees.
Bounded next candidate from read-only review: impossible exact-neighbor Saved View
moves are still offered until the allocator refuses after selection. Pass the
existing pure `viewOrder` allocator into `ViewAuthorContext`, probe the same
insertion interval in the planner, and reuse existing blocked-plan/description UI.
Targets: viewAuthoringState/projectViews, harness viewSession and their existing
state/control/file tests; no new cross-layer import or command. With three equal
keys, refuse only impossible edge moves while keeping representable middle moves;
stale plans remain no-write. No collection rebalance, tie-group skipping or camera
change. Reconfirm the source and accepted exact-neighbor contract before starting.

## Previous boundary —PC everyday editing and file continuation

PO2026-10-30 authorizes continuing the consolidated PC completion/usability work
without small manual-test waits. Outcome: create/open → select Scene → record,
edit and compare Captions/media → save/share → reopen, with the subject and current
action clear at normal PC sizes. Root is the sole writer; bounded read-only agents
review entry/files, Caption/organization and model/view/material navigation.

Plan: observe the current Desktop candidate and existing connected tests; select
one coherent user-visible problem from actual rendered/code evidence; fix through
existing typed commands and UI/display ports; reuse focused tests plus a real
browser workflow at the affected sizes; independently review the meaningful final
diff, then run required serial checkpoint checks and push suitable g0 work.
Acceptance comes from the approved UI guidelines, especially §§4–7/9–11; preserve
input, selection, failure/retry, original/history and file-completion distinctions.
No storage/package/renderer change, new dependency, numeric guarantee, automatic
conflict policy, device/offline adoption or release is granted. Stop only affected
work for a genuine new policy/architecture/authority decision. Pending Safari and
offline-shell lanes do not block ordinary PC implementation.

Audit start: g0-baseline HEAD6386708, clean worktree, prior08c checkpoint pushed.
Current risk is integrated usability, not more format expansion or10k qualification.
Code/render findings determine the slice; historical classifications are not a new
feature queue. Previous checks are baseline evidence only.

Chosen connected slice: Caption/tag editing → save/optional saved-file check →
continue/receive/restore. Confirmed code issues: empty tag focus creates a draft;
file-picker cancel leaves optional verification selected; receive/restore miss the
existing operation-status ring and restore may show stale pending text while busy;
help implies optional file verification is compulsory, and Review Scene label and
accessible name differ. Fix local UI ownership/status only, preserving genuine tag
input/IME/stale edits, file generation/verification/recovery and save-success fences.
Verify focus-only freedom, IME + stale tag protection, native cancel/empty selection
and cancel-during-verify safety, operation-scoped busy/failure clearing, and one
real Chromium save/receive/restore/continue workflow. No layout redesign or tie-key
rebalance in this slice: specification05 permits exact-neighbor refusal without
collection rewrite; a broader tie-repair command remains separate.

Implementation and focused4 state/IME/cancellation checks PASS; relevant legacy
file/recovery8 and additional existing guard/cold selections pass. Typecheck PASS.
Two-context dedicated Chromium run1793303586874-36768 PASS (1280×800 and1440×900):
tag keyboard traversal→real backup→optional-picker cancel→Project reopen→disjoint
return merge preserving local body→restore original backup→save/reload. Receive
and restore real operations were held at one digest solely to inspect progress;
all original validation resumes afterward. The browser cancel event is injected
into an intercepted headless chooser, then the chooser is retired; Node also checks
empty choice and cancel-during-active-verify. Actual OS-dialog behavior is not a
separate claim. Screenshots verify the existing ring and static reduced-motion
presentation. Independent tag/help and file-state diff reviews PASS. One test-only
RecordedNode.files typing error was corrected; no assertion/timeout relaxation.
Final serial `npm run check:checkpoint` PASS at the frozen6 source/test files:
typecheck,136 root files/3071 passed/21 unchanged TODO and all4 builds. Root suite
1053.03s; log `.artifacts/e2e/pc-continuation/checkpoint.log`. Four-artifact HEIC
isolation PASS. Frozen-source hashes match; staged content must retain this
tested/reviewed tree. Documentation diff/local links and independent review PASS.
Independent executed-evidence review also PASS: real downloaded archives, disjoint
merge, exact restored history and page reload are evidenced. This is not actual
OS-dialog, full browser restart, device or offline-shell acceptance.

Remaining rendered finding for the next PC layout unit: full-page screenshots at
1280×800 exceed the window, and expanded file tools push the3D stage down. Preserve
all current input/file safety and explicit comparison windows while assessing the
accepted stage+task-pane simultaneous layout (§4.2/10). This is not a current
package/renderer change, new capacity guarantee or device acceptance.
Bounded next plan: compact Desktop active core only gets an available-height chain
from its host/content; file tools remain outside the inert core and scroll within
their expanded body. Preserve canvas/comparison-window DOM and existing resize/
gesture cancellation; narrow/short/zoomed screens retain document scrolling.
Startup/recovery/home/Review/legacy must not inherit the constrained active layout.
Use the same connected PC workflow plus geometry/scroll/window assertions, with
rendered normal/expanded/long-Japanese/narrow/short observations; no new layout
framework, package/command change or automatic collapse of current input.



## Previous boundary —verified local HEIC original and portable display

PO2026-10-30 approves the readable-browser/local-generation direction in
[08c](../docs/specs/08c-portable-heic-display.md). Root was the sole writer;
independent media, package/metadata and UI design/final reviews PASS, including
narrow review of later compatibility/diagnostic corrections. Outcome: add →
Caption/gallery/viewer → save/send/return → receive/restore/cold-resume. Original
HEIC plus one frozen native-generated full-size PNG are one immutable record;
original metadata/bytes, IDs/history and existing schema/map/proof remain intact.
Native-only legacy HEIC is unchanged. No decoder/service/dependency/lockfile,
profile/capacity promise, general adoption, offline-shell activation or release.

Connected implementation retains both bodies in all five image-preserving file
purposes, handles independent original reuse/new PNG, archived-base-only restore,
acknowledged body loss, second-body failure and exact editor/PNG cold retry.
Finite canonical reader requirements derive from every original scalar, including
same-change overwritten declarations; older readers must refuse new tuples.
Unpaired display retains the existing image() read/fault boundary. UI uses actual
PNG MIME, labels the display image/HDR difference without rewriting descriptions,
and discloses the actual frozen output's reader requirement before first download.

Final automated evidence2026-10-30:

- `npm run check:checkpoint` PASS at the final source/test tree: typecheck;
  136 root files,3067 passed tests and21 unchanged existing TODO; ordinary,
  harness, validation and Desktop builds. Root suite1006.41s. Full serial log:
  `.artifacts/e2e/heic-portable/checkpoint.log`.
- Focused helper/architecture/media-UI42, connected08c5, legacy gallery/mode/cold3,
  helper+08c+HEIF-recovery20 and bounded metadata74/package62 checks passed; these
  overlapping selections are not added into the root total.
- Dedicated Chromium run1793297522186-68508 PASS: actual canvas→PNG, incapable
  recipient's Caption/window image/viewer, warmed-page offline edit/save/project
  reopen, full browser cold reopen, and fixed immediate08b reader fe20109:
  names-only accepted, both/portable-only files refused, local journal refused
  without changing metadata receipts/originals. Result and screenshot are under
  `.artifacts/e2e/runs/1793297522186-68508/`. Native HEIC decode on the producer was
  narrowly substituted with a known real PNG ImageBitmap; canvas/export/storage
  and recipient PNG decoding are real. No Safari-native or offline-shell cold credit.
- Final source/test/script digests match the tree tested and reviewed. Markdown
  local links and diff checks pass. `verify:heic-isolation` PASS across dist,
  dev-dist, validation-dist and desktop-dist; no local decoder PoC material ships.

Retained failure evidence: default-sandbox full check stopped on existing hard-link
EPERM; the exact publication case passes with managed escalation and unchanged
code/assertions. Preserve `checkpoint-sandbox-permission-failure.log`. The unpaired
gallery read/fault boundary regression was isolated and corrected without changing
legacy assertions; preserve `checkpoint-before-legacy-display-fix.log`. The first
completed normal root run passed3065/faulted2 on HEIF guidance; normalize structural
HEIF refusal through the legacy guide without changing admission, then the final
complete run above passed. Preserve `checkpoint-before-heif-guidance-fix.log`.
Earlier browser attempts retain two corrected ambiguous test-selector failures;
no automatic retries, exclusions, relaxed assertions or new runtime limits.

Milestone audit: g0-baseline remains the authorized development branch; main-only
Pages deployment is unchanged. Changes form one portable-media workflow; no
auxiliary adoption lane. Keep Safari orientation/color/HDR/large-image and offline
shell/device acceptance pending. Next is the consolidated PC-candidate everyday
workflow/usability review described in Next decision below; ask only if a genuine
new policy/architecture or release decision emerges. This is a verified development checkpoint within the standing g0 commit/push
authority. Git owns its identity and remote status; no release is implied.

## Previous boundary —HEIC rights and alternative-workflow investigation

PO2026-10-30 requests a fresh separation of HEIC rights/distribution questions and
practical alternatives to shipping a decoder, including OS display/screenshot.
Outcome: current primary-source rights facts, a comparison of local/browser/OS/
other-device workflows, and a concrete simple-UX recommendation with explicit
original/quality/sharing limits. Root writes the record; bounded independent
read-only agents check rights sources, OS/browser alternatives and current contracts.
Plan: review existing PoC/holds and current code; verify official current sources;
compare viable workflows and integration decisions; independently review the memo
and update the handoff. This authorizes investigation/documentation, not decoder
adoption, new packages/dependencies, OS installation, schema changes or publication.
Stop only affected work for a genuine missing authority; do not treat a screenshot
as avoiding every underlying decoding/patent issue or claim legal clearance.
Checks are source attribution, contract consistency, diff/local links and review;
unchanged runtime code needs no repeated full suite. Existing modelFacts stat-only
marker remains preserved; verified08b checkpoint135359f is pushed to g0-baseline.

[Research memo](../docs/heic-rights-and-workflow-review.md) records current official
license/pool/platform/API sources and seven practical alternatives. LGPL is a
conditional distribution path, not an established blanket ban; the exact patent
coverage/exception remains unresolved. Existing dated PoC success is not universal
HEIC/OS/color evidence. External JPEG/PNG import works through the existing service;
paste/screen capture/native-generated companions are proposals, not implemented.
Simply adding a JPEG beside HEIC does not remove current receive/restore decode
requirements. An externally retained HEIC is absent from the Project backup.
Independent rights/UX/contract memo reviews PASS; the conclusion now distinguishes
existing native-only original retention from the proposed cross-device pair, and
the HDR screenshot caveat covers iPhone and Mac. Final diff/local-link/unchanged-
contract checks PASS. Documentation-only: no decoder/package/paste implementation,
new runtime check/device result, external enquiry or legal clearance is claimed.

## Previous verified boundary —08b ProjectScene checkpoint

PO2026-10-29 approved08b technical design and the complete implementation, including
the explicit old-reader refusal. Outcome: optional Project-local editor-name opt-in
→ future confirmed edits/candidates → five-purpose disclosure/omission → receive,
exact retry, restore and cold reopen, preserving originals and local work.
Completed plan: implement bounded message/capability codec and Source/Session capture; connect
journal/package requirements and purpose-specific disclosure; connect settings and
candidate UI; focused invariant/fault checks and representative browser file flow;
required serial checkpoint checks and independent final diff review, then suitable
g0-baseline push. Root alone writes; bounded mapping/review agents are read-only.
No new dependency/schema/proof/actor policy, general history UI or release. Stop
only for a genuine new contract conflict/authority. Physical/offline gates remain.
Start audit: pushed6c3788e on g0-baseline; only modelFacts stat marker, no content
diff. Existing08b design review was valid; runtime evidence was pending at that audit.

Implementation connects Source headers, pre-await capture (including GS workflow
confirmation), retained Session media context, exact journal/package capability
validation and purpose-specific disclosure through typed ports. Independent safety
and UX reviews PASS after closing complete-durable-head validation, typed recovery
messages and verified-base OR selected-target activation requirements. Normal
anonymous recovery remains valid; insufficient immutable starts stop before publish.
Focused source/Session/package/media/GS tests PASS. Recorded-DOM regressions from
a new string append/static-slot shift were corrected; representative existing
Scene/Caption/file controls PASS. No assertions or acceptance limits were relaxed.

Desktop Chromium main08b flow PASS: two profiles, named conflict candidates and
resolution, anonymous delta, all purposes, first restore/cold/edit, exact originals,
and the actual fixed old reader's package/local reopen refusal. Final GS-specific
browser case PASS with an artificial digest hold and another tab's UI-preference
change; this is injected concurrency evidence, not a claim that the viewer exposes
settings. Old-reader fixture uses fixed Git6c3788e and pinned installed dependencies
below ignored.artifacts, without network/install/active-tree writes. Main flow
preceded the later GS-only/anonymous-ancestor-base refinements; those have focused
regressions and the GS final-browser lane. Main run1793281243803-14976 and GS
run1793283948481-7688 each have one expected result, zero errors/flaky/skipped.
Initial checkpoint stopped at a nullable TypeScript annotation (fixed); the next
run was interrupted for the GS timing gap and is not PASS. Failure artifacts remain.
The third run was also interrupted during process diagnosis and is not PASS.
The completed verbose root run had134PASS files/3048PASS cases and one failed
candidate-selector expectation:08b appends author information to the option label.
Only that test changed to select the verified candidate's operationId and assert
the exact body/anonymous-editor label. Its existing causal/resolution/image checks
remain; the focused case and independent test-diff review PASS. The corrected
final tree's `npm run check:checkpoint` exits0: typecheck,135PASS files,
3049PASS tests/21 existing TODO, and normal/Harness/Validation/Desktop builds.
Four-artifact `verify:heic-isolation` PASS. Final43-file source/test/script hashes
match the checked tree, and all19 Desktop runtime files match the final GS browser
build. No dependency/lockfile change. Known chunk-size warnings and existing TODOs
remain; these checks do not qualify performance, physical iOS, offline or release.
No automatic retry, test exclusion or relaxed assertion; prior failure artifacts
and raw-tree hashes remain under `.artifacts/e2e/editor-attribution/`.
Independent final safety/UX reviews PASS, including the later GS/base/test-selector
corrections. Changed Markdown links, retained history and contract consistency PASS.
This is a suitable g0-baseline development checkpoint; Git owns commit/push identity.

## Previous verified boundary —08b design

PO2026-10-29 approved the [08b product policy](../docs/specs/08b-shared-editor-name-policy-proposal.md)
and authorized concretizing its design. Explicit Project-local opt-in records a
self-declared name only on future confirmed edits; Workspace/Contribution/Backup
retain it and Review/Clean exclude it. This is design authority, not approval of
an unsettled storage/profile/migration change or product implementation.

Outcome/plan: specify the smallest exact original-change linkage, Session capture
and retry behavior, provider/UI ports, five-purpose disclosure/projection and
old-reader compatibility; independently review the complete proposal. Preserve
actor generation, old original bytes, unknown data and publication/recovery fences.
Root alone writes docs; three bounded source/UX/package reviewers are read-only.
Checks are documentation diff, local links and contract/authority consistency;
no runtime check is warranted without source/test changes. Present any genuine
compatibility/implementation decision as one concrete reviewed next step.

Start-of-unit meta-audit: g0-baseline HEAD90b0e82 is pushed; source/test diff is
empty (modelFacts has a stat-only marker). The prior GS unit below is complete.
This unit closes the newly approved daily-use design gap without expanding into
identity verification, a generic history screen, a new dependency or release.

Concrete proposal: canonical v2 change-message name declaration joined only by
the enclosing change hash; pre-await host capture and retained Session context;
closed requiredCapabilities field on new journal starts and history-bearing
manifests. Keep map1/map2, root/proof, old bytes and exchange-base equality exact.
Capability comes from complete retained history/base evidence; disclosure comes
from actual output bytes (Contribution delta is distinct from its named base).
The genuine next decision is rejecting named histories in the current old reader,
including same-browser cold reopen, and authorizing the connected implementation.
This technical design remains PROPOSED until that grouped decision; product policy
is already approved and is not asked again. Independent final design review PASS:
non-NFC header parsing is isolated from domain validation, and local protection
requirements are distinguished from each file's actual payload/activation scope.
Package/privacy review PASS. Seven-doc local-file-target check PASS (340 targets,
none missing); diff/authority/retained-history checks PASS. No runtime source/test
change or new runtime evidence; no runtime suite/build was run for this doc-only
checkpoint. Next is the single concrete compatibility/implementation judgment in08b.

## Previous verified boundary —GS workflow

The bounded08a Desktop workflow and required final checks are complete. Source,
fault/file/browser evidence and independent final review are recorded below.
The suitable g0-baseline development checkpoint retains device/offline/adoption/
release limits. At that checkpoint08b awaited PO judgment; the current design
authority is recorded above. Current source/test bytes remain frozen through Git
preflight and checkpoint publication; Git owns the checkpoint identity.

PO approved08a2026-10-29 with no assigned Proxy in the new revision. Complete
ordinary01c GS→same01c replacement, preserve placement/records/source transforms,
then receive with local edits, explicitly set a surface, correct pins, return,
restore and cold reopen. Existing500k SH4/512MiB limits stay fixed. Root is sole
writer; bounded contract/source/evidence reviewers are read-only. No dependency,
profile/schema, Native GS conversion, automatic surface carry or release change.

Start-of-unit meta-audit: g0-baseline checkpoint3d1934b was verified and pushed;
source/index diff was empty (modelFacts had a stat-only status marker). This next
unit closes an approved missing daily-use workflow rather than adding another
evaluation lane. Existing Session/file/recovery/residency ports remain the path.
Extend model preparation with a GS-only captured source transform, recompute new
bounds, and independently enforce the old/new closure and fresh IDs in the command.
Expose exact01c replacement through the existing model panel and File/Blob service;
no UI storage or viewer package imports. Reuse existing decode retirement accounting.

Verify same-byte fresh compatibility, nonidentity transforms, unassigned active
Proxy with retained history, stale/profile/ID/capacity refusal, interrupted exact
retry, all file purposes, a small independent2-browser team flow and an owned
500k-SH4 two-generation display/save/cold flow. Then final serial checks, four-output
isolation and one independent final review; push the suitable checkpoint. Stop only
an actual contract conflict or new policy/dependency/capacity/release decision.

Implementation: exact01c saved-source availability, captured native File/Blob,
GS-only owned transform context and independently checked new-GS-only command
closure are connected. Initial source review PASS; early architecture12PASS.
Transformed source/placement, same-byte fresh compatibility, original history,
unassigned Proxy, stale/profile/ID/capacity refusal, exact publication retry and
all5-purpose peer-edit retention pass focused checks. Earlier failures were test
fixture ownership (frozen records, Buffer backing array, extra target token),
not relaxed assertions or product acceptance. Final focused/browser/scale checks
remain pending. Source scope is profile-based:07k saved GS also uses01c; no new
Native converter or provenance gate is introduced, and the nonidentity fixture
alone is not actual07k route evidence. Final focused GS/stream/residency/Point/
architecture checks55PASS, including missing/corrupt acknowledged replacement
bodies refused on cold retry. Typecheck PASS and all15 frozen source/test/config
hashes match before the connected browser runs.
The first small-team browser run1793268696156-58160 failed at GS selection:
selection-consequence inspection still called whole-File arrayBuffer for a93KiB
GS, so the strict source guard refused and confirmation remained disabled.
Only that read-only hint now captures the native Blob and reads its64KiB prefix;
the full command inspector remains mandatory. Prefix regression1PASS; preserve
the failed run and supersede its15-file manifest only for this fix/test/diagnostics.
The next run1793269069527-46376 passed actual replacement, new-body paint,
Contribution receive and peer-local text/two-photo retention, then failed a test
assumption: needsReview starts explicit new-surface selection before coordinates
become editable. Select the newly assigned face normally, then apply the manual
coordinate correction. No force-click, changed expectation or production change.
Run1793269484555-30424 then exposed the selected Caption marker covering that
test's chosen surface point. Use normal isolate/front controls and a distant point
inside the new face. This is a test interaction correction, not a force-click or
pin-visibility contract change; retain both failed runs and their distinct traces.
Subsequent run1793269817056-49860 passed pin correction/return, Review including
display retry, and Clean open/original equality, but first-backup restore exceeded its existing90s
wait. Focused exact-file restore also exceeded90s without page errors. At91.8s it
had completed2,213 restore-control listings,20,671 control readStream opens and
9,209 control readBytes calls. Do not raise the deadline or remove/reuse fences
from these counts alone. Added existing optional phase timing around first-restore
persist/staging/initialize/projection/display/select/adopt to locate elapsed time.
This is the current connected-workflow blocker; unexecuted500k and final checks
remain pending. Independent read-only analysis places vendor decode after editor
mount, and documents repeated per-I/O staging audits and selection/adoption checks.
The phased exact-file diagnostic1793271030718-46332 PASS with unchanged90s:
editor73.43s/display74.83s, errors0; initialize43.87s/select14.99s/adopt11.22s,
display preparation0.21s. This proves finite completion, not a decoder deadlock,
data defect or sender-contention cause. Retain~75s latency as performance work.
The finished sender context now closes after its final exports/assertions before
Review/Clean/restore; all acceptance remains. Optional timing observers cannot
alter restoration (start and end notifications are exception-protected).
No audit/cache/fresh-read policy or receipt batching was changed. Temporary focused
diagnostic source/logs/measurements are retained only in ignored artifacts.

Closing A did not fix the wait:1793271358586-63904 still failed90s restore. Stop
fixture/poll adjustments. The independently reviewed06a internal refinement keeps
all audits and the full size-only pass, then streams each newly reopened receipt
instead of opening that same path a third time via readBytes. Only a pure decoder
is shared; generic readReceipt I/O is unchanged. Focused11 control cases PASS,
including after-inventory mutation/removal, untouched stat snapshots, stream/
canonical failures and primary-error preservation. No cache, audit frequency,
package/profile or validation-fence change; no new PO policy is needed.

The owned500k-SH4 two-generation source/renderer/save/cold lane PASS,9.7min
(runner10.0min): creation/display readiness92.58s, Workspace202.63s, replacement/new paint337.90s,
both originals saved448.40s and cold/hash verification578.89s. Each source is
178,002,206bytes; both fixed SHA-256 values match saved and cold archives, active
new revision has no Proxy and old GS/Proxy/Caption/Frame/placement remain retained.
Its start manifest is`large-start-tree.json`; this is unaffected-lane evidence,
not an exact-final-tree check of the later control reader or500k restore acceptance.
That lane never creates nonempty restore controls; generic decoder extraction is
semantically unchanged. Exact final-source small restore/team/fault/whole checks
remain required and now run serially, stopping at the first failure.

Exact-file post-refinement diagnostic PASS under the unchanged90s: editor60.30s /
display61.04s from test start, compared with73.43s/74.83s before. From the restore
action, display wait is59.73s vs72.98s. Control-audit listings remain2,246 in both
complete measurements; control readBytes falls9,413→6, without skipping fresh opens.
Initialize35.85s/select12.32s/adopt9.01s; errors0. This is one paired synthetic-file
measurement, not a general time guarantee; roughly1min restore latency remains.
`final-tree.json` freezes18 final source/test/config files before the final small
team flow and required serial checkpoint. Large evidence remains qualified above.
Final18-tree team run1793273306309-69304 PASS12.9min/runner13.2min, retry0:
replacement/new paint, peer-local text/two-photo retention, explicit surface
reselection/manual pin correction, Contribution return, Review/display retry,
Clean reopen, absent-Project backup restore→save/exact-record comparison→full
browser close/cold/save all complete. Existing90s readiness and all byte/record
assertions remain. Typecheck PASS; the required whole test/four builds/isolation
sequence is running in`checkpoint-final.log`/`isolation-final.log`.
Independent final connected-diff review PASS with no unresolved findings; all18
hashes match. Loading/Caption-read evidence applies to asynchronous GPU display
preparation. Durable input validation/journal/publication retains its normal busy
fence; do not claim interactive editing/search throughout that command.
Final serial `check:checkpoint` PASS, exit0: typecheck,135files/3,038tests
(21existingTODOs;1,043.32s), normal/harness/validation/Desktop builds. Four-output
HEIC isolation PASS, exit0; no local libde265 PoC enters production inputs or
artifacts. All18 final hashes match; independent source/final-diff and executed
evidence reviews have no unresolved findings. Diff/local-link checks pass. No
dependency/lockfile, wire/profile, PWA path, audit/fence, deployment or release change.

## Previous verified checkpoint —Caption action Undo and ordinary Point replacement

### Plan and authority

PO authorized continuation2026-10-29 after the grouped08 checkpoint. Outcome:
create/copy/edit/attach/delete Captions, undo/redo confirmed actions without a
selection, then replace an ordinary01a Point while retaining placement/records;
save/share/restore/cold remain coherent. Root is sole writer; parallel bounded
investigation/review is read-only. Update08 and the relevant01a/05 clauses before
implementation. Use finite compensation commands and existing replacement,
Session/body/publication/recovery ports; no schema/dependency or cache change.
Verify action ordering, foreign-edit refusal, retry/bytes and replacement pins
with focused tests and a connected Desktop browser/file flow. At the final tree,
run one serial required checkpoint, artifact isolation and independent review;
commit/push suitable verified work to g0-baseline. Stop only affected genuine new
policy/dependency/format or publication decisions. No tiny PO testing waits.

Undo remains editor-local, checked compensation, not arbitrary historical rollback.
Point scope is exact ordinary01a→same01a: no Native/GS/profile conversion or pin
auto-remap. Device/offline/adoption/release and portable HEIC remain separate.

Point integration exposed a Session-readiness discrepancy with01's weak hit-source
provenance invariant. The content/provider tests deliberately retain missing weak
index diagnostics without fetching old bytes; Session rejected them. The08 exact
resolved-weak-anchor correction passed independent contract review and is
implemented. Active-source/invalid/unknown guards and existing
publication/body/recovery fences stay intact; no cache or validation bypass.

Focused core/authoring/Point checks39PASS and media-fence service cases5PASS.
Same-length corrupt media exposed inventory-only receipt limits; the corrected
reactivation path derives existing refs from the exact local batch at preflight/
retry/cold and fully verifies only them, retaining journal semantics and original
parts. Distinct media/duplicate blobs, missing/corrupt refusal and cold publication
retry pass. Independent source reviews have no unresolved findings. An initial
owned browser run was cancelled before completion for the affected-only conflict
fix; its log is retained, not a PASS. Run1793263075211-44016 then passed Daily
Undo/save/share/cold but failed Point's onscreen-marker assumption. Normal isolate/
front/fit and explicit new-point selection fixed that test without weakening its
assertions. Point-only run1793263631876-34112 passed replacement/peer-edit retention/
correction/return/backup, then exposed a real cold-navigation click dropped during
the selector's opening operation. Only that button now receives the owner-busy
guard; its transitions rerender the control. Caption reading stays enabled.
Recorded UI regression1PASS and independent resolution review PASS. The final
two-case Desktop browser run1793264411344-57484 PASS: Daily4.6min +Point7.0min,
runner11.8min, no retry. It verifies full action Undo/Redo, native playback,
save/share/recipient/cold empty Undo stack, same01a Point replacement, peer-local
text retention, explicit point selection/manual correction, Contribution return,
Review's local DPR3 refusal, cold reopen and absent-Project backup restore/edit/save.
The cold navigation transition now succeeds. Original bodies, Frame/placement and
history are retained. Browser logs/results remain in their ignored directories;
earlier failed aggregate runs remain failed.

The22-file final raw manifest matches. Only a standalone Vitest regression for
conflict-preserving deletion/unavailable Undo capture was added after browser
start (1PASS); production/browser/config stayed identical. The pre-browser
manifest is retained separately. The first serial whole check is retained in
`continuation-checkpoint.log`; its superseding result is described below.
No assertion/deadline relaxation or adoption/device/offline/release credit.

The first whole check found the old recorded-DOM parent-only recovery with an
ambiguous child was blocked by reactivation derivation before its publication
failure/retry fence. The existing contract intentionally leaves that child
unresolved. Stopped the owned run for the source fix; its log is not a PASS.
Only resolved live attachments should yield media refs; ordinary Undo's stricter
planner remains unchanged. Recheck that exact existing case plus media/refusal
regressions and the representative changed integration before the final whole run.

Resolution: the unchanged old UI case1PASS, core/authoring31PASS (including two
actual identical immutable media candidates), and media/navigation service cases
6PASS. Independent correction review has no findings. Final Daily browser
run1793266225208-56676 PASS4.3min/runner4.6min at the corrected source, retry0.
Retain Point's7.0min PASS from1793264411344-57484 as unaffected-flow evidence:
its local commands do not enter the changed lifecycle-restore derivation branch;
backup import/restore use separate existing fences. Do not call the earlier
two-case run an exact final-tree browser build after this helper correction.
All22 final source/test/config hashes match. Final required serial check PASS,
exit0 in `continuation-checkpoint-final.log`: typecheck,135 test files/3,019tests
(21existingTODOs,999.73s), normal/harness/validation/Desktop builds. Four-output
HEIC isolation PASS, exit0 in `continuation-isolation-final.log`; no local decoder
PoC enters production inputs or those artifacts. Independent source, evidence and
documentation reviews have no unresolved findings. This is a verified development
checkpoint, with device/offline/adoption/release acceptance still separate.


## Previous verified checkpoint —daily authoring, grouped1–4

PO2026-10-29 explicitly requested implementing all four groups together. Root is
the sole writer. The bounded specification08 workflow now connects Scene
organization, Caption duplication/navigation and guarded local text/color undo,
tags/local settings, manual alignment and approved media through existing
Session/provider ports. Actual edits, refusal/retry, original bytes, save/share/
restore/cold records and final serial/browser checks are verified. Independent
reviews are read-only; suitable development checkpoints use g0-baseline.
PO subsequently approved specification08 media: self-contained MP4 AVC/AAC,
M4A/AAC, MP3 and native-browser single-still HEIC, no new dependency. Connect
strict body validation, controlled playback, save/share/restore and cold reopen.
General Windows HEIC and physical codec/device acceptance remain outside this
bounded implementation. The final dedicated Chromium combined workflow passes,
including media, exact original bytes and full browser cold restart. The required
serial checkpoint and artifact isolation PASS at that same frozen source/test tree.
No tiny control/test confirmation waits. Stop only affected new-policy/format/
dependency work; complete the authorized operations and preserve current fences.

The first all-in-one planner patch was rejected by automatic approval review and
was not applied. Its recovery contract was incomplete. Revised08 now specifies
explicit retained-Scene restoration even with no active/default Scene, no implicit
child restoration, entry-View cleanup and explicit order-conflict resolution;
independent review passes. Continue only the materially revised bounded operations
through normal managed approval. No denial bypass or repeated unchanged patch.

Within this Scene workflow, independent review found a pre-existing copy mismatch:
05§4.2 requires fresh Japanese `シーン 1`, but initialProject wrote`全体` with no
01a/01e exception. Corrected only fresh creation to the accepted contract; existing
Scene names, converted source names and recipes stay intact. The browser test
captures its actual starting Scene and does not ratify the earlier mismatch.

Meta-audit at the connected milestone: actual branch is g0-baseline at ae67230;
the grouped production/UI/format checks are the active critical path, with no
dependency, wire-schema, deployment or optional research expansion. Independent
review findings on recovery, foreign edits, HEIC dimensions/graph/NAL headers and
parser work accounting are fixed with focused regressions. Browser failures are
retained: initial media passes actual decode/play and cold records, but test
selectors used a wrong tab or an overlapping copied pin. Use the normal Caption
list; no force-click, weakened expectations or changed test deadlines. The final
connected browser and serial checkpoint now PASS at the final tree.
Device/offline/adoption/release remain pending, without blocking this development
checkpoint. No outstanding managed denial or media-policy question remains.

### Executed integration evidence —2026-10-29

- Typecheck and the complete root suite PASS:135files/3,004tests,21existingTODOs,
  duration1,205.13s. `checkpoint-verified.log` records this final corrected tree;
  normal/harness/validation/Desktop builds all PASS, exit0. HEIC public-path
  isolation across all four outputs PASS in `heic-isolation-verified.log`: no
  local libde265 decoder PoC enters production inputs or artifacts. Native-only
  media admission is the approved08 path, not promotion of that decoder PoC.
- Dedicated Desktop Chromium156.0.8078.4: final daily-authoring browser workflow
  PASS in3.3min (runner3.6min), run1793252328602-65088, retry0/flaky0. Scene/caption independent copy,
  reorder/default/delete, guarded text undo/redo, tags, alignment/pivot/reset,
  browser-local name, PNG+MP4 AVC/AAC+M4A+MP3, actual playback/time/video frames,
  no autoplay, no thumbnail players, close/source/URL cleanup,320px player bounds,
  original-byte archive equality, full browser close/cold state and an independent
  Workspace recipient's playback/full-history equality all pass. Remote requests
  and unexpected page/console errors are zero. HEIC native decode is FALSE here:
  correct JPEG guidance and explicit cancellation pass; no native HEIC display or
  physical-iOS claim. No manual PO test or response was a development dependency.
- Media service workflow PASS: injected-decoder attachment→Review/Workspace/Clean/
  backup→restore→cold, exact original bodies and unsupported incoming atomic
  refusal. Focused daily/local/media and format/work/timeout/abort regressions PASS
  and are included in the final whole suite. Source/test bytes are frozen in ignored
  `.artifacts/e2e/daily-authoring-tools/final-tree.json`; browser, failures and
  focused logs remain in the same directory, with the detailed browser report
  under `.artifacts/e2e/runs/1793252328602-65088`.
- Independent design/code/UI/evidence reviews have no unresolved findings. Small
  owned test fixtures are normal Git test data under03§2.1/§3.7, not public
  fixture Release assets; size/digest/provenance registry is beside them. No
  dependency, lockfile, deployment or PWA change. During the first whole check,
  final review found FTYP-brand array allocation lacked the existing item ceiling.
  The obsolete own check was explicitly cancelled after the source correction;
  its log is retained as `checkpoint.log`, not a PASS. The final source bounds
  brand count before scanning, keeps only a boolean and charges each inspection;
  a later-compatible-brand/oversized-table regression covers it. The final raw
  manifest and browser were refreshed after the correction; do not count the
  cancelled check or an earlier browser as exact final-tree evidence.
- The59 frozen source/test hashes match the browser and final-check tree.
  Markdown diff/local-link checks PASS; completed
  checkpoint records were retained apart from rebased links in history.
  No private source material, dependency/lockfile or deployment change is included.

The first completed whole run (`checkpoint-final.log`) reported132PASS files,
two fixture-suite collection failures and one product regression in the then550
projectFiles cases. The fixture verifier correctly requires its
authored provenance document02 to equal the Git index; staging that already
reviewed document fixes both suites,53focused testsPASS, with the contract intact.
The real regression was unsupported HEIC reaching the Project-name form before
the required file-open JPEG guidance. Strict no-write HEIC preflight now preserves
that timing and guards generation/owner/draft. Its AbortSignal immediately frees
selection cancellation; late and same-checkpoint bitmaps are closed. Existing
negative assertions are unchanged. JPEG/WebP/GIF plus supported-port HEIC raw
creation/cancellation/cold rows4PASS; media format/resource regressions14PASS;
exact core-boundary checks12PASS. Independent review findings are resolved.
The CPU diagnostic sampled normal metadata/restore validation and found no orphan
old run; the inspector ended with its test worker. Failed run evidence is retained;
the final raw manifest and browser are refreshed. The corrected tree's serial
check is recorded in `checkpoint-verified.log`. No timeout increase, assertion
relaxation or test exclusion.

## Next decision and remaining work

The Current boundary near the top owns today's plan, evidence and next unit.
The following retains feature qualifications and later decision lanes.

The08a GS workflow is implemented and verified within the exact scope above,
including the final required checks. Do not reconstruct the current
boundary from the earlier08 continuation. Former Proxy carry/rekey remains outside
PO's selected unassigned-surface policy. No new dependency/profile/capacity promise
or general adoption follows from the owned500k source/renderer/file lane.

The [08b](../docs/specs/08b-shared-editor-name-policy-proposal.md) workflow is connected
and verified within the exact scope above, including old-reader refusal. Private
names stay private until the separate Project-local opt-in. The milestone audit
keeps this on the accepted daily-use path; no additional fully specified daily-use
unit was found in the current inventory. This is not overall app/adoption completion.

The earlier08c outcome is original-plus-portable-display, authorized after
the retained HEIC research. Its implementation and exact checks are recorded in
the08c boundary above. The[research memo](../docs/heic-rights-and-workflow-review.md)
and[decoder PoC](../scripts/heic-decoder-poc/POC-RESULT.md) remain historical evidence,
not an active decoder-adoption task. The native reader on the adding device and
one fixed PNG provide portable media for supported new tuples; raw-only legacy
HEIC is unchanged. General direct HEIC input on incapable browsers is not solved.
No bundled decoder or rights/distribution gate was adopted by08c.

After the08c checkpoint, the consolidated PC-candidate completion/usability
review covers the accepted everyday workflows and inventory, fixing concrete in-scope
inconsistencies found there. Keep missing Safari orientation/color/HDR/large-image
and cold offline-shell evidence grouped as readiness lanes; do not invent a new
feature solely to increase coverage. Broader Native/different-profile replacement,
paste/manual image pairing or a decoder remains a separate explicit contract/scope.

Local Undo covers the named confirmed Caption actions in this editor, not every
Project action or historical rollback. Native Point/different-profile replacement
is not granted by same01a/01c replacement; saved07k GS already uses01c and is
eligible by profile, without a new Native-conversion-route claim from this fixture.
08c portable media closes the named new-tuple viewing/file workflow only; it does
not claim native decoding on every browser, automatic legacy upgrade or device
qualification.

Earlier500k observations (about202s to editor,47s edit,232s backup) remain retained
as performance evidence; the current owned replacement lane is recorded above.
Further fresh-inspection/calculation tuning stays pending behind accepted missing
integration unless it blocks use/data safety. Keep current corruption detection,
write/publication/recovery fences and originals.01h cross-command reuse is held for
recovery design, unapproved/unimplemented; current same-profile repair cannot rescue
that private-ZIP failure. No new dependency/worker architecture, guarantee, optional
M14, ordinary activation or release is inferred from this next-step record.

Deferred limits remain in the [retained evidence](../docs/history/development-through-2026-10-29/tasks/todo-before-daily-authoring.md):
frozen-v1 orthographic/multi-model LociMyu mappings, full-SH4 progressive/LOD,
smooth-pick conservative neighbour refusal and P2 GS reservation cleanup. Physical
iOS, actual IME/zoom, trusted HTTPS/offline/PWA and aggregate adoption/release remain
separate evidence lanes. They do not replace the daily-use priority above.
