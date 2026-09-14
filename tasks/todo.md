# LociView active work

## Current boundary — whole practical-team workflow first

Updated 2026-09-14. This file owns current work, executed checks and next actions.
[Inventory](implementation-inventory.md) owns feature coverage; contracts are routed
by [docs/README.md](../docs/README.md). Git owns actual branch/commit identity.

Complete the practical team candidate: ordinary home → real Project/Scene/Caption/
media work → file handoff/update → continued local editing → named manual backup,
resume and recovery. Desktop, physical iPhone and offline acceptance must cover
the new route. Scope is 62 of the 64 inventory groups; M13/M14 remain later work.
Neither component counts nor synthetic-host success is product completion or release approval.

## Verified unit — I04 registered media selection and shared image viewing

The Native compatibility amendment below awaits PO authorization. Continue the
already-approved image workflow without changing a schema, package or profile:
select an existing verified PNG by thumbnail → explicitly attach → inspect from
the panel or any retained Caption window in one common viewer. The standalone
read-only review uses the same viewing controls, not editing commands.

- [x] Connect thumbnail selection and common viewing with existing Session writes.
- [x] Verify exact Caption/attachment/resource identity, previous/next, close/focus,
  stale image events, failure/retry and read-only/draft preservation in existing tests.
- [x] Review the connected final diff, run serial final checks, and record the
  separate live-browser/device evidence boundary before checkpointing.

Acceptance: selection alone never attaches; existing independent attachments to
the same resource stay distinct; the viewer follows the bound Caption's attachment
order without changing Scene/list selection or draft state. Removed/ambiguous
targets cannot silently become another image. Scene/Project changes dispose the
old view; load failure and retry retain the exact target. Thumbnail work is lazy
and bounded by a small UI page, without stored derivatives or new binary I/O.

Exclusions: new media formats, image processing/zoom tools, new persistence/wire,
Native conversion, ordinary-home activation, new probes/dependencies, device or
offline acceptance. Browser control previously failed during plugin bootstrap;
do not call recorded DOM tests live rendering evidence or restart that unrelated
repair workstream. No repeated full suite merely for documentation or staging.

Focused checks: 14 existing-suite media tests pass (three connected cases added),
plus three existing saved-PNG/file/review integration cases. They cover explicit
attachment, retained drafts, exact-target navigation/retry, old event rejection,
bounded/lazy thumbnails, read-only use and review file → common viewer → edit-copy.
Independent read-only review found no mandatory issues. Final serial checks passed;
no live modal/focus, physical-iPhone or offline PASS is implied.

Final typecheck and root tests pass: 112 files, 2,280 PASS / 21 existing TODO,
355.37s (`npm test -- --reporter=dot --maxWorkers=2 --testTimeout=30000`).
The first root run found only the existing entry-isolation allowlist rejecting the
new presentation helper. The exact helper/host imports were added, independently
reviewed and checked in isolation before the green full rerun; no ordinary-entry,
storage/network or Native prohibition was relaxed. No product change followed
that first root run. Ordinary and harness builds passed. Existing mixed-import/
large-chunk, Repo UUID and injected Node image-loader warnings remain; no limits
or dependencies changed. Document links, 64-group classification and diff checks
pass. No server/tunnel was started; Push remains separately constrained by the
known environment denial, which was not retried.

## Next approved connection, without waiting on the Native amendment

T01/T03: real Workspace/Contribution receive → compare Caption title/body
candidates → explicit choice/manual text → ordinary edit → cold reopen.
Reuse the existing conflict form and validation host resolve command, with no
synthetic receive button. Include the form's pending text/IME in Project/mode/
file-navigation guards. Preserve original received changes and local edits; do
not choose a winner, reinterpret absent fields or expand to a new profile/wire.
Use existing file and conflict tests; this is a connected user flow, not another
probe. Other field/lifecycle gaps remain explicit, and ordinary adoption stays gated.

- [ ] Adapt the existing read/resolve conflict UI to the real-file host and expose
  the supported Caption title/body candidates without synthetic receive controls.
- [ ] Include candidate/manual input and IME in existing navigation/pending guards;
  preserve stale input, failure/retry and explicit winner selection.
- [ ] Verify receive → resolve → ordinary edit → cold reopen in existing tests,
  independently review the connected diff, then checkpoint and continue.

## Pending decision — Native conversion implementation

