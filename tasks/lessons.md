# Lessons

## 2026-09-10: 記録の整理軸とピンの位置基準を混同しない

- シーンと色で探す利用者に、内部のモデル所有を日常の分類として要求しない。
  事前のモデル選択を省くことと、モデルに追従する位置関係をなくすことは別判断。
- 色の操作がピンだけを隠すのか一覧も絞るのかを実装で確かめ、期待との差を明示する。
- 低頻度の整列操作に3D主領域を占有させない。シーンをタブへ移しても影響範囲は隠さない。
- 「後から位置編集できない」という報告を、移動処理が存在しないと即断しない。
  現在位置からのギズモ開始と要再確認時の面選択を分け、通常手順で余分な再選択を課さない。

## 2026-09-09: 指定された基本操作とウィンドウの既定動作を優先する

- カメラの基本マウス操作はPO指定のBlenderへ合わせ、左クリックを選択・配置と
  競合させない。準拠する操作範囲を具体的に書き、座標系や全機能の一致を装わない。
- 連続選択で複数ウィンドウを読む運用では、保持ボタンを追加操作として要求しない。
  明示選択で蓄積し、×で個別に閉じる。通常の再描画で閉じたものを勝手に開かない。

## 2026-09-09: 配置入力とカメラ入力の所有を押下時に分ける

- 位置を選ぶクリックをカメラにも渡し、release時に判定するだけでは微小移動や
  Shiftの平行移動と競合する。配置・移動中とShift追加は押下時に入力を予約する。
- カメラの有効状態は配置予約とギズモ操作を合成する。片方の終了で他方の禁止を
  上書きしない。取消・複数pointer・表示失効でも予約と仮位置を安全に扱う。
- 実操作ライブラリをmockした試験だけでイベント競合の修正済みとしない。
  実handlerの回帰確認とnative入力証拠を分け、microtaskをbubble後の保証にしない。

## 2026-09-09: 人が位置を指定できることをUI検証の前提にする

- 数値入力・合成DOMテストが通っても、任意の3D位置を目で決められるUIの代わりに
  しない。継承するShift＋クリックと移動ギズモを未接続のままテストへ渡さない。
- 追加・移動・確定・取消は3Dの近くへ置く。右側の一覧・詳細を極端に縮む多重
  スクロールへ押し込み、画面下にある操作を口頭説明で補う状態を完成扱いにしない。
- 複数ウィンドウの処理が存在しても、入口が見えなければ使えない。実装・発見性・
  実描画の証拠を分け、POが手動確認を止めたら操作UIの修正を先に進める。

## 2026-09-09: 全体を薄くつなぎ、資料の現在地を一つにする

- POが全体先行を選んだら、同じ統合画面で一続きの操作を増やす。未接続部品の
  完成度を上げ続ける順序へ戻さず、細部の磨き込みは全体の導線が通ってから行う。
- 薄い実装でも、データ消失、無断の競合解決、未保存・失敗の隠蔽は先送りしない。
  合成データ、未接続の処理、実保存済み、実機確認済みを区別して報告する。
- `.md`への追記だけでは引継ぎにならない。仕様の承認境界、todo先頭、critical-path、
  handoffの次の作業を揃え、完了履歴の古い「次は」を現在の指示から外す。

## 2026-09-09: 読み取りの競合を保存欠損と取り違えない

- 復旧後の自タブ確認と他タブ通知は同時に走る。保存済みreceiptの確認も同じ
  排他契約に従わせるが、短い読み取りは順番を待ち、書込の受付拒否とは区別する。
- 例外を一括して「データがない」に変換せず、失敗原因を保持する。通知順変更や
  確認省略で隠さず、重ねた読み取りと本当の欠損・破損拒否を回帰確認する。
- 部分的な復旧PASSの後に確認エラーが出た試験は、全体PASSにしない。既存runと
  エラーログを保ったまま修正を確認し、正常だった初期化からの反復を依頼しない。

## 2026-09-09: 実装できる次の部品と、完成に近づく次の仕事を区別する

- 未接続部品の実装許可は、部品追加を無期限に最優先にする根拠ではない。
  直近の変更が一続きの利用・保存・共同編集のどの未達条件を減らしたかで振り返る。
- 部品、実サービスへの接続、実測、採用判断を別々に報告する。テスト数やcommit数を
  完成度の代理にせず、未接続なら利用者の現行画面は変わらないことを明記する。
- 操作環境が故障しているときは、必要な一括実測を明示する。他の部品や試験を
  自動的に積み増して待ちを隠さず、残る実装も完全provider等の有限な出口に束ねる。

## 2026-09-08: 手動テストは実施者の画面と言葉で案内する

- 手動操作を依頼するときは、実施に必要な手順をチャット本文にも載せる。
  手順書へのリンクだけで済ませず、文書は再利用・保存用の補助とする。
- A/B、owner、originなどの略号・内部用語を、定義なしで操作対象に使わない。
  「最初のタブ」「リンクから開く2つ目のタブ」のように、作り方と呼び方を揃える。
- 手順には開始状態、対象画面、実際のボタン名、待つべき表示、失敗時の停止方法を記す。
  中断状態からの再開方法と、再読み込みで消えるログの保存も説明する。
- buildやGitの特定は開発側が担当し、実施者には操作・観察・一括報告を依頼する。

## 2026-09-08: 操作環境の故障と製品の未検証を分ける

- localhostの検証リンクを渡す直前に、対象サーバーの稼働とHTTP応答を確認する。
  過去の起動ログや開いたままのタブを、現在アクセスできる根拠にしない。
- 検証用HTMLのローカルファイルを実行入口として案内しない。file://ではmoduleの
  読込が拒否され、見た目だけ表示される場合がある。稼働確認済みのHTTPリンクを渡し、
  生のHTMLを直接開かないことを明示する。ブラウザの安全設定は緩めない。
- ブラウザ操作環境の同じ初期化・安全確認エラーを反復せず、POが選んだ代替経路を
  一度確認する。画面が開いていることをAIが操作できる証拠にしない。
- 人間のChrome確認を後でまとめる場合は、操作と期待結果を既存runbookに集約する。
  手動証拠・別ブラウザの暫定証拠・未実施を分け、ボタンごとの返答を繰り返し要求しない。
- 既に承認された範囲の実装詳細や検証準備を、sliceごとの再承認待ちに戻さない。
  自動実行できる項目を先に進め、人間への依頼は必要な実機操作と判断にまとめる。
- 確認の延期は安全ゲートの免除ではない。実行可能な作業を進めた後に、本番採用を
  止めている具体的な未確認事項を報告し、補助資料や合成テストだけを増やし続けない。

## 2026-09-08: 競合の意図を推測せず、明示的な両方保持と完成条件を定義する

- 同じSceneへ同じ項目を追加した候補でも、利用者の意図が同じだと推測して
  自動統合しない。どちらかを残すか、両方を残すかは利用者が選ぶ。
- 承認された「両方残す」は別々に編集できる独立項目を意味する。元の項目と
  コピーの割当、他Sceneへの影響、参照の付替え範囲を確認時に明示する。
- 技術ゲートは現行契約の受入れIDへ対応付け、直近の実行単位を一件にする。
  チーム運用を一続きで完了できることを出口にし、テスト数やレビュー回数を
  完成の代わりにしない。既存の有効な証拠を再利用し、修正確認後に広範な監査を
  繰り返さない。資料だけの変更でアプリ全体のテストを再実行しない。

## 2026-09-07: 共同編集の紹介は利用像と安全境界を同時に伝える

- 端末保存だけでは、利用者は別の端末や相手との作業を想像しにくい。homeの短い紹介にも、
  実際のcontractで可能な共同作業像を一度だけ示す。
- `他のキャプションデータと統合できる`や`同じProjectならやり取りできる`という表現は、
  別Projectや別モデル間の対応付け、または継続的な共同編集まで可能だと誤解させる。現行は
  同じProject IDだけでなく、同じ固定基準、共同編集対象外の状態が不変、原則一回の提出round
  という範囲が必要であり、モデル表面や座標の対応を推測しない。
