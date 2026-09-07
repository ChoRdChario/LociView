# Public-candidate UI/UX監査・設計草案

> **後続判断（2026-09-05）**: POは§20.5–23の設計を概ね承認し、既存機能との
> 対応確認後の実装を指示した。現在の範囲・対応表・実装記録は
> `tasks/uiux-implementation.md`。以下の「実装未承認」はその時点の履歴であり、
> 現在の着手境界ではない。実画面・物理iPhoneの新UI受入れは依然未完了。

> Status: `PROVISIONAL / CODE-BACKED DESIGN / LIVE WALKTHROUGH INCOMPLETE`。
> 対象: `g0-baseline`、`d2302ec7e31e563448393ae3b42798e27d219b14`。
> 最新production実装: `6b2a28a0e5983676c9dc5d97534d916e3288f40d`。
> 作成日: 2026-09-05。実装承認、UX closure、release判定を行う文書ではない。
> 後続PO判断: §15の3設計方針は承認済み。§16はUX・美観の統一再評価。
> 最新の一覧配置・選択操作案は§18。3D下の一覧をDesktop既定とする旧案は撤回。
> 機能タブと造形・状態の最新訂正は§19。§18の一覧＋詳細はキャプションタブ内で維持。
> §19のトンマナはPO合意。詳細buttonの識別性と4色系統の明暗比較は§20。
> 低彩度の薄茶／グレージュはPO選定済み（§20.5）。明暗の運用方針・詳細仕様・実装着手は未承認。
> トンマナはPO了承。最新の全機能の配置・発見経路・legacyとの差・自己レビューは§21。
> §22で浮動Caption windowの省略表示を訂正し、色別ピン表示P01を具体的な追加設計へ補完。
> 最新は§23。色filterのmodalを撤回し、常設circleと簡潔な文言へ修正。安全境界は維持。

## 1. 結論と証拠の限界

2026-09-05のPO画像レビューを受け、候補前の改善案を
(A)開始画面の統合と目的別入力、(B)Caption中心の作業順と
対象・表示文脈、(C)保存結果と失敗後の次手、の3つに更新する。
二つのhomeを説明で区別して残す前案は撤回する。ユーザーに見せる開始画面は
一つとし、内部route・互換storageの区別は利用者が選ぶ入口にしない。
機能の追加より先に、受入れ済みの機能を探せることと、その操作がいつ保存を
確定するか分かることを確認する。

POの設計基準は「UIから分かる情報だけで、何ができ、押すと何が起きるかを
理解できること」。画面構成・文言・操作シナリオは§7、UI-only段階の実装案は§10、
画像レビュー結果は§13、公式ガイドラインによる再評価・訂正理由・追加検証は§14、
後続の設計方針承認は§15、UX・美観の統一再評価と明暗比較は§16。
PO指摘によるmedia文言・常設Caption一覧・元UI確認不足の訂正は§17。
類似製品の一次資料に基づく右側の一覧・詳細と小画面の再提案は§18。
LociMyu由来の機能別タブの再整理と、枠・文字・押下状態の洗練は§19。
そのトンマナへの合意、詳細buttonの訂正と配色比較の最新版は§20。
最新の最大3境界への再構成案は§16.8。旧UI-only案と並行実施する計画ではない。
§14を受けて§7・§9・§10も改訂した。これらは設計提案であり実装承認ではない。

これはコードから確認した導線に基づく設計草案である。通常ユーザーとしての
41タスク実操作、click/tap計測、使いやすさの合否は未完了。コード上の短い導線を
実測クリック数や利用者の所要時間として扱わない。既存のDesktop・physical-iPhone
機能受入れPASSは維持するが、この草案のUX受入れへ転用しない。

### 起動と操作接続

- 指定の `npm run dev -- --host 127.0.0.1` が
  `http://127.0.0.1:5173/` を表示した。
- Codex内ブラウザへ通常homeを開く要求を送り、Product Ownerがhomeの表示を確認した。
  `開く／新しく作る` 以降の操作、Project作成、file dialog操作は未実施。
- Browser操作の共通初期化が
  `Importing module "node:process" is not allowed in node_repl` で停止する。
  画面を表示するアプリ機能と、agentが画面を取得・操作する機能を区別する。
- 先行するWindows画面操作もURL検証段階で停止した。これらは製品不具合の証拠ではない。
  接続制約を回避するためのplugin書換えや別の制御transportは作成していない。
- public Pages、dev harness、PoCはcandidate UI証拠に使用していない。

### checkpoint / private-source確認

開始時のbranch/HEADは一致、worktreeはclean、既存origin refとの差はahead 0 /
behind 0、unpushed 0。fetchはしておらず、live remoteの更新有無は未確認。
以降の変更は本草案と `tasks/todo.md`、`tasks/lessons.md` の監査・設計記録のみ。

独立read-only確認で、文書化済みのprivate代表source全体のfingerprintに一致する
bytesは、全refから到達可能なGit blob、index、public、既存distのいずれにも
見つからなかった。既存public-codec isolation verifierもPASS。
private内部ファイルの全digest/locatorは利用できないため、任意の部品や断片までの
非混入は証明していない。private path、filename、hash、内部名は本草案へ転記しない。

監査開始前には既知tunnel/Python processおよびNode/PythonのTCP listenerは
検出されなかった。OS権限により全processのcommand line取得はできず、process名と
netstatで補完した。起動したVite以外のserver/tunnel/PoCは作成していない。

## 2. 製品モデルと維持する境界

LociViewは3Dデータを見て、対象の空間位置へCaptionを記録し、Projectとして保存・
受け渡すlocal-first workspace。今回の編集正本はNative Projectである。
LociMyu ZIPと従来形式v1は読み取り専用の互換入力で、別のNativeを作る。
変換元へ書き戻さず、LociMyu ZIPと変換説明ファイルは別途利用者が保管する。

| 概念 | 役割 | 混同しないもの |
|---|---|---|
| Asset | 利用者が選択・表示・配置する対象。通常表示名は「モデル」 | MeshとGSの形式別モードではない |
| Representation | Assetを表すbytes。Mesh、通常Point、GSなど | 別Assetとの同一対象・同一範囲を推測しない |
| GS Proxy | 明示的に対応した同じGS Assetの配置補助面 | 独立した表示モデルやlayerとして見せない |
| Caption | 所属Assetへのtitle/body/color/位置/添付メディアによる記録 | cameraやmaterial設定ではない |
| 表示セット（DisplaySet） | Caption群、Meshの見え方、任意の既定Saved Viewの切替 | visibility、Asset group、layer hierarchyではない |
| マテリアル | 対象Meshの表面の見え方 | Assetの表示ON/OFFではない |
| 保存済みビュー（Saved View） | cameraと背景の記録・呼出し | Assetの位置やvisibilityは変更しない |
| モデルの表示／非表示 | Asset単位のvisibility | DisplaySet切替とは別 |

受入れ済み範囲は、複数Mesh/限定Point/限定GS、独立visibilityとmanual alignment、
明示Proxy、Caption/overlay/画像、DisplaySet/material/Saved View、Native保存と
offline reopen、完全backup、目的別交換、非破壊v1変換、direct LociMyu変換、
端末上HEIC→JPEG互換手順。広い形式・性能保証やaggregate G0/G1通過を意味しない。

| 出力目的 | 利用者へ伝える結果 | 必須の注意 |
|---|---|---|
| 完全バックアップ | 同じProject全体を復元する | 作業保存とは別。元のLociMyu ZIPと説明ファイルは含まない |
| 共同編集用 | 同じ系統・固定の共通開始状態からのCaptionと新規画像を統合する | 他のProject状態の差やconflictは全件中止。勝者を自動選択しない |
| 閲覧共有用 | 表示対象と現在の表示セットに絞ったmerge不能copyをViewで開く | 原本へmerge不能。埋込み画像・モデルのmetadata除去は保証しない |
| 編集用コピー | 新しいProject identity/lineageで独立編集する | 完全な現在状態をコピーするが原本へmergeしない |

候補の添付メディアはPNG/JPEG/WebP/GIF。action名は「メディアを追加…」とし、
現在受け付ける形式は補足で分けて示す。HEIC/HEIFは端末上で別JPEGを書き出して
手動添付する。別JPEGと元のfile-IDの関係を推測しない。video/audioと直接HEICは
候補後の必須開発であり、このUI設計に使えないcontrolを足さない。

## 3. task-based walkthroughと計測台帳

### 記録の読み方

以下の導線は**コード確認**であり、実操作済みwalkthroughではない。
`U` は未測定を表し、0、失敗、未対応の意味ではない。
全41行の実測欄 `U` は次の全項目に適用する。

`click/tap / file dialog / screen・panel移動 / mode切替 / 再入力 /
drag・gizmo前準備 / undo・retry / 所要時間 / 判断総数`

実測再開時は、開始画面と保存状態、入力fixture、見つけたaction、終了の合図を記録し、
手を動かした時間と読込待ちを区別する。agentの応答待ちを利用者の操作時間へ加算
しない。操作数の目標や短縮率は現在設定しない。

資料略称: H=`src/ui/home.ts`、A=`src/ui/app.ts`、N=`src/nativeGs/app.ts`、
V=`src/nativeGs/viewer.ts`、R=`src/nativeGs/resolver.ts`、C=`src/nativeGs/style.css`。
行番号は上記checkpointのもの。判断分類は§4を参照。

| # | taskと開始地点 → 現在の導線 | 終了の合図／前提・回復 | 実測 | 根拠 |
|---|---|---|---|---|
| 1 | `/` → 開く／新しく作る → 名前・3D入力 → 作成 | 空Project不可。3種のいずれか必要。「任意」3欄から全体条件を読む必要 | U | H:141、N:1049 |
| 2 | `/` → ZIP選択 → LociMyu取込確認 → Native編集 | 集計と説明ファイル。必要時のみworkbook／完全な対応案を確認。原ZIP保持 | U | H:235、importDialog.ts:90 |
| 3 | `/` → 従来形式を閲覧 → データ → 新しい形式へ変換して編集 | 新しいProjectが開く。元の登録sourceは不変 | U | H:170、tabs/data.ts:22 |
| 4 | `/` またはNative一覧 → backup選択 → restore | `/` はEditへ、Native一覧は一覧へ戻る。同一Projectがある場合は上書き不可 | U | H:164、A:590、N:616 |
| 5 | 共通取込／Native一覧 → exchange選択 | 内容からpurpose判定。reviewはView、他はEdit。同一collaborationはProject内へ誘導 | U | A:565、N:557 |
| 6 | Native編集 → モデルを追加 → Meshファイル → 追加して保存 | 新Asset表示。未保存の他変更を含むworking全体が保存対象 | U | N:1706、N:2206 |
| 7 | 6と同じ3Dモデル／通常点群欄 → Point入力 | bytesから限定Point形式を判定。広いPLY対応の証拠にはしない | U | N:170、N:2161 |
| 8 | 作成／追加 → GS選択 → 必要なら補助面を明示選択 | GS表示。Proxyなしでは新規Caption配置不可 | U | N:228、N:1071、R:259 |
| 9 | 各編集section → その操作の対象モデルselect | Caption配置先、material、位置、差替え、削除は独立選択 | U | N:1161、N:1245、N:1277 |
| 10 | モデルの表示設定を展開 → 個別checkbox | 表示指定とready数のbadge。変更は通常保存で確定 | U | N:1491、N:1699、N:2357 |
| 11 | モデルの位置を調整 → 対象 → gizmo種別／数値適用 | 位置変更は未保存。個別Undoなし。open直後のgizmo状態も実査必要 | U | N:1733、N:2035、N:2539 |
| 12 | モデルを差し替え → 対象・形式・file → 確認 → 保存 | 同じAssetの位置・Caption保持。必要に応じ要再配置。即時保存 | U | N:1716、N:2234 |
| 13 | モデルを削除 → 対象 → 確認 → 通常保存 | 最後のAsset／所有Captionありは拒否。保存前の一括破棄は可能 | U | N:1727、N:2305 |
| 14 | GS作成／追加の補助モデル欄、編集の詳細 | Proxyは別Asset表示されない。有無・usable理由の通常表示が弱い | U | N:1072、N:1759、R:240 |
| 15 | キャプション → ＋新しいキャプション → 表面指定 | 配置後に選択・overlayと未保存状態。作成モードcancelあり | U | N:2397、N:1813 |
| 16 | キャプションの配置先モデルselect | 永続presentationの変更としてdirtyになる。単なる閲覧選択ではない | U | N:1632、N:2390 |
| 17 | 対象表示 → PC Shift+click／iPhone長押し | Mesh/Pointまたは明示GS Proxyのsurface hit。失敗理由は詳細へ | U | V:1122、V:1203 |
| 18 | 配置後gizmo／既存Captionの「ピンを移動」 | 軸drag・移動終了・通常保存。準備数と誤操作は未観察 | U | N:1813、N:2420 |
| 19 | Caption選択 → title/body/color入力 | workingとpreview更新、通常保存が必要。空titleは既定値へ戻る | U | N:2618 |
| 20 | Caption編集 → 先にProject保存 → 画像選択 → 添付して保存 → 拡大確認 | 画像添付は即時保存。HEIC拒否案内。thumbnailと前後送り | U | N:1427、N:2642、captionOverlay.ts:270 |
| 21 | Caption検索／所属モデルfilter → 一覧またはmarker選択 | 選択overlayと件数。表示セット内検索であることの理解を確認 | U | N:1360、N:2395 |
| 22 | 既存の未配置Caption → 表面へ置き直す → 表面指定 | 所属不明は明示確認。専用filter／新規未配置作成UIはない | U | N:1380、N:2441 |
| 23 | Caption選択 → 削除 → 確認 → 通常保存 | 確認cancelで不変。保存前の全体破棄は可能、個別Undoなし | U | N:2498 |
| 24 | 表示セットと見え方 → 表示セットselect | Caption/material/既定viewが切替。2セット以上の入力が必要 | U | N:1652、N:2042 |
| 25 | 表示セット → 対応Mesh・material → 見え方を変更 | 即preview、通常保存で確定。GS/Pointには同じmaterial操作を提供しない | U | N:1652、N:1865 |
| 26 | ビュー → 名前 → 現在のビューを保存／更新／呼出し | 登録時は表示セット既定にもなる。Project保存は別途必要 | U | N:1678、N:2092 |
| 27 | 表示セットsectionと別のモデル表示設定を往復 | セットはvisibilityを変えず、Saved Viewも位置・visibilityを変えない | U | N:1653、N:1699 |
| 28 | パネル上端のプロジェクトを保存 | 成否はパネル末尾。失敗は最後の保存状態へrollbackしdirty解除 | U | N:1695、N:2754 |
| 29 | 編集 → 詳細 → 閉じる → 一覧の対象 → backup書出し | 直接file書込みとread-back確認、または一時file生成→download。後者のOS保存完了は未確認 | U | N:840、N:857、N:2819 |
| 30 | 編集を閉じる → 一覧 → 共有・コピー → 共同編集用 | 初回は固定baselineを作る。以降同じbaseline。exportは未保存作業を含まない | U | N:843、storage spec §30.1 |
| 31 | clean Edit → 共同編集packageを統合 → file → 実行 | 成功は即保存。同じ変更ならnoop。dirty中は先に保存が必要 | U | N:1751、N:2690 |
| 32 | 統合 → conflictの短文と詳細 | 全体中止・Project不変。元の作業copyを修正し再exportする案内が不足 | U | N:2719、storage spec §30.2 |
| 33 | 編集を閉じる → 一覧 → 共有・コピー → 閲覧共有用 | durable snapshotの可視対象＋active set等のallowlist copy。画面上の一時選択との違いはF13参照 | U | N:844、packageSnapshots.ts:67 |
| 34 | 同上 → 編集用コピー | 新Project identity/lineage、独立Edit。原本とのmerge不可 | U | N:845、storage spec §30.3 |
| 35 | Native一覧のoffline準備、保存 → 閉じる → reopen | 既存PO実機PASSのみ。DEVはoffline完了確認にならない | U | N:483、N:1079、handoff §1 |
| 36 | 破損／unsupported入力 → 中止案内 → 別file／一覧へ | 元file・durable Project保全。明確な失敗種別と次手を実査する | U | H:208、N:644、N:1104 |
| 37 | iPhone通常home → Native／package | 本runでは実機操作なし。既存受入れは今回のtap数ではない | U | H:141、N:557 |
| 38 | iPhone stageで1本指・2本指の3D操作 | nativeは縦積みstage/panel。長押しと回転の干渉・指遮蔽は未観察 | U | V:305、V:1203、C:60 |
| 39 | iPhone Caption長押し／選択 → 下panel編集／画像 | キーボード下の入力と保存状態の可視性はfresh確認が必要 | U | N:1627、V:1208、C:60 |
| 40 | iPhone下panel → 表示セット／ビュー | 切替器までのscroll、文脈とstageの同時確認は未測定 | U | N:1652、N:1678、C:60 |
| 41 | iPhone保存 → close → 完全offline reopen | 既存PO PASSを参照。今回のDEVは証拠外 | U | N:2819、handoff §1 |

### 再開時に使う最小入力

既存非private fixtureだけを使う。Meshは `public/samples/tri.glb` と `cube.obj`、
通常Pointは `public/samples/points.ply`、小GSは
`fixtures/gs/profile-golden-sh3-v1.ply`、画像は `public/icons/icon-192.png`。
このGSは小さいcharacterization入力であり代表性能を測らない。
`cube.obj` を同時選択する場合は、同じGSの補助面として明示指定する操作だけを試す。

LociMyuは `fixtures/v1-migration/locimyu-drive-exact-v1.zip`、従来形式は
`fixtures/v1-migration/native-v1-base.lociview`。表示セット数や未配置の有無は
UIに表示された結果を確認してから該当taskを試す。不足なら未確認のままにし、
この監査だけのためにfixture matrixや新規PoCは追加しない。

交換入力は破棄可能なNativeからUIで生成する。backup restoreは同じProjectのない
作業領域を使い、既存ユーザーProjectを消して準備しない。独立した作業領域が
操作手段から用意できなければtask 4/5/31/32はその理由で部分確認とする。
削除taskは監査用の対象を明示し、確認画面とcancelを先に試す。

## 4. 操作量と判断量の分類

以下はコード上に存在する判断箇所の分類であり、利用者の判断総数や迷い時間の
実測ではない。不明瞭さ／技術知識／破壊性／authority／conflict／結果予測を併記する。

| task | 判断・操作の負担 | 分類 | 不明瞭な点／変更案 |
|---|---|---|---|
| 1–5 | 作業を始める入力、既存Project、変換元、出力先 | 1 本人が決める | Native内部形式を試験問題にせず、作業結果で入口を案内 |
| 2 | 複数workbookのsource選択、完全なcorroborated対応案の確認 | 1 本人が決める | authority判断。部分対応を編集させず、承認済み全体確認だけを維持 |
| 2 | duplicate Caption保全、未解決relationの非活性・報告 | 2 安全な既定値 | 個別winnerや画像対応を利用者へ逐一質問しない。推測はしない |
| 4–5 | 検証済みpackage purposeと既定open mode | 2 安全な既定値 | 内容判定は既存処理を維持。filenameをpurposeの根拠にしない |
| 6–8 | 読み込む3D source、GS用の補助面 | 1 本人が決める | 対応sourceと配置可能性の判断。位置・範囲・同一性を推測しない |
| 6–8 | Mesh/限定Point/限定GSのbytes判定 | 2 安全な既定値 | 「3Dデータを選ぶ」に入口をまとめ、既存の厳密判定へ渡す。未対応GSをPointとして再試行しない |
| 9,16,25 | Caption配置先、material対象、transform対象 | 1 本人が決める | 再選択は多いが別の意味。勝手な同期をせず各action近傍に対象名 |
| 10–12,17–19 | 表示するAsset、座標、形状、記録内容、色 | 1 本人が決める | 座標やrelationを推測せずpreviewと保存時点を明示 |
| 11,18,25 | 数値軸、uniform scale、material/chroma詳細 | 3 必要時だけ表示 | 主actionから開く。gizmo準備と数値入力の到達性は実測待ち |
| 13,23,26 | 削除／差替え／Saved View上書き | 1 本人が決める | 破壊・上書き対象と確定時点。既存確認を維持し新たな無確認操作を作らない |
| 14,17,22 | GS配置不能、未配置・所属不明 | 1 本人が決める | 次の安全なactionを提示。Proxyなしを別Assetへの配置で補わない |
| 20 | 添付する画像、別JPEGをどのCaptionへ添付するか | 1 本人が決める | 画像bytes判定は2。選んだ画像とCaptionの意味の関係は自動化しない |
| 21 | 検索・選択とfilter解除 | 1 本人が決める | 所属filterと現在の表示セットを見せ、結果0件の文脈を示す |
| 24,26,27 | 表示セット、既定ビュー、visibilityの意図 | 1 本人が決める | セット切替とvisibilityを統合しない。ビュー登録の既定化を先に説明 |
| 28–31 | 通常保存か、即時保存actionか、外部書出しか | 1 本人が決める | 保存先・確定範囲が予測しづらい。自動保存導入ではなく表示を揃える |
| 29–34 | backup／共同編集／閲覧共有／独立コピー | 1 本人が決める | purposeとprivacy。共通入口で4目的の結果を説明 |
| 31–32 | 衝突を直す作業copyと内容 | 1 本人が決める | conflict。全件中止と再export手順。自動winnerも新chooserも作らない |
| 35–41 | 保存・offline状態の確認、失敗時の再開 | 2＋3 | 検証済み状態を通常表示、根拠は詳細。DEVや未保存をPASS表示しない |
| 全般 | chunk、heap、schema、内部ID、digest、lineage/baseline詳細 | 3 必要時だけ表示 | 通常表示は結果と次手。技術詳細は消さず詳細に保持 |

「安全な既定値」は、正しい値を証明できる既存処理とUI上の表示既定に限る。
表示セット・検索条件を保持する便利さを、永続target変更やsource推測へ拡張しない。

## 5. コードで確認したUX不整合と行き止まり候補

以下の候補優先度は製品不具合のseverityとは別。新規P0/P1を実測再現したという
主張ではない。利用者への影響はlive walkthroughで確認する。

