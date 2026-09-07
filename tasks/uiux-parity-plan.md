# LociMyu継承不足の再監査とUI/UX実装計画

Status: **IMPLEMENTED / INDEPENDENT CODE REVIEW PASS / RENDERED ACCEPTANCE PENDING**。
2026-09-06。PO依頼は「残作業を洗い出してから実装計画を作る」。その提出後、POは
D1〜D4と3つのbounded sliceを批准し、実装を指示した。承認済み契約は
`docs/specs/02-storage-package-migration.md` §32。3 sliceのproduction codeとfocused
acceptanceは実装済み。release、実描画Desktop、physical iPhone受入れは別である。

## 1. 結論と根拠の範囲

既存Nativeの42機能群の住所確認は、LociMyuの利用者便益を網羅した証拠ではない。
不足は複数ウィンドウ・添付解除・表示セット管理・背景操作だけではなかった。
新規ピン色の事前指定と反復利用、既存メディアの再利用、一覧の添付有無、作業に沿う
ヘルプも必要。さらに既存の画像確認・共有対象の表示にも閉じていない問題がある。

- 現在地: `g0-baseline`、HEAD `d2302ec7e31e563448393ae3b42798e27d219b14`。
  origin追跡との差は0/0（fetchなし）。前回UI実装と文書の未commit変更を保持。
- LociMyuは原本の接続済み処理をread-only確認する。見出し・未接続API・ガイドだけを
  実機能の証拠にしない。原本の場所・内部名・hash・利用者資料は本書へ転記しない。
- Nativeは現在のcode/testsとacceptedなbounded仕様を照合する。一般v2計画や
  superseded roadmapから新たな要件を復活させない。
- 以前の1572 tests PASSは前回実装の証拠であり、今回の実操作証拠へ流用しない。
  今回の自動検査と独立code reviewは後記の実装記録へ分離する。41タスクのclick/tap/
  所要時間、実描画、physical iPhoneは未完了。
- `uiux-implementation.md`の42群とP01は維持。本書はその不足を補う次の計画。

## 2. 残作業の棚卸し（先に対象を確定する）

区分: **継承不足**＝元UIの利用者便益が未達、**既存問題**＝Nativeに入口はあるが導線・状態が未完、
**検証待ち**＝codeだけでは利用可能性を判定できない。下記の「候補前」はPOへ推奨する優先度で、
自動的にrelease gateへ追加するものではない。

