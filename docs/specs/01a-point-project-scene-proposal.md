# 01a: Ordinary-point files in the ProjectScene workflow

> Status: **PO APPROVED 2026-10-27 / IMPLEMENTED IN BOUNDED VALIDATION (BINARY) / NOT ADOPTED**
> Prepared and approved: 2026-10-27. Implements the already planned M02/M12 workflow; does not
> replace the accepted gates. Executed source/render/file/cold scope is recorded in
> [current work](../../tasks/todo.md); other point formats/classes and ordinary-entry/device adoption remain open.

## 1. 利用者の結果と今回の判断

点群PLYを開く／追加する → 点の大きさを調整する → 見えている点に記録を置く →
本文・画像を編集する → 保存・受け渡し → 復元・再開までを、新しい検証画面へ接続する。
性能調査より、計画済み機能を一体で使える状態にすることを優先する。

今回まとめて判断するのは、まだ確定していない次の仕様だけである。

- XYZとRGBを持つASCII PLYを最初の点群入力とし、原本を保持する。
- 点は円形、既定3 CSS px、調整範囲1〜20 CSS px。表示サイズは一時設定で保存視点へ混ぜない。
- 最初は輪郭の内外を明確に分ける表示を使う。直接見えている面／点を先に判定し、
  点の近くを選ぶ補助範囲は6 CSS pxとする。単純な「近い点優先」にはしない。
- 法線を持たないRGB点は照明で色を変えず表示する。これはこの新しい点群形式に限る
  source-materialのunlit例外で、既存Meshや既存Native profileを変えない。
- 点を直接選んだ未調整の記録にはpoint-cloudの由来を残す。位置を手で調整した後は
  manualとして確定し、直接選んだ点と手動位置を混同しない。

承認はこの仕様・関連する正確なprofile bytesに基づく実装を許可するものであり、
通常入口の切替、実機受入れ、GS対応、公開・リリースを許可するものではない。

## 2. Authority and exact immutable companions

[01 §§4.2,5,8](01-domain-rendering.md) fixes source semantics, point presentation,
fragment priority and anchoring. [03 later-point acceptance](03-gates-and-delivery.md)
requires profile/diameter/pick evidence. This proposal fills their deliberately
unratified values; PO approved these exact companions and the narrow point-source amendments on2026-10-27. Other existing rules/gates remain active.

Each linked JSON file is normative UTF-8, LF, no BOM, with one final LF. Its
specificationSha256 is SHA-256 of those exact bytes; a file contains no own digest.
The three presentation profiles differ only in ID/edgeCoverage. Binary is the
registry default. Their immutable three-entry ID/digest/value snapshot is a
semantic input, separate from backend capability; registering an entry does not
enable that rendering class.

| ID | Exact companion | SHA-256 |
|---|---|---|
| `lociview-point-binary-1` | [`point-binary-1.profile.json`](profiles/point-binary-1.profile.json) | `c9e6893a6a57e315db9d9caef62eba143d227521a254364d7fd8010f5cec65d6` |
| `lociview-point-dither-1` | [`point-dither-1.profile.json`](profiles/point-dither-1.profile.json) | `38ffdbb6dbe4386da3600f48e0af8bcad2e23c2b61ca87a0cfd5b697ee57aed9` |
| `lociview-point-smooth-1` | [`point-smooth-1.profile.json`](profiles/point-smooth-1.profile.json) | `8c67bb7ea009926a09244ef154af005b243b14322a6a9d93079fd966b668cad7` |
| `development-validation-point-ply-rgb-1` | [`point-ply-rgb-1.profile.json`](profiles/point-ply-rgb-1.profile.json) | `c93909de6da2c44558d960c2620f967f8cd702b6171ae7df9e86df789ba35dd5` |

The source and presentation companions bind separate normative vector manifests:
[source facts](profiles/point-ply-rgb-1.goldens.json) and
[presentation/pick scalars](profiles/point-presentation-1.goldens.json).
Their exact digests are inside the respective profiles, avoiding self-hash cycles.
These repository-owned synthetic vectors are reviewable normative inputs, not
executed browser/image/device proof or distributable public app samples.

After approval these bytes/IDs are immutable. A semantic change needs a new
profile ID/digest and normal compatibility review, never an in-place correction.
Future fractional geometric anti-aliasing would require new presentation profiles;
version1 deliberately uses a hard disc with g=1 at/inside radius and g=0 outside.

## 3. Exact source admission and facts

The complete source profile is the linked development-validation-point-ply-rgb-1.
It defines ASCII1.0, exactly one positive vertex count, ordered float XYZ/uchar
RGB, bounded64KiB ASCII header/1024-byte payload rows, LF/CRLF and optional final
newline, all payload rows, no faces/normals/alpha/GS properties/other elements.
Comments/obj_info are inert ASCII; URLs never resolve. End-header recognition is
line-anchored. Reject unknown/malformed/budget-exhausted content before attaching.
Filename/MIME/loader success never substitutes for this inspection.

