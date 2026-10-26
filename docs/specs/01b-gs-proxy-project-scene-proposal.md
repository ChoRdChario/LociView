# 01b: Point / GS rendering requirements reassessment

> Status: **PROPOSED REQUIREMENTS / APPROVED LIMITED QUALIFICATION / NO PRODUCTION GS / NOT ADOPTED**
> Reassessed: 2026-10-27, at the PO's request after checking SH4 support.
> PO approved **only §6 limited GSL1.4.3 / Three0.186.0 qualification** on2026-10-27.
> Other new source/presentation requirements remain proposals; this is not adoption.
> This replaces the unapproved SH3-only CPU/screen proposal at35c0a4d.
> [Superseded draft and exact candidate JSON](../history/gs-proxy-draft-2026-10-27/README.md)
> remain evidence, not active profiles or an outstanding request to approve that draft.

## 1. 利用者の結果と見直しの結論

点群またはGSを開く → 形と色を確認しながら視点を動かす → 記録位置を指定・調整する
→ 本文・画像を編集する → 保存・受け渡し・復元・再開、を一つの流れとして完成させる。
利用者に描画エンジン、SH次数、内部ファイルの役割を選ばせない。

前案の「SH3限定・10万点・毎視点更新で全点をCPU計算する専用描画」は推奨を撤回する。
小さな入力で計算を定義できても、既存の段階読込・50万点検証へつながらず、通常の
視点移動でモデル全体が表示不可になる設計だった。数式検証は実用性の証明ではない。

見直し案は次のとおり。

- 通常点群とGSを区別する。GSはSH0〜4の完全な元データを扱う要件で評価し、
  通常点群の点描画やDC色だけの表示でGS対応を代用しない。
- GSの実用描画はGPUでの投影・SH評価と、GPUまたは非同期workerでの整列を基本候補とする。
  段階読込・表示量の調整・資源解放を機能要件に戻す。独自の全点CPU描画は参照計算に留める。
- 原本と保存座標は保持する。表示専用の量子化・LOD・画質調整は別に管理し、
  表示用の番号や近似位置を保存済みピンの根拠にしない。
- 画面の描画倍率や負荷へ適応し、通常の視点移動で全体を消さない。
  読込・低画質表示・失敗・再試行を必要な場面で伝え、設定項目を増やして回避させない。
- 最初の再評価候補はGaussian-Splat-Lite正式1.4.3。Spark正式2.4.0とPlayCanvasも比較する。
  SH4だけで採用せず、既存Threeとの互換性、座標・色・混在描画、offline、資源寿命を検証する。

§6で承認済みの限定評価を除き、これは要件と評価方針の提案である。新しい数値保証、
FormatProfile、変換規則、追加の依存、renderer採用、通常homeへの接続は承認していない。

## 2. 維持する契約と今回の変更範囲