| ID | task | コード上の事実 | 利用者への影響と提案 |
|---|---|---|---|
| F1 | 1–5,29–34 | homeとNative一覧に重複入口。Nativeから `/` へのlink名は「従来形式のプロジェクト画面」 | 一つのhomeに統合する。名称の説明だけで二つを残さず、作業の続き／fileから開始／新規を示す |
| F2 | 28–34,41 | 保存buttonは上端、statusと閉じるは長いpanel末尾／詳細内 | 保存後の結果と共有への帰路が離れる。保存状態と一覧への帰路を常時アクセス可能に |
| F3 | 6,12,20,28,31 | add/replaceはworkingを即保存。画像とmergeはclean状態必須 | 「して保存」は既にあるが他の未保存変更を含むことが弱い。確定範囲をaction近傍に追記 |
| F4 | 8,14–18,22 | Proxyは任意、なしならGS新規配置不可。理由は詳細の英語diagnostic | 操作前に「表示可能／新規配置には補助面が必要」。対象変更や生成で勝手に回避しない |
| F5 | 9,16,25 | 複数selectが独立。Caption target変更はdurable dirty、他はUI選択 | すべての選択を一括同期せず「配置先」「見え方の対象」「調整対象」を各々表示 |
| F6 | 24–27 | material controlsがCaptionより先。セット定義の作成・編集UIはない | 表示セットだけを共通文脈へ、material詳細は段階表示。新規セット作成は追加しない |
| F7 | 26,28 | 「現在のビューを保存」でworkingと既定Viewを更新後、通常保存が必要 | 「ビューを登録（未保存）」「この表示セットの切替時に使う」等で結果を予告 |
| F8 | 28,36 | save失敗はworkingをdurableへ戻しdirty解除、末尾にrollback文言 | 保存成功と誤認させない。失敗と戻った事実を残す。「再試行で入力復元」は約束しない |
| F9 | 31,32 | conflictで全件中止し詳細へ英語message。画面に再export手順なし | 「作業copyで内容を調整し再書出し」。統合できない変更領域とconflictを区別 |
| F10 | 4,36 | 同一Project restoreは空でないdestinationで拒否 | 上書きされていないことを短く説明。自動削除や別identity化で成功扱いにしない |
| F11 | 11,18,23,26 | Nativeに個別Undo/Redoなし。Saved View削除等はworking変更 | 「全変更を破棄」と個別Undoを混同させない。Undoの新規実装は対象外 |
| F12 | 37–41 | native mobileは780px以下のstage/panel縦積み。旧mockの3段階sheetではない | キーボード、scroll、指遮蔽、touch hit領域は未検証。全面sheet frameworkを先に導入しない |
| F13 | 24,28,33 | セット切替はUI変数だけを変更。exportはdurable再読、reviewはsnapshotのactiveDisplaySetIdを使用 | 最後に画面で選んだセットを共有する期待との不一致候補。意味を決めず実測・仕様照合の停止項目にする |

F13のtraceは N:2042–2066 → N:702のdurable再読 →
`src/nativeGs/packageSnapshots.ts:67`。通常保存も `working` を渡すだけで、
画面の一時的なセット選択をsnapshotへコピーしていない。
§30.3の「active DisplaySet」が画面選択を指すのか保存済み値を指すのかを
本草案で決めない。複数セットを含むUI生成のreview packageを実際に開いて確認し、
必要ならProduct Ownerへ仕様の意味を確認する。現在の機能PASSを撤回したり、
P1を再現済みとしたり、永続化変更をsliceへ追加したりしない。

内部用語は `package`、`Project`、`lineage/baseline`、`GSを解放` と、詳細の
chunk/heap/STORE/stream/digest/内部ID。通常文では「受け渡しファイル」
「同じプロジェクトの共通開始状態」等の結果が分かる説明を使う。
専門用語を全削除するのではなく、診断の技術情報は展開可能な詳細へ残す。

文書面では `todo.md` の参照先だったNext decisionが存在していなかったため、
今回の現行監査境界を先頭に記録した。LociMyu仕様の先頭statusに残る古い
Desktop acceptance pending表現は、handoffの後続PASS記録より古い。
これを理由に閉じた機能受入れを再開せず、仕様本文のidentity/authority規則を守る。

## 6. LociMyuから保つ操作patternと変更するpattern

当初の参照は `docs/05-ui-ux.md` と `docs/09-locimyu-migration.md` の操作記録だけで、
元UIを実際に確認した比較ではなかった。PO指摘後の原本UIソース照合は§17を参照。
実画面の目視・実操作は未完了。後者の「未関連画像はProject内に保持」
等の旧v1説明を、現在のdirect Native adapterの保証として用いない。

| task | 維持するpattern | LociViewで変える点 |
|---|---|---|
| 1–5 | 開始actionから3Dを見るまでを短くする。最近の作業へ戻る | Google/URL入力から始めず、local Project/ZIPと原本保持を示す |
| 9,15–23 | 見る → 明示対象へ置く → 内容編集 → 必要なら位置調整 → 画像確認 | 複数Assetなので対象を省略しない。未配置・要再配置を区別 |
| 17,18,38,39 | Shift+click、長押し、通常click/tap選択、overlay | Proxy可否を前もって伝える。長押し中の移動cancelは実機確認 |
| 20,21 | 一覧で選ぶ → 本文・添付画像・3Dピンを対応させる → 次のCaption | 検索はLociView側の既存機能として区別。未関連画像を推測添付しない |
| 24–27,40 | 表示文脈の切替器を近くに置き、Caption/material/viewを連動 | 内部sheetを露出せずDisplaySetとして説明。visibilityとは別 |
| 28–34 | 書出し入口から目的で選ぶ。反復中の探索を減らす | Google自動保存、full/diff二択、暗黙merge、自動conflict勝者を継承しない |
| 37–41 | stage中心、touchで使える編集面、一覧と選択記録への明確な到達 | タブ等のUI patternは役割で判断。単一model・Google依存・内部sheet構造は継承しない |

## 7. 推奨information architectureと主要flow

### 画面の役割

1. **一つのhome**: 製品の用途、ファイルからの開始、この端末の作業への復帰。
   Native用homeへもう一度移る段階をなくす。内部routeと二つのstorage registryは
   保持できるが、ユーザーに二つの開始画面を見分けさせない。
2. **入力内容の確認**: ファイル選択後に、その入力で何を作り、どの状態で開くかを
   説明する。新規作成form、LociMyu確認、復元進捗は必要時だけ表示する。
   二つのhomeを縦につないで全controlを常設する案は採らない。
3. **作業画面**: Project名・access・保存状態・保存・homeへの帰路を共通領域へ。
   記録が主役。表示セットと保存済み視点の呼出しは作業文脈、見え方の編集は段階表示。
   記録とモデルの確認を排他的な3タブに分ける前案は修正する。同時参照する対象・
   visibilityの要約を残し、詳細は用途名のある展開部へ置く。
4. **書き出し／受取結果**: 対象Project、目的、含む範囲、保存先、結果を示す。
   既存の一覧側exportを再利用し、「バックアップ・受け渡し…」でその対象まで導く。
   遷移はclose guardを通し、未保存を黙って捨てたり保存成功を仮定したりしない。

### 一つのhomeで伝える内容

冒頭は「3Dデータにピンを置き、説明や画像を記録・共有するツールです。」。
続けて「作業はこの端末に保存されます。別の端末へ渡すにはファイルに書き出します。」。
Native、workspace、package、GS等の内部区分の理解を、開始の前提にしない。

| 利用者の目的 | 入口の文言案 | 直下に示す結果 | 次に開く内容 |
|---|---|---|---|
| 受け取ったfileを開く／手持ちの3Dに記録を付けたい | ファイルを開く… | LociViewのファイル・LociMyu ZIP・対応する3Dデータを選べます | 共通のfile選択→厳密検査→結果と必要項目の確認 |
| この端末での作業を続けたい | この端末のプロジェクト | 各行に名称と「編集して開く」「閲覧のみで開く」 | 選んだProjectとmodeへ直接進む |

§15のPO承認を受け、fileを先に「プロジェクト／モデル」と分類させない一つの主入口を
採用方針とする。これはガイドラインが指定する唯一の正解ではなく、この製品で選んだ
設計判断。初見で用途・入力・作成結果を理解できるかは引き続き実査する。
dropは補助操作とし、keyboardで起動できる通常buttonを置く。
検証済みの内容に応じて作成／復元等の結果を示し、確定前に何が変わるか伝える。
破損した予約markerを持つpackageを別形式へfallbackさせない。
共通入口は各既存検査・streaming経路への接続案であり、万能parserや全bytes一括読込
を新設する案ではない。既存service境界を変えないと成立しなければsliceを停止する。
登録済み従来形式は同じhome内に「従来形式・閲覧専用」と明示し、元registryを
合併せず並べる。編集は明示した非破壊変換から始める。

一覧には共有4種類・削除・新規formを常時展開しない。Project単位の
「書き出し…」「その他…」から開く。削除は「その他…」内の確認付き操作。
offline準備は端末についての補助領域に置き、開発環境を準備済みと表示しない。

### fileを選んだ後の結果を予測できるようにする

| 検証済みの入力 | 確認時に示す短文・操作案 | 守る条件 |
|---|---|---|
| 3Dモデル／点群／GS | 「新しいプロジェクトを作ります」→「作成して編集する」 | 空Projectは作らない。現在のMesh／PointとGSの同時作成を維持。作成後の追加・差替えは一操作一モデル |
| GS | 「表示できます。新しいピンの配置には、このGSに対応する補助モデルが必要です」 | 補助面の任意欄はGSでだけ展開。未指定でも表示は可能だが、新規配置可とは言わない |
| LociMyu ZIP | 「元ZIPを残して、編集用のプロジェクトを作ります」 | workbook選択・完全な対応候補の確認だけ必要時表示。未解決は説明ファイルへ |
| 従来形式v1 | 「従来形式のため閲覧専用で開きます」／「新しい形式へ変換して編集」 | 自動変換や旧形式への書込みをしない。変換導線をデータtabだけに隠さない |
| 完全backup | 「この端末に復元します」 | 同一Projectがあれば既存を案内し、上書きやidentity変更で処理を通さない |
| 閲覧共有 | 「閲覧用のコピーを開きます」 | 原本へ統合できない。永久的な編集禁止・アクセス権を意味しない |
| 共同編集 | 「共同編集用の作業コピーを開きます」または「既存の対象Projectから変更を受け取ってください」 | 同一Projectがある場合は明示したclean Edit内の統合へ。homeで勝手にmergeしない |
| 編集用copy | 「元とは別のプロジェクトとして編集を始めます」 | 元へ統合できないことを示す |

作成・モデル追加・差し替えでは、利用者はデータを選び、既存の厳密検査が形式を
判定する。GS/Pointの未知profileは拒否し、失敗したGSを普通の点群と解釈し直さない。
`src/nativeGs/plyProfile.ts:288,339`の検査を再利用する方向で、形式対応の拡張ではない。
単一pickerとは形式ごとに入口を分けないことであり、作成可能なモデル数を一つに
制限する意味ではない。選択済み入力を一覧で見せ、必要なら同じ入口から追加選択し、
現在可能なMesh／PointとGS、明示したGS補助面の組合せを保持する。
一度の作成で受け付ける組合せは既存範囲を広げず、作成後の追加経路も残す。
ファイル名、拡張子、入口の選択はpackage purposeやGS補助面関係の根拠にならない。

### 作業画面の優先順位

以下は利用シナリオに基づく設計上の仮説であり、利用頻度の実測値ではない。
頻度に加えて「次の行動の前提か」「失敗・喪失を防ぐため必要か」で配置を決める。

| 優先・置き場所 | 操作／情報 | 理由 |
|---|---|---|
| 共通・画面上端 | Project名、閲覧／編集、端末保存状態、保存、home、バックアップ・受け渡し | ナビゲーション・状態・確定操作を分ける。狭幅では固定を強制せず操作領域を守る |
| stage近傍 | 表示セット、保存済み視点の呼出し、全体表示 | 記録群の切替と見失った対象への復帰。material編集とは頻度が違う |
| 右側作業領域の一覧と詳細の間 | 選択記録名・所属、新規領域の＋ピンを追加、選択対象の位置調整 | §18の常設選択帯。近接させても追加先と既存所属を分ける。詳細scrollで対象を見失わない |
| 記録panel本文 | 選択記録のtitle/body、ピン色、添付メディア | 操作対象と編集内容を同時に確認。選択直後に見える |
| 右側作業領域の上段 | 現在の表示セット内の検索・件数・一覧、所属filter | §18では一覧内scrollと詳細内scrollを分ける。検索0件と別セットを区別する |
| 記録と同時参照できる要約／展開部 | モデル名、表示状態、「モデルの表示・配置」 | 重なりを除くために記録を隠さない。対象を保持して既存設定へ案内する |
| モデルの表示・配置の対象詳細 | 追加、位置・回転・scale、ピン倍率、点の大きさ、差し替え、削除 | 明示したモデルについて必要時に行う。記録位置の操作と混同させない |
| 用途名のある展開部 | 「表面の見え方（マテリアル）」「背景・視点」 | 全controlを最初から見せない。不透明度が記録確認の前提になる課題では近い導線を確保する |
| 各操作の詳細 | 診断、内部ID、chunk/heap、GSを解放 | 通常作業では不要。ただし失敗の事実と対処は詳細へ隠さない |

表示セットは「記録・モデルの見え方・視点をまとめて切替」と説明し、モデルの
表示／非表示とは別の操作として保つ。Saved Viewの呼出しを前に置いても、
モデル配置・visibilityを変える機能とは説明しない。モデルを隠すvisibility変更は
現在Edit限定の保存対象なので、Viewに新たな一時visibility機能を足さない。
Viewでは表示状態を確認でき、変更するには「編集して開き直す」へ導く。

### 記録panelの状態別配置

- 未選択: 「場所の記録（ピン・説明）」の短い説明、「＋ピンを追加」、検索・一覧。
  「3D上の場所にピンを置き、説明や画像を付けます」。意味のない空編集formを並べない。
  ピン未配置の記録も一覧から失わず、その状態を表示する。見出しの理解は実査対象。
- 新規配置中: 同じ上端領域に「追加先: モデルA」「配置を中止」、PCなら
  「Shiftを押しながら場所をクリック」、iPhoneなら「置きたい場所を長押し」。
  名前を入力する前に、既存のsurface hitが成立するまで新規recordを作らない。
- 配置直後: その記録を選択し、既存の位置調整状態を同じ領域に表示。
  「ピン移動を終了」は調整終了であり保存完了ではない。下にtitle/body・添付。
- 既存を選択: 新規領域の直下に「選択中: 北側外壁」「所属: モデルA」を示し、
  その対象の二次操作として「ピンを移動」「表面へ置き直す」を置く。
  三つの同じ強調buttonにはしない。選択だけでgizmoを起動しない。
- 長い一覧: 編集中の記録より上に全件を積まない。検索・一覧を独立した探索領域に
  し、Desktopでは一覧を表示したまま選択先を編集できる。モバイルでも一覧を初期状態から
  確認でき、詳細へ移っても戻る入口と選択位置を保持する。折畳み入口だけを一覧の代替にしない。
  検索語と探索位置はUI状態として保持し、recordを移動・再所属させない。
- 未配置／要再配置: 対応する位置操作の直近に理由を示す。差替え前の位置を
  保持していることと、今のsurfaceで確認済みでないことを区別する。
- 画像追加: 本文直後の「添付メディア」に画像と追加操作。未保存時は
  「メディアを追加する前に、この端末へ保存してください」と同じ場所から保存へ導く。
  操作名は「メディアを追加…」、PNG/JPEG/WebP/GIFを短く示し、HEIC→別JPEG手順は
  必要時に開ける案内にする。「添付メディア」という製品概念はPROD-16通り残す。

新規追加先、選択記録の所属、モデル全体の位置調整対象は明示的に別の意味を持つ。
パネルを変えるだけでは値を同期しない。すでに明示した追加先は表示して再利用できるが、
現在目立つモデルやfilenameから新しい所属・補助面を推測しない。
削除は選択記録の「その他…」から、対象名付き確認へ。追加・移動と同じ強調を与えない。

### 閲覧mode

上端に「閲覧のみ」と「編集して開き直す」。記録の一覧・検索・本文・画像、表示セット、
保存済み視点の呼出し・全体表示を使える画面にする。title/bodyの入力欄と配置・削除の
無効buttonを大量に残さず、読みやすい本文と添付を表示する。
mode切替は既存のsession開き直しへ接続し、Editに入る際はlock取得とdurable reloadを
維持する。Editから離れる際は未保存guard。書込みできない場合は理由を表示し、
「編集中」と偽らない。review package由来のView開始を永久的な編集禁止や
アクセス制御と扱わない。

| flow | 推奨する操作順 | 減らす負担／守る境界 |
|---|---|---|
| 新規記録 | 一つのhome → file選択 → 新規作成の結果確認 → 作成 → 配置先確認 → ピン追加 → 配置・位置調整 → 内容 → 端末保存 → 必要なら画像 | 初期のmaterial詳細探索と二番目のhomeをなくす。対象を推測しない |
| LociMyu再開 | ZIP → 集計・必要なsource確認 → 変換 → 説明ファイル保持 → Native作業 | 逐行判断を求めず未解決を報告。原本保管の説明を維持 |
| 反復Caption | 同じ文脈で次のCaption → 配置 → 編集 → 画像確認 | 現行選択を表示し、無用なscrollを減らす。別Assetへ暗黙変更しない |
| 表示確認 | 表示セット → 記録検索・画像 → 必要なら保存済み視点／全体表示 | materialの設定を経ず閲覧を完了。visibility変更はEditのモデルpanel |
| 保存・書出し | この端末へ保存 → 成否確認 → バックアップ・受け渡し → 対象・目的・範囲 → 出力結果 | 内部の「閉じる」を探す負担を減らす。対象の再選択を要求せず、直接file確認とdownload開始を区別 |
| 共同編集 | 対象をEditで開く → 保存済みを確認 → file → 統合結果 | 同じ系統とbaselineを検証。conflict中止後は作業copyで修正・再書出し |

### 旧Desktop低忠実度wireframe（§18の常設右側一覧へ更新）

下図は初期案の履歴。一覧を入口だけにする構成は採用しない。最新の配置は§18。

```text
┌ [ホーム] Project名 [編集中・未保存] [この端末へ保存] [受け渡し…] ┐
│ 表示セット [全体確認 ▼]    視点 [保存済み ▼] [全体表示]             │
├──────────────────────────────┬───────────────────────────────────┤
│                              │ 場所の記録（ピン・説明）            │
│         3D stage             │ [＋ピンを追加]   追加先: モデルA    │
│ 描画準備／失敗はこの近く       │ ─ 選択中: 北側外壁 / 所属: モデルA ─│
│                              │ [ピンを移動] [表面へ置き直す]       │
│     選択Caption overlay      │ タイトル                           │
│     本文・画像thumbnail       │ 本文                               │
│                              │ ピン色 / 添付メディア              │
│                              │ [記録を探す・一覧] [この記録の操作]│
│ [モデルの表示・配置 ▸]        │                                   │
│ [表面の見え方 ▸] [背景・視点 ▸]│ （展開しても記録の文脈を保持）     │
└──────────────────────────────┴───────────────────────────────────┘
```

図の「受け渡し…」は短縮表記。実際の入口は「バックアップ・受け渡し…」。
作業navigationは既存sectionのtask別表示を想定し、新frameworkやdomain modelを含めない。
左下の設定はstageを覆うoverlayを増設する指定ではなく、同時参照できる別領域の役割。
モデル一覧のvisibilityと、配置先／material対象／調整対象は同じ値に強制同期しない。

### 旧iPhone低忠実度wireframe（§18の一覧／詳細切替へ更新）

下図は初期案の履歴。最新案では一覧→詳細と戻る経路を同一領域に持たせる（§18）。

```text
┌ [ホーム] Project名 [受け渡し…] ┐
│ 編集中・未保存    [この端末へ保存]│
│ 表示セット [全体確認 ▼] [視点]   │
├─────────────────────────────────┤
│                                 │
│           3D stage              │
│  選択Caption / 添付media overlay │
│                                 │
├─────────────────────────────────┤
│ 場所の記録  [＋ピンを追加]        │
│ 追加先: モデルA                  │
│ ─ 選択中の記録 / 所属: モデルA ─ │
│ [ピンを移動] [表面へ置き直す]     │
│ タイトル・本文                   │
│ 添付メディア                     │
│ [一覧へ]  / panel内で続きを表示   │
│ [モデルの表示・配置 ▸]            │
│ [表面の見え方 ▸] [背景・視点 ▸]   │
└─────────────────────────────────┘
```

候補では現行のstage/panelを基礎にし、iPhoneは一列に再配置する。保存状態を発見
しやすく保つが、すべてのbarを固定する案にはしない。文字拡大・keyboard表示時は
通常flowとscrollで入力・保存へ到達させ、stageとpanelの比率を固定しない。
生成画像に描かれたドラッグハンドルは
現行Nativeにはなく、この案でも装飾として付けない。3段階bottom sheet、gesture redesign、
全画面編集機能はこの3 sliceに含めない。ソフトキーボード、safe area、overlayと
controlの干渉、実hit領域と間隔は実機で確認する項目であり、
この図でPASSや全端末保証を与えない。
サイズはAppleのpt、WCAG AAの24 CSS pxと例外、主要touch操作の44 CSS px設計目標を
分ける。旧「44px相当」の表現は採用しない。詳細な試験条件は§14-G8。

## 8. state transitionとerror/recovery

### Projectの現在の保存規則を見える形にする

```text
Nativeを開く ── View / lockなし ── 閲覧（書込み不可）
        └── Edit + lock + durable reload ── 保存済み
保存済み ── Caption/material/visibility/transform変更 ── 未保存
未保存 ── 通常保存 ── 保存中 ── 成功 ── 保存済み
                         └── 失敗 ── 最後の保存状態へ戻る
                                      ＋失敗とrollbackを表示
未保存 ── 閉じる/再読み込み ── 確認 ── cancel: 同じ作業を維持
                                └── discard: 破棄して移動
```

「保存済みsnapshotへ戻った」と「今回の保存が成功した」は別の結果として表示する。
通常保存失敗後には未保存入力が保持されていない。既存§22のrollbackを変更せず、
「再試行」buttonでその入力が復元できると誤説明しない。

モデル追加・差替えは未保存workingも含めて即時保存する。画像添付・mergeは
保存済み状態からだけ開始する。この違いを短文で説明し、保存タイミングを
自動統一する変更は本草案へ含めない。lock lossは書込み停止を表示し、勝手に
別Projectや一時保存へ切り替えない。

### 入力・交換・配置の回復

| 状態／失敗 | 通常表示に必要な事実 | 次の安全なaction | 禁止する短絡 |
|---|---|---|---|
| ZIP検証失敗 | 取込不成立、元file不変 | file再選択／詳細確認 | 一部を保存済みと扱う |
| LociMyu未解決 | 変換済み集計と未関連・非活性の影響 | 原ZIPと説明ファイルを保管し、Nativeで必要な画像を手動添付 | filename/source relation推測 |
| LociMyu identity等のblocking | Native未作成、理由と説明ファイル | source側を確認して再変換 | IDを発明して続行 |
| 同一backupの既存Project | 上書き・統合していない | 既存Projectを確認／取込cancel | 自動削除、自動clean copy化 |
| GS Proxyなし／無効 | 対象GSの新規配置ができない。既存Captionは保持 | 表示継続／既存Caption編集、必要な補助面を準備 | 近いMeshを代理使用 |
| 表面hitなし | 配置未成立、既存位置不変 | 対象と表示を確認し、表面指定をやり直す | 任意座標で成功扱い |
| 所属不明の未配置Caption | 元の所属を回復できない | 現在の対象への所属を明示確認して配置 | first Assetへ自動所属 |
| HEIC/未対応画像 | 添付未保存、元画像不変 | 端末上で別JPEGを書出し、手動で選び直す | 外部upload・変換relation推測 |
| merge conflict | 全件中止、対象Project不変、衝突の内容 | 作業copyで合意した内容へ調整し再書出し | 自動winner・部分merge・新chooser |
| unsupported Project状態差 | Caption/imageだけの統合範囲外 | このfileは統合せず、独立copy等の目的を利用者が判断 | モデル・view等の差を無視 |
| export中断／失敗 | 完全fileの生成を保証できない | 元Projectから再書出し | 部分fileを完全backupと表示 |
| download開始 | ブラウザへ渡したがOS側完了は未確認 | 利用者が保存先を確認 | 外部保存完了の自動判定 |
| 直接file書出し完了 | 現行File System Access経路が書込み後のread-back一致を確認した | 保存先fileを使用 | download fallbackと同じ未確認状態に潰す |

