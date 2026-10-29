# 実装・接続の全体棚卸し

> 更新: 2026-10-29（限定Point/GS・Proxy、Native・Mesh／標準材質変換と01gのPC候補表示を反映。接続分類は2026-09-21時点、M14の任意化のみ本日のPO確認を反映）。本書は機能対応の正本。
> 実装順・現在の作業tree・実行結果は [todo](todo.md) を参照し、ここへ重複記載しない。
> 限定接続と製品受入れを区別し、通常画面・実機の新たな合格は主張しない。
> [以前の棚卸しと監査記録](../docs/history/development-through-2026-09-14/tasks/implementation-inventory.md) は履歴。

[承認済み01e](../docs/specs/01e-desktop-large-gs-workflow.md)のPC候補は、
`src/projectScene`の実データ用Host・型付き編集・ファイル操作を通常トップへ接続する独立ビルド。
以前の検証経路と同じ保存領域を継続し、新規作成はProjectSceneを使う。
GS専用上限と全既知本体の合計、画面全体の表示予定・実インスタンスの解放管理、
閲覧用からのnative編集コピーを含む。現在の実行結果と未完了項目はtodoを参照。
この接続を全体adoption・iPhone・offline・公開の合格として加算しない。
同仕様§9のtyped読み込み経路では、検証済みCaptionの閲覧・検索を先に開き、
準備済みモデルを順に表示する。未準備箇所は回転マーク・状態・再試行を示す。
全source・template・材質検証前の編集／通常ファイル操作は制限し、GPU状態は
局所表示と既存の対象別pick条件で扱う。初回／通常復元の選択前検証は維持する。
これは既存の操作群の接続改善で、機能数やadoption合格を加算しない。

[01f](../docs/specs/01f-desktop-smooth-composition-evaluation.md)の隔離PC評価と、
承認済み[01g](../docs/specs/01g-desktop-smooth-display-proposal.md)の製品実装は別の証拠経路。
01e PC候補だけにMesh／GSの近似透過表示、内部解像度の自動調整、document共通の
64MiB未満の追加target予算を接続する。通常／validationの局所smooth非表示は保持する。
保存済み意図・原本／全SH・既存profile／pick規則とファイル契約は不変。
以下の07n変換行の局所非表示はvalidation側の記述で、Desktop側は01gの条件付き表示を使う。
実行結果・未実行条件はtodoを参照し、一般採用や群全体の完成に加算しない。

01e PC候補では、限定50万点SH4の閲覧ファイルから、ロック拒否後の再試行→
独立した編集コピー→実際の追記→保存→完全終了後の再開・全記録一致を確認した。
原本・ピン・添付と保存形式は保持する。対応全形式・一般採用・実機／offlineの
合格とは区別し、現在の数え方や未対応profileの分類は変更しない。

## 1. 結論と数え方

元の棚卸しは **64機能群**。2026-09-14のPO判断でF09（移行後の旧形式更新受信）を撤回し、
2026-10-29のPO確認でM14（補修Mesh）を任意・完成条件外として整理した。必須要件は **62群**、
今回の実用チーム版は後続M13を除く **61群** が対象。除外・任意化は完成ではない。
これは以前の実用版境界の集計。PO2026-10-29の「1〜4をまとめて実装」により、
限定alignmentと日常の整理・反復編集も現在の作業へ含めた。[仕様08](../docs/specs/08-daily-authoring-workflow.md)
とtodoが現在の範囲・検証を管理し、この旧分母から優先順位や完成率を算出しない。
2026-09-21の接続分類は限定接続済み **34群**、他分類 **29群** だった。
以下はその接続分類を保ち、M14だけを新規実装から任意へ移したもの。現在の実装数の再集計ではない。
「34/64完成」といった完成率・工数には換算しない。小さい部品接続と
移行／チーム受信では仕事量が大きく違い、接続済みも下記の限定経路だからである。

| 排他的な主分類 | 群数 | 意味 |
|---|---:|---|
| 接続済み | 34 | 新metadata hostで操作・必要な記録まで接続。従来25群は既知三角形／2 PNG起点、P01/P02は限定validation、C04/C07/C09/C11/V04/M05/I04は両hostへ接続。実機受入れは別 |
| 部品未接続 | 4 | 新系統のUI部品・pure planner等はあるが、対象群全体の画面・実データ・typed command／保存のいずれかが未接続。T01〜T04は限定接続まで進んだ |
| 別経路のみ | 17 | Nativeまたはmemory／旧savedの相当操作はある。新source／サービス／rendererへの移植・接続が必要。配線だけとは限らない |
| 新規実装 | 7 | M14任意化後の分類。新契約の機能群全体が未完了。限定的な実装・UI接続を含む行もあり、コード不在を意味しない |
| 任意・完成条件外 | 1 | M14。手動ピン調整に補修Meshは不要。必須残件・自動的な後続予定には数えず、利用者の必要が生じた場合に再判断する |
| 要件撤回 | 1 | F09。移行した後は新形式で続ける運用に確定。完了・deferred・PASSには数えない |

- 一つの行は、共有する前提・保存境界を持つ「利用者の作業群」。同一ViewのCRUD等は一群。
  三つのモデル形式・五つのpackage目的・三つの移行元は異なる契約があるため別群。
