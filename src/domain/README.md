# Reusable domain validation / complete-provider foundations

Authorized by specification 05 §13.3. These are production-quality pure modules,
not an adopted metadata adapter or a complete ProjectDocV2 validator. The finite
provider plan in 05 §13.4 has stages A (records), B (closure/conflict/evidence) and
C (same-host authority). Do not conflate their completion or introduce per-record
workstreams. These modules do not provide connected authority yet.

- `projectRecords.ts` is one whole-root **decoded record** entry for the amended
  Project and all 14 entity maps. It enforces required maps, schema/nominal map
  identities, known record unions, counts and global canonical-value budgets.
  It reuses shared Scene/material value rules and preserves the whole independent frozen
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

- `projectGraph.ts` composes A with actual immutable metadata SHA-256 and
  same-lineage prior identity/append-only checks, then whole-record graph
  inspection. Its internal `projectModelGraph.ts` covers owner/frame, direct
  parent, iterative depth-bounded derivation DAG, family/catalog/class and
  proxy/exclusion/group relations. `projectResourceGraph.ts` covers anchors,
  Scene/view/attachment/tag/material references and current semantic duplicates.
  Missing weak anchor provenance preserves the canonical pin; invalid partition
  and old-class review remain distinct. Material maps are validated without
  becoming runtime aliases; conflicting slot mappings remain review items.
- `projectGraphSupport.ts` is internal admitted-value/index/canonical metadata
  support. Immutable preimages include unknown fields and use spec 02 §3.2's
  exact domain-separated UTF-8 bytes and platform SHA-256. This is not a portable
  writer, raw parser, decoder, streamed blob check or adoption of a format profile.
  Hashing failure propagates, never becomes a fabricated success receipt.
- `record-graph-inspection` retains records, scoped issues, known active roots
  and known strong/weak edges. It explicitly lacks all-candidate/causal and
  verified blob/profile semantics and same-token authority. These partial roots
  MUST NOT drive GC, export, save acknowledgement or a SceneResources cast.
  Active Assets/attachments outside Scenes still have roots; parent lineage,
  authored source and input-digest provenance do not protect blobs by themselves.

- `atomicHistory.ts` validates a neutral original-change DAG, exact heads and
  unique final-write identities under shared caller node/work budgets. It derives
  maximal concurrent whole-field writes, retaining absent versus JSON-null values,
  equal-value operation identities, unknown values and overwritten history. This
  is read evidence, not a CRDT implementation, schema or authenticated provenance.
- `projectHistoryReview.ts` classifies the approved semantic field paths and
  inspects historical immutable mutations and lifecycle delete/edit causality.
  Equal complete payloads in the four immutable maps retain all registrations;
  frame/endpoint conflicts remain invalid. Unknown policy stays unverified.
  The isolated candidate checks original flat operations and supplies this evidence
  in the existing development host; its strings are not validated Project records.
  `project-history-inspection` does not validate all candidate values/references,
  certify source extraction for a general schema, compose a Project or activate UI.

- `projectCandidates.ts` now joins original history with the shared whole-root
  header, mutable-field and immutable-record rules. `projectMutableFields.ts`
  serves the whole-record and atomic-candidate paths, retaining material coupling
  checks without inserting defaults. Every candidate is checked, including absent
  versus null; valid operation IDs remain available behind an invalid sibling.
  Known anchor/model/resource graphs consume only unambiguous diagnostic fields
  and all checked anchor candidates. A missing diagnostic field is unresolved,
  not evidence of a removed source field or deleted parent.
- `projectCandidateReferences.ts` reserves all known current candidate references
  and semantic keys by record ID, retaining checked immutable blob/dependency
  references even behind malformed siblings. It keeps unresolved parents distinct
  from missing/deleted ones and does not manufacture keys from absent fields.
  `project-candidate-inspection` retains the complete neutral input, every candidate,
  scoped issues and partial diagnostic records; it gives no SceneResources, GC,
  save or export authority. Schema/map presence comes from the adapter's complete
  decoded-root inspection; declaring those fields alone is not source proof.
  C's actual same-host source-adapter/provider hookup remains mandatory. The
  pinned flat-map test exercises
  two real candidate rounds and save/reload of the full synthetic record fixture.
- `projectContent.ts` runs candidate admission and an application-owned executable
  verifier; imported receipts are not an input. Exact immutable records/full blob
  and profile declarations plus snapshot/fact/context bind every response.
  `projectContentChecks.ts` checks decoded static bounds, catalog bijection,
  authoritative family envelope, logical contribution, repeated-class equivalence
  and source-local ranges. Known active strong closure controls byte requests;
  weak-only history never forces a source read. Individual unmet evidence is
  replaced only by its matching check, retaining all other issues and candidates.
  Development-fixture scope cannot claim ratified-profile authority. The result
  itself supplies no SceneResources. `src/scene/projectProvider.ts` now invokes
  this entry and maps affected fields/strong closures into a scope-labelled
  same-token pair, retaining all source/diagnostics. C's host switch remains open.

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
here. No raw parser, portable serializer, package writer or binary I/O is provided;
only the exact immutable metadata digest computation above is implemented.
Host objects, proxies and CRDT library objects are outside the input contract;
the future adapter must supply plain data without losing conflict candidates.

Not yet covered: connected complete Project/provider authority and general
adapter provenance,
ratified general profile/decoder implementations behind the checked evidence port,
blobs/inventory,
migration and history-free policy. A structural or record-graph result must
not be cast into a fully validated SceneResources provider or publish metadata.
Selected pre-existing guards are consumed by the explicit synthetic development
host under §13.4; current Native/v1 entries remain unchanged. The new whole-root
record entry is not an importer or a substitute for stages B/C.
