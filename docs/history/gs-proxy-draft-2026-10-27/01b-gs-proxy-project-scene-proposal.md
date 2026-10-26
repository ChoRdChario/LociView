# 01b: GS files, explicit interaction surfaces and continued records

> Status: **PROPOSED / NOT PO APPROVED / NOT IMPLEMENTED / NOT ADOPTED**
> Prepared: 2026-10-27. Exact candidate companions are review inputs, not active profiles.
> This proposal closes the next bounded M03/M10 workflow; it does not complete all model, migration or adoption work.

## 1. 利用者の結果と今回の判断

GSを開く／追加する → 必要なら同じ座標で作成した位置指定用の面を設定する →
GSを選んで記録位置を指定する → 通常の位置調整・確定 → 本文・画像を編集する →
保存・受け渡し・復元・再開、を現在の検証画面へ接続する。
位置指定用の面は描画せず、選んだGSにだけ対応付ける。面がなくてもGSの表示と
保存済み記録の利用はでき、新しい位置指定だけを止める。

今回の新しい判断は、次の具体的な仕様をまとめたものとなる。

- 最初のGS入力は、62個のFloat32属性を持つbinary little-endian SH3 PLY。
  原本・点の順序・元の値を保持し、他のPLYを拡張子だけでGS扱いしない。
- XYZの軸と単位は01aと同じ座標規約（右手Y-up、1単位=1Asset m）を指定する。
  ファイルから実測の縮尺や向きを推測する意味ではなく、必要な配置変更は明示操作とする。
- 陰影係数をすべて評価してから色を0〜1に収め、sRGBから線形色へ変換する。
  有限の広がりは下記のcutoff／covariance規則で決める。これは上流実装の完全再現を
  名乗るものではなく、この新profileの表示解釈である。
- 位置指定用の面は既存の限定GLB検査を通した原本から、両面の三角形だけを使用する。
  同じGSの座標・単位で作成済みであることを明示確認し、自動位置合わせはしない。
- 近似の位置は通常のgizmoで調整または明示確定し、保存する位置はGSのAssetFrameの
  manual座標とする。面を後で交換・解除しても、保存済み記録を動かさない。
- 新しいtyped GS／Proxy接続と、§7の局所的な表示・操作可否を実装する。
  保存済み本体や検証証拠の喪失時は、現在の復旧・書込み停止を維持する。
- 最初の限定描画は既存Three.js上に、元データからCPU計算した画面上の形状・色を
  渡す専用passとして実装する。§8の正確な描画設定と現在視点ごとの可否判定を通して
  非既定validationへ接続する。Sparkの圧縮・既定色変換は新経路へ流用しない。
- Mesh／Pointへの位置指定でGSが重なる場合は、同じ画素でGSの寄与がないことを
  確認できたときだけ確定候補にし、不能時は既存のモデル単独表示を案内する。
  GSの近似面による位置指定は、これと別の明示ターゲット操作とする。

承認を求める対象はこの具体案と正確なJSON bytesである。新依存、通常home、公開、
実機／offline、G1-B合格や正式なrenderer採用はこの承認に含めない。

## 2. Authority and immutable candidate companions

