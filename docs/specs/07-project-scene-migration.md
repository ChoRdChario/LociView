# ProjectScene one-time migration

> **PO-APPROVED SCOPE — 2026-09-14. IMPLEMENTATION NOT COMPLETE.**
> Convert Native / frozen v1 / LociMyu once, then continue with the converted
> Project's files. Continued old-format updates into that Project are not required.
> The former Native-bridge proposal and its §11 authorization request are superseded,
> not waiting for approval and not automatically adopted in a smaller guise.

## 1. Accepted cutover

The user workflow is: open an old source → inspect conversion effects → confirm
a new Project → edit and save it → give the converted Workspace to the team.
Subsequent collaboration uses that Project's new-format Workspace / Contribution
files. Independent conversions of old copies do not establish a common lineage.

Old-format update files must not merge into, overwrite or reset the converted
Project. Explain that the team now uses the converted file. Rejecting such an
update must not silently create another Project. An explicitly requested separate
conversion remains independent, not a route for returning old changes.

This narrows the continuing-legacy requirements in specifications 02/03/05/06
under [ADR-0002](../adr/0002-project-scenes-and-continuing-team-history.md).
It does not remove initial legacy reading, source preservation, current Native
behavior or compatibility with existing new-format files and interrupted jobs.

## 2. Work removed from the completion target

- Late Native and later frozen-v1 update bridges into a converted Project.
- A legacy fixed baseline mapped to a common new causal ancestor solely to accept
  those later inputs.
- Portable legacy-bridge registries, managed-unit guards, parallel-introduction
  artifacts and deterministic change generation solely for repeated old inputs.
- Old/new concurrent-edit, repeated-old-update and cross-device old-update
  acceptance cases. Historical PoC evidence is not a remaining product gate.

F09 and SCN-MIG-05 are withdrawn, not completed or deferred. Ordinary new-format
causal history, explicit conflicts, independent keep-both, two-round exchange,
backup and exact interrupted-job recovery remain required.

Do not delete existing source/provenance/opaque content, receipts or generic
history just because the bridge is no longer needed. Distinguish initial mapping
and existing file retention from bridge-only requirements.

## 3. Initial conversion still has to preserve the user's work

Apply [05 §9](05-project-scene-team-workflow.md) and the frozen input contracts.
A new conversion recipe must not reinterpret the frozen old recipe or old IDs.

| Source content | One-time conversion requirement |
|---|---|
| Project and frames | Preserve title, units, handedness/up-axis and exact relationships; create a new Project/history identity, not an in-place old-source upgrade |
| Models and representations | Retain admitted visible/hidden Assets, bindings/revisions, frames, transforms, roles and explicit proxy/source relationships; no guessed rematching |
| Model/media payloads | Preserve exact admitted bytes, length and digest. Account for missing/unsupported/unlinked content before publishing; never silently drop it |
| Captions and media | Preserve text, color semantics, tags, attachment order and records not currently in a Scene |
| Positioned pins | Map the authoritative owner/frame/position tuple without repicking, moving it or guessing another model |
| Unplaced pins | Preserve known owner or absence without inventing a position. Subsequent explicit first placement keeps the same Caption and media |
| Pin scale | Preserve source value versus absence; do not multiply coordinates or camera values as a substitute |
| DisplaySets and sheets | Map each admitted set/sheet to a Scene with its effective name, ordering, membership, views and exact material relations |
| Views/defaults | Preserve owning Scene, camera/background and valid entry relations; source active set initializes default Scene, later browsing stays local |
| Material and visibility | Preserve effective visibility and scope. Map source slots and chroma semantics explicitly, including inactive settings needed for later editing; similar names are not evidence |
| Unknown/conflicting data | Account for it and explain unsupported mapping. Never select a winner, normalize distinct source identities together or present incomplete conversion as complete |

Native source order and material layout/chroma semantics are not identical to
target keys. Keep these concrete mapping questions in the reduced plan; removing
the bridge does not make field conversion a byte-for-byte metadata copy.