Point count is at most the existing maxItems and6N at most maxValues; original
bytes remain within maxFileBytes. Enforce declared bounds before allocations.
Coordinates are parsed as finite Numbers, rounded to Float32, checked finite again
and negative-zero normalized. In particular1e39 is rejected even though it is a
finite JS Number. Compute exact component-wise AABB from that normalized array.
Preserve original XYZ as a right-handed Y-up AssetFrame, identity representation
transform and1source unit=1Asset metre. Do not infer file units or recenter/rotate;
normal model placement remains an explicit user command.

RGB/255 is sRGB input, converted by01's transfer function and rounded to Float32.
Alpha is1; white constant base factor retains the source vertex colors. Produce
no normals. Source geometry has point-centre support; CSS glyph extent is transient
presentation, not a second persisted world-space bound.

The source creates pointCloud/pointPrimary/source+display with one family and one
synthetic representationMaterial(slotIndex0) catalog slot. Its source semantics
are opaque/surface/**unlit**/front. **Approval adds a narrow exception to01 §4.2's
no-authored-lighting synthetic-slot lit default for this exact RGB-only profile.**
No other source profile gains that exception. Initial point material controls stay
unavailable where their renderer cannot implement the exact intent; do not fake
support by discarding an override or converting it into a Mesh material.

Original row ordinal is pointIndex, nodeIndex0/primitiveIndex0; identical points
remain separate occurrences. No sort, merge, LOD or decimation. Source loader
output must match the profile's count, Float32 positions/colors, no source triangles,
bounds/catalog and original order. Decoder mismatch fails rather than rewriting
metadata. Native's inspector/loader may be reused only where they conform; the new
line framing and post-Float32 check do not change old Native input semantics.

Facts use existing verified representation/family-envelope/material/surface-range
structures: staticPose=true, pointSample count=N, exact source payload digest and
source envelope authority. Fresh Asset/Frame/Revision/Representation/Family/Layout/
Slot/Binding/Compatibility IDs reuse the existing allocation and immutable-digest
rules. No schema, package version or conversion ID/preimage is added.

## 4. Presentation, depth and selection

Diameter is per-viewport local/session state, starting at3, finite values clamped
to1..20. Nonfinite requests use diagnosed default3. It is not written into SavedView,
Project metadata, an exchange file or a global setting. No distance attenuation.
The circle includes its exact radius boundary; binary accepts g>=0.5, so every
surviving source point sample has geometry coverage1. Version1 has no fractional
geometric edge. Material coverage remains a separate resolver input under01 §4.2.

Use01's exact rounded render dimensions, top-left sample centers and inside-pointer
floor mapping. Every fragment uses the point's projected-center depth. Native point
size clamp/rounding, an implementation-specific square or a CSS ellipse is not an
allowed fallback: construct an equivalent screen quad or report Unsupported.

Start with a binary-capable nondefault validation candidate. Its declared development
viewport envelope is0<DPR<=2 and0<renderScale<=1, within existing finite framebuffer
and resource limits. Treat larger/unprovable requests as a local unsupported point
presentation, preserve data and keep other supported models available. Do not silently
clamp the semantic diameter/DPR or label these provisional bounds an iPhone/capacity
acceptance. Initial automated evidence covers DPR1/2 plus fractional viewport/scales;
applicable actual device maxima remain separately gated by03.

The registry includes dither and smooth profiles but this backend advertises only
the exact binary pair. Do not expose a selector for unsupported modes or silently
substitute binary for another requested class. The companion fixes independent symbolic seed domains: geometry
`lociview-point-geometry-coverage-1`, material `lociview-material-coverage-1`. A
separately ratified immutable G0 rule must bind their matrix/seed derivation and
top-left coordinates, with its exact rule ID/digest in the active configuration;
a missing rule is Unsupported, not an engine-selected pattern. That binding
retains its separate G0 decision;
smooth remains unavailable pending G1-D and the additional production/device reviews.
Neither is ratified as implemented by accepting the three presentation records.

Selection follows01 §8, rather than Native's centre-distance-only helper:

1. Resolve one explicitly targeted visible Asset/current selected pointPrimary and
   its active profile/LOD/transform. Other Assets can occlude but never become targets.
2. Compare accepted direct point and Mesh-source fragments that cover the canonical
   click pixel by visible depth. Discarded/hidden/clipped/unsupported points do not hit.
3. Only when no Mesh-source fragment covers that pixel may visible points within
   the fixed6CSSpx centre radius be fallback candidates. Prove actual covered/visible
   samples for a point, including partial occlusion; do not infer visibility from
   centre distance alone. Order by centre distance, effective depth and Representation
   ID, then complete occurrence, otherwise01's canonical position/normal tie rules.
