# ProjectScene one-time migration

> **PO-APPROVED SCOPE — 2026-09-14. IMPLEMENTATION NOT COMPLETE.**
> Convert Native / frozen v1 / LociMyu once, then continue with the converted
> Project's files. Continued old-format updates into that Project are not required.
> The former Native-bridge proposal and its §11 authorization request are superseded,
> not waiting for approval and not automatically adopted in a smaller guise.

## 1. Accepted cutover

The user workflow is: open an old source → inspect conversion effects → confirm
a new Project → edit and save it → give the converted Workspace to the team.
Subsequent collaboration uses that Project's new-format Workspace / Contribution
files. Independent conversions of old copies do not establish a common lineage.

Old-format update files must not merge into, overwrite or reset the converted
Project. Explain that the team now uses the converted file. Rejecting such an
update must not silently create another Project. An explicitly requested separate
conversion remains independent, not a route for returning old changes.

This narrows the continuing-legacy requirements in specifications 02/03/05/06
under [ADR-0002](../adr/0002-project-scenes-and-continuing-team-history.md).
It does not remove initial legacy reading, source preservation, current Native
behavior or compatibility with existing new-format files and interrupted jobs.

## 2. Work removed from the completion target

- Late Native and later frozen-v1 update bridges into a converted Project.
- A legacy fixed baseline mapped to a common new causal ancestor solely to accept
  those later inputs.
- Portable legacy-bridge registries, managed-unit guards, parallel-introduction
  artifacts and deterministic change generation solely for repeated old inputs.
- Old/new concurrent-edit, repeated-old-update and cross-device old-update
  acceptance cases. Historical PoC evidence is not a remaining product gate.

F09 and SCN-MIG-05 are withdrawn, not completed or deferred. Ordinary new-format
causal history, explicit conflicts, independent keep-both, two-round exchange,
backup and exact interrupted-job recovery remain required.

Do not delete existing source/provenance/opaque content, receipts or generic
history just because the bridge is no longer needed. Distinguish initial mapping
and existing file retention from bridge-only requirements.

## 3. Initial conversion still has to preserve the user's work

Apply [05 §9](05-project-scene-team-workflow.md) and the frozen input contracts.
A new conversion recipe must not reinterpret the frozen old recipe or old IDs.

| Source content | One-time conversion requirement |
|---|---|
| Project and frames | Preserve title, units, handedness/up-axis and exact relationships; create a new Project/history identity, not an in-place old-source upgrade |
| Models and representations | Retain admitted visible/hidden Assets, bindings/revisions, frames, transforms, roles and explicit proxy/source relationships; no guessed rematching |
| Model/media payloads | Preserve exact admitted bytes, length and digest. Account for missing/unsupported/unlinked content before publishing; never silently drop it |
| Captions and media | Preserve text, color semantics, tags, attachment order and records not currently in a Scene |
| Positioned pins | Map the authoritative owner/frame/position tuple without repicking, moving it or guessing another model |
| Unplaced pins | Preserve known owner or absence without inventing a position. Subsequent explicit first placement keeps the same Caption and media |
| Pin scale | Preserve source value versus absence; do not multiply coordinates or camera values as a substitute |
| DisplaySets and sheets | Map each admitted set/sheet to a Scene with its effective name, ordering, membership, views and exact material relations |
| Views/defaults | Preserve owning Scene, camera/background and valid entry relations; source active set initializes default Scene, later browsing stays local |
| Material and visibility | Preserve effective visibility and scope. Map source slots and chroma semantics explicitly, including inactive settings needed for later editing; similar names are not evidence |
| Unknown/conflicting data | Account for it and explain unsupported mapping. Never select a winner, normalize distinct source identities together or present incomplete conversion as complete |

Native source order and material layout/chroma semantics are not identical to
target keys. Keep these concrete mapping questions in the reduced plan; removing
the bridge does not make field conversion a byte-for-byte metadata copy.

LociMyu uses the existing exact/confirmed sheet-model-media authority, without
Drive dependence or inferred relationships. Keep initial equal-byte-but-distinct
media/Caption identities separate; old-update fixture retirement does not waive
initial duplicate preservation.

## 4. UI and recovery boundary

- Use the normal file-open intent with contextual conversion effects. The converter
  can be an independent module called by the app; no separate user-facing tool is
  required by this scope decision.
- Explain that editing continues in the new Project and that the source remains
  unchanged. Share the converted Workspace, not instructions for every participant
  to import and independently convert old copies.
- Prepare a private destination through existing services and WorkspaceFS.
  Validate the complete converted state and referenced bodies before publishing
  one ready Project. No partial ready entry or UI write directly to storage.
- Preserve the selected source and fixed destination/output needed during an
  interrupted conversion. Resume that operation; do not mint replacement identities
  or reset subsequent new-format edits on completion retry.
- Keep the original container unchanged on success, failure and cancellation.
  Do not silently include the original ZIP or source-private material in team
  outputs. Initial conversion reports and privacy accounting remain necessary.
- Browser resume data and file saving stay distinct under
  [UI guidelines §9](../ui-product-guidelines.md); internal success is not an
  external-file completion receipt.

## 5. Reduced implementation planning boundary

The next migration plan closes only initial source admission/mapping, required
target fields, private destination publication and retry, then normal new-format
editing/exchange. Reuse current readers, domain commands, file services and journal
primitives rather than another parallel conversion/storage framework.

The former map-2/wire-2/summary-2/review-2 proposal bundled field support with a
continuing legacy control graph. It is not the current approval request. Determine
the smallest changes actually needed for unplaced records, pin scale and faithful
material conversion; do not assume either that the old proposed upgrade is all
required or that existing validators can already represent every source value.

Specify required schema/profile/recipe differences before implementation and seek
a concrete compatibility decision only for differences still necessary. Existing
new-format Projects/files/jobs remain readable and recoverable; this cutover is
not permission to delete old readers or rewrite recorded history. No dependency,
public entry, Service Worker, release or device-route change is authorized here.

Product feature work remains paused in [todo](../../tasks/todo.md). This document
records the scope reduction, not a completed converter or adoption proof.

## 6. Acceptance and historical evidence

Reuse the existing source/file/session tests and grouped device acceptance:
faithful initial Native/v1/LociMyu mapping, original-byte preservation,
known-owner/ownerless unplaced records, explicit placement, failure/cancel/retry,
edit/save/reopen, and new-format team exchange after conversion.

Retain SCN-MIG-01–04/06 where applicable and add SCN-MIG-07's cutover check in
specification 05. Retire bridge-only portions of STO-PKG-11, STO-MIG-10/15/16 and
G0-FX-21B–E as recorded in their owners. Retirement is not PASS. Do not rerun or
expand isolated legacy-bridge PoCs to finish one-time conversion.

The full superseded draft, including former §§2–11 and Native field-mapping
analysis, is retained verbatim in Git at
`e3830ef:docs/specs/07-project-scene-migration.md`.
Use `git show e3830ef:docs/specs/07-project-scene-migration.md` for a specific
historical evidence question. Those protocols, numeric proposals and approvals
requested there must not be reconstructed as the active work queue.