- 現行homeの共同編集説明は、team contractのPO判断を待つ既知の見直し対象として扱う。
  UI編集停止中に文言だけを直してarchitecture gapを覆わない。短い紹介へ正確なscopeを
  収められない場合は、操作箇所のpreflightへ段階表示する。

## 2026-09-07: 製品説明は製品名を主語にして機能を言い切る

- home冒頭で命令形やcatch copyだけを置くと、誰の行為か、製品説明なのかが分からない。
  `LociViewは`を主語にし、対象と中心機能を一文で言い切る。
- 製品説明と保存境界は役割が異なる。中心機能は見出し、端末保存等の利用条件は直後の
  短い補助文へ分け、同じ内容を言い換えて重ねない。

## 2026-09-07: 操作手段ではなく目的と結果をlabelにする

- `クリック`はmouse、`タップ`はtouchに限定される。複数の入力手段がある操作は
  `選択`のように目的を表す語を使い、drag-and-dropは`ここにドロップ`という代替経路として
  必要な場合だけ補う。
- file形式や内部roleごとに入口を分けず、利用者の目的が同じで安全に内容判定できるなら
  一つの入口へまとめる。検出後に判断が必要になった時だけ結果と次の選択肢を示す。
- 文言は単独で短くするのではなく、画面上の見出し、操作label、補助文、状態表示を一組で
  見直す。同じ意味の重複を削りつつ、error、未保存、影響範囲、回復手段は残す。

## 2026-09-07: 自動化の説明ではなく利用に必要な情報だけを常時表示する

- 利用者が選択する必要のない自動判定は、通常状態で説明しない。失敗や曖昧さが生じた
  ときだけ理由と次の操作を示す。
- 見出しやbuttonだけで結果が分かる場合、同じ内容を補足文で言い換えない。常時表示する
  文は対応対象、必要操作、保存先など、その場の判断に必要な事実へ限定する。
- 短文化のためにfailure、unsaved state、破壊操作の影響、回復手段まで隠さない。通常の
  idle copyと、安全上必要な状態説明を分けて扱う。

## 2026-09-07: 入口の説明は利用者の行為と製品の応答を一文ずつにする

- 入口の補足文で「確認し、案内します」のように主語を省くと、利用者の操作と製品の
  応答が混ざる。最初に利用者がすること、次にLociViewがすることを短く分ける。
- 「一度に、または一つずつ」のように結果が同じ操作方法を列挙しない。自由な選択方法は
  UI自体に任せ、文面は対象、結果、安全上必要な制約だけを伝える。
- 汎用的な「モデル」より、利用者が探す対象を明示した「3Dモデル」を操作名に使い、
  選択後の追加操作でも同じ名称を保つ。

## 2026-09-07: 自動判定できる形式ごとにfile入口を分けない

- Mesh、通常Point、GSをbytesで一意に検査できるなら、利用者へ役割別のfile inputを
  並べない。待機中は一つの「ファイルを開く」から検出結果を示し、追加modelやGS固有の
  proxy等だけを結果後に段階表示する。
- 入口統合で既存の同時読込を暗黙に削らない。複数fileを同じ入口で受け、既存上限内の
  異なる役割は保持し、同じ役割の重複は順番やfilenameで勝者を決めず明示的に止める。

## 2026-09-07: 保存済み一覧を新規読込入口のように見せない

- `従来形式`のように形式だけを見出しへ置くと、利用者はそこを新しいファイルの
  読込入口だと解釈する。入口には行為、一覧には保存場所と対象の由来を明記する。
- 0件の互換一覧を常設accordionで見せない。項目がある場合だけ、以前に端末へ保存した
  旧プロジェクトであること、閲覧専用で開き非破壊変換できることを段階表示する。

## 2026-09-07: 形式は入口で選ばせず、検出後に結果と行為を示す

- ファイル入口へ形式名を列挙しても、利用者の「続きを開く／閲覧する／別Projectを
  作る」という意図とは結び付かない。安全に検査してから形式・purpose・mode・
  元ファイルの扱いを同じ確認面で示し、確定前に書き込まない。
- `オフライン・端末`のようなカテゴリ名は、GS表示コードの保存、Projectの端末保存、
  backupを混同させる。操作は対象と結果で命名し、GSが関係する文脈にだけ出す。
- 確認画面の主操作名は初回だけ決めない。選択候補や検出結果が変わるたびに、実際の
  結果と同じ判定から更新する。説明ファイルのdownloadも、明示操作前に開始しない。
- 互換データが保存済みかは、保存を約束する確認より前に調べる。一つの確認内で
  「選択ファイルを保存する／保存済みコピーを開く」を正しく分け、cancel後も処理中の
  表示を残さない。

## 2026-09-06: 受入れ機能の住所確認と継承・作業完結を分ける

- 既存機能の件数をUIに割り当てても、原本の新規色指定・画像再利用・添付解除などの
  反復便益は網羅できない。原本の接続済み操作、Native独自機能、未確認placeholderを分ける。
- 読込/表示のreceiverがあることは作成/改名などのauthoringを意味しない。警告だけを
  追加しても、利用者が指定した表示セットを共有できなければ作業は閉じていない。
- 解除/削除は元bytesを保持するだけで完了とせず、その後のbackup・共同編集・復旧まで追う。
  既存契約に従う拒否を勝手に外さず、必要な出力契約の変更は計画でPO判断として切り出す。

## 2026-09-05: UIの移設は機能の住所と処理の寿命を一緒に検査する

- 既存機能との対応表を実装前に作り、入口だけでなく保存範囲・処理中の離脱・
  対象の独立性・再試行まで対応させる。機能IDが42個あることだけを完了証拠にしない。
- homeを統合すると別々だった処理が同時に起動できる。共通intake予約、古い非同期描画の
  無効化、書出し結果の保存確認を保護する。pending状態をDOMと別flagへ二重管理しない。
- 表示更新に編集snapshotの更新を流用しない。tab・色filterで配置modeや未適用入力を
  消さず、Viewerがmodeを確定した後に操作帯も同期する。実DOM代替の検査は実描画とは分ける。

## 2026-09-05: 説明文と段階表示を増やすだけで操作を改善したことにしない

- 反復する小さな選択は、modalへ隠す前に常設controlの操作量・占有面積と比較する。
  色別pin表示は直接触れるcolor circleを基本とし、説明を読むための往復を増やさない。
- 色circleの配置はPO指定のCaptionリスト直上。全tabからの操作性を理由に共通3D領域へ
  戻したり、同じ列を二重に置いたりしない。
- 一覧highlight、接続線、見出しで分かる選択状態を「選択中01」等で何重にも説明しない。
  windowは題名と×、一般的な記号にはaccessible nameを付ける。必要な対象名は残す。
- 定常画面は短いlabel、説明は文脈に応じたhelpや確認へ。操作対象・保存結果・失敗・
  権限・破壊操作・package目的は簡略化の名目で消さず、必要な場面で確実に見せる。

## 2026-09-05: 未実装の差分を列挙するだけで設計の不足を解消したとしない

- LociMyuの有用な閲覧補助を継承する依頼では、Native未実装であることは設計から
  落とす理由にならない。製品実装と提案見本を明確に分け、色filter等の配置・対象・
  解除・選択中の状態まで具体化する。現行42機能群の割当を製品全体の過不足なしへ
  一般化しない。
- 浮動Caption windowを見本の便宜で下部に固定すると、下固定の製品仕様に見える。
  右側の一覧／編集欄と3D上の浮動windowを区別し、pinとの接続線と移動可能性を示す。

## 2026-09-05: 代表的な見本を全機能の情報設計と取り違えない

- トンマナの見本に代表controlだけを置いても、機能網羅や発見性を確認したことには
  ならない。現行機能とlegacyの閲覧補助を棚卸しし、主入口・対象・利用mode・回復先を
  対応付ける。camera presetと保存した視点を「視点…」一つで曖昧に隠さない。
- 機能を省くことと段階表示することを区別する。見本へ未実装のlegacy機能を加える
  場合は提案と明示し、利用可能な製品機能や承認済みscopeへ黙って昇格させない。

