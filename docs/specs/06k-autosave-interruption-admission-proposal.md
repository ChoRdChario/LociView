# Safe resumption around Caption autosave interruption

Status: **PO APPROVED2026-11-19 — bounded original/restored PC and touch-equivalent implementation verified.**
Executed code/browser/offline scope is recorded in [todo](../../tasks/todo.md).
Physical iPhone acceptance and general corruption repair are not qualified.

Companion to [08d](08d-caption-autosave-workflow-proposal.md) and
[06j](06j-interrupted-local-edit-resolution-proposal.md). It changes only the two
private recovery admissions below. Public packages, original data, acknowledged
edits, write/readback/publication fences and normal Session commands stay intact.

## 1. Unprepared local change part

OPFS can create a file before its writable stream is closed. A normal browser
termination may therefore leave an empty, partial or complete local change part
without a prepared receipt.06j deliberately refuses this state today.

Permit explicit continuation of the last confirmed content only when all06j
lease, ownership, whole physical repository, exact original-change bytes,
effective publication, source/proof and inventory checks succeed. The repository
must be exactly unchanged from that publication. There must be one canonical
localCommand start, no preparation/durability/publication, and no unexpected
transaction files. Accept only no change part or the one existing fixed path
`changes/00000000.amchange`; no additional parts, remote/source evidence or jobs.

Keep existing schema1 receipts unchanged. A new canonical
`lociview-metadata-closed-local-2` receipt extends the same fields with
`unpreparedParts:[{path,byteLength,sha256}]`, sealing the exact raw bytes of the
one part (including zero bytes). With no part, retain schema1's exact existing
directory rules. Schema2 requires exactly one descriptor at that fixed path;
duplicate/reordered/unexpected paths are invalid. Bind the descriptor into the
opaque ticket fingerprint; absent-to-present or changed bytes after inspection
make the ticket stale rather than authorizing a newly computed closure.
Do not decode, apply, rewrite or delete the part.
Apply existing metadata total-byte/work limits before allocating or hashing the
part; reject an over-budget part. Zero length is allowed only in this named part
descriptor, never by weakening ordinary EvidenceRef or schema1 validation.
Preserve any already-created immutable media bodies as unused data; no cleanup
or new attribution is implied. A retained hot command is ineligible.

Repeat all admission and part-byte checks immediately before/after writing,
verify the closure readback, then perform strict normal reopening under the same
lease. On subsequent reads validate every sealed part, including after later
commands. Lost-success acknowledgement accepts only the exact retained closure
and unchanged parts/repository; never recreate a missing closure or part.

Reject empty/torn/noncanonical start or control receipts, unexpected parts,
changed/missing parts, changed database, competing jobs and uncertain authority.
This is abandonment of provably uncommitted intent, not repair of corrupt data.
Keep the existing explicit warning that unfinished input was not saved.

## 2. Prepared attachment in a restored Project

The ordinary Session already retries a fully prepared attachment once. A selected
restored generation currently admits only the finite prepared Caption text edit.
Extend that gate by one finite attachment-introduction validator, retaining
strict original archive/base/selection/source/repository/lease checks.

Require exactly one active attachment for an existing active Caption/Scene
membership, an optional exact immutable media record, stable attachment/event/
order/description values, and no unrelated writes. The exact prepared blob list
must equal the introduced record's referenced bodies (including an existing
portable media pair when applicable). Validate the complete candidate metadata,
original media and normal content inventory before any recovered persistence or
publication, using the existing Session resume validators. Admission returns
only the pending retry scope, never a ready provider; it must not duplicate those
full body checks merely to create that scope. Require exactly one complete
prepared change, no remote payload, the finite supported createAttachment write
footprint and the existing declared-editor capability rules. The actual database
must be exactly the base or exact candidate; use06j's bounded whole physical
observation and exact original-change bytes, not only a token/ancestor read.
An acknowledged durable receipt requires candidate.
Then use the existing Session resume/persist/readback/publish path; no new edit,
identity or attachment is generated. Existing prepared-text admission remains.

## 3. Acceptance before product connection

Independent specification/diff review, focused fault tests and actual PC/touch
original/restored interruption tests are required. Cover empty/partial/complete
unprepared part; exact old-byte retention; base DB interference; part mutation,
deletion and extra files; torn controls still refused; consecutive closures;
prepared text/media and lost response; no duplicate attachment/history; next
edit, actual output and independent restore with original body hashes.

Use existing fixture/session/browser test infrastructure. No automatic retry
loop, relaxed integrity assertion or longer deadline to hide failures. Physical
iPhone IME/background saving and native storage acceptance remain pending.
