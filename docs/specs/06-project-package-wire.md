# ProjectScene package-wire companion — design proposal

> Status: `PROPOSED WIRE / APPROVED ISOLATED IMPLEMENTATION (§11) / NO ORDINARY ADOPTION`
> Drafted: 2026-09-08, under specification 05 §7.5's design authorization.
> Bounded Workspace/Contribution file connections and backup source/ZIP inspection
> exist where specifically described; their executed scope is recorded in todo.
> This document does not generally adopt a package version, adapter, byte budget or writer.
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
| visual Asset | `kind: 'visual'`, `id`, `label`, `assetFrameId`, `assetToProject`, sorted unique `compatibleAnchorClassIds`, sorted unique `representationIds`, `anchorClassPartition` as below |
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

Under the PO-approved §12.6 behavior, `anchorClassPartition` is a required nonempty
array on visual Assets only. Its closed entries are `{id,targetVariantFamilyIds}`:
`cmp` IDs strictly sorted/unique; target `fam` IDs nonempty, strictly sorted/unique.
The partition covers every included visual family exactly once, belongs to that
Asset, and preserves the domain's visualPatch singleton rule. Interaction proxies
and splat-exclusion families are not visual partition members. Build each entry
from the source active class intersected with included visual families; omit an
empty intersection. A visual Asset without any visual family rejects.

For this new snapshot only, `compatibleAnchorClassIds` is the mapped sorted union
of (a) active source classes referenced by included Captions and (b) partition
entry IDs. Thus unreferenced included families still have an explicit class, while
every Caption's export-time compatibility comparison remains unchanged. Every
partition ID must be in that Asset's compatible list; inactive Caption classes
must not enter either list through guessing. This amends the older 02 §9.3
topology-omission/intersection-only rule for this separate review schema, not an
existing Native/v1 reader. Both nonvisual branches forbid the partition field.

A standalone reader has no source active-revision history. It verifies
`P ⊆ C ⊆ P ∪ R`, where P is this Asset's partition IDs, C its compatible IDs and
R the class IDs used by included Captions owned by it, in addition to the exact
family/owner/partition checks above. C outside P retains an export-time compatible
declaration for an omitted family, not permission to invent that family on edit.
Do not recompute, guess or remove that declaration from missing source history.

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
remains editable. No Scene-model edge is added. Visual Assets use the exact
history-free reconstruction table in §12.6. This is a candidate implementation
contract, not an implemented builder or measured wire adoption.

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

### 8.3 Isolated full-Workspace journal connection (2026-09-13)

Under §11's implementation/adoption split, pin the first executable package
journal to the full Workspace branch only. This is not Contribution, first
Project import, ordinary-route activation or wire adoption. Legacy 02 journals
keep their exact keys and `jcs-v1` seal; no existing receipt is reinterpreted.

