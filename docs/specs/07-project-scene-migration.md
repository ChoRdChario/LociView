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
  | {kind:'nativePrimaryScene'; value:SceneId|null}
  | {kind:'nativeAttachments'; value:CaptionAttachmentId[]}
);
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

## 7. Exact artifacts, repeat and parallel import

A local lock alone cannot make two offline importers generate the same causal
changes. The proposed pinned bridge builder produces deterministic artifacts,
not new random-actor replays on every import. This is an adapter-gated extension,
not a claim that the current candidate already implements it.

An artifact is closed `{schema, recipeDescriptorDigest, sourceIdentityDigest,
semanticInputDigest, ancestorHeads, mappingDigest, introductions, changes,
targetHeads}`. `introductions` names required artifact BlobRefs in digest order;
`changes` is 02's exact original ordinal/hash/dependency/length/bytes-digest
descriptor array, with bytes in a separately retained fixed bundle. Neither the
artifact nor changes include their own digest or a receipt that hashes them.
The artifact's CAS ref is added in a subsequent registration change; journal
publication covers the complete introduction/mapping/registration sequence once.

Deterministic bridge actor keys bind the full recipe descriptor, verified v2
identity/ancestor, semantic input and canonical mutation-plan digest, under a
distinct domain. Reserved actors are not user identities and never used by normal
commands. The pinned builder must fix exact actor bytes, sequence, time (fixed,
not wall clock), message and primitive-operation order. Same input must produce
identical original changes across workers/devices; until those bytes are pinned
and verified, autonomous parallel bridge admission is disabled.

Baseline-absent source entities need shared introduction artifacts, not just a
whole-plan actor. Equal source identity plus equal canonical birth payload must
reuse the exact introduction bytes/dependencies even in different input plans.
Unequal payloads under one new source ID are an explicit birth/identity conflict
(as in Native), not two concurrent creations of the same v2 object. Retain both
as immutable source proposals; resolve before activating an introduction. Do not
infer an earlier birth from snapshot generation/time, or treat a later differing
snapshot of a baseline-absent ID as proven causal succession. Section 10 pins
this reservation/introduction subformat before production; this draft does not
silently admit a duplicate-object workaround.

| Situation | Required result |
|---|---|
| Same semantic input already registered | Validate/reuse exact artifact and ID registrations; domain no-op. Another raw container may add only a receipt |
| Different package plans share identical new source entity | One shared verified introduction, no duplicate birth/object, then original descendant updates |
| Concurrent equal input, two offline importers | Same pinned original artifact; merge by existing change hashes, not arrival order |
| Same new source ID, different content | Preserve source proposals and request explicit identity/copy resolution; no guessed common birth |
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

The immediate next artifact is the executable-neutral managed-unit/introduction
and journal interface, alongside the wire/profile ratification inputs, not another
standalone browser probe. These are genuine source-to-target mismatches exposed
by this slice. Preserve thin whole-workflow delivery after the required contracts
and adoption gates; do not call this draft a production implementation or convert
real files to obtain evidence before its authority exists.
