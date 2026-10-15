# Frozen-v1 exact material-address conversion

Status: **PROPOSED — not ratified, not implemented or adopted.**
This additive companion to [07b](07b-frozen-v1-conversion-proposal.md) proposes
one bounded conversion workflow. Approval of 06a or earlier migration recipes
does not authorize its implementation. Existing recipes1–5 keep their literals,
source acceptance, reports, IDs, profiles and completed-retry timing.

## Decision and user outcome

Convert a frozen-v1 Project whose saved opaque-material settings use exact
producer keys → inspect which shading/face settings will transfer → edit the
corresponding Scene/material slot → save and exchange files → restore an actual
selected generation → edit and cold reopen, retaining original GLB and source.

The new decision is a conservative address-to-slot mapping and new immutable
recipe. It accepts neither the old viewer's display-name/suffix/raw-name fallback
nor broadcast to a shared source material. Disabled chroma editing values remain
only in the original ZIP and a field-named explanation, **not** editable target
chroma settings. The PO is asked to ratify that limitation and the exact mapping
below together. Existing 02's material tuple is already authoritative; this does
not ask to reapprove it or claim parity with every old viewer input.

## Observed source and the narrower proposed subset

The repository's current sources establish:

- [02 §5](../02-data-format.md#5-エンティティスキーマ) stores one material entity
  per `(setId,modelAssetId,materialKey)`, independently for each Set. Its key is
  deterministic, rather than a material display name.
- [loaders.ts](../../src/viewer/loaders.ts) `nodePath`/`buildMaterialRegistry`
  uses actual decoded Three nodes. Exclude the root; each path component is the
  node's nonempty name, otherwise `#` plus its index in `parent.children`. Join
  components with `|`; the exact key is `m/<nodePath>/<materialArraySlot>`.
  A root Mesh has an empty path, so its exact key is `m//0`.
- [viewer.ts](../../src/viewer/viewer.ts) tries exact keys first, then display
  name/suffix removal and raw material-name fallbacks. Those fallbacks are outside
  this proposal. [context.ts](../../src/ui/context.ts) applies only current visible
  material rows of the active Set/model and resets materials before applying them.
- [material.ts](../../src/ui/tabs/material.ts) produces opacity1/front/lit
  defaults, boolean shading/sidedness and a disabled chroma object. Frozen 02
  names its tolerance field `tol`; the current producer uses `tolerance`.
  [schema.ts](../../src/core/schema.ts) currently validates only three routing
  strings, so its acceptance alone is not proof of this conversion subset.
- [importWizard.ts](../../src/assets/importWizard.ts) can store `unlitLike` and
  `legacyKey`. The latter is not a permission to enable name fallback. The old
  context's true-priority aliases and another converter's nullish-priority aliases
  are not equivalent; this proposal rejects contradictory aliases.

Keep complete original ZIP/log bytes, manifest, operation admission and raw
fingerprints. Do not call the legacy writable importer or reconstruct keys from
raw glTF names. The following are new6 conversion rules, not changes to the
frozen v1 package reader or repair of malformed source.

### All retained history and effective current rows

Retain the existing nondivergent operation admission, HLC field-LWW, update-wins
visibility and source-ID validation. Do not choose a winner between divergent
same-actor/op inputs or resolve different entities by iteration/lastWrite order.

Allow the material field names exactly:
`setId,modelAssetId,materialKey,opacity,doubleSided,unlit,unlitLike,chroma,legacyKey`.
Check every retained material operation, including overwritten/deleted history.
Present routing IDs must be canonical source Set/Asset IDs; present materialKey
must be a nonempty single-line string and is not trimmed/normalized. Present
opacity is finite in [0,1]; present doubleSided/unlit/unlitLike/legacyKey are
booleans. If both unlit aliases occur together they must agree.

Present chroma must be a closed object with required boolean `enable` and only
optional `color,tol,tolerance,feather`. Present color is exact `#RRGGBB`; present
numbers are finite in [0,1]. Null, missing enable, unknown keys and wrong types
are refused. These checks do not numerically translate chroma. Historical valid
opacity/chroma values may differ from the current supported appearance; their
original operations stay in the ZIP and source accounting, not target history.

Reduce once, then process current visible material entities in code-unit source-ID
order. Each needs a current active Set and current active model Asset, complete
exact routing and known lifecycle. Dangling/deleted target references, duplicate
source tuples and duplicate resolved Scene/asset/base-slot routes are refused,
even if properties agree. Separate Scenes may independently address the same slot.
Deleted material entities are source-only; they still select new6.

For each current material row require:

- opacity absent or exactly1;
- chroma absent or explicit `enable:false` under the closed typing above;
- addressed source semantics exactly opaque/surface/lit/front;
- doubleSided absent or boolean; absent means false in this admitted front-face
  source subset;
- unlit/unlitLike absent, one boolean, or two equal booleans. Both absent means false;
  contradictory current aliases, including values from separate updates, refuse.

An active unsupported condition rejects the whole input; never omit it and fall
back to another recipe. Raw unknown/invalid values cannot be hidden by reduction.
An exact matching no-op is still a real mapped material row.

## Decode proof while keeping the base GLB profile

Keep the original result of `inspectFreshValidationGlb` as the target model. New6
may additionally call the existing `inspectOccurrenceGlb` or
`inspectOccurrenceJpegGlb` and `decodeOccurrenceGlb` from
[glbOccurrences.ts](../../src/projectFiles/glbOccurrences.ts) on the same owned
bytes, only for models addressed by current material rows.

This existing production helper uses the pinned Three180/GLTFLoader, checks
parser associations against raw node/mesh/primitive/material indices, and proves
a bijection with all selected-scene surfaces, triangle counts and bounds. Its
temporary row is `{node,childPath,materialArraySlot:0,nodeIndex,primitiveIndex,
materialIndex,slotIndex}`. The exact producer key is derived from `row.node` and
the returned root **before disposal**, using the formula above. Preserve hierarchy
and multiple primitives; do not guess a single root mesh or add that restriction.

Require exactly one decoded row for each source materialKey. Resolve its original
materialIndex to the retained **base** locator: `gltfMaterial(materialIndex)`, or
for null, implicit `representationMaterial(slotIndex:0)`. Require that this base
locator occurs in exactly one selected-scene occurrence. All implicit null uses
share the same base locator for this count. An addressed repeated/shared material,
ambiguous exact path, missing key, unsupported surface or association mismatch
refuses the whole conversion. Unaddressed accepted geometry keeps its old meaning.

The helper checks original material associations **before** cloning each
occurrence. Returned material object identity is not a sharing proof. Count raw
materialIndex/null under the association/bijection proof; different raw indices
aliasing one physical source material cannot both pass the association checks.
Do not add a preclone callback, generic decoder port or source-registry fallback.

The occurrence inspector replaces its temporary catalog with ordinal slots. Never
persist that catalog under a base profile. Persist original bytes, bounds, base
material catalog and actual PNG/JPEG base profile only; retain only JSON proof
rows from temporary decode. Original node transforms, Representation-to-Asset,
model-local pins and recipe5's Asset-to-Project placement stay intact. No new GLB
profile, geometry bake, texture re-encode or renderer capability is proposed.

Use try/finally disposal on success/refusal/cancellation/stale work; late bitmaps
must close. The existing helper performs an additional full-resolution bitmap
decode with blob-only URLs, premultiplyAlpha:none and colorSpaceConversion:none.
Reuse existing file/item/work/pixel/cumulative-image budgets before fan-out/output
allocation. This does not promise a new peak-memory, pixel-equivalence, browser
or device guarantee and does not replace actual browser/device acceptance.

## Target intent, private explanation and confirmation

Map each accepted current source material entity to one Scene-scoped override of
its original base logical slot. Use existing target records and runtime behavior:

```text
appearance = {opacity:1,doubleSided:sourceDoubleSidedOrFalse,
              lighting:effectiveUnlit ? 'unlit' : 'inherit'}
compositing = {coverage:{policy:'inherit'},optics:'inherit'}
```

No target chroma field is added. Effective disabled chroma's present color/tol/
tolerance/feather and legacyKey are retained as individual named raw values in
new6's private `sourceOnlyMaterialValues` array, with exact row shape
`{sourceMaterialId,field,value}` sorted by sourceMaterialId then field (code-unit
order). Field names are `chroma.color`, `chroma.tol`, `chroma.tolerance`,
`chroma.feather`, `legacyKey`. Keep tol and tolerance separately; no conversion,
quantizer, tolerance default or Native sqrt3 rule is imported. Overwritten/deleted
values remain fully accounted by original ZIP/inventory and existing source-only
history counts.

New6's summary/report adds mandatory `appliedModelOffsets` (including0) and
`materialEffects:{scenes,overrides,sourceOnlyChromaRows}` as nonnegative safe
integers. Count only effective current affected Scenes, overrides and accepted
rows with any present disabled color/tol/tolerance/feather. Historical-only material
presence selects the domain but has0 current effects. Old1–5 report shapes remain
exact, including no new zero fields on them.

Before create, the explanation is nonbinding: actual source summary and named
values, `materialMappings=[]`, targetIdentity/initialProof=null and no fabricated
target IDs. After create captures real initial identity/proof, it has complete
materialMappings sorted by ASCII targetOverrideId. Use the existing private
conversion receipt/report, not another ledger. A standalone explanation may wrap
this same report plus the exact original byte proof and captured identity/initial
proof; preview has explicit nulls. Expose it through the existing explanation
download/contextual confirmation pattern only for new6; old1–5 remain unchanged.

Each captured witness row has exactly:

```text
{sourceMaterialId,sourceSetId,sourceAssetId,sourceMaterialKey,sourceGlbSha256,
 childPath,materialArraySlot:0,nodeIndex,primitiveIndex,sourceMaterialIndex,
 sourceLocator,sourceSemantics,selectedOccurrenceCount:1,targetSceneId,
 targetAssetId,targetRepresentationId,targetProfile,targetMaterialLayoutId,
 targetLogicalMaterialSlotId,targetOverrideId}
```

childPath is the bounded nonnegative-integer path, sourceMaterialIndex is an
integer or null, and sourceLocator is the base locator described above.
targetProfile is the actual exact `{id,specificationSha256}` base pair. No Three
object, temporary ordinal locator, supplied verified flag or target label is
evidence. Source raw bytes and complete expected-record comparison bind the exact
intent/lifecycle as well as these routes.

On a recognized but refused input, keep the normal recognized-invalid error
boundary, show a bounded material ID/field/reason and create nothing. Do not return
an old plan or fabricate a blocked target. The ready confirmation reports affected
Scenes/slots, original preservation and, only when relevant:

`色の透過が無効なときの色・許容範囲・ぼかしは、元のZIPと説明ファイルだけに残り、変換後の編集値には引き継ぎません。`

Retain recipe5's conditional offset disclosure. Preview/cancel performs no Project
or CAS writes; create/initialization retains one captured exact attempt after an
opening failure. Saving/downloading the explanation is not an external-save claim.

## New recipe and exact identifiers

Select `v1-project-scene-migration-recipe-6` iff any retained admitted operation
has material entity kind, including overwritten/deleted/material-only history.
Otherwise keep existing5→4→3/2/1 selection exactly. Never choose6 because an old
checker refused another field. New6 includes PNG/JPEG/WebP/GIF photos, explicit
default Views and nonidentity placement under their already accepted meanings;
apply recipe5's fixed quaternion and current placement/runtime-readiness guards
when constructing new6 output, not a forgotten recipe===5-only branch.
All retained ortho:true and inline defaultCameraState remain refused.

Inherit existing source keys, attachment occurrence and initial lifecycle nesting.
Only new6 adds `ovr:['material',sourceMaterialId]` and
`evt:['initial-event','ovr',['material',sourceMaterialId]]`. Require the same
canonical source material ID grammar as the frozen operations. UTF-8 preimage has
no BOM/final LF/Unicode normalization:

```text
"lociview:v1-project-scene-migration-recipe-6:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

The escape is exactly one LF. ID is prefix+'_'+SHA256.slice(0,32). Retain full
preimages/digests; reject cross-prefix full collisions, shortened-ID collisions
and incompatible entity/route bindings; exact repeated lookup is allowed. Mapping
evidence sorts by ASCII target ID independent of digest completion. Old domain
preimages, source-key grammar and receipts never change.

Fix conversionId=32 zeroes and sourceZipSha256=64 ones:

| Prefix | Exact sourceKey | UTF-8 bytes | Full SHA-256 |
|---|---|---:|---|
| bnd | `["model-binding","ast_00000000000000000000000001"]` | 215 | `3f7fd24808759ef870c722cbc5ad620fba22fb321e74c25c52652272f7398038` |
| view | `["view","view_00000000000000000000000001"]` | 208 | `5854568e1c7c64e6023a672bbee2b62a0275d8c6a42ed10303723dd1d7791d8f` |
| cap | `["caption","cap_00000000000000000000000001"]` | 209 | `71221ef8cb4333efee14ca508ce007b334d657c7a7694098dd9f5c55fc0cdd5e` |
| tag | `["tag","記録"]` | 181 | `95d216805e492546824332b0b7296e8757fd1b6d897cb5ad41774ed5418b7c2e` |
| ovr | `["material","mat_00000000000000000000000001"]` | 210 | `022938d2aef25a9a2eafb16b0710b25d2a8323d1bc45dd1b04d24e64d47d1a7b` |
| evt | `["initial-event","ovr",["material","mat_00000000000000000000000001"]]` | 234 | `4cd45f337f6f0a547c740ab8c48a3f607d5baf393ac6c60683bc4630f8f03def` |

## Source binding, recovery, ports and acceptance

Add only the exact new literal/grammar/report variant to closed conversion,
initial2 and independent-origin readers. Before persistence, converter cold
publication and explicit completed retry, re-read actual retained ZIP and
recompute domain/raw inventory/decoded exact-key proof, source-only values,
mapping/full expected initial records against captured identity. Compare complete
witness/report and actual initial bytes/proof; a re-sealed target route or supplied
witness cannot substitute. Never regenerate acknowledged lost source/receipt or
history, auto-upgrade old jobs or apply material changes to later edited targets.
Completed retry returns current later history. Ordinary ready opening and warm
later-edit retry do not gain private ZIP/report reads.

Use existing frozen source/map/conversion, GLB occurrence inspection/decode,
Session/provider/content, display/material editor and file/generation services.
Keep projectFiles free of harness/UI/native-converter imports. A private exact-key
helper may mirror the observed producer formula; no legacy AppContext, writable
loader registry, new parser/renderer/profile/decoder port or general framework.
An exact new source→glbOccurrences import must be allowlisted/tested early.
Private ZIP/receipt/witness/explanation stay out of normal five-purpose output.

Reuse existing service tests for raw historical/deleted dispatch, alias/typing,
active unsupported refusal, missing/ambiguous key, shared/implicit locator,
duplicate route, new-domain vectors/collisions/ASCII order, all image MIME/base
profiles, fully rebound route/intent/witness/source loss and old1–5 contrasts.
One connected representative uses a hierarchical/multi-primitive GLB with unique
addressed base locators in two Scenes: confirmation/explanation/cancel → create →
typed one-slot edit with other slots/Scene unchanged → named backup/Workspace and
review → actual selected-generation restore → same-service edit → cold exact
history/material effects. Verify original GLB/profile/local pins/placement/default
entry and private-output exclusion. Use service faults rather than duplicating
this complete roundtrip per field. Retain old refusal/oracle fixture bytes.

Use focused checks and early sceneCore for the new import boundary, independent
meaningful review, one frozen final serial checkpoint and HTTP identity check.
Node decoded fixtures/stub bitmaps/recorded DOM are not actual browser, GPU,
anonymized-real-source, device, offline or adoption evidence. Denied browser
bootstrap is neither retried nor bypassed.

Stop affected work for an address that cannot be proved under this exact subset,
new source/render semantics, a need to reinterpret old jobs/profiles, or a new
storage/numeric/format policy. General opacity/chroma, fallback names, shared-source
broadcast, orthographic numeric reconstruction, inline cameras, external legacy
repos, ordinary activation, dependencies, cleanup/deletion and release/deploy are
excluded. Implementation remains stopped until the PO ratifies this companion.
