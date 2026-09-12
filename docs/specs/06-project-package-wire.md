# ProjectScene package-wire companion — design proposal

> Status: `PROPOSED / UNRATIFIED / NOT IMPLEMENTED`
> Drafted: 2026-09-08, under specification 05 §7.5's design authorization.
> This document does not adopt a package version, adapter, byte budget or writer.
> It does not amend an accepted contract until separately approved. Section 10
> lists the remaining ratification inputs; the S2 wire gate is still open.

## 1. Authority and design boundary

The accepted outcomes are in [specification 05 §§6–7](05-project-scene-team-workflow.md).
The five purposes, original causal history, explicit conflict choices, one-Scene
review and whole-Project clean copy are not new decisions here. Canonical domain
values, nominal IDs, reference strength, corruption handling and streaming safety
continue to follow [specification 02 §§3–4, 7–10](02-storage-package-migration.md),
except where specification 05 explicitly supersedes DisplaySet-era clauses.

The proposed shapes below replace neither the frozen v1 reader nor the current
Native backup/exchange wire. They are not the superseded three-purpose
`PackageManifest` with renamed labels. No old file is reinterpreted in place.
`poc/scene-history/purposes.ts` supplies bounded semantic evidence only; its small
graph, test limits and adapter identifier are not this package schema.

## 2. User-visible purpose and import result

| Discriminator | File carries | Opening the file does |
|---|---|---|
| `teamWorkspace` | Whole Project's causal metadata and required current/conflict/opaque/migration blobs | Start work, or integrate into a verified same-lineage Project without importing models separately |
| `contribution` | Exact current-minus-selected-base changes and newly required blobs | Integrate into an existing verified base; cannot open alone |
| `review` | One explicitly selected Scene's history-free closure | Open in View; explicit edit creates an independent Project first |
| `backup` | Exact durable whole-Project history, complete protected payload inventory and disclosed local exchange-base records | Explicit same-Project recovery/replace, never silent overwrite |
| `clean` | All current editable Project resources and Scenes, re-keyed into fresh history | Open an independent editable Project; cannot contribute back to its source |

One ordinary file selection precedes content inspection and the purpose-specific
action. Filename, extension, model similarity, digest equality and human memo
never select purpose, establish a relation or select a conflict winner.

## 3. Candidate manifest and canonical control bytes

The notation is a closed candidate shape, not exported TypeScript. `Entry` means
`{path, sha256, byteLength}` with exact raw-entry SHA-256 and safe nonnegative
length. `Identity`, `MetadataEnvelope`, `BlobRef` and nominal IDs retain their
accepted domain grammars. Optional means absent, not `null`. Manifest, local
receipt and review-snapshot objects reject additional fields unless a separately
ratified extension explicitly permits them. This does not override preservation
of unknown minor fields inside same-lineage ProjectDoc/history bytes.

```ts
type PackageManifestDraft = CommonDraft & (
  | { purpose: 'teamWorkspace'; identity: Identity;
      metadataEnvelope: MetadataEnvelope; targetHeads: Heads;
      metadata: Entry }
  | { purpose: 'contribution'; identity: Identity;
      metadataEnvelope: MetadataEnvelope; targetHeads: Heads;
      base: { workspacePackageId: PackageId;
        workspaceManifestSha256: Sha256Hex; heads: Heads };
      changes: ChangeEntry[] }
  | { purpose: 'backup'; identity: Identity;
      metadataEnvelope: MetadataEnvelope; targetHeads: Heads;
      metadata: Entry; protectedInventory: Entry; exchangeBases: Entry;
      baseEvidence: EvidenceRef[] }
  | { purpose: 'clean'; identity: Identity;
      metadataEnvelope: MetadataEnvelope; targetHeads: Heads;
      metadata: Entry }
  | { purpose: 'review'; snapshotId: SnapshotId; snapshot: Entry }
);
interface CommonDraft {
  format: /* exact format literal reserved for ratification */ string;
  wireVersion: /* exact version reserved for ratification */ string;
  packageId: PackageId;
  createdByVersion: string;
  summary: AutomaticSummaryDraft;
  memo?: string;
  blobs: { path: string; sha256: Sha256Hex; byteLength: number }[];
  payloadTotals: { entryCount: number; uncompressedBytes: number;
    largestEntryBytes: number };
}
interface ChangeEntry {
  ordinal: number;
  expectedChangeHash: Sha256Hex;
  dependencies: Heads;
  byteLength: number;
  bytesSha256: Sha256Hex;
}
```

Proposed control encoding is exact UTF-8 `LociCanonicalJsonV1`, without BOM,
padding or final newline. A duplicate-aware parser validates raw Unicode, keys,
NFC, numeric limits and shape before construction; re-encoding must equal the
entry bytes. This rule does not canonicalize adapter-native history bytes.
`createdByVersion` uses the existing printable-ASCII version ceiling; candidate
memo uses the existing 256-scalar single-line label rules. Neither is authority.

Every export allocates a fresh `pkg_` plus 128 CSPRNG bits, collision-checked
against available records. It is not a change hash or a deterministic retry ID.
Manifest digest is plain SHA-256 of its exact canonical bytes, computed outside
the manifest to avoid self-reference. Proposed `manifest.sha256` contains exactly
64 lowercase ASCII hex bytes, with no newline. It detects corruption only, not
authentication: an author can replace both manifest and checksum.

Each metadata/snapshot/control payload and blob is bound by its descriptor in
the manifest; each change is bound by both its raw digest and adapter-native
hash/dependencies. Change path is derived as `changes/<8-digit ordinal>.amchange`,
not supplied by input. No inline change bytes or arbitrary attachment paths.
Equal blob digests share one physical entry. Conflicting byte length or bytes
under one digest reject; media type remains a validated semantic `BlobRef` field,
not a second physical CAS identity. Blob paths are derived as `blobs/sha256/<digest>`.

`payloadTotals` counts every declared non-control payload entry, including
metadata/changes, backup records and blobs, once. It excludes `manifest.json` and
`manifest.sha256` to avoid size self-reference. Separate fixed reader budgets
bound those control entries and archive overhead. Declared totals must equal
observed totals; they never authorize allocation or relax a lower device budget.

## 4. Head sets, history and base-relative payloads

`Heads` is sorted, unique, lowercase 64-hex adapter-native change hashes. The
pinned adapter gate must prove this conversion; raw-entry SHA-256 is not a
substitute. Target and exchange-base head sets are nonempty valid DAG frontiers;
a root change alone may have empty dependencies. No actor/time ordering defines
a head set. Full metadata must decode to exactly the declared identity/root and
target frontier, with the verified empty-collections bootstrap from 02 §4.

For a Contribution, let `B = reachable(base.heads)`, `T = reachable(targetHeads)`.
The sender freezes one durable target and one explicit retained base. It sends
exactly `D = T - B`, preserving original actors, sequence, time, message, hashes
and bytes. Ordinals start at zero, are contiguous, and use the dependency-
topological/lexicographic-ready ordering of 02 §8. A repeated descriptor/hash,
missing dependency, extra change outside `D` or omitted change in `D` is invalid.
An empty delta is valid and creates no metadata change on import.

`T` need not descend from every base head. Decode/apply against the verified
base in a detached document, reconstruct the declared target view, and verify
`D` from its reachable graph. The temporary base-plus-delta document can have
heads different from `targetHeads`; do not relabel those union heads as the
sender's target. A dependency must be in `B` or at an earlier delta ordinal.
The receiver must possess every declared base head and prove the same root;
matching a package ID alone proves neither history nor receipt.

Derive the sender's target required strong/conflict/opaque/migration closure,
not every transient historical reference. The delta contains only payloads not
guaranteed by the verified base's required/protected inventory. A current
reference to an old collected historical payload requires restaging: presence
of its immutable metadata is not proof that the base has bytes. Unknown fields
force conservative inventory retention. If a trustworthy base inventory cannot
be established, refuse delta export and offer a self-contained Team Workspace.
Do not read an unchanged large payload merely to calculate Caption-only changes.

Before receiving metadata is activated, validate the receiver's detached final
union, including local-only resources and every conflict candidate. Its entire
required closure must be either in verified durable CAS inventory or newly
verified input. A missing base, dependency, payload, valid lineage proof or
budget leaves old published heads unchanged. A valid semantic conflict retains
the full original batch and exposes the affected review state atomically.

### 4.1 Durable local exchange-base records

Proposed closed local record (not ProjectDoc or participant-merged metadata):

```ts
interface ExchangeBaseDraft {
  identity: Identity;
  metadataEnvelope: MetadataEnvelope;
  workspacePackageId: PackageId;
  workspaceManifestSha256: Sha256Hex;
  declaredHeads: Heads;
  evidence: WorkspaceEvidenceDraft;
  completions: WorkspaceCompletionDraft[];
  label?: string;
}
// Content-addressed evidence, not model/media BlobRef or an arbitrary path.
type EvidenceRef = { sha256: Sha256Hex; byteLength: number };
interface WorkspaceEvidenceDraft {
  manifest: EvidenceRef;
  metadata: EvidenceRef;
}
type WorkspaceCompletionDraft =
  | { observation: 'imported'; publishedReceiverHeads: Heads }
  | { observation: 'generated' };
```

A table keys these records by Project identity/epoch plus Workspace package ID.
Different manifest/heads under the same key are an integrity issue, never last-
writer-wins. `completions` is nonempty, sorted by canonical encoded bytes and duplicate-free;
union of exact completion entries is idempotent. `observation` describes a local
event, not who received a file. `publishedReceiverHeads` binds an import's actual
publication event, not a replacement for the Workspace's `declaredHeads`.
An imported Workspace records its declared heads after verified publication,
not the result of merging with local work. A generated Workspace records its
declared heads only after the export sink finishes successfully. Contribution
import/export never advances or synthesizes this record. Selecting another
retained base is explicit; neither most recent filename nor current heads select it.

The evidence retains exact original canonical Workspace manifest bytes and exact
original `metadata.am` bytes, each with its own digest/length. The manifest's
digest equals `workspaceManifestSha256`; its purpose, package ID, identity,
envelope and target heads equal the record, and its metadata descriptor's digest/length equal
the retained metadata reference. Validate the root/history/heads from these bytes.
The verified manifest's blob descriptors are the base's exact guaranteed inventory,
not all historically mentioned blobs. Recompute the required closure against that
inventory; unknown minor fields retain the conservative inventory. No guessed
inventory from hashes, current UI state or the receiver's later union is valid.

