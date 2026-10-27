# 07j: Preserve legacy material proofs while moving display to Three 0.186

> Status: **PO APPROVED 2026-10-27 / IMPLEMENTATION IN PROGRESS / NOT ADOPTED**
> Prepared 2026-10-27 after the [01b §7 qualification](01b-gs-proxy-project-scene-proposal.md#7-限定評価の観測と残る境界2026-10-27).
> This is one compatibility decision. It does not approve GS profiles or GS production integration.

## 1. 利用者の結果と求める承認

既存のProjectや材質付きの旧ファイルを開く → 同じ面の材質を編集する → 保存・受け渡し
→ 別環境や再起動後に続ける、という現在の操作を維持し、表示側をThree0.186.0へ進める。
利用者に移行操作、描画エンジン、Threeの版を選ばせない。開くだけで履歴を更新しない。

実際の0.180.0による原本検査・材質対応の証明を残し、その資源を解放してから、同じ
原本を0.186.0で表示する案とする。両者が渡すのはコピーした索引・数値・照合値だけ。
画面のrendererは一つで、二つの版の3Dオブジェクトは混ぜない。

承認対象は、この閉じた互換adapter、固定依存の追加・更新、必要な通常／Native／検証
経路のThree移行、および下記の既存workflow検証。新GS入力、色・LODの品質方針、
source profile、GSL production、通常ProjectScene入口、公開・releaseは含めない。
2026-10-27にPOがこの範囲の実装を承認済み。実施・検証の現在値はtasks/todoを正とする。

## 2. 維持する契約と新しい境界

[07a](07a-native-appearance-conversion-proposal.md)と
[07d](07d-jpeg-project-scene-proposal.md)は、0.180.0 GLTFLoaderの構築・association・
全単射証明を既存profileへ固定している。0.186へ一括更新した前回評価は、既存117suiteの
うち2suite/32件が失敗した。28件はこの保護による拒否、4件はmock viewportの操作テスト。
0.180.0へ復元後、該当32件はすべて成功している。guardを削って通す案は採らない。

承認後は、**0.180の実証明を置き換えず、その後に独立検証済みの0.186表示を追加する**
互換性companionとなる。既存profile本文・ID・digest、全recipe/ID生成、Native/v1の
receipt・private witness・初期changes・後続編集・原本・Caption座標は変更しない。
新しいwire、Project record、永続cache、migration flagやprofile IDを作らない。
既存[05](05-project-scene-team-workflow.md)のSession／provider境界と
[06](06-project-package-wire.md)の五目的file／検証／復旧／publication fenceを維持する。

旧profileの証明を省略する、0.186で代用する、旧材質の意味や対応先を変える必要が出たら、
このcompanionの範囲を超える。その実装だけ止め、新profile／recipe判断へ戻す。

## 3. 固定依存とimport境界

| 用途 | 提案する固定依存 |
|---|---|
| 主表示・既存UI/viewer | `three: 0.186.0`、`@types/three: 0.186.0` |
| 閉じた旧検査・proof | `three-compat-180: npm:three@0.180.0` |
| そのprivate型 | `@types/three-compat-180: npm:@types/three@0.180.0` |

名前は同じ上流packageを固定版で分離するnpm aliasであり、fork／CDN／別配布元ではない。
[npmのalias構文](https://docs.npmjs.com/cli/v11/using-npm/package-spec/#aliases)を用いる。
packageとlockのresolved URL・integrity・licenseを照合し、変更前後のnpm auditを比較する。
既存の監査指摘を修復済みとは扱わず、無関係なupgradeやaudit fixを混ぜない。
GSL1.4.3は引き続き限定評価候補であり、今回のroot runtime依存には追加しない。

0.180 aliasをimportできるのは、privateな`viewer/compat180`の旧model parse／cleanupと、
`projectFiles`内のproof／旧GLB検査mathだけ。low-level側はowned model入力を扱い、
Project record・package・storage・UIを知らない。既存loader処理の必要な分離に留め、
新しい汎用loader frameworkを作らない。
GLTFLoaderと補助module内部のbare `three`も実際に0.180へ解決されることを確認する。
Nodeの[self-reference](https://nodejs.org/api/packages.html#self-referencing-a-package-using-its-name)
だけからVite・型・worker・buildの解決を推測しない。実際のmodule graphと実行constructor
を確認し、0.186へfall throughしたproofは拒否する。全体の`three`を0.180へredirectしない。

主viewer／UI／ordinary loaderは0.186を使用する。private境界からはThreeの型・instanceを
exportしない。別版のinstanceofを通すcast、prototype付替え、共用sceneへの投入は禁止。
`core`／domainはversioned engineやUIをimportせず、既存のimport検査も更新して実行する。

## 4. 0.180 proof capsule

原本の許可範囲・検査順を広げない。`glb.ts`が計算するdecompose/recompose、world行列、
boundsもimmutable recordやrecipeに入るため、旧GLB検査のmathは実際の0.180へ固定する。
Floatやepsilon、selected-scene、未使用内容の検査、PNG/JPEGのorientationとdecode規則、
外部URI拒否、source material semantics、原本digestを変えない。

private portは、所有するValidatedGlb入力を受け、以下を行う。

1. 最初のawait前に元bytesとbounds/materials/ranges/全occurrences/profile/refを所有する。
   二つのdecodeは同じ不変のowned入力とdigest/profileの組へ閉じる。途中でcallerの配列や
   Project stateを読み直さず、UIの文字列mapやstorageをauthorityにしない。
2. 実0.180 GLTFLoader、linear-sRGB working space、既存association／全単射／count／bounds
   検査、occurrenceごとのcloneを実行する。guardとUnsupported条件は維持する。
3. 下記のneutral proofを作る。全selected-scene occurrencesを含め、overrideがある面だけ
   へ絞らない。重複キーや共有材質の出現数をfirst/last-winsにせず保持する。
4. success/error/cancelのいずれでも0.180のroot、geometry、material、texture、ImageBitmap、
   parser associationと未使用sceneを解放する。閉じた後の画像完了もcloseする。
   全解放を終えてからproofを返し、その後に0.186 decodeを始める。並列にしない。

`viewer/loaders.ts`の共用disposerは主Threeのinstanceofを使うため、旧instanceへ呼ばない。
0.180-awareな収集・重複排除・close-onceまでcapsuleが所有する。解放失敗を成功として隠さず、
186 parseへ進まない。取消は新しい世代への採用を止め、遅延完了も解放する。

### Neutral proofの内容と寿命

これは一回のchecked準備のprivateな結果であり、新しい保存schemaではない。
opaque owner／世代に結び付け、任意JSONを渡して0.180の実行を省略できるportにしない。

- 元GLBのdigest、正確なprofile ref、選択scene、検証済みbounds／surface ranges。
- 各面の`nodeIndex`、`primitiveIndex`、`materialIndex|null`、`slotIndex`、`materialArraySlot:0`。
- 実0.180の`childPath`と実名／`#childIndex`から作ったlegacy key。Nativeとv1の規則を
  区別する（空pathのNativeは`m/root/0`、frozen-v1は`m//0`）。生JSON名や186名へ置換しない。
- 186表示照合用の有限なsource/world行列、geometry/material/textureのcanonical照合値。
  engine object、Bitmap、型付き配列の可変view、objectをkeyとするMapは越境しない。

Native変換は今と同じplain childPath witnessを使う。frozen-v1の旧key生成はcapsule内へ
移すが、曖昧keyと共有materialの拒否は変えない。LociMyuの材質名対応はraw admitted GLB
JSON由来の既存規則を保持する。186のtraversal／名前／childPathから旧receiptを作り直さない。

### 通常v1／Nativeの既存材質キーも同じく守る

主Three更新は、ProjectScene以外の表示と旧形式converterにも影響する。
Native viewerのnumeric childPath keyと、通常v1の表示名／`#childIndex` path keyは、
現在の表示ツリーから生成される。ProjectSceneの180 proofだけでこれらの互換性を推定しない。

それらの旧経路も、元の許可済みsource closureとその経路の既存loader optionsに対し、
実180の旧loaderで完全なordered target-address tableを取得するprivate portを使う。
コピーするのは実childPath／name segments／slot／旧keyと、対象geometry・world行列・
materialの照合値だけ。新しいsource形式・外部参照を許可せず、現在のtexture-skip等の
converter設定と、重複キー・同名材質のbroadcast／曖昧性の扱いも経路ごとに保持する。

通常／Nativeの186表示が作る完全なtarget tableを、同じ元closureに結び付けて照合する。
旧keyの文字列、対象source occurrence（提供される形式では元locator）、slot、形状・
配置・材質が一致してから、保存済み設定の適用・新しい材質keyの編集を許可する。
旧geometryだけで別keyを探す、名前の近似一致、186 keyへの書換えはしない。全entryと
重複集合を比較し、fixture数個の成功だけで任意入力の同等性を推定しない。

`nativeGs/frozenV1Conversion.ts`と`nativeGs/locimyuConversion.ts`がordinary loaderで
求める旧material targetも、実180からのneutral結果を消費する。現在の許可形式・
Native root key・v1 root key・trimmed material-name規則を統合しない。
旧ObjectsをNative viewer／converterへ返す抜け道は作らない。

この照合を現在の経路の許可入力で成立させられなければ、主Three更新を有効化しない。
影響する経路を黙って対応外にしたり、二つのrendererを動かす方式へ変更しない。

## 5. 0.186のchecked表示

同じ原本を0.186 GLTFLoaderでdecodeし、実associationからsource `(nodeIndex,primitiveIndex)`
を復元する。sourceのordinal slotへ全単射で対応させ、材質をoccurrenceごとにcloneする。
186のnode pathが違っても旧witnessを変えない。旧instanceをclone／流用しない。

照合はbounds/countだけで済ませず、次の値を固定順で照合する。

- source pair、materialIndex／implicit material、slotIndex、triangles、source頂点／index順。
- 有効geometry属性の名前・成分型・normalized・itemSize・countと、意味上の成分列。
  interleaved bufferの内部配置や未使用buffer全体のdigestを同一性の代わりにしない。
- 同じsource pairに属するdecoded world行列。境界内比較のため既存行列許容を広げない。
- source material意味と対応する実base値・role、linear colors、opacity／alpha／side、
  metallic／roughness／emissive、normal／occlusion設定、使用textureのsource image参照、
  UV channel・sampler・変換・decode options。元のPNG/JPEG許可範囲のまま確認する。

geometry照合値は既存の有限値・仕事量上限下で成分を順に検査し、必要なら既存の増分hashを
使う。元ファイル／全geometryをもう一つの巨大なJSONや配列へ複製しない。実装時の正確な
private encodingは同じ比較両端で固定し、永続profile／recipeのdigestへ流用しない。
差異を隠す属性削除、材質既定値への置換、新しいepsilonや画像差許容の自己承認はしない。

一致後だけ、0.186のrootと材質locator mapをresidentへ渡す。このrender resultのpath情報と、
旧変換用proofのpath情報は型もportも分離する。ProjectScene adapterは`projectFiles`のowned検証と
`harness/projectScene/validationRender.ts`の表示側で閉じる。通常／Native側は上記private
target-proof portを使い、どの経路でもSession／coreへengineを漏らさない。
Native／frozen-v1 source準備とrecoveryはneutral proofだけを消費する。

[07a](07a-native-appearance-conversion-proposal.md)の色量子化式も維持する。旧変換の値を
186 Color APIで再解釈しない。既存表のboundary vectorsと出力bytesを照合する。

## 6. 通常操作・取消・保存・資源

UIのファイル入口、材質panel、処理中表示、再試行を使い、一つのモデル準備として扱う。
Proof版／表示版の選択や二段階の確認を追加しない。取消・stale generation・decode不一致では
部分rootや材質変更を採用しない。既存Project／原本／証拠を保持し、失敗を保存成功にしない。
一つの表示不可で無関係なAsset・Caption・画像を無効化しない。

binaryは引き続きWorkspaceFS／asset/package helper、編集は現行Session command、factsは
現行verifierのauthorityを使う。受信・復元の旧receiptを「直す」ための補完を追加しない。
元source／profileが不一致ならpublicationやrecoveryの停止条件をそのまま適用する。

新proofは表示準備と、従来proofを必要としていた旧変換準備にだけ置く。通常の本文編集、
metadata-only保存／受渡しに二重decodeを追加しない。既存のverified readの寿命を超えた
再利用や永続proof cacheを作らない。既存の入力・作業・画像・memory上限を引き上げない。
追加decodeの時間とpeakメモリは既存計測で確認し、遅くならないという保証は置かない。

0.186側のcontext喪失では、そのrendererが所有する資源をloss中に破棄し、restore後に
現在の有効な世代のowned入力から作り直す。元の記録・providerを変更しない。01bのGSL
再作成PASSをこのGLB経路の実行証拠へ転用せず、変更した経路自身を確認する。

## 7. 一つのworkflowとしての受入

承認後は同じ実装単位で、調査→実装→以下の検証→独立diff reviewまで完了する。
helperごとにPOテストや追加承認を要求しない。

1. **旧bytes／authority** — 既存profile・recipe・ID・原本・private receipt・初期changes・
   履歴・Caption座標が同一。0.180の実constructorと内部imports、旧GLB math、全slot／旧名
   拒否規則を実行する。既存projectFiles試験のgoldenと復旧・反証ケースを維持する。
2. **越境・fault** — 0.180 objectが戻らず、186 parse前に旧cleanup完了。alias内部の
   loader/helperが186を参照すれば失敗。mutated source、異なるdigest/profile、missing／
   duplicate pair、誤材質、形状・UV不一致、遅延image、取消と新世代切替を現行service試験で確認。
3. **既存操作** — 07a/07d/07iの材質付き旧入力→変換／既存Projectを開く→正しい面だけを
   編集→named backup保存・照合→Workspace／Contribution返送→別のbrowser環境・cold再開。
   原本、必要な元履歴、後続編集を照合する。加えて既存Native／通常v1の材質付きファイルを
   Nativeは直接再開・編集・保存し、通常v1は§7.1の既存閲覧専用権限で直接開く・表示・
   復旧を確認する。旧target tableと保存keyが同じ対象を指し、通常v1の原本／logは不変。
   Native側の旧v1/LociMyu converterの材質address・同名／曖昧性試験も再利用する。
   ProjectSceneの変換成功を、それらの別routeの証拠へ転用しない。
   既存file flowを再利用し、全fieldへ複製しない。
4. **描画・操作** — 実canvasで既存の材質・画像・陰影・両面・対応する切抜きと面の選択を
   確認。代表的な複数occurrence／implicit材質／共有元材質、Meshと01a point、視点・
   Orbit／gizmoを確認する。mock4件はmock契約を新APIへ合わせ、assertを緩めず実画面でも検証。
   現行Native/Spark2.1.0も既存の小型入力で実GS pixel、visibility、選択、unload/reloadを
   代表smokeとして確認する。GSLの186評価やcache/build成功で代用せず、新GS対応のcreditにも
   しない。失敗する既存経路を対応から外して主Three更新を通さない。
5. **寿命・費用** — switch/unload/context restoreで資源を解放。既存計測へinspection、180
   proof、cleanup、186 decode／照合、attachの段階を記録する。call countはelapsed保証にしない。
   metadata編集・保存へdecodeが追加されないことを既存portの実callで確認する。
6. **最終境界** — AGENTSのtypecheck/full tests/normal+harness+validation buildをserial実行。
   Three vendorのversioned URLを更新し、Pages base buildも確認する。Native Spark2.1.0の
   明示準備cacheは別契約のまま。GSL chunks／workers／WASMがordinary／validationへ入らず、
   alias閉包が正しく分離されていることを実buildで確認する。lock/license/auditも検証する。

同じSpark SDK2.1.0でも、依存Threeの変更でcompiled bytes／import graphは変わる。
compiled chunk URLは`native-gs-spark-2.1.0-three-0.186.0.js`とし、Workboxの非precache／
runtime routeと明示準備の期待URLを一致させる。既存cacheNameと準備actionを維持し、
旧180用entryは削除しない。新アプリは旧entryだけをreadyと判定しない。旧entryだけを持つ
更新fixtureと新URLのブラウザ準備を検証する。これは本依存更新のbundle identity修正で、
保存schema、新GS profile、自動準備、一般offline/PWAの受入追加ではない。独立レビュー済み。

POは2026-10-27に本仕様の実装と固定依存を承認した。現在は実装・検証中であり、
正確な実行結果と残件は[todo](../../tasks/todo.md)に記録する。
受入が揃うまで0.186を有効な製品checkpointとして扱わない。実機iPhone、HTTPS/offline/PWA、
ProjectScene通常入口、S1/S2/G1-B／adoption／公開は個別の未充足のままとする。

### 7.1 通常旧形式ビューアの復旧接続（PO明示承認2026-10-27）

§6の復旧を通常の`ViewerCore`と`AppContext`にも接続する具体案。保存・編集権限や
保存形式は増やさず、現在の閲覧専用入口を保持する。

- loss前に**表示済み**の`loadedModelAssetId`だけを捕捉する。未表示／大型モデルの
  選択だけを根拠に自動読込せず、既存の容量確認を迂回しない。
- loss中はRAF・pointer・長押し・gizmoの確定通知を停止し、表示資源／rendererを破棄。
  カメラ全体（平行投影のzoom／frustum／clippingを含む）とtargetはCore内の一時値で保持。
  一時的な点径倍率も同じモデルの復旧では保持し、通常の別モデル選択では既定へ戻す。
- restore後に同じ設定でrendererを再作成し、appが既存`loadModelAsset`とWorkspaceFSから
  同じ生存Projectの元ファイルを再準備する。`setModel`・transform・pin・材質同期後に
  元の視点へ戻す。途中のfitは一時的に抑え、原本／記録／操作ログを変更しない。
- AppContext、access、navigation、model-load世代と取消を各await後と採用前に照合。
  別画面／別モデル／再loss後の候補を採用せず解放する。取消をピン編集確定にしない。
- lossで「表示中」を解除し、復旧待ちを伝える。読込失敗では自動再試行を繰り返さず、
  既存Modelタブの「表示」を残す。表示・pin・材質・視点・原本／log不変と世代切替を検証。

この完全案は独立レビュー済み。部分案の再表示経路不足は解消したが、managed approvalは
「通常旧形式ビューアへの拡張にはこの正確な差分の明示的な実装許可が必要」として
再度拒否した。どちらもその時点では未適用。その後POは2026-10-27に本節の正確な
復旧接続の実装を明示的に承認した。この許可の範囲で実装・検証を進め、実行結果は
todoへ記録する。以前のscope確認は解消済みであり、再確認待ちではない。

## 8. 代案と停止条件

| 代案 | 今回採らない理由 |
|---|---|
| guardを186へ変更／旧profileの読み替え | 180証明を省略し、旧契約を変えてしまう |
| 新profileへ既存Projectや履歴を一括書換え | 不要なdata migrationと互換性負担を増やす |
| 180 objectを186 rendererへ直接投入 | instanceof・loader・cleanupの混在で保証が失われる |
| 2renderer／canvasでGSだけを重ねる | depth・選択・復帰・画質の別設計が必要になる |
| 全geometry・材質を独自DTOから再構築 | 対応済みglTF意味を再実装する範囲が大きい |

正確な180閉包、旧proof／bytes、186表示同一性、資源寿命のいずれかを守れない場合は、
0.186の有効化だけ止める。対応付けの推測、曖昧な同等性、既存入力の無言の対応撤回、
上限やassertの緩和で合格にしない。新しいreader／wire／recipeやGSL製品統合が必要に
なった場合も別の具体的判断へ戻り、今回の権限を拡大しない。
