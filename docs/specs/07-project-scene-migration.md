# ProjectScene migration and Native bridge companion

> `PROPOSED / UNRATIFIED / NOT IMPLEMENTED` — 2026-09-10.
> Design authorized by 05 §9; unplaced preservation approved in 05 §9.4.
> This draft neither enables conversion nor amends a frozen recipe, Native file,
> accepted membership endpoint rule, dependency or storage/journal implementation.

## 1. Purpose and exact boundary

Convert a source once without losing its records, then let a verified late Native
collaboration file contribute its supported edits without erasing subsequent v2
work. One canonical converted Project supplies the team; independent conversions
do not establish a common history even when deterministic resource IDs match.

Authority: [05 §§9–10](05-project-scene-team-workflow.md),
[02 §§3.2/4/8/11](02-storage-package-migration.md),
[04 §§3–5](04-locimyu-conversion.md) and the proposed
[06 wire/recovery companion](06-project-package-wire.md). Native source behavior
is evidenced by `src/nativeGs/schema.ts`, `captionThreeWayMerge.ts`,
`packageSnapshots.ts` and `packageExchange.ts` at `b1b36bd`. These references pin
observed input semantics, not an adopted v2 model inspector.

This slice defines identity bytes, mapping units and portable evidence structure.
It also records two necessary adapter amendments: atomic guards for source arrays
expanded into records, and shared deterministic introduction/change artifacts.
Their exact adapter bytes and journal activation still require §10's gates. A
documented algorithm is not evidence that current admission/provider/storage can
execute it. No new UI, source reassignment, automatic winner or media support.

## 2. Descriptor and canonical functions

The proposed new descriptor is closed:

```ts
interface ProjectSceneRecipeDraft {
  schema: 'lociview-project-scene-migration-recipe-descriptor-1';
  recipeId: 'v1-project-scene-migration-recipe-1';
  specificationSha256: Sha256Hex;
  goldenManifestSha256: Sha256Hex;
  sourceCanonicalizer: 'legacy-jcs-v1';
  targetCanonicalizer: 'loci-canonical-json-v1';
  immutableBuilder: 'lociview-project-scene-immutable-builder-1';
}
```

Define `H(label, value) = SHA256(ASCII("lociview:v2:project-scene:" + label +
":jcs-v1\n") || JCS(value))`. Each call below fixes its own label and closed value.
`descriptorDigest = H("recipe-descriptor", descriptor)`. Do not insert invented
specification/golden hashes: they hash the exact frozen UTF-8 recipe bytes and
canonical whole-output golden manifest when ratified. Editorial changes after
ratification live separately. One recipe ID binds one descriptor forever; changed
mapping/inspection/default/ordering semantics require a new recipe ID.

`JCS` is 02's target canonical encoder, including its NFC/value checks.
`LegacyJcsV1` preserves raw decoded Unicode scalars; it is NOT target JCS.
`rawKeyDigest = SHA256(ASCII("lociview:v2:project-scene:source-key:legacy-jcs-v1\n")
|| LegacyJcsV1(sourceKey))`. Retain those exact key bytes, full digest and source
domain in the registry. This prevents NFC display conversion from collapsing
distinct source keys. No OS paths, timestamps, random IDs or concatenated labels
are substituted into a source key. Source ID evidence is not proof of a person.

## 3. Source identity and deterministic output IDs

All admitted containers retain exact outer-byte digest/length in a source receipt.
Container signature/content selects the source reader, not filename/extension.
Nested package paths and raw input remain untrusted under 02 §10.

`sourceIdentity` is exactly one of:

```ts
type SourceIdentityDraft =
  | { kind: 'frozenV1'; legacyLineageKey: Sha256Hex }
  | { kind: 'nativeSnapshot1'; projectId: NativeProjectId;
      baseline: { kind: 'fixed'; baselineId: Sha256Hex;
        unsupportedStateSha256: Sha256Hex }
        | { kind: 'isolated'; sourceRoot: {sha256: Sha256Hex; byteLength: number} } }
  | { kind: 'lociMyu'; sourceRoot: {sha256: Sha256Hex; byteLength: number} };
```

`sourceIdentityDigest = H("source-identity", sourceIdentity)`. Frozen v1 uses
the exact accepted project-ID/source-root selection and explicit decisions in
02 §3.2; this new outer domain prevents accidental Native/v1 equivalence. Native
fixed identity is admitted only after recomputing the old baseline and unsupported
digests with the frozen Native algorithms, not a new JCS replacement. Native
isolated and LociMyu source roots name the initially selected exact source; they
do not enable later-copy lineage inference. A ZIP repack is not a new fixed Native
baseline, but is a different isolated source unless an approved relation exists.

LociMyu sheet authority/trim/occurrence is exactly 04 §3. Store its frozen
`locimyu-caption-id-2` identity key, full digest and uppercase source Caption ID.
A confirmed view/material GID relation never changes that key. Converting a
previously saved Native result instead uses its Native IDs; do not pretend the
missing original LociMyu preimage can be recovered from its shortened ID.

For every deterministic output:

```text
preimage = ASCII("lociview:v2:project-scene:migration-id:" + kind + ":jcs-v1\n")
  || JCS({"sourceIdentityDigest": sourceIdentityDigest,
          "recipeId": "v1-project-scene-migration-recipe-1",
          "kind": kind, "key": key})
fullDigest = SHA256(preimage)
portableId = prefix + "_" + first 32 lowercase hex characters of fullDigest
```

Register exact preimage bytes (unpadded base64url), full digest, kind and ID.
Reuse requires all to agree. Different keys sharing a full digest or truncated ID
abort before publication; no salt, re-numbering, case repair or first-wins.
Project ID, history epoch, lineage seed and migration-case ID remain fresh CSPRNG
values outside this function. A mapped ProjectFrame may be deterministic; the
new Project/history identity may not. Same source plus decisions produces the same
semantic mapping, not the same independently created repository envelope.

### 3.1 Closed source keys

`SourceRef` below is the registered full `rawKeyDigest`, not an unchecked string.
Every referenced key must be present and reproduce its digest from exact bytes.

| Source family | Closed `sourceKey` alternatives |
|---|---|
| Frozen v1 | `{kind:'frozenEntity', entityKind, entityId}` with accepted known kinds/ID grammar; immutable support/attachment/tag source keys use the exact input-field definitions of 02 §3.2, under this new recipe/domain |
| Native | `{kind:'nativeRecord', recordKind, id}`; recordKind is exactly `asset`, `binding`, `revision`, `representation`, `frame`, `family`, `compatibility`, `caption`, `media`, `displaySet`, `view` or `material`; ID uses that Native kind's frozen grammar |
| LociMyu Caption | `{kind:'lociMyuCaption', identityKey, sourceCaptionId, identityFullDigest}`; recompute all three under 04 §3 |
| LociMyu sheet | `{kind:'lociMyuSheet', sheetIdentity}` using the exact admitted identity, not active tab, order or a confirmed replacement GID |
| LociMyu model/media | `{kind:'lociMyuEntry', role:'model'|'media', entryPathRawUtf8Sha256}`; digest the exact validated archive-logical path; duplicate/ambiguous entries never acquire a winner |
| LociMyu view/material row | `{kind:'lociMyuRow', role:'view'|'material', sheetKey:SourceRef, rowOrdinal, rowValueDigest}`; ordinal is accepted decoder data-row encounter order and value digest covers exact LegacyJcsV1 row values. This is one-source repeat identity, not later-workbook matching |

Native default DisplaySet uses the exact effective helper value, including the
documented fallback source ID. Native ID prefixes such as `cls_` or `mat_` do not
become v2 prefixes by substitution. Source records must be unique and coherent
with their owners; sharing a frame ID across incompatible owners is an issue,
not permission to mint a new frame silently.

### 3.2 Closed output kind/key table

The following table replaces, not extends, the old output-kind table. An invalid
kind/key/prefix combination rejects. `inspectionDigest` is the canonical validated
content inspection bound to the exact bytes/profile; §10 must pin its schema.