LociMyu uses the existing exact/confirmed sheet-model-media authority, without
Drive dependence or inferred relationships. Keep initial equal-byte-but-distinct
media/Caption identities separate; old-update fixture retirement does not waive
initial duplicate preservation.

## 4. UI and recovery boundary

- Use the normal file-open intent with contextual conversion effects. The converter
  can be an independent module called by the app; no separate user-facing tool is
  required by this scope decision.
- Explain that editing continues in the new Project and that the source remains
  unchanged. Share the converted Workspace, not instructions for every participant
  to import and independently convert old copies.
- Prepare a private destination through existing services and WorkspaceFS.
  Validate the complete converted state and referenced bodies before publishing
  one ready Project. No partial ready entry or UI write directly to storage.
- Preserve the selected source and fixed destination/output needed during an
  interrupted conversion. Resume that operation; do not mint replacement identities
  or reset subsequent new-format edits on completion retry.
- Keep the original container unchanged on success, failure and cancellation.
  Do not silently include the original ZIP or source-private material in team
  outputs. Initial conversion reports and privacy accounting remain necessary.
- Browser resume data and file saving stay distinct under
  [UI guidelines §9](../ui-product-guidelines.md); internal success is not an
  external-file completion receipt.

## 5. Reduced implementation planning boundary

The next migration plan closes only initial source admission/mapping, required
target fields, private destination publication and retry, then normal new-format
editing/exchange. Reuse current readers, domain commands, file services and journal
primitives rather than another parallel conversion/storage framework.

The former map-2/wire-2/summary-2/review-2 proposal bundled field support with a
continuing legacy control graph. It is not the current approval request. Determine
the smallest changes actually needed for unplaced records, pin scale and faithful
material conversion; do not assume either that the old proposed upgrade is all
required or that existing validators can already represent every source value.

Reduced code-backed findings (2026-09-20, before §5.1 implementation; source-profile/recipe findings remain open):

- Target [anchor admission](../../src/domain/projectRecordFields.ts) currently
  requires Asset/Project coordinates. The proposed closed `unplaced` branch in
  05 §9.4 must cover known-owner retention, list display, explicit first placement
  and review/clean references together; inventing coordinates is not a conversion.
- The [mutable field registry](../../src/domain/projectMutableFields.ts) has no
  Asset pin scale. Preserve an optional source value separately from transforms.
  [Material intent](../../src/domain/materialIntent.ts) currently treats chroma
  presence as enabled and drops its parameters on disable; faithful conversion
  also needs an inactive representation, not silently enabled or lost settings.
- Order need not gain a new schema: freeze the inspected source's effective order
  and assign legal, unique target order keys in that order. Define the inspection
  ordering in the recipe; copying old keys or sorting them by target rules is not
  faithful. Preserve original keys as source evidence.
- [GLB materials](../../src/projectFiles/glbMaterials.ts) currently group source
  material indices, while Native permits occurrence-specific overrides. Define
  an exact occurrence catalog/profile instead of collapsing distinct overrides.
  Soft chroma/opacity require renderer capability and numeric mapping, not merely
  relabeling the source profile or extending metadata.

The first connected converter slice should use representable real GLB/PNG inputs,
existing Native admission, `OriginBlobStore`, metadata initialization and journal
recovery. Add only the conversion receipt needed to retain the selected source,
recipe, fixed destination, mapping/report and exact generated history across
interruption. It must not masquerade as a clean-package import. Other required
Native profiles and frozen-v1/LociMyu recipes remain in scope, not silently omitted
because this first slice is narrower.

Specify required schema/profile/recipe differences before implementation and seek
a concrete compatibility decision only for differences still necessary. Existing
new-format Projects/files/jobs remain readable and recoverable; this cutover is
not permission to delete old readers or rewrite recorded history. No dependency,
public entry, Service Worker, release or device-route change is authorized here.

[todo](../../tasks/todo.md) owns current implementation status. This document
records the scope reduction, not a completed converter or adoption proof.

### 5.1 Reduced target amendment — PO approved 2026-09-20, bounded implementation

