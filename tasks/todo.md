# LociView active work

## Current boundary — implementation through UI verification (2026-09-09)

### Completed correction — simultaneous journal readback after recovery (2026-09-09)

PO supplied corrected-page output and the saved log after the same-run recheck.
At executable `96c218b`, three no-op/zero-publication operations have successful
local readback and other-tab notification, followed by two page reload readbacks;
READY retains the expected updated title/body/revision. No new FAIL occurs in the
supplied corrected interval (`16:43:11.803Z`–`16:44:05.468Z`, 2026-09-08 UTC).
The bounded human Chrome recheck is PASS. Original initialization/recovery evidence
is reused and the two old FAIL rows remain; no fresh-from-empty rerun, agent
browser execution, full storage/adoption, iOS or offline/PWA PASS is implied.
The manual hold is closed; no additional operation or reset is requested.

PO's Chrome batch at the unchanged journal build passed initialization, deliberate
prefix stop and old-state reload. Recovery reported exact original bytes/heads and
one publication; immediate observation failed. Manual observation and the other
tab's notification later saw the new state. Repeated recovery reported no-op/zero
publication but immediate observation failed again. This is a concrete failed
platform run, not a full PASS or evidence of confirmed payload loss. Preserve
the existing run, its logs and original source/changes; do not reset browser data.

Target: the existing disposable CAS/journal readback path only (02 §§7–8).
Hypothesis confirmed independently in code: broadcast and local observation
compete for the same fail-fast exclusive CAS lock; the rejected read is caught
as `repairRequired`. No new architecture, schema or product-policy decision.

- [x] Reproduce simultaneous verified-receipt reads deterministically with the
  actual CAS/OPFS locking method; label Node lock/files evidence as non-browser.
- [x] Queue read-only verified-presence checks under the same CAS lock, keeping
  mutation fail-fast behavior and actual missing/corrupt-data refusal. Preserve
  original observation failure details instead of declaring every error missing.
- [x] Run focused regression, isolated typecheck/build and required root checks;
  obtain one targeted independent read-only correction review.
- [x] Refresh the same preview and provide a short same-run recovery/reload
  sequence in chat; record the PO's successful corrected Chrome result above.

Exit: concurrent readers succeed without duplicate publication or payload reads;
mutation contention still refuses and missing/corrupt bytes still fail closed.
No bootstrap retry, new page, 500 MiB rerun, dependency, production hookup,
application-data write, cleanup, device/PWA or adoption claim.

Evidence: two concurrent-read cases reproduced the false repair before the fix;
all five new cases pass afterward. Isolated journal/Repo/purposes 55/55 and
CAS/retention 30 selected cases PASS; existing 500 MiB case intentionally omitted.
Both isolated typechecks/build and targeted independent review pass. Corrected
HTML/JS/WASM return HTTP 200 and match local build hashes, recorded in the existing
probe README. Actual corrected Chrome confirmation was subsequently supplied
by the PO as recorded above; it was not inferred from those checks.
Root typecheck, full 93 files / 1,770 PASS / 21 existing todo (two workers) and
build pass; existing mixed-import/large-chunk warnings remain. Source changes
are limited to the existing isolated probes; current application code and
dependencies are unchanged. Whitespace checks pass, with no blocking review
finding. The same-run Chrome confirmation closes this correction without another
probe or test rerun. Existing approved implementation may continue; front-loading
an integrated app beyond 05 §13.3 remains a proposal, not authority from test PASS.

### Completed checkpoint — completion-path correction and existing platform journal (2026-09-09)

PO requested a macro progress check before continuing. Audit checkpoint:
`d8f52d1f9dbb7fdac00af1989eef012fc2252aaa`, clean `g0-baseline`, 0 behind / 21
ahead of the local origin tracking ref; no fetch or fresh remote claim. The ten
latest executable commits build disconnected Scene/domain/UI parts. They are
useful reusable work, but none closes a new integrated `TEAM-FLOW-01` step.
The full provider, durable host and team exchange remain unimplemented. The
previous automatic next choice of another individual record guard is superseded.

- [x] Compare actual entry/import boundaries and recent changes with 05 §12.6 /
  §§13.2–13.3; independently review domain/UI and storage evidence read-only.
- [x] Reprioritize the already prepared OPFS + IndexedDB journal execution over
  further disconnected UI/individual-validator expansion. Keep completed 5184
  history checks and 5185 readback closed; no new page or 500 MiB rerun.
- [x] Build the existing `poc/scene-history/journal.html` from this exact source;
  verify the served HTML and referenced JS/WASM against local build bytes, and
  put the one existing batched procedure in a ready-to-run state.
- [x] Record real-browser interruption, same-run reload, second-tab recovery,
  first-tab notification and repeated no-op results, or one concrete failure.
  HTTP/build readiness is not execution evidence. Agent control currently fails
  before navigation; do not infer PASS or repeat bootstrap/repair attempts.

**Purpose / acceptance:** close the missing real-backend publication-boundary
evidence for 02 §8 and 05 `TEAM-PKG-05`, using the existing tiny synthetic run.
Completion is the exact observed old/new-head and original-byte outcomes, not
G1-A/C adoption, process-kill, device, PWA or actual application PASS. Human
Chrome execution, if needed, is one batch with all expected labels and recovery
instructions, not a return to button-by-button development pauses.

**Next decision:** after that result, select a named remaining G1-A/C row using
the completion map in `critical-path.md` §8. Finish full resource/reference/
conflict admission as a provider deliverable, not an unbounded series of record
or UI components. Browser unavailability does not waive its gate or block all
approved coding, but a substitute coding slice must close a named missing
requirement rather than merely be available. Wire/migration ratification and
storage adoption remain explicit PO boundaries; do not restore unrelated old G0
or writable-v1 gates. No dependency, current-app activation, real data, new
format, renderer, release or deployment changes in this audit/preparation.

**Review:** two bounded independent read-only checks agreed that sequencing had
drifted toward horizontal prebuilding. Existing final executable evidence remains
93 files / 1,770 PASS / 21 existing todo, typecheck and build at `d8f52d1`;
it is regression/component evidence only. Documentation changes do not trigger a
repeat full suite. Browser skill check found no retained connection; one selected
in-app bootstrap failed with a denied `node:process` import before page access.
No browser execution or product failure is inferred; no security setting changed.

Preparation result: existing isolated build PASS; one loopback preview is running
on 5186. HTML and its JS/WASM all return HTTP 200 with bytes/digests equal to the
local build. Exact executable/lock/build identity and the one human batch are in
`poc/scene-history/README.md` under the 2026-09-09 readiness record. No application
source, dependency or earlier probe changed. Real platform results remain pending;
the server is temporary and is not an offline/PWA, adoption or release candidate.
Targeted independent confirmation found no blocking documentation/procedure issue;
the batch matches the existing page implementation. Diff/whitespace checks pass.
Only these task records and the existing probe README changed; no root test rerun.

### Completed — individual MaterialOverride record admission (2026-09-09)

Starting `a313c49`: clean, 20 ahead of local origin tracking ref; no fetch/push.
Continue the accepted next component immediately under 05 §13.3; no human
decision is needed for the fixed 01 §4.2 / 02 §3.1 / 05 §3.3 record rules.

- [x] Reuse the existing nominal-ID/lifecycle rules through a small shared pure
  record-field helper; preserve Scene-record behavior and existing test evidence.
- [x] Admit one canonical decoded MaterialOverride: exact `ovr` identity/map key,
  atomic Project/Scene routing and complete nominal target tuple, lifecycle and
  existing whole appearance/compositing validation. Reject irrelevant known scope
  fields rather than silently moving the setting to another scope.
- [x] Retain and report unknown fields at every record/atomic level, without
  inferring history-free export permission; add only missing malformed/extension
  cases and verify existing Scene/source-isolation contracts.
- [x] Obtain one independent read-only review and run typecheck, full two-worker
  tests and build before checkpointing the bounded result.

Completion is individual record admission only. Reference existence/active catalog
ownership, same-key duplicates across records, source/backend applicability, causal
conflicts, blob closure, writes, schema/dependency and current-app integration stay
excluded. No new page/server, human probe or aggregate technology/device PASS.

Review / evidence: typecheck, 41 focused tests, final 93 files / 1,770 PASS with
21 existing todo (two workers), build and whitespace checks pass. Independent
read-only review found no blocking issue and confirmed the five new cases against
the bounded acceptance. Shared Scene lifecycle reasons, required fields and issue
paths remain unchanged. Existing mixed-import/large-chunk build warnings persist.

Short meta-audit / next accepted work: this closes only individual material record
shape, not the complete validated provider required by the Scene/UI ports. Current
entry/runtime/storage/package/dependencies and servers are unchanged; only normal
ignored build output was regenerated. Continue the missing pure resource admission
with Caption/anchor record shapes under 01 §4.1, 02 §3.1 and 05 §3.3: exact nominal
IDs, title/body/color/lifecycle and complete AssetAnchor/ProjectAnchor fields,
preserved raw CR/LF and unknown data, with no inferred owner or source relation.
Reuse the canonical/lifecycle/text guard and existing pin/Scene tests; distinguish
individual shape from later active-frame/reference/history checks. Do not reopen
browser bootstrap, completed manual probes or the package-wire adoption decision.
Current app, real payloads/storage/renderer, new schema/dependencies and release
remain excluded. No PO check is needed for the accepted pure component; a real
contract conflict or gate-crossing still requires the explicit stop.

### Completed — material target, scope and retained appearance editor (2026-09-09)

Starting `dd6f053`: clean, 19 ahead of local origin tracking ref; no fetch/push.
Continue approved 05 §13.3, 05 §§3.3/3.4/11, 01 §4.2, 02 §3 conflict/unknown
preservation and UI guidelines §§4.2/8–10. The PO permits moving directly to the
next accepted task when no human decision/evidence is required.

- [x] Add storage-neutral guards for complete material appearance/compositing
  values and explicit edits, preserving unknown siblings and untouched exact RGB.
  Reuse canonical decoded-value guards; no raw payload or full Project admission.
- [x] Add exact model/surface and Scene/Project scope selection, observed precedence
  and applicable opacity/lighting/sidedness/chroma controls. No default target,
  name/key inference, nested cross-scope merge or write caused by selection.
- [x] Retain raw draft/IME through failure/access loss, bind apply/retry to original
  target and snapshot, confirm cancellation/override removal, and show the effect
  of falling back to Project/source or remaining under a Scene override.
- [x] Reuse Scene precedence/source-isolation evidence, add only missing intent/
  atomic-edit/retention tests, obtain independent read-only review, and run
  typecheck, full two-worker tests and build before the checkpoint.

Completion is reusable pure admission + synthetic-port controls, not renderer
material support, durable save or application integration. Advanced compositing
authoring, guessed catalog compatibility, current Native changes, storage/package,
payloads, schema/dependency/release and new page/server are excluded. The host
must supply validated exact targets/complete conflicts and candidate applicability;
missing support remains explicit, never a fallback saved as intent. Stop for a
contract conflict/new authority only; retain batched browser/device/platform gates.

Review / evidence: typecheck, 29 focused tests, final 92 files / 1,765 PASS with
21 existing todo (two workers), build and whitespace checks pass. Independent
review's empty/error applicability denial and selector/target desynchronization
findings are corrected with regression coverage and confirmed. Retained failed-
target review is explicitly admitted; an earlier claim that this was already
blocked in the final code was withdrawn. Native browser/IME/material rendering,
storage and device acceptance remain open. No current app/runtime is connected.

Short meta-audit / continue without PO pause: the four task areas now have bounded
reusable components, not a finished team product or complete UI. Rather than add
another probe, close the adjacent missing individual MaterialOverride admission:
exact ID/map key, atomic Scene/Project routing, nominal target tuple, lifecycle,
existing appearance/compositing checks and unknown-field retention/reporting under
01 §4.2, 02 §3.1 and 05 §3.3. Reuse the existing lifecycle rules and canonical
cloner, avoiding a competing validator policy. Completion is one decoded record
guard, not graph/catalog/source/backend/history validation or adoption. Existing
Scene-record tests plus focused malformed-record/unknown cases suffice before
normal verification/review. No payload, storage, app entry, dependency, schema,
new server or release authority is added. Continue within 05 §13.3; stop only for
a contract conflict or required external authority/evidence.

### Completed — Project model inventory and Scene membership controls (2026-09-08)

Starting `f1d02e1`: clean, 18 ahead of local origin tracking ref; no fetch/push.
Continue approved 05 §13.3 with 05 §§3.2/4.3/5/11, UI guidelines §§4.2/8–10
and existing Scene include/exclude, Caption-list and pin-target contracts.

- [x] Add a complete Project-model inventory with local search, Scene filter,
  exact selection and retained list position/IME. Unknown name/lifecycle remains
  reviewable; duplicate IDs or unavailable inventory never imply an empty Project.
- [x] Add direct `このシーンに表示` controls with observed membership, not
  optimistic rendering state. Include/exclude emits only exact Scene/Asset/edge
  intent; binding failure or temporary hiding never implies absent membership.
- [x] Preserve Caption/model input and selection, show exclusion consequences
  and Project-wide placement/replacement scope, and retain target-bound failures/
  retry. Membership conflict/foreign edge fails without a guessed winner; an
  independent binding/order issue does not prohibit valid exact-edge exclusion.
- [x] Reuse the Scene/core membership and hidden-owner proofs, add only missing
  pure/DOM/source-isolation tests, obtain one independent read-only review and
  run typecheck, full two-worker tests and build on the final executable tree.

Completion is reusable synthetic-port UI plus host intentions, not model loading,
full resource validation or a second renderer visibility authority. Actual model
import/bytes, placement/gizmo, revision activation, Project deletion, local isolate
implementation, renderer/storage/package/current app hookup, schema/dependency,
new page/server and release are excluded. Keep the existing browser/device gates
open without another bootstrap or human probe. Stop for a specification conflict
or new authority, not another micro-approval of this accepted component.

Review / executed evidence: typecheck, 49 focused tests, final 90 files / 1,748
PASS with 21 existing todo (two workers), build and diff whitespace check PASS.
Existing mixed-import/large-chunk build warnings remain. Independent read-only
review found no blocking issue; self-review's explicit `outsideScene` display
state (normal omission is not a loading failure) was also independently confirmed.
Checkboxes restore observed state before emitting intent, failures/retry retain
the original target/plan, and list filtering never writes membership. Complete
inventory and renderer availability stay distinct; exact edge removal preserves
other Scene and Caption state through the reused domain proofs. Native checkbox,
IME, visual layout, actual storage/renderer and physical-iPhone remain unverified.

Short meta-audit / next implementation: this closes the reusable Project inventory
and Scene-membership surface, not all model-management features or TEAM-FLOW-01.
Only disconnected UI, its focused tests and documentation changed; current entry,
storage/package/renderer/dependencies and servers are untouched. Normal ignored
build output was regenerated. Continue 05 §13.3 with the `マテリアル` tab's exact
model/surface target and explicit Scene/Project scope under 05 §§3.3/11 and UI
guidelines §4.2. It must expose observed precedence, applicable controls, retained
draft/apply/cancel and target-bound failure, without guessing a surface, merging
whole-record overrides or writing during selection. Reuse current pure material
presentation/validation semantics where safe; add only missing intent/refusal and
input-retention checks. Completion is a reusable synthetic-port control, not actual
material rendering or storage. Payloads, current-app hookup, renderer/storage,
schema/dependency/release and new probe/server remain excluded. Full validation,
platform/package adoption and batched Desktop/iPhone gates stay open; no repeat
human probe or new micro-approval is needed for this accepted component.

### Completed — named-view authoring and 3D background controls (2026-09-08)

Starting `81fb17d`: clean, 17 ahead of the local origin tracking ref; no fetch/push.
Continue the approved next component under 05 §13.3, 05 §§3.3–3.4/11 and UI
guidelines §§4.2/8–10. Reuse Native 02 §§18/32.3 presentation semantics and pure
HEX helpers, but not its create-default/delete-clear policy or storage controller.

- [x] Add explicit new-view capture/name/apply and selected-view sparse rename /
  camera+background recapture. Retain the exact captured host snapshot and name/IME
  draft; no current/default-view change, auto-selection or HEX round-trip of captures.
- [x] Add dependency-aware confirmed deletion and keyboard-friendly earlier/later
  intentions. Bind to exact Scene/frame/selection/source; never auto-clear entry,
  resolve conflicts, renumber an entire collection or erase another editor's input.
- [x] Add current 3D solid-background HEX/picker/standard-color/apply/cancel controls
  with independent failure state and stale-draft refusal. Background is session
  state, persists only through explicit Saved View capture/update, and never edits
  the interface palette. Unavailable/unsupported observed background stays explicit.
- [x] Test only missing pure/DOM intent and input-retention contracts, reuse existing
  view/background tests, obtain one independent read-only review and typecheck /
  full two-worker test suite / build on the final executable tree.

Completion is reusable source components and an explicit host contract, not a new
probe or full v2 validator. Real capture/render/write/undo, deletion/reference
admission, storage/package hookup, current app activation, transparent-background
authoring, schema/dependency and release changes are excluded. Host capture and
dependency tokens represent fully validated immutable synthetic read ports, never
approval of raw bytes. Browser/IME/device gates stay open; do not repeat broken
bootstrap or prior human probes. Stop for a contract conflict or new authority,
not another approval of already accepted implementation details.

Verification adjustment: the first full run exposed one stale source-isolation
allowlist assertion in `sceneCore.test.ts`; UI behavior tests passed. Its explicit
allowed imports predated the 05 §13.3-authorized pure helper reuse in this slice.
Added only `domain/values` and `nativeGs/backgroundColor`, with a separate assertion
that the background helper has no runtime imports/re-exports. Do not allow the
Native namespace generally, connect an entry or relocate current production code.
This exact adjustment was independently confirmed and passed with the focused
suite and final full verification.

Slice review: root typecheck, 58 focused tests (including 12 new authoring/
background cases), final 89 files / 1,736 PASS with 21 existing todo (two workers),
and build PASS. Existing mixed-import/large-chunk warnings remain. Independent
review found one P2: background plan revalidation cleared another camera action's
applying state. It now ignores only its own feedback; an in-progress recall blocks
publication, with regression coverage. That fix and the new-draft null review
target were independently confirmed. Name-only changes omit camera/background;
capture preserves exact host identity/atomic baselines, current/default view stays
unchanged, entry-referenced deletion refuses, and HEX never reconstructs an
untouched captured background. IME/visual/device/storage effects remain unverified.