An available retained base protects its evidence and guaranteed inventory as local
retention roots. This may retain models no longer active in current Scenes and is
included in backup's protected inventory. Inventory verification uses the existing
durable CAS guarantees; it does not reread large models for Caption-only output.
Loss/corruption of retained evidence or guaranteed bytes makes that base unavailable,
with repair/new-Workspace recovery, not silent use of a weaker guarantee. Removing
a base and its protection would require an explicit disclosed retention operation;
this draft does not add such a UI or silently expire a record.

The completion and evidence references commit atomically in the local base table,
after the following events. Publication's local receipt and package roots must
outlive a crash until base completion is recorded or explicitly reported incomplete.

| Event / interruption | Base-table result |
|---|---|
| Workspace import validated but not published | No imported completion |
| Imported batch published, including a valid zero-change import | Persist a local publication receipt bound to package/manifest/declared heads and actual receiver heads; idempotently finish its base record before advertising it |
| Output has started, failed or cancelled | No generated completion; explicit incomplete output |
| Exact output sink reports successful close | Atomically persist generated completion with retained evidence; only then advertise the base |
| Sink closed but crash precedes durable completion | Completion is unknown, not inferable from a filename or materialized bytes; do not invent a record. Use an independently verifiable retained sink receipt if the adopted sink supports one, otherwise report uncertainty and offer a fresh Workspace |
| Completion exists, retry/restart | Validate evidence and replay only the same local table update; never generate new metadata or advance another base |

These receipts are local recovery records, not signatures, recipient acknowledgments
or proof that a person retained the output. A backup restore discloses that they
are historical observations. Exact backend receipt/atomicity and chosen sink
capabilities remain adoption inputs; a generic download-start callback is not close.
A missing/stale record offers a new Team Workspace, not an inferred base.

Only backup includes the table, under `exchange-bases.json`: the closed object is
`{records: ExchangeBaseDraft[]}`, sorted by identity/epoch/package ID, with all
records belonging to the backup's exact Project lineage. Evidence entries use
derived paths `base-evidence/sha256/<digest>` in digest order and are deduplicated
by raw digest/length. Both their bytes and descriptors are required; extra entries
reject. Their inventory is declared as `baseEvidence: EvidenceRef[]` on the backup
manifest branch, sorted/unique by digest; it is forbidden on the other purposes.
It includes exactly the union of record evidence references. Backup's ordinary
blob entries/protected inventory include the guaranteed model/media/evidence-blob
closure of all retained bases, once per digest. Evidence control bytes are not
mistaken for semantic model/media resources. All these entries count in totals
and budgets. Missing proof makes a restored base unavailable; a supposedly complete
backup with missing declared evidence rejects before replacement.
No local path, handle, transient UI selection or participant profile is allowed.
Imported/generated local provenance is preserved as a workflow hint and disclosed.

## 5. Self-contained and history-free envelopes

Team Workspace and backup carry exact retained causal history, not a rebuilt
document of materialized values. Both verify the full source identity/root and
all required blobs before publication. Team Workspace excludes exchange records
and ordinary UI state. Backup additionally carries the complete protected
inventory and migration continuity; unfinished storage transactions are recovered
or explicitly reported, never packaged as a misleading completed backup.

Clean includes all active resources, even those in no Scene, and their editable
source/derivation closure. It re-keys every nominal ID and equality class with a
complete typed reference map, then creates a fresh Project/epoch/seed/root. Changed
immutable payloads get recomputed digests. Source history, migration subtree,
parent revision/binding links, exchange records and contributor identity are
excluded. Included semantic conflicts or unknown unclassified fields block
generation. No sender identity or source head set is added to its manifest.

### 5.1 Proposed one-Scene review snapshot

This is a separate immutable snapshot, not `ProjectDocV2` with most maps emptied.
Candidate root members are exactly `schema`, `snapshotId`, `project`, `scene`,
`assetsById`, `representationsById`, `captionsById`, `mediaResourcesById`,
`captionAttachmentsById`, `captionTagsById`, `captionTagMembershipsById`,
`sceneAssetMembershipsById`, `sceneCaptionMembershipsById`, `viewsById` and
`materialOverridesById`. `schema`'s exact kind/version awaits ratification.

| Record | Closed fields / rule |
|---|---|
| `project` | `title`, `frame`, `defaultSceneId`; default equals the sole Scene's re-keyed ID |
| `scene` | `id`, `name`, `orderKey`, optional `defaultViewId`; no lifecycle |
| visual Asset | `kind: 'visual'`, `id`, `label`, `assetFrameId`, `assetToProject`, sorted unique `compatibleAnchorClassIds`, sorted unique `representationIds` |
| positioned nonvisual owner | `kind: 'nonvisualOwner'`, `id`, `assetFrameId`, `assetToProject` only; no label, binding/revision, compatibility list or payload |
| unplaced-only nonvisual owner | `kind: 'unplacedOwner'`, `id`, `assetFrameId` only; exact source identity/frame mapped, no transform, label, binding/revision, compatibility or payload |
| Representation | `id`, `assetId`, `representationFrameId`, `contentKind`, `purposes`, `role`, `variantFamilyId`, `formatProfile`, `blob`, `representationToAsset`, `logicalBoundsAsset`; optional `materialCatalog`, `compositeGroupId`, `targetGsVariantFamilyIds`, `proxyForGsVariantFamilyId` |
| Caption | `id`, `title`, `body`, optional `colorSrgb`, `anchor`; no owning Scene, DisplaySet or lifecycle |
| Asset membership | `id`, `sceneId`, `assetId`, `orderKey`; active source edges only |
| Caption membership | `id`, `sceneId`, `captionId`, `orderKey`; active source edges only |
| Saved View | `id`, `sceneId`, `name`, `orderKey`, `projectFrameId`, `camera`, `background` |
| Material override | `id`, `routing`, `appearance`, `compositing` as amended in 05 §3.3; no lifecycle |
| MediaResource | `id`, `blob`, `mediaKind`, optional `label`, recomputed `payloadDigest` |
| Attachment | `id`, `captionId`, `mediaResourceId`, optional `altText`, `orderKey` |
| Tag / tag membership | `id`, `label`, optional `colorSrgb`, `orderKey` / `id`, `captionId`, `tagId` |

All nested values keep the applicable closed domain constraints from 01 and 02,
subject to the explicit omissions here. Representation purposes contain only
`display`, `preview`, `interaction`; no source-purpose or derivation edge survives.
Material catalogs include their validated source semantics only with the owning
Representation. Optional fields are not permission to include unknown metadata.
This draft does not expand supported media beyond the current product boundary.

Asset anchors retain `kind`, `assetId`, `assetFrameId`, canonical `positionAsset`
and re-keyed `authoredAnchorCompatibilityId`. Manual anchors contain only
`hitEvidence: {method: 'manual'}` and no normal/confidence/source. Nonmanual anchors
may retain `normalAsset` and `hitEvidence` with method from the accepted nonmanual
enum and optional finite `[0,1]` confidence. They never retain authored revision or
any `hitEvidence.source`. ProjectAnchor retains its existing closed fields.
The proposed unplaced branch from 05 §9.4 contains only `kind: 'unplaced'` and
optional re-keyed `ownerAssetId`. It requires no position, compatibility or
transform. Known owner references cannot be dropped for convenience; absent
owners create no Asset. Unresolved placement/owner conflicts are not unplaced.
All references/frame equalities, nominal ID ownership and tuple uniqueness are
validated after re-keying. A compatibility ID belongs to exactly one Asset;
absence from its own visual Asset's active list is valid `needsReview`, not a
reason to select another class. Suppression for a nonvisual owner is structural,
not a fabricated compatibility result.

Exactly one active source Scene is chosen explicitly. Include all its active
memberships, included Caption media/tag closure, active views and applicable
material intent. No search, pin-color filter, temporary hide/isolate, free camera
or window state changes export scope. A nonvisual owner exists only to preserve
an included Caption's known owner when that Asset has no Scene membership. If any
included Caption has a positioned Asset anchor for that owner, use `nonvisualOwner`;
its authoritative transform comes from the source binding (or a preserved exact
pending transform of an unresolved owner). Unavailable/conflicted transform blocks
that positioned closure. If only unplaced Captions refer to it, use `unplacedOwner`:
the source Asset ID/frame must be authoritative, but transform/binding/payload
are neither required nor copied. This rule also allows an unresolved model owner
to remain list-only. Neither branch creates Scene Asset membership nor a
Representation entry, and its marker/connector remain suppressed. The review
discloses that this owner's model is not included; it must not offer an enabled
`モデルを表示` action that cannot succeed from this package.

Every included field/closure must be authoritative. The only omission exception
is a conflicted optional entry view after explicit `開始視点なし` preflight and
confirmation. Do not omit another conflicted Saved View, material, membership or
Caption, and do not turn a required conflict into a placeholder in the exported
bytes. Unrelated Project/Scene conflicts do not block the selected closure.

Proposed review-to-clean mapping for either nonvisual branch is an independently
re-keyed ordinary Asset with its mapped `assetFrameId`, neutral generated label
`モデル未収録` and `status: {kind: 'unresolved', reason: 'missingSource'}`.
Only `nonvisualOwner` also sets `status.pendingAssetToProject` to its exact transform;
`unplacedOwner` must omit it. No active binding, model/revision, expected digest
or compatibility assertion is fabricated. Unplaced anchor known-owner links
and positioned anchor/frame/compatibility identities are re-keyed with the same
typed map; the unresolved model's marker stays suppressed, while its Caption
remains editable. No Scene-model edge is added. Visual Assets use the ordinary
history-free reconstruction path. This is a technical mapping proposal, not an
implemented builder or ratification of the remaining nested field policy.

## 6. Mandatory automatic summary and privacy

Proposed summary fields are `algorithm`, `scope`, `entityClasses`, `fieldClasses`,
`blobEntryCount` and `blobBytes`. Entries in the class arrays are sorted unique
`{class, count}` pairs. Scope is `entireHistory`, `baseDelta` or `snapshot`.
Team Workspace/backup count their exact declared target history; Contribution
counts exactly `D`; review/clean count only the newly constructed output, never
source history. Field classes name atomic semantic fields, not arbitrary nested
JSON paths, private IDs or user-entered values. A count is the number of distinct
entities touched in that class, so edit-then-revert still counts in causal scopes.

