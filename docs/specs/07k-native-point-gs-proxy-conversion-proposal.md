# Native Point / GS / Proxy → ProjectScene

> **PROPOSED — 2026-10-28. NOT APPROVED OR IMPLEMENTED.**
> This is the concrete additive decision for [07](07-project-scene-migration.md)
> and [05 §9](05-project-scene-team-workflow.md#9-migration). Companion JSON is
> proposed specification data only; no profile registration or product change.

## 1. Grouped decision and user outcome

既存の「ファイルを開く → 新しいプロジェクトに変換」を使い、Nativeの点群・GSと
位置指定用の面を、記録・シーン・画像・視点と一緒に引き継ぐ。形式や単位を選ぶ
画面は増やさない。次の規則を一括で承認する案とする。

- 単位が不明な点群は不明のまま、元の座標・倍率・反転を保持する。専用の点群と
  Proxyのprofileを追加し、既存profileの意味を変えない。
- GSは原本・全係数を保持して新形式の完全検査を行う。保存済み視点とピンは保持
  するが、自動で全体を収める範囲と描画結果の同一性は保証しない。
- Proxyと元GSの対応を保持する。Proxyは表示せず、位置指定だけに使う。
  新規の位置指定は新形式で既定の両面選択とする。保存済みピンは再選択しない。
- 新しい変換recipeとID規則を追加する。既存recipe1〜6・ファイル・中断処理は
  記録済みの規則で継続する。
- PC候補画面では今回のNative変換に限り元ZIP最大512MiBとし、全体展開を避ける。
  GS最大50万点、原本と公開本体の別々の容量管理、既存の検証・復旧境界を守る。

This is one connected workflow: open/inspect/confirm → converted editing and
Point/GS/Proxy placement → Workspace/Contribution/backup/Review/clean copy →
two-way current-format exchange → restore and cold resume. It adds no dependency,
calibration wizard, continuing old-format update bridge, new wire/map version,
renderer adoption, ordinary PWA activation, device guarantee or release authority.
The existing Desktop candidate remains the entry boundary of [01e](01e-desktop-large-gs-workflow.md).

## 2. Closed input and unchanged restrictions

Use the existing strict `lociview-native-portable-backup` v1/v2 reader, namespace,
manifest/snapshot, STORE-only compression, local/central entry overlap, duplicate,
CRC, SHA and length checks. Native exchange/collaborationBaseline remains outside
this converter. Inspect every retained body/representation/revision/appearance,
including hidden, noncurrent and unplaced resources, before publishing ready.

| Retained Native content | Recipe-7 admission |
|---|---|
| Point primary | Existing Native XYZ/RGB ASCII PLY facts and bytes must pass the unchanged 01a encoding, Float32/color and work guards; the new Point profile below preserves unknown units and canonical representationToAsset |
| GS primary | Existing Native SH2/SH3 binary little-endian Float32 PLY; pass the complete current 01c SH0–4 inspector, including finite payload, quaternion/covariance, transformed support/bounds and source work limits. Native header/length admission alone is insufficient |
| Proxy | Static GLB, role interactionProxy, purposes interaction; own mapped family distinct from its exact same-Asset GS family, derivedFrom exactly that GS Representation, valid proxyForGsVariantFamilyId, canonical representationToAsset. PNG/JPEG union below; no other Native Mesh format |
| Mesh primary | Existing admitted static GLB/PNG/JPEG subset with identity representationToAsset; use the existing occurrence profiles/witness even when no appearance adjustment exists |
| Mesh appearance | Retain 07a/07d/07e addressed-source semantics, one-to-one pinned-loader occurrence proof, opacity exactly1 and chroma disabled. No appearance row may target Point/GS/Proxy. Unsupported retained appearances reject the entire input |
| Media, Captions, Scenes, views | Existing Native conversion mappings and admitted PNG/JPEG/WebP/GIF profiles; preserve duplicate identities, array ordering, absent pinScale, manual/unplaced ownership, camera values and explicit defaults |

Permit multiple independent Assets of these kinds and their DisplaySets. Each
retained revision/Scene selection must be representable under the existing target
closure: one visual primary per Asset, at most one Proxy when that primary is GS.
Do not split a same-Asset multimodal source into different Assets, pick a preferred
primary, discard a dormant revision or guess equivalence to make it pass. Source
aliases/classes/frames must satisfy existing target graph and compatibility checks.
Looser Native numeric tolerance never authorizes normalization to target tolerance.
Unsupported bytes, ambiguous relationships, missing content or exceeded budgets
refuse the whole conversion with a contextual explanation; preserve the original.
This does not claim coverage of every schema-valid Native snapshot.

## 3. Exact additive profiles, frames and picking

These companions are UTF-8 without BOM, LF, one final LF. Their full-file SHA-256
is the proposed `specificationSha256`; they are not runtime registrations.

| Profile | Exact companion | SHA-256 |
|---|---|---|
| development-native-point-ply-rgb-1 | [Point](profiles/native-point-ply-rgb-1.profile.json),2764 bytes | 8fa283ea34207e0604f66204d3d6f7f8275071a99fb79bc940e23aa0905a0994 |
| development-native-proxy-glb-1 | [Proxy](profiles/native-proxy-glb-1.profile.json),2586 bytes | af2e98b3627cbfbcb09f25f6d76233edbaf78b375769e8d79c2be651f6f45edd |

All six 01a source/presentation companions and the 01c source/display companions
retain their exact bytes/digests. New Point inherits only the 01a encoding/material
contract, replacing its metre/identity claim with preservation of the source
RepresentationFrame, canonical transform and exact ProjectFrame.unit object
(`{kind:'unknown'}` or `{kind:'meters',metersPerProjectUnit:1}`). No guessed
physical scale or re-centering. The target's existing strict
positive Sim3 plus reflection none/x admission applies without normalization.

Apply the companion's explicit binary64 matrix/dot/translation order to the
post-Float32 Point positions; require finite output and canonical positive zero.
Point logicalBoundsAsset is the exact AABB of these transformed positions. New
pointSample anchors use the same function and retain original pointIndex/duplicates.
Retain raw positions/bounds separately for decoded-source verification. AssetBinding
is applied once later, never folded into these Asset-frame facts. Existing Native
manual Caption coordinates already name their authoritative Asset/Project frame;
never transform them again or invent point-index provenance.

GS keeps the existing 01c source profile and transformed four-sigma support/bounds
math, including its XYZW-to-WXYZ API ordering. Reinspect payload rather than trust
Native's header facts. No SH truncation, payload conversion or pixel-equality
promise. Saved camera tuples remain unchanged; the different support envelope and
existing target renderer can change automatic fitting/appearance.

Proxy's one union profile chooses the unchanged PNG GLB inspector if no embedded
JPEG exists, otherwise the unchanged JPEG GLB inspector. Neither older profile is
relabeled. Keep raw GLB bounds including authored node poses for the pinned-loader
decode proof. Compute Asset bounds separately from all eight raw-AABB corners,
using the same checked transform. Wrap the decoded root in a separate transform
Group; never overwrite authored root/node transforms. Exclude Proxy from visible
color/depth and fitting; retain the existing target DoubleSide picking policy,
which differs from Native's FrontSide. Existing pins never undergo raycasting.

Conversion emits Proxy derivedFrom exactly `[mappedGsRepresentationId]` and maps
its own variantFamilyId and proxyForGsVariantFamilyId separately. Saved records
permit derivedFrom `[]` or exactly one GS Representation ID in that same-Asset
GS family. Existing history-free Review wire omits the field; its saved edit-copy
explicitly carries `[]` under [06](06-project-package-wire.md). Empty arrays require
no private ancestry proof and make no Native provenance claim. Continuing history
and clean reconstruction retain/remap nonempty arrays they carry.
The exact public GS/Proxy family relationship still
survives Review. Do not change Review's wire or infer an edge from similar names.

## 4. Recipe, identity and private conversion evidence

Immutable name: `native-project-scene-recipe-7`. Select it internally when the
Native source contains any Point/GS/Proxy; pure-GLB inputs retain their existing
recipe1–6 selection. Existing receipts/jobs always use their captured recipe.

Use all closed source keys/output prefixes in [07 §5.3](07-project-scene-migration.md#53-concrete-first-native-companion--po-approved-2026-09-21).
Only the recipe domain changes. Recipe7 Mesh-primary catalogs always use 07a's
`slot` key `['material-occurrence', nativeRepId, nodeIndex, primitiveIndex]`;
Point uses `['material-slot', nativeRepId, 'representationMaterial', 0]`;
Proxy uses the base `gltfMaterial/materialIndex` or implicit material-slot key.
Retain 07a's closed Scene/appearance keys and occurrence witness for Mesh only.
No additional record kind or source-key fallback is permitted.

Exact ID preimage (UTF-8, no BOM or final LF; `\n` below is one LF):

```text
"lociview:native-project-scene-recipe-7:id:jcs-v1\n"
+ JSON.stringify([conversionId, sourceZipSha256, outputPrefix, sourceKey])
```

Allocate fresh lowercase32-hex conversionId and initialization identity only once,
after explicit conversion confirmation; projectId is `prj_` plus conversionId.
sourceZipSha256 hashes the complete unchanged selected ZIP. Use the first32
lowercase hex characters of full SHA-256 after prefix/underscore. Retain full
digest and exact preimage; unequal preimages/full hashes sharing a short ID, or
unequal preimages sharing a full hash, stop the entire conversion. Sort the closed
mapping by output ID. Never salt, merge, infer identity or allocate again on retry.

The [exact goldens](profiles/native-spatial-conversion-7.goldens.json),6844 bytes,
SHA-256 `077f16922fcd7dac503ebdc42c0497882a3618cc55e4f22a2f899c53747397ac`,
contain full Unicode/ASCII preimages, UTF-8 lengths, full hashes and IDs, plus
nonidentity/reflection Point/Proxy arithmetic. Their synthetic ZIP digest is an
identity vector, not a distributed source ZIP or executed decoder/browser evidence.

Preserve all payload bytes/digests/lengths. After content inspection, Point/GS
target blob metadata uses `application/ply`, retaining the source's
`application/octet-stream` in private evidence/original. Do not alter stored bytes.
Revision provenance is origin import with sorted distinct original input digests;
include sourceMediaType only when all its source representations have one exact
common original MIME, otherwise leave this optional field absent. Preserve the
exact per-representation MIME in the private witness, never guess from extension.

Extend the existing private receipt with closed recipe7 source/target profile,
MIME, frame/transform, facts/bounds and Proxy/GS correspondence witnesses. Retain
the exact initial source and existing mapping/material proof; hash/validate them
on resume, not a regenerated approximation. Reports account for retained/unsupported
resources and fitting/picking differences. Original ZIP/raw documents/private
witnesses never enter Workspace, Contribution, backup, Review or clean outputs.
Ordinary public facts are rederived from admitted bytes without requiring a
recipient to possess the private conversion receipt.

## 5. Desktop Native capacity and bounded original handling

This expressly changes only 01e §3's legacy-conversion64MiB rule for recipe7 on the
approved Desktop candidate. Other routes, old recipes and non-GS body/work guards
keep their limits. The proposed candidate limits are admission ceilings, not
RAM, latency or reliable-storage guarantees:

| Budget | Recipe7 Desktop |
|---|---|
| Original unchanged Native ZIP | ≤512MiB (536870912 bytes), separate from public-body total |
| Distinct known public body bytes | ≤512MiB by SHA-256 identity; preserve distinct logical resources even when bytes coincide |
| GS per source | ≤500000 rows and ≤44500000 scalar work; current actual SH2/3 strides/payload inspection |
| Concurrent GS resident rendering | Existing shared500000 rows /44500000 scalars, not a per-model multiplier |
| Each non-GS body | Current64MiB plus existing Point/GLB/image work/pixel limits |
| ZIP metadata/entry/namespace/work and local storage | Existing Native strict limits and WorkspaceLocal quota/2GiB guards; no increase |

Introduce a read-only adapter over an immutable captured Blob: bounded metadata
and restartable per-entry sources, not a whole ZIP arrayBuffer or all-body map.
Reuse strict STORE entry streaming/CRC inspection. Physical body reads/pulls and
emitted body chunks are at most64KiB; do not allocate a64MiB entry then rechunk.
Existing bounded metadata may use its separate ≤16MiB control budget. Account for
all ZIP/header/central/source inspection work and short-read/overlap guards.
Hash original ZIP incrementally. Inspect bodies serially with downstream
backpressure, retaining only bounded facts/witnesses; release GLB/Point/image
arrays/decoded resources before the next body. GS stays file-backed throughout.
Cancel closes active readers/resources and publishes no ready Project.
These64KiB producer conditions apply to the new Native archive/original hash-copy
and GS source adapters. Generic existing CAS verification retains its separately
bounded ≤16MiB native stream chunks within the accepted I/O envelope; this is no
claim that all storage I/O uses64KiB. Implementation must measure both boundaries.

Preview performs no durable writes or ID allocation. Close ZIP handles while the
user decides, retaining the immutable selected Blob and bounded inspected facts.
On confirmation reopen it, validate retained facts and stream the original and
public bodies through existing I/O. No validation evidence may outlive its
accepted lifetime; do not skip fresh readback, source or publication fences.

Store the original as a **private OriginBlobStore blob**, mediaType application/zip,
using the existing fresh-object write → incremental hash/length → full readback →
write-once CAS receipt. Its reference belongs only to the local conversion receipt,
not ProjectMetadataSource/public inventories. This receipt is a private retention
root for any future GC; no GC or separate temporary-ZIP transaction framework is
added. Original plus public bodies can require about1GiB before output/job overhead;
quota failure retains evidence and never marks conversion ready.

### Recovery and acknowledgement boundary

Persist the fixed conversion/project identity, original digest/length/reference,
mapping and exact initial source through the existing private conversion controls.
All public bodies and original must be verified before the existing durable
Session initialize journal start. That start is the Project-level original
acknowledgement boundary; add no new completion marker.
Determine it from the validated durable TransactionJournal staging control,
not `session.read().state === 'pending'`, which also admits in-memory pending work
before a disk start exists.

- Before start: verified-present original CAS must pass full verification before
  use. Unverified CAS is unpublished staging; retry from the same captured Blob or
  an explicitly reselected file with exactly matching SHA/length. Reuse fixed
  identities, source, recipe and mapping. Never replace a different source.
- After start: the original CAS reference must verify fully. Unverified, missing
  or suspect content stops; never recreate an acknowledged original automatically.
- CAS missing/suspect always stops, including before start. Public bodies already
  acknowledged by initialization retain their existing fail-closed rules.
- Existing corrupt/torn control receipt is a repair state, not permission to
  overwrite it. Normal interruption with intact controls can resume at source
  write/readback, CAS-publication-before-start and initialization. This is not a
  claim of automatic recovery after arbitrary deletion/corruption.
- Completed retry reopens that fixed Project without resetting later user edits.
  Old recipe source.zip controls/recovery remain untouched and readable.

## 6. Ports and implementation boundaries after approval

One writer implements this connected unit; independent reviewers remain read-only.
Use current services, not a parallel importer or storage framework.

- Native archive adapter: `nativeGs/portablePackage` strict entry machinery,
  schema/PLY facts, bounded ZIP I/O and file-backed Blob sources. It returns typed
  read-only metadata/restartable bodies; imports no UI or ProjectScene Session.
- `projectFiles` owns recipe7 inspection/mapping/private receipts and calls
  OriginBlobStore plus MetadataProjectSession initialization. It does not write
  directly from the UI or alter Native/v1 project authorities.
- Domain profile declaration and point capability allowlists admit only the exact
  two approved tuples. Shared checked Asset-frame bounds/point transform helpers
  serve conversion, content validation/cache facts and picking. Raw GLB inspection
  facts stay raw; new Proxy rendering uses a transform Group.
- Product composition passes typed conversion display models and existing Session
  commands to the current file-open/preview UI. No ZIP/CAS implementation object
  becomes UI command authority. Existing local loading/status/retry is reused.
- Update exact import allowlists and run sceneCore boundary tests early. No
  viewer→storage/package or core/platform/viewer→UI dependency is introduced.

## 7. Acceptance and next implementation unit

Approval covers the complete workflow and routine fixes/tests below, not renewed
approval at each helper. Runtime evidence is still required before completion.

1. Exact profile/golden digests and full ID preimages, collision rejection,
   immutable old recipe1–6/profile bytes and cold receipt semantics.
2. Point unknown/metres, nonidentity/reflection, exact transformed bounds and new
   point-index anchors; saved manual positions remain unchanged. Duplicate rows,
   logical resources and owners never collapse.
3. GS complete payload/facts comparison, covariance/support and every original
   coefficient/hash; Proxy exact derivation/families, own transform plus authored
   GLB node pose, hidden rendering, front/back new picks and saved-pin preservation.
4. Mixed independent Mesh/Point/GS Assets, retained revisions/classes, multiple
   Scenes/default views, visibility, manual/unplaced Captions, pinScale, duplicate
   media and supported appearance/image combinations; whole-input negative cases.
5. Editing and all five file purposes, two independent browser environments with
   return/merge/local-edit retention, Review→independent edit-copy, clean mapping,
   restore and cold resume; no original/private evidence in any public output.
6. Intact-control interruption before/after original CAS publication/start,
   exact source reselect, fixed destination, completed retry preserves later edits;
   acknowledged missing/suspect/torn evidence refuses without auto-repair.
7. An actual Native ZIP above64MiB within existing500k budgets through browser
   conversion/save/restore/cold resume. Instrument original/GS whole-read refusal,
   upstream64KiB body reads/backpressure/serial ownership and cancellation. Preserve
   failed timing evidence; do not claim an overall RAM/latency guarantee from I/O
   chunk size or synthetic counters. Do not repeat the unrelated500k Review case
   merely to raise test counts; its existing failure stays open in todo.
8. Focused service/fault checks during implementation, then required final serial
   typecheck, complete Vitest, normal/harness/validation/Desktop builds; base-path
   build if entry/PWA path is touched. Independent final diff review and actual
   dedicated Chromium evidence for the Desktop candidate. iOS/offline/adoption
   remain unverified unless executed in their own accepted environments.

[Current task](../../tasks/todo.md) records review/check evidence and the PO decision.
After approval, implement this workflow end to end before reporting a grouped
checkpoint and the next missing feature. Keep unresolved unsupported Native
formats/materials and general device/release gates visible in the inventory.