## 2026-09-05: 仮のブランド表記で作業情報より目立たせない

- 正式ロゴが未提供の段階では、独自の装飾fontや大きな文字でブランドを作り込まない。
  通常のsystem sansと控えめなsize／weightを使い、Project名と作業情報を優先する。
  目立たなくするために極細字や読めない淡色へ逃げず、後日のロゴ差替えを別扱いにする。

## 2026-09-05: 控えめな操作も背景へ溶け込ませない

- 「詳細を見る」の優先度を下げることと、buttonであることを見えなくすることは違う。
  ユーザーが識別しづらいと指摘した場合、文字contrastだけで足りるとせず、淡い面・
  境界・hover／pressを調整する。低優先でも操作可能性を伝える。
- palette比較は同じ構成・文字・3D背景で行い、明暗・選択・focus・押下にも一貫した
  semantic roleを適用する。トンマナへの合意を特定色や実装全体の承認に拡大しない。
- 「薄茶」「温かい紙色」を黄み・赤みの強さへ短絡しない。POが低彩度を求めたら、
  明度差とbuttonの境界を維持しながら、背景だけでなく同系統の文字・枠・各状態の
  色味を一緒に抑える。彩度を下げることとcontrastを落とすことを混同しない。

## 2026-09-05: 機能整理と造形の洗練を別々の思いつきにしない

- LociMyuの機能別tabを、新しい見た目にするためだけに廃止しない。元の操作単位を
  継承し、切替時の選択・入力・表示文脈を保存する規則を先に決める。
- 色だけを変えた見本を造形の完成としない。角・書体・weight・枠の強弱・余白・
  hover／押下／選択／focusを一つの役割体系で示し、押せるものの識別を確認する。
- 参考画面の見た目、制作者が述べた意図、自分の解釈を区別する。静止画だけで
  押下animationや使用fontを確認したと断定しない。柄や装飾の複製で代替しない。

## 2026-09-05: 一覧の存在ではなく、選択を見失わない作業領域を設計する

- Caption一覧を追加しただけで閲覧・編集導線が直ったとしない。一覧・選択状態・3D・
  編集欄を、現実的な画面高、多数件、長い本文で同時に確認できるかまで検討する。
- 画面下へ一覧を足し、ページscrollで3Dと一覧を往復させる案はDesktopの既定にしない。
  右側の一覧と選択記録を優先比較し、どの領域がscrollするかを明示する。
- 同種アプリの配置を模倣するだけでなく、選択同期・focus・camera・回復の意図を調べ、
  LociViewの操作に適用する理由と非継承点を書く。少数サンプルの見本を実測にしない。

## 2026-09-05: テストUIを完成形の基準にせず、一覧とmedia概念を維持する

- 現行LociView UIは実装済み機能を確認する証拠であり、完成した製品の情報設計ではない。
  現行controlだけの並べ替えや、一画面の簡素化を設計の到達点にしない。
- Caption一覧は日常の閲覧・次の記録選択に使う主領域。補助設定と同じ理由で折り畳み、
  一覧への入口だけを残して「一覧を維持した」としない。複数件の見本で反復を検討する。
- PO指定のaction名は「メディアを追加…」。現在の対応が画像形式に限られることは
  補足で明示し、上位概念を画像へ狭めない。動画・音声等を実装済みとは表示しない。
- LociMyuに関する仕様・移行文書を読んだことと、元UIのcode・画面・実操作を確認した
  ことを区別する。元UIの操作patternを継承／廃棄する判断には一次証拠を対応付ける。

## 2026-09-05: UI監査は操作・状態・美観を一つの方針で評価する

- UI/UXの評価を機能配置や最低限のコントラストへ限定しない。色の役割、文字階層、
  iconの意味と造形、余白、密度、選択・focus・失敗状態、画面間の一貫性も棚卸しする。
- 好みの参照作品だけから配色や装飾を決めない。今回のPO意図は「資料の落ち着き＋
  少量の計器らしさ」。明暗は同じ構成で比較し、雰囲気と操作性を別々に評価する。
- 静かなUIは、操作対象・未保存・失敗まで薄くすることではない。装飾を減らしても
  必要な境界・label・回復手順は残す。ゲームの低contrastや微小文字を模倣しない。
- code由来の色計算、提案見本、実画面観察、physical-device acceptanceを分離する。
  監査用見本のrender成功を製品UIの可読性・操作性PASSへ流用しない。

## 2026-09-05: UIレビューは利用者の感想を公式原則・訂正案・検証へ接続する

- POの感想と機能上の整理だけで高品質なUIレビューが完了したとしない。
  公式ガイドラインの該当箇所、現行証拠、利用者への影響、具体的な訂正、確認方法を結ぶ。
- 前案に根拠を後付けするだけでなく、ガイドラインに照らして前案の弱点も再評価する。
- プラットフォーム推奨、ユーザビリティ原則、WCAGの達成基準と適合レベルを混同しない。
  Appleのpt、WebのCSS px、実測していないコントラストや操作数を同一視しない。
- 見た目の簡潔さを理由に操作対象、保存失敗、回復不能、未保存状態を隠さない。
  未測定の操作・支援技術・実機結果をPASSとしない。

## 2026-09-05: UI構成は利用者の目的・反復順・操作結果から決める

- HomeとNative homeのような実装上の区分を、利用者に選ばせる製品画面の
  区分へ持ち込まない。今回のPO方針は開始画面を一つにまとめること。
- 「開く／新しく作る」「package」のようなラベルだけでは、何を選び、どこに
  何ができるか分からない。各操作を対象・動詞・結果・保存先で説明する。
- Caption追加→配置→ピン位置調整→内容・添付→次の記録という反復を基準に
  並べる。追加と位置調整の間へ長い一覧や画像手順を挟まない。
- 使用頻度を機能名から一律に判断しない。表示セット・保存済み視点の呼出しは
  記録確認に必要だが、マテリアルや背景の編集は通常は段階表示にできる。
- 生成画像の省略や独自装飾を現行挙動の証拠にしない。今回の再構成には
  NativeにないiPhoneのシートハンドル、確認ボタンの文言変更、panel順序や
  controlの省略があった。現行レビューはコードと照合し、実装済み／提案を区別する。

## 2026-09-03: representative sampleの不在を製品scopeの不在とみなさない

- 一つのrepresentative sourceに動画・音声が含まれないことは、そのsourceでの
  回帰証拠に限られる。将来の通常利用で必要な製品機能を不要とする根拠には
  しない。
- 「初回public candidateでは延期する」と「製品scopeから外す」を分ける。
  Captionの動画・音声はpost-candidateの必須開発範囲として維持し、exact
  format／codec、schema／package version、viewer、privacy、iPhone acceptanceは
  実装前に別のbounded contractとして確定する。
- 段階実装でも、現在の対応形式を恒久的な情報設計へ焼き付けない。利用者には
  `添付メディア`という共通概念を示し、ID・順序・viewer stageはmedia-neutralに
  保つ一方、未実装の動画・音声controlや空の再生領域は先に表示しない。
- private representativeで確認できた形式は、その形式だけの実行証拠である。
  browser-native decode、特定dependency、orientationやphysical-iPhone対応は
  representativeを使った各targetの実行結果なしに一般対応と主張しない。

## 2026-09-01: LociMyuのCaption sheetとmaterialを別々に移行しない

- LociMyuではactive `sheetGid`がCaption群、material current-state、任意の
  viewを一緒に切り替える。DisplaySet受入では各recordの件数だけでなく、sheet
  切替時にこの連動がuser-visibleに復元されるところまで確認する。
- XLSXでexact GID registryが欠ける実データを、全件report-onlyのまま互換完了
  としない。一方で無言のordinal推測も行わず、複数source表が同じ完全な順序を
  示す場合だけ一括確認候補にし、不一致・未確認はfail closedにする。

## 2026-08-31: manual acceptanceでは正しい入力laneまで案内する