| `kind` / prefix | Allowed `key` shape |
|---|---|
| `frame` / `frm` | `{role:'projectFrame'}`; `{role:'assetFrame', asset:SourceRef}`; or `{role:'sourceFrame', source:SourceRef}` |
| `asset` / `ast` | `{role:'sourceRecord', source:SourceRef}` |
| `asset-binding` / `bnd` | `{role:'binding', asset:SourceRef, source:SourceRef, alignmentDigest, revisionFullDigest}` |
| `asset-revision` / `rev` | `{role:'revision', asset:SourceRef, source:SourceRef, inspectionDigest}` |
| `representation` / `rep` | `{role:'representation', asset:SourceRef, source:SourceRef, inspectionDigest, contribution}` |
| `variant-family` / `fam` | `{role:'family', asset:SourceRef, source:SourceRef, contribution}` |
| `material-layout` / `lay` | `{role:'layout', representationFullDigest, inspectionDigest}` |
| `material-slot` / `slot` | `{role:'slot', layoutFullDigest, materialKeyRawUtf8Sha256}` |
| `anchor-compatibility` / `cmp` | `{role:'compatibility', asset:SourceRef, source:SourceRef}` or frozen-v1 missing-source compatibility key with the exact 02 restrictions |
| `composite-group` / `grp` | `{role:'composite', asset:SourceRef, sourceGroupRawUtf8Sha256}` |
| `caption` / `cap` | `{role:'sourceRecord', source:SourceRef}` |
| `scene` / `scn` | `{role:'sourceScene', source:SourceRef}` or `{role:'fallbackScene'}` |
| `scene-asset-membership` / `sam` | `{role:'sceneAsset', sceneFullDigest, assetFullDigest}` |
| `scene-caption-membership` / `scm` | `{role:'sceneCaption', sceneFullDigest, captionFullDigest}` |
| `attachment` / `att` | Native `{role:'nativeAttachment', caption:SourceRef, media:SourceRef}`; LociMyu `{role:'lociMyuAttachment', caption:SourceRef, media:SourceRef}`; frozen v1 uses 02's exact operation/occurrence key |
| `media-resource` / `med` | `{role:'media', source:SourceRef, mediaRevisionDigest}` |
| `tag` / `tag` | `{role:'tag', labelNfc, labelRawUtf8Sha256}` |
| `tag-membership` / `tgm` | `{role:'captionTag', captionFullDigest, tagFullDigest}` |
| `view` / `view` | `{role:'sourceRecord', source:SourceRef}` |
| `override` / `ovr` | `{role:'material', source:SourceRef, representationFullDigest, slotFullDigest}` |
| `lifecycle-event` / `evt` | `{role:'lifecycle', targetKind, targetFullDigest, previousEventId:null|LifecycleEventId, state, reason, transitionEvidenceDigest}` |
| `migration-issue` / `iss` | `{role:'issue', sourceReceiptDigest, issueKind, sourceKey:SourceRef}` |

For baseline-absent **late Native** Caption/media births only, the corresponding
kind also permits `{role:'lateNativeBirth', source:SourceRef, birthValueDigest}`.
Existing-baseline keys never change. Child attachments for those targets use
`{role:'lateNativeAttachment', captionFullDigest, mediaFullDigest}`; Scene edges
already use actual endpoint full digests. This prevents distinct birth candidates
from sharing a child identity. The birth digest is the exact whole admitted
source-entity value under §7.1, not a guess at creation time or causal succession.

For unchanged frozen-v1 immutable input-key families, 02's closed structured keys
are an additional explicitly labelled `{role:'frozenKey', value: ...}` branch of
the corresponding kind, excluding `display-set` and all old lifecycle outputs.
They still use this new recipe/domain and new registered references throughout.
No old output ID, DisplaySet object or descriptor is admitted as a new result.

`contribution` is exactly `mesh`, `points`, `gs` or `proxy` when the ratified
inspector supports that path, not an adoption of additional formats. Existing
Native immutable IDs retain logical distinctions even when blob hashes match.
Model/media bytes stay unchanged; canonical target immutable records receive
their ordinary 02 payload digests only after all typed IDs are mapped. Logical
identity hashes are never used as CAS/body/immutable-record digests.

Initial active lifecycle uses `previousEventId:null`, `state:'active'`,
`reason:'initial'`. Its evidence is `H('initial', {sourceIdentityDigest, recipeId,
targetKind, targetFullDigest})`; this new recipe explicitly allows generated
Scene, membership, attachment and tag records, not just the old fallback set.
Deleted/restored and later changed lifecycle retains 02's reason/previous-event
rules with evidence from the accepted operation or explicit mapping decision.
No new event for unchanged visibility. Import time/actor are never event-ID keys.

## 4. Conversion mapping and omissions

| Input | Effective output / no-guess rule |
|---|---|
| Native DisplaySets | One Scene per effective set; exact name/order/default-view relation. Active effective set becomes initial Project default, never an ongoing shared UI selection |
| Native visual models | Whole Project assets retained. Exact effective visible Asset set becomes each Scene's Asset membership; hidden assets stay resources. A partial kind filter not expressible as whole-Asset membership blocks with an issue |
| Native Caption | Project Caption plus its exact Scene membership; title/body/color/tags/media preserved. Owner+anchor maps as one value under 05 §9.4; invalid authority is not ordinary unplaced |
| Native views/materials | Exact Scene/routing/Representation/slot mapping. No material-name guessing; unavailable target/profile/slot keeps source and reports blocked mapping |
| LociMyu | Exact admitted sheet→Scene, unique admitted source model→Asset in each Scene, source Caption/media/view/material relations per 04. Retain source ID/full identity evidence, not Native allocator results |
| Frozen v1 | Consume frozen operations directly, including explicit divergent-key resolution. Set→Scene and exact known Caption/view/material relations; preserve source-less fallback semantics through the new recipe |
| Supported payload | Reuse verified immutable bytes or stream exact copy. No re-encoding to fit a profile; inventory/report unavailable, unsupported and intentionally unlinked bytes separately |

Effective Native values are the frozen helpers' owner (explicit or anchor owner),
DisplaySet fallback, absent color `#eab308`, absent tags/attachments `[]`. Do not
confuse parse-time validation defaults with these user-visible merge defaults.
Target text/color/transform normalization follows its field-specific canonical
rule and preserves raw evidence; an over-limit or unsupported value is an issue,
not truncation. Native `pinScale` has no ratified v2 resource mapping in this
companion: inventory it as a presentation omission requiring a declared mapping
before lossless activation, not a silently dropped value.

Native ordered attachments contain unique media IDs. A Caption/media relation
retains its registered attachment ID through reorder; source order initializes
order keys without using current array position as identity. v2 altText and
independently added attachments/Scene memberships never become source-owned.
Frozen-v1 duplicate attachments keep 02 §11's separate occurrence/baseline review
rules. No attempt to match unrelated photos by filename, hash or nearby content.

## 5. Portable case, baseline and registration

Proposed new optional ProjectDoc root member: `projectSceneMigrationSupport`.
It is a known typed technical subtree, separate from closed `migrationSupport`.
Adding it requires schema/admission/provider/retention amendments before use.
All objects below are closed; maps are keyed by the exact nested ID/digest.

```ts
interface ProjectSceneMigrationSupportDraft {
  schema: 'lociview-project-scene-migration-support-1';
  casesById: Record<MigrationCaseId, MigrationCaseDraft>;
}
interface MigrationCaseDraft {
  id: MigrationCaseId;
  recipe: ProjectSceneRecipeDraft;
  sourceIdentity: SourceIdentityDraft;
  sourceKeysByDigest: Record<Sha256Hex, {digest:Sha256Hex; canonicalBytesBase64Url:string}>;
  idsByPortableId: Record<string, {portableId:string; kind:string;
    fullDigest:Sha256Hex; preimageBase64Url:string}>;
  sourcesByDigest: Record<Sha256Hex, SourceReceiptDraft>;
  baseline?: NativeBridgeBaselineDraft;
  bridgePlansByDigest: Record<Sha256Hex, BridgePlanDraft>;
  managedUnitsByKey: Record<Sha256Hex, ManagedUnitDraft>;
  birthGroupsByKey: Record<Sha256Hex, BirthGroupDraft>;
}
interface SourceReceiptDraft {
  digest: Sha256Hex;
  container: {sha256:Sha256Hex; byteLength:number};
  kind: 'frozenV1'|'nativeSnapshot1'|'lociMyu'|'nativeCollaboration';
  semanticInputDigest: Sha256Hex;
  evidence: BlobRef; // closed source projection, not a raw ZIP/report dump
}
interface NativeBridgeBaselineDraft {
  sourceProjectId: NativeProjectId;
  baselineId: Sha256Hex;
  unsupportedStateSha256: Sha256Hex;
  sourceEvidence: BlobRef;
  mappedAncestor: {identity:Identity; metadataEnvelope:MetadataEnvelope;
    heads:Heads; metadata:BlobRef};
  mappingBaseline: BlobRef;
}
interface BridgePlanDraft {
  digest: Sha256Hex;
  semanticInputDigest: Sha256Hex;
  mappingDigest: Sha256Hex;
  artifact: BlobRef;
}
type ManagedUnitDraft = {key:Sha256Hex; captionId:CaptionId} & (
  | {kind:'nativePrimaryScene'; membersById:Record<SceneCaptionMembershipId,
      {id:SceneCaptionMembershipId; sceneId:SceneId; captionId:CaptionId}>;
      value:{kind:'none'}|{kind:'selected'; membershipId:SceneCaptionMembershipId} }
  | {kind:'nativeAttachments'; membersById:Record<CaptionAttachmentId,
      {id:CaptionAttachmentId; captionId:CaptionId; mediaResourceId:MediaResourceId}>;
      value:CaptionAttachmentId[]}
);
interface BirthGroupDraft {
  key: Sha256Hex;
  sourceKey: Sha256Hex;
  entityKind: 'caption'|'media';
  proposalsByDigest: Record<Sha256Hex, {digest:Sha256Hex;
    birthValueDigest:Sha256Hex; targetId:CaptionId|MediaResourceId;
    sourceValue:BlobRef; introduction:BlobRef}>;
  selection: {kind:'unselected'}|{kind:'selected'; proposalDigest:Sha256Hex};
}
```

