# Daily authoring integration

Status: initial bounded PC implementation of groups1–4 and the authorized
Caption-action Undo/ordinary Point-replacement continuation verified2026-10-29. Executed
checks and remaining acceptance are in [todo](../../tasks/todo.md). This document
specifies conservative operations over existing records. Revised independent design
review passed2026-10-29, including distributed deletion recovery and explicit order
resolution. The bounded native media decision below was subsequently approved;
no new dependency, portable decoder or release is authorized. The first
implementation attempt was rejected before application for omitting those recovery
conditions; the materially revised bounded implementation passed managed approval.

## User outcome and ports

Organize Scenes and Captions, repeat edits, tag records, set local preferences and
align models without understanding storage. Continue through save/send and cold
reopen using the existing ProjectScene PC candidate. UI sends finite typed
MetadataEdit commands through MetadataProjectSession. The provider owns complete
candidate reads and command preparation. No UI storage writes or generic patch API.

## Scene and Caption operations

- Scene duplication copies its resolved model memberships, independent Captions
  with independent attachment/tag memberships, Scene views and Scene material
  overrides. Models, media bodies and tag resources remain shared. All copied
  record IDs are fresh; entry View refers to its copied View. The original Scene
  and Project default are unchanged. Explain the shared models before confirming.
- Scene deletion tombstones the explicitly observed Scene memberships, owned
  views and Scene material overrides together with the Scene. Project models,
  Captions, media and history remain. Last/default Scene deletion is refused;
  the user first chooses another default. Explain retained records and require
  confirmation. Unknown/conflicted dependencies refuse, never disappear silently.
- Independently valid deletions can leave no active Scene after receiving changes.
  The startup screen must offer explicit restoration of a selected retained Scene
  even without a usable active/default Scene. Write one guarded active lifecycle
  with reason `restore` and explicitly set that Scene as default. Do not restore
  deleted children or pick a Scene automatically; explain that models/records can
  be included again. Still-active late memberships remain visible normally. Refuse
  unresolved/unknown non-lifecycle fields. Preserve every original candidate.
- Move Scene up/down changes only its atomic order key between exact adjacent
  neighbours. No automatic rebalance or drag requirement. Render saved order.
  A conflicted order offers every exact operation candidate and an explicit choice
  through a typed command; no arrival-order winner or automatic rebalance.
- Caption duplication creates an independent Caption in the current Scene with
  identical text/color/anchor and independent attachment/tag edges. It shares only
  media/tag resources, preserving attachment order and original provenance. Select
  the new record only after durable acknowledgement. No fabricated conflict edges.
- Previous/next follows the complete filtered Caption list; endpoints disable.
  Unapplied input/IME/pending operations block navigation, never auto-discard.

## Undo, tags and local settings

- Caption text/color undo and redo append ordinary checked compensating changes
  after confirmed publication. Capture exact field operation IDs and values; any
  external change, conflict or deletion blocks the affected undo. Restore optional
  color absence explicitly. Unrelated records are unchanged. New confirmed edits
  clear redo; failed retries push once; browser close clears the local undo stack.
  Label this as record-text/color undo, not history rollback or create/delete undo.
  Restore admitted spelling/line endings exactly. The existing v2 scalar contract
  requires NFC; this operation neither admits non-NFC scalars nor changes original
  migration-source preservation.
  Rebase neighbouring undo receipts only when their original operation IDs match;
  never bridge a collaborator's equal-value or different-value rewrite.
- Create/rename/color/delete tags and attach/detach them using existing tag maps.
  Deletion confirms and tombstones every observed membership atomically, preserving
  Captions/media. Duplicates, unknown references and stale candidates refuse.
  Concurrent duplicate links can be explicitly detached together using their
  complete observed IDs. Tag scalar and lifecycle conflicts have explicit choices,
  including optional-color absence; unknown fields still refuse. Retaining a tag
  does not reactivate deleted links, and confirming deletion removes all observed
  live links only after explaining its Project-wide effect.