Previous goal turn was progress: the connected review edit-copy checkpoint is
`9e49571`; the worktree is clean. The next user outcome is Native file → confirmed
conversion → independent Project → edit/cold reopen, with a retained common
baseline for later Native changes. This turn closes its concrete implementation
decision, not another probe or adoption claim.

- [x] Compare 07/05 §9 with actual Native and metadata readers; identify exact
  mapping/encoding gaps rather than reopening approved product policies.
- [x] Record one bounded technical implementation proposal in existing 07, covering
  compatibility, field preservation, initial durable handoff and later bridge roots.
- [x] Obtain read-only independent review, check document consistency/links and
  prepare the remaining technical authorization as one request.

07 §11 now proposes map-2/wire-2/summary-2/review-2 with old-file/job preservation,
known unplaced/pin-scale/inactive-chroma fields, an exact typed control layout and
separate initial Native source/purpose. Source inspection found real differences
in encounter order, per-instance material scope and chroma color/distance/softness
semantics; they are specified as mapping requirements, not silently dropped.
Independent reviews corrected chroma direct-copy assumptions and its disabled/
copy semantics; no mandatory findings remain in the decision draft. Four docs
only; local links and diff checks passed. No runtime suite/build was repeated or
new conversion/profile/adoption claimed. Execution byte/profile/receipt tables
still precede their respective code under the requested authority.

Native implementation requires PO approval of 07 §11's concrete compatibility amendment
and isolated implementation-before-measured-adoption order. This is the first
grouped request at that boundary, not a renewed request for previously approved
unplaced preservation or general development sequencing. The practical-team goal
is active and incomplete; do not implement the new format while approval is pending.

No product code, new dependency, source mutation, public fixture, normal entry,
release or device route changes. Stop at the actual schema/recipe authority
boundary; recipe hashes and adoption evidence are outputs to freeze after an
authorized implementation, never invented evidence in an advance proposal.

## Previous evidence — selected Scene review output → standalone View

Independent-copy output/input, editing and cold reopen are committed at `cc99bcd`.
This checkpoint connects the accepted one-Scene review output and
read-only opening. It was a user-visible checkpoint, not completion of review's
explicit editable-copy handoff. The connected handoff is recorded below.

- [x] Build and inspect the closed selected-Scene snapshot, exact presentation/
  Caption/media/material closure, privacy summary and frozen typed reconstruction.
- [x] Connect output/preflight and genuinely read-only input to the existing file
  area and 3D/Caption controls; preserve omitted-model records as list-only.
- [x] Reuse existing package/file tests for scope, privacy, output retry, file input,
  materials, multiple windows, unknown nested input and read-only rendering.
  Independent review fixes cover material projection, optional color and startup retry.
- [x] Finish serial final unit checks and preserve the reviewed checkpoint. Record live
  browser/device/offline evidence separately at the grouped adoption boundaries.

Final checks passed serially: typecheck, root tests (112 files, 2,273 PASS / 21
existing TODO; 476.45s), ordinary build and harness build. The root command was
`npm test -- --reporter=dot --maxWorkers=2 --testTimeout=30000`. Existing
mixed-import/large-chunk, Repo UUID and injected Node image-loader warnings remain.
No dependency, runtime budget or warning threshold was changed. Focused failures
were corrected before the final tree; the full run is green. The three independent
UI findings were fixed and re-reviewed; exact snapshot/output/source privacy and
isolation were also reviewed. No additional PoC or test framework was introduced.
Recorded DOM and mocked GPU checks are not live browser, physical iPhone or
offline acceptance. Those remain at the grouped boundaries.

## Verified unit — explicit review edit-copy → independent Project → edit/cold reopen

Previous goal turn: progress, verified at `90441d3`; branch/worktree were clean on
resumption. The next missing user flow is review-file editing, not another probe.
The current tree connects persistent review edit jobs, exact retry receipts and
the explicit edit-copy UI through the existing clean initialization path. The
reconstruction/destination and actual metadata bytes are fixed before initialization;
original review bytes, missing-model records and known-position review pins remain.
The local handoff contract was specified and independently reviewed before code.
This is a connected file-to-edit unit, not only direct component initialization.

- [x] Specify the bounded local parent/clean-child handoff and confirm independent
  design review. Freeze actual metadata bytes/proof, not only IDs or timestamps.
- [x] Connect explicit confirmation, persistent retry and missing-evidence status
  to the existing file area/Project selector; reuse clean initialization.
- [x] Verify file → independent edits → cold reopen and interrupted retry with
  existing tests; preserve source review bytes and later edits, then checkpoint.