The algorithm ID, exact class dictionary, adapter-to-domain attribution and
opaque-change accounting need one pinned, bounded classifier with golden vectors
before ratification. Unknown operations cannot be classified using a library
winner or silently dropped. This draft intentionally supplies no fake finalized
algorithm ID. The receiver recomputes the summary from verified input plus the
verified base where needed; mismatch rejects before activation. The summary is
not conflict resolution, proof of authorship or a substitute for detailed review.

History-free export uses a versioned closed field policy and full typed ID map,
including frames, Scene/membership IDs, compatibility/composite equality classes
and material catalog IDs. Same-lineage packages preserve unknown minor data and
protected opaque inventory; unknown fields block review/clean unless explicitly
recognized. Never infer a privacy rule from strings resembling IDs.

Omit entire migration support, deleted values, old actors/changes, profiles,
source identity/history and local exchange state from review/clean. Clean's
manual/nonmanual anchor transformation follows 02 §9.3, not a generic recursive
copy: compatible manual anchors name the rebuilt active revision; `needsReview`
manual anchors omit it. Nonmanual revision/source provenance is re-keyed together
only when its complete validated targets are already in the editable closure;
otherwise both are omitted. Verify parsed and raw/decoded-history sentinels.
Current Caption text, labels and original model/media embedded metadata remain
user content: they are not promised anonymous, scrubbed or EXIF-free. Preflight
discloses included Scene/model/Caption/media counts and this metadata boundary.

## 7. Candidate container and interruption flow

Proposed layout is a strictly bounded ZIP, with `manifest.json` first,
`manifest.sha256` second, purpose-specific metadata/snapshot or ordinal changes
next, backup inventory/base entries and base evidence next, and blobs last in digest order. Fixed
payload names are `metadata.am`, `review.json`, `protected-inventory.json` and
`exchange-bases.json`; only entries allowed by the selected purpose occur.
No directories or undeclared payloads are needed. ZIP feature/ZIP64 policy and
exact compression/sink profile require the streaming gate before any writer.

Inspect actual container signature and entries, never extension. Validate the
central/local records agree, exact allowed paths and order, unique names, type,
encoding, sizes and hashes. Reject path traversal, case/NFC collisions, special/
encrypted entries, prohibited nested archives and unsafe compression, per 02 §10.
The preflight is read-only; extraction is bounded staging, not active publication.
Manifest sizes are checked before allocation and measured while streaming.

One consistent durable head set plus protected package roots lasts through export
sink completion and the durable completion/base-retention handoff in §4.1, or
until explicit cancellation safely releases the incomplete job. There is no GC
gap between the package roots and retained-base roots. Concurrent edits belong to the next export.
Sink failure stays an explicit incomplete output; it cannot acknowledge a saved
file or advance a base. A resumable job binds the exact frozen manifest/input;
otherwise retry is a new export with a fresh package ID, not a spliced prefix.

Import stages and verifies, validates detached domain/conflicts and full closure,
then uses a single publication barrier. New workspaces list only after the last
completion marker. Existing Projects display old published heads read-only while
a journal is unfinished; edit/export/GC are blocked. Valid semantic conflicts
publish together with the complete batch; invalid input activates nothing.
Quota, cancel and corruption retain the original source and a clear retry/repair
route. No automatic overwrite or winner choice occurs on recovery.

## 8. Proposed journal source adaptation

02 §8 currently requires exact `source-metadata.am`, its own hash/length, source
envelope/root/heads, original ordinal changes and final-head verification. A
Contribution has no self-contained original `metadata.am`. It is invalid to hash
the delta as a full document or attach the package's digest to reserialized bytes.

### 8.1 Closed candidate source union

Keep local-command journals unchanged. A separately versioned remote-package
journal admits the following closed `source` value, within 02 §8's existing
transaction target, receiver `baseHeads`, original `changes`, staged blobs and
`expectedFinalHeads`. No existing v1 journal is reinterpreted as this shape.
The common package descriptors bind exact original manifest/checksum files.

```ts
type RemotePackageSourceDraft = {
  packageId: PackageId;
  manifest: EvidenceRef;
  checksum: EvidenceRef;
  metadataEnvelope: MetadataEnvelope;
  remoteHeads: Heads;
} & (
  | { kind: 'fullMetadata'; metadata: EvidenceRef }
  | { kind: 'contributionDelta'; base: ExchangeBaseProofDraft;
      wireChanges: ChangeEntry[]; reconstruction: ReconstructionDraft }
);
interface ExchangeBaseProofDraft {
  identity: Identity;
  metadataEnvelope: MetadataEnvelope;
  workspacePackageId: PackageId;
  workspaceManifestSha256: Sha256Hex;
  declaredHeads: Heads;
  evidence: WorkspaceEvidenceDraft;
}
interface ReconstructionDraft {
  kind: 'derivedTargetView';
  adapterId: string; // exact pinned adapter contract ID: ratification input
  targetMetadata: EvidenceRef;
}
```

The original manifest is stored at fixed `source-manifest.json`, its checksum
at `source-manifest.sha256`. Full-source original bytes remain at
`source-metadata.am`, and their descriptor/envelope/heads must match the manifest.
Contribution has no such original metadata file. It retains every wire delta part
under `wire-changes/<8-digit ordinal>.amchange`, its base manifest/metadata by
content-addressed evidence reference, and a separate `derived-target-metadata.am`.
The latter's independently computed digest/length belongs to `targetMetadata`,
not the original package metadata or delta. Paths are fixed/derived, never supplied
by a journal. No hash is used as a substitute for required retained bytes.

The source's package ID, envelope and remote heads agree with the original
manifest and transaction target. Only Contribution can use `contributionDelta`;
only a causal full-metadata purpose can use `fullMetadata`. History-free review
does not use this remote merge union. Backup replacement and new clean-Project
creation retain their explicit purpose-specific activation authority; the union
does not grant generic merge permission for either.

The base proof is a frozen projection of a validated available §4.1 record, not
a lookup by package ID at recovery time. Its original Workspace bytes prove exact
identity/bootstrap/envelope/frontier/inventory; it matches the Contribution's
declared base. Do not copy labels, local completion observations or current heads
into that proof. Base evidence and required original parts stay protected for
the entire transaction even if another local operation changes the table.

### 8.2 Exact preparation, digest and recovery

Let `B` be base-reachable changes, `T` sender-target-reachable changes, and `R`
receiver published-reachable changes. Preparation under the origin transaction
boundary must prove:

1. Every base head exists in the receiver with the same bootstrap identity.
2. Original wire parts are exactly `D = T - B`, individually byte/hash/dependency
   verified in canonical dependency order. Build a detached base-plus-delta union,
   then select the exact declared target view; its heads are not the union heads.
3. The saved derived target decodes to that identity/frontier with exactly the
   original reachable change hashes/bytes. A valid equivalent adapter serialization
   may have different save bytes, hence its separate raw descriptor; never rewrite
   changes or use a reconstruction to excuse a missing original wire/base file.
4. Receiver journal parts are exactly `M = T - R`, obtained as original change
   bytes, not re-authored values. They are stored in the existing receiver
   `changes/<8-digit ordinal>.amchange` order, separate from wire ordinals. Preserve
   local-only work and verify detached final union heads and its full required
   strong/conflict/opaque/migration payload closure before `blobsVerified`.

Full-source preparation proves the same receiver difference/final union directly
from the retained original metadata, without a derived-source claim.

The proposed remote-journal digest uses a new domain separator
`lociview:v2:metadata-change-set:jcs-v2\n`, not 02 §8's v1 domain. Its canonical
preimage is exactly `{transactionId, target, purpose, stagedBlobs, metadataBatch}`,
with only `metadataBatch.exactChangeSetDigest` excluded. It includes this entire discriminated
source, original manifest/checksum, wire/base/derived descriptors, receiver heads,
receiver change descriptors and expected final heads. Thus changing the source
kind or any evidence binding changes the digest. Exact journal version literal,
adapter ID and canonical byte goldens are still ratification inputs; the current
v1 digest and executable journals are unchanged.

| Recovery point | Required behavior |
|---|---|
| Staging incomplete, before durable prepared acknowledgment | Resume the same retained input if complete; otherwise report incomplete/quarantine. Publish nothing; do not synthesize source bytes |
| `blobsVerified`, receiver has a durable prefix | Revalidate all source/base/derived proofs and exact M; replay only missing original M parts, verify expected final heads and publish once |
| Metadata durable but not published | Recover publication from the exact journal after verification; old published heads remain authoritative until the barrier |
| Already published | Verify completion and return no-op; do not append changes or publish again |
| `M` empty, even when `D` is nonempty | No metadata journal/change/publication. A valid Workspace may separately record an imported base; Contribution never advances one. Required blob repair is a distinct bounded transaction, not an empty merge disguised as completion |
| Prepared/acknowledged source, base, derived bytes or receiver part missing/tampered | Read-only repair preserving old authoritative view/source. Do not regenerate missing acknowledged data, select a winner or hide storage loss behind a successful retry |

Cancellation after durable preparation follows existing journal recovery rules,
not silent discard of committed prefixes. Collection cannot remove original/base/
derived evidence while a journal or completion recovery still needs it. After the
authoritative completion marker and local follow-up receipts are durable, ordinary
retention policy may release transaction-only evidence; retained bases remain roots.

This is a proposed compatibility amendment, not permission to change 02 §8.
Its source union, base completion, budgets and byte/recovery vectors must be
ratified together. Existing full-source proofs remain reusable within their exact
scope; S2 Contribution import remains blocked until this interface is implemented
and proved after the applicable approvals.

## 9. Acceptance vectors required before S2

These are vector requirements, not tests executed by this document. Reuse the
existing causal/semantic/CAS evidence only within its recorded scope.

