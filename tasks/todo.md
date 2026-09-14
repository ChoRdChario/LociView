# LociView active work

## Current boundary — whole practical-team workflow first

Updated 2026-09-14. This file owns current work, executed checks and next actions.
[Inventory](implementation-inventory.md) owns feature coverage; contracts are routed
by [docs/README.md](../docs/README.md). Git owns actual branch/commit identity.

Complete the practical team candidate: ordinary home → real Project/Scene/Caption/
media work → file handoff/update → continued local editing → named manual backup,
resume and recovery. Desktop, physical iPhone and offline acceptance must cover
the new route. Scope is 61 of the original 64 inventory groups: M13/M14 remain
later work; F09 (continued old-format updates after migration) was withdrawn by
the PO on 2026-09-14. This scope reduction is not completed implementation.
Neither component counts nor synthetic-host success is product completion or release approval.

Feature development is paused at the PO's request. Current work records the
PO-approved one-time migration cutover and removes continuing legacy-update work.
The PO reports one
overnight goal run consumed 90% of the allowance; estimates must respect that
observed constraint rather than assume unlimited daily agent time. No per-action
quota attribution has been measured. Real-file material resolution is verified
at `e6fc15b`. The old 07 §11 bridge-oriented compatibility request is superseded;
remaining initial-conversion gaps need a smaller implementation plan, not approval
of the superseded migration-control format.

## Current unit — one-time migration cutover (documentation only)

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

The [UI guidelines](../docs/ui-product-guidelines.md) own the detailed rules in
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

## Next migration planning boundary — initial conversion only

The PO withdrew continued old-format updates on 2026-09-14. The former 07 §11
map/wire/control-graph package is superseded, not awaiting approval. Do not revive
its legacy baseline/ancestor, portable managed-unit or parallel-introduction work.

When feature implementation resumes, plan Native/v1/LociMyu source → inspected
conversion → one new Project → edit/save/reopen → distribute the converted
Workspace and continue through normal new-format exchange. Initial unplaced
records, pin scale, effective order and material mapping still need faithful
target representation. Reuse existing services; specify and review only remaining
necessary schema/profile/recipe differences, rather than assuming the former
bridge-oriented upgrade is still required.

[Specification 07](../docs/specs/07-project-scene-migration.md) owns the reduced
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
[current inventory](implementation-inventory.md) remains the feature-coverage record.
