# Disconnected reusable domain validation

Authorized by specification 05 §13.3. These are production-quality pure modules,
not an adopted metadata adapter or a complete ProjectDocV2 validator.

- `values.ts` checks/clones already decoded plain JSON without invoking getters;
  rejects invalid Unicode/NFC, nonfinite numbers, unsafe keys/non-JSON values,
  cycles and caller-specified traversal limits; returns an independent frozen
  tree. Unknown finite fractions are preserved and canonical negative zero is 0.
- `sceneRecords.ts` admits individual persisted ProjectScene/Asset-membership/
  Caption-membership shapes and lifecycle unions, nominal field prefixes and
  optional map-key equality. Unknown members, including nested lifecycle members,
  remain intact and set `hasUnknownFields`; no history-free permission follows.
- `normalizeSceneName` is a local-command boundary: normalize user input to NFC,
  then apply the accepted single-line/256-scalar rules. Persisted admission never
  repairs noncanonical source text.

Limits are explicit caller inputs, not a device performance policy. Root depth is
zero; each value consumes one node, including unknown values. Object keys have
the same caller-supplied scalar ceiling and structural single-line restrictions.
Decoding itself must be separately bounded before calling these modules. Raw
duplicate JSON keys are already lost in decoded objects and cannot be diagnosed
here. No raw parser, serializer, digest, package writer or byte I/O is provided.
Host objects, proxies and CRDT library objects are outside the input contract;
the future adapter must supply plain data without losing conflict candidates.

Not yet covered: whole-Project maps and schema version, resource/frame/immutable
payload validity, reference existence/lifecycle/ownership, semantic-key conflicts,
causal delete/edit and immutable mutation checks, full candidate provenance,
blobs/inventory, migration and history-free policy. A `valid-record` result must
not be cast into a fully validated SceneResources provider or publish metadata.
No current application entry imports these modules or the disconnected Scene core.
