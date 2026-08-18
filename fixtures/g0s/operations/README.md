# V1 operation characterization corpus

Status: G0 characterization input; this is not a production parser or a completed migration golden.

`corpus.v1.json` freezes raw one-line JSON inputs and the approved high-level decision for the current v1 ingress boundaries:

- `accepted` means the wire operation is canonical evidence; the separate `reducer` field decides whether known-field policy may apply it;
- `opaque` means the raw line is retained as evidence but must not reach authoritative state;
- relation `idempotent` means two wire forms denote the same canonical operation;
- relation `collision` means the same `(actor, op)` names divergent content and neither candidate may be selected silently.

Relations are exercised both with both candidates in one incoming log and with one candidate already durable in the target while the other arrives in a package. Because the current `MergeReport` has no typed operation-collision channel, the latter characterization requires safe merge rejection; that assertion must be replaced by the typed issue/paused-unit result when the report boundary is introduced.

Every `wireJson` and `dispatchInputJson` value is ASCII text. Non-ASCII scalars and controls are represented with JSON escapes so Git/editor normalization cannot change the test input. Raw duplicate members remain representable because the corpus stores JSON text rather than already-parsed objects.

This distinction is intentional: a JSON-escaped control in a known single-line title remains accepted canonical evidence, but field policy reports/quarantines it before reduction. Unknown nested evidence may contain the same scalar without becoming an active known field.

The corpus intentionally does not contain canonical bytes or SHA-256 operation digests. Those become normative only when the independent LegacyJcsV1/RFC 8785 migration companion is ratified and cross-runtime golden generation is available. Tests at baseline `5791413` map each case/ingress to normal, expected-failure, or deferred status outside the corpus so the durable oracle does not encode implementation progress.

Numeric depth/node/array/string budget boundaries and a complete collision report/resolution record remain deferred. The approved specification does not yet fix the v1 numeric limits, and current v1 APIs expose only aggregate parse-error counts rather than durable operation-issue candidates.

Two execution observations are also explicitly deferred rather than counted as passing. Current v1 APIs do not expose canonical-evidence acceptance separately from known-field quarantine, and they do not expose a storage-location-neutral query for durably retained quarantine evidence after package merge. The characterization suite keeps both requirements as `it.todo`; it must not claim full `G0S-OP` completion until those typed boundaries exist.
