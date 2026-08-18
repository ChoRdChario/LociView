# Domain and rendering specification

> Status: `PROPOSED FOR PRODUCT-OWNER APPROVAL / NOT IMPLEMENTED`

## 1. Scope and invariants

This document defines the persistent spatial model, the renderer-neutral scene boundary, and the supported rendering and interaction behavior. It does not select a renderer.

The following are invariants:

- the fixed hierarchy is `RepresentationFrame -> AssetFrame -> ProjectFrame`;
- source and derived bytes are never modified to perform a user alignment;
- `AssetRevision` and `AssetBindingRevision` are immutable;
- one `activeBindingId` on each ready asset atomically selects both content revision and project alignment; an unresolved asset has none;
- persistent data contains semantic intent and resource identity, never engine objects or render flags;
- collision evidence and visible geometry have different roles;
- SceneDocument is derived and disposable, not the source of truth.

## 2. Coordinate contract

### 2.1 Frames

- **RepresentationFrame**: coordinates encoded by one mesh, GS, point-cloud, mask or proxy resource.
- **AssetFrame**: stable coordinates for one logical real-world object across compatible revisions.
- **ProjectFrame**: shared coordinates for cameras, views and all aligned assets.

The only point conversion is:

```text
p_asset   = representationToAsset * p_representation
p_project = assetToProject * p_asset
```

The conversion of directions uses the inverse-transpose where required; normals MUST be normalized after conversion.

### 2.2 Transform forms

User alignment is a positive Sim(3):

```ts
interface Sim3 {
  translation: readonly [number, number, number];
  rotationXYZW: readonly [number, number, number, number];
  uniformScale: number;
}
```

Every translation component and `uniformScale` MUST be finite, and `uniformScale` MUST be greater than zero. The quaternion MUST be finite, normalized on input, and serialized with a deterministic sign convention. Composition is `translation + scale * rotation(point)`.

Immutable import normalization uses a separate type that can represent handedness without allowing arbitrary affine distortion:

```ts
interface CanonicalTransform {
  translation: readonly [number, number, number];
  rotationXYZW: readonly [number, number, number, number];
  uniformScale: number;
  reflection: 'none' | 'x';
}

interface Aabb3 {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}
```

For a column vector, composition is `translation + uniformScale * R(rotation) * F(reflection) * point`, where `F('x') = diag(-1, 1, 1)` and `F('none')` is identity. Every translation component and the scale are finite, and scale is strictly positive; reflection is represented only by the enum, never by a negative scale. This represents every proper or improper three-dimensional similarity with one fixed reflection convention. Persistent quaternions are unit length within `1e-12`; `q` and `-q` are canonicalized by requiring positive `w`, or when `w` is zero, the first non-zero `x`, `y`, then `z` component to be positive. Writers normalize before serialization; validators reject noncanonical persisted values.

Normals use `normalize(R * F * normal)` because the positive uniform scale cancels. A reflected triangle representation flips front-face winding and tangent handedness exactly once. A renderer that cannot apply these rules MUST bake only immutable `representationToAsset` normalization into an AssetFrame derived display resource, set that derivative's `representationToAsset` to identity, and leave mutable `assetToProject` untouched. Shear, arbitrary non-uniform scale and manual reflection are unsupported. Numeric encoding and digests follow `LociCanonicalJsonV1` in `02-storage-package-migration.md`.

For Gaussian data, applying only the mean transform is forbidden. Let `L` and `t` be the linear and translation parts of the complete RepresentationFrame-to-ProjectFrame transform. A Gaussian mean and covariance transform as `meanProject = L * meanRepresentation + t` and `covarianceProject = L * covarianceRepresentation * transpose(L)`; opacity is unchanged. View-dependent bases such as spherical harmonics evaluate `dRepresentation = normalize(inverse(L) * dProject)`, or use a mathematically equivalent coefficient rotation/reflection. The FormatProfile fixes whether `dProject` points camera-to-mean or mean-to-camera, basis normalization, degree/coefficient order, DC/base-color meaning, coefficient color space, pre/post-basis bias, activation/clamp and encoded opacity/scale activation. A backend that cannot preserve anisotropy or those basis/color semantics under scale, rotation or reflection MUST use a profile-validated derivative that bakes only immutable `representationToAsset` normalization into AssetFrame and then uses identity `representationToAsset`, or report the Representation unsupported. A bake never absorbs mutable `assetToProject`. Mean-only, rotation-only, reflection-blind or alternate color-activation approximations are not legal fallbacks.

Every persisted `Aabb3` component is finite and satisfies `min[i] <= max[i]`. A FormatProfile defines a finite conservative support rule for each primitive; for GS this includes the exact opacity/covariance support cutoff rather than treating Gaussian support as infinite. Bounds are semantic metadata, not a decode-time backend guess.

ProjectFrame is immutable. Its wire form is fixed rather than renderer-dependent:

```ts
interface Project {
  title: string;
  frame: ProjectFrame;
  defaultDisplaySetId: DisplaySetId;
}

interface ProjectFrame {
  id: FrameId;
  handedness: 'right';
  upAxis: '+Y';
  unit:
    | { kind: 'meters'; metersPerProjectUnit: 1 }
    | { kind: 'custom'; metersPerProjectUnit: number }
    | { kind: 'unknown' };
}
```

For `custom`, `metersPerProjectUnit` is finite and strictly positive. The frame is recorded once and cannot be changed in place; a future frame conversion creates a new project or an explicit project-frame revision under a superseding specification. Legacy projects whose physical unit is unknown MUST use `kind: 'unknown'`; migration MUST NOT claim meters by guessing. Cameras, saved views, `assetToProject`, project-space captions and migration golden vectors all use this exact frame.

## 3. Persistent domain

All logical IDs are opaque stable IDs generated once. SHA-256 digests, filenames, current array positions, material names, OPFS paths and renderer handles are not logical IDs. A legacy migrator may use an immutable source-operation digest/location as a one-time deterministic seed for a source element that had no ID, but the resulting ID is frozen in the migration registry and is never recomputed from current order or content revision.

```ts
interface AssetCommon {
  id: AssetId;
  label: string;
  assetFrameId: FrameId;
  status: AssetStatus;
  lifecycle: EntityLifecycle;
}

type Asset = AssetCommon;

type AssetStatus =
  | { kind: 'ready'; activeBindingId: AssetBindingRevisionId }
  | {
      kind: 'unresolved';
      reason: 'missingSource' | 'unsupportedFormat' | 'migrationError';
      expectedLabel?: string;
      expectedDigest?: Sha256Hex;
      pendingAssetToProject?: Sim3;
    };

interface AssetBindingRevision {
  id: AssetBindingRevisionId;
  assetId: AssetId;
  assetRevisionId: AssetRevisionId;
  assetToProject: Sim3;
  parentBindingId?: AssetBindingRevisionId;
  method: 'import' | 'manual' | 'bounds' | 'correspondence' | 'migration';
  residual?: number;
  payloadDigest: string;
}

interface AnchorCompatibilityClass {
  id: AnchorCompatibilityId;
  targetVariantFamilyIds: readonly [VariantFamilyId, ...VariantFamilyId[]];
}

interface AssetRevision {
  id: AssetRevisionId;
  assetId: AssetId;
  parentRevisionId?: AssetRevisionId;
  representationIds: readonly RepresentationId[];
  anchorCompatibilityClasses: readonly AnchorCompatibilityClass[];
  materialCompatibilityMaps?: readonly MaterialCompatibilityMap[];
  provenance: Provenance;
  payloadDigest: string;
}

type RepresentationRole =
  | 'meshPrimary'
  | 'pointPrimary'
  | 'gsPrimary'
  | 'visualPatch'
  | 'interactionProxy'
  | 'splatExclusion';

type RepresentationPurpose = 'source' | 'display' | 'preview' | 'interaction';
type RepresentationContentKind = 'mesh' | 'gaussianSplat' | 'pointCloud' | 'splatMask';

interface Representation {
  id: RepresentationId;
  assetId: AssetId;
  representationFrameId: FrameId;
  contentKind: RepresentationContentKind;
  purposes: readonly RepresentationPurpose[];
  role: RepresentationRole;
  variantFamilyId: VariantFamilyId;
  formatProfile: FormatProfileRef;
  blob: BlobRef;
  representationToAsset: CanonicalTransform;
  logicalBoundsAsset: Aabb3;
  derivedFrom: readonly RepresentationId[];
  derivation?: DerivationRecord;
  materialCatalog?: MaterialCatalog;
  compositeGroupId?: CompositeGroupId;
  targetGsVariantFamilyIds?: readonly VariantFamilyId[];
  proxyForGsVariantFamilyId?: VariantFamilyId;
  payloadDigest: string;
}

interface MaterialCatalog {
  layoutId: MaterialLayoutId;
  slots: readonly MaterialSlot[];
}

interface MaterialSlot {
  logicalMaterialSlotId: MaterialSlotId;
  sourceLocator: MaterialSourceLocator;
  sourceSemantics: SourceMaterialSemantics;
  displayName?: string;
}

interface SourceMaterialSemantics {
  coverage:
    | { kind: 'opaque' }
    | { kind: 'mask'; alphaCutoff: number }
    | { kind: 'blend' };
  optics: 'surface' | 'transmission';
  lighting: 'lit' | 'unlit';
  doubleSided: boolean;
}

interface MaterialCompatibilityMap {
  source: { assetRevisionId: AssetRevisionId; variantFamilyId: VariantFamilyId; layoutId: MaterialLayoutId };
  destination: { assetRevisionId: AssetRevisionId; variantFamilyId: VariantFamilyId; layoutId: MaterialLayoutId };
  slots: Readonly<Record<MaterialSlotId, MaterialSlotId>>;
}

type Vec3 = readonly [number, number, number];
type Sha256Hex = string;

interface FormatProfileRef {
  id: string;
  specificationSha256: Sha256Hex;
}

interface PortableTool {
  id: string;
  version: string;
}

interface Provenance {
  origin: 'import' | 'derived' | 'migration';
  tool?: PortableTool;
  sourceMediaType?: string;
  inputBlobDigests: readonly Sha256Hex[];
}

interface DerivationRecord {
  kind: 'lod' | 'preview' | 'interactionProxy' | 'formatConversion' | 'staticPoseBake' | 'splatExclusion';
  tool: PortableTool;
  parameterDigest: Sha256Hex;
  inputBlobDigests: readonly Sha256Hex[];
}

type MaterialSourceLocator =
  | { kind: 'gltfMaterial'; materialIndex: number }
  | { kind: 'representationMaterial'; slotIndex: number }
  | { kind: 'derivedMaterial'; slotIndex: number };

type SurfaceRef =
  | {
      kind: 'meshTriangle';
      nodeIndex: number;
      primitiveIndex: number;
      triangleIndex: number;
      barycentric: readonly [number, number, number];
    }
  | {
      kind: 'pointSample';
      nodeIndex: number;
      primitiveIndex: number;
      pointIndex: number;
    }
  | { kind: 'splatSample'; sourceSplatIndex: number };

type BackgroundIntent =
  | { kind: 'solid'; colorSrgb: readonly [number, number, number] }
  | { kind: 'transparent' };
```