| ID / 区分 | 利用者の目的と現在の不足 | 推奨する配置・操作 | 優先 / slice |
|---|---|---|---|
| R01 継承不足 | 同じ分類色で記録を続けたい。Native新規ピンは黄色固定で、既存ピンの再着色しかない | Caption追加帯の「追加色」。同じ作業中は明示選択を再利用。既存ピン色・一覧直上の表示filterとは別状態 | 候補前 / S1 |
| R02 継承不足 | 2件以上の記録を見比べたい。Nativeは選択を変えると前のwindowが消える | 通常は選択1件。windowの「残す」で比較対象を保持し、別Captionを選ぶ。右一覧と編集対象は常に1件 | 候補前 / S1・D1 |
| R03 継承不足 | 画像のある記録を一覧から見つけたい。現在は各記録を開く必要がある | 一覧行に添付記号＋件数。accessible nameは「添付メディアn件」。選択中の説明を重複させない | 候補前 / S1 |
| R04 継承不足 | 一度取り込んだ画像を別Captionへ再利用したい。毎回OS file選択へ戻る | 「メディアを追加」内に「ファイルから」「このプロジェクトから」。後者は小さなthumbnail一覧、選択内容を確認して添付 | 候補前 / S1 |
| R05 継承不足 | 間違えた添付を外したい。現在は解除入口なし | 添付項目の「…」→「このキャプションから外す」。確認後に添付関係だけを変更。元bytes/他Captionは保持 | 候補前 / S1・D2 |
| R06 既存問題 | 画像を確実に確認したい。panel側は再clickでpreviewが増殖し、overlay側とは別の閲覧経路 | panel/浮動windowから同じ画像viewerへ。対象Caption＋media IDを固定し、前後・閉じる・読込失敗/再試行を統一。未配置/非表示モデルの記録からも開ける | 候補前 / S1 |
| R07 継承不足 | 記録と見え方を用途別に分けたい。表示セットは切替だけ | 共通headerの表示セット横「…」→「新しい表示セット」「名前を変更」。新規setは空の記録と元material、既定視点なし | 候補前 / S2・D3 |
| R08 部分継承 | setごとの視点へ戻りたい。Nativeは新規視点登録で既定になるが、既存視点を既定にする入口がない。「更新」は名称だけでなくcamera/背景も上書きする | 視点tabの保存視点に「切替時の視点にする」。現既定を1つの印で示す。「現在の視点で更新」と結果を明記。自動的な最終カメラ保存は行わない | 候補前 / S2・D3 |
| R09 継承不足 | 背景色を数値で揃え、失敗したら戻したい | 視点tab下部「3D背景色」内にpicker・HEX・「標準色」。cameraの全体表示やmaterial resetとは分離 | 候補前 / S2 |
| R10 既存問題 | 編集中のProjectを書き出したい。現在は一覧へ戻り対象を探し直す | header「ファイル・共有」で対象Projectを固定し、目的別説明から同じ対象の既存出力へ引継ぐ。再選択をなくし、lock解放/再取得を維持 | 候補前 / S3 |
| R11 既存問題 | 何が共有されるか予測したい。画面の選択セットと保存済み出力対象が異なり、新規setを共有対象にする入口もない | 閲覧共有で保存済みsetを明示指定できる限定契約を提案。実際の対象セット名・モデル/記録/添付件数・含まないUI設定をpreflight表示 | 候補前 / S3・D4 |
| R12 既存問題 | 画像付き記録を削除/解除した後も共同編集の可否を理解したい。新規未参照mediaによりmerge拒否のケースあり | 共同編集の事前検査と理由/回復を可視化。無断で基準更新・bytes削除・受信側の制限緩和をしない | 候補前 / S1契約＋S3表示・D2 |
| R13 継承不足/既存問題 | 始め方や保存・共有の使い分けを画面から理解したい。Nativeヘルプは3D操作が中心で内部語も残る | Homeは「開く/新しく作る」、helpは「はじめる/記録する/保存と共有/困ったとき」。各actionから該当節へ。lineage/baseline等は詳細へ | 候補前 / S3 |
| R14 検証待ち | 右一覧・3D・入力を往復せず、短い画面/phoneでも操作したい | 既存4tab/独立scrollを維持して実測。window重なり、keyboard、長文、多数記録、拡大、focusと誤tapを検査・必要箇所のみ訂正 | 全sliceの受入れ |

### 維持・置換・非継承を混同しない

| 原本の便益 | 現在のNative / 判断 |
|---|---|
| Caption/Material/Viewsのtab | 4tabへ整理済み。複数Asset用モデルtab追加は妥当。第5の常設「便利機能」tabは作らない |
| 6方向の視点、透視/平行投影、読込時に全体を捉える配置 | Nativeにも相当する経路あり。+/-XYZから意味的な「正面」を推測しない。専用「全体表示」buttonと名前付きSaved ViewはNative側の維持対象で、原本の同一UI継承とはしない |
| 色circleで3Dピンだけ絞る、一つも表示しない/全色へ戻す | P01実装済み。右一覧は残す。色filterを新規色や既存色編集と混ぜない。元UIの不意な全色復帰は継承しない |
| 一覧/ピン選択、タイトル/本文、削除、新規色指定、表面への追加 | 原本で接続を確認。Nativeにも新規色以外は入口あり。原本の無確認削除は継承しない |
| Native側で維持する編集・閲覧補助 | 既存ピンの再着色、位置編集、pin倍率、検索、全体表示はNativeの既存機能として維持。原本でこれら全ての同一操作を確認したという意味ではない |
| windowの接続線・移動・resize、画像を見る | 1件の経路は維持済み。R02/R06で比較と画像確認の不足を補う。元の外部タブ依存はlocal image viewerへ置換 |
| materialごとの不透明度・両面・unlit・chroma | Nativeでexact Mesh/slot/setに対応。単一model前提や表示名による一括適用へ戻さない |
| sheetの保存と視点復帰 | DisplaySet＋Saved View＋Native保存へ置換。元のsheet内部構造/Google書戻しは非継承。R07/R08でauthoring不足を補う |
| 元folderの画像gallery | Google folder再読込は非継承。ただし画像を見て選ぶ/再利用する便益はR04として維持する |
| Googleログイン/URL共有/Drive保存/内部sheet名 | 意図的非継承。Native作業用正本と目的別packageに置換。名前や近さから対応を推測しない |