`SourceReceipt.digest = H('source-receipt', receipt without digest)`;
`BridgePlan.digest = H('bridge-plan', plan without digest)`. Values referencing
another blob include exact digest/length/mediaType. ID registration `kind` is the
closed §3.2 token, not extensible text. Case identity/recipe/baseline are immutable;
registrations, receipts and plans append only. A duplicate digest with another
decoded value quarantines that import; never overwrite a prior record.

The closed baseline source-evidence blob contains `{schema, nativeBaseline,
unsupportedSnapshot}`. `nativeBaseline` is the exact frozen typed baseline value;
`unsupportedSnapshot` is the frozen canonical envelope used by
`nativeUnsupportedStateSha256V1`. Recompute both old digests with the Native
serializer/algorithms; separately verify this new blob's own canonical digest.
This source-evidence blob uses `LegacyJcsV1` so raw non-NFC scalar values survive;
it is not a target-NFC object embedded directly in ProjectDoc.
Retain original parsed scalar values required for that proof, not NFC substitutes.
This carries old Caption/media baseline content and is disclosed as team history;
do not pretend it is anonymous. Raw source ZIPs/reports remain with the user under
04 §5 and are not indiscriminately embedded in the shared subtree.

The closed mapping-baseline blob is `{schema, units, sourceOwnedAttachments,
sourceOwnedMemberships}`. Each unit is `{sourceKey, unit, targetIds,
sourceValueDigest, targetValueDigest}`; units sort by sourceKey then unit, IDs use
sorted order except the explicitly ordered attachment sequence. The `unit` enum
is exactly `existence`, `title`, `body`, `color`, `placement`, `primaryScene`,
`attachments`, `tags`, `media`. Values use tagged `{present:false}` or
`{present:true,value}` before source `LegacyJcsV1`/target JCS hashing with distinct
`...:baseline-source:legacy-jcs-v1\n` / `...:baseline-target:jcs-v1\n` domains.
`sourceOwnedAttachments` maps source Caption ref to ordered
`{attachmentId, mediaSourceKey}` entries; `sourceOwnedMemberships` maps it to its
initial primary membership ID. No currently edited v2 value refreshes this baseline.

Map the fixed Native baseline to a verified v2 ancestor BEFORE mapping the selected
Native snapshot's post-baseline changes. Its metadata contains the mapped baseline
Project but not its own head proof/bridge registration. A later metadata change
installs the registration. This prevents a self-containing head/hash cycle and
keeps the initial selected snapshot's local edits distinct from the common base.
Independently converting another Native copy creates a different v2 bootstrap;
use the team's converted Workspace instead of comparing resource IDs to merge it.

That later registration is a fixed **foundation** change depending only on the
mapped baseline. It creates the complete case/registry and baseline managed-unit
records, but includes no post-baseline coordinator edits and does not contain its
own hash. Portable artifact envelopes refer to its verified `foundationHeads`
and metadata afterward; a raw SourceReceipt does not carry foundation identity.
All group/introduction/unit changes depend on that foundation as well
as their required introductions, never on whichever first edited Native copy was
converted. The foundation metadata/parts are retained with the ancestor proof.

The `baseline` branch above is deliberately Native-only. Frozen-v1 later-copy
continuity still needs its own new-recipe accepted-mapping/plan variant preserving
02 §3.2/§11's decisions and attachment sequences. Do not put its evidence into
`NativeBridgeBaselineDraft`, or reuse the old closed recipe support with new
Scene IDs. Until that variant is specified and ratified, this draft covers only
initial frozen-v1 mapping and the proposed late Native bridge, not full later-v1
conversion support.

## 6. Late Native input and source atomicity

Only the frozen Native `collaboration` purpose with exact verified Project ID,
baseline ID, unsupported-state digest and complete source evidence enters this
bridge. Revalidate baseline media and referenced new supported media bytes.
Validate the complete declared Native binary set, lengths and hashes even for a
semantic no-op; package inspection alone is not that verification. Match the old
unsupported-state proof to the registered Native baseline, never to the current
v2 model state (which may legitimately have newer models).
Model/presentation changes, changed baseline media, unsupported tags, ambiguous
source authority or unequal baseline fail without publication. It is not a v2
Contribution, a model update channel or an extension of Native's merge scope.

Compute the canonical semantic input from `{sourceIdentityDigest, baselineId,
captions, mediaResources}`: captions sort by exact source ID; each contains the
effective closed Native fields listed in §4, including the complete owner/anchor
tuple and ordered attachment IDs. Media sorts by ID with exact typed values.
`semanticInputDigest` hashes LegacyJcsV1 of this object under
`lociview:v2:project-scene:native-input:legacy-jcs-v1\n`. Snapshot ID, generation,
ZIP ordering/compression and filenames are excluded; raw outer digest remains a
separate receipt. Two repacks of the same effective input reuse one conversion.

| Unit relative to old baseline | v2 mapping |
|---|---|
| Source unchanged | No mapped write, preserving subsequent v2 edits/placement |
| Changed title/body/color | Write that atomic field from the registered ancestor, not current heads; preserve concurrent candidates |
| Owner or anchor changed | One complete placement write under 05 §9.4; no owner/coordinate synthesis |
| Primary Scene changed | Old source-owned edge tombstone + new endpoint-fixed edge, plus the atomic managed-unit value below |
| Attachment list changed | Exact source-owned sequence replacement plus the atomic managed-unit value; do not overwrite v2-only attachments or altText |
| Caption deleted | Existing delete/edit and dependent-record confirmation semantics; no cascading removal of v2-only work without review |
| Tags | Preserve baseline tags; changed/new nonempty tags outside the old contract reject that input, not a new tag-update channel |
| New/changed media | Baseline IDs/content immutable; accept verified newly referenced supported media only. Same new ID/different content is an explicit source identity conflict |

### 6.1 Atomic guards for one-to-many mappings (proposed adapter amendment)

Membership `(sceneId, captionId)` endpoints remain immutable (05 §3.4). Never
update an old membership's `sceneId` to make a convenient source-field conflict.
Use a new edge and tombstone the old source-owned edge as one mapped change.

For each source-managed primary Scene and attachment sequence, a `ManagedUnit`
has immutable key/kind/Caption and one atomic `value`. Its key is
`H('managed-unit', {caseId, captionId, kind})`. Concurrent values preserve the
whole old source alternatives rather than silently unioning their edge sets.
The mapping also retains all candidate target edge/attachment IDs as retention
roots. Unresolved guards suppress only the affected source-managed presentation;
v2-only Scene memberships, attachments, text and media stay available.

The graph/provider must verify that the source-managed domain edges, lifecycle and
order match the authoritative guard, or expose a mapping conflict. A normal v2
command changing that managed subset updates its guard in the same transaction;
editing altText or a v2-only relation does not. A guard never gives a bridge
permission to replace all current relationships. Explicit conflict resolution
observes every guard candidate, applies the chosen full managed subset and repairs
its edges atomically. `両方残す` uses 05 §8's independent Caption-copy operation,
not the union of two allegedly exclusive source choices. No source bridge support
survives clean/review; those builders materialize only resolved actual resources.

The complete technical unit record is introduced once from its fixed case/source
identity, independently of incoming package contents. Initial values are the
registered baseline selection or an explicit empty selection for a new Caption.
`membersById` is append-only and contains complete immutable endpoint records;
the matching actual domain edge/attachment must have exactly those endpoints.
Every selected ID must be registered; order lists are unique and preserve order.
A v2-only relation is one with no such registration, not one absent from the
current selection. Once registered, a removed relation stays source-managed:
delete/restore/reorder does not change its ID or relabel it v2-only.