### 3.1 Immutability and replacement

- `Representation`, `AssetRevision` and `AssetBindingRevision` are immutable and carry canonical payload digests.
- Their metadata maps are append-only within a collaboration lineage. “Retired” means no active/conflicting strong reference reaches the record; the record and ID are not deleted or reused, although an unreferenced blob may later be collected under the storage rules.
- Creating a new derivative, proxy or preview creates a new `Representation`, a new `AssetRevision`, and a new `AssetBindingRevision` that copies the previous `assetToProject`; activation changes the one binding pointer only after all new bytes are durable.
- `anchorCompatibilityClasses` is sorted by class ID. Its immutable partition domain is the distinct VariantFamily IDs appearing among this revision's `representationIds` whose role is `meshPrimary`, `pointPrimary`, `gsPrimary` or `visualPatch`; it does not depend on current purpose, visibility, LOD, backend eligibility or RenderPlan. Each class has a non-empty, deduplicated, lexicographically sorted target-family list, and those lists partition that domain exactly once. Proxy and exclusion families never own a class; a proxy uses the class containing its declared GS target. New v2 import/authoring creates one singleton class per pickable family; only a pinned migration/compatibility procedure may conservatively group families whose prior anchors cannot be distinguished. A `visualPatch` family always has its own singleton class and never shares one with the base mesh/point/GS families.
- Adding a surface-equivalent candidate inside an unchanged VariantFamily MAY preserve that family's class ID even when its encoded RepresentationFrame differs but the validated transform maps it to the same AssetFrame contribution. Carrying a class ID into a new revision requires the exact same target-family list and verified surface equivalence for every member. An AssetFrame surface/topology change or uncertain correspondence creates a new VariantFamily and a new compatibility class; any class-membership change also requires a new class ID. Adding or removing an unrelated class does not invalidate retained classes; removing or surface-changing a patch drops/replaces only its singleton class.
- Replacement creates a new asset revision and a new binding, verifies every required blob, then changes only `activeBindingId`.
- The old revision and binding metadata remain available in the collaboration lineage. Their bytes remain available only while a current/conflict/retention root requires them.
- Concurrent `activeBindingId` changes are a user-visible conflict. The asset is absent from every authoritative mode and cannot be edited or exported as resolved state until the conflict is resolved. The UI MAY offer labelled read-only previews of each candidate, selected explicitly rather than through a CRDT materialized winner.
- An unresolved asset has no binding and no fabricated `BlobRef`. It remains a valid container for migrated captions and diagnosis. `pendingAssetToProject`, when present, is canonical portable placement intent only and does not activate scene content. Assigning real content stages and verifies representations, creates a revision/binding whose `assetToProject` equals that pending value unless the user explicitly chooses another transform in the same reviewed command, then replaces the complete atomic `Asset.status` with `ready`. If no pending value exists, assignment requires an explicit alignment choice rather than silently assuming identity. Concurrent status replacements retain whole-status candidates rather than mixing kind/reason/binding fields.
- Ownership is closed over immutable records. For every `AssetBindingRevision B`, `B.assetRevisionId` resolves to an `AssetRevision R` and `B.assetId === R.assetId`. When present, `B.parentBindingId` resolves to a binding for the same asset, and `R.parentRevisionId` resolves to a revision for the same asset. A ready `Asset A` may name `B` through `activeBindingId` only when `A.id === B.assetId`. A missing or cross-asset owner/reference invalidates the affected binding/revision closure before SceneDocument; no resolver follows a foreign record by guessing.
- Frame and compatibility ownership is also closed. `Project.frame.id` is distinct from every Asset/Representation frame, and each `Asset.assetFrameId` belongs to exactly one asset. Representations may share a `representationFrameId` only within that asset and only when their canonical persisted `representationToAsset` values have byte-identical `LociCanonicalJsonV1`; if `representationFrameId === assetFrameId`, the transform is canonical identity. An `AnchorCompatibilityId` may occur only on revision classes and anchors for one asset and at most once inside one revision. When an anchor's optional `authoredAssetRevisionId` resolves, that revision has the same asset and contains exactly one class whose ID equals `authoredAnchorCompatibilityId`; when source provenance also resolves, the class/source-family rule below applies. Validators derive these ownership/partition indexes from the document and reject collisions; no general frame graph or compatibility registry is introduced.
- SceneResolver derives an asset's fit/union bound as the exact component-wise minimum/maximum union of each distinct visual VariantFamily's `logicalBoundsAsset`, counting one family once in lexicographic family-ID order and excluding `interactionProxy` and `splatExclusion`. It rejects an empty visual set, non-finite/inverted input and canonicalizes every zero result to positive zero. The result is stable across source/display/preview candidate switching and is never persisted as a second potentially divergent copy. A missing or mismatched family envelope invalidates the revision before SceneDocument.
- To derive a ProjectFrame AABB, SceneResolver transforms all eight AssetFrame corners through the active binding's `assetToProject`, then takes component-wise minima/maxima and canonicalizes zero. Transforming only stored min/max endpoints or using a backend object's bounding box is invalid. Multi-asset fit is the same lexicographic-asset-ID union of those ProjectFrame boxes.

### 3.2 Representation role and variant rules