Short meta-audit / next implementation: this closes the reusable View authoring
and solid-background surface, not application integration or TEAM-FLOW-01.
Current entry/runtime/storage/package/dependencies and servers are unchanged;
normal ignored build artifacts alone were regenerated. Next is the `モデル` tab's
Project inventory and current-Scene membership surface under 05 §§3.2/4.3/11:
all Project models remain discoverable, selection is local, and `このシーンに表示`
uses exact include/exclude membership intentions rather than Project deletion or
hidden per-kind visibility. Preserve selection/pending input and expose unknown
membership, unavailable binding and Project-wide placement/replacement scope.
Reuse existing Scene include/exclude and pin-target contracts; add only missing
list/intent/refusal DOM tests. Real model import/bytes, placement/gizmo, revision
activation, renderer/storage, schema/dependency and release remain excluded.
Do not infer relations, unblock an unknown source or expand beyond 05 §13.3.
No new PO micro-approval/human probe is needed; the integrated Desktop/iPhone,
full resource/reference validation and platform/package gates remain open.

### Completed — viewing aids and Scene entry-view controls (2026-09-08)

Starting `620d596`: clean; 16 commits ahead of the local origin tracking ref,
no fetch/push. Continue approved 05 §13.3 with 05 §§3.3/4.1/11, UI guidelines
§§4.2/9–10 and the bounded Native camera semantics in 02 §18. Native's first-view
selection fallback is NOT inherited; the future Scene contract forbids guessing.

- [x] Add fit, six explicit Project-axis directions and perspective/orthographic
  controls; consume observed runtime state, never optimistically show success.
- [x] Add exact current-Scene Saved View selection/recall and a separate entry-
  view choice/apply/cancel surface. Recall applies camera+background only;
  setting/clearing entry changes only that Scene's pointer, never the current camera.
- [x] Preserve entry drafts, external Caption/mode input and independent failure
  lanes; expose unavailable/foreign/conflicted view/default states without selecting
  a winner, first item or another Scene. Bind effects to current runtime/source/draft.
- [x] Reuse Scene/core view contracts, add only missing pure/DOM tests, obtain one
  read-only review and run root typecheck/full test/build.

Completion is reusable controls and host intentions. No camera math, real runtime
or Project connection, view capture/update/delete/reorder, background authoring,
storage/package/renderer/dependency change, new page/server or release. Named-view
authoring and background controls remain a subsequent bounded UI component, not
silently removed. Missing browser/device evidence stays open; do not retry the
broken browser bootstrap or repeat prior human probes. Stop for a specification
conflict/new authority, not another approval of this already accepted component.

Slice review: typecheck and 49 focused tests PASS, including 11 new viewing-aid
cases. Final executable tree: root typecheck, full two-worker suite (88 files /
1,724 PASS, 21 existing todo) and build PASS. Existing mixed-import/large-chunk
build warnings remain. Independent read-only review's two P2s are fixed and
confirmed: stale Scene/frame runtime never leaves selected axis/projection, and
refused actions expose their reason in the relevant lane/near-stage shortcut.
Final pending-Scene-transition message fix was also independently confirmed.
Null entry baselines never rebase; failed input remains and only exact matching
working-state acknowledgement clears a draft. None of this is a durable-save,
real camera, browser, offline or device result.

Short meta-audit / next implementation: this closes reusable view recovery,
recall and entry-pointer controls, not the whole View tab or integrated UI.
Production entry, storage/package/renderer/dependencies and servers are unchanged;
only normal ignored build output was regenerated. Continue 05 §13.3 with the
remaining named-view authoring and 3D-background UI: explicit current-Scene target,
validated observed capture, retained name/background drafts, sparse update,
dependency-aware explicit delete and stable-order intentions. Reuse existing
Native view/background tests and Scene/core guards; add only missing pure/DOM
contracts. Complete the reusable authoring surface without guessing conflicts,
changing current view on selection, erasing other editors or claiming actual
capture/write/undo. Keep real payload/runtime/storage connection, new pages,
schema/dependencies and release excluded; resolve a spec conflict with the PO,
not by inventing a policy. Integrated Desktop/iPhone and platform gates stay open;
no new human verification or repeated earlier probe is required now.

### Completed — Caption inclusion and pin-mode controls (2026-09-08)

Starting `7da124e`: clean; 15 commits ahead of the local origin tracking ref,
no fetch/push. Continue the PO-approved next component under 05 §13.3. Reuse
05 §§3.2/4.3/11, 01 §4.1, UI guidelines §§5/9–10 and existing Scene/Native tests.

- [x] Add a progressively disclosed existing-Project Caption picker, exact
  membership-only intent, search/selection retention and unavailable/conflict
  recovery. Never copy a Caption or automatically show its hidden owner model.
- [x] Keep add/move controls adjacent, require explicit new-placement model,
  preserve the existing move target, and expose a separate near-stage mode strip
  with confirm/cancel. Target eligibility and position proposals are synthetic
  validated host inputs; this component performs no picking/anchor construction.
- [x] Bind effects to exact source/session/proposal state; retain failed input,
  block stale confirmation and keep confirmed cancellation available on source
  loss. Disclose shared-Scene impact before moving a shared Caption.
- [x] Verify missing pure/DOM contracts and reuse Scene tests; obtain one
  independent read-only review and run typecheck/full test/build.

Completion is reusable intent/control modules, not active application features.
No model inference, conflict resolution, ProjectAnchor creation, re-anchoring,
media/renderer/storage/package hookup, new page/server/dependency or release.
Browser/IME/real gizmo/iPhone evidence remains pending under the existing batch
lane; do not repeat broken bootstrap or completed manual probes. Stop for a
specification conflict or new authority, not another micro-approval.

Slice review: typecheck and 60 focused tests PASS, including six inclusion and
eight pin-mode cases. Full two-worker suite: 87 files / 1,713 PASS, 21 existing
todo; build PASS with existing mixed-import/large-chunk warnings. Independent
read-only review's P2 is fixed and confirmed: `追加先モデル` applies only to new
placement, while move names the selected Caption/exact owner before entry.
Cancellation binds both mode and proposal; a changed proposal invalidates an
open confirmation. `otherPending` excludes this mode so its own navigation guard
cannot deadlock completion. DOM/CSS contracts are not rendered/device evidence.

Short meta-audit / next implementation: this closes reusable inclusion and
pin-mode controls, not actual placement, full Caption editing or team operation.
No current entry, storage, package, renderer, dependency or server changed.
Next is the `視点` task's reusable viewing aids under 05 §11 and UI guidelines
§4.2: fit, six directions, projection and Scene-owned Saved View recall versus
entry-view selection. Emit explicit host intentions; reuse existing view/core
contracts, keep camera math/renderer/storage outside this disconnected slice,
and retain unfinished Caption/mode state. Full resource/reference admission,
wire/platform adoption and integrated Desktop/iPhone acceptance remain open;
do not repeat prior manual probes or claim whole-UI completion.

### Completed — disconnected Caption detail and comparison state (2026-09-08)

Starting `8d6fe24`: clean. The PO asked to continue the documented next component
under approved 05 §13.3. Reuse 02 §§3.1–3.2/7 conflict-field policy, 05 §§3.3/4.3/11,
UI guidelines §§5/9–10 and Native session/window evidence. No storage adoption.

- [x] Add selected-Caption title/body/color draft and detail controls with sparse
  apply intents, field-specific conflict blocking and affected-Scene disclosure.
- [x] Keep raw draft/IME on refresh, stale apply and failure; require exact host
  acceptance or explicitly confirmed cancel before clearing it. No save claim.
- [x] Add Scene-scoped retained/follower window state, explicit close/reopen,
  front/placement/size/arrangement intentions independent of editing selection.
- [x] Verify focused pure/DOM contracts and source isolation, obtain one read-only
  review, then run root typecheck/test/build on final executable changes.

Production scope is disconnected reusable modules and local text guards only.
Known edits never rebuild a whole Caption DTO; host commands preserve unknown
fields and validate causal/lifecycle/reference policy. No conflict winner,
automatic rebase/owner mapping, media payload/file I/O, renderer/window layer,
package/storage hookup, new page, dependency or single-window fallback. Existing
window STATE ideas may be reused; their Native storage/render controller must
not be imported. Temporary unavailable/filter states suppress projection without
deleting retained intent. Real editor/viewport/IME/iPhone acceptance stays open.
Stop for a contract conflict or scope expansion, not repeated human micro-checks.

Slice review: root typecheck PASS; 46 focused tests PASS, including 12 detail
and five window-state tests. Full two-worker suite: 85 files / 1,699 PASS,
21 existing todo; build PASS with the existing mixed-import/large-chunk warnings.
Independent read-only review's P2 is fixed and confirmed: textarea LF projection
preserves unchanged source CR/CRLF tokens. Ambiguous newline edits retain input
and block apply until explicit recovery. Simulated LF-only values also verify
no redundant assignment after input; actual caret/IME event ordering is pending.
Failures/stale replies cannot clear a newer draft or acknowledge a durable save.
Multiple retained windows, explicit dismissal, order and placement are STATE only,
not implemented floating DOM, connectors or renderer integration.

Short meta-audit / next implementation: these modules close the selected-detail
draft and comparison-memory boundary without current app/storage/package changes.
Continue the Caption task with reusable existing-Project Caption inclusion and
explicit add/move mode controls under 05 §§4.3/11/13.3 and UI guidelines §5.
Emit synthetic host intentions only; preserve exact target, pending input and
finish/cancel recovery. Reuse Scene command tests; add only missing UI contracts.
No model picking, re-anchoring, media I/O, floating renderer, storage integration,
new probe or repeated human checks. Full resource/reference admission, gated
storage/wire adoption and integrated Desktop/iPhone acceptance remain open.

### Completed — disconnected Caption list and pin-color controls (2026-09-08)

Starting `4ba71cb`: clean, approved 05 §13.3 scheduling exception remains active.
The PO asked to continue the documented next component; no additional approval
is needed. Reuse 05 §§3.2/11, UI guidelines §§4–5/8–11 and existing Native
Caption-list/pin-color tests; do not redefine the current list/pin distinction.

- [x] Implement a reusable current-Scene Caption list with search, exact owner
  filtering, explicit model-independent/unknown-owner buckets and selection.
- [x] Place direct pin-color controls immediately above the list. Preserve
  all/null versus explicit/empty color selection, without filtering list rows.
- [x] Retain selection, search/IME and list-scroll memory; emit local plans only.
  Keep unavailable/uncertain rows and recovery intents reachable without guessing.
- [x] Verify pure transitions/DOM contracts and isolation, run root checks and
  obtain one read-only review. Keep real browser/IME/layout/iPhone evidence open.

Scope is reusable production-source UI under synthetic read ports, not another
probe page. Source/membership/owner identity, conflict resolution, content edits,
model visibility, renderer pin filtering and saves remain host responsibilities;
the component cannot acknowledge or perform them. No current-entry hookup,
storage/package/dependency change, new media support or automatic relation/winner.
Completion is one retained list/control boundary with exact tests. Stop for a
contract conflict or required new product policy; do not repeat previous device
or storage probes or ask the PO to test a disconnected component.

Slice review: root typecheck PASS; 50 focused tests PASS, including 11 new
Caption-list cases and reused navigation/Scene/Native filter contracts. Final
`npm test -- --maxWorkers=2` and subsequent build PASS; existing mixed-import
and large-chunk warnings remain. Independent read-only review's combined-state
P2 is fixed and confirmed: pin-position review and color-hidden feedback appear
independently. Synthetic DOM evidence covers 100 ordered rows, keyed focus,
composition guards, explicit recovery and desired-scroll retention after a
simulated clamp, not real layout, native IME or platform acceptance.

Short meta-audit / next implementation: navigation plus a retained Caption list
now close two reusable UI boundaries, with no existing entry/dependency/storage
changes. Next is selected-Caption detail and retained comparison-window state,
using the same explicit synthetic ports. Preserve existing multiple-window intent,
field drafts, conflict/unsaved distinctions and media-neutral terminology; do not
add media I/O or connect renderer/storage. Reuse accepted UI guidelines and Native
session/window evidence; only genuinely missing component state/DOM contracts
need new tests. Full Project/resource/reference admission, storage/platform gates,
package-wire ratification and integrated Desktop/iPhone acceptance remain open.
No new Product Owner action is needed to continue this authorized component work.

### Completed — disconnected Scene/task navigation component (2026-09-08)

Starting `5b95c52` is clean; individual record admission is implemented/reviewed,
not full Project validation. Continue within approved 05 §13.3, reusing 05 §11
and UI guidelines §§4–5/9. No new product decision is needed for this component.

- [x] Implement reusable Scene selector, four-task controls and truthful save/
  pending-state presentation, with pure local navigation intentions.
- [x] Test explicit Scene selection, no winner/default guesses, guarded Scene
  changes, preserved tab/draft/selection memory, and no synthetic save authority.
- [x] Run focused checks, final regression/build and independent read-only
  review; retain actual browser/visual/iPhone acceptance as pending.

The host supplies a synthetic conflict-aware Scene read projection and owns
local UI state. The component emits a token-bound intent, not a metadata command,
save acknowledgement, camera mutation or file action. Scene/header and task-tab
elements are separate layout slots so the Scene context stays outside the tabs.
Tab changes do not end modes or erase drafts; modal/gizmo input blocks only Scene
changes that would discard it. No new page/server, current-entry hookup, renderer,
storage, dependency or unsupported media control. No browser-control retry without
changed evidence. Completion is reusable component logic, not rendered acceptance.

Slice review: typecheck and 25 focused tests PASS; final root
`npm test -- --maxWorkers=2` PASS (82 files, 1,671 tests, 21 existing todo),
followed by build PASS with existing mixed-import/chunk warnings. Independent
review's P2 is fixed and confirmed: a missing/deleted current Scene now has an
explicit placeholder and recovery reason even when another Scene is available;
unresolved availability remains visible. No alternative is selected or committed
automatically. Async hosts must recheck token, session identity and pending input
before applying a plan. Save failures cannot be acknowledged by this component.

Short meta-audit / next implementation: this closes reusable navigation logic,
not full domain/storage or real UI acceptance. Continue within 05 §13.3 with the
retained Caption list, selection and directly visible color-filter controls,
reusing the accepted UI guidelines and current Native behavior/tests as evidence.
Use synthetic read ports; preserve draft/list/filter state and expose unresolved
values instead of choosing winners. The missing acceptance is the reusable
component's logic/DOM contract, followed later by real host/renderer/browser
integration. No new test page, platform probe, dependency or policy is needed.
Full record/resource/reference admission, storage/platform gates, proposed
package-wire ratification and integrated Desktop/iPhone acceptance remain open.
No new PO action or repeat of completed manual checks is required for this next
disconnected component; stop only for a contract conflict or expanded scope.

### In progress — approved disconnected validators/UI implementation (2026-09-08)

The PO answered `良いです` to advancing data validators and reusable UI components
without real-data/storage connection. Specification 05 §13.3 records the scope;
the preceding scheduling approval hold is resolved, not a package/gate approval.
Starting `7c37552`: clean, eleven ahead of last fetched origin, usage 40 percent
remaining. Do not ask again for this implementation-order choice.

First reusable boundary: domain-record admission in `src/domain`, applying 02
§3.1–3.2 and 05 §3 to safe canonical decoded values, IDs, lifecycle, Scene and
membership shapes. This closes real record-shape validation, not whole-Project
reference/causal/conflict/blob validation or a package parser. Future UI and
metadata adapters reuse these modules rather than duplicating PoC guards.

- [x] Record approved scheduling exception and synchronize normative navigation.
- [x] Implement pure bounded decoded-value/record validation with typed issues,
  immutable output and retained unknown minor data; document exact coverage.
- [x] Run focused malformed/valid/preservation tests and unchanged-path boundary
  checks, then root typecheck/tests/build on the final tree.
- [x] Obtain one independent read-only review, correct relevant findings and
  checkpoint; continue to reusable UI state/components within §13.3.

Inputs are bounded decoded JSON/controlled synthetic records, not raw package or
Automerge bytes. Practical input limits are explicit caller parameters capped by
accepted semantic ceilings, not invented device guarantees. No data I/O,
dependency, wire/schema change, application activation, UI polish or device claim.
Stop for a contract conflict or required new policy, not every implementation
detail. Full domain admission and actual rendered UI remain separate incomplete
requirements; component success cannot waive them.

First-boundary review: `src/domain` admits the three exact individual record
shapes, not whole Project state; it preserves unknown data without invoking
getters and bounds cloning. Scene commands reuse its local-name normalization,
including C1/line-separator rejection, while persisted input rejects non-NFC
without alteration. Review removed an unsupported persisted-label nonblank
restriction and duplicate approval paragraphs; focused corrections confirmed.
Typecheck PASS; focused 19/19 PASS; full `npm test -- --maxWorkers=2` PASS with
81 files, 1,665 tests and 21 existing todo; build PASS with existing import/chunk
warnings. The two-worker setting reuses the proven runner configuration after
earlier default-parallel timeouts; no assertion, timeout or dependency changed.
No rendering/storage input or current entry path changed. This is reusable
production-source work under the scheduling exception, not adapter/full domain
adoption. The navigation boundary is now completed above; actual visual/platform
acceptance remains pending.

### Completed draft — proposed five-purpose package-wire companion (2026-09-08)

Checkpoint `459d7bd` is clean, ten ahead and zero behind the last fetched origin;
usage remaining is 41 percent. The unavailable initial OPFS log is already
recorded as unknown, with saved-payload readback separately PASS. Do not reopen
that inquiry or repeat the manual stress run.

At this draft checkpoint the scheduling exception had not received PO approval.
The later explicit approval is recorded above and in specification 05 §13.3;
automatic continuation and the earlier OPFS evidence reply did not approve it.

Specification 05 §7.5 already authorizes a bounded package-wire design. This
slice supplies the missing S2 companion draft, not a ratified format or writer.

- [x] Draft the five-purpose manifest, exact causal delta/base records, one-Scene
  snapshot, privacy/stream/recovery boundaries and remaining ratification inputs.
- [x] Obtain one independent read-only contract review and correct draft findings.
- [x] Check links/diff and record the proposal status without application retests.

Production scope is zero. Reuse accepted domain/stream/journal rules and the
bounded semantic proof; do not promote the synthetic graph to a wire schema.
Do not choose unapproved device budgets, add package code/fixtures/dependencies,
change current Native/v1 bytes, start a server, or claim S2/gate/UI completion.
Where delta transport needs a journal-contract amendment, mark that amendment
explicitly unresolved; do not silently redefine the approved source-byte rule.
Completion is a reviewable proposal and exact remaining decisions, not more
PoC coverage. Stop before ratification, production adoption or release.

Slice review: `docs/specs/06-project-package-wire.md` and both authority indexes
explicitly say PROPOSED / UNRATIFIED / NOT IMPLEMENTED. Independent read-only
review found no blocker to presenting the proposal. Self-review clarified unknown
minor preservation and clean nonmanual provenance. Local Markdown links resolve
and whitespace checks pass. No executable source/dependencies changed, so the
existing root matrix is reused without an unchanged test/build or large-file run.

