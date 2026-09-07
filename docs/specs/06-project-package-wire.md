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
      metadata: Entry; protectedInventory: Entry; exchangeBases: Entry }
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
  observation: 'imported' | 'generated';
  label?: string;
}
```

A table keys these records by Project identity/epoch plus Workspace package ID.
Different manifest/heads under the same key are an integrity issue, never last-
writer-wins. `observation` describes the local event, not who received a file.
An imported Workspace records its declared heads after verified publication,
not the result of merging with local work. A generated Workspace records its
declared heads only after the export sink finishes successfully. Contribution
import/export never advances or synthesizes this record. Selecting another
retained base is explicit; neither most recent filename nor current heads select it.

Proposed base-table update uses one idempotent local completion record bound to
package ID, manifest digest and heads. A crash may delay the base-table update,
but must not invent it or hide it as saved: resume the same verified update before
advertising that base for export. Export completion does not prove delivery.
Exact platform persistence/publication integration remains an S2 gate input.
A missing/stale record offers a new Team Workspace, not a reconstructed base.

Only backup includes the table, under the proposed `exchange-bases.json` entry,
with records sorted by identity/epoch/package ID. Backup also includes any exact
Workspace receipt/inventory evidence needed to verify those bases; defining its
bounded closed shape is required by section 10, not replaced by these hashes.
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
| nonvisual owner | `kind: 'nonvisualOwner'`, `id`, `assetFrameId`, `assetToProject` only; no label, binding/revision, compatibility list or payload |
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
All references/frame equalities, nominal ID ownership and tuple uniqueness are
validated after re-keying. A compatibility ID belongs to exactly one Asset;
absence from its own visual Asset's active list is valid `needsReview`, not a
reason to select another class. Suppression for a nonvisual owner is structural,
not a fabricated compatibility result.

Exactly one active source Scene is chosen explicitly. Include all its active
memberships, included Caption media/tag closure, active views and applicable
material intent. No search, pin-color filter, temporary hide/isolate, free camera
or window state changes export scope. A nonvisual owner exists only to preserve
an included Caption's AssetFrame anchor when that Asset has no Scene membership.
Its authoritative transform comes from the source binding; unavailable/conflicted
transform blocks export. It creates neither Scene Asset membership nor a
Representation entry, and its marker/connector remain suppressed. The review
discloses that this owner's model is not included; it must not offer an enabled
`モデルを表示` action that cannot succeed from this package.

Every included field/closure must be authoritative. The only omission exception
is a conflicted optional entry view after explicit `開始視点なし` preflight and
confirmation. Do not omit another conflicted Saved View, material, membership or
Caption, and do not turn a required conflict into a placeholder in the exported
bytes. Unrelated Project/Scene conflicts do not block the selected closure.

The exact one-Scene review-to-clean builder is a remaining ratification input:
it must preserve a nonvisual owner without inventing model bytes, source revision
identity, active compatibility or a merge relation. Until that mapping is fixed
and tested, this proposed snapshot cannot be treated as an implemented edit path.

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
next, backup inventory/base entries next, and blobs last in digest order. Fixed
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

One consistent durable head set plus protected package roots lasts until export
sink completion or cancellation. Concurrent edits belong to the next export.
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

## 8. Explicit unresolved journal adaptation

02 §8 currently requires exact `source-metadata.am`, its own hash/length, source
envelope/root/heads, original ordinal changes and final-head verification. A
Contribution has no self-contained original `metadata.am`. It is invalid to hash
the delta as a full document or attach the package's digest to reserialized bytes.

Proposed amendment: retain the original verified package manifest/checksum and
every exact delta part, plus a separately identified reconstruction receipt bound
to the verified local base identity/root/frontier and pinned adapter. Construct a
detached source view at the declared target heads; any saved reconstructed bytes
have their own hash/length and explicit derived provenance. They are not claimed
to be the sender's original metadata entry. The journal's receiver `baseHeads`
remain the receiver's durable published heads, distinct from exchange-base heads.

Before `blobsVerified`, revalidate the original wire delta against the exchange
base and prove that the journal's missing-original-change list is exactly what
the receiver lacks. Recovery must reproduce that proof, source target frontier
and expected final union while preserving original changes. Tamper, lost required
base/part or post-acknowledgement data loss requires read-only repair, never a
new change or a silent replay that hides lost acknowledged storage.

This is a proposed compatibility amendment, not permission to change 02 §8.
Its exact closed receipt/source union, retained base evidence, budgets and
interruption vectors must be ratified together. The existing full-source journal
and its executed proofs remain unchanged. S2 Contribution import is blocked
until this interface is settled and proved.

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

## 10. Remaining ratification inputs and stop boundary

The proposal is reviewable, not yet an executable wire contract. Resolve these
three grouped inputs once; do not grow another isolated browser page or treat a
new documentation checkpoint as a technology gate pass.

1. **Exact wire/profile:** choose the format/version and adapter identifier,
   ZIP/ZIP64/compression/sink profile, summary classifier, complete backup
   inventory/base-evidence shapes and golden byte manifest. Fix metadata/change/
   manifest/archive/entry/ratio/count/depth/head/base-record/output-working-space
   budgets from measured Desktop/iOS evidence. Existing semantic ceilings apply;
   the much smaller PoC limits are not product limits.
2. **Delta-to-journal and base completion:** ratify section 8's source/receipt
   amendment and section 4.1's durable base update with exact recovery vectors.
   Keep original wire bytes, derived validation bytes and receiver publication
   distinct; require sufficient pinned base evidence rather than a bare hash.
3. **History-free builder:** pin the complete nested copy/omit policy and one-Scene
   review-to-clean mapping, including nonvisual owner/`needsReview` preservation;
   prove deterministic class/ID remapping and privacy on the exact schema.

Independent review may correct this draft but cannot approve it for the Product
Owner. After these inputs and explicit ratification, S2 still depends on the
metadata/CAS gates and separately ratified migration/Native-bridge companion.
No production reader/writer, current UI connection, dependency adoption, release,
Pages, Service Worker, media expansion or performance guarantee is authorized.