Selection is one atomic value; member registrations and lifecycle/order updates
publish with it as one logical change. Restoring an existing ID creates only a
new valid lifecycle event, not a second CRDT object. The provider checks all guard
candidates and selected/unselected member lifecycles, including unseen concurrent
edits. Missing registration, changed endpoints or inconsistent state is a scoped
mapping conflict, never a fallback union. All candidate member records/payloads
stay protected until resolution. An unrelated Scene/Caption remains usable.

## 7. Exact artifacts, repeat and parallel import

A local lock alone cannot make two offline importers generate the same causal
changes. The proposed pinned bridge builder produces deterministic artifacts,
not new random-actor replays on every import. This is an adapter-gated extension,
not a claim that the current candidate already implements it.

Artifact envelopes have two closed variants. The common fields are
`{schema, recipeDescriptorDigest, sourceIdentityDigest, ancestorHeads,
foundation, introductions, changes, targetHeads}`. `foundation` is the exact
`{heads:Heads, metadata:BlobRef}` proof from §7.2, retaining the original foundation
change closure without containing its own artifact registration. `introductions`
names required predecessor artifact BlobRefs in digest order; `changes` uses
§7.2's `ExactRetainedChangeDraft[]`, including actual original part BlobRefs.

- Plan variant adds exactly `{kind:'plan', semanticInputDigest, mappingDigest}`.
  It bundles the semantic input's shared artifacts; its own outer BlobRef may
  differ when another unit changes.
- Shared variant adds exactly `{kind:'group'|'introduction'|'unit', keyDigest}`.
  It contains no semantic-input/whole-plan digest. Equal shared keys must have
  equal complete envelopes and original bytes across enclosing plans; otherwise
  reject the inconsistent import, not register a second introduction.

Neither variant nor its changes include their own digest or a receipt that hashes
them. The artifact's CAS ref is added in a subsequent registration change; journal
publication covers the complete introduction/mapping/registration sequence once.

### 7.1 Shared introductions and unit-granular changes

The earlier whole-input actor sketch is superseded: a semantic plan bundles
shared **unit artifacts**. Their exact key is
`H('mapped-unit', {recipeDescriptorDigest, caseId, sourceKey, unit,
ancestorHeads, foundationHeads, baselineSourceValueDigest, targetValueDigest, introductionHeads,
mutationPlanDigest})`. `unit` is §5's closed mapping-unit token; heads are verified
sorted frontiers. `mutationPlanDigest` hashes the unit's canonical ordered logical
mutations only. No whole-file semantic digest, package receipt, current receiver
heads, local transaction ID, time or unrelated unit appears in that key.

Thus an old body value already imported is the SAME original change when another
Caption is later edited in a different old package. It cannot produce a fresh
sibling body write against a subsequent v2 edit. If source equals the registered
baseline, no artifact is emitted. Distinct source values remain siblings unless
source causality is proven; equality with baseline does not prove an undo.

Every necessary technical group, immutable record and source-managed edge is
introduced by its own shared artifact keyed by fixed identity and complete
canonical initial value, with only its required predecessor introductions.
Unit dependencies are the frontier of the fixed foundation and required
introduction artifacts, not all artifacts of the enclosing package.
The source/target graph must prove a finite acyclic introduction order. Map/object
creation is emitted once; later writes use that same original object. No incomplete
domain-record shell, temporary fabricated coordinate or placeholder owner is used.

For a new Native source ID, first introduce a complete `BirthGroupDraft` with
empty proposals and `selection:{kind:'unselected'}`. This technical group artifact
depends only on case/source identity, not birth content. Its key is
`H('birth-group', {caseId, sourceKey, entityKind})`. A full valid domain record has
the birth-specific target ID from §3.2. `birthValueDigest` hashes its admitted
whole source value with `LegacyJcsV1` under
`lociview:v2:project-scene:birth-value:legacy-jcs-v1\n`. Proposal digest is
`H('birth-proposal', {groupKey, birthValueDigest, targetId, sourceValue,
introduction})`. Different payloads therefore create distinct valid records,
never separate objects at one target ID. Equal births reuse the same complete
record and original artifact, even in different semantic plans.

Each birth writes a selected proposal from the shared unselected group ancestor.
If distinct births meet, selection is a whole-value conflict and suppresses their
affected authoritative resource/managed-child projection until explicit choice;
both original records and payloads remain retained. This is a guarded semantic
conflict, not a guessed common birth or an invalid-record shell. An unobserved
new birth arriving after resolution reopens conflict. Keep-one chooses a current
candidate without resetting that resource to its birth values: later v2 edits
remain. Keep-both follows 05 §8's explicit original/copy choice and fresh independent
IDs, including dependent relations. Labels, generation and arrival order never
select a candidate. The guard must be integrated before these records are exposed.

Proposed adapter actor is the full 32-byte `H('bridge-actor', {phase, keyDigest})`
decoded from lowercase hex; phases are `group`, `introduction`, `unit`,
`semanticRegistration`, `sourceObservation`. Each artifact uses a fresh reserved
actor, sequence 1, time 0 and message `lociview:bridge:1:<phase>:<keyDigest>`.
Each executable shared artifact or registration is one change within the adopted
per-change budget; a plan envelope is a bundle, not a new actor/change. Never
split or rebase a logical change silently. Exact operation ordering/encoder bytes still need the
pinned adapter profile and goldens. These actors identify recipes, not people.
They never author normal user commands. Existing journal transaction IDs are local
receipt identity and do not enter generated change actor/message/dependencies.
The earlier foundation belongs to the separately pinned initial-conversion
bootstrap recipe; it is verified and reused here, not rebuilt by a late input.

| Situation | Required result |
|---|---|
| Same semantic input already registered | Validate/reuse exact artifact and ID registrations; domain no-op. Another raw container may add only a receipt |
| Different package plans share identical new source entity | One shared verified introduction, no duplicate birth/object, then original descendant updates |
| Concurrent equal input, two offline importers | Same pinned original artifact; merge by existing change hashes, not arrival order |
| Same new source ID, different content | Separate birth-specific valid records and a selection conflict; no duplicate same-ID object or guessed common birth |
| Old fixed-baseline packages differ | They are siblings unless the source proves otherwise; expose actual conflicts, never order by generation or filename |
| Failure after preparation | Keep original staged artifact/parts; exact retry with old published view until complete. Missing acknowledged bytes means read-only repair, not deterministic regeneration masking storage loss |

The bridge service needs a separately reviewed prepared-migration journal source
that binds old source evidence, generated artifact and receiver base/final heads.
Do not label generated metadata the Native sender's original v2 bytes, and do not
pass a multi-change migration through 02's single-change local-command variant.
06's full-source/Contribution union does not yet authorize this source kind.
An old value equal to its fixed baseline cannot prove an intended undo of a
previous import: it is indistinguishable from unchanged source. Leave v2 work
intact; an explicit v2 edit/resolution can change it. Never infer an undo or
predecessor from arrival order, snapshot generation or the raw package digest.

### 7.2 Prepared-migration source and publication

The proposed new journal batch/purpose is `preparedMigration`, distinct from
02's `localCommand`/`remotePackageMerge` and 06's source variants. The following
closed shape is for the **late Native bridge only**, not an implicit initial-
conversion writer. Initial conversion still needs a private bootstrap and final
Project-list marker under its separate service contract.

```ts
interface PreparedNativeBridgeSourceDraft {
  kind: 'nativeBridgePrepared';
  caseId: MigrationCaseId;
  recipeDescriptorDigest: Sha256Hex;
  sourceReceipt: BlobRef;
  originalInput: {sha256:Sha256Hex; byteLength:number};
  ancestor: {identity:Identity; metadataEnvelope:MetadataEnvelope;
    heads:Heads; metadata:BlobRef};
  foundation: {heads:Heads; metadata:BlobRef};
  domainArtifact: BlobRef;
  semanticRegistration: ExactRetainedChangeDraft[];
  sourceObservation: ExactRetainedChangeDraft[];
  generatedHeads: Heads;
}
interface ExactRetainedChangeDraft {
  ordinal: number;
  expectedChangeHash: Sha256Hex;
  dependencies: Heads;
  byteLength: number;
  bytesSha256: Sha256Hex;
  bytes: BlobRef;
}
interface PreparedMigrationBatchDraft {
  kind: 'preparedMigration';
  baseHeads: Heads;
  source: PreparedNativeBridgeSourceDraft;
  changes: ExactMetadataChangePartV1[];
  expectedFinalHeads: Heads;
  exactChangeSetDigest: Sha256Hex;
}
```