- Local display name is an advisory browser preference, not an authentication
  identity or retroactive author attribution. Keep it outside Project history.

## Authorized continuation —Caption action Undo,2026-10-29

PO authorized the next usability workflow after the bounded checkpoint above.
Extend its local stack to chronological Caption creation/duplication/deletion,
attachment add/remove/description/order and existing title/body/color edits.
The controls work without a selected Caption; restoring a record selects it where
it belongs in the current Scene. Keep that Scene and the Project default unchanged;
otherwise report restoration without selecting a hidden Caption. Closing the
editor clears only this local stack.
Each confirmed operation records a discriminated receipt exactly once after
durable acknowledgement; failed retries retain it and new normal edits clear redo.
No-op changes add no receipt. No Project history rewrite, new schema or dependency.

Add finite ordinary lifecycle compensation and attachment-field restoration
commands, distinct from conflict-only recovery commands. Creation Undo tombstones
the same Caption and its created live children; Redo restores those same IDs.
Deletion Undo restores only rows actually deleted by that action, never older
deleted children. Append fresh lifecycle events (`restore` when activating), retain
media bodies/tag resources and every original candidate. Attachment Undo changes
only that edge's lifecycle or its selected description/order field.

Provider-derived receipts capture exact field operation IDs/values, affected row
identities and complete live child sets. The planner independently rechecks the
same candidates and dependencies, including resolved deleted rows; no arbitrary
map/patch write API. Unknown/conflicted rows, a foreign equal-value rewrite,
new live children or unavailable parents/resources refuse compensation atomically.
Existing deletion may still preserve conflicted non-lifecycle fields; inability
to capture an Undo receipt must not narrow the existing deletion contract.
Explain that such changes can prevent Undo. Reconnect local receipts only where
their exact prior operation IDs match this editor's compensating writes; never
bridge a foreign rewrite. Resolved tombstones not touched by an action stay deleted.
Existing Session checked-next-state/body verification runs before pending and
publication when media becomes live again; no staging shortcut or validation cache.

A regression exposed that existing fact/inventory receipts detect missing/short
bodies but do not freshly hash a same-length corrupted body. On lifecycle Undo/
Redo that reactivates attachments, derive only their exact existing media BlobRefs
from the checked base plus that action's original local change parts. Call existing
Session verifyDelta/MetadataMediaPort.verify before retaining a pending command.
Retry/cold reconstructs that same baseHeads+validated-parts batch and derives them
again before persistence/publication. Also cover Caption restoration with still-live
attachments. Keep journal stagedBlobs semantics/counts unchanged; no put/restage,
new receipt/schema or repair permission. Corrupt/missing acknowledged bodies
refuse; never refill them from UI input or a previous prepared selection.

Preserve conflict-recovery semantics as well: restoring a Caption lifecycle alone
does not resolve its children's owner/lifecycle/media-reference conflicts. Such
known unresolved children are not live attachments and do not yield an arbitrary
media choice for reactivation verification. Skip those unresolved children while
retaining every diagnostic/candidate. Unknown/invalid fields still refuse; ordinary
Undo's complete-row/child-set planner still refuses affected ambiguous children.
Equivalent known immutable media candidates can supply their identical record;
different immutable candidates never choose a winner. The existing parent-only
recovery test must retain its same-host failure/retry behavior unchanged.

Acceptance adds create→text→attach→delete Undo/Redo ordering, multi-Scene restore,
pre-deleted child retention, same-value foreign edits/late children/unknown refusal,
single receipt after retry, absent/corrupt media refusal before pending, and
save/share/restore/cold equality with an empty cold local stack.

## Authorized continuation —ordinary Point replacement,2026-10-29