| Vector group | Required result / accepted requirement |
|---|---|
| Five minimal valid manifests | Exact canonical bytes, manifest checksum, inventory and only legal discriminator fields; fresh package IDs (`TEAM-PKG-06/07`) |
| Canonical and hostile container | Duplicate keys/names, invalid Unicode/NFC, paths, lengths, nested archives, compression and observed-over-declared budgets rejected before activation (02 §10) |
| Base O; unsent A and imported sibling B; newer W | Both arrival orders, no automatic base advancement, exact subtraction, restart and backup continuity (`TEAM-PKG-04/08`) |
| Incomplete/tampered delta | Missing/wrong base/root/dependency, duplicate/extra/changed parts, false heads/summary and missing blob produce zero publication (`TEAM-PKG-03/07`) |
| Caption-only / model revision | Zero unchanged 500 MiB model payload reads/embedding versus exactly new required model bytes (`TEAM-PKG-02`); reuse existing fixture recipe, no gratuitous stress rerun |
| Review / clean privacy | Explicit Scene versus all active resources; hidden-owner Caption has no owner model bytes; full typed re-key and parsed/raw sentinel checks (`TEAM-PKG-06/09`) |
| Conflicts / omission | All included conflicts block history-free output; only confirmed optional entry-view degradation allowed; causal outputs retain candidates (`TEAM-PKG-03/09`) |
| Journal/base-table interruption | Complete old/new publication across actual backend/two-tab/restart; exact original bytes survive retries; sink failure does not create a generated base (`TEAM-PKG-05/08`) |
| Same-Project restore / independent edit | Explicit backup choice, exact protected blobs/base recovery; review-to-clean preserves list-only owners without fabricating a model or source lineage (`TEAM-PKG-01/06`) |

Golden manifests must identify fixture inputs, exact expected entry/control bytes
and digests, canonical valid/invalid outcomes and expected publication state.
Fixtures are synthetic or public-authorized; private source names/paths/hashes
and implementation-only probe identifiers never enter tracked vectors.

### 9.1 Defined structural vectors for this amendment

These are exact causal/state expectations, not fabricated canonical byte goldens
or executed tests. The later pinned adapter fixture must substitute actual original
change bytes/hashes and retain these outcomes. `root` denotes the verified empty
bootstrap; `participantEdit` and `coordinatorEdit` independently depend on it.
`localEdit` depends on `coordinatorEdit`. Names below are synthetic fixture roles,
not identities or automatic choices shown to users.

| Vector | Input and interruption | Exact expected result |
|---|---|---|
| Sibling target, newer selected base | Base heads `[coordinatorEdit]`; sender heads `[participantEdit]`; receiver heads `[localEdit]` | Original wire D and receiver M each contain only `participantEdit`; derived target heads `[participantEdit]`; final receiver heads `[localEdit, participantEdit]` in hash sort order, never rewritten to sender heads |
| Receiver already has target | Same base/target and wire D; receiver already has both final heads above | D still verified/retained during validation, M empty; no metadata journal/change/publication and no Contribution base update |
| Tampered evidence | Replace one original wire part, base metadata byte, source-kind tag or derived descriptor after preparation | Digest/proof failure; old published heads remain authoritative, no regeneration of acknowledged data |
| Interrupted original-parts apply | Sender has three dependent original parts; interrupt after first becomes durable | Old publication remains; resume exact remaining parts, publish complete expected union once; next recovery no-op |
| Workspace completion | Valid Workspace import adds zero changes to an already-complete receiver | No metadata publication; one idempotent local imported completion bound to exact original Workspace heads/evidence, distinct from receiver heads |
| Output completion unknown | Crash after successful sink close but before durable completion | No generated base promoted from prepared state; explicit uncertainty, receipt-based verification or fresh Workspace export |
| Base survives inactive model | Retained Workspace requires a model no longer active at current heads; run GC then backup/restore | Base evidence and guaranteed body stay protected; restored base verifies; Caption-only delta performs zero reads/embedding of unchanged model body |
| Late old-unplaced input | Baseline/input both unplaced while v2 Caption was explicitly placed; input changes only body | No anchor change; body integrates, current v2 placement survives; identical input replay adds no changes |
| Concurrent actual placement | Old input placement differs from baseline; v2 also changed placement | Retain complete Anchor candidates for explicit whole-value selection; no guessed owner/coordinate combination. Independent keep-both applies only to the separate membership conflict, not to this scalar field |
| History-free unplaced owner | Selected Scene includes unplaced Caption only; its known Asset is unresolved/outside Scene | Review includes Caption plus `unplacedOwner` without transform/model bytes; clean re-keys unresolved owner and membership, no fabricated binding or Scene-model edge |

Unknown-owner input uses the same last vector with `ownerAssetId` absent: no
owner Asset is created. A positioned Caption sharing that owner instead requires
the authoritative-transform `nonvisualOwner` branch. Missing/conflicted owner
identity is a blocked closure, never the unknown-owner variant.

## 10. Remaining ratification inputs and stop boundary

Readiness review (2026-09-10): the five user purposes and conflict/source-preservation
policies are already approved; the following are exact technical ratification
inputs, not invitations to reselect those policies. Current sequencing and reused
evidence are at the top of `../../tasks/todo.md`. Specification 05 §9.4 records a
PO-approved unplaced-Caption preservation and its proposed atomic technical
mapping. Sections 4.1, 5.1 and 8 now specify retained base evidence/completion,
nonvisual-owner conversion and the full/delta source distinction; §9.1 supplies
structural vectors. Runtime admission still lacks the unplaced branch. Product
approval does not ratify this proposed wire/schema or execute those vectors.

The proposal is reviewable, not yet an executable wire contract. Resolve these
three grouped inputs once; do not grow another isolated browser page or treat a
new documentation checkpoint as a technology gate pass.

2026-09-12 sequencing clarification: 05 §7.5 requires the complete five-purpose
wire/schema, budgets, privacy/recovery and golden contract before S2 reads or
writes its first byte. Workspace/Contribution may be implemented before backup,
review and clean only AFTER that complete ratification; a smaller implementation
slice is not permission to ratify only two purposes. Raw-model new-Project work
does not require every legacy converter first. Native/v1/LociMyu entry and late
old-format receive require the exact applicable 07 recipe/artifact evidence;
their implementation can follow the first new-Project team round without being
removed from the practical candidate. Storage/device/adoption gates stay separate.

1. **Exact wire/profile:** choose the format/version and adapter identifier,
   ZIP/ZIP64/compression/sink profile, summary classifier, complete backup
   inventory schema and golden byte manifest, including the proposed base-evidence
   shapes. Fix metadata/change/
   manifest/archive/entry/ratio/count/depth/head/base-record/output-working-space
   budgets from measured Desktop/iOS evidence. Existing semantic ceilings apply;
   the much smaller PoC limits are not product limits.
2. **Delta-to-journal and base completion:** ratify section 8's source/receipt
   amendment and section 4.1's durable base update with canonical byte fixtures
   and backend completion/receipt behavior for §9.1's recovery vectors.
   Keep original wire bytes, derived validation bytes and receiver publication
   distinct; require sufficient pinned base evidence rather than a bare hash.
3. **History-free builder:** pin the complete nested copy/omit policy and one-Scene
   review-to-clean mapping, including nonvisual owner/`needsReview` preservation;
   prove deterministic class/ID remapping and privacy on the exact schema.

Independent review may correct this draft but cannot approve it for the Product
Owner. After these inputs and explicit ratification, S2 still depends on the
metadata/CAS gates and separately ratified migration/Native-bridge companion.
The proposed [07 companion](07-project-scene-migration.md) §7.2 now drafts a
prepared-migration journal source distinct from this document's full-metadata/
Contribution union, plus portable managed-unit/introduction evidence in §§5–7.
Its interface is specified as a draft; executable exact artifact/profile and
retention/recovery evidence remain ratification inputs, not an
implicit permission to feed converted Native metadata into a remote source slot.
No production reader/writer, current UI connection, dependency adoption, release,
Pages, Service Worker, media expansion or performance guarantee is authorized.

## 11. Proposed implementation/adoption split — PO decision pending (2026-09-13)

This section is a concrete recommendation, NOT ratification and NOT an amendment
already in effect. 05 §7.5 and §10 above still apply. The current implementation
checkpoint is `0b2de6b`; no ProjectScene package reader/writer exists there.

Later PO clarification: routine design/implementation/verification sequencing is
delegated. The remaining boundary is approval of the complete concrete technical
contract and any required gate amendment, not another request for that procedural
delegation. This historical heading does not reopen an answered question.

PO clarification (2026-09-13): distributor/participant/integrator are scenario
actions, never fixed permissions (05 §6.1). The contract to settle describes what
each of the five file purposes contains and does on open/integration, not who is
allowed to perform those actions. Their purposes are already accepted; exact
encoding, complete inclusion/omission, limits and implementation gates remain
the proposed decisions below.

Separately, product contract 00 §2.1 and UI guidelines §9.1 now record the accepted
external-file-only `保存` language and identifiable last-Project resume with
another-Project navigation. This presentation decision does not approve this
section's implementation/adoption split or its artifact/receipt/base protocol.

The subsequent game-like manual/automatic save direction is recorded in 00 §2.2.
It concerns protected save points and recovery, not a new purpose discriminator
or proof that an external autosave sink/rotation already exists. Its concrete
sink and backup/Workspace packaging relationship still need design closure.
The latest refinement fixes one replaced automatic point plus optionally named
manual checkpoints, not generations; it does not authorize source-history/base
truncation or infer identity from a checkpoint name. See 00 §2.2 for delegated
coalescing and the PO-approved browser-resume/manual-file-save fallback where
external autosave is unavailable. This closes that product choice, not the new
wire, sink implementation or its measured adoption.

The present gate requires completed golden/runtime and measured Desktop/iOS
budget evidence before the first S2 reader/writer. Those observations depend on
the new implementation, not just the old Native path. Do not resolve that dependency
by inventing measurements or quietly adopting a smaller format. Request this split:

1. **Reviewed five-purpose implementation contract.** Freeze all five shapes,
   nested copy/omit and inventory/classifier tables, exact adapter/control encoding,
   finite execution guards and the expected §9 outcomes. After explicit PO approval
   of this split, implement and execute the contract in the existing isolated
   validation/service path. No new PoC page; no ordinary-home or old-data activation.
2. **Measured adoption and activation.** Exact-byte goldens, hostile-input/recovery,
   complete team rounds and applicable Desktop/iPhone/storage evidence must pass
   before ratifying product budgets/profiles and activating the ordinary route.
   A failing case blocks the affected capability; it does not change the expected
   output. Any wire/schema amendment returns to reviewed contract control, and a
   new product policy, compatibility change or guarantee needs PO approval.