Focused evidence: six package/file/entry checks passed. They exercise standalone
View → explicit edit-copy → independent edits → cold reopen; original/child/parent
completion interruptions; host package-lock refusal before parent creation; and
acknowledged parent/child evidence loss. Parent-only recovery never exposes the
private clean ZIP. Exact later edits survive retry; source review bytes and the
source Project stay unchanged. Independent input/UI reviews found three mandatory
failure-path corrections (parent loss classification, child Start loss with journal,
and first-open rejection without a recovery parent); all were fixed and re-reviewed.
No new probe page, dependency or test framework.

Final serial checks passed: typecheck; root tests (112 files, 2,277 PASS / 21
existing TODO; 414.30s); ordinary build; harness build. The root command remains
`npm test -- --reporter=dot --maxWorkers=2 --testTimeout=30000`. The first whole
run found one startup regression: a duplicate output-list read cleared its initial
discovery failure. Removing the redundant read preserves the failure and blocks
new output; five focused checks and the second whole run passed. Independent
re-review confirmed startup still initializes the list. Existing build/Node loader
warnings remain; no thresholds or dependencies changed. Documentation links and
diff whitespace passed. Live browser/device/offline evidence is still outstanding.

Acceptance: exactly the chosen durable Scene, no filter-driven omissions, no
source history/identity, no inferred model relation or compatibility winner.
View must not create editable metadata or expose mutation commands. Edit-copy
keeps original bytes, known positions and missing-model records, and discloses
pins whose omitted family requires review. Existing 06 §§5.1/12.1/12.6 govern;
no new PO policy is needed. New local retry records receive design review before
implementation. Genuine unplaced/pinScale, migration, normal activation, other
profiles/media/dependencies and release remain separate. Stop only for a real
contract conflict or new authority boundary.

## Previous evidence — independent copy → edit → reopen

The preceding connected restore unit is committed at `26638b5`; the tree was
clean on resumption. The next work closes a missing file purpose, not another
probe page. Existing PO approval and 06 §§5–6/12.1 cover this isolated unit.

- [x] Read the current contract and obtain bounded independent design review: no
  new policy blocker for whole-Project clean; review/migration remain separate.
- [x] Build current-value admission, complete typed re-keying and snapshot summary;
  preserve every active resource and editable strong closure, not just one Scene.
- [x] Connect frozen clean output/retry and independently admitted clean input to
  the existing validation file UI, then edit and cold reopen the new Project.
- [x] Reuse package/file tests for privacy, independence, exact bytes, conflicts,
  cancellation/retry and failure state; run final checks/review at the connected unit.

Connected evidence: 10 focused package/file/entry checks passed. They cover fresh
history without deleted values, exact bodies and frozen-ID retry, independent
editing/cold reopen without a Workspace base, interrupted initialization,
acknowledged input/output loss, sink-opening failure and the existing selector's
recorded-DOM flow. The DOM check waits for the enabled Download control, not an
intermediate generated-job observation. Final typecheck, root tests (112 files:
2,266 PASS / 21 existing TODO; 570.70s), ordinary build and harness build passed
serially. The root command was `npm test -- --reporter=dot --maxWorkers=2
--testTimeout=30000`. Existing mixed-import/large-chunk build warnings and injected
Node image-loader warnings remain; no dependency or warning threshold changed.

Independent read-only input/output reviews found three bounded recovery defects:
stale pre-Start reselection, sink-open rejection leaving the stream pending, and
missing whole output-job discovery. All were fixed and their regression checks
passed; reviewers confirmed the exact corrections. No new PoC/test framework.
Browser skill setup still fails before connection with the previously recorded
runtime import restriction. No live rendering/device/offline PASS is claimed.

Acceptance: source Project untouched, no inherited exchange base, no silent field
loss/winner, exact retry, honest external-file status. Actual browser/device/offline
checks stay at the approved grouped boundaries. No ordinary activation, new media,
dependency, migration or release work. Stop for a genuine contract conflict, not
for each helper. A snapshot builder alone does not finish this unit.

## Previous evidence — restore → edit → Contribution

Checkpoint entering maintenance: `423990d` (root-owned backup restore input jobs).
Environment maintenance is complete at `c6222ee`. Product changes connect dedicated
original-history initialization, historical bases, retained-ZIP validation, selected
generation routing and explicit restore controls in the existing validation file
area. This is limited GLB/PNG development code, not ordinary-home acceptance.