Use the existing guarded `replaceAssetModel`/WorkspaceFS/body pipeline for exact
01a XYZ/RGB ASCII Point→same01a Point. Preserve Asset ID, AssetFrame, Project unit,
all Scene memberships, placement transform, Caption coordinates and attachments.
Append fresh revision/binding/RepresentationFrame/family/compatibility/catalog IDs;
the new binding's parent is the expected current binding. Retain old bodies/history.
Require exact source declarations at both ends, not merely `saved-point` shape.
Native Point, GS/Proxy, Mesh↔Point and cross-profile conversion remain outside this
same-profile extension. It adds no profile/schema/dependency or capacity promise.

Do not infer point correspondence even for identical bytes. Existing pins retain
coordinates and become `needsReview` under the fresh compatibility class until
explicit point selection/manual confirmation. Explain this and Project-wide
Scene impact before replacement; do not display irrelevant Mesh material-loss copy.
Reject stale binding, reused IDs, mixed profiles or unsupported source atomically.
Use the existing checked pending/publication/readback/recovery fences; no alternate
writer or cached admission. Verify failure→cold retry, source/pin preservation,
hand-edited peer receive→pin correction→return and saved/restored/cold records.

Implementation found a pre-existing readiness discrepancy with specification01's
weak-provenance rule: content inspection intentionally does not fetch an inactive
old hit source and preserves its source-index-unverified diagnostic, while Session
readiness rejected it. Retain those diagnostics and accept canonical coordinates
only for a resolved Asset anchor whose exact hit source is outside the active
strong Representation closure. Ignore only `verified-source-index-range-required`
and `source-index-unverified` readiness diagnostics when unverified in that case. Active-source failures,
invalid/out-of-range/unknown/conflicted anchors and all body/publication/recovery
checks remain unchanged. Never fetch weak bytes or assert that old indices were
verified. This repairs the accepted01 invariant; it adds no content cache lifetime.

The connected cold-browser test also found that the early mounted editor could
offer Project navigation while its selector still owned the opening operation;
the selector then discarded that click. Pass only that navigation control's local
owner-busy guard to the editor and refresh it on owner busy transitions. Keep
Caption reading/search and ready geometry usable; do not turn selector busy into
a global edit/read block or change loading/publication/recovery timing.

## Alignment and media boundary

Manual model positioning retains canonical source coordinates and Project-wide
bindings. Local reference selection is not a collaborator lock. Origin/centre
pivot and coarse fit must derive from inspected Asset bounds; compensation keeps
the chosen pivot stationary under rotation/scale. Reset and alignment undo append
fresh same-revision bindings with expected current binding guards; never repoint
history or guess original placement. No ICP/correspondence matching is included.

The local centre pivot is the inspected Asset-bounds centre. Numeric and gizmo
rotation/scale compensate translation so its Project position stays fixed; numeric
translation still moves the model. Coarse fit retains source rotation, scales by
reference/source Project-AABB diagonal ratio, and aligns their transformed bounds
centres. Zero/non-finite extent or a changed reference binding refuses. A typed
`fitAssetBounds` command independently recomputes this exact result from verified
immutable bounds/bindings and writes method `bounds`; manual adjustments clear the
fit intent. Imported reset is offered only when a complete binding-parent chain
reaches an explicitly `import` root. Identity/import resets preview before commit.
Local alignment undo/redo writes new manual bindings and requires the exact most
recent acknowledged binding; foreign changes disable it rather than being erased.

The bounded media decision below is approved; its implementation acceptance is
recorded in todo. A browser element alone never proves format support: require
container/codec validation, initial decode, retained originals and connected file
verification. Existing images, compatibility guidance and broader PROD-16
codec/license/device/dependency gates remain. No silent conversion or upload.

## Acceptance

Use complete candidate readers, reject unknown/ambiguous source or stale token
before writes, retain acknowledgement/retry/publication fences. Verify independent
copy edits, preserved original IDs/bodies, Scene/default/dependency refusal, tag
closure, exact undo/foreign-edit refusal and optional absence. One connected
Desktop organize/edit/save/send/cold flow verifies the integration; focused service
tests cover fault combinations. Run required final serial checks. Device/offline
and release evidence retain their actual gates; no10k qualification is required.

