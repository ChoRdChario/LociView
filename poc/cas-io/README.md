# Isolated bounded CAS I/O proof

Disposable prerequisite evidence for S1, specification 02 §7 and G1-A. No
production adoption, application import, package wire or dependency addition.
Use the existing incremental `NativeSha256` implementation unchanged.

Hypothesis: a stream can be staged, size/hash-verified, copied without relying on
atomic rename and published by a final verified receipt. Interrupted copy or an
interruption between complete receipt writes can resume from verified staging.
A torn receipt is an explicit repair refusal, not silently recoverable or missing.
Unverified bytes are unavailable through the candidate's export API. Existing
verified content is immutable; concurrent identical imports under
one enforced writer deduplicate to one verified payload.

The candidate is backend-neutral. The executable test backend is a fresh local
filesystem directory, NOT OPFS/IndexedDB. A promise queue enforces one process's
single writer, NOT an origin-wide browser lock. Small CAS-only receipts describe
staging and verified-source recovery; they are not the §8 cross-store metadata
journal, ProjectStorageEnvelope, package completion marker or CAS adoption.

Checks: deterministic 500 MiB incompressible stream, incremental SHA-256 versus
Node's independent digest, bounded source/copy/export chunks; cancellation,
injected quota, every CAS receipt/copy boundary, duplicate import and corruption.
Stress chunks and the declared live-buffer code bound must stay below the
existing provisional 64 MiB I/O ceiling. The chunk size is observed; the bound is
code accounting, not a measured heap/RSS/browser/OS/GPU budget or product limit.
Failure preserves any existing published blob; unverified residual files remain
outside visible CAS. Retry uses verified staged bytes, not a guessed original.
The test export sink writes a temporary synthetic file and acknowledges completion
only after sync/close. It is not an atomic filesystem-availability guarantee or
evidence that a browser download can be withheld or rolled back.

Run from repository root:

```powershell
npx vitest run --config poc/cas-io/vitest.config.ts
npx tsc --noEmit --project poc/cas-io/tsconfig.json
```

Missing adoption evidence remains explicit: real OPFS flush/interruption, browser
single-writer and GC coordination, physical iOS/background/quota, CSP/offline,
metadata journal/inventory atomicity, grace-period cross-project GC and real
package import/export closure. These Node checks cannot replace those results.
Reuse passing history/browser/core proofs; do not repeat their manual sequence.

## Executed Node result (2026-09-08)

Isolated typecheck and 17 tests PASS. The 500 MiB case completed in 45.947 s,
including its oracle generation, import, export and independent output reread;
this is one local observation, not a browser/product performance threshold.
Observed chunk maximum: 1,048,576 bytes. Static live-buffer accounting:
3,162,112 bytes (3 MiB + 16 KiB), not a heap/RSS measurement. The final payload
count was one; a completed-transaction replay read zero payload bytes.

Synthetic byte length: 524,288,000. Node and the incremental implementation
agreed on SHA-256
`c8c0875f52ef7820dad6085b1dee88707fa92c5216f950472a2f446ae90cec7b`.
Only the deterministic recipe/digest is retained; generated scratch data was
removed by the test cleanup. No representative/private source was used.

One independent read-only review narrowed the receipt/sink/buffer claims above
and found an invalid-export cleanup P2. Moving validation inside the outer
abort guard fixes it; isolated typecheck and the focused actual-file-sink
regression PASS, followed by reviewer confirmation. Other executable paths are
unchanged from the 17-test run. Root typecheck, 80 files / 1,658 PASS / 21 existing
todo and build PASS; existing import/chunk warnings remain. The application does
not import this proof. No gate adoption or new browser/device acceptance follows.
