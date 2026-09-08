# Reusable domain validation / complete-provider foundations

Authorized by specification 05 §13.3. These are production-quality pure modules,
not an adopted metadata adapter or a complete ProjectDocV2 validator. The finite
provider plan in 05 §13.4 has stages A (records), B (closure/conflict/evidence) and
C (same-host authority). Do not conflate their completion or introduce per-record
workstreams. Stage A's two modules below are not connected authority yet.

- `projectRecords.ts` is one whole-root **decoded record** entry for the amended
  Project and all 14 entity maps. It enforces required maps, schema/nominal map
  identities, known record unions, counts and global canonical-value budgets.
  It reuses the Scene/material guards and preserves the whole independent frozen
  tree, including unknown minor fields. A `valid-records` result has no token,
  SceneResources, save/merge receipt or permission to activate a Project.
- `projectRecordFields.ts` supplies internal checks on that already cloned tree:
  status, portable frame/transform, full anchor/camera/background, BlobRef,
  profile/tool/provenance declarations, roles/catalogs and collection order.
  Required digest strings and profile IDs are syntax only, not verified hashes
  or decoder capabilities. Preserving declared video/audio/document metadata is
  not implementation or activation of those media features. Migration support
  is retained as a protected opaque root subtree, not structurally validated
  by this entry. Stage B must handle it before claiming complete authority.

- `values.ts` checks/clones already decoded plain JSON without invoking getters;
  rejects invalid Unicode/NFC, nonfinite numbers, unsafe keys/non-JSON values,
  cycles and caller-specified traversal limits; returns an independent frozen
  tree. Unknown finite fractions are preserved and canonical negative zero is 0.
- `sceneRecords.ts` admits individual persisted ProjectScene/Asset-membership/
  Caption-membership shapes and lifecycle unions, nominal field prefixes and
  optional map-key equality. Unknown members, including nested lifecycle members,
  remain intact and set `hasUnknownFields`; no history-free permission follows.
- `materialIntent.ts` admits bounded decoded appearance/compositing atomic values,
  normalized colors/numbers, policy-specific cutoffs and opaque/alpha combinations.
  Explicit local appearance edits retain unknown data and untouched exact RGB;
  removing a chroma subtree with unknown fields refuses. This is not material
  target/lifecycle, source optics, coverage rendering or backend admission.
- `materialRecords.ts` composes that atomic-value guard with one decoded
  MaterialOverride's `ovr`/map identity, Project-or-Scene atomic routing,
  `ast`/`fam`/`lay`/`slot` nominal tuple and the shared lifecycle guard. It keeps
  unknown root/routing/scope/target/lifecycle/appearance/chroma/compositing/coverage
  members and flags them with `hasUnknownFields`; a Project scope carrying the
  known Scene-only `sceneId` is rejected rather than repaired. Referenced objects
  may still be absent, inactive, foreign, duplicated or conflicted: individual
  record admission does not resolve those whole-graph conditions or authorize
  history-free export. Tombstone admission does not physically remove anything.
- `recordFields.ts` shares the existing internal nominal-ID/lifecycle checks
  between Scene and material record guards. It consumes already canonically
  cloned values, is not a separate raw-input entry and changes no lifecycle policy.
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

Not yet covered: immutable payload digests, reference existence/lifecycle/ownership,
frame ownership and whole family/partition/DAG relationships, semantic-key conflicts,
causal delete/edit and immutable mutation checks, full candidate provenance,
blobs/inventory, migration and history-free policy. A `valid-record` result must
not be cast into a fully validated SceneResources provider or publish metadata.
Selected pre-existing guards are consumed by the explicit synthetic development
host under §13.4; current Native/v1 entries remain unchanged. The new whole-root
record entry is not an importer or a substitute for stages B/C.
