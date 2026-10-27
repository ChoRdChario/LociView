# 01c: SH0–4 GS input, linear display and explicit Proxy workflow

> Status: **APPROVED LIMITED IMPLEMENTATION / INDEPENDENTLY REVIEWED / NOT ADOPTED**
> PO approved the exact four companions, fixed GSL1.4.3 dependency and bounded
> nondefault connection on2026-10-27. Implementation/evidence remain in
> [todo](../../tasks/todo.md); this approval passes no aggregate adoption/release gate.
> Prepared2026-10-27 at the PO's request. This is the next connected unit after
> [07j](07j-three-186-compatibility-proposal.md), not approval inferred from its implementation.

## 1. 利用者の結果とまとめて判断すること

GSを開く → 形・色を見ながら視点を動かす → 必要なときだけ位置指定用の面を追加する
→ 記録位置を調整・確定する → 本文・画像を編集する → 保存・渡す → 復元・再開、をつなぐ。
SH次数、描画エンジン、内部のRepresentationや履歴を日常操作の選択肢にしない。

推奨案は次の一まとまりである。

- 完全なSH0〜4の属性を持つ、厳密なbinary little-endian PLYを新しいGS入力とする。
  原本・全係数・元の座標を保持する。不完全なGSを通常点群として表示しない。
- 固定GSL1.4.3を非既定のProjectScene検証経路に接続する。表示専用の量子化を明示し、
  既存モデルと同じ線形色空間で合成して、最後に一度だけ画面色へ変換する。
- GSを直接raycastせず、選択したGSと同じ座標で用意したGLB面だけを明示的に関連付ける。
  面は通常表示しない。初期位置を既存gizmoで調整し、確定した手動座標を保存する。
- SH4を黙ってSH3へ下げない。まず現行安全上限の中で編集・五目的ファイル・復旧を完成
  させ、その後の大容量streamingとSH4 pagingを残す。小型接続をGS全体の完成としない。

今回の承認範囲は、正確なsource/presentation companion、固定依存、typed接続と限定的な
非既定実装である。正式renderer採用、通常入口の切替、容量保証、公開は含めない。
依存の再更新、独自fork、runtime CDN、直接GS選択、Proxy自動生成は含めない。

## 2. 権限・不変の契約