Short meta-audit / next decision: the draft identifies the delta-to-journal
source-byte mismatch as a proposed amendment, not an approved implementation.
Exact profiles/budgets/summary and backup evidence, journal/base publication,
and complete history-free conversion remain grouped ratification inputs in §10.
This closes a companion-draft task, not S2's wire gate, storage adoption or UI.
Do not start a new auxiliary proof just because the production path is gated.
The then-pending scheduling decision was subsequently resolved by §13.3;
physical storage evidence and final real UI/device acceptance remain
separate, required lanes. No new human test request or server was created.

### Completed bounded proof — cross-project retention and orphan GC (2026-09-08)

Previous turn made progress with `9fbf05e`; checkout is clean, nine ahead of last
fetched origin. Remaining usage is 42 percent. G1-A/§7 and STO-CAS-07/09 still
lack actual cross-project collection under a shared writer; a permanently
refused semantic GC stub does not establish this capability.

- [x] Specify and implement a disposable registered-project inventory/GC port
  sharing the existing CAS writer, with durable mark/grace/deletion intent.
- [x] Demonstrate real synthetic-file retention/deletion, root return, missing/
  opaque/future/unreadable inventory refusal and interruption-safe retry.
- [x] Run focused typecheck/tests, obtain read-only review and checkpoint.

This uses a fresh private test directory, explicit synthetic roots and an injected
test clock/grace only. No user-data deletion, production retention duration,
browser page, device claim, 500 MiB rerun, full domain validator or schema/wire
adoption. Reuse existing CAS and journal evidence; do not duplicate their matrices.
Unfinished metadata roots stop GC. All publication/inventory mutations share the
same enforced writer; a missing registered inventory is not an empty Project.
Completion requires actual safe collection, not just another refusal fixture.
Stop on a conflicting contract, unsafe deletion target or new product policy.

Slice review: isolated typecheck and 14/14 actual-file tests PASS. Two registered
Projects share one verified payload; removal of one reference retains it, and
last-root removal plus the injected grace permits exact receipt-then-payload
deletion. Current/derivative, conflict, migration, retention, journal and package
roots remain protected. A returning root resets grace, and interruption at each
deletion stage resumes after root checks. Missing/opaque/future/unreadable/pending
inventories and torn marks refuse collection; publication and root transfer use
one injected Node writer without recursive lock acquisition. Independent review
found an ordinary-update bypass of the unfinished-journal flag; update and pending
completion now refuse it, with a direct regression and confirmed closure.
No blocking finding remains in this bounded synthetic protocol.

Short meta-audit: this is actual safe file collection, not the earlier permanent
GC-refusal stub. It closes this bounded retention mechanism, not full ProjectDoc
root derivation, browser origin locking, exact metadata-journal integration,
process kill, iOS or aggregate G1 adoption. Temporary synthetic data was removed
only within verified fresh test directories and is reproducible from the tests.
Existing CAS/journal/semantic sources and production dependencies are unchanged;
reuse their recorded evidence/root regression, with no unchanged matrix or large
payload rerun. Next work must address a genuinely missing domain/platform/scale
criterion rather than repeat these collection cases or add another probe page.

### Completed bounded proof — five semantic purposes and privacy (2026-09-08)

Starting checkpoint `4ca0eec` is clean, eight ahead of last fetched origin, zero
behind; usage remaining is 42 percent. Browser ports are prepared, not executed.
The genuinely missing G1-C row is deriving five semantic closures from the same
causal Project (specification 03 §6; specification 05 §7, TEAM-PKG-06/09).

- [x] Record the isolated semantic projection contract in the existing PoC README.
- [x] Implement whole-Project versus explicit one-Scene closure, exact original
  history/delta, conservative opaque/baseline roots and history-free re-keying.
- [x] Execute one focused synthetic fixture sequence, including conflict/missing
  refusal, base-relative payload selection and parsed/raw privacy checks.
- [x] Obtain independent read-only review, correct bounded findings and checkpoint.

Production scope is zero. The small synthetic adapter is not a full domain or
untrusted-file validator. No new wire/schema policy, browser page, dependency,
GC deletion, repeated large-payload/manual test, platform PASS or UI adoption.
Reuse unchanged root regression and existing durability evidence. Completion is
an executed semantic privacy/closure result, not S2 transport or aggregate G1-C.
Stop on a specification conflict or a policy needing PO ratification; never use
the viewing resolver's partial `ready` result as export authorization.

Slice review: isolated typecheck and 17/17 purpose tests PASS. The same causal
synthetic Project produces five distinct semantic outputs; original change hashes
and bytes survive same-lineage outputs, backup alone includes base records, and
Contribution subtracts the exact declared base without advancing it. One-Scene
review excludes hidden-owner payloads and weak/derivation history; whole-Project
clean re-keys typed references/equality classes into a fresh bootstrap. Current
model/media embedded metadata remains unchanged and is explicitly disclosed.
Parsed and decoded-change/raw-string scans find no source identity, deleted or
profile/migration sentinels in the history-free projections. Unknown fields,
including nonmaterialized root candidates, fail closed; resolved tombstones do
not block unrelated current closure. Independent review's unknown-field finding
and its root-conflict continuation are corrected and confirmed closed. No
blocking finding remains within this small graph port.

Short meta-audit: this advances G1-C's five-purpose/privacy row, not full domain
admission, migration continuity, GC, package transport or an aggregate gate PASS.
Root source/dependencies and earlier journal/browser source are unchanged; reuse
their exact bounded evidence and root matrix (including the recorded default-
parallel timeouts), with no large-payload/manual rerun. Usage remains 42 percent.
Next boundary remains the specific missing adoption criteria: complete validated
domain/retention behavior, actual prepared OPFS/IDB isolation/recovery, and ratified
scale/device evidence. Do not repeat this semantic suite as a new workstream or
add a new probe page. S2 wire/migration companions and S3 UI remain gated.

### Completed preparation — browser cross-store journal port (2026-09-08)

The previous goal turn made progress: reviewed exact Node journal proof committed
as `a401a77`; worktree clean, seven ahead of last fetched origin and zero behind.
Usage remaining is 43 percent. The next actual gap is browser OPFS/IndexedDB
coordination. Do not repeat the Node fault matrix or the completed manual probes.

- [x] Implement isolated OPFS journal/control/inventory files and pinned Repo/IDB
  metadata ports for the same exact protocol, with a shared browser writer lock.
- [x] Prepare one batched browser flow: initial local edit, remote interruption,
  old-head read-only view from a fresh repository, exact recovery and repeated
  readback/no-op. Preserve the run identity and result log across page reload.
- [x] Typecheck/build the isolated page, execute reusable protocol checks, obtain
  one bounded independent read-only review and preserve a reversible checkpoint.

Production scope remains zero: no adoption, root dependency/schema, UI hookup,
GC deletion, new source data, 500 MiB stress repeat, release/PWA/tunnel or immediate
human-test request. Use new synthetic storage per run and never reset prior runs.
The page is preparation, not platform PASS until executed. Reuse `a401a77` root
matrix while its source/dependencies remain unchanged. Stop on a specification
conflict or failure of a required adapter capability; do not substitute inline
source changes or a memory-only metadata port for the actual cross-store path.

Slice review: isolated typecheck/build PASS, unchanged journal suite 29/29 PASS,
and four added pinned-Repo lifecycle cases PASS. The new cases use a memory
storage test port, not a browser claim. Review corrected cumulative CAS-read
accounting and unload-triggered autosave. The browser port now creates no
DocHandles; explicit version-pinned storageSubsystem saves are awaited and read
back by a fresh Repo. The hidden API remains an isolated candidate, not adopted.
Cleanup closes new write admission and drains started transactions before lease
release. Independent review confirms the findings closed with no new blocker.
Production source/dependencies remain unchanged; reuse the preceding root matrix.

The existing browser-control bootstrap failure was not retried. Windows screen
control connected but cannot operate the ChatGPT app UI under its skill; no
browser action, Chrome switch or new server/tunnel was performed. The new page's
real OPFS/IDB, other-tab and reload results remain pending. Its persistent logs
and later batched instructions are in the existing probe README; no immediate
human request or repeated large-payload run is needed.

Next boundary: obtain the prepared platform evidence in the batched device lane
before adoption, while addressing genuinely remaining G1-C domain/privacy/closure
requirements from specification 05. Do not grow another browser page or repeat
these protocol/lifecycle tests without a changed requirement or implementation.
Storage/Scene/UI hookup is still gated; S2's wire/migration companions and S3's
integrated Desktop/iPhone flow are not implemented and must not be marked done.

### Completed bounded proof — isolated exact journal/publication protocol (2026-09-08)

Previous goal turn made progress by recording actual OPFS payload readback and
closing the unavailable-log inquiry. Starting checkout `4ff9adf` was clean, six
commits ahead of the last fetched origin; latest usage remaining is 43 percent. Do not
reopen that human check or infer full I/O/device acceptance. The next missing
S1 prerequisite is coordination between durable original metadata changes and
verified binary inventory, not more standalone streaming fixtures.

- [x] Implement exact descriptor/source/ordinal-part preparation and validation
  under specification 02 §8 in `poc/scene-history`, reusing pinned Automerge and
  the isolated CAS. Write the bounded contract in its existing README first.
- [x] Exercise local original-change recovery with valid concurrent edits and
  remote linear/diamond prefix recovery using separate real temporary Node
  metadata/journal stores, a publication barrier and conservative inventory.
- [x] Prove final strong/conflict/opaque closure checks, unchanged old publication
  on failures, root/source/descriptor tamper refusal and zero existing-blob
  payload reads for metadata-only/replay paths; use focused existing semantics.
- [x] Run isolated tests/typecheck, obtain one independent read-only review and
  correct current-boundary findings.
- [x] Complete final root regression and preserve a reversible checkpoint.

Production scope is zero; application/dependency/schema/wire/UI adoption remains
gated. No new dependency, browser-control retry, device request, GC deletion,
converter or product budget. The synthetic domain validator and Node stores are
test ports, not the full ProjectDocV2 validator or OPFS/IndexedDB implementation.
Journal/source files remain retained for inspection after publication; this proof
does not claim cleanup/GC, browser restart or complete cross-store adoption.
Completion is an executed exact-byte/closure/publication protocol result, not a
new feature flag or UI integration. Stop on a specification conflict or a failed
required adapter capability; do not substitute stale command regeneration.

Slice review: final isolated typecheck and 29/29 tests PASS; existing causal-history
suite 6/6 PASS. One read-only review identified missing-inventory facade refusal
and improper replay after acknowledged metadata loss. Both are fixed, regression
tested and confirmed closed; root identity-map conflict refusal is also checked.
Only prepared `blobsVerified` batches restore missing original changes;
`metadataDurable` loss requires repair and cannot acknowledge/publish. No active
P0/P1 remains in this bounded scope. Root typecheck and production build PASS.
Default-parallel `npm test` hit the unchanged 5-second limit in 19 tests across
five existing script suites, with some follow-on temporary-cleanup errors. On the
same tree, `npm test -- --maxWorkers=2` passes all 80 files / 1,658 tests with 21
existing todo; no assertions/timeouts, production code or test configuration were
changed. This supports a concurrency-sensitive runner issue, not a proven product
regression. Retain both outcomes; use the bounded worker count on this host rather
than rerunning the same high-parallel invocation. Existing build warnings remain.

Short meta-audit: this closes exact journal/source/part coordination, not another
streaming recipe. The remaining platform boundary is actual OPFS journal plus
IndexedDB metadata coordination, not another Node fault matrix. Reuse these exact
protocol tests and the completed history/readback evidence. Production integration
still needs the remaining metadata/CAS adoption criteria, including domain/privacy/
reachability, GC, scale/ratified limits and applicable physical-iOS durability.
Do not turn the unavailable first-run log into a blocker or reopen completed manual
tests. S2 wire/migration companions and S3 UI remain downstream, not implemented.

### Completed preparation — the same I/O proof for OPFS (2026-09-08)

Short meta-audit: `779859a` is the reviewed Node proof, not a production storage
change. Its missing direct prerequisite is execution against browser OPFS and a
real browser writer lock. Prepare that backend and one self-running local page;
batch human execution later rather than asking for every step. Existing browser
control initialization failure is unchanged and will not be retried here.

- [x] Add an isolated OPFS backend with bounded reads/writes, explicit abort and
  the same origin-scoped exclusive lock for import/recovery/export.
- [x] Reuse the synthetic recipe and candidate for a one-action browser probe:
  streamed round trip, duplicate import, injected failure/cancellation and exact
  staged recovery. Provide a separate readback after reload without resetting.
- [x] Check the cross-runtime synthetic recipe against the Node oracle, typecheck
  and build only the isolated page, and obtain one focused read-only review.
- [x] Record preparation separately from unexecuted browser/device evidence and
  add concise batched instructions to the same README; no immediate PO check.

Production scope is zero. No new dependency, main application/UI import,
cross-store metadata journal, GC, package wire, adoption, browser download/PWA
claim or tunnel. The page writes only its explicitly named synthetic OPFS area;
existing user projects and prior history-probe data are not read or removed.
Stop on a specification conflict or an actual required scope expansion. Completion
means executable browser preparation, not a passing OPFS/iPhone gate. Reuse the
unchanged production matrix from the preceding slice.

Slice review: isolated typecheck/build PASS; browser WebCrypto recipe executed
under Node versus independent Node AES/SHA-256 at 5 MiB + 19 bytes and full
500 MiB with the pinned digest (1/1 focused test PASS). Independent review found
a misleading blanket READY on partial readback and an overbroad recovery hint;
both are corrected and confirmed. Browser execution was pending at preparation.
Its output remains private synthetic OPFS, not an adopted browser download sink.
No new server/tunnel, production import, dependency or root build change. The
preceding root matrix remains applicable; browser-control retry and immediate
human requests were deliberately not repeated.

PO follow-up: after the verified HTTP link for `e51fea8`, the supplied page text
reports READY for saved-payload readback and PASS for reopening the 500 MiB
payload with the original hash. Record this narrow user-operated result, not
agent automation or a full initial-round-trip/platform gate. The PO answered
that the first completion was not remembered and no log was available. Its
result is unknown, not failed; do not ask again or repeat the stress run solely
to reconstruct this log. The browser's family/version and
page-reload ordering are not inferred from the text alone.

Next dependency: retain the bounded readback and the explicit first-run evidence
gap, then obtain applicable physical-iOS/storage evidence before adoption. Missing
old logs do not create a new PO approval hold for approved implementation work. Remaining
G1-A/C work includes the real cross-store journal/inventory, safe reachability/
GC, semantic privacy closures, scale/domain limits and platform durability;
neither this preparation nor the earlier Node proof closes those requirements.
Keep production storage/UI wiring gated. No approval is requested for ordinary
implementation details, and no completed manual sequence should be repeated.

### Completed slice — isolated bounded CAS I/O proof (2026-09-08)

The PO requested autonomous continuation with human checks batched. The existing
S1 plan authorizes remaining metadata/CAS proofs, not silent technology adoption.
Starting HEAD `3c0bb76` is clean; usage remaining is 45 percent. Reuse the now
completed manual save/recovery proof and disconnected Scene core.

- [x] Define one missing bounded streaming/publication proof in the existing PoC
  lane, with backend limits and exclusions before coding (`poc/cas-io/README.md`).
- [x] Implement isolated stream/hash/copy/receipt publication and exact staged
  recovery; no atomic rename assumption, production imports or new dependencies.
- [x] Execute one 500 MiB stream round-trip and focused cancellation/quota/
  interruption/dedup/corruption checks through a real Node filesystem backend.
- [x] Typecheck the isolated files, obtain focused read-only review, fix findings
  and record observed results without OPFS/iOS/full-journal or adoption credit.

This closes only the genuinely missing non-browser I/O algorithm proof. Node
locking/durability does not stand in for browser platform behavior. Existing
storage/UI integration remains gated; implementation within the approved proof
scope does not need another PO micro-approval.

Slice review: isolated typecheck and 17/17 tests PASS; the 500 MiB case took
45.947 seconds with 1 MiB observed maximum chunks, an independent matching digest,
one verified payload and zero payload reads on completed replay. The 3 MiB +
16 KiB buffer figure is static code accounting, not measured process memory.
Review clarified torn-receipt refusal and private scratch-sink limits and found
one invalid-export cleanup P2; it is fixed, the focused actual-file regression
and typecheck pass, and the reviewer confirmed closure. Root typecheck, all
80 files / 1,658 PASS / 21 existing todo and build PASS. No production source or
dependency changed. Temporary synthetic payloads were removed by scoped cleanup.

### Active slice — disconnected pure Scene core (PO approved 2026-09-08)

The PO approved advancing Scene creation, membership management, integrity checks
and composition planning without connecting storage or existing screens.
Specification 05 §13.1 records the exact sequencing exception. This supersedes
the documentation-only stop below, not any durability/adoption requirement.

- [x] Record scope, conflict-aware read-port boundary and reused acceptance.
- [x] Implement pure Scene records/command planning and deterministic composition.
- [x] Cover the pure SCN-DOM-01–09 portions plus input immutability, stale token
  refusal and isolation from application imports; do not claim full ID acceptance.
- [x] Run focused tests, typecheck, full tests/build once on the final tree;
  obtain one independent read-only review, fix bounded findings and report.

Completion: tested reusable core with explicit unresolved diagnostics and no
storage/UI adoption. Excluded: dependencies, journal, deep conflict-copy remap,
resource edits, package/migration, renderer, UI wiring, device/PWA/release work.
Stop on specification conflict, implicit winner/source inference or scope expansion.

Slice review: `src/scene` implements typed conflict-aware read projections, pure
logical command plans and composition selection, without application imports.
Focused tests 12/12 PASS; typecheck PASS; full suite 80 files / 1,658 PASS with
21 existing todo; build PASS (existing mixed-import/chunk-size warnings only).
This full invocation also passes the previous environment-limited acquisition
test, without changing it. Prior failed invocation remains historical evidence.
Independent read-only review found one P2: fresh IDs reversed tied source model
order during Scene creation. Distinct ordered keys on new edges and a two-model
regression fix it; focused reviewer confirmation reports no remaining blocker.
Source resources, memberships and authored anchor coordinates remain unchanged.
Usage remains 46 percent. No browser/device/PWA PASS or storage adoption follows.

Next boundary: the approved pure Scene core is implemented but disconnected.
The validated full-resource read provider and causal write integration still wait
for applicable storage gates. The PO supplied resumed-run rejection/recovery and
both-tab readback evidence, followed by final page-reload/readback logs and an
explicit attestation that no-op replay passed. The bounded manual probe is now
complete; automatic other-tab notification remains a separate unmeasured property.
No further UI/storage integration is authorized
by this scheduling exception, and no extra unchanged tests are required now.

