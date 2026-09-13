# 実装・接続の全体棚卸し

> CURRENT INVENTORY / 2026-09-13。全体監査基点: `b73315b851f627ca61029cfb73caf23f6e4829bd`。
> PO追加採用: Asset間の親変更と既存ProjectAnchorへの親設定を05 §4.4へ記録。
> C11を新metadata／限定GLB validationへ接続。親を選択→仮位置→確定／取消、位置不明時は面指定。
> 同一Caption・内容・Scene所属を保持し、全Scene影響を提示。exact retry／cold／競合候補は既存tests。
> 実browser／iPhone受入れは別。旧固定owner host・新規ProjectAnchor作成・未配置schemaは対象外。
> PO回答（`1edc3f5`後）: 06 §11の隔離実装→実測／採用の順序は承認済み。
> §12.6の編集copy方針は、位置既知の要確認ピンを表示する条件で承認（`c2a00f3`後）。
> 対応モデルなしは一覧上の分類。要確認pinの表示／選択／窓の線を接続、exact display鮮度も検査。
> 元色・要確認状態を保持。実browser／iPhoneは未受入れ。exact wire表の統合・契約review済み。
> 上記package判断の文書更新自体は実装数を変えない。最新C11接続の分類数は§1。
> C04は同じピン操作欄の「追加色」から通常／Shift／数値追加へ接続。作成時の1変更で色も記録。
> 絞り込み／既存色編集と独立し、Scene別の次回色と実際のピン色を分離。retryは元の色／IDを保持。
> 新schema／wire／永続preferenceはなし。native picker／実browser／実機受入れは既存一括確認に残る。
> C09は両host共通の窓に右下ドラッグ・矢印・非ドラッグ選択を接続。Scene別のlocalサイズだけを変更。
> 本文／画像node・scroll・選択・元履歴を保持。取消・stale・寸法変化、View操作とEdit切替拒否は既存tests。
> 分類は接続済みへ移すが、native input／短画面／実機受入れは未完了。最終検査状態はtodoを参照。
> T03のScene名競合も同じmetadata hostへ接続。全候補の明示選択／名前入力を同じjournalへ通し、
> 通常renameの競合拒否・手元入力・原履歴を保持。等値候補／返送／cold retryは既存tests。
> View名／順序／camera／background、Scene開始Viewの競合も同じ候補UIへ接続。
> 全候補とactiveな所有Scene／Frameを検証し、元の値を選択（名前は手入力も可）。
> 不在の開始View・同値候補も1変更で解消し、warm recallはしない。検証の正確な状態はtodo。
> Captionの削除／編集・削除／復元競合は親のみの明示変更へ接続。子tombstone・後着／曖昧edge・
> 元本文／位置候補を保持し、未配置Captionは既存のScene登録から再利用できる。
> 他lifecycle／他fieldの解消と実画面受入れは残るため、分類数は変更しない。
> M05は同じモデルタブへ一時hide／単独表示／全表示を接続。Scene別local stateで、共有所属・
> 履歴・Saved Viewを変更しない。resident／カメラ／Caption本文・windowを保持し、所有pin／hitを抑制。
> Captionからlocal再表示、readonly、追加モデル、cold解除を既存testsで確認。実描画／実機は未受入れ。
> V04は同じ視点タブへ背景入力・適用・取消を接続。表示だけの変更とViewへの記録を分離。
> exact読戻しまでrollback可能とし、カメラ／軸／gizmo・入力を保持。実描画／実機は未受入れ。
> C07は添付情報から一覧件数へ接続済み。metadata／限定GLB/PNGで追加・削除・retry・再開を確認。
> 不明な添付を0件にせず、同じ画像の複数添付は各1件。実画面・実機・offline受入れは別。
> その後の実装差分: 新metadataの完全履歴受信・Caption文言の明示解消・重複Captionの独立コピー、
> 準備済みモデル切替とpin修正の保存・二人二巡、モデルstatus・Caption位置／色の明示解消、
> 既知Mesh独立copy、Scene作成・名前／開始Scene設定、確認付きCaption／モデル全Project削除を限定接続。
> 保存・復旧・再受信までの合成テストが通る。実ファイル／実機受入れは未完了。
> 非活性のstream本体保存・実inventory→metadata作成／再開もserviceテストで接続。
> 静的GLB／PNGの限定検査・初期Project構築・実保存本体のevidenceが新serviceへ接続。
> 同じdev hostの限定実file入口で、GLB/PNGからの作成・専用一覧・再開と実保存本体の
> read/render port、既存pin/text/PNG編集へ接続。memory-port／記録DOMで検証。
> 開いたCaptionへのPNG後入れも同じjournal／galleryへ接続。他still-image形式は残るためI02の主分類は不変。
> 実GLBのM06/M07も既存gizmoとtyped binding保存へ限定接続。原GLB／Caption座標は保持。分類数は不変。
> 開いたProjectへの静的GLB追加もモデルタブへ接続。新Asset／現在Scene所属を原子的に保存し、
> 追加本体の表示準備後に確認する。失敗時は旧表示・元入力を保持。同名／同bytesを同一Assetとはしない。
> 他Mesh形式・実描画／実機が残るためM01分類は据え置く。現在の分類数は下記§1。
> 実GLB全slotの正確な材質対応と照明／表裏／scope解除を接続。原PNG/PBRと保存retryを保持。
> hard chromaとCPU候補面ごとのGPU可視判定も接続。判定失敗では配置せず、元材質と描画状態を保持。
> shader／記録renderer／保存テストの証拠であり、実GPU・実機は未確認。他形式が残るためA02全体の完了とは数えない。
> P01/P02をこの限定経路で接続済みへ。実描画／実入力／実機／正式採用は未受入れ。
> M07は同じmetadata hostでモデル回転・正の均等拡縮、preview／取消／保存／再開へ接続。
> 新しい仕様・採用判断ではない。承認済み要件と現行code/testsの距離を記録する。
> 実装順は最新のUI指摘順ではなく、依存関係と `TEAM-FLOW-01` への効果から選ぶ。

> **2026-09-12 PO承認:** 最初は実用チーム版を完成させる。M13/M14は削除せず後続へ
> 分け、他62群を今回の接続・受入れ対象とする。full-source受信→明示解消→モデル更新を
> 最初の実装順として承認。実データ・06/07・実機・公開の既存gateは維持する。
> 現行コードの個別状態は実装・検証の完了時に更新し、計画承認だけでは接続済みにしない。

## 1. 結論と数え方

ユーザーが行う作業を **64機能群** に整理すると、新metadata保存画面へ限定接続済みが
**33群**、残りが **31群**。その31群は下記の内訳になる。
「33/64完成」といった完成率・工数には換算しない。小さい部品接続と
移行／チーム受信では仕事量が大きく違い、接続済みも下記の限定経路だからである。

