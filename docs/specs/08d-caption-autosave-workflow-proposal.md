# Caption autosave and immediate reading preview

Status: **Product direction confirmed2026-11-18; implementation authorized and bounded Desktop/offline implementation verified2026-11-19.**
Executed PC/touch-equivalent scope and remaining device acceptance belong in todo.
The owner supplied their followup discussion and asked that it guide development.
It explicitly chooses Caption autosave without a routine Apply button, separates
immediate display from durable saving, and keeps editing beside the list while
3D windows remain reading surfaces. This is not approval of every suggestion in
the external summary. [Todo](../../tasks/todo.md) owns implementation and checks.

## 1. One user workflow

Type a title/body, see it immediately, select a photo or other supported media,
and continue without a Caption-level save action. Explicit project-level file
output remains available; reopen that real output in an independent environment.
Keep PC list/detail coexistence, mobile list/detail surfaces, existing multiple
reading windows, original assets, the quiet palette and existing media support.

No new database, persisted draft format, dependency, package/ID rule, general
autosave for models/materials or public release is included.

## 2. Admission and the known recovery dependency

Before this unit, implementation followed specification08's explicit text-then-media
Apply. The bounded product-only replacement is implemented; harnesses retain explicit
Apply. Executed checks and connection status belong in todo.
The new schedule must not bypass Session commands, validation, readback,
publication or recovery fences.

The reproduced baseline cold local-command start without prepared data left
the Project pending with `incomplete-staging-repair`. A UI exit alone did not
repair it.06j now qualifies the start-only closure; the additional normal
process-cut states are explicitly approved in06k. More frequent automatic writes
require those bounded paths to pass before the new workflow is qualified.
Preserve every interrupted byte and every acknowledged change. Do not ignore,
delete or overwrite bad receipts.
The unexplained external `receipt-invalid` is a separate unresolved cause.
[06j](06j-interrupted-local-edit-resolution-proposal.md) covers only the
start-only state. Partial change/preparation and torn receipts remain outside that
proposal; its approval alone must not be reported as qualification of every
autosave interruption or general repair.

## 3. Immediate preview is UI state

- Show the current record's raw title/body in its list row and already-open
  reading window. Do not open an empty window merely to show a preview.
- Keep the authoritative provider, token, command plans, Undo source, geometry
  and exported data unchanged by display-only input. Pass a separate preview to
  rendering; do not relabel an edited provider as a verified source.
- Bind the preview to the Workspace owner/epoch, Scene and Caption. An external
  revision, changed target, read-only transition or disposal cannot transfer it
  to another record. Preserve unresolved input rather than rebase it silently.
- Preserve IME, native selection, line endings, scroll and focus. Avoid assigning
  unchanged input values on rendering. Revert a discarded preview to confirmed
  content without implying that already-saved edits were rolled back.

## 4. One serial save drain

Reuse CaptionDraft normalization and finite typed Session commands. A short
typing pause after IME completion, input completion, or a dependent user action
requests a drain. Choose the pause from measurements; it is not a new durability
or speed guarantee. Never submit every keystroke or poll project storage.

There is one immutable in-flight plan and one newest UI revision for the same
record. Further input remains editable while that owned operation runs. Only
the acknowledged revision/fields become confirmed; an old completion must not
clear newer text, composition or a selected File. Then drain the latest revision.
Capture the current command/editor context through existing ports and keep it
fixed for that command's asynchronous preparation.

The current `perform()` and detail renderer make the body inert/read-only while
saving. Calling Apply on a timer would therefore repeatedly freeze or reject
typing. Replace this only for the owned Caption input lane. Other writes remain
serialized and guarded; a private UI exception is not general permission to
dispatch during Session pending state. Keep prepared camera navigation usable;
retain existing media residency/3D suspension when needed for memory safety.

An unrelated token/owner change stops automatic submission and retains input.
No automatic retry loop is allowed for a failed immutable command. Explicit
retry finishes that exact plan once, then drains the newer revision. Do not
replace a pending Session command with a more recent draft.

## 5. Media follows the same owned sequence

Selecting a File is explicit intent to add it to that record. Show its name and
preparation state immediately; no separate routine Apply is required. Preserve
existing validation and media-memory budgets, stable attachment/event IDs and
original bytes. Do not put an unverified File into verified MediaResource data.

Use the existing text command followed by media addition, with separate durable
acknowledgements. After text success/media failure, retry only media. Retain newer
text while media is pending and resume it from the owned acknowledged result.
Chooser cancellation retains an earlier selection. A failed photo remains
recoverable in the current UI, with retry/removal and honest partial-result copy.
Do not enlarge simultaneous decode residency or keep released originals cached.
Keep one outstanding File, as in the current chooser: disable only further media
selection until that File is acknowledged or an explicit existing safe
cancellation/removal has completed. Failure retains the occupied selection for
retry or safe removal. Continue
text input/camera use subject to the residency gate. Coalescing replaces only text
revisions; it must never silently replace a distinct File-add intent. Do not cancel
or drop an already-started Session command to admit another File.

