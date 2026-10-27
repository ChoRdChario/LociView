# Mesh files and Native Mesh / Proxy → ProjectScene

> **PO-APPROVED — 2026-10-28. IMPLEMENTATION PLANNED.**
> This is the next grouped M01/F06 decision after [07k](07k-native-point-gs-proxy-conversion-proposal.md).
> PO approved the exact grouped contract/companions below. It does not itself
> register profiles, provide executed runtime evidence or pass adoption/release.
> [Todo](../../tasks/todo.md) owns current work and executed evidence.

## 1. One user workflow and grouped decision

STL・面を持つPLY・OBJ・自己完結したglTFを、同じ「ファイルを開く」と
「モデルを追加」から扱う。既存Nativeのこれらのモデルと位置指定用の面も、
シーン・記録・画像と一緒に引き継ぐ。形式選択や座標調整ウィザードは増やさない。
変換／追加→表示・位置指定・編集→5種類のファイル→返送・統合→復元・再開までを
一つの実装単位とする。内部ではSTL／Mesh PLY、次にOBJ／glTFの順で進め、
形式ごとの再承認・小さな手動テスト待ちは挟まない。

The PO decision covers four additive exact profiles, a new immutable recipe8,
fresh unitless-Project policy, canonical PLY geometry and Phong-preserving OBJ
display/effects. No dependency, schema/map/package version, network resolver,
renderer adoption, PWA activation, capacity increase or release is proposed.
Old profiles/recipes1–7 and their prepared jobs retain their exact meanings.

## 2. Exact source companions and common admission

The four proposed UTF-8/LF JSON companions below and their shared golden file are
specification data. Runtime registration still requires the implementation/checks.

| Proposed source | Companion / bytes | SHA-256 / published MIME |
|---|---|---|
| development-validation-mesh-stl-1 | [STL](profiles/mesh-stl-1.profile.json),3975 | 66141d778507d0cb06506c657a02277e16cbf486d3b39c557310aae1f35a07c4 / model/stl |
| development-validation-mesh-ply-1 | [Mesh PLY](profiles/mesh-ply-1.profile.json),4508 | b565818a2bf3179b59ddab0ce257c3e9e375630fdad065e774e54415b225a032 / application/ply |
| development-validation-mesh-obj-1 | [OBJ](profiles/mesh-obj-1.profile.json),6694 | 394466b628306f9232fee52653d3b6bf0e2990d5d22d21f8528aade61dbada36 / text/plain |
| development-validation-mesh-gltf-1 | [glTF JSON](profiles/mesh-gltf-1.profile.json),4655 | b39fc6b9c7a9bb47afbb9e2d7290e035ee13fbcce61da775ee98a2fc61816fd1 / model/gltf+json |

[Golden sources/IDs](profiles/mesh-conversion-8.goldens.json) bind owned synthetic
sources, byte digests, source surface/slot order, transforms and recipe8 preimages.
The11246-byte golden file SHA-256 is6fb753973ff29b782ae4f7d15b8b37ea6ec7c5ecd5fcf82e508a94db562697eb.
They contain no collected user file. Companions inherit only explicitly named
existing contracts; no old profile is reinterpreted by this proposal.

Common rules:

- Preserve original source bytes and source ordering, duplicate vertices, winding,
  objects and material runs. Build display geometry only; never save a rewritten
  GLB in place of an OBJ/STL/PLY/glTF original.
- Validate the complete source, including unused declarations, before publication.
  Reject malformed/ambiguous/unsupported retained content as a whole. No warning
  plus substituted empty buffer, white texture or dropped geometry.
- Reuse the host's non-GS file/JSON/item/scalar/pixel limits. Charge original and
  expanded geometry/scalars before allocation. No new numeric ceiling or latency,
  memory/storage guarantee. Desktop non-GS files remain64MiB; Project known-body
  total and GS residency retain01e limits.
  The existing fresh-preparation aggregate owned-byte guard also remains64MiB;
  a512MiB Project budget is not permission to buffer that much fresh Mesh input.
- Finite coordinates/normals must remain finite after Float32 conversion. Pin
  encoding-specific arithmetic, generated normals and triangulation below.
  Canonical facts use positive zero; proof compares the same canonical neutral
  values on both sides. No welding, repair, guessed normals or mesh simplification.
- Content inspection chooses one route. Filename/MIME is only a hint. A PLY with
  faces goes to Mesh inspection; failure must not fall back to ordinary Point or
  GS. Point-only and GS PLY keep their existing inspectors/profiles. Ambiguity
  refuses before creation; no format dropdown.