**未確認を要件化しない:** 原本の名前付き複数camera presetは見出しだけでは認定できない。
元の添付は単一画像を置換する経路で、添付並替えの継承根拠はない。material一括resetは
APIの存在だけでは利用者UIと認定できず、全画面専用操作・独自画像zoomも確認なし。
従って並替え/一括reset/全画面/新zoomを継承必須へ紛れ込ませない。将来便益は別判断。
原本のpin pulseは位置発見の補助として接続済み。Nativeの選択強調で同じ便益を得られるかを
R14で検証し、animationそのものを必須にしない。原本の自由なcamera操作すべての自動保存、
明示Fit/Undo/Redo/Caption前後巡回/全文検索の接続は未確認。Nativeにある検索/全体表示は維持する。

## 3. 配置と判断量を統一する

採用済みの低彩度グレージュ、控えめなsystem sansのブランド、2px角、優先度別の面/枠、
押下/選択/focusの分離を維持する。ピン色は利用者の分類で、アプリの警告色と混同しない。

| 面 | 常に/主に見せるもの | 必要な時に開くもの |
|---|---|---|
| 共通header | Project名・保存状態・保存、表示セット | セット管理、ファイル/共有、help |
| 3D | 対象pin、浮動Caption、カメラ入口/全体表示、配置中の終了/中止 | 比較windowの保持/解除、配置・サイズ調整 |
| 右Caption tab | 追加先/追加色/追加・位置操作、検索、色circle、一覧 | 選択内容、メディア追加/解除 |
| モデル/マテリアル | 各対象と対応する操作。Captionの選択対象とは独立 | 差替え/削除、chromaなど |
| 視点 | 6方向、投影、保存した視点と呼出し | 切替時の視点指定、背景HEX/標準色 |

Desktopは3Dの右に一覧、編集は右下の独立scroll。比較windowは3D内で右一覧を覆わない。
iPhoneは3D＋選択記録を保ち、一覧/内容を切替える。保持した比較対象を失わず、
同時に並べるか1枚ずつ表示するかを利用者が切り替えられる構成を提案する。
狭幅を理由に対象を自動closeしたり、表示できない機能を黙って捨てたりしない。
重なりを解消する「整列」と、移動/サイズのclick・tap可能な調整を用意し、dragだけに依存しない。

判断分類は(1)利用者が決める、(2)安全な既定値、(3)段階表示。以下は**設計上の目標で未実測**。

| 操作 | 1 利用者判断 | 2 自動化すること | 3 段階表示 / 操作目標 |
|---|---|---|---|
| 同色で記録を続ける | 最初の追加色/追加先 | 明示した追加色を同じ作業中に再利用 | 毎Captionの再着色0回。filterから色を推定しない |
| 記録を比較する | どれを残すか | 新規windowの安全な位置、対象IDの保持 | 通常閲覧は従来1件、比較は「残す」1操作＋次の選択 |
| 画像を再利用 | どの既存画像をどのCaptionへ付けるか | thumbnail・対象の提示、同じIDの二重添付防止 | OS file dialog 0回。添付確定は明示 |
| 添付を外す | 対象と解除確認 | bytes/他Captionの保全 | 項目「…」内。処理前に保存範囲を表示 |
| 表示セット作成 | 名前と作成 | 空の記録/overrideなし/既定視点なし | 管理内。原本relationやコピー元は推定しない |
| 背景を戻す | 標準色を使う | 固定された製品既定色 | 背景欄を開いた後は1操作。カメラは動かさない |
| 書き出す | package目的・保存先・必要な保存/破棄 | 現Projectの正確な引継ぎ・対象件数の算出 | Project再選択0回。OS保存/検証/一時片付けを省略しない |

この案は、既存監査のApple HIG/heuristicsに基づく階層・段階表示を継続する。
今回再確認したW3C解説に沿い、dragに代替pointer操作を設け、focus対象が浮動UIで
完全に隠れないことを受入れに含める。適合宣言ではない。
([Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html),
[Focus Not Obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html))。
Appleの追加disclosureページは今回本文取得不可だったため、新たな引用根拠にはしない。

