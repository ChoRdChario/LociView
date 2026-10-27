# 01d: File-backed GS source through the existing workflow

> Status: IMPLEMENTED IN BOUNDED VALIDATION / INDEPENDENTLY REVIEWED / NOT ADOPTED.
> This refines the approved01c workflow under its existing limits and authority.
> It adds no source/display profile, dependency, wire field or adoption permission.
> Executed native File create/add/file/recovery/cold evidence and exact final
> checks are recorded in [todo](../../tasks/todo.md). Stream-only fallback and
> large-source/device/offline exclusions below remain binding.

## Outcome and boundary

Select GS → inspect the complete original in bounded chunks → existing verified
CAS stage → edit/save/send → restore/cold reopen → display the same full SH source.
Retain the familiar file/Proxy controls. Current aggregate64MiB,100,000items and
8,000,000scalars, exact01c companions and packed display policy remain unchanged.

This increment removes LociView's repeated encoded-source arrays on native
File/Blob-backed paths. It does not admit larger sources, pass G1-A, prove a total
heap/CPU/GPU bound or implement SH4 paging. Fixed GSL1.4.3 publicly accepts
`SplatMesh({file: Blob, fileType: PLY})`; its worker reads chunks but still produces
complete decoded data. Its RAD/SOG paging is SH3; SH4 remains full PLY decode.

## Source ownership and typed boundaries

- Capture selected native File/Blob ranges, size and labels synchronously before
  asynchronous inspection; do not treat arbitrary reopen callbacks as immutable
  source proof. Preserve byte-input APIs' existing synchronous copy contract.
- Add a GS stream inspector returning only degree/count/header/stride, bounds,
  display diagnostics and incremental SHA-256/length. Source resources remain
  separate. Preserve the byte inspector as a wrapper over the same row reducer.
- `initialProject`/`ValidationContent` may retain a captured GS Blob and expected
  BlobRef instead of a Uint8Array. Other formats and converter APIs retain their
  existing byte preparation. Share record creation rather than duplicate IDs or
  bootstrap logic. A prepared body is explicitly bytes or Blob, never ambiguous.
- The existing file-selection value may carry a captured Blob alongside its
  existing byte-reader compatibility path; UI only forwards input. Session and
  content services keep inspection, stage and retry authority.
- `WorkspaceReadableFile.blob()` already describes a file-backed snapshot. CAS may
  expose this optional view only after fully checking that exact captured Blob
  against the expected length/digest. Read-only views perform no diagnostic write;
  ordinary views preserve their existing corruption handling. Stream-only
  backends retain the current bounded byte fallback, with no native-file memory
  claim for that fallback. Neither path grants a new write or repair authority.
- Stored/received/equivalence/raw verification and Review inspect GS streams.
  When display needs a Blob, use the checked snapshot bound to those exact bytes.
  Do not replace older owned facts or receipts from a selected source.
- Viewer receives only a checked Blob (or the retained byte-compatible value),
  count/degree/display diagnostic and existing cancellation ownership. It receives
  no Project/FS/path/receipt. Use the fixed public `file` constructor option and
  keep decode serialization, natural settlement/dispose and packed validation.

## Exact inspection

Header storage is at most the existing64KiB. Handle arbitrary stream partitions,
including CR/LF and Float32 splits, with one record carry (at most356bytes).
Limit observed bytes as well as the declared size. Do not tee, concatenate all
chunks or use a whole-body Response/Blob conversion as hidden buffering.

Preserve exact line/header/property schemas, inert comments, all five degrees,
little-endian raw bits/order/duplicates, full scalar/finite checks including
empty rows, opacity/scale/quaternion/covariance and display range diagnostics.
Reduce rows in the same order using the same math. Pad/nextDown/Up once at EOF;
validate retained bounds with the existing tolerances and return their literal
values. Require exact payload length, count/scalar limits and nonempty support.
Return facts/digest only after complete EOF; reject truncation and trailing bytes.