## 6. Moving, Undo, output and exit

Record/Scene/Project selection, deletion, Undo, role changes and file generation
must wait for the latest owned input to settle before executing their existing
guarded action. Revalidate the target after that wait; do not replay a stale plan
or lose a click because blur started saving. Preserve user activation for the
native chooser: selecting a media File may join the same drain without first
opening a new save dialog.
Role changes here mean authorised user-requested mode changes. External lease or
permission revocation immediately forbids new dispatch and retains input; never
flush against revoked authority.

Switching a work panel, returning to the same record's list, or returning to its
retained editor changes UI state only. Preserve the input and allow these reading
transitions synchronously without requiring a successful save. Keep composition,
placement, other-operation and ownership guards; actual commands in another
panel still recheck pending Caption input, busy state and the current token.

Do not make a global busy cycle where file output blocks the very Caption flush
it awaits. Declare the UI flush ports and their lifetimes before implementation;
file generation may start only after the flush succeeds and its normal fences
are acquired. An error or unfinished composition retains input and a local next
action; it never silently exports older text or omits a selected photo.

Use the existing action Undo receipts for confirmed editing bursts, not one
receipt per keystroke. Preserve native text Undo and the external-change guards.
After confirmed Undo/Redo/deletion, clear or reanchor the settled UI revision and
its scheduled work to that authoritative result. No old timer/ack may write an
undone value back or recreate a deleted Caption.
Keep beforeunload protection for pending/unconfirmed input. Forced browser/OS
termination can still lose input that was not durably acknowledged; do not
promise otherwise.

## 7. Honest, quiet feedback

Use one ordinary state near the work: saving, saved in this browser, or unable
to save with input retained and an explicit retry. Only the newest confirmed
input may be called saved. Successful background work must not steal focus.

Keep manual external backup and current output-scope/privacy checks. A generated
file and download handoff do not prove OS destination completion. Show the actual
filename and the result that can be verified, without a permanent warning for
an optional external export. Do not claim browser data is an external backup.

## 8. Bounded acceptance

Reuse existing Vitest and Playwright paths; do not add another test framework.

- Same-record live title/body preview; provider bytes/token unchanged until save.
- IME and long Japanese input; no field freeze or lost selection while saving.
- More input during an older save; only the submitted revision is acknowledged.
- Pause coalescing and no-op input; no per-keystroke writes or Undo receipts.
- One outstanding media selection; a second File is not silently substituted.
- Text success/media failure and exact retry without duplicate IDs or history.
- Real native chooser cancellation, media decode failure and bounded residency.
- Navigation, Undo, deletion and file output immediately after typing; latest
  text/photo included, with no global-busy deadlock or dropped intent.
- Old completion after owner/Scene/role change; no input or write reaches a new
  target. External concurrent changes retain input and require resolution.
- Autosave→Undo/Redo→wait beyond the next drain remains undone/redone; confirmed
  deletion is not reversed by a late text/media completion. Revocation never
  initiates a flush with lost edit authority.
- Browser interruption at existing write/publication fences, including the
  known unprepared state, without lost acknowledged data or false success.
- PC/touch real file generation, independent reopen and original media hashes.

Physical iPhone IME/background exit, native file handling, memory/thermal and
safe-area acceptance remain separate. Tab reorganization, global terminology
replacement, demos and off-screen camera assistance are later bounded units.

## 9. Implementation ports and ownership (2026-11-19)

The product composition opts into Caption autosave explicitly; existing harness
adapters may retain explicit Apply. The UI owns the debounce/drain, raw draft,
one selected File and display-only preview. Session remains the only mutation
authority. No provider/source/token is synthesized from a preview.

Expose UI-only `flushCaption(): Promise<boolean>` plus a readonly indication
that Caption work can be flushed without unrelated panel input. Product file,
mode and Project navigation invoke the flush before acquiring their own busy
fence. A failed flush prevents the dependent action. Revalidate the owner and
target afterward; do not replace a pending action with a stale token or plan.
All remaining mutation/lease/publication/output guards stay independent.

Only a same-owner Caption save keeps its title/body inputs editable. Other
mutations remain serialized. One immutable command is retried explicitly; newer
input waits in the draft. Acknowledgement verifies normalized submitted fields,
advances only their own baselines and retains newer raw input/composition.
List/window preview receives separate title/body values bound to the current
owner, Scene and Caption. Scene geometry and command planning use canonical data.

The existing global input guard and beforeunload protection include the drain.
An input-completion/blur event requests a flush without stealing focus. During
composition it retains input and reports the required completion instead of
writing an incomplete composition or silently continuing an export.

[06k](06k-autosave-interruption-admission-proposal.md) separately approves the
remaining normal process-cut states and restored attachment admission. It is
not implied by06j. Claim only the executed recovery scope recorded in todo;
arbitrary corruption repair and physical iPhone acceptance remain separate.