- A representation has exactly one role. If one blob serves two roles, create two immutable Representation records that share the BlobRef.
- For a model container that contains both triangle and ordinary-point primitives, `contentKind` is also the subset selector: the `mesh` Representation exposes only triangle/cutout mesh primitives and the `pointCloud` Representation exposes only ordinary point primitives. A backend must not decode/draw the other contribution through that record. Unsupported primitive modes are diagnosed, never folded into either contribution by guess.
- `meshPrimary`, `pointPrimary`, `gsPrimary`, and `visualPatch` are visual roles. A `visualPatch` is a human-authored or explicitly imported visual repair mesh; it is not inferred from, or silently replaced by, collision/proxy geometry. `splatExclusion` is its optional Integrated rendering control. `interactionProxy` is interaction-only.
- `interactionProxy` requires `contentKind: 'mesh'` and purposes exactly `['interaction']`; it cannot be a visual or preview candidate.
- `interactionProxy` names exactly one `proxyForGsVariantFamilyId` present in the same asset revision.
- Relationship fields are role-closed. `proxyForGsVariantFamilyId` is required only for `interactionProxy`; `targetGsVariantFamilyIds` is required only for `splatExclusion`; and `compositeGroupId` is allowed only on `visualPatch` or `splatExclusion`. Every other role omits those members. A field on the wrong role is invalid rather than ignored.
- `splatExclusion` requires `contentKind: 'splatMask'`, includes `display` purpose, has a `compositeGroupId`, and names a non-empty, deduplicated, lexicographically sorted `targetGsVariantFamilyIds` list whose families are `gsPrimary` contributions in the same asset revision. Its `representationFrameId` equals the owning `Asset.assetFrameId` and its canonical `representationToAsset` is identity, so the wire predicate is already baked into AssetFrame. It never produces color by itself.
- A source-only representation is never rendered. A visual representation is eligible only when purposes contain `display` or `preview`.
- `variantFamilyId` groups mutually exclusive source/display/preview encodings of the same logical contribution. SceneDocument exposes all valid candidates; RenderPlan selects exactly one eligible candidate per visible family. Independent surfaces use distinct families and may draw together.
- A VariantFamily belongs to exactly one `assetId`, `role` and `contentKind` across the document. Candidates also have byte-identical `logicalBoundsAsset`, role-specific semantic relationship values (`compositeGroupId`, `targetGsVariantFamilyIds`, `proxyForGsVariantFamilyId`, including absence) and, when material-bearing, the same layout/logical-slot/source-semantics set. Candidate ID, blob, FormatProfile, purposes, derivation, RepresentationFrame/`representationToAsset` and material source locators may differ when each validated transform maps the encoding to the same asserted logical contribution in AssetFrame; this permits a reflected raw source and identity-transform baked display derivative in one family. Mesh, ordinary points, GS, visual patches, exclusions and proxies therefore use distinct families; their relationships use `derivedFrom`, proxy/exclusion target fields and composite groups. A cross-asset, cross-role, cross-content or semantically inconsistent family is invalid before SceneDocument.
- `logicalBoundsAsset` is the conservative family envelope computed from its authoritative verified source under that source's static pose and FormatProfile. A source-less derived-only family uses its first verified derivation output as the immutable authoritative contribution. Every later LOD/preview/bake candidate copies the same envelope; its decoded transformed content bound must be a subset. A derivative may not shrink the semantic envelope and thereby change camera fit, culling or candidate selection.
- All candidates in one material-bearing family carry `materialCatalog` with the same `layoutId`, complete logical slot set and byte-identical `sourceSemantics` for each logical slot; only `sourceLocator` may differ. An incomplete or semantically different catalog makes that candidate ineligible.
- A MaterialCatalog for a material-bearing candidate is non-empty. Its slots are sorted lexicographically by `logicalMaterialSlotId`; both logical IDs and canonical `sourceLocator` values are unique, and the locator set is an exact bijection with the FormatProfile's renderer-addressable material enumeration for that contribution. Duplicate IDs/locators, unsorted/incomplete/extra slots or two payloads for one logical slot invalidate the candidate before SceneDocument.
- `interactionProxy` MUST NOT contribute color, depth, screenshots, bounds used for visual fit, shadows or measurement.
- If visual occlusion geometry is later needed, it MUST use a separate role; `interactionProxy` cannot be reused implicitly.
- A `compositeGroupId` is asset-scoped and cannot occur on another asset. Within any resolved AssetRevision containing a `splatExclusion`, the group membership is derived only from representations in that revision and contains at least one `visualPatch` family and at least one `splatExclusion` family with that same ID. An ungrouped exclusion, a cross-asset member, a target outside the revision, or a group without both roles invalidates the complete group. An ungrouped `visualPatch` remains a valid independent surface but has no exclusion relationship.
- In Integrated mode RenderPlan enables such a group atomically only when it can select one eligible candidate from every visual-patch and exclusion family in the group. If one family is missing, invalid or unsupported, neither patch nor mask is applied and the group produces one diagnostic; partial color or exclusion is forbidden. GS mode ignores the complete group.
- GS mode shows the unexcluded GS representation. Integrated-only exclusions MUST NOT alter the standalone GS view.
- Source, display and preview purposes are orthogonal to visual role. A raw GS can be both `source` and `display`; a paged derivative can be `display` only, but the two cannot be selected simultaneously from one family.
- Persistent `purposes` are deduplicated and serialized in `source`, `display`, `preview`, `interaction` order.
- Derived-resource provenance records tool, exact version, parameter digest and input digests.
- Every Representation names one immutable `FormatProfileRef`. The ID denotes a versioned semantic profile, not an extension: its specification fixes byte sniffing, supported container features, coordinate conversion, static pose, contribution/material enumeration, source-occurrence numbering, bounds/support calculation, any GS covariance/view-basis rules, any `splatMask` wire/predicate rules and one normative golden-manifest digest. `specificationSha256` hashes the exact ratified profile bytes, and the application maintains a one-to-one ID/digest registry. Unknown IDs, a known ID with another digest or a backend that cannot reproduce the profile/goldens are Unsupported; the backend may not substitute its library defaults. A semantics-changing decoder upgrade uses a new profile ID and new immutable Representation/Revision, followed by normal compatibility review.
- The MVP admits only a hard, profile-defined AssetFrame predicate for `splatMask`. The profile fixes the canonical mask wire, finite-coordinate/boundary rules and a Boolean `excluded(meanAsset)` evaluator; the exclusion Representation's required AssetFrame alias/identity transform is validated before those bytes are eligible. For every selected target-GS candidate, the backend first maps each Gaussian mean through that candidate's `representationToAsset`, then omits the complete Gaussian exactly when the predicate is true. Source-occurrence, page, draw-order and LOD-local indices are forbidden mask domains; partial covariance overlap does not create soft coverage. Each exclusion VariantFamily contains exactly one Representation in MVP, so a re-encoding creates a new immutable family/revision and is revalidated rather than silently claiming equivalent mask semantics.
- Active masks targeting one GS family compose by Boolean union, independent of group or serialized order. Exclusion is evaluated before color/transmittance, depth, ID and direct/proxy-pick contribution, and an excluded Gaussian contributes to none of them. A backend applies the identical predicate to raw, paged and preview GS candidates or declares that candidate Unsupported. Any soft mask, source-index mask or other composition rule requires a new FormatProfile and a superseding product/domain decision.
- The MVP has no animation timeline or autoplay. A FormatProfile either defines one deterministic static default pose—authored node transforms, initial morph weights and skin/joint evaluation with no animation-clip sampling—or rejects that source feature. A backend that cannot reproduce that pose uses a validated `staticPoseBake` derivative that bakes the source's immutable pose/`representationToAsset` into AssetFrame but never mutable `assetToProject`, while retaining the raw source, or reports Unsupported. Rest pose, time-zero clip sampling and engine autoplay are not interchangeable guesses.
- The first glTF profiles select the declared default scene; when absent they accept exactly one scene and reject zero/multiple-scene ambiguity. A node with both `matrix` and any TRS member is rejected; otherwise its authored matrix is used, or TRS uses glTF defaults. Initial morph weights resolve node weights, then mesh weights, then zeros. Skin joints use that same unsampled default hierarchy and the profile-defined inverse-bind default/evaluation. Animation channels are never sampled, even at time zero. These exact rules, supported extensions and golden matrices belong to the ratified profile bytes rather than to a backend loader option.
- Every `AssetRevision.representationIds` target resolves and has the same `assetId` as the revision. `derivedFrom` is deduplicated, sorted lexicographically, and every target resolves to a Representation for that same logical asset.
- The directed `derivedFrom` relation is a finite DAG with maximum derivation depth 32. Self-reference and cycles of any length are invalid. Commands, package import, migration and history-free builders validate the complete affected graph before an asset can become authoritative.
- A `MaterialCompatibilityMap` stored in revision `D` has `destination.assetRevisionId === D.id` and `source.assetRevisionId === D.parentRevisionId`. Both endpoints must resolve their named family/catalog. MVP maps only the direct parent to the new revision; ancestor chaining is unsupported.

| Role | Required content kind | Purpose constraint |
|---|---|---|
| `meshPrimary` | `mesh` | source and/or display/preview |
| `pointPrimary` | `pointCloud` | source and/or display/preview; ordinary points, never inferred as GS |
| `gsPrimary` | `gaussianSplat` | source and/or display/preview |
| `visualPatch` | `mesh` | source and/or display/preview |
| `splatExclusion` | `splatMask` | display; no color output |
| `interactionProxy` | `mesh` | exactly interaction |

### 3.3 Portable nested-value contract

- Every vector component is finite. Normals and camera `up` are normalized before persistence and must already satisfy the canonical tolerance on read.
- SHA-256 values are 64 lowercase hexadecimal characters. Digest lists are deduplicated and sorted lexicographically.
- `PortableTool.id` matches `[a-z0-9][a-z0-9.-]{0,63}`; version is NFC text of 1–128 Unicode scalars. Neither field may contain a path, URL, user name or device name.
- `FormatProfileRef.id` matches the same lowercase ASCII grammar and is permanently bound to one exact `specificationSha256`; the digest is SHA-256 of the ratified profile's exact UTF-8 bytes. Profile IDs/digests, not loader package versions or filename extensions, define portable decode semantics.
- `sourceMediaType` is an ASCII MIME type of at most 127 characters. Local filenames and paths are never provenance.
- Material and surface indices are non-negative safe integers. Mesh barycentric components lie in `[0, 1]` and sum to one within `1e-6`. Every FormatProfile pins node/primitive occurrence semantics; for glTF, `nodeIndex` is the JSON source node instance and `primitiveIndex` is its mesh primitive ordinal, while a flat source uses canonical zero/zero. `meshTriangle.triangleIndex` is the zero-based emitted triangle occurrence in validated index-accessor order before pose deformation, LOD/reorder, reflection winding, culling or backend traversal; barycentric components follow that source vertex order. `pointSample.pointIndex` analogously selects the emitted ordinary-point occurrence in validated primitive/index-accessor order. `splatSample.sourceSplatIndex` is the profile-defined Representation-global occurrence in encoded source order before paging, LOD selection, depth sort or draw reorder. A derivative preserves a profile-global inverse map or omits `surfaceRef`. These locators are representation-local provenance, not stable logical IDs. A backend that cannot recover the complete source occurrence omits `surfaceRef` rather than persisting a flattened traversal-, page-, sort-, draw- or LOD-local index.
- Hit confidence, when present, is finite in `[0, 1]`; it expresses backend confidence, not survey accuracy.
- A `SurfaceRef`, parent link, provenance input digest or compatibility map never proves that referenced bytes are still locally available. Strong runtime/package reachability is defined separately in the storage specification.
- Background and material colors are linear-data-independent sRGB triples in `[0, 1]`; renderers perform their own color-space conversion.
- `Provenance` and `DerivationRecord` contain no contributor identity or wall clock. Collaboration packages preserve them. History-free builders apply their versioned allowlist and re-key/digest any immutable record whose nested provenance is changed.

## 4. Captions, materials, sets and views

### 4.1 Caption anchor