| 排他的な主分類 | 群数 | 意味 |
|---|---:|---|
| 接続済み | 33 | 新metadata hostで操作・必要な記録まで接続。従来25群は既知三角形／2 PNG起点、P01/P02は限定validation、C04/C07/C09/C11/V04/M05は両hostへ接続。実機受入れは別 |
| 部品未接続 | 4 | 新系統のUI部品・pure planner等はあるが、対象群全体の画面・実データ・typed command／保存のいずれかが未接続。T01〜T04は限定接続まで進んだ |
| 別経路のみ | 18 | Nativeまたはmemory／旧savedの相当操作はある。新source／サービス／rendererへの移植・接続が必要。配線だけとは限らない |
| 新規実装 | 9 | 新契約の利用者向け経路がまだない。schema・検証・設計案があっても実装済みとは数えない |

- 一つの行は、共有する前提・保存境界を持つ「利用者の作業群」。同一ViewのCRUD等は一群。
  三つのモデル形式・五つのpackage目的・三つの移行元は異なる契約があるため別群。
- 同一行を複数分類へ加算しない。UI部品と保存commandの両方がない場合も一群のまま。
- Desktop／iPhone、単体／統合テスト、retryの各faultを機能数へ重複加算しない。
- §4の基盤・検証残件、§6の明示deferred／未決事項は、この64群とは別に管理する。
- 承認済み製品全体の棚卸しであり、64群すべてを現在の合成接続sliceや最初の
  candidate必須gateへ追加しない。完全alignmentやM14等の別gate能力は、その前提が
  揃った段階で扱う。閉じた旧Native受入れをこの件数で再オープンしない。
- 「新規実装」はコードが全くないという意味ではない。F08は旧Native変換とは別の
  新Scene変換であり、旧経路だけでは新経路の完成と数えない。
- 本書はソース・既存テスト・承認済み仕様の照合。新しい実ブラウザ操作／性能測定ではない。
  LociMyu継承は以前の記録された原本監査と実装を参照し、private原本を再収集していない。

### 経路を混同しない

| 経路 | 実際に存在するもの | ここから主張してはいけないこと |
|---|---|---|
| 通常home → Native | 実モデル／画像、DisplaySet、限定backup／collaboration／review／clean、旧Desktop・iPhone合格 | 新ProjectScene／継続因果履歴／新保存サービスの完成 |
| project-scene memory／旧 `storage=saved` | 合成の2人チーム、更新・競合・独立copy・保存の限定ループ | 新metadata serviceまたは実ファイル製品wireの接続済み |
| project-scene `storage=metadata` | 新source/repository/session/journalと従来25群＋C07/V04の合成UI接続、限定履歴受信・明示解消 | 任意モデル／任意画像／実ファイルのチーム受信／通常home／offlineの合格 |
| project-scene `storage=validation` | 新規静的GLB/PNG Projectの作成・専用一覧・再開、実本体read/render、pin/text/PNG編集、GLB/PNG後入れ・配置・材質照明／表裏／hard chroma／解除 | 実描画／実入力／実機／正式profile採用、他形式・残る材質効果・実チームwireの完成 |

## 2. 全機能群

リンク先・行番号は上記checkpointの公開コード／仕様の位置。
「別経路のみ」のコードがあってもPoCをそのままproductionへ昇格させない。