The map-2 field/command/package path is implemented in the existing limited
services and host; [todo](../../tasks/todo.md) records its executed checks.
This is not an implemented initial converter, ordinary entry, formal content
profile or browser/device/offline adoption.

**PO-approved direct-creation extension (2026-10-15):** fresh static GLB/PNG
Projects created in the existing nondefault validation entry also use map-2,
schema 2.1 and summary-2. Select that profile explicitly at the admitted creation
call; do not change the global bootstrap default. Existing/received Projects,
prepared creation receipts and output/recovery jobs retain their original
proof/profile/bytes, including map-1. No old Project upgrade, new model/material
profile, ordinary-entry activation or deployment is authorized by this extension.

Use the following exact additions for fresh converted and these fresh directly
created Projects. They do not
authorize migration, activation or renderer support before their applicable checks.

| Data | Approved representation and behavior |
|---|---|
| Unplaced Caption | The closed `anchor: { kind: 'unplaced', ownerAssetId?: AssetId }` from 05 §9.4. No coordinates or fabricated owner. First placement explicitly changes this same Caption's anchor; text, media, memberships and ID survive. Strong owner/candidate retention and review/clean mapping change together. |
| Asset pin scale | Optional atomic `pinScale`, finite and within Native's existing inclusive 0.001–1000 range. Absence remains absent and renders as 1. It multiplies owned pin size, never coordinates, model transforms or camera values. |
| Inactive chroma | Optional boolean `appearance.chroma.enabled`; absence keeps the existing enabled meaning. `false` retains validated key/tolerance/softness but contributes neutral chroma coverage. Explicit disable/enable keeps those parameters. Alpha coupling and renderer capability checks use enabled state, not object presence. |

Keep ZIP container/wire `1`: entry paths, payload descriptors, purpose separation
and hashing need no replacement format. Use these explicit semantic combinations:

| Input/output lane | Adapter / snapshot | Summary |
|---|---|---|
| Existing causal files/jobs | `lociview-automerge-atomic-map-1`, unchanged historical field interpretation | `lociview-project-summary-1` |
| Fresh converted or explicitly admitted fresh direct GLB/PNG Project and its causal files | `lociview-automerge-atomic-map-2`, bootstrap schema `{ major: 2, minor: 1 }` | `lociview-project-summary-2` |
| Existing review files/jobs | `lociview-project-scene-review` version `1` | `lociview-project-summary-1` |
| New-profile review output | `lociview-project-scene-review` version `2` | `lociview-project-summary-2` |

Map-2 is a closed semantic-profile discriminator, not a new physical map layout:
reuse the existing atomic scalar encoding. Merely assigning minor 1 under map-1
is insufficient to preserve all existing inputs: the current header reader already
accepts arbitrary nonnegative minors. An old opaque `pinScale` or `chroma.enabled`
must not gain a new meaning, fail old-history summary verification, or become an
automatic migration because a library was updated. Keep map-1 validators and its
summary dictionary fixed. Summary-2 adds `assetsById.pinScale` and uses the new
anchor/material validators; review-2 carries the new closed shapes and unplaced
owner mapping. Do not change the immutable byte/hash interpretation of old files.

Implementation binding (independently reviewed 2026-09-20): map-2 additionally
requires exactly one immutable bootstrap root scalar `semanticProfile: 'map2'`,
using the existing canonical scalar encoding. This is a new-profile bootstrap
header, not a new record map or domain record field. Together with schema 2.1 it
binds the external adapter name to the hashed root bytes. Map-1's root allowlist
and exact operation count remain unchanged. Map-2 rejects an absent/wrong marker,
duplicate root writes and any later marker insertion, deletion or mutation,
including a subsequently restored value. Relabelling only the envelope must fail
in both directions; a late marker cannot upgrade an existing Project.
Retain this header scalar in original-byte/scalar evidence; omit it from normalized
domain history and treat it as structural only in summary-2. Clean reconstruction
expects that exact additional root scalar only for map-2. The two-change clean
initialization rule and existing map/container encoding are unchanged. A same-named
map-1 late unknown scalar remains opaque, never a profile selector.