技術detailは展開可能に残し、失敗の存在・影響・次手を詳細の中へ隠さない。
新しいerror分類を作るためservice/schemaを広げる必要が生じたら、その項目は
本presentation sliceから外してProduct Ownerへ戻す。

## 9. candidate前必須候補とcandidate後polish

これは優先度の提案であり、未実測のままrelease blocker認定しない。

| 優先 | 対象 | task・理由 |
|---|---|---|
| 候補前必須として提案 | 保存状態・失敗・確定範囲、一覧への帰路を近づける | 6,12,20,28–36,41。何が保存されたか、共有へどう進むかの予測 |
| 候補前必須として提案 | 一つのhome、理解できるfile入口（共通入口を第一比較案）、形式を先に選ばないfile選択、4出力目的の用語 | 1–8,29–34。作る／開く結果を示す。初期モデル数を一つに制限しない |
| 候補前必須として提案 | 追加とピン位置調整を近接、記録を既定表示、material編集は段階表示 | 9,14–27,37–40。記録の反復を一つの作業として完了できる |
| 候補前必須として提案 | 閲覧modeの読みやすい記録表示、操作名・対象・失敗時の次手 | 3,5,21,27,36–40。無効formの羅列と説明なしの行き止まりをなくす |
| 候補前必須として提案 | semanticなfile操作、dialog focus、個別label、status通知 | §14-G4/G5/G6。見た目の並べ替えだけで閉じない |
| 候補前の実測必須として提案 | コントラスト、hit領域・間隔、拡大・keyboard時のreflow | §14-G8。未測定。不足が判明した場合の修正を装飾polishへ回さない |
| 候補後polish | 基本の可読性・操作性を満たした後の装飾色・余白・animation、追加shortcut | 追加shortcutと必須keyboard代替を混同しない。全P2消化を候補条件にしない |
| 候補判断前に別途scope判定 | pin／overlayの非drag・keyboard代替、保存失敗後の回復性 | §14-G6/G9。既存3 sliceの完了だけでは解決せず、適合宣言もできない |
| 別の機能判断 | 統一Asset選択、自動保存、draft保持retry、Undo、3段階sheet、editor内直接export、DisplaySet作成 | UI移動だけでない機能/保存規則の変更。自動的にpolishへ含めない |

license/notices、version/release SHA、main/rollback、Pages/Service Worker、
POST share-target、公開済みprivate由来metadataの扱いは別のrelease判断のまま。

## 10. 最大3件のbounded implementation slice案

> UI-only段階の提案。§15の承認方向を含む最新再構成は§16.8を参照。
> この旧案へ入力・保存回復を黙って追加したり、二組を同時に実施したりしない。

以下は先行するUI-only実装案で、着手は未承認。§15で方針承認された入力代替と
失敗時編集保持はまだ含まない。これらの詳細契約を定め、最大3 sliceへ再構成する必要がある。
開始前に本草案をlive walkthroughで修正し、POが対象とacceptanceを
確認した後、必要なproduction仕様とacceptanceを正本へ記録する。
変更がaccepted contractと衝突した場合は実装せず停止する。

### Slice 1 — 一つのhomeと目的が分かる入力

- **目的／task:** 1–8、29–34、36。開始画面の重複をなくし、作成／再開を予測できる。
- **production範囲案:** H/Nと必要なapp-level navigationで共通homeを構成し、
  一覧・共通file入口・段階表示する作成form・既存exportへ接続する。
  3D inputは一つのfile選択から既存の厳密検査へ渡し、同じ入力方針を
  作成／追加／差替えで再利用する。registry、format検査、purpose、保存serviceは
  それぞれの境界を保持し、内部implementationを大規模統合しない。
- **acceptance:** 通常 `/` からNative作成、LociMyu、従来形式View→変換へ到達できる。
  どの戻り方でもhomeは一つ。利用者が画面だけから「続き」「ファイル」「新規」を
  見分け、file選択前にMesh/Point/GSを選ばず、新規か既存への追加かを説明できる。
  現在のMesh／PointとGSの同時作成も、形式別pickerなしで行える。
  GS補助面は必要な場合だけ明示し、未指定時の表示可／新規配置不可を先に示す。
  従来形式を編集可能と表示しない。破損native／未知GSは別形式へfallbackしない。
  作業中から対象の4出力へ進め、dirty時のcancelが同じ作業を維持する。
  backup/exchangeの既存open mode・identity・lineage・privacyを変えない。
  file入口は実buttonでkeyboard操作でき、dropを必須にしない。作成・復元等の
  確定前に結果を予測でき、キャンセルで元作業を変更しない（§14-G1/G4/G7）。
- **再利用／不足:** 既存route/purpose/unsaved guard testを再利用。
  liveで入口発見、close→出力、未保存cancelを確認する証拠が不足。
- **非対象:** editor内でlockを保持したまま直接export、入力形式追加、自動restore上書き、
  legacy削除、package purpose推測、export subset editor、package/schema変更。
- **停止:** 既存serviceへ入る条件やsource authorityを変えないと成立しない場合。
  F13の共有範囲解釈が実装に影響する場合は、先に実測と仕様判断を行う。

### Slice 2 — 記録中心の編集／閲覧と段階表示

- **目的／task:** 9–27、37–40。配置先、配置可否、表示セットを見ながら記録できる。
- **production範囲案:** Nと既存CSSのsection配置・task別表示、既存状態を読む案内文。
  追加・位置調整・選択記録の編集を同じ領域にまとめ、一覧の長さで押し下げない。
  閲覧modeの非編集presenter、既存sessionを開き直すmode導線、モデル管理を整理する。
  表示セット・視点呼出し・全体表示を共通文脈に、material/数値詳細を必要時表示にする。
  Proxy状態は既存resolverの結果を表示するだけに限定する。
  排他的3タブは前提とせず、記録・所属・表示状態の同時参照を優先する。
  対象入力の個別labelと、Native画像dialogの実際のmodality/focus整合も扱う。
- **acceptance:** Caption→gizmo→内容→画像確認の順に到達できる。
  新規配置後、別panelや画像手順を経ずにピンを動かせる。既存選択だけではgizmoを
  起動しない。利用者が「ピンの移動」と「モデル全体の移動」を見分けられる。
  表示セット・視点呼出しを、material／背景の編集を開かず使える。
  Viewは説明・画像を読め、編集に移る条件と効果が表示から分かる。
  View中のvisibility変更や新たなdraft保存は提供せず、既存lock/reloadを維持する。
  配置先／material対象／調整対象はそれぞれ見える。panel移動だけではdurable
  captionTarget、所属、表示セット、visibility、transformを変更しない。
  ProxyなしGSは表示を継続し、新規配置不可の理由を配置操作の近くに表示する。
  DisplaySetの3要素と独立visibilityを区別し、新規セット機能をあるように見せない。
  DesktopとiPhoneで同じ用語を使い、soft keyboard中の編集・保存とoverlay干渉を確認する。
  新規追加と選択中の位置編集に視覚的な区切りがある。数値入力を個別に識別でき、
  画像dialogを閉じると元のthumbnailか合理的な次の対象へfocusが戻る。
  §14-G8のサイズ・拡大・コントラストは検証し、未測定をPASSにしない。
- **再利用／不足:** 既存resolver・Caption・material・view・overlayの挙動を再利用。
  liveの操作準備、連続Caption、scroll、touch/keyboard証拠が不足。
- **非対象:** global Asset選択の同期、Proxy生成/推測、picking/renderer変更、Undo、
  bottom-sheet framework、DisplaySet作成、media viewerの新機能拡張
  （既存画像dialogのfocus/modality訂正を除く）、HEIC/video/audio。
- **停止:** 新しい永続field、pickingの意味、renderer変更が必要な場合。
  section表示・探索位置などの一時UI状態はこの範囲で扱えるが、選択の自動同期はしない。
  表示セット選択の永続化／共有への引継ぎをF13の解決として黙って追加しない。

### Slice 3 — 保存結果・失敗・次手の表示

- **目的／task:** 6、12、20、26、28–36、41。確定範囲と失敗後の状態を予測できる。
- **production範囲案:** Nのstatus表示と既存action周辺の説明、必要なaccessibility属性。
  dirty/access/save/export結果を混同せず、既存handlerの分岐から短文を出す。
  共通確認dialogの結果名・安全側初期focus・focus閉込め／復帰を含む。
  共通部品変更は従来形式の閲覧・変換入口も回帰確認する。
- **acceptance:** 未保存／保存中／成功／失敗rollback／閲覧・lock lossを区別する。
  保存actionと結果は全panelから読める。「保存」をこの端末への保存と説明し、
  fileへの書出しと区別する。エラーの原因・影響・次手はhoverや詳細展開に依存しない。
  add/replaceが他の未保存変更も保存すること、画像/mergeには先行保存が必要なことが
  action前に分かる。ビュー登録とProject保存を区別する。conflict時は全件中止と
  再exportの次手を出し、内容を勝手に選ばない。download開始を保存完了と呼ばない。
  statusを後続の操作案内で置き換える場合も、未保存・直近保存失敗が分からなくならない。
  進捗／結果が支援技術に通知され、入力のたびに不要な読み上げを繰り返さない。
  破壊確認は汎用OKをやめ、Cancel／Escapeで不変更、Tabで背後へ漏れず、
  閉じた後に作業へ戻れる。画像dialogの担当はSlice 2とし二重実装しない。
  rollbackの説明改善を、失った入力を復元する機能の完了と扱わない。
- **再利用／不足:** §22と既存保存/交換のfailure・zero-write testを再利用。
  liveでstatus可視性、rollback説明、conflict理解と再入力負担を確認する証拠が不足。
- **非対象:** draft保持、retryによる入力復元、自動保存、一般Undo、保存タイミング統一、
  conflict chooser、baseline再設定、journal、storage/publication変更。
- **停止:** 新しいerror分類や復旧機能、保存契約の変更が必要な場合。

各sliceの実装後は適切な既存testと通常のtypecheck/test/build、描画・mobileに影響
する場合は対応するbrowser/physical-iPhone確認が必要。このdocs-only runでは
productionのtest/buildを繰り返さず、文書の整合とdiffだけを検証する。

## 11. 残る実操作と次の判断

優先再開順は、通常home→Native作成→Caption/画像→保存/一覧→4目的の出力、
次にLociMyuと従来形式、モデル操作・表示文脈、conflict/recovery。41行は省略しない。
ブラウザ制御が使えるまで、クリック数・時間を想像で埋めない。

task 35/41のfresh完全offline runは現時点で実施しない。今回のDEV表示も
Product Ownerのhome確認もoffline証拠ではない。将来のUI変更後に必要なら、
選んだexact candidate buildと一時HTTPS経路を一件だけ具体化し、PO承認後に実行する。
現在は新build、新tunnel、新実機matrixを提案・起動する段階にない。

この草案はPOへレビュー可能だが、live walkthrough未完了のため、41タスク監査完了、
候補UX受入れPASS、production着手可能とは扱わない。ブラウザ接続側の障害を解消して
残る実査を行うことが依存事項であり、旧G0や機能開発へscopeを替えて解決しない。

## 12. このrunのレビュー

- 指定の開始文書と現行codeを照合し、別agentが11の仕様制約をread-onlyで確認した。
  独立確認は設計の境界確認であり、production差分の承認ではない。
- 保存失敗rollback、個別Undoなし、Caption targetの永続性、editor外exportという
  既存条件を、単なる見せ方の改善に紛れて変更しないようsliceから除外した。
- F13はcode上の値の受渡しを記録した未実測の仕様解釈問題。対応方針は未決定。
- 文書整合・diff確認のみ行う。実行コード、fixture、dependency、仕様契約、
  license、version、main、Pages、Service Workerは変更しない。
- 全41タスクの実測値は未記入。Product Ownerのhome表示確認だけを今回の画面証拠とする。
- 文書確認PASS: task表に1–41が各1回、全実測欄が未測定、sliceは3件、
  whitespace/diffに問題なし。新文書も明示的に検査した。
- 一時Viteを停止し、port 5173がlistenしていないことを確認した。

## 13. PO画像レビューを受けた利用者視点の評価（2026-09-05）

この節は公式ガイドライン再評価前の画像レビュー記録。ここに残る二つのfile入口や
「書き出しへ」等の前案からの訂正は§14、最新の統合案は§7・§10を参照する。

### 画像の扱いと訂正

8枚の再構成画像を目視し、主要な並び・文言・状態を現行codeと照合した。
前回答の「各画面と実際の文言を画像化・確認済み」は、忠実な現行画面再現としては
言い過ぎだった。画像は問題を見つける概略図であり、以下はcodeを根拠に訂正する。

| 画像 | codeとの差 | レビューへの影響 |
|---|---|---|
| 01 home | 状態欄に説明用の文章を追加していた | 通常表示される案内文とは扱わない |
| 02 変換 | sample値・候補一覧などを省略／置換していた | private sourceではない。実件数や確認完了の証拠にしない |
| 03 Native一覧 | 共有・コピーの展開内容をrowの外へ移していた。下端も画像外 | 実DOMではrow内。画像の高さ・視線移動の量を測定値にしない |
| 04 従来形式 | 余分なcard装飾や無効状態の再現漏れ | 旧形式で編集可能と判断しない。現行Data tabの変換導線だけ根拠にする |
| 05 Desktop | 抜く色・許容幅・境界のぼかしを省略していた | 実際はCaptionより前にさらにcontrolがあり、優先順位の逆転はcodeでも確認できる |
| 06 Caption | material sectionを外して先頭に表示。HEIC案内などを省略 | Caption選択でこのlayoutになるとは主張しない。移動が末尾なのはcodeで確認 |
| 07 回復 | 状態を同時に並べた説明図。「破棄して続ける」は生成側が付けた文言 | 実際のconfirmDialogは「OK」。状態遷移・確認文言の改善を既存実装と混同しない |
| 08 iPhone | Nativeにないシートハンドル、横並びの保存、二列のfieldを描いていた | 現行は一列field、titleの下に保存。ハンドルや3段階sheetの実装証拠にならない |

画像の文字サイズ、切れ、余白、tap領域、視点やmodel placeholderを、実製品の
表示不具合や性能として評価しない。更新後の§7 wireframeは明示した提案である。

### 問題の中心

| 画像・codeの所見 | 利用者が抱く具体的な疑問 | 推奨判断 |
|---|---|---|
| homeが二つ、戻りlinkが「従来形式のプロジェクト画面」 | 「違う製品に移ったのか。最初の一覧と何が違うのか」 | 一つのhomeを製品の起点にし、routeの都合を表示しない |
| 「開く／新しく作る」から別画面、入力が形式別で各欄「任意」 | 「今あるファイルはどこへ入れるのか。全部空でもよいのか」 | 作成／再開を結果で説明。作成に必要な一つの3D入力を明示 |
| 最初にmaterial、保存・移動・添付は離れた場所 | 「ピンを付けたいのに最初に色やmaterialを決めるのか」 | 記録を既定panelにし、追加と位置調整を近づける |
| 配置先、所属、調整モデルのselectが似ている | 「いま動くのはモデル全体か、このピンか」 | actionの隣へ対象名。所属と新規追加先を別ラベルで示す |
| 画像・説明・長い一覧の後にピン移動 | 「一度置いたピンは直せないのか」 | 選択記録の上端で移動と再配置を発見できる |
| 保存buttonが上、結果がpanel末尾、書出しは閉じて一覧へ | 「入力は残ったのか。元ファイルは更新されたのか」 | 端末保存と外部書出しを明示し、結果と次手を常時表示 |
| 閲覧中にも編集formが多い | 「操作できないのは故障か。読むにはどこを見るのか」 | 読むための本文・画像を主表示にし、編集への入口は一箇所 |

優先順位は発見のしやすさ、同じ作業内の往復、間違えた時の影響で決める。
小さなボタンや短い説明へ一律に削る方針ではない。表示セットと視点の**呼出し**は
反復確認に必要で、material・背景の**設定編集**と同じ優先度にはしない。
内部を透かして記録したい場合は、見え方panelの入口「表面の見え方（マテリアル）」と
説明「半透明にする・特定の色を透明にする」から不透明度等へ到達できる。
隠す機能にも、何ができるかを入口の名前で知らせる。

### 具体的な利用シナリオと操作・判断の見直し

以下は1回の熟練者操作を速くするためだけでなく、初見で目的から操作を発見できるか
を見る課題。頻度や操作数は未測定。判断分類は1=本人、2=安全な自動化、3=段階表示。

| 課題と想定する利用者の言葉 | 現行で必要になる探索 | 提案後の作業順 | 判断の扱い／受入れで見ること |
|---|---|---|---|
| 初回「この3Dデータに調査メモを付けたい」 | home→Native home、形式別file欄、複数の任意欄 | 新しく作る→3D file選択→名前→作成→記録追加 | データと名前は1、厳密な形式判定は2、補助面欄は該当時だけ3。途中で形式を調べに出なくてよい |
| 再開「昨日の続きを編集したい」 | 似た二つの一覧とmodeの違い | 同じhomeのProject→編集して開く | modeは1、lock確認は2。Project・mode・保存状態を本人が説明できる |
| 取込「LociMyuのZIPに記録した内容を続けたい」 | 通常homeとNative package欄のどちらかを知る必要 | fileを開く→LociMyu内容確認→変換→記録 | 入力sourceと必要な関係確認は1、未解決を推測しない処理は2。元ZIPと新しい作業の関係が分かる |
| 反復「三箇所へピンを置き、少しずれた位置を直したい」 | material・長いCaption一覧・画像説明をscrollして移動を探す | 追加→場所指定→同じ領域で位置調整・本文→次の記録 | 位置・内容・所属は1。明示済み文脈の再利用で再入力を減らす。本文と位置にpanel往復不要 |
| 修正「別モデルの記録を選び、このピンだけ直したい」 | 配置先と所属の違いを推測する | marker／一覧で選択→所属確認→ピンを移動 | 現在追加先へ自動再所属しない。モデルの位置が変わらない。終了は保存と別だと分かる |
| 画像「写真を付けて、読みながら前後を比較したい」 | 未保存で添付不可の理由、panel表示とoverlay画像の違い | 選択記録→必要なら先に保存→画像選択・添付→拡大・前後 | 対応付けは1。画像未読込／unsupportedはその場で次手を示す。復帰後も同じ記録 |
| 閲覧「受け取った説明を読み、別の向きから見たい」 | 編集formやmaterialの中から読取操作を探す | Viewで開く→記録検索／選択→画像→表示セット／視点 | 読むためにEdit不要。モデル表示状態を変えたい場合のEditへの入口は明示 |
| 整理「比較用モデルを追加して、重なるモデルを隠したい」 | 追加・visibility・位置のdetailsを個別探索 | モデルpanel→追加→対象表示・位置調整 | fileと対象は1、形式は2、細かな数値は3。追加は新Asset、差替えは既存Assetと区別 |
| 受渡「作業を保存し、確認だけしてもらいたい」 | 保存とbackupの違い、閉じる→一覧→共有 | 端末保存→書き出しへ→閲覧共有の範囲確認→保存先確認 | 出力目的は1。名前からpurposeを決めない。download開始と外部保存完了を区別 |
| 共同作業「返された変更を自分の記録へ取り込みたい」 | home importの拒否、技術用語のmerge欄 | 対象をEdit→保存済み→共同編集の変更を受け取る→結果 | 対象選択は1、baseline／衝突検査は2。衝突時は全件不変更と修正・再書出しの次手 |

### 文言の採否を判断する例

| 現行ラベル・問題 | 提案する見せ方 | 伝える結果 |
|---|---|---|
| 開く／新しく作る | プロジェクトのファイルを開く…／3Dデータから新しく作る… | 続きと新規が違う。選択後の作業先を予告 |
| packageを読み込む | ファイルを開く…、検査後に「復元」「閲覧用コピー」等 | 押す前にpackageという内部容器の理解が不要 |
| キャプション | 記録（キャプション）＋「場所に説明や画像を付けます」 | 単なる画像captionではなく3D上の記録だと分かる |
| ピンを移動 | 選択中の記録の隣に「ピンを移動」、移動中は「ピン移動を終了」 | 対象と現在のmodeを示す。既存の一貫した語を保つ |
| 表面へ置き直す | 同じ領域、未配置時は「モデル上に配置する」＋状態説明 | 微調整とsurfaceの再指定を区別 |
| プロジェクトを保存 | この端末へ保存 | 開いたZIPの上書きでも、別端末へ渡すfile作成でもない |
| 現在のビューを保存 | 現在の視点を登録 | Project保存とは別。登録によりこの表示セットの既定視点になることを近くに示す |
| 共同編集packageを統合 | 共同編集の変更を受け取る… | 同じProjectの記録・新規画像だけが対象。対象Project名を併記 |
| 閲覧共有用 | 確認してもらうためのコピー（閲覧共有） | 含む範囲を示し、元へ統合できないことを説明 |
| 編集用コピー | 別の作業として使うコピー（編集用） | 独立Projectで始め、元へ統合しない |
| 詳細の中の閉じる | ホーム | 作業を終える帰路を見つけられる。未保存時は破棄確認 |
| 破壊操作のOK | 「この記録を削除」「変更を破棄してホームへ」等の結果名 | 確認の対象と実行結果がbutton単体でも分かる |

「現在の表示をそのまま共有」というコピーはF13を解決するまで採用しない。
共有対象の見せ方は実際のexport対象に一致させる必要があり、表示文言だけで
保存されたactive DisplaySetの意味を変更できない。利用者向けprivacy説明も
「完全匿名」「編集禁止」と言い換えず、含むデータと原本への統合不可を伝える。

### 説明なしの課題で確かめる

検証では上表の利用者の言葉だけを渡し、押すbutton名やtab順を教えない。
操作前に「何が起きると思うか」、操作後に「何が残り、次に何をすればよいか」を
聞き、観察した迷い・行き止まり・誤った予測を記録する。架空の成功率は設定しない。
41タスクの元台帳へclick/tap、file dialog、panel移動、mode切替、再入力、gizmo準備、
undo/retry、所要時間を対応付け、既知の操作を教えた後の速さとは分けて扱う。