## 4. 承認・実装した状態と回復

追加色はset別・Projectを開いている間だけのUI状態とし、初回は既存の黄色を使う。
tab切替/追加中止では保持し、setの切替は各setの保持値へ戻す。既存Captionの選択/再着色で
追加色を上書きしない。Project終了時は破棄。実際に作成したCaptionの色だけが
保存される。色filterで追加色が隠れている場合は追加帯に理由と「表示」を出し、無断でfilterを
解除しない。配置直後も一覧と内容から対象を見つけられることを検査する。

### D1 — 選択と比較windowを分離する

- 編集の正本は既存`selectedCaptionId`1件。windowを残しても編集対象が複数にはならない。
  通常選択は1枚の追従windowを更新。「残す」はUI状態だけを追加する。
- 残したwindowを選ぶと、そのCaptionを右一覧/編集で選択して最前面へ。既に開いている
  Captionの同一windowを再利用し、duplicateを作らない。cameraは自動移動しない。
- 遷移例: Aを残す→Bを選ぶとA保持＋B追従。Aを再選択すると未保持Bを閉じAだけになり、
  Cを選ぶとA保持＋C追従。「残す」を解除した選択中Aは追従windowになり次の選択で閉じる。
  非選択windowの保持解除もそのwindowを選択して追従へ移す（従来の未保持追従は閉じる）。
  ×は保持指定ごと閉じる。常に追従は最大1件で、保持対象との重複を作らない。
- ×はそのwindowだけを閉じる。選択中を閉じた場合の選択解除を維持し、他の保持対象は残す。
  空白clickは選択と追従windowを閉じるが、明示保持分は残す。これは§29の拡張として承認が必要。
- DisplaySet切替時は別setのwindowを隠し、session内の保持意図はset別に保つ。
  削除対象は閉じる。未配置/Asset非表示/利用不可は偽の線を描かず、一覧/内容で状態を説明。
  色filterだけで非表示なら内容を残して線を消し、色の復帰actionを示す。
- tab切替・保存成功はwindow状態を不用意に捨てない。別Project/終了は破棄。
  保存rollback/再読込では復元された実在IDだけに再整合し、古い画像応答は破棄・URL解放。
- 保持windowのpinが画面外へ出た場合は、既に決めたstage内位置と内容を維持し、線を消して
  「ピンは画面外」と示す。偽の投影点を作らず、cameraを勝手に移動しない。
- phoneでも比較の意図は残す。window数/画像同時decodeの保証値は未承認。必要な上限は
  実測後に提案し、黙って古いwindowを追い出す方式にしない。
- 原寸画像viewerは同時1件を維持。別set/非表示windowのthumbnailは新規読込せず、不要な
  decode/URLを解放し、再表示時に必要分だけ読む。保持IDを残すことと画像を常駐させることは別。
  詳細仕様で有限な読込queueを定義してから実装し、無制限の同時full-image読込をしない。

### D2 — 添付解除/再利用と共同編集

- 再利用は同じProject内の検証済みmedia IDを明示選択する。filename/hashの見かけで
  複数記録を同一視しない。thumbnailが読めなければ理由/再試行、勝手に再取込しない。
- 推奨UIは既存新規添付と揃え、clean Editで「添付して保存」「外して保存」。未保存が
  あれば先に通常保存を案内する。変更予定を確認後に実行し、失敗は直前のdurable状態を保持。
  確定した解除の回復は「このプロジェクトから」の再添付。汎用Undoの実装を装わない。
- 解除はCaptionの参照だけ。media record/bytes/共同編集の基準を消さない。
  完全backup/編集用コピーには残り得るため、解除を機密消去と表示しない。
  閲覧共有は対象Captionが参照するmediaのみという既存allowlistを維持。
- **確定した境界:** 共同編集の基準後に画像を追加し、その画像を全Captionから外した
  分岐を送ると、受信側にその画像がない場合は現在のmergeが拒否する。同じ条件は既存の
  画像付きCaption削除でも生じ得る。これは受信側の仕様どおりで、バグ扱いして検査を外さない。
