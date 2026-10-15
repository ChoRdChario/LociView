# 実装・接続の全体棚卸し

> 更新: 2026-10-15（限定product composition・承認済み初回変換の経路を追加。全体分類は2026-09-21時点）。本書は機能対応の正本。
> 実装順・現在の作業tree・実行結果は [todo](todo.md) を参照し、ここへ重複記載しない。
> 限定接続と製品受入れを区別し、通常画面・実機の新たな合格は主張しない。
> [以前の棚卸しと監査記録](../docs/history/development-through-2026-09-14/tasks/implementation-inventory.md) は履歴。

## 1. 結論と数え方

元の棚卸しは **64機能群**。2026-09-14のPO判断でF09（移行後の旧形式更新受信）を撤回し、
現在の要件は63群。限定接続済みの分類は **34群**、他分類は **29群**。
今回の実用チーム版はM13/M14を後続へ分けた **61群** が対象。F09の除外は完成ではない。
以下は最後に確認した接続分類であり、環境整理だけで件数を増やさない。
「34/64完成」といった完成率・工数には換算しない。小さい部品接続と
移行／チーム受信では仕事量が大きく違い、接続済みも下記の限定経路だからである。

| 排他的な主分類 | 群数 | 意味 |
|---|---:|---|
| 接続済み | 34 | 新metadata hostで操作・必要な記録まで接続。従来25群は既知三角形／2 PNG起点、P01/P02は限定validation、C04/C07/C09/C11/V04/M05/I04は両hostへ接続。実機受入れは別 |
| 部品未接続 | 4 | 新系統のUI部品・pure planner等はあるが、対象群全体の画面・実データ・typed command／保存のいずれかが未接続。T01〜T04は限定接続まで進んだ |
| 別経路のみ | 17 | Nativeまたはmemory／旧savedの相当操作はある。新source／サービス／rendererへの移植・接続が必要。配線だけとは限らない |
| 新規実装 | 8 | 新契約の機能群全体が未完了。限定的な実装・UI接続を含む行もあり、コード不在を意味しない |
| 要件撤回 | 1 | F09。移行した後は新形式で続ける運用に確定。完了・deferred・PASSには数えない |

- 一つの行は、共有する前提・保存境界を持つ「利用者の作業群」。同一ViewのCRUD等は一群。
  三つのモデル形式・五つのpackage目的・三つの移行元は異なる契約があるため別群。
- 同一行を複数分類へ加算しない。UI部品と保存commandの両方がない場合も一群のまま。
- Desktop／iPhone、単体／統合テスト、retryの各faultを機能数へ重複加算しない。
- §4の基盤・検証残件、§6の明示deferred／未決事項は、この64群とは別に管理する。
- 元の64群の識別子を保持した棚卸しであり、要件撤回と後続機能を区別する。全行を現在の合成接続sliceや最初の
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
| project-scene `storage=validation` | 静的GLBとPNG/JPEG/WebP/GIF画像 Projectの作成・一覧・再開、実本体read/renderと編集、限定Workspace/Contributionの実file入出力・中断復旧、名前付きbackup出力と確認付き復元・復元後の編集／返送、独立コピー出力・入力・編集／再開、選択Sceneの閲覧用出力・内容由来のstandalone View、明示確認した編集コピー・中断復旧・編集／再開。実行結果はtodo参照 | 通常home、正式profile／任意形式、実描画／実入力／実機／offlineの受入れ、全purpose／移行の完成 |
| 同じvalidationのNative初回変換 | GLB/PNG限定のrecipe-1に加え、承認済み07aのrecipe-2で不透明な元材質・不透明度1・クロマ無効の陰影／両面設定と無効中のパラメータを保持。面ごとの対応を検証し、Scene別の材質編集→名前付きbackup／独立Workspace／閲覧用file→cold再開を自動確認。元ZIP／私的対応表は通常出力に含めない。実行結果はtodo参照 | Native移行全体、半透明／有効クロマ、他profile／exchange、実GPU／実機／offlineの合格、正式profile採用 |
| 同じvalidationのfrozen-v1初回変換 | 承認済み07bの自己完結GLB/PNG・identity配置・透視視点のsubsetを内容判定→確認→新Projectへ接続。Scene順序、配置済み／未配置Caption、別identityの同一画像、重複添付とraw入力を保持。07fの追加recipe-4で全履歴の明示開始Viewを検査し、有効な同一Sceneの指定を最新Viewより優先してfile／世代復元後の編集・coldへ接続。07gのrecipe-5はscale／Y・Z-up／offsetをbindingへ写し、元GLBとlocal pinを保って同flowへ接続。編集／初回配置→名前付きbackup／独立Workspace／閲覧用file→cold再開・中断復旧を自動確認。元ZIP／私的対応表は通常出力に含めない。実行結果はtodo参照 | v1全体の変換、材質／平行投影／inline camera等の対応、実入力／GPU／実機／offlineの合格、通常入口や正式採用 |
| 同じvalidationのLociMyu初回変換 | 承認済み07cの単一静的GLB・正確に対応したPNGのsubset。生XLSX/CSVと全対応行から、表の選択／完全な関連確認／明示名→Scene・重複IDを保持したCaption・未配置・透視／承認済み近似の平行投影視点を構築。製品編集／初回配置→名前付きbackup／独立Workspace／閲覧file→cold再開と独立した説明保存を接続。原ZIP・私的receipt/reportは通常出力へ含めない。実行結果はtodo参照 | LociMyu移行全体、複数モデル／他model形式／有効材質、実入力／GPU／実機／offlineの合格、通常入口や正式採用 |
| 同じvalidationのJPEG companion | 承認済み[07d](../docs/specs/07d-jpeg-project-scene-proposal.md)の写真とGLB内JPEGを、exact2profile/4recipeで作成・変換・編集・元bytes保持・backup/Workspace/review・復元後編集/coldへ接続。写真はprimary Exif/通常色管理、textureは標準向き/ICC非authority。旧PNGと旧jobは不変更。実行結果はtodo参照 | 任意JPEG/他画像形式・active材質・実browser/GPU/実機/offline・通常入口・正式採用の合格 |
| 同じvalidationのWebP/GIF photo companion | 承認済み[07e](../docs/specs/07e-webp-gif-project-scene-proposal.md)の写真を、全container検査・一時default/first bitmap検査後、direct作成／後入れ・Native5/6/v1-3/Loci3変換・編集・backup/Workspace/review・世代復元後編集/coldへ接続。原bytes／metadata／browserの既存animation表示を保持。4 GLB profilesと旧PNG/JPEG jobsは不変更。実行結果はtodo参照 | GLB WebP/GIF、全frame pixel/playback／向き一致保証、実browser/実機/offline、通常入口・正式採用 |
| 同じvalidationの `editor=project` | Scene／Caption／ピン／PNG/JPEG/WebP/GIF画像と、モデル・保存した視点・材質の4作業タブを接続。GLB追加／差替／配置、一時表示／所属／重複解消、視点・背景、Project／Scene材質、登録PNG/JPEG/WebP/GIF画像の整理と共通viewerに加え、複数Caption比較窓の移動・サイズ変更・個別終了・接続線、確認付きCaption削除と明示的な親モデル変更を統合。新規作成は承認済みmap2を明示選択し、Scene別追加色・Shift／空欄からの数値配置・Captionからのowner再表示・Asset全Scene共通のピン倍率・保存状態とhelpも統合。既存Project／復旧中jobの形式は保持。保存・受渡し・受信・復元serviceを共有。対象ごとの自動検証・cold再開と未確認事項はtodo参照 | 全機能の移植、通常home、実描画・実入力・実機・offlineの合格。旧editorは保持し、分類件数は増やさない |