- `.lociview` backup restoreとLociMyu ZIP conversionは別入力である。単に
  「ZIPを入れる」と案内すると、native homeのbackup欄へ入れて失敗させる。
- acceptance手順には開始画面、押すlink、drop先の表示名まで書く。UIが旧画面
  を経由させる場合はP2へ記録し、変換失敗と誤診させない。

## 2026-08-31: legacyの意図された一対多を曖昧候補と誤認しない

- LociMyuのmaterialKeyはtrim後のマテリアル名であり、同名material全件へ
  意図的に適用される。複数一致をwinner選択が必要な曖昧さとして拒否しない。
- legacy名のfan-outは変換時だけに行い、各一致先をstableなnative slot record
  へ展開する。native/path aliasや曖昧一致を同じ索引へ混ぜない。
- converterが値を保存しても、sourceで有効な表示設定を強制OFFにすれば互換
  ではない。source-authority不足によるinactiveとreceiver側の欠落を分けて
  診断する。

## 2026-08-31: IDのないLociMyu Caption行を破損と決めつけない

- 実運用LociMyuでは、他セルに値が残っていても安定Caption IDが空の行が
  正当に存在し得る。これを自動的に「source修正が必要な破損」と分類しない。
- Product Ownerが空行扱いを批准したdirect adapterでは、trim後のIDセルが
  空の行だけをCaption生成・duplicate occurrence・digest計算から除外し、元
  sourceを変更せずreportへ残す。
- この例外を不正な非空ID、duplicate canonical key、digest collisionへ広げ
  ない。後続Captionと元rowの対応も同じfilterで維持し、行ずれによる画像・
  座標の誤所属を防ぐ。

## 2026-08-30: legacy conversion needs a usable native receiver first

- A conversion report is not a substitute for a native product capability when
  the source feature is an approved everyday workflow. For LociMyu/frozen-v1,
  DisplaySet material appearance must have a usable native destination before
  the converter is called complete.
- Rule: prove the missing destination with one representative input, then add
  only that receiver by reusing the existing product behavior. Do not turn the
  correction into a generalized appearance framework, renderer abstraction or
  DisplaySet/Asset-visibility coupling.

## 2026-07-16: 既存機能の廃止提案は運用ヒアリングを先にする

- 設計初版で「シート切替はタグで代替・廃止」と提案したが、実運用ではシート切替が「マテリアルの見え方（半透明/Unlit）× キャプション位置 × ビュー」を束ねた**見え方セット**として使われており、単なる分類機能ではなかった
- ルール: LociMyuの既存機能を削る・簡略化する提案をする前に、その機能が実運用でどう使われているかを必ず確認する。機能の表面的な形（シート）ではなく、運用上の役割（見え方の切替）を見る

## 2026-07-20: 依存追加時は脆弱性を確認し、用途に照らして判断する

- xlsx読取のためSheetJS(npm `xlsx`)を入れたところ、修正版が公開されていないPrototype Pollution/ReDoS（high）が検出された
- 本アプリは「他人が作ったZIPを解析する」用途であり、パーサの脆弱性は直接の攻撃面になる。→ 依存を外し、必要な機能（読み取り専用・セル値取得のみ）を自前実装した（`src/io/xlsx.ts`、依存ゼロ・線形時間の正規表現のみ）
- ルール: 依存を追加したら `npm audit` を必ず確認する。脆弱性がある場合、「機能のどこまでが本当に必要か」を問い直す。全機能ライブラリの一部だけが必要なら、自前実装が最も安全で軽いことが多い

## 2026-07-21: 移行機能は合成データではなく実データで検証する

ユーザーの実データ（LociMyu実プロジェクト）を投入したところ、合成テストでは全て通っていた移行機能に5件の不具合が見つかった。

1. **gidの正体を取り違えていた** — `__LM_MATERIALS.sheetGid` はGoogle Sheetsの内部ID（`617884617`）だが、xlsxにはこれが保存されない。私はxlsxのシート番号（1,2,3）をgidとして使っていたため、マテリアル・ビューが一切正しいセットに割り当たらなかった。→ `__LM_SHEET_NAMES`（LociMyuが記録している対応表）＋出現順の推定で解決
2. **xlsxの数値が指数表記** — `6.17884617E8`。合成データでは文字列で書いていたため露見しなかった
3. **`Number('') === 0` かつ `isFinite(0) === true`** — 空欄のfov列が0になり、平行投影のfrustumが潰れて画面が真っ暗になった。fallbackが効かない典型的な罠
4. **実運用では名前付きビューが存在しない** — 保存されていたのは `__last`（最後に見ていた視点）だけ。これを「内部用」としてスキップしていたため、視点が1つも移行されなかった
5. **バックアップファイルの同梱** — `LociMyu Save.xlsx` と `LociMyu Save backup.xlsx` の両方を読み、同一IDのキャプションが二重生成されて所属セットが壊れていた

- ルール: 変換・移行系の機能は、**必ず実データで一度通す**。合成テストは自分の理解を検証するだけで、他システムの実際の出力形式は検証できない。特に「他システムが書いたファイル」を読む機能では、仕様の推測が外れていても合成テストは全て通ってしまう
- ルール: 数値パースのfallbackは `Number.isFinite` だけでは不十分。空文字を明示的に弾く
- ルール: 元実装のバグを修正した場合、移行時に「当時の見え方」が変わる。修正が正しくても、移行では元の挙動を再現し、変更点を利用者に伝える

## 2026-06-29: 実証済みのZIP運用はUI/UXを含むシステムとして改善する

- ZIP方式を固定成果物の手作業配布だけと捉えず、生成、更新、差分確認、source folder導線まで含めて評価する。
- ユーザーが「ZIPでなければ成立しなかった」という実績を示した場合、理論上純粋な代替方式より、実証済み方式を安全で短い操作へ変える案を優先する。
- 編集元とruntime配布物を分離し、可搬containerを交換媒体として扱う。

## 2026-06-30: HTML parserの安全性は実際のsinkで検証する

- `innerHTML`、SVG、template、select等の挙動は、一般論や`script`の非実行だけでXSS可否を判断しない。
- 実コードと同じ挿入先・template・対象browserで、DOM注入、event属性残存、自動実行を分けた最小PoCを行う。

## 2026-08-16: GSとmeshの共存には同一空間の補修・交差を含める

- meshは別表示物だけでなく、GS欠損部を補うため同一領域で交差・重複し得る。
- `interactionProxy`、`visualPatch`、`splatExclusion`を異なるroleとして保存・描画し、interaction-only proxyをvisual/depthへ流用しない。通常`meshPrimary`をGSのraycast surfaceにする将来案は別の明示的なpolicyを要し、初回標準へ混ぜない。
- 不透明補修でも境界のちらつき、halo、二重表現を評価する。

## 2026-08-16: 半透明は数値ではなく合成意図としてモデル化する

- source material、user override、requested compositing policy、backendが選んだeffective modeを分離する。
- mask/ditherによるcoverageと、smooth blend/transmissionによる光学的透明を区別する。
- GSと交差するsmooth transparencyを保証できないbackendでは近似であることをUIへ示し、renderer固有の`depthWrite`や`renderOrder`を永続化しない。

## 2026-08-16: 閉じたmeshを前面・背面の一組へ単純化しない

- 航空機のような凹凸、翼、胴体を持つ形状では、一画素の視線上に多数のmesh面が並ぶ。
- 単純なfront/back depth二層を一般解として提案せず、Mesh、GS、Compareと、保証範囲を限定したIntegratedを分ける。
- 比較用途ではwipe、flicker、wireframe、dither等、厳密透明合成を要求しないUXも正式な解法として検討する。

## 2026-08-29: renderer種別を製品の表示単位へ昇格させない