This moves executable proof to the stage where it can be obtained; it does not
remove any acceptance, reduce the five purposes, postpone all migration indefinitely,
claim G1 adoption or authorize public distribution. The final practical-team target
remains 05 `TEAM-FLOW-01` and the approved 62 groups. Test package bytes are not a
published compatibility promise. No existing Native or v1 file is rewritten.

### 11.1 Recommended technical selections

| Decision | Concrete recommendation | Current evidence / missing implementation |
|---|---|---|
| Package discriminator | Reserve `format: 'lociview-project-package'`, `wireVersion: '1'`; exact five-purpose union in §3, not the superseded 02 manifest. This is the wire identifier, not an app version bump. | New literal; unratified and not accepted by any current reader |
| Metadata | `adapter: 'automerge'`, `adapterFormatVersion: 'lociview-automerge-atomic-map-1'`, `automerge-root-change-v1` proof; preserve full-source/original-change bytes. | `src/projectMetadata/format.ts` and `source.ts`; no alternate physical encoding |
| Control bytes | Existing `LociCanonicalJsonV1`, exact UTF-8/no newline, duplicate-aware input parser, exact manifest checksum and derived paths from §3. | Current canonical/JSON primitives are reusable; all new shapes still need bounded validators/goldens |
| Container | Single-volume ZIP32, STORE for every entry, serial streaming, data descriptors, fixed ZIP epoch; reject ZIP64, compression, encryption, special/undeclared/out-of-order entries. | Native writer uses `zip64:false`/STORE; the new reader must explicitly check ZIP64 and the stricter new layout. Do not claim those checks already exist. |
| Exchange | Full Workspace metadata and exact base-relative original Contribution changes; separate original wire, derived target and receiver apply records from §8. | Existing full-source/journal tests are reusable, not implementation of delta/base completion |
| Output completion | Direct-file sink: successful close plus streamed read-back hash. Fallback: successful OPFS close plus streamed read-back hash is **generation completion**, followed by a durable local receipt/base handoff. | Native `app.ts` has both read-back paths; new receipt/base atomicity remains to implement |
| History-free | The one explicitly selected Scene review and whole-active-Project clean policy in §§5–6, complete typed re-key, no history/migration/exchange state; preserve unplaced/nonvisual ownership. | New builders are missing; no winner projection, JSON recursive copy or silent omission can substitute |

The adapter recommendation applies to the current new-Project source. It does NOT
claim 07's managed migration subtree is supported by `atomic-map-1`: its physical
reader fixes the 14 root record maps and treats optional root content as atomic
scalars, not independently concurrent nested managed units. Before migration,
review the exact control encoding and adapter/envelope compatibility separately.
Never pack all guards into one conflicting scalar or silently relax old profile
validation. A new physical profile or compatibility amendment needs explicit PO
approval and original-history proofs; it is not ratified by the package literal.

The proposed fallback must obey the accepted presentation rule in 00 §2.1: an
in-app artifact is only ready for download, not a user-file save. Use, for example,
`ダウンロードの準備ができました`, then
`ダウンロードを開始しました。保存先で完了を確認してください。`
after handing it to the browser. Neither event says the OS saved a file, a recipient
received it or another person accepted it. The generated base describes the exact
completed package, not delivery. Generation failure/cancellation records no completion.
An unknown crash window remains unknown; file existence alone is not a receipt.
Internal persistence or receipt completion must not mark Project edits as reflected
in an external file. File-save success is limited to the exact content/scope whose
external completion was confirmed, not newer edits or omitted Project data.

Keep package/job roots until the verified artifact and durable receipt/base handoff
complete. Never delete the retained base's proof/inventory merely because the
download link was used or its temporary ZIP was explicitly removed. On iPhone,
the consolidated acceptance must also save to Files, reselect that file, and verify
its hash/reopen plus cancelled/quota/interrupted receipt behavior on the exact build.

### 11.2 Execution guards are not product capacity

Do not choose an iPhone or product guarantee from the old limits. The available
code gives these reusable guard inputs, with their units retained exactly:

| Existing boundary | Enforced value | Not proven by that value |
|---|---|---|
| Validation source files | Combined 64 MiB; GLB JSON 4 MiB; 100,000 items; 8,000,000 accessor values; 16,777,216 image pixels | All-model/all-media support, new package size or iPhone capacity |
| Validation metadata | 8,000,000 bytes total; 1,000 changes; 1,000,000 bytes/change; 20,000 operations; depth 32; 100,000 nodes; 1,000,000 work; 65,536 string scalars | Product history capacity or throughput |
| Old ZIP guard | 20,000 entries; 1 GiB/entry; 2 GiB uncompressed total | New manifest/archive/backup/base overhead, ZIP64 rejection or iPhone guarantees |
| Existing storage acceptance target | 500 MiB unchanged body, zero Caption-only payload reads; at most 64 MiB app-managed simultaneous I/O buffers | Total browser/GPU memory, actual new-wire/device PASS |

Before any validation reader/writer under the proposed split, its reviewed execution
descriptor must set every archive/control/entry/ratio/count/depth/head/base/evidence/
working-space bound. Missing bounds reject execution; do not use `Infinity`, zip
header claims or library defaults. Keep current lower metadata/source guards and
the strict ZIP32 representable ceiling. New conservative stop limits must be labelled
development-only and have finite boundary tests; they are not silently promoted to
product limits. Numeric guarantees and broader admission still await measurements
and PO adoption. This section does not supply fake measurements or mark §10 complete.

### 11.3 Finite next delivery if the split is approved

Finish the closed contract tables and validation execution descriptor in this
companion, with one independent review before reader/writer code. Then implement
Workspace/full-history + Contribution/base completion on existing source/journal/
WorkspaceFS, including one five-purpose manifest/summary validator from the start.
Use the existing tests for original-byte retry, two-person two-rounds, no-op,
backup continuity and noncausal target heads; do not open another synthetic UI.
Backup/review/clean builders follow the same complete contract, not a later purpose
redesign. Migration uses the separately reviewed 07 mapping/source contract and
can follow the new-file team loop. No missing legacy branch is counted complete.

The genuinely missing tables to close first are: (a) every nested history-free
field's retain/omit/re-key/re-digest/unknown-refusal action, (b) protected inventory
covering strong, all-conflict, opaque, migration, retained-base and unfinished-job
roots, (c) exact summary algorithm/class dictionary and original-write attribution
for history/delta/snapshot, including edit-then-revert and unknown accounting, and
(d) every concrete execution limit from §11.2. `blobInventory.ts` verifies known
representation/media bodies only; candidate projection is not export/GC authority.
Expected golden outcomes must be set independently before producing implementation
bytes. Golden generation alone, or updating expected bytes to match a bug, is not
acceptance. No validator uses whatever table happens to be installed in a future
library version; pin the reviewed table and rerun its compatibility vectors.

Until the closed technical contract and applicable gate are satisfied or explicitly
amended, this proposal authorizes design, not a package reader/writer. Complete and
review the concrete remaining contract once under the delegated sequencing; do
not repeatedly ask the PO to delegate the same work. Implementation progress
elsewhere and permission to push do not themselves ratify a new wire or profile.

### 11.4 Save-point and output-completion protocol (design closure, 2026-09-13)

This subsection applies the approved 00 §2.1–2.2 product choices to the existing
five purposes. It is a concrete implementation-design proposal, not wire/profile
ratification, an implemented sink or a relaxation of 05 §7.5. Routine sequencing
and trigger/coalescing design are already delegated; do not ask for that same
delegation again. Complete §11.3's tables and review remain necessary before code.

#### User intents and package content

| User intent | Artifact / record | Required distinction |
|---|---|---|
| Save a named checkpoint | `backup`, exact committed whole Project plus protected payloads and local exchange-base evidence | Same Project, not `clean`. The optional name is a display/suggested-filename label, not identity, a new purpose or a metadata edit. Do not silently overwrite an existing manual file. |
| Update the automatic point | The same `backup` scope, one latest logical point for this Project | Never overwrite a manual checkpoint. Use a separate authorized sink and verified replacement protocol; otherwise use the approved browser-resume/manual-save fallback. |
| Send the Project to someone | `teamWorkspace` | A self-contained starting point without the sender's local exchange-base table. Generation establishes only the exact retained Workspace base, not delivery, acceptance or a manual checkpoint. |
| Send changes using a selected base | `contribution` | Exact original changes/new required bodies relative to that base; not a complete save point and never advances the base. |
| Browse the current Project | Local View mode | No file creation or new lineage is required merely to disable editing. A URL mode switch does not transfer data or exclude private Scenes. |
| Share only one Scene / start an independent Project | Existing `review` / `clean` purposes respectively | Contextual secondary actions with their existing scope/privacy/lineage preflight, not alternatives the user must decide between on every save. |

Normal Save and automatic checkpointing therefore do not create new Workspace
exchange bases or put them into the ProjectDoc. A backup retains already available
bases without advancing them. Repeated latest-point replacement must not cause an
ever-growing base table. Sending a Workspace remains a separate explicit intent.
An explicit label supplied for a filename is not silently copied to the manifest's
optional memo or shared Project title. Label/filename validation never proves purpose.

#### One frozen result, separate generation and file receipts

1. Finish or recover a pending internal transaction before capturing a point.
   An unapplied draft is not silently included or discarded: explain that it has
   not been applied and let the user finish/cancel it. Capture exact published
   Project identity, envelope, heads, protected inventory and local-base snapshot
   under the existing authority boundary. No renderer/materialized winner is an
   export source. Valid unresolved candidates remain in a causal backup.
2. Hold the corresponding metadata/body/base roots and create one fresh package
   job/manifest. Stream all declared bytes and verify lengths/hashes. Reuse verified
   unchanged-body inventory for planning, but do not pretend a complete external
   backup can omit required bodies merely because the browser still has them.
3. A successfully closed and read-back-verified OPFS artifact is `generated` only.
   It can support a Workspace generation/base receipt under §11.1, but not an
   external-file receipt. Bind the local receipt to the exact package/manifest,
   content scope and immutable artifact, not a filename or current UI selection.
4. A supported external sink may record file completion only after successful
   close and read-back verification of that exact output. Browser download handoff
   remains unconfirmed. In the manual fallback, offer explicit re-selection of
   the downloaded file for streamed content verification; neither a checkbox nor
   a download-start callback substitutes for that evidence. Do not request repeated
   downloads automatically. Unknown/cancelled/failed output stays distinguishable.
