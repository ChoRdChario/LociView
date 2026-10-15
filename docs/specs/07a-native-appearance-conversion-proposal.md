# Native appearance conversion companion

Status: **PROPOSED — requires PO ratification; not implemented or adopted.**
Prepared 2026-10-15. This is the next bounded extension of
[07 §5.3](07-project-scene-migration.md#53-concrete-first-native-companion--po-approved-2026-09-21),
not a change to the approved recipe-1. Current work and evidence stay in
[todo](../../tasks/todo.md).

## Decision and user outcome

Ratify `native-project-scene-recipe-2` and the separate development profile below
for Native GLB/PNG backups containing representable material adjustments. The
user can convert shading/sidedness adjustments and retain disabled chroma
parameters, then edit, save, exchange and reopen the new Project. Source files,
recipe-1, the old GLB profile, existing Projects and prepared jobs keep their
original interpretation. This does not complete all Native material conversion.

The first subset deliberately excludes fractional opacity and active chroma.
Those remain required later work: Native replaces material opacity whereas the
target multiplies source coverage; even zero Native feather is soft chroma.
They require another versioned admission/mapping companion and the applicable
renderer evidence. This proposal does not change a gate or approve a numeric
rendering/performance guarantee, dependency, ordinary entry or deployment.

## Closed input subset

Inherit every recipe-1 portable-backup/static-GLB/PNG restriction, source-byte
inspection, identity/frame/family check and ordering rule, except its blanket
appearance rejection and the catalog/profile rules explicitly replaced here.
Inputs without appearance records continue through recipe-1; any nonempty
appearance array selects recipe-2 internally. Users still choose only the
existing file-open/convert intent.
Every retained Representation in a recipe-2 output uses the new occurrence
profile/catalog, including Representations without appearance adjustments.

Check every retained appearance, including hidden models, noncurrent Scenes and
historical resources. All must satisfy:

- Its DisplaySet, Asset, authored revision, Representation and exact source slot
  exist and agree. Never drop a missing, ambiguous, unsupported or dormant row.
- The addressed source slot has exactly
  `{coverage:{kind:'opaque'},optics:'surface',lighting:'lit',doubleSided:false}`,
  the current [material-edit capability](../../src/harness/projectScene/validationMaterials.ts).
  Requested `opacity` is exactly `1` and `chroma.enabled` is exactly `false`.
- Each addressed VariantFamily has exactly one distinct retained Representation
  across all revisions. Preserve the source family identity; do not split a family
  or claim interchangeable material layouts to make the input pass.
- Native slot provenance and target occurrence have the one-to-one proof below.
  The complete target graph/provider and current renderer checks also pass.

Any failure rejects the complete input before ready publication. Source mask,
blend, unlit or double-sided semantics on an addressed slot, fractional requested
opacity, enabled chroma, foreign/missing targets and unresolved correspondence
are outside this subset. Unaddressed source materials retain the inherited
inspection/rendering behavior; this is not wider material-edit admission.

## Occurrence profile and addresses

Candidate ID: `development-validation-glb-occurrence-1`. Its exact profile text
is the single ASCII line in the following block, UTF-8 without BOM or final LF:

```text
LociView development validation GLB occurrence 1. Inherit admission, static pose, bounds and PNG integrity rules of development-validation-glb-1@077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f without change. For the selected scene, enumerate each triangle primitive occurrence once in ascending (JSON nodeIndex, primitiveIndex), assign zero-based slotIndex, and use representationMaterial(slotIndex) including missing material. Each occurrence retains the source material semantics from its authored glTF material or the inherited implicit material. Inspect unused content under the inherited rules; do not allocate catalog slots for unused materials. Runtime provenance must bijectively match each decoded material slot to an enumerated occurrence before an override applies; no name, material-object identity, first-match or traversal-index substitution. Clones are per occurrence. The Three 0.180.0 association proof and closed witness defined by native-project-scene-recipe-2 are required; missing provenance or multi-slot decoded meshes are unsupported. Original GLB bytes and source (nodeIndex, primitiveIndex) surface identity are unchanged. Not a ratified support profile.
```

Length: **1198 bytes**. SHA-256:
`9bbf1243a3786d54a6439104614c46e502a3cdfa20dc9e9d610ee1da42cf059f`.
This is a new development-profile binding, not general profile adoption. The
base profile's bytes/digest and old catalogs remain fixed.

For the selected scene, sort distinct `(nodeIndex, primitiveIndex)` pairs
numerically; zero-based rank becomes the existing locator
`{kind:'representationMaterial',slotIndex:rank}`. Geometry without an authored
material still gets its own occurrence slot. Each slot retains the inherited
source semantics, including opaque/mask/blend classification. Sort the resulting
catalog by logical slot ID under the existing catalog contract.

Native addresses are [child-index path plus material-array slot](../../src/nativeGs/materialSlots.ts),
and [Native clones each occurrence](../../src/nativeGs/viewer.ts).
Preparation must reconstruct a complete witness from the pinned loader's source
associations/construction rules to the inspected source pair. Prove a bijection
between decoded Mesh material slots and selected-scene primitive occurrences.
Persist that exact witness privately with conversion evidence. Names, an equal
global glTF material index, shared Material objects, loader traversal rank or
splitting the path string alone are not a proof. Refuse missing/duplicate/ambiguous
witnesses. Do not replace the current Material-to-locator map and clone cache
for old profiles; use a profile-specific occurrence adapter and clone ownership.

Pin the construction to Three 0.180.0 `GLTFLoader`. The existing
[loader](../../src/viewer/loaders.ts) returns only `gltf.scene`, so the new adapter
must retain that selected root **and** `gltf.parser.associations` before discarding
the parse result. Do not modify the tree or register an extra construction plugin.
For each decoded Mesh, read its association's integer `meshes` and `primitives`;
take the nearest self/ancestor with an integer `nodes` association. That source
node must be in the selected scene and its JSON `mesh` must equal `meshes`;
`primitives` must address that mesh's inspected primitive. Cross-check its
authored material index or explicit material absence against the inspected facts.
Missing/pruned associations are unsupported, including a missing selected-scene
mapping after another scene was parsed. No name/path fallback is allowed.

A multi-primitive mesh Group is a wrapper: inspect its primitive Mesh children,
using the nearest associated source-node ancestor. Cloned occurrences must have
their own associated node index; reject a clone whose mapping was not retained.
Admit a scalar Mesh material or an array of exactly one material, both Native
material-array slot `0`; reject longer/empty arrays. Traverse actual selected-root
child indices only to capture Native `childPath`, never to assign source identity.
Require exactly one decoded row per inspected source pair and no extra Mesh row.
This preserves separate node occurrences that reuse a mesh/material object.

The private receipt adds a bounded, closed `materialWitness` array, ordered by
source Representation ID and then numeric `(nodeIndex,primitiveIndex)`. Each row
has exactly these fields:

```text
{nativeRepresentationId,sourceGlbSha256,childPath,materialArraySlot,
 nodeIndex,primitiveIndex,sourceMaterialIndex,slotIndex,targetRepresentationId,
 targetProfile,targetMaterialLayoutId,targetLogicalMaterialSlotId}
```

`sourceMaterialIndex` is the authored nonnegative integer or `null` for absence;
`materialArraySlot` is `0`. All indices/path components are nonnegative safe
integers. IDs and full lowercase digests use their existing validators;
`targetProfile` is exactly this profile's ID/digest pair. Bind each row to the
receipt's original ZIP digest, exact manifest-listed GLB digest, Native source
target, inspected pair/rank and exact mapped Representation/profile/layout/slot.
Bound row count, paths, strings and validation work using the existing caller and
metadata limits. Reject unknown fields, duplicate rows, incomplete coverage or
mismatched bindings.

Before persist/cold recovery publishes or replays initialization, validate these
bindings against retained original ZIP/GLB bytes and the **exact retained initial
source**. Recompute only checking/provenance facts; never allocate replacement IDs,
regenerate initial changes, replace an acknowledged witness or reset later edits.
Missing/torn acknowledged evidence fails recovery with retained bytes intact.
Completed retry keeps the later current history. Ordinary receivers derive the
catalog/material facts from GLB bytes and the new profile; normal rendering,
Workspace/Contribution/backup/review/clean validation never depends on the private
Native witness or exports it.

Synthetic address example: nodes 2 and 7 both use primitive 0 and glTF material
index 0. Their ranks are 0 and 1 and their logical slots differ. An appearance
on node 2 changes only that occurrence. Adding a loader wrapper does not rename
the source pair; if its Native child-path witness cannot be reproduced, refuse.

## Target material records

One Native appearance produces one map-2 MaterialOverride. Its routing scope is
the mapped owning DisplaySet's Scene; its target is the mapped Asset, original
VariantFamily, occurrence layout and logical slot. Never promote it to Project
scope. Preserve the original appearance ID, authored revision, source slot key
and raw settings in private conversion evidence. A second override with the same
semantic key is a refusal, not a first/last winner.

| Native value | Exact target value |
|---|---|
| `unlit:false` / `unlit:true` | `lighting:'inherit'` / `lighting:'unlit'` |
| `doubleSided` | Same explicit boolean |
| `opacity:1` | Explicit `opacity:1` |
| `chroma.enabled:false` | Explicit `chroma.enabled:false`; retain the following parameters |
| `chroma.colorSrgb` | Native effective quantized key channels, each divided by 255 |
| `chroma.tolerance:t` | `t / Math.sqrt(3)` |
| `chroma.feather:f` | `softness:Math.max(f,0.0001) / Math.sqrt(3)` |
| No Native compositing record | `{coverage:{policy:'inherit'},optics:'inherit'}` |

The current [Native viewer](../../src/nativeGs/viewer.ts) disables its unlit patch
for `unlit:false`; it does not force a source-unlit shader to become lit.
Current [map-2 display projection](../../src/domain/materialIntent.ts) removes
disabled chroma only from the display copy, retaining the stored values/history.
An editor must still reject enabling unsupported soft chroma; retained disabled
values are not a declaration of active-chroma support.

Freeze Native's effective key quantizer rather than copying raw color or replacing
it with `round(raw*255)`. For each channel `c`, use JavaScript binary64 arithmetic:

```text
L(c) = c < 0.04045 ? c * 0.0773993808
                     : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4)
S(x) = x < 0.0031308 ? x * 12.92
                      : 1.055 * Math.pow(x, 0.41666) - 0.055
Q(c) = Math.round(255 * Math.min(1, Math.max(0, S(L(c)))))
```

These are the channel operations of the current Native `chromaHex()` path with
pinned Three 0.180.0 and linear-sRGB working space. Require that working-space
assumption; a different interpretation is unsupported. Keep raw nonquantized
values privately. Synthetic effective-key vectors, computed from that existing
helper path, are:

| Raw sRGB channels | Effective RGB bytes |
|---|---|
| `[0,0,0]` | `[0,0,0]` |
| `[1,1,1]` | `[255,255,255]` |
| `[0.5,0.25,0.75]` | `[128,64,191]` |
| `[0.5/255,1.5/255,254.5/255]` | `[0,1,255]` |

Native's shader uses `smoothstep(t,t+max(f,0.0001),D)` while the target domain
uses normalized distance `d=D/sqrt(3)`. The scale conversion above is the
algebraic unit conversion; it is not executed shader/color equivalence evidence.
In particular `f=0` maps to positive softness `0.000057735026918962585`, not hard
chroma. For `t=0.3,f=0.6`, the mapped values are `0.17320508075688773` and
`0.34641016151377546`. Active alpha, source-alpha/alpha-test execution order,
color-space approximations, picking, depth and compositing remain later renderer
acceptance. No such rendering guarantee is ratified here.

## Exact identity recipe

Allocate fresh conversionId/history values once and retain the exact initialized
source as in 07 §5.3. All recipe-2 record IDs use UTF-8, no BOM/final LF:

```text
"lociview:native-project-scene-recipe-2:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

The escape denotes one LF byte. Use the exact admitted strings and nonnegative
safe integer indices, with nested array keys and no Unicode normalization. Copy
07 §5.3's closed prefix/key table except these additions/replacements:

| Output prefix | Closed source key |
|---|---|
| `slot` | `['material-occurrence',nativeRepresentationId,nodeIndex,primitiveIndex]` |
| `ovr` | `['mesh-appearance',nativeAppearanceId]` |
| `evt` for the new override | `['initial-event','ovr',['mesh-appearance',nativeAppearanceId]]` |

`lay` remains `['material-layout',nativeRepresentationId]`. The old slot-key
alternatives are not permitted in recipe-2. Every other prefix also uses the new
recipe-2 domain. Full SHA-256/preimage retention, short-ID collision refusal,
identical-key reuse and immutable record digest builders are unchanged. Extend
the new receipt's closed prefix/key validation to `ovr`; old receipt validation
and old initial/output bytes remain unchanged.

Synthetic vectors use conversionId = 32 zeroes and sourceZipSha256 = 64 ones.
`R` below is exactly `rep_00000000000000000000000001`; `M` is exactly
`mat_00000000000000000000000001`. The ID is prefix + `_` + the first 32 digest
hex characters. Hashes include the full recipe prefix and LF.

| Prefix / source key | UTF-8 bytes | Full SHA-256 |
|---|---:|---|
| `cap`, `['caption','cap_00000000000000000000000001']` | 203 | `85c0e680cf0491cdcb521fec8af712ec2cac1c23f95dac35aae47505f20db4a8` |
| `slot`, `['material-occurrence',R,0,0]` | 220 | `dd4b486ecc4c8241a8addd75570baddc31c82c22b1e74892f6f49d1549397572` |
| `slot`, `['material-occurrence',R,1,0]` | 220 | `e0f336959c1452758cce2ad54045e8aec6c2ec30f4e30146b2ff2b953dfdf5cb` |
| `ovr`, `['mesh-appearance',M]` | 211 | `643aa03e4d714d507eb5d542a2efbee8b82d070689a52e6b2859ecd1ac2d8df5` |
| `evt`, `['initial-event','ovr',['mesh-appearance',M]]` | 235 | `dc927f6982fca7244f5b5beffabf6bc55eda7ef68b834eea96517da8cabcebad` |
| `tag`, `['tag','記録']` | 175 | `8f6b117eb0f5c1f6fe150fda62b2646a9c6ce3c8390697c8896edd706e8ebfe0` |

## Connected implementation and acceptance after ratification

Implement one Native-file → preview → confirmed conversion → Scene-specific
material inspection/edit → named backup/Workspace → independent reopen workflow.
Reuse the existing file/service/UI and initialization/retry boundaries. New
profile selection comes from retained proof/records; no global profile default,
existing Project upgrade, private-source export or new journal subsystem.

Use existing test suites for two occurrences sharing one glTF material, independent
Scene settings, implicit materials, absent/duplicate slot witnesses, retained
multi-representation family refusal, unknown/foreign references, hidden/noncurrent
unsupported settings, disabled chroma/key boundaries and whole-input refusal.
One representative file flow covers saved source parameters, occurrence isolation,
exact interrupted retry and cold reopen; do not clone a roundtrip per field.
Run the required final source-tree checks serially and obtain independent review.

Record real-browser geometry/material/image and input observations on the exact
candidate before rendered acceptance. Current Chrome runtime approval is blocked;
Node hashes/math/recorded DOM cannot replace that observation. Physical iOS,
offline, general storage/profile adoption, ordinary-entry and release gates stay
open. Keep fractional-opacity/active-chroma, other Native profiles/exchange,
frozen-v1 and LociMyu initial conversion in the remaining product scope.