[00](00-product-contract.md)、[01 §§2–4,8,10–12](01-domain-rendering.md)、
[03 §5](03-gates-and-delivery.md#5-g1-b--renderer-bakeoff)、
[ADR-0001](../adr/0001-v2-foundation.md)の原本保持、frame、段階読込、混在描画、
同一Assetの明示Proxy、端末・offline・採用ゲートは維持する。
[05](05-project-scene-team-workflow.md)のtyped Session commandと
[06](06-project-package-wire.md)の目的別closure・検証・復旧・公開境界も変えない。

実装済み[01a](01a-point-project-scene-proposal.md)の6個の承認済みJSONは変更しない。
そのASCII XYZ/RGB、source順序、Float32中心、照明なしのRGB、CSS点径、可視性に基づく
選択・6CSSpx近傍、source-centreとmanual座標の区別は保持する。現行DPR1/2の限定実装は
そのまま有効であり、今回の文書だけで任意DPR・大規模点群対応にはならない。

GSLは03のSpark/Three対PlayCanvasの正式採用比較に対し、**§6の限定評価だけを承認された
追加候補**。03の2026-10-27 amendmentがその範囲を記録する。既存の停止条件、
profile・production権限は自動では広がらず、旧01bの「非既定production接続の例外」も
引き継がない。正式採用比較と限定資格評価を区別する。

## 3. 点群描画に求める結果

| 項目 | 見直し後の要求案 | 実装・受入で確認すること |
|---|---|---|
| 通常点群 | 01aの見た目・選択・座標を維持し、将来のGPU/段階表示へ接続できる境界にする | 点径と選択が同じRenderPlan・有効描画倍率を使用。表示順/LOD番号をsource ordinalへ転用しない |
| GS入力 | Graphdeco型PLYのSH0〜4を評価対象にする。次数を完全な属性集合・型・係数数から判定する | 正常な低次数と壊れた高次数を区別。不足した係数をゼロ補完したり拡張子だけで認定しない。正確な許可schema/ID/goldenは実装前に確定 |
| GS表示 | 異方性、opacity、view-dependent SHと元の座標規約を保つ | 既知producer/参照画像に対する方向別の色、covariance、透明度、画面footprint。独自の上限clampやgammaを無検証で標準化しない |
| 表示精度 | 原本の正確さと、表示専用の量子化誤差を分ける | source順序・全係数は保持。display derivativeのprofile、変換元、誤差・goldenを記録。毎フレームの全計算をFloat64に固定しない |
| 座標・視点 | 正の一様scale、回転、平行移動、規定の反転を扱い、保存したframeと視点を維持 | centresだけでなく形状とSH方向も変換。遠方原点は必要ならcamera-relative計算。物理単位不明をメートルと推測しない |
| 操作感 | 視点操作をブロックせず、最新視点へ追随する。負荷時も支持できる表示を残す | 有効render scale、LOD、描画点数を予算内で調整。古いsort/decode結果を世代で破棄。通常panだけでwhole-Asset Unsupportedへ遷移させない |
| 中断と再開 | 読込の進捗・取消・再試行、失敗時の理由と回復手段を提供する | quota、decode失敗、context loss、切替・再読込で部分資源を残さない。独立するMesh/点群/Caption/画像を使い続けられる |
| 位置指定 | GSには同じAssetの明示的な非表示Proxyを使用し、通常gizmoで調整・確定する | 保存するのはGSのAssetFrameのsource-less manual座標。Proxy交換/不在やLOD変更で既存ピンを動かさない |
| 混在 | 選んだ可視Assetだけを位置指定対象にする。opaque MeshとGSの既定混在を保つ | 無関係なMeshをProxy代用にしない。Proxyを色・depth・fitへ入れない。隠れた点への誤配置を防ぐ。高度な透明交差は後続ゲート |
| 保存・受渡し | 元データと目的別closureを保存し、再開後も同じ編集結果を再現する | Workspace/backup/cleanの必要な完全sourceを現在のGPUページから作らない。Reviewの省略・表示用データは既存目的契約で判断する |

SH4は25基底/75色係数、SH3は16基底/48色係数。`SPZ v4`というファイル版番号は
SH4対応を意味しない。PLY/SPZ/SOG/RADが同じ次数・精度・段階読込を持つとも限らない。
特定形式の対応は新しい明示profileと証拠が揃った範囲でだけ名乗る。
直接GSへのraycastやProxy生成は最初の要件に追加しない。ライブラリのhit indexは
現在の表示ページの番号である可能性があり、永続source IDの根拠にはならない。

## 4. 容量と段階読込を再設計する理由

現行validationの64MiBは初回選択時の合計にも適用され、選択bodyは全体を読み込む。
追加時にも既存bodyとの合計や消費側の上限があり、packageの大きいwire上限だけでは
入力・decode容量は広がらない。100,000itemsと8,000,000属性scalarsも別の制約である。
これらは現行限定経路の安全上限として維持し、製品容量の要求にはしない。

Graphdeco型で3個のnormalも含むFloat32 PLY payloadを仮定すると、基底数K=(L+1)^2、
属性数=3K+14、stride=4(3K+14)bytesとなる。headerやdecode中のコピーは別途必要。

| 次数L | SH rest属性数 | 全属性数 | bytes/点 | 50万点payload |
|---|---:|---:|---:|---:|
| 0 | 0 | 17 | 68 | 34,000,000 |
| 1 | 9 | 26 | 104 | 52,000,000 |
| 2 | 24 | 41 | 164 | 82,000,000 |
| 3 | 45 | 62 | 248 | 124,000,000 |
| 4 | 72 | 89 | 356 | 178,000,000 |

SH4では8M属性制約だけでも89,887点までとなる。現行上限を単に引き上げる方法では、
既存03の50万点検証へ安全に進めない。50万点は既存の暫定端末試験条件であり、新たな
動作保証ではない。単一ファイルの小型接続だけでGS workflow完成とも数えない。

GSの実用経路では、既存01 §10に従い、stream/stage/増分hash/decode/uploadへbackpressureを
かける。encoded staging、decode作業、CPU常駐、GPU常駐、描画targetを別予算とし、
可視GS全体のLODを管理する。新しい容量・画質・時間の閾値は実測後に承認する。
大規模原本のLOD作成はdesktop/local toolingを評価し、iOSに全体変換を要求しない。

原本、provenance付き表示derivative、一時的なRenderPlan、出力目的のclosureを区別する。
原本の全SHを保持していても、表示がSH3ならSH4再現とは呼ばない。
特にGSL1.4.3のRAD/SOGはSH3までであり、**SH4完全表示と大規模paged表示を同時に
満たす経路は未確認**。元SH4を保ってSH3 previewを許す製品判断、SH4用の別paged形式、
ライブラリの追加対応のいずれかを、証拠と新profileなしに暗黙採用しない。

## 5. 正式公開版での再比較

以下は2026-10-27に固定commitの一次資料を確認した静的比較。
インストール、性能測定、offline/PWA、実機、LociViewへの統合を実施した結果ではない。
ライブラリの機能が存在しても、LociViewの対応・採用済みを意味しない。

| 候補と固定版 | 確認した対応 | LociViewで残る判断・検証 |
|---|---|---|
| Gaussian-Splat-Lite1.4.3 / `d8703f7` | PLY/SPZ SH0〜4。RAD/SOGはSH3。WebGPUで投影・cull・sort、WebGL2 fallbackはGPU評価＋非同期WASM worker sort。paged RAD/SOG、ローカルbytes/resolver | Three>=0.186.0のため現行0.180.0からの更新が必要。SH4×LODの未充足、量子化・色・反転、mixed depth、WebGL2実機・資源寿命・local WASM/worker配布を検証。Apache-2.0と第三者noticeを審査 |
| Spark2.4.0 / `ffe210d` | Three>=0.180.0。PLY/SPZ/SOG/RADほか、paged LoD。GPU評価＋worker sort。新しいSPZ版を読めてもSH上限は3 | 現行2.1.0より新しい修正を含むため再比較価値あり。ただしSH4全係数の描画要求には未到達。MIT。旧2.1.0の結果だけで新版を棄却しない |
| PlayCanvas Engine2.23.3 / `b7655d8` | PLY/SOG、paged SOG、SPZ v4 parser。WebGPU GPU sort/WebGL2 worker sort。SH上限3、SPZのdegree4追加bandは無視 | Three差替えだけでは済まず別engine adapterが必要。SH4のままの再現は未充足。SPZ用ZSTD WASM等のローカル配布も必要。MIT |

GSLの**正式1.4.3 tag**を比較単位にする。同じpackage版を表示していても、mainの
Unreleased API変更を混ぜない。正式版の`maxSh`制限を、未公開版のdecode/storage動作と
混同しない。各候補の圧縮・Float16等は表示精度の評価対象であり、原本保持の代替ではない。

再評価時のnpm registry照会はDNS解決に失敗したが、承認後の許可された照会・取得で解消。
正式tarballの`gitHead`は固定commitと一致し、registryのSHA-512 integrityとも照合済み。
これは配布物の照合であり、再現buildや全コードのsecurity監査を意味しない。
Node要件は`^20.19.0 || >=22.12.0`。source上はWASM/workerを同梱する構成だが、
実際のnpm artifact、LociViewのbundle/CSP、cold offline動作は別途検証する。

一次資料（固定commit）：

- GSL: [formats / SH / streaming](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/docs/SplatFileType.md)、[Three peer](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/package.json#L89)、[renderer](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/src/rendering/GaussianSplatRenderer.js)、[RAD budgets](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/docs/RadStreamScheduler.md)、[license](https://github.com/WilliamLiu-1997/Gaussian-Splat-Lite/blob/d8703f7aed0e966e808a3fd3a2e1def3179d90dc/LICENSE)。
- Spark: [2.4.0 release](https://github.com/sparkjsdev/spark/releases/tag/v2.4.0)、[SH cap](https://github.com/sparkjsdev/spark/blob/ffe210dc0a45d0515a06c9235878108112827d61/src/PackedSplats.ts#L127)、[package](https://github.com/sparkjsdev/spark/blob/ffe210dc0a45d0515a06c9235878108112827d61/package.json)。
- PlayCanvas: [package](https://github.com/playcanvas/engine/blob/b7655d8fccc1284678af8f098b26b0725e20dd3a/package.json)、[SPZ SH cap](https://github.com/playcanvas/engine/blob/b7655d8fccc1284678af8f098b26b0725e20dd3a/scripts/esm/parsers/spz-parser.mjs#L268)、[sort/LOD parameters](https://github.com/playcanvas/engine/blob/b7655d8fccc1284678af8f098b26b0725e20dd3a/src/scene/gsplat-unified/gsplat-params.js)。

## 6. 次工程と承認境界

推奨する次の単位は、**GSL正式1.4.3とThree/@types0.186.0の互換性・描画要件評価**。
これは恒久renderer採用やGS production統合ではなく、具体的な不足を判定する限定作業とする。
新依存とThree更新、03の評価候補・作業範囲の変更を含む以下の限定評価は、
2026-10-27にPO承認済み。実施状況・配布物の照合・結果はtasks/todoを正とする。
承認は正確なprofileやproduction実装へ拡張しない。

1. 新依存を固定し、license/第三者notice・lockfile・npm auditを確認する。Three更新は
   GS feature実装と分離し、既存Mesh/Point/Native/旧harnessの互換性・entry隔離を検証する。
   問題があれば元の動作経路を保持して評価を止め、範囲を広げて修復し続けない。
2. 既存isolated検証設備で、SH0/3/4の方向別色、異方性、Sim(3)/反転、Mesh depth、
   Proxy→調整→manual座標の不変性、取消・解放・context restore、外部要求なしを確認する。
   必要な一時評価コードをproductionへそのまま昇格しない。公配布fixtureは追加しない。
3. SH4通常読込とpaged SH3を別々に測定し、入力/作業/CPU/GPU/targetの上限と劣化を記録する。
   SH4×pagingが未充足ならそれを明示し、SH3への無言変換、上限の無検証拡大、別方式の
   追加実装で通したことにしない。新しい画質fallbackやsource/derivative profileは別途確定する。
4. 既存受入項目へ証拠を対応付けて独立レビューし、採用候補として継続/棄却/再試行を報告する。
   その後、正確なprofile/golden・typed portsと必要な限定production権限を確定し、
   GS/Proxy追加から編集・五目的file・復元・cold再開まで一つの実装単位で完成させる。

Physical iPhone、HTTPS/offline/PWA、通常home、S1/S2/TEAM-FLOW-01、一般renderer採用と
releaseの未充足は残す。ローカルChromiumの結果でそれらを合格扱いしない。
細かな操作ごとのPO確認や、POのテスト待ちを通常の開発依存に戻さない。

## 7. 限定評価の観測と残る境界（2026-10-27）

判定は**候補として継続、production接続と製品側Three更新は保留**。
評価用に導入した正式GSL1.4.3とThree/types0.186.0を、既存Vite・専用Chromiumで
隔離評価した。通常homeやProjectScene Sessionへは接続していない。
自作入力・評価コード・全失敗・実行build・結果はignored local artifactsに保持する。
新しい公開fixtureやsource profile、既存profileの解釈変更はない。

| 評価 | 実行して確認した範囲 | 残る制約 |
|---|---|---|
| 配布物・license・audit | 公式tarball4,612,987bytesのSHA-512とgitHeadを照合。Apache-2.0、NOTICE、MIT/zlib等の第三者通知を確認。audit追加前後とも10件（low1/moderate2/high5/critical2）、新しい指摘なし | auditの既存指摘は解消していない。正式配布・採用のlicense/security gate合格ではない |
| Three互換性 | 0.186で型検査後、117suiteの既存テストを実行。115suite/2,717件PASS、2suite/32件FAIL、21既存TODO。28件は材質変換の0.180固定guard、4件はGPUをmockした視点操作テスト | 型検査には評価時だけtexture imageのunknownを絞るテスト修正が必要だった。全体評価は未合格、後続の3buildは未実行。guardや承認済みprofileを緩和しない |
| SH0/3/4 | 独立したY30/Y40の符号と一致する実pixel。SH3緑55→26、SH4赤55→103、斜め方向の赤46。xに奇なY41を持つ別入力では反転で赤32→62 | `encodeLinear:true`のcanvas 8bit readPixels値。全producer・全色域・画質profileの認定ではない |
| 形状・配置・遮蔽 | 異方性の向き、反転、opaque Meshの前後depth。平行移動後の重心、1.4倍時の面積比1.9413（期待1.96）、回転差0.29890rad（期待0.3）を確認 | 小さいowned入力、WebGL2、固定の視点・変換での観測。一般transform誤差保証ではない |
| Proxy/manual | 明示Proxy hitをAssetFrameへ戻し、調整後manual座標の行列往復を確認 | 評価用Three上の計算であり、Session・実際のgizmo・file保存・再開の新GS統合証拠ではない |
| 取消・解放 | RAD初期化取消はAbortError、再読込・表示・除去が成立。20回unload後のThree texture数は5,7,7,…でウォーム後安定、geometry数は2 | 全worker/CPU/GPUメモリや過渡peakの無漏洩保証ではない |
| context復旧 | 旧資源をlossイベント中に破棄し、restore後にGS renderer/modelを再作成すれば表示が戻りGLerror0 | 同じ資源の自動復帰はlit0/GLerror1282で失敗。restore後に旧資源を破棄する手順も失敗。将来adapterは正しい世代管理と再作成を実装する必要がある |
| 段階読込SH3 | 50万点のowned原本124,001,531bytesから15chunkのRADを作成。視点移動で要求5→8、常駐chunk5、描画14,107→17,768。観測時のCPU cache41,821,460bytes/GPU cache31,637,520bytesは設定64/32MiB内 | 原本50万点を同時描画した証拠ではない。別報告のWASM peakは71,237,632bytes。cache予算は総CPU上限ではなく、2snapshotから総メモリや過渡予算を保証しない。固定待機込みの経過時間を初回preview latencyへ流用しない |

SH4とpaged LODは依然別の経路。WebGPU、物理iPhone、cold offline/PWA、フルGS編集・
五目的file・復旧、G1-Bは未検証または未実装であり、今回のPASSを移さない。
ブラウザのaggregateにはraw context復旧の失敗が残り、その後のfocusedな復旧・変換・
multi-page PASSをaggregate全合格へ付け替えない。初回SH3 probeの符号誤りは
camera-to-mean方向の一次式で独立確認して修正し、失敗を保持した。

製品へのThree一括更新には、[07a](07a-native-appearance-conversion-proposal.md)と
[07d](07d-jpeg-project-scene-proposal.md)が固定する0.180.0 GLTFLoader association proofとの
契約不一致がある。既存ID/digestやprofile文言を0.186へ書き換えて解決してはいけない。
製品のpackage/lock・build設定・一時テスト修正を元のbytesに戻し、npm ciで実依存も
0.180.0へ復元済み。復元後の型検査と、候補で失敗した32件はすべてPASSした。
これは復元のfocused確認であり、0.186全体評価の成功や全0.180 suite再実行ではない。
評価と既存製品を分け、影響する更新だけを止める。次はこの互換境界と、SH4/source・
display derivativeの正確なprofile、context再作成を含むtyped adapter案を確定し、
必要な互換性・production権限を独立レビューのうえ判断する。
