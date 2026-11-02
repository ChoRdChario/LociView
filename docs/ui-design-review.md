# LociView デザインレビュー —AAAタイトル級のUI/UXを目標に

2026-10-30。分類：**レビュー結果・設計提案。実装承認・品質合格・公開判断ではない。**

追記2026-10-31：[操作棚卸しR1–R10](#2026-10-31-操作と機能の棚卸し)は、POの
各操作の点検・必要箇所の修正依頼による。元の評価記録は保持し、実装・検証の現在値はtodoに置く。

追記2026-10-31：POの実使用で、一覧／内容の切替、操作の所在、保存と適用の区別、
カメラ直接操作に追加の問題が分かった。全指摘を先に集約した
[実使用後の修正設計](ui-workspace-design.md)を
現在の配置基準とする。タグは仕様08で追加した分類機能で、既存データを保持して
記録整理へまとめる。比較は複数記録を並べる補助、Scene順序は一覧順、座標追加は
ピン追加の代替経路、記録した視点はカメラ位置・背景の再利用である。
機能の存在／handlerの正しさと、利用者が発見して完了できることを区別し、
低い画面での一覧操作列・完了欄と、中間幅の小窓境界を描画で確認する。

対象は専用PC候補のProjectScene画面。作業と検証の正本は[todo](../tasks/todo.md)、
承認済みのトーン・操作・安全性は[UI指針](ui-product-guidelines.md)に従う。
ここでのAAAは、ゲーム制作における完成度というPOの目標を指す。
アクセシビリティの既存のWCAG 2.2 AA検証方針を変更するものではない。

## 総評

**現状はAAA級の完成度に達していない。情報構造・共通の視覚表現・操作と状態遷移を
一体で設計し直す必要がある。** 前回のU01–U19は困る場所の一覧として有効だが、
「どの画面・状態でも同じ製品として自然に使える」という完成像と判定基準が不足していた。

機能の多さに対し、各操作が独立したフォームとして並んでいる。
3D、記録、管理UIが同じ強さで視線を奪い、対象を選んでから作業を終えるまでの文脈が途切れる。
このため、ボタンの非表示や説明文の削減を済ませても、全体の完成度は十分に上がらない。

残すべき土台は、低彩度の温かい色調、3Dと記録を結ぶ仕組み、複数窓での比較、
大きめの操作領域、既存のfocus・keyboard経路・動き低減・入力保持である。
目指す方向は**3Dと記録を中心にした、静かで精密な空間記録ツール**。
視覚的な中心、操作の意味、反応の質を全画面で揃える。

## 評価対象と証拠

- 基準資料：[48画面・6群のギャラリー](../.artifacts/e2e/ui-screenbook-2026-10-30/index.html)。
  元コードは8e20984、1440×1000/DPR1。全overviewと主要な原寸画像を横断確認した。
- 現在のコードは964999f＋未コミットの閲覧モードWIP。
  任意説明の遅延ヘルプ化は実装済みで、閲覧時の編集欄非表示・現在値表示はWIP。
  古い画像の説明密度や編集欄を、現在の未修正項目として重複計上していない。
- 最新WIPの閲覧・材質・390px幅の3画像も確認した。今回、新たなブラウザ操作はしていない。
- 三つの独立した読み取り専用レビューを統合：視覚設計、操作・入力、可読性・アクセシビリティ。
- 以下の「画像・コード」は観察できた構造、「コード上の懸念」は実操作での確認が必要な項目。
  静止画からアニメーション、入力応答、focus遷移、支援技術の合格を主張しない。
  32-project-listは読み込み中で、完成した再開一覧の見た目は評価保留。

## AAA水準へ向けた八つの設計課題

### Q1. 画面全体の構図と、動かない作業領域

**現状（画像・コード）**：Offline、モード、ファイル、Project状態、カメラが別々の帯を持つ。
Scene管理も全タブの前に置かれる。通常更新でファイル欄が自動展開し、3Dと作業欄の位置が動く。
最新WIPでも多段構造は残っている。基準04/05a/06/15/26、
[productWorkspace](../src/projectScene/productWorkspace.ts)の`changed()`と
[workspace.css](../src/projectScene/workspace.css)のshell配置が根拠。

**到達像**：Project・モード・保存状態・主な入口を安定した共通枠へまとめる。
現在Sceneを簡潔に把握でき、管理は必要時に開く。カメラの方位ギズモと全体表示は3D内で扱う。
通常・編集・比較それぞれに視覚的な中心があり、対象を見ている間に管理UIが主役にならない。

**判定する場面**：本文の適用、メディア追加、通常保存、詳細の開閉を通して、
3D・選択対象・確定操作の位置関係を失わない。失敗を知らせる際も入力と戻り道が保たれる。

### Q2. 一覧・詳細・比較をつなぐ対象の表現

**現状（画像・コード）**：一覧、ピン操作、Undo、本文、添付、タグ、比較操作が同じ長い列に並ぶ。
選択した記録、前面にした窓、編集中のモデル／面が別々の見せ方になっている。
基準04–14/17–23a、最新閲覧画像、
[projectWorkspace](../src/ui/projectScene/projectWorkspace.ts)のpanel構成が根拠。

**到達像**：「探す」「選んだ内容を読む・編集する」「3Dと照合する」を区別し、同じ対象を追える。
対象名・作用範囲・未適用状態・適用／取消を近接させる。
Scene所属、一時表示、Scene専用設定、Project全体の変更も、その場で区別できるようにする。

**判定する場面**：ピン調整、材質編集、本文→添付を続けても、
画面外の対象名や操作を覚えておく必要がない。操作できない場合は原因となる入力と戻る先が分かる。
比較窓を前へ出しただけで、編集対象まで変わったと誤認させない。

### Q3. 文字組み・造形・余白による明確な優先順位

**現状（画像・CSS）**：本文、項目名、数値、ボタン、対象名の文字階層が近く、細い枠が並ぶ。
主操作の強調も部品ごとに異なる。WIPの材質現在値は標準的な`dl`の字下げが残り、
閲覧用の組版として未整備。基準06/08a/23a/26、最新閲覧・材質画像、
[projectWorkspace.css](../src/ui/projectScene/projectWorkspace.css)、
[captionDetail.css](../src/ui/projectScene/captionDetail.css)、
[materialControls](../src/ui/projectScene/materialControls.ts)が根拠。

**到達像**：タイトル・本文・項目名・補足・状態・数値に役割を与え、
読む面、編集する面、主操作、補助操作、危険操作を全画面で同じ造形にする。
余白は関連の強さを示し、枠・塗り・太さは重要な差へ配分する。
既存の落ち着いた色調とsystem fontの範囲でも、この階層は設計できる。

**判定する場面**：Captionの題名→本文→添付を自然な順で読める。
長い日本語名や複数行の本文でも、見出し・値・警告が混ざらない。
その意思決定点の主操作が、複数の強いボタンの中に埋まらない。

### Q4. 入力と状態を全画面で同じ規則にする

**現状（画像・コード／一部は要実操作）**：選択、focus、押下などの表現が左線・下線・塗り・影に分散する。
各部品に保護はあるが、文字入力、カメラ、ギズモ、比較窓、モーダルの入力所有と終了方法を
横断した操作仕様が不足する。3Dピンは毎renderでDOMを全置換する一方、一覧はnodeを保持している。
ピンをkeyboardで選んだ後のfocus継続にはコード上の懸念がある。
[projectWorkspace](../src/ui/projectScene/projectWorkspace.ts)の`markers.replaceChildren()`、
[captionListControls](../src/ui/projectScene/captionListControls.ts)の`orderChildren()`、
[contextHelp](../src/ui/projectScene/contextHelp.ts)、
[captionWindowControls](../src/ui/projectScene/captionWindowControls.ts)が根拠。

**到達像**：hoverは操作候補、focusは入力先、選択は作業対象、仮変更は未確定の提案として区別する。
使用不可・処理中・成功・失敗も同じ規則で表す。
同じ入力が文字と3Dの両方へ作用せず、再描画やdialog終了後もfocusの行き先が意味を保つ。
Escapeの優先順も、既存の入力保持・確認と整合する仕様にする。

**判定する場面**：pin選択→更新、比較窓→メディア→閉じる、IME入力中、drag中断を
mouse／keyboardで通す。一回の操作で複数の層が同時に終了したり、focusがbodyへ抜けたりしない。
Escapeで未適用内容を破棄する等の新しい規則は、このレビューだけで承認された扱いにしない。

### Q5. 3D上の注釈を一つの空間UIとして完成させる

**現状（画像・コード）**：ピン、細い接続線、比較窓、画像枠が別の造形として見える。
比較窓は重なって開き、整列操作は遠い。保存ピン色はラベル背景へ直接設定され、
文字は固定色を継承する。例えば宣言された文字色`#312f2d`と許容色`#000000`の組合せは、
CSS値からの計算で約1.58:1。これは実ブラウザのコントラスト合格判定とは別の診断例である。
基準07/14、最新の暗い3D背景、
[projectWorkspace](../src/ui/projectScene/projectWorkspace.ts)のmarker生成、
[projectWorkspace.css](../src/ui/projectScene/projectWorkspace.css)のmarker、
[captionWindowControls](../src/ui/projectScene/captionWindowControls.ts)の`createCard()`が根拠。

**到達像**：利用者のピン色・モデル・背景を保持しながら、ラベル、選択輪郭、focus、要確認印、
ピンと記録の接続関係を読み取れるようにする。窓の前面と選択対象を区別する。
比較窓の配置・サイズ・整列・閉じるの操作は、比較対象の近くで発見できるようにする。

**判定する場面**：明暗の異なる背景、複雑なモデル、長い名称、複数窓で照合する。
keyboard focusが背面窓の隠れた操作へ入らないかも確認する（現時点ではコード上の懸念）。
手動配置・複数窓・保存色は維持し、情報を減らしただけで見やすさの合格にしない。

### Q6. 反応・進行・結果・復帰を一つの体験にする

**現状（画像・コード／時間的品質は未測定）**：過去の成功通知が別作業でも上部に残る。
処理中、下書き、保存未確認、失敗の意味と寿命が揃わない。
spinner、押下表現、focus表現はあるが、一連の反応の品質は今回の静止画で判定できない。
複数のstatus領域の読み上げ優先順位や、再描画時の重複通知も未検証。
基準05a/18a/23a/29b、最新材質画像、
[projectWorkspace](../src/ui/projectScene/projectWorkspace.ts)のfeedback/statusと
[workspace.css](../src/projectScene/workspace.css)が根拠。

**到達像**：受付、変更中、処理の所在、結果、次の操作を対象の近くで追える。
成功は完了を伝え、未適用・失敗・保存未確認は必要な間残る。
動きは変化を理解する助けに使い、操作対象をずらさず、動き低減でも同じ情報を伝える。

**判定する場面**：短い処理と長い処理、取消可能／不可、失敗→再試行を区別して確認する。
spinnerが消えただけで結果不明にならず、通常のcamera更新で同じ保存状態を繰り返し通知しない。
既存の快適さの開発目標を使い、新しい速度保証や未計測の残時間は作らない。

### Q7. 保存・共有・競合・復旧まで因果を切らない

**現状（画像・コード）**：日常の保存と、受信・復元・履歴が縦積みになる。
候補の読解と選択・確定が離れ、生成、download開始、保存先の内容確認という異なる状態も
複数の場所に出る。基準26–29c、
[validationOutputControls](../src/projectScene/validationOutputControls.ts)、
[validationReceiveControls](../src/projectScene/validationReceiveControls.ts)、
[projectRecovery](../src/ui/projectScene/projectRecovery.ts)が根拠。

**到達像**：何を、どの範囲で、どのProjectへ反映・共有するかを開始から結果まで保つ。
競合は対象→候補比較→選択→結果→確定のまとまりにする。
失敗時も保持内容と次の一手が分かり、復旧後は元の作業文脈へ戻れるようにする。

**判定する場面**：最初の保存、作業一式、変更分、閲覧共有、独立コピー、受信、競合、復旧を
既存の用途・権限・原本保持のまま通す。候補を省略したり、外部保存や相手の受領を推測したりしない。

### Q8. 通常画面以外にも同じ完成度を保つ

**現状（画像・コード／追加観察あり）**：画像・動画・音声が似た大きい器へ収まり、
内容に合った組版が不足する。幅狭では上部が折り返され、3Dと編集対象が遠くなる。
空状態、読込中、完成した再開一覧、失敗や長い名称の全組合せは撮影されていない。
基準01–03/08–11/30–33、最新390px画像、
[mediaPreview](../src/ui/projectScene/mediaPreview.ts)、
[projectWorkspace.css](../src/ui/projectScene/projectWorkspace.css)のresponsive配置が根拠。

**到達像**：空状態、選択なし、長い日本語、狭い／低いPC窓、200%拡大、読込中、
失敗・中断でも対象・状態・終え方が分かる。画像・動画・音声は内容に見合う余白と操作配置にする。

**判定する場面**：代表的な一連の作業を表示条件・入力方法を変えて通す。
実IME、支援技術、physical iPhoneを静止画や幅変更で合格にしない。
既存機能への到達と、複数窓・入力・選択の保持を維持する。

## 参照した制作例・公式指針

DestinyのUI担当者は、豊富な情報の中を移動する操作、対象の近くで出す詳細、
環境の視界を保つHUDを設計上の要点として説明している。
LociViewでは「作業対象を中心にする」という判断材料にした。
[David Candland —Destiny UX/UI](https://david-candland.squarespace.com/destiny)

画面をまたぐ操作順・focusの一貫性と、操作前に文脈と結果が分かることを評価に用いた。
[Xbox XAG112 UI navigation](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/112)、
[XAG114 UI context](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/114)

3D背景上の文字・輪郭の可読性は、ゲームのHUDと同様に背景条件を変えて評価すべきと判断した。
[Xbox XAG102 Contrast](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/102)

The Last of Us Part IIの公式解説はHUDの大きさ・背景・色の調整例を示している。
ここから参照するのは「見た目と読み取りやすさを一緒に仕上げる」観点であり、
同じ設定群の追加を提案・承認するものではない。
[Naughty Dog／PlayStation公式解説](https://blog.playstation.com/?p=331610)

既存の文字コントラスト検証方針は継続する。宣言色の診断例だけで適合を宣言しない。
[W3C Contrast Minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
各制作例・指針からLociViewへの当てはめは、このレビューの設計判断である。

## 修正前に揃える設計と、次工程

まず以下を**一つの全体案**として作る。個別部品から実装を再開しない。

1. 3D、共通バー、現在Scene、一覧／詳細／比較、ファイル操作の配置と役割。
2. 文字・色・余白・枠・アイコン・主操作／補助／危険操作の共通規則。
3. 対象、hover、focus、選択、仮変更、無効、処理中、成功、失敗、復旧待ちの表現と遷移。
4. 閲覧、記録編集、pin／モデル操作、比較、保存・復旧、空・読込・失敗の代表画面案。

次に代表画面を相互に照合し、同じ操作が同じ規則で見え、完了まで続けられるか確認する。
その後に、共通枠＋入力／状態、記録／各タブ＋3D注釈、保存／共有／復旧を関連単位で実装し、
最後に表示条件と入力方法を変えた一連の作業を検証する。
既存の失敗した復旧テストは、次の実装checkpointまでに原因を調べる。今回再試行していない。

新しい自動適用・一括draft・候補の自動選択・参照解除・保存保証、Escapeでの入力破棄、
比較窓の自動閉鎖等は、配置の提案から承認を推論しない。必要なら具体案として別途判断する。
新しい依存・フォント配信・音／ゲームパッド機能・renderer変更・公開は今回行っていない。

今回変更したのはレビュー記録のみ。製品ソース・テスト・保留WIPは保持し、
テスト／buildの再実行、commit／Pushはしていない。静止画・コード・公式資料からのレビューであり、
AAA級の操作品質が実証済みという結論ではない。

## 2026-10-31 操作と機能の棚卸し

POは、各ボタン・UIを実処理と照合し、重複、開発用分離の名残、不要な判断を
整理するよう依頼した。対象は統合PC入口09のホーム、通常Projectの閲覧／編集、
閲覧用ファイル、保存・共有・受信・復旧、設定。調査時点は`0da3f8e`。
以下は修正前に揃えた全体一覧で、同型のモデル名・候補・添付等の動的行は、
各行を生成する共通handlerと表示条件を確認した。旧Native／v1とharnessの
検証入口を、主要PC画面で表示される機能として数えない。

確認は表示要素からevent、UI状態、既存port／typed commandまで追跡し、
閲覧・対象なし・選択中・入力中・処理中・失敗／競合の条件を照合する。
ソース照合、実行したテスト、ブラウザ操作の証拠は区別し、実行結果は
[todo](../tasks/todo.md)に集約する。全データ組合せの実ブラウザ操作や実機受入れを
この棚卸しから推論しない。独立調査者は読み取りのみ、実装者は一人。

### 修正をまとめる単位

| 群 | 見つかった問題 | 修正と受入れ |
|---|---|---|
| R1 ファイルと移動 | Fileを開くと保存／共有／受信／復元の全体組立UIが出る。共有を開くだけでも未完了選択になり、取消が必要。別Projectへの移動はHelp内 | Fileは目的を一つ表示し、同じ4目的へ移動する。上部の保存／共有は短縮入口として維持。開くだけでは入力を作らず、明示変更後の取消・IME・処理保護は維持。同じProject移動ノードをFileへ移す。閲覧時は作成済みファイルと移動を残す |
| R2 カメラ | 保存視点内の全体表示／6方向がギズモと重複。閲覧用ファイルは古い文字ボタン方式 | 通常Projectと閲覧用ファイルで採用済みギズモを使う。投影、保存視点、開始視点は固有機能として残す。generic/harness既定を変えない |
| R3 対象と操作中 | 未選択時のモデル配置、視点編集・その他操作が無効のまま並ぶ。配置3モードの現在値が見えない。実画面でCaptionがない閲覧ファイルにも検索・色操作が残る | 対象がない操作を隠し、作成・追加は残す。配置入力は調整中に表示。移動／回転／拡縮の選択状態を同期。空の閲覧ファイルはCaptionなしと示す。検索結果0件とは区別し、保持中の入力・確認・取消は隠さない |
| R4 実際の確認先 | 状態確認が説明文の表示だけ。局所的な入力不正や一時非表示にも競合確認ボタンが出る | 実在する候補へfocus／表示を移す。入力不正はその場の修正説明、非表示は既存の表示操作を使う。候補がないのに競合欄を探させない。token／候補／確定規則は変更しない |
| R5 閲覧の表示調整 | Point径はlocal表示だけなのに編集専用扱い | 閲覧でも使える。未完了入力・IME・処理・drag等の禁止は残す。保存コマンドや共有値にはしない |
| R6 タグ | 閲覧では全Projectタグが並び、選択Captionの所属と誤認する。保存したタグ色を表示しない | 閲覧では選択Captionに関係するタグと未解決の関係だけを示す。編集時の登録・所属・候補操作は維持。小さなデータ色と名前で表示し、色だけで意味を伝えない |
| R7 起動復旧 | Scene復旧だけ必要なときも空の競合選択と無効な確定が出る。別編集タブを案内。初回復元の開始前状態で実行できない再開を案内 | 競合／復旧の実在する操作だけ表示。同じ画面の編集入口を案内。開始前の記録は取りやめ→元ファイル再選択という実処理を説明し、新しい復旧経路は追加しない |
| R8 変換 | 名前変更で評価が無効になるが古い件数が残る。表が一つでも選択を求める | 再確認待ちを明示し、再確認後だけ変換・説明保存を許可。表が複数のときだけ選択。原本・材質影響・関連付け確認・古い評価拒否は維持 |
| R9 文言と診断 | 通常エラーに「この検証」。削除確認に内部IDとstorage path | 製品の条件を短文で示す。影響するScene／添付／タグと件数、削除・復旧の注意は常時残す。ID／pathは必要時の技術情報へ移す |
| R10 添付の表示 | 同じ添付がpreviewと編集一覧に二重表示 | 一枚の添付カードに閲覧と整理操作を置く。ページ切替にも同じ操作を接続。画像URL／再生／viewerと編集draftのownerは分けたまま保持。新規追加と既存メディア再利用は残す |

### ホーム・起動・変換・復旧

接続元：[validationWorkspace](../src/projectScene/validationWorkspace.ts)、
[startupControls](../src/projectScene/startupControls.ts)、
[offlineEntry](../src/projectScene/offlineEntry.ts)、
[offlineControls](../src/ui/projectScene/offlineControls.ts)。

| 操作 | 実際の結果・維持する理由 | 判定 |
|---|---|---|
| ファイルを選択／ファイルを開く | 複数選択を保持し、明示検査で内容から作成・変換・復元・閲覧・再開を判定する一つのform | 維持。形式別の入口ではない |
| 選択を取り消す／変換のキャンセル | 排他的な未確定選択を解除。書込み開始後は同じ作成の再試行を保護 | 文言を統一 |
| Project名／作成／作成を再試行 | 新規Projectを明示作成。失敗後は捕捉済みの同じ候補を再試行 | 維持 |
| 新しいプロジェクトに変換 | 確定済みの変換計画を実行。原本と既存Projectは保持 | 維持 |
| 変換する表 | 複数の表のうち、どれを移行するかを決める | R8 |
| 変換後の名前／変換内容を確認 | 入力と世代が一致した評価を得る | R8 |
| 表と視点・材質の関連付けを確認 | 曖昧な対応を利用者が確認。自動推測しない | 維持 |
| 材質の影響を開く | 見た目が変わる対象・理由を確認 | 維持。通常の補足ではない |
| 変換の説明を保存 | 変換前は現在の評価、再開後はHostに保持した説明を書き出す | 維持。対象の有効期間が違う |
| 一覧を更新 | 非購読の再開カタログを取得し直す | 維持 |
| 閲覧で開く／編集で開く | 同じProjectを異なる権限で開く | 維持。別データ形式の選択ではない |
| 更新を再試行／変換を再開／元ファイルを選び直す | 中断した実処理に対応する記録・原本で再開 | 維持。無条件再試行に統合しない |
| モデルを再読み込み／3D表示を再試行 | 記録を残して表示だけ再準備 | 維持。保存・受信の再試行とは別 |
| 編集する | 同じ画面の編集権限を取得 | 維持。案内はR7 |
| 開始Sceneの候補／確定／取消 | 実在する競合候補を選び、未適用の選択だけ取り消す | R7 |
| 復旧するScene／復旧して開く | 削除済み所属等を再生せず、検査したSceneを復旧 | 維持 |
| バックアップから復元／復元を再開 | 確認した復元計画・記録で切替。原本は保持 | 維持 |
| 復元の取消／取りやめ／一覧に戻る | preview、開始前、終了状態にそれぞれ対応 | R7。状態を一律の閉じるへ変えない |
| 閲覧用ファイルを開く／編集コピーを作る／コピーを作成／戻る | 閲覧ではProjectを作らない。確認したときだけ返送できない独立Projectを作る | 意味を維持。カメラのみR2 |
| 画面を開き直す | 起動失敗後に同じアプリを再読込 | 維持 |
| 設定／オフラインの設定 | 同じownerの準備UIを開示。後者は稀な確認・解除 | 維持。別アプリ選択ではない |
| オフラインで使う準備／更新を確認／準備をやり直す | 同じprepareの状態別表示、資源の検証・取得・修復 | 維持 |
| 準備状態を確認 | 現在の登録・制御・資源をrecheck | 維持。更新取得とは別 |
| アプリをインストール | 対応環境で実際の要求を提示 | 維持 |
| オフライン準備を解除／準備を解除／解除を取り消す | 明示確認後だけ所有登録を解除 | 維持。worker／Project保護を維持 |

### 共通移動・Scene・モデル・視点・材質

接続元：[projectWorkspace](../src/ui/projectScene/projectWorkspace.ts)、
[productWorkspace](../src/projectScene/productWorkspace.ts)、
[projectModels](../src/ui/projectScene/projectModels.ts)、
[projectViews](../src/ui/projectScene/projectViews.ts)、
[projectMaterials](../src/ui/projectScene/projectMaterials.ts)、
[projectOrganization](../src/ui/projectScene/projectOrganization.ts)。

| 操作 | 実際の結果・維持する理由 | 判定 |
|---|---|---|
| 閲覧する／編集する | 既存Hostの権限切替。未適用入力／IME／ファイル処理を保護 | 維持 |
| 保存／共有／ファイル／受信／復元 | 既存ファイルownerの目的表示。実行は各formで確定 | R1 |
| 閉じる／Escape | 一時UIを閉じて元位置へfocus。入力中は閉じない | 維持 |
| 別のプロジェクトを開く | 保護を確認して同じProject選択画面へ戻る | R1 |
| ヘルプ／保存容量を確認 | 操作の説明、サイト全体の推定値取得 | 維持。保存成功の保証ではない |
| 補足の?／Escape | 任意説明を開閉。現在の失敗・条件は隠さない | 維持 |
| 作業タブ／3D・比較／作業パネル／編集に戻る | 同じ保持DOMを開示。別タブの入力を破棄せず戻る | 維持 |
| Scene選択 | localな現在Sceneを変更。開始Sceneは変えない | 維持 |
| Sceneを作る／名前変更／開始Scene／適用／取消 | typed Scene commandと独立draft | 維持 |
| Scene複製／前後移動／削除／確認／戻る | 複製は記録・視点・材質も対象。順序・削除は既存command | 維持。新規Sceneとは別 |
| モデル検索／一覧範囲／モデル選択／一覧へ表示 | localな検索・表示範囲・対象選択 | 維持 |
| Sceneに含める／外す | 共有する所属を変更 | 維持 |
| 隠す／単独表示／すべて表示 | localな表示だけを変更 | 維持。所属とは別 |
| 状態を確認（各モデル行） | 対象の更新候補・依存関係へ進む | R4 |
| 3Dモデルを追加／選択取消／このモデルを追加 | 検査した原本を追加。OBJ制限時は明示確認 | 維持 |
| モデル差替え／差替えを確定 | 配置・記録を保持し新revisionを追加。ピンは要確認 | 維持 |
| モデル削除／削除する／戻る | 依存検査後にProject全体のモデルを削除 | 維持。Scene除外とは別 |
| GSの面追加／変更／解除／確定／取消 | 原点一致を確認して既存prepare／commit portで関連付け | 維持 |
| 配置を調整／位置・回転・倍率／移動・回転・拡縮／確定・取消 | proposalを表示、確定でtransform。数値とギズモは同じproposal | R3 |
| 原点／中心pivot | 回転・拡縮の基準を選択 | 維持 |
| 基準モデル設定／解除／中心と大きさに合わせる | explicit referenceを使って配置proposalを作る | 維持 |
| 原点・回転なし・倍率1／読み込み時の配置 | 異なる基準へ配置proposalを戻す | 維持。結果が違う |
| 配置Undo／Redo | 同じbindingのlocal履歴から補償操作 | 維持 |
| ピン表示倍率／適用／取消 | モデルに属するピンの共有倍率を変更 | 維持 |
| Point径 | viewportのlocal表示だけ変更 | R5。ピン倍率とは別 |
| モデル候補表示／選択確定／重複を一つ・両方／取消 | 既存の候補比較とtyped解消command | 維持 |
| XYZ正負6軸／全体表示 | 既存camera intents、pointer・keyboard対応 | R2。ギズモに集約 |
| 投影方式 | 現在のカメラの透視／平行を切替 | 維持 |
| 保存視点の選択／表示 | 選択はlocal、表示でcamera＋backgroundをrecall | 維持 |
| シーンを開いたときの視点／適用／取消 | 次に開く際の参照を変更。現在のcameraは変えない | 維持 |
| 視点作成／編集／名称／現在の表示を使用／適用／取消 | captureしたcamera＋backgroundまたは名前を保存 | R3 |
| 視点の前後移動／削除／確認／戻る | 順序変更と削除。local取消も明示確認 | 維持 |
| 背景HEX／色picker／標準色／適用／取消 | local表示の背景変更。保存視点の記録とは別 | 維持 |
| 視点／開始視点の状態確認・候補・確定・取消 | 既存更新候補へ進み、選択を確定 | R4 |
| 材質のモデル／面／範囲 | 対象とScene専用／Project共通を選ぶ | 維持 |
| 材質編集／不透明度・陰影・両面・被覆／chroma・色・許容・ぼかし・cutoff | 対応する既存材質値を編集。非対応入力は出さない | 維持 |
| 材質の適用／取消／範囲設定解除／確認／戻る／再試行 | 既存draftとcommand、解除・失敗の保護 | 維持 |
| 材質状態確認／見え方・被覆・重複設定の候補／確定・取消 | 対応する既存候補へ進む | R4 |

### Caption・メディア・比較・タグ・共有・設定

接続元：上記workspace／organization、[projectMedia](../src/ui/projectScene/projectMedia.ts)、
[projectRecovery](../src/ui/projectScene/projectRecovery.ts)、
[validationOutputControls](../src/projectScene/validationOutputControls.ts)、
[validationReceiveControls](../src/projectScene/validationReceiveControls.ts)、
[reviewWorkspace](../src/projectScene/reviewWorkspace.ts)。

| 操作 | 実際の結果・維持する理由 | 判定 |
|---|---|---|
| Caption検索／色・全色／選択／選択した項目を表示 | 検索とlocal表示。色は一覧と3Dピンを絞る | 維持 |
| 一覧へ戻る／選択Caption／前・次の記録 | 同じ選択とdetail DOMを移動 | 維持 |
| ピンを追加／追加色／数値で配置／追加先モデル | 面選択またはモデル内座標で明示追加 | 維持。座標指定はGS等でも必要 |
| 位置を調整／面で指定／XYZ／確定／取り消す | 同じpin proposalを変更・確定・取消 | 維持 |
| 親モデル変更／位置を確認 | 対象と座標関係を明示。仮表示後に確定 | 維持 |
| 面を追加（位置指定から） | 同じモデル管理へ移動する復帰路 | 維持。新しいProxy経路ではない |
| タイトル／本文／色・picker／適用／取消 | independent Caption draftとtyped edit。IMEを保持 | 維持 |
| Captionの状態を確認 | 実在する該当fieldの候補へ移動 | R4。局所的入力不正では不要 |
| 編集者情報／属性 | 現在値・共有影響と補助項目を開示 | 維持 |
| Caption複製／別Sceneへ追加／Sceneから外す | 複製と共有resource所属は別command | 維持 |
| Caption削除／削除する／取り消す | 全Sceneへの影響を確認してtyped delete | R9。影響説明は維持 |
| 記録Undo／Redo | 対応する確認済みCaption操作だけ補償 | 維持。履歴全体rollbackとは別 |
| メディア追加／選択取消／本文へ戻る | 未適用本文と別の既存attachment操作 | 維持 |
| 添付の表示／説明編集／順序／添付を解除／確認・取消 | 同じCaptionの添付を管理。元メディアは保持 | R10。単一カード内へ |
| メディアviewerの前後／閉じる／再生・停止等 | localな画像閲覧／native音声動画操作 | 維持。自動再生しない |
| 比較窓を開く・開き直す／前面へ移動／閉じる／移動・resize／並べる／前面の窓を選択 | Scene-localな複数窓の保持と配置。閉じると保持を解除 | 維持。選択変更とは別 |
| タグ名・色／追加・編集・削除／所属切替／確定・取消 | Projectタグ登録とCaptionの所属を別commandで変更 | R6 |
| タグ候補／残す・削除として確定 | 既存の競合と削除／編集判断 | 維持。未解決の関係を隠さない |
| 保存名（任意）／ファイルに保存 | 履歴・モデル・メディアを含むbackup生成とdownload開始 | 維持 |
| 渡す内容：作業一式／変更分／閲覧Scene／独立コピー | 同系譜で再統合可能か、範囲と識別が実際に異なる | 維持。内部format選択ではない |
| 元の作業一式／渡すScene／開始視点の省略／内容確認 | contributionの基準、明示Scene、競合した開始視点の判断 | 維持 |
| ダウンロード／作成したファイル | 生成済みの同じ成果物を再取得。閲覧でも使える | 維持 |
| 保存したファイルを確認／保存したファイルを選択／確認取消 | 任意の実ファイル照合。通常保存の必須手順ではない | 維持 |
| 生成を再開／取りやめ／戻る | 中断した出力の記録から再開または明示取消 | 維持 |
| 更新ファイル選択／更新を受け取る／選択取消 | 同じProjectの作業一式・変更分だけ受信 | 維持 |
| 元ファイル再選択／受信・コピー再開／取りやめ／戻る | 対応する中断記録の保護。手元の編集を保持 | 維持 |
| backup選択／内容確認／復元確定／再開／取りやめ | 統合ではなくbackup状態への切替。元作業を保持 | 維持 |
| Scene／Caption／所属／添付の候補・手入力・確定・取消 | 既存の具体的な競合・削除／復元を解消 | 維持 |
| このブラウザの表示名／設定／取消 | ブラウザ内だけのlocal名 | 維持 |
| 共有する編集者名／記録有効化／設定／取消 | 明示opt-in以降の編集に自己申告名を残す | 維持。local表示名とは共有範囲が異なる |

新しい機能の削除、複製と所属の統合、閲覧用ファイルと通常Projectの権限混同、
自動マージや復旧原本の省略は行わない。修正後も公開・OS install・実機・AAA品質の
合格は別の受入れであり、個々の無効ボタンを消した数を完成度としない。

## 2026-10-31 現行PC版の通し操作・修正前の問題一覧

PO承認済みのPC品質向上計画に基づく最初の巡回。基点262b8e6、専用Chromium156、
1440×1000を基準とし、既存の狭幅・keyboard・cold/file操作を含む10ケースを実行した。
6PASS/4FAIL、ビルド込み825.70秒。これは既存Desktop全39ケースの合格ではない。
証拠はprivateな`.artifacts/e2e/test-strategy/quality-baseline*`と
`.artifacts/e2e/pc-quality/`。利用者の既存ブラウザ／原本は変更していない。

| ID・重要度 | 問題と再現／期待する結果 | 証拠・分類 | 修正単位 |
|---|---|---|---|
| PCQ-01 P1 | 原ZIPが64MiBで停止。抽出GLBは8K JPEGで停止。容量・画素数・JPEG走査・GLB画像合算をgeometryと分け、安全に開く必要がある | 既存private実画面監査＋今回のsource照合。XLSX補助XMLの拒否もsourceから判明し、まだ現PC実変換では未到達 | 一括の容量／受入れ仕様案。具体値・補助XMLの新受入れは未批准 |
| PCQ-02 P1 | 高画素写真を既存viewerで原寸・拡大して読めない | 現行viewerに全体／原寸／zoom／panがないことをcodeで確認。巨大ピンは旧Nativeの別観測 | 同じviewerに画像専用の閲覧操作 |
| PCQ-03 P2 | Sceneボタンへfocus→EnterでSceneを選択するとfocusがBODYへ消える。選択した操作へfocusを残す | 修正前の実Chromium probe、02-scene-keyboard-focus | SceneボタンのDOM寿命を保持 |
| PCQ-04 P2 | ヘルプ／設定でEscapeが効かず、3Dを選択してもヘルプが残る。既存の一時UIと同じ終了操作が必要 | 実probeの3フラグ全false、03〜05画像 | Escape／外側操作による開閉。設定draft／IMEは保持 |
| PCQ-05 P2 | 説明にhoverした直後の自動scrollで2秒待機が破棄され、そのままhoverしても説明が出ない | context-help既存case失敗＋実probeでpointerover→lv-caption-content scroll→visible tooltip0を確認 | pointer位置を確かめた待機の再開 |
| PCQ-06 P2 | 読込エラーが選択欄から離れる。容量拒否をJPEG不正と表示。変換説明の「元データを含まない」がmodel／写真原本も欠けるように読める。helpに旧名称が残る | private現PC画像＋現行source。旧Native暗色dialogは現PC再現項目に加算しない | 対象近傍の状態と正確な短い説明 |
| PCQ-07 P1 | workbookが通常worksheet以外の内部XMLをsheetとして参照すると、row/cell検査が適用されない | source上のreader/preflight不一致。小規模の別path／非XML拡張子targetで既存の列重複・超過・UTF8等の拒否を検証し、無損失targetは受入れ | 全resolved sheet targetへ既存のlossiness guardを適用 |
| PCQ-08 P1 | rendererを閉じてもtemplate由来textureのGPU handleが解放されない。main／候補／再開で原寸画像のGPU常駐が重複する | Three186 sourceの独立reviewで確定。実Threeのsource-upload/delete/liveと画像を補足 | source-only GPU portとTexture.dispose→renderer.dispose順序。CPU bitmapは保持 |
| PCQ-09 P2 | keyboard focus後の自動scrollが説明を消す。説明が設定の適用ボタンを覆う。IME中のEscapeをglobal tooltipが消費する | 実eventtrace、daily実画面のpointer遮蔽、独立review | explicit activation分離、横／上優先、IME/defaultPrevented保持 |
| PCQ-10 P2 | 半透明Meshを非表示にしてGSだけを表示しても、面の位置指定を制限する警告が残る | 最初の修正後07n実画面で再現。read()の警告収集だけがowner／nodeの可視条件を見ていない | 表示中のsurfaceだけに通知を限定。描画・選択の保守的な拒否と保存値は保持 |
| PCQ-11 P1 | 新GS／Proxyを待つ需要を同ターンのactivateが旧表示で上書きし、準備が終わらない。失敗した次のモデルの理由／retryも隠れる | 実GS差し替え停止＋同期callgraph・queued実順序のunit。修正後GS差し替え16.7分で全経路PASS | pending需要・失敗対象・retryを保持し、正常な旧表示を継続 |
| PCQ-12 P2 | 短い成功通知が3D入力を遮り、期限時に別処理中だと残る | image実画面＋実perform／仮想時間の回帰。修正後の通知が見えたままの実選択PASS | perform成功だけ透過／自分の期限で消去。長い失敗のscroll・選択は維持 |
| PCQ-13 P2 | 720×500CSS／DPR2のFileでTabした名前入力がsticky footerに隠れる | 最終artifact実Tab／ShiftTab・長い日本語・保存hit／取消close PASS。入力bottom327.3px＜footer347.3px。独立画像reviewで確認 | Fileのscroll-padding。実browser zoomとは区別 |
| PCQ-14 P2 | compactの非表示3Dがseeded CPU需要を保持。位置準備後の入力focusもtaskに残る | 実productのhidden編集／backup／取消・stale・例外回復、元workspace通しPASS。最終Ki84で全9旧bitmap解放→再準備、64pin投影差0・本文保持 | visibilityとmetadata可否を分離。準備後だけ既存target照合。task自身のfocusだけready Xへ移し、別focus／取消／closeを保持 |
| PCQ-15 P2 | 旧native-only HEICが新画像UIで寸法拒否され、HEIC／Photo前段検査も共有所有を迂回する | sourceで到達確認。decoder／parser／native source／late encoder所有を接続、focused PASS。注入native成功による実ImageBitmap＋canvas／保存／再開の関連browser PASS | 既存codec／bounded parser／中立dimensions portを再利用。物理HEIC対応を推定しない |
| PCQ-16 P1 | 50万点Review→編集コピーが240秒を超える。小規模の共有／GS操作と点復元にもbusy待ち失敗 | 初回全40実行35PASS／5busy FAIL、後続の元関連caseで39PASS／copy性能1FAILへ。通常copyも240秒超→editor、私的phase374.358秒・archive50巡／20.116GB hash | 検査内容とfresh fenceを保持。SHA小改善は不採用、06bだけでpayload反復を解決するとしない。copy後半の機能確認を性能合格へ読み替えない |
| PCQ-17 P2 | 正しい現行build・720×500CSS/DPR2の実Ki84で一覧238pxが詳細を0pxに潰し、本文の適用が一覧の親変更に遮られる | 最終artifactでdetail239px・Tab/ShiftTab・適用hit・確認取消・hidden本文保持PASS。独立画像reviewも確認 | 高さ640px以下だけ詳細行min240px＋task自身scroll。通常高さ・一覧/詳細・既存入力ガードを保持 |

### 製品の不具合と区別した検証不足

- daily-authoringはCaption窓と編集galleryの両方を数える旧generic locatorで停止。
- loadingは現行accessible名が「キャプションを追加」の入口を「ピンを追加」で探して停止。
- workspace-completionの最初の停止は撤去済み「視点を記録」／視点名管理の指定。現行はSceneの「開始視点を記録」。loading等には現在の「書き出す」を旧「保存」tabで探す指定も残る。
  正しいowner／現在の名前へ追従し、保存・原本・履歴・入力保持のassertは維持する。
- loading、daily、workspaceの未到達後半と、GSの未配置記録に対する数値配置は未確認として残す。
  staticな懸念や旧画面の結果だけを現PC不具合／合格に置き換えない。
- 今回PASSしたものはfile受信／復元、同Project二窓排他、record／camera、view／offline、
  task draft保持。全て小規模の既存ケースであり、8Kの受渡し／offlineの証拠ではない。

最初の巡回はここで完了。上記をまとめた仕様と順序に従い、原本・typed command・保存／
復旧fenceを維持して修正し、元の再現と周辺操作を同じ証拠laneで再確認する。

### 通常修正の再現解消と残るlane

2048×1024の実PNGを既存viewerで全体→原寸→pointer/keyboard pan→resize→全体表示。
原寸2048px、pan後の画面変化、前後backupの原PNG SHA・履歴・Project identity不変を
実Chromiumで確認した。Scene keyboard focus、Help/Settings Escape・outside dismiss、
設定IMEとdraft保持、画像を閉じた後のfocus returnも同じconnected caseで確認。
代表画像とJSONは既存のprivate e2e run1793443580288-67336に保持。

GPU修正は公開Texture.disposeでsource uploadを先に解放する。実production
viewport/resident/candidate componentを使う隔離browser integrationでは、Scene A→Bで
2sourceを表示後、previewへの交代でmainの2sourceがdeleteされlive0、preview終了でも
source live0。再表示とcontext復旧後は初回と同じ画像SHA、初回21,904非背景画素・497色、
Scene Bは別画像SHA、最後は全owned source live0・browser error0だった。
画像4枚と計測JSONをprivate pc-qualityへ保持し独立review済み。renderer内部の既定textureと
compositor/SDKの所有物はsource計数から除外し、全create/deleteは別記する。
これは通常資源所有のcomponent証拠であり、PC入口の全経路・8K統合・一般端末合格ではない。

この通常修正の時点では、原本Ki84の現PC読込み・共有・offlineは01iの方式／数値判断が未了で未到達だった。
大容量の合格へ小規模の結果を転用しない。通常修正の最終Desktop/offline結果とcheckpointは
todoへ集約する。

2026-11-01追記：01iの方向承認後、原本を変えないcatalog取込みと表示資源の所有を接続した。
同じ実データで8K模型、320px縮小画像／1920px原寸、4Scene／103Caption、実ファイルと
別環境・返送・復元・server／browser完全終了後のoffline編集／保存／再開を確認した。
関連未確認時は1Viewと原本だけの3View、確認時は4View／23材質設定を区別する。
checkboxを文章と同じ行へ収め、確認が引継ぎ結果に効くことと未引継ぎを変換前に示す。
変換説明の保存と待機／失敗／成功は既存File内へ移し、編集画面上端の独立した行を解消した。
大きなピンや未選択titleの問題は現PCでは再現せず、保存倍率を無断で変更していない。
復元／復元後保存には大きな待ち時間が残る。段階別の実測と必要な契約判断はtodo／06bへ。
最終ソースでの回帰とrequired checkpoint前なので、この追記を製品全体の合格としない。

後続の実regressionでPCQ-10を検出し、可視owner／ancestor／mesh／materialだけで
位置指定の制約を案内する条件に揃えた。unitでopaqueの実hit、透明時の既存拒否、
非表示／再表示を確認した。描画・選択・保存の規則は変えない。
点の実RGBが1ずれた別件は、DOM Caption接続線のスクリーンショットへの混入だった。
同じ状態でそのUIだけを隠すと元のRGBへ戻る実probeを保持し、3D専用の採取helperを補正。
GS拒否の2回目の失敗は、最初の説明表示後も古いcanvas座標を使った指定だった。
毎回の実rectへ追従し、距離・拒否・RGBのassertは維持する。これらを製品の破損や
選択規則の変更として扱わず、元の失敗経路を再実行する。

## 2026-11-01 日常操作の快適さ — c155での修正前巡回

最新版の閉じた専用Ki84 profileをコピーし、Chromium156・1440×1000・同じ固定
c155 buildで閲覧／編集、Scene、検索、一覧／詳細、ピン、写真の原寸／拡大／pan、
投影／keyboard平行移動、モデル／描画、Fileの保存／共有／受信／復元入口、下書き取消、
720×500のcompactとkeyboardを一巡した。private証拠は既存pc-comfort-tour記録へ。
原本再変換・新しい巨大往復はせず、エラー／外部通信0。閲覧中の編集非表示、Sceneの
keyboard focus、手動list scroll保持、compactの詳細高さとFile名前欄は既対応を確認。

| ID | 観測と修正する範囲 |
|---|---|
| PCQ-18 P2 | pinを明示選択すると詳細は変わるが一覧の選択行は画面外、keyboard pin focusはBODYへ消える。明示pin／前次だけ既存nearest revealを呼び、通常refresh／手動scrollとfilterは保持する。markerの既存キーを保ってfocus消失を避ける |
| PCQ-19 P2 | 下書きの確認取消後にfocusがBODYへ消える。取消／適用の同じ操作が完了し操作ボタンが隠れる場合だけ、同じ記録の本文へ戻す。他のfocus、IME、別対象、失敗は奪わない。代表実保存でも後続refreshがprimaryを再作成してfocusを失うため、同じprimary nodeを保持し成功時のowned復帰を後続更新でも維持する。開示待ち／失敗では復帰を強制しない |
| PCQ-20 P2 | 無選択時にreadonly空form、選択案内3件と影響Scene警告が出る。選択無しだけ一つの案内とし、選択済みの異常／競合／失敗は保持。適用中は実apply ownerを詳細へ渡し、未適用と適用中の併記を解消する（今回tourでは適用中は未実行のcode懸念） |
| PCQ-21 P3 | 同じ保存操作のtabが「書き出す」、見出しが「保存」。tab／accessible名を「保存」へ統一し、実際の共有用途と保存形式は変えない |
| PCQ-22 P2 | camera helpは黒背景で暗色透明。平行移動focus→矢印→投影select後のhelpがモデルtabを20秒遮る実再現。cameraだけ所属stage内へ左優先配置し、help可読性を改善する。gizmo形状／文字／枠、他helpのhoverと長文scrollは保持 |

修正はこのまとまりで行う。新しい管理画面／設定／保存authorityは追加しない。
元の再現、取消後focus、別focus／IME保持、通常refreshのscroll、compact、cameraと
Inspectorの両入力をfocused回帰し、代表edit→実ファイル→coldで残る観測を閉じる。

修正後の同じ実データで、pin選択行の可視化とmarkerのkeyboard focus、取消後の本文focusと
手動scroll1515の保持を確認した。camera説明はstage内のx576–928へ収まり、モデルtabの
実入力を遮らない。無選択の案内は1件、空入力は0件。適用中はcomponentで本文readonlyと
inert外のlive進行通知を確認し、実適用完了後は本文へfocusが戻る。最後の実保存で判明した
primary再作成も修正し、後続refreshを含む回帰と最終Desktopの実download/focusを通した。
開示確認待ちは新しい生成へfocusを誘導しない。最終候補の通常SW準備／完全終了後の
オフライン再開でも保存本文・取消・機体と写真の実描画が保たれた。実行環境、d6から
Fileだけ変えた4dへの証拠再利用、有限速度pairと残件／device gateはtodoに集約する。

## 2026-11-02 全体レビュー後の改善順序

修正前に独立したUI・安全境界・検証レビューを実施。現行c47の実画面と既存の
同source通し証拠を区別し、確認した範囲で新たなP0/P1は確定していない。

| ID | 分類・再現と判断 |
|---|---|
| PCQ-29 | 復元待ち時間P2。公開後の照合済みreadの重複除去だけでは同条件の速度改善を確認できなかった。承認06cのreadonly内容照合集約でKi84の改善を観測し、原本・編集・ファイル・復旧と最終自動検証を確認。正確な条件・時間・残件はtodoを正本とし、一般の速度保証とはしない |
| PCQ-30 | 現行実画面P2。Ki84・4シーン・1280×720でシーンが3行になり、Caption領域401pxに対しgrid最小468px。リスト111pxで約2行、詳細はy590から画面外へ続く。通常の一覧・詳細を読みやすく保つ高さ配分を次のUX修正とする |
| PCQ-31 | 未確認の検証経路。最も豊富な受信中断→再選択→重複保持はvalidation画面の証拠。Desktopの成功受信・復元とservice故障試験を、そのDesktop中断経路の実操作合格としない。復旧UIを変える際に既存代表ケース1本を接続する |

PCQ-30の実画面は私的`.artifacts/e2e/ki84-evaluation/whole-ui-review-20261102/02-short.png`
と`02-layouts.json`。公開物・fixtureへ含めない。保存・復旧のreviewはcodeと既存証拠であり、
新しい二ブラウザ／offline／実機の通し合格を追加したとは扱わない。
PCQ-29の実装・実測と最終検証はtodoで追跡し、PCQ-30は次の接続したUX工程へ送る。

## 2026-11-02 PO pin／camera／Caption・描画の6点

実装前のcode確認とPO画像指摘。具体操作・typed port・
guardはworkspace designの同日節へ集約し、今回のconnected一式で修正／検証する。

| ID | 問題と今回の修正範囲 |
|---|---|
| PCQ-23 | selectedだけtitle plateが残りpin根本を隠す。全pinを小dot＋小さい選択/focus輪郭へ統一しaccessible名・44px hit・要確認を保持。窓との1px線に明暗の縁を加える |
| PCQ-24 | canvasはMIDDLEだけ、pin overlay上はcanvas dragに届かず、choosing中は全Orbit無効。通常LEFT orbit／RIGHT panとpin上の既存navigation portを接続。閾値超dragは選択しない。実left配置/gizmo/windowdragを優先し、右panで仮位置は変えない |
| PCQ-25 | Caption grid43%固定＋detail最小高で一覧が狭い。非編集中はlist高優先、編集時だけ同detailへ配分。検索/手動scroll/draft/keyboard/short-height/200%相当の両paneと終了操作を保持 |
| PCQ-26 | pin倍率が現在モデル作業内にありCaption操作から遠い。Captionへ既存Asset単位controlを移し対象modelを明示選択。全Scene作用・保存値/range・未配置/複数model・readonly/IME/staleを保持 |
| PCQ-27 | 描画のtext数値は連続調整できず、draftは3Dへpreviewされない。ラベル/値scrub＋per-frame表示専用提案、既存parse/admitとscope優先、Apply1command／Cancel復帰。geometry/texture再生成なしのmaterial-only局所hookは独立資源review対象 |
| PCQ-28 | 通常近似説明と位置指定制約がviewport／材質contextで重複し長文常駐。通常情報は短い1owner＋context詳細へ、非対応/非表示/失敗/再試行と実picking制約は該当操作に残す |

修正後の専用Chromiumで、pin根本／接続線、左右drag、読む時の一覧高／幅、Caption内の
Asset倍率、押下中numeric preview／Esc／明示適用、警告contextを確認した。代表小規模flowは
実backup／再開で数値70と倍率1.5を保持し、mixed Mesh＋GSのpreview／取消／cameraも通過。
私的Ki84の1440×1000、720×500/DPR2、View、最終help44pxの画面reviewは必須指摘なし。
初期focusだけのlayout切替によるnative chooser不成立は、実編集intentだけで配分する修正で
解消した。program churn114→2の有限pairは全段pixelと取消復帰を保持し、速度保証へ広げない。
Reviewのcamera／copy後のbackup15秒超は、使われない最初の入力openだけを省き、最後の
実検査を保持して修正した。元15秒の実backup／再開caseも通過し、最終全体検証はtodoへ。

初回通しでは、削除後の未選択状態でUndoがdetail外へはみ出しasideに遮られた。
PCQ-25の追修正として、未選択時だけcontentのintrinsic高さを外taskのscrollへ載せ、
選択中の配分は保持した。修正後は実hit／全域表示と元のUndo／本文assertを確認し、
日常編集の元caseは保存・cold再開まで通過。ほかの初回失敗と最終候補の全体結果は
todoで区別し、旧sourceの画面確認を新source全体PASSへ拡張しない。