Version selection follows retained source proof, snapshot and prepared manifest,
including cold retry. Never globally switch an old output job to the newest
builder: it must reproduce its original snapshot/manifest exactly. Existing job
and reconstruction formats need no bump when these retained inputs select the
builder unambiguously. Reject mismatched combinations before publication and
reject cross-profile receipt/history merging; do not rewrite roots or promote an
existing map-1 Project by changing its envelope. Existing map-1 Projects retain
their current operations, files and recovery path; the new fields belong only to
the explicitly new profile. This is not a Native/v1 continuing-update bridge.

Implementation acceptance reuses existing field/material, metadata/history and
file-job tests: old unknown/overwritten values and retries remain byte-identical;
new values survive edit, save/reopen, independent copy and current-format exchange.
Source-profile/material numeric mapping and exact recipe identity vectors remain
separate prerequisites of the connected converter, not solved by these additions.

### 5.2 Next recipe boundary (read-only findings; not ratified)

Prepare the first Native-only static-GLB/PNG conversion recipe as one bounded
proposal. Reuse admitted source bytes, current content inspection and metadata
initialization/recovery. The first subset may reject unsupported whole inputs,
but must not omit their records or silently narrow the overall Native requirement.
Use sources without any Native material-appearance records initially; equal current
settings do not justify collapsing occurrence-specific source material addresses.
Active Native chroma is not equivalent to the existing hard-chroma renderer even
with zero feather; inactive numeric parameters also need a faithful enable-time
mapping. Neither numeric copying nor map-2 alone resolves this renderer boundary.

Before durable conversion, ratify the exact source keys, canonical preimages,
full digests, collision checks, output kinds and golden vectors required by
05 §9. Retain the original container and raw documents, not reserialized parsed
snapshots; the reader supplies defaults and normalizes some presentation fields.
Allocate fresh Project/history identity once per explicit conversion and preserve
it, the mapping/report and exact generated changes in the existing initialization
workflow's narrow conversion receipt. Completed retry must not overwrite later
edits. No legacy-update baseline/control graph is required.

Recipe naming is part of that single compatibility proposal: 05 §9.3 reserves
`v1-project-scene-migration-recipe-1` for frozen-v1 conversion. A Native-only
descriptor must not consume that ID and later grow a different interpretation.
A separately named immutable Native companion is the proposed option, not an
approved or implemented format. Prepare its concrete descriptor/vectors and
independent review before requesting the grouped decision; do not ask the PO
to approve an unspecified hash/mapping algorithm.

### 5.3 Concrete first Native companion — PO approved 2026-09-21

This closes §5.2's first decision only. The approved immutable name is
native-project-scene-recipe-1; it does not consume the frozen-v1 companion name.
Approval permits one connected conversion/edit/file/reopen implementation in
the existing nondefault validation route, not ordinary-entry or profile adoption.
The bounded implementation is [the converter](../../src/projectFiles/nativeConversion.ts)
and [the exact mapper](../../src/projectFiles/nativeMapping.ts), connected through
the nondefault validation file-open form. This does not complete broader Native,
v1/LociMyu, ordinary-entry, browser/device or adoption acceptance. Current executed
evidence belongs in [todo](../../tasks/todo.md).

#### Input and faithful mapping

Admit only lociview-native-portable-backup versions 1/2 through
[the existing reader](../../src/nativeGs/portablePackage.ts). Its authoritative
entries are native/package.json, native/snapshot.json and the manifest-listed
native/representations/<id>.bin and native/media/<id>.bin. Never route by filename.
Native exchange packages and collaborationBaseline are outside this first subset;
reject the complete input with an explanation. They, frozen-v1/LociMyu, other
Native profiles and appearance conversion remain required later work.