```ts
interface AssetAnchorBase {
  kind: 'asset';
  assetId: AssetId;
  assetFrameId: FrameId;
  positionAsset: Vec3;
  authoredAssetRevisionId?: AssetRevisionId;
  authoredAnchorCompatibilityId: AnchorCompatibilityId;
}

type AssetAnchor =
  | (AssetAnchorBase & {
      normalAsset?: never;
      hitEvidence: {
        method: 'manual';
      };
    })
  | (AssetAnchorBase & {
      normalAsset?: Vec3;
      hitEvidence?: {
        method: 'mesh' | 'point-cloud' | 'direct-splat' | 'gpu-id-depth' | 'proxy';
        confidence?: number;
        source?: {
          representationId: RepresentationId;
          surfaceRef?: SurfaceRef;
        };
      };
    });

interface ProjectAnchor {
  kind: 'project';
  projectFrameId: FrameId;
  positionProject: Vec3;
  normalProject?: Vec3;
}
```

The AssetFrame position is canonical. `authoredAnchorCompatibilityId` is the retained surface-class evidence. A structurally valid ready anchor is compatible exactly when its ID occurs in the validated active revision's class set; absence yields `needsReview`. A duplicate/overlapping/otherwise ambiguous class partition instead invalidates the active revision closure and excludes the affected asset—it is not downgraded to ordinary pin review. `authoredAssetRevisionId` is normally optional, non-resolving provenance: it MAY name a revision omitted from a history-free package and MUST NOT by itself add that revision or its blobs to package reachability. `hitEvidence.method` and nonmanual `confidence` are internal safety/provenance semantics and survive history-free export; they do not require a persistent badge in the ordinary pin UI. Mesh-, point-, GS- and proxy-derived pins use the same visible pin and gizmo correction flow.

A manual gizmo correction requires an unconflicted active binding. If the anchor's current class still occurs exactly once on the active revision, an ordinary move preserves that class without another family prompt. If it is `needsReview`, the user must explicitly select one active, pickable visual family and the command uses the unique class containing that family; missing/ambiguous selection refuses the command. The command replaces the complete anchor, sets `authoredAssetRevisionId` to the active revision, sets or preserves the resulting current `authoredAnchorCompatibilityId`, writes `hitEvidence:{method:'manual'}`, and omits `normalAsset`, `source` and `confidence`. An explicit rebind clears `needsReview`; merely changing coordinates without a target never does. Keeping an old surface normal, inactive compatibility ID or pick method on the new coordinate is invalid. The prior pick remains only in collaboration history where retained, not as current anchor provenance. `authoredAssetRevisionId` remains weak history: Review omits it, while Clean rewrites a compatible manual anchor to the rebuilt active revision and omits it from a still-`needsReview` manual anchor. Only nonmanual `hitEvidence.source.representationId/surfaceRef` are weak revision-scoped provenance and may be omitted when outside closure. A missing normal MUST NOT prevent caption creation. `Caption.anchor` is one atomic semantic field: a move/pick replaces the complete validated anchor in one change, and concurrent replacements surface whole-anchor candidates rather than mixing vector components.

Frame IDs are validated assertions, not alternate routing choices. An `AssetAnchor` resolves its `assetId` to exactly one Asset and requires `assetFrameId === Asset.assetFrameId`. A `ProjectAnchor.projectFrameId` and every `SavedView.projectFrameId` require equality with `Project.frame.id`. A mismatch excludes the affected pin or view and produces an invalid-reference diagnostic; the resolver never chooses between the entity ID and frame ID.

Every new nonmanual pick writes the class containing its selected source VariantFamily even when weak source provenance cannot be retained. When `hitEvidence.source` is present, `authoredAssetRevisionId` is also present, resolves to the same asset and includes that Representation. The anchor class contains the source Representation's VariantFamily, except that a proxy uses the class containing its declared `proxyForGsVariantFamilyId`. The source method/content/role/surface matrix is closed:

| Method | Source Representation | Optional `surfaceRef` |
|---|---|---|
| `mesh` | `contentKind: 'mesh'`, role `meshPrimary` or `visualPatch` | `meshTriangle` only |
| `point-cloud` | `contentKind: 'pointCloud'`, role `pointPrimary` | `pointSample` only |
| `direct-splat` or `gpu-id-depth` | `contentKind: 'gaussianSplat'`, role `gsPrimary` | `splatSample` only |
| `proxy` | `contentKind: 'mesh'`, role `interactionProxy` | `meshTriangle` only |
| `manual` | no source Representation | no `normalAsset`, `surfaceRef`, source or confidence |

A `surfaceRef` cannot exist without its source. New pick commands record only a Representation that the current RenderPlan made visible/pickable, validate source indices against its loaded verified bytes, and for a proxy require its declared GS family to be visible. Package/open validation always checks resolvable owner/method/content/role/surface-kind metadata; it range-checks an index when the weak source bytes are already in the validated closure. If those non-protecting bytes are absent, the source remains non-dereferenceable/unverified provenance and never invalidates the canonical anchor. A history-free package may omit the complete weak `source` while retaining method/confidence and the canonical anchor.

### 4.2 Material identity and intent

Material override `routing.target` names `{ assetId, variantFamilyId, materialLayoutId, logicalMaterialSlotId }`, not one device-specific representation. Every eligible source/display/preview candidate in that family provides a complete `MaterialCatalog`, so RenderPlan may switch raw, paged and preview candidates without losing semantic intent. Adding a nonvisual derivative therefore does not invalidate overrides. A replacement family or layout requires a `MaterialCompatibilityMap` whose source/destination IDs and one-to-one slot entries validate against both catalogs; absent, partial, cyclic or ambiguous maps make the overrides review items. The map is a proposed/auditable migration, not a runtime alias: explicit acceptance writes each override target to the destination in the replacement transaction. RenderPlan requires an exact current target and never follows a guessed or transitive map. Display name, node path and source locator are diagnostic/import locators only and never implicit compatibility keys.

Every `meshPrimary`, `pointPrimary` and `visualPatch` candidate has a complete MaterialCatalog. When a validated source has no material object, its FormatProfile still emits one synthetic logical slot, but derives that slot's `SourceMaterialSemantics` from any vertex/point/face color-alpha or format attributes. Only a profile-proven `sourceAlpha === 1` with no authored optical/lighting/sidedness signal receives `{ coverage:{kind:'opaque'}, optics:'surface', lighting:'lit', doubleSided:false }`; alpha below one or alpha that cannot be proven constant uses the profile's explicit non-opaque classification. A synthetic slot supplies identity/routing, not permission to erase source alpha. `interactionProxy`, `splatExclusion` and `gsPrimary` do not acquire a guessed mesh material catalog.

Persistent material data separates:

```text
source semantics
user appearance override
requested compositing policy
```

Coverage and optical behavior are independent axes. The FormatProfile fixes how source texture, vertex color and factors produce `sourceAlpha` and the pre-lighting base color. Source coverage is first evaluated as `1` for `opaque`, `sourceAlpha >= sourceCutoff ? 1 : 0` for `mask`, or `sourceAlpha` for `blend`.

For appearance, `opacity` defaults to one. When present, `baseColorSrgb` replaces the profile-defined constant base-color factor while retaining profile-defined texture/vertex contributions; it is not a post-lighting tint. Chroma is evaluated after that source/override color is resolved, but before lighting/tone mapping. Each normalized sRGB channel `c` converts to linear as `c/12.92` when `c <= 0.04045`, otherwise `((c+0.055)/1.055)^2.4`. Then `d = length(colorLinear - keyLinear) / sqrt(3)`. With zero softness, chroma coverage is zero when `d <= tolerance` and one otherwise. With positive softness, `u = clamp((d - tolerance) / softness, 0, 1)` and chroma coverage is `u*u*(3-2*u)`. Without chroma it is one. `appearanceAlpha = clamp(sourceCoverageAlpha * opacity * chromaCoverage, 0, 1)`.

The renderer-neutral coverage resolver is closed:

| Requested coverage | Effective coverage |
|---|---|
| `inherit` | `smoothBlend` when source is `blend`, opacity is less than one, or chroma softness is positive; otherwise `mask` when source is `mask` or hard chroma is present; otherwise `opaque` |
| `opaque` | `opaque`; any chroma or an opacity other than absent/one makes the request invalid rather than ignored |
| `mask(cutoff)` | binary `appearanceAlpha >= cutoff` |
| `ditherCoverage(cutoff?)` | discard below an optional cutoff, then apply the ratified stable screen-space dither to `appearanceAlpha` |
| `smoothBlend` | smooth `appearanceAlpha` |

An inherited effective mask uses cutoff `0.5` because source mask and hard chroma have already produced binary coverage. G0 ratifies the exact dither matrix/seed/coordinate rule used by both backends. Source/Profile color is canonical unassociated RGB. An opaque sample outputs coverage alpha one. A mask or dither sample outputs nothing when rejected and coverage alpha one when accepted. Only `smoothBlend` outputs fractional coverage alpha `appearanceAlpha`; its semantic premultiplied color is `resolvedRgb * appearanceAlpha`. A backend may use another internal blend representation only when final color/alpha matches this contract; it cannot leave source alpha on a surviving opaque/mask/dither sample.

Geometry coverage composes before the final class. Triangles have binary geometry coverage. An ordinary point's profile returns radial coverage `g`: `binary` accepts exactly `g >= pickCoverageAlphaThreshold`; `ditherCoverage` applies the same ratified stable dither family to `g`; and `smoothBlend` multiplies fractional material output by `g`. Accepted binary/dither geometry samples have coverage alpha one before material evaluation. Binary geometry preserves the material class; dither geometry promotes opaque/mask/dither material to effective dither; smooth geometry promotes every non-discarded result to effective smooth. Geometry and material dither use profile-fixed independent seed domains. Thus a fractional-AA point edge is never labelled Supported opaque Integrated by looking only at its material.