- Mesh/GS合成の技術検討から、Mesh・GS・Compare・Integratedを独立した必須product modeとして仕様化したが、Product Ownerの本来の要求は、複数形式・複数Assetを共通Project座標内の独立レイヤーとして配置・表示・編集・保存することだった。
- ルール: ユーザーが表示／非表示を切り替える一次単位は読み込んだAssetであり、Mesh、通常点群、GS等はRepresentation／描画方式として扱う。技術的fallbackや診断案を、明示要求なしにMVP modeやrelease gateへ昇格させない。
- ルール: LociMyu由来のシート切替を単なるCaption分類とみなさず、Caption所属、set単位material appearance、任意のdefault viewを束ねる「見え方セット」として維持する。新しい表示設計で迷った場合は、正本を推測で置き換えずLociMyuの実際の操作を確認する。
- ルール: DisplaySetをgeometry layerやper-Asset visibility fieldへ拡張しない。visibilityの永続化位置はbounded implementationで既存presentation/snapshotとの差を確認してから決める。

## 2026-08-16: audit copyを現行実装だと仮定しない

- 製品名や世代が変わっている場合、最初にcanonical repository、entry point、git ref、build metadataを特定する。
- 現行コードが見つからない時は旧codeから断定せず、確認できた版、確認できない版、必要資料を明示する。

## 2026-08-18: 技術的G0より前にactive workspaceを一つにする

- 旧版展開物、添付ZIP、audit copy、現行repoが同じ探索範囲にあると、検索量だけでなく正本誤認が発生する。
- 設計・fixture固定・実装前にcanonical repository、baseline commit、active source root、archive root、generated/dependency exclusionsを固定する。
- ファイル数削減のために健全なmoduleを結合しない。削減対象は重複source、展開済みarchive、生成物、無効repo、raw researchである。
- 整理前にhash manifestと復元可能なbackupを作り、build/testが同等であることを確認する。

## 2026-08-19: 内部provenanceを常時UI警告へ直結させない

- GS/proxy由来という内部hit方式は再現・診断・将来の再バインドに有用だが、注釈ピンをユーザーがギズモで修正でき、測量精度を製品が主張しない場合、常時「概算」バッジを付ける必要はない。
- ルール: 安全性metadataの保存、製品全体の非測量保証、通常UIの表示を分離して判断する。技術的な不確実性を機械的に常時警告へ変換せず、ユーザーが取れる修正行動と警告疲れを考慮する。

## 2026-08-23: 自律開発ではslice間にgate基準のメタ監査を入れる

- characterizationを追加し続けるだけでは、失敗境界の理解は深まってもG0-Sのproduction defectは減らない。S0承認後はtests/fixturesの増分に対してproduction修正が大幅に遅れ、同じOP/BLOBリスクを複数sliceで細分化し過ぎた
- ルール: 3〜4 sliceごと、tests-only sliceを追加する前、またはproduction変更量がacceptance増分に比べて小さい時に、承認済みgate、未解消xfail、production/test差分、外部証拠、critical pathをゼロベースで再監査する
- ルール: 十分なacceptanceが既にある項目は新しいmatrixを増やさずroot fixへ移る。各sliceは少なくとも1つのrelease-blocking defectまたは外部gateを明確に閉じ、focused検証後にscope膨張と重複を再評価してからfull検証へ進む
- ルール: 実機・実データ・product-owner批准はcode workで代替しない。production laneと外部evidence laneを分け、待ち項目を明示的に並行管理する

## 2026-08-24: 長期プロジェクトと長期Codexセッションを分離する

- clean commit、task review、仕様、acceptanceがrepositoryへ外部化済みなら、長期gateを理由に長大化した同一セッションを維持しない。context圧縮、canonical workspaceの再確認、過去scopeの再読、stale diff監査が増えた時点でfresh sessionへ切り替える
- 1 branchのwriterは常に1つにする。並列化は原則2つまでのread-only監査に限定し、full test、build、fixture/evidence verifierなど同じworkspaceを使う重い処理は直列に実行する
- production待ちのtest writer、複数writerのshared-tree編集、長時間応答しないpatchを待ち続けない。full test/buildの正常な実行時間ではなく、5分を超えて進捗のないpatch/writer停滞、権限失敗、canonical repository不一致が起きたら中止してrootへ戻し、clean statusから再計画する
- writerの最終変更後にauditorはlatest treeを再読する。stage後はexact index、unstaged/untrackedゼロ、cached diff-checkを確認し、test/build/review実績をそのcached treeにだけ帰属させる
- 小さいexpected-failureを減らせることだけでは次sliceを正当化しない。外部evidence、実機、product/spec決定、lock/journal/typed issue APIがcritical pathなら、repository内micro-sliceより先にその依存を明示して停止する

## 2026-08-24: legacy product import and internal schema migration are different requirements

- Do not collapse LociMyu XLSX/model/image dataset conversion into LociView v1-package-to-v2 migration. They have different source shapes, user entry points and acceptance evidence even if they later share services.
- When the Product Owner reaffirms a foundational compatibility outcome, place it in the normative product contract in the same slice; a partly superseded vision note or chat history is not enough to preserve it.

## 2026-08-24: 非プログラマーPOには大きな仕組みを口語で説明して確認する

- 通常の実装詳細や可逆なプログラミング判断は自律的に進める。
- アーキテクチャ、security境界、運用process、Release手順など大きな仕組みを変える前には、利用者や運用に何が起きるか、何が許可され何がまだ許可されないかを口語で説明し、Product Ownerに確認する。
- 批准済みの仕組みの範囲内では細部ごとに再確認を求めず、批准範囲を越える時点で止まる。

## 2026-08-26: 幅広い利用者には安全な自動処理と後回し可能なレビューを優先する

- 技術的に安全で非損失な既定処理がある場合、一般利用者へ細かなID・移行・保存判断を連続して求めず、ツール側で全件を保持して進める。
- 自動確定できない関連付けや曖昧さは、黙って推測・削除・統合せず、通常作業を妨げない範囲でレビュー待ちとして蓄積し、詳しい利用者や支援者が後からまとめて解決できるようにする。
- 通常UIは短い結果と必要な行動だけを示し、技術的な根拠や個別問題は段階的に開けるようにする。継続がデータ損失・誤関連・不変条件違反を起こす場合だけ、影響単位を限定して止める。

## 2026-08-26: severityとdelivery priorityを分離する

- レビューで問題を発見した事実だけではactive scopeへ取り込まない。現sliceのacceptance、active gate exit、データ破壊・重大security・重大互換性、または大幅な後続手戻り防止のいずれにも該当しないP2は原則backlogとし、P1も同じ因果を確認する。
- reviewerは通常1名、security・storage・migration・wire compatibilityで独立したrisk classがある場合のみ最大2名とする。初回reviewと受け入れたP0/P1修正のtargeted確認後は探索を再開せず、P2ゼロを完了条件にしない。
- 既存acceptanceがroot defectを十分に拘束している場合は追加test・fixture・oracleを作らない。sliceはrelease blockerまたはgate exit rowを1つ閉じる単位とし、xfail/todo件数の削減だけで開始しない。
- full matrixは最終の実行系treeで原則1回とし、その後が結果記録だけなら静的確認に限定する。exact release-candidate treeの最終matrixは別に実行する。
- external evidenceは一括して「外部待ち」にせず、repository準備、Codex実行、物理端末操作、外部data、Product Owner批准、前項待ちへ分解する。実機runはfixed fixture/trace/instrumentationが揃ってから一度に実施し、code workで代替しない。
- monolithic gateが無関係な後続laneを止めている疑いがある場合も黙ってgateを緩めない。依存関係をread-onlyで示し、Product Ownerが批准するまでは現行gateを維持する。

## 2026-08-26: 承認済みAND関係をsliceでORへ弱めない

- 同一logical Asset内のMesh＋GSのような承認済み併存関係を、最小sliceの都合で「MeshまたはGS」へ変えない。Mesh-only／GS-onlyがschema-validでも、paired acceptanceの代替にはしない。
- 既存`AssetRevision`／`Representation`で表現できる構造に、別名のdomain model、representation set、revision frameworkを重ねない。不足が一つなら既存record間の最小relationだけを説明し、批准前にfieldやframeworkを実装しない。
- ユーザー体験上の操作対象と内部hit-test方式を分ける。GSを操作するUXでも、初回は明示的にbindされた同一asset内のproxy raycastでよく、normal-Mesh binding、direct splatや汎用collisionを自動的にscopeへ入れない。