Byte and stream wrappers share the header parser as well as the row reducer.
Native Blob reads use bounded slices, counting the held upstream chunk as well
as header/carry storage. Raw stream adapters reuse finite read/chunk accounting
(including empty chunks) and reject oversized chunks before copying. No unbounded
tee or empty-chunk loop is permitted.

The inspector may use existing incremental NativeSha256 through the project I/O
boundary. It introduces no hash dependency. Bound input chunk processing, release
reader locks on success/failure/cancel and reject late results after cancellation.
No new product numeric guarantee is derived from these internal buffer bounds.

## Publication, retry and compatibility

Complete the selected-input inspection before durable creation. Preparation writes
no Project, journal, CAS object or receipt. Do not spool uninspected input to disk.
At the existing body-stage point, CAS streams the same captured source using the
inspected expected digest/length, then retains its existing reread/dedup/receipt
checks. Fresh creation still stages all bodies before validation-initial receipt
and Session creation. Model commands still begin journal before body/fact stage,
then checked provider → prepared → existing publication fence.

Keep exact source/run/IDs for same-attempt retry. Cancel/stale/dispose drops the
ephemeral source owner; it does not publish a late result. Unprepared cold staging
keeps its current incomplete-staging-repair behavior. Prepared and initialized
cold recovery use durable originals/facts only; no new job/reselection record,
cross-restart File lease or fact repair is introduced.

Five-purpose files retain full GS/Proxy/history and their existing blob/digest
readback fences; Clean rekeys existing identities only, Review remains read-only.
Do not make Caption-only edits re-inspect every old body, extend a verified-read
lifetime or weaken no-repair checks. Preserve build/dependency/precache isolation.

## Acceptance and execution

1. Existing mathematical/byte goldens and malformed vectors match byte and stream
   inspection at split header/newline/Float32/record/EOF boundaries. Verify digest,
   negative zero, retained bounds, late corruption, observed limits and cancellation.
2. Reject invalid fresh selections before any FS/CAS/journal mutation. Prove
   source/context capture, changed-source stage refusal and same-attempt retry;
   preserve old fact/body no-repair and cold publication tests.
3. A native File-backed GS create/add → Proxy/manual record → five-purpose
   file/recovery/cold workflow must preserve source digest and01c pixels. Assert
   GS paths do not materialize an encoded whole-source array via arrayBuffer/
   readValidationBody; bounded header/range reads remain allowed (and can cover a
   small file entirely). Test a source larger than64KiB. Keep other
   format behavior and representative mixed selection unchanged.
4. Run focused import/GS/storage tests while editing; final serial checkpoint,
   validation browser acceptance, graph/license isolation and independent diff
   review at the connected workflow boundary. Existing device/offline gates stay
   pending. Record diagnostic I/O, not a latency or general memory guarantee.

Three independent read-only reviews confirmed this is an internal refinement
preserving accepted authority/timing under01c and the current continuation request;
no additional PO decision is required for that exact scope. Implementation/final
diff and executed acceptance are recorded in todo; design review is not execution
evidence. If implementation needs uninspected spool storage,
new budgets, profile/format, validation/publication lifetime changes, durable
source jobs, renderer policy or SH3 preview, stop that affected part and prepare
the concrete PO decision before implementing it.

## Next large-source decision

After this increment, specify the remaining bounded decoder/resident/target and
streamed export budgets against G1-A, and a full-SH4 paging representation/renderer
strategy. Original SH4 source and all coefficients remain authoritative. Present
any changed limit, derivative or dependency as a concrete reviewed proposal.

References: [01c](01c-gs-sh4-proxy-workflow-proposal.md),
[G1-A](03-gates-and-delivery.md#4-g1-a--bounded-streaming-and-cas-poc),
[current work](../../tasks/todo.md), fixed package public
`node_modules/gaussian-splat-lite/docs/SplatMesh.md` and `SplatFileType.md`.