The optics resolver maps `inherit` to source optics, `surface` explicitly disables source transmission, and `transmission` is valid only when source optics is already `transmission`; material intent cannot invent missing transmission parameters. Coverage and optics remain independent, so a source transmission material may retain mask coverage.

RenderPlan carries the resolved coverage class/evaluator inputs, optics, lighting and sidedness. Appearance `lighting:'inherit'`/absence and absent `doubleSided` resolve from `SourceMaterialSemantics`; explicit values replace them. Integrated is Supported only for `optics:'surface'` with `opaque`, `mask` or `ditherCoverage`; surface smooth blend is Experimental only after G1-D or otherwise redirected, while every transmission result is Unsupported and redirected until a separate later material/research gate. Backend results such as `transparent`, `depthWrite`, render queue/order, shader name or effective fallback are not persisted and may not reclassify the resolved material. Mapping an override to a new revision requires an explicit compatibility map; ambiguity creates review work.

The semantic override key is `(scope, assetId, variantFamilyId, materialLayoutId, logicalMaterialSlotId)`. At most one active MaterialOverride may own a key. Concurrent/different IDs for the same key form an explicit duplicate-key conflict; SceneResolver applies neither and resolution must tombstone/retarget all but one. For a selected display set, an exact set-scope record replaces the complete project-scope `appearance` and `compositing` records for that target; it is not a shallow/field merge. If no set record exists, the project record applies; if neither exists, source semantics apply. This precedence never orders duplicate records by ID or creation time.

### 4.3 Display sets and saved views

The editable records are explicit and ID-keyed:

```ts
interface Caption {
  id: CaptionId;
  displaySetId: DisplaySetId;
  title: string;
  body: string;
  colorSrgb?: readonly [number, number, number];
  anchor: AssetAnchor | ProjectAnchor;
  lifecycle: EntityLifecycle;
}

interface MediaResource {
  id: MediaResourceId;
  blob: BlobRef;
  mediaKind: 'image' | 'video' | 'audio' | 'document';
  label?: string;
  payloadDigest: string;
}

interface CaptionAttachment {
  id: CaptionAttachmentId;
  captionId: CaptionId;
  mediaResourceId: MediaResourceId;
  altText?: string;
  orderKey: string;
  lifecycle: EntityLifecycle;
}

interface CaptionTag {
  id: TagId;
  label: string;
  colorSrgb?: readonly [number, number, number];
  orderKey: string;
  lifecycle: EntityLifecycle;
}

interface CaptionTagMembership {
  id: TagMembershipId;
  captionId: CaptionId;
  tagId: TagId;
  lifecycle: EntityLifecycle;
}

interface DisplaySet {
  id: DisplaySetId;
  name: string;
  orderKey: string;
  defaultViewId?: ViewId;
  lifecycle: EntityLifecycle;
}

interface MaterialOverride {
  id: OverrideId;
  routing: {
    scope: { kind: 'project' } | { kind: 'displaySet'; displaySetId: DisplaySetId };
    target: {
      assetId: AssetId;
      variantFamilyId: VariantFamilyId;
      materialLayoutId: MaterialLayoutId;
      logicalMaterialSlotId: MaterialSlotId;
    };
  };
  appearance: MaterialAppearanceIntent;
  compositing: MaterialCompositingIntent;
  lifecycle: EntityLifecycle;
}

interface MaterialAppearanceIntent {
  baseColorSrgb?: readonly [number, number, number];
  opacity?: number;
  lighting?: 'inherit' | 'lit' | 'unlit';
  doubleSided?: boolean;
  chroma?: {
    keyColorSrgb: readonly [number, number, number];
    tolerance: number;
    softness: number;
  };
}

interface MaterialCompositingIntent {
  coverage:
    | { policy: 'inherit' | 'opaque' | 'smoothBlend' }
    | { policy: 'mask'; alphaCutoff: number }
    | { policy: 'ditherCoverage'; alphaCutoff?: number };
  optics: 'inherit' | 'surface' | 'transmission';
}

interface SavedView {
  id: ViewId;
  name: string;
  orderKey: string;
  projectFrameId: FrameId;
  camera: ProjectCamera;
  background: BackgroundIntent;
  presentation?: {
    mode?: 'mesh' | 'gs' | 'compare' | 'integrated';
    displaySetId?: DisplaySetId;
    selectedAssetIds?: readonly AssetId[];
    compareStyle?: 'wipe' | 'split' | 'flicker' | 'sideBySide';
  };
  lifecycle: EntityLifecycle;
}

interface ProjectCamera {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  projection:
    | { kind: 'perspective'; verticalFovRadians: number }
    | { kind: 'orthographic'; verticalSpan: number };
}
```

`ProjectCamera` stores `position`, `target` and `up` in ProjectFrame and exactly one of perspective vertical FOV or orthographic vertical span. Its numbers are finite; position and target differ; `up` is non-zero and not parallel to the viewing direction; perspective FOV is strictly between `0` and `pi` radians; orthographic span is strictly positive. Colors, opacity, source/requested cutoffs, chroma tolerance and softness are finite normalized values in `[0, 1]`; irrelevant policy fields are rejected rather than retained ambiguously. Saved camera/background/presentation and material routing/appearance/compositing are each atomic semantic fields; their nested components are not independently merged into hybrid values. Material routing keeps scope and target together, so a concurrent scope change cannot pair with another target. In particular concurrent `coverage.mask + alphaCutoff` versus `coverage.opaque` changes produce whole-compositing candidates, never `opaque` with a leftover cutoff or another operation's optics. Caption attachment and tag membership are ID-keyed child entities so independent additions/removals merge independently. Ordered records sort by `orderKey` then stable ID; concurrent reorder of the same record is a visible same-field conflict. If no bounded key exists between neighbors, an explicit conflict-aware rebalance rewrites the affected ordered collection in one command; keys are never truncated silently. `MediaResource` is immutable; replacing media creates a new resource and changes/tombstones the attachment rather than changing bytes under an ID.

Portable string normalization and control-character policy is defined once by the storage contract. `Caption.body` is the only multiline persistent field and may preserve TAB/LF/CR exactly; structural and other known display strings are single-line/control-free. Renderers always present these values as text, never markup.

A display set binds caption membership, set-scoped material appearance and an optional default saved view. It remains independent of Mesh/GS/Compare/Integrated. Every editable project has at least one active set and `Project.defaultDisplaySetId` resolves to an active set. Project-scoped material intent applies only when the selected display set has no exact-key override; an exact set record performs the whole-record replacement defined above. Duplicate-key records at either scope apply none and are never ordered by array position.

A set-selection command first changes the session set, then applies that set's `defaultViewId` once. During this application the view's optional `presentation.displaySetId` is ignored, preventing recursion. A direct saved-view command may switch to its referenced active set once and then apply the camera/presentation under the same re-entry guard. Missing/deleted defaults are diagnosed and leave the camera unchanged. The shared startup set is `Project.defaultDisplaySetId`; the momentary active set is local session state unless the user explicitly changes the project default.

A saved view MAY record product mode, selected assets, display set and compare style. Temporary camera, current selection, gizmo and compare slider values are local UI state unless the user explicitly saves a view.

### 4.4 Untrusted media and decoder boundary

Every imported model and attachment is untrusted. `BlobRef.mediaType`, a filename extension and `MediaResource.mediaKind` are declarations, not proof. Before authoritative activation or inline presentation, the importer sniffs the container/signature, runs the exact `FormatProfileRef` structural inspector under byte/node/depth limits, and either records a verified supported profile/type plus its digest-protected semantic summaries or rejects/quarantines it. A type mismatch never selects a more permissive decoder.

The MVP inline attachment allowlist is deliberately narrow:

- raster image: PNG, JPEG and WebP;
- video: MP4 and WebM when the current browser decoder reports support;
- audio: MP3, MP4/M4A, WAV and Ogg when the current browser decoder reports support.

SVG, HTML, XML, PDF, archives, office files, unknown types and every `document` attachment are download-only. They are never placed in `iframe`, `object`, `embed`, `srcdoc`, `innerHTML`, CSS URL or navigable same-origin object-URL contexts. Labels and metadata render as text. Download uses an explicit user action, a sanitized suggested filename and a Blob URL whose lifetime is scoped and revoked.

Model/GS/point-cloud decoders accept only ratified profiles and pinned supported containers. A GLB must be self-contained; external buffer, texture, script, extension or decoder URI resolution is rejected. No decoder callback may initiate an arbitrary network request. On decode, contribution/material identity, static pose, source occurrences, transformed logical bounds and material semantics are checked against the immutable profile-derived metadata; mismatch is a decode error, never a silent metadata rewrite. Runtime CSP and loader tests enforce the offline/no-CDN contract.

Import and decode apply separate limits for encoded bytes, decoded pixels, dimensions, frame/duration metadata, model nodes/primitives, decompression expansion, worker time and concurrent decoders. Decode errors, cancellation and budget exhaustion produce a safe diagnostic without partially attaching a resource. Inline audio/video never autoplay. Object URLs, media elements, workers and decoder resources are released by `ResourceManager` on replacement, unload, cancellation and context loss.

### 4.5 Parent/child commands and orphans

No deletion performs an implicit cascade. A compound UI action expands into explicit child reassignments/tombstones and one domain transaction. Rules are:

- deleting a display set is blocked while it is the project default, the last active set, or is referenced by active captions, set-scoped overrides or saved views; the UI must reassign/remove those references explicitly first;
- deleting a saved view is blocked while an active display set names it as default;
- deleting an asset is blocked while active captions, overrides or saved-view selections reference it; the user must re-anchor, remove or explicitly tombstone each dependent item;
- deleting a caption tombstones every causally observed active attachment and tag membership in the same transaction;
- deleting a tag tombstones every causally observed active membership in the same transaction;
- restoring a parent never restores child tombstones implicitly.

A child addition concurrent with parent deletion is retained as an orphan review item. SceneResolver excludes it from authoritative output; collaboration export preserves it and all conflict-required bytes, review export may omit the affected presentation item with disclosure, and clean export blocks until it is reassigned or tombstoned. Restoring the parent can resolve the orphan explicitly. Media blobs remain strong only through active/conflicting attachments and package/journal retention roots.

## 5. Derived SceneDocument

Ordinary points use one renderer-neutral transient presentation contract:

```ts
interface PointPresentationProfile {
  id: string;
  specificationSha256: Sha256Hex;
  defaultDiameterCssPixels: number;
  minimumDiameterCssPixels: number;
  maximumDiameterCssPixels: number;
  shape: 'disc';
  edgeCoverage: 'binary' | 'ditherCoverage' | 'smoothBlend';
  pickCoverageAlphaThreshold: number;
}

interface PointPresentationIntent {
  profile: PointPresentationProfile;
  diameterCssPixels: number;
}

interface ViewportSnapshot {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  renderScale: number;
}
```

G0 ratifies exactly three external point-profile companions with distinct lowercase-ASCII IDs and specification digests: `lociview-point-binary-1`, `lociview-point-dither-1` and `lociview-point-smooth-1`. Binary is the product default. The three profiles have byte-identical diameter range/default, threshold, disc/radial evaluator and sample rules and differ only in `edgeCoverage`; each `specificationSha256` is the SHA-256 of that companion's exact UTF-8 bytes, and a companion does not contain its own digest. The runtime object's default/range, threshold, radial coverage, edge sampling and edge policy must exactly match its registry entry before G1-B. Profile validation requires finite `0 < minimumDiameterCssPixels <= defaultDiameterCssPixels <= maximumDiameterCssPixels`, `0 < pickCoverageAlphaThreshold <= 1`, and radial coverage `g` in `[0,1]` with `g=0` outside the declared disc footprint. Every `ViewportSnapshot` number is finite and strictly positive, with DPR/render-scale maxima fixed in G0. A non-finite point request is invalid and falls back to the diagnosed profile default; only a finite request is clamped to the ratified CSS range. The complete profile plus requested diameter is explicit session/local intent and is not persisted in a `SavedView`. The exact three-entry ID/digest/value table and default ID are supplied as an immutable `PointProfileRegistrySnapshot`, an explicit semantic resolver input distinct from device capability. SceneResolver rejects an unknown/digest/value-mismatched profile and records the resolved semantic request in SceneDocument.

RenderPlan fixes integer render size as `width = max(1, floor(cssWidth*devicePixelRatio*renderScale + 0.5))` and likewise for height. Semantic coordinates use a top-left origin; framebuffer sample `(i,j)` has CSS center `((i+0.5)*cssWidth/width, (j+0.5)*cssHeight/height)`. A CSS pointer inside the viewport maps to `(min(width-1,floor(xCss*width/cssWidth)), min(height-1,floor(yCss*height/cssHeight)))`. Dither uses those top-left integer sample coordinates; a backend may flip Y only internally. The disc test is performed in these reconstructed CSS coordinates against `diameterCssPixels/2`, so target rounding cannot make an engine-specific ellipse or edge. Points have no distance attenuation and each covered fragment uses the source point's projected center depth. Color/depth/pick-ID passes use the same profile coverage. If a native point primitive would silently clamp the requested size or implement another footprint/depth rule, the backend uses an equivalent quad path or reports Unsupported—it does not hide the clamp. Draw/page traversal may not use another hidden point size.

`ProjectDocV2` is resolved into a deterministic, renderer-neutral `SceneDocument`. It contains:

- stable IDs and ProjectFrame transforms;
- representation role, purpose, visibility and pickability;
- semantic material/compositing requests;
- opaque logical resource references;
- visual bounds and presentation intent;
- the resolved ordinary-point presentation intent;
- the requested mode and display-set effects.

It MUST NOT contain `THREE.Object3D`, `THREE.Material`, PlayCanvas entities, Spark objects, OPFS paths, Blob/ArrayBuffer instances, object URLs, Automerge values, shader names or backend depth/sort flags.

Device capability and transient resource choices produce a separate `RenderPlan`. `CapabilityProfile` advertises the exact supported `(FormatProfileRef.id, specificationSha256)` and point-profile ID/digest pairs; only an exact pair makes a candidate/path eligible. Extension, MIME, content kind or runtime loader version is never a substitute, and a library upgrade must still pass the same profile goldens. The plan records effective LOD, the one selected candidate per variant family, effective compositing mode, effective point footprint, resource budgets and warnings. A backend decision cannot mutate the persistent request.

SceneDocument resolution MUST be deterministic from `ProjectDocV2` plus the repository's complete conflict sets, explicit saved-view/session intent and the exact `PointProfileRegistrySnapshot` only. It never consumes a CRDT library's materialized winner as resolved truth. An unresolved `EntityLifecycle` or `Asset.status` excludes the complete affected entity from authoritative output; anchor, saved-view and material atomic conflicts exclude only their affected pin/view application/override. Project-default, parent/resource edge, optional-default, ordering and presentation-scalar conflicts use the exact projection units in the storage conflict table. RenderPlan generation is separately deterministic for `SceneDocument + CapabilityProfile + BudgetSnapshot + FeatureConfig + ViewportSnapshot`; runtime pressure or a viewport change may therefore change a plan without changing the scene or persisted bytes. Missing or conflicting required records produce diagnostics and omit the specified invalid unit rather than constructing a partly valid engine object.

## 6. Ports and ownership

The v2 boundary is:

```text
ProjectDocV2 + complete conflict sets + saved/session intent + PointProfileRegistrySnapshot
  -> SceneResolver
  -> SceneDocument
  -> ViewerController
       -> RenderCoordinator -> RenderBackend
       -> InteractionIndex
       -> ResourceManager

BlobStore -> ResourceManager
```

Responsibilities:

- **ViewerController** owns product mode, project camera, selection and UI-facing commands.
- **RenderCoordinator** diffs scenes, builds passes, coordinates Compare and schedules frames.
- **InteractionIndex** combines visual hits, direct splat hits and proxy hits, then normalizes them to AssetFrame.
- **ResourceManager** resolves SceneDocument's opaque logical resource references through BlobStore and owns source streams, decoded CPU resources, leases/refcounts, budgets, cancellation, eviction policy and restore scheduling. It accounts for backend-reported GPU bytes. Blob availability affects loading/diagnostics, never SceneResolver's semantic output.
- **RenderBackend** reports capabilities, owns opaque GPU handles, realizes a RenderPlan, renders and picks. On final lease release or context loss the coordinator commands the backend to destroy its handle; handles never escape the adapter.
- **LegacyV1BackendAdapter** preserves current single-model behavior during strangler migration; the current `ViewerCore` is not expanded into the v2 domain.

Every asynchronous load has a generation ID and `AbortSignal`. Completion from an obsolete generation cannot attach resources. Shared textures, buffers and derivatives are disposed only when the ResourceManager lease count reaches zero.

`SceneResolver` MUST NOT read BlobStore bytes, decoder output or device residency. Two devices given the same metadata/conflict/session/profile-registry inputs derive the same logical SceneDocument even when one lacks a required local blob; the latter receives the storage/resource degraded diagnostic and cannot realize that resource, but it does not rewrite semantic scene membership.

## 7. Mode rendering contract

| Mode | Visible roles | Required behavior |
|---|---|---|
| Mesh | one selected candidate from each visible `meshPrimary`, `pointPrimary`, or enabled `visualPatch` family | Correct ordinary mesh/point rendering and source material semantics within backend support |
| GS | one selected candidate from each visible `gsPrimary` family | Full GS without Integrated-only exclusion; progressive LOD is allowed |
| Compare | independently rendered Mesh and GS outputs | Same camera, viewport, exposure and background; wipe/split/flicker/side-by-side; no cross-depth promise |
| Integrated | `gsPrimary`, selected `meshPrimary`/`pointPrimary`, and valid patch/exclusion groups | Opaque/mask/dither coverage is Supported; smooth is Experimental only after G1-D or redirected, and transmission is Unsupported/redirected pending a separate gate |

In Integrated, Supported material results are exactly `surface × (opaque | mask | ditherCoverage)`. Every accepted opaque, mask or dither mesh/ordinary-point sample performs the normal depth test and writes its depth; every rejected sample writes neither color, ID nor depth. Dither trades smoothness for stable order. A non-depth-writing or differently ordered variant is Experimental and cannot claim this Supported contract. Intersections MUST be tested for z-fighting, halos, visible holes and duplicate surfaces.

For `smoothBlend`, the UI presents supported alternatives: Mesh only, Compare, explicit dither conversion, or—only after G1-D—an opt-in experimental compositor. For `transmission`, it presents Mesh, Compare or an explicit supported material conversion; it does not offer G1-D as transmission support. It MUST NOT silently label a queue-order approximation as correct.

WBOIT, if its optional gate passes, remains an approximation. A future exact unified triangle/GS rasterizer would replace or extend `RenderBackend` and `RenderCoordinator`; it must not require a persistent-schema change.

## 8. Picking and interaction

Picking policies:

- Mesh: nearest valid visible hit across selected `meshPrimary`/enabled `visualPatch` triangle contributions and selected `pointPrimary` ordinary-point contributions. An ordinary-point hit records `hitEvidence.method: 'point-cloud'`; it records `SurfaceRef.pointSample` only when the complete source occurrence is available under the rule above. `normalAsset` is included only when a validated source normal can be transformed under the frame contract, and its absence never prevents caption creation.
- GS: direct splat picking first.
- Compare: pick the pane or source currently under interaction.
- Integrated: choose by effective visible depth when the backend can prove it; otherwise expose `auto`, `mesh`, or `GS` targeting and report ambiguity.

For picking, the Mesh source means the visible non-GS `meshPrimary`, `pointPrimary` and enabled `visualPatch` contributions admitted by the active mode; it never includes an `interactionProxy`. Compare applies this rule inside its Mesh pane, and Integrated considers only non-GS contributions actually selected by its RenderPlan. Ordinary-point picking is not splat picking and cannot emit `direct-splat` or `splatSample` evidence.

The provisional ordinary-point click radius is 6 CSS pixels and is frozen or superseded by the G0 device/UX decision before G1. Eligible points come only from a RenderPlan-selected `pointPrimary` candidate and must pass its current LOD, visibility, clipping and depth rules. Binary/dither accepted samples always emit pick ID; rejected samples do not. For smooth material or smooth geometry, an integer pick-ID fragment exists only when the effective final coverage alpha at that canonical sample is at least the active point profile's `pickCoverageAlphaThreshold`; a lower-alpha visible fringe does not count as a fragment hit and may proceed to radius fallback. First, visible triangle and such accepted ordinary-point fragments that actually cover the click pixel are compared by effective visible depth. Only when no Mesh-source fragment covers that pixel may the point-radius fallback consider visible points within 6 CSS pixels. The coordinator orders those candidates by screen-space distance, effective depth and stable Representation ID. For candidates still tied, it uses the lexicographic `(nodeIndex, primitiveIndex, pointIndex)` locator only when every tied candidate has the complete occurrence; if any lacks it, it compares the finite validated RepresentationFrame positions of all tied candidates lexicographically after normalizing negative zero. This position is a non-persisted tie-break. Equal final position with unavailable/distinct normal evidence yields the same canonical anchor and omits source/normal evidence. If any required position cannot be recovered deterministically, or the backend cannot prove fragment coverage, comparable depth or stable ordering under the active plan, it returns an ambiguity and asks for Triangle or Points targeting rather than silently preferring one.

Direct GS picking is click-triggered, never an every-frame full scan. The gate measures p50/p95 latency, miss rate, position error and normal availability. Failure triggers GPU ID/depth investigation, then external or generated interaction proxy support.

Proxy generation is desktop/local preprocessing. The original source and derivation record are preserved. A generated proxy is suitable for approximate hit testing only. It MUST NOT be rendered, exported as a visual reconstruction by default, or used for measurement claims.

In Integrated `auto` picking, a proxy is a candidate only when its declared `proxyForGsVariantFamilyId` is visible and pickable and direct/ID picking is unavailable or has failed its gate. If the backend cannot prove ordering between that approximate hit and a visible mesh hit, `auto` returns an ambiguity and asks the user to target Mesh or GS; it never lets an invisible proxy silently win. Exclusion applies only to its declared `targetGsVariantFamilyIds`; the same active AssetFrame predicate filters direct/ID hits and proxy hit positions, so an excluded GS region cannot remain invisibly pickable.

## 9. Alignment UX

The MVP alignment tool MUST provide:

- a locked reference asset;
- translation, quaternion-backed rotation and positive uniform scale gizmos;
- exact numeric input;
- bounds center/scale coarse alignment;
- preview without modifying source bytes;
- undo/redo, reset to identity, reset to imported default and restore previous binding;
- residual and method metadata when a fitted method is used;
- Mesh, GS and Compare switching without losing the pending transform.

Repair alignment is representation-local, not a second Asset alignment. “Add visual repair” preserves the imported source, lets the user place its RepresentationFrame into the selected target AssetFrame with the same translation/quaternion/positive-uniform-scale controls, then freezes that `representationToAsset` in the new `visualPatch`. An optional hard exclusion is generated/imported already in the target AssetFrame with identity `representationToAsset`. Accepting the preview stages both resources and atomically creates one new AssetRevision/AssetBindingRevision that copies the prior `assetToProject`; cancellation changes no active revision. The new patch family receives its own singleton anchor-compatibility class, while byte- and surface-unchanged base-family classes retain their IDs. A surface-equivalent candidate added inside the same patch family may retain its class; a surface-changing patch replacement creates a new patch VariantFamily and singleton class but replaces only the old patch class within the revision partition. Deleting the patch removes only that class, so base-family pins remain compatible while affected patch-authored pins become `needsReview`. The workflow cannot group a separately aligned Asset, reuse an interaction proxy as color geometry, or commit a mask without its patch.

Three non-collinear point pairs are the mathematical minimum for correspondence fitting; production UI SHOULD accept 4–8 pairs and report residuals. PCA and ICP are later assistants only because symmetry, missing GS regions and floaters can produce plausible but wrong alignment.

## 10. Large GS and iOS lifecycle

The resource state machine is:

```text
unloaded -> queued -> streaming -> decoding -> resident
                    -> failed
resident -> evicted
context loss: GPU residency invalid -> progressive restore from current view
```

Requirements:

- no full raw GS or full package `ArrayBuffer` on a product path;
- stream, decode and upload with backpressure and bounded chunks;
- separate budgets for encoded staging, CPU decode, CPU resident, GPU resident and render targets;
- aggregate LOD budget across all visible GS assets;
- selection by viewport, frustum and projected contribution;
- explicit cancellation, retry, quota and context-loss behavior;
- progressive first preview before full-detail residency;
- raw large-GS LOD conversion and proxy generation on desktop/local tooling, not iOS;
- sniff PLY structure and attributes; an ordinary point-cloud PLY cannot be assumed to be GS by extension.

The renderer bakeoff starts with provisional iOS settings of 0.5–1M drawn splats, 2–4M resident splats, DPR 1–1.5 and MSAA off. These are test inputs, not guarantees. The winning implementation MAY use a renderer-native paged derivative, but its generation cost, size, offline behavior and provenance are part of the decision.

Under pressure the ResourceManager evicts decoded CPU/GPU residency for invisible resources, lowers draw/resident budget, lowers render scale, disables experimental targets, then requests a supported mode fallback. Runtime eviction never deletes persistent CAS bytes; persistent reachability and collection are governed only by the storage specification.

## 11. Renderer bakeoff

Spark/Three and PlayCanvas receive the same source fixtures, camera paths and hard requirements. Both MUST be tested for:

- offline/no-CDN use;
- small, medium and large GS plus multiple assets;
- Mesh, GS, Compare and opaque/mask/dither Integrated;
- patch/exclusion groups and intersecting geometry;
- closed translucent aircraft diagnostics;
- direct and proxy picking;
- first preview, p50/p95 frame time and resource budgets;
- cancellation, 20 load/unload cycles, context loss and background restore;
- dependency size, license, security audit and migration effort.

Engine-specific optimized derivatives are allowed only if both their preprocessing and runtime costs are recorded. If both candidates pass comparably, choose the lower migration and maintenance cost. If neither passes a hard requirement, stop at the ADR reconsideration gate rather than combining two failing backends.

Useful current candidate evidence:

- Spark documents stream input, direct WASM ray-splat picking and paged LOD; it also warns that synchronous picking over millions of splats can be noticeable: <https://sparkjs.dev/docs/splat-mesh/>.
- Spark recommends prebuilt paged RAD data for fast streaming and publishes platform-specific LOD defaults that remain inputs to our own device test: <https://sparkjs.dev/docs/lod-getting-started/>.

## 12. Acceptance contracts

### Domain and resolver