## 2026-08-26: 表示パターンとinteraction representationを分離する

- simple Mesh+GS mixed、GS-only、Mesh-onlyは同じactive AssetRevisionの表示状態であり、新しい永続modeや別domain modelを作らない。
- `interactionProxy`がある場合、表示状態を切り替えても同じ非表示proxyをraycastし、proxyをcolor/depth/boundsへ出さない。GSが非表示でも同じactive revision内のtarget familyとの明示関係は維持する。
- proxy-less GS-onlyはview-onlyとし、穴を埋めるためにdirect splat pickingやproxy自動生成を初回scopeへ取り込まない。最初のmixed smokeは単純な不透明Mesh depth規則だけで閉じ、高度な透過・合成は後続へ送る。
- 「後続へ送る」と記すだけでは、上流gateのrequired fixtureに残っている限りcritical pathから外れない。初回base acceptanceと後続feature acceptanceの依存先を同時に直し、後続要件は削除せず対応feature controlを有効にする前へ移す。

## 2026-08-26: interaction hitとCaption位置の正本を分離する

- Proxy raycastはCaptionの概略初期位置を得る入力であり、GS表面を精密再現する位置正本ではない。配置後はユーザーが通常ギズモで調整できることを初回flowに含める。
- Caption位置の正本は対象GSが属するlogical Assetの`AssetFrame`上の`positionAsset`とする。ProxyのRepresentation IDやtriangle locatorは任意の弱い由来情報に留め、Proxyの欠落・交換・再openで保存位置を再計算・移動・無効化しない。
- mixed表示でも選択中GS familyへ`proxyForGsVariantFamilyId`で明示関係を持つProxyだけを初期配置に使う。近い、見えている、同じAssetにあるという理由で通常Meshや別Proxyを自動選択しない。
- 概略配置を採用したscopeで、精密な画面誤差をProxyの合格条件へ残さない。必要なのは有効な対象領域・奥行き、操作可能なギズモ、AssetFrame保存・再openであり、direct splatや精密Proxy自動生成で穴埋めしない。

## 2026-08-27: project open modeと書込みlockを権限概念へ混同しない

- View modeとEdit modeはユーザーが選ぶプロジェクトの開き方であり、user account、role、ACLや権限委譲ではない。書込みlockはEdit modeが現在安全にmutationできるかを示す別のruntime状態である。
- View modeは意図的にread-onlyで、Web Locksを要求・保持・自動再試行しない。Edit modeだけがproject-scoped write lockを要求し、取得不能・API不在・喪失時はread-onlyへ倒す。
- UIのボタン無効化だけを安全境界にせず、store dispatch/merge、service mutationとproject filesystem writeを同じlockで拒否する。lock取得後のEdit modeは古いin-memory stateを昇格させず、durable stateを開き直してから書込み可能にする。
- Product Ownerがmodeとlockを区別した場合、実装済みのsingle-writerを理由に完了扱いを維持しない。用語、初回open、fallbackと実ブラウザ証拠まで同じacceptanceへ戻して確認する。

## 2026-08-27: 候補harnessのfixture関係を製品identityへ一般化しない

- 初期技術harnessの独立Mesh Assetと部分GS Assetは、後続productionの標準paired Assetを否定・置換しない。candidate fixtureの都合をlogical identityやalignmentの証拠へ自己昇格させない。
- interactionは表示パターンだけで決めず、ユーザーが明示選択した対象Assetから解決する。独立Mesh対象ならそのMesh、GS対象なら同じGS Asset/revision内の専用Proxyだけをraycastし、別AssetのMeshを近接・可視性から推測利用しない。
- harness、PoC、production acceptanceのcreditを分離し、候補harnessのsave/reloadや描画成功をG1採用、production persistence、同一logical-Asset acceptanceとして再利用しない。

## 2026-08-28: 承認済み仕様recordとproduction実装済みschemaを混同しない

- 文書に`AssetRevision`／`Representation`が承認済みでも、production codeにvalidator・保存・再読込経路がなければ「既存schemaをそのまま利用できる」とは言わない。先にimplemented gapを明示する。
- Product Ownerがそのgapに対する限定snapshotを批准した場合だけ、既存record名・意味を再利用した最小wireを実装し、v1への便宜的field追加や汎用v2 frameworkへ拡張しない。

## 2026-08-28: offline-readyは非同期cacheの時間待ちから推定しない

- 大きなlazy chunkのruntime cachingはmodule初期化後にも継続し得る。固定時間pollで完了を推定せず、明示準備操作自身がexact URLをCache Storageへ保存・read-backし、その成功後だけoffline-readyを表示する。
- 初回登録直後の`navigator.serviceWorker.controller === null`はinstall失敗ではなく、現在のpageがまだ制御対象でないだけである。再open用の準備では`navigator.serviceWorker.ready`でactive workerとapp-shell install完了を待ち、不要な手動reloadを合格条件へ足さない。
- Service Worker登録をfire-and-forgetにして失敗を握り潰したまま`ready`だけを待つと、明示準備操作が永久待機し得る。登録結果のpromiseを利用側へ共有し、登録失敗と「active worker＋exact cache」の不足を明示的にfail closedにする。
- `navigator.serviceWorker.ready`はfirst installが失敗してもrejectしない。明示準備では返されたregistration自身のworker stateを監視し、`redundant`とbounded timeoutを操作可能なエラーへ変換してボタンを必ず復帰させる。
- 同じversion付きchunkでも、明示`fetch`とES module importではrequest modeが異なり、hostの`Vary: Origin`によってCache Storage照合が外れ得る。同一originのexact URLに限定して準備側とService Worker側の`ignoreVary`条件を一致させ、オンライン成功をoffline-readyへ誤認しない。

## 2026-08-28: interaction surface不在とCaption作成不能を恒久的に同一視しない

- ProxyなしGSではsurface hitを推測せず無効にする一方、後続UXとしてGS AssetFrame原点へ明示作成し、ギズモで最終`positionAsset`を決める経路は両立できる。現在sliceの固定degradationを無断変更せず、Product Ownerが示した正式版の改善としてbacklogへ分離する。

## 2026-08-29: custom package拡張子をmobile file pickerのaccept filterへ依存させない

- iOS Filesは未登録のcustom extensionを未知UTIとして扱い、HTML file inputへ拡張子/MIMEの`accept` filterがあると正しいfileまで一覧から隠すことがある。
- 選択後にcontainer version、entry path、size、hashを厳格検証するpackageでは、picker filterを安全境界にしない。mobile互換を優先して全fileを選択可能にし、不正fileはauthoritative parserで明示拒否する。

## 2026-08-29: 低リスクの実機再確認は明示的なPO判断でまとめられる

- Desktop実測、既存の同系統iPhone実績、自動acceptanceが揃い、残る差分がplatform非依存でデータを破壊しない場合、Product Ownerは個別sliceの実機再確認を後日の統合回帰runへ送れる。自動的には省略せず、残るmobile固有riskと後日確認項目を平易に示して明示判断を得る。
- この判断は「iPhone PASS」の捏造ではない。未実施を記録し、current sliceをblockしないというrisk acceptance、過去の実機evidence、release/device gateの新規creditを分離する。
- 実機runを延期した時点で一時公開tunnelを停止し、後日のrunでは同じ最小項目だけをまとめて確認する。延期を理由に追加fixture、instrumentationやmicro-hardeningを作らない。

## 2026-08-30: consolidated acceptanceでは内部状態と見える証拠を同期する

- format parserとround-trip用の1/8-splat fixtureは、rendererがユーザーに判別できる像を出したという視覚oracleではない。Product Ownerへvisual acceptanceを依頼する前に、fixtureが肉眼で判定可能かを確認し、必要なら既存の代表データを使う。fixture matrixを増やす理由にはしない。
- select要素が「現在編集対象」を示すUIでは、表示値とviewer内部のgizmo targetを同時に更新する。Caption選択等が内部targetをclearする場合、位置調整を開始・復帰する境界で明示的に再接続し、見た目だけ選択済みのfalse greenを作らない。
- Asset visibility件数はresource ready件数ではない。表示チェック、decoder/runtime readiness、描画結果とinteraction targetを別々に観測し、`4/4表示中`のようなmetadataだけからrenderer成功を推定しない。