The Product Owner authorized implementation toward UI verification, with a stop
for their decision whenever the available Codex usage falls below 10 percent.
Starting checkout: clean pushed `b5e621f` on `g0-baseline`; available main usage
was 49 percent at entry. Recheck at meaningful implementation/verification
boundaries; do not consume a reset or silently continue below the threshold.

- [x] S1 entry: isolated `poc/scene-history`, pinned `@automerge/automerge@3.4.1`
  (MIT), its own package/lockfile and no application imports. Prove exact sibling
  deltas, original dependency replay, scalar conflict inspection, explicit
  keep-one/independent-keep-both and save/load using synthetic data/fake blobs.
  Review lockfile and audit the isolated dependency before execution.
- [x] Bounded proof: pinned Automerge Repo/browser IndexedDB durability
  acknowledgement and exact-byte reopen, with a project-wide single-writer
  barrier and a second tab denied intermediate publication. Keep this in the
  disposable harness; no application dependency/storage/UI changes. Reuse the
  causal probe; full journal/CAS, performance and physical iOS remain separate
  missing gate evidence. Stop on an unsupported required capability.
  Candidate dependencies: Repo and IndexedDB adapter exactly 2.5.6 (MIT), with
  Automerge 3.4.1 in the existing isolated manifest. Review/audit before running.
  Completed through PO screenshots/logs and explicit no-op confirmation, not
  agent browser automation or full G1-C adoption. See the README evidence limits.
- [ ] Close the remaining applicable metadata/CAS adoption proofs, then implement
  the production adapter, journal, Scene commands and resolver under S1.
- [ ] S2: ratify the bounded wire/migration companions, implement five-purpose
  exchange and source-preserving conversion, pass the service TEAM-FLOW-01.
- [ ] S3: connect the approved UI and record ordinary-home Desktop walkthrough;
  obtain required physical-iPhone storage/UI evidence on an approved exact route.

First completion boundary: a passing executable candidate result or one concrete
unsupported capability, with focused independent review. This is partial G1-C
evidence only; no production adoption, CAS or device PASS follows from it. No
extra synthetic matrix is required before moving to the missing production gate.

S1-entry review: isolated Node harness 6/6 PASS; independent read-only review
found no blocking P0/P1. At the first metadata-only checkpoint, the isolated
lockfile contained only Automerge and scoped npm audit reported zero
vulnerabilities. The subsequent browser-probe dependencies have three moderate
audit entries propagated from uuid 9.0.1; independent call-site review found no
reachable affected input in the synthetic-only probe. This is not audit-clean or
production-adoption evidence (see the probe README). Historical conflict inspection
reconstructs recorded heads from original changes; scalar resolution uses an
explicit replacement even when selecting the currently materialized value.
No complete model remap, real blob I/O, durability/device or adoption is claimed.
Usage recheck: 46 percent remaining. Browser automation is blocked: the browser
control runtime failed to load, and Windows automation twice stopped because it
could not establish Chrome's URL, including after the Product Owner opened the
exact loopback page. Do not repeat the same blocked automation or bypass its
safety check. The Product Owner subsequently supplied screenshot/log evidence
for `保存・失敗・再試行を検証`: initial durability, gated acknowledgement,
quota/retry and independent Repo original-byte readback PASS, with READY and
unchanged exchange base. Subsequent manual logs confirm page reload/readback,
one-of-three remote changes durable with only the old view visible, and a
second tab's READ-ONLY plus synthetic-request denial. New screenshots from a
resumed pending run confirm denial, recovery of exactly two missing original
changes, one final publication and READY revision-2 in both tabs with fresh Repo
byte readback and unchanged base. The earlier start refusal reached the pending
guard after acquiring the writer lock; the prior owner was no longer holding it.
The no-op replay line, final page-reload ordering and automatic versus manual
other-tab refresh are not shown. See the probe README; no browser-family, device
restart or general journal guarantee is inferred.

Current verification: root typecheck and build PASS; root test run had 1,645
passes, 21 todos and one ENOSPC failure in the existing 6-GiB temporary-file
acquisition test (system temporary volume had about 5 GiB free). The unchanged
affected file then passed 32/32 with process-local TEMP/TMP on the workspace
volume. Do not describe the first full-suite invocation as green. Isolated Node
probe 6/6 and isolated browser build PASS. Independent browser-source review
found no blocking code issue; its evidence wording correction is applied:
`attempt()` proves one synthetic facade guard, not real edit/export/GC services.
No application code/root dependency, production storage, release or SW source
changed. The root build's normal generated PWA files remain ignored outputs.

### Current bounded continuation — deferred browser evidence

The Product Owner selected provisional in-app-browser testing and a consolidated
human Chrome check later, then authorized this continuation. Chrome repair is
paused. The in-app connection retry also failed before page access with
`Importing module "node:process" is not allowed in node_repl`; this is separate
from the Chrome sidebar's missing `nodePath` launch-metadata error. No provisional
in-app run occurred. Do not retry unchanged connections or bypass tool safety.

- [x] Reconcile existing manual results with the probe source; retain their
  exact limited scope and identify the three missing interruption/recovery checks.
- [x] Consolidate the existing README procedure into action/expected-result rows
  with separate prior manual, provisional in-app and final Chrome evidence lanes.
- [x] Verify the instructions against current controls/logs and run the bounded
  Node regression once; reuse unchanged root checks instead of repeating them.
- [x] Self-review the documentation diff and report the gate boundary without
  claiming browser, production, offline or device acceptance.

Review result: focused Node regression 6/6 PASS on unchanged probe source;
six visible control labels and three literal log messages match the runbook.
Self-review and one focused independent read-only review found no blocking
runbook discrepancy; diff whitespace checks pass. Existing root test/build
results above were not rerun or upgraded. Only four documentation files changed,
including the pre-existing manual evidence updates; no new browser PASS exists.

The PO confirmed the no-op line appeared before reload. This closes the bounded
manual sequence; preserve its evidence and do not repeat it unchanged. Next
work is the remaining applicable metadata/CAS adoption proof, not another request
for the same button sequence. Automatic other-tab notification remains separately
unconfirmed and must not be credited from manual readback.
The loopback preview
uses port 5184; recheck its process/HTTP state before reuse. No public/tunnel/device
route exists. Deferring Chrome confirmation changes scheduling, not metadata/CAS
adoption criteria: production storage still waits for actual prerequisite proof.
S3's final product Chrome test also remains separate from this synthetic probe.
No new implementation, dependency, architecture, release or deployment change is
part of this documentation/evidence continuation.

## Completed boundary — focused contract corrections and S1 entry (2026-09-08)

The Product Owner requested explicit conflict choices (keep either candidate or
keep both), delegated the gate/sequence/acceptance corrections and asked that
verification remain proportional. Start from pushed contract checkpoint
`25b9a776de84a2bb0fb4eb4d78aa542aeb64fb48`.

- [x] Record explicit user-selected keep-either/keep-both semantics without
  automatic membership coalescing or an automatic conflict winner.
- [x] Map G1-C to the five-purpose Scene/team contract and separate adapter proof
  from S2 wire/converter proof.
- [x] Name the immediate S1 entry deliverable and separate storage/device evidence
  from S3 integrated product acceptance.
- [x] Add one continuing-team end-to-end acceptance flow using existing checks.
- [x] Check the changed contracts once and record remaining blockers. Do not add
  a test matrix, repeat unchanged application tests or reopen unrelated gates.

Next executable step: the S1 entry described in specification 05 section 13.
Its first deliverable reuses existing evidence to name one missing adapter/I/O
proof and its bounded harness. No further planning layers are required before
executing that harness once its existing dependency/adoption conditions are met.

Review result: keep-both was explicitly clarified as independently editable items.
The focused independent review found no blocking contract issue. Diff whitespace
and 72 inline Markdown file references pass. All changes are documentation;
unchanged application tests/build were not repeated and no new technology or
device acceptance is claimed. The next evidence gap is the pinned candidate
adapter, not another document review. Dependency selection/approval and actual
G1-A/C execution remain required before production storage adoption.

## Completed boundary — ProjectScene and continuing-team contract ratification (2026-09-07)

The Product Owner approved the Project-as-workspace / Scene-as-presentation model
and the three-slice implementation plan. The prior UI and team-review work is
preserved at pushed checkpoint `21786771bdb39800a29f835fa4f25535cd01d5bc`.
This boundary updates normative specifications and acceptance before any v2
production code, dependency, schema/package version or UI implementation.

- [x] Preserve the exact pre-Scene UI/team-review tree as a clean, pushed Git
  checkpoint after typecheck, 79-file/1,646-test verification, production build,
  cached diff check and independent code/privacy review with no P0/P1.
- [x] Amend the product contract so a LociView Project retains typed resources and
  a ProjectScene explicitly selects logical models and Captions while owning
  Scene-scoped material presentation and one optional entry Saved View.
- [x] Amend the domain contract with ID-keyed Scene/Asset and Scene/Caption
  memberships, Project-wide active Asset revision/binding, session-local active
  Scene and complete fail-closed Scene resolution/conflict semantics.
- [x] Amend the storage/package contract for causal continuing history, a
  self-contained Team Workspace, a base-dependent thin Contribution, selected-
  Scene review, exact backup, new-lineage clean copy and atomic failure recovery.
- [x] Freeze dual-read/v2-only-write migration from Native snapshot 1, frozen v1
  and LociMyu without changing source bytes or inferring model/source relations.
  Define the bounded fixed-baseline Native bridge for recoverable late changes.
- [x] Update the UI/UX contract to use `シーン` as a cross-tab context while
  reserving internal `Asset` for a logical 3D model and revealing revision details
  only when model replacement, review, conflict or recovery requires a decision.
- [x] Add executable acceptance identifiers for Scene switching, multi-Scene
  Caption membership, model revision propagation, package closure, conflicts,
  idempotence, interruption/quota recovery, Desktop and physical-iPhone behavior.
- [x] Obtain independent read-only product/domain and storage/security reviews,
  resolve every P0/P1, run documentation/privacy/diff checks and record the result.

### Contract review result

- ADR-0002 and specification 05 now carry the accepted ProjectScene, continuing
  causal history, five-purpose package, migration, recovery and device contract;
  the authority indexes and superseded-clause banners point to them explicitly.
- Independent product/domain, storage/security and final cross-document/privacy
  reviews report no remaining P0/P1. Markdown links and whitespace checks pass;
  no private representative path, filename, source digest, source bytes or
  internal source name was added.
- This boundary changes documentation and task records only. It adds no runtime
  dependency, production code, schema/package version, migration output, UI,
  renderer, Pages, Service Worker or release state.
- With every normative contract file staged, `npm run typecheck` and the
  production build pass; the build emits only the existing mixed-import and
  chunk-size warnings. The two fixture-registry suites pass 53/53, then the full
  matrix passes 79 files / 1,646 tests with 21 existing todo. This closes the
  earlier expected registry stop while specification 02 differed from the Git
  index and the one aggregate-load receipt-verifier timeout, which had already
  passed 7/7 in isolation. No rendered Desktop, offline/PWA or physical-iPhone
  acceptance is claimed by this docs-only verification.

Approved implementation sequence after this contract boundary:

1. **S1 — Scene-capable v2 core:** gated metadata/CAS adapter, ProjectSession,
   journal, ProjectScene records, typed commands and resolver behind a nondefault
   boundary. No converter, package or production UI.
2. **S2 — migration and team exchange:** Native/frozen-v1/LociMyu conversion,
   fixed-baseline bridge, Team Workspace/Contribution/review/backup/clean-copy
   closure and recovery, only after the new ProjectScene migration/portable-
   bridge companion and five-purpose package-wire companion pass their gates.
   No UI polish or release work.
3. **S3 — product UI and acceptance:** shared Scene selector, four-tab composition
   authoring, conflicts/`needsReview`, Desktop rendering and physical-iPhone
   acceptance. No Pages, Service Worker, main integration or deployment.

### Contract checkpoint stop condition (completed historical boundary)

Stop after the contract diff and independent review are ready for Product Owner
inspection. Do not add Automerge/CAS or another dependency, implement ProjectDocV2,
change Native snapshot/package wire formats, resume production UI work, or claim a
gate/candidate/release PASS in this boundary.

## Completed prior boundary — team-operation suitability review; UI editing paused (2026-09-07)

`tasks/team-operations-review.md` records the current one-campaign fit, the
continuing-team blockers, the safe bounded current procedure and the accepted
direction. `docs/ui-product-guidelines.md` preserves the approved UI/UX direction.
The Product Owner then approved continuing causal history, Project-wide model
revisions, Scene-based presentation, all-Project editing, full Workspace versus
thin Contribution, explicit conflicts, accurate share disclosure and
dual-read/v2-only-write migration. The current boundary above supersedes the old
decision wait; current Native fixed-baseline behavior remains unchanged until the
new implementation passes its gates.

## Paused prior boundary — legacy-convenience UI implemented, rendered acceptance pending (2026-09-06)

The Product Owner approved D1–D4 and the three bounded slices in
`tasks/uiux-parity-plan.md`, and authorized implementation. The accepted bounded
behavior is recorded in `docs/specs/02-storage-package-migration.md` §32 before code.

- [x] Ratify the exact no-schema/no-version contract for Caption comparison,
  media reference editing/projection, DisplaySet authoring and review-set export.
- [x] S1: implement and verify Caption repetition, comparison and media reuse/removal.
- [x] S2: implement and verify DisplaySet/view/background authoring.
- [x] S3: implement and verify exact export handoff/preflight and contextual help.
- [x] Run typecheck, focused tests, build, diff/privacy checks and independent review;
  independent S1/S2/S3 reviewers report no remaining P0/P1.
- [ ] Obtain an aggregate full-suite PASS or an explicit disposition for the two
  fixture-registry suites that stop before collection because retained local
  representative source bytes differ from the indexed blob. Do not modify or expose
  those bytes to make an unrelated UI run green. The other 1,588 checks passed in
  the latest aggregate run, including all 82 evidence-verifier cases.
- [ ] Record rendered Desktop evidence. Physical-iPhone acceptance remains PO-run;
  propose one exact HTTPS route first only if fresh offline/PWA evidence is required.
  On 2026-09-07 the Product Owner explicitly approved switching the automated
  walkthrough from the in-app browser to Chrome. Chrome control failed at the same
  shared connection initialization boundary before browser discovery or page
  interaction, so neither attempt supplies rendered evidence.

### Prior next decision (superseded while team review is active)

Rendered Desktop/iPhone acceptance remains open but inactive while the team review
boundary is current. Later, run the ordinary `/` Desktop walkthrough when Codex
browser control is available,
or collect an explicitly human-run Chrome walkthrough against the exact worktree;
then Product Owner performs or explicitly schedules the physical-iPhone acceptance.
Do not call the current worktree a candidate PASS from automated evidence alone.
The remaining nonblocking polish candidates are thumbnail queue coalescing and
avoiding thumbnail reload while editing Caption text; they do not authorize a new
feature, release, commit/push, Pages or Service Worker workstream.

### Desktop correction RC8 — one idle file entry

The Product Owner's current correction and the already approved one-home design
replace the two idle start actions with one intent-based `ファイルを開く` entry.
Official UI-writing guidance supplies the durable wording rules below.

- [x] Verify that the neutral intake already routes inspected non-ZIP model bytes to
  the new-Project flow while package, LociMyu and old-project inputs keep their
  existing review/confirmation paths.
- [x] Record durable UI-copy rules in `AGENTS.md`: result-based labels, stable terms,
  input-neutral wording, one-purpose helper text, progressive disclosure and no
  hiding of failure/unsaved/recovery state.
- [x] Make `ファイルを開く` the only idle file picker and use the input-neutral
  helper `選択またはここにドロップ`; do not narrate automatic type detection.
- [x] After a model is safely detected, reveal the existing creation controls as a
  contextual `新しいプロジェクト` form rather than a second intake card.
- [x] Preserve project name, detected type/source, per-file removal, contextual
  second-model addition, the Mesh/Point-plus-GS boundary, conditional GS proxy and
  offline preparation, explicit create/cancel, atomic duplicate-role rejection and
  all zero-write/revalidation guarantees.
- [x] Update stale help/error text that still pointed to `モデルから新しく作る`,
  and cover idle absence, model reveal, last-removal/cancel, accessible labelling,
  existing package routing and failure/retry in focused tests.
- [ ] Record refreshed Desktop rendered evidence; physical-iPhone acceptance remains
  separate and is not inferred from the development server.

Acceptance: an idle user chooses a file once without knowing its format. A model
selection reveals only the decisions needed to create a Project; package and
conversion routes retain their own confirmed outcomes. Unsupported or ambiguous
content remains visible and creates nothing. No storage/schema/package, dependency,
renderer, media-format, PWA, release, main or Pages behavior changes.

RC8 executable evidence: 51 focused home/import checks, typecheck, production build
and `git diff --check` pass. The build reports only the existing chunk-size and
mixed static/dynamic import warnings. The full run passed 1,593 tests with 21
existing todo; the same two fixture-registry suites stopped before collection
because the retained private representative source differs from its indexed blob.
No private bytes were changed to mask that boundary. Independent read-only review
found and closed focus loss on first reveal, cancel, last removal and two-to-one
model removal; its final rerun passed 37/37 with no remaining P0/P1. Rendered
Desktop evidence remains open.

### Desktop rendered correction RC1 — home idle state

- [x] Replace the remaining home-level `画像` umbrella wording with the approved
  `メディア` wording and state the local-save/file-export boundary plainly.
- [x] Remove empty install/file-status layout slots and hide transfer detail/control
  affordances while no transfer is active and no result or recovery exists.
- [x] Keep cancel visible only while an operation is both running and cancellable.
- [x] Run focused home tests, typecheck, production build and diff check.
- [ ] Obtain a refreshed Chrome screenshot before continuing the task walkthrough.

Acceptance: an idle first visit shows no cancel action, empty detail disclosure or
blank status gap; an actual package operation still exposes status, cancellation
when permitted, details, result and retry. This correction does not change intake
routing, package semantics, storage, dependencies, schema, Pages or Service Worker.

### Desktop rendered correction RC2 — saved legacy projects

- [x] Make the top `ファイルを開く…` the only visible intake entry for a new
  conventional file.
- [x] Hide the saved-conventional section when this device has no such project.
- [x] When records exist, label them as previously saved old LociView projects and
  explain that they open read-only and may then be converted without changing them.
- [ ] Verify the empty state in a refreshed Chrome screenshot and retain the existing
  strict file inspection, registration and read-only conversion behavior.

Acceptance: no empty legacy accordion competes with normal start actions, and a user
cannot mistake the saved-project list for a second file picker. No legacy storage,
package, migration or conversion semantics change in this correction.

### Desktop rendered correction RC3 — post-selection intent

- [x] Make the primary file entry format-neutral and promise a detected-result
  explanation rather than listing implementation formats as required knowledge.