- Source properties not in the closed companion are unsupported. Extra user
  comments/names may be retained in raw bytes but never create an external fetch
  or become command/source-slot authority.

## 3. Format semantics to ratify

### 3.1 STL

Accept complete ASCII facet grammar or binary exact `84 + 50*N` bytes, N>0.
Preserve facet/solid order; every facet has one finite normal and exactly three
finite vertices. Retain authored zero normals. Multiple ASCII solids still form
one Mesh and one material slot. Reject partial/trailing payload and other grammar.

Uncolored binary requires no COLOR= marker and all attribute words zero. Colored
binary requires exactly one Magics COLOR=RGBA header marker in the pinned180
loader's recognized scan range and A=255. Reject additional/ignored-position
markers. Bit15 clear selects low/middle/high5-bit face RGB/31; bit15 set selects
header RGB/255. Apply pinned180 sRGB-to-linear then Float32 per corner. Reject
other attribute interpretations and authored nonopaque alpha; no VisCAM guess.

Default Standard material is #9aa4af without colors, white with colors,
metalness0.1/roughness0.8, lit/front/opaque, matching the current Native display.
Catalog source locator is representationMaterial(0). Source surface is
nodeIndex0/primitiveIndex0, triangleIndex in original facet order.

### 3.2 Mesh PLY

Exactly one positive vertex element followed by one positive face element;
ASCII1.0 or little-endian binary1.0. Use the existing bounded PLY header limit.
Required unique float/float32 x/y/z; optional complete float/float32 nx/ny/nz and
uchar/uint8 red/green/blue. Face list is vertex_indices or vertex_index with
uchar/uint8 count and int/int32/uint/uint32 indices, all nonnegative/in range.
Only triangles and quads: quad output is (0,1,3),(1,2,3), in source face order.
Reject alpha, partial triples, aliases/duplicates, face colors/UV, other properties/
elements, big-endian and trailing data. Preserve all vertices for raw bounds,
including unused vertices. Missing normals follow pinned180 accumulation and
normalization order after triangulation; authored normals are not regenerated.

Current186 PLYLoader can retain different attribute types and quantize uchar RGB;
its output is not the canonical model. Inspect into checked neutral Float32
positions/normals/linear RGB, retaining index order, and construct186 geometry
from those values. Prove compatibility against the actual180 parser after the
profile's canonical zero treatment, and release old resources before display.
Default material is the STL default. One slot, nodeIndex0/primitiveIndex0,
triangleIndex in the pinned triangulated order.
Here triangleIndex is the zero-based emitted triangle ordinal, not a face ordinal;
each quad emits two consecutive triangle indices.

### 3.3 OBJ

Strict UTF-8, optional one initial BOM, LF or CRLF; no bare CR, NUL or backslash
line continuation. Allow comments, v/vn/vt/f/o/g/s/usemtl/mtllib only. v is exactly
XYZ or XYZRGB, RGB0–1 and complete for all referenced vertices or absent; no
homogeneous-W ambiguity. vt is UV, vn is XYZ. Face corners have consistent UV/
normal presence; resolve positive/negative nonzero indices against declarations
available at that face. Reject invalid indices, lines/points/free-form directives.
Pin fan order (v0,vi,vi+1), without ear clipping. Bounds use emitted face vertices.
Missing normals use original parsed Number coordinates before Float32 storage,
matching180. Source smoothing follows s off/0/on/1; other values are unsupported.
Vertex RGB uses pinned180 sRGB-to-linear then Float32, before per-corner expansion;
do not interpret source RGB as linear or quantize it to Uint8.

Native currently supplies no MTL body. mtllib is retained as an unavailable,
nonfetched dependency and usemtl retains run identity, not recovered textures or
material parameters. Show that consequence before creation/conversion only when
such a declaration exists. No external/relative URL lookup, companion-file wizard
or invented texture recovery. Supporting actual OBJ+MTL bundles is later work.

Preserve the current Phong default: white, specular#111111, shininess30, source
smoothing/vertex colors, lit/front/opaque. Do not silently replace it with Standard.
The proposed OBJ effect adapter admits the current bounded material subset:
appearance lighting/doubleSided/baseColorSrgb/opacity/chroma and compositing
coverage inherit/opaque/mask, optics inherit/surface, with the existing atomic
value/coupling rules. Inherit or lit keeps the Phong source specular/shininess/
smoothing; unlit uses an owned Basic material retaining diffuse/vertex color and
source UV/alpha inputs. Base color changes diffuse only. Side inherit restores
source FrontSide, otherwise explicit FrontSide/DoubleSide. Reset reconstructs the
immutable source before applying remaining resolved effects, never mutates it.
Opacity defaults1; fractional values are allowed only with the existing binary
mask/cutoff path. Chroma uses the existing hard-key path when softness0 and the
existing mask path for nonzero softness. Disabled map2 chroma remains latent source
metadata and is removed only from the display copy. Extend the same checked shader
patch to Phong explicitly, preserving current numeric/cutoff/color rules. Reject
smoothBlend, ditherCoverage, transmission, unknown keys and other unsupported
source/effect combinations in both command admission and render preparation;
never show them applied or reinterpret fractional opacity as smooth blending.
Native appearance migration remains the existing opacity1/chroma-disabled subset
and exact source proof; no specular/shininess editor or new Native alpha conversion.