- 同一行を複数分類へ加算しない。UI部品と保存commandの両方がない場合も一群のまま。
- Desktop／iPhone、単体／統合テスト、retryの各faultを機能数へ重複加算しない。
- §4の基盤・検証残件、§6の明示deferred／未決事項は、この64群とは別に管理する。
- 元の64群の識別子を保持し、要件撤回・任意機能・後続要件を区別する。全行を現在の合成接続sliceや最初の
  candidate必須gateへ追加しない。完全alignmentは後続要件、M14は必要が生じた場合に再判断する任意機能。
  閉じた旧Native受入れをこの件数で再オープンしない。
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
| project-scene `storage=validation` | 静的GLB／07lのSTL・Mesh PLY・OBJ・自己完結glTF／01aのXYZ-RGB ASCII PLY／01cのbinary SH0〜4 GSと任意Proxy、PNG/JPEG/WebP/GIF画像 Projectの作成・一覧・再開、実本体read/renderと編集、限定Workspace/Contributionの実file入出力・中断復旧、名前付きbackup出力と確認付き復元・復元後の編集／返送、独立コピー出力・入力・編集／再開、選択Sceneの閲覧用出力・内容由来のstandalone View、明示確認した編集コピー・中断復旧・編集／再開。専用Chromiumの限定実行結果はtodo参照 | 通常home、正式profile／任意形式、全ケースの実描画／実入力／実機／offlineの受入れ、全purpose／移行の完成 |
| validation／01e DesktopのNative初回変換 | 既存GLB・写真／限定材質recipeに加え、承認済み[07k](../docs/specs/07k-native-point-gs-proxy-conversion-proposal.md)のrecipe7でXYZ/RGB ASCII Point・Native SH2/3 GS・GLB Proxyと混在GLBを接続。07lのrecipe8はSTL・Mesh PLY・OBJ・自己完結glTFのNative Mesh／Proxyを追加し、旧GLBの材質対応を保つ。単位不明・原本・座標変換・手動pin・GS/Proxy関係を保持し、編集・全5purpose／2往復・Review編集コピー・独立コピー・復元／coldへつなぐ。DesktopだけNative原ZIP512MiB枠、公開本体512MiB／GS50万行の既存上限。07m recipe9のopaque元材質に加え、07n recipe10で有効クロマ・不透明度・元MASK／BLENDを新形式操作へ統一し、変換前に実Scene／モデル／材質と理由を示す。滑らかな透過の面は設定を保って局所非表示とし、明示した切り抜きへ変更可能。元ZIP／私的対応表は通常出力に含めず、実行結果はtodo参照 | Native全profile／exchange入力、外部参照・対象外subset、滑らかな半透明の描画、実機／offline、通常PWA／正式採用 |
| 同じvalidationのfrozen-v1初回変換 | 承認済み07bの自己完結GLB/PNG・identity配置・透視視点のsubsetを内容判定→確認→新Projectへ接続。Scene順序、配置済み／未配置Caption、別identityの同一画像、重複添付とraw入力を保持。07fのrecipe-4は同Sceneの明示開始Viewを優先、07gのrecipe-5はscale／Y・Z-up／offsetをbindingへ写し元GLB/local pinを保持。07iのrecipe-6は正確なdecoded keyと一意なbase slotだけをScene別陰影／両面へ写し、無効中chroma値は原本／説明のみ保持。編集／初回配置→名前付きbackup／独立Workspace／閲覧file→実世代復元後編集／cold・中断復旧を限定自動確認。07m recipe7のopaque元材質に加え、07n recipe8で有効クロマ・不透明度・元MASK／BLENDを標準操作へ統一し、事前に実対象と理由を説明する。滑らかな透過の面は設定を保持して局所非表示。元ZIP／私的対応表は通常出力に含めない。実行結果はtodo参照 | v1全体、名前fallback／共有材質broadcast／滑らかな半透明の描画／平行投影／inline camera、実入力／GPU／実機／offline、通常入口や正式採用 |
| 同じvalidationのLociMyu初回変換 | 承認済み07cの単一静的GLB・正確な画像関係に07d/07e写真追加と07h限定陰影／両面を接続。生XLSX/CSVと全対応行から、表の選択／完全な関連確認／明示名→Scene・重複IDを保持したCaption・未配置・透視／承認済み近似の平行投影視点を構築。製品編集／初回配置→名前付きbackup／独立Workspace／閲覧file→cold再開と独立した説明保存を接続。07m recipe5のopaque元材質に加え、07n recipe6で有効クロマ・不透明度・元MASK／BLENDを標準操作へ統一し、実対象と理由を事前説明する。滑らかな透過の面は設定を保持して局所非表示。原ZIP・私的receipt/reportは通常出力へ含めない。実行結果はtodo参照 | LociMyu移行全体、複数モデル／他model形式／滑らかな半透明の描画、実入力／GPU／実機／offlineの合格、通常入口や正式採用 |
| 同じvalidationのJPEG companion | 承認済み[07d](../docs/specs/07d-jpeg-project-scene-proposal.md)の写真とGLB内JPEGを、exact2profile/4recipeで作成・変換・編集・元bytes保持・backup/Workspace/review・復元後編集/coldへ接続。写真はprimary Exif/通常色管理、textureは標準向き/ICC非authority。旧PNGと旧jobは不変更。実行結果はtodo参照 | 任意JPEG/他画像形式・active材質・実browser/GPU/実機/offline・通常入口・正式採用の合格 |
| 同じvalidationのWebP/GIF photo companion | 承認済み[07e](../docs/specs/07e-webp-gif-project-scene-proposal.md)の写真を、全container検査・一時default/first bitmap検査後、direct作成／後入れ・Native5/6/v1-3/Loci3変換・編集・backup/Workspace/review・世代復元後編集/coldへ接続。原bytes／metadata／browserの既存animation表示を保持。4 GLB profilesと旧PNG/JPEG jobsは不変更。実行結果はtodo参照 | GLB WebP/GIF、全frame pixel/playback／向き一致保証、実browser/実機/offline、通常入口・正式採用 |
| 同じvalidationの `editor=project` | Scene／Caption／ピン／PNG/JPEG/WebP/GIF画像と、モデル・保存した視点・材質の4作業タブを接続。GLB追加／差替／配置と01a Point追加／局所点径／配置と01c GS追加／位置指定用の面の追加・変更・解除（Point／GS Projectはtyped UIを選択）、一時表示／所属／重複解消、視点・背景、Project／Scene材質、登録PNG/JPEG/WebP/GIF画像の整理と共通viewerに加え、複数Caption比較窓の移動・サイズ変更・個別終了・接続線、確認付きCaption削除と明示的な親モデル変更を統合。新規作成は承認済みmap2を明示選択し、Scene別追加色・Shift／空欄からの数値配置・Captionからのowner再表示・Asset全Scene共通のピン倍率・保存状態とhelpも統合。既存Project／復旧中jobの形式は保持。保存・受渡し・受信・復元serviceを共有。対象ごとの自動検証・cold再開と未確認事項はtodo参照 | 全機能の移植、通常home、実描画・実入力・実機・offlineの合格。旧editorは保持し、分類件数は増やさない |

## 2. 全機能群

リンク先・行番号は各行を監査した時点のコード／仕様の位置。現在の行番号は対象ファイルで確認する。
「別経路のみ」のコードがあってもPoCをそのままproductionへ昇格させない。