Explicitly test both merge orders of two independently valid Scene deletions,
all-deleted and single-invalid-default startup, retained-record restoration without
implicit child reactivation, Scene order candidate choice, and late-edge conflicts.
Deleted Scene entry View references are cleared in the same deletion transaction.

## Media decision —approved and bounded PC implementation verified2026-10-29

PO explicitly approved the native-only, no-new-dependency scope below. This
authorizes its bounded implementation through existing media-resource records,
Session attachment commands and exact body verification on import/restore. It
does not authorize a portable HEIC decoder or claim universal codec support.

First admission: self-contained MP4 with one8-bitSDR AVC/H.264 `avc1`
video track and optional AAC-LC audio; M4A/MP4 with one AAC-LC audio track; MP3
MPEG-1/2 LayerIII. Inspect actual container/track/sample ranges and codec
configuration, not filenames or a browser MIME hint. Refuse encryption, external
references, live/fragmented sources, extra tracks and other codecs. Reuse current
file/Project/work/pixel ceilings, preserve original bytes and embedded metadata,
and require a local initial decode before publication. Do not claim full-stream
decode during admission. Playback uses owned Blob URLs, controls, no autoplay or
network access, bounded load cancellation and explicit resource release.

For HEIC, use native-browser-only single-still decoding first: validate the
container and successful local decode, retain the original, and refuse admission
or received packages atomically on incapable browsers with existing JPEG guidance.
This explicitly leaves general Windows/cross-browser direct HEIC incomplete.
No bundled decoder, transcoder or new dependency is included. Broader HEIC needs
a separately reviewed decoder/license/distribution or portable-derivative design.

Measure actual initial decoding and playback in the exact dedicated browser; do
not infer codec support from its name or canPlayType. If bundled Chromium lacks
AVC/AAC, use a dedicated temporary-profile installed Chrome/Edge test, following
the [Playwright codec limitation](https://playwright.dev/docs/browsers#media-codecs).
Successful execution establishes only that exact environment, not broader browser
or physical-device support. Native HEIC is documented by
[WebKit](https://webkit.org/blog/14445/webkit-features-in-safari-17-0/), not evidence
of Windows support. Physical iPhone acceptance remains pending. Existing image
routes/receipts and old conversion recipes retain their original semantics.
MediaResource already has image/video/audio kinds, so this path adds no wire
schema or format profile; exact kind/MIME facts stay bound to admitted bytes.

The first reader accepts AVC Baseline/Main/Extended/High8 with bounded SPS/coded
dimensions, complete avcC and owned length-prefixed samples; unsupported chroma,
HDR signals/configurations and encrypted/fragmented/extra-track forms refuse.
AAC is LC with mono/stereo configured channels and no active SBR extension.
MP3 walks MPEG1/2 LayerIII frames, preserving bounded ID3v2/v1 metadata. HEIC
allows one hvc1/grid primary, HEVC Main8/Main10 coded leaves with checked SPS
dimensions and complete hvcC/sample framing, and only related thumbnail/auxiliary
images. An unrelated second still or sequence refuses. Original Exif/other
metadata remains embedded; no sanitization or strict HDR fidelity is implied.
Decode waits are bounded, late bitmaps are closed, and only the selected modal
initializes a native player. Closing, changing scope or switching items stops
playback and releases its source/Blob URL; native seek keys retain their behavior.

Fresh HEIC in a model-plus-media selection is inspected before showing the new
Project name form, so an incapable browser receives the existing JPEG guidance
at file-open time. Selection generation/owner checks discard stale results; no
Project, journal or body is written by this preflight. Actual creation repeats
fresh admission and the existing publication/readback checks; preflight is not a
receipt or a cross-operation validation cache. The composition's optional trusted
MediaDecoders port follows its existing PNG/JPEG/photo decoder ports for service
tests and is never deserialized from a file. Production uses native browser decode.