独立read-onlyレビューも、home統合・単一モデル入力・Caption優先・目的別出力の
方向を支持した。Viewのvisibility変更は現codeではEdit限定なので案を補正した。
再レビューで、新規作成を一モデルだけに限定しないことと、reviewのView開始は
永久的な編集禁止ではないことを明確にした。
今回の成果は設計改訂とコード照合。新たな実操作／実機PASSやproduction実装はない。

## 14. 公式ガイドラインに基づく再評価（2026-09-05）

この節は方針選択前の評価記録。G1の共通入口、G9の入力代替、G6の失敗時編集保持に
関する後続のPO方針承認は§15。根拠・実測の不足は承認によって解消した扱いにしない。

### 結論と評価方法

一つのhomeと記録中心の導線は維持する。ただし、前案の「二つの目的別file入口」
「3カテゴリの排他的タブ」「追加・移動の同格button列」「常時固定bar」は再検討する。
見た目を簡潔にするだけでは、操作の予測、対象の識別、keyboard操作、状態通知、
失敗後の回復は保証できない。§7と§10へ以下の訂正を反映済み。

ここで行ったのは**出典付きheuristic reviewとコード照合**であり、ユーザビリティ
テスト、WCAG適合性評価の完了、iPhone実測ではない。41タスクの実測欄はすべてU。
生成画像は§13の限界を持つ説明資料で、寸法・色・focusの証拠には使わない。
優先度は「候補前修正推奨／実測必要／別scope判断」を使い、新P0/P1認定や点数化はしない。

### 採用した一次資料と適用範囲

調査日2026-09-05。外部へ送ったのは一般的なguideline検索語だけで、private sourceや
Project内容を送信していない。Apple本文の一部は直接openではJavaScript必須となったため、
検索で取得できたApple公式ページ本文の該当節を用いた。確認できなかった節を根拠にしない。