The new `PreparedJournal.remote` is the closed object
`{version:'lociview-package-remote-1',source,expectedFinalHeads}`. `source` is
exactly §8.1's `fullMetadata` branch: `kind,packageId,manifest,checksum,metadata,
metadataEnvelope,remoteHeads`. Each evidence descriptor is exactly
`{sha256,byteLength}`. Manifest/metadata sizes are positive and bounded by both
the current package guards and applicable metadata limits; checksum is exactly
64 bytes. Original controls must pass the existing pure manifest reader, have
purpose `teamWorkspace`, and agree with the transaction identity/envelope,
package ID, metadata descriptor and sender heads. Backup/clean/review/delta are
not admitted through this branch. Actual archive/body/profile admission remains
the receiving service's obligation, not a claim made by the journal.

The canonical `jcs-v2` preimage is exactly the existing §8.2 object, with
`metadataBatch:{kind,baseHeads,changes,version,source,expectedFinalHeads}`. The
new version literal is inside that preimage. There are no paths supplied by the
caller: the three originals occupy the fixed files in §8.1. Stage verifies the
owned original controls and full metadata before its first write, writes/reads
them unchanged, and writes `blobsVerified` last. Every cold validation reopens
all three originals, verifies their descriptors/control correspondence and source
root/frontier, then rederives the exact missing originals and union heads.
After prepared acknowledgment, missing originals remain repair state; retry
must not fill them from a retained input buffer or ZIP.

This version and the distinct §8.6 Contribution version admit a multi-body remote
`stagedBlobs` delta under the same exact rules. Its finite
closed BlobRefs sort by canonical BlobRef JSON bytes, are unique, and cannot
associate one digest with different lengths. It contains only new/explicitly
restaged refs, never the full already-verified inventory. The existing local
one-body and legacy remote no-body receipt shapes remain unchanged. An empty
delta is omitted on disk but seals as `[]`. Zero missing changes still creates
no metadata journal. Full required-content/fact checks precede prepared and
publication; adding a descriptor alone does not prove a body durable.

Use a narrow `projectMetadata/packageRemote.ts` import of the pure
`projectPackage/manifest` reader and contract constants/types. It must not import
archive/CAS/service/host/UI code. This avoids a host-supplied recovery callback;
ordinary entries remain isolated. Readiness/publication still use the existing
Session and journal; durable receive jobs, imported-base handoff and the actual
file-accept action must be connected before this is a completed Workspace flow.

Reuse existing persistence/package tests for original manifest/checksum/metadata
roundtrip, distinct v1/v2 seal preimages, wrong purpose/identity/heads/descriptors,
incomplete M, multiple sorted body refs, cold partial-apply/publication, loss of
each acknowledged original, retry/no-op and unchanged legacy receipts. These are
Node/port checks, not browser, physical iOS, offline or adoption evidence.

### 8.4 Received body admission in the limited GLB/PNG lane (2026-09-13)

The receiving service must distinguish exact bytes/ZIP integrity from executable
profile admission. Received immutable Representation/MediaResource IDs and all
original changes stay unchanged: do not call a local authoring preparer that
allocates replacement IDs. The content executor may inspect an owned Blob range
and its original record without CAS/Project writes. Check declared size before
allocating a body buffer and verify its digest. Reuse the same GLB declaration,
role/content-kind, transform, purposes, derivation, material-catalog and actual
bounds checks as saved-body reads, including when a body has already been
decoded. PNG still requires actual image decode; neither filename nor Blob.type
is authority. This does not expand the development profile or claim browser
decoder acceptance from an injected Node decoder.

Before reading any introduced body, a finite receiver plan must account for the
deduplicated immutable model/media bytes in the final original history under the
existing host's cumulative `maxFileBytes` limit. This is stricter than ZIP guards.
References already present in the receiver's history use verify-only durable
evidence, never a fresh content result that hides lost acknowledged evidence.
Only introduced records may collect freshly inspected facts. Reuse the existing
provider to reject invalid/unverified closure; semantic conflicts remain intact.
After preflight, the receiver stages exact new body streams and facts before its
prepared journal. Acknowledged bodies/facts may only be verified on retry, not
refilled. Cold unprepared-input retention is the receive job's responsibility;
cold prepared recovery uses only saved evidence. The bounded admission port
alone is not file receipt, imported-base completion or UI activation.

Reuse real-format tests for received GLB/PNG records retaining identity, incorrect
profile/role/transform/material/bounds/MIME/digest refusal, cumulative refusal
before body reads, preservation of old verification receipts and retry failure
after acknowledged body/fact loss. Keep job/service/adoption work open until its
separate connection is executed.

### 8.5 Isolated Contribution source and archive (2026-09-13)

Under §11, implement §4's original delta and file-integrity boundary before the
dedicated durable Contribution job. This does not extend the existing fullMetadata
journal, activate ordinary import, advance a base or confirm an external save.

- Freeze one exact `base` selection from the validated `WorkspaceBaseStore`, with
  owned original manifest/metadata bytes and §8.1's proof projection. Completion
  observations/labels are not wire proof. Recheck every guaranteed base payload's
  durable CAS presence/size/suspect metadata without streaming its body. A missing,
  suspect or unverified guarantee makes the selected base unavailable, not smaller.
- Both original sources use the current finite package/metadata budgets and the
  same identity/epoch/root. Derive `D = reachable(target) - reachable(base)` by
  native change hash, preserving byte equality for shared changes. Order D by
  incrementally selecting the smallest ready native hash, exactly as the existing
  manifest reader does. Do not reuse receiver M's ready-batch order as wire order.
- Inspect all target original scalars under the existing bounded classifier, but
  count only scalars whose change hash belongs to D for `scope:baseDelta`. Existing
  unsupported-history/opaque-inventory refusal remains; excluding base counts
  must not bypass structural source validation or its work/node budgets.
- Compute all-live-candidate target strong closure and subtract only matching
  digest/length entries in the verified base inventory. Read/hash only remaining
  bodies. An empty D does not imply an empty payload set. Freeze the Session token
  and publication before/after capture; stale/pending/aborted input cannot complete.
- Reuse exact STORE ZIP/control/CRC/SHA limits, entry ordering and bounded sink
  completion. Contribution carries original `changes/<ordinal>.amchange`, not
  `metadata.am`. No base receipt or durable output completion follows this primitive.
- Input verifies the same explicit base, all wire descriptors and original bytes,
  then applies base+D in a detached source. Traverse native dependencies from
  declared target heads and reopen only reachable originals. This avoids the pinned
  adapter's full-history `getAllChanges(view)` behavior. Require exact target heads
  and exact D set/bytes/incremental order, not the temporary union's heads.
- Derived target bytes have their own digest/length and adapter contract literal
  `lociview-automerge-3.4.1-reachable-originals-1`; they are local reconstruction
  evidence, never original package metadata. A future journal must retain wire,
  frozen base and derived evidence separately under §8.1 before acknowledgment.
- Input recomputes baseDelta summary and target-minus-guaranteed payload closure.
  Source/control/body integrity is not receiver readiness or profile admission.
  `M = T - R`, original retention/recovery and explicit no-base-advance completion
  remain the next Session/job connection, not simulated via Workspace receipts.

Reuse existing package/file fixtures: non-ancestor target, newly-ready lexical
order, exact raw originals, empty D, missing/extra/corrupt/foreign input, lost base
guarantees, changed token/publication, cancellation/sink failure and Caption-only
zero old-model reads. No new PoC, runtime dependency or assertion relaxation.

### 8.6 Isolated Contribution receive and frozen recovery (2026-09-13)

Implementation contract under §11, using §8.1/8.2/8.5 unchanged wire semantics.
The distinct local proof has `version:'lociview-package-contribution-1'` and the
closed `contributionDelta` source in §8.1. Its exact reconstruction adapter is
`lociview-automerge-3.4.1-reachable-originals-1`. Keep the existing fullMetadata and
legacy proof shapes, original locations and seals unchanged. The new proof uses
the existing §8.2 jcs-v2 domain with all its base/wire/derived descriptors included.
It cannot be used for initial Workspace import.

Capture owned controls, frozen base manifest/metadata, all original D and the first
derived target before writes. Journal `wire-changes/` holds D; `changes/` holds M.
Base bytes use fixed `base-evidence/<sha256>` paths within the same journal; derived
bytes use `derived-target-metadata.am`, never `source-metadata.am`. A separately
retained reconstruction descriptor must match the saved derived bytes and their
exact reachable originals. Recovery may recompute proofs, not replace those bytes.
Pure structural capture remains synchronous; complete history/summary/closure
verification precedes durable preparation and is repeated on recovery. Prove every
base original belongs byte-identically to receiver R before computing M=T−R.

The local sibling job uses `v2/packages/contribution-receive/<jobId>/` with fixed
`input.zip`, `input.json`, `prepared.json`, `start.json`, optional `abandoned.json`,
`base-manifest.json`, `base-metadata.am`, `derived-target-metadata.am`, and
digest-addressed `steps/<sha256>.json`. Original D is retained in the immutable
input archive and separately in the metadata journal when M is nonempty.
Prepared is closed `{schema:'lociview-contribution-receive-1',packageId,manifest,
base,wireChanges,reconstruction,roots:{blobs,evidence}}`; base and reconstruction
are exactly the §8.1 proof projections. Input is closed
`{schema:'lociview-contribution-input-1',jobId,prepared:EvidenceRef,archive:EvidenceRef}`.
Start is closed `{schema:'lociview-package-job-start-1',operation:'receiveContribution',
jobId,prepared:EvidenceRef,receiver:{identity,metadataEnvelope,heads}}`.

Before first writes, use a validated available common base and verify its durable
guaranteed inventory without reading unchanged bodies. Preflight same lineage,
receiver, final closure and existing GLB/PNG admission. Retain/read back controls,
frozen originals and streamed input before Start. Cold recovery validates these
frozen bytes, not current base selection or a new serialization. Exact pre-start
reselection may replace the unacknowledged spool only; its frozen base/derived
evidence must remain exact. Explicit abandonment requires absence of start,
journal and steps, using `{schema:'lociview-contribution-input-abandoned-1',jobId,
stage:'beforeStart'}`. All fragments remain; no delete or inferred replacement.

A write-once external job index at `v2/packages/contribution-index/<jobId>.json`
contains `{schema:'lociview-contribution-job-index-1',jobId,prepared:EvidenceRef}`.
Write/read back it before Start, after the full input evidence. Discovery unions
job directories, this index and contributionDelta journals. An index/journal with
missing job bytes is repair, not empty/completed state. This is required even for
M=0, which has neither a metadata journal nor a base observation. Enumeration and
all retained controls/spools/journals/CAS overlap use existing finite budgets.
Index-before-Start interruption is a valid unstarted recovery state, not a prepared
journal. A started job requires the original index too; never recreate it after
loss. An explicit pre-start abandonment retains and verifies any existing index.
Start, journal or step presence also requires a matching original index; its
prepared reference must equal the same job's prepared/Start. Index-before-Start
recovery uses the exact retained input, never later Project state as source.

Use the existing origin operation lock and dedicated Session Project lease.
M nonempty shares remotePackageMerge, exact prepared recovery and one publication.
M=0 verifies durable inventory and records only a job completion: no metadata
journal/change/publication and no blob-repair shortcut. Contribution never writes
a base observation. The sole terminal completion is `contributionPublished`
with receiver/journal/publication evidence, or `contributionAlreadyPresent` with
receiver/publication evidence. Both use the existing closed Step envelope, null
previous and at most one step. Stale pre-journal cancellation instead records
`{kind:'cancelled',stage:'beforeContributionJournal'}`; no journal or completion may
exist. Observed receiver heads remain frozen during later replay/local edits.
The initial M=0 completion compares Start.receiver, the current durable receiver
and the referenced publication under that same lease. A stale Start cannot bind
later heads; only replay of an existing observation may preserve its earlier heads.

Package journal validation imports only the pure original/base/D/target/summary
helpers in `contributionEvidence.ts`, not archive/CAS/Session/job code. The existing
source/ZIP classes reuse those helpers; original source limits remain unchanged.

Route by inspected purpose inside the same file service; no new format picker or
role. Empty Projects cannot start from Contribution. All input, mode, output,
catalog, draft/IME and recovery guards cover both job kinds. Reuse existing tests
for D≠M, two rounds/local conflicts, M0, cold prefix interruption, completion retry,
lost source/base/derived/M/index/job data and mutual guards. Node/recorded DOM is
not rendered picker, physical iPhone, offline or normal-home acceptance.

### 8.7 Isolated durable Contribution output (2026-09-13)

Implementation detail of §§8.5/11/12.7, not another wire purpose or save sink.
Retain original Workspace output records/receipts unchanged. Use a sibling local
job at `v2/packages/contribution-output/<jobId>/` with fixed `metadata.am`,
`manifest.json`, `base-manifest.json`, `base-metadata.am`, `inventory.json`,
`bases.json`, `capture.json`, `prepared.json`, `start.json`, `abandoned.json`,
`steps/<sha256>.json` and `artifacts/<sinkId>.zip`. All paths derive from checked
technical IDs, not imported filenames. Existing finite control/source/archive,
entry and total retained-package space budgets apply, including failed artifacts.

Use §12.7's exact FrozenCapture/PreparedOutput/JobStart/step shapes. Capture purpose
is `contribution`, scope is wholeProject, and required `base` is §8.1's complete
proof binding the explicitly selected available Workspace and the two retained base
originals. `sourceMetadata` binds the first frozen full source, not a file placed
inside the Contribution ZIP. Payloads are precisely D's original amchange entries
in incremental lexical-ready order followed by the new strong blobs. Each change
derives an `Entry` with fixed `changes/<eight-digit ordinal>.amchange` path,
`sha256:bytesSha256` and the original `byteLength`; do not put a `ChangeEntry`
object into `PreparedOutput.payloads`. Protected
inventory and the full available-base table snapshot remain local. Prepared roots
include frozen source, manifest, capture, inventory, table, selected base originals,
every snapshot base evidence and protected blob digest/length. No live source/base
lookup may replace these inputs after Start.

Before first persistence, revalidate Session token/publication, available base,
source structure and exact summary/closure under the Project lease and the existing
origin file-operation slot. Retain/read back originals and controls, then write and
read back an outside-job index at `v2/packages/contribution-output-index/<jobId>.json`
with closed `{schema:'lociview-contribution-output-index-1',jobId,prepared:EvidenceRef}`;
Start is last. Union directory/index discovery rejects a started job without a
matching index, or an indexed job whose bound prepared data is absent/mismatched.
No index/source/artifact is recreated to conceal acknowledged loss. A crash between
index and Start is unstarted: no generation/resume; explicitly abandon it using
`{schema:'lociview-contribution-output-abandoned-1',jobId,stage:'beforeStart'}` and
retain its fragments. Steps without Start are repair, not unstarted.

Cold generation derives the same original D from frozen source/base bytes using
the pinned adapter and compares the complete manifest to the retained original.
It streams only payloads not guaranteed by that base. Recheck frozen observations
are still present in the current table and the full protected inventory is intact;
later observations/edits may exist but do not alter this job. Verify all required
base/body evidence; missing acknowledged data is repair, not a smaller output.
Retry incomplete artifacts from byte zero into a fresh sink ID under the same
package/job ID. Never splice a prefix. Await both writer and generator termination
on error/abort before releasing the operation slot. Existing original D/source
validation, CRC/SHA and full artifact read-back precede `artifactVerified`.

The allowed closed step chain is `artifactVerified` then optional
`externalFileVerified(profile:'reselectedFileV1')`, or `cancelled(stage:'beforeArtifact')`
alone. There is no `baseRecorded`, generated Workspace observation or base-table
write. Generation is complete after artifact read-back/receipt, not external save.
Download makes no receipt. A selected external file must exactly match the frozen
whole ZIP; repeat verification reuses the first observation without another write.
Known loss/corruption of acknowledged input or artifact remains repair on retry,
download and verification; no regeneration from the current Project. No cleanup or
historical root release is introduced in this unit.

Enumerate both output job kinds for creation/retry mutual exclusion, host recovery
and catalog discovery; a lost Contribution folder cannot disappear behind an empty
list. Keep the existing receiver guards and Project edit semantics: a frozen output
does not freeze ordinary editing, but a newer edit never enters an older artifact.
The existing file UI offers Workspace or Contribution, revealing explicit available
Workspace-base selection only for Contribution. Choice changes are pending UI input
until generation/cancellation; no role/filename/source relation is inferred. Mode,
IME, draft and file input guards remain. Refresh discovers both output kinds, and
recovery before renderer preparation stays available. Reuse existing package/file/
recorded-DOM tests; browser/iPhone/offline and ordinary-route adoption remain open.

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

**Current status (PO reply after `1edc3f5`): item 1 APPROVED.** PO accepted
isolated implementation followed by evidence/acceptance and only then ordinary
activation. 05 §7.5 records this gate-order amendment. The historical heading
and proposal below retain their existing links; their pending-split wording is
superseded by this decision. Exact five-purpose wire/schema closure, §12.6's
separate compatibility amendment, measured adoption and release remain distinct.
No ProjectScene package reader/writer has been implemented by this docs update.

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
The candidate persistent job/receipt shape is specified in §12.7. It remains a
versioned design proposal, not an adopted local schema or implemented sink.

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
five-purpose contract needs independent review of the consolidated §12.6 tables and the
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
| assetRevisionsById | Re-key id/assetId/representationIds and each anchorCompatibilityClasses id/targetVariantFamilyIds. Omit parentRevisionId and materialCompatibilityMaps. Transform provenance; re-digest. | Omit records. Derive compatibleAnchorClassIds and the included-family anchorClassPartition by §5.1. Edit-copy reconstruction follows §12.6. |
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

#### 12.2.1 Bounded backup original capture and ZIP inspection

This is the next isolated implementation under §11, not general adoption or a
restore/publication protocol. It uses the existing known atomic-map source and
current/conflict/exchangeBase inventory. Unknown/unsupported migration, opaque or
explicit-retention inventories are refused, never silently omitted to report a
complete backup. Their broader portability remains required before adoption.

`BackupSourceCapture.prepare` takes the ready Session/token, its retained base
store and a read-only body store. It freezes original metadata bytes before any
later awaited read, copies the canonical `{records}` snapshot and original base
evidence, and rechecks the Session publication/token and exact base snapshot before
returning. A frozen-original reconstruction entry makes no live-readiness claim.
The future Session output boundary must additionally hold the lease and refuse
unfinished input/output/storage jobs; source capture is not that authority.

For both capture and independent archive inspection:

- Preserve exact full metadata/history/identity/heads, not projected winners.
- Parse the closed canonical table and each record under §4.1. Preserve optional
  labels and sorted unique historical completions, without manufacturing a local
  generated/imported event. All rows have the exact backup lineage; duplicate keys,
  mixed evidence or incorrect order reject. Labels use the existing finite text
  limit and never select purpose, identity or a base.
- Verify each original Workspace manifest/metadata pair and recompute its summary
  and strong closure. The evidence list is exactly the deduplicated sorted union
  of table references; missing or extra evidence rejects. Empty tables are valid.
- Recompute current/conflict/exchangeBase reasons and compare the entire protected
  inventory, including base-only bodies. All physical bodies are included once per
  digest/length; semantic aliases keep their own validated references. No local job,
  previous ZIP, handle, path, profile or transient UI state enters the payload.
- Stream and hash every required body, including unchanged/base-only models. A
  metadata-only presence check cannot prove a complete portable backup. Reopening
  checks the actual ZIP via the existing bounded raw-header/CRC/SHA inspector.
- Use the existing package limits for control/evidence/source/entry/body budgets.
  The checksum's 64 bytes and all retained base manifests count toward the shared 4 MiB controls limit as well
  as each 1 MiB limit. Charge 100,000 physical operations and dependency references
  and 1,000,000 decoded nodes across the complete package proof.
  Charge source inspection/summary/closure work cumulatively across current source
  and all retained bases, rather than resetting the package budget per row.
- Retain one owned copy of each original. Supply output entries sequentially from
  that owner, not a second aggregate clone of metadata plus all base evidence.
  Use 64 KiB pull views before digest/ZIP copies; retain at most one raw 16 MiB
  body chunk. Originals (8,000,000 + 16,777,216 bytes), controls (4 MiB), one entry
  copy (at most 8,000,000), and that bounded body/header working set stay below the
  existing 64 MiB application-owned I/O ceiling. This is an implementation buffer
  bound, not a measured total JS/Wasm/renderer memory guarantee.
- Entry order is manifest/checksum, metadata, protected inventory, exchange table,
  digest-sorted base evidence, then digest-sorted bodies. All enter payload totals;
  summary blob counts exclude evidence controls. Writer success is only generated
  archive integrity, not external save, durable checkpoint or successful restore.

Acceptance reuses package tests: exact original/history roundtrip, empty/multiple
base tables and completion preservation, a base-only model/image after current
exclusion, no evidence/body duplication, valid conflicts, stale capture rejection,
missing/corrupt/misbound evidence and reasons, stream cancellation/failure and
exact-purpose refusal. Durable output, explicit same-Project replacement, restored
base availability, continuation after restore and UI/device checks are subsequent
F03 connection work, not satisfied by this primitive.

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
empty D has empty class arrays and, when the verified inventory difference is also
empty, zero blob delta; snapshot excludes all source
history counts; backup's extra evidence files do not inflate blob counts.
Do not infer an empty body difference merely from zero changes: §4 permits a
target not descending from all base heads, including restaging a required old body.

Bounded implementation in `src/projectPackage` (2026-09-13): canonical manifest/
checksum, closed five-purpose shapes, dictionary/count grammar and exact derived-
entry descriptor table. `tests/projectPackage.test.ts` exercises this component,
not a completed file exchange. This
preflight cannot prove ZIP headers/CRC, decoded history/root/DAG, inventory closure
or summary-content equality. Those later verification stages remain mandatory
before any publication. Raw JSON depth/node limits apply during token inspection,
before final value decoding; existing unbudgeted compatibility callers are unchanged.
The manifest table alone cannot classify retained evidence as manifest versus
metadata. The later evidence reader must also charge retained manifests to the
shared control-JSON budget; the existing descriptor check is not that proof.
For control preflight, the isolation guard enumerates exact `contract.ts`/
`manifest.ts` imports of pure canonical/value/record checks and SHA-256. The
source-capture helpers below have a separate exact import list. Unlisted source
callers still cannot import this package module; no application or storage
activation is authorized by these bounded components.

Bounded source-capture implementation (2026-09-13): the existing physical
scanner may collect original scalar operations into a source-owned buffer before
same-change projection collapse. Return this buffer only after complete physical
and current-candidate validation, never via a streaming caller callback. Include
schema, source change/op IDs, exact path and decoded present/absent value. Charge
the additional node/work traversal cumulatively against finite package inspection
limits; ordinary source reads do not allocate this optional buffer.

The complete-history summary uses this inspected output and the dictionary above.
Present known fields reuse domain validators to detect nested unknown fields;
absence counts by address, including a required field deleted then set in one
original change. If a superseded present known value cannot be classified, this
first generator refuses with an explicit unsupported-summary result. This is a
generator limitation, not a change to existing Project/history/receive admission.
Unknown history without trustworthy opaque inventory also blocks generation;
never omit unknown data or infer its references from strings to proceed.

A Team Workspace source capture requires a durable ready Session, publication,
matching source/provider/requested token, exact full-source reopen/heads/original
bytes and all-current-candidate strong closure. Validate each semantic BlobRef,
deduplicate physical digest/length, then stream/verify each required body using
existing WorkspaceFS/CAS read boundaries and shared package read/byte limits.
This capture uses a dedicated read-only CAS open: the same receipt/size and
stream digest checks, but no suspect-marker write or writer-lease acquisition,
even on corruption. Existing diagnostic `open`/`verify` behavior is unchanged.
The read-only stream applies the stricter of CAS and supplied package limits to
raw backend chunks before copying; it does not partition an oversized input to
evade the chunk bound. Whole-file buffering is not an export fallback.
It does not publish Project data, mutate CAS metadata or turn verification into
a repair. Missing/corrupt input is reported to the caller and must be resolved
before a later capture can complete.
Recheck ready/token/publication after asynchronous verification; missing, corrupt,
pending, stale or cancelled work produces no completed capture. The returned owned
bytes/descriptors are not a durable job, output receipt, exchange base, file-save
claim or permission to reclaim any body. Output-job retention and exact ZIP/receive
remain mandatory later connections. The exact isolated source/summary/closure
helpers may be enumerated in the existing import guard; ordinary callers remain
forbidden. No storage schema, renderer, dependency or activation change is implied.
`historySummary.ts`, `closure.ts` and `workspaceSource.ts` implement this isolated
component. Existing metadata/persistence tests cover original-byte preservation,
all-live binding closure, distinct weak-body exclusion, deduplication and capture
failure/recovery. Exact executed evidence and remaining ZIP/job/receive work are
in `tasks/todo.md`; these checks are not measured wire/profile adoption.

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

#### Bounded archive connection (2026-09-13)

The next isolated component connects `WorkspaceSourceCapture` to a real ZIP
stream, then inspects an immutable Blob/File view without modifying that input.
Use the existing ZIP dependency with every writer option fixed to the layout
above; in particular local DOS epoch construction, version/attributes and signed
descriptors must not inherit the Native writer's defaults. Entries are sequential,
each exact expected length/hash must finish before continuing, and any failed
entry aborts the owned output instead of closing a partially successful ZIP.
Abort reaches both entry input and output pipeline; verify it again before/after
close. Await destination close and all owned pipeline settlements before returning
a generated-stream digest. No user pathname is inferred or overwritten.

Before the second digest-checking clone and ZIP codec, divide checked stored input
into at most 64 KiB views, one per pull with a zero high-water mark. Retain at most
one raw chunk, reject raw chunks over 16 MiB, and charge raw reads (including empty
ones) as well as divided chunks and output to the shared package counter. Do not
feed a 16 MiB chunk into the codec's eager slice queue. With a streaming destination,
the live input/raw-check clone pair is at most 32 MiB, owned metadata plus its output
copy at most 16,000,000 bytes, manifest at most 1 MiB, all container headers below
4 MiB, and the finite codec/bridge stages carry only 64 KiB chunks. This leaves
more than 10 MiB below the 64 MiB I/O ceiling for those small stages. A caller that
accumulates the entire output is not an eligible streaming sink; sink/job admission
and actual device/scale measurement remain separate. This is not a Wasm/heap bound.

The read-only inspector starts at the exact final 22-byte EOCD. Bound ranges before
allocation, check every fixed central/local field, signed descriptor, CRC and byte
extent independently of the writer library. Entries begin at zero, are contiguous,
and correspond one-to-one in the manifest's order; central ends at EOCD and no
prefix, gaps, suffix, extra/comment, alias, ZIP64 or alternative descriptor passes.
Headers share the metadata budget; raw ranges, control copies and body streams
share finite reads/buffers. Read payloads in at most 64 KiB ranges; do not buffer a
whole archive. Controls are decoded only after their declared bounds pass.
Buffered entry reads require a finite safe-integer maximum no greater than the
source bound and only one may run per archive at a time. Each range observes both
the archive and the current read's cancellation signal; a rejected/cancelled read
releases that temporary buffer slot without resetting shared read counters.
Recognizable ZIP magic in blob payloads is rejected (including empty/split ZIP
signatures), with no permission inferred from opaque declarations. Other profile
and nested-container checks remain required at model/media admission.

For Workspace, reopen exact metadata with the existing lower source limits,
verify heads/proof and independently recompute original-operation summary and
all-live strong blob closure; grammar/hash checks are insufficient. Unknown opaque
inventory and unsupported historical classification retain the capture limitation.
The inspector returns immutable archive access and inspected source, not trusted
profile evidence or a publication capability. Generated/inspected archives are
not external-file receipts, protected job roots or permission for GC. Origin job
coordination, retention, file close/readback receipts, CAS/content admission and
Project publication remain mandatory later connections before activation.

Bounded implementation: `workspaceArchive.ts`, `zipArchive.ts` and `zipChecks.ts`
now provide this stream/inspection connection. The existing package test includes
an independent complete ZIP encoder, library readback, exact-container mutations,
CRC-only and SHA faults, false source summary/heads/closure, output failures and
cancellation. Existing persistence tests roundtrip a durable edited source and its
deduplicated model/image bodies without modifying source storage. These are
synthetic Node/storage-port checks; final executed totals are in `tasks/todo.md`.
No ordinary-import, external-file, scale, renderer, browser or iPhone credit follows.

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
  not disappear. Review-to-edit follows §12.6's reconstruction and vectors below;
  do not supply an implementation-selected expected result.
- Review partition vectors: two families with two classes paired in opposite ways
  produce distinct snapshot relations and retain those exact pairings on edit-copy;
  same labels/order/geometry cannot erase the difference. With one family omitted,
  only anchors whose class has no included family become needsReview on edit-copy;
  their known positions, colors, content and Scene edges remain. Already-needsReview
  anchors remain so; nonvisual owners remain structurally list-only; ProjectAnchor
  retains Project-frame placement. Missing/duplicate/foreign partition classes,
  uncovered/multiply-covered/foreign families, a nonsingleton visualPatch class,
  empty visual set or partition on a nonvisual owner rejects before publication.
  A family without any Caption still needs its recorded class. Repeated/cancelled
  edit-copy never reuses the source lineage or publishes a partially rebuilt graph.
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

**Current PO decision (2026-09-13, after `c2a00f3`): approved behavior with a
visible-pin condition.** Preserve the included model/pin correspondence in an
independent edit-copy, group omitted-model records as `対応モデルなし`, and retain
each record's content and position. `needsReview` is only a status: when position
authority exists, keep the pin visible/selectable and identify the status
separately, without replacing its chosen color (05 §2.3). Do not invent a position
for missing/corrupt/conflicting authority. This closes the product question;
consolidate the exact snapshot/reconstruction/golden tables and obtain independent
review before package reader/writer code. It is not complete wire/profile, runtime
implementation, ordinary-route activation or release acceptance. Earlier pending
decision notes in this document are superseded for this behavior only.

Later PO adoption of `親モデルを変更` is recorded in 05 §4.4. It provides an
accepted, now connected recovery operation for existing placed Caption records, but does
not itself ratify the snapshot fields/class partition proposed in this section.
Do not confuse explicit individual reassignment with collapsing a whole group
into one owner or inferring omitted model relationships during import.

**Earlier PO discussion after `1edc3f5` (superseded by the decision above):** PO suggests grouping
pins whose target model is not included. A derived Caption-list group can make
them discoverable without creating a Scene/Asset or rewriting memberships and
anchors. Retain each item's re-keyed owner/frame/position/class independently;
grouping is not a replacement for the included-family mapping below. Distinguish
omitted model payload from an omitted compatible family of a present model.
Original unplaced items, unresolved/corrupt references and temporarily hidden
models must not be silently reclassified as ordinary missing-model entries.
The adopted grouping/copy behavior does not authorize automatic reassignment or
invented positions; exact schema tables still require the review above.

The current proposal cannot reconstruct an editable visual Asset faithfully from
its flattened review form. 01 §3.1 and `projectModelGraph.ts` require a complete
nonoverlapping partition of all visual families into anchor-compatibility classes.
02 §9.3 / §5.1 above deliberately retain only compatible class IDs, not the
class-to-family mapping. With two families and two classes, swapping their pairing
produces the same current review data. 05 §7.3 nevertheless requires explicit
editing to create a fresh clean Project. The phrase "ordinary history-free
reconstruction" does not supply the missing relation; order/name/geometry inference
or one invented all-family class would violate the accepted rules.

Technical mapping to consolidate under the adopted behavior, NOT yet applied to the schema:

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
   remains needsReview. Known-position needsReview pins remain visible/selectable;
   displaying them does not clear that status. Nonvisual owners retain §5.1's
   structural list-only/Scene-membership boundary even when a transform is known;
   this is distinct from compatibility-only needsReview on a visible Scene model.
3. Keep ordinary local View mode and Workspace/Contribution unchanged. The amendment
   affects only the explicit conversion of a separately cut-out review file into
   an independent editable Project; it is not an extra restriction on participants.

#### Exact fresh edit-copy reconstruction (candidate implementation contract)

Validate the closed snapshot first. Allocate one typed ID map plus fresh Project,
epoch, seed and causal root; retain it for the same logical attempt/retry. Re-key
all references/equality classes once, never by record name or array position. Do
not emit the inverse source-ID map. Source Project and snapshot bytes stay intact.
Build the whole candidate and validate its domain graph before publication.

| Target | Generated fields and preserved values |
|---|---|
| Project / mutable records | Rebuild metadata schema `{major:2,minor:0}` under the pinned atomic-map-1 profile and fresh identity/root; re-key frame/Scene/default pointers using §12.1. Every mutable lifecycle is `{state:'active',eventId:fresh evt,reason:'initial'}`. Retain current user values and optional absence; not old lifecycle/history/actors. |
| Visual Asset | Fresh Asset with mapped frame/label and active status naming one new binding. Keep exact snapshot assetToProject; no inferred model alignment. |
| AssetRevision | Fresh revision, mapped Asset and included representationIds, mapped anchorClassPartition as anchorCompatibilityClasses. Generate `provenance:{origin:'import',inputBlobDigests:sorted unique included model blob digests}` as the fact of this new import. Omit parentRevisionId/materialCompatibilityMaps/tool/sourceMediaType; recompute payloadDigest. |
| AssetBindingRevision | Fresh binding naming new Asset/revision, exact assetToProject, `method:'import'`. Omit parentBindingId/residual; recompute payloadDigest. |
| Representation | Re-key §5.1 presentation fields/catalog/classes, preserve exact blob bytes and transforms. Set required `derivedFrom:[]`; omit derivation. Recompute payloadDigest. Do not invent source-purpose or recover omitted source bodies. |
| Asset-anchor Caption | Re-key owner/frame/class with the same map; retain position, permitted normal/hitEvidence, text/color and memberships. A partition class maps to its fresh active class; a class absent from partition gets a distinct fresh ID, not an active class. Only manual anchors in an active class receive the new authoredAssetRevisionId. Other anchors omit that weak revision and source as in §12.1; no invented hit method or surface evidence. |
| Nonvisual owners / ProjectAnchor | Apply §5.1 missingSource/list-only mapping and its pending transform rule; no new Scene Asset edge. ProjectAnchor keeps its exact Project position under the mapped frame. |
| Media / Scene / edges / View / material / tags | Apply the corresponding §12.1 re-key/retain/fresh-lifecycle rules to the included snapshot closure. Media blobs remain exact; changed immutable payload digests are recomputed. |

No extra compatibility class is fabricated for a missing family. Preserve
needsReview as a state; known-position display follows 05 §2.3, independently of
compatibility acknowledgment. The proposed genuine-unplaced branch remains outside
the current `atomic-map-1` implementation profile until its separate schema gate;
do not introduce it implicitly in this reconstruction. Exact byte goldens and
reader/writer tests follow these tables; neither generation nor this document is
runtime/adoption evidence.

This changes the review's topology-omission policy, closed snapshot fields and the
stated edit-copy effect. The product behavior is now approved; it is not a shortcut
around exact contract consolidation and review. The smaller alternative—mark every review
pin needsReview on edit—unnecessarily degrades even fully represented models and
is not recommended. Requiring a different file instead would remove the accepted
direct edit-copy capability. No new schema or fallback has been implemented.

Read-only analysis independently confirmed the missing partition. Finish the
resulting exact snapshot/reconstruction/golden contract before
claiming §11.3's complete five-purpose gate closed. Native/v1/LociMyu migration's
different physical-profile decision remains in 07 §10.2, not hidden inside this
review change. Neither issue invalidates the approved full-source service already
implemented; package reader/writer authority still follows 05 §7.5.

2026-09-13 implementation-contract review: §§5.1/12.1/12.5 and the exact fresh
reconstruction table above are now consolidated. Independent review/re-review
confirmed the partition, required generated fields, `{major:2,minor:0}` profile
and standalone `P ⊆ C ⊆ P ∪ R` validation, with no mandatory remaining finding.
This closes the previously identified design gap for the next isolated package
slice, not builder/golden execution, sink adoption or §10's measured acceptance.

Design review: independent read-only review found one incorrect description of
the current validation host's cumulative 64 MiB guard; §12.4 now states the actual
code boundary. No other mandatory issue was reported in the field/summary/root/
execution tables. This is design review, not approval of the §12.6 amendment,
completion of reconstruction/golden bytes, or executable package acceptance.

### 12.7 Closed local package-job and receipt proposal (2026-09-13)

The isolated §8.6 receiveContribution Start, input/index/prepared and its two
completion alternatives/cancel stage are additional closed local rows. They do
not change existing Workspace records or permit another JobStep detail.

This fills §11.4's explicit job/receipt design gap under the existing design
authorization. It does not approve §12.6, change §10/§11's gate, implement a sink
or add wire entries. All records below are local-only: no job, sink handle,
external observation or UI checkpoint label enters ProjectDoc or a shared ZIP.
The current metadata `Publication` records transaction/digest/heads, not package
output or file completion; `persistence.ts` is a reusable primitive, not a validator
or atomicity proof for these new records.

#### Isolated Workspace receive physical connection (2026-09-13)

The following pins the existing-project `receiveWorkspace` subset for isolated
implementation under §11, not other job purposes or ordinary-route adoption.
Use `v2/packages/receive/<jobId>/` below the owning Project root. Fixed files are
`input.zip`, `input.json`, `prepared.json`, `start.json`, optional `abandoned.json`, and digest-named JSON
`steps/<sha256>.json`. `input.json` is the closed local binding
`{schema:'lociview-workspace-input-1',jobId,prepared:EvidenceRef,archive:EvidenceRef}`;
it is not wire data. Prepared/start/input bindings must all agree.
`prepared.json`, `start.json` and steps use the exact closed rows below. The
physical job ID equals its metadata transaction ID when M is nonempty. No job is
associated by newest journal, package filename or a later receiver head set.

The concrete file service holds a distinct origin-wide package-operation lock,
then calls the Session's dedicated receive command. That command alone owns the
Project `underWriteLease`; CAS retains its separate existing lock. No public
receive/retry is called recursively under the Project lease, and no generic
UI-supplied mutation callback is added. The concrete job object is bound to the
same Project filesystem capability. A pure type-only Session reference in
Workspace source capture must not become a runtime cycle.

Before first write, inspect the actual immutable Blob, complete original source,
final union/profile/facts and cumulative GLB/PNG lane limits. Write/read back the
prepared/input controls first, binding the entire original archive before copying.
Retain the input by streaming into `input.zip`, read it back through the FS Blob
capability and verify the whole archive again. Write `start.json` last;
that acknowledged start requires all exact input bytes on cold recovery. A
partial unacknowledged spool is an interrupted job, not an accepted receipt or
permission to overwrite arbitrary bytes. It cannot mutate Project metadata.
Use existing finite guards and include the spool, possible new CAS copies,
metadata/journal parts, base controls and overhead in staging-space admission.
No whole-archive `arrayBuffer`, memory fallback for a missing Blob capability,
automatic deletion, or unbounded receipt enumeration is permitted.

An unstarted job is proven by absence of `start.json`, same-ID metadata journal
and every step, checked under the Session Project lease. Presence of even a torn
start, journal/step evidence, or a failed absence check forbids this branch.
With a valid closed input/prepared binding, explicit `reselectInput` verifies the
whole selected archive against that binding before any write, then may replace
only this unacknowledged `input.zip` from byte zero. Recheck the current receiver,
token, lineage, profile/facts and other unfinished jobs before copying; there was
no frozen receiver before start. No acknowledged input, CAS receipt, fact or
journal original is replenished by this command. Wrong file selection is rejected
without changing the fragment or the existing Project.

An old fragment without a usable binding cannot prove its original file. Offer
explicit `abandonInput`, not filename/prefix matching. The command rechecks the
same absence conditions and writes/read-backs only the closed local marker
`{schema:'lociview-workspace-input-abandoned-1',jobId,stage:'beforeStart'}` to
`abandoned.json`. It is terminal, not a JobStep, publication or imported base.
Retain all fragments and count their sizes in admission; no deletion is implied.
Repeated abandonment verifies/reuses the marker. A marker coexisting with a start,
journal or steps is repair, never permission to hide an acknowledged operation.
Bound but unstarted input may also be explicitly abandoned. Torn controls may be
abandoned only when start/journal/step absence is independently established.

The limited GLB/PNG host exposes actual same-Project Workspace receive and these
state-specific recovery actions in its existing file area. All writes use the
concrete service and Session commands. Busy, draft/IME, Project switch and View/Edit
guards apply for the full operation, including display refresh. A failed decode
after publication retains the old rendered view and a retry path; no remount or
synthetic fallback acknowledges success. Completed imported-base status is not an
external file-save message. Ordinary home and device acceptance remain gated.

Cold pre-prepared recovery reopens this same input, freezes the original receiver
proof and reconstructs the exact missing original changes/fact plan. Reused CAS
receipts and old facts are verify-only; a missing acknowledged body or prepared
journal original is never filled from the archive. Prepared recovery uses the
existing Session private resume and its original journal. A published journal
fixes the observation to its own original final heads, even after later edits.
Zero-change completion verifies inclusion and required durable bodies under the
same authority, without creating a journal. Before any receive observation, a
different receiver makes a pre-journal job stale, not corrupt or complete.
Before either imported-base completion, verify the original Workspace manifest's
entire guaranteed inventory in CAS, including bodies no longer active in the
receiver. Current final closure alone is insufficient; missing bytes reject and
are not repaired by an empty merge.

For this subset, each job has at most one `workspacePublished` or
`workspaceAlreadyPresent` step, followed by one `baseRecorded` step. Retry reuses
the exact step rather than appending a second completion. Extra/branching/torn
steps reject. The public service exposes incomplete job IDs for explicit recovery
and an explicit stale-job cancellation command. Under the same Project authority,
only a changed receiver with no journal or observation may append the existing
`cancelled/beforeWorkspaceJournal` step. It terminates that job without deleting
its spool; a new explicit receive may then start. No new receive may bypass an
unfinished job, and no implicit cancellation is permitted.

The imported base table is materialized from immutable canonical records under
`v2/packages/bases/<packageId>/<sha256>.json`, each a complete §4.1 record with
one imported completion. Its filename hashes its exact canonical bytes. The
table folds matching records by identity/epoch/package ID and unions exact
completions; different manifest/declared-head/evidence under a key is repair.
Original manifest/metadata evidence is write-once under
`v2/packages/evidence/<sha256>` before the base record. That final immutable
record introduces evidence plus completion at one complete canonical-record
commit boundary, with read-back; this is not a filesystem rename guarantee and
torn records fail closed. Missing acknowledged
evidence rejects, including retry after record commit but before `baseRecorded`.
No selected exchange base changes automatically. Current implementation retains
job spools and evidence (no GC command); these copies count in admission and are
not claimed as an optimized permanent retention policy.

Acceptance reuses the real-format/package/persistence tests: actual generated
Workspace with new GLB/PNG and a local Caption edit; cold pre-prepared and prepared
interruption; publication-to-base crash; already-present/repeated receive without
metadata writes; exact imported declared vs receiver heads; corrupt input and
lost acknowledged evidence refuse without repair. Node/injected decoder evidence
does not confer browser, physical iPhone or offline acceptance.

Bounded implementation status: `receiveWorkspace.ts` / `receiveJob.ts` connect
actual Blob input to the existing-Project Session, including post-start cold
recovery and imported completion. Explicit pre-start re-selection/abandonment now
connects to the existing limited GLB/PNG host's file area, including cold recovery
before editor mount and warm same-editor refresh. Recorded DOM/injected display
evidence is not native picker, rendered browser, ordinary UI or adoption credit.
The exact executed matrix is in todo; other job purposes remain proposals.

#### Isolated Workspace output physical connection (2026-09-13)

Implement the existing `send`/Team Workspace rows below in the limited real-file
host, under §11. This is not a manual/automatic checkpoint or initial import.
Use `v2/packages/output/<jobId>/` beneath the owning Project. Retain fixed
`metadata.am`, `manifest.json`, `inventory.json`, `bases.json`, `capture.json`,
`prepared.json`, `start.json`, and digest-addressed `steps/<sha256>.json`.
Each generation attempt uses a fresh collision-checked `artifacts/<sinkId>.zip`;
never replace a prior attempt or splice its prefix. Job and package IDs remain
fixed across retry. No user filename/path is persisted in these controls.

Prepare exact canonical manifest/checksum/payloads before writes, using the same
builder as the stream writer. Frozen source is the exact durable original metadata
and source proof, not a render projection. Persist/read back all frozen controls
before the start marker. On cold retry, reopen those original bytes, recompute the
summary/strong closure/prepared bindings and verify required bodies. Never use the
current Session, current base selection or a new package ID as replacement input.
An incomplete pre-start set is not acknowledged: explicit abandonment may add a
closed terminal `abandoned.json` with
`{schema:'lociview-workspace-output-abandoned-1',jobId,stage:'beforeStart'}` only
after independently proving start/steps absent under the Project lease. All
fragments remain and count toward capacity. Missing/torn acknowledged data is
repair, not permission for this abandonment or a rewrite.

The frozen inventory uses §12.2's exact schema. For known data, derive reason
attribution from original candidate fields and the complete strong reference graph:
ordinary active lifecycle roots start `current`; unresolved lifecycle and
concurrent-delete/edit roots start `conflict`. Traversing a reference governed by
an unresolved field changes `current` to `conflict`; conflict propagates through
all strong descendants. Equal immutable registrations are one known value, not
a winner selection. Weak edges never gain protection through this traversal.
Apply the lifecycle/delete-edit rule also when entering a mutable node from
another root, not only at root seeding. A resolved deleted node reached by a live
strong reference remains retained under the existing graph. Governing fields
use the edge's first field segment for Project/mutable records and the whole
record for immutable entities. Mutable multi-candidates stay unresolved even if
their values are equal. Missing/invalid governing fields refuse classification;
charge both `(node,current)` and `(node,conflict)` visits to finite work limits.
Union reasons where independent paths reach one physical digest. A text/color
conflict alone does not turn a model's unrelated status reference into conflict.
Add `exchangeBase` for every verified retained base's guaranteed inventory,
including bodies no longer current. Opaque/migration/retention declarations require
their exact supported evidence; inability to classify them refuses generation.
Do not claim this first known-profile path implements those later profiles.

`bases.json` is the canonical `{records:[...]}` table in §4.1, folding all matching
immutable local observations into sorted unique completions. Preserve existing
imported observations and their exact journal proof; a generated observation
instead requires the matching output capture/prepared/start and verified artifact
step. Both share the existing local base/evidence namespace. Different manifest,
source or heads for one package ID remain an integrity error. Never create a
separate generated table, discard imported provenance, or freeze an empty table
merely because output itself does not transport it. Base-only body presence must
be verified without rereading unchanged large payloads solely to discover a delta.

The concrete service holds the existing origin package-operation lock and invokes
a dedicated Session command under the same Project write lease; no generic
UI-provided write callback. Reject pending journal/receive and stale initial token
before writes. The capture is immutable after start: later completed Project
edits do not change a recoverable output's content or acknowledge those newer edits.
Count receive spools, retained output attempts, controls/evidence and temporary
overlap against §12.4's existing finite limits. No deletion or extra dependency.

Stream through WorkspaceFS, await actual sink close, then independently inspect
the stored Blob, whole archive digest/length, exact original manifest/metadata and
payload table. Only this may append `artifactVerified`. Without that step, even a
complete-looking ZIP is unknown; explicit retry creates a fresh artifact. Finish
the exact generated base and append `baseRecorded` idempotently before offering
handoff. Missing already-acknowledged artifact/evidence/base is repair and is not
recreated from later data. A failure after base commit but before its step may
validate/reuse only that same record and original generation observation.

Listing jobs and looking up a completed base validates its exact closed controls,
base/evidence binding and artifact availability/size, not every historical ZIP's
payload again. Share one validated base/output-control read within that operation.
Full streamed artifact verification remains mandatory for initial completion,
unfinished handoff recovery and actual download/file verification. This avoids
quadratic whole-archive reads merely to list prior outputs; it does not authorize
artifact retirement or treating a missing acknowledged base as an empty table.

The same file area offers explicit generation, retry and download, plus optional
exact file re-selection. Download creates no success receipt and does not occur
automatically on reload/retry. Exact re-selection checks the complete immutable
Blob against the retained verified artifact before `externalFileVerified` with
`reselectedFileV1`; filename and modified time are never identity. This reports
only that captured file's verified contents, not a current-file guarantee or
acknowledgment of newer Project edits. Draft/IME/gizmo, View/Edit and Project
switch guards remain. Cold pending jobs are visible before renderer mounting;
warm operations preserve the same editor and temporary viewing state.

Acceptance uses existing package/file/host tests: saved actual-format originals;
both output→receive and receive→output; current/conflict/base-only inventory;
write/close/read-back and base-handoff interruption; frozen retry after later
edits; missing/torn acknowledged controls/artifact refusal; exact versus wrong
file re-selection; download without a saved claim; cold and warm host guards.
No new PoC, ordinary activation, native-input/device or offline credit follows.

#### Isolated first Workspace import (implementation contract, 2026-09-13)

This connects §2's already-approved start-from-Workspace behavior to the same
limited GLB/PNG file lane. It is not ordinary activation, a new wire purpose,
profile adoption or a relaxation of local `initialize` (exactly two originals).

1. The inspected manifest's Project identity selects the isolated Project area.
   Identity/epoch/envelope/root proof, not filename/title, govern routing. A vacant
   area may import. A published exact-lineage Project receives through the existing
   service, retaining local edits. Same Project ID with another proof, incomplete
   local creation or repair data must not be overwritten or silently re-keyed.
   An unstarted import fragment permits only exact file re-selection or explicit
   abandonment; existing creation originals and unrelated metadata block import.
   Vacancy also checks the separate metadata repository namespace, not just OPFS
   receipt absence. Recovery admits only the owned original repository ID; surviving
   unrelated metadata after receipt loss is repair state, not a new import target.
2. Reuse `receive/<jobId>/` input/descriptor/spool/steps and its capacity/ownership/
   exact-reselection boundaries. Add one closed Start variant with `operation:
   importWorkspace`, `destination:{identity,metadataEnvelope}` and no `receiver`.
   Other fields are unchanged. Destination must exactly equal the original
   manifest; absence of a receiver is never an empty/fabricated receiver history.
   Start is written only after complete input read-back. Existing receive starts
   remain byte-compatible and require a nonempty published receiver.
3. Add journal purpose `importWorkspace`: `predecessor:null`, `baseHeads:[]`,
   `repositoryId:transactionId:jobId` (the three IDs are equal). It requires the
   existing fullMetadata package source proof/original manifest/checksum/metadata,
   with expected final heads equal to the declared source heads. The exact change
   set contains **all** original changes, dependency-ready batches with native-hash
   lexicographic order within each batch, beginning with the original root. Validate
   completeness against the retained full source, byte identity, DAG and exact
   final heads. No bootstrap/reseed/materialized reconstruction/prefix publication.
   The existing `lociview:v2:metadata-change-set:jcs-v2` seal includes the distinct
   purpose, empty base, descriptors, complete source proof and sorted staged blobs.
   Existing initialize/local/remote seals and recovery admission are unchanged.
4. Before writes, check complete historical GLB/PNG metadata and cumulative size,
   then inspect every currently strong-required original record/body. Initial
   admission has no old-Project record set; it does not weaken received admission's
   old-record checks. Existing origin CAS bodies may be reused only after verified
   presence/content; an acknowledged missing/corrupt body is never replenished.
   Stage original bodies/facts under the Project lease after retaining input/start,
   followed by exact journal originals and one final metadata publication. Preserve
   semantic conflict candidates; no source relation or conflict winner is guessed.
5. Cold recovery before journal preparation may finish from the exact owned input;
   after preparation it verifies retained originals/facts/bodies, never regenerates
   or refills acknowledged evidence. Partial repository state must be an exact
   original subset; after metadataDurable it must already include all originals.
   Generic retry/local initialization cannot bypass the input-job verification.
   Import journal IDs remain discoverable when the entire input directory is lost;
   catalog and output readiness must not treat that missing evidence as completion.
6. Reuse `workspacePublished` with actual receiver heads equal to declared heads,
   binding the first-import journal and publication to the original Start. Initial
   import never emits `workspaceAlreadyPresent`. Record the same imported base in
   the shared table, then `baseRecorded`; the reader verifies the distinct initial
   Start/journal purpose and exact proof/heads. Replay only validates completion,
   preserves later local edits and never creates a second initial transaction.
   Replay revalidates the imported snapshot's original strong facts, including
   records made weak/inactive by later local edits, without overwriting those edits.
7. Catalog/editor readiness includes unfinished import jobs even if metadata has
   been published. Cold recovery controls do not require a Scene/editor/source token
   and appear before renderer preparation. An unknown or conflicting starting Scene
   must not be guessed. Failed input, mode switch, renderer preparation or file
   import keeps recoverable data visible; source files are not modified.
   Before a starting Scene is chosen, the same file tools and Scene controls retain
   mutual input guards. Explicitly abandoned empty imports may return to the catalog;
   this neither publishes a Project nor marks missing/incomplete data ready.

Acceptance reuses existing file/journal fixtures: >2-original and branching source
import with original identity/bytes, retained semantic candidates, edit/output/
receive round-trip, interrupted spool/facts/metadata/publication/base and cold
retry, no duplicate replay after later edits, exact pre-start re-selection,
missing acknowledged evidence refusal, and same-ID/different-proof collision
without writes. Recorded DOM is not native picker, rendering, iPhone or offline
acceptance. No new page/fixture framework is required.

#### Isolated manual backup output connection (implementation contract)

The existing file tools add manual backup output using §12.2.1's exact originals,
not another validation page. A new job lives under
`v2/packages/backup-output/<jobId>/`. Fixed payload paths are `metadata.am`,
`protected-inventory.json`, `exchange-bases.json` and declared
`base-evidence/sha256/<digest>`, plus `manifest.json`, `capture.json`,
`prepared.json`, `start.json`, `abandoned.json`, `steps/<digest>.json` and
`artifacts/<sinkId>.zip`. No other path is allowed. Entire missing jobs remain
discoverable through `v2/packages/backup-output-index/<jobId>.json`, the closed
`{schema:'lociview-backup-output-index-1',jobId,prepared:EvidenceRef}`.

Use the shared frozen/output records below: purpose backup, wholeProject, no
selected base; payloads equal the complete manifest payload order; roots include
all protected bodies and exact originals/controls. Start uses manualCheckpoint
and optional label only. The label follows the 256-scalar single-line grammar;
it is not a manifest memo, Project title/identity, purpose or base selection.
Each explicit request creates new package/job IDs even at unchanged heads.

Persist/read back every original and control, then the external index, then Start.
The exact closed pre-Start abandonment is
`{schema:'lociview-backup-output-abandoned-1',jobId,stage:'beforeStart'}`.
Indexed missing prepared data, Start without index, or acknowledged missing input
is repair. No current source/reselected file may replenish acknowledged loss.
An unstarted partial alone permits explicit abandonment, not automatic completion.

Open/list validates the frozen metadata/base/evidence/inventory and receipt/size
bindings without reading models. Full body verification occurs during sequential
ZIP generation and exact artifact/file inspection. The job retains one original
set; generation supplies sequential copies to the bounded writer, not a second
BackupSourceCapture/full-original clone alongside body buffers. Existing source,
control/evidence, shared I/O and retained-space limits apply; partial artifacts
remain counted, never silently deleted. Later edits remain outside the frozen job.

Only artifactVerified then optional externalFileVerified(reselectedFileV1), or
cancelled(beforeArtifact), are connected here. No baseRecorded/base advancement,
automatic promotion or restore occurs. Partial generation retries from byte zero
to a fresh sink under the same package/job/source. Acknowledged artifact loss is
repair, never regeneration. Successful generation/download is not external save.
Repeated verification checks the exact same bytes and adds no duplicate step.

The Session uses the existing Project lease, receive/output guards and original
protection checks. All three output kinds participate in discovery, kind-collision
checks and incomplete/repair exclusion. Frozen bases may gain observations later
but may not lose any frozen proof/completion/body. Backup staleness compares the
source token and whole protected inventory/base snapshot: new base observations
at unchanged heads still mean the older file does not contain current work.
List refresh uses metadata/presence inspection, not full model rehashing.

Warm generation revalidates each durable original/control/index/Start before
streaming and before recording artifactVerified. It does not replenish a lost
acknowledged input from its retained memory copy. These checks are sequential,
retain no second aggregate original set and honor cancellation before completion.

The same UI adds backup and an optional name. Pending name, composition, file
selection and cancellation keep their mutual guards; unrelated download/verification
cannot erase a new name/selection. Invalid names remain editable. The name labels
the job; download uses a safe generic backup filename and does not infer purpose.
Generation, historical selected-file confirmation and older content remain visible.

Acceptance reuses file/DOM/isolation tests: generated backup retains exact original
history/table/evidence and base-only bodies, repeated named requests are separate,
cold partial retry preserves source/name and later edits, pre-Start abandonment,
index/original/artifact loss refuses repair shortcuts, three-kind exclusion,
same-head base staleness, no model reads from listing, exact/no-op file confirmation,
and pending/IME/read-only controls. Explicit restore/continued collaboration after
restore and ordinary/device/offline adoption remain subsequent work.

#### Frozen fields and fingerprint

Use §3's canonical control encoding and existing exact nominal ID, `Heads`,
`Identity`, `MetadataEnvelope`, `Entry` and `EvidenceRef` grammars. `JobId` and
local `SinkId` use the existing collision-checked 128-bit technical-ID grammar;
neither is a filename, package ID or Project identity. `Proof` below is the closed
object `{identity,metadataEnvelope,heads}`. Arrays of references are sorted/unique
by digest with consistent lengths. Bytes required by an active operation or
retained proof cannot be missing; historical descriptors after completed handoff
have the explicitly narrower lifetime defined below.
Each row lists the complete allowed field set; unlisted fields reject.
The isolated Contribution output index and before-Start abandonment records use
the closed local variants in §8.7; they do not add a wire or job-step variant.

| Closed record | Fields / exact binding |
|---|---|
| `FrozenCapture` | `{schema:'lociview-package-capture-1', source:Proof, sourceMetadata:EvidenceRef, purpose, scope, protectedInventory:EvidenceRef, exchangeBases:EvidenceRef, base?}`. `purpose` is one of §3's five literals. `scope` is `{kind:'wholeProject'}` except review's `{kind:'scene',sceneId}`. `base` is §8.1's exact `ExchangeBaseProofDraft`, required only for Contribution. |
| Capture inventory/base bytes | `protectedInventory` binds the exact §12.2 canonical whole-Project inventory; `exchangeBases` binds the exact §4.1 canonical local table snapshot, including an explicit empty table. These are local frozen inputs, **not** permission to include them in non-backup outputs. `sourceMetadata` retains original source bytes and proves `source`; a later source/base lookup cannot replace them. |
| `PreparedOutput` | `{schema:'lociview-package-output-1', capture:EvidenceRef, packageId, manifest:EvidenceRef, payloads:Entry[], roots:{blobs:EvidenceRef[],evidence:EvidenceRef[]}}`. Manifest bytes contain exactly this package ID and the capture's purpose/scope result. Payloads are exactly the purpose's derived entries, in §7's order; do not copy arbitrary paths from a job. Roots are the derived union needed to finish/verify output and base handoff, including frozen source/evidence. They are local protection, not extra ZIP contents. |
| `JobStart` | `{schema:'lociview-package-job-start-1',jobId,operation,prepared:EvidenceRef,label?,receiver?:Proof}`. Export operation is `send | manualCheckpoint | automaticCheckpoint | reviewCopy | cleanCopy`, mapped respectively to Workspace/Contribution, backup, backup, review, clean. Import uses `receiveWorkspace`, with a prepared verified Workspace descriptor and exact receiver `Proof` in `receiver` (required only for that operation). `label` uses §3's optional label grammar, allowed only for manual checkpoint, never identity or a manifest memo. |
| Import prepared descriptor | For `receiveWorkspace`, `prepared` instead binds `{schema:'lociview-workspace-receive-1',packageId,manifest:EvidenceRef,metadata:EvidenceRef,roots:{blobs:EvidenceRef[],evidence:EvidenceRef[]}}`. Verified original Workspace bytes fix purpose/identity/envelope/declared heads/inventory. Receiver union and original apply parts still use §8's journal; this descriptor does not replace that proof. |
| Job step envelope | `{schema:'lociview-package-job-step-1',jobId,start:EvidenceRef,previous:EvidenceRef|null,detail}`. `start` binds the exact original `JobStart`; `previous` is null only for the first step. Steps are immutable, digest-addressed, write-once/read-back checked, serialized under the existing authority boundary. More than one child for a predecessor is repair, not timestamp selection. `detail` has only one of the closed rows below. |

PreparedOutput binds a completed builder's exact manifest/payload descriptors.
For review/clean, reconstruction follows §§5.1/12.1/12.6; this job table does not
make a renderer snapshot an admissible builder. Their job cannot start until
the applicable complete builder contract and validation exist. Source proof and
output identity are deliberately separate for fresh clean/review results.

Only automatic checkpoints suppress unchanged work. Their fingerprint is SHA-256
of the exact canonical object `{schema:'lociview-auto-input-1',source:Proof,
protectedInventory:EvidenceRef,exchangeBases:EvidenceRef}`. Compare it with the
input covered by the last **confirmed automatic point**, not a failed/prepared
job or the current heads alone. It excludes package/job IDs, time, UI gestures,
filename/label, output buffer layout and equivalent metadata serialization.
Same heads plus a changed protected inventory or base table must produce a new
fingerprint; a different raw metadata serialization with the same verified source
does not. Manual save never skips the user's new named checkpoint request merely
because content is equal. A browser-only fallback tracks internal resume state
separately and does not manufacture an external-point fingerprint receipt.

#### Distinct completion and handoff evidence

Every step inherits the exact start/prepared/manifest/capture binding through the
envelope; it cannot attach an observation to the currently selected Project or
another job. `archive:EvidenceRef` hashes the **entire completed ZIP**, including
control entries/container bytes, not only `payloadTotals`. Local paths and native
handles are resolved through separate authorized sink capabilities, never trusted
from an imported record. The sink profiles below are proposed protocol names,
not claims that any browser currently implements them.

| `detail.kind` | Remaining closed fields / precondition |
|---|---|
| `artifactVerified` | `{archive:EvidenceRef,location:'opfsArtifact',sinkId}` after successful close and full streamed read-back of the staged artifact, with every entry matching PreparedOutput. This is generation only. |
| `externalWriteStarted` | `{archive:EvidenceRef,sinkId,profile:'directFileV1'}` before attempting a supported direct-file sink. A matching verified staged artifact must already exist. No file success follows from this event. |
| `externalFileVerified` | `{archive:EvidenceRef,sinkId,profile:'directFileV1'|'reselectedFileV1'}` after supported direct close plus full read-back, or explicit user re-selection plus full streamed verification against the exact staged archive. Reselection is not automatic discovery by filename. This is a historical observation of those bytes, not a promise that the file still exists. |
| `workspacePublished` | `{receiver:Proof,journal:EvidenceRef,publication:EvidenceRef}` only after the exact Workspace receive journal published and original source/final union were verified. The journal/receipt must bind this package and actual receiver heads. |
| `workspaceAlreadyPresent` | `{receiver:Proof,publication:EvidenceRef}` only for a verified zero-change Workspace receive. `receiver` must equal the frozen `start.receiver`; its heads must equal the referenced publication and current durable receiver. Under one authority lock, verify source-change inclusion from that exact receiver metadata/history, required inventory from the durable body store, and append/read back this observation. Publication alone is not a body proof. Retain exact Workspace evidence; do not create an empty metadata journal or new publication. |
| `baseRecorded` | `{completion:EvidenceRef,baseRecord:EvidenceRef}` after the exact §4.1 table entry is durably committed/read back. `completion` references this job's `artifactVerified`, `workspacePublished` or `workspaceAlreadyPresent` step. A generated observation uses Workspace declared heads; an imported observation also records the exact observed receiver heads. Only Workspace generation/receive permits this step. |
| `autoPromoted` | `{verifiedFile:EvidenceRef,previousPoint:EvidenceRef|null,promotion:EvidenceRef}` only for an automatic backup, after an adopted failure-safe sink confirms replacement of the declared previous point with the exact verified new point. `verifiedFile` references this job's external verification; `promotion` is the sink's durable, independently verifiable compare/replace evidence. Profile/physical encoding and capability proof remain adoption inputs; absent support requires the approved fallback, not this event. |
| `cancelled` | Export uses `{stage:'beforeArtifact'|'beforeExternal'|'afterExternalAttempt'}` for explicit cancellation, not file deletion or rollback. A stale, unobserved `receiveWorkspace` alone may use `{stage:'beforeWorkspaceJournal'}` after explicit discard and an authority-locked check that neither its journal nor receive observation exists; this is terminal and releases its unfinished-job slot/temporary roots through the rules below. Missing/torn acknowledged evidence is not absence. Once a receive journal exists, only §8.2's cancellation/recovery rules apply. Export cancellation cannot undo verified generation or its required local base handoff. No later output write/generation/promotion may resume automatically. While the exact verified artifact remains retained, explicit file re-selection may append `externalFileVerified` with `reselectedFileV1`; required idempotent base handoff remains allowed, otherwise the cancelled job is terminal. |

Repeated recovery of a completed step validates/reuses the exact record rather
than appending another completion. A mismatched digest or alternative payload
under the same record is repair. Error text is user-facing diagnostic state, not
an arbitrary field whose presence proves failure/success. Download handoff has
no completion step: the UI says unconfirmed until explicit verification. For a
direct-file output, staging then external verification is deliberately one common
path; its temporary overlap is admitted under §12.4, not assumed free storage.

For zero-change receive, a durable `workspaceAlreadyPresent` fixes the imported
completion's receiver heads even if later local edits advance them. If a crash
left no such observation, recovery may finish it only while the durable receiver
still equals `start.receiver`, repeating the same locked inclusion/inventory
checks. A changed receiver makes this unobserved job stale, not successful and
not corrupt: retain its evidence until explicit pre-journal cancellation, then
offer a fresh receive with a new frozen start. Never record the new current heads
as the old job's observation. Once a
metadata journal exists, its exact final-publication recovery applies instead;
it cannot be converted to a zero-change observation of later state.

#### Durable transitions, crash results and root release

| Last durable evidence / interruption | Recovery and permitted next step | Root/result boundary |
|---|---|---|
| Complete capture/prepared/start; artifact writing incomplete | Retain the same frozen input. Restart its output from byte zero into a new staging artifact; never splice an old prefix or allocate a new package ID inside this job. Missing acknowledged input is repair. | Keep all job roots; no generated/base/file success. Fresh export with a new ID is a separate explicit action. |
| Sink may have closed but no `artifactVerified` | Treat generation as unknown. Existence/hash of an arbitrary file is not a receipt; retain evidence and offer the same frozen generation retry. Only an adopted independently verifiable sink receipt may close this gap. | No base completion or file acknowledgment from PreparedOutput alone. |
| `artifactVerified`; Workspace base handoff absent | Validate archive/Workspace evidence and idempotently finish §4.1's generated record, then append `baseRecorded`. Other purposes never enter this branch. | Root protection transfers only after durable read-back of the complete base/evidence record; no GC gap. UI still cannot call this external file saving. |
| External write began; verification missing or crashed | Completion is unknown. Ask for explicit file re-selection/verification, or explicit fresh output; never automatically download/write again. | Preserve artifact and previous usable auto point. Close/start callbacks cannot acknowledge file contents. |
| `externalFileVerified`; source/base changed during output | Report the exact older checkpoint as verified; keep newer work unreflected. | File evidence is not Project publication, base advancement, switching or participant acknowledgment. Manual points remain independent. |
| Workspace receive published but local observation/base step absent | Revalidate original manifest/source and the journal's exact retained publication, finish its observation and base handoff once. For zero-change receive, reuse the recorded observation, or apply the frozen-receiver rule above if no observation exists. | Old receive roots remain until durable local handoff; retry does not reapply metadata or substitute later heads. Missing acknowledged proof is repair; an unobserved stale start is not. |
| New auto file verified; promotion missing | Keep old point authoritative until adopted sink compare/replace evidence verifies success. A lost promotion receipt is unknown, never "newest file wins". | Retain both points during uncertainty. Cleanup may remove only proven superseded automatic artifacts, not manual points, bases or source bodies. |
| Complete handoff/point or explicit cancellation | Release only this job's temporary roots after checking other jobs, retained bases, current/conflict/opaque/migration roots and sink obligations. Cancellation after an external attempt discloses that an external file may exist. | No external deletion is inferred; no recursive ZIP inclusion. This design adds no GC command. Torn/conflicting receipt chains remain repair state and keep roots. |

Root lifetime is field- and state-specific, not recursive retention of every
digest ever mentioned. While generation, verification, recovery or a required
handoff is pending, its frozen input and artifact bytes remain required. Before
releasing them, validate the terminal chain and durably transfer the original
Workspace manifest/metadata plus required inventory to §4.1's retained-base
roots, and journal/source evidence to its existing owner, wherever applicable.
An externally verified file is not replaced by that local evidence. Retained
manual/current-auto observations keep their exact local control chain, start,
capture, prepared descriptor, manifest and frozen inventory/base-table controls;
missing those controls is repair. After all applicable obligations complete,
archive/payload/source-byte descriptors in that observation no longer demand an
extra staged ZIP or old body copy merely to display historical completion.
Separate base/journal/current/conflict/opaque/migration roots still protect their
required bytes. An auto promotion's `previousPoint` is a historical identity after
verified replacement, not a recursive root retaining every older auto job/file.
This permits retiring superseded auto observations without dropping manual or
base evidence. A retired artifact cannot silently resume generation or file
reselection; that needs a fresh explicit job. Historical completion never proves
current file availability or authorizes restore without reading/verifying the
actual file. Fingerprint equality likewise proves unchanged input, not an intact
external file or available permission.

Receipt-chain reads are bounded by §12.4's per-control/aggregate/depth/work limits;
the additional proposed validation-only stop is 64 steps per job, including retry
observations. Reusing an identical completion consumes no new step. At the limit,
preserve state and offer recovery, not receipt truncation. This is not a product
capacity guarantee or permission to accumulate automatic checkpoint generations.

Extend §9's existing vectors, without a new PoC: same-head/different-base fingerprint;
exact artifact versus altered control bytes; each missing/torn step; zero-change
Workspace receive with later local edits; failure between base-table commit and
step append; external close without receipt; verified old capture with newer edits;
auto promotion uncertainty and manual-point protection. Expected states are the
table above, not generated golden bytes. One independent design review must check
these fields/guards against §§4.1/7/8.2/11.4 before treating this gap as drafted;
The §12.6 product behavior is approved and its reconstruction tables consolidated;
builder execution/goldens, sink adoption and §10's measured gate remain open.

### 12.8 Same-Project restore and local storage generations

Status: technical implementation contract under the already-approved explicit
backup restoration policy; independently review each closed protocol before its
code. This is not wire/profile adoption or an implemented restore claim. The
existing practical-team F03 outcome still requires the complete UI/recovery and
continued Contribution loop, not merely a namespace helper.

Restoration is not causal merge. Retain the current working history and prepare
the backup's exact original history in a separate **local generation** of the
same Project. Project identity/proof, the logical run, and its exclusive lease
remain unchanged. Metadata, immutable facts, base evidence and package jobs use
one selected generation; old output jobs are never interpreted against the
restored base table. No old generation or checkpoint is deleted by this operation.

#### Namespace capability and mutation fencing

`openWorkspaceGeneration` binds one logical-root ProjectWorkspaceFS and an
owned storage opener to either the original namespace (`generationId: null`)
or one 32-lowercase-hex local generation. The ID is an internal restore-job ID,
not a new Project identity or proof inferred from a filename/time/hash.

- The original OPFS namespace retains its existing paths. New generations use
  `<logical-root>/v2/generations/<id>/`; metadata and package helpers derive paths
  from this scoped root without individually selecting different generations.
  `<logical-root>/v2/local-restore/` is reserved for the root controller. Original
  generation lists exclude both reserved trees; direct access to them is denied.
  Every scoped path is validated; parent segments, duplicate separators and
  cross-generation paths are not allowed.
- The original IndexedDB database and keys stay unchanged. Each new generation
  uses `<original-database-name>-generation-<id>`, including its own Repo identity.
  The same locator is passed to the storage opener and used for the FS root;
  neither browser nor catalog independently reselects a generation. The opener
  returns an already isolated database port. Repo keys are not rewritten.
  `removeRange([])` therefore affects only that one namespace, never siblings.
  A shared-database prefix/filter wrapper is deliberately not used: the current
  adapter's original `loadRange([])` would materialize sibling generations before
  filtering, and provides no bounded key-only API. Do not add such an adapter API
  or silently migrate the existing database merely to implement restoration.
- The capability retains the **same root mutation authority object**, hence the
  existing `underWriteLease` queue, rather than one queue or lock per generation.
  A scope-owned asynchronous fence runs at lease entry and before return, and
  before/after every FS and IDB operation. Thus even zero-change operations or
  identity-seeding writes cannot acknowledge a stale generation. The scope never
  invents its own selected pointer. Its internal controller-provided fence must
  validate the exact bound selection, or the exact pending staging job and input.
  A failed/missing selection rejects access; same metadata heads do not excuse a
  different generation. No permissive fallback is installed in ordinary routes.
- The fence reads the unwrapped logical root, never its own fenced filesystem.
  The opener receives explicit creation authority only for a verified staging
  job/new Project; selected cold opens always forbid creation. If selection
  changes during opening, close that connection and return no capability.
- Captured keys, bytes and arrays are owned across asynchronous checks. Lazy file
  streams/blob acquisition also recheck the fence, including before delivery and
  after reading. A retired handle cannot silently keep feeding a new editor.
  Source streams are cancelled/released on refusal. Already supplied UI drafts
  remain available to explain/recover the interruption, not editable new state.
- The namespace helper neither selects a generation nor grants restore authority.
  Until the root selector and restore job are connected, it remains internal and
  is not used to activate a new ordinary Project. A missing selected namespace is
  never initialized automatically. Existing repository exact-history and journal
  append-only checks remain unchanged.

#### Complete restore connection (required next protocol)

The root controller uses one append-only, predecessor-bound selection chain.
It binds the exact backup ZIP, confirmation's current generation/publication/
source/base snapshot, restore job and verified destination. Preparation is not
selection. Pending work retains the old display and refuses ordinary writes;
explicit cancellation preserves the old selection and all original data. An
inconsistent/missing acknowledged job or selected destination is repair state,
never fallback to an older generation, an empty Project or a demo.

The new generation starts with a dedicated `restoreBackup` journal purpose and
fullBackup proof, not a fake Workspace input. Its initial predecessor is null,
baseHeads empty and repositoryId equals the restore transaction. Exact full
original changes and original manifest/checksum/metadata/inventory/base table/
base evidence are validated. Only this new branch receives a new seal domain;
all earlier seals remain byte-identical. Recovery reuses acknowledged originals.

A restore-specific base binding ties the original historical table/evidence to
that verified initialization and publication. Do not fabricate current local
generated/imported observations. Later actual Workspace observations fold into
the restored table without losing labels/provenance, under cumulative existing
limits. All current/conflict/base-only inventory bodies must be present and
verified before selection. Existing acknowledged CAS loss requires an explicit
repair path, not an implicit `put` from the chosen backup.

The same resolver is used after the logical lease in validationHost and by the
read-only catalog; FS and IDB receive the **same** resolved locator. Warm services
stay fenced. Prepare fresh editor/residents and use the restored startup Scene,
not the former Scene's UI memory. Switch once after all verification; only then
replace the visible editor. A display failure after the committed switch offers
resume of the selected generation, not a hidden rollback. The current-file
selection and restoration impact are explicit in the existing file area.

Reuse existing tests for original Repo/FS immutability, same-head stale access,
database/range isolation, cancellation, missing/torn control records, independent cold
selection, exact restored source/bases and subsequent Contribution exchange.
No new PoC, automatic external write, GC, profile or device/offline credit.

#### Dedicated original-history initialization

The internal `MetadataProjectSession.initializeBackup(job)` consumes only the
exact staging filesystem and storage-factory pair returned by that
`BackupRestoreJob.openStaging()`. The job keeps the returned scope's check
privately (not caller-supplied refs); the filesystem alone cannot authorize an
unrelated database factory.
Before initialization/recovery it verifies the live Start/Index/DbOpened binding
and reinspects its acknowledged ZIP. A cancelled, selected, disposed, different
or original-generation capability cannot initialize. Generic Session retry cannot
resume this purpose without the owning job. No UI or ordinary route is added by
this command alone; historical-base binding and destination selection still follow.

The closed journal input is:

```ts
interface BackupRestoreBatchProof {
  version: 'lociview-package-backup-restore-1';
  source: {
    kind: 'fullBackup'; packageId: string;
    manifest: EvidenceRef; checksum: EvidenceRef; metadata: EvidenceRef;
    protectedInventory: EvidenceRef; exchangeBases: EvidenceRef;
    baseEvidence: EvidenceRef[]; // ascending unique hash, exact table union
    metadataEnvelope: MetadataProof['envelope']; remoteHeads: string[];
  };
  expectedFinalHeads: string[]; // exactly remoteHeads, not receiver union
}
interface BackupRestoreInput {
  proof: BackupRestoreBatchProof;
  bytes: Uint8Array; manifestBytes: Uint8Array; checksumBytes: Uint8Array;
  protectedInventoryBytes: Uint8Array; exchangeBasesBytes: Uint8Array;
  baseEvidenceBytes: Uint8Array[]; // same order as proof references
}
```

Own every original before an await. Validate closed keys, existing per-file and
cumulative package/source/evidence/control limits, exact manifest identity,
purpose `backup`, heads and refs. Reuse complete backup semantic inspection to
derive and compare the historical table/evidence, protected inventory, body list
and summary. Keep `fullMetadata` restricted to Team Workspace. Merge and Workspace
initialization explicitly reject fullBackup; a backup is not another merge input.

Use existing journal original paths, plus only `source-protected-inventory.json`
and `source-exchange-bases.json`. Base evidence uses `base-evidence/<hash>`.
Before `blobsVerified` and on cold recovery, rederive the full canonical original
change sequence from the retained source and compare every part byte and final
head. An internally consistent hash of an incomplete subset is insufficient.
An acknowledged missing original is an error, never refilled from memory or ZIP.

The `restoreBackup` seal uses UTF-8
`lociview:v2:backup-restore:jcs-v1\n` followed by canonical JSON of exactly the
existing change-set preimage: `{transactionId, target:{identity,
metadataEnvelope}, purpose, stagedBlobs, metadataBatch:{kind, baseHeads,
changes, version, source, expectedFinalHeads}}`. `kind`/`purpose` are
`restoreBackup`; `stagedBlobs` is the sorted explicit introduced-body delta or
empty array. Earlier initialize/local/fullMetadata/Contribution seals are unchanged.

The destination metadata namespace and Repo are initially empty. Repository ID
equals job ID. Preserve the complete original history without bootstrap, new
domain IDs or receiver rebase. Partial durable changes must be an exact subset of
these originals. After the durable acknowledgment, loss is repair state. Once
published, reentry validates initialization and returns the current history,
including subsequent legitimate edits, without another publication.

Limited GLB/PNG admission prepares original current-record content facts and all
protected body refs, including historical-base-only refs. Before the first stage,
preflight types, sizes and aggregate bounded content. New unacknowledged bodies
may be introduced; already acknowledged missing/suspect bodies require explicit
repair and are not filled from backup. Before metadata publication and reentry,
consume and verify every protected saved body, not only a presence inventory.
Profile/fact checks for the current Project stay mandatory. This is the existing
bounded GLB/PNG route, not additional profile adoption.

Reuse existing file/journal tests for actual backup initialization, old FS/DB
byte preservation, original heads/parts, wrong purpose/scope, cancelled handles,
partial recovery, generic-retry refusal, acknowledged source/body loss, base-only
body verification and published reentry preserving later edits. Historical base
authority, actual Contribution after restore, Selection and UI/cold host handoff
remain mandatory next connections, not completion claims from these tests.

#### Restored historical-base binding

The generation-local `v2/metadata/restored-bases.json` is a closed canonical
write-once record (under the same resolved Project prefix as its journal):

```ts
interface RestoredBasesBinding {
  schema: 'lociview-workspace-restored-bases-1';
  transactionId: string;
  journal: EvidenceRef;       // exact prepared restore journal
  publication: EvidenceRef;   // exact planned initial publication
  exchangeBases: EvidenceRef; // original table in the same journal
}
```

Even an empty table requires this binding. After verifying the owned restore
job, all retained journal originals, complete history and all protected saved
bodies, write/read back the binding before `published.json`. Compute the future
publication from the same transaction/digest/exact final heads; the publication
is its acknowledgment, not a second generated/imported observation. Recovery
before publication may finish an absent binding. Once published, an absent,
malformed or mismatched binding is repair state and must not be recreated.
The binding stays fixed when later edits publish. Existing non-restore seals,
publication records and local base receipts are unchanged.

Journal helpers validate this record from exact entries and originals without
calling Session.read. Session.read and destination selection consume this check;
WorkspaceBaseStore reads historical rows/evidence through it without calling
Session. No binding with no restore entry, or beside a non-restore root, grants
authority. Unpublished restored rows are never exposed as usable bases.

Read the original table directly; do not fabricate local base receipts. Keep
local imported/generated observations independently validated. Compare the base
proof excluding only `completions` and optional `label`, retain the historical
label, and fold distinct completions in canonical order for snapshot/output.
Local observation validation still requires its exact original local record.
If the same evidence is authorized historically and by a local observation,
verify both stored copies; neither may conceal loss of the other. A retained
local receipt therefore prevents fallback to the historical copy on local loss.

Apply the existing 16-base, 32-evidence, 16-MiB evidence, aggregate control,
source-inspection and dependency limits to the combined table, not separately
to restored and later local rows. Reuse source/manifest validation under shared
budgets. Receive/generate preflight checks the prospective combined table before
writing an observation; historical labels alone cannot reject a legitimate replay.
Reuse actual backup/edit/Contribution tests with preserved original table/labels,
later observations, missing binding/evidence, and unchanged old-generation bytes.
Selection and browser acceptance still follow; binding alone is not restore UI.

#### Selected-generation connection

`openWorkspaceGeneration` separates a read fence (`assertSelected`) from an
optional write fence (`assertWritable`, defaulting to the read fence for existing
callers). FS/IDB mutations, lazy write-stream pulls and `underWriteLease` check
both before and after work. A selected old generation remains readable while
its owned root has a pending restore, but ordinary writes are refused. Staging
retains the owning-pending-job guard for both reads and writes. Neither fence
grants the underlying logical Project lease.

The shared selected-generation resolver reads root controls and the actual DB
list, captures the exact Selection (or original-generation absence), opens only
an existing matching DB, and verifies the selected initialization's original
proof, binding, first publication and all protected stored bodies. It uses the
same scope for FS and Repo. No selected-state loss falls back to the original.
Catalog and host consume this resolver; a pending restore is visible before
renderer preparation. Actual destination verification never relies on URL names.

Selection consumes an owned staging FS/factory pair after initialization and
display preparation. In the unwrapped root queue, recheck current source/base
fingerprint, prior Selection, active owning job and exact verified destination.
Write/read back the existing Selection, then Result.selected. If a write's
acknowledgment fails, inspect the same retained Selection before any retry;
do not allocate another selection or undo an already committed switch. A missing
Result after a verified Selection can be completed from its exact job; loss of
an acknowledged Selection remains repair state. Repeated restore uses the
verified selected generation as its old current, not a hard-coded original.
Until Result.selected is verified, ordinary writes and a new restore are refused;
read-only catalog inspection reports incomplete and never supplies that Result.

The host retains one logical lease while disposing/replacing generation-local
services. Prepare destination residents first, then commit Selection and mount a
fresh editor using selected capabilities and the restored startup Scene. Staging
capabilities expire at Selection. A post-switch display failure retains a
selected-data resume action, never implicit rollback. Existing file controls
own confirmation/cancel/retry and IME/draft guards; no new page or ordinary-home
activation. Reuse file/host tests for two restores, pending read/write separation,
cancel, pre/post-switch failure, cold restart and continued Contribution.

#### Root restore job and selection control records

The next implementation consumes the generation capability. Its controller owns
the unwrapped logical root and the existing Project lease. Under
`v2/local-restore/`, use only `jobs/<id>/{input.zip,prepared.json,start.json,
db-opened.json,result.json,abandoned.json}`, `index/<id>.json`, and
`selections/<sha256>.json`. IDs are 32 lowercase hex; references are the existing
closed `{sha256,byteLength}` EvidenceRef. All JSON is canonical and write-once.
Use existing package per-control/aggregate-control/entry/archive/source/heads/
base-evidence/inspection limits, cumulatively; no new product capacity promise.
Before the first write, reserve the input plus the complete control lifecycle,
including DbOpened, Selection and the largest terminal Result. Count existing
logical-root files plus those future entries consistently against the entry
limit. Retained files, input ZIP and control headroom share the existing local
working-space ceiling (2_147_483_648 minus 16_777_216 bytes); inspect file sizes,
not body contents. Each subsequent control append rechecks admission before write.

Closed records (no implicit optional fields):

```ts
type RestoreCurrent = {
  generationId: string | null;
  publicationId: string;
  publication: EvidenceRef;
  source: { proof: MetadataProof; heads: string[]; token: string };
  bases: EvidenceRef; // canonical WorkspaceBaseStore snapshot, not its ZIP
};
type RestorePrepared = {
  schema: 'lociview-local-restore-prepared-1'; jobId: string;
  archive: EvidenceRef; manifest: EvidenceRef; metadata: EvidenceRef;
  protectedInventory: EvidenceRef; exchangeBases: EvidenceRef;
  baseEvidence: EvidenceRef[]; // sorted/deduplicated original evidence
};
type RestoreStart = {
  schema: 'lociview-local-restore-start-1'; jobId: string;
  prepared: EvidenceRef; previousSelection: EvidenceRef | null;
  current: RestoreCurrent;
};
type RestoreIndex = {
  schema: 'lociview-local-restore-index-1'; jobId: string; start: EvidenceRef;
};
type RestoreDbOpened = {
  schema: 'lociview-local-restore-db-opened-1'; jobId: string;
  start: EvidenceRef; generationId: string; // exactly jobId
};
type GenerationSelection = {
  schema: 'lociview-local-generation-selection-1'; previous: EvidenceRef | null;
  jobId: string; start: EvidenceRef;
  destination: { journal: EvidenceRef; publication: EvidenceRef; baseBinding: EvidenceRef };
};
type RestoreResult = {
  schema: 'lociview-local-restore-result-1'; jobId: string; start: EvidenceRef;
  detail: { kind: 'selected'; selection: EvidenceRef }
    | { kind: 'cancelled'; stage: 'beforeSelection' }
    | { kind: 'cancelled'; stage: 'beforeInitializationWithoutIndex' };
};
type RestoreAbandoned = {
  schema: 'lociview-local-restore-abandoned-1'; jobId: string; stage: 'beforeStart';
};
```

Preflight owns an immutable slice of the selected Blob and runs BackupArchive
inspection. Capture current source from an independent ready Session read, exact
publication receipt and verified base snapshot; validate source identity against
the backup. Before the first job write, under the logical-root queue, require the
same selected generation/publication/source/base fingerprint and no unfinished
input/output/restore operation. A stale confirmation requires fresh confirmation;
never silently change its replacement target.

Write Prepared, own `input.zip`, close/reinspect its exact bytes, then write/read
back Start followed by Index. Start is the durable pending-work boundary; only
after Index readback can destination initialization begin. Partial pre-Start
input is not a prepared restoration: preserve it and offer explicit abandonment,
then a new confirmed job. Do not automatically splice a partial ZIP or replace
acknowledged input from memory. Opening a started job rechecks the complete owned
archive and descriptor; lost/corrupt acknowledged originals remain repair.

Successful DB opening is recorded in `db-opened.json` before any destination
Repo identity/journal/facts/base initialization. Only the first warm start has a
nonpersistent permit for `allowCreate:true`. All cold retries use `false`:
an existing compatible empty DB may finish the same DbOpened handoff; absence
cannot distinguish never-created from lost and requires explicit cancellation
and a fresh job (or repair), not recreation. Destination evidence without its
acknowledged DbOpened is repair. No empty or older fallback on selected cold open.

After dedicated initialization, base binding, full protected inventory and editor
preparation verify, recheck the Start current fingerprint and append/read back
one Selection. This is the sole switch point. Append/read back Result.selected
before reporting restoration complete. If Result or display fails afterward,
keep the new generation selected and resume that handoff; never recreate a
Selection, roll back, or merge into the former generation. The exact destination
validation contract below must be implemented before issuing a Selection.

Ordinary cancellation is explicit, retains every generation/original, and requires
no Selection for this job. A Start with missing Index is never silently repaired.
The one bounded recovery exception is explicit
`beforeInitializationWithoutIndex` cancellation: valid existing Start, no Index,
DbOpened, destination FS files/DB, Selection or selected Result. Successful
noncreating namespace probes must prove absence; probe errors are not absence.
This cancellation writes only its fixed Result, leaves selection unchanged and
cannot later resume. Any destination evidence with a missing Index is repair.
Pre-Start abandonment similarly requires no Start/Index/DB/destination/selection;
its fixed job-ID record allows discarding an unusable pending input without
deleting or trusting malformed input bytes.

Lightweight selection/fence inspection validates paths, closed control records,
references and cumulative control budgets, not every ZIP/model byte or historical
Repo on every chunk. Scan one complete predecessor chain; reject branches,
missing predecessors, unreachable selections, duplicate job selection and Result
references to missing selections. Current selection is the chain tail even if
its Result handoff is pending. Unfinished Start never changes selection, but
blocks ordinary writes. Staging is bound to the exact pending Start/job/input
and expires on cancellation/selection. Start's old source fingerprint is not
compared on every ordinary operation after restoration; later edits are valid.

Each generation FS subtree must belong to a known started/cancelled/selected job.
Cold host resolution and new restore start also reconcile generation DB names;
an unknown DB, failed enumeration or missing selected namespace is not an empty
Project. Selected destination receipts must remain present and match the fixed
Selection references. Full source/base/body checks occur on job open, before
switch and ordinary cold reopen, not on each lazy chunk fence. A consistent
erasure of every witness in the same storage cannot be universally detected;
do not claim such a guarantee. No implicit old-generation fallback is authorized.

Required existing-file cases: unchanged current confirmation versus same-head
base changes; corrupted input; interruption before/after each start/switch
handoff; missing Index/Start/Result/selected tail; explicit pre-initialization
cancellation with failed/positive namespace probes; two local generations with
unchanged Project identity; independent cold selection; exact original recovery
and Contribution after restoration. No new probe page or production activation.

Current bounded implementation: `backupRestoreJob.ts` owns the inspected ZIP and
confirmation, Start/Index and acknowledged DB handoff; the dedicated Session
initializer preserves original history and binds historical bases before first
publication. The job verifies destination source/base/body evidence before its
single Selection/Result handoff. `restoreControls.ts` remains structural control
validation, not destination authority; lazy fences do not reread whole ZIPs.
The opt-in GLB/PNG validation host/catalog resolve the selected generation under
one logical lease. Explicit restore confirmation/retry/cancel and fresh display
handoff are connected in the existing file area; retired content reads are
checked before work and after decode, and host-owned recovery does not expose an
unusable generic edit retry. Restored edits and Contribution use that same selected
service. Executed checks and remaining browser/device evidence are recorded only
in `tasks/todo.md`; this is not ordinary-route activation, adoption or release.