[01 §§2.2,3.2,4.1,8](../../specs/01-domain-rendering.md) fixes frame/covariance/SH semantics,
explicit same-Asset interaction routing and confirmed manual anchors.
[03 §5](../../specs/03-gates-and-delivery.md#5-g1-b--renderer-bakeoff) currently permits the
disposable Spark harness and stops before production integration. **If approved,
01b adds one exact exception to that stop: production implementation and qualified
activation in the nondefault ProjectScene validation path described here.** It
does not adopt Spark, pass G1-B, promote PoC code, or activate ordinary home.
[05](../../specs/05-project-scene-team-workflow.md) and [06 §11](../../specs/06-project-package-wire.md)
retain their existing Session, privacy, package and isolated-implementation authority.

Candidate JSON is UTF-8, LF, no BOM, one final LF. SHA-256 covers exact bytes; no
file contains its own digest. A profile points to its golden-manifest digest.
The golden names profile IDs, not profile digests, avoiding a hash cycle.
After PO approval, changing semantics requires a new ID/digest, never editing these bytes.

| ID / input | Exact companion | Candidate SHA-256 |
|---|---|---|
| `development-validation-gs-ply-sh3-1` | [GS profile](profiles/gs-ply-sh3-1.profile.json) | `746cc3fda107a52fdc14efe079b6ddda0297cc084b11205c3b5e3cd1b20a4970` |
| `development-validation-proxy-glb-1` | [interaction profile](profiles/proxy-glb-1.profile.json) | `383e4352199eedbd99b89550d9a899a8182d50f005c8e9a1ff9daa2b2402f7ff` |
| independent semantic vectors | [goldens](profiles/gs-ply-sh3-1.goldens.json) | `d3c7fc4782006faa66628848192af585d56d9fb5d31da36d9202cf10ca223e85` |
| `lociview-gs-screen-1` | [screen presentation/probes](profiles/gs-screen-1.presentation.json) | `51ac8c27546c0b7e197a6431919610bd1ac45676bfd201d8fc1e0a301dac7f98` |

The separate [GS screen-presentation candidate](profiles/gs-screen-1.presentation.json)
binds the exact projection/reconstruction/composition, current-view numeric predicate
and fixed camera/pixel probes. It is transient renderer capability, not a saved
source bound or user setting. Source and presentation ID/digest are qualified together.

These source IDs are not registered in runtime or allowed in newly written Project data
until approval and implementation. The unratified preflight handle is not reused.
The existing six01a companions, old GLB/Native profiles and conversion recipes stay immutable.

The older G0 preflight text is itself SHA-bound by the fixture registry and stays
byte-for-byte unchanged. New answers and fixed primary references live here, not
as an in-place rewrite of that evidence. Approving01b does not relabel the old
preflight handle, source digest or registry as ratified.

## 3. Source meaning and admission

The GS JSON completely fixes the62-property order/248-byte stride, LF-only bounded
ASCII header, full finite payload, source ordinal, ignored finite normals and
reject cases. Preserve the original byte stream. Budget preflight uses the existing
FileValidationLimits: file body≤maxFileBytes, count≤maxItems,62×count≤maxValues;
fresh multi-file selection also retains its existing aggregate byte ceiling.
Current browser values are64MiB,100,000items and8,000,000values. These are bounded
admission, not decoded CPU/GPU or performance/capacity guarantees. Add/receive/export
retain their own existing total/closure limits; none is raised by this proposal.

Decode source Float32 values before binary64 semantic calculations. Normalize a
finite nonzero wxyz quaternion; q and−q give the same covariance. Use exp(logScale),
stable sigmoid(opacityLogit) and `Sigma=R diag(s²) Rᵀ`. Reject nonfinite/zero scale
or scale-square, nonfinite covariance/bounds, or an input with no nonempty support.
Negative zero normalizes in semantic values, never by rewriting the original file.

The proposed finite source cutoff is **τ=1/510, K²=8**. For a≥τ,
ρ²=min(8,2ln(a/τ)); for a<τ support is empty. Equality includes the centre.
Halfwidth on axis i isρ×hypot(row_i(R diag(s))). The profile fixes conservative
binary64 outward padding/nextDown/nextUp and componentwise union. This defines
logical source support; a screen reconstruction/AA kernel is a separate backend
presentation effect and cannot silently replace those bounds or source facts.

For complete frame L,t: means use Lμ+t, covariance uses LΣLᵀ, opacity is unchanged.
Evaluate SH using camera-to-mean direction returned by inverse(L), including
reflection. Individual Gaussian orientation never rotates the SH basis. Sum all
16terms in declared order, then bias+0.5, final[0,1] clamp and IEC sRGB decode.
The full-precision constants and nonzero mixed-direction/channel/clamp goldens are
explicit. Camera-at-mean has no defined direction: omit that transient fragment,
not the saved source, instead of inventing a direction.

The selected coordinate convention, finite cutoff, upper color clamp and IEC
transfer are **new LociView rules**, not facts proved by Graphdeco's code. Graphdeco's
rasterizer instead uses a0.99 alpha cap,1/255 pixel cutoff,3σ image radius and only
a lower color clamp. Spark's defaults also do not define this source contract.
Original bytes are retained so another later profile/explicit conversion remains possible.

## 4. Explicit GS and interaction records

Use existing schema fields, not a new package/schema version. A GS visual record is
gaussianSplat/gsPrimary/source+display, one visual family and singleton anchor class,
no MaterialCatalog, and complete splatSample source ranges. Its original PLY uses
application/ply coupled to the exact GS profile; Point PLY remains a distinct tuple.

A proxy record is mesh/interactionProxy with purposes:['interaction'], its own
same-Asset family/frame, no MaterialCatalog/class, an explicit
proxyForGsVariantFamilyId and complete original triangle ranges. The target GS
family must occur in that same AssetRevision. Retain imported GLB bytes and inherited
GLB1 admission, including embedded PNG validation. Authored material alpha/chroma/
sidedness do not filter interaction geometry: this profile is geometry-only and
two-sided. It changes no old visual-GLB interpretation.

Proxy geometry is owned by InteractionIndex resources, never added to a visual
scene, depth, shadow, screenshot, material panel or fit bounds. No proxy generation,
automatic registration, cross-Asset Mesh substitution or guessed family relation.
Only the selected visible, supported GS family can admit its unique valid proxy.

After confirming same coordinates/unit, attach/change creates a fresh immutable
revision/binding while reusing the exact GS representation/family/class, original
AssetFrame and assetToProject. Reuse that class only through owned verified content
equivalence of the unchanged GS, never a UI flag. Retain old revisions/bodies/history.
Remove creates the corresponding GS-only revision. Replace/remove cannot move,
reparent, invalidate or rewrite existing compatible Captions merely because the
interaction resource changed. Imported multiple valid same-target proxies are
interaction ambiguity, not an arbitrary first winner; explicit replacement can
produce one new proxy without deleting old history.

## 5. UI and command boundary

Use existing file/model panels, pending-input owner and ordinary Caption gizmo.
When a GS is selected, reveal one contextual action `記録する面を指定`; when one
already exists use `記録する面を変更`, with `記録する面を外す` in contextual details.
The validated file preview states the same-coordinate/unit prerequisite before
`この面を使う`. Unknown registration refuses, while cancel preserves the current
GS/proxy. Do not ask the user to choose a backend/profile or expose IDs and manifests.

New placement explicitly targets that visible GS and raycasts only its admitted
interaction geometry. This first proxy path precedes01's general visible-fragment
selection: a coarse proxy hit is not proof of a visible GS sample or surface depth.
The normal adjustment/explicit `位置を確定` commits a complete manual anchor with
current GS AssetFrame/revision/class, no proxy/splat locator, source, confidence or
normal. Keep this consequence in the placement help, not as a permanent badge.
Unchanged confirmation is allowed; source-point evidence from01a is never relabelled.

Hidden/unsupported GS or absent/ambiguous/unusable proxy cannot start a new GS hit.
Existing saved records use canonical positions; valid current binding/class permits
ordinary manual correction without reraycasting the proxy. Preserve Caption IDs,
Scene membership, text/media, drafts and other model visibility. A stale generation,
Scene/binding/class change, IME, drag or pending recovery refuses/cancels the captured
action through existing guards. Never fall back to an unrelated Mesh, ordinary
point or direct-GS pick. Preserve legacy Mesh Add/Shift behavior outside the
explicit GS route; retain existing Point target/source-centre rules.

Specify these typed ports before source implementation:

| Boundary | Bounded addition / ownership |
|---|---|
| model/content union | owned inspected GS source and geometry-only proxy facts; old GLB/Point branches unchanged |
| read projection | saved-gs/render-gs plus explicit absent/ready/ambiguous/unavailable proxy state; representationToAsset is the full CanonicalTransform including reflection, mutable assetToProject is Sim3; one GS visual per Asset revision in this bounded path; no general untyped array adapter |
| GS attach/change/remove | Session commands with captured token/Scene/Asset/current binding/GS family, owned selected input and explicit registration confirmation; fresh prepared IDs once |
| model facts | materials:[] for GS/proxy, exact original ranges/bounds/profile; interaction family first-verified-output envelope authority; unchanged-GS equivalence proof for class reuse |
| backend/resources | viewer consumes only renderer-neutral owned attributes/profile/frame; coordinator owns shared render state and per-Asset availability; InteractionIndex owns invisible proxy resources |
| UI/display | provider-derived GS capability and interaction state; typed explicit GS target, not a synthetic string-map or storage read |

Keep core/domain/scene free of UI, viewer free of package/storage and runtime
external URLs. Extend exact sceneCore import allowlists and verify them early.
Prepare one introduced proxy body per attach through existing owned staging; a
GS+proxy pair is not a second unrelated visual model or an unbounded prepared set.

## 6. File continuation and lifecycle

Every ingress uses the same exact inspector: fresh/add, Workspace/Clean import,
Contribution receive, backup restore, cold open and standalone Review. Existing
operation-owned reads, CAS/journal/acknowledged-content lifetime, IDs and marker-last
publication remain. Retry uses the same prepared bytes/IDs; missing acknowledged
evidence is not reconstructed. Retained source/metadata exceptions are not flattened.

Workspace/Contribution/backup preserve current source/proxy relations and original
history/bytes. Review/Clean/edit-copy/independent keep-both use existing typed re-key
builders, updating GS/proxy/family/class references while preserving intended Asset
ownership. Proxies never become visible models or pin owners. Manual current
anchors do not add weak old proxy provenance to a history-free closure. Use the
existing archive Blob decoder port and all original control/consumer/closure limits.

All five-purpose output/input, Review edit-copy and independent keep-both are
required before this connected unit is complete. An unsupported refusal is safe
failure behavior, not completion credit; retain that item as unfinished. Never
silently drop a proxy, GS source, unknown record or protected body to produce a
successful-looking file. No old Native/v1/LociMyu GS conversion recipe
or model-replacement policy is implied. Those remain later explicit mappings;
GLB replacement and prior conversion recipes retain their exact behavior.

## 7. Availability and security clarification for approval

| Situation | Required result |
|---|---|
| new input invalid/unknown profile, malformed source, cross-Asset/outside-revision target, missing required body | reject the input as a whole before mutation; preserve original/current Project |
| valid GS, no proxy record | GS display and existing records remain; new GS placement disabled |
| multiple valid same-target proxies | GS display remains; new GS placement disabled with an actionable ambiguity; no first-match |
| verified valid bytes/facts, but decoder/GPU/interaction capability unavailable | per-Asset display/interaction diagnostic; unrelated assets and permitted existing-record work remain usable |
| acknowledged CAS body, fact receipt or original history missing/corrupt | retain current Project repair/publication/receive/export fences; do not grant writes or synthesize evidence to obtain local degradation |
| stale/context-lost/disposed display gesture | cancel/refuse the gesture, release owned resources and retain pending user data |

**Normative clarification requested with this proposal:**01's missing/broken-proxy
degradation describes absent relationships or runtime capability failure with valid
verified source/facts. It does not override02/05/06's corruption/lost-evidence
publication fence. Existing read-only published content may remain visible during
repair, but this proposal does not promise write/gizmo continuation after physical
content loss. This distinction is part of the PO decision, not an implementation
shortcut to weaken checked()/metadataProviderReady().

## 8. Exact bounded presentation and connected acceptance

The initial adapter is an **independently authored bounded Three screen-GS pass**,
using the same owned CPU projection direction as01a. CPU binary64 evaluates full
source covariance/SH/IEC color and current-view projected moments; the renderer
receives owned Float32 screen attributes. Reuse Three0.180.0 and existing coordinator/
resource ports; no new dependency, raw-loader authority, promoted Native/PoC code,
Spark packer or runtime CDN. This new bounded adapter choice is part of the PO
architecture decision here, not an adopted general renderer or large-GS solution.

Spark2.1.0 remains the existing Native/harness candidate. Its packed means/scales/
quaternion/SH, pre-SH8bit DC clamp and gamma2.2 are known mismatches for this source
profile. The bounded CPU/screen pass avoids those dependencies. Later Spark/PlayCanvas
bakeoff and paging remain separate gates; no new technology-adoption claim follows.
Source bounds always come from the independent inspector, never a renderer box.

The exact screen companion fixes perspective and orthographic Jacobians,
`SigmaCss=J*SigmaCamera*Jᵀ+0.3I`, no FOV/J clamp or opacity compensation, centre
near/far clipping, camera-at-mean, full drawing-buffer sample coordinates, Q/alpha
cutoff and a4096-interval owned Float32 falloff LUT. The256×17 R32F layout uses two
texelFetch reads and manual interpolation; no4097-wide texture or float-linear
extension is assumed. No screen kernel is persisted as source covariance/bounds.

The companion also fixes executable **current-view capability**, not merely a label
that eight goldens passed. Device precision and functional texture/linear-target/
blend/output probes must pass. For every nonempty in-view primitive, compare actual
uploaded centre/conic/color/alpha with CPU canonical values. Check SPD/finite data,
rounded-covariance recovery, bounded operands and the explicit per-rectangle Q-error
bound `etaQ<=2^-12`. Bound alpha and contour errors, including Float32 cutoff and LUT
error. Require the declared contour displacement<=0.25CSSpx. Re-evaluate on source,
frame, camera, viewport or DPR change before publishing a display receipt. A failed
primitive makes only that GS visual Unsupported; never silently omit it, weaken the
source profile or enlarge the predicate to fit an engine. Preserve existing Mesh/
Point display and records, and cancel stale gestures during view preparation.

Qualification distinguishes quantities and discontinuous boundaries:

- Source/unassociated linear RGB error<=1/1024 and2D covariance max-entry error
  <=max(1e-12,1e-5×reference max-entry norm); source3D scalars retain their separate
  absolute/relative1e-12 oracle. Actual Float32 upload errors obey the tighter
  current-view predicate, not a general packed-color allowance.
- Mean/contour displacement<=0.25CSSpx; interior alpha error<=1/1024.
- In the analytically defined contour guard only, radius-cutoff alpha/premul error
  <=1/50 and alpha-threshold error<=1/255. A guard is derived from the fixed contour
  and displacement bound, never an arbitrary mask hiding failed pixels.
- Fixed camera/probe linear-premultiplied RGBA, away from those guards, must match
  within1/1024 before final IEC conversion. Read actual linear/half-float values;
  do not divide by near-zero alpha or compare encoded canvas values as linear.
  These probe tolerances are not a universal all-scene pixel/performance promise.

The companion contains concrete33×33CSS perspective/orthographic cameras,
DPR1/1.25/2, rounded buffers, background/exposure,2D covariance/conics, pixel-centre
Q/alpha/linear results, opaque Mesh/Point depth cases and two-GS order/ties. It also
contains positive/negative capability boundaries. Reuse a small existing test/probe
port; no new PoC or generic measurement framework. Execute independent scalar/raw-bit
checks and actual browser probes before enabling this exact bounded pass.

Composition is linear-premultiplied source-over in a functionally verified RGBA16F
FBO, followed by one IEC output conversion; blending directly in an encoded-sRGB
canvas or RGBA8-linear substitute is not equivalent. Opaque/binary Mesh **and opaque
Point** write the first color/depth pass. GS tests strict Less against that depth,
never writes depth, and sorts far-to-near across admitted GS by mean depth with the
companion's content/ordinal/numeric-transform tie rule. Proxy geometry contributes
to none of these passes. If the linear-target capability is unavailable, retain the
existing Mesh/Point path and diagnose only GS. Advanced shared-view material classes
keep their actual gates and local diagnostics; no alternate blend policy is inferred.

For explicit Mesh/Point placement, a same-frame Boolean coverage query must prove
no admitted GS contribution at a direct hit's canonical sample. For Point-radius
fallback, apply it to each actual covered visibility-proof sample used by01a and
prove at least one Point-covered sample with no GS contribution after opaque depth.
A click-only or centre-only test cannot prove a hidden/partly covered glyph visible.
Keep01a's no-Mesh-fragment and ranked-ambiguity rules. Otherwise refuse that placement
and offer the existing isolation control.
This is an occlusion-safety query only: no GS ID, depth reconstruction or position
is returned. The explicitly selected-GS/proxy approximation remains01's separate
first-path exception; it does not claim visible-splat surface precision. Add mixed
regressions proving no hidden Point/Mesh commit and no unrelated fallback target.

The mathematical presentation and error limits are normative. Direct-conic screen
attributes and the supplied etaQ formula are one sufficient executable proof path.
A mathematically equivalent factor/whitener or tighter conservative bound remains
ordinary implementation when independently derived for its actual uploaded values/
arithmetic, passes the same current-view limits/goldens and is independently reviewed
before activation. That does not change source/presentation policy or require another
PO decision. A label, an unmodified bound for different parameters, or a weakened
threshold is not such proof.

Complete one connected real-file workflow, reusing existing services/tests:
fresh/add GS → same-coordinate proxy attach → explicit GS/Mesh target isolation →
approximate hit → adjust/confirm → text/image → checked backup → Workspace/return →
Review/Clean/edit-copy/keep-both → proxy replace/remove → restore/cold continuation
with exact source/history and unchanged saved positions. Every listed file action
is required for unit completion; a safe unsupported refusal remains unfinished.
Include invalid/cross-Asset/multiple/missing proxy, renderer-local failure versus
acknowledged loss, cancel/stale/read-only, exact retry/interruption, context loss,
and owned20load/unload cycles. Service tests cover fault combinations; do not clone
the entire browser roundtrip for every field. Run required final serial checks,
isolation and independent review. Preserve failures and label per-case/aggregate results.

500k SH3 is124,000,000payload bytes and exceeds current admission. Full renderer
bakeoff, derivatives/paging, physical iPhone, actual IME/zoom, offline/PWA, ordinary
entry and release retain their real gates. No direct-GS pick, generated proxy,
large-source guarantee or formal renderer adoption is earned here.

## 9. Fixed primary provenance and clean implementation

Read through the GitHub connector on2026-10-27; base64 bytes were decoded and each
Git blob SHA-1 recomputed before SHA-256. Full reference texts stay in ignored
`.artifacts/e2e/gs-primary/`; no upstream training/renderer implementation is added
to LociView. The input layout and mathematical conventions were checked; specification
text, analytic vectors and implementation are independently authored.

| Fixed source / license | SHA-256 |
|---|---|
| [Graphdeco model54c035f](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py) | `546ba41528a879af4d83bd280a3ef3cbcca9a5e9132204185aaa8f8ee9ffa310` |
| [SH reference54c035f](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/utils/sh_utils.py) | `7d1ff267546390635e6d1f68c4f88c4a8b052482d5c9be1d32f06bc69e9a96e7` |
| [Graphdeco license54c035f](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/LICENSE.md) | `c5ba70a2194af2aefe85dfe3da68608dcb3abd21a3aa53b55aa297c2f0b60eb3` |
| [Raster reference59f5f77](https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/59f5f77e3ddbac3ed9db93ec2cfe99ed6c5d121d/cuda_rasterizer/forward.cu) | `83c182561b9f75e93b7b72a24aaf1fce507388a0198aa4a56137d25deabcd6c8` |
| [Raster license59f5f77](https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/59f5f77e3ddbac3ed9db93ec2cfe99ed6c5d121d/LICENSE.md) | `cd5c95b3cfff3acc1bd412420c770f88809331c3db6872df11a970147aa8e81f` |

Model/raster files carry Inria2023 notices and research/noncommercial/evaluation
conditions. SH source carries a distinct PlenOctree Authors2021 permissive two-clause
notice. Treat them file by file, not as one blanket license. This factual preflight
grants no commercial/redistribution or top-level LociView license authority.
Project synthetic fixture registry remains NOASSERTION/unreviewed; no public app
sample or upstream source redistribution is authorized.

Pinned local Spark source map SHA-256 is
`7bb4e32e97dde9352981651d8e5aee41780546ee04cb96abcf7d8fa8d9fc75b4`;
its local MIT LICENSE SHA-256 is
`51829693e5dccd9ca1daa093991faac3aaa93238eb8fd5f5cb4130af85791d64`.
Lockfile already binds the2.1.0 tarball/integrity. No tarball re-download or Rust
stream-decoder equivalence is claimed. A JS source-map observation is not proof
that another WASM decoder follows it.