5. A file receipt covers only its frozen content. If another Project edit or an
   included local-base update happened during output, retain the newer unreflected
   state. Output completion does not move the active Scene, replace the Project,
   acknowledge newer edits or prove that another person received anything.

The same published heads alone do not identify a backup result: protected inventory
and local exchange records can change without a Project edit. No-change suppression
must compare the full captured input, excluding incidental package ID/timestamps.
The exact persistent job/receipt shape belongs to the closed implementation contract;
this subsection does not introduce an unversioned local schema.

#### One logical auto point, failure-safe physical replacement

Maintain at most one running automatic output and one coalesced pending indication
per Project. Once the running job finishes, recheck the latest captured state;
do not queue one whole file per edit. UI-only gestures may trigger a check but
cannot create history or require unchanged output. Never race manual output,
Project switching or recovery against an unverified state transition.

An external automatic sink is eligible only if its implementation can preserve
the previous usable point until the new output and its durable promotion receipt
are verified. Writing over a single existing handle and hoping later read-back
succeeds is insufficient. A bounded staged replacement may temporarily need both
old and new physical artifacts; it is still one logical latest point, not user
generation history. Space for that overlap must be admitted before output. After
successful promotion, only the proven superseded automatic artifact may be cleaned
up under the authorized sink policy; manual points and retained-base roots remain.
Failed cleanup reports occupied space and must not run an unbounded new output queue.

No currently unproved browser/file API is assumed to provide this protocol. Until
an eligible authorized external sink exists, latest browser resume data plus
explicit manual file saving is the supported fallback. Permission loss, missing
space or inability to verify a replacement retains recoverable work and the old
usable point. Do not weaken preservation or promise background/exit-time writes
to present autosave as available. Cadence/backoff remains a measured implementation
choice, not a new PO interval decision or a device performance guarantee.

#### Resume / restore and finite acceptance

Resume identifies the actual Project and source; an explicit file choice wins
over a newer automatic point. A manual/auto backup chosen for recovery uses 05 §7.4's
explicit same-Project restore, not an automatic causal merge or invisible rollback.
Preflight identifies the point and current work that would be replaced. Declining
keeps current drafts/Project intact. Successful file verification alone does not
restore, switch or delete anything. Missing browser resume data offers file-open
or applicable repair; it does not become a new empty Project or resume success.

Reuse existing source/journal/body tests and add only the missing artifact/sink
cases: named manual versus latest-auto independence; same heads with changed base
inventory; edits during output; zero-change skip and burst coalescing; failure at
staging/close/read-back/receipt/promotion; unknown crash completion; permission/
space loss retaining the old point; manual download re-selection; and explicit
restore cancellation. Record exact output bytes and which content the receipt
covers. Rendered/native file-dialog, physical-iPhone and offline acceptance remain
separate; current DOM/storage-port tests cannot supply them.

## 12. Concrete field, summary and execution tables (proposed, 2026-09-13)

This is the pre-code design for §11.3, not an adopted wire, implementation or
measured product limit. The current source reference is `f51f8af`. The complete
five-purpose contract still needs the review-to-edit decision in §12.6 and the
applicable §10–11 gate; do not present these tables alone as S2 permission.
No current Native/v1 file or `atomic-map-1` source is reinterpreted.

### 12.1 Pinned candidate identifiers and field actions

Candidate literals are `format: 'lociview-project-package'`, `wireVersion: '1'`,
summary algorithm `lociview-project-summary-1`, and review schema
`{kind:'lociview-project-scene-review',version:'1'}`. Metadata retains §11.1's exact
adapter/envelope and major-2 domain semantics. Review schema is a separate object,
not a ProjectDoc schema. These new literals reserve no published compatibility.
Control bytes, paths, checksum and original-change descriptors follow §§3–4.

For the tables below: **retain** copies the validated canonical value (including
optional absence); **re-key** uses one complete typed old-to-new ID map;
**rebuild** constructs only the stated new fields; **omit** excludes known source
fields with preflight disclosure. Every changed immutable payload gets a fresh ID
and its exact 02 immutable digest recomputed after all references are mapped.
No source ID, actor or timestamp is reused to create the fresh lineage/lifecycle.
Sorted ID sets are sorted again after re-keying; ordered memberships retain their
orderKey, and non-set array order is preserved. Equal classes remain equal and
distinct classes remain distinct, including frames, families, layouts and slots.

The input allowlist is recursive, not just a list of output fields. Unknown fields,
unknown nested keys/discriminators or unclassified references within the applicable
export scope block history-free output, even inside an object otherwise scheduled
for omission. A recognized migration subtree may be omitted only by its pinned
policy, not because its key happens to contain `migration`. Unrelated Scene-local
conflicts outside a review closure do not block it; unresolved inclusion/reachability
is not evidence that an item is outside. Causal output instead preserves unknown
minor content and its conservative inventory. Never use a generic JSON copy/filter.

| Source unit | Clean editable output | One-Scene review output |
|---|---|---|
| schema / identity / project | Rebuild schema, fresh Project/epoch/seed/root. Retain title and frame values, re-key frame ID/defaultSceneId. | Omit source identity/schema/history. Rebuild snapshot schema/ID; retain title/frame values, re-key frame; defaultSceneId is the sole selected Scene. |
| assetsById | Re-key id/assetFrameId; retain label; transform status as below; fresh lifecycle. | Rebuild visual/nonvisual owner from §5.1, never copy status/lifecycle/binding/revision. Visual label retained. |
| assetRevisionsById | Re-key id/assetId/representationIds and each anchorCompatibilityClasses id/targetVariantFamilyIds. Omit parentRevisionId and materialCompatibilityMaps. Transform provenance; re-digest. | Omit records. Derive only the compatible-class membership required by §5.1; see §12.6 before defining edit conversion. |
| assetBindingsById | Re-key id/assetId/assetRevisionId; retain assetToProject/method/residual; omit parentBindingId; re-digest. | Omit records; flatten the authoritative assetToProject into the appropriate visual/positioned-owner record. |
| representationsById | Re-key id/assetId/representationFrameId/variantFamilyId/derivedFrom; retain contentKind/purposes/role/formatProfile/blob/representationToAsset/logicalBoundsAsset. Transform catalog/class fields below; omit derivation; re-digest. | Include presentation closure only; re-key the same included identities/classes. Remove source from purposes; omit derivedFrom/derivation/payloadDigest. Retain the other §5.1 presentation fields, not source-only records or payloads. |
| mediaResourcesById | Re-key id; retain blob/mediaKind/label; re-digest. | Same field actions, limited to included Caption attachment closure. |
| captionsById | Re-key id; retain title/body/colorSrgb; transform anchor below; fresh lifecycle. | Same text/color/anchor actions for included Captions; omit lifecycle. |
| captionAttachmentsById | Re-key id/captionId/mediaResourceId; retain altText/orderKey; fresh lifecycle. | Same fields for included attachments; omit lifecycle. |
| captionTagsById | Re-key id; retain label/colorSrgb/orderKey; fresh lifecycle. | Same fields for reached tags; omit lifecycle. |
| captionTagMembershipsById | Re-key id/captionId/tagId; fresh lifecycle. | Same fields for included edges; omit lifecycle. |
| scenesById | All active Scenes: re-key id/defaultViewId; retain name/orderKey; fresh lifecycle. | Exactly selected Scene with those actions, no lifecycle; only the confirmed optional-entry omission in 05 §7.3 is allowed. |
| sceneAssetMembershipsById | Re-key id/sceneId/assetId; retain orderKey; fresh lifecycle. | Selected Scene's active edges, same actions without lifecycle. |
| sceneCaptionMembershipsById | Re-key id/sceneId/captionId; retain orderKey; fresh lifecycle. | Selected Scene's active edges, same actions without lifecycle; filters/windows do not remove entries. |
| viewsById | Re-key id/sceneId/projectFrameId; retain name/orderKey/camera/background; fresh lifecycle. | Selected Scene's active views with same actions, no lifecycle. |
| materialOverridesById | Re-key id/routing IDs; retain appearance/compositing; fresh lifecycle. | Same actions for the selected Scene's applicable intent, no lifecycle. Preserve Scene-over-Project precedence, not a renderer's materialized default. |

Clean includes active resources even when no Scene references them. Its immutable
set is their current editable strong closure, not every immutable record ever
written. Resolved deleted resources are omitted; unresolved lifecycle/inclusion
cannot be treated as resolved deletion. Review uses only 05 §7.3's closure.