Every retained change `bytes` is its actual original bytes, not a descriptor-only
promise; digest/length must equal the other fields and decoded hash/dependencies
must match the pinned adapter. Artifacts' introduction/unit descriptors use this
same retained-part shape; all references are typed retention roots. Generated
part blobs use the proposed media type `application/vnd.lociview.metadata-change`.
Schema/media-type literals for other control blobs remain §10 profile inputs.

Prepare in this non-self-referential order: exact source receipt/evidence and
baseline → shared group/introduction/unit artifacts → domain artifact → semantic
plan registration referencing that artifact → separate raw-container observation
registration. The fixed foundation is verified between baseline and groups.
Domain artifacts contain neither their own digest nor subsequent
registration parts. They reference every required artifact and original part.
Repacked equal input reuses all semantic parts; only source observation may differ.
Observation key binds the exact source receipt, not semantic artifact identity.

Before prepared acknowledgment retain the exact input at fixed local journal path
`original-source.bin`, stream-hashed against `originalInput`; no path/handle enters
the descriptor. This temporary original is not included in Team Workspace or a
completed backup. Its required staging space is preflighted; inability to retain
it fails before acknowledgment, not an unbounded buffering fallback. Complete
Native manifest/snapshot/binary verification still runs even for semantic no-op.

The receiver verifies the whole generated DAG from the registered ancestor,
including semantic/source registrations. Its apply list is exactly generated
reachable changes minus receiver `baseHeads` closure, preserving original bytes.
It does not regenerate artifacts from current receiver state. Validate detached
final domain, every guard candidate and the complete strong/conflict/opaque/
migration blob closure; only then acknowledge `blobsVerified`. All tabs keep old
published heads read-only while this transaction is unfinished, with edit/export/
GC blocked under the existing origin/project barriers.

The proposed journal integrity domain is
`lociview:v2:metadata-change-set:jcs-v2\n`, using 06's exact preimage
`{transactionId,target,purpose,stagedBlobs,metadataBatch}` and omitting only the
batch's `exactChangeSetDigest`. `purpose` equals `preparedMigration`. All source,
original-input, retained-artifact and registration references, receiver base/apply
parts and final heads participate. This is not retroactive acceptance by a v1 reader.

After interruption, verify original input, proof/artifact graph, part bytes and
final closure; replay only missing recorded changes. Missing acknowledged bytes
requires read-only repair, even if a deterministic builder could regenerate them.
Registration-only receive applies only that complete registration. A fresh receive
whose hashes all belong to the already published receiver-base closure needs zero
journal/change/publication. This is NOT a shortcut for unfinished recovery: even
if every part is already durable, verify the journal and finish its outstanding
completion/publication. Only a verified completed transaction permits recovery
to return without republishing. Source-observation updates
are explicit technical metadata, not renewed Caption edits. Durable final heads
and completion marker precede publication/root handoff; transaction-only input can
be released only then. Live portable registrations retain all required original
artifact/part bytes, not just receiver-missing parts or descriptors.

## 8. Retention, backup and history-free output

| Purpose / state | Required scope |
|---|---|
| Team Workspace | Portable cases, ID/source-key registries, baseline/ancestor proof, active/conflicting managed units, processed plans and original artifact evidence needed for continued bridge/replay |
| Contribution | Exact causal changes and newly required bridge/evidence blobs relative to the verified exchange base; no reread of unchanged model bodies |
| Complete backup | All protected case/baseline/artifact/proposal evidence plus ordinary durable metadata and local exchange bases |
| Review / clean | Materialize resolved resource closure and re-key normally; exclude the entire new subtree, source/baseline/ancestor/artifact blobs and original identity/history |
| Pending transaction / unresolved proposal | Protect every original staged part and candidate payload required for repair or explicit choice; no collection while publication/recovery depends on it |

Baseline/ancestor and every artifact required by a live processed registration
are strong technical roots. No automatic expiry or inactive-record deletion is
introduced here. Unknown minor fields retain conservative inventory; a missing
required proof blocks bridge/replay, not ordinary reading of unrelated resources.
Garbage collection and package builders must learn this new root explicitly;
storing a BlobRef in an unknown JSON object is not enough. Source names/text and
embedded model/media metadata are user content, not promised anonymous.

## 9. Finite acceptance and identity byte vectors

Reuse 04's identity corpus, Native baseline/merge cases, existing v1 canonical
keys and 06 §9.1 recovery cases. Add only the structural gaps in this companion.

| Case | Expected boundary |
|---|---|
| Registered conversion, exact same source repeated | Reuse registered resource mapping; do not create another Project implicitly |
| Verified fixed-baseline Native bridge, same effective input repacked | Same semantic input/artifact and resource IDs; separate raw receipts, no extra domain changes |
| Isolated Native / LociMyu source repacked | No inferred common lineage or requirement for identical IDs; only exact same-source repeat mapping is guaranteed |
| Native versus v1 versus LociMyu source | Different domain keys; copied/shortened IDs never prove equivalence |
| NFC/NFD, duplicate LociMyu occurrence, collision injection | Raw keys remain distinct; whole/full-truncated collision blocks before writes |
| Known-owner and ownerless unplaced | Content/media/tags/Scene retained; no fabricated position/frame/owner |
| Initial snapshot after baseline + later old input | Mapped ancestor remains old baseline; unchanged old placement preserves later v2 placement |
| Two source Scene/attachment replacements | Endpoint-fixed records, whole managed-unit conflict, no accidental union; preserve v2-only relations/altText |
| Shared new entity / incompatible birth | One identical introduction or explicit identity conflict; no CRDT duplicate-object activation |
| Five purposes and interrupted retry | Exact baseline/ancestor/artifact closure when causal, none in history-free outputs; old source and published state survive failure |

Section 9.1 contains computed hash examples only. Full converter/adapter/package
goldens must include exact admitted inputs, inspection records, all output records,
reports, decisions, expected heads/original change bytes, and every blob hash/size.
Synthetic/public-authorized evidence only; no private filenames, paths or hashes
enter tracked fixtures or this document.

### 9.1 Identity-only calculated examples

The examples use a synthetic 64-zero `sourceIdentityDigest` to isolate the ID
function; it is not a valid lineage proof or source receipt. `SourceRef` values
are synthetic too. Exact preimages are the stated ASCII domain prefix including
one LF, then canonical JSON with no final LF. Results are listed after calculation
in this draft; they do not certify a model profile or whole migration.

`0×64`, `1×64`, `2×64`, `3×64` below mean exactly 64 repetitions of the ASCII
digit, not literal multiplication text in the preimage. JSON keys are canonical
lexicographic order, including nested keys. Prefix and JSON lengths count UTF-8
bytes and the one prefix LF.

| Kind / canonical key | Preimage byte length | Full SHA-256 | Portable ID |
|---|---:|---|---|
| `scene` / `{"role":"fallbackScene"}` | 238 | `cc82aad78a33d2f92b3cdf5da0e07acfa25ed7cb222c3e1b2999616f6cec99b7` | `scn_cc82aad78a33d2f92b3cdf5da0e07acf` |
| `caption` / `{"role":"sourceRecord","source":1×64}` | 317 | `fd9af651ff0e556b275f3418c2950bc8f6b5cf89c6b8c23d3daa7b08970caf57` | `cap_fd9af651ff0e556b275f3418c2950bc8` |
| `scene-caption-membership` / `{"captionFullDigest":3×64,"role":"sceneCaption","sceneFullDigest":2×64}` | 447 | `c9ec02da0d2774f426825a7ac3b8bf0badfa1c6eb49e8a09a577ada169ca2ca7` | `scm_c9ec02da0d2774f426825a7ac3b8bf0b` |

For the first published synthetic vector in 04 §3.2, the exact new source-key
canonical bytes are:

```json
{"identityFullDigest":"1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309","identityKey":{"legacyId":"c_SYNTH_A","occurrence":0,"sheetIdentity":{"kind":"legacyGid","value":"0"}},"kind":"lociMyuCaption","sourceCaptionId":"cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40"}
```

With the source-key prefix from §2, its full digest is
`171199304f5f10631b0a443d1ddc02e79056a5d0fea0cd965db2369810a3e9d5`.
All values here are public synthetic examples, not representative-source data.

## 10. Ratification inputs and next engineering action

Do not enable this recipe until these finite inputs are supplied together:

1. Exact Native/v1/LociMyu inspection/profile and immutable-builder tables,
   canonical defaults/order/omission policy (including Native pin scale), and
   complete output goldens. Native profile IDs alone are not a v2 profile contract.
2. Exact typed managed-unit schema/provider/command integration, shared entity-
   introduction reservation and deterministic adapter artifact bytes. Show the
   parallel equal/different birth cases and original-byte idempotence, not just
   stable resource hashes. The actor/sequence/plan proof is a gate input.