Every retained representation, not just the visible/current ones, must be
meshPrimary with lociview-native-model-glb-v1, purposes ['source','display'],
identity representationToAsset (including reflection:'none') and no derivedFrom.
All model bytes must pass the current static-GLB inspector; all standalone and
embedded images must pass its existing PNG admission. Keep the current caller
budgets. Require no meshMaterialAppearances records, including inactive records.
The existing bounded executor, not the old profile label, justifies assigning
development-validation-glb-1 to a new representation. This is not a formal
supported-profile claim or permission to change that profile's meaning.
This recipe fixes its specificationSha256 to
077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f.
A change to these admitted-source or mapping semantics requires a separately
versioned companion; do not mutate recipe-1 after adoption.

The Native package reader checks the snapshot digest and binary inventory/size,
but not each model/media digest or content. Hash and inspect every declared body
once during preparation, including hidden, historical and unattached bodies;
reuse those owned results until the normal durable write/readback boundary.
Preserve exact body bytes and distinct source identities even when bytes match.
Reject the whole input on unsupported fields, missing bodies, invalid references
or values the target cannot represent. No silent truncation, text normalization,
camera/quaternion normalization, partial import or fabricated position.

| Source authority | Target rule |
|---|---|
| Project title/frame/unit; Asset labels and active bindings | Copy exact admitted values and mapped references. Never call prepareValidationProject, which creates one Scene and resets units/placements. Retain every admitted revision/binding/representation and pinScale presence/value. |
| DisplaySets and array order | Use inspected snapshot array order, not serializer sorting or comparison of old orderKey strings. Absent DisplaySets materialize Native's exact implicit Default set. Each set becomes a Scene; the effective persisted active set becomes defaultSceneId. |
| Asset visibility | Use the Native resolver's active, ready, nonhidden Asset result after complete content inspection. Do not interpret stored displayMode as a mask: Native derives its effective mode. Include this set in every Scene, ordered by snapshot.assets filtered by that set, not by sorted resolver Representation IDs. Hidden Assets remain Project resources. |
| Captions | Preserve title/body, owner/frame/position/revision/class references. Null anchor becomes map-2 unplaced with explicit owner, inferred only from the source's own placed anchor when applicable, or no owner. Check source/target needsReview parity; refusal is preferable to changing status by splitting classes. |
| Caption color | Preserve explicit RGB channels divided by 255; absence uses Native's actual #eab308 default, not the parser's validation-only white fallback. Raw absence stays in private source evidence. |
| Caption membership/order | Each Caption has membership in its exact effective source set. Filter the snapshot Caption array per set, retaining sequence. A hidden owner's Caption is not deleted or moved to another Scene. |
| Saved Views | Preserve owning set, camera/background and per-set source array sequence. Map a valid defaultSavedViewId; null means no target defaultViewId, never the first available view. |
| Media/attachments | One MediaResource per source media ID, including unattached media. One Attachment per source Caption attachment-array occurrence, preserving order; equal bytes do not merge MediaResources. altText is absent because Native has no such field. |
| Tags | Exact admitted tag text is its source identity, with no case folding/trim. One tag per exact text and one membership per Caption/text. Scan snapshot.captions in array order, then each Caption's tags array in order; first occurrences define global tag orderKey. Per-Caption tag order has no target field: require source arrays to be subsequences of that global order, otherwise refuse this first subset rather than lose order. Tag color remains absent. |
| Original GLB materials | Reuse the inspector's source locators/semantics and preserve intrinsic GLB bytes. Generate typed catalog/layout/slot IDs, not Native occurrence overrides. Missing native appearance support is not solved by merging equal-looking slots. |

For each ordered target collection use zero-based source rank:
'A' + rank.toString(36).padStart(8,'0'). This applies to Scenes, each Scene's
Asset/Caption memberships, per-Scene Views, attachments per Caption, and global
tags. Keep old keys and resolved ranks privately. Presentation-only fields such
as captionTargetAssetId are source evidence, not shared Project edits.

All resulting records, graph relations and content facts must pass the existing
map-2 provider. Native accepts looser rotation/up-vector tolerances than the
target; do not silently repair these. Shared family/class/frame aliases that
cannot pass the current graph/content checks block this subset. In particular,
do not create different class IDs per revision to conceal a missing equivalence
proof or turn an originally valid pin into needsReview. Existing map-1 files,
readers and jobs are not modified.