| 資料群 | このレビューで使う内容 | 適用しない読み替え |
|---|---|---|
| Apple HIGの[Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)、[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)、[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)、[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 主作業の階層、対象別group、明確なaction、状況に合うfeedback、操作可能性 | WebをApple native UIとみなさない。Liquid Glass、SF Symbols、OS任せのoverflowを導入しない |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)とWAI Understanding、[APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/) | Webの達成基準と、focus／dialog等の具体的実装指針 | WCAG本文の規範と、Understanding／APGの非規範的解説を区別する。A/AA/AAAを混ぜない |
| Jakob Nielsenの[10 heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)、NN/gの[Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | 利用者の語彙、記憶負担、状態の理解、二次機能への到達 | 使いやすさの一般原則であって、特定の画面数・配置の適合規格ではない |
| GOV.UK Design Systemの[Tabs](https://design-system.service.gov.uk/components/tabs/)、[File upload](https://design-system.service.gov.uk/components/file-upload/)、[Button](https://design-system.service.gov.uk/components/button/)、[Error message](https://design-system.service.gov.uk/components/error-message/) | componentの適用条件、入力案内、具体的なaction名、入力失敗の伝え方 | 公共サービスのform全体を3D editorへ移植しない。「upload」はlocal-first製品の文言に使わない |

ガイドライン間の表面上の違いも機械的に統合しない。例えばAppleはtoolbarの主操作を
trailing側、GOV.UKはformの主操作を左側に置く。対象componentが異なるためであり、
LociViewではnavigation／Project保存／選択記録操作という範囲ごとにgroupを作る。
「どの画面でも主buttonは絶対一つ」「全操作をiconだけにする」という規則にはしない。
専門的な動作は短い日本語labelを残す。

### 指摘と具体的な訂正

#### G1 — 開始は内部形式の分類試験にしない（task 1–5、37）

- **根拠:** 利用者の言葉と認識可能な選択肢を使う原則に照らす。
  [NN/gのheuristics 2・6](https://www.nngroup.com/articles/ten-usability-heuristics/)。
- **現行／前案:** `src/ui/home.ts:141`の別home入口と`:101`のZIP受口が分離。
  前案の「プロジェクトのファイル／3Dデータ」の二択も、受け取ったZIPの中身を
  知らない人には判断が残る。混乱の実際の頻度は未測定。
- **訂正案:** 一つのhomeに用途説明・「ファイルを開く…」・対応入力の短文・
  この端末のProject一覧を置く。選択後、既存検査に基づいて「編集用を新しく作る」
  「この端末に復元」等の結果を示す。初回と再開で勝手にbutton位置を入れ替えない。
  一覧が空なら同じ場所で開始方法を説明する。
- **残す判断:** sourceの選択、作成内容、同一Projectへの統合の意図は本人。
  検証済み形式は自動判定、GS補助面等の該当項目だけ段階表示。
  source relation・purpose・conflictは推測しない。Mesh／Point＋GSの同時作成を維持。
- **確認:** 「受け取ったZIPを確認」「3Dにメモを付ける」「昨日の続き」の課題で、
  確定前に結果と原本不変を説明できるか。前案二入口との理解・迷いを比較する。
  一入口が必ず優れるとは断定しない。万能parser化が必要なら実装せず停止。

#### G2 — 近接と同格を区別する（task 15–19、22–23、39）

- **根拠:** function別のgroupと重要actionの階層を保つ。
  [Apple Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars)。
  buttonは動作を明確に伝える。[Apple Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons)。
- **現行／前案:** `src/nativeGs/app.ts:1627`の追加と`:1649`の位置操作の間に
  長い一覧・本文・画像がある。前案の一列3buttonでは新規と既存変更の区別が弱い。
- **訂正案:** 「場所の記録（ピン・説明）」内に、新規group「＋ピンを追加／追加先」と、
  直下の選択group「選択中／所属／ピンを移動／表面へ置き直す」を分ける。
  後者は二次操作。未選択で無意味な編集formを出さず、未配置記録は一覧へ残す。
  配置前は「配置を中止」、配置後は「ピン移動を終了」。後者はUndoでも保存でもない。
- **用語:** 「記録」だけでは録画や履歴とも読めるため、場所・ピン・説明を組み合わせる。
  一方、添付欄を恒久的に「画像」だけの概念へ狭める案はPROD-16に反するので不採用。
  見出し「添付メディア」、現在のaction「メディアを追加…」、現在の対応形式を併記する。
- **確認:** 別モデルの既存記録を直す課題で、新規ピンやモデル全体を動かさないこと。
  選択だけで移動modeに入らないこと。追加先と既存所属の違いをUIだけで説明できること。

#### G3 — 隠す対象は詳細であり、作業の前提ではない（task 9–11、14、24–27、40）

- **根拠:** tabsは同時参照が不要な内容に向く。頻出機能を二段目へ隠さず、
  展開先が分かる名前にする。[GOV.UK Tabs](https://design-system.service.gov.uk/components/tabs/)、
  [NN/g Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)。
- **現行／前案:** `src/nativeGs/app.ts:1696`ではmaterialが記録より前。
  前案の排他的な「記録／モデル／見え方」は、配置先とvisibilityの同時確認を分断し得る。
- **訂正案:** 記録を主領域に保ち、選択所属・追加先・表示状態の要約を同時に確認できる
  ようにする。詳細は「モデルの表示・配置」「表面の見え方（マテリアル）」
  「背景・視点」から展開。「その他」だけに設定機能をまとめない。
  名前のある展開部は通常見えるままにし、隠した機能を見つけられるようにする。
- **条件付きの優先:** material全体が低頻度という根拠はない。「半透明にして奥の記録を
  見る」課題では不透明度への近い導線が必要。表示セットと視点の呼出しも詳細設定へ
  埋めない。自動透明化、Viewでの新visibility、全選択同期はしない。
- **確認:** 「モデルが重なってピンを確認しづらい」「表示セットを変える」で、
  記録を見失わず設定へ到達するか。タブなしgroup案と往復・再選択を比較する。

#### G4 — 見える入力を、実際に操作・識別できる入力にする（task 1–8、11、19）

- **根拠:** [WCAG 2.1.1 Keyboard（A）](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)、
  [4.1.2 Name, Role, Value（A）](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)、
  [1.3.1 Info and Relationships（A）](https://www.w3.org/WAI/WCAG22/Understanding/info-and-relationships.html)。
- **コード確認:** homeのdropZoneはclick handler付きdivで、file inputはdisplay:none
  （`src/ui/home.ts:90,101`）。`src/ui/dom.ts:8`もkeyboard操作を補完しない。
  Nativeの位置・回転6入力は各軸の個別名がなく、兄弟spanが説明を担う
  （`src/nativeGs/app.ts:1182,1738`）。Caption本文等には既存labelがあり、全formの欠陥ではない。
- **訂正案:** file選択に通常buttonを置き、Enter／Spaceからpickerへ進める。
  「位置X」「位置Y」「回転X（度）」等をinputごとに関連付け、対象モデルをgroup名にする。
  点サイズにも単位・名前を付ける。hint／errorは対応するinputと関連付ける。
- **確認:** keyboardだけでfile選択と再選択に到達する。読み上げで対象・軸・単位・値を
  区別する。buttonを見た目だけ追加し、keyboardが同じ操作へ届かない状態を残さない。
  OS file dialogの挙動は実browserで別途確認する。

#### G5 — 安全な確認には、動詞とfocusの両方が必要（task 12–13、20–23、29–36）

- **根拠:** 確認actionに汎用OKを使わず結果名を使う。
  [Apple Alerts](https://developer.apple.com/design/human-interface-guidelines/alerts)。
  modalはfocusを内部へ移し、内部に保ち、閉じた後に戻す。
  [WAI-ARIA APG Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)。
- **コード確認:** `src/ui/dialogs.ts:7,25`のconfirmはroleと名前を持つが、初期focus・
  閉込め・Escape・復帰・背景不活性化がない。肯定buttonはprimaryの「OK」。
  画像window（`src/nativeGs/captionOverlay.ts:284,328`）にはEscapeは既にあるが、
  aria-modal表明に対応するfocus管理がなく、左右キーをdocument全体で受ける。
- **訂正案:** 「この記録を削除」「変更を破棄してホームへ」等を使い、破壊を主強調に
  しない。安全側へ初期focus、Tab／Shift+Tabはdialog内、Escapeは中止、終了時は
  呼出元か合理的な次の対象へ戻す。画像viewerは実際のmodal挙動とARIAを一致させる。
  aria-modalを付けるだけで背後の本文が操作可能な状態を残さない。
- **確認:** mouseなしで確認を開いて中止し、同じ作業へ戻る。画像表示中に背後の本文を
  誤編集せず、閉じると元thumbnailへ戻る。共通dialogの従来形式側も回帰確認する。
  必要な破壊確認は残すが、成功するたびに新たな確認dialogを増設しない。

#### G6 — 保存状態と操作ヒントを分け、回復不能を隠さない（task 6、12、20、28、31–36、41）

- **根拠:** feedbackは重要度に合う場所と方法で示す。
  [Apple Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback)。
  focusを移さず認識できる結果通知も必要。
  [WCAG 4.1.3 Status Messages（AA）](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)。
- **コード確認:** NativeのruntimeStatusは通常p（`src/nativeGs/app.ts:1150`）で、
  保存結果と選択hintを兼用。save失敗時はworkingをdurableに戻しdirtyも解除
  （`:2780`以降）。通常homeのfileStatusには既にrole=statusがあり、維持する。
- **訂正案:** 「端末への保存状態」「直近の失敗」「その場の操作案内」を分ける。
  保存成功／重要結果を適切に通知し、毎keystrokeや描画進捗をすべて読み上げない。
  入力検証失敗は入力箇所、保存・lock等の実行問題はProject状態の近くへ出す。
  利用者が直せない失敗を「入力が間違っています」と扱わない。
  [GOV.UK Error message](https://design-system.service.gov.uk/components/error-message/)。
- **rollback文案:** 「保存できませんでした。今回の未保存の変更は保持されていません。
  最後に保存した内容を表示しています。」原因が判別できる場合だけ具体的な次手を示す。
  成功色の「保存済み」へ直ちに戻さず、次の選択hintでも失敗の事実を消さない。
- **確認:** 本文focusを無用に奪わず成否が認識できる。失敗後に「残った内容／失った内容／
  次手」を説明できる。文言改善は回復性の解決ではない。入力保持・Undo・復元retryは
  既存契約変更になるため別scope判断とし、現在の残リスクとしてPOへ提示する。

#### G7 — 保存と受け渡しは、場所と目的を予測できる名称にする（task 28–34）

- **根拠:** action名は実際の結果を伝える。
  [GOV.UK Button](https://design-system.service.gov.uk/components/button/)。
- **前案の弱点:** 「書き出しへ」だけでは、別画面に行く理由や目的が不明。
  一覧へ戻って対象を再選択させると、同じ作業の続きに見えない。
- **訂正案:** 「この端末へ保存」と「バックアップ・受け渡し…」を区別。
  後者は対象Projectを維持して既存の目的選択へ導く。4目的は
  「完全バックアップ」「共同編集の変更をやり取り」「閲覧用コピーを渡す」
  「独立した編集用コピーを作る」。それぞれ含む範囲・統合可否を短く示す。
  直接保存できる環境では選択した保存先と成否を示す。download経路ではブラウザの
  ダウンロードへ渡すことを先に説明し、OS上の保存先・完了が確認不能なら断言しない。
- **確認／境界:** dirty時の中止で編集状態が残る。local saveだけでは外部fileが
  できないと分かる。既存close guard・lock・目的別serviceを保持する。
  F13の表示セットとreview範囲の意味は未解決のため「画面のまま共有」を保証しない。
  reviewは原本への統合不可であって、永久編集禁止や完全匿名の意味ではない。

#### G8 — iPhoneの密度、拡大、色は「見た目polish」だけではない（task 20–21、37–41）

`src/nativeGs/style.css:60`以降はstage約54dvhとpanel上限46dvh。固定barを増やす
前案は、小さいviewportとsoft keyboardで編集領域を減らすリスクがある。
一方、CSS指定だけでは実寸、実際の重なり、不適合を断定できない。

| 評価軸／出典 | 正確な基準とLociViewでの訂正・試験 |
|---|---|
| [Apple HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | 調査時のiOS/iPadOS表はdefault 44×44pt、minimum 28×28pt。44ptを全controlへの絶対最低値と引用しない。ptをCSS pxと同一視しない |
| [WCAG 2.5.8（AA）](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) | 原則24×24 CSS px。spacing、同等操作、inline、user-agent、essential等の例外は対象ごとに評価。icon絵柄ではなくhit領域と隣接間隔を測る |
| [WCAG 2.5.5（AAA）](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html) | 44×44 CSS px、こちらにも例外あり。主要touch操作の44 CSS px以上を本案の設計目標として提案するが、全AAA適合を意味しない |
| [WCAG 1.4.4（AA）](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html) | 文字200%拡大で内容・機能を失わない。小さい説明文に重要条件を押し込めない |
| [WCAG 1.4.10（AA）](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html) | 縦scrollの通常UIを320 CSS px幅相当で確認。1280px幅の400%zoomも使用。2D配置が本質の3D部分の例外をformやtoolbarへ拡張しない |
| [WCAG 2.4.11（AA）](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) | author作成UIでfocus対象が完全に隠れないことが最低条件。入力・保存を十分見える状態にするのは本案のより強い設計目標。iPhone縦横＋keyboardでも別途試す |
| [WCAG 1.4.3（AA）](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) | 通常文字4.5:1、大きい文字3:1。大きさの定義・例外を基準通り適用。画像化した見本ではなく実際の色と背景で計測 |
| [WCAG 1.4.11（AA）](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) | 操作や状態の識別に必要な非text情報は隣接色と3:1、該当例外あり。装飾borderすべてに機械適用しない。focus／選択表示も確認 |

訂正は、重要stateを発見しやすく保ちながら、狭い画面では通常flowへ戻せる構成。
独立したscroll領域を増やして帳尻を合わせない。3Dの任意背景でもUIの文字が読めるように
UI面とsceneを分離する。選択・失敗は色だけに依存せずtextや形も併用する。
上記は**全項目未実測**。前案の「細かい色・余白は候補後」は、可読性・hit領域・focusを
満たした後の装飾だけを指すよう訂正する。

#### G9 — gesture案内の改善と、代替操作の提供は別問題（task 11、17–18、20、38–39）

- **根拠:** [WCAG 2.1.1 Keyboard（A）](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)と
  [2.5.7 Dragging Movements（AA）](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)。
  keyboard代替があっても、drag不要の単一pointer代替を満たすとは限らない。
- **コード確認:** `src/nativeGs/viewer.ts:1203`の配置はShift+click／touch長押し、
  `src/nativeGs/app.ts:2439`はpin gizmoのdragを案内する。
  `src/nativeGs/captionOverlay.ts:344,398`の移動／resizeもpointerのみ。
  resizeにbutton名があっても、Enterでサイズ変更できるhandlerはない。
  モデル全体の既存数値入力は、ピン位置の代替ではない。
- **今の3 sliceで行うこと:** 入り方・対象・終了・不成立理由を近くに表示し、
  できない操作をできると表示しない。既存の記録一覧・formからの閲覧を保つ。
- **別途設計すべき訂正:** overlayの非drag移動／resize、pinの非drag調整とkeyboard経路。
  同じsurface／所属／座標契約を保つ方式が必要。任意座標生成や近いモデルへの推測で
  穴埋めしない。2.1.1の例外は操作経路自体が本質となる入力、2.5.7の例外はdraggingが
  essentialな場合等であり、別々に評価する。3Dという理由だけで全操作を免除しない。
- **確認／停止:** 「既存pinを選択→位置調整→終了」をkeyboardのみと単一pointer・
  dragなしで別々に試す。既存のpicking／renderer不変更の境界では不足が解消しない
  可能性があるため、候補判断前のscope論点として残す。4件目の実装sliceを無断追加せず、
  この3件の完了だけでアクセシビリティclosureやWCAG適合を宣言しない。

### 3 sliceへの配分と、減らす判断・残す判断

| 既存slice | 今回追加した受入観点 | 残す非対象／止める条件 |
|---|---|---|
| 1: home・入力 | G1の一主入口比較、G4のfile操作、G7の対象を維持した受渡し。入力後の結果理解とkeyboard到達 | 検査profile／package／registry統合、source推測、editor内直接exportなし |
| 2: 記録・文脈 | G2/G3の対象別group、G4の個別label、G5の画像dialog、G8の実測 | 非drag／keyboardの新しい3D操作はG9で別scope判断。添付メディア概念・既存能力を削らない |
| 3: 状態・回復説明 | G5の共通確認dialog、G6の持続的失敗と通知、G7の保存先・成否 | draft／Undo／autosave／storage変更なし。回復性の残リスクは説明だけで閉じない |

判断分類1は「対象・目的・所属・破壊の意思」。分類2は「既存の厳密検査、明示済み
選択の表示、focus復帰等の予測可能なUI動作」。分類3は「診断や稀な設定の詳細」。
失敗、未保存、GSの配置不可、統合不可、元sourceとの関係は分類3へ隠さない。
自動化は利用者の意味判断を代行することではない。

### 次の実査で記録するもの

§13の10課題と元の41台帳を使い、button名を教えずに実行してもらう。
初見課題と反復課題、pointerとkeyboard、画面を見た理解と支援技術の結果は分ける。

- 操作前の結果予測、実際の結果、対象取り違え、助言が必要になった場所。
- click/tap・file dialog・panel往復・mode切替・再選択／再入力・gizmo準備・
  中止／やり直し・所要時間。探索と待機を分け、未測定を0にしない。
- 連続3記録、別モデルの既存pin修正、画像を開いて戻る、表示状態と記録の同時確認。
- keyboardのfocus順・可視性・dialog復帰、読み上げでの名前・値・保存／失敗通知。
- 不正file、同一backup、未保存の離脱中止、保存失敗rollback、merge conflictの各状態。
- G8の実寸・色・zoom、iPhoneのsoft keyboardと縦横。task35/41のfresh実機が必要なら、
  exact buildと一つの一時HTTPS経路だけを提案し、PO承認後に実行する。

基準への対応を確認しても、実ユーザーが使えるという結果は実査でしか得られない。
今回の調査で既存の機能受入れを取り消さず、新たなUI／release PASSも付けない。

### 独立レビューとmeta-audit

二つのread-onlyレビューを分担し、W3C／accessibilityと、NN/g／GOV.UKによる
前案批判を得た。主担当がsource codeと公式資料を再照合した。
画像viewerにEscapeが既にある点を補正し、「添付メディア」を画像概念へ狭める案は
PROD-16に基づき採らなかった。複数資料を多数決で採用したのではない。

branch・HEADは開始checkpointのまま。変更は監査草案・todo・lessonsだけ。
server／tunnel／PoC／browser操作、新しいtest fixture、dependency、production変更はない。
元の設計3 sliceを精緻化する範囲に留め、未承認の機能・schema・releaseへ進まない。
最終read-only再レビューで、keyboard／drag例外の区別、画像dialog訂正と新機能の境界、
旧案の明示、直接file保存とdownloadの説明を補正した。41行・全U・3 slice・9指摘・
code fence・whitespaceの文書検証を行い、applicationのtest/buildは再実行していない。

## 15. POの設計方針承認と視覚デザインの評価範囲（2026-09-05）

POは、非自明な3論点に対する以下の推奨に賛成した。**方針承認済み／詳細仕様未確定／
実装未着手**として記録する。§22等の現在の保存契約や入力挙動をこの記録だけで
実装済みの新契約へ置き換えない。既存の機能受入れも無効化しない。

| 承認された方向 | 維持する条件と、実装前に具体化する点 |
|---|---|
| homeのfile入口は一つ | 既存の厳密検査後に作成／復元／変換等の結果を示す。端末内一覧と、編集画面の追加／差替え／共同編集受取はそれぞれ残す。元source・purpose・Proxy関係を推測しない。複合初期入力を維持 |
| 明示的な追加modeと複数の入力経路 | 追加→対象確認→click/tapで配置。対象・中止を表示し、配置成立後は通常操作へ。微調整には軸ごとの＋/−と移動量、keyboardの新規配置は位置カーソル方式を第一候補。既存Shift+click／長押しは維持。座標系・刻み・camera操作・面の確認・mode間遷移は詳細仕様で確定 |
| 保存失敗後も未保存編集を画面内に保持 | 正本の安全性と未保存編集を分離。dirtyと離脱警告を維持。lock loss時は書込み停止、保存先の更新・成否不明時は無条件retry／上書き不可。参照binaryの可用性も検証。永続draft、自動保存、再起動後復元はこの最小方針に含めない |

保存失敗後の入力喪失防止を優先的に検討する。ただし新P0/P1判定やrelease条件の
自動変更ではない。詳細仕様・検証範囲・実機条件を先に定める。§10のUI-only案へ
黙って追加せず、最大3件の実装単位へ再構成してからPOへ提示する。

### 配色・アイコンはUI/UX評価の対象か

**対象である。ただし現行の視覚デザイン全体の評価は未完了。** §14-G8は主として
可読性・識別性・操作領域の基準を整理したもので、配色体系やicon全体を評価し終えた
ものではない。数値測定も未実施。現状の配色を採用済みとみなさない。

| 評価軸 | 見る内容 | 現時点の到達点 |
|---|---|---|
| 色の意味と視覚的な優先順位 | 主操作、二次操作、選択、未保存、成功、警告、失敗、破壊の区別。3D内容とUIの強調が競合しないか | 保存状態・失敗の区別は指摘済み。全画面の色用途一覧と統一案は未作成 |
| 可読性と状態の識別 | 文字・icon・focusのコントラスト、色以外の手掛かり、任意のscene背景上での読めるUI面 | 基準整理済み、現行実測と全状態確認は未完了 |
| iconの意味と発見性 | 初見で動作を予測できるか。iconだけで足りるか。文字label・支援技術上の名前が必要か | 専門操作のlabel維持は方針化。全iconの対応表・意味の理解試験は未完了 |
| iconとcomponentの造形的一貫性 | 線幅、塗り／線、見た目の大きさ、重心、角、baseline、button内余白。異なる種類の記号の混在 | 現行の網羅的棚卸し・具体的な置換案は未作成 |
| 画面全体の視覚的品質 | 文字階層、余白、整列、密度、情報groupの分かりやすさ、落ち着きと製品としての統一感 | 構成の低忠実度案あり。高忠実度の配色・typography・component案は未作成 |

視覚デザインをアクセシビリティ数値だけに還元せず、美観と一貫した印象も評価する。
一方、好みだけで全色やiconを置き換えず、現在の良い部分も残す。確認済みコード・
実画面と、修正提案の見本を区別する。生成画像に含まれる独自装飾を現行iconの証拠にしない。

今後の具体化では「現行の色／icon／component → 問題と根拠 → 維持または修正 →
状態別の見本と確認方法」を示す。読めない色、意味不明の操作、選択・失敗を識別できない
状態は単なる候補後polishへ回さない。必要な可読性・意味・操作性を満たした後の
微細な装飾調整と区別する。新icon依存、外部asset導入、実装やreleaseは承認していない。

## 16. UX・美観の統合再評価と訂正方針（2026-09-05）

### 16.1 結論・POの意図・証拠

**現行は必要な機能と日本語labelを備える一方、作業の重要度・操作対象・状態を
視覚的に区別する規則が弱い。まずその規則を統一し、その上で落ち着いた外観へ整える。**
単に青をベージュへ置換する、全buttonをicon化する、枠を全部消す案は採らない。

POへの事前質問で、明暗はどちらでもよく比較して決めること、雰囲気は「資料の
落ち着きを基本に、計器らしさを少量加える」ことを確認した。これを今回の共通基準とする。
明暗二案は同じ構成・文言・対象・保存状態・3D背景で比較する。これは配色選択のための
見本であり、製品へのtheme切替機能追加や両themeの同時提供を決定したものではない。

今回の評価は前回画像と現行コードの再照合、2件の独立read-only review、一次資料の
確認に基づく。対象は通常home／Native home／Native編集・Caption・画像／共通dialog・
交換状態／従来閲覧画面との一貫性／狭幅CSS。主要部の棚卸しであり全computed styleや
全状態の網羅検証ではない。既存画像は§13の省略・創作箇所を除いて使用した。
Codex browser接続を再試行したが§1と同じ初期化エラーで停止。実画面の新規取得、
新しい41-task操作計測、iPhone操作はない。所要時間や総合点を創作しない。

### 16.2 参照原則とLociView独自の判断

以下は混ぜずに扱う。ガイドラインは判断の根拠、ゲームは印象の参照、配色値と配置は
LociView用の提案である。Appleのnative UIをWebへそのまま移植するものではない。

| 出典 | 適用する原則 | 今回の具体化 |
|---|---|---|
| [Apple HIG：Color](https://developer.apple.com/design/human-interface-guidelines/color) | 色の意味を一貫させ、色だけに依存しない | 選択、focus、未保存、失敗、ユーザー指定のピン色を別の役割にする |
| [Apple HIG：Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | 少ない書体、読みやすさ、拡大しても分かる階層 | 本文と入力は日本語system font。資料的なserifはブランド等の短い非操作要素だけ |
| [Apple HIG：Icons](https://developer.apple.com/design/human-interface-guidelines/icons) | 単純で理解できる形、線幅・重さ・見かけの寸法の整合 | 文字付きの簡潔な線icon。専門操作を曖昧な記号へ置き換えない |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/)、[文字contrast解説](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)、[非文字contrast解説](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) | 適用条件に応じ文字4.5:1／大きい文字3:1、識別に必要な非文字3:1 | 装飾の細線と入力の境界を別tokenにする。全装飾線を3:1にする規則ではない。Understandingは解説であり適合宣言ではない |
| §14のNN/g・GOV.UK・WAI-ARIA | 利用者の目的、段階表示、可視のfeedback、dialog内外のfocus | 記録の反復を主領域にし、補助設定は名前付きで展開。失敗や操作不能理由は隠さない |

[NieR:AutomataのUI担当者による解説](https://www.platinumgames.com/official-blog/article/9624)は、
平面的で整然とした構成に控えめなアナログのモチーフを加え、少ない色で可読性を
成立させる意図を説明している。その考え方を参考にする。低contrast、格子texture、
画面歪み、ゲーム内animationの模倣はしない。
[Endfield公式開発通信](https://endfield.gryphline.com/ja-jp/news/7017)の機能UI挿図も
一次資料として特定したが、今回は画像pixelを取得・目視できていない。公式サイトの
外装をゲームUIとみなさず、Endfieldの個別の配色・寸法を観察済みとは記載しない。
両作品のassetは取得・転載していない。以下の具体的造形はPO回答を基にした独自案。

### 16.3 共通の評価規則

方針名は **「研究資料のように読め、器具のように対象と状態が分かる」**。

| 軸 | 合わせる規則 | 避けること |
|---|---|---|
| 目的と優先順位 | 現在のtask groupの次の一手を強調。開始＝file、記録＝ピン追加と選択記録、確定＝保存 | 全機能を同じ強いbutton・同じ箱で並べる、全画面でprimary一つという機械的制限 |
| 造形と余白 | 矩形基調、小さな角、整列と余白で分類。罫線は区切りを示す箇所だけ | boxの入れ子、過剰な影、装飾目盛り、架空の計測値・研究ID |
| 色 | 暖かい無彩色＋低彩度の深緑系操作色。黄系は注意、赤系は失敗。状態名を併記 | 背景・見出し・buttonの全てにaccent、未保存を単なる色点へ置換 |
| 文字 | 本文・操作labelは14–16 CSS px、補足は13 pxを出発点に実機調整。3段階程度の見出し | 極小の英字、全文等幅、過剰なletter spacing、細すぎるweight |
| 計器らしさ | 位置軸・単位・件数など意味のある値だけを揃える。tabular numeralsは値の比較時 | 意味のない座標・進捗率、常時点滅、走査線、装飾badge |
| 状態 | 選択＝背景＋内側marker＋label、focus＝外側ring。loading／未保存／失敗を独立 | 選択の枠でfocusを上書き、エラーを成功色のまま表示 |
| 3Dとの関係 | 内容を主役にし、操作面は不透明で安定。scene背景とpanel themeは別 | sceneの明暗で読めなくなる透過label、ユーザーのpin色を安全状態色として使う |
| 小画面・拡大 | 同じ対象・動詞・状態を維持して縦に再配置。長labelを折り返す | Desktopを縮小、固定barの追加でkeyboard領域を圧迫、重要状態を下へ追い出す |

4/8pxを基礎にgroup内8–12px、group間16–24px程度、control角3–4px程度を比較案の
出発点とする。これは数値保証やAppleのptの換算値ではない。主要touch目標44 CSS px、
最低条件と例外、文字200%・320 CSS px reflow・focus条件は§14の区別を維持する。

### 16.4 前回薄かった部分の具体的な再評価

以下のVは今回のvisual finding。P0/P1認定ではない。「候補前」は改善提案上の優先度。
code行は冒頭checkpointのもの。根拠がCSSだけの場合、実際の見え方の断定を避ける。

| ID・関連task | 現行の証拠と利用者への影響 | 具体的な訂正 | 確認・優先度 |
|---|---|---|---|
| V1 全画面 | 共通CSSのtokenとNative直書き色が分かれる（`src/ui/style.css:4`、`src/nativeGs/style.css:1`）。home／panel／dialogで同じ役割の色・角が揃わない構成 | page／panel／field／main・secondary text／divider／control boundary／action／stateを共通定義。単に`:root`を明るくしてNativeを残さない | home→変換確認→編集→画像→交換結果を並べて同じ役割を照合。候補前に役割統一、全色微調整はpolish可 |
| V2 1,4,6,12,15,25,26,31 | 作成・復元・追加・差替え・Caption・視点登録・統合に同じ強いprimary（`src/nativeGs/app.ts:454`、`:1162`、`:1223`、`:1235`、`:1267`）。全sectionの15px青系見出しと同じcard（CSS`:5`）も同格感を増す | 「場所の記録」を主領域へ。一覧での選択と3D・編集欄の対応を保ち、追加と選択記録の位置調整を近接させ、表面編集と背景は補助へ。補助taskを開いた時だけその実行を強調 | まず何をするか／どれが選択対象かを説明できる。位置・階層は候補前、角丸微調整はpolish |
| V3 18,21,38 | 選択Caption／pressed modeとfocusが同じ青2px outline＋offset1（Native CSS`:22`、`:23`、`:55`と共通`:44`） | 選択を背景・内側marker・選択中labelへ、focusを独立した外側ringへ。移動中は対象と終了・中止を継続表示 | selectedかつfocused、移動中かつfocusedをkeyboardで判別。候補前 |
| V4 全入力 | 共通の弱いline tokenが装飾にもinput境界にも使われる（共通CSS`:7`、`:33`）。境界が必要なfieldでは発見性が弱くなり得る | 装飾dividerとcontrol boundaryを分ける。文字・shapeで識別できるbuttonまで一律に濃い囲みへしない | 実background上の適用contrastと入力発見性を確認。候補前。現時点で一律WCAG違反とはしない |
| V5 17,20,28,36 | `.ng-status`は緑（Native CSS`:59`）。save中・成功・失敗はtextだけ変えclassを変更しない（`app.ts:2758`、`:2777`、`:2800`）。statusはpanel末尾（`:1765`）でSaveから離れる | 保存専用stateをSave隣へ。作業hintから分離し、未保存・進行・成功・失敗を毎回明示設定。現在のrollbackも正直に説明。将来の入力保持は§15の契約確定後のみ | 通常save失敗と、先行画像error後のsave成功を両方確認。色が以前の状態を引き継がず、failure/dirtyを読める。候補前 |
| V6 19,20,31 | 重要な配置手順・入力条件・統合条件まで12px note（Native CSS`:13`、`:15`、`:58`、`:59`）。長文を読んで初めて結果を理解する | 重要条件を通常サイズの短文でaction直近へ。統合は「共同編集の変更を取り込む」＋「このプロジェクトと同じ由来・共同編集の開始状態を持つコピーの記録変更」。技術語は詳細へ | 初見で対象・結果・保存時点を答えられる。文字200%でも重要情報を維持。候補前 |
| V7 20,37,39 | 画像追加はdirty中disabled（`app.ts:1533`）だが保存要求はclick handler（`:2652`）にあり通常到達しない。Viewでも「編集できます」のguide（`:1417`） | 添付欄に「メディアを追加する前に、この端末へ保存してください」。Viewでは閲覧中の文言。disabledの薄さだけで理由を説明しない | View／clean Edit／dirty Edit／書込停止を分け確認。自動保存・自動Edit切替はしない。候補前 |
| V8 1,18,20 | homeのemoji（`src/ui/home.ts:126`）、overlayの文字`×`・`↘`（`captionOverlay.ts:341`、`:398`）、通常文字buttonが混在。`☰`でhomeへ戻る旧viewerもある（`src/ui/viewerScreen.ts:64`） | 一つのoutline語彙に揃える。homeは「一覧へ戻る」、resizeは拡縮の造形＋名前、削除と閉じるは別。既存aria-labelは保つ | 専門actionの可視labelを維持し、iconのみの意味当て試験にしない。意味修正は候補前、strokeの光学調整はpolish |
| V9 18–21,38–40 | Nativeはstage54dvh＋panel max46dvh、row buttonは縮まず共通nowrap（Native CSS`:51`、`:54`、`:60`／共通`:41`）。Caption listは無上限gridで位置操作までの距離が伸びる | 選択記録・所属・位置操作を同じgroup内に保持。キャプション一覧は通常表示する主領域。狭幅は縦flowと折返しを基本にkeyboard時の領域を再評価 | 長い日本語label／多数記録／200%／320 CSS px／実機keyboardで確認。overflowの発生は未測定。候補前検証 |
| V10 20,21 | panelの「画像を表示」は再clickのたびimageをappend可能（`app.ts:1430`–`:1455`）。開いている状態の手掛かりが弱く、同じpreviewが増え得る | 同じ画像の表示先を再利用し、開いている対象名を維持。失敗を空欄にせず再読込可能条件を示す。新galleryやpaginationは足さない | 同一画像を反復表示してpanelが伸び続けず、別Caption選択でも対象を誤認しない。候補前推奨 |

**残すべき良い点：** 日本語system fontと本文1.5行高、文字で示す所属・未配置・要再配置、
0件と検索一致なしの区別、閲覧／編集／書込停止のbadge、本文の折返し、画像のcontain、
keyboard focusの存在。文字や枠を減らすためにこれらを消さない。
現在の色の問題は「暗いから読めない」ではなく、役割と状態の一貫性を中心に捉える。

### 16.5 色・文字・iconの訂正仕様案

値は比較見本用で、採用未決。双方で同じsemantic roleを使い、scene色は固定した。

| 役割 | 明：研究ノート | 暗：閲覧室 |
|---|---|---|
| page／panel／field | `#eeede6`／`#f7f6f1`／`#fffef9` | `#1c211f`／`#252b27`／`#202621` |
| 本文／補足 | `#292d29`／`#62685f` | `#edece3`／`#b6c0b3` |
| 装飾divider／control boundary | `#d3d6ca`／`#7b8377` | `#424d42`／`#859480` |
| primary／その文字 | `#344a42`／`#fffef9` | `#c5d4ba`／`#1c211f` |
| 選択面 | `#e1e9de` | `#354436` |
| 注意文字／面 | `#795300`／`#f1e8ce` | `#e4c573`／`#393322` |
| 失敗文字／面 | `#963b32`／`#f9e8e1` | `#ffb4a3`／`#3d2c28` |

固定hex値のsRGB相対輝度式で計算した比率（表示は小数第2位、判定で丸めない）：

| 組合せ | 明 | 暗 |
|---|---:|---:|
| 本文／panel | 12.92:1 | 12.18:1 |
| 補足／panel | 5.30:1 | 7.69:1 |
| control boundary／field | 3.88:1 | 4.81:1 |
| control boundary／panel | 3.62:1 | 4.50:1 |
| primary文字／primary | 9.44:1 | 10.49:1 |
| 注意文字／注意面 | 5.63:1 | 7.50:1 |
| 失敗文字／失敗面 | 5.95:1 | 7.74:1 |

現行も共通補足／pageは5.17:1、Native note／cardは6.87:1、白／primaryは6.70:1。
一方共通input border／inputは1.21:1。後者は境界の役割・実際の隣接色を確認する
きっかけであり、一括不適合判定ではない。いずれも静的色値の比較で、alpha合成、
全background、hover/focus/disabled、OS control、画像上のpin、forced colors、日光下の
実機可読性を検証した数値ではない。最終実装で再確認する。

文字は本文とlabelを同じsans-serif基盤にし、project／section／fieldの順を
size・weight・余白で示す。短いブランドだけにserifを試す。本文を「研究風の細字」へ
変えない。保存状態の重大度は文字サイズを下げず、対象名と説明を折り返す。

| 操作 | 造形の方向 | 必ず残す文字 |
|---|---|---|
| 開く | folder＋open | ファイルを開く… |
| Caption新規 | pin＋plus | ピンを追加 |
| 位置調整 | 4方向移動 | 位置を調整 |
| 再配置 | surfaceへのpin | 表面へ置き直す |
| メディア添付 | paperclip | メディアを追加… |
| 保存 | 保存の単一glyph | この端末へ保存 |
| 出力 | package | バックアップ・受け渡し…（目的は次画面で文字説明） |
| 削除／閉じる | trash／closeを区別 | 削除対象と確定action／accessible name |

線iconは16–20px程度の見かけを揃え、本文と同程度のweight・共通strokeを目指す。
これは新library導入・SF Symbols assetの採用ではない。比較見本のhost提供iconは
production dependencyではなく、製品実装では既存assetか承認範囲の小さなSVGに限る。

### 16.6 状態・回復も同じ方針で揃える

| 状態 | 見える内容・場所 | 安全な次手／禁止 |
|---|---|---|
| 開始・空 | 製品の一文説明＋file入口。記録0件ではピン追加、検索0件では条件を表示 | 空と読込失敗を混同しない |
| 読込・保存中 | 実行actionの近くに中立色で対象と「処理中」。測れないprogressは率を作らない | 二重実行を防ぐ。現在存在しないcancel機能を約束しない |
| 閲覧 | Project headerに閲覧中。本文や画像は読める。編集できない理由を近傍へ | 無断でEditへ変えない |
| 選択・追加・移動 | 選択名／所属／追加先を分ける。mode中は対象と中止・終了 | 選択対象からsource relationを推測しない。modeの具体契約は§15の未確定事項を先に解く |
| 未保存 | Save隣に未保存の文字。画像追加等の制限理由も該当欄へ | 見た目を簡潔にするためdirtyを隠さない |
| 保存失敗（現在） | 保存失敗＋最後の保存状態に戻したことを表示 | 現在のrollbackを「編集が残っている」と誤表示しない |
| 保存失敗（承認方向の提案） | 容量不足等で確定前に失敗し、作業を保持できた場合のみ、未保存保持と再保存条件を表示 | lock lossは書込停止。generation不一致・成否不明は無条件retry不可。保持可能binaryを含む詳細契約は未確定 |
| 取込conflict | 全体中止／Project不変、衝突内容と元copyで見直す次手 | 勝者自動選択、部分統合、filenameによるpurpose推測は禁止 |
| 削除・置換確認 | 対象・変わるもの・保持するもの・確定時点、action名入りbutton | 一般的なOKだけにしない。初期focus・trap・Escape・復帰・背景操作抑止も§14に従う |

比較見本の保存失敗は§15の**将来の通常保存エラーの設計例**で、現行挙動ではない。
画像追加の未保存中disableは既存契約を維持し、近くに理由を示した。
画像そのものはGeneric placeholder、3Dは模式図で、実データもrender性能証拠も含まない。

### 16.7 Desktop／iPhoneの見本と実装優先度

初回の会話内比較見本は、同じ編集画面と統合homeを明暗で切り替えた。
この見本の3D下の一覧／狭幅の長い縦flowは§18で撤回し、右側一覧＋詳細と、
低い画面・iPhoneの一覧／詳細切替へ再提案した。追加と選択記録の位置操作を近づけ、
モデル・マテリアル・背景は名前付き補助groupとする。一覧は折畳み入口だけにしない。保存済み見本では保存buttonも無効にし、
容量不足の提案では画面内のみの保持・再読込で失われる限界とsite dataを消さない注意を示す。
一時的なtheme選択で3D背景や保存状態を変えない。iPhoneのkeyboard時や固定領域の
最終形は実機で判断し、見本の通常flowを最終実装寸法とはしない。

候補前に優先するのは、入口・対象・状態・主要反復の意味が揃うこと、選択とfocusの
識別、操作不能理由、重要文言の可読性、画像preview重複防止、誤解しない確認画面。
候補後polishへ回せるのは、機能上の識別が成立した後の角・余白の数px、iconの光学的
微調整、ブランドserifの選択、控えめなtransition。theme二種提供は別の判断であり
この比較から必須機能へ繰り上げない。ライセンス・外部font・新依存へ進まない。

### 16.8 最大3件の提案境界と次の判断

§10はUI-only段階の案として保持する。§15の承認方向と本節を全て実装するには、
そのまま着手せず次の3境界へ仕様を組み直す。これは新たな実装承認ではない。

| 境界案 | acceptance | 明示的非対象・着手前条件 |
|---|---|---|
| A 共通入口と視覚的な基盤 | 通常`/`一画面から既存全入力へ到達。内容検査・結果説明、複合初期入力を維持。home・確認・editorの同役割controlが統一され、selected＋focusを区別できる | package判定変更、theme設定機能、互換storage変更、dependency、全UI大規模refactorなし。POがpaletteと小さなcomponent契約を選んでから |
| B 記録の反復と対象・入力 | §18の右側一覧・詳細でCaption作業中の選択確認にpage scroll不要。§19の機能tabを往復して対象と探索位置を保持。高さ不足は一覧／詳細切替。追加と位置調整が隣接し、追加先／既存所属／表示対象を区別。空・検索0件・View・dirty制限を説明。画像再表示で重複しない。mouse／touch／keyboard／非dragの配置と中止が仕様通り | 推測配置、Proxy新契約、個別Undo追加、gallery拡張、media形式追加なし。先に座標・刻み・surface・camera・mode遷移を承認。任意dock・個別frame-selected・前後巡回の新機能は含めない。実機条件なしで入力PASSにしない |
| C 保存状態と限定した回復 | Save近くのstateが操作結果に一致。通常save失敗で契約上保持可能な未保存作業を失わず離脱警告維持。lock loss・更新競合・成否不明を安全に止める。確認dialogのfocusとaction名を検証 | 永続draft／自動保存／再起動復元、schema、conflict winner選択なし。§22との新しい限定契約・binary保持・テストを先に承認。色変更だけで保存回復完了としない |

どの境界も今回実装しない。過大になる場合は対象を縮めてPOへ戻し、無制限の子sliceへ
分解して承認範囲を迂回しない。元の41-task計測は未完了のまま。task35/41のfresh iPhone
が必要ならexact candidateと一件の一時HTTPS案を別途提示し、承認前には実行しない。

### 16.9 この再評価の検証記録

2件のread-only code reviewと提案の再レビューを実施。保存state、mobileの補助設定順、
一覧入口、失敗時の画面内保持の限界、共同編集の由来条件を訂正した。
比較見本は約18KB、tag整合・一意ID・label参照・script構文・明暗×3保存状態と画面切替の
計8ケースを簡易DOM代替で検証した。これはbrowserのlayout／focus／描画検証ではない。
静的contrast計算と狭幅での順序指定は確認したが、pixel目視・実機・操作計測は未完了。

branch・HEADは不変、既存origin refとの差はahead 0／behind 0、unpushed 0。
fetchしていないためlive remote更新は未確認。worktree変更は本監査草案・todo・lessonsのみ。
今回server／tunnelは起動せず、終了時5173のlistenerなし。新規のprivate source読取り・
複写はなく、比較見本は汎用の架空内容のみ。開始時のbyte監査の限界は§1のまま。
production code・仕様契約・依存・schema・公開物は変更せず、application test/buildは
このdocs／見本のみの再評価では再実行していない。UX closureやWCAG適合を宣言しない。

## 17. PO訂正：メディア文言・キャプション一覧・元UI確認の不足

POは「画像の追加ではなくメディアの追加」「キャプションリストがないと不便」と指摘し、
現在のLociView UIは不完全なテスト用UIであると明示した。

**前回までのLociMyu比較は文書参照であり、元UIの実画面・実操作を確認した比較では
なかった。** LociViewの現行UIを完成形の基準に寄せすぎ、一覧の入口だけを残せば
主要な閲覧・選択導線を保てると扱ったことを訂正する。現行codeは実装の事実を示すが、
完成した情報設計や機能の必要十分性を示すものではない。

### 今回初めて直接照合した元UIの証拠

provenanceに記録された保管済みLociMyu αのUIソースを、archive内でread-only確認した。
現行作業フォルダにUI本体はなかったため、保管済み原本を参照した。展開・実行・network・
実Project読取りはしていない。現在POが使う版との同一性と、実画面の目視・操作は未確認。
以下は元UIのcode証拠であり、live auditやLociViewの新機能採用ではない。
privateな保管先path・filename・hashは転記しない。

| 元UIで確認した事実 | ソース内の該当箇所 | LociViewの設計へ残す意味 |
|---|---|---|
| 右panelにsheet選択、その下にCaption／Material／Views。Captionが初期選択 | 画面定義 303–318行 | 記録群の文脈を示し、日常の記録閲覧を開始地点にする。タブの形自体を無条件で継承・排除しない |
| Caption内に色・filter・一覧・title/body・画像の順。一覧は高さ160pxのscroll領域 | 画面定義 208、319–347行 | 一覧は主操作領域。数値寸法をコピーせず、複数件を見渡して選ぶ役割を維持 |
| 行は色点・title・添付画像の印等を表示。行選択で本文・3Dピン選択・画像previewが連動 | Caption UI controller 447–537行 | 一覧・編集・3Dの選択を対応させる。選択だけで配置先変更やgizmo起動をしない |
| 3Dピンからの選択も一覧・編集欄へ連動 | Caption overlay 628–633行 | どちらから選んでも同じ対象を追える |
| 色filterは3Dピンだけを絞り、一覧には全項目を残す。文字検索欄は今回確認範囲になし | Caption UI controller 440–443行、画面定義・controller全体 | 見えないpinを一覧まで失わせない。LociViewの文字検索をLociMyu由来と誤記しない |
| 原本は画像一覧を更新し、サムネイルから選択中Captionへ添付する | 画面定義 341–345行、Caption UI controller 677、778–790行 | 選択記録への添付と結果確認を近づける。Google／folder対応推測や画像専用語彙は継承しない |

### 訂正した設計と見本

以下は§17時点の訂正履歴。media文言・一覧の必要性は維持するが、3D下への配置は
後続の§18で撤回した。3件の見本では多数件・低い画面の探索問題を評価できていなかった。

- actionは **「メディアを追加…」**。補足は「現在の対応：PNG・JPEG・WebP・GIFの画像」。
  未保存時の案内も「メディアを追加する前に、この端末へ保存してください」とする。
  media概念と現在の対応形式を分離し、未対応の動画・音声操作を先に出さない。
- キャプション一覧を通常表示する主領域に戻した。折畳み入口と1件だけの見本を廃し、
  架空の3件・検索・件数・選択表示を示す。一覧選択で編集欄・添付名・模式図の選択位置が
  同時に変わる。検索しても現在選択中の記録を勝手に別の記録へ変えない。
- Desktop見本は3D下の一覧と右側の編集欄を併置し、編集欄が一覧件数によって押し下がる
  構成を避けた。狭幅見本は3D→一覧→選択記録→補助設定。多数件・keyboard時の配置は
  未検証であり、見本の3件を十分な実機acceptanceにしない。
- 位置調整を追加近傍に置く、補助設定を段階表示する、安全な保存・relation境界を保つ
  方針は維持する。原本の無確認の削除、Google依存、単一model前提まで継承しない。

見本のmarkup・script・8状態切替、3記録選択、3検索状態、palette切替時の選択保持を
静的検証した。実ブラウザのlayoutや実機操作のPASSではない。production code、schema、
media対応、source archiveは変更していない。次の監査では元UIを目視・操作した証拠を
別途得て、一覧と3Dと編集欄の反復を優先確認する。§3の41-task実測は未完了のまま。

## 18. 一覧の位置ではなく、選択を見失わない作業領域へ（2026-09-05）

### 18.1 結論と比較の前提

**Desktop既定は「3Dの右側に、上段のキャプション一覧と下段の選択記録」を推奨する。**
前案の3D下の一覧は撤回する。「一覧を用意する」だけでなく、3Dを見ながら別の記録を
選び、その本文・位置・メディアを確認する反復を、page全体の上下移動なしで行うため。
右側が普遍的に最良という実測結果ではない。重要なのは対象一覧と選択詳細の隣接、
3Dとの同時参照、スクロールの分離であり、今回はLociMyuの右panelとの連続性もある。

想定課題は「20件から対象を探す→位置を見る→本文と写真を照合→次の記録」および
「3Dのピンを選ぶ→どの記録か確認→位置を調整→別の記録」。件数・頻度・所要時間は
合成検証条件／設計仮説であって利用統計ではない。以下の一次資料は公式説明を調査した
証拠であり、他製品を実操作・pixel比較した証拠ではない。

### 18.2 参照製品の事実と、LociViewへ取り込む理由

| 一次資料で確認できる事実 | 評価・取り込むpattern（ここからは設計判断） | 取り込まないもの |
|---|---|---|
| [Unreal Editor](https://dev.epicgames.com/documentation/en-us/unreal-engine/unreal-editor-interface)は右上Outliner、右下Details。viewport／一覧のどちらで選択しても同じActorを強調し、詳細が追従する | 空間・対象名・編集対象を並行確認できる。LociViewでも一覧と詳細を右側に集約し、同一Captionを追う | 全機能の密度、任意dock、階層tree、inspectorのlock。選択と編集対象を別々に固定しない |
| [Acrobat Desktop](https://helpx.adobe.com/acrobat/desktop/share-and-review-documents/manage-reviews/view-comments.html)は文書右側にコメント一覧、filterとpanel幅調整を持つ | 注釈は文書の後の付録でなく、原対象と同時参照する主操作。Captionをstage下の長いpageへ追い出さない | コメント返信・レビュー状態等の追加機能。幅可変は将来の検証候補で、今回必須の新機能にしない |
| [UnityのScene navigation](https://docs.unity3d.com/6000.0/Documentation/Manual/SceneViewNavigation.html)では選択対象へのFrame Selectedを別の操作として説明する | 選択とカメラ移動を区別する。位置比較中に、選ぶたび構図を変えない | Frame SelectedをLociViewへ実装済みと扱うこと。新しい個別注視機能は別途仕様・承認 |
| [Acrobatの3D注釈](https://helpx.adobe.com/acrobat/using/commenting-3d-designs-pdfs.html)はコメント選択に保存された3D viewの復元が結び付く | 保存された視点を順に読むreviewには有効。一方、同じ構図でピン位置を編集する今回の既定とは目的が異なる | 選択だけでSaved Viewを呼び出すこと、camera移動を無条件に自動化すること |
| [NieR:AutomataのUI制作者](https://www.platinumgames.com/official-blog/article/9624)は基本操作だけで全menuへ到達でき、追加shortcutは必須にしないと説明。Optionsでゲームへ戻る導線も説明している | ゲームの外観だけでなく、基本経路の明快さと作業文脈へ戻れることを採る。LociViewは見える一覧・選択・戻るで完結する | 隠しshortcutのみの操作、ゲームpad用の階層、低contrastや演出。ゲームの一覧位置がそのままWeb編集の最適位置という推論 |
| [Apple HIG Split views](https://developer.apple.com/design/human-interface-guidelines/split-views)は隣接paneの関係と選択の保持、狭い画面での適応を扱う | 通常Desktopは同時参照、小画面は同じ対象を保った階層移動。幅だけでなく実際の可用高さ・文字拡大を判定する | iPhoneにDesktopの全paneを縮小して詰め込むこと。HIGをWebの必須規格として扱うこと |

元LociMyu αの右Caption panelと一覧→title/body→画像の連動は§17のsource確認に
基づく。実画面は未確認。sheet内部構造、Google依存、関係の推測は引き継がない。
ゲームの制作意図と、ツールの配置・選択契約を分けて比較した。

### 18.3 三案の比較

| 案 | 得意な作業 | 今回の弱点と採否 |
|---|---|---|
| 3D下に一覧、右に詳細 | 横に広い表を見たい時。3Dと一覧を上下に収める分析画面 | 可用高さを3Dと奪い合う。page scrollなら3Dか一覧を失う。独立scrollにしても一覧と詳細が離れる。今回は既定から撤回 |
| **右上に一覧、右下に詳細** | 名前を探す→選ぶ→内容・位置を直す反復。3Dの幅を比較的残せる | 縦の競合が弱点。一つの長い右panelにせず、兄弟のscroll領域＋固定の選択帯にする。今回の第一候補 |
| 左に一覧、中央3D、右に詳細 | 横幅が十分あり、多数記録を一覧主体で調べる専門作業 | 一覧→詳細の視線・pointer横断、3Dの狭さ、三列管理が増える。右側が不利と実査で分かった時の比較対象。任意layout切替機能は追加しない |

### 18.4 具体的な画面とスクロールの責任

```text
Project名 · 編集／閲覧 · 保存状態                 この端末へ保存
┌──────────────────────────┬──────────────────────────────┐
│ 表示セット／保存した視点   │ キャプション一覧   件数・検索  │
│                          │ ○ 北側のひび割れ              │
│                          │ ● 入口の段差   ← 選択を強調   │
│          3D              │ ○ …       ［一覧だけscroll］  │
│                          ├──────────────────────────────┤
│ 選択ピンを強調            │ 選択中：入口の段差／所属       │
│                          │ 新規の追加先     選択中のピン  │
│                          │ ［ピンを追加］ ［位置を調整］  │
│                          ├──────────────────────────────┤
│                          │ タイトル・本文・添付メディア   │
│ 補助設定の名前付き入口    │        ［詳細だけscroll］     │
└──────────────────────────┴──────────────────────────────┘
```

- 通常Desktopはpageを作業中のスクロール面にしない。一覧と詳細を**兄弟**のscroll領域に
  し、右panel全体をさらにscrollさせる三重構造を避ける。末尾のwheel／touchがpageや
  stageのzoomへ抜けないことも検証する。本文が長くても一覧と対象名は残る。
- 一覧は簡潔なtitle・識別表示・必要な添付印に留める。本文や全操作を行内へ繰り返さない。
  長いtitle／同名Captionは所属など必要な文脈で識別し、内部IDを常時読ませない。
- 選択帯は対象名・所属と近接した追加／位置操作。追加先と選択中Captionの所属が違っても
  同期しない。未選択時は説明と追加・一覧を示し、架空の選択を自動で作らない。
- material・背景は補助設定。選択帯へ常設しない。必要な表示調整への入口は失わせず、
  Caption選択を保持したまま戻れる。色・iconは§16の同じ役割tokenを使用する。

### 18.5 選択・カメラ・入力を別の状態として扱う

| 操作／状態 | 提案する遷移・回復 |
|---|---|
| 一覧の行を選択 | 一覧の強調・3Dの選択・詳細・選択帯が同じCaptionになる。新規追加先／所属／座標／cameraは変えない。選択だけでgizmo起動・保存確定をしない |
| 3Dのピンを選択 | 同じ同期。行が一覧の外なら**一覧内だけ**必要最小限scrollして一度見えるようにする。選択維持のために手動scrollを繰返し引き戻さない |
| 検索で選択行が消える | 選択と内容を保持し「検索結果外」と明示。「検索を解除」は明示操作。queryを勝手に消す／先頭を勝手に選ぶ／見えていない3Dピンを誤って存在しない扱いにしない |
| 非表示Asset／未配置／要再配置のCaption | 一覧から消して問題を隠さず、その理由と可能な次手を示す。選択だけでvisibility・surface relationを変更しない。表示セット外への移動契約は既存仕様に従い、別セットを無断で開かない |
| 本文を編集中に別のCaptionを選ぶ | 入力中の文字と対象の対応を保証する。IME途中・未反映field・validation errorでは黙って破棄／確定しない。必要なら選択遷移を止め、その場に理由と完了／中止を表示。既存dirty制約や保存契約をUI案だけで変更しない |
| ピン追加／位置調整中に別の対象を選ぶ | 有効な対象と操作modeを保持し、進行中の処理を先に完了または明示中止。自動的に新しい対象へgizmoを付け替えない。細かい終了／中止契約は実装前承認 |
| Desktopの通常選択 | 本文へ自動focusしない。selectionとkeyboard focusを別に描く。cameraの自動追従もしない |
| 小画面で一覧→詳細に移動 | 明示的な画面遷移なので、消えた行へfocusを放置せず、詳細の「一覧へ」等へ移す。戻る時は一覧内の見える対象／検索へ。mobileで本文へ勝手にfocusしてkeyboardを出さない |
| 保存失敗／lock loss | 一覧や選択変更で失敗を隠さない。通常保存失敗での入力保持は§15–16の承認方向と、着手前に確定する保持可能な入力／binary契約に限定。lock loss・成否不明では書込みを止め、判明している状態とエラーを正しく表示する。全面的な回復・永続保持は保証しない |

### 18.6 低いDesktop／iPhone

高さが足りない時、一覧と詳細をそれぞれ数行へ押し潰すのは解決ではない。
小画面は選択名を残した同一領域の「一覧／選択中の内容」に切り替える。
iPhoneは上に3D、下にこの記録領域。初期は一覧、選択すると詳細、「一覧へ」で戻る。
横幅だけでなく、browser chrome・長文label・200%文字拡大・keyboard後の可用高さで判断する。

一覧へ戻る時はqueryと探索scrollを維持。3Dで新しいピンを選んだ場合だけ、その行を
一覧へ戻る際に一度見えるようにする。詳細scrollは隠す前に保存し、表示した後に復元する。
compactでは同時に一覧と全文が見えるとは主張しない。通常の一覧→詳細と戻る経路を
短く保つ代わりに切替が増えるtradeoffを認める。keyboard時には入力・エラー・完了操作の
可視性を優先し、3Dの同時全面表示は強制しない。固定heightや切替閾値の正式値は未決定。

### 18.7 操作量・判断量と受入れ課題

以下は設計上の経路で、実測click/tap／時間ではない。41-task台帳のUは維持する。

| 課題 | 提案経路・減らす負担 | 残す判断（1）／安全な自動化（2）／段階表示（3） |
|---|---|---|
| すでに見える行を開く | 通常Desktopは行選択1回で3Dと内容を照合。確認のためのpage移動不要 | 1: 対象選択。2: 同一対象の表示同期 |
| 多数の記録から探す | 一覧内の検索／scroll。本文を読むためpage位置を往復しない | 1: queryと対象。2: 件数／結果外表示。別対象の自動選択は不可 |
| 3Dで選んだピンを確認 | pin選択1回、必要時は一覧内だけ自動で行を見せる | 1: 選択。2: 行の表示。camera構図変更・source推測は含めない |
| compactで次の記録を読む | 「一覧へ」→行選択の2操作が基本。長いpageの上下往復を置換 | 1: 次の対象。2: query／scroll／対象名保持。前後巡回の追加機能は必須にしない |
| 位置を編集、メディアを確認 | 選択帯から位置調整、詳細内で本文・メディア | 1: 追加先／編集対象／完了・中止。3: material・背景の詳細 |

受入れ候補（実装前に正式条件へ落とす。今回PASSではない）:

1. 20件・100件、長title・同名・長本文・添付多数で、通常Desktopの選択名／一覧／3Dが
   page移動なしで把握できる。一覧末尾を読む間も詳細領域を押し出さない。
2. 一覧→pin、pin→一覧で対象が一致。手動scrollを妨げず、camera／gizmo／追加先は不変。
3. 検索0件／結果外選択／選択Assetと追加先が異なる／未配置を混同しない。
4. 長本文→別Caption→元Caption、小画面の一覧→詳細→一覧で探索・読書位置を検証。
   IME途中・無効入力・位置調整中・dirtyでは遷移で入力を黙って破棄しない。
   通常保存失敗は§15–16の保持可能な入力／binaryの限定契約で確認し、lock loss・
   成否不明では書込停止と正しい状態表示を検証する。あらゆる失敗からの復元を約束しない。
5. 通常・低いDesktop、320 CSS px、文字拡大、keyboard／focusで欠け・不可視focusなし。
   Codex browserと人間のChrome確認を分け、iPhoneは実機keyboard・safe area・touchを別に確認。
6. click/tap、panel切替、不要なpage scroll、再入力、所要時間を同条件で記録。
   設計図の経路数を実測へ転記しない。fresh iPhone／HTTPSは従来通り別途PO承認。

### 18.8 提案範囲と今回の検証

§16.8の最大3境界を維持し、本訂正はBの受入れへ反映する。candidate前は、対象を
見失わない配置・選択同期・入力／保存保護を優先候補とする。任意dock／pane resize、
前後巡回、frame-selected、装飾transition等は今回の必須変更にしない。
色の微調整は構造が成立した後。media形式・package・schema・依存は変更しない。

2件の一次資料調査と独立した見本のread-onlyレビューを実施。compact切替で消える
focus、非表示詳細のscroll復元、検索結果外からの回復、追加先と所属が異なる例を訂正した。
会話内見本は架空20件、同じ内容の明暗、通常／低い／iPhone条件を比較できる。
選択と検索だけを動作させ、保存・実編集・実camera処理はしない。番号は例示上の目印で
永続Caption IDの新仕様ではない。長文・高さによる自動退避と実keyboardは未検証。
見本の条件切替は比較用であり、製品に新しいlayout設定を必須追加する提案ではない。

markup、ID、script、20件の選択同期、局所scroll計算、検索3状態、明暗保持、
compact切替のfocus呼出し／scroll保存順を簡易DOM代替で確認。**描画・browser focus・
実機・操作時間の検証ではない。** 本体のtest/buildはdocs／見本のみのため再実行せず。
本体UI・release・server／tunnelへ進まず、この設計をPOへ提示して停止する。

## 19. LociMyuの機能タブを継承し、造形と状態を整える（2026-09-05）

### 19.1 今回の判断と参照の限界

POは右側一覧案を肯定的に評価し、他機能もLociMyuの基本思想を引き継いで整理する案と、
装飾を増やさず角・font・枠の強弱・押下感を洗練するよう求めた。詳細設計／実装の
包括承認ではない。本節はその設計提案。前案の補助設定入口は、以下の機能tabへ整理する。

| PO指定の参考 | 今回確認した証拠 | 扱い |
|---|---|---|
| [Endfield掲載ページ](https://gameui.matme.info/blog/archives/126184) | ページ名・掲載画像への参照は取得。画像本体の表示・目視はできていない | 欲しい方向の参照として受領。角の数値、font名、押下animationを観察済みとはしない |
| [NieR公式制作者記事](https://www.platinumgames.co.jp/dev-nier-automata/article/183) | 丁寧なフラット配置、控えめなアナログ記号、暖色の同系色と視認性の難しさ、太さ・濃さでの表現を本文で確認 | 作品固有の柄ではなく、配置・文字・色の役割を整える制作思想を採る。実fontの同定や動画内の動きの計測はしていない |
| [ドルフロ2掲載ページ](https://gameui.matme.info/blog/archives/120571) | ページ名・掲載画像への参照は取得。画像本体の表示・目視はできていない | screenshot添付を非blockingで依頼。画面を分析し終えたとは記載しない |

Codex browserは今回も初期接続で失敗。外部browserへの無断切替や画像のlocal downloadは
していない。画像2資料の目視照合は残すが、確認済みの原則を使った比較案は提示できる。

補強する一次資料:

- [Apple HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons):
  custom buttonには押下状態を持たせ、短い文字が明瞭ならiconへ無理に置換しない。
- [Fluent 2 Button](https://fluent2.microsoft.design/components/web/react/core/button/usage):
  主要操作を強調し、補助操作に同じ視覚的weightを与えない。多数の軽い操作には
  outline／subtle／transparent等の表現を使う。
- [WAI Non-text Contrast解説](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html):
  全buttonの外枠に一律の強い線を要求するものではない。ただし、認識や状態判別に
  必要な境界・印・focusは識別できる必要がある。極細線の見え方には注意する。

### 19.2 四つのタブと、タブに入れないもの

**右作業領域全体を「キャプション／モデル／マテリアル／視点」で切り替える。**
LociMyuのCaption／Material／Viewsに、複数Assetを扱うためのモデル群を加える。
Mesh／Point／GSごとのタブにはしない。通常の初期位置はキャプション。

| タブ | 既存機能の置き場所 | 明示する対象 |
|---|---|---|
| キャプション | §18の上段一覧＋下段詳細、検索、title/body、ピン追加・位置、色、添付メディア | 選択Captionと所属。新規追加先は別に表示 |
| モデル | Asset一覧、表示／非表示、追加、配置、回転・scale、差替え、削除、ピン倍率・点サイズ等 | 操作対象Asset。Captionの所属やmaterial対象と暗黙同期しない |
| マテリアル | 「モデル表面の見え方」の説明。不透明度・両面・unlit・クロマキー等、対象に適用できる既存設定 | 現在のDisplaySet＋対象Mesh＋表面slot。非対応対象なら理由を明示 |
| 視点 | 保存した視点の管理、現在の投影・6方向・背景。登録・更新・削除等の既存操作。頻用呼出しは3D近傍からも到達 | 現在のcamera／背景と保存済みviewを区別。詳細は§21 |

Project名、home、閲覧／編集、保存状態・失敗、端末保存、バックアップ・受け渡しは
tab外の共通headerに置く。DisplaySetも複数機能を跨ぐ文脈なのでtab外。
頻繁なSaved View呼出しと全体表示は3D近傍に残し、登録・管理は視点tabへ置く。
「現在の視点を保存」が新viewを作り、active DisplaySetの切替時の視点も更新することを
説明する。Saved Viewはcamera＋背景であり、visibility・モデル配置変更ではない。

**常設一覧は「Caption作業中」の原則であり、他の仕事中まで全件を占有させない。**
他tabでは小さな選択Caption名・所属と「内容へ戻る」を残す。一覧を他tabの上にも
置く案は、縦の面積を奪い、materialを「選択Captionの設定」と誤認させるため採らない。
戻る1操作は増えるが、検索・選択・探索位置を維持することで反復負担を抑える。
「見る／記録／整える」のような目的分類は同じ機能が複数目的に属し、閲覧／編集mode
とも競合するため主tab名にしない。専門語には短い説明を添え、分類自体は安定させる。

### 19.3 切替の契約案

- tab選択はUIの移動。保存・再読込・DisplaySet変更・モデル位置変更を発生させない。
  Caption／追加先／操作Asset／material対象は独立のまま。cameraも保持する。
- Captionへ戻ると選択・query・一覧と詳細のscrollを復元。他tabで3Dピンを選ぶと
  共通選択名だけ追従し、進行中の作業を覆う自動tab切替はしない。明示的に内容へ戻れる。
- モデル削除やDisplaySet変更で対象が無効になった場合は既存の有効性規則を適用。
  存在しない対象を保持したふりはしない。tab変更だけで先頭対象を選び直さない。
- IME途中・未反映field・無効入力・配置modeでは、黙って確定／破棄して切り替えない。
  保持または完了／明示中止の限定契約を先に確定。tab内errorは共通領域にも所在を示す。
  通常save失敗の入力保持は§15–16の限定契約であり、lock loss等へ一般化しない。
- iPhoneも同じ分類・順序。tabの中にもう一列の小さなtabを増殖させず、Captionの
  一覧／詳細は明示的な進む・戻る。可用高さ、keyboard、focus復帰を実機で確認する。
- Viewでも内容と対象は確認できるようにする。編集できない理由を示し、新しい一時
  visibility機能や未実装media操作を追加しない。

### 19.4 統一する造形の仕様案

方向は「静かな資料面＋精度のある操作部」。前の緑寄りの灰色を少し中立に寄せ、
暖かな紙色と墨色を基盤にする。明暗で役割・配置は変えない。以下の値は比較用の
提案であり、ゲームから測定した値や公式指定値、採用済みdesign tokenではない。

| 要素 | 訂正案 | 避けること |
|---|---|---|
| 角 | panel・buttonは2pxを基準にした矩形。tabは上角だけ。円はピンなど意味のある箇所 | 大きい丸角、全buttonのpill化、切欠き・飾り角の多用 |
| 文字 | 日本語system sansを本文400、label/button500、section600。仮のLociView表記もsystem sans400・14pxへ統一（§20.5）。数値は必要箇所で桁揃え | 細字で研究風にする、本文を等幅／serifへ変える、hoverでweightを変え文字を揺らす |
| 余白 | 4px単位、同群8px、section16–24px程度を比較起点に。囲いを増やさず余白と見出しで区切る | 全要素をcard化、見出し・値・buttonを同じ密度で並べる |
| 枠 | panelの区切りは淡い1px。編集欄は認識に必要な明確な1px。主要buttonは線幅より面の強さで区別 | 全buttonに同じ濃い枠、0.5px線で可読性を犠牲にする、押下で枠幅を変えlayoutを動かす |
| 主操作 | 濃い面と明るい文字。現在の課題で一つを優先。未保存の保存／配置中の完了など、実stateに対応 | 保存・追加・位置調整をすべて同じ強い面にする。tab移動と確定操作を同じ扱いにする |
| 補助／詳細 | 補助は淡い面と弱い枠。詳細・戻るにも識別できる淡い面と1px枠を持たせ、通常時の影を省く（§20で訂正）。動詞labelと十分なhit領域は維持 | 本文と見分けがつかない裸の文字、tooltipだけの説明、押せる範囲の過小化 |
| 押している間 | 面の明度変化＋小さな内側の影。押下中だけ変化し、文字・外形・hit領域は不動 | 大きな縮小、跳ね、発光、効果音、完了していないのに成功色へ変える |
| 選択・focus | 選択は淡い面＋2pxの印。hover／pressでも印は残す。keyboard focusは別の外周表示で識別 | 押下と永続選択を同じ状態にする、focusを消す、色だけで対象を知らせる |
| 無効／危険 | 無効は立体感を落とし理由を近くに。破壊操作は対象付き確認の最終段階で赤を使う | 全体opacityで理由まで読めなくする、無効をloadingと同じにする、通常削除を最強の常設buttonにする |

面色のtransitionは100msを比較起点にし、Reduce Motionでは動きをなくす。
状態変化の表示自体は残す。SF Symbols等のassetや外部font、新icon依存は導入しない。
system fontはOSごとに描画差があるため、名前を並べただけで同一見た目を保証しない。

| 役割 | 明 | 暗 |
|---|---|---|
| 地／panel／field | `#e9e8e1`／`#f4f3ed`／`#faf9f4` | `#1d211e`／`#272c28`／`#222722` |
| 本文／補足 | `#2e312e`／`#65685f` | `#eaeae0`／`#bbc1b5` |
| 弱い区切り／input境界 | `#d1d2c7`／`#7c8176` | `#454d43`／`#899580` |
| 主要通常／hover／press | `#303c36`／`#435148`／`#202b25` | `#ced7c2`／`#dde5d4`／`#b9c7ab` |
| 主要文字 | `#fcfbf4` | `#1d251e` |
| 補助通常／hover／press | `#e5e7de`／`#d9dfd0`／`#c6d0bc` | `#363e33`／`#434e3e`／`#4f5d47` |

3D背景・記録内容は比較時に変えない。静的sRGB計算で主要文字は明8.07–14.12:1、
暗8.85–12.15:1、補助文字は明8.24–10.54:1、暗5.80–9.16:1。補足／panelは明5.11、
暗7.72、input境界／fieldは明3.79、暗4.83。これは選択paneの明暗を含む宣言色18組の確認だけで、全状態・
alpha合成・focus・pin上の背景・実機可読性の検証やWCAG適合宣言ではない。

### 19.5 比較見本、受入れと停止点

§18の架空20件の見本を更新し、4つの機能群、別tabからCaptionへ戻る経路、モデルと
materialの独立した対象を加えた。造形比較は同じ構成を均一枠へ寄せる比較であり、
以前の実画面の完全再現ではない。下段の状態見本は主／補助／詳細の優先度と押下を
比べるもの。押しても保存・データ変更はしない。本体のUI実装ではない。

既存20件検証に加え、4群の往復、query／scroll保持、他tabでのpin選択が自動遷移しない
こと、別Asset対象、3つの状態見本、明暗同期、18色組を簡易DOM代替と静的計算で確認。
独立した静的レビューでcompactの選択buttonの背景だけが上書きされる不整合を発見し、
通常／hover／pressの文字・面を明示して訂正した。単色pairの計算だけではCSSの組合せを
保証できないため、該当する組合せruleの存在も確認した。実cascade・描画の検証は未完了。
tab風navigationは見本ではnative buttonの状態切替で、完成したARIA tab widgetや
keyboard操作の実査ではない。押下CSSの実描画、狭幅の収まり、支援技術、物理iPhoneは未確認。

受入れ候補は、(1)Caption→materialで視認性調整→Captionの対象と探索位置の一致、
(2)別モデルの配置を挟んだ復帰、(3)保存失敗・IME・無効入力・配置中の切替保護、
(4)選択＋hover＋focus＋pressが併存しても識別できること、(5)文字拡大・OS font差・
小画面でのtab名とhit領域、(6)利用者が装飾ではなくUIから主／補助／確定を読めること。
見本で省略した既存controlを削除する指示ではない。正式実装仕様では機能の対応表を保つ。

§16.8の3境界を維持。造形基盤はA、機能群と対象保持はB、保存回復はCの限定契約。
4つ目のslice、機能削除、大規模refactor、依存、schema、media拡張、license、version、
main、Pages／SW、server／tunnelへ進まない。資料2件の目視と実測不足を明記してPOへ提示する。

## 20. トンマナへの合意と4色系統の比較

POは§19のトンマナを継続する方向に合意した。ただし「詳細を見る」が背景へ
溶け込んで見づらいとの指摘があり、緑系以外の薄茶・薄青・ニュートラルグレーも
比較して適切な色を選ぶ。合意を特定palette、明暗、詳細仕様や実装の承認に拡大しない。

### 20.1 操作の識別性の訂正

詳細・戻るは透明なbuttonではなく、通常時から淡い面と明確な1pxの境界を持つ。
主操作の強い明暗反転は使わず、補助操作にある通常時の小さな影も省く。
hoverでは面を一段変え、押下中はさらに面を変えて控えめな内側の影を出す。
枠幅、文字位置、hit領域は変えない。有効なbuttonのみを対象とし、無効な操作を
押せるように見せない。低優先であることと、操作可能性を隠すことを区別する。

### 20.2 同条件で比較するpalette案

全案で配置、文言、20件の架空記録、3D背景と模式モデルの色、選択状態を共通にする。
背景だけでなくpanel・field・文字・選択・buttonの通常／hover／pressを一組で切り替える。
明と暗をそれぞれ用意する。配色切替は作業対象やcamera、保存内容を変更しない。

| 系統 | 明の地／panel | 明の本文／主操作 | 比較したい方向（設計上の意図） |
|---|---|---|---|
| 緑系（基準） | `#e9e8e1`／`#f4f3ed` | `#2e312e`／`#303c36` | 前回の静かな研究室の印象を比較基準にする |
| 薄茶 | `#eae4dc`／`#f5f0e8` | `#342e29`／`#4a3b30` | 資料・紙面に寄せた暖かさ |
| 薄青 | `#e1e8ed`／`#edf3f7` | `#27333c`／`#2e4555` | 清潔で端正な計器寄りの印象 |
| ニュートラルグレー | `#e6e6e6`／`#f2f2f2` | `#303030`／`#393939` | UI自体の色味を抑えた基準 |

これらの印象は提案意図であり、利用者調査やゲーム画面からの測色結果ではない。
§19.5の造形切替は役目を終え、最新版の会話内見本は4色系統の切替へ置き換えた。
buttonの状態比較を上部へ移し、直下の同一作業画面でも配色を比較できるようにした。

### 20.3 確認結果と残す境界

簡易DOM代替で4色×明暗の8組の切替、選択・検索・作業tab・対象・scrollの保持を確認。
既存の20件選択、4作業群、compactの往復とfocus呼出しの検査も再実行した。
宣言色の限定的な詳細度・順序の解決とsRGB計算で136組を確認し、検査した文字は
4.95:1以上、inputおよび詳細buttonの通常時の境界は3.24:1以上だった。
全button・警告・半透明・3D上の色・OS描画を含む適合検査ではなく、数値が押しやすさや
見つけやすさを証明するものでもない。独立read-only確認では、専用quiet状態、汎用状態
からの除外、disabled、選択pane、明暗paletteの静的な組合せに追加問題は見つからなかった。

実描画・実際のfocus・押下感・狭幅の収まり・物理iPhoneは未確認。41タスクの実測はUのまま。
本体UI・機能・dependency・schema・media・release・server／tunnelを変更せず、配色選択の
ための設計見本と記録だけを更新した。§16.8の最大3境界と実装前停止を維持する。

### 20.4 薄茶を低彩度のグレージュへ訂正

POの追加指定に従い、薄茶のみ黄み・赤みを抑えた暖かな灰色へ変更。
[NieR公式制作者記事](https://www.platinumgames.co.jp/dev-nier-automata/article/183)の
柔らかなベージュと同系色内の視認性という意図を参考にした。ゲームからの採色や
完全再現ではなく、柄・歪み・装飾も追加しない。
明の地／panel／主操作は `#e6e4e2`／`#f2f0ee`／`#413d39`、暗は
`#22201f`／`#2c2b29`／`#ccc6bd`。§20.2の薄茶行はこの値で置き換える。
文字・枠・hover／pressも同時に低彩度化し、詳細buttonの面と境界は維持する。
比較見本の初期表示を「薄茶（低彩度）」にした。他3色、配置、内容、3Dは変更しない。

read-only検討で補助文字と押下色の組合せを追加確認すべきとの指摘があり、薄茶の
補助文字の明度を補正した。8組を追加した計144組の静的計算と既存の状態保持検査を
再実行。薄茶の検査対象文字は4.65:1以上、通常時の対象境界は3.29:1以上。
他paletteの全補助文字状態や実描画まで検証したものではない。本体UI未変更、
実機未確認、配色未確定という停止境界は変えない。

### 20.5 配色の選定と仮ブランド表記

POは§20.4の低彩度の薄茶／グレージュを採る方針に合意した。正式ロゴは後日POから
提供予定。それまでは左上のLociViewを本文と同系統のsystem sans、400、14px、通常の
字間、補足文字色とする。以前の22pxのserif表記をやめ、Project名より控えめにする。
極細字や透明度で読みにくくせず、ロゴの新規制作・外部font・依存の追加は行わない。
見本の変更はこの2つのbrand用CSS規則だけ。配色・操作・他の配置は維持する。
配色方針の選定は、暗色themeの提供・切替方式、正式ロゴ、実装開始、実機UX合否の
承認を含まない。静的な継承規則・既存contrast・状態保持を確認し、実描画は未検証。

## 21. 全機能の置き場所と発見経路の再設計

### 21.1 判定と確認範囲

POが了承したトンマナは維持する。**4タブの分類は適切だが、前の見本の内容は不十分**
だった。代表controlだけでは、視点の更新・削除、画像閲覧、配置中止、モデル種別固有の
設定等が抜ける。今回は現行UIのuser-facing controlを42機能群へまとめ、全群に主入口を
割り当て、41タスクへの対応と原本LociMyuとの差を確認した。42は操作回数や使いやすさの
scoreではなく、この設計の棚卸し単位である。

証拠はcheckpoint不変の現行コード、関連する既存test定義、許可済みの原本LociMyu UI
source。原本の実行や新しいprivate sourceの展開・複写はしていない。原本のpath・entry名・
hash・運用内容は転記しない。current Native、従来形式の閲覧経路、原本LociMyuを区別した。
実ブラウザと物理iPhoneでの操作数・時間・使いやすさは依然未測定であり、41行のUを変えない。

### 21.2 分類の適切性と主要な探し方

| 場所 | 利用者の問い | 採用理由・順序 |
|---|---|---|
| 共通header | どの作業を、閲覧／編集のどちらで開いているか。保存できたか | Project名・access・保存状態・端末保存・一覧。エラーを別tabだけに隠さない |
| 共通の表示セット | どの記録群・見え方を確認するか | Caption／material／切替時viewに跨るため、特定tabの所有物にしない |
| 3D近傍 | 向きを揃えたい、見失った、登録済みの位置から見たい | 「カメラ・視点…」→6方向・投影・登録済みview。全体表示は独立した短い入口。iPhoneでも消さない |
| キャプション | 記録を探す、場所を記録する、位置・内容・添付を確認する | 一覧／検索→選択→追加と位置→本文・色→添付→その他。操作対象を右側で保持 |
| モデル | 何を表示しているか、重なりを除きたい、全体を配置したい | 一覧と表示→配置→モデル単位のピン倍率／Point点径／GS補助面→追加・差替え・削除 |
| マテリアル | 表面を透かしたい、照明や特定色の影響を除きたい | 「モデル表面の見え方」と説明。対象Mesh・表面→不透明度／両面→対応する追加設定 |
| 視点 | 定型方向で見る、自分の視点を登録・更新したい、背景を変えたい | 6方向・投影→保存済みview→作成／更新／削除→背景。呼出しは3D近傍にもshortcut |
| ファイル・共有 | 作業を外へ持ち出す、他人の変更を受け取る | backupと3つのexchange目的を並列に説明。統合は明示対象のclean Edit内。データ全般を混ぜたtabにしない |
| 操作ガイド・端末 | 操作方法、offline準備、表示失敗を調べたい | user向けヘルプと端末設定。内部診断は段階表示。ただし失敗そのものは共通headerに出す |

単純な「見る／編集する」tab分類は同じ視点・Captionを両方で扱うため採らない。
モデルとマテリアルを一つに潰す案も、Assetの表示・配置とDisplaySet内の表面設定を混同する
ので採らない。Mesh／Point／GS別tabは同じ操作を三分割するため作らない。
View/Editは権限と保存の文脈であって、機能を別の住所へ移すナビゲーションではない。

重複を許すのは「同じ操作への近道」だけ。3D近傍のview呼出しと視点tabは同じ記録を使い、
別のpreset保存先を作らない。Captionの追加先、選択記録の所属、モデル操作対象、material
対象は独立。tabを移っただけで同期しない。差替え・削除を別画面から起動しても、対象名を
確認直前に再表示し、既存の再検証を通す。

### 21.3 機能対応表（現行→設計）

根拠略称はN=`src/nativeGs/app.ts`、V=`src/nativeGs/viewer.ts`、
O=`src/nativeGs/captionOverlay.ts`、H=`src/ui/home.ts`、U=`src/ui/app.ts`。
行番号は監査checkpoint。表の「置き場所」は提案であり、そのnavigationのproduction実装ではない。
通常保存=working変更を端末へ確定、即保存=該当操作が保存まで行う、表示のみ=Projectに書かない。

| ID | 現行機能の内訳 | 主入口・段階表示先／対象・保存境界 | 根拠 |
|---|---|---|---|
| F01 | Project名、View/Editで開く、閉じる、一覧へ | header。mode変更は明示的に開き直す。未保存離脱を保護 | N:1090,1503,2806 |
| F02 | 通常save、保存中・完了・失敗 | headerの保存直近。後述の限定回復仕様と現rollbackを区別 | N:2754 |
| F03 | read-only・lock状態・未保存・離脱／再読込確認 | headerに事実、操作ガイドに理由と安全な次手 | N:1499,2806 |
| H01 | ordinary homeのfile選択・dropと種別検査 | 一つの開始画面の「ファイルを開く…」。dropは代替入口 | H:87,154 |
| H02 | 端末内Native一覧・View/Edit・書出し・端末からのProject削除 | 開始画面のProject行。削除はその他→最新状態・対象確認 | H:288、N:837,1002 |
| H03 | 新規名、Mesh/Point、GS、任意の明示Proxy、作成 | file検査後の作成確認。複合入力維持、空Project不可、作成時保存 | N:454,510,1065 |
| H04 | Native restore、LociMyu変換、v1閲覧・Native非破壊変換、説明ファイル、衝突／破損拒否 | 開始画面→内容に合った確認。workbook・source relationは必要時だけ明示確認。purposeはfilenameで推測しない | H:154,239、U:243,415,531 |
| D01 | DisplaySet選択・切替 | header。Caption／material／任意viewだけを切替。visibilityではなく、切替自体はUI状態 | N:2042、V:606 |
| C01 | Caption一覧、ピン選択、選択解除、title/body検索、所属filter、件数／0件 | Caption上段＋3D。選択・検索は表示のみ。現在のDisplaySet内を探す | N:1216,1360,1827 |
| C02 | 新規追加先選択、新規開始、表面指定、配置中止 | 一覧／空状態にも残す新規操作帯。追加先自体も通常保存対象。hit前はrecordなし | N:2389,2397、V:1122 |
| C03 | ピン移動開始・終了、表面へ置き直す、未配置の所属確認 | 選択帯で追加の隣。進行中の中止・終了をmodalへ隠さない。終了≠保存 | N:2420,2441 |
| C04 | title、body、ピン色 | 選択詳細。160文字title境界、所属の編集可否を説明。通常保存 | N:1224,1512,2618 |
| C05 | メディアfile選択・確認・添付して保存・形式案内 | 詳細の「メディアを追加…」→通常の添付確認。clean Edit・保存済みCaptionへ即保存 | N:1260,2642 |
| C06 | panel画像表示、読込・失敗・再表示、画像viewer前後／枚数／閉じる／Esc／左右キー | 添付thumbnailから画像viewer。循環・1枚時無効を維持。追加とは別の閲覧操作 | N:1430、O:274 |
| C07 | ピンと接続線で結ぶ浮動Caption、本文・画像、移動・resize・閉じる、最大3枚＋残数 | 3D近傍。手動位置・サイズはUI-only。閉じるは選択解除、未配置等ではoverlayなし。下固定ではない | O:50,337,376,398,446,524 |
| C08 | Captionの未配置／位置要確認／非表示理由、削除・対象確認 | 理由は一覧・選択帯にも表示。削除は詳細のその他。通常保存 | N:1380,1413,2498 |
| M01 | モデル一覧と明示した操作対象 | モデルtab冒頭。Caption所有Assetやmaterial対象とは別 | N:1277,1594,2539 |
| M02 | Asset個別visibility、全部／GSのみ／Mesh・Pointのみの一括指定 | モデルtabの表示群。Edit限定・通常保存。一括指定をCompare機能と呼ばない | N:1152,2357 |
| M03 | Asset移動／回転／均一scale gizmo、位置XYZ・回転XYZ度・倍率・適用 | モデルの配置。数値とgizmoは同じ明示対象、通常保存。Caption移動とは別 | N:1181,1211,2539,2569 |
| M04 | Asset全体のピン倍率、数値・対数slider・値 | モデルの「このモデルのピンの大きさ」。0.001–1000、Edit・通常保存 | N:1186,2594 |
| M05 | Point点径slider・px値 | Point選択時だけ表示。1–20 CSS px、0.5刻み、View可・表示のみ | N:1200,2548 |
| M06 | GSに対応するProxyの有無・使用可否、入力・差替え時の明示指定 | GS選択時の配置補助説明。独立Assetや単独Proxy差替えを新設しない | N:170,191,2163,2240、V:716 |
| M07 | モデル追加・file検査・任意Proxy・進行・失敗 | モデルtabの追加。1回1Asset、既存の未保存workingも含め即保存することを事前表示 | N:2177 |
| M08 | モデル差替え・確認、削除・確認、最後のAsset／所有Captionによる拒否 | 選択モデルの管理、直前にも対象名。差替えは即保存、削除は通常保存 | N:2234,2305 |
| A01 | material対象Mesh・表面slot選択、対応可否 | マテリアルtab冒頭。DisplaySet＋正確なRepresentation／slot。GS・Point・Proxy対象外 | N:1865,1936 |
| A02 | 不透明度、両面、unlit、元の見え方へ戻す | 対象表面の基本調整。現在のsetのoverride除去と元ファイル変更を区別。通常保存 | N:1886,2076 |
| A03 | chroma有効・抜く色・許容幅・境界ぼかし | 「特定の色を透かす」内。対応不可slotの理由を出し、基本調整は残す | N:1248,1886 |
| V01 | 6方向、表示中モデル群の全体fit | 3Dのカメラ入口＋視点tab。方向は±XYZ、正面推測なし。全体fitは固定の斜め方向も適用 | N:1242、V:524,1347 |
| V02 | 透視／平行投影 | カメラ入口＋視点tab。位置／target等を保持して投影切替。表示のみ | V:490 |
| V03 | 保存済みview選択、呼出し | 3D近傍のshortcutと視点tab。選択だけでは適用しない。呼出しは表示のみ | N:1967,2120 |
| V04 | 名前、新規登録、既存更新、削除 | 視点tabの管理。新規登録はそのsetの切替時viewにも設定、通常保存。削除確認は設計上の追加保護 | N:2092,2127 |
| V05 | 現在の3D背景色 | 視点tab下位。UI配色とは別。表示のみ、保存するならview登録／更新→通常save | N:2149 |
| E01 | 完全backup export | 共通「ファイル・共有」→既存の一覧側対象exportへ。durable全体を復元可能にする | N:841,857 |
| E02 | collaboration export、固定baseline | 同入口の独立目的。対応するCaption／新画像変更、同由来への統合 | N:843,654、storage spec §30.1 |
| E03 | review/share export | 保存済みの可視対象・active set等のallowlist。閲覧開始・非merge。UIだけのset変更を混同しない | N:844、packageSnapshots.ts:67 |
| E04 | clean editable copy export | 新identity／lineageの独立編集用コピー。原本へmerge不可 | N:845、storage spec §30.3 |
| E05 | collaboration file選択・検証・merge・重複noop・conflict中止・retry | 明示対象のclean Edit内。success即保存、conflictは全体no-write。勝者選択UIなし | N:2690 |
| E06 | 長処理の中止、進行、完成検査、OS保存、stage削除、失敗詳細 | 書出し／受取結果画面。download開始≠保存完了、stage削除は確認後 | N:476,783,946 |
| G01 | cameraの回転／pan／zoom、mouse／touch、配置gesture説明 | 3D近傍のguide＋操作ガイド。カメラ操作と配置modeを明示。非drag新操作を実装済みとしない | V:308,331,1203 |
| G02 | GS offline準備・結果、条件付きPWA install、端末storage warning | 開始画面からも到達する端末案内。dev／未検証／準備失敗を成功にしない | N:483、H:120,138 |
| G03 | 読込進行、表示指定とready数、表示error、診断、GS解放、再読込 | 共通status＋端末詳細。GS解放≠削除、再表示は開き直す。未保存を保護 | N:1486,1853,2534,2806 |
| G04 | 表示名profile | 既存home設定へ接続。Native merge権限・identity機能に拡大しない。従来形式では変更不可 | H:134、U:106 |

§19の「開始視点」は誤解を招くため**表示セットへ切り替えた時の視点**へ訂正する。
現行の初回Project openはload→fitであり、そのdefault viewで起動すると保証しない。
また、NativeにはDisplaySet作成／改名等の操作がない。v1 UIの残存controlはcandidateで
書込み不可なので、Nativeの既存機能として数えない。

### 21.4 LociMyuの継承・差分をどう扱うか

| 原本で確認したpattern | 今回の扱い・適切な住所 |
|---|---|
| Caption／Material／Viewsの機能tab | 維持。複数Assetを扱うモデルtabを加えた4分類。原本が4tabだったとはしない |
| 6軸方向、透視／平行投影、背景色 | Nativeにも存在。カメラ入口と視点tabへ明示的に戻した。背景Resetはcamera resetではない |
| sheetごとの最後の視点1件 | Nativeの名前付きSaved Viewの証拠とは分離。原本の複数preset一覧はheading／空領域のみで接続確認なし |
| 一覧・pin・編集欄・添付の連動 | 維持。右側一覧と独立scroll。選択時にcameraを自動移動しない |
| 原本の複数浮動card | Native既存の選択1件overlay・移動・resizeを維持。複数card化は別機能として今回増やさない |
| 画像を確認して添付する、共有結果を示す | Native既存の添付／画像viewer／目的別file出力へ。Google folder／URL共有／storageは継承しない |
| 色別に3Dピンを絞る（原本は一覧を残す） | Native未実装。§22でP01としてCaption検索近傍の「色でピンを絞り込む…」と復帰経路を具体化。単なる将来候補への列挙では不足していたため、見本へ追加提案として反映 |
| sheet作成・改名 | Native未実装。継承候補の住所は共通表示セット横の管理。新規setの内容・material・default・identityを先に定義する必要があり、現UIの漏れ補完とは別判断 |
| 添付解除／元folderのgallery再読込 | Nativeは添付削除・並替えを未実装。解除を将来加えるなら選択Captionの添付内。binary保全・shared reference・mergeの契約が必要。folder再読込自体は非継承 |
| 背景HEX入力／背景Reset | Nativeには色pickerのみ。browser標準picker以上のHEX欄・reset追加は小さくても別の操作定義。置き場所は視点の背景内 |

この差分を「不要」として削除したり、灰色の常設buttonで実装済みのように装ったりしない。
現行機能の整理と、未実装parityの製品追加は別である。後者は上表に配置先・理由を残し、
今回の本体非変更・最大3sliceの境界へ無断で含めない。HEIC原bytes／video／audio、
caption個別Undo、前後Caption巡回、frame-selected、断面・計測、照明／grid設定も
今回の既存機能や原本継承として追加しない。既存画像viewerの前後送りはこの除外に含めない。

### 21.5 反復flow・状態・発見経路の確認

固定41タスクからの逆引きを以下に示す。task番号は`tasks/uiux-handoff.md` §7のまま。
これは入口と機能の対応確認であり、実操作の成功・手数・所要時間の代替ではない。

| task | 対応する機能ID |
|---|---|
| 1 | H01、H03 |
| 2、3 | H04 |
| 4 | H04、E01 |
| 5 | H04、E02、E03、E04 |
| 6、7、8 | M07、H03 |
| 9 | M01 |
| 10 | M02 |
| 11 | M03 |
| 12、13 | M08 |
| 14 | M06 |
| 15、16、17 | C02、G01 |
| 18 | C03 |
| 19 | C04 |
| 20 | C05、C06、C07 |
| 21 | C01 |
| 22 | C03、C08 |
| 23 | C08 |
| 24 | D01 |
| 25 | A01、A02、A03 |
| 26 | V03、V04、V05 |
| 27 | D01、M02 |
| 28 | F02、F03 |
| 29 | E01、E06 |
| 30 | E02、E06 |
| 31、32 | E05 |
| 33 | E03、E06 |
| 34 | E04、E06 |
| 35 | G02、F01、F02、F03、H02 |
| 36 | H04、E06、G03 |
| 37 | H01、H02、H03、H04、F01 |
| 38 | G01、V01、V02、M05 |
| 39 | C01、C02、C03、C04、C05、C06、C07、C08 |
| 40 | D01、V01、V02、V03、V04 |
| 41 | F01、F02、F03、G02、H02 |

41タスクに独立項目のない既存controlも§21.3で棚卸しした。例えばピン倍率M04、
profile G04、画像viewer内の前後送りC06を、task見出しにないことを理由に落とさない。

| 課題 | 設計上の経路と合否条件 |
|---|---|
| 初見でfileから作業開始 | 一つのhome→file→検査結果に合う確認→作業。二つのhomeを識別させない。元inputと保存先・新しい作業の違いが分かる |
| 方向を揃えてピンを探す | Captionを開いたまま3Dの「カメラ・視点…」→6方向／登録済みview。Caption検索・選択・scrollを失わず戻る |
| 最初の1件を作る | 一覧0件でも追加先・追加が見える→表面指定→位置調整→内容。選択済みCaptionの詳細へ入ることを前提にしない |
| 既存ピンの位置を修正 | 選択名・所属→位置調整／表面へ置き直す→常設の終了／中止→端末保存。gizmo中にmodalを開き続けない |
| 見えないモデル・GSで追加できない | 隠れている／補助面がない理由→モデル設定。表示指定とload失敗を区別。別Assetやfilenameから補助面を推測しない |
| 内部を観察して記録へ戻る | マテリアル→set＋Mesh＋表面を確認→不透明度等→Captionへ。material操作対象を選択Captionの所属と誤認しない |
| 複数写真の比較／追加 | thumbnail→画像viewer前後→閉じて元の記録へ。追加は「メディアを追加…」→正常系file確認→添付して保存。トラブル案内とは分ける |
| 視点の再利用 | 6方向は定型、Saved Viewは利用者の記録。選択／呼出し／新規登録／上書き／削除を区別し、切替時viewとの関係を説明 |
| 保存・受け渡し | 端末saveと外部fileを分離。dirtyを解決してdurable対象を確認→4目的から選ぶ→完成確認→OS保存。失敗を閉じるだけで消さない |

状態契約は以下を満たす設計とする。

- tab切替は文脈を保持。DisplaySet切替は別の操作で、現行はCaption選択・配置／移動を解除する。
  未反映field・IME・配置中を黙って捨てない保護は実装前に具体化する。tab保持をset切替へ
  無条件に一般化しない。現在のset切替はdurable activeSet変更ではない。
- Viewでは選択・検索・画像閲覧・camera・set切替・Point点径を使える。visibility、pin倍率、
  material、Caption作成編集、Saved View作成更新削除はEditが必要。保存中のdisable理由を示す。
- placement/moveは通常の操作帯に現在modeと終了経路を出す。モデルgizmoも同様に現在対象と
  modeを示し、配置設定を折り畳んだだけで終了したことにしない。個別Undoは発明しない。
- Caption未選択では選択専用操作を隠して新規入口を残す。0件／filter0件／未配置／非表示を
  別状態にする。画像読込中・利用不可・失敗でも選択記録の名前を保つ。
- ordinary save失敗の入力保持は§15–16の限定提案。現行のrollbackを黙って保持成功へ
  読み替えない。lock喪失・成否不明は別回復へ。conflictは全体中止・no-writeを維持する。
- 低い画面・iPhoneはCaption一覧／詳細の往復にするが、新規入口を一覧で消さない。
  camera shortcutと表示セットも残す。移動・resize・gestureの実際の代替操作とfocusは
  実装仕様・実機で別途確認する。小さい画面を単に全機能の縦積みにしない。

### 21.6 提出前の自己レビューと修正

独立した棚卸し3本を統合後、rootが現行control→表→見本を逆向きにも照合し、
2件の限定read-only配置レビューを併用した。修正した具体項目は次のとおり。

1. カメラ6方向、Saved View名・更新・削除、materialの全chroma項目とresetを補完。
2. 「開始視点」を「表示セット切替時の視点」へ訂正。全体fitの角度変更も明記。
3. Caption所属filter・ピン色・削除・media viewer、Point点径・pin倍率・GS補助面・
   一括visibility・全transform項目・管理の確認先を補完。
4. compactの一覧でaction-band全体を隠す規則を修正し、新規入口だけは常設へ。
5. 配置中止／移動終了を説明modalだけに置いていた点を修正。状態別の常設操作帯を用意。
6. 添付file pickerと確定を「困ったら」から正常な追加確認へ分離。
7. overlayの閉じるを折畳み本文からタイトル横へ。GS補助面単独差替えという誤解を訂正。
8. 管理操作直前のモデル名を再表示。添付dialogの二重open handlerを除去し、静的検査へ反映。

見本では42機能群の割当IDに漏れ・重複がないことを確認する。native dialogの開閉、
filter合成・解除、4種のモデル条件表示、画像indexの循環・左右キー、tabへの帰路と
focus呼出し、操作帯4状態、既存20件選択と144宣言色pairを簡易DOM代替で検査した。
これらは実際のcamera・画像bytes・編集・file dialog・保存の検査ではない。
開始画面は構成を確認するため見本内で開くが、製品IAは独立した一つのhomeであり、
作業画面の上へmodal homeを実装する指定ではない。画像は表示領域だけの架空見本。

**未割当の現行機能群は0。未実装legacy差分は21.4に明示。実操作・全状態のUX PASSは未判定。**
compactの高さ、browser font、支援技術、実dialog focus、物理iPhoneでの可用性は未測定で、
寸法固定の会話見本を完成responsive実装とみなさない。新しいserver／tunnelは不要と判断し
起動しない。本体UI・機能・schema・依存・license・version・main・Pages／SWは変更しない。
§16.8のAへ共通入口、Bへ機能配置と閲覧補助、Cへ限定した保存回復を対応させ、
未実装parityを4つ目のsliceとして無断追加しない。ここでPOへ提出して停止する。

## 22. 浮動Captionと色別ピン表示の補完

この節のfilter入口modalとwindow内の長い説明は§23で撤回。表示対象・選択保持・保存を
変えないP01の状態規則は維持する。

### 22.1 固定カードと製品仕様を区別する

POの認識どおり、Captionは3D上のピンと線で結ぶ浮動windowである。Native現行の
`captionOverlay.ts`は、pin近傍への初期配置・stage境界への収め込み（§内の関数冒頭）、
header drag（344行付近）、resize（398行付近）、camera／window位置に応じた接続線更新
（494–527行付近）を実装している。下固定の専用閲覧欄へ置き換える決定はしていない。
前見本の`left/right/bottom`固定は制作上の省略であり、完成形のように見せたのが誤り。
右側の一覧／選択詳細は検索・編集の領域で、3D上の浮動windowとは役割が異なる。

見本を選択pinに接続する浮動windowへ訂正した。選択変更で初期位置を決め、題名を
drag／矢印キーで移動すると接続線も追従する。これは模式図内の2D見本であり、実際の
camera投影・resize・物理touch・閉じる／選択解除の全挙動を再実装したものではない。
矢印キーでwindowを動かす部分は見本の非drag補助であり、Nativeの既存機能や今回の
承認済みproduction機能とは数えない。見本上でもその違いを明示する。
Native現行は選択1件のwindow、原本LociMyuは複数windowを残せる。複数化は今回含めない。

### 22.2 LociMyu一次sourceとの再比較

許可済み原本UI sourceをread-onlyで再確認した。実ブラウザ比較ではない。元artifactの
path・entry名・hash・内部名・運用内容は転記しない。

| 論点 | 原本コードの挙動 | LociView設計での扱い |
|---|---|---|
| 配置 | Captionタブの新規ピン色の下、一覧の上 | 一覧検索近傍に「色でピンを絞り込む…」。同じ状態への近道を3D近傍にも置く |
| 色の選び方 | 使用色を複数ON/OFF。全色表示から1色を押すと、その色を除く | 明示checkboxで「チェックした色を表示」。単色だけを見る操作と誤読させない |
| 対象 | 3Dピンだけ。Caption一覧・選択・編集欄は残る | 維持。文字検索／所属filterとは独立。filterを編集や削除へ転用しない |
| 解除・空状態 | 全色表示へ戻せる。手操作では全色OFFも可能 | 全色表示、部分表示、0色を区別。勝手に全色へ復帰しない |
| 非表示pinのwindow | 開いているwindowと線は残る。filter非参照 | 読んでいるwindowは残すが、非表示理由と復帰操作を出し、線は隠す |
| 非表示pinを一覧で選ぶ | 選択できるが、pinを自動再表示する保証はない | 勝手にfilter条件を変更しない。「この色も表示する」で明示的に追加する |
| 件数 | 選択した使用色数／全使用色数 | 色数と対象pin件数を分けて示す。一覧の件数は独立 |
| 色の再同期 | 追加・削除・再読込で使用色を再計算。空選択が全色へ戻る場合あり | 以下の安定した状態規則を提案。原本の不意な復帰は継承しない |

原本の「選択pinを表示する」というコメントだけを保証として採らない。実呼出しでは
その例外が渡されず、非表示pinのpulseも抑止される。新規ピンの色指定、既存Captionの
再着色、表示色filterも別操作であり、一つのcolor pickerにまとめない。

### 22.3 P01 — 色別ピン表示の追加設計

前回の42機能群は**Native等の現行controlの棚卸し**であって、必要な製品体験の網羅性を
保証するものではなかった。未実装差分として§21.4に書くだけではPOの補完依頼を満たさない。
P01は設計へ含める。production実装の承認は別であり、既存C01や42群へ実装済みとして混ぜない。

- 目的は3Dの混雑を減らして色で分類された記録を探すこと。色の意味は利用者が決める。
  「赤=異常」等を推測しない。checkbox、色見本、識別可能な文字／値を併記する。
- 現在の表示セットで使う色だけを提示し、複数選択を許す。初期は全色表示。色の選択、
  全解除、再表示はUI-onlyで、Viewでも使え、dirty・保存・package内容を変えない。
- 「全色」は色集合の列挙ではなく全色mode。追加された色も含める。「一部の色」modeは
  明示した色だけを表示し、0色を許す。追加／削除／再着色の再計算で0色を全色へ戻さない。
  同じset内では非使用になった色の選択意図も保持し、色の復活で勝手に意図を変えない。
- 表示セットごとの一時状態として持ち、tab切替では保持する。初めて開くset／Projectの
  新規openは全色。UI filterをSaved View・DisplaySet永続内容・書出し範囲に混入させない。
- 色条件は既存のAsset visibility、配置、active set、描画可否の上にANDで適用する。
  「この色も表示する」は色条件だけを緩め、非表示Assetや未配置Captionを勝手に変えない。
  製品実装時の件数は色条件対象と実描画可否を区別し、画面内の実表示数と偽らない。
- 一覧は色で減らさない。検索・所属filterは従来どおり一覧へ作用する。色を隠したまま
  一覧で選択した場合も本文・添付は読める。windowに「色の絞り込みで非表示」と出し、
  接続線は非表示。復帰は「この色も表示する」か全色表示。選択例外による強制表示はしない。
- 3D近傍にも現在の件数と同じfilterへの入口を置く。別tabやcompact詳細を見ている間も
  理由・解除先を見失わない。dragはProjectのピン座標変更とは独立。

acceptanceは、複数色／0色／全色、一覧と選択保持、非表示選択の説明と復帰、tab往復、
色変更・set往復・新規openでの上記規則、View可・保存無変更、既存非表示理由の維持。
非対象は色別一括編集・意味分類の自動付与・Asset visibility変更・filterの永続化・
Saved View／package schema変更。将来productionへ含める場合は既存slice Bの明示的な
追加scopeとしてPO確認し、第4sliceや承認済み機能として無断で開始しない。

### 22.4 自己レビューと検査境界

現行sourceと見本の相違を再確認し、下固定と接続線欠落、filter入口欠落、全色OFFからの
復帰不在、選択色と表示色の混同を補正した。原本の全色再同期と不明瞭な接続線は
そのまま継承せず、変更理由を上記へ記録した。

見本は架空20件・4色。簡易DOM代替で16通りの色選択、0色のlayout往復保持、独立した
一覧検索、隠れた選択の保持／その色だけの復帰、8dialog経路、window移動と接続線端点、
pointer cancelと境界clampを確認した。既存の42群、20件選択、状態保持、144宣言色pairも
再確認した。実描画・3D投影・file操作・保存・iPhoneの証拠ではない。新しい色の追加や
set別filter保持はこの固定データ見本では動かさず、仕様上のacceptanceとして残す。
限定read-onlyレビューで、filter入口を再着色と混同しない文言へ訂正し、矢印キー補助の
帰属を明記。windowの自動clamp後にpinとの重なりを再評価し、空く候補位置があれば移す。
どう置いても重なる小さいstageと手動で重ねた場合は見本の制約を表示する。300×180の
模式stageでその警告、広い条件で警告が消えることを簡易geometryで検査したが、見本の
寸法だけでmobileの可用性をPASSにしない。
本体UI・schema・依存・公開経路は変更しない。

## 23. 常用操作の直接性と文言の簡潔化

PO指摘を受け、§22の色filterを開くdialogは撤回する。LociMyuで1回押せば済む操作へ
開閉の手間を追加していた。説明を増やした結果、windowや作業欄も同じ情報を重複していた。
本節は設計・見本のみの訂正であり、production UIやP01実装を承認・変更しない。

### 共通ルール

- 常用する小さな選択はその場で直接操作する。詳細設定と常用操作を同じ理由で隠さない。
- 位置・見出し・highlightで明らかな内容は繰り返さない。短縮で意味が曖昧になるなら単語を残す。
- ×や画像の前後矢印など定着した記号にはaccessible nameを付ける。4タブ名はicon化しない。
- 色circleは色だけでON/OFFを示さず、塗り／輪とチェックを併用し、状態と色名を読上げ可能にする。
- 未保存、失敗、所属、操作対象、権限、破壊操作、保存範囲、package目的は省略しない。
  正常時の一般説明はhelpへ、操作固有の警告は実行直前／該当状態の近傍へ置く。

### 見本への反映

| 部分 | 訂正 |
|---|---|
| 色filter | PO指定によりCaptionリスト直上（検索・所属欄の下）に常設circle。直接複数ON/OFF、全色で解除。各44pxの操作領域を保ち、色数が多い時は折返す。modalと重複入口を除去 |
| 色filterの手数 | 閉じたmodalから1色を変えて3Dへ戻る旧案は設計上3click、今回は1click。実機の計測値ではない |
| 浮動window | 題名＋×、本文、写真。冗長な「選択中01」、説明見出し、操作仕様の文章を除去。接続線・移動・選択状態は維持 |
| 隠れた選択 | 必要時だけ「色で非表示」＋「表示」。accessible nameは「この色のピンも表示する」。勝手に色条件を変えない |
| 共通領域 | 「編集 · 端末に保存済み」「端末に保存」「ヘルプ」「カメラ…」「全体表示」。現在のProject／setは残し、set概念の長文はhelpへ |
| Caption | 「一覧」「検索」「所属」「追加先…」「移動」「置き直す」。追加先と選択記録の所属は別に保持。右側の題名は長文scroll／検索結果外でも対象を見失わないため残す |
| メディア | 添付一覧と「メディアを追加…」を中心にする。Caption名の再掲と正常時の保存・形式説明を外し、添付dialog／対応形式helpへ。添付先と「添付して保存」は維持 |
| モデル | 一括表示、配置、ピン倍率、追加、差し替え・削除。対応対象の見出しは残す。Pointの一時表示、GS補助面不可、作業全体保存、削除制約は該当操作に保持 |
| マテリアル | 表面と明示対象を中心にする。「色を透かす」等の短いlabel、対応範囲は詳細へ。現在のsetと保存が必要なことは残す |
| 視点 | 方向、投影、呼び出す、登録・編集、3D背景。登録時のset既定への影響・更新／削除対象・保存境界は実行部分へ残す |
| 書出し・その他 | 「書き出す」の下へ4目的を並べ、各buttonの動詞を重複させない。目的の違いは残す。内部の実装承認・code境界の説明は見本の製品UIから文書側へ戻す |

POの後続指定により、サークルはCaptionリストの直上へ配置する。共通3D領域案は撤回。
一覧のscroll外に置き、記録を探す領域にまとめる。compactでは「一覧へ」で戻って操作し、
他tab／詳細へ移っても色条件は保持する。共通領域に同じ列を二重配置しない。
色の意味を推測したlabelも付けない。
0色・部分表示時のみ対象件数を出し、全色時の平常説明は出さない。filterの保存・対象規則は§22.3。

### 提出前レビュー

自身の逆向き照合と限定read-only reviewを行った。右側の題名を常時隠す案は、長文や
検索結果外の選択を見失うため撤回。OFFのcircleにも中立色の外周を残し、明るい色が
背景へ溶けないよう補正。移動modeの題名が選択変更後も古いままになる点と、撤去済みの
折畳みを案内する重なり警告も修正した。

42既存機能群＋P01を維持。簡易DOM代替で16色選択状態、直接click、他tab／compactでの
状態保持、0色からの復帰、7dialog、20件の選択、題名／ARIA、既存144宣言色pairを再検査。
これは実描画・支援技術・実機touchのPASSではない。元のlive walkthroughは未完了のまま。
外部font・依存・新しいserver／tunnel・本体UI・schema・公開経路には進まない。
