# Frozen-v1 initial ProjectScene conversion companion

Status: **PO ratified 2026-10-15 — approved for bounded implementation, not adoption.**
PO authorized this exact recipe/subset after independent review under [05 §9](05-project-scene-team-workflow.md#9-migration)
and [07](07-project-scene-migration.md). It does not amend the frozen v1 reader,
`v1-migration-recipe-1`, existing Native recipes, Projects or interrupted jobs.
Current work, review and checks belong to [todo](../../tasks/todo.md).
The exact subset below is implemented in the isolated validation composition and
exercised through conversion preview, product edit/first placement, file handoff
and cold recovery with synthetic GLB/PNG, memory storage and recorded DOM. The
serial checks and HTTP build identity pass; browser/GPU/device/offline and
anonymized-real-source acceptance remain pending. This is bounded implementation,
not full v1 conversion or ordinary-entry/profile/storage adoption.

## User outcome and decision

The approved `v1-project-scene-migration-recipe-1` covers the bounded file workflow below:
open a self-contained frozen-v1 GLB/PNG Project ZIP → inspect conversion effects →
create a new Project with Scenes, Captions, media and perspective Views → edit,
place an unplaced Caption, save a named backup/Workspace and reopen independently.
This approves that implementation in the existing nondefault validation route;
ordinary entry, general formats, device/storage/profile adoption and release keep
their gates. The whole initial-v1 requirement is larger than this first subset.

## Read authority and closed input

Use safe container/manifest inspection and the frozen parser/reducer, without
opening a writable ProjectStore or importing the old ZIP into a workspace first.
`ops/*.jsonl` is authoritative; snapshot.json and captions.csv are caches. Preserve
the selected ZIP and its raw manifest/log bytes privately, never reconstructed
from normalized operations. The source file is unchanged on every outcome.

Distinct valid operations reduce by frozen HLC/field-LWW/update-wins rules. This
is the source's defined effective state, not a new target conflict-resolution
policy. Identical duplicate operations may coalesce for reduction while every
original line stays in the private ZIP. Different canonical contents for one
`(actor, op)`, any parse/actor/active-field diagnostic, unknown kind/field (including
nested unknown fields), or unsupported source value refuses the whole conversion.
Inspect every retained operation, including overwritten/deleted records, before
making a DTO. Refusal is this converter's closed admission, not a restriction of
the frozen reader's forward-compatible preservation contract.

Admit a schema-1 `lociview-project` manifest with its valid canonical project ID
and exactly format/schemaVersion/projectId/name/createdAt/generator members,
and at least one active static GLB model. Apply current file/metadata/container
budgets. Every active model/image must have a safe registered path and its exact
body in this ZIP. Detect GLB/PNG by checked bytes; a present nonempty MIME must
agree, and present size/SHA-256 must match. No fetch, file-name model matching,
missing-resource placeholder or re-encoding. All source entries are accounted
for as active payload, raw log, cache, deleted/unlinked payload or unsupported
entry; unknown metadata authority and unaccounted entries block publication.

The first subset has no material records, optimizedPath or nonidentity model
transform in any retained operation, no active meta record and no unsupported
asset kind. Profiles may contain only displayName/defaultPinColor. Their values,
old actor/user attribution and timestamps, and deleted records remain private
source evidence with explicit preview counts; they do not become new team
authority or disappear into an unreported omission. No legacy history is exported
inside a new-format Workspace. Require the same target field validators without
truncation, replacement names, invented coordinates or silent repairs.

## Exact mapping

All source IDs/text below are exact Unicode scalar strings, with no trimming,
case folding or NFC normalization. Equal bytes under distinct source asset IDs
remain distinct resources. The new source uses map-2/schema 2.1 and the existing
exact `development-validation-glb-1` reference; there is no new render profile.

| Source | Target and admission |
|---|---|
| Manifest name | Exact Project title. New Project/history identity, separate from the old project ID. Project, asset and representation frames are right-handed, +Y up, unit unknown. |
| Active model asset | One visual Asset, one revision, binding, mesh family, anchor class and static GLB Representation; exact originalName becomes Asset.label. A transform may be absent or contain only scale/upAxis/offset; absent components mean 1/'Y'/[0,0,0]. Every supplied component must equal that identity value (including the usual `{scale:1,upAxis:'Y'}`). Other values are outside this recipe. Preserve optional pinScale under the existing map-2 range. |
| GLB catalog | Existing inspected glTF-material/implicit locators and source semantics; original GLB bytes and surface identity. Layout/slot IDs use the table below. No occurrence reinterpretation without source material adjustments. |
| Image asset | One PNG MediaResource per source asset ID, including images not attached to any Caption. Exact bytes/digest/length; exact originalName as label. |
| Active set | One Scene, exact name. Require finite numeric order and unique order values; sort ascending. Missing/tied order is unsupported in this first recipe, avoiding locale/insertion-order guesses. At least one active set is required. |
| Startup/visibility | The first ordered Scene becomes defaultSceneId; old activeSetId is local and is not in the ZIP. Every active model belongs to every Scene, as in the frozen v1 display. No guessed hidden flags. |
| Caption | Exact title/body, including empty strings; explicit #RRGGBB color becomes its three integer channels/255. Require exact active setId. Absent tags/attachments means empty. Require a retained create and nonnull reducer createdAt, unique among active Captions in that Scene; order by that HLC. Update-only entities/ties are outside this subset, avoiding an invented tie order. |
| Positioned anchor | Exact active modelAssetId plus finite model-local position. Map owner/frame/revision/class without a pick. Optional finite normal remains private redundant evidence, explicitly counted. Other anchor members are unsupported in this subset. |
| Unplaced anchor | Only absent/null anchor, or an exact modelAssetId with the position member absent, becomes unplaced (known owner retained when present). A present null position is invalid under frozen active-field rules and is refused. Dangling owner, malformed/partial position and unsupported anchor fields refuse the input; do not turn a broken positioned pin into an unplaced one. |
| Tags | Preserve exact distinct labels, with no NFC coalescing. Duplicate labels inside one Caption refuse this subset. One project Tag per exact label, ordered by code units; one membership per Caption/label. |
| Attachments | Resolve every array entry to an active PNG asset; preserve each occurrence and index, including repeated references and equal-byte distinct resources. One target attachment per source array index. No deduplication. |
| View | Exact active setId/name, finite nondegenerate eye/target/up, ortho:false, valid fov in degrees and explicit #RRGGBB background. Preserve vectors, use `fov * Math.PI / 180`, solid background. Require a retained create and nonnull createdAt unique among active Views in that Scene; order by that HLC. Orthographic span is unavailable and must not be guessed. |
| Entry View | Only sets with defaultViewId absent/null and defaultCameraState absent are in this subset. Choose the same-set active View with greatest lastWrite HLC; ties for greatest lastWrite refuse this subset. With no View, omit target defaultViewId (never persist null). Explicit default relations remain outside this recipe pending the discrepancy below. |
| Deleted records/cache/unlinked payload | No active target record; count each category and retain the original bytes privately. Never use cache rows to restore deleted content. The preview distinguishes imported content from source-only evidence. |

Known source field sets are: set `name/order/defaultViewId/defaultCameraState`;
model asset `kind/path/originalName/mime/size/sha256/transform/pinScale`;
image asset `kind/path/originalName/mime/size/sha256`;
Caption `setId/title/body/color/tags/attachments/anchor`;
View `setId/name/cameraState/background`; profile `displayName/defaultPinColor`.
Operation envelope keys retain the exact frozen schema. Require source strings
and required fields used above to satisfy both frozen and target validation.
Absent optional fields have only the defaults explicitly listed here. Any target
graph/capability/duplicate/reference rejection blocks the complete input.

Order keys are `A` followed by an eight-digit lower-case base-36 zero-based rank
within the relevant ordered list. Metadata/file budgets bound that rank. Scene
model memberships use exact source model-ID code-unit order. Attachment order is
array order. Source-only counts and raw values remain in the private report.

## Immutable identity grammar

Allocate one fresh 32-lowercase-hex conversionId at confirmation, once. The new
Project ID is `prj_` + conversionId; historyEpoch and lineageSeed are fresh,
captured once with the exact initial source. No source record ID is reused.

For every row in the table, the UTF-8 preimage has no BOM/final newline:

```text
lociview:v1-project-scene-migration-recipe-1:id:jcs-v1\n
```

Here `\n` denotes one LF followed immediately by the compact JSON serialization
of `[conversionId, sourceZipSha256, prefix, sourceKey]`. The displayed code block's
line ending is not a second LF. Arrays contain only the specified strings and
nonnegative safe integers. The complete SHA-256 binds the exact preimage;
the target ID is `prefix + '_' + sha256.slice(0,32)`. Retain full digest/preimage,
reuse only exact matches and refuse any shortened-ID collision.

| Prefix/output | Source key |
|---|---|
| frm / Project frame | `['project-frame',sourceProjectId]` |
| ast / visual Asset | `['asset',modelAssetId]` |
| frm / Asset frame | `['asset-frame',modelAssetId]` |
| rep / Representation | `['model-representation',modelAssetId]` |
| frm / Representation frame | `['representation-frame',modelAssetId]` |
| rev / revision | `['model-revision',modelAssetId]` |
| bnd / binding | `['model-binding',modelAssetId]` |
| fam / mesh family | `['mesh-family',modelAssetId]` |
| cmp / anchor class | `['anchor-class',modelAssetId]` |
| lay / material layout | `['material-layout',modelAssetId]` |
| slot / material slot | `['material-slot',modelAssetId,'gltfMaterial',materialIndex]` or `['material-slot',modelAssetId,'representationMaterial',0]` |
| med / MediaResource | `['media',imageAssetId]` |
| scn / Scene | `['set',setId]` |
| sam / model membership | `['scene-asset',setId,modelAssetId]` |
| cap / Caption | `['caption',captionId]` |
| scm / Caption membership | `['scene-caption',setId,captionId]` |
| att / attachment occurrence | `['attachment',captionId,arrayIndex,imageAssetId]` |
| tag / Tag | `['tag',exactTagText]` |
| tgm / tag membership | `['caption-tag',captionId,exactTagText]` |
| view / Saved View | `['view',viewId]` |
| evt / initial lifecycle | `['initial-event',outputPrefix,sourceKeyOfThatRecord]` for lifecycle-bearing records only; no recursive event |

All newly initialized mutable records use active/initial lifecycle with that event
ID. Immutable records use the existing domain canonical payload/digest rules,
not a new serialization. Receipt mapping uses this closed grammar only.

### Exact identity/record vectors

Set conversionId to 32 zeroes and sourceZipSha256 to 64 ones. The following are
normative for this proposed recipe; lengths count full UTF-8 preimages.

| Prefix | Source key | Bytes | Full SHA-256 |
|---|---|---:|---|
| scn | `['set','set_00000000000000000000000001']` | 205 | `6002ade76d76b399b47c13171a906e9f430c72cced393a5e7fc887ae8f5b0df2` |
| cap | `['caption','cap_00000000000000000000000001']` | 209 | `71172724b941b0de1371357e84cf734752732d584f534b41679ac86dba90555a` |
| rep | `['model-representation','ast_00000000000000000000000001']` | 222 | `395a5d5d855c7c53a72aa3b7b6473d4c6cc25d09410126adb32e195c63d0acb7` |
| slot | `['material-slot','ast_00000000000000000000000001','gltfMaterial',0]` | 233 | `9807e61650396c6f6ea3841de7a3777ec711cf2f8dfc73df20da121095acbfa0` |
| att | `['attachment','cap_00000000000000000000000001',1,'ast_00000000000000000000000002']` | 247 | `420c7df9b3b2b6584b14ed2195efc331153e0d1fe0fdc1df3fed9f79d581d695` |
| evt | `['initial-event','cap',['caption','cap_00000000000000000000000001']]` | 233 | `c873e9d09f153fd3b25f099f48f1334c7cb32e28d391e04724b6e6b32158ecd9` |
| tag | `['tag','記録']` | 181 | `d34965dc02d8a4e9c6169bb4960c5de514495a74c1ad1584cf024d0a00fcdc18` |

One target Caption canonical JSON vector, exactly 222 UTF-8 bytes, no final LF:

```json
{"anchor":{"kind":"unplaced"},"body":"","colorSrgb":[1,0.5,0],"id":"cap_71172724b941b0de1371357e84cf7347","lifecycle":{"eventId":"evt_c873e9d09f153fd3b25f099f48f1334c","reason":"initial","state":"active"},"title":"記録"}
```

Its SHA-256 is `a4ac695e46196f5b6eacc5fffb55b9eeba5d5c153df8e4f438c229c7f43e0bf3`.
This is a record vector, not a promise of deterministic Automerge changes or a
transport-ZIP hash. Generated history is captured once and resumed byte-for-byte.

The admitted operation inventory coalesces only exact decoded semantic duplicates
using the existing operationAdmission canonical rule, sorts unique operations by
actor code units then numeric op, and encodes that array as compact canonical
JSON (recursive object-key code-unit sort, array order retained, JSON number/
string spelling, no BOM/final LF). Count and SHA-256 bind these bytes; raw-log
path/length/digest separately binds original whitespace/line endings. This does
not replace the private raw source or prescribe new frozen writer output.

An inventory grammar vector is exactly 257 UTF-8 bytes, no final LF:

```json
[{"actor":"a_0000000000001","e":"caption","hlc":"2026-10-15T00:00:00.000Z-0000-a_0000000000001","id":"cap_00000000000000000000000001","op":1,"t":"create","user":"","v":{"body":"","color":"#ff8000","setId":"set_00000000000000000000000001","title":"記録"}}]
```

Its SHA-256 is `aee286ea771eeb31b55abd6c715d761bf7e74039ea3bd6cdc638e8b2c5e0c3a1`.
It is an encoding vector, not a complete admitted source ZIP (the referenced set
and a model are not in this small vector).

## Persistence, ports and acceptance

Use a bounded `projectFiles` read/plan/map module, existing safe ZIP inspection,
frozen core JSONL/reduction and GLB/PNG inspectors. The module may read those
layers and the accepted metadata/blob/initialization services; no UI imports or
viewer dependence on package/storage. The UI receives summary/issues and a
confirmed preparation object, then existing typed Session/provider ports. No
Native intermediate export/import, ProjectStore dispatch, storage write from UI,
parallel conversion framework, dependency or directory-wide import allowlist.

The private write-once receipt binds recipe, original ZIP length/digest, raw
manifest/log fingerprints, admitted operation inventory, conversionId/projectId,
closed full mapping/report, exact initial proof/bytes and required payload refs.
Validate all source/initial/receipt bindings before publication or cold recovery;
reject missing, changed or incompatible acknowledged evidence without repairing
it. A receipt alone cannot change the retained recipe/source. Write/read back
the original and exact initial source, put verified bodies through OriginBlobStore
and publish only through existing metadata initialization/journal. Persist/cold
retry uses captured IDs/changes; completed retry preserves later target edits.
New v1 conversions bind `originRecipe: 'v1-project-scene-migration-recipe-1'` in
a closed `validation-initial-2` initial receipt and an independent write-once
`validation-origin-1` marker binding that recipe and exact initial proof/length/
digest. Cold routing must retain this obligation if both private conversion files
are lost, including a downgrade of the initial receipt alone. Generic creation
recovery refuses either binding; converter recovery checks their agreement.
Existing `validation-initial-1` bytes/read behavior stay unchanged.
Keep private source/report out of backup/Workspace/review/Clean outputs.

Use one code-generated success ZIP (GLB, equal-byte distinct PNG assets, two sets,
placed/ownerless/known-owner-unplaced Captions, ordered/repeated attachments and
perspective Views) through preview → confirmation → product edit/first placement
→ named backup/Workspace → independent receiver/review/cold reopen. Exercise
representative initialization interruptions and completed retry, exact source
preservation, wrong mappings and whole-input refusal. Independently review the
meaningful final diff and run the required serial checkpoint. Browser/device/
offline acceptance stays separate and does not depend on repeated PO microtests.

Existing fixtures/v1-migration oracles/ZIPs are pre-recipe characterization and
transport identities, with unknown fields, materials/orthographic Views and stale
caches. Keep their bytes/oracles unchanged; use them as explicit refusal/old-reader
regressions, not a success oracle for this subset. Synthetic success vectors do
not satisfy anonymized-real-source STO-MIG-01 or profile/storage adoption.

## Recorded discrepancies and remaining scope

Frozen [v1 §5](../02-data-format.md#5-エンティティスキーマ) specifies explicit
defaultViewId priority; current viewerScreen chooses latest lastWrite instead.
This proposal does not choose between them: nonnull explicit defaults and inline
defaultCameraState refuse this subset. Their faithful mapping remains required.
Likewise the documented vs implemented material-key/address and transformed-pin
semantics require a later concrete companion; material records and nonidentity
transforms are excluded here. Do not silently redefine the frozen contract.

The existing new-project importer rejects malformed log lines while read-only
inspection and opened-source paths can preserve/report them. This converter's
explicit fail-closed admission does not claim to resolve or amend that discrepancy;
it never calls the old writable import as a substitute for raw-source inspection.
Broader v1 fields/resources, Native opacity/chroma/profiles/exchange and LociMyu
conversion remain required. No old-format update bridge is revived.