## 2026-08-30: format判定をユーザー入力UIの分裂へ持ち込まない

- production UIではMesh/GS/Pointごとにfile pickerを選ばせず、一つの「モデルを追加」操作からcontentを検査して対応経路を決める。拡張子だけを権威にせず、未対応・曖昧な内容は明示拒否する。
- add、replace、delete、placementは内部serviceが別でもユーザーにとって同じモデル管理作業である。最終UI closureでは一つの分かりやすい管理領域へまとめ、technical sliceのsection構造をそのまま製品導線へ固定しない。
- consolidated acceptance中に得たこの種の操作性修正はP2として記録し、P0/P1の成立確認を終える前に別UI sliceへ展開しない。

## 2026-08-30: 低懸念の物理iPhone smokeをsliceごとに反復しない

- 既存iPhone経路と同じrenderer、storage、input方式を再利用し、差分が小さくDesktop・自動acceptance・独立reviewで拘束されている場合、各sliceで同じ人力smokeを要求するとcritical-path速度を大きく落とす。
- Product Ownerが明示的に延期した低懸念項目は未実施として記録し、mobile-sensitiveな複数sliceを一つの統合回帰runへまとめる。延期を個別iPhone PASS、release/device gate evidence、または恒久的な試験免除として扱わない。
- 物理端末を即時blockerにするのは、新しいmobile API、storage方式、renderer/input方式、大容量memory境界、またはDesktop evidenceで代替できないP0/P1 riskがある場合に絞る。既知経路の小さなUI wiringはまとめて確認する。

## 2026-08-30: release計測よりユーザー機能の完成を先にする

- Product Ownerがユーザー機能完成を優先した段階では、G0/E5の計測器、trace kit、evidence収集UIを次のproduction workstreamへ繰り上げない。これらはrelease前laneへ戻し、通常利用者が作成・編集・保存・交換するために不足する機能を先に閉じる。
- gate/evidence toolingがcritical path上に存在しても、それだけでuser-visible product workを中断しない。割り込ませるのは、未解決P0/P1がデータ損失・重大security・重大互換性を生む場合、または後続機能の実装を直接危険にする場合に限る。
- 次sliceは小さい件数を消せることではなく、Product Contract上の未成立なuser outcomeを最も大きく閉じるものから選ぶ。計測の延期をrelease PASSやevidence免除とは扱わず、最終候補treeの実機・gate laneとして明示的に残す。

## 2026-08-30: 技術acceptance用controlを本番のCaption導線へ昇格させない

- Caption target、Caption選択、新規作成、初期配置、位置調整、snapshot保存を別々のtechnical controlとして並べただけでは、各機能が動いても一般利用者には操作順が分からない。本番UXの成立を機能PASSから推定しない。
- Caption authoringの本番導線を閉じるときは、LociMyuの実際の操作を参照し、「Captionを選ぶ／追加する→モデル上へ置く→その場で内容と位置を編集する」というユーザー作業を中心に一本化する。内部のAsset／Proxy／snapshot手順をユーザーに組み立てさせない。
- 現在のnative画面はproduction wiringを検証するtechnical UIとして扱い、最終UIとしてordinary化しない。全体UI/UX closureまで、技術acceptanceと操作性acceptanceを別々に記録する。
## 2026-08-31: scope mechanisms must remain Product Owner choices

- Do not promote a proposed audit/review storage mechanism into product scope
  merely because later specifications reference it. When a separately retained
  source plus bounded exportable report satisfies the approved user outcome,
  keep sidecars, quarantine databases and portable review workflows out unless
  the Product Owner separately approves them.

## 2026-08-31: 変換済みfieldはuser-visibleな消費まで確認する

- schema、converter、snapshot/package round-tripが値を保持していても、rendererと編集UIがその値を使用しなければ製品上の互換性は成立していない。LociMyu受入ではCaption色のような見える意味を、source→native record→render→edit→save/reopenまで一続きで確認する。
- 3D authoring tool間の単位差を調整する倍率UIへ、1付近だけの狭い線形rangeを置かない。桁違いの値は数値入力と対数的なsliderを併用し、複数Assetでは既存のper-Asset意味を優先する。
- selection色や要再配置警告のために、ユーザーが選んだCaption色を固定色で上書きしない。選択状態はscale、発光、輪郭等の別の視覚channelで示す。

## 2026-08-31: legacy adapterの前にreceiver completenessを閉じる

- 代表ZIPが変換・保存できたことだけでlegacy受入完了としない。sourceのuser-visibleな保存項目を一度inventoryし、native側のrecord、renderer/editor、save/reopen、portable backupまで対応先があるかを表で確認する。
- receiverがない項目は、承認済みユーザー機能ならconverterのreport-only処理を既成事実にせず先に最小receiverを作る。timestamp等の非表示metadataや未承認機能は、理由を明記してsource/report保持のままbacklogへ送る。
- receiver auditを口実に一般化されたmedia、history、appearance、migration frameworkへ拡張しない。現存するLociMyu意味と最小native製品能力の交差だけをproduction scopeへ入れる。

## 2026-09-01: Caption overlayは内容が読める面積と一時調整を受入時に確認する

- データが表示されたことだけでCaption overlayの閲覧UXを完了扱いにしない。画像が固定小サイズで余白だけ残る場合は、元bytesやaspect ratioを変えず、利用可能なcard幅へresponsiveに拡縮する。
- 3D上のピンへ自動追従するcardでも、モデルや視点によって内容を隠し得る。Product Ownerが求めた場合はheader dragによる表示中だけの位置調整を優先し、Project schemaやSaved Viewへ永続位置を追加しない。
- 自動配置、手動の一時位置、durable project stateを区別する。小さな閲覧改善からdrag framework、複数window、永続layoutへscopeを広げない。

## 2026-09-01: 見えるCaptionピンと実際の選択領域を一致させる

- 小さな3DピンへMesh形状の厳密raycastだけを使うと、画面では見えていても少し外しただけで空画面クリックとして選択解除される。CaptionピンにはboundedなCSS-pixel選択許容を持たせ、モデル単位やカメラ距離で操作性を崩さない。
- overlayの画面内判定はピン中心だけで即座に切らず、ピンが一部見える範囲の小さな余白を許容してcard本体をstage内へclampする。完全に画面外のCaptionを表示する挙動へは広げない。

## 2026-09-01: PWA acceptanceではserver生存と表示buildを分けて確認する

- ローカルpreviewが停止していてもService Workerの旧cacheだけで画面が開くため、「URLが表示できた」ことを現在treeの証拠にしない。手動確認を依頼する直前にserverのHTTP応答と配信assetを確認する。
- prompt更新型Service Workerではhard reloadだけで待機中workerが必ず有効になるとは限らない。旧UIが見える場合は、serverを先に復旧し、全controlled tabを閉じて再openするか、承認済みの更新導線でworkerを切り替えてからvisual regressionを判定する。

## 2026-09-01: converter修正のacceptanceでは既存Projectを再利用しない

- import時だけ適用される変換修正は、既存Native Projectを後から書き換えない。修正後の確認で旧Projectを開くと、変換値の欠落がruntime不具合に見えるため、fresh originと一意なProject名で新規変換した結果を確認する。
- query stringや同名Projectだけでは、Service Worker cache・OPFS・変換世代を区別できない。source→confirmation→draft→generation-1 snapshot→表示値のprovenanceを明示し、既存Projectに対する手作業の再保存を回避策にしない。

## 2026-09-02: local previewのbase pathを配信URLと一致させる

- `/LociView/`用buildをroot mountの`vite preview`で配ると、HTMLはfallbackで200でも`/LociView/assets/*`へHTMLが返り、画面は真っ白になる。ページのHTTP 200だけで起動確認を終えず、entry JavaScriptのstatus、Content-Type、byte数まで確認する。
- local acceptanceはroot base + root URL、GitHub Pages確認は`BASE_PATH=/LociView/` +対応するmountとして分離する。queryやService Worker操作でbase不一致を回避しない。

