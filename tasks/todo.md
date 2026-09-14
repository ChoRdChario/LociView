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

Feature development is paused at the PO's request. Current work is the bounded
test-flow improvement and unnecessary-complexity audit below. The PO reports one
overnight goal run consumed 90% of the allowance; estimates must respect that
observed constraint rather than assume unlimited daily agent time. No per-action
quota attribution has been measured. Real-file material resolution is verified
at `e6fc15b`; Native 07 §11 still requires its separate compatibility decision.

## Current unit — economical verification and complexity audit

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

- [Conflict-control assembly](../src/harness/projectScene/validationWorkspace.ts)
  and [metadata receive assembly](../src/harness/projectScene/metadataReceiveControls.ts)
  repeat registration/pending/disposal. Share that assembly when next touched, not
  whole hosts: the real-file route already reuses the saved/development workspace.
- [Review output](../src/projectPackage/reviewOutputJob.ts) and
  [clean output](../src/projectPackage/cleanOutputJob.ts) duplicate receipt-chain
  validation/append. A narrow pure helper may reduce maintenance; preserve purpose
  closures, byte formats and Workspace bases. No new general job framework.
- [Output controls](../src/harness/projectScene/validationOutputControls.ts) put
  save/send/copy in one five-purpose selector. During ordinary-entry connection,
  apply the existing 06 §11.4 intent split, with review/clean as secondary actions.
  These are existing functions to organize, not a request for five new features.
- Native loaders/rendering are not all rewritten; existing reuse is present.
  Original-byte recovery and external-save confirmation remain necessary. Manual
  output reselection is already optional. Proposed 07 §11 encoding/migration work
  is not an implemented redundancy; compatibility simplification needs PO decision.

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

## Next connected unit

Paused/uncommitted: Caption list controls/CSS, new `captionRowLayout.ts` and the
05 §13.2 list-scale note. Typecheck passed before the pause; the existing reveal
case still fails (250 vs expected 194). Pin-origin offscreen reveal is not yet
connected, and 10k/variable-height/keyboard coverage and final review are pending.
Preserve these changes and resume them only after the PO resumes feature work.

Make a long Scene Caption list usable: scroll/find a distant record → select or
reveal its pin → keep text/recovery details and keyboard access → continue editing.
Source inspection found that the existing list mounts every row; 03 §6 explicitly
requires virtualization for the 10,000-Caption UI. This is an implementation gap,
not a failed device measurement or a reason to raise the metadata limits.

- [ ] Window the existing list's DOM with measured variable row heights, keeping
  complete search/color/count/selection semantics, stable keyed rows and inner-list reveal.
- [ ] Preserve focus, keyboard reachability, IME, narrow/zoomed wrapping, scroll
  memory and visible recovery messages. Reuse the existing list/host tests, not a PoC.
- [ ] Finish focused and final serial checks plus independent review; record
  live browser/iPhone/scale-budget evidence separately, then checkpoint.

No dependency, schema/profile/budget, ordinary entry, new data or private fixture.
A future 10k recorded-DOM check proves a bounded mount and behavior only: it cannot
prove whole-Project cold open/edit latency, storage capacity or native layout.
The current validation metadata cap is 1,000 changes; the approved 50,000-change
workload and two-tab workload remain a separate implementation/adoption boundary.

## Following boundary — ordinary-entry adoption

Prioritize ordinary entry → real Project work and file exchange → exit/reopen,
not another small conflict-form expansion. Source recheck confirms `src/main.ts`
still opens only Native/v1, `entry.ts` and `validationBrowser.ts` are DEV-only and
the harness production build deliberately excludes this storage path. Removing
those guards is not adoption. This is a shared missing boundary across the already
connected user flows, separate from Native conversion 07's pending amendment.

- [ ] Reconcile only missing 05 §13.2 / G1-A/C, profile, browser/storage and
  physical-iOS acceptance against executed evidence, using existing gate records.
- [ ] Prepare one bounded candidate/ordinary-entry connection plan and grouped
  human procedure. Resolve the actual built-execution/adoption/SW/HTTPS authority
  differences before changing guarded entry behavior; identify exact build and one
  temporary HTTPS path if needed. Do not count a dev server as offline evidence.
- [ ] Execute approved browser/device acceptance and then ordinary-entry connection;
  keep failures/unsupported behavior explicit. Native, frozen-v1 and LociMyu
  conversion and other profiles remain full practical-team requirements, not waived.

The existing browser bootstrap denial is not retried unchanged. Do not turn this
into another browser-repair workstream or ask for every helper check. A concrete
new permission or product/profile decision is grouped and explained to the PO;
known approvals for isolated implementation are retained. No release/Pages/main,
unratified wire, new profile or ordinary activation follows from this plan alone.

## Pending decision — Native conversion implementation

The connected review edit-copy checkpoint is `9e49571`. The blocked user outcome is Native file → confirmed
conversion → independent Project → edit/cold reopen, with a retained common
baseline for later Native changes. The reviewed proposal closes its concrete
implementation decision; it is not an adoption claim or approval to implement it.

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

## Remaining sequence and stop conditions

1. The independent-copy checkpoint is preserved. The connected file/edit/reopen
   flow, not an increased helper/test count, is the completed unit; normal entry
   and adoption remain incomplete. Address data-loss, save-misrepresentation
   and operation-blocking faults immediately.
2. The concrete Native conversion amendment in 07 §11 awaits one grouped PO
   decision; the earlier synthetic bridge GO does not authorize the new schema/recipe.
   Real-model update/correction/return and independent copy are now verified in the
   limited route. The conversion flow after approval is Native file
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
At `e6fc15b`, cached origin was 0 behind / 86 ahead; no live fetch was used for that
observation. Previous environment denial is separate from PO permission:
do not retry a denied action unchanged or bypass it. Local implementation need not wait.
`main`, Pages, Service Worker, license/version and public release remain separately gated.
Completed checkpoint details remain unchanged in Git at `e6fc15b:tasks/todo.md`
(`git show e6fc15b:tasks/todo.md`). Read them only for a concrete evidence question;
[current inventory](implementation-inventory.md) remains the feature-coverage record.