Enumerate nonempty source objects and their retained material runs deterministically
in document order, mirroring the pinned180 run-finalization rules. Catalog slots
are ascending object ordinal then material-array slot, with representationMaterial
(global slotIndex). Names and material-object reuse never identify slots. Prove a
bijection from independent source runs to actual180 childPath/materialArraySlot,
then the same neutral source/slot facts in186. No glTF node/primitive fiction in
private OBJ witnesses or ID keys. Public meshTriangle nodeIndex is the source
object ordinal, primitiveIndex0, triangleIndex in that object's emitted fan order.
Both o and g start source objects under the pinned parser rules. An empty initial
placeholder, empty/consecutive declarations and objects emitting no faces consume no ordinal;
number nonempty emitted source objects from0 in source order. Finalize/remove
zero-length and trailing inherited material runs under180 rules before numbering
retained materialRunOrdinal from0 per object. Prove source ordinals against actual
loader children/array slots; never derive source identity from a traversal index.
A nonempty implicit initial object is ordinal0. The first o/g declaration may
adopt that initial object under180 rules; it never splits/reorders earlier faces.

### 3.4 Self-contained glTF JSON

Inherit the existing closed static GLB geometry/material/scene/PNG/JPEG rules,
changing only container/resource admission. One embedded canonical base64 buffer,
data:application/octet-stream;base64 or data:application/gltf-buffer;base64;
decoded length must equal declared buffer length. Images are admitted bufferViews
or canonical PNG/JPEG data URIs, never both. Base64 must roundtrip exactly with
RFC4648 padding and no whitespace. Reject external/relative/blob references,
unsupported extensions, animation/skin/morph and ambiguous scenes before decode.
The existing JSON limit applies to the entire text including inline base64.
Bound decoded totals and image pixels; retain the unchanged PNG/JPEG integrity,
decode, orientation and color-role rules. Keep original JSON and inline resources
together; do not create Caption media for embedded textures.

Catalog/pick identity is actual selected-scene (nodeIndex, primitiveIndex), ascending
as in the occurrence GLB profiles; per-occurrence material clones and the actual
180→186 neutral association proof remain required. Preserve authored node poses;
absence of an explicit scene follows the inherited sole-scene rule, not first-scene
guessing. A new URI policy never relaxes the existing GLB source profiles.

## 4. Units, transforms, roles and editing

Fresh Projects containing STL/OBJ/Mesh PLY use ProjectFrame.unit:{kind:unknown},
including mixed selections, following the existing fresh-GS unknown-frame path.
Pure GLB/glTF and existing Point creation retain their current defaults. No source
vertex is rescaled when a mixed selection changes the Project unit declaration.
Adding a model never changes an opened Project's frame. UI states unknown scale
contextually; no guessed millimetres/metres or calibration wizard.

Native conversion preserves the exact existing unknown/metres object, canonical
representationToAsset and saved manual/needsReview/unplaced coordinates. No
normalization, recentering, auto axis change or pin repick. New profiles permit
meshPrimary/source+display with derivedFrom:[], or interactionProxy/interaction
with07k's exact same-Asset GS family/derivation rules. Review wire omission becomes
[] in the saved independent edit-copy; Clean retains/remaps nonempty ancestry.
All four profiles also admit the existing Review display-only primary tuple and
its saved edit-copy with purposes:['display'], derivedFrom:[]. Review wire omits
derivedFrom; ordinary fresh/native authoring emits source+display for primaries.
This adds no new Review role or purpose policy.

Use07k's checked Sim3+reflection arithmetic. Keep raw decoder bounds separate;
Asset bounds are the conservative eight-corner transformed raw AABB. Wrap the
decoded root in a separate transform Group, retaining authored node poses.
AssetBinding is applied only later, once. Proxy remains invisible, excluded from
fit and color/depth writes, DoubleSide for new approximate picking, followed by
existing manual confirmation. Saved anchors are never reraycast.