| Nested type / exact fields | Closed action |
|---|---|
| Project frame | Re-key id; retain handedness/upAxis/unit.kind and applicable metersPerProjectUnit. Unknown units stay unknown. |
| Lifecycle state/eventId/reason | Clean rebuilds active, fresh evt ID, reason initial; review omits whole object. Source lifecycle conflicts block included state. |
| Asset ready status | Retain kind; re-key activeBindingId. Do not populate unresolved fields. |
| Asset unresolved status | Retain kind/reason/expectedLabel/pendingAssetToProject; omit expectedDigest as a nonincluded source-matching hint. Remain unresolved, never fabricate binding/geometry. |
| Transform / bounds | Retain translation/rotationXYZW/uniformScale; Representation transform also retains reflection. Retain AABB min/max. Never infer axes, units or transform. |
| BlobRef / formatProfile | Retain algorithm/digest/byteLength/mediaType and profile id/specificationSha256. Copy exact verified body bytes, not re-encoded models/images. Profile admission is a separate prerequisite. |
| Revision provenance | Retain origin and optional tool.id/tool.version/sourceMediaType; retain inputBlobDigests only for included resource blobs, sorted unique; required empty array remains present. |
| Representation derivation | Known kind/tool/parameterDigest/inputBlobDigests object is omitted in both history-free purposes. No parameter-descriptor policy exists to justify retaining its required arbitrary digest. Clean retains strong derivedFrom/editable source bytes; it does not promise the old derivation audit. |
| Representation classes | Re-key compositeGroupId/targetGsVariantFamilyIds/proxyForGsVariantFamilyId as applicable. Keep role-specific constraints and class/family/patch partition; no guessed compatibility. |
| Material catalog | Re-key layoutId and slots.logicalMaterialSlotId; retain optional displayName. Retain sourceLocator.kind plus the applicable materialIndex or slotIndex only with its Representation. |
| SourceMaterialSemantics | Retain coverage.kind and mask alphaCutoff, optics, lighting, doubleSided; do not invent omitted defaults. |
| ProjectAnchor | Retain kind/positionProject/normalProject; re-key projectFrameId. |
| AssetAnchor common | Retain kind/positionAsset/allowed normalAsset; re-key assetId/assetFrameId/authoredAnchorCompatibilityId. Preserve needsReview and absence; do not turn an anchor into a ProjectAnchor. |
| Manual hitEvidence | Retain method manual only, with no normal/confidence/source. Clean sets authoredAssetRevisionId to the rebuilt active revision only for an active compatible class; otherwise omit. Review always omits authored revision. |
| Nonmanual hitEvidence | Retain method/allowed confidence. Clean re-keys authoredAssetRevisionId and complete source together only when both are already in the editable closure and owner/method/content/role/surface validation passes; otherwise omit both. Review omits both. An absent hitEvidence remains absent, with no weak authored revision retained or invented manual method. |
| Permitted hitEvidence.source | Re-key representationId; retain surfaceRef.kind and its exact variant fields: mesh nodeIndex/primitiveIndex/triangleIndex/barycentric; point nodeIndex/primitiveIndex/pointIndex; splat sourceSplatIndex. Never import an old body only to preserve weak evidence. |
| Saved View camera/background | Retain position/target/up, projection.kind plus verticalFovRadians or verticalSpan; background.kind and solid colorSrgb. No invented color on transparent background. |
| Material routing | Retain scope.kind; re-key applicable sceneId and target.assetId/variantFamilyId/materialLayoutId/logicalMaterialSlotId. |
| Material appearance | Retain optional opacity/baseColorSrgb/lighting/doubleSided and chroma.keyColorSrgb/tolerance/softness. Preserve absence/inherit without renderer-dependent substitution. |
| Material compositing | Retain coverage.policy/applicable alphaCutoff and optics. Unsupported rendering is reported, not rewritten into another intent. |
| Technical/private state | Omit source history/actors/times, deleted values, recognized migration/report/source evidence, exchange bases, participant/device profiles, UI state, local handles/paths/object URLs. Original embedded blob metadata and current user text remain disclosed content, not promised anonymous. |

`Asset.pinScale` and `anchor.kind:'unplaced'` are not current known domain
capabilities: 07 §10.2 / 05 §9.4's amendments remain distinct. Do not silently omit
them to make a current-profile export succeed. The current profile refuses affected
history-free input; the later accepted field policy must retain pinScale on clean
and each applicable review owner, and preserve unplaced's optional owner without
invented coordinates/frame/class. These requirements remain practical-team work.

### 12.2 Protected inventory: portability is not garbage collection

Compute roots from the complete admitted source and all live candidates at the
frozen heads. The current `blobInventory.ts` only verifies named Representation/
Media bodies; it is not an export closure or GC oracle. Verify semantic BlobRefs
individually, but deduplicate physical entries by raw digest/length. An inconsistent
descriptor under one digest rejects; a MIME alias does not duplicate physical bytes.

| Root | Local protection | Portable causal content |
|---|---|---|
| Current strong | All active resources and their strong closure, including unshown Assets/Captions, every active revision Representation and editable derivedFrom source | Workspace/backup include; Contribution includes the exact required part not guaranteed by its verified selected base. |
| Every live conflict | Union of status/binding/lifecycle/attachment/other reference candidates and their closure; no winner projection | Same rule; valid semantic conflicts remain original history and protected bodies. |
| Opaque minor data | Conservatively retained verified inventory; never shrink by inspecting strings for apparent references | Preserve the complete trustworthy opaque inventory in same-lineage output. Inability to establish it blocks output rather than claiming an empty closure. |
| Recognized migration continuity | Active/conflicting managed plan/baseline/registered strong evidence under the exact adapter | Include required portable continuity. An unsupported physical migration profile is refused; this table does not adopt it. |
| Retained Workspace base | Original manifest/metadata evidence plus the guaranteed payload inventory for each available base | Backup includes table/evidence/guaranteed bodies. Workspace normally excludes table/evidence; body overlap with its own strong/opaque closure remains included. Contribution does not transport the table. |
| Explicit retention pin | The exact payload protected by an approved explicit choice | Backup includes; Workspace only when independently required or conservatively opaque. This adds no automatic retention-pin UI or policy. |
| Unfinished journal | Original source/changes/base/derived evidence and staged payloads through recovery | Not a portable finished snapshot. Recover or refuse output; never package an applied prefix as complete backup. |
| Active output/job/receipt handoff | Frozen inputs, artifact and evidence until completion/base handoff or safe cancellation | Do not recursively put previous ZIPs/jobs into another ZIP. They remain local protection roots only. |

Weak parent revision/binding links and merely historical immutable records do not
by themselves retain model bytes. Original metadata history still remains intact.
An acknowledged missing required body is repair state, not a cache eviction.
GC must consider the union across all Projects/jobs; this wire proposal authorizes
no physical collection or automatic deletion of retained bases/manual points.

Proposed `protected-inventory.json` is the closed object
`{schema:'lociview-protected-inventory-1', blobs:[{sha256,byteLength,reasons}]}`.
The array is sorted/unique by digest and includes exactly backup's physical blob
entries. `reasons` is a nonempty sorted/unique set from
`current | conflict | opaque | migration | exchangeBase | retentionPin`; multiple
roots share one entry. Evidence control files stay in §4.1's separate descriptors.
Recompute derivable reasons from the verified metadata/base evidence. Imported
opaque/explicit-retention declarations conservatively preserve their stated bytes;
they are not proof of semantic reference or permission to reclaim anything else.
False missing/current/conflict/migration/base claims reject; local job roots alone
cannot add entries to a completed backup. Restore must disclose retained-only data.

### 12.3 Exact automatic summary classification

For `lociview-project-summary-1`, the closed object has exactly `algorithm`, `scope`,
`entityClasses`, `fieldClasses`, `blobEntryCount`, `blobBytes`. Positive class counts
are sorted lexicographically by class and zero-count entries are omitted. Counts
are safe integers. Blob counts/bytes equal the actual manifest `blobs`, not evidence
files or all blobs mentioned by history. Scope is `entireHistory` for Workspace/
backup, `baseDelta` for Contribution, `snapshot` for review/clean.

| Entity class | Atomic field classes (prefix with the entity class and a dot) |
|---|---|
| project | schema, identity, title, frame, defaultSceneId |
| assetsById | id, lifecycle, label, assetFrameId, status |
| captionsById | id, lifecycle, title, body, colorSrgb, anchor |
| captionAttachmentsById | id, lifecycle, captionId, mediaResourceId, altText, orderKey |
| captionTagsById | id, lifecycle, label, colorSrgb, orderKey |
| captionTagMembershipsById | id, lifecycle, captionId, tagId |
| scenesById | id, lifecycle, name, orderKey, defaultViewId |
| sceneAssetMembershipsById | id, lifecycle, sceneId, assetId, orderKey |
| sceneCaptionMembershipsById | id, lifecycle, sceneId, captionId, orderKey |
| viewsById | id, lifecycle, sceneId, name, orderKey, projectFrameId, camera, background |
| materialOverridesById | id, lifecycle, routing, appearance, compositing |
| assetRevisionsById / assetBindingsById / representationsById / mediaResourcesById | record (one whole immutable record, not an invented history of nested fields) |
| opaque | field (generic unknown unit; never emit its raw path/key/ID/value) |

In causal scopes, inspect the selected original change set from its exact source
DAG: all target-reachable changes, or D = T − B. Count the distinct addressed
entity for each class and distinct addressed entity for each field class, regardless
of whether that value survives, is absent, equals an old value or conflicts. Root
schema/identity and project fields address one Project entity. Only bootstrap
collection/container construction is structural and excluded. Resolve every
operation's address from verified object creation/ancestry, not from a current
library winner or actor/time sort. Unsupported physical operations reject input.

Scan all original scalar operations, including multiple operations at one address
in a change. `inspectPhysical()` currently collapses same-change writes and omits
schema from its normalized AtomicHistory; that projection alone is insufficient
for this classifier. Original operation inspection must preserve unknown-value
accounting even if a later same-change write overwrites it. Known mutable fields
map to the listed class; immutable records map to record, not arbitrary JSON paths.

An unknown root scalar addresses one opaque unit per original root key. An unknown
Project/record field or nested value addresses its containing Project/record once
in opaque.field as well as any known class applicable to that write. Opaque counts
therefore may overlap known counts; totals must not sum the classes as disjoint
entities. Absence at an unknown address still counts. The output contains only
dictionary labels/counts; local address sets never become shared user content.

For snapshot scope, count only constructed output entities/present fields, with
the review's sole Scene classified as scenesById, flattened Assets as assetsById
record, and immutable snapshot records as record. Add `assetsById.record` for
this snapshot-only flattening; snapshot header schema/snapshotId are structural,
not source identity. Clean counts its constructed semantic fields, not old history
or its generated bootstrap lifecycle operations. Opaque is forbidden in snapshots.
Receivers independently recompute summaries after validating the exact purpose,
source/base/snapshot; any discrepancy rejects before publication.

Minimum independent expectations: edit-then-revert of one Caption body counts one
Caption and one captionsById.body; two captions edited repeatedly count two, not
the number of writes; unknown value overwritten within one change still counts
opaque; two edits of one status count one atomic status, not nested key counts;
empty D has empty class arrays and zero blob delta; snapshot excludes all source
history counts; backup's extra evidence files do not inflate blob counts.

### 12.4 Finite validation execution descriptor

Candidate descriptor ID: `lociview-project-package-validation-1`. These are
explicit development stop limits, NOT an iPhone promise, product capacity or
relaxation of a lower existing source-profile guard. They must be checked both
before allocation from declarations and against observed bytes/work. Reject the
whole operation on excess; never truncate histories, lists, bodies or candidates.
The container allowance admits the existing 500 MiB streaming acceptance target
without itself proving it. It does not admit a 500 MiB model to the existing
64 MiB file-inspection lane or extend any renderer/profile.

