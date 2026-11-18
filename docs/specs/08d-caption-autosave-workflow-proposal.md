# Caption autosave and immediate reading preview

Status: **Product direction confirmed2026-11-18; engineering proposal, not implemented.**
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

Current implementation still follows specification08's explicit text-then-media
Apply. Do not remove that completion path before the replacement is qualified.
The new schedule must not bypass Session commands, validation, readback,
publication or recovery fences.

The reproduced cold local-command start without prepared data currently leaves
the Project pending and fails `incomplete-staging-repair`. A UI exit does not
repair this state. More frequent automatic writes increase exposure to it.
Define and independently review its safe terminal recovery before connecting
autosave. Any new Journal terminal state or restored-generation admission rule
requires its own explicit storage contract. Preserve every interrupted byte and
every acknowledged change. Do not ignore, delete or overwrite bad receipts.
The unexplained external `receipt-invalid` is a separate unresolved cause.
[06j](06j-interrupted-local-edit-resolution-proposal.md) proposes only the
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