- [x] Before Native restore or old-LociView registration, show detected purpose,
  next action, opening mode and unchanged-source status with explicit continue/cancel.
- [x] Keep the existing LociMyu review and model-role boundary, but give their
  committing action an outcome label rather than an ambiguous `内容を確認` label.
- [x] Revalidate package purpose, Project identity/collision, quota and lock after
  confirmation and before the first write; cancellation must remain zero-write.
- [ ] Add pure route/copy tests plus focused home/package tests, typecheck, build and
  an updated Chrome walkthrough.

Acceptance: filename never selects purpose; backup/collaboration/review/clean-copy,
old LociView, LociMyu and model lead to visibly different outcomes before mutation.
Existing package/schema versions, validators and no-guess relation rules remain.

### Desktop rendered correction RC4 — exact GS offline action

- [x] Remove the generic `オフライン・端末` category and name the exact outcome
  `GSをオフラインでも見る` only after a GS need has been established.
- [x] State that this stores GS display capability in the current browser and does
  not save Project/model data or make a backup; keep ready/failure claims unchanged.
- [x] Preserve the explicit user action and production offline checks. Do not claim
  offline/PWA acceptance from the current development server.

Acceptance: Mesh/Point-only flows see no GS preparation control; GS flows retain a
discoverable explicit preparation and truthful current-browser scope. Service Worker,
cache policy and runtime dependencies do not change.

### Desktop rendered correction RC5 — one model-selection entry

- [x] Replace the separate Mesh/ordinary-Point and GS inputs in new-Project creation
  with one model picker whose validated bytes determine Mesh, exact Point PLY or GS.
- [x] Preserve the existing ability to start with one Mesh/Point Asset and one GS
  Asset by accepting both in the same selection; reject duplicate roles rather than
  guessing which file wins.
- [x] Show the detected files and roles beside the picker. Reveal the explicit GS
  Caption-placement proxy and GS offline action only while a GS source is selected.
- [x] Reuse the same strict inspector immediately before Project publication and add
  focused order/role/conditional-disclosure/zero-write failure coverage.
- [x] Run focused tests, typecheck, production build, diff/privacy checks and an
  independent P0/P1 review.
- [ ] Obtain a refreshed Chrome screenshot.

Acceptance: users select model files by intent, not by understanding Representation
roles. One safe result is applied automatically; duplicate/unsupported/ambiguous
content stops before publication. Existing multi-Asset creation remains available.
No schema, package, dependency, renderer, media, PWA or release boundary changes.

### Desktop rendered correction RC6 — concise start copy

- [x] Name the creation picker `3Dモデルを選ぶ` consistently before and after a
  selection.
- [x] Rewrite the neutral file-entry description as a clear user action; RC7 further
  removes routine post-selection narration from the idle state.
- [x] Remove the redundant explanation of simultaneous versus sequential model
  selection while retaining supported-content and automatic-detection clarity.
- [x] Add focused copy assertions and rerun home tests, typecheck, production build
  and diff/privacy checks; independent review reports no remaining P0/P1.

Rendered Chrome evidence remains separate. The RC6 focused home checks passed 35/35.

Acceptance: the two start actions are understandable from their visible text alone,
without procedural filler or an unnamed actor. Intake classification, supported
combinations and every publication boundary remain unchanged.

### Desktop rendered correction RC7 — home copy density

- [x] Remove automatic-detection narration from the new-Project form and selected-file
  summary.
- [x] Reduce the idle product and file-entry descriptions to the minimum action and
  local-save information needed on the screen.
- [x] Keep supported ordinary Point and Gaussian Splatting discoverable without
  explaining internal classification behavior.
- [x] Add focused copy assertions and rerun home tests, typecheck, production build,
  diff/privacy checks and independent copy review.

Acceptance: each idle helper line has one user-facing job. Required consequences,
errors, recovery and unsaved-state messages are not shortened or hidden. No intake,
storage, schema, package or release behavior changes.

RC7 evidence: home copy/behavior checks passed 35/35; the wider home/import matrix
passed 81/81. Typecheck, production build and diff/privacy checks passed. Independent
review reports no remaining P0/P1.

Automated correction evidence: 81 focused checks passed across home composition,
Native import disclosure/revalidation, active Representation resolution, LociMyu
source switching, old-format release mode and content-based ZIP identity. Typecheck,
production build and diff/privacy checks passed. The latest full run passed 1,588
tests, including all 82 evidence-verifier cases. Two known fixture-registry suites
still stop at collection because the private representative source differs from its Git index;
this UI slice does not alter that source. The file-result panel now occupies the slot
immediately below the single picker. Two independent read-only reviews found no
remaining P0/P1 after corrections. Refreshed Chrome rendering remains the open
RC1/RC2/RC3 evidence item; the development build is not offline/PWA acceptance.

### Desktop rendered correction RC9 — team collaboration scope

- [x] Extend the local-save note with the concrete file-based Caption collaboration
  outcome so the home screen communicates a plausible team workflow.
- [x] Limit that claim to people using the same Project; do not imply arbitrary
  cross-Project or cross-model Caption matching.
- [x] Run the focused home-copy check, typecheck and diff check.

Acceptance: the introduction communicates both device-local work and file-based
Caption exchange without overstating the fixed-baseline/same-lineage merge path.
Different-model behavior, merge semantics, schema and package versions do not
change in this wording correction.

RC9 evidence: the focused home intake checks passed 6/6; typecheck, production
build and `git diff --check` passed. The aggregate run passed 1,593 tests with
21 existing todo; the two known fixture-registry suites stopped before collection
because the retained private representative source differs from its indexed blob.
This wording correction did not alter that source. Rendered Desktop evidence
remains separate.

### Current implementation stop boundary

Do not commit/push, release, change dependencies/schema/package versions, add media
formats, or touch main/Pages/Service Worker. Stop and re-plan if the approved behavior
cannot be implemented without crossing those boundaries.

## Previous boundary — legacy convenience re-audit and planning (2026-09-06)

The Product Owner requested a renewed legacy-convenience audit and a UI/UX plan,
with remaining work inventoried BEFORE planning implementation. This turn changes
documents only. The existing uncommitted UI implementation is preserved; its
Desktop/iPhone acceptance and independent final review remain incomplete.

- [x] Recheck current checkpoint and distinguish existing Native coverage,
  missing legacy conveniences, intentional replacements and unverified behavior.
- [x] Audit connected legacy behavior against current code and applicable contracts;
  do not treat headings/placeholders or previous feature counts as proof of parity.
- [x] Inventory remaining work, user impact, UI location, state/recovery rules and
  explicit non-inheritance; retain unconfirmed evidence as an open question.
- [x] Derive at most three bounded implementation slices from that inventory,
  with dependencies, required policy decisions, acceptance and exclusions.
- [x] Self-review the plan and obtain independent read-only gap/contract feedback;
  submit to the Product Owner before any further production changes.

### Historical next decision — resolved by Product Owner approval

The Product Owner approved the inventory, behavior choices and implementation plan.
See `tasks/uiux-parity-plan.md`: 14 remaining-work rows, three slices, D1–D4 policy
choices and eight additional task scenarios linked to the unchanged 41-task audit.
That approval did not authorize unrelated feature/schema/package policy, release,
commit/push, Pages or Service Worker work.

### Audit review result

Legacy connected-source and Native contract audits identified additional gaps in
new-pin color reuse, attachment indicators/reuse, and contextual help. The plan
also addresses existing repeated image previews and deletion-to-collaboration
orphan-media refusal. Review caught that displaying the saved review set alone
does not let users share a newly created set; explicit review-set selection is
now a proposed contract choice, not an implemented feature. Read-only plan reviews
and self-review corrections are complete; product approval and live acceptance
remain open. This run changed documents only and did not rerun production tests.

## Previous boundary — approved UI implementation, not release

The Product Owner approved the refined design and requested a code-backed
existing-function/UI crosswalk before implementation. The implementation contract
and crosswalk are in `tasks/uiux-implementation.md`. This supersedes the historical
no-implementation boundary below; it does not approve schema/dependency changes,
new media formats, release, deployment, Pages or Service Worker changes.

- [x] Recheck branch/HEAD/worktree and local origin tracking divergence (0/0).
- [x] Independently cross-check all 42 existing function groups against source;
  record immediate-save, picker, mode and image-viewing caveats.
- [x] Separate approved UI-only color filtering (P01) from existing functionality.
- [x] Slice 1 code: one start screen with retained intake, creation and project management.
- [x] Slice 2 code: common status/header and four tabs, independent Caption list/details.
- [x] Slice 3 code: direct color filters and explicit mode/recovery presentation.
- [x] Run typecheck, full tests and build; add focused UI regression checks.
- [ ] Complete the independent final diff review. Interim findings were corrected;
  the workspace reviewer stopped before a final conclusion. No final approval claimed.
- [ ] Verify rendered Desktop UI and mobile-sensitive behavior. Browser connection
  retried on 2026-09-05 and failed during runtime initialization; no live credit.

### Next action

The three bounded UI slices are implemented in the uncommitted worktree, preserving
accepted save rollback. Next: rendered Desktop walkthrough, physical iPhone checks
and completed independent review. Browser initialization remains blocked. Do not
claim candidate PASS, commit/push or release from automated checks alone.

### Implementation review result

Final automated checks: typecheck PASS; 69 test files / 1572 passed / 21 existing
todo; build PASS with chunk/import warnings; diff whitespace check PASS. Thirty
new tests cover the actual UI composition/marker methods using controlled substitutes,
not rendered pixels. Existing 42 function groups are mapped and P01 is separate.
No release, schema/dependency/package-policy change, commit or push was performed.

## Historical boundary — public-candidate UI/UX audit and design

> Audit input: `d2302ec7e31e563448393ae3b42798e27d219b14` on
> `g0-baseline`; production implementation remains `6b2a28a`.
> Status: `DESIGN DIRECTIONS APPROVED / DETAILED SPECIFICATION PENDING / LIVE INTERACTION BLOCKED / NO IMPLEMENTATION APPROVAL`.
> The Product Owner confirmed ordinary home `/` displays in the Codex browser
> and authorized autonomous work within the existing audit/design boundary.

- [x] Read the prescribed current documents and teach back the product model.
- [x] Check branch, HEAD, clean worktree, existing origin divergence and unpushed
  commits; record the exact privacy/process-check limits in the audit report.
- [x] Start the prescribed local Vite command and request ordinary home `/` in
  the Codex browser; obtain Product Owner confirmation that home is displayed.
- [ ] Complete the 41-task live walkthrough and record actual operation counts,
  decision counts, recovery behavior and elapsed time. Browser control currently
  fails during initialization; no interaction measurement is credited.
- [x] Record the code-backed task map, findings, LociMyu pattern comparison,
  information architecture, state/recovery flows and low-fidelity wireframes.
- [x] Check proposed changes against the accepted contract and limit the proposal
  to at most three bounded slices with acceptance and explicit exclusions.
- [x] Present the design draft with evidence gaps to the Product Owner and stop before
  production implementation. Stop the temporary server at the end of this run.
- [x] Create schematic code-derived review images. Fidelity corrections are
  recorded in `tasks/uiux-audit-design.md` §13; these are not exact screen captures.
- [x] Verify the image set at desktop and narrow widths, exclude private source
  identifiers, and hand it off for Astra review without changing production UI.
- [x] Review image fidelity and current code; record user-task priorities and
  corrections from the Product Owner's image review.
- [x] Replace the two-home proposal with one start screen, specify file-intake
  wording and Caption-first Desktop/iPhone layouts, and revise the three slices.
- [x] Check the revised design against storage/selection/format boundaries and
  present the recommendation with concrete acceptance tasks.
- [x] Research current primary UI guidelines and distinguish platform guidance,
  usability heuristics, and web accessibility requirements.
- [x] Reassess current UI and the previous design against those sources; record
  concrete corrections, counterarguments, evidence limits and acceptance checks.
- [x] Independently review the guideline-based proposal, verify documentation,
  and present it without production implementation or release actions.
- [x] Record Product Owner agreement on the three design directions and clarify
  the coverage and remaining work for palette, icons and visual design review.
- [x] Clarify the requested clean/traditional/research visual direction before
  starting the renewed holistic audit; use Endfield/NieR as mood references,
  not as copied assets or mandatory game UI patterns.
- [x] Define one consistent UX/visual rubric and reassess the weakly covered
  palette, icons, typography, spacing, component states and cross-screen coherence.
- [x] Present source-backed corrections and a coherent visual direction, preserving
  the existing no-implementation boundary and unmeasured live-audit status.

### Next decision

- [x] Apply the PO's placement decision: color circles directly above the Caption
  list, below search/owner fields, not in the 3D toolbar. Recheck DOM placement,
  direct toggles and preserved state. Preview/design only; browser rendering unverified.

Current refinement: restore direct color-circle toggles and remove redundant copy
throughout the preview, while retaining target, save, failure and destructive-action
information. Design/preview only; no production implementation.

- [x] Define a compact-label rule and review repeated labels across all four tabs.
- [x] Replace modal color filtering with visible circles; simplify the floating window.
- [x] Shorten or relocate explanatory copy without removing functions or safety context.
- [x] Self-review direct access, accessible names, selection and recovery; submit the preview.

Refinement result (§23): one always-visible circle row replaces the color dialog;
the floating window uses its title and × without the selection prefix. Shared and
tab labels are shorter; contextual help and confirmations retain the necessary
save/target/failure boundaries. Existing 42 groups and P01 remain represented.
Sixteen direct-toggle states, seven dialogs, selection/recovery, accessible names
and existing color checks pass in the simplified DOM checker. Independent review
and self-review corrected a stale recovery instruction and preserved the selected
title needed during scrolling. Actual browser/device rendering remains unverified.


Current correction: distinguish the floating Caption window from the fixed editor,
and compare the missing pin-color filter with original LociMyu behavior. Design only.

- [x] Verify Native window/connector and legacy color-filter behavior against source.
- [x] Correct the preview and design: floating-window intent, visible color-filter
  proposal, explicit list/3D scope and hidden-selection recovery.
- [x] Self-review and check preserved interactions; report current vs proposed behavior.

Correction result (§22): the fixed bottom card was a mock simplification, not a
product decision. The preview now connects a movable Caption window to its pin.
P01 adds a concrete multi-color pin-visibility proposal, independent from list
search and content color edits, with hidden-selection explanation and recovery.
Sixteen color combinations and eight dialog routes pass simplified DOM checks;
window/line movement and a narrow-stage overlap warning pass bounded geometry
checks. These do not establish browser rendering or physical-iPhone acceptance.
Native production remains unchanged; P01 implementation still requires approval.

Current review: the accepted tone is retained. Functional grouping and discoverability
have been checked against current LociView controls, the 41 tasks and LociMyu browsing
aids. The revised design and preview are ready for Product Owner review; production
implementation and legacy-only feature additions remain unapproved.

- [x] Inventory current Native/home/package controls and LociMyu user-facing aids.
- [x] Map every function to a discoverable surface; distinguish existing, legacy-only
  and intentionally excluded capabilities without silently expanding support.
- [x] Complete the preview and design correspondence for common, tab and contextual flows.
- [x] Self-review omissions, duplication, target/state safety and compact access;
  correct findings and present the bounded result with unmeasured evidence explicit.

Review result (§21): retain four task-oriented tabs, with shared Project/DisplaySet,
camera shortcuts, purpose-specific file exchange and help outside them. All 42
inventoried current feature groups have design/preview locations; all 41 tasks map
to those groups. Self-review and two limited independent placement reviews corrected
compact creation access, persistent placement/move exits, normal attachment flow,
model target confirmation, camera/default-view wording and missing browsing controls.
The preview's simplified DOM checks pass for seven dialog routes, combined filters,
conditional model tools, media navigation, state preservation and 144 declared color
pairs. This is not live-browser, native file-dialog, 3D, save or iPhone evidence.
Legacy-only gaps and their proposed locations are explicit in §21.4, not silently
added to the three production slices. Branch/HEAD and existing origin comparison
remain unchanged (0/0); only audit documents and the external preview were edited.

Current PO decision: adopt the low-chroma tan/greige direction in §20.4. A logo
will be supplied by the Product Owner later; use a quieter temporary wordmark now.
This accepts a visual direction, not production implementation or device UX closure.

- [x] Replace the prominent serif wordmark with small, regular system sans in the preview.
- [x] Verify the limited change and record the palette decision and logo placeholder boundary.

Review result: the temporary wordmark is 14px regular system sans with the existing
muted-text token. Its two CSS rules pass static independent review; the existing
144 color-pair and interaction checks pass again. No new font, logo asset or
production UI change. Actual font rendering and wrapping remain unverified.

Previous refinement: reduce the tan palette's saturation toward a warm greige,
using the NieR creator's beige color direction without copying texture or decoration.

- [x] Update only the tan light/dark palette and make it the preview's initial choice.
- [x] Recheck contrast and preserved interactions; show the revised design, not production UI.

Refinement result: §20.4 uses low-chroma warm greige, with the same detail-button
boundary. The 144 scoped color checks include eight added tan muted-text pairs;
state checks pass again. Actual rendering remains unverified; PO palette agreement
is now recorded above.

Previous PO decision: continue with the §19 tone and component direction, with
the exact palette still open. The low-priority detail button must remain visibly
button-like. Compare green, light tan, light blue and neutral gray in the same UI.

- [x] Give detail/return buttons a visible surface and border without primary emphasis.
- [x] Add four coherent palette families while keeping layout, content and 3D fixed.
- [x] Verify palette/state combinations and preserved selection, obtain a read-only
  critique, and present the comparison without production implementation.

Review result: §20 records the detail-button correction and four palette families
with light/dark variants. Eight palette/theme transitions preserve work state in
the DOM substitute; 136 declared color pairs pass the scoped static checks. The
read-only CSS critique found no additional issue in the changed scope. These are
not rendered/browser/device evidence. Palette preference is resolved above; no UI implementation.

Previous PO follow-up: retain LociMyu's functional-tab philosophy while organizing
the other tool groups, and refine restrained color, corners, typography, border
hierarchy and pressed feedback using the three supplied visual references.
This is design refinement, not authority to implement UI or change functionality.

- [x] Inspect the supplied references to the extent accessible; separate creator
  intent and guidance from the two galleries whose images remain unviewed.
- [x] Propose tab membership, shared context and state-preserving transitions;
  define one coherent component/typography/color/state specification.
- [x] Update the design comparison, independently review it and verify its limited
  interactions; present the result without production or release changes.
- [ ] Visually inspect the two supplied gallery references when their images are
  available. A non-blocking request for representative screenshots was sent.