3. Prepared-migration journal-source amendment, source-evidence/baseline/artifact
   blob schemas and media types, the separate frozen-v1 later-copy plan variant,
   bounded support/output budgets, and actual
   persistence/retention/recovery proof. No fabricated old source metadata.
4. Immutable descriptor hashes/whole-output golden manifest, independent review
   and explicit PO ratification of the technical schema/recipe amendments. Actual
   S1/S2 adoption/device gates remain separate and unchanged.

The interface portion is now drafted in §§5–7.2. It is no longer the next task.
The remaining items above are implementation/profile evidence and ratification,
not a request for another companion or standalone browser probe.

### 10.1 Executed feasibility and finite go/no-go (2026-09-10)

The existing `poc/scene-history/harness.test.mjs` adds four small synthetic checks
against its already pinned Automerge candidate: repeated unit bytes do not renew
an old write after later local editing; equal introductions share one object and
survive save/load with exact original bytes; an atomic relation guard retains
both alternatives; different births have separate targets plus explicit shared
selection, preserve later edits on keep-one and reopen on an unseen birth.
All ten harness tests pass. These use probe keys and partial synthetic records,
not this recipe's canonical encoder, admitted ProjectDoc records, durable journal
or real Native input. They establish only feasibility of those four mechanisms.

**GO, existing authorized candidate lane:** implement one connected service-level
slice in the current isolated harness: fixed synthetic baseline/foundation →
managed relation/birth guards → retained original parts → the existing journal
port → independent reopen and one repeat input. Reuse the current domain guards,
journal/recovery fixtures and above cases. Its exit is preserved local edits,
explicit conflicting alternatives and old-or-complete publication; do not add
another UI or ask for another synthetic human check. Exact code scope and the
candidate execution descriptor must be recorded before that implementation.

**NO-GO, real-file/product activation:** this draft and the four feasibility cases
do not ratify a schema, wire/profile, converter or technology. Collect §10's exact
byte/profile/retention results into one reviewed approval package; resolve actual
policy/limit choices with PO, not by interpreting permission to continue as
adoption. Then connect durable product services to the same thin whole-workflow
host. Existing Native data, source files, ordinary app, dependency versions,
release/Pages/Service Worker and physical-device gates remain untouched.

**Observed isolated connection (2026-09-10):** `poc/scene-history/journal.ts` now
has a preparedMigration entry with a mandatory configured source verifier, retained
original/control bytes, registered receiver foundation, exact missing-part apply
and shared existing recovery/publication. The eight added Node cases use a small
synthetic source recipe and existing filesystem/CAS ports. This implements only
the protocol seam, not these portable artifact schemas, complete domain/birth
guards, Native parsing, real-data conversion or UI/storage activation. The complete
development-source connection is recorded below; portable recipe and real-file
activation remain separate. Current todo owns executed verification and the
precise next boundary.

**Implemented execution descriptor (candidate only):** the existing complete development
source has a single flat `cells` genesis containing initial records. Its exact
original DAG may enter the journal only under the explicitly selected
`automerge-js-3.4.1-flat-isolated-probe` profile. The old isolated empty-bootstrap
profile is unchanged; neither profile adopts 02 §4's product format. Root identity,
declaration and the one cell-map object cannot be rewritten, even to equal values.
The composite reader partitions only an exact `isolatedBridge` control namespace;
all domain change IDs, dependencies, operation IDs and heads remain original,
including empty domain changes. Existing development command/field correspondence
is not weakened. Complete domain writes continue through its current encoder.

The candidate sidecar checks immutable foundation/endpoint registrations and all
atomic managed-selection/birth alternatives at those same heads. It withholds only
affected authoritative memberships/resources, retaining ordinary v2-only relations,
local text and complete nonselected records. Missing or malformed control evidence
is not an empty selection. Actual temporary-CAS content checks and conservative
known-record blob retention finish before prepared acknowledgment, publication and
reopened use. This is a fixed placed-Caption/Scene service exercise, not the full
portable recipe encoder, unplaced branch, file import or a new UI connection.

Seven Node service cases now execute this connection with real temporary files,
including a prepared source, participant edit, interrupted original-part flush,
independent reopen, one publication and exact no-op replay. Scene alternatives
and different complete births remain explicit; choosing a birth preserves later
text and its media while unrelated attachment conflicts remain available. The
capability accepts an exact registered synthetic plan, not a general converter.
The full portable recipe encoder and artifact/proposal schemas, actual files,
adopted product profiles and UI/device storage activation are still unimplemented.

### 10.2 Concrete mapping decisions and implementation boundary (proposed, 2026-09-13)

This is a reviewed-decision input, not an adopted recipe or permission to implement
an unratified migration. See 06 §11 for the separately proposed implementation/
adoption split. Initial new-file team exchange does not require all three converters
to be finished first; the practical-team version still requires them before acceptance.

| Item | Recommended exact direction | Still required before activation |
|---|---|---|
| Input mapping | Retain §4's direct Native/frozen-v1/LociMyu mappings. Do not route through old Native conversion when it reports/omits source normal or unknown content needed by the new recipe. | Closed inspection/immutable-builder/default/order/omission tables for each admitted profile, whole-output goldens; no private-source fixture |
| Native pin size | Add optional atomic `Asset.pinScale`, finite in `[0.001,1000]`; absence displays as `1`. Preserve explicit source value versus absence. Applies to that Asset's pins across Scenes, separate from selection emphasis. Never multiply coordinates, model transform or camera. | Known schema/provider/command/renderer and copy/history-free handling. Clean retains it; review's three owner branches must explicitly include the optional field if that draft is adopted. Existing 01/02 records do not yet admit it as this known capability. |
| Unplaced Caption | Use 05 §9.4.1's proposed `{kind:'unplaced', ownerAssetId?}` exactly, retaining known owner, text/media/tags/Scene; no invented position/frame/class. | Anchor union, known-owner retention, first explicit placement, copy/review/clean and appropriate schema compatibility. Current validator admits only asset/project; unresolved Asset `pendingAssetToProject` already exists and need not be reinvented. |
| Independent IDs | Initial conversion uses §3's registered deterministic resource IDs, fresh Project/epoch/root; `両方残す` uses fresh independent copies and dependent IDs. | Exact builder and whole-output ID/class/digest vectors; the existing membership copy alone does not implement guarded-birth copying or every model profile |
| Late Native | Keep fixed-baseline, unit-granular original changes, endpoint-fixed memberships, managed whole-selection guards and shared birth/introduction artifacts from §§6–7.1. | Portable control schema/provider/commands and deterministic original-byte encoder; equal/different births and repeat-after-v2-edit proofs. No promotion of PoC code or label/generation-based causality. |
| Recovery | Dedicated `preparedMigration` source from §7.2 binds old input, registered ancestor, original artifacts and receiver heads. Retry retained exact bytes; do not regenerate acknowledged loss. | Closed control blob/media types, source/receipt retention, original-source staging budget and durable interruption checks. Frozen-v1 later-copy remains a separate required plan variant, not Native evidence relabelled. |

The physical migration adapter is an actual unresolved compatibility decision.
Current `src/projectMetadata/format.ts` fixes permanent root collections and cannot
express independent managed-subtree conflicts by merely storing one extra JSON
scalar. Reuse the current canonical values/history primitives, but specify a
versioned control encoding with original-byte and old-reader refusal behavior.
Do not alter `lociview-automerge-atomic-map-1` silently or infer a profile upgrade
from permission to continue. The recipe/source amendment still needs independent
review and explicit PO technical approval; 06 §11 is not that approval.

Before implementation, fix the input-profile and typed field tables plus expected
golden outcomes. Obtain actual encoder/retention/recovery evidence in the existing
service tests after authority is granted, then freeze descriptor/specification/
golden hashes from their exact bytes. Hash placeholders, profile IDs alone, and
raw ZIP hashes cannot prove the complete recipe. No full migration acceptance is
claimed by this finite mapping recommendation.

## 11. Concrete Native implementation decision (proposed, 2026-09-14)

**PO TECHNICAL DECISION PENDING; NO CODE OR ADOPTION AUTHORITY FROM THIS TEXT.**
This consolidates §10's remaining decision against source checkpoint `9e49571`.
It does not reopen the approved preservation of unplaced records, explicit
conflicts/keep-both, source preservation, team roles or five file purposes.
The requested decision is the following versioned compatibility amendment and
its implementation-before-measured-adoption order. It is not procedural delegation.

### 11.1 Separate new encoding; preserve existing files and jobs