Fresh additions get independent fresh identities through Session commands. Keep
existing model/Scene membership, replacement-review and copy behavior. Native
retained revisions use07k's one visual primary / optional matching GS Proxy closure;
unsupported dormant combinations refuse the whole source, not discard history.
Nonidentity GLB-primary remains outside the old GLB profiles and this proposal.

## 5. Recipe8, private proof and recovery

Choose native-project-scene-recipe-8 iff at least one newly admitted format occurs
in any retained Native Representation, including a Proxy. Otherwise choose the
unchanged recipes1–7. All-GLB or Point/GS-only conversion never changes domain.
Fresh raw files use ordinary creation receipts, not synthetic Native ZIP receipts.

IDs use lociview:native-project-scene-recipe-8:id:jcs-v1 plus the same conversionId,
original ZIP digest, output prefixes and original source identities. Reuse existing
entity/frame/family/class/revision/binding/Scene/Caption/media/attachment/lifecycle
keys. Flat STL/PLY use ['material-slot',nativeRepId,'representationMaterial',0];
OBJ uses that key with the global source slotIndex. glTF uses the unchanged
['material-occurrence',nativeRepId,nodeIndex,primitiveIndex] structure. Keep full
hash collision rejection and ASCII ID-map ordering; never name/filename matching.

Recipe8's private material witness has a closed per-format source address:
flat slotIndex, OBJ objectOrdinal/materialRunOrdinal, or glTF nodeIndex/
primitiveIndex/materialIndex. It also binds original blob/profile, actual180
childPath/materialArraySlot (nonnegative, not forced0 for OBJ), target exact
Representation/profile/layout/logical-slot and the complete source slot table.
Every Native supported appearance resolves through this exact witness. Cold retry
rederives the full closed mapping/witness/initial records; it never repairs them.
Mixed recipe8 keeps existing admitted Point/GS/GLB bytes/profiles and preserved
units/Scene/pin/media semantics. Existing07k witness/golden bytes remain unchanged.
Specifically, mixed recipe8 GLB meshPrimary uses07k's existing PNG/JPEG occurrence
profile and occurrence ID keys even with no appearance adjustment. Its private
material-witness arm is the unchanged07k GLB row. GLB Proxy keeps the existing
native-proxy-glb profile/base material-slot keys; Point/GS never enter the material
witness. New-format arms must not reinterpret a mixed GLB catalog.

Closed recipe8 receipt fields are exactly07k's recipe/conversionId/projectId/
original/originalRef/manifest/snapshot/initial/mapping/materialWitness/spatialWitness/
report, with recipe8 and its fixed initial source. Keep07k byte-proof/reference/
spatial-row checks. The materialWitness array is the complete source slot table
for retained Mesh primaries, including slots without an appearance adjustment;
do not repeat a complete table inside every row. Its existing-GLB arm is the
unchanged07k closed row. Each new-format row has exactly nativeRepresentationId,
sourceBlob, sourceProfile, format, sourceAddress, childPath, materialArraySlot,
targetRepresentationId, targetProfile, targetMaterialLayoutId and
targetLogicalMaterialSlotId. sourceProfile is the actual Native source declaration;
targetProfile is the exact new tuple. Closed sourceAddress arms are:

- STL/PLY: {kind:'flat',slotIndex:0}.
- OBJ: {kind:'obj-material-run',objectOrdinal,materialRunOrdinal,slotIndex}.
- glTF: {kind:'gltf-occurrence',nodeIndex,primitiveIndex,materialIndex,slotIndex},
  materialIndex a nonnegative source index or null for implicit material.

All ordinals/child indices are nonnegative safe integers and materialArraySlot is
proven against the actual180 output. Sort rows by ASCII Native Representation ID,
then source slotIndex. Require exact count and bijection; no extra/missing rows.
Report contains exactly models/scenes/captions/media, originalExcludedFromExports:
true and effects:{unitsPreserved:true,existingPinsPreserved:true,gsDisplayMayDiffer,
proxySelectionDoubleSided,objExternalMaterialsUnavailable}. Last three booleans are
derived from all retained representations/source declarations. Show only applicable
effects and retain the private report with the conversion receipt. Do not change
recipe7's report shape or use a new report to repair an old prepared conversion.

Native input MIME mapping is exact: STL model/stl, OBJ text/plain and glTF
model/gltf+json are unchanged; Mesh PLY application/octet-stream becomes
application/ply in target blob metadata only. Preserve original MIME in private
source witnesses and07k's revision sourceMediaType provenance when common to that
revision. No payload rewrite or guessed MIME based on filename.