The functional/shape proposal is §19 of `tasks/uiux-audit-design.md`: four
whole-workspace tabs, Caption list/details preserved within Caption work, common
selection recall elsewhere, restrained shape/typography/border and press states.
Independent design review found no scope blocker; static CSS review found and
corrected a compact selected-button color/background mismatch. Tests cover 20
selections, four groups and three state samples; §20 expands palette checks, not
actual browser rendering, focus, device behavior or CSS conformance.

Previous PO request: reconsider the below-viewport Caption list placement using
primary evidence from analogous applications/games. Evaluate a right-hand list
and selected-record workspace by repeated selection tasks and constrained heights,
not by a three-row screenshot. Preserve the no-production-implementation boundary.

- [x] Research analogous list/viewport/inspector patterns and distinguish facts from inference.
- [x] Compare below-viewport, right-docked and three-column layouts; define scroll,
  selection/camera/focus, dirty-state and narrow-screen behavior.
- [x] Revise the recommendation and preview, independently critique it, and record
  acceptance gaps without claiming live browser or physical-iPhone measurements.

Caption-layout proposal: `tasks/uiux-audit-design.md` §18 supersedes the below-viewport
list with a right-hand list above selected details, independently scrolling with
a persistent selection identity. Low-height/mobile uses list/detail navigation,
not a long page. The 20-record comparison has static interaction checks only;
actual geometry, browser focus, adaptive height and device evidence remain open.
Await PO review; retain the three boundaries in §16.8 and no implementation approval.

PO correction: the action label is "メディアを追加…", with the currently
accepted image formats stated separately. A Caption list is a primary browsing
surface, not merely a collapsed entry. Revise the design/example accordingly.
The existing LociMyu comparison used documentation, not a live original-UI audit;
verify the original UI evidence before claiming its interaction patterns are
confirmed. Current LociView test UI constrains facts about implementation, not
the completeness or arrangement of the intended product UI.

- [x] Correct media wording and make the Caption list visible in the proposal.
- [x] Record exactly what original LociMyu UI evidence is available and reviewed.
- [x] Verify the corrected design/example without changing production code.
- [ ] Obtain actual original-LociMyu screen/interaction evidence; archived alpha
  source inspection is not live UI verification or proof of the currently used version.

The current request is a renewed holistic UX and aesthetic review, emphasizing
the weakly covered visual design. The Product Owner clarified that light and
dark should be compared before choosing; the mood is quiet research documents
with a small amount of instrumentation. Use identical layout/content for both
palettes and one rubric across all screens. Game references are inspiration,
not permission to copy assets or sacrifice readability.

The Product Owner agreed to the recommended common home file entry, explicit
pin-placement mode with non-drag/keyboard alternatives, and preserving unsaved
editing in memory after a failed save. The decision and its limits are in
`tasks/uiux-audit-design.md` §15; this is not implementation authorization.
Define the bounded input/recovery contracts and acceptance, then revise the
at-most-three-slice proposal before implementation. The preceding UI-only slices
do not yet include those input/recovery changes. Visual design is in audit scope,
and the code-backed holistic reassessment is recorded in §16 with ten findings,
light/dark comparison, state rules and an updated at-most-three-boundary proposal.
Next, the Product Owner can compare palettes and correction priorities; exact
replacement specifications and rendered/device verification remain incomplete.
No color/icon approval, two-theme feature decision or live UX PASS is implied.
The earlier proposal to preserve two visible home screens is superseded.
Live walkthrough evidence remains separate and incomplete. No new iPhone run,
HTTPS tunnel, dependency, schema, media capability, release, license, version,
main, Pages or Service Worker action is authorized here. Accepted Native and
physical-iPhone product results remain closed; fresh UI evidence cannot be
inferred from them or from the dev server.

### Audit review

The functional-tab and surface-refinement follow-up is recorded in §19. Source
inspection, two read-only research/review lanes, independent draft review, static
prototype interaction checks and color calculations are complete within stated
limits. Both image galleries and rendered/device acceptance remain incomplete;
Codex browser initialization failed again. Only design/task documentation and the
thread-scoped comparison changed. No runtime dependency, font download, private
source data, production test/build, server, tunnel or release action was added.

The Caption-placement follow-up used official Unreal, Acrobat, Unity, Apple HIG
and NieR creator documentation, distinguishing observed documentation from design
inference. Two research lanes and an independent static prototype critique informed
§18. Selection, search, owner separation, local-scroll calculations and compact
navigation calls passed the isolated mockup checker; no rendered or product PASS.
Only this plan, lessons and the audit draft changed in the repository.

The renewed holistic review used the clarified research-document/instrumentation
direction and primary HIG color/type/icon guidance, alongside the preceding
accessibility and usability sources. Independent code/design reviews led to
corrections in state styling, disabled explanations, mobile ordering and repeated
record access. The thread-scoped comparison has static markup/script/state and
literal-color checks only; no new pixel/browser/device acceptance is claimed.
Browser initialization still fails. No production code, contract, dependencies,
private source data, server or release artifact was changed by this reassessment.

`tasks/uiux-audit-design.md` contains all 41 code-mapped tasks, unmeasured live
metrics, the three-way decision classification, findings, wireframes and three
unapproved slices. A bounded independent read-only check confirmed the existing
save/selection/package constraints; no feature change is inferred from UI polish.
F13 records a still-unmeasured review-export versus transient DisplaySet-selection
question requiring live confirmation and, if needed, Product Owner interpretation.
Document checks passed: all task IDs 1–41 once in the task table, all metrics
unmeasured, exactly three proposed slices, whitespace/diff checks, no production
changes. No application test/build matrix was rerun for this docs-only work.
The temporary Vite server was stopped and port 5173 verified non-listening.
The original live audit remains incomplete; this plan does not amend product
specifications or grant implementation/release approval.
Eight thread-scoped code-derived review images and one combined overview were
rendered and visually checked. They cover ordinary home, LociMyu confirmation,
Native project intake, conventional-view conversion, Desktop editor, Caption and
image review, package/error recovery, and the current narrow-width editor. They
contain generic sample content only, are explicitly labeled as reconstructions,
and do not count as live walkthrough or browser acceptance evidence.
The subsequent image/code review found omissions and invented presentation
details, including a Native mobile sheet handle and confirmation wording.
The design document §13 records those corrections; image dimensions and control
positions are not measured application evidence. Sections 7, 9 and 10 now follow
the Product Owner's one-home, purpose-led intake and Caption-first direction,
with Desktop/iPhone wireframes, ten concrete user scenarios and three bounded
implementation proposals. Only design/task documents changed.
The guideline-based reassessment is in the same document §14. Apple HIG,
WCAG 2.2/WAI-ARIA, NN/g and GOV.UK primary guidance produced nine findings,
revised §§7/9/10, and explicit criteria instead of unmeasured usability scores.
Two read-only reviewers checked interaction design and accessibility separately.
The proposed three slices do not resolve input recovery after save rollback or
all 3D keyboard/non-drag alternatives; these remain explicit scope decisions,
not hidden post-candidate polish or a WCAG-conformance claim.

> Accepted result/document checkpoint:
> `5f2a19df9fcfd50215d1313c1265e6cdf82872b4`; exact executable checkpoint:
> `0b5dd461d761fc0669b1c0c80b3d6549cd01b1e6` on `g0-baseline` (2026-09-03).
> Direct-LociMyu product acceptance and Native
> Package Exchange are complete. Product Owner Desktop and physical-iPhone
> acceptance, including save and completely offline reopen, passed with no
> unresolved P0/P1.
>
> The completed task ledger through `d32a6a0` is preserved at
> `docs/history/task-ledger-through-d32a6a0.md`. This file contains only the
> active delivery boundary first; later completed post-checkpoint notes remain
> below as provenance and are not an active plan. Fresh sessions start at
> `tasks/handoff.md` and the “Next decision” section below.

## Completed production slice — Native Package Exchange

- [x] Record completion-gap audit: ordinary streamed backup/restore exists;
  collaboration merge, conflict reporting/idempotence, review/share, clean
  editable copy and purpose-aware UI do not yet exist.
- [x] Freeze the bounded package/baseline/merge/privacy contract in
  `docs/specs/02-storage-package-migration.md` §30. Keep backup v1/v2 unchanged.
- [x] Add optional snapshot-v1 collaboration baseline with Project ID lineage,
  canonical baseline ID and unsupported-state digest; old snapshots remain
  readable and first collaboration export freezes one fixed baseline.
- [x] Add one exchange manifest v1 with explicit collaboration/review/clean-copy
  purpose and strict entry/path/size/hash validation over streamed stored ZIP
  entries.
- [x] Implement pure Caption/new-media three-way merge and complete conflict
  reporting, including same-field, delete/edit, duplicate ID/media and
  unsupported non-Caption state.
- [x] Publish a successful merge by verified new-media staging, merged
  snapshot-last and active-marker-last; conflicts and failures perform no active
  Project write.
- [x] Build allowlisted fully re-keyed review snapshots and full clean-copy
  snapshots with a fresh Project ID, excluding collaboration/source/report
  metadata and preserving required Representation/media bytes.
- [x] Add purpose-clear export/import controls. Merge only into an explicit
  clean Edit target; review opens View, collaboration copy/clean copy open Edit.
- [x] Reuse one representative two-workspace acceptance for non-conflict merge,
  image media, reopen, backup/restore, idempotence, conflict zero-write,
  lineage, review and clean copy. Add no broad merge matrix.
- [x] Run focused checks while developing, one independent read-only review,
  then one final serial typecheck/test/build matrix on the final executable
  tree. The exact implementation tree passed typecheck, 60 files / 1,478 tests
  with 21 existing todo, production build and independent targeted re-review.
  Do not rerun it for result-only docs.
- [x] Ask only the minimal physical-iPhone smoke after Desktop PASS: restore the
  merged Project, inspect Caption/images and DisplaySet switching, save and
  completely offline reopen. The Product Owner accepted restore, merged
  Caption/image state, save and completely offline reopen on physical iPhone;
  the already accepted DisplaySet smoke was reused because the merge fixture
  has one DisplaySet.

### Result

- Start checkpoint: `a83aa09869bd373280860dce7a5e6181ea70628d`.
- Direct-LociMyu acceptance synchronization: `aa3a55b`.
- Exact implementation commit: `0b5dd461d761fc0669b1c0c80b3d6549cd01b1e6`.
- Desktop PASS: non-conflict Caption/image merge, idempotent re-import,
  conflict zero-write, lineage rejection, purpose-aware review/share and clean
  editable copy, backup/restore and offline reopen.
- Physical iPhone PASS: restored merged content, Caption image, save and
  completely offline reopen; prior accepted DisplaySet switching remains
  applicable and was not repeated.
- For Native Package Exchange, no P0/P1 is open; its P2 is wording/visual
  polish only.
- Existing streamed complete backup remains a distinct compatible purpose;
  package exchange uses explicit collaboration/review/clean-copy purpose v1.

`NATIVE PACKAGE EXCHANGE: PASS`

Stop conditions: stop for Product Owner judgment only if one fixed baseline is
insufficient for normal use, Caption-only merge cannot stand without merging
other Project metadata, backup compatibility would break, review disclosure
needs a new privacy decision, or a general history/CAS/journal/CRDT becomes
necessary. Do not main-merge, adopt a license or deploy after this slice.

## Active production plan — Native-only first public candidate

> Status: `OPTION A BOUNDED IMPLEMENTATION / AUTOMATION / PRODUCT OWNER ACCEPTANCE PASS`.

- [x] Product Owner selected option A on 2026-09-03: Native is the sole
  user-writable Project authority. Legacy v1 is safe import, View and
  non-destructive Native conversion only; Native collaboration merge remains.
- [x] Record the bounded product, storage/conversion and release-gate contract in
  `docs/specs/00-product-contract.md` PROD-15,
  `docs/specs/02-storage-package-migration.md` section 31 and
  `docs/specs/03-gates-and-delivery.md` section 3.8.
- [x] Product Owner confirmed the bounded production implementation plan and
  `RC-A-01` through `RC-A-07` before code changes begin.
- [x] Add one production policy/service boundary that never grants legacy
  mutation capability, plus an exclusive source-snapshot guard for conversion.
- [x] Reconcile new-package v1 import with the frozen contract: retain and
  location-report malformed source lines, keep them non-active, and block Native
  conversion whenever load errors or divergent operations remain. Close the
  existing open-ingress known-field cases without building durable quarantine;
  divergent same-key input must open no authoritative View.
- [x] Close the existing bounded v1-package import completion-manifest-prefix
  failure so every restart/listing sees either no Project or the exact complete
  source and the same package can be retried safely. Treat the marker path as a
  candidate until parse plus exact closure verification; add no general journal.
- [x] Remove every public legacy creation/Edit/escalation/dispatch/CSV/model/
  media/package-export/CSV-export/ZIP-merge route. Same-ID v1 re-import must not
  merge or overwrite; add no replacement source-download feature.
- [x] Remove device-local legacy-source deletion from the candidate UI; open,
  view and non-destructive conversion are its only public purposes.
- [x] Disable legacy registration and conversion when durable OPFS is
  unavailable; update the current MemoryFS/export warning so no transient result
  is presented as saved. Preserve exact operation entry bytes and reject invalid
  UTF-8 rather than normalizing it through decode/re-encode.
- [x] Keep valid v1 View/conversion. Add one short ordinary-home label/help route
  that makes the existing direct LociMyu conversion discoverable without adding
  an importer. Do not change Native backup/restore, Package Exchange or Spark
  loading.
- [x] Prove in automated coverage the service-level zero-write enforcement,
  source-byte identity, bounded import interruption/retry, invalid/divergent
  non-activation, conversion lock/loss failure and Native non-regression.
- [x] Record one fresh Desktop open -> View -> conversion -> Native Edit/save/
  reopen flow. The Product Owner accepted the normal Desktop flow and then
  confirmed the corrective exact tree shows a newly placed Caption pin and
  overlay before save. Reuse the accepted physical-iPhone evidence for an
  already converted Native Project's restore, save and completely offline
  reopen; this correction changes no mobile API, renderer or storage path.
- [x] Run independent read-only review with no P0/P1, then the indexed-tree
  typecheck/full-test/root-build/Pages-path-build matrix: typecheck PASS, 61
  files / 1,501 tests PASS with 21 existing todo, both builds PASS, and three
  independent reviews report no remaining code P0/P1.
- [x] Classify one later Windows parallel-load-only 5.296-second timeout in the
  old G0 evidence-verifier suite: there was no assertion failure, the same tree
  had already passed twice, and immediate single-test plus full-file reruns
  passed (1/1 and 82/82). Change only that test's timeout if exact-commit clean
  CI reproduces the failure; do not reopen the old G0 workstream now.
- [x] Record the exact candidate implementation SHA only after its commit exists:
  bounded option-A implementation `9c5596b6df712df0105904c9f2e0ecc62e1440a0`;
  accepted corrective executable commit
  `f6c88967155b0c83d4bcdd4fec6b4a78d9caf772`.
- [ ] Adopt the project license and third-party/built-output notices.
- [ ] Choose the public-candidate application version and exact release SHA.
- [ ] Decide the main integration/deployment gate and create a named rollback
  point before integration.
- [ ] Run clean-tree CI and verify Pages/base-path/service-worker delivery,
  including Spark absence from the normal route/precache and absence of private
  representative source bytes.
- [ ] Remove the manifest's advertised POST share target before the candidate,
  unless a separate Product Owner decision authorizes and accepts its missing
  Service Worker/application handler. Do not implement a new share feature as
  release hygiene.
- [ ] Refresh README and ordinary-home LociMyu discovery after the candidate
  contents are fixed; decide whether private-artifact fingerprint/name metadata
  may remain public.

Option A does not complete G0S-S2/S3, adopt a license/version, authorize `main`
integration or authorize GitHub Pages deployment. Writable-v1 gates return if a
future candidate re-enables legacy writes. Stop if RC-A requires a v1 wire
change, journal/quarantine/resolution framework, Native schema/Package Exchange
change, unguarded conversion fallback or a newly reproduced P0/P1.

`LEGACY V1 RELEASE MODE: PASS`

`RELEASE CANDIDATE OPTION A: PRODUCT OWNER ACCEPTANCE PASS`

## Completed implementation — first-candidate device-side HEIC compatibility

> Status: `PRODUCT OWNER ACCEPTANCE PASS`.

- [x] Supersede direct HEIC/HEIF candidate admission with a documented local
  device-side JPEG-export compatibility flow. Keep direct original-byte HEIC as
  required post-candidate work; do not require Windows extensions or ship the
  isolated decoder PoC.
- [x] Update the accepted product/storage/LociMyu contracts before production
  work. No Native snapshot/package version, dependency, license or provider
  registry changes belong to this slice.
- [x] Make direct Native Caption-image admission derive the supported image
  kind from bytes, reject HEIC/HEIF (including disguised declarations) before
  any write, and return concise Japanese device-side JPEG guidance.
- [x] Show the same compatibility boundary in the ordinary Caption and
  LociMyu-conversion flows without requiring a global camera setting.
- [x] Give every LociMyu HEIC/HEIF entry an explicit reported disposition; an
  exact file-ID relation keeps its Caption active with no attachment and never
  guesses the converted JPEG relation.
- [x] Reuse the content boundary for Native media publication so a renamed HEIC
  cannot enter through a direct add or package restore/merge path.
- [x] Add only focused direct-add, disguised-content, zero-write and LociMyu
  report tests, then run typecheck, focused tests, full tests, ordinary/Pages
  builds and the existing public-codec isolation verifier.
- [x] Obtain independent read-only security and UI final diff/risk reviews;
  both report no remaining P0/P1.
- [x] Commit this verified tree and record its exact implementation SHA. Stop
  before application-version selection, license adoption, `main` integration
  or Pages deployment.

### Result

- Start HEAD: `14257e0a13526f7233e474c0f61b259cd443933d`.
- PNG/JPEG/WebP/GIF admission is byte-derived and rejects empty-payload or
  declaration-conflicting containers before publication. HEIC/HEIF, including
  JPEG-disguised input, fails closed before any Native write with local
  device-side JPEG-export guidance.
- LociMyu HEIC/HEIF remains inventoried and reportable. An exact source relation
  names its DisplaySet and Caption but creates no attachment; an unknown
  relation is not guessed. The source ZIP remains unchanged and separately
  retained, and only a user-added JPEG becomes Native authority.
- Snapshot/package versions, dependencies, license, decoder, Service Worker and
  provider registry are unchanged. The isolated libheif/libde265 PoC remains
  outside production and built output.
- Verification PASS: typecheck; 65 test files / 1,542 passing tests with 21
  existing todo; ordinary and Pages-path builds; public-codec isolation check.
  Edge `152.0.4191.62` decoded the representative 1x1 JPEG/PNG/GIF/WebP through
  both `HTMLImageElement.decode()` and `createImageBitmap()`.