- `RND-DOM-01`: property tests round-trip Representation/Asset/Project points and normals within declared tolerance.
- `RND-DOM-02`: non-finite translation/scale, non-normalizable quaternion, non-positive user or import scale, shear and unsupported non-uniform normalization are rejected.
- `RND-DOM-03`: new revision plus alignment activates through one binding pointer; prior immutable canonical payloads and digests remain unchanged.
- `RND-DOM-04`: concurrent active bindings create a resolvable conflict, never a silent authoritative scene in any mode; candidate previews are labelled read-only.
- `RND-DOM-05`: surface-compatible derivative addition retains anchors; incompatible or unknown replacement derives `needsReview`.
- `RND-DOM-06`: material overrides survive nonvisual derivative and candidate LOD/preview switching through complete family slot maps and never cross a new family through a display-name guess.
- `RND-DOM-07`: SceneDocument is deterministic and contains no forbidden backend/storage types.
- `RND-DOM-08`: role matrices for all four modes match this specification; proxies never reach color/depth/screenshot. Reusing one VariantFamily across assets, roles, content kinds or inconsistent semantic targets is rejected, while a raw reflected source and correctly baked identity display candidate remain one selectable family. Mesh/GS/point/patch families remain independently selectable in Compare/Integrated.
- `RND-DOM-09`: patch and exclusion activate atomically.
- `RND-DOM-10`: a fixture with two GS families proves that proxy and exclusion records affect only their explicitly targeted family.
- `RND-DOM-11`: ProjectFrame wire validation and camera/view/migration golden vectors agree for meters, custom scale and unknown legacy units.
- `RND-DOM-12`: candidate switching preserves an override through an equal layout; accepting a complete explicit `MaterialCompatibilityMap` rewrites the target to the destination in the replacement transaction, while partial/ambiguous maps become review items and RenderPlan never follows an old or transitive target.
- `RND-DOM-13`: review/clean round-trip preserves anchor compatibility when `authoredAssetRevisionId` is absent or non-resolving and never adds the omitted revision to blob reachability.
- `RND-DOM-14`: a material map resolves only direct-parent and destination revision catalogs; a source family absent from the new revision still maps correctly, while wrong-revision endpoints are rejected.
- `RND-DOM-15`: concurrent `mask + cutoff` and `opaque` edits retain whole-compositing candidates and cannot materialize a hybrid policy.
- `RND-DOM-16`: v1 caption tags migrate to tag and membership entities, round-trip through packages/CSV, and merge independent membership changes.
- `RND-DOM-17`: set switching applies one default view without recursion; ordering is deterministic, a deleted/missing default leaves camera unchanged with a diagnosis, and the last/default set cannot be deleted.
- `RND-DOM-18`: parent delete versus concurrent child add produces an orphan review item in both merge orders; explicit reassign/tombstone and restore paths preserve all candidates and required media.
- `RND-DOM-19`: an unresolved migrated asset has no binding or `BlobRef`, preserves captions under one deterministic missing-source compatibility class and retains any valid imported `pendingAssetToProject`. It becomes ready only after verified content and one atomic status replacement; absent an explicit override, the new binding uses the pending placement exactly. None of the new content-derived classes reuses the missing-source ID, so preserved captions become `needsReview` until explicitly resolved while their ProjectFrame placement remains stable.
- `RND-DOM-20`: missing/cross-asset `derivedFrom`, duplicate/unsorted edges, self-reference and two-/three-node cycles are rejected before SceneDocument; a valid depth-32 DAG resolves and a depth-33 graph is rejected.
- `RND-DOM-21`: one source blob containing mesh and ordinary points resolves as two Representation records with distinct roles/families and one shared BlobRef/frame transform; Mesh mode draws both contributions once and material targets never cross families implicitly.
- `RND-DOM-22`: syntactically valid fixtures with a ready Asset pointing to a foreign binding/revision, cross-asset binding/revision parents, reused AssetFrame/compatibility IDs across assets, one shared RepresentationFrame with unequal transforms, a nonidentity AssetFrame alias, an AssetAnchor naming another asset's frame/revision, or a ProjectAnchor/SavedView naming a foreign project frame are rejected before SceneDocument in every mode; no foreign closure is rendered or activated.
- `RND-DOM-23`: flat, multi-primitive and two-node-instanced point fixtures select the nearest visible ordinary point in the active mode's Mesh source and persist the exact optional `(nodeIndex, primitiveIndex, pointIndex)` occurrence. They tolerate a missing normal and never expose a flattened draw/LOD index or mislabel the hit as mesh/GS/proxy evidence. Symmetric radius candidates with complete locators use them; without them they use canonical-position ordering, and equal-position/different-normal candidates collapse to one anchor with source/normal omitted.
- `RND-DOM-24`: every resolving hit source passes the closed owner/method/content/role/surface matrix. Cross-asset source, foreign authored revision, mesh-to-proxy, point-to-triangle, splat-to-point and proxy-to-nonproxy fixtures are rejected before persistence. Two-node indexed/reflected mesh and paged/reordered splat fixtures retain source occurrence semantics across both backends; a backend that cannot recover them omits complete weak source provenance while the canonical anchor remains valid.
- `RND-DOM-25`: each FormatProfile ID has exactly one specification digest; unknown/mismatched pairs and extension/MIME fallback are Unsupported. A decoder/library upgrade either reproduces the same inspection/goldens or creates a new profile and immutable revision.
- `RND-DOM-26`: default-scene selection, matrix/TRS validation, node-over-mesh morph precedence, skin/inverse-bind evaluation and no-clip static pose produce identical transforms, bounds and picks; ambiguous or unsupported pose input is rejected or uses an explicit `staticPoseBake` that never absorbs `assetToProject`.
- `RND-DOM-27`: family bounds come from one verified authoritative contribution, remain byte-identical across candidates, and derived decoded bounds are subsets. SceneResolver derives the same family/asset/project union with source blobs present or absent, including rotated/reflected eight-corner AABB goldens, and never persists a duplicate asset bound.
- `RND-DOM-28`: property/golden tests transform GS means, anisotropic covariance and nonzero-degree view-dependent bases through translation, rotation, positive scale and reflection and reproduce the profile's DC/color-space/bias/activation/clamp; mean-only, reflection-blind or alternate-color output is rejected.
- `RND-DOM-29`: the exact three-entry point-profile registry has one distinct ID/digest for binary, dither and smooth with binary as default; all three share the ratified numeric/disc rules and differ only in edge policy. Each profile plus finite intent and ViewportSnapshot deterministically produces one constant-CSS effective disc across DPR/render scale; the value is absent from SavedView/project bytes, invalid/non-finite input follows the diagnosed default path rather than a backend clamp, and fractional/dither edge coverage promotes the contribution class exactly as specified.
- `RND-DOM-30`: source opaque/mask/blend, opacity, hard/soft chroma, every requested coverage and surface/transmission optics resolve through the closed matrix and final alpha convention. Mask+transmission remains representable, surface-to-transmission invention and opaque-with-alpha/chroma are invalid, material-less visual primitives receive the synthetic slot, catalogs are sorted one-to-one tables, candidates differing only in source semantics cannot share a family, and duplicate semantic override keys apply neither record until resolved.
- `RND-DOM-31`: ungrouped, cross-asset, missing-patch, outside-revision, nonidentity/non-AssetFrame mask and wrong-role relationship-field exclusions fail closed. A valid same-asset patch/exclusion group enables atomically, its hard AssetFrame predicates union in every order, and raw/paged/preview GS candidates exclude identical means and color/depth/ID/direct/proxy picks. GS mode remains unexcluded; source-index, page-index, soft or partially applied masks are Unsupported.
- `RND-DOM-32`: an ordinary gizmo move preserves a still-active class without another prompt. A C1 anchor that becomes `needsReview` under active revision C2 can be corrected only against one explicit active family; the atomic replacement binds to C2 and that family's unique current class, becomes source-less/confidence-less/normal-less `manual`, never retains stale mesh/point/GS/proxy evidence, and round-trips through collaboration/review/clean with the same visible ordinary pin UI. Coordinate-only, missing/ambiguous class and active-binding conflict fixtures refuse to clear review.
- `RND-DOM-33`: a differently oriented/scaled external repair mesh is aligned into an existing AssetFrame, preserves its source bytes, commits its frozen `representationToAsset` plus optional identity-AssetFrame hard mask in one new revision/binding, copies prior `assetToProject`, and leaves no active half-group under cancellation or injected failure. Adding a patch preserves every unchanged base compatibility class and creates one singleton patch class; a surface-equivalent derivative preserves its family/class, while surface-changing replacement creates a new patch family/class and removal reviews only affected patch-authored pins. Class overlap, duplicate ownership and changed-family ID reuse fail closed.
- `RND-DOM-34`: every active revision's sorted compatibility classes form an exact partition of its pickable visual families; empty/duplicate/outside-revision targets, proxy/exclusion ownership, cross-asset IDs, same-ID/different-target reuse and source/proxy-to-class mismatches are invalid. An absent historical anchor class is valid `needsReview`, never corrupted data or an invitation to choose a nearby class.

### Backend and browser

- `RND-BE-01`: multiple assets produce correct union bounds, fit, camera and caption projection.
- `RND-BE-02`: golden images cover Mesh, GS, Compare and supported Integrated material classes.
- `RND-BE-03`: supported Integrated classes meet G0 image-difference masks/tolerances and product-owner visual acceptance for z-fighting, halo, duplicate surface and exclusion holes; a warning cannot convert a supported-class failure into a pass.
- `RND-BE-04`: the translucent aircraft shows the correct support warning and every promised fallback.
- `RND-BE-05`: mesh, ordinary-point, direct-GS and proxy picks are normalized to AssetFrame. Point-only and mixed fixtures pick the nearest accepted visible ordinary point with a missing-normal path; proxy hits remain approximate and never enter measurement.
- `RND-BE-06`: cancellation, decode error, quota error and obsolete generation leave no attached partial resource.
- `RND-BE-07`: backend resource ledgers return to zero live handles after unload, and repeated load/unload meets the numeric heap/resource plateau slope and tolerance fixed in G0; context restore is progressive.
- `RND-BE-08`: physical iOS completes the G1 fixed-camera and background/restore run without reload or context loss.
- `RND-BE-09`: swapping a mock second backend changes no persistent bytes.
- `RND-BE-10`: false MIME/extension, HTML/SVG polyglots, external-model URI probes, malformed media and pixel/decode-bomb fixtures never execute active content, issue a network request or leave a partial resource; allowed media obey decode budgets and every object URL/decoder handle is released.
- `RND-BE-11`: both backend candidates reproduce the same ratified static pose, logical bounds, camera fit, render and pick, or return the same explicit Unsupported diagnosis.
- `RND-BE-12`: anisotropic GS with degree-greater-than-zero view dependence and reflection matches accepted image/bounds/pick goldens in both backends.
- `RND-BE-13`: at all G0 fractional DPR/render-scale cases, both backends derive identical integer targets, top-left sample/pointer mapping, dither coordinates and ordinary-point color/depth/ID disc coverage. Smooth pick threshold, fragment result and the separate 6-CSS-pixel fallback agree without a hidden native size clamp.
- `RND-BE-14`: source/material override matrix produces the same effective class, supported/redirected label and accepted image in both backends; profile summary/decode disagreement is a decode error rather than a backend reclassification.
