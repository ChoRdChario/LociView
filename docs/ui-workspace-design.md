# LociView ワークスペース設計・文言

2026-10-30。**PO承認済みの実装方針。PC候補へ初版を接続・検証済み。検証範囲・残作業はtodo。公開は含まない。**

[AAA水準のレビュー](ui-design-review.md)のQ1–Q8と、
[承認済みUI指針](ui-product-guidelines.md)を基準にする。
[操作できる画面案](mockups/loci-workspace.html)は架空データの表示プロトタイプ。
進行状況・検証・未確認は[todo](../tasks/todo.md)に集約する。

## 一つの画面設計

### 2026-10-31 直接操作への追加整理（PO承認）

比較窓の前面選択／整列メニューはproduct／Reviewから撤去する。
窓本体の選択・focusで最前面へ出し、前面窓を視覚的に区別する。
窓の移動・サイズ・閉じるは窓自身に保持し、Captionの編集選択とは分離する。
オフラインは仕様09§9.1の初回自動準備へ統合し、通常のモード選択を設けない。
正常状態を常設せず、更新・修復と実際に必要な回復情報を設定に残す。
既存データ・command／draft／IME／write／更新所有の安全条件は維持する。
開始視点の記録は既存createView commandのoptional makeEntry:trueで、新view作成と
同Scene.defaultViewIdの設定を一つのSession operationにする。既存callersは従来通り。
既存viewは上書き・削除せず、frame/capture/Scene/token・未解決参照・readOnlyの検証を保持。
wire/schema/ID規則は変えない。部分成功を表示せず、記録とentryが両方確認できた場合に完了。


## 2026-10-31 実使用からの修正（PO明示指示）

操作棚卸し後のPO実使用で、機能が存在していても意味・場所・終了操作が伝わらない
問題を確認した。以下を一つの操作改善として実装し、以前の配置制限より優先する。

| 対象 | 配置・意味・受入れ |
|---|---|
| Scene | 全タブ共通の対象。並び替えは「表示順」の「前へ／後へ」で、3D位置を変える操作と混同させない |
| Caption | 同じ右ペイン内に一覧と詳細を同時表示。検索／一覧スクロールと、本文・添付・編集中の確定／取消がそれぞれ利用できる。詳細のDOM／draftは一つだけ |
| 記録の操作 | 一覧枠内の選択対象用操作列に位置調整・親モデル変更・記録整理を置く。フォームはvirtualized行へ埋めず、同じ安定したownerで保持する |
| ピン色の絞り込み | PCの一覧・詳細同時表示では検索横の専用「ピンの色」内に既存選択肢をまとめる。旧常設サークル配置の例外をUI指針に明記し、色の判定・選択保持・全色／未知色の規則は変えない |
| ピン | 選択中を含む全ピンは色付きのピンだけを表示し、題名の常時ラベルを出さない。小さい輪郭の選択強調・色・倍率・要確認・44px操作域・accessible nameは保持する。浮遊Caption窓の題名は保持する |
| ピン追加 | 通常は面を選んで追加。「座標で追加」は同じ追加の補助入口としてまとめ、モデル内XYZを指定することを任意説明で伝える。GS／面なし経路も保持 |
| タグ | 仕様08で後から接続した分類機能。記録整理内の二次操作とし、既存タグ・所属・色を保持。実装されていないタグ検索を案内しない |
| 比較 | 記録を複数並べて読む補助機能。窓や問題がない場合は左下管理を隠す。「比較に表示」の入口、保持・配置・閉じた状態は保持する |
| 描画 | 「材質」タブを「描画」へ。既存対象・範囲・材質commandは同じ。編集中の適用／取消をスクロール内容から分離した常設完了欄へ置く |
| カメラ | 右側タブはキャプション／モデル／描画の3つ。保存視点のタブは除き、既存の視点・背景・開始設定は3D内「カメラ位置」へ移す。「視点を記録」「記録した視点」で再利用目的を示す |
| 直接操作 | 投影切替を右上ギズモ付近へ。軸クリックは維持し、ギズモを左ドラッグすると回転。「平行移動」の手アイコンを左ドラッグするとpan、矢印キーでも同じ操作が可能 |
| 適用とファイル | 入力の適用はProject内の確定、上部「ファイルに保存」は外部ZIPの保存。別の結果として明示し、自動一括適用や保存fenceの省略を行わない |

表示slot：Caption listは選択対象用の安定したtoolbar slotを公開し、フォームやinputの
寿命を行のmount寿命へ委ねない。既存のview panelはカメラ用UI slotへ移すが、
座標追加・親変更・整理の入力は同じ保持DOMの小窓に開き、一覧の高さを押し出さない。
位置の仮指定へ進んだらその選択小窓を閉じ、既存の3D確定／取消へつなぐ。
小窓の外へ選択・focusが移った場合も閉じるが、保持中の入力は破棄しない。
一覧は検索・最低1行・操作列の必要高を確保し、詳細欄へはみ出させない。
カメラ小窓は中間幅でも画面内へ収め、内部の閉じる／完了操作を利用できる。
Scene別state・capture・entry/background draft・候補は同じownerで保持する。
視点編集中の復帰入口はカメラ領域を開き、削除したタブへ戻ろうとしない。
Material controlsはscroll内容と既存actions／確認のslotを分離して配置できる。
これらのslotはUIだけで、Session／storage／ファイルの新しいauthorityを持たない。

カメラdrag portは表示専用のbegin／move／endを型で区別する。viewportが開始時の
Scene・display・camera世代と所有IDを保持し、一致したdeltaだけを既存OrbitControlsの
公開pan／rotate APIへ渡す。camera／controlsをmoveごとに再作成せず、CSS pxで処理する。
gizmo overlayがpointer captureを所有し、canvasへ疑似イベントを再送しない。
axis clickの既存閾値を超えたdragではクリックsnapを発生させない。
丸いギズモ外側の透明な角は背後の操作を遮らない。
開始は通常guardを通し、継続／終了は所有receiptで判定する。自分のdragを外部dragとして拒否しない。
pinの面選択待ちと実pointer操作を区別し、位置の仮指定をカメラ操作で確定・破棄しない。
up／cancel／lostcapture／blur／Scene・display変更／外部busy／IME／unmountで終了する。
表示追従用camera値だけをobservationへ追加できる。カメラdrag中に保存用captureが拒否される
規則は維持し、navigation自体はProject履歴・pin／model座標・保存形式を書き換えない。
準備前やportがない既存harnessでは新dragを無効にし、既存axis／fitを保持する。
別モデルの表示準備が続いていても、readyな表示のローカルなカメラ操作は許可する。
観測のoptional `cameraReady` は現在のcamera／controlsが操作可能なことを示し、
全モデルの準備完了を示す既存`ready`とは区別する。表示／Scene／tokenの一致条件は
共通で、既存portは`ready`へfallbackする。ローカル視点操作だけに使う。
編集・保存・未検証データの準備fenceは解除しない。
renderer方式・座標系・DPR・合成・保存・既存中ボタン操作の方針は変えない。