- [x] Independent pre-implementation review of the dedicated initialization contract (06 §12.8).
- [x] Finish the connected host/catalog/display lifecycle; retain one logical lease,
  original work, every protected body and exact recovery. Do not fall back silently after selection.
- [x] Verify restored editing and Contribution, cold selected-generation reopen,
  failure/retry/cancellation using the existing file/host tests. Update the existing
  isolation allowlist for the new generation module; no new PoC/test framework.
- [x] Run typecheck, root tests, ordinary/harness builds and independent final review.
  Correct the two test-only failures and rerun those cases; see exact evidence below.
- [ ] Record actual browser rendering, physical-device and offline acceptance at
  their approved grouped boundaries; do not replace them with recorded DOM tests.

### Evidence boundaries

- Final typecheck, ordinary build and harness build passed. Existing large-chunk/
  mixed-import warnings remain; no warning threshold or dependency was changed.
- Root run `npm test -- --reporter=dot --maxWorkers=2 --testTimeout=30000`:
  2,257 PASS, 21 existing TODO, 2 test failures (112 files, 742.76s). Product code
  did not change afterward. An obsolete pre-implementation refusal expectation
  was replaced with the current pending guard plus actual forged-destination
  rejection. A View-switch test now waits for durable reopening to finish (10s
  test ceiling), then asserts View and disabled editing/output controls. Both
  cases passed targeted reruns; independent review confirmed no weakened acceptance.
  Do not describe this as a second all-green full run; unchanged cases were not rerun.
- Four focused host/content/recorded-DOM cases passed: restored editing and two-way
  Contribution with cold reopen; failed rendering/cancellation and missing-Result
  recovery; reachable restore retry/fresh editor/single resident ownership; refusal
  of an in-flight content result after generation retirement.
- Existing imported-base Contribution regression plus entry isolation: 2 PASS.
  Replay budgets the actual observed receiver, not a fictitious source-head receipt.
  Raw database enumeration remains behind the existing browser-storage adapter.
- Independent read-only UI/core reviews are complete with no mandatory remainder:
  generic retry dead end, retired content/read handoff, resident ownership and
  prospective-base replay/first-import checks were corrected.
- Browser connection failed during the installed tool's bootstrap with
  `Importing module "node:process" is not allowed in node_repl`. No browser,
  iPhone, offline or performance PASS is claimed. Do not make tool repair a new
  product dependency or ask the PO to repeat internal checks individually.

## Remaining sequence and stop conditions

1. The independent-copy checkpoint is preserved. The connected file/edit/reopen
   flow, not an increased helper/test count, is the completed unit; normal entry
   and adoption remain incomplete. Address data-loss, save-misrepresentation
   and operation-blocking faults immediately.
2. The connected review → independent edit-copy unit is verified. The concrete Native
   conversion amendment is recorded and independently reviewed in 07 §11, awaiting
   one grouped PO decision; the earlier synthetic bridge GO does not authorize the
   new schema/recipe. While it is pending, close already-approved connections such
   as I04 above without substituting UI polish for migration. The next user flow is Native file
   → explicit conversion → new Project → edit/cold reopen. Source preservation and
   unplaced-record retention are already approved; do not re-ask those policies.
   Later Native input UI, frozen-v1/LociMyu conversion and other profiles remain
   required follow-on work, not claims of this first flow. Do not create another probe
   instead of connecting it or silently alter `lociview-automerge-atomic-map-1`.
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
At the start of Native decision preparation, cached origin was 0 behind / 77 ahead; no live fetch
was used for that observation. Previous environment denial is separate from PO permission:
do not retry a denied action unchanged or bypass it. Local implementation need not wait.
`main`, Pages, Service Worker, license/version and public release remain separately gated.

## Review record

2026-09-14: the connected restore path, not a new probe page, is the unit of work.
Focused tests reuse existing suites; the initial mixed selection hit 5s/30s test
timeouts, not acceptance of a performance bound. Long connected host tests have a
60s test-only deadline. Final root execution uses bounded workers and a 30s default
deadline without changing runtime budgets, test assertions or project configuration.
One full run was stopped when independent review found the prospective-base defect;
it is not completion evidence. No new dependencies/formats/schema policies,
ordinary activation, release changes or denied Push retries belong to this unit.

The previous plans, failures and executed checkpoint logs are preserved in
[history](../docs/history/development-through-2026-09-14/README.md). Update this
record in place; do not prepend another full implementation diary.