- 推奨する追加契約の候補は、共同編集exportだけで「非baselineかつ現在非参照のmedia」を
  出力snapshot/byte closureから除外する限定規則。元Project、baseline、元bytes、完全backupは
  変更しない。§30のcomplete-current-snapshotを狭めるので、PO承認と独立contract reviewが先。
  受信側のorphan拒否・conflict規則・new-media整合は維持する。
- その契約を採用しない場合は、現行の拒否を保ち、出力前に制限と明示再添付/独立コピーへの
  回復を説明する。黙ってこの制限を受入れ済みにせず、POが代替境界を選ぶまで該当実装は止める。

### D3 — DisplaySetとSaved Viewの作成・管理

- 「新しい表示セット」は空のCaption、material overrideなし、default viewなしを推奨。
  Asset/visibility/transformを複製・変更しない。名前のみ入力、ID/orderは既存規則で生成。
  old snapshotの暗黙defaultを明示化しても既存membership/既定視点を変えない。
- 名称変更は同じset IDのnameだけ。新規と改名は通常保存まで未保存表示。
  空文字/不正入力はその場で説明し入力を保持。既存データの同名setを勝手に統合しない。
- 既存Saved Viewの「切替時の視点にする」は同setの既存IDだけを指定。実行時にcameraを
  動かさず通常保存待ち。選択/呼出しだけではdefaultを変えない。
  新規Saved View登録で既定になる現行挙動は維持し、名称を「視点を登録」に揃える。
- 既定視点を修正する反復flowは「既定の視点を選択→camera/背景調整→現在の視点で更新→
  端末に保存」。既存IDを更新し、毎回新規presetを増やさない。「名前だけ変える」操作とは
  呼ばず、上書き対象とcamera/背景も更新することを直近に示す。
- 原本のlast-view便益を、操作ごとの自動記録へ拡大しない。必要なら「現在の視点を登録」
  で明示する。背景標準色は現在の製品既定`#101725`を提案し、palette・投影・cameraは不変。
  HEXは既存の6桁RGBに揃え、不正途中入力では3Dへ適用しない。
- セット定義/視点/materialの変更は現在のCaption-only共同編集の対象外。ローカル編集可否と
  後のmerge可否を混同しない。基準作成後にこれらを変える場合の注意と、共有前の不一致検査が必要。
  自動rebaseやsetのmerge対応拡大はしない。
- set削除/複製/並替え、Captionの一括set移動、階層/visibility presetはこのsliceに含めない。
  新規set内で新しいCaptionを作る通常flowは必須。

### D4 — 書き出し対象と安全な引継ぎ

- 現行の画面set切替はUI値だけを変え、review exporterは保存済みsnapshotのactive setを使う。
  §30.3の「active DisplaySet」が画面/保存値のどちらかは明確化が必要。
  確定したcode/契約矛盾とは断定せず、利用者予測と契約表現の未解決差として扱う。
- **不足を閉じる推奨案:** 閲覧共有の出力計画にだけ、保存済みsnapshotに実在するset IDを
  明示指定できるbounded契約を加える。「共有する表示セット」に画面で選ばれていた正確なIDを
  候補表示し、利用者が範囲を確認して出力する。推測ではなく明示した選択を引継ぐ。
  未保存の新setは先に通常保存が必要。指定setが消失/未保存/不正なら止め、別setに代替しない。
- 実際の対象と件数をpreflightで示す。対象はそのset＋保存済みAsset visibility＋既存allowlist。
  色filter/検索/一時window/画面外かどうかは書出し範囲を変えない。
  通常snapshotのactive set、共同編集基準、他の3目的は変更しない。元Projectを書き換えず、
  reviewの出力計画だけを明示対象から構築する。§30.3の追補と独立reviewが先に必要。
- 契約変更を採用しない場合は保存済みactive set限定を正確に表示できるが、S2で新しく作った
  setの共有手順がなお未達になる。警告を足しただけでR11完了にせず、POがこの制限を受け入れるか、
  指定set出力を承認するまで該当sliceは停止する。header切替の自動保存で回避しない。
- 最小導線改善は、Project IDと明示目的を既存home出力へ引継ぎ、同じ対象行を開く方式。
  再選択をなくすが画面移動1回は残る。全てを編集中画面で完結させるsession/export再構成は
  必須にしない。引継ぎ後もProject実在/最新snapshot/lockを再検査し、失敗時は別Projectを選ばない。