#### Exact scoped identity recipe

Allocate conversionId as a fresh lowercase 32-hex value once after confirmation;
projectId is 'prj_' + conversionId. Allocate historyEpoch and lineageSeed once
using the current initialization mechanism, then retain the exact metadata bytes.
An independently requested conversion gets a different conversionId and lineage,
even for identical input. Retrying this conversion reuses all captured values.

For each record/reference ID, the exact preimage is UTF-8 (no BOM):

    "lociview:native-project-scene-recipe-1:id:jcs-v1\n"
    + JSON.stringify([conversionId, sourceZipSha256, outputPrefix, sourceKey])

The escape above denotes one LF byte. sourceZipSha256 is the lowercase SHA-256
of the complete unchanged input container. All sourceKey values below are arrays
of exact admitted Unicode strings, nonnegative safe integer indices, or nested
keys; there are no object-order or delimiter ambiguities and no trailing newline.
Compute all 32 digest bytes. The wire ID is outputPrefix + '_' + the first 32
lowercase digest hex characters. Retain full digest and full preimage in the local
mapping; any reused short ID with unequal full digest OR preimage is a blocking
collision, not permission to salt, merge or overwrite. Identical keys reuse IDs.

| outputPrefix | Closed sourceKey |
|---|---|
| ast / rev / bnd / rep / cap / med / view | ['asset',id] / ['revision',id] / ['binding',id] / ['representation',id] / ['caption',id] / ['media',id] / ['view',id] |
| frm | ['frame',nativeFrameId]; preserve all explicit aliases, reject incompatible sharing rather than split them |
| fam | ['family',nativeAssetId,nativeFamilyId] |
| cmp | ['anchor-class',nativeAssetId,nativeClassId]; shared within that Asset across revisions, subject to existing equivalence checks |
| scn | ['display-set',effectiveNativeSetId]; implicit set uses set_00000000000000000000000000 |
| sam / scm | ['scene-asset',effectiveNativeSetId,nativeAssetId] / ['scene-caption',effectiveNativeSetId,nativeCaptionId] |
| att | ['attachment',nativeCaptionId,sourceArrayIndex,nativeMediaId] |
| tag / tgm | ['tag',exactTagText] / ['caption-tag',nativeCaptionId,exactTagText] |
| lay | ['material-layout',nativeRepresentationId] |
| slot | ['material-slot',nativeRepresentationId,'gltfMaterial',materialIndex] or ['material-slot',nativeRepresentationId,'representationMaterial',0] for the inspector's implicit material |
| evt | ['initial-event',owningRecordOutputPrefix,owningRecordSourceKey]; active lifecycle reason is initial |

Model revision provenance uses origin:'import', sourceMediaType:'model/gltf-binary'
and the sorted distinct body digests of its exact representationIds; do not invent
parents or timestamps. Other immutable payload digests use the existing
immutableDigest builders after all references are mapped. Derived representation
bounds/catalogs come only from admitted bytes. No materialOverrides are generated.
All other optional fields without source data remain absent.

Synthetic identity vectors (not private inputs or assertions of valid source ZIPs):
conversionId is 32 '0' characters and sourceZipSha256 is 64 '1' characters.
For each row the target ID follows the formula above; hashes cover the full
preimage, including the prefix and LF. These were calculated with Node SHA-256.

| Prefix and sourceKey | UTF-8 bytes | Full lowercase SHA-256 |
|---|---:|---|
| cap, ['caption','cap_00000000000000000000000001'] | 203 | f1be0614826b7daa9f6d470193829e54bc09ddac17e6aa697e07227252844a8f |
| scn, ['display-set','set_00000000000000000000000000'] | 207 | 519c529e6d755a3998beb6dfda85c4e03a2bead7a989a81c1882db9a69c95d15 |
| att, ['attachment','cap_00000000000000000000000001',0,'med_00000000000000000000000001'] | 241 | 51269b1dab7f424afd57923b69c5a2ae8d0688313e690beb8819220387603181 |
| tag, ['tag','記録'] | 175 | 951d88c365fa03ead6179c6a99bd92efdb2f9fecbcced50323a4966e169b4725 |