| Boundary | Existing path, unchanged | Proposed Native-capable path |
|---|---|---|
| Domain header | Existing accepted major-2 records and unknown-minor rules | `{major:2,minor:1}` with the known fields in §11.2 |
| Metadata envelope | `lociview-automerge-atomic-map-1` | `lociview-automerge-atomic-map-2`; same `automerge-root-change-v1` proof kind, different checked root grammar |
| Package discriminator | `wireVersion:'1'`, existing closed purpose shapes | `wireVersion:'2'`, same five purposes and exact ZIP/control rules; new adapter/summary/review profile below |
| Summary | `lociview-project-summary-1` | `lociview-project-summary-2`, accounting for pin scale and typed migration evidence |
| Review snapshot | `{kind:'lociview-project-scene-review',version:'1'}` | Same kind with `version:'2'`, typed unplaced anchor and owner pin scale |

Version dispatch checks the complete combination, not independently expanded
enums. Wire 1 retains map-1/summary-1/review-1; wire 2 accepts only
map-2/summary-2 or, for review, review-2/summary-2. A declared version with another
version's structure is invalid. An unknown version is unsupported before any
Project mutation. Do not strip unknown controls and expose an apparently ready
domain, relabel an old proof or regenerate old change bytes with the new encoder.
The app version, Native schema 1, frozen v1 and published compatibility remain unchanged.
The 2.1 header names the new writer's domain version, not permission to discard
unknown minor domain values; 02's conservative preservation/copy policy remains.
Typed migration controls still require their exact known physical profile.

New readers retain old-file read/reopen and existing compatible edits/output.
Every existing output/retry job uses its captured profile/manifest, not a global
latest-version constant. This unit does not upgrade an existing map-1 lineage
in place. A newly converted Native Project has fresh map-2 identity/root; later
Native input requires its exact registered case/ancestor/foundation. Independently
converted Projects still cannot exchange changes solely because resource IDs match.

Map-2 keeps the domain's 14 permanent record collections and existing atomic
domain values. Its genesis additionally creates exactly one permanent
`projectSceneMigrationSupport` map containing a canonical immutable schema scalar
`lociview-project-scene-migration-support-1` and an empty permanent `casesById` map.
Schema/identity/root containers cannot be replaced. Control layout is fixed:

| Logical §5 record | Physical rule |
|---|---|
| `casesById[caseId]` | Permanent map introduced once; id/recipe/sourceIdentity/optional baseline are immutable whole scalars |
| Source-key, portable-ID, receipt and plan registries | Permanent map per named registry; each keyed value is an append-only immutable canonical scalar |
| `managedUnitsByKey[key]` | Permanent map; key/kind/captionId immutable; permanent `membersById` of immutable endpoint scalars; only `value` is a mutable whole scalar |
| `birthGroupsByKey[key]` | Permanent map; key/sourceKey/entityKind immutable; permanent append-only `proposalsByDigest`; only `selection` is a mutable whole scalar |

No CRDT list, counter, text or dynamically replaced container is admitted here.
Attachments' ordered selection remains one canonical array scalar. Every control
field/ID/ref is validated against §5, not accepted as opaque JSON. Domain/control
inspection uses the same original DAG, hashes, operation IDs and frontier;
control-only changes remain empty domain changes, not removed dependencies.
Projection checks whole guard alternatives before exposing managed relationships
or new births. Ordinary commands touching a managed subset update its guard in
the same transaction; unrelated fields and v2-only relations remain independent.

History-free output rebuilds, never copies, this structure. Review-2 contains no
migration subtree. Clean map-2 contains only the fixed schema plus empty
`casesById`; no case, recipe, source key, registration, guard, proposal or evidence
survives. This **proposed physical-scaffold exception** amends §8's literal
whole-subtree omission for clean only; it retains the same privacy outcome.
Clean input verifies the empty scaffold. It cannot claim a continuing Native bridge.

### 11.2 Preserve values and user-visible order, not old implementation keys

The following is the implementation contract to close, not a claim that the
current Native IDs/profiles already satisfy the new provider. Every target ID
uses §§2–3's registered preimage/full-digest checks; no prefix substitution.
Retain exact input bytes and decoded source evidence separately from canonical
target values. Unknown or unrepresentable content is reported before conversion;
never truncate, guess a winner or silently publish only the convenient subset.

| Native source | Required mapping / current implementation gap |
|---|---|
| Project title/frame | Preserve title and unit/handedness/up-axis; re-key frame. Snapshot/generation/old Project ID remain source evidence, never new causal identity. No import-time label trimming. |
| Asset | Preserve label, frame, exact active-binding relationship and optional `pinScale`. All Assets remain resources, including hidden ones. |
| Pin scale | Known optional atomic `Asset.pinScale`, finite `[0.001,1000]`; absence displays as 1 but stays absent in metadata. No coordinate/transform/camera multiplication. Preserve on clean and every applicable review owner branch. |
| Bindings/revisions/classes | Preserve logical distinctions, retained older bindings/revisions, transformations/method, representation sets and exact class/family partition. Re-key references and recompute target immutable digests. Required revision provenance is `origin:'migration'` with sorted unique exact source Representation blob digests; do not invent parent revision/binding, residual or source modelling-tool claims. |
| Representations | Preserve exact payload bytes, roles/purposes, frames/families, reflection/transform, derived relations and proxy targets. Target bounds, catalog and profile digest come from a pinned content inspector, not Native's profile ID alone. |
| Caption content | Preserve title/body; convert effective color `#eab308` when absent to its exact sRGB components. Preserve tags and attachment order; do not lose unreferenced Caption resources. |
| Positioned anchor | Re-key the whole validated owner/frame/revision/class tuple and retain exact position/manual evidence. No surface repick, guessed frame relation or downgrade because its model is hidden. |
| Unplaced anchor | Adopt exactly 05 §9.4.1 `{kind:'unplaced',ownerAssetId?}`. Preserve known owner or absence; no coordinates/frame/revision. Invalid/conflicted owner or anchor is not ordinary unplaced. |
| First placement | Existing Caption ID, explicit verified hit plus confirm/cancel; known owner constrains the hit. Unplaced text/media stay editable. Keep-both and five-purpose copying retain the typed anchor and independent later placement. No new general unlink operation. |
| DisplaySets/default | One Scene per effective set, preserving name and effective user order/default-view relation; exact active set initializes defaultSceneId. DisplaySet-free source uses the frozen fallback helper. Later Scene selection is UI-only. |
| Asset visibility | Use the observed Native resolver's effective hidden-Asset/active-primary selection. A stored displayMode is not itself proof of effective visibility. Retain all other resources; block a genuinely unrepresentable partial-kind presentation rather than infer memberships. |
| Scene Caption membership | Exact effective Caption DisplaySet, independent of current filters/selected model. Membership endpoints never change identity. |
| Order | Native-generated order keys can contain `_`; actual DisplaySet/View/Caption UI order is source-array encounter order, not a sort of those keys. Scene/View/Scene-Caption/Scene-Asset keys are `A` plus zero-based source encounter ordinal in lowercase base36 padded to eight digits, scoped to each destination collection. Attachment keys use that Caption's attachment sequence. Keys are presentation, never ID preimages or source causality; retain raw source order keys separately. |
| Saved Views | Preserve owning Scene/frame, name, camera/projection/background and effective order. Normalize non-unit camera up and accepted quaternions by the field-specific canonical transform rule, retaining raw source values; never round/trim coordinates or silently replace an invalid camera. Preserve a valid default relation; `null` default becomes absent, not a guessed first view. |
| Material | Preserve Scene/Asset/authored-Revision/Representation/slot scope and opacity, sidedness, lighting and chroma intent. Prove the Native loader child-path/slot to target catalog relation. Native per-instance cloned material slots cannot be equated to one shared glTF materialIndex. Missing/ambiguous/many-to-one unequal mapping blocks that profile's conversion; never choose by material name or last write. See exact value policy below. |
| Media/attachments/tags | Preserve every admitted media resource/label/blob, including unreferenced/baseline media. Retain Caption/media attachment identity across reorder. Generated records use registered keys, not random reallocations on retry. Tag resource order follows first encounter across source Captions/labels; raw per-Caption tag order stays in evidence (the target has global Tag order, not ordered tag memberships). Preserve source tag distinctions or report a target-normalization collision. No tag-management feature is added. |
| Local selection | `captionTargetAssetId` and transient camera/window/filter selection are not shared Project editing state. Disclose that they are not transferred; source remains unchanged. Durable Saved Views and exact default Scene are transferred. |
| Collaboration baseline | Verify frozen Native baseline/unsupported digests and preserve raw Unicode evidence; map the baseline first, then apply the selected snapshot's supported post-baseline edits. Do not set the current selected snapshot as the common ancestor. |