## 2026-09-02: 保存済みrecordと製品上の切替pointerを一続きで確認する

- Saved View recordへ正しい`displaySetId`を保存しただけでは、シート切替時の視点復元は成立しない。authoring操作がそのDisplaySetの`defaultSavedViewId`まで更新し、切替側が同じpointerを消費するところまで確認する。
- converter由来のdefault linkageだけで受入を終えず、ユーザーが各シートで新しい視点を保存し、別シートへ切り替えて戻ったときにcamera/backgroundが変わるproduct flowをfocused acceptanceに含める。

## 2026-09-02: source byte健全性とruntime texture健全性を分ける

- GLBのsize/hash/read-back一致だけでは、埋め込み画像がbrowserでdecode・GPU確保できたことにならない。`GLTFLoader: Couldn't load texture blob:`はpath欠落ではなく、埋め込みbufferViewの実行時読込失敗として扱う。
- Three.jsの`Material.dispose()`は参照Textureを解放しない。モデルclose/reopenや変換時inspectionでは、共有Textureを重複なく列挙してgeometry/materialと一緒に解放する必要がある。
- 8K textureを複数含むモデルはmipmapと複数tabで資源使用量が急増する。原本破損や変換lossと決めつけずfresh single-tabで再現確認し、source bytesの再圧縮・軽量化へ勝手に広げない。
- Asset visibilityの件数をrenderer readinessとして表示しない。物理iPhoneでgridが一瞬描画された後canvas全体が消える場合は、cameraや保存状態ではなくWebGL context/resource failureを第一に扱い、成功文言でactivation errorを上書きしない。

## 2026-09-03: Product Owner向け選択肢はユーザー機能から説明する

- `legacy v1編集／merge`のような内部構造の短縮語だけでは、どの画面・操作が残るか判断できない。最初に「旧形式のプロジェクト」と「Nativeプロジェクト」を区別し、新規作成、編集、共同作業、閲覧、変換のどれが変わるかを平易に示す。
- 同じ「merge」でもlegacy ZIP mergeとNative Package ExchangeのCaption／画像mergeは別機能である。選択肢では、なくなる機能と残る機能をそれぞれ明記し、片方を止める判断がもう片方まで止めるように読めないようにする。
- A/Bのラベルやgate番号は説明の後に置く。完成速度や安全性だけでなく、利用者が実際にできること／できなくなることを先に比較してからProduct Owner判断を求める。

## 2026-09-03: 保存前のworking stateまで視覚acceptanceする

- Caption追加のacceptanceは保存・再open後だけで終えず、配置した直後にピン、選択、overlayがworking stateから表示されることを確認する。保存後だけ正常になる状態は、作業中snapshotとViewer snapshotの同期漏れとして扱う。
- DisplaySetのような表示filterに使う所属情報をUI callbackだけで補正しない。Viewerが未保存recordを先に保持する場合も、同じ正規化済み値を作成時点から共有し、durable snapshotの再投入を表示更新の代用にしない。

## 2026-09-03: stale wrapper待ちとlocal upstream buildを同じ判断にしない

- security修正版を含まない既存wrapperを却下しても、更新wrapperを無期限に待つことを自動的な結論にしない。Product Ownerがexact upstreamとbounded local buildを承認した場合は、公開wrapperの名前ではなくsource tag、toolchain、build recipe、bridge、Worker lifecycleと生成物digestを固定して再現可能性を作る。
- technical decode成立、LGPL配布要件、HEVC patent判断を別々のgateにする。PoCが動いたことをlicense採用やpublic distribution承認へ読み替えず、対応source/relink資料とbuilt-output notice候補まで準備してProduct Ownerへ返す。
- browser-native media supportはDesktop結果からiPhoneへ一般化しない。物理端末でnative経路をWASM build前に一度だけ測り、成功時はnative-first、失敗時だけfallback対象にする。native smokeと最終production acceptanceも分離する。
- 後続の法務判断でdecoder同梱が止まった場合、技術PoCを削除したりproductionへ隠しfallbackしたりせず、生成物をpublic build／Pages／Service Workerからpost-build CIで隔離する。native／OS codecのcapability照会と実decodeを分け、未確認端末を成功扱いしない。

## 2026-09-03: exact dependency approvalもbuild直前に再検証する

- Product Ownerがexact versionを批准しても、untrusted-input parser／decoderはdownloadやbuildの直前にupstream releaseとsecurity advisoryを再確認する。批准直後に修正版が公開された場合、古いpinを惰性でbuildせず、影響、互換性、exact replacementを示して最小の再承認を得る。
- security releaseがABI/API-compatibleなfull replacementなら、個別patchの寄せ集めやprivate forkを優先しない。拒否版、replacement tag/commit/archive digestと承認時点を記録し、technical buildとdistribution/license判断は引き続き分離する。

## 2026-09-03: media smokeは失敗fixtureとresource authorityを分離する

- 元fileを一定割合で切っただけでは、先頭側にprimary imageのdecodeに必要なbytesが残り、malformed inputにならない場合がある。truncated拒否のsmokeは、container構造を保ちながらprimary payloadを欠落させる等、失敗理由を構造的に固定する。
- `URL.revokeObjectURL()`後もdecode済み`HTMLImageElement`が表示できることは、Blob URL registryの解放失敗を意味しない。解放確認は新しいconsumerから同じURLを再取得できないことを確認し、既にdecode済みの画像cacheやDOM参照の寿命とは分けて記録する。
- local smokeの一時serverは結果取得後すぐ停止し、port listenerが消えたことまで確認する。端末内の一時IndexedDB copy、Blob URL、repositoryへのsource混入も別々のauthorityとして扱う。

## 2026-09-04: 必要なmedia形式と初回candidateの直接decodeを分ける

- 製品として将来必要なHEIC／動画／音声を、初回candidateでdecoderを同梱できるかという配布判断と混同しない。直接HEICを延期しても要件から削除せず、隔離PoCをproduction fallbackへ読み替えない。
- 端末側で別JPEGへ変換する互換フローでは、Native Projectが保持するのは追加したJPEGだけである。LociViewが元HEICも保存する、または別JPEGを元のfile-IDへ自動再関連付けすると誤解させず、元写真／元ZIPの別保管と変換後Captionへの手動添付を明記する。
- 拡張子や`File.type`だけで形式を信用すると、HEIC bytesをJPEGとして永続化できる。直接追加、legacy変換、restore／merge等のpublication境界で同じbyte-derived admissionを使い、拒否はsnapshot／marker公開前にfail closedとする。

## 2026-09-07: 安全なmergeだけでチーム運用の成立を判定しない

- 「競合時にzero-write」「同じlineageだけを統合」は重要な安全性だが、準備、初回配布、
  複数人の反復作業、モデル更新、再統合、review共有、backup復旧まで完走できる証拠ではない。
  team適合性は一つのfile操作ではなく、この全lifecycleで評価する。
- 一人の詳しい利用者が用意したProjectを配ることで初回参加を容易にできても、モデル差替えや
  新しい基準を各branchへ伝播できず既存Caption作業を回収できないなら、継続的なteam運用は
  未成立とする。初回onboardingと反復collaborationを分けて報告する。
- self-contained packageと小さな変更packageは別の目的を持つ。bounded-memory streamingは
  転送量削減ではない。大きなGSを毎回同梱する設計を「streaming済み」だけで適切としない。
- 固定baselineから外れる編集を通常UIで許し、書き出し時に初めて拒否するのは、dataを壊さなくても
  利用者の作業を行き止まりにする。merge対象とUI上の編集可能範囲を一致させるか、変更がteam
  lineageへ与える結果を実行前に示す。
- UI copyでarchitecture gapを覆わない。共同編集という語は、因果的な反復、model revision、
  conflict回復、provenance、payload範囲のどこまでが実装済みかを正確に限定して使う。