#### Initialization and user flow

Use the existing file-open intent, with a short conversion preview (model/Scene/
Caption/media counts and blocking issues), then '新しいプロジェクトに変換' or
cancel. State that the source stays unchanged and the team uses the converted
file thereafter. No user selection of recipe, profile, hash or internal IDs.

Reuse OriginBlobStore and the validation initialization/journal recovery beneath
a conversion-specific preparation adapter. Do not call clean-import or introduce
a new merge/journal purpose. A single local immutable conversion receipt binds
recipe ID, conversionId/destination, original ZIP length/digest, raw manifest and
snapshot length/digests, exact mapping/report, and the existing initialization
bytes' proof/length/digest. Original ZIP and raw JSON remain private source
evidence; raw documents may be retained within the unchanged container, not
re-serialized copies. Keep this evidence outside ordinary model/media inventories;
never automatically include it in Workspace/Contribution/backup/review/clean files.
The preview/report must explain this exclusion; the unchanged original is still
needed as the source archive. Do not add another generation/history subsystem.

Persist the frozen receipt, original source and exact initialization before
publishing a ready Project. Missing/torn acknowledged input is a visible recovery
failure, not regeneration from parsed values. Reuse the same destination and
original change bytes on retry; a completed retry observes the existing Project
and must not reset subsequent edits. No automatic source deletion or cleanup.
Precise local paths and implementation wiring follow the approved receipt
semantics; the normal file format and output jobs remain unchanged.

Implement one connected slice: Native file → preview → converted
Project → edit/first-place Caption → named save and Workspace → reopen. Reuse
existing file/service tests: a representative multi-Scene file with hidden model,
unplaced Caption and repeated-media identities; rejection without publication;
one interrupted/resumed initialization and completed retry after later editing.
The immutable identity vectors are part of these existing tests, not a new test
framework/page or a full roundtrip per field. During editing filter the changed
case; final code checks/review run once at the connected outcome. Human checks
stay grouped with the existing static build/adoption boundary.

The next appearance extension is a separate
[companion](07a-native-appearance-conversion-proposal.md), PO ratified 2026-10-15
for bounded implementation. It does not change recipe-1's restrictions or identity.

### 5.4 Frozen-v1 concrete companion — PO ratified 2026-10-15

The [first frozen-v1 ProjectScene companion](07b-frozen-v1-conversion-proposal.md)
defines a closed static-GLB/PNG input, exact source keys/identity vectors, faithful
Scene/Caption/media/perspective-View mapping, private raw-source retention and
exact initial-source recovery. It records the observed default-View/material-key/
malformed-import discrepancies rather than changing the frozen contract. This is
PO-approved bounded implementation contract, not a passed migration/storage/profile
gate. Broader initial conversion remains required; todo owns executed evidence.

## 6. Acceptance and historical evidence

Reuse the existing source/file/session tests and grouped device acceptance:
faithful initial Native/v1/LociMyu mapping, original-byte preservation,
known-owner/ownerless unplaced records, explicit placement, failure/cancel/retry,
edit/save/reopen, and new-format team exchange after conversion.

Retain SCN-MIG-01–04/06 where applicable and add SCN-MIG-07's cutover check in
specification 05. Retire bridge-only portions of STO-PKG-11, STO-MIG-10/15/16 and
G0-FX-21B–E as recorded in their owners. Retirement is not PASS. Do not rerun or
expand isolated legacy-bridge PoCs to finish one-time conversion.

The full superseded draft, including former §§2–11 and Native field-mapping
analysis, is retained verbatim in Git at
`e3830ef:docs/specs/07-project-scene-migration.md`.
Use `git show e3830ef:docs/specs/07-project-scene-migration.md` for a specific
historical evidence question. Those protocols, numeric proposals and approvals
requested there must not be reconstructed as the active work queue.