For accepted numeric values, the existing target canonical quaternion/up-vector
rules apply; the immutable builder must pin exact normalization operations and
goldens. Source text is NFC-normalized only for target display/known-field rules,
with raw text retained in source evidence. Controls/limits or normalization-key
collisions cannot be repaired by trimming, truncation or merging source identities.
`displaySets` absence alone invokes the frozen fallback; an empty/malformed set
array is not equivalent. Optional source color uses the rendered default above,
not the Native parser's temporary validation default.

**Additional material-schema amendment proposed for this same decision:** map-2
recognizes optional boolean `appearance.chroma.enabled`; absence means enabled
when a chroma object is present. `false` retains inactive color/tolerance/softness
without applying the effect, so disabling/re-enabling does not discard imported
settings. Chroma absence still means no saved settings/effect. This is one whole
atomic appearance value. Map-1 semantics do not change. Clean/review-2 preserve
these ordinary appearance values (including inactive ones), not migration evidence.
This proposed amendment to 01 §4.2 applies to map-2 only: effect, coverage,
coupling and backend-capability checks use `chroma present && enabled !== false`.
Disabled parameters still undergo ordinary value validation and are retained,
but cannot alone imply mask/blend, reject explicit opaque, or demand a chroma
backend capability. Map-1's existing coverage semantics remain unchanged.

Native `unlit:true` maps to `lighting:'unlit'`; `false` maps to `inherit`, not `lit`.
Retain the Native chroma enabled flag, but do not copy its color/tolerance/feather
numbers directly into target effect settings. Native quantizes the key via
`chromaHex`, measures unnormalized linear distance and uses
`smoothstep(tolerance,tolerance+max(feather,0.0001),distance)`; specification 01
normalizes distance by `sqrt(3)` and treats zero softness as a hard cutoff.
The per-profile conversion must bind exact key quantization/color space and
source-base-color semantics, with tolerance divided by `sqrt(3)` and positive
`max(feather,0.0001)/sqrt(3)` softness where those semantics are proven equal.
Keep raw source settings in evidence, including while disabled. Never call a
formula sketch rendered equivalence or silently change hard/soft behavior.
Coverage/optics must reproduce the original source material plus opacity/chroma
behavior, not invent a universal blend default.
The per-profile table must bind source alpha/material semantics, exact slot
instances and their target coverage before activating that material profile.
An unsupported instance correspondence remains a visible conversion issue until
the existing-format inspector/renderer can preserve it; it is not a permanent
feature deletion or an accepted reason to mark F06 complete.

Source evidence: [Native schema/helpers](../../src/nativeGs/schema.ts),
[Native resolution](../../src/nativeGs/resolver.ts),
[material slot identity](../../src/nativeGs/materialSlots.ts),
[current target fields](../../src/domain/projectMutableFields.ts),
[GLB catalog](../../src/projectFiles/glbMaterials.ts),
[current validation profile](../../src/projectFiles/validation.ts).
The first connected file slice may use the existing closed static GLB/PNG inspector
only for inputs whose **complete** mapping it proves. That is sequencing, not the
Native support promise: per-instance materials and remaining existing Native
Mesh/Point/GS/Proxy/image profiles must be connected before F06/practical-team
acceptance. No byte transcoding or new media type can be used to bypass a gap.
Exact per-profile traversal/order/default/slot tables are recorded before that
profile's builder, then checked with public synthetic whole-output fixtures.

Summary-2 retains summary-1's scope rules but recognizes `assetsById.pinScale` and
the typed control paths. Distinct case/managed-unit/birth-group keys are technical
entity classes; their actual scalar paths are deduplicated field classes at the
same original-history or delta scope. The fixed empty scaffold is not user
migration evidence. A review/clean summary contains no source-case classes.
Review-2's closed table adds the above anchor, optional owner pin scale and
optional `appearance.chroma.enabled`;
all 06 §12.6 inclusion/omission, conflict and visible-needsReview rules still apply.

### 11.3 Initial conversion is a durable handoff, not a late-input replay

Introduce one separately named initialization source, `nativeInitialPrepared`,
under a new `importNative` journal purpose. It is neither `importClean` (it retains
source/baseline evidence) nor §7.2 `preparedMigration` (receiver-base late input).
Its prepared descriptor binds the source outer digest/length, verified Native
source identity, recipe descriptor, typed ID/field mapping, exact generated
metadata/proof/original parts, protected body/evidence roots and final heads.
The private generation has no predecessor/base heads. The Session is the only
initialization authority; UI cannot write storage or create ready list entries.

The closed receipt/path/source-record definitions and finite aggregate staging
budgets must be written and independently checked before coding this new purpose.
They use current journal/WorkspaceFS primitives, not a parallel persistence
framework or a direct promotion of the synthetic `preparedMigration` PoC.
Expected protocol:

1. Inspect the complete Native file and exact payload set without modifying it.
   Present conversion effects, unsupported items and retained team-history scope.
   Decline/failure leaves the open Project/drafts/file unchanged.
2. After confirmation prepare one private destination. For fixed-baseline input,
   create actual genesis → mapped baseline → foundation → selected post-baseline
   artifacts → receipt registrations. The ancestor excludes its own registration;
   foundation excludes selected post-baseline edits and its own hash (§5).
   For isolated input, record that it has no late-Native bridge entitlement.
3. Freeze actual metadata/proof, source evidence and original change bytes once.
   A saved timestamp or recipe alone cannot recreate the Automerge root. Preflight
   original input + protected CAS bodies + metadata/evidence + temporary overlap
   before acknowledgment; no whole-buffer fallback or unmeasured capacity claim.
4. Stage, read back and verify the entire detached graph/guards/closure. Publish
   final heads and the Project-list completion marker once, then switch the UI.
   Preserve an explicitly discoverable pending job; never list a partial bootstrap
   as ready. Existing package-operation/write-lease ordering remains non-nested.
5. Cold retry uses that destination and retained bytes, including the original
   selected source while pending. Missing acknowledged evidence means repair,
   never regeneration or silent new Project. Completion retry is no-op and must
   preserve edits made afterward. Completed original ZIPs are not secretly shared.

Portable source evidence, mapping baseline, ancestor/foundation metadata and
original artifacts are typed roots in Workspace/Contribution/backup. Raw source
ZIPs remain local pending inputs; selected source text/media in shared history is
disclosed. Clean/review exclude those roots under §11.1. An initial converter
without the fixed-baseline foundation would prevent the promised later bridge;
therefore it is not an acceptable shortcut even when late-input UI follows later.
Neither initial import nor late bridge silently replaces current v2 model bindings.

### 11.4 Authorization requested and finite delivery

Approve the concrete compatibility direction in §§11.1–11.3 for implementation
in the existing isolated validation/service route, then obtain executable bytes
and measured adoption evidence. This would amend 05 §9/this document's demand for
completed immutable goldens before the first converter: the expectations and
closed per-unit contract precede code; actual golden/recipe/profile hashes are
frozen from independently reviewed executed output before durable product
activation. Never insert placeholder hashes or call a draft recipe frozen.
Development execution descriptors are explicitly candidate-only. They cannot
masquerade as a frozen recipe or upgrade a previously recorded conversion in
place after its mapping changes; retain that original input and report the
unsupported candidate when exact retry is no longer supported.
The pinned Automerge dependency is unchanged; an encoder difference that cannot
meet original-byte equality is a real failure, not permission to change expected bytes.

Delivery remains at most three connected units, one writer and existing tests:

1. New-format compatibility and unplaced/pin-scale editing/copying, including
   ordinary Session operations, explicit first placement and all five purpose
   closure/privacy. Preserve old-file/retry behavior and reject mixed profiles.
2. Native file → conversion confirmation → complete new Project → edit/cold reopen,
   with exact source/body/order/material checks and fixed-baseline preparation.
   Existing supported profile gaps are filled here/by dependency, not declared done
   because one GLB works. No normal-home or physical-device acceptance inferred.
3. Verified late Native file → affected explicit conflicts/independent keep-both →
   continued v2 editing/return. Cover same-input repack/replay, same old field in
   different input plans, equal/different concurrent births, local text/placement
   preservation, two rounds and interruption/cold recovery with exact original bytes.

Use existing package/metadata/conversion fixtures and actual served checks at the
approved grouped boundaries; no new PoC page or repeated root suite for docs-only
updates. Frozen-v1 and LociMyu converters remain required separate recipes/mappings,
not covered by Native evidence. M13/M14, new media, general Undo/tags, in-place
map-1 upgrade, extra dependencies, main/Pages/Service Worker/license/app version,
release and new numerical product guarantees remain outside this decision.