4. Missing coverage/depth/tie proof is ambiguity with no pin commit, not a guessed
   point/triangle winner. A frame change invalidates the captured gesture/hit.

For an unadjusted source-point hit, positionAsset is the source Float32 centre
transformed by validated representationToAsset, not a ray-unprojected glyph edge.
Record point-cloud and the complete source representation/pointSample occurrence;
normal is absent. Gizmo/numeric adjustment changes this to a source-less manual
anchor only through an explicit user edit. Both preserve Caption ID/content/Scene
membership. No direct-splat/proxy evidence is invented.

## 5. Ports, commands and connected implementation

Use the same new-file intent, content sniffing, fresh creation/add-model preparation,
MetadataProjectSession, WorkspaceFS/CAS and model-fact staging/recovery as current GLB.
Extend the bounded model content/facts union; do not invent another storage authority.
Every source ingress—fresh/add, package import/receive, backup restore and cold open—
uses the exact same profile registry/inspector and retains the original bytes. Missing
acknowledged evidence is never reconstructed from input. Old jobs/profiles stay fixed.

The UI gets provider-derived immutable model and local point-presentation display
models via typed ports. A renderer-neutral point profile resolver validates the whole
three-entry snapshot; capability filtering is downstream. The point resident port owns
source arrays, original-ordinal mapping, GPU resources, frame generation and disposal.
Domain/scene import no UI/renderer/storage; viewer imports no package/storage. Keep
harness string-map adapters out of the product UI. Add exact import allowlists and
run the existing sceneCore isolation case early when adding modules.

The existing addPin/movePin Session command boundary is extended explicitly for
point-cloud anchors on a current visible
pointPrimary with complete verified profile/range/Frame/Revision/Compatibility.
The owned content/hit preparation port resolves the checked original occurrence to
its canonical centre; UI-supplied verified flags or arbitrary coordinate/index pairs
are not proof. Validate source identity and current scope again before the existing
metadata publication, with no extra persistent receipt or weakened fence. Point
coordinates remain the saved position authority; provenance never reconstructs them
on reopen. Other manual/proxy/GLB commands retain their current meaning.

Retain pending point file, exact IDs and command on a failed save; idle unapplied
selection cancellation and cold prepared recovery follow existing owners. No PLY
fallback through an unverified decoder. File receivers must refuse an unknown profile
as a whole without partial Project mutation. Existing GLB/photo/file paths stay usable.

First integration includes new raw point Project, point addition to an existing
Project, local point diameter, Caption/media work, file exchange/restore and cold
continuation. Existing local visibility and explicit Move/Rotate/positive-uniform-scale controls
apply to the point Asset without rewriting original coordinates or Caption positions.
Point replacement/format conversion, GS/Proxy, other Mesh formats and
remaining material effects follow with their real compatibility/recipe gates;
this does not remove them from the accepted feature set or mark allM02/A03 complete.

Binary decoder reads from an integrity-checked review archive use its existing native `entryBlob` view and the existing consumer `readValidationBody` limit. They do not pass the file-body ceiling as a control/source `entryBytes` buffer budget or increase package control/source limits. A small Review must open with the browser's64MiB file ceiling as well as with smaller test ceilings.

Implementation binding: the exact point source uses BlobRef/provenance media type `application/ply`; this is coupled to the source profile ID/digest, contentKind and role. It does not enable another PLY profile or change package/schema versions.

## 6. Acceptance and actual stop conditions

Before implementation: independent profile/source/interaction review and exact-byte,
digest, manifest-link and scalar-vector checks are complete. PO approved the exact
profile/size/pick/source-lighting/point-evidence package together on2026-10-27.
This authorizes connected implementation; no runtime support, adoption or UI activation
is claimed by the approval itself.

After approval, complete one user workflow with focused rejection/fault combinations
and one connected real-file browser lane: point source bytes/count/bounds/colors,
3-profile registry mismatch/refusal, disc/pixel/depth/radius/ties, no fake normal,
unchanged/adjusted source evidence, stale/readonly/IME/gesture guards, diameter local
lifetime, add/edit/media/save/Workspace/return/backup/restore/cold with exact history,
loss refusal, same-input retry and owned resource release. Reuse tests; no parallel
framework or public sample acquisition. Run required final checks/review at the
connected boundary. Recorded DOM/scalar vectors do not prove rendered or device use.

PO approval does not pass G0/G1, ordinary home, full point/container support, physical
iPhone, offline, device/performance/capacity, dither/smooth/GS, public fixture distribution,
main/Pages/Service Worker, dependency or release/deployment gates. Ask again only for a
new actual contract/policy/authority change, not each helper or acceptance check.