Extend07k's Desktop Native-original ≤512MiB exception explicitly to recipe8,
separate from public known bodies ≤512MiB. Keep GS500k/shared residency and all
non-GS64MiB/work/ZIP/local-quota limits. Reuse serial strict STORE sources,64KiB
original/body producers, private OriginBlobStore original, full readbacks, fixed
initial identity and actual durable initialize-start acknowledgement. Before start
only unverified staging may use the captured/exact reselected original. Missing/
suspect always refuses; after start no original/public-body re-creation. No new
transaction framework, completion marker or validation-evidence lifetime.

Original ZIP, private witnesses and unavailable MTL declarations in the conversion
report never enter public Project metadata or any of the five outputs. Raw source
OBJ bytes still retain their original mtllib text; this is not a network capability.
Recipients validate public bodies/profiles without a private conversion receipt.

## 6. Implementation ports and acceptance after approval

Strict inspectors/content facts belong in projectFiles, pure checked math/source
types in domain, neutral owned geometry/material decoding in viewer. Viewer has
no storage/package dependency. Product composition uses typed Session commands
and provider-derived capability/status models. UI never writes CAS/metadata.
Specify exact import allowlists before implementation; no harness authority in
Desktop. Reuse existing selectors, model/Proxy/material panels, loading/error/cancel
and file/recovery controls, with contextual source limitations only.

Concrete ports before implementation:

- A pure domain Mesh source/neutral-data discriminant carries checked source
  format, source surface/slot ordinals and owned attribute/index/material facts.
  It owns no file, package, Session or UI authority.
- projectFiles exposes content classification, inspectMeshSource(bytes, host
  non-GS limits, existing PNG/JPEG decoders, optional AbortSignal), and exact
  meshSourceProfile(format). Recognized invalid Mesh input throws; only a genuinely
  different source class may return no match. Raw bodies stay behind current
  ValidationContent/OriginBlobStore; inspectors never write storage.
- An owned Mesh decode/proof adapter returns render objects, source surface and
  material-locator maps plus dispose. Viewer consumes checked neutral/source data
  only; projectScene connects it to the existing resident/placement/picking path.
  Existing GLB validation/proof APIs retain their old behavior; shared parsed-core
  helpers may be extracted only with unchanged old-source regression evidence.
- prepareValidationModel/Project and Native recipe8 mapping select profiles/units
  and construct typed records. Session owns creation/addition/Proxy/edit/copy and
  file services own export/receive/restore. There is no UI→CAS command path.
- Provider-derived typed material capabilities distinguish preserved Phong from
  Standard and feed the same command/render admission. Names supplement source
  slot ordinals; strings never become a material-address or write authority.

Exact new module/import allowlists accompany the first implementation tree and
sceneCore check before expanding the connected unit. No generic plugin system,
format dropdown, separate storage framework or parallel state authority is added.

Approval covers this connected workflow and routine fixes/tests:

1. Static full-profile/golden digests, recipe8 full ID/preimage/collision/order
   checks; immutable old profile/recipe/golden and prepared-recovery compatibility.
2. Positive and whole-input negative ASCII/binary STL and PLY, Magics color/alpha,
   quad winding, Float32 overflow, raw/Asset bounds and missing/authored normals.
3. OBJ positive/negative indices, fan order, duplicate names, multiple objects/
   material slots/smoothing, retained mtllib consequences and real Phong display;
   exact source-run→180→186 material proof, no name fallback.
4. glTF embedded buffers/PNG/JPEG, authored nodes, occurrence slots and exact bytes;
   external/ambiguous/unused unsupported content refused before decode/network.
5. Fresh creation/addition and mixed Native conversion, hidden/dormant history,
   both-role transforms, new mesh pins and invisible Proxy/manual confirmation;
   existing saved coordinates and source identities unchanged.
6. Editing/supported material effects and all five outputs, two independent browser
   environments/two round trips with local edits, Review editable copy/Clean remap,
   restore/cold resume and no private proof leakage.
7. Intact-control interruption before/after original publication/start, exact source
   reselection, fixed destination, later-edit retention, acknowledged missing/
   suspect/torn evidence refusal; actual bounded producer/cancel verification.
8. Focused checks/import boundaries, final serial full checkpoint, independent final
   diff review and dedicated Chromium actual pixels/picking/material acceptance.
   Device/offline/adoption/release evidence remains separate. Do not rerun the
   unrelated500k SH4 Review latency case merely to raise counts.

The exact companions and one grouped PO decision were reviewed/approved2026-10-28.
Implement the connected workflow; intermediate formats/helpers do not create
renewed approval or manual-testing waits. Todo owns actual checks and remaining work.