## 2. 全機能群

リンク先・行番号は各行を監査した時点のコード／仕様の位置。現在の行番号は対象ファイルで確認する。
「別経路のみ」のコードがあってもPoCをそのままproductionへ昇格させない。

### 入口・Scene

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| P01 | 実ファイルから新しいProjectを作る | 接続済み | 限定validation hostの内容判定→静的GLB/PNGと07dのJPEG・07eのWebP/GIF画像検査→fresh Project/Scene→実本体保存。未完了はreadyにせずexact retry。通常home／他形式／正式採用は未接続・未受入れ。 | [src/harness/projectScene/validationWorkspace.ts](../src/harness/projectScene/validationWorkspace.ts) / [src/projectFiles/creation.ts](../src/projectFiles/creation.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P02 | 端末内Projectを選択・切替・再開 | 接続済み | 専用validation一覧を保存serviceの公開状態からread-only生成。保存済みと未完了／要確認を区別。限定product headerから同じ選択入口へ戻り、IME／未確定／保存途中・復旧／file／mode切替を保護。UIだけのrun/mode助言は明示URLより低い優先で、catalogと実際のopen・表示成功後だけ記録。欠落／失敗は一覧・fileへ戻し、Project履歴は変更しない。既存namespace／通常homeは不変更。実browserは未確認。 | [src/harness/projectScene/validationCatalog.ts](../src/harness/projectScene/validationCatalog.ts) / [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P03 | Scene選択と4タブの移動 | 接続済み | Caption上部のSceneリスト。検索・選択等はScene別UI状態。共有編集と分離。 | [src/ui/projectScene/navigationControls.ts:23](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectSceneNavigation.test.ts:36](../tests/ui/projectSceneNavigation.test.ts) |
| P04 | Sceneを作る | 接続済み | CaptionタブのScene管理から作成し、新metadataへ保存。元Sceneの確定モデル所属だけを順序保持・fresh IDで複写。Caption/material/View/defaultはコピーせず、不完全sourceは拒否。 | [src/harness/projectScene/sceneAuthoringControls.ts](../src/harness/projectScene/sceneAuthoringControls.ts) / [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) |
| P05 | Scene名・Project開始Sceneを設定する | 接続済み | metadata hostとvalidationの統合editorで明示確定し、同じtyped commandへ保存。入力開始時のsourceを保持し、IME・古い対象・名前／default競合は通常操作で上書きしない。開始Sceneは次回起動に使い、現在Scene選択やentry Saved Viewとは別。失敗時の同一変更retry・受渡し・cold起動を自動確認。実画面／実機受入れは別。 | [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) / [src/ui/projectScene/projectWorkspace.ts](../src/ui/projectScene/projectWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P06 | 既存CaptionをSceneへ追加／外す | 接続済み | metadata hostとvalidationの統合editorにProject全体の検索・明示選択・所属だけの追加／除外を接続。同じCaptionの本文・他Scene・添付を保持し、owner表示／editor選択は自動変更しない。未知・重複・削除編集競合は要確認として拒否。成功後だけ現在Sceneの該当選択／窓を解除し、他Sceneの窓配置は保持。readonlyの検索／IME、exact retry・受渡し・cold再開を自動確認。実画面／実機受入れは別。 | [src/ui/projectScene/captionIncludeControls.ts](../src/ui/projectScene/captionIncludeControls.ts) / [src/ui/projectScene/projectRead.ts](../src/ui/projectScene/projectRead.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P07 | 閲覧と編集を選んで開く | 別経路のみ | 限定validationに意図的なlock-free View／fresh durable Editと同一画面切替を接続。Scene・カメラ・窓・検索を保持し、入力／未完了Editの切替を拒否。reviewはstandalone Viewで開き、明示確認で独立Projectの編集へ移る。開始前の失敗は元Viewと同じ作成準備を保持し、中断後は同じファイル欄から復旧。metadata hostの選択入口・通常home／実画面受入れが残るため行全体を完了としない。 | [src/harness/projectScene/validationModeHost.ts](../src/harness/projectScene/validationModeHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md) |

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
| M08 | モデルを差し替えて要確認のピンを直す | 接続済み | 合成prepared切替に加え、限定GLBの明示ファイル差し替え→更新Workspace受信→同一Assetの要確認ピン補正→Contribution返送を接続。論理Asset/Frame・全Scene配置/所属・Caption本文/位置/添付を保持。publication/display失敗のexact retry、実GLTF resident切替、手元本文/PNG保持、元座標/色の要確認pin表示、返送replay/cold再開を既存testsで確認。一般revision一覧・他profile・通常home／実機は未受入れ。 | [src/projectMetadata/modelReplacement.ts](../src/projectMetadata/modelReplacement.ts) / [src/harness/projectScene/modelReplacementControls.ts](../src/harness/projectScene/modelReplacementControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M09 | Projectからモデルを削除する | 接続済み | 全Scene所属・Caption anchor・material routingの原候補を検査し、参照ゼロのAssetだけ確認付きtombstone。未知／曖昧な参照は拒否。保存前の選択、本体／原履歴、後着参照と相手の未適用入力を保持。exact retry／cold reopen／再受信を限定hostで確認。cascade・物理消去・一般参照修復なし。 | [src/projectMetadata/assetDeletion.ts](../src/projectMetadata/assetDeletion.ts) / [src/harness/projectScene/assetDeletionControls.ts](../src/harness/projectScene/assetDeletionControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M10 | GSの配置補助モデルと配置可否を確認する | 別経路のみ | Nativeの明示same-Asset Proxyだけのpickを未継承。Proxyなしでは既存Caption保持、新配置拒否。 | [src/nativeGs/app.ts:380](../src/nativeGs/app.ts) / [tests/nativeGs/schemaResolver.test.ts:869](../tests/nativeGs/schemaResolver.test.ts) |
| M11 | ピンの表示サイズを調整する | 別経路のみ | 限定validationでは取込pinScaleを保持し、ピン描画へ反映済み。限定product compositionでは明示map2のAsset倍率編集・全Sceneのmarker反映・失敗時exact retry・backup/cold再開まで接続。map1は不変更。通常入口／実描画・実機受入れは未完で主分類は維持。 | [src/harness/projectScene/viewportModel.ts](../src/harness/projectScene/viewportModel.ts) / [src/harness/projectScene/viewportHost.ts](../src/harness/projectScene/viewportHost.ts) / [src/nativeGs/app.ts:1841](../src/nativeGs/app.ts) |
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
| C05 | Scene内のCaptionを検索・選択する | 接続済み | タイトル／本文検索と選択保持。作業中の窓化は10k論理行・可変高・keyboard・Scene復帰・pinから一覧への再表示を既存DOM recorderで確認。最終checkpoint／実描画・実機・全Project規模の受入れは別。タグ・添付説明の拡張検索は含めない。 | [src/ui/projectScene/captionListControls.ts](../src/ui/projectScene/captionListControls.ts) / [tests/ui/projectSceneCaptionList.test.ts](../tests/ui/projectSceneCaptionList.test.ts) |
| C06 | カラーサークルで一覧とピンを絞り込む | 接続済み | 全色／空集合、選択を失わない再表示経路。 | [src/ui/projectScene/captionListControls.ts:23](../src/ui/projectScene/captionListControls.ts) / [tests/ui/projectSceneCaptionList.test.ts:66](../tests/ui/projectSceneCaptionList.test.ts) |
| C07 | 一覧で添付の有無・件数を見分ける | 接続済み | metadata／限定GLB/PNG hostの添付recordを一回集計して一覧へ渡す。確定削除除外、曖昧な参照等は要確認、同じblobの複数添付も各1件。追加・削除・失敗後retry・cold reopenは既存tests、実画面／実機は未受入れ。 | [src/harness/projectScene/mediaHistory.ts](../src/harness/projectScene/mediaHistory.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectSceneMedia.test.ts](../tests/ui/projectSceneMedia.test.ts) |
| C08 | 複数Captionウィンドウを比較する | 接続済み | 順次開く・前面化・個別×・移動／キーボード・並べる・意味のある位置への接続線。限定product compositionにも既存local controlsで統合し、draft／IME・編集選択の分離、Scene復帰、共通画像viewer、同tokenの古い描画位置の拒否を接続テストで確認。実描画／実機は未受入れ。 | [src/ui/projectScene/captionWindowControls.ts](../src/ui/projectScene/captionWindowControls.ts) / [src/ui/projectScene/projectWorkspace.ts](../src/ui/projectScene/projectWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectSceneWindowConnection.test.ts](../tests/ui/projectSceneWindowConnection.test.ts) |
| C09 | Captionウィンドウのサイズを変える | 接続済み | 両hostと限定product compositionで右下drag／矢印／非drag選択を共有。Scene別local placementだけ変更し、本文・画像・scroll・他窓・選択・履歴を保持。取消・stale・extent変化／late入力とView操作・Edit切替拒否を既存testsで確認。productでは操作中のOrbit入力予約と取消時の解除、readonly調整も接続確認。実描画／実入力／短画面／実機は未受入れ。 | [src/ui/projectScene/captionWindowControls.ts](../src/ui/projectScene/captionWindowControls.ts) / [tests/ui/projectSceneWindowConnection.test.ts](../tests/ui/projectSceneWindowConnection.test.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| C10 | Project全体からCaptionを削除する | 接続済み | 影響Scene・添付・tag登録を確認し、Captionと観測済み全edgeを原子的tombstone。本文競合・Media/Tag/モデル本体を保持。保存失敗中は旧UI、exact retry／cold reopen、後着edge/delete-editの保持と警告、未適用入力の明示取消を確認。限定product compositionにも全依存の確認、失敗時の旧UI保持・exact retry、成功後の選択／窓解除、後着削除時のdraft保持・警告を接続。実描画／実機、復元・一般参照修復UIは別。 | [src/projectMetadata/captionDeletion.ts](../src/projectMetadata/captionDeletion.ts) / [src/harness/projectScene/captionDeletionControls.ts](../src/harness/projectScene/captionDeletionControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| C11 | 既存ピンの親モデルを設定・変更する | 接続済み | 05 §4.4のAsset A→B／既存ProjectAnchor→Assetを専用command、親選択・仮位置・gizmo・確定／取消へ接続。計算可能な3D位置、同じCaption ID／内容／Scene所属を保持し、不能時は面指定。全Scene影響・一覧のみの条件を提示。新metadata／限定GLB hostでretry／cold／全anchor競合を検査。実描画・実機・移行入口は未受入れ。限定product compositionにも空の変更先選択・現位置を保つpreview・対象面／gizmo・全Scene影響・取消・stale／IME／drag拒否・exact retry／cold再開を接続。新ProjectAnchor作成・真正な未配置C12とは別。 | [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md#44-explicit-pin-parent-changes-po-approved-2026-09-13) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [src/harness/projectScene/session.ts](../src/harness/projectScene/session.ts) |
| C12 | 未配置の記録を失わず読み込み、後で配置する | 新規実装 | 承認済みmap-2の未配置を一覧／内容編集／メディア／同一Captionの初回配置／保存・再開へ限定接続。既知ownerに限定し、ownerlessは検証済みの面選択から配置、数値だけで初回確定しない。破損・競合を未配置扱いにせず、3D座標は捏造しない。review／clean／作業一式・変更分・backupも保持。Native GLB/PNG限定変換からの初回配置も接続したが、初回変換の残り・通常入口・実描画／実機受入れが未完のため主分類は維持。 | [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md#94-unplaced-caption-preservation-2026-09-10) / [src/scene/types.ts](../src/scene/types.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |

### メディア

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| I01 | Project内メディアを添付・再利用し、説明・順序・添付解除を編集する | 接続済み | 合成2枚とvalidation保存PNGに加え、限定product compositionの既存commandへ統合。確認付き解除で元bytesと他Captionを保持。最後の解除後のWorkspace受渡し・編集継続・cold再開、未受領画像の選択除外と所有済み証拠消失の停止を自動確認。実入力受入れは別。 | [src/ui/projectScene/projectMedia.ts](../src/ui/projectScene/projectMedia.ts) / [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| I02 | 実画像ファイルを添付する | 別経路のみ | validation hostのPNG/JPEG/WebP/GIF後入れは同じcreateAttachment／journalへ限定接続。JPEGは07dのprimary Exif／元metadata保持で、拒否・元bytes retry・cold復旧を確認。WebP/GIFは07eの全container＋一時bitmap検査と原Blob表示で編集・受渡し・世代復元/coldへ限定接続。既存アニメーション表示の実browser／実入力／実機受入れは残り、行全体は完了としない。 | [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| I03 | 添付画像を開いて拡大・失敗時に再試行する | 接続済み | 合成bytesとvalidation保存PNGから表示。欠損をfixture画像で置換しない。保存後のgallery準備失敗も隠さず同じ添付を再確認。 | [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| I04 | サムネイルで選び、共通viewerで画像を前後確認する | 接続済み | 既知PNGのページ付きサムネイル選択→明示添付、panel／複数Caption windowから同一viewerの前後・終了・同じ対象retryを接続。readonly reviewも共通操作。Caption／attachment／resource IDを固定し、重複resourceへの独立添付・draft保持、Scene変更時終了、旧load/error破棄。通常home・新媒体・実browser／実機は未受入れ。 | [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [src/ui/projectScene/mediaPreview.ts](../src/ui/projectScene/mediaPreview.ts) / [tests/ui/projectSceneMedia.test.ts](../tests/ui/projectSceneMedia.test.ts) |

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
| A01 | 対象／Scene・Project範囲を選び、照明・表裏・hard chromaを編集／解除する | 接続済み | 既知三角形に加え、validation GLB全slotの照明／表裏／hard chroma／解除を接続。受信したappearance/compositing原候補の組合せを明示確定、同scope・面の重複keep-one後も通常編集／解除／返送を継続。一意な相方の原operation、scope優先順位・元材質・入力retryを保持。未対応効果は解消portでも拒否。実GPU／実機は未受入れ。 | [src/harness/projectScene/materialSession.ts](../src/harness/projectScene/materialSession.ts) / [src/harness/projectScene/metadataMaterialControls.ts](../src/harness/projectScene/metadataMaterialControls.ts) / [src/projectMetadata/materialResolution.ts](../src/projectMetadata/materialResolution.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A02 | 実Meshのmaterial／textureと複数slotを扱う | 別経路のみ | 静的GLBの全slotと実decoded材質をsource locatorで厳密対応。instance cloneへの照明／表裏／hard chromaとreset時PNG/PBR保持を限定接続。他Mesh形式・残る効果・Representation選択は未接続。元からunlit/両面/MASK/BLENDは原本表示のみ、編集しない。 | [src/harness/projectScene/validationRender.ts](../src/harness/projectScene/validationRender.ts) / [src/harness/projectScene/validationMaterials.ts](../src/harness/projectScene/validationMaterials.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A03 | 不透明度・soft chromaを安全な対応範囲で使う | 別経路のみ | UI intentはあるが新hostは拒否。承認済みmask/dither等の対応を明示しprofile/G0を確認。黙った変換は禁止。G1-Dが必要なのはExperimental smoothBlendで、滑らかな透過の一般保証は非対象。 | [src/harness/projectScene/materialSession.ts:37](../src/harness/projectScene/materialSession.ts) / [docs/specs/01-domain-rendering.md:449](../docs/specs/01-domain-rendering.md) |

### 保存

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| S01 | 保存状態を確認し、同じ作業を再開する | 接続済み | new metadataのoriginal history＋marker-last＋cold reopenと限定validation一覧。内部ackは「再開用データのみ」とし、未確定・失敗・復旧・閲覧状態を保持。限定product compositionのheaderは未適用／更新失敗／再開データを区別し、同token・非stale・照合済みbackupだけを保存ファイル一致と表示。生成やdownload開始は未確認のまま。限定validationで最後に正常に開けたProjectを実名付きで再開し、別Projectへの切替導線を接続し、未確定入力がある間は切替を防ぐ。壊れた／欠落した助言や実open・lease・表示失敗は成功通知せず一覧／fileへ戻す。通常入口の完全な切替導線、実browser／実機受入れは未完。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/ui/projectScene/navigationControls.ts](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| S02 | 中断・保存失敗から元の変更で再試行する | 接続済み | 旧公開表示を保持、未完了は編集制限、exact originalsを再使用。一般ファイルimportの復旧まで保証しない。 | [src/projectMetadata/session.ts:137](../src/projectMetadata/session.ts) / [src/projectMetadata/journal.ts](../src/projectMetadata/journal.ts) |
| S03 | 別タブから確認し、編集権を安全に扱う | 接続済み | readonly／refresh／lease handoffの限定接続。同時多人数編集・実機保証とは別。 | [src/harness/projectScene/metadataHost.ts](../src/harness/projectScene/metadataHost.ts) / [src/projectMetadata/persistence.ts](../src/projectMetadata/persistence.ts) |
| S04 | オフラインで起動・作業・終了後に再開する | 別経路のみ | 旧Nativeの合格経路は新hostへ流用不可。普通の製品導線／offline保存基盤の接続と新実測が必要。SW変更は現在非対象。 | [tasks/uiux-handoff.md](../tasks/uiux-handoff.md) / [docs/specs/05-project-scene-team-workflow.md:1064](../docs/specs/05-project-scene-team-workflow.md) |

### チーム

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| T01 | 配布された更新を手元の記録を保って受け取る | 部品未接続 | 新serviceの完全source受信／remote journalと合成タイトル／登録のUI受信を接続。限定GLB/PNG hostには実Workspaceファイル受信・入力再選択・cold復旧・同じeditor更新を接続。実Workspace／Contribution受信→Caption title/body比較・明示解消→通常編集→二巡目受信・再受信no-op→cold再開を既存統合testsで接続。通常UI、他対応形式、他競合UIの完全接続・実機受入れは残る、F01/F02参照。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/harness/projectScene/validationReceiveControls.ts](../src/harness/projectScene/validationReceiveControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| T02 | 元の配布状態を保持し、変更分を繰り返し返す | 部品未接続 | 限定GLB/PNGでは元Workspaceの交換基準を明示選択し、元Dの実file出力／受信／二巡／cold再開を同じserviceとfile欄へ接続。Contributionでは基準表を進めない。通常経路／他対応形式／実機受入れは残る。F02、06の批准境界を維持。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| T03 | 同じ項目の競合を比較し、明示的に解消する | 部品未接続 | 限定GLB/PNG実ファイルUIでCaption title/body・anchor/color、Scene名・開始View、View名／順序／camera／backgroundを明示解消。任意値の不在・完全な座標／カメラを保持し、温存中のScene／カメラ不変更、起動Scene競合はcold明示選択後に画面を開く。親のみ復元・Scene再登録・独立copy、同一AssetのGLB更新比較（readonly、pin/gizmoなし）とstatus選択も接続。元履歴・他モデル・未適用入力を保持し、exact retry／通常編集／Contribution返送／no-op／cold再開を既存testsで確認。開始View不在の解消は有効な元履歴参照の同一変更set/deleteとし、不正nullを新規生成しない。既存不正履歴は書換えず拒否。他field／他lifecycle、通常経路・実機受入れは残る。 | [src/harness/projectScene/metadataConflictControls.ts](../src/harness/projectScene/metadataConflictControls.ts) / [src/harness/projectScene/metadataAssetStatusControls.ts](../src/harness/projectScene/metadataAssetStatusControls.ts) / [src/harness/projectScene/modelCandidatePreview.ts](../src/harness/projectScene/modelCandidatePreview.ts) / [src/harness/projectScene/validationWorkspace.ts](../src/harness/projectScene/validationWorkspace.ts) / [src/harness/projectScene/metadataCaptionLifecycleControls.ts](../src/harness/projectScene/metadataCaptionLifecycleControls.ts) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) |
| T04 | 重複所属で片方／両方を選び、独立項目として残す | 部品未接続 | 限定GLB/PNG実ファイルUIでCaptionとモデルのkeep-one／独立keep-bothを接続。元登録を明示選択し、Caption／添付はfresh IDで本文・添付説明を独立編集。モデルは全slotとeffective Scene→Project材質を完全rekeyし、既存本体を複製せずfresh factsを検証。3登録→2コピーの位置・材質・GLB更新→Contribution返送no-op／cold再開、元Asset／他Scene／Caption不変とexact retryを既存testsで確認。一般Point/GS/Proxy等のcopy closure、通常経路・実機受入れは残る。 | [src/projectMetadata/membership.ts](../src/projectMetadata/membership.ts) / [src/projectMetadata/modelMembership.ts](../src/projectMetadata/modelMembership.ts) / [src/harness/projectScene/metadataMembershipControls.ts](../src/harness/projectScene/metadataMembershipControls.ts) / [src/projectFiles/modelFacts.ts](../src/projectFiles/modelFacts.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |

限定validationの `editor=project` にも、T03/T04の既存commandを使う
全Projectの競合確認を接続。Scene名／開始Scene、Caption本文の手動入力、
完全な位置／色候補（未設定を含む）、親Captionだけの削除・復元、
元の登録とone/bothを明示する独立コピーを扱う。開始Scene未解決のcold起動は
保存確認後だけeditorを作り、warm解消はScene・camera・未適用本文を保持する。
hidden ownerや別の位置調整中には比較previewを表示しない。失敗時の元変更retry、
実ファイル返送・cold再開の自動確認と残る実画面／実機受入れはtodo参照。
一般orphan／全lifecycle／他profileの修復は含めず、分類件数は変更しない。
[製品用の確認画面](../src/ui/projectScene/projectRecovery.ts) /
[検査済みread adapter](../src/harness/projectScene/productSources.ts) /
[接続テスト](../tests/projectFiles.test.ts)

### ファイル・移行

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| F01 | 自己完結したTeam Workspaceファイルを配布・開く | 新規実装 | 元履歴summary・全live強参照closureから実ZIPをstream生成し、header／CRC／SHA／source／summary／closureを検査。限定GLB/PNG一覧・editorに初回import／既存同系統への受信／cold復旧と固定source出力job／generated base／明示download／選び直したfileの一致確認を接続。共通base表・元履歴・手元編集を保持し、欠落したack証拠を補充しない。生成した実形式fileの二巡は既存tests。未知inventory制限、retention全体・通常UI／他形式／実browser・実機が残る。portable操作全体の完成ではない。 | [src/projectPackage/workspaceArchive.ts](../src/projectPackage/workspaceArchive.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [src/projectFiles/receiveWorkspace.ts](../src/projectFiles/receiveWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F02 | Contributionファイルを書き出し・取り込む | 新規実装 | 元D／delta summary／必要本体差分の実ZIPと、凍結base／wire／derived・receiver MのSession受信を限定GLB/PNGの同じfile欄へ接続。durable出力も明示base／元source／inventoryから生成し、cold retryで後の編集を混ぜない。独立indexで欠落jobを発見し、両出力のguardとwarm一覧を共有。二巡・M=0・再選択・欠落拒否・元モデル0readを検査。Contributionはbaseを更新しない。通常経路／他対応形式／実機受入れは未完了。実行結果はtodo。 | [src/projectPackage/contributionSource.ts](../src/projectPackage/contributionSource.ts) / [src/projectPackage/contributionOutputJob.ts](../src/projectPackage/contributionOutputJob.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [src/projectFiles/receiveWorkspace.ts](../src/projectFiles/receiveWorkspace.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F03 | 完全backupを書き出し・明示確認して復元する | 別経路のみ | 限定validationに名前付き出力・確認付き復元・専用元履歴初期化・復元base束縛・世代選択とcold再開を接続。元作業／current・conflict・base-only本体／交換基準・元証拠を保持し、復元後の編集→Contribution返送／再受信と中断・取消・表示retryを既存testsで確認。独立reviewの指摘は解消。通常home／実描画／実機・offlineと行全体の受入れは残り、主分類は変更しない。 | [src/projectPackage/backupSource.ts](../src/projectPackage/backupSource.ts) / [src/projectPackage/backupArchive.ts](../src/projectPackage/backupArchive.ts) / [src/projectPackage/backupOutputJob.ts](../src/projectPackage/backupOutputJob.ts) / [src/projectPackage/backupRestoreJob.ts](../src/projectPackage/backupRestoreJob.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F04 | 一つのSceneを閲覧用に共有する | 別経路のみ | 限定validationで選択Sceneのhistory-free closure・typed re-key・実ZIP出力／確認・凍結retry、既存ファイル入口からのstandalone View、明示独立編集コピー・永続job・既存欄での復旧・編集／cold再開を接続。View単独では編集metadataを作らず、非visual ownerは一覧／窓のみ。編集コピーは元bytes・新しい実metadata bytesを固定し、欠落した承認済み証拠を再生成せず、後続編集を保持する。通常home／他profile／実ブラウザ・実機・offline受入れは残る。実行結果はtodo参照。 | [src/projectPackage/reviewSelection.ts](../src/projectPackage/reviewSelection.ts) / [src/projectPackage/reviewOutputJob.ts](../src/projectPackage/reviewOutputJob.ts) / [src/projectPackage/reviewEditJob.ts](../src/projectPackage/reviewEditJob.ts) / [src/harness/projectScene/reviewWorkspace.ts](../src/harness/projectScene/reviewWorkspace.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F05 | 全Sceneを独立Projectとして複製して渡す | 別経路のみ | 限定validationで現在の全Scene／素材／記録のtyped re-key・fresh history・実ZIP出力、件数と匿名化しない境界の事前確認、独立Projectへの入力・編集・cold再開を接続。元履歴／削除値／交換基準を出力せず、元Projectは保持。中断時は同じID・原本から再開し、既存コピーへの再入力は上書きせず一覧再開を案内。通常home／他profile／実描画・実機・offlineの受入れは残る。最終チェックはtodo参照。 | [src/projectPackage/cleanSource.ts](../src/projectPackage/cleanSource.ts) / [src/projectPackage/cleanOutputJob.ts](../src/projectPackage/cleanOutputJob.ts) / [src/projectPackage/cleanInputJob.ts](../src/projectPackage/cleanInputJob.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F06 | 現Native Projectを新Project/Sceneへ一度移行する | 新規実装 | 07 §5.3と07aの限定appearance、07dのJPEG・07eのWebP/GIF写真追加を含むportable Native変換を検証経路のファイル選択→確認→編集／初回配置→backup・作業一式→再開へ接続。Scene順序、非表示モデル、未配置、pin倍率、別media identity、元材質を保持。入力ZIPと対応表は私的な変換記録として保管し、通常出力には含めない。半透明／有効クロマ等のappearance残り、exchange・他形式、通常入口、実描画／実機受入れが残るため行全体は未完。旧形式の継続更新・bridgeは不要。 | [docs/specs/07-project-scene-migration.md](../docs/specs/07-project-scene-migration.md) / [src/projectFiles/nativeConversion.ts](../src/projectFiles/nativeConversion.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| F07 | frozen v1を新Project/Sceneへ変換する | 新規実装 | 承認済み07bのGLB/PNGと07dのJPEG・07eのWebP/GIF写真追加・identity配置・透視視点の初回変換を、検証経路の内容判定→確認→編集／初回配置→backup・作業一式・閲覧用file→再開へ限定接続。raw ZIP／log・対応表を私的に保持し、通常出力へ含めない。対応外データは全体拒否。初期保存の中断／完了後retryと変換証拠欠落も検証。07fの明示開始Viewはrecipe-4で既存旧domainと分離し、exact元履歴・保存・世代復元後編集／coldへ接続。07gの追加recipe-5で非identity配置とモデル内pinを保持し、offsetの明示確認から同じ保存・実世代復元後編集／coldへ接続。材質・平行投影・inline camera・他形式／実入力・通常入口／実機受入れが残るため行全体の主分類は維持。凍結readerは変更しない。 | [docs/specs/07b-frozen-v1-conversion-proposal.md](../docs/specs/07b-frozen-v1-conversion-proposal.md) / [src/projectFiles/frozenV1Conversion.ts](../src/projectFiles/frozenV1Conversion.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| F08 | LociMyu ZIPを新Project/Sceneへ変換する | 新規実装 | 07cの単一GLB／exact PNG subsetと07dのJPEGと07eのWebP/GIF additive recipesを限定validationで接続。生原本／重複identity／known-owner unplaced／視点／独立report／中断復旧を保持。全形式・有効材質・実入力受入れは残るため群全体の分類件数は変えない。Google／曖昧relationは有効化しない。 | [07c](../docs/specs/07c-locimyu-project-scene-conversion-proposal.md) / [lociMyuConversion.ts](../src/projectFiles/lociMyuConversion.ts) / [tests](../tests/projectFiles.test.ts) |
| F09 | 移行後に届いた旧Nativeの変更を受け入れる | 要件撤回 | PO判断 2026-09-14。移行後は新形式のファイルだけで編集・受け渡しを続ける。bridgeは実装対象外。初回変換・新形式同士の統合は維持。 | [docs/specs/07-project-scene-migration.md](../docs/specs/07-project-scene-migration.md) |
| F10 | ファイル内容・影響を確認し、取消／不正入力から回復する | 別経路のみ | 限定GLBとPNG/JPEG/WebP/GIF画像のfile欄に内容由来のWorkspace／Contribution検査、形式・目的・影響の確認、失敗・未確定入力の保持、再選択／retry／明示取消を接続済み。backup出力と確認付き復元・専用再開／取消、独立コピーの件数・匿名化しない境界の確認／入力／中断復旧も接続。reviewのScene・件数・埋込情報保持の確認、readonly入力、凍結出力再開・保存先の別確認も接続。View自体の永続再開ではない。全purpose／移行元／通常homeを一つの利用者導線として完結する部分は残る。filenameからpurposeを推測しない。 | [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/nativeGs/homeUi.test.ts:476](../tests/nativeGs/homeUi.test.ts) / [docs/specs/06-project-package-wire.md:31](../docs/specs/06-project-package-wire.md) |

F01–F05の限定validation UIは、名前付きの「保存」を標準とし、
「相手に渡す」で作業一式／変更分を選ぶ構成へ接続。閲覧共有・独立コピーと
作成済みファイル一覧は段階表示する。生成からダウンロードへ続けて進み、
失敗時・中断再開時も同じ生成物から再試行する。ダウンロード開始と保存先の
確認は区別したまま。実ブラウザ・実機受入れは未完了で、上記の主分類は変えない。

### 利用支援

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| H01 | 使い始め・記録・保存共有・困ったときの案内を開く | 別経路のみ | 限定product compositionに、開始／記録／保存と共有／復旧の4節helpを接続。Shift・数値代替と同一Project交換、ブラウザ再開データと確認済み外部ファイルを区別。通常入口／実browser受入れは未完で主分類は維持。 | [src/nativeGs/app.ts:2810](../src/nativeGs/app.ts) / [src/harness/projectScene/workspace.ts:78](../src/harness/projectScene/workspace.ts) |
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
追加色、ウィンドウresize等も§2へ含めた。移行後bridgeのF09は要件撤回として保持する。
LociMyuからのタブ構成、Sceneに相当する記録切替、直接色選択、連続追加、複数window、
画像確認、視点補助を照合。Google依存・内部sheet構造・単一モデル前提・無確認削除は継承しない。

## 4. 機能数とは別の、基盤・証拠・採用残件

「証拠だけがない」と「一般用途への実装もない」を区別する。

| ID | 境界 | 再利用できるもの | 残りの種類・具体的な不足 |
|---|---|---|---|
| E01 | 保存／CAS／GC／大容量I/O | 新original-byte journal、metadata-only cold evidence、非活性OriginBlobStoreのbounded stream／保存後検証／不変receipt／実inventory→metadata作成・再開、隔離CAS・retentionと500 MiB保存本体のPO readback | **実装＋証拠**。新storeの実OPFS・Web Locks・iOS証拠とhost接続、全Project/conflict/opaque/未完了journal等のroot producer、origin-wide GC、bounded browser/iOS出力、実中断。MemoryFSの一般bytes試験をプラットフォーム採用証拠にせず、過去の500 MiB最初の完了ログ不明をFAIL扱いして同じreadbackを繰り返さない |
| E02 | 実モデル・Representation／renderer | 旧Nativeの限定Mesh/Point/GS/Proxy、各loader、known triangle content verifier | **実装＋採用**。実body admission、Frame/catalog/texture/family証拠、Representation選択と対応外の局所的fallback、資源解放。shared-view合成・hard mask・dither等の各gateを確認。M01–M03/A02と補修操作M14の技術前提で、同じ作業をここで重複加算しない |
| E03 | 新wire・移行recipe | 5-purposeの意味的closure PoC、原履歴／prepared migrationの隔離証拠 | **孤立実装＋採用／初回移行の残件**。06 §11の実装先行と§12.6のreview/edit-copy方針は承認済み。実装は各F行・todoを参照。一般profile／容量保証／採用、07の初回source mappingと必要target差分は残る。late bridgeは撤回済みで、そのPoCを再実行・採用条件化しない。 |
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

## 5. 実装順

実行順は [todoの現在境界](todo.md) に一本化する。承認済みの実用チーム版を
全体先行でつなぎ、各行の実装・UI接続・実機受入れを混同しない。
内部部品の完了を新しい利用者操作の完成として数えず、M13/M14と撤回F09は今回の61群に含めない。

## 6. 明示deferred／判断未確定（64群へ加算しない）

06 §11の孤立実装／一般採用の分離、§12.6のreview/edit-copyと既知位置の要確認pin表示は承認済み。
限定snapshot writerと永続review edit-copyは接続されているが、07の移行profile、通常home／実機／公開の受入れ・批准を意味しない。
以下の非対象・後続要件は維持する。

| 対象 | 扱い |
|---|---|
| Scene複製／削除／並替えUI | 05 §14で最初の限定candidateは明示deferred。core削除guardがあることとUI予定は別 |
| 新規Project-space Caption、Sceneごとのrevision／alignment、Scene media layer、汎用Unity階層 | 明示非対象。既存ProjectAnchor読取・置き直しC11とは別 |
| Captionの一般Undo/Redo・一般複製・前後巡回 | 現状なし。旧parityでも要追加判断／確認待ち。承認済み必須欠落として数えない。モデルalignment固有の復帰M13とは別 |
| 任意baseColor入力 | 元materialの色保持・描画解釈はあるが入力UIなし。現在のaccepted editable fieldsとは別なので、勝手に新機能化しない |
| タグ編集UI | 新規作成・編集・管理UIは旧parity §7で追加判断。既存タグの保持・copy・削除依存・package closureは必須で、C10/T04/F06–F08側へ含める。schemaの存在だけで管理画面を必須にしない |
| ローカルprofile／表示名設定 | 旧homeにはあるが新hostは合成identity。新Projectの利用者向けidentity／来歴表示要件と接続範囲をチーム導入時に確認。クラウドaccountやrolesは作らない |
| HEIC／video／audio | 現candidate非対象。PROD-16のpost-candidate要件を削除した意味ではない |
| 自動同一モデル判定／relation推測／位置remap／conflict winner | 禁止。判断量削減で越えてはいけない境界 |
| smooth-alpha一般保証、transmission、Compare、proxy自動生成／direct splat pick | 個別後続判断・research／gate。承認済み限定GS Proxyやhard chromaの継承とは別 |
| license／version／main／Pages／Service Worker／release | 今回の監査・次sliceの非対象。デプロイ承認を意味しない |

## 7. 更新記録

2026-09-14: 古い三slice予定・重複した経緯を履歴へ移し、実行順をtodoへ集約。
F03/F10とvalidation経路を復元・編集・返送、F05を独立コピー・編集・再開の限定接続へ更新。分類件数は変更せず、
内部／recorded DOM検証と、未受入れの実ブラウザ・実機・通常homeを区別する。
