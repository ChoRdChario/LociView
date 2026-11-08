# GS preparation and regenerable output attempts

Status: implementation supplement to the PO2026-11-08 direction; no release,
new renderer/source profile, wire format, dependency or capacity guarantee.

## 1. Measured boundary

Pinned GSL1.4.3 already reads a Blob with `file.stream()` inside its worker,
pushes chunks into its decoder, then completes global Morton ordering before
returning packed data. Do not add a second transport or describe this as a new
raw-copy saving. Its public API does not expose partially initialized PLY data.
On the owned500k SH4 browser probe, packed checking occupied4259.9ms and the
longest frame gap was4263.9ms (single baseline observation, not a guarantee).

Keep one complete mesh/global ordering and every existing packed predicate.
Check rows cooperatively, without extra checker-owned per-row arrays or repeated SH
weight calculation. Yield to a task between bounded work slices; report checked
rows in the existing preparation status. The worker's progress and the checked
row count describe their individual stages, never a total-time percentage.
Adopt only after all rows pass. Queue ownership includes native initialization
AND cooperative checking: cancellation waits for native settlement, prevents
adoption, stops checking and disposes once before releasing its reservation.
`idle()` must include this work. Do not race native completion against abort.

This preserves final display quality and does not implement partial GS drawing.
Raw-ordinal pages may change equal-depth blending through per-page Morton order;
that alternative needs actual pixel/ordering evidence and a profile decision.
Keep captions and already prepared residents usable during preparation.

Ports: viewer-local packed checker receives the public mesh, checked count/degree,
an ownership AbortSignal and an optional stage observer. It has no storage/package
access. Existing queue/render ports and immutable profile hashes remain unchanged.

## 2. Safe cleanup target

Only an exact canonical `artifacts/<32hex>.zip` inside a strictly validated,
started output job may be removed. Preserve the ZIP referenced by its validated
`artifactVerified` step. All five current output kinds are covered. A failed or
cancelled-before-artifact attempt ZIP is dispensable. Failed jobs can retry from
their retained frozen inputs; cancelled jobs remain terminal and cannot resume.
Preserve every source, original, model/image, manifest, metadata, control, index,
step, protected inventory, exchange base and recovery record. Do not recursively
remove directories, infer ownership from names alone, or remove acknowledged ZIPs.
Malformed, unknown, unstarted or ambiguous jobs remain untouched and are reported.

Ordinary discovery/open/download validation is unchanged. A cleanup-only opaque
read capability, minted inside one write-authorized, generation-bound read, may
omit ONLY the size admission of canonical attempt ZIPs while reusing the normal
ids/state/open parsers. This allows an oversized incomplete attempt to be cleaned.
All path/count/control/source/index/binding/step checks remain mandatory. Check
the retained acknowledged artifact using its ordinary receipt path. The capability
is bound to the exact derived filesystem and expires on callback exit; return
only cleanup results, never the capability or an opened job.

Cleanup follows package-operation exclusive lock → Project write queue/fences →
artifact-lifetime exclusive lock. Output history observations and restore's output
inventory use the matching shared artifact lock. No code holding a shared read may
enqueue cleanup; no public observer is re-entered while holding exclusive cleanup.
Keep lockless read-only fallback; persistent cleanup requires package Web Locks.
Native downloads remain safe because their acknowledged ZIP is never removed.

Typed Session cleanup checks a ready current source/token and selected generation,
uses the strict job bindings, checks the step chain before deletion, and asserts
write ownership around each WorkspaceFS.remove. Verify actual removal. On failure,
report retained failures and successful reclaimed bytes honestly; retry is idempotent.
Freshly compare source/proof/token/publication after cleanup. Report removed logical
ZIP bytes, not immediate physical quota or RAM reclamation. No new journal/event
or checkpoint identity is created. Existing pre/post Project
write fences and all output readback/recovery checks remain in force.

Expose one contextual action `一時ファイルを整理` in existing output recovery/history,
only for an editable Project. Failed output retains its name draft and blocks
closing the drawer; cleanup must therefore work there without discarding the draft.
It must remain reachable if output discovery failed;
put it beside incomplete/error recovery even when older successful history exists;
after cleanup perform fresh ordinary discovery. Keep unresolved diagnostics, drafts
and the same output job. This is not a new storage-management screen or quota promise.
After retry confirms that exact backup as generated/file-verified, consume only a
currently matching backup form: trimmed/NFC label and current source token must
match the confirmed job. Recheck after the await. Preserve newer/unrelated drafts
and all input on failed retry. Consume before download handoff, as for first
generation; a failed handoff still offers the existing generated file.

## 3. Acceptance

- GS: SH0–4; count/degree mismatch, nonfinite/invalid scale/rotation/opacity/SH and
  colour overflow, including the final row; unchanged predicate results; task yield,
  cancellation during native/checking, no premature adoption/idle/next decode.
  Compare the same500k SH4 browser input before/after, including first full display,
  checked rows, frame gaps, final rendering and teardown. No partial-display credit.
- Cleanup: multiple failed ZIPs plus one acknowledged ZIP; all five job kinds;
  oversized attempt admission, unchanged normal rejection, control/step tamper,
  unknown paths and unstarted jobs; authority loss, partial remove failure, retry,
  cross-tab reader/writer exclusion and no deletion while a generator owns its lock.
  Compare retained control/source/body hashes, output retry/download/return/restore
  and cold reopen. Report actual reclaimed bytes; do not equate estimate with disk RAM.
- Integrated editable PC/touch and offline candidate flows, focused safety tests,
  independent final review and the existing serial checkpoint checks. Physical
  iPhone Safari remains pending; Windows emulation is not device acceptance.