起動は通信の有無で選び分けず、同じPCアプリのホーム・作業画面を使う。
ホームの主役はファイルを開く操作と再開一覧。オフライン準備・状態・更新・解除は
「設定」にまとめ、初期化に失敗した場合も同じ入口を保つ。解除後の再開も同じアプリを
通信できる状態で開く。所有と検証範囲は[仕様09 §9](specs/09-desktop-offline-candidate-proposal.md#9-同じアプリへの起動統合po承認2026-10-30)に従う。

### 2026-10-30 再点検後の修正範囲（PO承認済み）

2026-10-31の[操作棚卸し](ui-design-review.md#2026-10-31-操作と機能の棚卸し)により、
R1–R10を一つの整理単位として修正する。Fileは保存・共有・受信・復元の既存目的を
一つずつ表示する。上部の保存／共有は同じownerへの短縮入口。開くだけではdraftを
作らず、明示入力・選択後の保護は維持する。閲覧では作成済みファイルを使える。
Projectを開き直す既存ノードはHelpからFileへ移し、core終了時に必ず外す。

製品の方位は通常Project・閲覧用ファイルとも既存ギズモを使う。generic視点controlsは
製品接続時だけ外部方位UIを指定でき、投影・recall・entryのportとharness既定は保持する。
実在する競合確認は既存の候補領域へfocusし、入力不正や正常な一時非表示は候補操作に
見せない。候補がない場合は具体的な現在の理由を示す。復旧で空の競合formを出さない。

添付thumbnailはUI専用のカード内slotへ整理操作を受け取る。slotは閲覧カードを複製せず、
管理側が所有する既存command／captured tokenを保持する。ページ移動でカードを作り直しても
現在の候補・draft／IME・確認・Blob URLの寿命を変えない。比較窓は従来の閲覧専用galleryを使う。
タグは閲覧中のCaptionとの関係と元のデータ色を示す。診断ID／pathは任意詳細へ移し、
失敗・曖昧さ・削除の影響と復旧操作は表示し続ける。

管理フォームは明示した作成・編集操作中だけ表示する。Caption詳細は題名・本文・
添付を先にし、色・編集者などは後段の属性へまとめる。`captionDetailControls`は
同じdraftを保持するメディア挿入領域を公開し、親が既存メディアUIをそこへ配置する。
入力要素を複製したり、本文と添付を自動で一括適用したりしない。

ピンの位置指定では、既存の指示・座標・確定／取消を持つ一つの操作領域を3D内へ置く。
狭幅でも3Dと同時に操作でき、数値入力・IME・選択対象・仮配置を保持する。
モデル・視点の編集中の終了操作もペイン下端で見つけられる配置にそろえる。

ファイルの目的は上部の入口から引き継ぎ、開いた目的の中で同じ目的を再選択させない。
作業一式／変更分、閲覧用、独立コピーなど意味の異なる選択は保持する。
既存の選択取消を明示する終了口をシート内で固定し、未適用入力を閉じるだけで破棄しない。
出力・照合・受信・復旧の実行や確認をUIが代行しない。

閲覧材質は現在の値・範囲を示す。未対応の元材質は一度だけ説明し、使えない通常入力を
並べない。ただし保留中のdraft・不正値・競合・復旧案内は保持し、対象を勝手に変えない。
比較窓は本文と添付を読める初期配置にし、既存の手動配置・サイズは優先する。
新しい表示寸法はUIの調整値で、保存形式・端末保証の変更ではない。

枠の弱化は44px操作領域やkeyboard focusの削除で行わない。常時の移動／補助操作は
静かにし、入力・選択・確定に強弱を付ける。設定はこのブラウザの表示と、Projectに
共有する編集者名を分ける。共有・過去の記録・対応版に関する重要条件は表示し続ける。
成功通知は解決済みの場合だけ終了し、失敗・未適用・復旧の状態を時間で消さない。
3Dの注意・読込・再試行はcanvasの上の専用領域へ配置し、比較窓の題名や閉じる操作に
重ねない。canvasとピン・比較窓・ギズモ・位置調整は同じ内側領域を原点にする。
表示領域の変化でも既存の座標・入力receiptと手動配置の保持規則を使う。

**主役は3Dと、選択したキャプション。管理操作は短い共通バーと目的別の領域へまとめる。**

| 領域 | 常に分かること | 操作 |
|---|---|---|
| 共通バー | Project名、閲覧／編集、再開データとファイルの状態 | 閲覧時は「編集する」、編集時は「ファイルに保存」を主操作に。ファイル・共有・設定はその権限と状態で表示 |
| 3D | 現在Scene、選択ピン、比較対象、作業中の位置 | 右上に方位・投影・平行移動・全体表示。記録したカメラ位置も同じ領域から開く |
| 右ペイン | 現在Scene、作業タブ、対象、作用範囲 | 共通Scene選択とキャプション／モデル／描画。Captionは一覧と詳細を同時に表示 |
| ペイン上部 | 一覧と選択対象 | 一覧側の選択対象操作、前／次。編集時の対象名は近くに保持 |
| ペイン下部 | 未適用内容の対象・状態 | 編集中だけ適用／取消を固定表示。別タブへ移っても元の編集へ戻れる |
| ファイル用sheet | 目的・Project・含む範囲・結果 | 保存、共有、受信、復元を目的から選ぶ。確認と主操作はsheet内で完結 |

共通バーは通常時に一列とし、成功通知や処理開始で別の帯を増やさない。
失敗・中断の状態は隠さず、既存の復旧へ戻る入口を同じ場所に保つ。
ファイルやヘルプの展開で3D・対象・確定操作を下へ押し出さない。

### キャプションの一覧と詳細

一覧では検索・件数・ピン色・題名・必要な状態だけを見せる。
詳細では題名→本文→添付→付帯情報の順に読み、編集・比較・位置調整を対象の近くに置く。
一覧と詳細は同時に使える二つの領域にする。選択、検索、スクロール、下書き、比較窓を保持する。
繰り返し作業には前／次も残す。

タイトル・本文の適用前は、添付操作の近くに理由を出す。
「メディアを追加する前に、本文の変更を適用してください。」＋「本文へ戻る」。
適用操作を隠れた場所へ探しに行かせず、固定footerの「変更を適用」で完了できるようにする。
本文・添付を一つのdraftにしたり、自動適用したりする設計ではない。

Sceneへの所属・削除・タグ管理は一覧側の記録整理から開き、ピン色などの属性は詳細へ置く。
既存の複製、タグ・所属の整理、Undo／Redoも補助操作から到達できるようにし、機能は削らない。
「元に戻す」「やり直す」は、既存のUndo対象の操作だけに使い、履歴全体の巻き戻しを示さない。
Sceneの追加・複製・名前・順序・削除・復旧は管理領域にまとめ、影響確認を維持する。
選択と比較窓の前面化は別の意味として表し、一方の操作がもう一方を変更したと誤認させない。
明示的なキャプション選択で窓を開いて保持し、再選択で開き直す既存の既定動作を維持する。
「比較に表示」を新しい必須手順にはしない。閲覧の代表画面は、利用者が窓を閉じた状態の例。

### モデル・保存視点・材質

- **モデル**：一覧／選択→Scene所属→一時表示→配置／位置合わせ→差し替え／削除。
  所属の共有変更とローカルな非表示を別見出しにする。
  位置合わせでは動かすモデルと基準モデルを並べて示す。
  点群の点径、GSの位置指定用の面などは該当モデルだけに出し、現在の編集可否を維持する。
  移動・回転・倍率は同じモデル対象・作用範囲・確定／取消で扱い、既存の数値入力とギズモ経路を保つ。
  プロトタイプのモデル配置は移動・倍率の代表例で、回転の実3D動作は示していない。
- **保存した視点**：呼び出しが先、作成・管理は次。現在のカメラ、保存視点、開始視点を区別する。
  背景はローカルな表示変更でも「背景に適用」を明示し、視点へ保存する操作とは分ける。
- **材質**：選択モデルから一意に分かる対象を使い、モデル・面を毎回選び直させない。
  対象と適用範囲→通常の調整→色の透過／詳細の順。曖昧な対象は推測せず明示選択へ戻す。
  draft中は対象・作用範囲を勝手に変更しない。閲覧では現在値を整列した項目と値で読む。

メディアは、画像・動画には内容に合うプレビュー、音声には名称と既存の再生操作を持つ
コンパクトな行を使う。音声に画像用の大きな空白面を割り当てない。
添付の説明・順序・解除は対象カードの整理操作へまとめ、毎回同じボタン列を重ねない。
拡大・再生の見出しは、選んだ比較窓／キャプションの対象と一致させ、編集対象は変更しない。
codec・HEIC・自動再生・外部送信・原本保持の既存条件は変えない。

### 狭い・低い画面

管理欄を折り返して縦積みする配置は使わない。
同じ選択・下書きを持ったまま、3D／作業ペインを明示的に切り替えられるようにする。
Caption内は一覧と詳細を同時に使えるまま領域を調整する。比較窓は勝手に閉じない。
右ペインとsheetは内容だけをスクロールし、対象と終了操作を保つ。
実機のsafe area・画面keyboard・browser拡大は、製品接続時に別途確認する。

## 共通の造形

既存の低彩度warm greigeとsystem fontを維持する。色や原寸は画面案の調整値で、
変更不能なブランド規則・性能保証ではない。読みやすさを優先して実画面で調整する。

| 役割 | 設計 |
|---|---|
| 作業面 | 暖色の灰色、右ペインは少し明るい面。浮上するsheet／窓は不透明な紙色 |
| 文字 | 内容の題名は24–27px、本文15px、操作14px、補足は13pxを基本。小さい文字で密度を逃がさない |
| 主操作 | 濃い無彩色。閲覧では編集開始、draft中は適用、sheet内ではその目的の実行へ主役を渡す |
| 補助操作 | 静かな枠・透明な面。破壊操作は必要時にだけ現れ、対象と影響を同時に示す |
| 余白 | 関連する対象・入力・操作を近くに。別の目的のまとまりの間へ余白を配分する |
| 形 | 小さい角丸、細い区切り。影は浮上した層へ限定。アイコンは同じ線幅・意味で統一 |
| 操作領域 | 視覚上の密度と当たり領域を分け、既存の44 CSS px方針と入力代替を製品で維持 |

3Dモデル自体の色や材質はUIの配色に合わせて変えない。
画面案のモデル・写真は自作の図で、実際のモデル描画や写真の品質を評価する資料ではない。

## 状態と入力

| 状態 | 表現・扱い |
|---|---|
| hover | 操作できる箇所の面／輪郭を少し変える。状態や実行結果にはしない |
| keyboard focus | 選択の塗りとは別の外周線。再描画しても同じ対象へ保つ |
| 選択 | 対象のまとまりを面・輪郭・名前で示す。利用者のピン色を選択色へ流用しない |
| 仮変更 | 対象名と「未適用の変更」、近接する適用／取消。共有範囲も近くに残す |
| 使用不可 | 原因となる対象と、その編集へ戻る入口を表示。薄いボタンだけで終わらせない |
| 処理中 | 受付後に処理対象と状態を表示。取消は実装済みの可否に従う |
| 成功 | 対象付近で結果を伝え、次の作業の常設状態に混ぜない |
| 失敗・復旧待ち | 対象・確認できた理由・保持内容・次の操作を解決まで残す |

補足説明は約2秒hover、説明入口の選択、keyboard focusから読める。
必要条件・未適用・失敗・共有や削除の結果はhoverなしで分かるようにする。
説明を読むために移動しても消えず、Escapeで閉じる。入力や対象は変えない。

文字欄、IME、カメラ、ギズモ、窓、dialogへ同じ入力を重複して流さない。
Escapeの提案は「最前面の一時UIから戻る」を基本とし、具体的な優先順を製品接続前に仕様化する。
入力の破棄・操作の中断は既存の確認・取消可能性に従い、一律に破棄する規則は追加しない。
focusは意味ある元位置へ戻し、背面窓に隠れた操作へ入らないようにする。

### 製品接続の境界

配置・説明の変更だけを既存のtyped UI compositionへ接続する。追加する共有バーのslotは
DOMの表示用ポートで、モード変更・保存・復旧の権限は既存hostに残す。一覧／詳細は同じDOMを
同時に表示し、狭幅の3D／作業領域切替でも入力・選択・検索・比較窓を作り直さない。隠れた
未適用内容には元の領域へ戻る入口を出す。Cameraは既存六方向／fitと上記の局所drag経路を使い、描画器を追加しない。

ファイル欄は非modalの浮上panelとし、開くだけでは編集権限や入力を変更しない。
選択中のファイル・確認・処理は既存hasChanges/busyで保護し、その間は閉じる操作を無効にする。
Escapeは既存dialog／context helpを優先する。ファイルpanel内からのEscapeは、処理・入力が
ないときだけ閉じて開いたボタンへ戻す。下書き、ピン、比較窓、cameraへEscapeを転送しない。
モード切替や対象変更で未適用内容を破棄する新しい規則は追加しない。
モード切替の確認中は、元の表示を保持して「切替中…」と回転マークを表示する。
完了・失敗は既存Hostの結果に従い、固定秒数で操作を再開しない。
材質ペインにはUI専用の選択モデル参照を渡す。draft・候補選択中には追従せず、対象が一意に
決まる場合だけモデル／面を先に選ぶ。複数の面や未解決状態は利用者の選択を要求する。
オフライン利用の既存UIは、作業中は設定内の表示slotへ移し、作業画面の終了時に元の
親へ戻す。サービス・購読・準備／更新／解除の権限と状態は元のownerが保持する。
Help／設定を開く前には表示専用portでファイルpanelを閉じられるか確認する。
入力・確認・処理があれば開示を切り替えず、そうでなければ前のpanelだけを閉じる。
設定の未適用内容は開示を閉じても保持し、作業欄から元の入力へ戻せる。

## 3D注釈と比較

ピン色は小さいデータ色として保持し、ラベルは読み取れる不透明な下地に置く。
色を変えずに、文字・輪郭・選択・要確認を明暗の背景上で識別できるようにする。
窓とピンの接続線は明暗の両方で分かる縁を持たせ、図を読む邪魔にならない強さにする。

比較窓のheaderはデータ色・題名・閉じる。前面窓と選択キャプションを別に示す。
整列操作は比較領域の近くに置く。手動配置・大きさ・保持意図を優先し、
初期配置は重なりを抑える案とする。新しい一窓固定や自動閉鎖は導入しない。
方位ギズモは現在方向が分かり、既存の六方向・全体表示と同じcamera経路を使う。

PO2026-10-30の修正：方位はBlender寄りの透明なRGB軸表示へ統一する。
常時表示する文字は正側のX／Y／Zだけとし、負側は小さい輪で区別する。
面名・自由視点・方向の文章、大きな外枠・背景面・影を除く。全体表示は独立した
小さいアイコンと、必要時の説明で示す。既存のY-up／+Z-frontは変更しない。
軸先端はカメラからの正しい投影位置に置き、重なり回避のために格子へ移さない。
44pxの透明な操作範囲が重なる場合は、先端への距離と前後順で選ぶ。
同じ軸の再選択は反対側へ切り替え、keyboardでは符号付きの六方向を選択できる。
重なる操作範囲ではhover・説明・focus・選択を同じ最近傍先端へ統一する。
狭幅では既存の比較窓の読取りを保つ右下配置とし、同じ小型表示を直接使う。
`cameraGizmo`はcamera値・現在軸・入力可否を受け、axis／fitと上記の表示専用drag意図を返すUI部品。
通常ProjectとReviewで同じ操作を使い、保存・描画器のauthorityは持たない。
任意説明のmanagerには、この部品のpointer先端を解決するUI内の登録口だけを追加する。
既存の3D領域での自由回転は保持する。参考：
[BlenderのNavigation Gizmo](https://docs.blender.org/manual/en/latest/editors/3dview/navigate/introduction.html)、
[UnityのOrientation overlay](https://docs.unity3d.com/ja/current/Manual/SceneViewNavigation.html)。

## 文言の規則

**名前は短く、操作は結果を表す動詞、注意は判断を変える一文にする。**
文言を一律の文字数で切らず、主語や対象が画面から分かるときだけ省く。
「保存済み」「完了」だけで異なる状態をまとめない。表示名とaccessible nameは一致させ、
補足はdescriptionへ分ける。名称・件数・相手・時点・失敗理由は確認できた値だけを使う。

| 場面 | 表示・操作名 | その場に必要な短文 |
|---|---|---|
| 閲覧→編集 | 編集する | 通常は不要 |
| 編集→閲覧 | 閲覧する | 未適用時は「変更を適用するか、取り消してください。」 |
| 入力の反映 | 変更を適用 | 未適用の変更 |
| 入力の取消 | 取り消す | 破棄確認時：「入力中の変更を破棄します。適用済みの内容は変わりません。」 |
| 破棄確認 | 変更を取り消す／編集を続ける | 対象名を併記 |
| 本文→添付 | メディアを追加 | 「本文の変更を適用してください。」＋本文へ戻る |
| 新規記録 | ピンを追加 | 位置選択中：「モデル上の位置を選択してください。」 |
| 位置の修正 | 位置を調整／位置を確定 | 共有記録なら、ほかのSceneにも反映することを表示 |
| 比較窓 | 比較に表示／ウィンドウを並べる | 通常は不要 |
| Scene所属 | このシーンに含める／このシーンから外す | 「キャプションはプロジェクトに残ります。」 |
| ローカル非表示 | 一時的に隠す／表示を戻す | 「シーンへの所属は変わりません。」 |
| Caption削除 | キャプションを削除 | 「すべてのシーンから削除します。元の素材と履歴は残ります。」 |
| 添付解除 | 添付を解除 | 「このキャプションから外します。元のメディアは残ります。」 |
| Scene削除 | シーンを削除 | 「記録・モデル・メディアはプロジェクトに残ります。」 |
| Scene復旧 | このシーンを復旧 | 「削除済みの所属・視点・材質設定は戻りません。」 |
| モデル削除不可 | 参照先を確認 | 実際に残っている参照と確認先を示す |
| モデル差し替え | モデルを差し替える | 「ピンは要確認になります。旧モデルと履歴は残ります。」 |
| GS本体差し替え | モデルを差し替える | 上記に加え「位置指定用の面は未設定に戻ります。」 |
| 視点の呼び出し | 表示 | 対象の視点名を同じ行へ |
| 視点の作成 | 視点を作る／視点を追加 | 「現在のカメラと背景を、このシーンに保存します。」 |
| 開始視点 | 開始視点を設定 | 「次にシーンを開くときの視点です。」 |
| 背景の変更 | 背景に適用 | 「背景を視点にも残すには、視点を作成・更新してください。」 |
| 材質変更 | 設定を編集／変更を適用 | 対象モデル・面・適用範囲を同じ領域へ |
| 共通材質 | プロジェクト共通 | 「シーン専用の設定がある場合は、そちらを優先します。」 |
| ファイル保存 | ファイルに保存 | 「モデル・メディアと履歴を含む作業全体を、バックアップに書き出します。」 |
| 作業一式 | 作業一式を渡す | 「相手が編集を始められる作業一式を書き出します。」 |
| 変更分 | 変更分を返す | 「共有した作業一式を基準に、変更分だけを書き出します。」 |
| 変更分の基準 | 変更を返す作業一式 | 確認済みの候補名・時点を表示。任意ファイルを選べるように見せない |
| 閲覧共有 | シーンを共有 | 「選んだシーンを、閲覧用ファイルにします。」 |
| 独立コピー | 独立コピーを作る | 「全シーンの現在の内容から、別のプロジェクトを作ります。」 |
| Review／Cleanの重要結果 | 元のプロジェクトへ変更分は返せません | 用途選択時に常時表示。通常helpへ隠さない |
| Reviewの範囲 | 共有するシーン | 「検索・色の絞り込みは共有範囲を変えません。」 |
| 履歴・個人情報 | 用途と元データに応じて表示 | 「過去の変更履歴は含みません。」「文章や素材に含まれる個人情報は残ります。」 |
| 名前付き履歴 | 編集者名を含みます | 該当時：「対応版のLociViewが必要です。」。既存の用途別除外規則を維持 |
| 名前の記録設定 | このプロジェクトの今後の編集に名前を残す | 自己申告名であること、停止しても過去の名前が消えないこと、対応版が必要なことを有効化前に表示 |
| 更新統合 | 更新を受け取る | 「同じプロジェクトの作業一式・変更分を取り込みます。元ファイルは変更しません。」 |
| 受信中断 | 元のファイルを選び直す | 「同じファイルを選ぶと、途中から再開できます。」 |
| 出力中断 | 書き出しを再開 | 確認できた保持内容を表示。再開可能性を推測しない |
| download引渡し | ダウンロードを開始しました | 「保存先で完了を確認してください。」 |
| 外部保存未確認 | ファイルの保存は未確認 | 共通バー短縮表示：「ファイル未確認」。必要時に任意の確認へ |
| 任意照合 | 保存したファイルを確認 | 「今回の書き出し内容と一致するか確認します。」 |
| 照合成功 | この時点の内容はファイルと一致 | 後続変更あり：「その後の変更は、このファイルに含まれません。」 |
| ブラウザ内の記録 | このブラウザで再開できます | 共通バー短縮表示：「再開データあり」。未適用入力の保持完了には使わない |
| Backup復元 | このバックアップから復元 | 「作業をバックアップの時点へ切り替えます。現在の作業と元ファイルは残ります。」 |
| 復元中断 | 復元を再開 | 現在の未完了状態と、再開可能な操作を表示 |
| 競合解消 | この内容で確定 | 「選ばなかった変更も、履歴に残ります。」。候補は初期選択しない |
| 以前の形式 | 変換して開く | 検出した内容、引継ぎ、見え方が変わる対象を表示。変換元ZIPは書き出しに含まれず、別に保管する必要を明示 |
| HEIC非対応環境 | HEICを表示できません | 「JPEG/PNGに変換して追加してください。」。未実装の手動対応付けを示さない |
| オフライン準備 | アプリを準備 | 「同じアドレス・ブラウザを使ってください。バックアップは別に保存してください。」 |

新たなアップロード、メール送信、相手の受領を示す「送信済み」は使わない。
名前の共有、削除、変換、復元の重要結果は、短文化しても省略しない。
新しい参照先表示などの案は、既存の参照・権限を確認してから接続する。
変換元ZIPと、モデル／メディアの原本を「原本」の一語でまとめて保存対象と説明しない。
既存の位置合わせは、基準モデルの中心と大きさへ合わせる操作として説明する。
向きまで自動一致することは約束しない。

## 画面案の範囲と実装へ移す境界

画面案は、開始／再開、閲覧、編集、一覧、位置調整、モデル、保存視点、材質、比較、
保存、共有、競合、復元、失敗、空状態と、幅狭／低い画面を示す。
操作で表現するのは表示・短い状態遷移・代表的なdraft保持・確認である。
ファイル読込／書込、実3D操作、OSのdownload、永続化・共同編集・オフライン準備は実行しない。
モデルと写真は自作SVG、データは架空。制作用の場面selectorは製品UIに含めない。

このプロトタイプのコードを製品へそのまま昇格させない。
実装では既存のtyped Session／provider／各serviceへUIを接続し、
guard、IME・drag、入力保持、保存・照合・復旧の境界を保つ。
幅・focus・動き低減の画面案確認を、実機・実IME・支援技術や製品の合格へ転用しない。
保留していた復旧テストの原因・修正・実行結果はtodoで追跡する。

共通枠・状態・文言、記録／各タブ／3D注釈とファイル／共有／復旧への接続結果は
todoに記録し、既存の広い操作シナリオも新しい導線で順に確認する。
新しい自動適用、候補の自動選択、参照の自動解除、共有保証、比較窓の自動閉鎖は含めない。


## 2026-10-31 output-flow duplication audit

Keep package purposes that differ in lineage, history or privacy. The header File
shortcuts use the same services; do not add a parallel exporter. In app update/repair,
keep the normal update action primary and move cache-only state recheck into a
closed diagnostic detail. Existing recheck/prepare/remove ownership, pending and
offline behavior stay unchanged. Proxy help must limit the need for a positioning
surface to surface-hit selection, without implying manual coordinate entry is lost.

## 2026-10-31 integrated-PC quality repair behavior

The PO-approved quality plan adds image inspection to the existing media dialog.
Keep previous/next/close and native video/audio controls. For a decoded still image,
show compact whole-image, original-size, zoom-out and zoom-in actions plus the
current percentage. Original size means one image pixel per CSS pixel. Whole-image
fits the visible image viewport. Zoom/pan is local UI state: preserve it across
ordinary Host renders, reset it only for a new image/attempt, close or explicit fit.
Support pointer pan and keyboard/scroll alternatives; retain browser zoom, IME,
Escape, existing media navigation and focus return. Video/audio do not show image
zoom controls. Late image events cannot replace a newer image; closing releases
the existing preview/Blob URL. No source resizing, metadata edit or new viewer.

Keep Scene selection controls alive across normal renders so keyboard focus stays
with the selected Scene. Header Help/Settings follow the existing disclosure model:
Escape closes and returns focus to the summary unless composing or already handled;
outside pointer/focus closes without stealing focus or discarding retained settings
input. Optional context-help remains readable, including after the anchor's initial
scroll-into-view. A scroll may hide the old note, but a pointer still over a valid
help anchor starts a fresh delayed display rather than becoming permanently silent.
Explicit keyboard/touch help follows its anchor through scroll/resize until
dismissed. Place notes beside the anchor when room exists, then above it; avoid
covering the next action below an input. Escape/second tap does not resurrect on scroll.

Input/conversion errors stay beside their current file/decision. Distinguish the
known capacity/inspection limit from invalid/unsupported structure without guessing
RAM exhaustion or corruption. Say exactly that conversion-source ZIP/report are
excluded from normal output; model and admitted image originals remain preserved.
Use current intent labels in help. Expanded capacity and auxiliary-workbook input
rules remain a separate measured proposal, not activated by these UI repairs.

Picking warnings describe the visible scene only. Ignore hidden Asset owners and
invisible descendants/materials when collecting the translucent-surface warning;
restore it when the affected surface is shown. This changes no rendering, picking
predicate, manual-position permission or saved material. Verify hidden→shown and
the retained conservative picking refusal with the original07n and mixed-surface
browser paths, not by weakening ready-state or pixel/picking assertions.

## 2026-11-02 Pin, camera and drawing comfort

PO's six changes amend the earlier selected-pin title and middle-only navigation
presentation. They do not alter records, rendering semantics or command authority.

1. All pin roots, including the selected pin, are compact colored dots without
   a visible title plate. Keep the44px hit area and accessible Caption name;
   selection/focus outlines follow the small dot, and needs-review remains
   accessible/visible. Floating Caption windows keep their title/content. Their
   existing nearest-edge connector gains a thin contrasting outline on light
   and dark backgrounds, remains pointer-transparent and uses the same receipt.
2. Ordinary canvas left-drag orbits and right-drag pans; existing middle/modifier,
   wheel, keyboard and camera-gizmo alternatives remain. Pin overlays reuse
   `navigateCamera(begin/move/end)` after the existing4px click threshold, with
   owned pointer/target/token/Scene lifetime and cancellation. No synthetic canvas
   events, drag-end writes or guessed hits. Placement left capture, Shift+left,
   pin/model gizmos and window manipulation win; right pan remains available
   between placement hits without changing the proposal.
3. While no Caption input/IME/position operation is active, give the list most
   available height and compact the selected reading detail; no selection needs
   only one short detail hint. Entering editing retains the same detail DOM,
   draft and focus and gives its controls space. Preserve search/manual scroll,
   selected-row reveal, both list/detail and Apply/Cancel access, short-height
   overflow, narrow width and200%-equivalent keyboard operation.
4. Move the existing Asset-wide `setAssetPinScale` control into Caption, with an
   explicit model selector and the existing0.001–1000 range/default/saved value.
   It affects that model's pins across all Scenes, never just one Caption or all
   models. Unplaced/no selected Caption and multiple models still allow explicit
   target choice. Keep readonly/conflict/stale/IME/draft guards and one Apply.
5. Numeric drawing fields retain text/keyboard entry and gain horizontal label/
   value scrubbing with visible focus/cursor. Parse/range/admit rules stay the
   same. Coalesce local previews to one animation frame; do not dispatch while
   moving or commit on release. Escape/pointer-cancel restores that gesture's
   starting draft. Explicit Apply is the existing single Session command; Cancel
   restores the saved display. Display rounding must not rewrite saved precision.
6. Normal approximation guidance has one short visible owner and optional
   contextual detail. Keep actual unsupported/hidden/error/retry and picking
   restrictions visible beside the affected action; never imply accurate smooth
   picking or silently hide a blocking warning.

The typed presentation proposal contains source token, Scene, exact MaterialTarget,
scope, existing override identity and validated MaterialIntent. The material panel
exposes only this current local proposal; `WorkspaceViewportState` carries it to
the product adapter. Reuse material parsing/admission and current Scene-vs-Project
precedence. Invalid/IME/stale/source/Scene/model/selection changes clear preview;
the provider, templates, saved records, CAS and file capture remain unchanged.
Preview grants no pick/save/publication evidence and restores saved presentation
before applying or changing authority.

For existing loaded Meshes, the internal ResidentSurface may expose
`setMaterialEffects(effects, admitTextures): void`, where effects retain the
existing `ValidationMaterialEffects` type and the synchronous callback receives
the exact next source-texture set. The hook is bound to that live surface and
captured representation/catalog/policy; disposed calls reject. Re-run existing
material validation and build every replacement from original template materials,
never the previous preview. Invoke texture admission before any node swap. The
viewport tracks/reserves newly needed uploads transactionally; admission failure
releases only its new reservations, disposes new materials and preserves the old
set. Success swaps and retires superseded materials under the frame handover below, updates the exact dynamic
texture set and releases only globally unused uploads. Never pre-reserve a fixed
texture superset, close CPU bitmaps, or forget maps between detach and swap.
Geometry/source texture identities, model placement and resident use count stay
identical. Point/GS/unknown surfaces keep existing fallback, with no forced hook.
Every effective change still invalidates coverage probes and the pick epoch.
Full compositor teardown remains required for Scene/model/geometry/resident-set,
visibility/context/layout or GS-base generation changes and unknown adapters.
For an exact material-only update, all existing resident identities and load states
must match and each resident must support the owned material hook and frame callback.
This first refinement is Mesh-only; Point/GS/unknown adapters keep full clear even
when unchanged. Retain the existing compositor/targets only inside that same owner. Its render builds
current accumulation variants while previous variants still hold program refs;
after a successful actual draw, dispose/prune unused variants, retaining skip and
only the current GS variant if present. Pruning releases materials, never source
textures, targets or GS claims. Failure/closing follows existing full teardown.
The Mesh surface also exposes optional `materialFrameSeen(): void`. It owns
only its current source-material table and at most the last presented table;
unpresented intermediate tables are disposed immediately, never queued. A
completed viewport draw (including the existing explicit fallback policy) marks
the current table seen and retires the previous table after compositor draw/prune.
Owner failure/close disposes both tables exactly once; this does not retain GPU
texture uploads, geometry or CPU bitmaps or certify picking/saving evidence.
This is bounded handover, not a persistent variant cache or new shader/uniform API.
Changed shader classes/coverage keys may legitimately compile new programs.
Accept with scalar-run/Cancel pixels, actual GL events, bounded variants/leases,
and a structural transition that still performs full clear; no numeric guarantee.
No decode/template rebuild per pointer move. The application viewport may refresh
its existing coverage/composition observation, never a new renderer algorithm.
Apply's resulting saved display must match the preview under the same precedence.
Saved effects remain the canonical baseline, separate from the proposal; restore
the latest same verified display on cancellation/invalid/stale/closing, never an
old initial snapshot. The typed viewport adapter refuses placement while an
uncommitted material preview is active, and file/view command guards retain their
existing draft restrictions. No proposal can mint current pick or save evidence.
Focused tests cover identity/disposal/rollback, invalid/IME/stale cancellation,
old/public callers, no commands during scrub and exactly one explicit Apply.
The dedicated connected browser scenario checks pixels, real file/reopen, camera
history invariance, list scroll/edit return and pin-scale persistence; a copied
Ki84 profile supplies representative dense pins/list/layout screenshots. Neither
200%-equivalent viewport testing nor injected limits qualify physical devices.

Post-cohort correction: when no Caption is selected, global record Undo/Redo
still belongs to the detail content. Its content must contribute intrinsic height
to the auto grid row and scroll with the outer task, rather than overflowing a
zero-basis flex row underneath the aside. Selected reading-first proportions stay
unchanged. Check deletion→no selection→actual Undo click and all visible action
hit regions in the original daily workflow; no overlay/pointer bypass is allowed.

The subsequent mode-return/resize checks expose two further allocation corners:
at1280×600 an editing task has381px but reserves180+240px plus its gap; at390×844
a one-row reading list consumes325px while the photo is clipped in179px content.
Use only the existing filtered UI row count to mark small lists (up to three).
When not editing, let those lists take intrinsic content height and return unused
space to detail; dense lists retain the established reading-first allocation.
For short editing, divide the available task height between a bounded browser
row and the remaining detail row, containing browser controls with its own scroll
instead of allowing them to overlap detail. Keep the detail's existing content
scroll and external Apply/Cancel footer, node/focus/draft/IME/list-scroll ownership.
No test-only scrolling or relaxed viewport assertions: the original View return/
resize and Workspace narrow-photo sequences must pass, and the dense Ki84 list
must retain its reading space. This is responsive layout, not a saved setting.

### Short PC Caption workspace —2026-11-03 responsive refinement

Keep the existing Scene buttons in one horizontally scrollable strip beside
management. Preserve full names, native scrollbar and keyboard focus; reveal the
current choice after initial mount, Scene/list changes or width changes by scrolling
only that strip. Unrelated renders must not reset deliberate horizontal scrolling.
Opened management retains its bounded vertical scroll and existing input ownership.

Fit list/detail tracks to available height rather than adding fixed pixel minima.
Keep the established list-first reading and detail-first actual editing intent;
focus alone does not resize them. Bound few-result lists by the same available
space while returning unused intrinsic height to detail. List and detail content
own scrolling; completion stays outside detail's scroll. The browser may scroll
its controls when the viewport cannot contain their minimum hit areas.

The existing add/settings and search/color/count controls share one compact
toolbar, mounted once. Keep the accessible search label and descriptive placeholder;
remove its repeated visible label in that compact presentation. Preserve search,
list anchors, selection, drafts/IME, media chooser, completion and view-mode behavior.
Validate dense Ki84/four Scenes at1280×720, narrow/200%-equivalent layouts, empty/
few-result lists, management, native focus and Apply/Cancel. These are UI-only
layout rules, not a saved setting, storage/renderer change or new numeric guarantee.

Rendered review also found a720×500 reading pane whose whole initial viewport
was consumed by previous/next navigation. Complete this same repair before final
regression: place the existing44px previous/next icon buttons beside the selected
heading, remove empty detail-content margins and redundant readonly field chrome,
and balance the two tracks when vertical space is scarce. Keep editable labels,
full accessible action names, input/footer ownership and a readable first body
line alongside a reachable list. Do not count a bounded but navigation-only pane
as comfortable reading. Retain the partial pre-refinement run as interrupted.
At600–760px viewport width, put the existing Scene strip and task tabs on one
row to leave space for both the first complete list row and selected body. Other
widths retain their existing order. Hide only the empty readonly title editor
chrome; preserve nonempty unresolved-title warnings and all editable labels.

Final regression refinement: viewport notice/retry must not add a normal-flow
row above the canvas. The existing inline approximation notice changes its height
by33px during numeric preview. Keep the display extent stable using a mount-only
bottom overlay stack inside stageDisplay: existing notice/retry above existing
pin adjustment, intrinsic heights, bounded wrapping/scrolling and no empty rail.
Keep overlay wrapper noninteractive and without a new stacking context; the
existing notice and pin task retain their own pointer/stack ownership. Allow
children to shrink/scroll in a short stage, retain44px retry and reachable
confirm/cancel, and verify actual hit centers against camera and Caption close.
Keep retry outside the notice text's scroll; reserve the right camera strip and
anchor the narrow-screen gizmo at the top while pin adjustment is open instead
of lifting it by a guessed form height.
This changes UI placement, not camera pose, renderer, pick or storage contracts.

Raster rollback verification must isolate the target through the existing local
model-visibility UI after the earlier two-model/reparent checks. Two identical
coplanar test meshes can change the visible winner when materials are cloned;
do not attribute that color difference to camera corruption. Verify accepted
lighting/draft state before capture and retain exact Escape pixel/value/history
rollback; no tolerance, timeout relaxation or new production test hook.

The same regression exposed a plain explanation intercepting the material Apply
button. Mouse/keyboard explanations must be pointer-transparent while document
pointer coordinates retain hover over their visible rectangle; outside clicks
continue to the real control through existing guards. Preserve existing delays,
Escape, focus/tap and shared-manager disposal. Long mouse explanations keep a
geometry-scoped ordinary-wheel reader (not browser zoom/modifier gestures), and
overflow keyboard scrolling only while the help trigger itself is focused.
Touch-opened notes retain native pointer scrolling; switch back before mouse
interaction on actual mouse movement/down or keyboard input and cancel stale
hover timers on touch down. A stationary mouse boundary event caused by laying
out a touch-opened note must not switch modality or disable native touch reading.
Verify real Apply-through-note, note hover/full reading, keyboard/touch and draft
retention without forced clicks, timeout growth or synthetic production hooks.
Keep the workspace and file primary buttons on a dark surface while hovered or
pressed. The generic pale hover must not override their background while leaving
white text. Preserve disabled appearance and the existing focus-visible outline;
verify rendered foreground/background contrast on the two existing actions.

### Drawing panel organization —2026-11-02 PO screenshot correction

The supplied whole-panel screenshot shows the target and appearance controls in
three narrow columns, mismatched label baselines and an advanced disclosure
occupying an incidental grid cell. Correct the whole panel as one bounded layout,
without changing material semantics or introducing new visual settings.

- Group Model, Material and Scope as one target section. Model occupies a full-width
  row for long names; Material/Scope use two equal columns at the normal480px
  sidebar, becoming one column at narrow content width.
- Group the four ordinary appearance fields as Opacity/Lighting and Sides/Coverage,
  with aligned label/help rows and full-width44px controls. Use at most two columns,
  and one column below380px of actual panel content width; long text may wrap
  naturally without colliding with help or a neighboring control.
- Put color transparency and threshold controls in one full-width disclosure below
  the ordinary fields, with their own responsive grid. Preserve automatic reveal
  for an active mask/chroma or retained input; never hide important field failures.
- Keep Apply/Cancel in the existing persistent footer outside the scrolling content.
  Keep every input node and its accessible label, focus, scrubbing, raw precision,
  composition, retained draft and explicit Session-command boundary unchanged.
- Keep one canonical applied-origin summary. The Scope choice already says
  "this Scene only"; remove its repeated explanatory sentence. Project-wide scope
  still states that Scene-specific settings take precedence. Unavailable/stale/
  failure/unsaved/recovery notices remain beside the affected controls.

Acceptance uses actual normal/narrow dedicated Chromium screenshots,44px/non-
overlapping controls and footer, keyboard reachability, held local preview,
Cancel restoration and one explicit Apply. Existing focused material guards remain;
this is layout/copy work, not renderer or image-conversion acceptance.

### Camera-frame overlay handoff —2026-11-02 measured refinement

The source-qualified fixed Ki8424-step old-control orbit measures3.0ms median JS
draw callback versus46.5ms median full UI observation callback (p95 6.8/72.0ms).
GL-call-end to marker batch-end is49.7ms median (p95 75.6ms). The original cached-
runtime attempt remains separate provenance-uncertain evidence. These are CPU/DOM
endpoints, not GPU or presentation completion; refine only this measured path.

- Add optional `ProjectViewport.observePresentation(listener): unsubscribe`. The
  synchronous listener receives a read-only draw-owned frame: exact RenderDisplay
  reference, local generation, CSS extent, camera orientation/axis/projection and
  projected pin coordinates. No pickToken, capture, provider, Source or save proof.
- After a successful current draw, publish at most one current frame in that same
  callback. Hidden/disposed/context-failed or replaced generations cannot publish.
  Listener rejection/throw falls back to the existing changed/full-render path;
  old adapters without this optional port retain their behavior.
- Keep all semantic/start/end/Scene/display/load/error/resource notifications and
  their deferred full UI render. Track their local revision separately so a
  handled pure camera frame alone may omit full rediscovery. Camera-navigation
  move must not request another full render for the same handled pose.
- The product adapter exposes an optional matching WorkspaceViewport observer,
  binding the frame to its exact installed WorkspaceViewportState and rendered
  display. Check closed/available/visible, token/Scene, exact display identity and
  generation using captured installed values; never call host/read/runtime.read
  or traverse resident materials from this per-frame path.
- The ordinary PC deferred bridge forwards this optional observer across late
  attachment/replacement. It owns one current-runtime subscription and one monotonic
  presentation sequence across runtime replacements; old high runtime generations
  cannot block a replacement starting low. Unsubscribe the old owner before
  disposal, retain pending subscribers through failed installation, and refuse
  hidden/foreign/old-owner/closed callbacks. No subscriber means legacy fallback.
- The UI accepts only the last fully rendered input/Scene/token generation and
  its ready visual state. Update only stable marker positions/visibility, existing
  Caption-window connector projection and camera-gizmo orientation with captured
  control restrictions. Do not rebuild panels, provider, media, captions or nodes;
  a newly visible pin without a stable node requires the ordinary full fallback.
  Preserve focused/captured markers and window dragging; do not steal focus.
- Unsubscribe on unmount/dispose; stale/foreign/late frames are ignored with safe
  fallback. Picking, placement, capture, saved views and file commands continue to
  use their existing current authority reads and checks, never this visual DTO.

Focused tests cover same-frame visual updates without provider reads, semantic
fallback, missing/stale/foreign/hidden/closed frames, old adapters and pointer/
preview ownership. Reuse the same24-step Ki84 action once for the candidate with
matched profile/runtime/viewport qualifications, actual frame/DOM/CPU endpoints
and source/data invariance. Do not infer universal smoothness/fps from call counts.


### Conversion image omissions —2026-11-02 contextual explanation

Show the reason beside the conversion decision, not only in a downloaded report.
The existing LociMyu conversion panel adds one initially collapsed disclosure,
`添付できない画像（N件）`, listing each affected Caption, source filename and
reason. Include Scene/row to distinguish repeated titles. Use text nodes and
normal wrapping; do not expose raw file IDs as control labels. Unknown filenames
say `ファイル名を確認できません`. Preserve the separate source/report retention
warning and all existing confirmation, create, cancel and report actions.

At the typed planner's image-warning event, retain an invocation-owned display
reference with Caption title, Scene/row, selected candidate filename (or mapped
filename when unresolved) and that same warning. Return a read-only primitive
`imageOmissions` DTO separately from base/plan/report/receipt/evidence. The prepared
choice exposes that DTO; its summary count uses the same items. This is display
information only, never source/receipt validation or command authority. No report
JSON, candidate-string or reason-prefix parsing in UI; no storage reads, new
schema or change to recipes1–7, fingerprints, source bytes or validation.

The existing evaluation-generation/title/relation/IME guards own adoption.
Invalidate/clear hides and clears stale rows immediately; a late result cannot
restore them. Keep the stable disclosure node/open state through rechecks of the
same source, reset it on a different source/cancellation, and do not move focus.
Acceptance covers mixed rejection reasons and count/Caption/filename association,
unknown filename, stale/IME clearing and no persistent report change. Verify the
actual Ki84 preflight's18 human-readable entries, including the JPEG refusal, on
the final UI bundle. Reuse the separately qualified core42/46 file/restore chain
only when its authority code/report/receipt output remain exact; no duplicate
large file roundtrip is needed solely for this presentation addition.


### Home Project action readiness —2026-11-02

Keep the existing list inert and execute fence, and make each current Project-row
button natively disabled while its owning workspace operation or IME composition
is active. Track only the installed row buttons; initialize new buttons from the
current busy/composition state, update them in controls without rebuilding rows,
and release old references on list replacement/disposal. Do not queue or replay
input and do not weaken opening, unsaved-input or storage guards.

A visible row can precede operation completion. Disabled appearance and native
keyboard eligibility must agree with that fact, then become enabled on genuine
owner idle. Verify held list refresh preserves nodes and disables both open
modes, newly inserted busy rows start disabled, composition toggles them, and
actual home keyboard opening succeeds after idle. Preserve the real Ki84 home
attempt failure evidence; a deep-link data check is not a home-input PASS.