- Independent security and UI reviews report no remaining P0/P1. The Product
  Owner completed the physical-iPhone flow on this tree: direct HEIC selection
  failed closed with guidance, the separately exported JPEG was added and
  displayed, and the saved Project reopened with that attachment after Safari
  restart while completely offline. The temporary server and HTTPS tunnel were
  stopped afterward. Exact implementation commit:
  `6b2a28a0e5983676c9dc5d97534d916e3288f40d`.

`FIRST-CANDIDATE HEIC COMPATIBILITY: PASS`

## Active investigation — first-candidate single-still HEIC/HEIF

> Status: `INVESTIGATION CLOSED / LOCAL POC ISOLATED / DIRECT PRODUCTION DEFERRED`.

- [x] Record the earlier Product Owner direct-HEIC boundary and its later
  supersession. Section 29.3 now governs the first candidate: users make a
  separate JPEG on their device, while direct original-byte HEIC/HEIF support
  is deferred. The ordinary UI remains `添付メディア` with an image-add action
  and no unavailable video/audio controls.
- [x] Confirm read-only that the existing exact file-ID association, original-
  byte publication path, source-change lock and generic ordered attachment IDs
  are reusable. Current HEIC inventory does not promote HEIC into Native media,
  and both direct add and the viewer are limited to the four accepted image
  MIME types.
- [x] Test representative HEIC locally in the current Windows Edge without
  uploading it. Native `<img>`, `createImageBitmap` and `ImageDecoder` paths do
  not decode it, so browser-native support cannot close the candidate.
- [x] Confirm that silently widening Native snapshot schema 1 would cause the
  old reader to reject the Project and would also disturb the fixed
  collaboration baseline digest. A dual-read/new-write snapshot version and a
  defined baseline compatibility rule require Product Owner approval.
- [x] Product Owner selected a reproducible LociView-managed candidate build
  from exact libheif `v1.23.3`, libde265 `v1.1.2` and Emscripten `3.1.61`,
  without approving codec invention, LGPL distribution compliance or HEVC
  patent disposition. This supersedes the same-day `v1.1.1` selection after an
  upstream security release disclosed two memory-safety fixes; do not build or
  cherry-pick onto the rejected version.
- [x] Product Owner selected dual-read Native snapshot schemas `1`/`2` with
  schema-1 preservation for non-HEIC projects, monotonic upgrade on first HEIC
  admission and no automatic downgrade.
- [x] Freeze the original-source-byte authority, content inspection, Worker
  lifecycle, package/baseline, media-stage, offline and focused acceptance
  boundary in section 29.1 before production implementation.
- [x] Perform the one-time current formal-wrapper check. `heic-to@1.5.2`
  remains on libheif `1.22.2` / libde265 `1.0.16`, `@discourse/heic@1.0.0`
  remains on `1.19.7` / `1.0.15`, and upstream `@jsquash/heic` has no formal
  release. None meets the required codec baseline or complete request cancel,
  Worker, transfer, budget, primary-still and cleanup contract, so none is
  adopted.
- [x] Run the physical-iPhone 14 Pro local-only native HEIC smoke before any
  WASM build and select native-first or WASM-fallback behavior from the result.
  Safari decoded an actual HEIC selected from Files through both `<img>` and
  `createImageBitmap` at `3024 x 4032`; orientation and mirror/rotation were
  correct. Structurally truncated and corrupt probes failed explicitly. A
  same-session IndexedDB copy decoded after Safari restart and while fully
  offline, and the final Blob-URL registry check confirmed release after
  revocation. Therefore physical iPhone uses browser-native decode first; WASM
  is not an unconditional iPhone path. The local-only LAN server was stopped
  after the smoke and no source bytes entered Git, docs, fixtures or build.
- [x] Build the isolated exact-source decoder PoC and close focused Edge plus
  applicable iPhone acceptance. Stop before production integration on a public-
  distribution blocker, iPhone memory crash, nondeterministic output, incorrect
  orientation or inability to cancel safely. The pinned libheif `v1.23.3` /
  libde265 `v1.1.2` / Emscripten `3.1.61` build passed bounded Wasm decode,
  orientation, same-origin offline reload, deterministic repeat, cancel,
  timeout, stale-selection and fail-closed malformed/unsupported/sequence
  checks in Edge. The native-first iPhone smoke also passed restart, complete-
  offline reopen and resource release. Exact evidence and generated output
  digests are recorded in `scripts/heic-decoder-poc/POC-RESULT.md`. The final
  project regression passed typecheck, all 62 test files / 1,503 tests (21
  existing todo), and the production build without adding a dependency or
  shipping decoder assets.
- [ ] **DEFERRED — distribution decision required before direct HEIC.** If the
  public-distribution blockers are resolved after the first candidate,
  implement only the single-still HEIC/HEIF
  end-to-end path: original-byte identity, bounded content admission, lazy/
  offline decoding with orientation and cleanup, direct/LociMyu import, Native
  packages, Edge and physical-iPhone evidence. Production schema/UI/package
  code has not started.
- [x] Obtain at most two independent read-only reviews for decoder/security and
  distribution/license risk. No isolated technical P0/P1 remains. Production
  and public distribution remain blocked on an approved LGPL corresponding-
  source/relink/notice kit, exact Windows compiler payload/runtime inventory,
  and a separate HEVC patent decision.
- [ ] After later direct-HEIC production integration is authorized and
  implemented, run one final executable-tree matrix and one final physical-
  iPhone production acceptance.

### Approved public-codec isolation follow-up

- [x] Record the Product Owner decision in section 29.2: retain HEIC as a
  product requirement, keep the exact libheif+libde265 Wasm only as a local
  PoC, and do not publish or automatically fall back to it.
- [x] Read-only inventory Git, dependencies, decoder/build inputs, production
  imports, Vite, `public`/`dist`, Service Worker, Pages and CI. The tracked PoC
  recipe/bridge is public source but unreachable and unbuilt by ordinary UI/CI;
  generated decoder inputs/outputs are ignored and local-only. No decoder
  package dependency or public binary artifact exists.
- [x] Add the smallest CI/release-path guard that detects a libde265 PoC import,
  known decoder output/digest or libde265-specific symbol in public build
  output. Keep the approved tracked PoC source/build recipe allowed while its
  generated output remains local-only. The guard runs after the Pages build and
  before upload, and on `g0-baseline`/PR CI.
- [x] Verify the final local PoC link/output contains libde265 as intended but
  no x265, kvazaar, unwanted AV1/VVC encoder, GPL dependency or codec plugin.
  The link graph has no external encoder/GPL codec backend or plugin loader;
  generic libheif encoder/container objects remain, so encoder-code absence is
  `PARTIAL`, not claimed. Do not infer this from CMake option names alone.
- [x] Preserve the accepted iPhone native evidence and classify Display P3,
  ICC/HDR and any unexecuted input class honestly as `NOT TESTED`.
- [x] Implement and execute one isolated Windows Edge WebCodecs/OS-codec spike
  without libde265 or an encoder. Record `isConfigSupported()` separately
  from actual decode, extension-present/absent evidence actually available on
  this host, offline behavior and explicit unsupported failure. The bounded
  capability/provider spike contains no codec binary: Edge 152 exposes
  WebCodecs but reports both tested HEVC configurations unsupported, the
  current-user HEVC extension is absent, and actual decode is blocked. The
  pinned experimental libheif backend also has reproduced codec-string,
  multi-VCL and cleanup gaps, so no parser-only build was adopted or connected
  to production. Extension-present Windows remains `NOT TESTED`.
- [x] Express native Safari, WebCodecs and local-only libde265 as explicit
  provider responsibilities inside the spike; production registration and PoC
  fallback remain absent.
- [x] Re-run the existing regression boundary and final executable builds. The
  final local full suite reached 1,514 passing tests with 21 todo; seven existing
  filesystem/evidence tests failed only while removing Windows temporary
  directories with `EBUSY`. The 49-test restore suite then passed in an isolated
  single-worker run; the G0 evidence suite still showed three nondeterministic
  post-test `rmdir` failures (79 tests passed), so clean Ubuntu CI is the release
  verdict rather than a product-code workaround. Typecheck, ordinary build,
  Pages-base build, harness build and the public-path isolation verifier passed.
  No Project schema/package code changed; the generated Service Worker still
  omits the Spark chunk from precache and contains no HEIC PoC or libde265 asset.
- [x] Classify technical, security, LGPL, patent and device blockers separately.
  Outcome `D — additional device testing required`: Safari native decode is a
  viable bounded provider, while this Edge host has no supported HEVC WebCodecs
  configuration and no current-user HEVC extension; an extension-present Edge
  test remains missing. Stop before libde265 production integration.

Exclusions: Live Photo MOV, animated HEIF/HEIF image sequences, burst, depth/
auxiliary UI, RAW/ProRAW, strict HDR/10-bit fidelity, image editing, cloud/
server conversion, and simultaneous video/audio implementation. Do not adopt a
public license position, finalize application/package release versions, merge
`main`, create a Release, deploy Pages, implement video/audio or begin general
UI/UX closure in this slice.

## Approved post-candidate product scope — Caption video and audio

> Status: `PRODUCT OWNER REQUIRED FUTURE SCOPE / NOT CURRENT RC IMPLEMENTATION`.

- [x] Record the Product Owner clarification that the current representative's
  lack of video/audio is accidental sample coverage, not evidence that those
  capabilities are unnecessary.
- [x] Keep the first public candidate and later product scope distinct: an
  image-first candidate does not cancel Caption video/audio development.
- [ ] Before production implementation, freeze one bounded media contract for
  exact containers/codecs, sniff/decode budgets, versioned Native schema and
  portable/exchange packages, collaboration/review/clean-copy behavior,
  mixed-media viewer UX, privacy and physical-iPhone/offline acceptance.
- [ ] Begin Caption video/audio as the first major media workstream after the
  first-candidate boundary closes, or earlier only after a separate Product
  Owner reprioritization and approved implementation plan. Reuse the accepted
  future `MediaResource`, `CaptionAttachment` and media-stage direction; do not
  widen snapshot schema 1 in place.
- [x] Verify the prior video/audio scope-only synchronization recorded in commit
  `7668c21e573153e67f4885ab036e278397ced660` with typecheck, 62 test files /
  1,503 passing tests with 21 existing todo, production build and independent
  read-only review; no P0/P1 remained in that wording.

This future requirement is not a new blocker for the already accepted
Native-only release mode. The current media audit's image/HEIC and unsupported-
media reporting decisions remain a separate candidate-scope decision; sample
absence must not be used to waive the later video/audio lane.

Review: only the accepted product contract, its non-normative direction summary,
the active task plan and this correction lesson changed. Production code,
dependencies, Native schema/package versions, license, application version,
`main` and deployment were untouched.

## Completed P1 — iPhone direct-LociMyu model activation

- [x] Reproduce on physical iPhone after a fresh reload: the grid appears
  briefly, then the WebGL canvas becomes blank while the durable Project,
  Caption list/overlay and requested `1/1` Asset visibility remain available.
- [x] Exclude Saved View framing and intentional material visibility. The
  representative cameras target the model, its bounds are normal and the
  active material state does not hide the whole model.
- [x] Identify the resource boundary: the source GLB embeds two 8192-square and
  one 4096-square textures (about 576 MiB decoded RGBA and roughly 768 MiB with
  mipmaps). Requested visibility currently masks Representation activation and
  WebGL-context failure.
- [x] Obtain Product Owner approval for one source-preserving mobile runtime
  texture cap; keep stored/exported source bytes and Desktop full-resolution
  rendering unchanged. The approved maximum edge is 4096 pixels on iPhone/iPad.
- [x] Implement the approved bounded runtime path, deduplicated Texture/
  ImageBitmap cleanup and truthful ready/error status without a new renderer,
  schema, package version or stored derivative.
- [x] Run focused tests, typecheck, production build and independent review.
  The 55 affected tests pass. The full matrix reached 1455 passes and only
  crossed the unrelated G0 verifier's fixed five-second timeout; each affected
  verifier case passes when isolated, so no product regression is inferred.
- [x] Repeat only the affected physical-iPhone open/DisplaySet/offline smoke.
  The Product Owner confirmed on physical iPhone that the representative model
  remains rendered under the bounded runtime path and accepted the requested
  smoke as having no observed problem.

Review: no unresolved P0/P1 remains after physical-device acceptance.
The representative JPEG/PNG path is bounded. WebP/AVIF dimension inspection
and pre-Safari-17 behavior are non-blocking compatibility backlog, not claims
of support added by this slice.

Stop conditions: no source-byte rewrite, persisted lightweight copy, automatic
asset replacement, new renderer, general LOD system or silent success after a
failed visible Representation.

## Completed correction — restore LociMyu sheet/material/view linkage

- [x] Reproduce the representative symptom read-only and distinguish source
  Caption content from conversion loss. The selected 39-Caption sheet has 38
  literal source `(untitled)` titles and no source image references.
- [x] Confirm the material gap: one exact relation activates 18 native slot
  appearances while 17 current source material rows and three views remain
  inactive for the other three sheets.
- [x] Product Owner confirmed the LociMyu invariant: selecting one Caption sheet
  switches that sheet's Caption group, material values and optional view as one
  native DisplaySet.
- [x] Approve one all-or-nothing confirmation of a relation proposal only when
  `__LM_VIEWS` and `__LM_MATERIALS` have the same unique GID order, it matches
  Caption-sheet count/order, and every exact registry row agrees.
- [x] Implement the confirmation UI and pass only the confirmed complete map to
  the direct converter. Keep Caption identity exact/fallback and unchanged.
- [x] Record source-exact versus user-confirmed relations in the conversion
  report; reject partial, stale or injected confirmations before publication.
- [x] Run focused conversion/UI checks, representative Desktop re-conversion and
  DisplaySet switching, then the final exact-tree matrix once. A fresh-origin
  conversion restored all four DisplaySets and the Product Owner confirmed that
  switching sheets immediately applies their material settings without any
  per-sheet re-save.
- [x] After Desktop PASS, run only the affected physical-iPhone DisplaySet,
  save/offline-reopen check and resume consolidated acceptance.

Stop conditions: do not add a generalized mapping framework, editable per-row
GID UI, media inference, HEIC conversion or Caption-content synthesis.

## Completed receiver gap — LociMyu orthographic Saved View

- [x] Confirm the source gap: LociMyu saves orthographic camera kind, eye,
  target and up but not its runtime orthographic height.
- [x] Product Owner approved the bounded compatibility approximation used by
  the legacy runtime projection toggle: `2 * eye-target distance * tan(FOV/2)`;
  use a valid source FOV or exactly 45 degrees when the cell is empty. Reuse the
  established all-empty up-vector default `[0, 1, 0]`; partial invalid vectors
  remain report-only.
- [x] Convert a valid orthographic row into the existing native Saved View and
  record the chosen FOV/span as an explicit compatibility approximation.
- [x] Keep non-empty invalid FOV, invalid camera basis and invalid computed span
  report-only; do not silently apply the 45-degree default to malformed input.
- [x] Prove immediate DisplaySet application plus snapshot/package round trip
  with focused coverage, one independent review and the existing final matrix.

Stop conditions: no camera migration framework, per-import span editor,
existing-Project retrofit, schema/package version change or generalized
projection inference.

## Completed P1 — Saved View authoring must drive DisplaySet switching

- [x] Reproduce the product flow and distinguish old-preview provenance from a
  current runtime defect. The defect exists independently of the preview URL:
  a newly captured view has the active `displaySetId` but is not linked as that
  DisplaySet's default.
- [x] Confirm the switch path applies only `defaultSavedViewId`; camera capture,
  explicit view application and updating an already-default view are intact.
- [x] Add one bounded domain action that appends the captured view and updates
  only the active DisplaySet's default pointer, including the legacy omitted
  `displaySets` case.
- [x] Prove two DisplaySets retain independent defaults, switching resolves the
  newly captured view, and snapshot save/reopen preserves the links.
- [x] Run focused checks, final matrix, production build and independent review.
- [x] Provide a fresh exact-tree Desktop acceptance URL and confirm the
  save-in-Set-A -> switch-to-B -> return-to-A camera/background product flow.

Stop conditions: no camera schema/package version change, active-sheet
persistence, view animation, multi-view framework or new default-selection UI.

## Consolidated native Product Owner acceptance

- [x] Desktop: exact-tree native route opened and the consolidated product flow
  was exercised, including visible GS rendering and the selected-Asset gizmo.
- [x] iPhone 14 Pro: the same consolidated native acceptance completed without
  a reported blocker.
- [x] The initial transform-gizmo target regression found during acceptance was
  fixed in `a2708cf`; typecheck/builds and focused checks passed, and the full
  suite's one unrelated timeout passed on immediate isolated rerun. Desktop
  visual confirmation passed before the physical-iPhone confirmation.
- [x] P0: none.
- [x] P1: none.
- [x] Classify this checkpoint as `CONSOLIDATED NATIVE ACCEPTANCE: PASS` without
  claiming G0, G0-S, G1, permanent renderer adoption or release approval.

## Completed native product boundary

The current native LociView path now supports, as one bounded product flow:

- project creation and ordinary home/open in explicit View or Edit mode;
- project-scoped single-writer locking, read-only fallback and durable reload on
  lock handoff;
- multiple independent Mesh, Graphdeco GS and ordinary Point Assets in one
  Project coordinate system;
- per-Asset visibility and independent position, rotation and uniform scale;
- explicit GS-to-Interaction-Proxy binding, Asset-specific picking and
  Asset-local Caption `positionAsset`;
- multiple Caption creation, selection, editing, search/filter and bounded
  deletion, plus Saved Views;
- Asset addition, replacement and guarded deletion;
- project snapshot save, close and completely offline reopen;
- streamed `.lociview` backup, local deletion, restore and offline reopen;
- native-only lazy Spark loading without loading the Spark chunk on the ordinary
  v1 route.

Mesh-only, GS-only and mixed display remain visibility combinations, not schema
modes. Compare remains outside the MVP/release critical path. Native LociView
project data is the durable source of truth; LociMyu is a read-only legacy input
path whose source is never overwritten.

## Completed critical path — first native migration

- [x] Inspect the existing frozen-v1 readers, LociMyu adapters, `ImportPlan`,
  native snapshot and storage boundaries without implementing migration.
- [x] Select opened frozen-v1 -> new native as the first input lane. The checked-in
  representative v1 package can use the existing validated import/open path;
  direct package conversion would duplicate that boundary. LociMyu remains a
  separate second adapter.
- [x] Keep the original v1 package/LociMyu ZIP outside the converted native
  project. The source remains read-only and the first converter emits an
  accounting report; it adds no automatic source copy or review sidecar.
- [x] Reproduce the concrete receiver gap with the representative v1 fixture:
  two DisplaySets, set-scoped material state, set views, image attachment and an
  unplaced Caption have no complete native snapshot-v1 destination today.
