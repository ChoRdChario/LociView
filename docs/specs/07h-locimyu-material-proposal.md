# LociMyu Scene material conversion companion

Status: **PROPOSED — not ratified, not implemented or adopted.**
This is an additive target/identity companion to [07c](07c-locimyu-project-scene-conversion-proposal.md),
using the already accepted source ABI in [04 §4.1](04-locimyu-conversion.md#41-sheet-relationships).
It does not reopen that source authority or claim original-producer/real-input
parity from synthetic receiver tests. [Todo](../../tasks/todo.md) owns active work.

## Decision and connected outcome

Proposed immutable recipe: `locimyu-project-scene-migration-recipe-4`.
One selected LociMyu workbook plus its one static GLB → inspect the material
consequence → convert the source Scene's shading/sidedness → edit → named backup/
Workspace/review → actual selected-generation restore/edit/cold reopen.

Ratification would approve the new Scene/slot mapping and identity domain below,
with this explicit limit: only opacity exactly 1 and disabled chroma are admitted.
Disabled chroma color/tolerance/feather stay in the original ZIP and item-named
private report; they do not become editable target chroma values. Switching color
transparency on later uses the target editor's values, not those source settings.
No Native quantizer or square-root threshold formula is borrowed for LociMyu.
Active chroma, fractional opacity and other appearance/compositing need later work.

Existing 04 name fan-out is normative. The bounded Native receiver and synthetic
tests substantiate its implementation, not the unavailable original producer or
general GPU/device parity. This proposal adds no external-repository evidence gate.
Ordinary entry, renderer adoption and grouped browser/device evidence remain open.

## Exact source selection and refusal subset

Inherit 07c's owned ZIP/workbook bytes, source candidate choice, exact title,
`locimyu-caption-id-2`, all-or-nothing relation confirmation, admission, budgets,
row encounter ordinals and complete source-only accounting. No writable Native
intermediate or lossy/guessed GID map becomes authority.

Use the existing `__LM_MATERIALS` decoded columns: materialKey 0, opacity 1,
doubleSided 2, unlitLike 3, chromaEnable 4, chromaColor 5, chromaTolerance 6,
chromaFeather 7 and sheetGid 13. Cells use LociMyuTrimV1. Empty booleans are false;
true/1/yes/on and false/0/no/off are case-insensitive exact values. Blank opacity
is 1; blank tolerance/feather are 0; blank color has the existing source default
black. Nonblank opacity/tolerance/feather must be finite in [0,1], color an exact
six-digit hex value and booleans valid. Invalid rows remain reported/inactive as
under 04; this does not repair them into accepted values.

For each authoritative GID/materialKey pair, only its last nonempty decoded row
is current. Keep superseded rows, timestamps, extra fields and raw cells in the
original inventory/report. A missing/unresolved GID/key, invalid row or zero exact
material-name matches remains inactive/reportable, including with fractional
opacity/chroma data. Do not turn these already-inactive inputs into new recipes.

Establish exact targets only from the selected GLB Scene's checked surface ranges.
For each range use its nodeIndex/primitiveIndex → GLB node.mesh → primitive.material
index. The admitted GLB catalog proves that explicit `gltfMaterial` locator and
source semantics. Apply exact case-sensitive LociMyuTrimV1 matching of the source
material name; no path alias, substring, case folding or unused/nonselected
material definition can supply a match. Primitives using the implicit default
material have no source material name and cannot be named targets.

Select new recipe-4 iff at least one row meets the **existing old refusal**:
nonempty key, exact/confirmed active GID, current valid row and at least one exact
selected-surface material-name match. Determine this before the supported-subset
test below. A matching no-op still selects 4. Otherwise preserve current recipe
3 → 2 → 1 byte/profile/dispatch rules. Never discard an unsupported active row or
retry an old recipe after new4 refusal. Old1–3 retained planner/report behavior,
including zero-match inputs, stays unchanged.

For recipe-4, require every such active row in every Scene, including a noncurrent
Scene, to have opacity exactly 1 and chromaEnable false. Every addressed slot's
sourceSemantics must equal exactly:

```json
{"coverage":{"kind":"opaque"},"optics":"surface","lighting":"lit","doubleSided":false}
```

Any unsupported active row/target blocks the whole input before publication;
unaddressed source material semantics remain unchanged. New4 requires exactly one
decoded table named `__LM_MATERIALS` after LociMyuTrimV1: duplicate material-table
authority or any duplicate canonical row/target mapping must refuse rather than
invent a first-table winner or extend the key grammar. This adds no new refusal
to already inactive old1–3 inputs.

## Target mapping and identity

Use map-2/schema2.1 and all 07c records/frame/local-pin/media/View rules. Keep the
original GLB bytes and each Representation's actual admitted PNG/JPEG base profile;
do not use an occurrence profile or change GLB material catalog/slot semantics.
WebP/GIF remain Caption media only, under the approved photo companion.

For every selected source row expand to each **distinct matching materialIndex**.
Repeated occurrences of one index share its existing logical material slot;
different material indices with the same exact name all receive the adjustment.
There is one override per source Scene and logical slot, with routing:
`scope={kind:'scene',sceneId}` and target `{assetId,variantFamilyId,materialLayoutId,logicalMaterialSlotId}`.
No Project-wide override or guessed ownership is introduced.

Each override is active/initial and has exactly this intent, where B is the parsed
source doubleSided and U the parsed source unlitLike:

```text
appearance = {opacity:1,doubleSided:B,lighting:U ? 'unlit' : 'inherit'}
compositing = {coverage:{policy:'inherit'},optics:'inherit'}
```

Omit chroma entirely. Do not substitute baseColor, force coverage/optics or bake
material values into GLB bytes. Keep original unused chroma/roughness/metalness/
emissive/timestamp/user fields as named source-only report entries, including in
otherwise converted rows. A ready preview states the source-derived intended
counts of affected Scenes/slots and, when present, that disabled color-transparency
settings stay only in the original ZIP/report. A blocked preview states the
affected field/reason without claiming admitted counts. Cancel creates no Project,
journal, CAS acknowledgment or job.

Inherit all 07c source keys and output kinds, adding only the following. R is the
decoded `__LM_MATERIALS` row ordinal with header1 (R≥2), S the admitted Caption
sheet identity `[kind,value]`, P the exact model archive path, i its nonnegative
safe materialIndex. Workbook path is already bound by the five-element preimage.

| Prefix/output | Exact sourceKey |
|---|---|
| ovr / Scene material override | `['material-row','__LM_MATERIALS',R,S,P,'gltfMaterial',i]` |
| evt / initial lifecycle | `['initial-event','ovr',sourceKeyOfThatOverride]` |

The new UTF-8 preimage, no BOM/final LF/Unicode normalization, is:

```text
"lociview:locimyu-project-scene-migration-recipe-4:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,workbookPath,outputPrefix,sourceKey])
```

The escape is one LF. Target ID is prefix+'_'+SHA256.slice(0,32). Retain full
preimages/digests; reject cross-prefix full-digest collisions, shortened-ID
collisions and incompatible entity/key bindings before writes. Exact repeated
lookup/reuse of the same entity is allowed. Mapping evidence sorts by ASCII target
ID, independent of digest completion. Old1–3 IDs, jobs and recipe literals remain fixed.

### Golden vectors

Fix conversionId=32 zeroes, sourceZipSha256=64 ones, workbookPath=`data.xlsx`,
S=`['legacyGid','0']`, P=`models/model.glb`. Full preimage UTF-8 bytes and SHA-256:

| Prefix | Exact sourceKey | UTF-8 bytes | Full SHA-256 |
|---|---|---:|---|
| scn | `["sheet",["legacyGid","0"]]` | 209 | `59ff2772d300d78706716ca19f75f70045b7302a6b0dbe6fa2fa1299d0c15089` |
| slot | `["material-slot","models/model.glb","gltfMaterial",0]` | 236 | `60f6a147cb0c97b0468f11c30d3c842bf9300466b62d9f8c2bbced464ff05ceb` |
| ovr | `["material-row","__LM_MATERIALS",2,["legacyGid","0"],"models/model.glb","gltfMaterial",0]` | 271 | `6c87aaa71895f04068369f3e46949c36e1ea135649e783c2861a5bea51e8c63d` |
| ovr | `["material-row","__LM_MATERIALS",2,["legacyGid","0"],"models/model.glb","gltfMaterial",1]` | 271 | `62ad578b33f159bf525f2344f308b879becb6fb2fb1596bdcb06256323de5370` |
| evt | `["initial-event","ovr",["material-row","__LM_MATERIALS",2,["legacyGid","0"],"models/model.glb","gltfMaterial",0]]` | 295 | `40e77545e25b8d1428fc194afe4e9b7a008ba771c0b53cc98d73ebae322e40a9` |

## Private witness, source binding and recovery

Only new4's separate private report adds mandatory `materialEffects` and
`materialMappings`. Before create, inherit 07c's no-real-identity meaning:
`materialMappings=[]`, targetIdentity/initialProof=null and no binding placeholder
IDs, including a zero-identity preview map. For a ready plan, materialEffects is
exactly `{scenes,overrides,sourceOnlyChromaRows}`: distinct affected Scenes,
distinct Scene/slot overrides and active accepted rows with a nonempty cell in
columns5/6/7 respectively, as nonnegative safe integers. It describes intended
effects before publication; it is not a saved-state assertion. For a blocked plan
materialEffects is null and ordinary field-named issues explain the refusal.
Once matched/current/valid presence selects new4, keep `report.recipe` as new4
even if the subset/target check later refuses; do not fall back to an old report
domain when plan=null. Old1–3 report shapes and selection remain unchanged.

Only after create captures exact initial source/identity/proof does
materialMappings become the complete array, sorted by ASCII targetOverrideId.
Every captured-initial report has the ready materialEffects and complete witness,
whether later persistence publishes successfully or requires recovery. Each
closed witness row has exactly:

```text
{sourceTable,sourceRow,sceneSource,modelPath,modelBlob,formatProfile,materialIndex,
 materialKey,targetSceneId,targetRepresentationId,targetMaterialLayoutId,
 targetLogicalMaterialSlotId,targetOverrideId}
```

sourceTable is `__LM_MATERIALS`, sourceRow is R, sceneSource is S, materialKey the
exact trimmed row name, modelBlob the exact `{digest,byteLength,mediaType}` and
formatProfile the actual `{id,specificationSha256}`. Every field derives from the
owned workbook/ZIP, selected-surface proof and captured **initial** target records.
The complete source raw inventory binds lighting/sidedness and inactive numbers;
the full expected-record comparison binds the intent and lifecycle. No supplied
mapping, public verified bit or target name can substitute for this derivation.

The existing closed receipt shape may retain this witness inside its report;
do not add a parallel evidence store. Require the exact new literal in the closed
conversion/initial2/independent origin readers. Before persistence, cold publication
and explicit converter completed retry, validate original bytes/fingerprints,
selection/title/ordered confirmation, all source identity evidence, the complete
closed witness/report/mapping and expected initial records against captured
Project identity/proof/initial bytes. No regenerated IDs, initial history or
missing acknowledged evidence. Completed retry returns the current state with
later edits preserved. Ordinary ready open and warm later-edit retry gain no
private ZIP/report reads. Old prepared receipts/reports/ready timing are unchanged.

Original ZIP, receipt, witness and detailed report stay out of ordinary backup/
Workspace/Contribution/review/Clean output. Keep the existing explicit separate
report download before success/blocking and after cold reopen. New-format file
sharing rederives normal public GLB/catalog/material facts without needing private
conversion evidence; never export the witness as a sharing dependency.

## Ports, acceptance and stop conditions

Extend existing lociMyuSource → lociMyuMapping → lociMyuConversion, exact creation
origin enums and conditional preview/summary. Reuse checked GLB/catalog/surface
facts, current domain capability validation, typed Session/material controls and
file/generation services. No projectFiles→harness/UI/Native writable conversion
dependency, decoder/backend, storage schema, package wire, profile or renderer change.
Charge source rows × matched slots to existing work/node/metadata budgets; never
truncate fan-out or add unapproved numeric limits.

Use service tests for last-row/invalid/inactive/zero-match/default literals,
all-Scene supported-subset refusal, unused/nonselected materials, same-name
multi-index fan-out and repeated-index deduplication, goldens/collision/order,
fully rebound false slot/Scene/intent/witness, source mutation/origin-sidecar
loss/downgrade/no-repair and completed later-edit privacy fences. Preserve old
1–3 goldens/reports/zero-match behavior and actual profiles across PNG/JPEG/WebP/GIF.
One connected two-Scene single-GLB workflow combines different shading/sidedness,
preview/cancel, typed material editing, exact original bytes/profile, named backup/
Workspace/review and selected-generation restore → same-host edit → cold reopen.
Normal outputs exclude private evidence. Node/injected renderer tests do not
prove GPU pixels, original producer parity, real inputs, physical iPhone or offline.

Stop affected implementation until this exact target/identity/subset is ratified.
Later opacity/chroma, arbitrary source material semantics, multiple models,
per-occurrence differences, ordinary activation/adoption/release remain excluded.
Do not normalize latent numbers, add a math framework or silently reinterpret an
old recipe to avoid a source/target authority conflict.