- preflight後、lock取得とdurable再読込でsnapshot/対象件数が変わっていたら旧確認を使わない。
  更新した対象を再提示して利用者が改めて出力するか、停止する。先に開いたOS保存先への出力も
  完了扱いにせず、既存の中止/一時片付け規則に従う。
- 出力クリックからOS pickerへ直接進むuser gestureを維持。dirtyなら保存/破棄/中止を
  明示し、保存失敗なら出力を止める。Edit lock保持中にhome exporterを呼ばない。
  転送進行・read-back検証・OSへの保存・一時出力削除確認を別の事実として表示する。

## 5. 実装計画（棚卸しから導出・最大3slice）

POは本書の優先度とD1–D4を承認し、bounded仕様とacceptanceを§32へ先に記録した。
codeと自動証拠の独立reviewは完了。通常homeからの実描画Desktop基線は、Codexブラウザ
接続が初期化前に失敗したため未完のまま維持し、mock/testで置換しない。

| slice / 対象 | production範囲と目的 | 再利用 / 新たに必要なもの | 完了条件・停止条件 |
|---|---|---|---|
| S1 Captionの反復閲覧・添付 | R01–R06。Caption一覧/追加色/比較windowと、メディア選択・再利用・解除を1つの記録flowへ | 既存選択/overlay/画像admission/storage/ordered attachment mergeを再利用。window保持のUI状態、共通画像viewer入口、exact ID再利用/参照解除、D2承認後の限定export規則が不足 | D1/D2仕様承認が先。新規色→2記録→画像再利用→比較→解除→保存/再開→交換まで完遂。bytes/基準/他Captionが不変。一般gallery管理/編集/並替え、GC、codec追加、汎用Undoは非対象 |
| S2 表示セットと視点の整理 | R07–R09。共通set管理と視点tabだけを変更 | snapshot1のset/view/background、default-view helper、通常保存を再利用。set create/rename/default指定の純粋更新と入口が不足 | D3承認後。暗黙default/複数setで作成・改名・視点指定・保存復元。Caption/materialの所属、Asset visibility/transform、他setが不変。set削除/複製/一般履歴/自動カメラ保存は非対象 |
| S3 保存・共有の導線と最終受入れ | R10–R13、全sliceのR14。対象を再選択せず、共有範囲と失敗時の次手が読める | 4purpose dispatcher/export/lock/read-back、home単一入口を再利用。対象付き引継ぎ、D4承認後のreview set指定、実範囲preflight、日本語化/helpが不足 | D4とD2の採用規則を反映。4目的/dirty/lock/cancel/failure/再試行、41タスク＋下記追加タスクの実測、独立最終review、Desktop/iPhone受入れ。release/deployは含めない |

順序は **契約決定 → S1 → S2 → S3**。S1は先に閲覧UI、次に参照更新という順に検証するが、
巨大な一括diffへまとめず、同じ記録flow内の小さな変更として扱う。途中でstorage/mergeの
大きな設計変更が必要になったらS1を拡張せず再計画する。D2等が未決なら独立な設計作業は
進められるが、未決機能を省いた状態を「継承完了」と提出しない。

### 各slice共通のacceptance

- `npm run typecheck`、`npm test`、`npm run build`。既存テストの期待値を失敗隠しで変更しない。
- 通常home `/`からNativeへ。Vite指定URLを使用。public Pagesはcandidate証拠にしない。
- View/clean Edit/dirty Edit/保存中/lock-lost、set切替、非表示/未配置/利用不可、0件/多数件を確認。
- 密集pin/似た色/画面外で一覧選択から位置を見つけられるか確認。発見できなければ
  非色依存の一時的な強調等を再提案し、自動camera追従で解決したことにしない。
- focus/keyboard/tap、長い日本語・本文・多数添付、狭幅/短高/200%拡大、software keyboard、
  windowの重なりを実描画で確認。必要な単pointer代替と現在の操作終了口を検査。
- tab/filter/window操作はcamera・未適用入力・pin配置mode・保存状態を変えない。
  例外で変える操作は対象と結果を先に示す。failure/unsavedを隠さない。