| Counter / unit | Proposed maximum / exact rule |
|---|---|
| Entire archive | 805,306,368 bytes (768 MiB), additionally all ZIP32 fields/offsets must be representable without sentinels |
| Declared/observed nonmanifest payload | 671,088,640 bytes (640 MiB), including metadata, changes, snapshot and backup evidence |
| Physical blob bytes | 536,870,912 bytes (512 MiB), both per entry and aggregate; at most 1,024 unique digests |
| ZIP entry count | 4,096 including both manifest entries and every evidence file |
| Container metadata inspection | 4,194,304 bytes total for local headers/descriptors/central directory/end records; payload reads use separate budgets |
| Control JSON | 1,048,576 bytes per manifest/inventory/base table/journal-receipt control; 4,194,304 bytes aggregate per package controls, including retained base manifests |
| Review snapshot | 8,000,000 bytes, separate from the smaller control-JSON bound |
| Each full metadata source or original-change set | 8,000,000 bytes; 1,000 changes; 1,000,000 bytes/change; 20,000 physical operations. Receiver union also fits the current metadata guard. |
| Each head/dependency set | 1,000 hashes; 100,000 dependency references in the complete package proof |
| Canonical semantic/control values | depth 32; 100,000 nodes per inspected value tree; 65,536 Unicode scalars per string; stricter domain label/text limits also apply |
| History inspection | 1,000,000 charged steps per source; shared package-plus-base budget 100,000 operations, 1,000,000 decoded nodes and 5,000,000 charged steps |
| Closure work | 100,000 records, 200,000 edges, 1,000,000 charged visits; shared across roots, not reset for each conflict candidate |
| Local exchange bases in a backup | 16 records; 32 unique manifest/metadata evidence entries; 16,777,216 total raw evidence bytes. No automatic expiry to fit the bound. |
| Paths | Exact fixed/derived names only, each at most 128 UTF-8 bytes; ASCII spelling, no directories, slash aliases, case/NFC alternatives or comments |
| ZIP encoding | Single volume, STORE, fixed DOS epoch 1980-01-01 00:00:00; central/local names and flags agree; equal compressed/uncompressed size (including zero). Reject ZIP64/encryption/special files/archive and entry comments, undeclared prefixes/suffixes and arbitrary extra fields. |
| Reader/writer buffers | Input/application chunks at most 16,777,216 bytes; shared application-owned I/O-buffer ceiling 67,108,864 bytes. Charge header buffers and clones too; backpressure before a new allocation. |
| Stream calls | At most 100,000 reads/chunks per stream and 1,000,000 across one package job; count zero-length chunks too |
| Active work | One package operation per origin; one coalesced automatic pending indication per Project. At most 16 unfinished package-job records per Project, then recovery rather than auto-deletion/new work. |
| Additional staging space | At most 2,147,483,648 bytes per sink, with a separate 16,777,216-byte safety reserve requested where free-space inspection exists; use the exact staged-space formula below, not archive size alone |

Header CRC-32, 32-bit sizes and offsets must match measured content. The writer
uses the following exact ZIP32 form for every entry: local signature 0x04034b50,
version-needed 20, flags 0x0808 (UTF-8 plus data descriptor), method 0, DOS time 0,
DOS date 33, zero local CRC/sizes, exact filename length and zero extra length.
The payload is followed by the 16-byte signed descriptor 0x08074b50, CRC-32,
compressed size and equal uncompressed size. Central records use 0x02014b50,
version-made-by 20 (DOS), version-needed 20, the same flags/method/date/name, measured
CRC/sizes, disk/internal/external attributes 0, no extra/comment, and the exact
local offset. Central order equals local order. EOCD 0x06054b50 has zero disk
fields/comment, matching entry counts and exact central offset/length; it is last.
All numeric ZIP fields are little-endian. Do not accept alternate descriptor forms,
extra fields, prefix/suffix bytes or library-default time/attributes. The golden
layout checks these fields independently of the selected ZIP library.
Hash/checksum agreement does not authenticate
the author. A detected nested ZIP/container inside an entry is rejected unless the
exact already-approved model/media profile explicitly defines that embedded shape;
an opaque blob declaration alone is not a nested-archive permission.

Count additional workspace demand as the sum of owned input spool, new CAS bodies,
retained original source/wire/derived/receiver parts, new base evidence, output or
replacement artifacts, and journal/receipt overhead. Avoid double-counting an
already verified shared digest, but do not remove a required physical copy from the
formula merely because it has equal bytes. External replacement separately reserves
the new artifact/copy while the previous usable point remains. If the chosen sink
cannot describe its maximum additional copies, it is not eligible for automatic
replacement; use §11.4's supported fallback. Quota estimates are advisory, so every
write/close/verify/receipt failure must still preserve old authoritative state.

The current limited validation host also applies 64 MiB to cumulative bodies:
`validationHost.ts` checks all existing Representation/Media digest sizes plus
the selected file before each model/image addition. This proposal does not relax
that admission guard. Its 768 MiB archive / 512 MiB physical-blob descriptor is a
separate proposed package-processing limit; a 500 MiB synthetic stream fixture
does not establish admission of a real model or a larger validation Project.
Existing GLB JSON 4 MiB, 100,000 model items, 8,000,000 accessor values and
16,777,216 image pixels remain. Source/union metadata guards cannot be increased
just because the surrounding ZIP allowance is larger. Stored streams currently
allow their own read accounting; the package's shared counters must be enforced
separately, not assumed from `blobInventory` or `storedBlobStream`.

Current `A.load` allocates before the later physical/node/work inspection. Encoded
byte limits plus post-decode counters are therefore NOT proof of bounded malicious
decoder memory. The implementation/adoption evidence must account for that stage
and demonstrate safe failure/isolation; never label the I/O-buffer ceiling as total
browser/Wasm/GPU memory. This descriptor is an execution contract to prove, not
evidence that enforcement already exists. Boundary cases must test exactly N and
N+1, declaration/observation disagreement, zero-length/read storms and aggregate
work across all retained bases. Keep the 500 MiB/zero-unchanged-body-read acceptance
target and physical-iPhone measurements open until actually executed in scope.

### 12.5 Expected vector inputs before implementation bytes

Use synthetic IDs/records and fixed test randomness, never private source metadata.
The production allocator remains CSPRNG. Exact adapter change bytes, manifest
checksums and whole-archive goldens are generated only after the closed contract
is approved, then independently checked against these expectations. Placeholders
are not golden bytes, and updating a golden to match a failing implementation is
not acceptance.

- Five legal purpose variants contain only §3's branch fields and exact derived
  entries. One illegal branch field or undeclared ZIP entry rejects before writes.
- For the existing sibling-target vector in §9.1, wire D and receiver M remain
  separately derived original sets. Backup/reopen retains the declared Workspace
  base even after local edits; empty receive adds no metadata or duplicate receipt.
- History-free input with two family/class pairs, source-only resources, unshown
  active Captions/tags, a nonvisual owner, optional absent color/view, and nested
  provenance sentinels must follow every table row. Unknown nested values block,
  not disappear. Review-to-edit has the unresolved expected behavior in §12.6;
  do not supply an implementation-selected expected result.
- Summary checks include same-change overwritten unknown content, absent writes,
  edit/revert, two records with many edits, immutable atomic writes, empty delta,
  snapshot-only counting and backup evidence versus blob totals.
- Inventory checks distinguish inactive historical records from retained-base
  protection, all conflicting endpoints, opaque/retention declarations and active
  output jobs. No recursive job/archive inclusion or same-digest duplicate bytes.
- Every §12.4 guard is checked at its own boundary and under combined pressure;
  source/derived/receiver histories and both old/new automatic points never share
  a fictitious single-buffer/single-file capacity credit. §9's original-byte,
  interruption, hostile-input, privacy, two-round and actual-device vectors remain.

### 12.6 Actual remaining review-to-edit compatibility decision

The current proposal cannot reconstruct an editable visual Asset faithfully from
its flattened review form. 01 §3.1 and `projectModelGraph.ts` require a complete
nonoverlapping partition of all visual families into anchor-compatibility classes.
02 §9.3 / §5.1 above deliberately retain only compatible class IDs, not the
class-to-family mapping. With two families and two classes, swapping their pairing
produces the same current review data. 05 §7.3 nevertheless requires explicit
editing to create a fresh clean Project. The phrase "ordinary history-free
reconstruction" does not supply the missing relation; order/name/geometry inference
or one invented all-family class would violate the accepted rules.

Recommended amendment for PO decision, NOT yet applied to the schema:

1. Add snapshot-local `anchorClassPartition` to visual review Assets, entries
   `{id,targetVariantFamilyIds}` covering every included visual family exactly
   once, not just classes used by included Captions. IDs are re-keyed, targets
   name only included families; source identity/history and omitted body bytes
   remain excluded. View retains the existing compatible-ID membership for its
   export-time status, including classes whose source families were not included.
2. On explicit edit-copy, create fresh classes from that recorded included-family
   partition and preserve class/family equality with one typed mapping. Restricting
   a source class to its included families creates a new class, not an assertion
   of shared lineage/surface with the source. Pins whose old class has no included
   target family retain owner/position and their separate class ID but become
   needsReview in the editable copy; explain this count/effect before confirmation.
   Do not guess a replacement model/family or move the pin. Existing needsReview
   remains needsReview. Nonvisual owners retain §5.1's unresolved/list-only mapping.
3. Keep ordinary local View mode and Workspace/Contribution unchanged. The amendment
   affects only the explicit conversion of a separately cut-out review file into
   an independent editable Project; it is not an extra restriction on participants.

This changes the review's topology-omission policy, closed snapshot fields and the
stated edit-copy effect. It needs explicit contract approval, not an implementation
shortcut under sequencing delegation. The smaller alternative—mark every review
pin needsReview on edit—unnecessarily degrades even fully represented models and
is not recommended. Requiring a different file instead would remove the accepted
direct edit-copy capability. No new schema or fallback has been implemented.

Read-only analysis independently confirmed the missing partition. Finish the
decision and resulting exact snapshot/reconstruction/golden contract before
claiming §11.3's complete five-purpose gate closed. Native/v1/LociMyu migration's
different physical-profile decision remains in 07 §10.2, not hidden inside this
review change. Neither issue invalidates the approved full-source service already
implemented; package reader/writer authority still follows 05 §7.5.

Design review: independent read-only review found one incorrect description of
the current validation host's cumulative 64 MiB guard; §12.4 now states the actual
code boundary. No other mandatory issue was reported in the field/summary/root/
execution tables. This is design review, not approval of the §12.6 amendment,
completion of reconstruction/golden bytes, or executable package acceptance.