### 入口・Scene

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| P01 | 実ファイルから新しいProjectを作る | 接続済み | 限定validationの単一「ファイルを開く」から内容判定→全選択GLB・07l STL／Mesh PLY／OBJ／自己完結glTF／01a XYZ-RGB ASCII PLY／01c binary SH0〜4 GS／PNGと07dのJPEG・07eのWebP/GIF画像→条件付き名前確認→fresh Project/Scene→実本体保存。複数モデルの選択順序を保持し、開く失敗は同一initial/run、採用後の未完了はHostのexact retry。一般の通常入口／外部参照・対象外subset／正式採用は未接続・未受入れ。 | [src/harness/projectScene/validationWorkspace.ts](../src/harness/projectScene/validationWorkspace.ts) / [src/projectFiles/creation.ts](../src/projectFiles/creation.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P02 | 端末内Projectを選択・切替・再開 | 接続済み | 専用validation一覧を保存serviceの公開状態からread-only生成。保存済みと未完了／要確認を区別。限定product headerから同じ選択入口へ戻り、IME／未確定／保存途中・復旧／file／mode切替とselector内の未適用選択・初回attemptを保護。UIだけのrun/mode助言は明示URLより低い優先で、catalogと実際のopen・表示成功後だけ記録。欠落／失敗は一覧・fileへ戻し、Project履歴は変更しない。既存namespace／通常homeは不変更。専用Chromiumの限定選択・cold再開はtodo参照。通常home／全ケース・実機受入れは未完。 | [src/harness/projectScene/validationCatalog.ts](../src/harness/projectScene/validationCatalog.ts) / [src/harness/projectScene/validationHost.ts](../src/harness/projectScene/validationHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P03 | Scene選択と4タブの移動 | 接続済み | Caption上部のSceneリスト。検索・選択等はScene別UI状態。共有編集と分離。 | [src/ui/projectScene/navigationControls.ts:23](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectSceneNavigation.test.ts:36](../tests/ui/projectSceneNavigation.test.ts) |
| P04 | Sceneを作る | 接続済み | CaptionタブのScene管理から作成し、新metadataへ保存。元Sceneの確定モデル所属だけを順序保持・fresh IDで複写。Caption/material/View/defaultはコピーせず、不完全sourceは拒否。 | [src/harness/projectScene/sceneAuthoringControls.ts](../src/harness/projectScene/sceneAuthoringControls.ts) / [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) |
| P05 | Scene名・Project開始Sceneを設定する | 接続済み | metadata hostとvalidationの統合editorで明示確定し、同じtyped commandへ保存。入力開始時のsourceを保持し、IME・古い対象・名前／default競合は通常操作で上書きしない。開始Sceneは次回起動に使い、現在Scene選択やentry Saved Viewとは別。失敗時の同一変更retry・受渡し・cold起動を自動確認。実画面／実機受入れは別。 | [src/projectMetadata/sceneAuthoring.ts](../src/projectMetadata/sceneAuthoring.ts) / [src/ui/projectScene/projectWorkspace.ts](../src/ui/projectScene/projectWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P06 | 既存CaptionをSceneへ追加／外す | 接続済み | metadata hostとvalidationの統合editorにProject全体の検索・明示選択・所属だけの追加／除外を接続。同じCaptionの本文・他Scene・添付を保持し、owner表示／editor選択は自動変更しない。未知・重複・削除編集競合は要確認として拒否。成功後だけ現在Sceneの該当選択／窓を解除し、他Sceneの窓配置は保持。readonlyの検索／IME、exact retry・受渡し・cold再開を自動確認。実画面／実機受入れは別。 | [src/ui/projectScene/captionIncludeControls.ts](../src/ui/projectScene/captionIncludeControls.ts) / [src/ui/projectScene/projectRead.ts](../src/ui/projectScene/projectRead.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| P07 | 閲覧と編集を選んで開く | 別経路のみ | 限定validationに意図的なlock-free View／fresh durable Editと同一画面切替を接続。Scene・カメラ・窓・検索を保持し、入力／未完了Editの切替を拒否。reviewはstandalone Viewで開き、明示確認で独立Projectの編集へ移る。開始前の失敗は元Viewと同じ作成準備を保持し、中断後は同じファイル欄から復旧。metadata hostの選択入口・通常home／実画面受入れが残るため行全体を完了としない。 | [src/harness/projectScene/validationModeHost.ts](../src/harness/projectScene/validationModeHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md) |

### モデル

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| M01 | Meshを追加・表示する | 別経路のみ | validation／専用PC候補で静的GLBと07lのSTL・Mesh PLY・OBJ・自己完結glTFを、同じ内容判定入口から新規作成／現在Sceneへの追加／差し替え／GSの位置指定用の面へ接続。元bytes・座標・材質の面順を保持し、編集・5purpose・コピー・復元／再開へ継続。単位なしの新規Projectは単位不明。OBJの外部材質・画像は取得せず、該当時だけ確定前に案内する。対応外の宣言・外部参照等は拒否し、正式profile／実機／一般対応の受入れは残る。全体分類は旧棚卸し時点を維持し、限定subsetを行全体の完成にしない。 | [07l](../docs/specs/07l-mesh-import-conversion-proposal.md) / [validationHost](../src/projectScene/validationHost.ts) / [mesh source](../src/projectFiles/meshSource.ts) / [tests](../tests/projectFiles.test.ts) |
| M02 | 通常Pointを追加・表示・pickする | 別経路のみ | 01aのexact XYZ/RGB ASCII PLYを追加／表示／選択／Caption・画像／全file／復元・coldへ接続。07kのNative Point変換はunknown／metresと元座標変換を保持し、変換後の点index選択・編集コピーへ接続。binary discのみ、代表DPR1/2描画とDPR3局所Unsupportedを専用Chromiumで確認。一般PLY／Point全体、dither・smooth、Point差替・変換・copyの一般対応や実機／offline／採用は残る。最終チェックと実行範囲はtodo参照。 | [src/projectFiles/pointPly.ts](../src/projectFiles/pointPly.ts) / [01a](../docs/specs/01a-point-project-scene-proposal.md) / [07k](../docs/specs/07k-native-point-gs-proxy-conversion-proposal.md) |
| M03 | GSを追加・表示する | 別経路のみ | 01cのexact binary PLY SH0〜4とGSL1.4.3線形合成を限定接続。01dでFile/Blob原本の分割検査・hash・CAS保存／再開。validationは64MiB集約枠、01e専用Desktop候補は原本512MiB／GS合計50万行の別policy。07kは既存Native SH2/3を全係数再検査しGLB Proxyと一緒に変換／編集／受渡し／復元・coldへ接続。SH4 paging・一般通常入口・実機・正式採用は残る。実行範囲はtodo参照。 | [GS inspector](../src/projectFiles/gsPly.ts) / [GS adapter](../src/viewer/gsRender.ts) / [01e](../docs/specs/01e-desktop-large-gs-workflow.md) / [07k](../docs/specs/07k-native-point-gs-proxy-conversion-proposal.md) |
| M04 | モデル選択・検索とScene所属を管理する | 接続済み | 既知モデルのinclude/exclude。Assetそのものは残る。 | [src/ui/projectScene/modelListState.ts:15](../src/ui/projectScene/modelListState.ts) / [tests/ui/projectMetadataHost.test.ts:535](../tests/ui/projectMetadataHost.test.ts) |
| M05 | モデルを一時的に隠す／単独表示する | 接続済み | モデルタブのhide/show/isolate/全表示とCaptionからの復帰をlocal接続。Scene所属・履歴・Saved Viewは不変更。resident・カメラ・本文・windowを保持し、所有pin/hit/gizmoを抑制。readonly、Scene別保持、新規追加・cold解除は既存tests、実描画／実機は未受入れ。 | [src/ui/projectScene/modelListState.ts](../src/ui/projectScene/modelListState.ts) / [src/harness/projectScene/viewportHost.ts](../src/harness/projectScene/viewportHost.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M06 | モデルの平行移動を調整する | 接続済み | gizmo＋数値、preview/cancel/confirm、immutable binding保存と再開。合成・validation静的GLBと01a Pointで原本／原座標を保持。限定browser継続はtodo参照。実入力受入れは別。 | [src/harness/projectScene/session.ts](../src/harness/projectScene/session.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M07 | モデルを回転・均等拡大縮小する | 接続済み | 新metadataとvalidation GLB／01a Pointで移動／回転／均等拡縮gizmoと数値代替、全Scene共通のfresh binding保存／再開。原点基準、正scale、canonical回転、exact取消／retry、Caption原座標／本体保持。専用Chromiumの限定Point配置・Workspace／返送／cold継続はtodo参照。全変換・実入力・実機受入れは未完。M13のpivot／fit／Undoではない。 | [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) / [src/harness/projectScene/pinGizmo.ts](../src/harness/projectScene/pinGizmo.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| M08 | モデルを差し替えて要確認のピンを直す | 接続済み | 合成prepared切替に加え、限定GLBの明示ファイル差し替え→更新Workspace受信→同一Assetの要確認ピン補正→Contribution返送を接続。論理Asset/Frame・全Scene配置/所属・Caption本文/位置/添付を保持。publication/display失敗のexact retry、実GLTF resident切替、手元本文/PNG保持、元座標/色の要確認pin表示、返送replay/cold再開を既存testsで確認。一般revision一覧・他profile・通常home／実機は未受入れ。 | [src/projectMetadata/modelReplacement.ts](../src/projectMetadata/modelReplacement.ts) / [src/harness/projectScene/modelReplacementControls.ts](../src/harness/projectScene/modelReplacementControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M09 | Projectからモデルを削除する | 接続済み | 全Scene所属・Caption anchor・material routingの原候補を検査し、参照ゼロのAssetだけ確認付きtombstone。未知／曖昧な参照は拒否。保存前の選択、本体／原履歴、後着参照と相手の未適用入力を保持。exact retry／cold reopen／再受信を限定hostで確認。cascade・物理消去・一般参照修復なし。 | [src/projectMetadata/assetDeletion.ts](../src/projectMetadata/assetDeletion.ts) / [src/harness/projectScene/assetDeletionControls.ts](../src/harness/projectScene/assetDeletionControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| M10 | GSの配置補助モデルと配置可否を確認する | 別経路のみ | 01cの選択GSへの明示GLB面追加・変更・解除をtyped commandへ接続。面は表示せず、近似位置から既存gizmoでmanual座標を確定。07kはNative Proxy固有の変換・GS派生／family関係を保持し、両面選択・copy remapも接続。GS identity/class/placementと既存Captionは保持。Proxyなし・表示準備失敗は近似指定のみ停止し、07lの四形式Proxyも受け入れる。対象外形式・一般採用は残る。 | [Proxy command](../src/projectMetadata/gsProxy.ts) / [workflow](../src/projectScene/gsProxyWorkflow.ts) / [07k](../docs/specs/07k-native-point-gs-proxy-conversion-proposal.md) |
| M11 | ピンの表示サイズを調整する | 別経路のみ | 限定validationでは取込pinScaleを保持し、ピン描画へ反映済み。限定product compositionでは明示map2のAsset倍率編集・全Sceneのmarker反映・失敗時exact retry・backup/cold再開まで接続。map1は不変更。通常入口／実描画・実機受入れは未完で主分類は維持。 | [src/harness/projectScene/viewportModel.ts](../src/harness/projectScene/viewportModel.ts) / [src/harness/projectScene/viewportHost.ts](../src/harness/projectScene/viewportHost.ts) / [src/nativeGs/app.ts:1841](../src/nativeGs/app.ts) |
| M12 | 点群の表示径を調整する | 別経路のみ | 01aの限定Point経路に既定3px・1〜20pxの一時表示径を接続。Assetごと・viewport内の設定で、Metadata／保存視点／fileへ混ぜず、現在のgesture receiptを更新する。exact3profile registryとbinary-only capabilityを分け、dither/smoothへfallbackしない。Native既存経路は不変更。Point全体／実機／採用の分類へ広げず、実行範囲はtodo参照。 | [src/domain/pointPresentation.ts](../src/domain/pointPresentation.ts) / [src/ui/projectScene/projectModels.ts](../src/ui/projectScene/projectModels.ts) |
| M13 | 位置合わせの基準固定・bounds fit・reset／undo・redo | 新規実装 | 分類は旧棚卸し時点を保持。仕様08の限定PC経路はローカル基準保護・原点／中心pivot・中心と大きさの粗合わせ・identity／証明できるimport配置へのreset・新bindingによるUndo/Redoを接続。原本／座標／Captionを保持し、基準／現在bindingが変われば拒否。実行結果はtodo参照。高度な対応点fit・ICPや一般採用／実機合格は含めず、CaptionのUndoとは別。 | [仕様08](../docs/specs/08-daily-authoring-workflow.md) / [src/domain/alignment.ts](../src/domain/alignment.ts) |
| M14 | 既存モデルへ補修Meshを追加・配置し、任意hard exclusionと一体で保存する | 任意・完成条件外 | PO2026-10-29確認。手動ピン調整に必須ではなく、必須残件・自動的な後続予定から除外。利用者flowは未実装。将来必要になり実装する場合は、原本保持・repair-local配置・patch/maskの原子的commit・対応pin class保護と該当gateを満たす。位置指定用Proxyの既存動作は変更しない。 | [仕様00 §4.4／§10](../docs/specs/00-product-contract.md) |

M08の限定product経路は、要確認ピンの補正で現在のモデル面を明示選択し、元の色と独立した要確認表示を保つ。
専用Chromiumの [モデル差し替え・復旧テスト](../tests/e2e/model-recovery.spec.ts) が、2シーン共有の配置保持、
相手の本文・画像保持、公開中断後の同一変更での再開、面指定での補正・返送を接続する。
実行結果はtodoに集約し、一般形式・全中断段階・実機・offline・正式採用の合格には広げない。

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
| I01 | Project内メディアを添付・再利用し、説明・順序・添付解除を編集する | 接続済み | 合成2枚とvalidation保存PNGに加え、限定product compositionの既存commandへ統合。説明／順序の独立候補を全Projectの既存recoveryから明示選択し、未設定と空文字を区別、既知添付に対する順序の説明と未解決siblingの限界を表示。両cell解消後の通常編集・保存失敗exact retry・同Project返送／coldをNodeで確認。添付の因果delete/edit・lifecycle競合も実在stateと診断に基づく新eventで明示解消し、元説明／順序候補を保持。親Captionの同state候補は同じstateだけを別commandで確定して子の復旧へ戻す。通常の単独tombstone復元／参照付替えは含まない。確認付き解除で元bytesと他Captionを保持。最後の解除後のWorkspace受渡し・編集継続・cold再開、未受領画像の選択除外と所有済み証拠消失の停止を自動確認。実入力受入れは別。 | [src/ui/projectScene/projectMedia.ts](../src/ui/projectScene/projectMedia.ts) / [src/harness/projectScene/mediaControls.ts](../src/harness/projectScene/mediaControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
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
| A01 | 対象／Scene・Project範囲を選び、照明・表裏・hard chromaを編集／解除する | 接続済み | admitted Mesh全slotの照明／表裏／hard chroma／解除を接続。受信原候補の明示確定、scope優先順位と重複keep-one後の編集／返送を保持。既知Basic+litの解除やloser整理は可能だが、新たなlit選択・未知値・不適合effectは拒否。07nではmap2の半透明意図もtyped編集・解消・保存でき、描画未対応を設定消去や編集拒否へ転用しない。実行済み範囲はtodo、実機は別受入れ。 | [src/harness/projectScene/materialSession.ts](../src/harness/projectScene/materialSession.ts) / [src/harness/projectScene/metadataMaterialControls.ts](../src/harness/projectScene/metadataMaterialControls.ts) / [src/projectMetadata/materialResolution.ts](../src/projectMetadata/materialResolution.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A02 | 実Meshのmaterial／textureと複数slotを扱う | 別経路のみ | GLBと07l四形式のadmitted source locatorを実decoded材質へ厳密対応。opaque/MASK/BLEND×lit/unlit×front/doubleのowned clone編集／解除で原本・texture・RGB/alpha・PBR/Phong設定を保持。07nでBLENDの明示mask化とresetも接続。滑らかな表示、元からunlitの明示lit化、他形式・Representation選択は残る。Point/GS/Proxyの材質は解放しない。実行済み描画／file／復旧範囲はtodo、一般採用・実機は別。 | [src/domain/meshMaterialSource.ts](../src/domain/meshMaterialSource.ts) / [src/projectScene/validationRender.ts](../src/projectScene/validationRender.ts) / [src/projectScene/validationMaterials.ts](../src/projectScene/validationMaterials.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| A03 | 不透明度・soft chromaを安全な対応範囲で使う | 別経路のみ | opaqueとsource MASK／BLENDのexplicit binary maskを既存product画面・typed Session・clone描画・同一GPU pick・解除・五用途file／復元へ接続。source factor×texture×RGBAを元cutoffで二値化してからopacity/chromaと最終cutoffを合成し、cutoff0を先行discardしない。opaqueは元alphaを無視する。07nではinherit半透明／soft chroma／smoothBlend意図と新移行を編集・共有・復旧・再開できる。validationでは該当材質のsmooth面だけ非表示にして説明し、他の面を保持。01g承認済みPC候補では、document共通予算と内部解像度の自動調整でMesh／GSの近似透過表示を接続し、非対応時の局所非表示・設定保持と既存pick拒否を保つ。dither等は残る。実行結果はtodo。G1-D等の採用・実機受入れや滑らかな半透明の一般保証は主張せず、群全体の完了にはしない。 | [src/viewer/hardChroma.ts](../src/viewer/hardChroma.ts) / [docs/specs/05-project-scene-team-workflow.md](../docs/specs/05-project-scene-team-workflow.md) |

### 保存

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| S01 | 保存状態を確認し、同じ作業を再開する | 接続済み | new metadataのoriginal history＋marker-last＋cold reopenと限定validation一覧。内部ackは「再開用データのみ」とし、未確定・失敗・復旧・閲覧状態を保持。限定product compositionのheaderは未適用／更新失敗／再開データを区別し、同token・非stale・照合済みbackupだけを保存ファイル一致と表示。生成やdownload開始は未確認のまま。限定validationで最後に正常に開けたProjectを実名付きで再開し、別Projectへの切替導線を接続し、未確定入力がある間は切替を防ぐ。壊れた／欠落した助言や実open・lease・表示失敗は成功通知せず一覧／fileへ戻す。通常入口の完全な切替導線、実browser／実機受入れは未完。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/ui/projectScene/navigationControls.ts](../src/ui/projectScene/navigationControls.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |
| S02 | 中断・保存失敗から元の変更で再試行する | 接続済み | 旧公開表示を保持、未完了は編集制限、exact originalsを再使用。一般ファイルimportの復旧まで保証しない。 | [src/projectMetadata/session.ts:137](../src/projectMetadata/session.ts) / [src/projectMetadata/journal.ts](../src/projectMetadata/journal.ts) |
| S03 | 別タブから確認し、編集権を安全に扱う | 接続済み | readonly／refresh／lease handoffの限定接続。同時多人数編集・実機保証とは別。 | [src/harness/projectScene/metadataHost.ts](../src/harness/projectScene/metadataHost.ts) / [src/projectMetadata/persistence.ts](../src/projectMetadata/persistence.ts) |
| S04 | オフラインで起動・作業・終了後に再開する | 別経路のみ | 旧Nativeの合格経路は新hostへ流用不可。普通の製品導線／offline保存基盤の接続と新実測が必要。SW変更は現在非対象。 | [tasks/uiux-handoff.md](../tasks/uiux-handoff.md) / [docs/specs/05-project-scene-team-workflow.md:1064](../docs/specs/05-project-scene-team-workflow.md) |

[初回変換E2E](../tests/e2e/initial-conversion.spec.ts)は承認済みのNative portable-v2、
frozen-v1 GLB/PNG、LociMyu CSVの限定入力を、内容確認／取消→変換→既存記録編集→
実保存ファイルの照合→cold再開へ接続する。Scene・親あり／なし未配置・独立／重複添付と
元GLB／PNG、変換後のrecord／履歴を保持。元ZIPや私的説明を通常出力へ含めず、
Native全profile／後続材質recipe／XLSXや補助表全経路／実機／offlineの採用は含めない。
実行結果はtodoが所有し、分類件数は変更しない。

### チーム

既存[model-recovery E2E](../tests/e2e/model-recovery.spec.ts)は同じ2SceneのProjectで、
モデル更新・pin補正に、受信入力の中断→誤ファイル拒否→cold後の正確な元ファイル再選択、
本文競合の明示解消とCaption所属のkeep-both、原／コピーの独立編集・返送・二巡目再開を
接続する。手元の本文／画像、同じjobと元bytes、Scene外参照を保持する限定Desktop経路。
実行結果はtodoが所有し、ordinary entry／offline／実機／全TEAMの採用や分類件数は変えない。

独立した専用Chromium 2 profileでのWorkspace更新・4つの実Contributionによる
2往復・本文競合の明示解消・手元画像保持・再受信no-op・両者cold再開を、限定
validation経路で検証した。[team E2E](../tests/e2e/team-workflow.spec.ts)と
[実行記録](todo.md)が範囲・条件を所有する。別のモデル／独立コピーの代表例を
含めても、通常入口からの統合TEAM-FLOW-01、実機／offline全完了や行全体の採用ではない。

[keep-both E2E](../tests/e2e/keep-both-workflow.spec.ts)では、同じモデルとCaptionを
別々にSceneへ追加して実ファイル受信で重複を作り、明示した元と独立コピーを両方残す。
既存フォームに対象・他Scene・独立範囲を表示し、本文・画像説明・ピン位置・モデル配置の
別々の変更→返送／再受信→両者cold UI再開と、A再開後backup対B終了前backupの完全な
履歴／record一致を確認する。元の他Scene登録、fresh所有ID、同じモデル／画像bytesを
保持し、Captionコピーのpinは元モデルを参照する。分類件数・一般形式の採用は変更しない。

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| T01 | 配布された更新を手元の記録を保って受け取る | 部品未接続 | 新serviceの完全source受信／remote journalと合成タイトル／登録のUI受信を接続。限定GLB/PNG hostには実Workspaceファイル受信・入力再選択・cold復旧・同じeditor更新を接続。実Workspace／Contribution受信→Caption title/body比較・明示解消→通常編集→二巡目受信・再受信no-op→cold再開を既存統合testsで接続。通常UI、他対応形式、他競合UIの完全接続・実機受入れは残る、F01/F02参照。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/harness/projectScene/validationReceiveControls.ts](../src/harness/projectScene/validationReceiveControls.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) |
| T02 | 元の配布状態を保持し、変更分を繰り返し返す | 部品未接続 | 限定GLB/PNGでは元Workspaceの交換基準を明示選択し、元Dの実file出力／受信／二巡／cold再開を同じserviceとfile欄へ接続。Contributionでは基準表を進めない。通常経路／他対応形式／実機受入れは残る。F02、06の批准境界を維持。 | [src/projectMetadata/session.ts](../src/projectMetadata/session.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| T03 | 同じ項目の競合を比較し、明示的に解消する | 部品未接続 | 限定GLB/PNG実ファイルUIでCaption title/body・anchor/color、Scene名・開始View、View名／順序／camera／backgroundを明示解消。任意値の不在・完全な座標／カメラを保持し、温存中のScene／カメラ不変更、起動Scene競合はcold明示選択後に画面を開く。親のみ復元・Scene再登録・独立copy、同一AssetのGLB更新比較（readonly、pin/gizmoなし）とstatus選択も接続。元履歴・他モデル・未適用入力を保持し、exact retry／通常編集／Contribution返送／no-op／cold再開を既存testsで確認。開始View不在の解消は有効な元履歴参照の同一変更set/deleteとし、不正nullを新規生成しない。既存不正履歴は書換えず拒否。他field／他lifecycle、通常経路・実機受入れは残る。 | [src/harness/projectScene/metadataConflictControls.ts](../src/harness/projectScene/metadataConflictControls.ts) / [src/harness/projectScene/metadataAssetStatusControls.ts](../src/harness/projectScene/metadataAssetStatusControls.ts) / [src/harness/projectScene/modelCandidatePreview.ts](../src/harness/projectScene/modelCandidatePreview.ts) / [src/harness/projectScene/validationWorkspace.ts](../src/harness/projectScene/validationWorkspace.ts) / [src/harness/projectScene/metadataCaptionLifecycleControls.ts](../src/harness/projectScene/metadataCaptionLifecycleControls.ts) / [src/projectMetadata/commands.ts](../src/projectMetadata/commands.ts) |
| T04 | 重複所属で片方／両方を選び、独立項目として残す | 部品未接続 | 限定GLB/PNG実ファイルUIでCaptionとモデルのkeep-one／独立keep-bothを接続。元登録を明示選択し、Caption／添付はfresh IDで本文・添付説明を独立編集。モデルは全slotとeffective Scene→Project材質を完全rekeyし、既存本体を複製せずfresh factsを検証。3登録→2コピーの位置・材質・GLB更新→Contribution返送no-op／cold再開、元Asset／他Scene／Caption不変とexact retryを既存testsで確認。01cでは閉じたGS＋任意Proxyのfamily/class/参照をrekeyするcopyを追加。一般Point/他GS等のclosure、通常経路・実機受入れは残る。 | [src/projectMetadata/membership.ts](../src/projectMetadata/membership.ts) / [src/projectMetadata/modelMembership.ts](../src/projectMetadata/modelMembership.ts) / [src/harness/projectScene/metadataMembershipControls.ts](../src/harness/projectScene/metadataMembershipControls.ts) / [src/projectFiles/modelFacts.ts](../src/projectFiles/modelFacts.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/ui/projectMetadataHost.test.ts](../tests/ui/projectMetadataHost.test.ts) |

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
| F01 | 自己完結したTeam Workspaceファイルを配布・開く | 新規実装 | 元履歴summary・全live強参照closureから実ZIPをstream生成し、header／CRC／SHA／source／summary／closureを検査。限定GLB／01a Point・対応写真一覧・editorに初回import／既存同系統への受信／cold復旧と固定source出力job／generated base／明示download／選び直したfileの一致確認を接続。共通base表・元履歴・手元編集を保持し、欠落したack証拠を補充しない。生成した実形式fileの二巡は既存tests。未知inventory制限、retention全体・専用Chromiumの限定file／cold継続はtodo参照。通常UI／他形式／全fault・実機が残る。portable操作全体の完成ではない。 | [src/projectPackage/workspaceArchive.ts](../src/projectPackage/workspaceArchive.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [src/projectFiles/receiveWorkspace.ts](../src/projectFiles/receiveWorkspace.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F02 | Contributionファイルを書き出し・取り込む | 新規実装 | 元D／delta summary／必要本体差分の実ZIPと、凍結base／wire／derived・receiver MのSession受信を限定GLB／01a Point・対応写真の同じfile欄へ接続。durable出力も明示base／元source／inventoryから生成し、cold retryで後の編集を混ぜない。独立indexで欠落jobを発見し、両出力のguardとwarm一覧を共有。二巡・M=0・再選択・欠落拒否・元モデル0readを検査。Contributionはbaseを更新しない。通常経路／他対応形式／実機受入れは未完了。実行結果はtodo。 | [src/projectPackage/contributionSource.ts](../src/projectPackage/contributionSource.ts) / [src/projectPackage/contributionOutputJob.ts](../src/projectPackage/contributionOutputJob.ts) / [src/projectFiles/sendWorkspace.ts](../src/projectFiles/sendWorkspace.ts) / [src/projectFiles/receiveWorkspace.ts](../src/projectFiles/receiveWorkspace.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F03 | 完全backupを書き出し・明示確認して復元する | 別経路のみ | 限定validationに名前付き出力・確認付き復元・専用元履歴初期化・復元base束縛・世代選択とcold再開を接続。元作業／current・conflict・base-only本体／交換基準・元証拠を保持し、復元後の編集→Contribution返送／再受信と中断・取消・表示retryを既存testsで確認。独立reviewの指摘は解消。06aの未存在確認・初回確認・P2/S2・専用回復入口を追加し、元DBを開かず実世代復元→編集／受渡し／coldへ限定接続（Node／注入storage／recorded DOMに加え、専用Chromiumの初回復元→編集・確認付き保存・cold継続を限定確認）。通常home／全ケース・実機・offlineと行全体の受入れは残り、主分類は変更しない。 | [src/projectPackage/backupSource.ts](../src/projectPackage/backupSource.ts) / [src/projectPackage/backupArchive.ts](../src/projectPackage/backupArchive.ts) / [src/projectPackage/backupOutputJob.ts](../src/projectPackage/backupOutputJob.ts) / [src/projectPackage/backupRestoreJob.ts](../src/projectPackage/backupRestoreJob.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F04 | 一つのSceneを閲覧用に共有する | 別経路のみ | 限定validationで選択Sceneのhistory-free closure・typed re-key・実ZIP出力／確認・凍結retry、既存ファイル入口からのstandalone View、明示独立編集コピー・永続job・既存欄での復旧・編集／cold再開を接続。View単独では編集metadataを作らず、非visual ownerは一覧／窓のみ。編集コピーは元bytes・新しい実metadata bytesを固定し、欠落した承認済み証拠を再生成せず、後続編集を保持する。専用Chromiumで限定Pointのstandalone Review閲覧は確認（todo）。編集copy全ケース／通常home／他profile／実機・offline受入れは残る。実行結果はtodo参照。 | [src/projectPackage/reviewSelection.ts](../src/projectPackage/reviewSelection.ts) / [src/projectPackage/reviewOutputJob.ts](../src/projectPackage/reviewOutputJob.ts) / [src/projectPackage/reviewEditJob.ts](../src/projectPackage/reviewEditJob.ts) / [src/harness/projectScene/reviewWorkspace.ts](../src/harness/projectScene/reviewWorkspace.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F05 | 全Sceneを独立Projectとして複製して渡す | 別経路のみ | 限定validationで現在の全Scene／素材／記録のtyped re-key・fresh history・実ZIP出力、件数と匿名化しない境界の事前確認、独立Projectへの入力・編集・cold再開を接続。元履歴／削除値／交換基準を出力せず、元Projectは保持。中断時は同じID・原本から再開し、既存コピーへの再入力は上書きせず一覧再開を案内。通常home／他profile／実描画・実機・offlineの受入れは残る。最終チェックはtodo参照。 | [src/projectPackage/cleanSource.ts](../src/projectPackage/cleanSource.ts) / [src/projectPackage/cleanOutputJob.ts](../src/projectPackage/cleanOutputJob.ts) / [src/projectPackage/cleanInputJob.ts](../src/projectPackage/cleanInputJob.ts) / [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [docs/specs/06-project-package-wire.md](../docs/specs/06-project-package-wire.md) |
| F06 | 現Native Projectを新Project/Sceneへ一度移行する | 新規実装 | 既存GLB／写真／限定appearance変換に07kのPoint・SH2/3 GS・GLB Proxyを追加し、07l recipe8でSTL・Mesh PLY・OBJ・自己完結glTFのMesh／Proxyを接続。内容判定→確認→編集／点・面指定→全5purpose／2往復・復元／coldへ接続。Scene順序、非表示モデル、未配置、pin倍率、別media identity、原本／単位／元座標／既存pinとGS派生関係を保持。元ZIPと私的receiptは通常出力に含めず、同一sourceで中断復旧。07m recipe9は設定対象のopaque元材質が照明なし／両面でも既存の対応を引き継ぐ。GLB／spatial／Meshの復旧経路は原本から判定し、旧1–8は維持。07n recipe10は有効chroma／不透明度／元MASK・BLENDを標準操作へ統一し、事前の実対象説明と局所smooth非表示、編集／全5用途／2往復／復元coldへ接続。旧1–9は不変。検証状態はtodo。外部参照・対象外subset、滑らかな半透明描画等、Native exchange入力と実機／offline／正式採用が残るため行全体は未完。旧形式の継続更新・bridgeは不要。 | [07l](../docs/specs/07l-mesh-import-conversion-proposal.md) / [src/projectFiles/nativeSpatialConversion.ts](../src/projectFiles/nativeSpatialConversion.ts) / [tests/e2e/desktop-mesh-workflow.spec.ts](../tests/e2e/desktop-mesh-workflow.spec.ts) |
| F07 | frozen v1を新Project/Sceneへ変換する | 新規実装 | 承認済み07bのGLB/PNGと07dのJPEG・07eのWebP/GIF写真追加・identity配置・透視視点を、検証経路の内容判定→確認→編集／初回配置→backup・作業一式・閲覧file→再開へ限定接続。raw ZIP／log・対応表を私的保持し通常出力へ含めない。対応外は全体拒否。初期保存中断／完了後retry・証拠欠落を検証。07f明示開始View、07g非identity配置/local pinに加え、07iの新recipe-6でexact decoded key→一意base slotの陰影／両面設定と独立説明を接続。07m recipe7で元から照明なし／両面のopaqueを追加し、両面指定の欠落時は元sideを継承。無効中chroma値は原ZIP／項目別説明だけへ残し、同Scene一slot編集→file／実selected世代復元後編集／coldを限定確認。07n recipe8は有効chroma／不透明度／元MASK・BLENDを標準操作へ統一し、事前の実対象説明と局所smooth非表示、編集／全5用途／2往復／復元coldへ接続。fallback名／共有材質／滑らかな半透明描画・平行投影・inline camera・他形式／実入力・通常入口／実機受入れは残り、群の主分類は維持。凍結wireと旧1–7の意味は不変。 | [07i](../docs/specs/07i-frozen-v1-material-proposal.md) / [frozenV1Conversion.ts](../src/projectFiles/frozenV1Conversion.ts) / [tests](../tests/projectFiles.test.ts) |
| F08 | LociMyu ZIPを新Project/Sceneへ変換する | 新規実装 | 07cの単一GLB／exact PNG subsetと07dのJPEGと07eのWebP/GIF additive recipesを限定validationで接続。生原本／重複identity／known-owner unplaced／視点／独立report／中断復旧を保持。07hの追加recipe-4で単一GLBの不透明・色透過なしの陰影／両面設定をScene×既存材質slotへ接続し、潜在chroma値は原ZIP／個別項目reportだけへ保持。07m recipe5で元から照明なし／両面のopaqueと既存Scene／名前→index対応を引き継ぐ。旧1–4・私的説明形は維持し、検証状態はtodo。確認取消・編集・受渡し・実世代復元後編集／coldを限定検証。07n recipe6は有効chroma／不透明度／元MASK・BLENDを標準操作へ統一し、実対象を事前説明。設定を保ってsmooth面を局所非表示にし、編集／全5用途／2往復／復元coldへ接続。旧1–5は不変。全形式・滑らかな半透明描画・実入力受入れは残るため群全体の分類件数は変えない。Google／曖昧relationは有効化しない。 | [07c](../docs/specs/07c-locimyu-project-scene-conversion-proposal.md) / [lociMyuConversion.ts](../src/projectFiles/lociMyuConversion.ts) / [tests](../tests/projectFiles.test.ts) |
| F09 | 移行後に届いた旧Nativeの変更を受け入れる | 要件撤回 | PO判断 2026-09-14。移行後は新形式のファイルだけで編集・受け渡しを続ける。bridgeは実装対象外。初回変換・新形式同士の統合は維持。 | [docs/specs/07-project-scene-migration.md](../docs/specs/07-project-scene-migration.md) |
| F10 | ファイル内容・影響を確認し、取消／不正入力から回復する | 別経路のみ | 単一入口でrawモデル／画像の条件付き作成と既存package／変換を内容から振分け、混在／複数packageは無書込拒否。選択世代・IME・late openを確認し、未適用取消と同一attempt retryを接続。backupは批准済み06aの未存在確認付き初回復元と既存Project置換確認へ、Contributionは対応Project内の受信へ接続。初回復元の限定Node／専用Chromium検証・最終チェックはtodo参照。fresh HEIF選択の端末別JPEG案内、未適用のmedia-owned入力だけの明示取消／再選択と実保存失敗の同一retry保持を限定接続。限定GLB／01a Point／01c GS・ProxyとPNG/JPEG/WebP/GIF画像のfile欄に内容由来のWorkspace／Contribution検査、形式・目的・影響の確認、失敗・未確定入力の保持、再選択／retry／明示取消を接続済み。backup出力と確認付き復元・専用再開／取消、独立コピーの件数・匿名化しない境界の確認／入力／中断復旧も接続。reviewのScene・件数・埋込情報保持の確認、readonly入力、凍結出力再開・保存先の別確認も接続。View自体の永続再開ではない。全purpose／移行元／通常homeを一つの利用者導線として完結する部分は残る。filenameからpurposeを推測しない。 | [tests/projectFiles.test.ts](../tests/projectFiles.test.ts) / [tests/nativeGs/homeUi.test.ts:476](../tests/nativeGs/homeUi.test.ts) / [docs/specs/06-project-package-wire.md:31](../docs/specs/06-project-package-wire.md) |

F01–F05の限定validation UIは、名前付きの「保存」を標準とし、
「相手に渡す」で作業一式／変更分を選ぶ構成へ接続。閲覧共有・独立コピーと
作成済みファイル一覧は段階表示する。生成からダウンロードへ続けて進み、
失敗時・中断再開時も同じ生成物から再試行する。ダウンロード開始と保存先の
確認は区別したまま。専用Chromiumの限定実行はtodo参照。全purpose／全fault・実機受入れは未完了で、上記の主分類は変えない。

### 利用支援

| ID | 機能群／利用者の結果 | 状態 | 現在の境界・残り | コード／既存受入れ参照（行番号は監査時点） |
|---|---|---|---|---|
| H01 | 使い始め・記録・保存共有・困ったときの案内を開く | 別経路のみ | 限定product compositionに、開始／記録／保存と共有／復旧の4節helpを接続。Shift・数値代替と同一Project交換、ブラウザ再開データと確認済み外部ファイルを区別。通常入口／実browser受入れは未完で主分類は維持。 | [src/nativeGs/app.ts:2810](../src/nativeGs/app.ts) / [src/harness/projectScene/workspace.ts:78](../src/harness/projectScene/workspace.ts) |
| H02 | 端末保存容量・オフライン準備を確認する | 別経路のみ | 新validation productのヘルプにsite usage／quotaの読み取り専用推定照会を限定接続。不明／失敗／再確認、IME／未適用入力／保存失敗の保持、終了後結果の無効化を含む。Project容量・端末空き・保存成功・offline準備を保証しない。旧homeの端末機能全体と新保存基盤の統合は残り。persist要求や清掃／削除／GC／SWは非対象。 | [docs/ui-product-guidelines.md:134](../docs/ui-product-guidelines.md) / [docs/specs/03-gates-and-delivery.md](../docs/specs/03-gates-and-delivery.md) |

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
| E02 | 実モデル・Representation／renderer | 旧Nativeの限定Mesh/Point/GS/Proxy、各loader、known triangle content verifier | **実装＋採用**。実body admission、Frame/catalog/texture/family証拠、Representation選択と対応外の局所的fallback、資源解放。shared-view合成・dither等の該当gateを確認。M01–M03/A02の技術前提で、同じ作業をここで重複加算しない。任意M14のhard mask等はその機能を採用する場合だけ別途確認する |
| E03 | 新wire・移行recipe | 5-purposeの意味的closure PoC、原履歴／prepared migrationの隔離証拠 | **孤立実装＋採用／初回移行の残件**。06 §11の実装先行と§12.6のreview/edit-copy方針は承認済み。実装は各F行・todoを参照。一般profile／容量保証／採用、07の初回source mappingと必要target差分は残る。late bridgeは撤回済みで、そのPoCを再実行・採用条件化しない。 |
| E04 | 規模・安全性・アクセシビリティ | 最終rootテスト、限定hostのfocus／失敗／古いtoken防御、既存runtime audit | **実装確認＋証拠**。通常の規定多tab workload、メモリ・CSP・不正入力、200%/狭幅/IME/keyboard/contrast/44pxの総合確認は維持。10k Caption/50k changesとその規模のopen/edit budget受入れはPO2026-10-29判断で低優先の後続へ移し、当面の完成条件・次工程の妨げにしない。既存の窓化・検索・テストは保持し、未受入れをPASSや容量保証にしない。開発用依存の監査残件は未解消（最新結果はtodo）、runtimeの狭いhold解消とは別 |
| E05 | Desktop／physical iPhone／offline | 旧Native受入れ、旧saved限定4群、修正後journalのPO再確認 | **新経路の証拠待ち**。新metadata hostの8群は一般的好評のみで全件PASSではない。新保存・描画に必要な実機は該当境界で実施し、全てを無条件に最終日へ先送りしない。最後は通常UIでTEAM-FLOW-01。dev serverはoffline/PWA証拠ではない |

限定validationの狭幅経路は、100件の長い日本語一覧の通常Tab移動、模擬touch／composition、
本文・画像説明の編集、ピン移動取消、実保存ファイル照合と完全終了後の再開まで接続した。
外側の保存／更新操作にも既存44px基準と折返しを適用する。
[responsive browser case](../tests/e2e/responsive-workflow.spec.ts)と
[一括実機引き継ぎ](../docs/browser-testing.md#one-grouped-device-handoff)を再利用し、
実行結果はtodoに一本化する。100件は既存DOM表示境界内で、virtualization、実IME、
200% browser zoom、実機iPhone、offline/PWAや通常入口の採用を確認したものではない。

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
内部部品の完了を新しい利用者操作の完成として数えず、後続M13・任意M14・撤回F09は今回の61群に含めない。

## 6. 明示deferred／判断未確定（64群へ加算しない）

06 §11の孤立実装／一般採用の分離、§12.6のreview/edit-copyと既知位置の要確認pin表示は承認済み。
限定snapshot writerと永続review edit-copyは接続されているが、07の移行profile、通常home／実機／公開の受入れ・批准を意味しない。
以下の非対象・後続要件は維持する。

2026-10-29のPO訂正により、Scene整理・Captionの反復編集・タグ・表示名など、
日常の使い勝手に関わる未接続操作は、互換性拡張・保守より優先して仕様を固める対象。
「最初の限定candidateでdeferred」「追加判断」は実装状態・契約の未確定を表し、
低優先を意味しない。次のまとまった作業はtodoが管理する。64／62／61群の旧集計を
完成順や価値の順位には使わず、全任意機能の一括承認・実装済みとも扱わない。

| 対象 | 扱い |
|---|---|
| 1万Caption／5万変更の大容量検証 | PO2026-10-29判断で当分後続・低優先。当面の実用版完成や着手順の阻害条件にしない。既存実装・試験・現在の制限を保持し、対応済み保証やPASSとは数えない |
| Scene複製／削除／並替えUI | 仕様08の限定typed経路へ接続。記録は独立複製、モデル／画像／タグ本体は共有。削除は観測した所属・Scene専用設定だけを外し、Project資源を保持。開始／最後のSceneは通常削除を拒否し、全Scene削除を統合した場合は明示復旧と同一処理の再試行を提供。順序競合は明示選択。検証状況はtodo参照 |
| 新規Project-space Caption、Sceneごとのrevision／alignment、Scene media layer、汎用Unity階層 | 明示非対象。既存ProjectAnchor読取・置き直しC11とは別 |
| Captionの一般Undo/Redo・一般複製・前後巡回 | 仕様08で独立複製・検索／色の絞り込み順の前後移動・この画面で確定したタイトル／本文／色のUndo/Redoを接続。原本／別Sceneを保持し、受信した変更を操作IDで保護。Undo履歴は画面内のみ。Caption作成／削除・添付の一般Undoは未接続で、この部分まで完成と数えない。M13の配置Undoとは別 |
| 任意baseColor入力 | 元materialの色保持・描画解釈はあるが入力UIなし。現在のaccepted editable fieldsとは別なので、勝手に新機能化しない |
| タグ編集UI | 仕様08の作成・名前／色編集・記録への付与／解除・確認付きProject全体削除と競合解消を接続。複製で独立した関連を作り、本体は共有。重複リンクの明示一括解除・色の未設定・削除と編集の選択を保護。記録／画像は削除せず、保存・共有・coldの状況はtodo参照 |
| ローカルprofile／表示名設定 | 仕様08のブラウザ内表示名とヘッダ表示を接続。IME・未適用入力・別画面の設定変更・永続化失敗を扱い、保存失敗時は入力を保持。Projectや共有file・過去の編集者名へは反映しない。履歴の著者への永続的な対応付け、account／rolesは未実装・別の契約 |
| HEIC／video／audio | PO2026-10-29の仕様08でPC候補のMP4（H.264/AAC）・M4A（AAC）・MP3と標準機能で読める単一HEICを承認。原本保持・追加・再生・共有・復旧・再開の確認状況はtodo。新依存なし。非対応環境は公開前に拒否し、HEICは別JPEGの再選択を案内。一般Windows HEIC・実機iOS・公開保証は未完了。既存Native／旧形式の変換recipeは拡張しない |
| 自動同一モデル判定／relation推測／位置remap／conflict winner | 禁止。判断量削減で越えてはいけない境界 |
| smooth-alpha一般保証、transmission、Compare、proxy自動生成／direct splat pick | 個別後続判断・research／gate。承認済み限定GS Proxyやhard chromaの継承とは別 |
| license／version／main／Pages／Service Worker／release | 今回の監査・次sliceの非対象。デプロイ承認を意味しない |

## 7. 更新記録

2026-09-14: 古い三slice予定・重複した経緯を履歴へ移し、実行順をtodoへ集約。
F03/F10とvalidation経路を復元・編集・返送、F05を独立コピー・編集・再開の限定接続へ更新。分類件数は変更せず、
内部／recorded DOM検証と、未受入れの実ブラウザ・実機・通常homeを区別する。