- [x] Verify the bounded implementation plan with the Product Owner. First add
  only the usable native receiver required by that input (DisplaySet,
  set-scoped Mesh appearance, Caption membership/media and unplaced Caption),
  then convert one opened frozen-v1 project end-to-end.
- [x] Keep snapshot v1 additions optional/defaultable, following the existing
  `savedViews` / `hiddenAssetIds` precedent. Image bytes require portable
  package v2, which the Product Owner approved; import remains dual-read v1/v2
  and media-free exports may remain v1.
- [x] Implement the native receiver: DisplaySet membership, exact set-scoped
  Mesh appearance, unplaced Captions and project-local Caption image media.
- [x] Implement the opened frozen-v1 -> new native converter and explicit
  accounting report for one representative fixture without changing the source.
- [x] Independent review: no open P0/P1 after fail-closed source-lock,
  DisplaySet-relation, media-closure, MIME and full-report fixes.
- [x] Desktop end-to-end: representative frozen-v1 import -> Edit open -> new
  native conversion -> DisplaySet/Caption/image use -> save/reopen -> portable
  backup/delete/restore passed Product Owner confirmation.
- [x] Final automated tree: typecheck and both production builds passed. The
  full suite passed 1,370 tests; two fixture suites failed only because their
  provenance specification was not yet indexed and passed 53/53 after staging,
  while one existing 5-second CLI timeout passed alone in 0.83 seconds.
- [x] Physical iPhone 14 Pro minimal smoke: `.lociview` restore,
  DisplaySet switching, Caption list/selection, migrated image display, save
  and completely offline reopen all passed Product Owner confirmation.
- [x] Classify the first bounded input lane as `FIRST NATIVE MIGRATION: PASS` at
  production commit `9d973cd8f84e14cc1d72562a01034754e3a1ed42`, with no
  unresolved P0/P1. Stop before the separate LociMyu adapter.

Required conversion invariants:

- frozen v1 to native and LociMyu ZIP to native are distinct input adapters;
- input is read-only and conversion never overwrites the source;
- the converted native project becomes the new durable source of truth;
- reuse canonical LociMyu Caption identity and duplicate-retention behavior;
- unknown/unrepresentable source data is reported rather than guessed away.
- DisplaySet remains Caption membership + set-scoped material appearance + an
  optional Saved View; it never owns Asset visibility or transforms.

## Completed direct LociMyu ZIP -> native adapter

- [x] Product Owner approved the bounded direct adapter and the
  `LM-ADAPT-*` acceptance in `docs/specs/04-locimyu-conversion.md`.
- [x] Select one private representative outer ZIP read-only and record its path,
  bytes, SHA-256, workbook/model/media inventory without copying it into the
  repository or build.
- [x] Replace the superseded device-local sidecar requirement with the
  separately retained original ZIP plus exportable conversion report. Add no
  sidecar, quarantine/review database or portable review continuity.
- [x] Implement one direct in-memory LociMyu projection into the existing native
  receiver. Do not persist an intermediate v1 workspace or activate ordinal,
  first/last, case-folded or fuzzy relationships.
- [x] Preserve every otherwise-valid non-empty Caption occurrence with
  `locimyu-caption-id-2`; block before publication on identity
  impossibility/collision and report every converted, inactive/unlinked or
  blocking item.
- [x] Reuse verified binary/media writes, snapshot-last/marker-last publication,
  project write lock and portable package; verify the source ZIP unchanged.
- [x] Run one independent migration/input review and focused checks. The review
  found no remaining implementation P0/P1.
- [x] Run the final typecheck/full test/build matrix once on the completed tree.
- [x] Historical pre-correction private representative preflight found 109 non-empty
  Caption rows and stopped before publication because six rows on
  `モデル確認用（透過）` lack stable legacy IDs; all six are reported, converted
  counts are zero and the source hash is unchanged.
- [x] Classify that pre-correction result as `FIRST LOCIMYU NATIVE ADAPTER: RETRY`.
  Converted-project Desktop/iPhone and portable-restore acceptance cannot run
  and are not inferred while no Project is published.

The earlier source-correction requirement is superseded by the Product Owner
decision below. The private source must remain unchanged.

## Completed approved correction — ID-less Caption rows are empty input

- [x] Product Owner confirmed that the representative six-row condition is a
  valid real-world case and approved treating such rows as empty.
- [x] Freeze the narrow rule before implementation: only a Caption row whose
  legacy-ID cell is empty after `LociMyuTrimV1` is skipped and reported. Invalid
  non-empty IDs, duplicate canonical keys and digest collisions still block.
- [x] Implement the direct-adapter projection without changing source bytes,
  guessing an ID or shifting later Caption row/attachment/position alignment.
- [x] Update the focused regression from blocked publication to one valid
  Caption plus two explicitly reported/skipped ID-less rows.
- [x] Rerun the one private representative through publication and portable
  restore: 109 source rows produced 103 Captions, all six skipped rows were
  explicit, no Representation/media was missing after restore, and source
  byte/hash identity held.
- [x] Complete one independent review and the final matrix. The review's one P1
  source-retention notice was fixed and re-reviewed; no P0/P1 remains.
- [x] Complete the approved Caption overlay and bounded Desktop product
  acceptance for the direct LociMyu result.
- [x] Complete the consolidated physical-iPhone product acceptance. The Product
  Owner found no problem in marker/list Caption selection, saved title/body/
  color/images, image-viewer navigation, temporary card move/resize, clear and
  reset behavior, DisplaySet switching, save and completely offline reopen.

## Completed bounded receiver closure — native Caption and material appearance

- [x] Confirm the current native renderer uses one fixed Asset-local Caption
  marker radius and has no native pin-size control or durable pin-scale field.
- [x] Product Owner rejected the narrow `0.3`–`3.0` slider: model-authoring
  units can differ by roughly two orders of magnitude, so numeric and wide-range
  slider input are both required.
- [x] Confirm native Caption color is already converted, validated and portable,
  but the native renderer ignores it and the native editor has no color control.
- [x] Product Owner confirmed a logarithmic `0.001`–`1000` multiplier
  slider plus synchronized positive numeric input for the selected Asset.
- [x] The initial receiver audit found the Caption color/pin-scale gap. Product
  Owner visual acceptance then exposed a separate P1 in the direct material
  adapter; the native material receiver itself already exists.
- [x] Record the compatibility boundary: optional/defaultable `pinScale` on
  native Asset in snapshot v1, omission means `1`, portable package unchanged.
- [x] Render and edit the existing per-Caption `color` without changing Caption
  schema or package version. Preserve source color; show selection/review state
  through scale/emphasis rather than replacing it with a fixed color.
- [x] Persist and render per-Asset `pinScale`, preserve it across Asset
  replacement and map valid frozen-v1 values into the native Asset.
- [x] Add field-level report entries for non-durable view/sheet-registry
  timestamps; do not create native history records.
- [x] Do not add per-Caption pin size, screen-space marker architecture,
  per-view appearance or generalized styling state in this slice.
- [x] Add only the focused clamp/render wiring coverage genuinely missing from
  existing acceptance, then run typecheck, full test and production build once.
- [x] Product Owner confirmed native Caption color and pin scale visually.
- [x] Trace the material P1: exact same-name source rows were rejected when they
  matched multiple slots, and source-enabled chroma was forced off.
- [x] Preserve the approved no-guess GID boundary. The representative source has
  exact authority only for GID `0`; rows for the other three Caption sheets stay
  inactive/report-only rather than using sheet order or first-seen inference.
- [x] Correct only the source-defined exact-name fan-out, source chroma enabled
  value and LociMyu blank-tolerance default; do not add a generalized material
  system or inferred mapping workflow.
- [x] Re-run the representative conversion: the one authoritative DisplaySet
  now has 18 explicit slot appearances, including 13 transparent and 3
  chroma-enabled slots; 17 source rows without exact GID authority remain
  inactive/report-only.
- [x] Product Owner confirmed the re-converted representative Desktop Project
  visibly applies the authoritative set's inherited opacity and chroma.
- [x] Stop receiver work after independent review and final verification. The
  native Caption overlay/window is the separate approved UI/UX slice below.

Review: Caption-focused schema/storage/converter coverage was 45/45 green and
the Product Owner accepted the visible pin result. Representative material
inspection then found all 14 transparent groups and all 3 chroma-enabled groups
inactive: four authoritative rows were blocked by the converter's repeated-name
bug, while 17 rows lack exact GID authority in the source. The latter remains an
explicit compatibility limitation under the approved no-guess rule. The bounded
fix produces 18 explicit appearances (13 transparent, 3 chroma-enabled) for the
authoritative set, passed focused 46/46, typecheck, production build and the
final failing-suite reruns; one independent reviewer found no P0/P1. Product
Owner then confirmed the inherited opacity/chroma in the re-converted Project.

Stop condition: stop before expanding into HEIC/video conversion, Caption tags,
legacy history, orthographic fallback, inferred GID mapping, new material
controls or a generalized appearance system. Those are not required by this
approved receiver closure.

## Completed approved UI/UX closure — native Caption selection overlay

- [x] Product Owner selected the native Caption overlay/window as the next slice
  after receiver completeness.
- [x] Record the bounded contract before implementation in
  `docs/specs/02-storage-package-migration.md` §29.
- [x] Selecting a placed Caption from its marker or list shows one stage card
  for that same stable Caption with saved color, title, body, up to three
  available image thumbnails and a visual connection to the marker.
- [x] Keep `selectedCaptionId` and the existing side editor as the single
  selection/edit source. Add no snapshot/package/converter, Caption, anchor,
  media or material schema.
- [x] Empty-stage click/tap clears selection. DisplaySet change, deletion,
  hidden owning Asset, unplaced Caption or missing marker closes/hides the card
  without creating, moving or guessing data.
- [x] Reuse project-local image reads for a simple fit/previous/next/close
  viewer and discard stale asynchronous results after selection changes.
- [x] Allow the selected card header to move the card temporarily within the
  stage, resetting on selection change, and let image previews use the available
  card width without changing stored bytes or project state.
- [x] Allow a bottom-right handle to resize the selected card temporarily in
  both dimensions, clamp it to the current stage, keep content scrollable, and
  reset to automatic size when the selection changes or closes.
- [x] Cover View/Edit and bounded Desktop/mobile layout. Reuse existing
  selection, visibility and media persistence acceptance; add only focused
  overlay-resolution/stale-load coverage and Desktop visual evidence.
- [x] Complete one independent read-only review and the final
  typecheck/test/production-build matrix with no unresolved P0/P1.
- [x] Close the Desktop visual regression found before acceptance: a visibly
  rendered Caption pin must remain selectable with a small CSS-pixel hit
  tolerance, and a pin that is only partially inside the stage must not cause
  the selected card to disappear. Do not change Caption data or persistence.

Stop condition: stop before attachment add/remove/reorder, video/HEIC, image
processing/zoom tooling, durable overlay placement or size, multiple overlays,
tags/history,
inferred GID mapping, generalized responsive redesign or unrelated Caption
authoring polish. Physical-iPhone confirmation is recorded once in the
consolidated direct-LociMyu acceptance rather than repeated per sub-slice.

## P2 backlog — not a completion blocker

- Give the native home one clear LociMyu ZIP conversion entry (or unified file
  intake) and distinguish it from `.lociview` backup restore; users should not
  need to enter the conventional-project screen to discover the correct lane.
- Replace format-specific Mesh/GS/Point input controls with one model-file
  picker; determine the supported format from file contents after selection.
- Group add, replace, remove and placement under one user-facing model-management
  area and reconsider the current section/tab names.
- Ordinaryize Caption placement/editing around the LociMyu user flow instead of
  exposing storage/Proxy/snapshot steps as separate technical controls.
- Improve wording such as `所属モデル` so it clearly includes Mesh, GS and Point
  Assets.
- Add Unity-style numeric dragging and immediate live placement preview during
  later UI/UX closure.
- Ensure Point-only appearance controls remain visually hidden for non-Point
  selections; do not reopen the accepted renderer path solely for this polish.
- Use visually judgeable representative data for future visual acceptance;
  retain tiny GS fixtures for format and round-trip characterization only.
- When Saved View compatibility tests next change, add the non-blocking legacy
  double-omission case where both `displaySets` and a Saved View's
  `displaySetId` are absent. The production resolver already maps both to the
  deterministic default set; this is coverage polish, not an open behavior bug.
- Refresh the public-candidate README only after the release feature set,
  version and exact release SHA are fixed; its present implementation summary
  is intentionally not rewritten during this result-only synchronization.

## Historical broader-support gate state — not first Native-only candidate blockers

- G0 external evidence and numeric/support ratification remain incomplete for
  later broader support claims.
- G0-S writable-v1 crash-consistency/quarantine closure remains incomplete and
  returns only if legacy writes are re-enabled.
- G1 adoption decisions remain incomplete; Spark is only the provisional first
  production GS path, without making those decisions a blocker for this first
  candidate.
- Broader release/device evidence is not inferred from the consolidated product
  smoke; the bounded candidate reuses the accepted Desktop/iPhone scope recorded
  in section 3.8.

## Review record

- The first converter reads an already-opened, durable frozen-v1 workspace and
  creates a separate native Project. It does not flush, overwrite or embed the
  source, and publication is guarded immediately before snapshot and marker.
- Native snapshot v1 retains optional/defaultable DisplaySet, exact Mesh
  appearance, unplaced Caption and image-media metadata. Image bytes remain
  separate project-local media inside the same user-visible package; packages
  containing media use portable package v2 while v1 remains readable.
- Supported first image media are PNG, JPEG, WebP and GIF. Explicit unsupported
  or conflicting MIME blocks conversion; unknown/unrepresentable values remain
  complete in the accounting report rather than being guessed or truncated.
- Independent read-only review found no remaining P0/P1. P2 remains whole-buffer
  legacy Mesh material inspection, report-download completion polish and
  inactive staged-byte cleanup after a publication guard failure.
- Final executable tree verification for `9d973cd`: typecheck and both
  production builds passed. The full suite passed 1,370 tests; two fixture
  suites passed 53/53 after the modified provenance specification was staged,
  and one unrelated verifier timeout passed on immediate isolated rerun.
- Desktop conversion/restore and physical-iPhone `.lociview` restore,
  DisplaySet/Caption/image, save and completely offline-reopen checks were
  accepted by the Product Owner. No unresolved P0/P1 was reported.
- The direct LociMyu adapter reuses the exact identity/source-authority parser,
  native receiver, verified binary/media writes and marker-last publication;
  it adds no durable intermediate v1 workspace, sidecar or generalized
  migration system.
- The private representative retained its exact source bytes. Its private path,
  filename, digest and source bytes are not recorded in tracked artifacts.
  Under the approved correction, 109 source Caption rows produce 103 Captions;
  rows 43–48 are explicit reported empty input. Native publication and portable
  package-v2 restore pass with no missing Representation or media.
- Independent read-only review found and closed one P1: the missing-ID wizard
  branch now repeats that the original ZIP must be retained. No P0/P1 remains;
  media-attachment-specific row-alignment coverage stays P2 because position,
  source-row and representative restore evidence already exercise the seam.
- Final correction-tree verification passed: typecheck; 54 full-suite files with
  1,431 tests passing and 21 existing todo; normal production build; and the
  `/LociView/` base-path build. Spark remains outside the service-worker
  precache and the representative PLY bytes are absent from repository/build.
- The stale current-action wording found by final documentation review was
  corrected after executable verification; this result-only synchronization
  does not trigger a second full matrix under the approved stop rule.
- The bounded native Caption overlay now reuses the existing Caption selection
  authority for marker/list selection, saved title/body/color and on-demand
  project-local images. Product Owner Desktop acceptance passed for selection,
  header drag, responsive images and temporary bottom-right resize; size and
  position reset with selection and add no snapshot/package state.
- Overlay verification passed typecheck, focused 4/4 and production build. The
  one final full run passed 53 files/1,384 tests before two registry suites
  stopped at their intentional index/worktree identity guard because this
  specification was partly staged. Staging the exact final bytes resolved that
  condition and the two affected suites passed 53/53. Independent read-only
  review found no P0/P1. Product Owner physical-iPhone acceptance subsequently
  passed marker/list selection, overlay content and images, viewer navigation,
  touch move/resize, reset/clear behavior, DisplaySet switching, save and
  completely offline reopen.

`DIRECT LOCIMYU PRODUCT ACCEPTANCE: PASS`
- The bounded missing DisplaySet-relation correction converts LociMyu material
  rows during ZIP import; it does not retrofit existing Native Projects or ask
  the user to recreate/save each sheet. The representative confirmed draft
  produced 65 set-scoped material appearances across four DisplaySets while
  preserving Caption identity.
- Focused conversion coverage passed 44/44 and the independent reviewer ran the
  affected 49/49 checks. Typecheck, normal build, `/LociView/` build and
  `git diff --check` passed. The full run passed 1,441 tests with 21 existing
  todo; one unrelated five-second verifier timeout passed immediately in
  isolation.
- Desktop acceptance on a fresh origin passed: selecting the imported LociMyu
  sheets switched their converted material settings immediately. A reused
  `/LociView/` build on a root-mounted local preview was separately identified
  as an invalid acceptance server configuration; the corrected root build was
  verified to serve its entry JavaScript before the successful smoke.
- The approved orthographic Saved-View receiver uses the deterministic legacy
  compatibility formula with blank-FOV 45 degrees and the established all-empty
  Y-up default. The private representative now produces four orthographic Saved
  Views, four matching default-view links, 65 material appearances and 103
  Captions with zero blocking issues; source-specific IDs/bytes remain unchanged.
- Orthographic focused coverage passed 45/45, including explicit/default FOV,
  default/invalid up, invalid basis, overflow and create/reopen persistence.
  Existing schema/portable coverage already round-trips exact orthographic
  projection state. Independent review found no P0/P1/P2; Product Owner Desktop
  acceptance confirmed sheet-linked camera switching.
- Final executable verification passed typecheck, production build and all
  1,443 executable tests with 21 existing todo. The first full run passed 1,390
  tests before the two registry suites intentionally rejected unstaged
  specification bytes; staging the exact final tree made the affected 53/53
  pass. This result-only note does not trigger a duplicate full run.
- Saved View authoring now appends the captured record and changes only the
  active DisplaySet's `defaultSavedViewId` in one domain action. Two-set
  independence, legacy default-set materialization and actual save/reopen passed
  35/35 focused checks; typecheck and production build passed. Independent
  review found no P0/P1 and one coverage-only P2 for the double-omission legacy
  form. The final suite passed 1,438 tests with 21 existing todo; five unrelated
  lock/CLI timeout failures passed in their isolated 7/7 and 82/82 suites. One
  acquisition free-space boundary test remains environment-blocked by the C
  drive's approximately 2.9 GB free space (`ENOSPC`), not by this product path.
  Per the approved result-recording rule, this note does not trigger another
  full matrix.