### 入口・Scene

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| P01 | 実ファイルから新しいProjectを作る | 接続済み | 限定validation hostの内容判定→静的GLB/PNG検査→fresh Project/Scene→実本体保存。未完了はreadyにせずexact retry。通常home／他形式／正式採用は未接続・未受入れ。 | [src/harness/projectScene/validationWorkspace.ts](../src/harness/projectScene/validationWorkspace.ts) / [src/projectFiles/creation.ts](../src/projectFiles/creation.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P02 | 端末内Projectを選択・切替・再開 | 接続済み | 専用validation一覧を保存serviceの公開状態からread-only生成。保存済みと未完了／要確認を区別、IME／未確定／保存途中の切替を拒否。既存namespace／通常homeは不変更。実browserは未確認。 | [src/harness/projectScene/validationCatalog.ts](../src/harness/projectScene/validationCatalog.ts) / [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P03 | Scene選択と4タブの移動 | 接続済み | Caption上部のSceneリスト。検索・選択等はScene別UI状態。共有編集と分離。 | [src/ui/projectScene/navigationControls.ts:23](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectSceneNavigation.test.ts:36](../tests/ui/projectSceneNavigation.test.ts) |
| P04 | Sceneを作る | 接続済み | CaptionタブのScene管理から作成し、新metadataへ保存。元Sceneの確定モデル所属だけを順序保持・fresh IDで複写。Caption/material/View/defaultはコピーせず、不完全sourceは拒否。 | [src/harness/projectScene/sceneAuthoringControls.ts](../src/harness/projectScene/sceneAuthoringControls.ts) / [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) |
| P05 | Scene名・Project開始Sceneを設定する | 接続済み | 同じScene管理UIから明示確定して新metadata保存。名前／default競合は通常操作で上書きしない。開始Sceneは次回起動に使い、現在Scene選択やentry Saved Viewとは別。 | [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| P06 | 既存CaptionをSceneへ追加／外す | 接続済み | 同じCaptionを参照。本文・他Scene・添付を保持。Project全体削除ではない。 | [src/ui/projectScene/captionIncludeControls.ts:38](../src/ui/projectScene/captionIncludeControls.ts) / [tests/ui/projectMetadataHost.test.ts:535](../tests/ui/projectMetadataHost.test.ts) |
| P07 | 閲覧と編集を選んで開く | 別経路のみ | 限定validationに意図的なlock-free View／fresh durable Editと同一画面切替を接続。Scene・カメラ・窓・検索を保持し、入力／未完了Editの切替を拒否。metadata hostの選択入口・review編集の独立Project化は未接続。実画面受入れも残るため行全体を完了としない。 | [src/harness/projectScene/validationModeHost.ts](../src/harness/projectScene/validationModeHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md) |

### モデル

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| M01 | Meshを追加・表示する | 別経路のみ | validation静的GLBの新規作成／開いたProjectへの独立追加／元材質表示は限定接続。追加は現在Sceneのみ、exact保存・表示retryで重複させない。NativeのglTF/OBJ/STL/Mesh PLY等は新経路へ未接続。部分接続を行全体の完了としない。 | [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [src/harness/projectScene/validationRender.ts](../src/harness/projectScene/validationRender.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M02 | 通常Pointを追加・表示・pickする | 別経路のみ | Nativeもexact ASCII float XYZ＋uchar RGB PLY限定。新hostへ未接続。一般点群対応とは呼ばない。 | [src/nativeGs/plyProfile.ts:351](../src/nativeGs/plyProfile.ts) / [tests/nativeGs/pointPresentation.test.ts:9](../tests/nativeGs/pointPresentation.test.ts) |
| M03 | GSを追加・表示する | 別経路のみ | Nativeのexact Graphdeco SH2/SH3 profileを新hostに未接続。実body・resource lifecycleの検証が必要。 | [src/nativeGs/plyProfile.ts:305](../src/nativeGs/plyProfile.ts) / [src/harness/projectScene/viewport.ts:91](../src/harness/projectScene/viewport.ts) |
| M04 | モデル選択・検索とScene所属を管理する | 接続済み | 既知モデルのinclude/exclude。Assetそのものは残る。 | [src/ui/projectScene/modelListState.ts:15](../src/ui/projectScene/modelListState.ts) / [tests/ui/projectMetadataHost.test.ts:535](../tests/ui/projectMetadataHost.test.ts) |
| M05 | モデルを一時的に隠す／単独表示する | 接続済み | モデルタブのhide/show/isolate/全表示とCaptionからの復帰をlocal接続。Scene所属・履歴・Saved Viewは不変更。resident・カメラ・本文・windowを保持し、所有pin/hit/gizmoを抑制。readonly、Scene別保持、新規追加・cold解除は既存tests、実描画／実機は未受入れ。 | [src/ui/projectScene/modelListState.ts](../src/ui/projectScene/modelListState.ts) / [src/harness/projectScene/viewportHost.ts](../src/harness/projectScene/viewportHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M06 | モデルの平行移動を調整する | 接続済み | gizmo＋数値、preview/cancel/confirm、immutable binding保存と再開。合成・validation静的GLBで同一geometryを保持。実入力受入れは別。 | [src/harness/projectScene/session.ts](../src/harness/projectScene/session.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M07 | モデルを回転・均等拡大縮小する | 接続済み | 新metadataとvalidation GLBで移動／回転／均等拡縮gizmoと数値代替、全Scene共通のfresh binding保存／再開。原点基準、正scale、canonical回転、exact取消／retry、Caption原座標／本体保持。二人返送は合成経路のみ、実入力・実機は未受入れ。M13のpivot／fit／Undoではない。 | [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [src/harness/projectScene/pinGizmo.ts](../src/harness/projectScene/pinGizmo.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M08 | モデルを差し替えて要確認のピンを直す | 接続済み | 新metadataの初期準備済みoriginal／updatedを明示切替。全Sceneの配置・Caption本文／位置／添付を保持し、異なる表面は要確認→手動補正。保存・exact retry・再開・二巡を確認。利用者の新しい本体導入はM01等、通常home／実機は未受入れ。 | [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M09 | Projectからモデルを削除する | 接続済み | 全Scene所属・Caption anchor・material routingの原候補を検査し、参照ゼロのAssetだけ確認付きtombstone。未知／曖昧な参照は拒否。保存前の選択、本体／原履歴、後着参照と相手の未適用入力を保持。exact retry／cold reopen／再受信を限定hostで確認。cascade・物理消去・一般参照修復なし。 | [src/projectMetadata/assetDeletion.ts](../src/projectMetadata/assetDeletion.ts) / [src/harness/projectScene/assetDeletionControls.ts](../src/harness/projectScene/assetDeletionControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M10 | GSの配置補助モデルと配置可否を確認する | 別経路のみ | Nativeの明示same-Asset Proxyだけのpickを未継承。Proxyなしでは既存Caption保持、新配置拒否。 | [src/nativeGs/app.ts:380](../src/nativeGs/app.ts) / [tests/nativeGs/schemaResolver.test.ts:869](../tests/nativeGs/schemaResolver.test.ts) |
| M11 | ピンの表示サイズを調整する | 別経路のみ | 新hostは固定寸法。Nativeの倍率UIを継承し、v2のpresentation保存単位も契約に合わせる。 | [src/harness/projectScene/workspace.css:90](../src/harness/projectScene/workspace.css) / [src/nativeGs/app.ts:1841](../src/nativeGs/app.ts) |
| M12 | 点群の表示径を調整する | 別経路のみ | 新Point経路がない。Nativeの一時表示設定をPoint接続時に継承。 | [src/nativeGs/viewer.ts:430](../src/nativeGs/viewer.ts) / [src/nativeGs/app.ts:1854](../src/nativeGs/app.ts) |
| M13 | 位置合わせの基準固定・bounds fit・reset／undo・redo | 新規実装 | 完全alignmentは新hostも限定Nativeも未達。M06/M07と別の残り。alignment固有のundo/redoで、一般Caption Undoの新設を含めない。 | [docs/specs/01-domain-rendering.md:769](../docs/specs/01-domain-rendering.md) / [docs/specs/01-domain-rendering.md:786](../docs/specs/01-domain-rendering.md) |
| M14 | 既存モデルへ補修Meshを追加・配置し、任意hard exclusionと一体で保存する | 新規実装 | 承認済みvisual repair pairの利用者flowは未実装。別Asset追加ではない。repair-local gizmo、patch/mask一体preview/cancel、revision/bindingの原子的commit、対応pin class保持が必要。renderer/profile・hard-mask gateに依存し、直近チームsliceでは実装しない。 | [docs/specs/00-product-contract.md:116](../docs/specs/00-product-contract.md) / [docs/specs/00-product-contract.md:275](../docs/specs/00-product-contract.md) |

### Caption

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| C01 | 面選択／Shift＋クリックでピンを追加する | 接続済み | exact hitを仮対象にし、gizmo確認して保存。合成Meshとvalidation静的GLBへ限定接続。hard chromaは候補面だけをGPU判定し、不明なら拒否。実GPU／実入力受入れは別。 | [src/harness/projectScene/session.ts:560](../src/harness/projectScene/session.ts) / [tests/ui/projectSceneViewport.test.ts:165](../tests/ui/projectSceneViewport.test.ts) |
| C02 | 既存ピンを後から移動する | 接続済み | 同じAsset内のgizmo／数値・取消／確定。別Assetへのre-anchorとは別。 | [src/harness/projectScene/session.ts:511](../src/harness/projectScene/session.ts) / [tests/ui/projectMetadataHost.test.ts:535](../tests/ui/projectMetadataHost.test.ts) |
| C03 | タイトル・本文・ピン色を編集する | 接続済み | 一つのsource commandで保存・再開。 | [src/ui/projectScene/captionDetailControls.ts:30](../src/ui/projectScene/captionDetailControls.ts) / [tests/ui/projectMetadataHost.test.ts:471](../tests/ui/projectMetadataHost.test.ts) |
| C04 | 選んだ分類色で続けてピンを追加する | 接続済み | 両host共通の追加色を通常／Shift／数値追加の開始時に固定し、Caption・所属・色を1変更で記録。Scene別local preference、絞り込み・既存色編集と独立。取消・stale／遅延入力・readonly・exact retryを検査。cold再開はピン色を保持し次回色は初期値。実入力／実機は未受入れ。 | [src/ui/projectScene/pinModeControls.ts](../src/ui/projectScene/pinModeControls.ts) / [src/harness/projectScene/session.ts](../src/harness/projectScene/session.ts) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| C05 | Scene内のCaptionを検索・選択する | 接続済み | タイトル／本文検索と選択保持。タグ・添付説明の拡張検索は含めない。 | [src/ui/projectScene/captionListControls.ts:14](../src/ui/projectScene/captionListControls.ts) / [tests/ui/projectSceneCaptionList.test.ts:41](../tests/ui/projectSceneCaptionList.test.ts) |
| C06 | カラーサークルで一覧とピンを絞り込む | 接続済み | 全色／空集合、選択を失わない再表示経路。 | [src/ui/projectScene/captionListControls.ts:23](../src/ui/projectScene/captionListControls.ts) / [tests/ui/projectSceneCaptionList.test.ts:66](../tests/ui/projectSceneCaptionList.test.ts) |
| C07 | 一覧で添付の有無・件数を見分ける | 接続済み | metadata／限定GLB/PNG hostの添付recordを一回集計して一覧へ渡す。確定削除除外、曖昧な参照等は要確認、同じblobの複数添付も各1件。追加・削除・失敗後retry・cold reopenは既存tests、実画面／実機は未受入れ。 | [src/harness/projectScene/mediaHistory.ts](../src/harness/projectScene/mediaHistory.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectSceneMedia.test.ts](../tests/ui/projectSceneMedia.test.ts) |
| C08 | 複数Captionウィンドウを比較する | 接続済み | 順次開く・前面化・個別×・移動／キーボード・並べる・意味のある位置への接続線。 | [src/ui/projectScene/captionWindowControls.ts:26](../src/ui/projectScene/captionWindowControls.ts) / [tests/ui/projectSceneWindowConnection.test.ts:34](../tests/ui/projectSceneWindowConnection.test.ts) |
| C09 | Captionウィンドウのサイズを変える | 接続済み | 両host共通の右下drag／矢印／非drag選択。Scene別local placementだけ変更し、本文・画像・scroll・他窓・選択・履歴を保持。取消・stale・extent変化／late入力とView操作・Edit切替拒否を既存testsで確認。実描画／実入力／短画面／実機は未受入れ。 | [src/ui/projectScene/captionWindowControls.ts](../src/ui/projectScene/captionWindowControls.ts) / [tests/ui/projectSceneWindowConnection.test.ts](../tests/ui/projectSceneWindowConnection.test.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| C10 | Project全体からCaptionを削除する | 接続済み | 影響Scene・添付・tag登録を確認し、Captionと観測済み全edgeを原子的tombstone。本文競合・Media/Tag/モデル本体を保持。保存失敗中は旧UI、exact retry／cold reopen、後着edge/delete-editの保持と警告、未適用入力の明示取消を確認。復元・一般参照修復UIは別。 | [src/projectMetadata/captionDeletion.ts](../src/projectMetadata/captionDeletion.ts) / [src/harness/projectScene/captionDeletionControls.ts](../src/harness/projectScene/captionDeletionControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| C11 | 既存ピンの親モデルを設定・変更する | 接続済み | 05 §4.4のAsset A→B／既存ProjectAnchor→Assetを専用command、親選択・仮位置・gizmo・確定／取消へ接続。計算可能な3D位置、同じCaption ID／内容／Scene所属を保持し、不能時は面指定。全Scene影響・一覧のみの条件を提示。新metadata／限定GLB hostでretry／cold／全anchor競合を検査。実描画・実機・移行入口は未受入れ。新ProjectAnchor作成・真正な未配置C12とは別。 | [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md#44-explicit-pin-parent-changes-po-approved-2026-09-13) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [src/harness/projectScene/session.ts](../src/harness/projectScene/session.ts) |
| C12 | 未配置の記録を失わず読み込み、後で配置する | 新規実装 | 未配置を保持・後配置する製品要件は承認済み、exact schema/recipeは提案・未実装。現在Anchor unionにもない。破損・競合を未配置扱いにして救済しない。 | [docs/specs/05-project-scene-team-workflow.md:784](../docs/specs/05-project-scene-team-workflow.md) / [src/scene/types.ts:36](../src/scene/types.ts) |

### メディア

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| I01 | Project内メディアを添付・再利用し、説明・順序・添付解除を編集する | 接続済み | 合成2枚とvalidation保存PNGの登録・再利用。確認付き添付削除で元bytesと他Captionを保持。実入力受入れは別。 | [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| I02 | 実画像ファイルを添付する | 別経路のみ | validation hostのPNG後入れは同じcreateAttachment／journalへ限定接続。拒否・元bytes retry・cold復旧を確認。他のNative JPEG/WebP/GIF still-image範囲と実入力は残り、行全体は完了としない。 | [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| I03 | 添付画像を開いて拡大・失敗時に再試行する | 接続済み | 合成bytesとvalidation保存PNGから表示。欠損をfixture画像で置換しない。保存後のgallery準備失敗も隠さず同じ添付を再確認。 | [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| I04 | サムネイルで選び、共通viewerで画像を前後確認する | 別経路のみ | 現在の追加はテキストselect、表示はinline拡大。Native側parity R04/R06の便益を未継承。 | [src/harness/projectScene/mediaControls.ts:53](../src/harness/projectScene/mediaControls.ts) / [tasks/uiux-parity-plan.md:38](../tasks/uiux-parity-plan.md) |

### 視点

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| V01 | カメラを操作し、全体表示・六方向・透視／平行投影へ戻る | 接続済み | Blender基本mouse。完全keymapではない。touchの実機受入れは別。 | [src/ui/projectScene/viewControls.ts:13](../src/ui/projectScene/viewControls.ts) / [tests/ui/projectSceneViewport.test.ts:307](../tests/ui/projectSceneViewport.test.ts) |
| V02 | Saved Viewを作成・呼出し・更新・名称／順序編集・削除する | 接続済み | current camera＋背景をcapture。entry参照中の削除は拒否。 | [src/harness/projectScene/viewSession.ts:117](../src/harness/projectScene/viewSession.ts) / [tests/ui/projectMetadataHost.test.ts:628](../tests/ui/projectMetadataHost.test.ts) |
| V03 | Sceneの開始視点を設定・解除する | 接続済み | 現在のカメラ、Saved View編集、Project default Sceneを混同しない。 | [src/harness/projectScene/viewSession.ts:74](../src/harness/projectScene/viewSession.ts) / [tests/ui/projectMetadataHost.test.ts:628](../tests/ui/projectMetadataHost.test.ts) |
| V04 | 3D背景色をpicker／HEXで選び、標準色へ戻す | 接続済み | 同じ視点タブに入力／標準色／適用／取消。local表示はreadonly可、共有Viewの記録は既存command。exact読戻し失敗も旧色・draftを保持し再試行。metadata／限定GLBでView記録・cold再開を確認、実描画／実機は未受入れ。 | [src/ui/projectScene/viewAuthoringControls.ts](../src/ui/projectScene/viewAuthoringControls.ts) / [src/harness/projectScene/viewportHost.ts](../src/harness/projectScene/viewportHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |

### マテリアル

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| A01 | 対象／Scene・Project範囲を選び、照明・表裏・hard chromaを編集／解除する | 接続済み | 既知三角形に加え、validation GLB全slotの照明／表裏／hard chroma／解除を接続。scope優先順位・元材質・入力retryを保持。実GPU／実機は未受入れ。 | [src/harness/projectScene/materialSession.ts](../src/harness/projectScene/materialSession.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A02 | 実Meshのmaterial／textureと複数slotを扱う | 別経路のみ | 静的GLBの全slotと実decoded材質をsource locatorで厳密対応。instance cloneへの照明／表裏／hard chromaとreset時PNG/PBR保持を限定接続。他Mesh形式・残る効果・Representation選択は未接続。元からunlit/両面/MASK/BLENDは原本表示のみ、編集しない。 | [src/harness/projectScene/validationRender.ts](../src/harness/projectScene/validationRender.ts) / [src/harness/projectScene/validationMaterials.ts](../src/harness/projectScene/validationMaterials.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A03 | 不透明度・soft chromaを安全な対応範囲で使う | 別経路のみ | UI intentはあるが新hostは拒否。承認済みmask/dither等の対応を明示しprofile/G0を確認。黙った変換は禁止。G1-Dが必要なのはExperimental smoothBlendで、滑らかな透過の一般保証は非対象。 | [src/harness/projectScene/materialSession.ts:37](../src/harness/projectScene/materialSession.ts) / [docs/specs/01-domain-rendering.md:449](../docs/specs/01-domain-rendering.md) |

### 保存

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| S01 | 保存状態を確認し、同じ作業を再開する | 接続済み | new metadataのoriginal history＋marker-last＋cold reopenと限定validation一覧。内部ackは「再開用データのみ」とし、未確定・失敗・復旧・閲覧状態を保持。外部file保存、最後のProjectの再開通知／完全な切替導線、実機受入れは未接続・未完了。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/ui/projectScene/navigationControls.ts](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| S02 | 中断・保存失敗から元の変更で再試行する | 接続済み | 旧公開表示を保持、未完了は編集制限、exact originalsを再使用。一般ファイルimportの復旧まで保証しない。 | [src/projectMetadata/session.ts:137](../src/projectMetadata/session.ts) / [src/projectMetadata/journal.ts](../src/projectMetadata/journal.ts) |
| S03 | 別タブから確認し、編集権を安全に扱う | 接続済み | readonly／refresh／lease handoffの限定接続。同時多人数編集・実機保証とは別。 | [src/harness/projectScene/metadataHost.ts](../src/harness/projectScene/metadataHost.ts) / [src/projectMetadata/persistence.ts](../src/projectMetadata/persistence.ts) |
| S04 | オフラインで起動・作業・終了後に再開する | 別経路のみ | 旧Nativeの合格経路は新hostへ流用不可。普通の製品導線／offline保存基盤の接続と新実測が必要。SW変更は現在非対象。 | [tasks/uiux-handoff.md](../tasks/uiux-handoff.md) / [docs/specs/05-project-scene-team-workflow.md:1064](../docs/specs/05-project-scene-team-workflow.md) |

### チーム

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| T01 | 配布された更新を手元の記録を保って受け取る | 部品未接続 | 新serviceの完全source受信／remote journalと合成タイトル／登録のUI受信を接続。準備済みモデル切替・手元本文保持・要確認・明示補正の二人二巡を保存ポートで確認。モデル交換の通常UI／実ファイルは未接続、F01/F02参照。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/projectMetadata/remote.ts](../src/projectMetadata/remote.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| T02 | 元の配布状態を保持し、変更分を繰り返し返す | 部品未接続 | 新serviceの完全source往復は原履歴を保持し二巡・no-op・中断復旧・再開まで確認。専用exchange-base記録・source-derived deltaは未接続。旧savedの固定base/deltaを流用済みとはしない。portable wireはF02、06の批准境界を維持。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| T03 | 同じ項目の競合を比較し、明示的に解消する | 部品未接続 | Caption title/bodyの明示選択／手動文言、anchor/colorの完全候補選択（任意色の不在保持）、既知ready-model status比較を1変更の保存・cold retryへ接続。開始Sceneのcold行き止まりとScene名→通常renameを接続。View名／順序／camera／backgroundとScene開始Viewも全候補から選択し、通常編集・recall・開始設定へ復帰可能。Captionの削除／編集・削除／復元は親のみのfresh eventで解消し、子tombstone・後着／曖昧edge・他候補・元bytesを保持。未配置の復元後は既存Scene登録へ。warmのScene／camera／入力、元履歴を保持。位置は非確定の比較表示、解消後の再送・後着再競合も保持。他field／他lifecycle等は未接続。 | [src/harness/projectScene/metadataConflictControls.ts](../src/harness/projectScene/metadataConflictControls.ts) / [src/harness/projectScene/metadataCaptionLifecycleControls.ts](../src/harness/projectScene/metadataCaptionLifecycleControls.ts) / [src/harness/projectScene/metadataStartupControls.ts](../src/harness/projectScene/metadataStartupControls.ts) / [src/projectMetadata/viewResolution.ts](../src/projectMetadata/viewResolution.ts) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) |
| T04 | 重複所属で片方／両方を選び、独立項目として残す | 部品未接続 | Captionの完全独立copyとモデルkeep-oneに加え、既知Meshのfresh root／完全ID remap／Scene material copyを接続。元Caption・他Scene不変更、コピーの独立配置／material編集と二人二巡、exact retry／cold reopenを確認。最終結果はtodo先頭。一般Point/GS/Proxy等のcopy closure・実ファイル／実機は未完了。 | [src/projectMetadata/membership.ts](../src/projectMetadata/membership.ts) / [src/projectMetadata/modelMembership.ts](../src/projectMetadata/modelMembership.ts) / [src/harness/projectScene/metadataMembershipControls.ts](../src/harness/projectScene/metadataMembershipControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |

### ファイル・移行

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| F01 | 自己完結したTeam Workspaceファイルを配布・開く | 新規実装 | 5-purpose controlと、元履歴由来summary・全live候補の強参照closure・本体検証済みsource captureを隔離実装。stale／pending／破損は書込みなく拒否。未知履歴のinventory未証明はcapture制限。ZIP／durable job・receipt／writer・reader／通常UIは未接続。T01の内部受信や部品をportable操作の完成に数えない。 | [src/projectPackage/workspaceSource.ts](../src/projectPackage/workspaceSource.ts) / [tests/projectMetadataPersistence.test.ts](../tests/projectMetadataPersistence.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F02 | Contributionファイルを書き出し・取り込む | 新規実装 | 共通control部品が連続ordinal・native hashのlex-ready順・descriptorを検査。検証済みbaseによるDの完全性、必要blob差分、元bytesのportable出力／受信は未接続。旧Native collaborationとは契約が違う。 | [src/projectPackage/manifest.ts](../src/projectPackage/manifest.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F03 | 完全backupを書き出し・明示確認して復元する | 別経路のみ | 旧Nativeで実装あり。新history／保護inventory／exchange-base付きwhole Projectのwire接続は別実装。 | [src/nativeGs/packageExchange.ts](../src/nativeGs/packageExchange.ts) / [docs/specs/06-project-package-wire.md:24](../docs/specs/06-project-package-wire.md) |
| F04 | 一つのSceneを閲覧用に共有する | 別経路のみ | 旧Nativeのreview相当あり。新history-free closure／privacy検査／View入口は未接続。編集copyの対応保持は06 §12.6で要確認ピン表示を条件に承認。exact snapshot／再構築表review済み、builder／golden実行は残る。 | [src/nativeGs/packageSnapshots.ts](../src/nativeGs/packageSnapshots.ts) / [docs/specs/06-project-package-wire.md:24](../docs/specs/06-project-package-wire.md) |
| F05 | 全Sceneを独立Projectとして複製して渡す | 別経路のみ | 旧Native clean相当あり。新全Projectのre-key／fresh history／元へContribution不可は未接続。 | [src/nativeGs/packageSnapshots.ts](../src/nativeGs/packageSnapshots.ts) / [docs/specs/06-project-package-wire.md:24](../docs/specs/06-project-package-wire.md) |
| F06 | 現Native Projectを新Project/Sceneへ変換する | 新規実装 | 新recipe・共有導入artifact・変換writer未実装。旧sourceを変更しない。 | [docs/specs/07-project-scene-migration.md:3](../docs/specs/07-project-scene-migration.md) |
| F07 | frozen v1を新Project/Sceneへ変換する | 新規実装 | 旧readerの互換性維持と新writerを接続する移行は未実装。 | [docs/specs/07-project-scene-migration.md:3](../docs/specs/07-project-scene-migration.md) |
| F08 | LociMyu ZIPを新Project/Sceneへ変換する | 新規実装 | 旧Native converterはあるが新Scene／unplaced保存のrecipeは未実装。Google／曖昧relationは継承しない。 | [docs/specs/04-locimyu-conversion.md](../docs/specs/04-locimyu-conversion.md) / [docs/specs/07-project-scene-migration.md:3](../docs/specs/07-project-scene-migration.md) |
| F09 | 移行後に届いた旧Nativeの変更を受け入れる | 新規実装 | late Native bridgeは設計案のみ。既知source relation、旧baseline、v2の手元変更の保護が必要。 | [docs/specs/07-project-scene-migration.md:10](../docs/specs/07-project-scene-migration.md) |
| F10 | ファイル内容・影響を確認し、取消／不正入力から回復する | 別経路のみ | 通常home／Nativeには入口あり。新wireのpreflight／failure／retry UIとサービス未接続。filenameでpurposeを推測しない。 | [tests/nativeGs/homeUi.test.ts:476](../tests/nativeGs/homeUi.test.ts) / [docs/specs/06-project-package-wire.md:31](../docs/specs/06-project-package-wire.md) |

### 利用支援

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| H01 | 使い始め・記録・保存共有・困ったときの案内を開く | 別経路のみ | 新hostは入力操作の限定helpのみ。Nativeの4節helpを新チーム契約に合わせて接続。 | [src/nativeGs/app.ts:2810](../src/nativeGs/app.ts) / [src/harness/projectScene/workspace.ts:78](../src/harness/projectScene/workspace.ts) |
| H02 | 端末保存容量・オフライン準備を確認する | 別経路のみ | 旧homeの端末機能と新保存基盤は未統合。安全な清掃はGC gateと分離して明示、無確認削除をしない。 | [docs/ui-product-guidelines.md:134](../docs/ui-product-guidelines.md) / [docs/specs/03-gates-and-delivery.md](../docs/specs/03-gates-and-delivery.md) |

## 3. 元の41タスクとの全件対応

基準: [uiux-handoff §7](uiux-handoff.md)。古いDisplaySet・モデル事前選択を復活させず、
承認済みScene-firstの結果へ写像する。この表は操作量／時間の新規実測ではない。

| 元task | 利用者の作業 | 本書の該当群／証拠lane |
|---|---|---|
| 1 | 新規Project | P01 |
| 2 | LociMyu ZIP | F08 |
| 3 | legacy閲覧から移行 | F07 |
| 4 | backup復元 | F03 |
| 5 | 共同作業・review・cleanを開く | P07 / F01 / F02 / F04 / F05 |
| 6 | Mesh追加 | M01 |
| 7 | Point追加 | M02 |
| 8 | GS追加 | M03 |
| 9 | モデル選択 | M04 |
| 10 | 表示・非表示 | M04 / M05 |
| 11 | 移動・回転・均等scale | M06 / M07 / M13 |
| 12 | 差替え | M08 |
| 13 | モデル削除 | M09 |
| 14 | GS Proxy | M10 |
| 15 | Caption作成 | C01 |
| 16 | 配置先モデルの確認 | C01 / C11（事前モデル選択の強制は撤去済み） |
| 17 | 最初の位置 | C01 |
| 18 | gizmo | C02 |
| 19 | タイトル・本文・色 | C03 / C04 |
| 20 | メディア | I01 / I02 / I03 / I04 |
| 21 | 検索・選択 | C05 / C06 / C07 / C08 |
| 22 | 未配置 | C12 |
| 23 | Caption削除 | C10 |
| 24 | DisplaySet→Scene | P03 / P04 / P05 |
| 25 | material | A01 / A02 / A03 |
| 26 | 視点 | V01 / V02 / V03 / V04 |
| 27 | 所属・material・view・visibilityの理解 | P06 / M04 / M05 / A01 / V03 |
| 28 | 保存 | S01 / S02 / S03 |
| 29 | backup出力 | F03 |
| 30 | 共同作業出力 | T02 / F01 / F02 |
| 31 | 統合 | T01 / F10 |
| 32 | 競合 | T03 / T04 |
| 33 | review共有 | F04 |
| 34 | clean copy | F05 |
| 35 | offline終了・再開 | S04 / E05 |
| 36 | 破損・非対応・復旧 | F10 / S02 / E01 / E02 |
| 37 | iPhoneで開く | P01 / P02 / F10 / E05 |
| 38 | iPhoneで3D操作 | V01 / C01 / C02 / M06 / E05 |
| 39 | iPhoneでCaption | C01–C12 / I01–I04 / E05 |
| 40 | iPhoneでScene・View | P03–P06 / V01–V04 / E05 |
| 41 | iPhone保存・offline | S01–S04 / E05 |

41に収まらない承認済みのScene作成・開始Scene、繰り返しチーム編集、独立keep-both、
移行後bridge、追加色、ウィンドウresize等も§2へ含めた。
LociMyuからのタブ構成、Sceneに相当する記録切替、直接色選択、連続追加、複数window、
画像確認、視点補助を照合。Google依存・内部sheet構造・単一モデル前提・無確認削除は継承しない。

## 4. 機能数とは別の、基盤・証拠・採用残件

「証拠だけがない」と「一般用途への実装もない」を区別する。

| ID | 境界 | 再利用できるもの | 残りの種類・具体的な不足 |
|---|---|---|---|
| E01 | 保存／CAS／GC／大容量I/O | 新original-byte journal、metadata-only cold evidence、非活性OriginBlobStoreのbounded stream／保存後検証／不変receipt／実inventory→metadata作成・再開、隔離CAS・retentionと500 MiB保存本体のPO readback | **実装＋証拠**。新storeの実OPFS・Web Locks・iOS証拠とhost接続、全Project/conflict/opaque/未完了journal等のroot producer、origin-wide GC、bounded browser/iOS出力、実中断。MemoryFSの一般bytes試験をプラットフォーム採用証拠にせず、過去の500 MiB最初の完了ログ不明をFAIL扱いして同じreadbackを繰り返さない |
| E02 | 実モデル・Representation／renderer | 旧Nativeの限定Mesh/Point/GS/Proxy、各loader、known triangle content verifier | **実装＋採用**。実body admission、Frame/catalog/texture/family証拠、Representation選択と対応外の局所的fallback、資源解放。shared-view合成・hard mask・dither等の各gateを確認。M01–M03/A02と補修操作M14の技術前提で、同じ作業をここで重複加算しない |
| E03 | 新wire・移行recipe | 5-purposeの意味的closure PoC、原履歴／prepared migrationの隔離証拠 | **技術批准＋実装**。06はexact wire/profile/limits、full/delta/base completion、privacy/copy規則、whole-file goldens。07は実source inspection、recipe/golden、managed unit/birth artifact／baseline journal。設計案を採用済みとしない |
| E04 | 規模・安全性・アクセシビリティ | 最終rootテスト、限定hostのfocus／失敗／古いtoken防御、既存runtime audit | **実装確認＋証拠**。10k Caption/50k changes、規定多tab workload、10k UI virtualizationとopen/edit budget達成、メモリ・CSP・不正入力、200%/狭幅/IME/keyboard/contrast/44pxの総合確認。未測定を性能FAILにしない。5件の既存toolchain audit findingsは未解消、runtimeの狭いhold解消とは別 |
| E05 | Desktop／physical iPhone／offline | 旧Native受入れ、旧saved限定4群、修正後journalのPO再確認 | **新経路の証拠待ち**。新metadata hostの8群は一般的好評のみで全件PASSではない。新保存・描画に必要な実機は該当境界で実施し、全てを無条件に最終日へ先送りしない。最後は通常UIでTEAM-FLOW-01。dev serverはoffline/PWA証拠ではない |

根拠:
[03 gates](../docs/specs/03-gates-and-delivery.md)、
[02 journal §8](../docs/specs/02-storage-package-migration.md)、
[05 §13.2](../docs/specs/05-project-scene-team-workflow.md)、
[06](../docs/specs/06-project-package-wire.md)、
[07](../docs/specs/07-project-scene-migration.md)、
[CAS証拠](../poc/cas-io/README.md)、
[UI原則](../docs/ui-product-guidelines.md)。

## 5. 推奨する実装順

目的は画面を先に埋めることでも、全ての基盤を磨き切ることでもなく、
**新しい保存経路で2人の仕事が続く一本の流れを先に閉じること**。
Project一覧とCaption削除は必要だが、ユーザーが最後に挙げたという理由では最優先にしない。

### 直近の三つの有限slice（PO承認済み、実装進行中）

1. **新保存サービスのfull-source受信を閉じる（T01）**
   - 目的: いまの「単人の保存可能な編集画面」から、手元の編集を保った受信へ進める。
   - 既存根拠: 02 §8の承認済みfull-source `remotePackageMerge`。
     新SessionにreceiveFullSourceとremotePackageMerge journalを追加済み。
     既知body限定の受信とCaption文言の解消まで接続したが、全体チーム往復は残る。
   - 完了条件: 合成の同一Projectの完全sourceからmissing original集合を検証し、
     元バイト・手元の編集を保持して一度だけ公開。全量とexact final headsを確認。
     中断中は旧公開状態、retryは同じ元変更、再受信はno-op。意味的競合は候補を保持し、
     影響箇所を非authoritativeにして表示する。自動winnerを使わない。
   - 範囲: 既存開発host＋新サービス。既存journal／旧2人loopの受入れを再利用し、
     productionの受信境界を実装する。新しいPoCページ・広いfault matrixを増やさない。
   - 非対象: Contribution delta wire、OSファイルinput、5-purpose writer、移行、
     実データ・通常home・新依存・iPhone/PWA合格。06の未批准delta interfaceは採用しない。

2. **受け取った競合を利用者が解消して、再び編集できるまで（T03/T04）**
   - 現在: Caption文言・位置・色の競合から再編集、重複Caption／既知Meshの独立copy、
     モデルstatusを限定接続。Scene作成・名称・開始Sceneの基本管理も接続。他field／lifecycle、
     一般model profile等を残し、全T03/T04完了ではない。
   - 目的: 受信できるがreadonlyで行き止まり、という状態を残さない。
   - 完了条件: 同一fieldは候補比較→明示選択／手動編集。重複所属は片方か、
     別々に編集できる独立Caption／モデルを両方保持。
     source-derived causal command、必要な参照remap、元履歴の保持と
     current/conflict/opaque・未完了journal等のrequired closureに属するblobsの保護、
     cold reopen・再受信no-opを既存受入れから接続する。
   - 非対象: 自動解消、一般的な複製機能、未批准wire、旧履歴の上書き。
     一つで安全に閉じられなければfield解消→独立copyの順に小さく分ける。

3. **モデル更新と手元のCaption修正を同じ保存経路で往復させる（M08/T02）**
   - 現在: 準備済み2形状の明示切替→要確認→pin補正を保存ポートの二人二巡で確認。
     手元title/body、原履歴、添付IDを保持し、中断復旧・cold reopen・no-opまで通る。
     一般的な本体紹介、専用exchange-base/delta、通常のファイル受け渡しUIは未接続。
   - 目的: 今回のチーム運用改修の動機を直接満たす。
   - 完了条件: まず既知合成bodyの紹介／revision切替をblob-firstで保存し、
     同じAssetを使う全Sceneへ反映。Caption座標・本文・添付・所属を保持し、
     根拠不明の位置だけ要確認にする。明示補正→固定配布baseを保持した返送→2巡目、
     retry／no-opを新serviceで確認する。
   - 保存baseと返送interfaceは02/05の承認範囲を先に照合する。
     06のdelta/base-completion拡張を必要とするところでのみその批准を求め、
     既存full-source受信まで一緒に止めない。
   - 非対象: 自動位置合わせ・reraycast、実ファイル形式追加、携帯受入れの代用。

三slice共通: 実装前に該当spec／todoへexact acceptanceを記録する。
source/schema・互換性の矛盾、受信／破壊境界に新しい製品判断が必要ならそこで止める。
焦点を絞った検査→独立read-only review→最終treeのtypecheck/test/buildを一度実施。
同じ人間テストや広い再監査を毎sliceの開始条件にしない。

### その後の接続順と、先行可能な小作業

2026-09-12: P04/P05/C10/M09は限定接続済み。⑤の前提となるstream本体保存→
実inventory→metadata作成／独立再開は非活性S1サービスのmemory-port試験で接続。
続く内容検査・初期Project→保存本体のread/render→作成／選択／再開は、POの
限定承認後に静的GLB/PNG用として接続済み。実描画／実入力の一括Desktop確認は未実施。
PNG／GLB後入れ・配置・材質照明／表裏／hard chroma／解除も同じ経路へ限定接続済み。
次はstage 3 wire/migrationの技術判断の一括整理と残る承認済み接続であり、追加の汎用storage、
合成run一覧、新PoCへ戻らない。正式profile／G1-A/C・必要実機・採用判断と通常homeは
別境界。既存新hostの一括Desktop確認は追加機能を前提としない。

| 順 | 閉じる結果 | 依存と扱い |
|---|---|---|
| 4 | Scene／Caption／Assetの基本管理を新sourceへ揃える | P04/P05/C10/C11/C12/M09。共通commandの原子性・参照ガードができたところから進める。入口だけを先に作って未保存・削除影響を隠さない |
| 5 | 実Mesh＋実画像を一筋で導入→保存→再開し、Project選択へつなぐ | 05 §13.2の限定validation例外でP01/P02は接続。I02/M01の追加導入・他形式と実入力／実機は残る。通常homeと正式採用はE01/E02・G1-A/C・必要実機・採用条件を満たしてから。名前付き合成run一覧だけを完成としない |
| 6 | チームファイルと移行を製品につなぐ | 06/07の有限な技術入力の整理は前三sliceと並行できる。批准後、full-source共通経路のTeamWorkspace/backup→Contribution→review/clean、実source移行とlate bridge。五つの目的の是非を再質問しない |
| 7 | 他の実形式・閲覧補助と残るalignment／補修を継承・実装する | Point＋表示径＋pick、GS＋明示Proxy、複数material、rotation/scale、残るalignmentを形式／契約ごとに閉じる。M14はGS/repair-local transform/原子的revisionの前提が揃ってから。hard-maskと一般smooth透過を一括deferredにしない。従来UIをコピーして新Sceneの意味を変えない |
| 8 | 通常homeからの全体受入れ | 新sourceでTEAM-FLOW-01をDesktopとphysical iPhone、保存／restart／offlineまで確認。a11y・短画面・IME等も安定treeでまとめる。Pages/SW/main/releaseへは現在の権限で進まない |

V04背景入口、M05一時hide、C09resize、C04追加色は接続済み。
この独立UI接続のまとまりを閉じ、次はF01/F02の契約・実装前提へ戻る。
既出の06判断を批准したことにはせず、小改修を積み続けて
受信・更新の本筋が進まない状態にはしない。

## 6. 明示deferred／判断未確定（64群へ加算しない）

2026-09-13追記: 06 §12に具体的field／privacy、inventory、要約、有限guardを整理。
独立レビュー済みだが、§12.6の閲覧切出し→編集copyの対応情報不足が新しい契約判断。
含めたモデルの対応だけ残す改訂を提案中で、五用途の完全な閉鎖／wire実装承認ではない。
策定順・auto頻度・外部auto不可時の代替は委任／承認済みであり、下記のgate未批准と混同しない。
runtime／機能群の分類数は変更しない。07物理移行profileは別判断のまま。

2026-09-13: 06 §11に実装・採用gateの段階分離を提案（PO未承認）。全五用途の閉じた
契約と具体的guard値・独立レビューを先に固定し、既存validation内で実装・証明を得る案。
実測容量保証・正式wire／移行profile・通常homeは後段で別批准する。OPFS生成完了と
OSダウンロード完了も分離。07 §10.2のpinScale／unplaced／managed adapterは未実装・未批准。
今回の文書整理で接続数を増やさず、実装のないgoldenや実機PASSを補わない。

| 対象 | 扱い |
|---|---|
| Scene複製／削除／並替えUI | 05 §14で最初の限定candidateは明示deferred。core削除guardがあることとUI予定は別 |
| 新規Project-space Caption、Sceneごとのrevision／alignment、Scene media layer、汎用Unity階層 | 明示非対象。既存ProjectAnchor読取・置き直しC11とは別 |
| Captionの一般Undo/Redo・一般複製・前後巡回 | 現状なし。旧parityでも要追加判断／確認待ち。承認済み必須欠落として数えない。モデルalignment固有の復帰M13とは別 |
| 任意baseColor入力 | 元materialの色保持・描画解釈はあるが入力UIなし。現在のaccepted editable fieldsとは別なので、勝手に新機能化しない |
| タグ編集UI | 新規作成・編集・管理UIは旧parity §7で追加判断。既存タグの保持・copy・削除依存・package closureは必須で、C10/T04/F06–F09側へ含める。schemaの存在だけで管理画面を必須にしない |
| ローカルprofile／表示名設定 | 旧homeにはあるが新hostは合成identity。新Projectの利用者向けidentity／来歴表示要件と接続範囲をチーム導入時に確認。クラウドaccountやrolesは作らない |
| HEIC／video／audio | 現candidate非対象。PROD-16のpost-candidate要件を削除した意味ではない |
| 自動同一モデル判定／relation推測／位置remap／conflict winner | 禁止。判断量削減で越えてはいけない境界 |
| smooth-alpha一般保証、transmission、Compare、proxy自動生成／direct splat pick | 個別後続判断・research／gate。承認済み限定GS Proxyやhard chromaの継承とは別 |
| license／version／main／Pages／Service Worker／release | 今回の監査・次sliceの非対象。デプロイ承認を意味しない |

## 7. 監査記録と自己レビュー

- branch `g0-baseline`、HEAD `b73315b`。追跡中originに対してahead 20 / behind 0。
  今回fetchはしておらず、リモート最新状態を確認したという意味ではない。
- 開始時の変更は前の応答で作成したtodo/lessons/uiux-handoffの3文書のみ。
  今回runtime・package・lockfile・public・build設定・実データは変更しない。
- 3つのread-only調査lane: UI/Caption/Scene、モデル/描画/入力、保存/チーム/移行。
  直近の成果一覧だけでなくaccepted contract・41タスク・実コード・既存テストを照合した。
- b73315bの実行済み証拠を再利用: typecheck/build/HTTP graph PASS、
  109 test files / 1,919 PASS / 21 TODO。今回これらを再実行していない。
  docs-onlyは05 §13.2に従いdiff・参照・件数・契約の照合だけを行う。
- 主な新発見: 一覧mediaCount固定0、背景編集部品の未mount、追加色固定、
  個別window resize欠落、一時visibility未接続。Project選択／Caption削除だけの問題ではない。
- 古いmapの包括的な「v2未実装」「storage未接続」は経路限定に訂正する。
  合成新metadataサービスは存在するが、通常製品／実データへ採用済みではない。
- 独立の最終完全性レビューで補修Mesh＋hard exclusionの承認済み独立flowを追加し、
  最終64群とした。タグ編集／profile新設は未決へ分離。未保存保護・unplacedの批准段階・
  material gate・解消後blob保持の表現を訂正した。3担当の他のblocking findingなし。
  64群の排他的集計（19/5/29/11）、元41task全件・重複0、参照切れ0、
  新規文書の末尾空白0とgit diff --check PASSを確認済み。

完成の判断基準は [05 §12.6 TEAM-FLOW-01](../docs/specs/05-project-scene-team-workflow.md)。
テスト数・文書数・URLを再び開けることだけで製品完成としない。