[01b §8](01b-gs-proxy-project-scene-proposal.md#8-次の実装順とgs接続の残り)の順序を具体化する。
[01](01-domain-rendering.md)のframe・GS covariance/SH・明示Proxy・manual anchor、
[05](05-project-scene-team-workflow.md)のtyped Session/provider、
[06](06-project-package-wire.md)のclosure・stage・復旧・publicationを維持する。

01aの6 JSON、07a/07d/07i等の既存profile/recipe/ID、07jの実180 proofと186表示は不変。
[旧GS preflight](../g0/gs-source-profile-candidate.md)と旧01bの未批准SH3 JSONも変更・流用しない。
本案の新IDと正確なbytesは2026-10-27のPO一括承認で批准された。一般形式の採用とは区別する。

承認済みの[03 §5](03-gates-and-delivery.md#5-g1-b--renderer-bakeoff)に記録した例外は、
本案の厳密profileを使う非既定ProjectScene実装とその検証だけである。G1-Bのpaired比較、
physical iPhone、device/offline、G1-Aの大容量I/Oや一般採用を通過したことにはしない。
GSL評価用コードは使い捨てであり、productionは以下の境界から新しく実装する。

## 3. 正確なsource profileとgoldens

批准済みIDは`development-validation-gs-ply-f32le-sh0-4-1`。
正確なJSONとgoldenのbytes/digestは本節のcompanion表で固定する。承認後の修正は新IDにする。

| SH次数 | rest係数数 | Float32属性数 | record bytes |
|---|---:|---:|---:|
| 0 | 0 | 17 | 68 |
| 1 | 9 | 26 | 104 |
| 2 | 24 | 41 | 164 |
| 3 | 45 | 62 | 248 |
| 4 | 72 | 89 | 356 |

headerはASCII、上限64KiB、LFまたは一貫したCRLF。vertexは正のuint32で一つだけ。
順序は`xyz / nx ny nz / f_dc_0..2 / f_rest_* / opacity / scale_0..2 / rot_0..3`。
全propertyはscalar `float`、payloadは宣言数×strideと完全一致。metadata行は不活性。
部分band、穴・重複・未知property、list、face、追加element、非有限値、末尾データは拒否する。
normalもfiniteを要求するが表示・ピン法線には使わない。ordinal、重複、raw bitsは保持する。

元の意味は次の独立した数式で定義する。Graphdeco実装コードのコピーではない。

- `mean`は元Float32座標。新規のsource→Asset初期値はidentity、軸・原点・物理単位を推測しない。
  GSから新規作成するProjectのunitは`unknown`。既存Projectのframeは変更しない。
  新規の正規化はidentityで、受信時の明示的canonical Sim(3)/反転は既存01の検査後に適用する。
  AssetFrameのboundsは`meanAsset=L mean+t`、`ΣAsset=L Σ Lᵀ`から取り、source AABBを回す代用はしない。
- opacityは安定したsigmoid、scaleは`exp(logScale)`、quaternionはwxyzを正規化する。
  零quaternion、非有限/零へのunderflowを生むscale/axis varianceは拒否する。
  covarianceの正当な非対角成分0は許可する。
  quaternionの符号と導出値の負零だけをcanonical化し、原本を書き換えない。
- `Σ = R diag(exp(2s)) Rᵀ`。peak opacityが`τ=0.5/255`未満の行はempty supportだが
  ordinal/countから削らない。それ以外のsource supportはMahalanobis半径4の保守的包絡。
  軸別のraw boundは`mean[i] ± 4 sqrt(Σ[i,i])`、64 binary64-epsilonの外向き余白を加える。
  overflowや保守性を検査できない計算、全行empty supportは拒否する。
- restは各色ごとの連続band、次数は完全schemaから導く。SHはcamera→mean方向を
  complete transformの逆でsourceへ戻して評価し、全bandの後に`+0.5`と下限0のclamp。
  Gaussian自身の向きqでSHを回さない。上限1へはclampせず、1を超える値にも同じIEC sRGB
  power分岐を適用してlinearへ変換する。
  反転も方向変換へ含め、meansだけ変える実装は拒否する。

source boundsは独立inspectorの結果であり、GSLのloaded/LOD bboxから逆算しない。
数値の比較許容・外向き余白はcompanionで定める。受信・復元は有効な既存bounds/digestを
保持し、再計算値でimmutable recordを書き換えない。
具体的には全非empty行のraw unionを取り、軸別`S=max(1,max|mean|,max radius)`に対して
`pad=64*2^-52*S`を一度加えてnextDown/nextUpする。保存済みboundsはraw unionを内包し、
再計算したpadded unionとの差が`16*2^-52*S`以下のときだけ受け入れる。内向きboundsや
不一致時の自動拡張は許さない。この許容は新GS profileだけに閉じ、既存の完全一致検査は不変。
この再検査が通った後のGS factsは、検証済みのstored `logicalBoundsAsset`をそのまま
representation content bounds/source family-envelopeへ返す。再計算した別のpadded unionを返して
generic包含検査と衝突させない。元body/profile/contextを検査せずmetadataだけを信用しない。
JSON内の数式は仕様記述であり、runtimeのeval/Functionや入力由来のshader生成へ渡さない。

`gaussianSplat / gsPrimary / ['source','display'] / application/ply`、material catalogなし、
`splatSample count=N`、static pose、一つのGS family/classを使う。SH次数用の新永続fieldは不要。
Blob SHA-256と既存opaque ID、payload digest、source-envelope authorityを再利用する。

## 4. 表示policyとrenderer境界

批准済みpolicyは`lociview-gs-gsl-webgl2-packed-linear-1`。GSL正式1.4.3、commit
`d8703f7aed0e966e808a3fd3a2e1def3179d90dc`、Three0.186.0を固定する。
依存追加時は既存tarball SRI、Apache-2.0/NOTICE/第三者通知、lockfileとauditを再照合する。
既存Native Spark2.1.0、cache namespaceと明示準備は変更しない。

GSLのRGB/log-scale/alphaのhalf、quaternion pack、SH共有指数packは**表示専用の近似**。
元Float32/全SH係数と同じ精度とは呼ばず、source facts・保存位置へ逆流させない。
表示packで非有限、count/degree不一致、閉じたgolden/transform規則への不適合となる入力は、
そのAssetの表示を診断し、原本や他Assetを保持する。golden許容値を一般入力の誤差保証へ広げない。
maxShは元の完全次数で固定し、低次数化を自動fallbackにしない。

viewportは一つのThree rendererと一つのGSL coordinatorを所有し、各residentはSplatMeshを所有する。
GSとopaque Mesh/01a Pointは同じ**linear RGBA16F targetとdepth**へ描画する。
Mesh/Pointのopaque depthを先に書き、GSはpremultiplied alpha・depthTest on・depthWrite off。
最後の一passだけでIEC出力する。8bit canvasへlinear GSだけを直接重ねない。
tone mapping、stochastic、denoise、bloom、別canvas重ね合わせは有効化しない。
後続の高度な透明交差は既存の別gateのまま。

GSと重なる01a Pointのfragment/6px fallbackは、合成後の実際の可視性を同じRenderPlan・
世代で証明する。既存の非GS Mesh depth probeだけを根拠に確定しない。証明できない重なりは
ambiguityとして保存せず、既存のモデル非表示/選択切替をその場で案内する。GSをPointの
選択面に混ぜず、新しい不透明度閾値や直接GS ID pickingを暗黙追加しない。

RGBA16Fのrender/blend/depthが実際に使えることを小さなcapability probeで確認する。
使えない端末はGS表示だけを診断し、既存Mesh/Point/Caption/mediaを使えるようにする。
拡張名だけで認定せず、target作成失敗・context loss・再生成失敗も再試行可能にする。

GSLのquality値はcompanionで固定し、通常UIへ設定を増やさない。screen blur/viewport capは
一時的なfilter・culling余白であり、sourceの有限world boundsを書き換えない。
fitは完全なsource bounds、画面外判定はfilter余白も使う。通常panでwhole-Asset Unsupportedにしない。
中心clipは既定1.25から4に固定する。固定版shaderの短辺radius capと正規化axisでは、
quadのNDC offsetは最大`2√2`、画面へ届く中心は`|NDC|≤1+2√2<4`となる。
これはscreen-spaceのculling規則で、source/world boundsの根拠へ転用しない。
高DPR/renderScaleは既存RenderPlan/ViewportSnapshotの整合を保ち、01aの実機受入を拡張したとみなさない。

worker/decoder/WASMはlocal bundleのみ。専用validationのGS追加・再開でのみlazy loadし、
通常home/legacy/Native/その他public graphとSW precacheへ混入させない。
本実装のvalidation graphへ入る新moduleは正確なimport allowlist/build/CSP検査で管理する。

residentのdecode/sort/uploadは取消と世代を持つ。source世代の古い結果は解放し、現世代へ差し替えない。
同じsourceの視点更新では、WebGL2 backendの前のsort順序を新しい順序の準備中だけ使える。
source/transform/cameraを巻き戻さず、sort待ちだけを理由に全体を隠さない。
loss中に採用済みGS/renderer/target/専用sort workerを破棄し、進行中の表示準備は取消状態に
して遅延結果を捨てる。未完了のGSL decodeはsceneへ入れずprivate candidateとして自然settleを
待ってdisposeする。外側promiseだけを先にrejectして次のdecodeを並行起動しない。
GSLの共有decoder/WASM poolは公開APIで即時停止できず、固定版のidle退役タイマーは3〜180秒。
ページ停止/OS suspension等を含む壁時計の終了期限ではない。
その残存を「解放済み」と計上せず、全viewportのCPU/worker予算へ含める。同時decodeは全体で
一つとし、元の`initialized`がresolve/rejectしてprivate candidateを解放する前に次を開始しない。
取消はUIとProjectへの不採用を即時反映するが、vendor内計算の即時停止とは呼ばない。
待機中は最新の次要求だけを残し、既存Caption/他モデルの操作を妨げない。繰返し取消/切替でidle poolや
heapが予算を超える場合は接続gateを止める。一般の即時全worker解放や総メモリ上限は主張しない。
この固定pool方針も今回の限定的な実装判断に含み、一般採用の寿命gateを通したとは扱わない。
restore後は同じ有効なsource世代から再作成する。
camera・選択・未確定の位置提案は所有者が存続する範囲で保持する。rendererがProject/ZIP/FSを読まない。

## 5. Proxyと保存座標

Proxyは、選択したGSと**同じAsset・同じRevision**の別Representation/familyとする。
`interactionProxy / ['interaction']`、`proxyForGsVariantFamilyId`を明示し、classを与えない。
使うGLB profileは`development-validation-glb-1`（PNG/base）と
`development-validation-glb-jpeg-1`（JPEG/base）の既存ID/digestだけ。
前者digestは`077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f`、
後者は`a08a1c90496df087b1cd454dd29177ff3da7fdc8b5ebfb07156189479a8f8db8`。
occurrence/Native/旧形式profileへのfallbackは行わない。source bytesとmaterial catalogは保持する。
format semanticsを変更せずrole-specific content tupleを追加する。既存GLB対応範囲外は受け付けない。
interactionではsourceが許可する全triangleを両面の幾何面として扱い、色・alpha/mask/lightingを
raycast条件にしない。見た目は常に非表示で、sourceのmaterial factsを書き換えない。
従って既存profileが許可するOPAQUE/MASK/BLENDは受け入れるが、interactionには見た目の
透過穴を作らない。通常のvisual Mesh pickerを流用せず、閉じたinteraction用raycastを使う。
source座標をそのままGS AssetFrameへ置く。同座標とは原点・軸・倍率の数値一致であり、
GLBのmeter換算、bounds合わせ、重なりから推定しない。初回は準備済みの面に限定する。
初期GS Bindingは明示的な数値identity配置で、物理単位・相互registrationの証明ではない。
既存の未登録診断は残し、通常の明示placement操作だけで調整する。

追加・変更・解除はそれぞれtyped Session command。GS record/profile/blob/frame/transform/
family/targetは完全に不変で、新Revision/Bindingを作り、placementをコピーして最後にstatusを切り替える。
class継承の`surface-equivalence`は同じGS identityと明示targetの完全一致だけで証明する。
操作開始時、file-readより前にprovider token・選択Asset・expected Binding・GS Representation/
payload/familyと現在のProxyを捕捉する。追加はProxy不在、変更/解除はexact currentProxy一致を
要求し、各await後/preview/commit前とdurable retryで照合する。stale/複数/cross-Assetをjournal前に
拒否し、draftと選択を保つ。後から変わった選択やBinding/placementへ読み替えない。
追加・変更は新Proxy bodyを1つstage、解除はbody追加なしの**fact-only plan**にする。
Proxyのfamily-envelopeはexact Proxyに結び付けた`first-verified-output`。GS source-envelopeと混ぜない。
一つのframe/bodyを別Assetのものと推測したり、既存receiptを修理して通したりしない。

Proxyは色/depth/fit/screenshotのvisual contributionに入れず、直接選択もしない。
選択した可視GS familyの有効なProxyだけraycastする。無関係なMeshは代用しない。
hitは一時的なAssetFrame位置候補。通常gizmoで調整・確定した値を
`hitEvidence:{method:'manual'}`のsource-less/confidence-less/normal-less anchorとして保存する。
Proxy triangle、splat/source ordinal、LOD/page indexはanchorへ保存しない。

Proxy変更・解除だけでは既存Caption座標を変えず、再開でreraycastしない。
Proxyなし/validだがruntime利用不可なら新規の近似位置指定だけを止め、未配置の記録作成、
既存Caption・本文・画像・通常の手動位置補正は残す。
宣言済みbodyの紛失/破損やfacts不整合は既存のpublication/復旧fenceで止める。
`metadataProviderReady`を緩めて「Proxyなし」扱いにしない。

## 6. 画面での一つの流れ

入口は既存の`ファイルを開く`/`モデルを追加`。内容検査でGSと点群を区別し、通常は
名前と追加先だけを示す。エンジン・次数・内部役割の選択カードは作らない。

選択したGSの詳細にだけ`位置指定用の面を追加`を出す。条件は
「このモデルと同じ座標で用意した面のデータを選択してください」。ファイルを検査後、
選択中GSへの所属と原点・向き・倍率を合わせた準備条件を、一つの最終追加操作で明示確認する。
確認のための別wizard/技術設定は作らず、別Assetへの推測関連付けはしない。
面は通常表示しないこと、既存の記録位置は変えないことを操作の近くに伝える。
追加後の詳細だけに`位置指定用の面を変更`/`位置指定用の面を外す`を出す。
解除確認は「新しく位置を選ぶには面の追加が必要です。保存済みの記録位置は変わりません」。

Captionの`位置を指定`では、対象GS → 面上の近似位置 → 既存の位置調整 → `位置を確定`。
面がなければその場に追加の入口を出す。本文入力や保存を面の追加待ちにしない。
ドラッグだけに限定せず、既存の数値/keyboardの位置調整を使う。

読込・準備中は実際に分かる段階/量だけをstatusで伝え、取消・失敗・再試行を同じ場所へ出す。
推定残時間や架空の進捗率は出さない。定番の選択・取消・保存導線を再利用し、技術設定を増やさない。

## 7. 型・facts・五目的ファイルの接続

実装前に固定するportsは次のとおり。新しい汎用patch APIやstorage authorityは作らない。

- `projectFiles`: 全入力で同じPLY分類/GS inspectorとprepared sourceを使う。保存済み/受信/
  復元/履歴inventory/Reviewはprofile・contentKind・role・purpose・MIMEの完全tupleを照合する。
  現在の「全PLY→point」「point以外→GLB」を廃し、partial GSをfallbackしない。
- `projectMetadata`: GS追加とProxy追加/変更/解除専用のtyped command。Sessionの既存
  stage→検証→prepared→publicationとdraft/retry ownerを使う。
- `modelFacts`/`ValidationContent`: introduced bodyがなくても必要なclass factを作る。
  複数recordは閉じたGS surface-equivalenceだけを許し、既存一般拒否を取り除かない。
  activeな投影は、Mesh/Point一つ、またはGS一つ＋任意のsame-GS Proxy一つに閉じる。
  別Assetの複数モデルやweak履歴にはこの制限を広げない。route-ownedの読み取り専用
  `MetadataModelFactPort.assertProvider`をplanningと既存Session.checkedへ接続し、
  初回受信・復元・prepared/cold retryの既存検査時点で同じ可否を確認する。
  汎用Core schema、journal/receipt、検査の書込権限は変更せず、port未指定経路は従来どおり。
- provider→UI/viewer: 単一Representation前提を、既存Mesh/PointとGS＋任意Proxyの閉じた
  typed descriptorにする。完全なsource boundsとcurrent generationを渡し、synthetic mapを製品portへ持ち込まない。
- viewer: 提供済みのsource/interaction資源だけをdecode/投影/raycastする。GS coordinatorと
  targetはviewport所有、body/recipe/receipt/FSは既存のcontent/Session所有。
  GSの動的読込は開発サーバーまたは`project-scene-validation`のcompile-time分岐内に閉じる。
  通常版・Spark harnessのbuild graphとService Worker precacheへ新adapter/GSLを含めない。

descriptorのGS branchに必要な値は`assetId/assetFrameId/bindingId/revisionId`、
`assetToProject`、GSの`representationId/payloadDigest/familyId/compatibilityId`、
`representationToAsset/sourceBoundsAsset/degree/count`、exact profileに結び付いたowned sourceと
その取消signal。任意Proxy branchは独立したid/payload/family/transform/boundsと検査済み
interaction geometryを持つ。viewerへProjectStore/MetadataSource/FS/ZIP/receiptは渡さない。
`WorkspaceSurface`/位置提案はGS branchの同じidentityを返し、Proxy locatorを返さない。
Source byte ownershipとlibrary候補は一つの準備leaseに閉じ、寿命終了後の再利用をしない。

package/wire/schema versionは変えない。Workspace/Contribution/backup/review/cleanは既存の
purpose closureを使用し、GS全source/必要なProxy/historyを保持する。Reviewのinteraction closure、
CleanのProxy family-ID変換も元の契約を使う。現在のGPU pagesを原本代わりに出力しない。
新profileを知らない旧アプリは安全に拒否/未対応表示とし、型を別物へ読み替えない。
cold prepared recoveryは記録済みbody/factsの検証だけを行い、受信元から補修しない。

## 8. 容量と残る大容量要件

最初の接続は既存validationの合計64MiB、および各inspectorの100,000items・
8,000,000scalarsに従う。SH4は**一つのGS本体あたり**89,887点まで。
Proxy/画像/他のGSも64MiBの選択/宣言/受信/復元/Review合計へ計上し、各検査のworkは各guardで
課金する。未実装のProject合計scalar予算をあるものと扱わない。同時decodeは共有gateで直列化する。
packageの大きいwire上限を
理由に検査・BlobStore・受信/復元・Reviewの上限を広げない。

次の容量工程はG1-Aのstream→stage→増分hash→検査→有界decode/upload→publishを通す。
encoded staging、decode scratch、CPU/GPU常駐、target、全可視AssetのLODを別予算で管理する。
大きいGSのLOD作成はdesktop/local toolingを評価し、iPhoneに全原本の変換を要求しない。
既存50万点は暫定端末試験条件のまま、性能や容量の保証を新設しない。

GSL1.4.3のRAD/SOGはSH3、raw PLYはSH4まで。SH4×pagingは未解決の独立したgateである。
本案は**SH3 previewへの無言の置換を採らない**。将来そのpreviewを許可する場合も、
元SH4・表示derivative・用途・戻し方を示す別の具体的判断が必要。本案の小型接続や
SH3 paged評価を、大規模SH4の完成・要件撤回と扱わない。

## 9. 検証と実装の順序

承認済みの範囲で次の順に一つのconnected workflowを完成し、helperごとのPO承認待ちを挟まない。

1. 新source/profile/goldenを検査器・content factsへ接続。既存profile/source receipts/IDsは不変。
2. GS追加とProxy追加/変更/解除、同じGS class、manual位置、provider/Reviewのtyped接続。
3. 新規production adapterでlinear targetとGSL residentを接続。library評価コードは移植しない。
4. 編集・五目的file・受信競合・中断復旧・再開まで接続し、独立review/最終check後に開発checkpoint。
5. G1-A/大容量・SH4 paging・実機/offlineの次の不足を進める。ordinary-entry/adoption/releaseは別gate。

source service testsは全次数、partial-band拒否、raw bits/ordinal保持、q/covariance/finite bounds、
SH4の偶奇/方向/反転を独立参照値で確認する。Proxy service testsはfact-only解除、他Asset/
変更GS/曖昧target拒否、stage失敗・exact retry・acknowledged body/fact非補修を確認する。
表示はnegative DC＋positive SH、負の最終RGB、HDR重なり、linear Mesh/Point混在depth、
異方性・Sim(3)/反転、微小splat/filter/culling、sort世代、実GPU loss/restoreを確認する。
GS前方/Point後方、その逆、hidden GSを同じ混在fixtureで確認し、fragmentと6px fallbackの
両方で可視性を証明するかambiguityを返す。unknownのまま位置を確定しない。

ブラウザは既存point/file/team/recovery試験を再利用し、代表的なSH4＋Proxy＋独立Meshの一つの
操作を保存・返送・Review/Clean・完全browser終了/再開へ通す。全fieldのfile roundtripを複製しない。
型/import guard、full Vitest、normal/harness/validation build、dependency audit、静的graph/CSP検査と
独立diff reviewを最終treeで実行する。physical iPhone、IME/zoom、HTTPS/offline等は別laneへ残す。

## 10. 根拠と現在の証拠

- [Graphdecoの固定SH0–4式](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/utils/sh_utils.py)、
  [PLY record/activation](https://github.com/graphdeco-inria/gaussian-splatting/blob/54c035f7834b564019656c3e3fcc3646292f727d/scene/gaussian_model.py)。
  数値/byte conventionsの参照であり、上流renderer実装をコピーしない。非商用/researchの
  license注意と別licenseのSH資料は旧preflight/固定manifestに保持する。
- [GSL正式版formats](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/docs/SplatFileType.md)、
  [renderer options/色](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/docs/GaussianSplatRenderer.md)、
  [loaded bboxの制約](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/docs/SplatMesh.md#bounding-box)。
- 承認前の追加限定評価は既存の検証設備と同じtarballを用い、製品/dependencyを変更せず実施。
  自作SH4入力でlinear RGBA16F＋一回IEC出力はgray127（参照128）、negative/HDR二層は
  `[83,109,238]`（独立参照と一致）、opaque前面は`[56,111,162]`（参照と一致）。
  encoded RGB2/alpha0.9の後景を黒/alpha0.9の前景で減衰すると`[178,178,178]`で参照と一致し、
  中間targetの1を超える値を最終合成まで保持する。
  中心X=1.3のsplatが画面端を覆う例は既定clip1.25でRGB0、clip4でRGB181。
  sourceを変えず、見えている端を中心位置だけで落とさない設定を確認した。
  direct canvas診断はgray91で、この方式を製品へ採らない根拠となった。
  これは小型WebGL2/local Chromiumの色/depth観測であり、一般画質・device/性能・adoption証拠ではない。
  同じ設備で共有workerの寿命を観測し、各owned sort workerはdispose後に終了、最後の
  shared decoder一つは約180秒idle後に終了した。小型1回の観測であり、繰返し取消や
  large-heap時の総予算を通した証拠ではない。
  exact run/build/hashesと失敗はignored `.artifacts/e2e/gs-spec-01c/`へ保持し、todoが現在結果を管理する。

## 11. 正確なcompanion表と承認境界

CompanionはUTF-8/LF/no BOM/最終LF一つ。SHA-256は自己digestを含まない正確なbytesを対象とする。
sourceとdisplayは別ID・別goldenで結び、既存候補のID/hashを再解釈しない。
POは2026-10-27に以下の数値・goldenと限定依存／接続を承認した。これらのJSON内の
proposal時点のscope説明も含めてbytesは保持し、実機認定や一般adoptionへ読み替えない。
提案のsource/numerical、renderer/lifetime、typed Session/Proxy/UI/fileは独立read-only
レビュー済み。実装のコード・実行証拠・最終diff reviewは[todo](../../tasks/todo.md)が管理する。
依存と通知配布は[固定依存記録](../dependencies/gaussian-splat-lite-1.4.3.md)を参照する。

| ID / 役割 | 正確なcompanion | SHA-256 |
|---|---|---|
| `development-validation-gs-ply-f32le-sh0-4-1` | [source profile](profiles/gs-ply-f32le-sh0-4-1.profile.json) | `e298cbb7b7202229ddfe4c834328854fc610109ccf38dbeb6a3f8d9d50954bee` |
| source数学/byte vectors | [source goldens](profiles/gs-ply-f32le-sh0-4-1.goldens.json) | `7f975a183d3092b8c52069e5d2d440839a498369f30b85a0e3e7c9417cb5ebd5` |
| `lociview-gs-gsl-webgl2-packed-linear-1` | [display policy](profiles/gs-gsl-webgl2-packed-linear-1.profile.json) | `e71f81ab372669f087ba7c1fde5ce56526ee0e2ac1179d33582f4905cf0e28cd` |
| displayの閉じた参照値/必須受入 | [display goldens](profiles/gs-gsl-webgl2-packed-linear-1.goldens.json) | `4c72c058724af1330c3fb4e2b90f3dcffabd4ffdb21af3af6d81b04a8ba093cf` |

停止条件はsource保持、frame/color/support、typed authority、facts/receipt/publication、資源寿命を
既存契約と両立できない場合。assert/上限を緩めたりSH3へ下げて通したりせず、影響する箇所だけ
を止めて具体案へ戻る。通常の実装順序・関連test/fixは本案承認後の同じ権限に含める。