- media/storage変更は欠落bytes/容量/中断/遅延応答/二重操作/共有参照とportable round trip。
- 物理iPhoneは新規UIのopen/記録/画像/比較/set/view/保存を確認する。
  task35/41のfresh offline/PWAが必要ならexact buildと一時HTTPS経路1件を提案しPO承認後のみ実行。
  dev server成功をoffline/PWA PASSにしない。
- writer以外による該当契約/diffと実行証拠のread-only review。新たなP0/P1は隠さず報告。

## 6. 実操作記録への追加（元41タスクは番号を変えない）

| 追加ID / 関連task | 成功・回復のシナリオ |
|---|---|
| A01 / 15,19,21 | 追加色を選んで2件作成。既存色/filterは不変。追加中止でも既存Captionを変更しない |
| A02 / 20,21,39 | 2件を保持して比較、1件を編集、×で1件だけ閉じる。set/色/Asset状態変化とphoneで対象を見失わない |
| A03 / 20 | 1画像を2Captionへexact IDで添付し、一方から解除。他方の画像/元bytes/backupは保持 |
| A04 / 20,23,30–32 | 基準前と基準後の画像で解除/Caption削除を試し、採用された共同編集規則どおりの成功または説明付きzero-write拒否 |
| A05 / 24–27,40 | 空set作成→新Caption→改名→既存視点を既定化→保存/再開。さらに視点調整→同じ既定視点を更新→保存→別set往復で復帰。新presetの増殖なし、別set/モデル表示は不変 |
| A06 / 26,40 | HEX有効/不正入力→標準色→視点へ登録。背景以外のcamera/material/interface色は不変 |
| A07 / 29–34 | S2で作成・保存したsetをreviewに明示指定。画面setと保存active setが異なる場合も指定範囲だけを出力/restore確認。元snapshot/基準は不変。未保存/消失setは代替せず停止 |
| A08 / 20,36 | 同じ画像を繰り返し開いても増殖なし。失敗後再試行/Caption切替後の遅延結果/閉じたviewerへ復帰しない |

A04は相手が画像を持つ/持たない、他Captionが参照する/しない、baseline画像保持を分ける。
D2投影を採用した場合は出力前後の元Project/基準/bytes不変、参照closure、再import noop、
受信側へ不正orphanを渡した場合の既存zero-write拒否も検証する。A07にはpreflight後の
durable変更を含め、旧対象確認で新しい内容を書き出さないことを確認する。

記録欄は既存形式を再利用する: 開始/終了、click/tap、OS dialog、panel/画面移動、mode切替、
再入力、gizmo前準備、undo/retry、所要時間、判断(1/2/3)、実行環境と対象build。
設計目標の手数を実測値に混ぜない。追加の独自evidence systemやfixture matrixは作らない。

## 7. candidate後・別承認の扱い

- 純polish: 微細なicon光学調整、任意animation、比較windowの高度な自動整列。
  読めない文字/押せないbutton/focus隠れ/保存誤認はpolishへ送らない。
- 追加判断: 添付並替え、set複製/削除/一括移動、タグ編集、検索拡張、一般Undo、保持windowの永続化。
  原本継承済み・candidate必須と勝手に表示しない。
- 必須の後続製品能力: 直接HEIC/HEIF・video/audioはPROD-16の別workstream。
  今回の不足補完を理由にcodec/dependency/schemaへ入らない。
- 非対象: Google/旧storage/推測relationの復活、conflict winner自動選択、無確認の破壊操作、
  private source混入、license/version/main/Pages/Service Worker/release/commit/push。

## 8. 自己レビューと参照

自己レビューと2件のread-only照合を実施した。全14行はslice/共通受入れに対応し、
原本接続済み/Native独自/未確認を分離した。レビューにより、同じ既定視点の更新、保持window
の入替え・解放、追加色の寿命、pin発見、D2のshared-reference/基準/再import試験を補足した。
特に「共有対象の警告だけでは新setを共有できない」という指摘を受け、D4を明示set出力の
契約へ訂正した。D1–D4はその後PO承認と仕様化を経て実装した。

既存42群の維持、media範囲、実機/実描画未完とprivate識別子非掲載を自己点検した。
独立reviewはS1/S2/S3のcodeとfocused証拠にP0/P1なしと判定したが、これは全操作の
実描画UX PASSやphysical iPhone PASSではない。

主な公開可能なcode根拠（行番号は本監査時）:

- `src/nativeGs/captionPlacement.ts:12` 新規Captionの既定色。
- `src/nativeGs/app.ts:1482` 一覧行、`:1544` panel画像、`:1783` メディア追加、`:1883` 視点UI、
  `:1960` 出力入口、`:2323` UIのset切替、`:2374` Saved View、`:2934` 添付、`:3045` 通常保存。
- `src/nativeGs/captionOverlay.ts:50` 単一選択overlay、`:159` UIとmedia読込の境界。
- `src/nativeGs/schema.ts:247` 暗黙set、`:277` 新規視点のdefault化、`:703` set validator。
- `src/nativeGs/storage.ts:690` 通常保存、`:735` media publication、`:873` 新規添付。
- `src/nativeGs/captionThreeWayMerge.ts:125` 基準検査、`:380` mergeと未参照incoming media拒否。
- `src/nativeGs/packageSnapshots.ts:53` review計画、`:67` 保存済みset、`:134` 参照mediaの抽出。
- 既存tests: `captionOverlay`、`captionPlacement`、`captionList`、`pinColorFilter`、`viewerPinColors`、
  `storage`、`schemaResolver`、`captionThreeWayMerge`、`packageSnapshots`、`packageExchange`、
  `portablePackage`、`homeUi`、`workspaceUi`（いずれも`tests/nativeGs`）。
- 契約: `docs/specs/00-product-contract.md` PROD-13–16/§10、
  `02-storage-package-migration.md` §§27–31、`04-locimyu-conversion.md`の原本保全/確定relation境界。
- 前回記録: `uiux-audit-design.md` §§21–23、`uiux-implementation.md`、固定41taskは`uiux-handoff.md` §7。

## 9. 実装・検証記録（2026-09-06）

- S1: set別の追加色、選択と保持を分離した複数Caption window、整列/1枚表示、
  共有画像viewer、一覧の添付件数、project内mediaのexact-ID再利用/参照解除を実装した。
  参照解除はmedia record/bytes/固定基準を保持し、共同編集出力だけが非基準かつ非参照の
  mediaを除く。実ZIPで基準mediaとの区別、sender不変、backup/clean copy復元、受信側mergeと
  再取込noopを検証した。
- S2: 空DisplaySet作成、exact-ID改名、切替時の既定視点、同じ視点のcamera/背景更新、
  背景picker/HEX/標準色を実装した。同名項目は選択・確認・結果まで番号付き表示で区別し、
  内部IDを利用者へ出さない。不正HEXは操作直近に常時表示し、登録/更新を止める。
- S3: workspaceから対象Projectと目的を固定してhome preflightへ引継ぎ、4目的の実範囲と
  dirty三択を表示する。OS保存先選択後にもlock/durable/preflightを再検査し、staleなら
  zero-writeで再確認へ戻す。中止、一時片付け、read-back不一致、共同編集非互換を別状態で示す。
- 独立read-only reviewはS1/S2/S3の最終codeとfocused証拠を確認し、P0/P1なしと判定した。
  レビューで見つかった未接続thumbnail、保存後のset/selection消失、狭幅fallbackでの配置消失、
  media結果表示の上書き、同名確認の曖昧さ、stale exportの内部文言は修正済み。
- `npm run typecheck`、focused Native tests、production build、`git diff --check`、public HEIC
  隔離検証はPASS。aggregate `npm test`は1,552件PASS/21 todoだが、保持しているlocal代表sourceと
  indexed blobの不一致により無関係なfixture-registry 2 suiteがcollect前に失敗したため、全体PASS
  とは記録しない。同時負荷でtimeoutした証拠検査2件は単独再実行で82/82 PASS。代表sourceは
  変更・公開・`dist`混入させていない。
- 通常`/`用dev serverは起動したが、Codexブラウザ制御は接続moduleの初期化が実画面操作前に
  失敗した。41taskのclick/tap/所要時間とDOM/実描画証拠は未取得であり、mockやdev server成功を
  代替証拠にしない。physical iPhoneとoffline/PWAも未実施。
- candidate後polish候補は、project一覧thumbnail queueの古い読込による待ちと、本文編集中の
  window thumbnail再読込抑制。一般gallery/GC/並替え/Undo、codec/schema/dependency/releaseは非対象。
