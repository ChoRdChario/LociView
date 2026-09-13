# Fresh-session handoff — public-candidate preparation

> **Current unit — `bf1c0e0`後の初回Workspace読込:** 元履歴を再作成せず、独立した
> 初回import journalでGLB/PNGと一緒に導入。同じ一覧の「作業一式を開く」へ接続し、
> identityが既存なら更新受信、別系統／作成途中／欠落証拠は上書きしない。
> sourceなしのcold再選択、開始Scene確認との相互guard、取りやめ後の一覧復帰を接続。
> 独立24-file reviewの必須残件なし。関連182件PASS、型・通常／harness build exit 0。
> default rootは7件失敗。条件を変えずworker数のみ2にした全件再検査は112 files／
> 2,172 PASS／既存21 TODO／失敗0（263.08秒）。初回失敗の記録はtodoに保持。
> 最終source/testsは不変更。local checkpointの実commitはGit HEAD／logで確認する。
> 全62群、通常home、他purpose／移行、実browser・iPhone・offline受入れは未完了。
> 次は同じ元履歴／交換基準を使うContribution。新しい確認待ち／別PoCは不要。

> **Previous checkpoint — `604058c`後のWorkspace出力接続:** 実commitはGit HEAD／logで確認する。
> 同じ限定hostへ元履歴・保護対象本体・実交換基準表を固定したWorkspace書出しを実装。
> stream生成→読み戻し検証→generated基準→明示download／選び直したfile確認を接続済み。
> imported/generated共通表、cold復旧、後の編集保持、欠落ack証拠の拒否を既存testsで検査。
> 独立source review必須残件なし、型exit 0。最終root：112 files／2,157 PASS／既存21 TODO、
> 失敗0（435.55秒）。通常・harness build exit 0。local checkpointはtodo先頭を参照。
> downloadだけを保存確認にしない。初回Project importはその後。新しい人手確認待ちはない。

> **2026-09-13 更新fileと未確定入力復旧（`f3df569`後）:** 限定GLB/PNG hostに受信欄を接続。
> 元file全体が一致する再選択だけで未確定spoolを再コピー。原本不明時は明示的な取りやめで終端化し、
> 断片は消さず容量に算入。start／journal／stepsが存在すればこの経路を拒否する。
> cold復旧UIはScene editor作成前にも表示、warmは同じSession／表示状態を保持して更新。
> 連続表示失敗／cold View→Editの独立review指摘を修正し、関連116件PASS（110.22秒）、型exit 0。
> 最終root：112 files／2,149 PASS／既存21 TODO／失敗0（688.16秒）。通常・harness build exit 0。
> 独立19-file exact-index reviewの必須残件なし。最終検査後は結果文書のみ更新。
> 実browser／picker／iPhone／offlineは未受入れ。機能群数は不変更。
> 次は同じfile導線のWorkspace生成・外部受渡しと初回import、実file二巡と残る競合UIを閉じる。
> 追加のPO待ち／別PoCは不要。通常home・未採用wire・releaseへは進まない。

> **2026-09-13 実Workspace受信service（`068dd44`後）:** actual ZIP→元GLB/PNG
> 受入れ→Sessionの一度だけの公開→imported baseを接続。同じfileはjobを再利用し重複しない。
> 関連111件PASS／93.18秒。最終rootは112 files／2,144 PASS／既存21 TODO／失敗0（660.42秒）。
> 型／build exit 0、独立exact-index reviewも13ファイル内の必須残件なし。最終source/testsは不変更。
> cold復旧の証拠はstart.json確定後のみ。確定前spoolは保持／repair-requiredで、新受信を拒否する。
> 次はこの未ack入力の明示復旧と既存hostのfile操作を一緒に閉じる。初回Project import／他purpose／
> 通常home／実browser・iPhone・offline／採用は未完了。新たなPO待ちや別PoCは不要。

> **2026-09-13 Workspace受信の原本／本体境界（`bd06a20`後）:**
> 新fullMetadata journalが元manifest／checksum／metadataを結合し、旧sealは維持。
> 元変更の途中適用から既存Sessionでcold復旧し、欠落原本は補充しない。
> GLB/PNG受入れplanは元IDを保ち、元履歴から累積を検査、旧本体・旧factsの欠損を隠さない。
> 新規本体の判定はCASのunverified（receiptなし）。missingは既存本体消失なので拒否。
> 最終rootは112 files／2,135 PASS／既存21 TODO／失敗0（458.95秒）、型／build exit 0。
> 独立code／exact-index reviewとも必須残件なし。14ファイルのlocal checkpointへ進む。
> 次はこれらをdurable receive job＋原本入力保持＋imported base＋限定hostの実file操作へ
> 接続する。受信全体・通常home・browser／iPhone／offlineは未完了。新たなPO待ちはない。

> **2026-09-13 F01実ZIP接続（`5211a4a`後）:** 確定したsourceを
> 固定STORE ZIPへstream生成し、raw header／CRC／SHA／元履歴・summary・closureを読み戻し検査。
> 元ProjectのFS／metadata／lease不変更。sink失敗・body破損・中止は完了を返さない。
> 独立reviewのread取消・CRC-only assertion・大chunkの内部コピー問題を修正。
> 関連82件PASS、最終型／build exit 0。root 112 files／2,123 PASS／21既存TODO／失敗0、547.07秒。
> 独立再review／14-file index reviewの必須残件なし。最終run後のsource/testsは不変更。
> 初期の全体runはレビュー修正のため中止し、合格と数えていない。既知警告はtodo参照。
> これはprofile／CAS受入れ、通常UI、外部ファイル保存の証拠ではない。
> 次は既存Projectへの実Workspace受信＋新GLB/PNG、receive job／base handoffを一続きにする。
> 初回取込は2 originals固定journalの別接続として残る。F01/F02は未完了、詳細はtodo。

> **2026-09-13 F01 source capture（`6483318`後）:** 元scalar履歴からsummaryを生成し、
> 全live候補の強参照本体を重複排除・stream検証した出力元を確定する部品を実装。
> 独立reviewで診断用CAS readのwriteを発見し、専用read-only検証へ修正。
> 関連93件、最終型・build PASS。root 112 files／2,116 PASS／21既存TODO／失敗0（426.06秒）。
> 独立source／受入れreviewの必須残件なし。最終検査後のsource/testsは不変更。
> 未知履歴のinventory未証明・分類不能旧値はgenerator制限。元source受入れは不変更。
> ZIP／durable job・receipt／ファイル生成・受信／通常homeは未完了。次はF01を接続する。

> **2026-09-13 F01/F02初回部品（`f4388fc`後）:** `src/projectPackage`に
> 5用途のcanonical manifest／summary構文／導出entryと予算の純粋検査を追加。
> raw JSONの深さ・件数はopt-inで検査、旧v1 callerの文法は不変更。全17 focused PASS。
> 初回全体の隔離allowlist失敗を限定修正。関連29件、最終型・build PASS。
> 最終root 112 files／2,105 PASS／21既存TODO／失敗0、448.46秒、最終index独立review指摘なし。
> その後source/tests不変更。実ZIP／内容由来summary／source・closure検証、
> Workspace生成・受信接続はまだない。通常home・保存・schema・dependencyは不変更。
> 次は実元履歴と必要本体からWorkspaceを構築する境界。部品をfile配布の完成と数えない。

> **2026-09-13 最新PO判断（`c2a00f3`後）:** 06 §12.6の編集copy方針は承認。
> ただし「要確認」は状態であり、根拠のある位置のピンは表示・選択できること。
> 元のピン色を維持し別の印で状態を示す。表示だけでは解除しない。位置不明／競合は推測しない。
> 05 §2.3／06 §12.6へ記録。viewportと窓の線を接続済み。別印・元色・非表示時の状態保持、
> exact表示receiptで古い線／pin位置を拒否。関連39件PASS、型／通常・harness build exit 0。
> 独立code reviewの必須残件なし、full root 111 files／2,088 PASS／21 TODO／失敗0、452.07秒。
> 実browser／iPhoneは既存一括確認に残す。exact snapshot／再構築／golden表も統合し、
> 契約review／再reviewの必須残件なし。次はF01/F02の5-purpose validatorとWorkspace受け渡し。
> この判断の再承認は不要。旧判断待ちは履歴。wire全体・通常活性化・releaseの承認ではない。
> 棚卸し数は不変更。新schema／package writer／通常活性化の実装証拠ではない。

> **2026-09-13 C11親変更の接続（`5f390a7`後）:** PO承認済みの「親モデルを変更」を実装。
> Asset A→B／既存ProjectAnchor→Asset、計算できる3D位置は保持、不能時だけ明示配置。
> 同じCaption ID・本文／media／Scene所属を残し、共有Scene影響を確定前に提示。
> 既存位置調整の隣で変更先を選択→仮位置→確定／取消。専用reparentPinから同じjournalへ。
> 新metadata／限定GLB hostで接続、旧固定owner hostは非対応。通常movePinの親変更拒否は維持。
> 元bytes retry／cold／全anchor競合、実GLB接続は既存検査を使用。
> 最終typecheck／通常build exit 0、root 111 files／2,087 PASS／21 TODO／失敗0（469.27秒）。
> 独立review指摘の候補表示更新・型依存を修正、再reviewの必須残件なし。詳細はtodo。
> 棚卸し33/4/18/9（64）。実描画・native input・iPhone・offlineは未受入れ。
> 真正な未配置union・06 review mapping・通常home・releaseの批准ではない。

> **2026-09-13 PO回答（`1edc3f5`後）:** ①隔離検証で実装→証拠／受入れ後に
> 通常入口を有効化する順序は承認済み。05 §7.5／06 §11へ反映。再承認を求めない。
> 当時②は「対応モデルなしグループ」案を検討中。一覧上の分類と個別位置／所有の保持を
> 区別し、全pinを共通モデルへ付け替えない。mapping変更／UI実装は未批准。
> この文書更新はruntime不変更。現在の判断は先頭の最新PO判断を参照。

> **2026-09-13 C04追加色（`ca469ff`後）:** 同じピン操作欄で次回色を選び、
> 通常／Shift／数値追加の開始時に固定。Caption・Scene所属・色を1変更で記録。
> 絞り込み／既存色編集と独立、Scene別の次回色と確定済みのピン色を分離。
> 取消・移動・readonly・遅延入力・exact retry／cold GLB再開を既存testsで確認。
> 独立review指摘の同一Scene・tokenのみ更新も補完。最終型／通常build exit 0。
> root 111 files／2,079 PASS／21既存TODO／失敗0、380.65秒、JSON success。
> 最終19-file差分独立reviewは必須残件なし。実行source／testsは検査後不変更。
> 棚卸し32/4/18/10（64）、実browser／native picker／iPhone／offlineは未受入れ。
> 次はF01/F02の実file配布・返送へ戻る。06 §11／§12.6の既出2判断は未批准。
> 承認後の最初の実装は既存経路でWorkspace書出し→読込み→同系統再受信。
> 小UI・新資料／PoC・同じbrowser／push再試行を、この境界の代替にしない。

> **2026-09-13 C09 windowサイズ（`b319cab`後）:** 両host共通の窓へ右下drag／
> 矢印／非drag選択を接続。左上・別の窓・選択・本文／画像node・scroll・元履歴を保持。
> Scene別localサイズで、狭幅時は表示だけclamp。Viewでも使え、gesture中のEdit切替は拒否。
> Esc／cancel／capture loss／stale／extent変化／disposeは未確定サイズを破棄。
> 独立reviewで見つけたrelease時の再入extent変化と、通常選択・非初期サイズ帰還の証拠を補完。
> 最終型・通常build exit 0。root 111 files／2,076 PASS／21既存TODO／失敗0、442.18秒、JSON success。
> 実行sourceは最終検査後不変更。実browser／native入力／短画面／iPhone／offlineは未受入れ。
> 手動手順はScene作成後に往復する順へ修正。棚卸し31/4/19/10、完成率ではない。
> 11-file最終index独立reviewは指摘なし、local checkpoint可能。既知browser／push失敗は再試行していない。
> 次候補C04は追加色を既存addPinの1変更へ渡す限定接続。実用file-teamと06の既出2判断は未完了。

> **2026-09-13 P07 local View/Edit（`801e7af`後）:** 限定GLB/PNG一覧に
> 「閲覧で開く／編集で開く」、同じ画面に「編集を開始する／閲覧に切り替える」を接続。
> Viewはlock不要・全write拒否。Editはlockとdurable再読込を確認後だけ開始する。
> 同じSession／viewportを保持し、非開始Scene・カメラ・窓・検索・draftを移し替えない。
> 別writer／読込／表示失敗なら旧Viewを残し、候補leaseを解放。中断を後から観測した
> Viewも復旧専用Editへ進めるが、未完了Editからの切替は不可。独立指摘は修正済み。
> 最終型・build exit 0。root 111 files／2,073 PASS／21既存TODO／失敗0、exit 0／JSON success。
> 最終index独立レビュー後の手動準備不足も補完。実browser／iPhone／offlineは未受入れ。
> P07のmetadata host・review編集copyは残るため分類数は30/4/20/10のまま。
> 次候補は承認済みC09のwindow resize。file-teamの本筋と既出06の2判断を置換しない。

> **2026-09-13 Caption削除競合の復旧（`06e2eda`後）:** 同じmetadata要確認欄で
> 「削除状態を維持／キャプションを復元」を明示選択。単一deleted候補＋同時編集も対象。
> 親だけにfresh eventを追加し、元本文／位置候補、子tombstone、後着／曖昧edgeを保持。
> 未配置の復元後は「キャプションの追加・除外」へ案内。自動の子復元や関係推測はしない。
> 同一画面／coldのexact retry、返送・再受信、IME／readonly／stale／入力保持を既存testsで検証。
> 最初のrootは既存membership逆順受信の5秒timeoutが1件。該当2ケースは単独PASS。
> code／assertion／timeout不変更で1並列へ。最終root exit 0、111 files／2,069 PASS／
> 21既存TODO／失敗0（501.45秒）。型・buildもexit 0。独立source/testレビュー必須残件なし。
> T03全体・実画面／iPhone／offline・外部ファイルでのチーム運用は未完了。詳細はtodo。
> 次はP07 local View/Edit。既存openViewのlock-free閲覧を限定validation一覧／画面へ接続し、
> 編集はlock取得とdurable再読込後だけ開始する。通常home・wire・review変換・外部保存は非対象。
> 06の既出2判断は未回答。既知browser／push失敗は条件が変わらない限り再試行しない。

> **2026-09-13 View競合の接続（`95ee28b`後）:** 名称／順序／camera／backgroundと
> Scene開始Viewの全候補選択を同じmetadata画面・original journalへ接続。
> 名前は手入力も可。不在／同値候補を含めて1因果変更で解消し、warm recallはしない。
> 同名ViewをScene＋番号で識別。手元入力・元履歴・他fieldの競合を保持し、解消後の
> 通常rename／recapture／reorder／entry／recall、返送・再受信・後着再競合・cold retryを検証。
> 独立レビューの対象識別／限定import表を修正。最初の全体2件は新テストの5秒timeout。
> 二巡4ケースだけを既存同種の15秒枠へ揃え、assertion・global既定・製品期限は不変更。
> 最終型・build exit 0、root exit 0／JSON success、111 files／2,062 PASS／21既存TODO／失敗0。
> 実行codeは以降不変更、詳細はtodo。T03・実画面／iPhone／offline・全fileチーム受入れは未完了。
> 次は05 §3.4/§8のCaption本体の削除対編集／復元競合を同じ要確認欄へ限定接続。
> 子tombstoneや後着edgeを勝手に変更せず、fresh lifecycle eventで明示解消する。
> 06の既出2判断は未回答。wire／home／releaseに進まず、browser／pushの同一失敗を再試行しない。

> **2026-09-13 Scene名競合の接続（`50f0872`後）:** 二人が同じScene名を変更した後、
> 全候補から選ぶ／名前を入力する操作を既存metadata画面とjournalへ接続。
> 通常renameの競合拒否を維持し、確定後に再編集可能。元履歴・手元入力・Sceneを保持。
> 等値候補、返送／再受信、IME／stale／readonly、失敗後のexact cold retryを検証。
> 初回の型／fixture／全体2件の不整合を修正。最終型・build exit 0、111 files／2,047 PASS／
> 21既存TODO／失敗0。独立レビュー必須残件なし、詳細はtodo。棚卸し30/4/20/10は不変。
> T03の全競合・実画面／iPhone／offlineは未完了。新wire／schema／通常homeは不変更。
> 06の2判断は未回答のまま。承認済みの実際の行き止まりは進められるが、範囲を広げない。

> **2026-09-13 出力job／完了記録の仕様案（docs-only、実行codeは`2f07ea1`）:**
> 06 §12.7に固定入力・生成／外部file／交換base／auto置換の別記録と中断復旧を具体化。
> zero-change受信へ後のheadを流用せず、stale未観測jobはjournal作成前だけ明示取消可能。
> 完了後の一時ZIPと保持必須の証拠を区別。独立レビューの必須指摘は解消。
> 差分はMarkdownのみ、既存M05検証を再利用。新runtime／実機／offline合格ではない。
> 有限な設計sliceはここで終了。06 §12.6の対応保持と§11の隔離実装／採用gate分離は
> 既に提示したPO回答待ち。承認後の復元／golden契約へ進む前提であり、wire批准はしない。
> 同じ承認・browser修復・pushを繰り返さず、実用チーム版全体は未完了とする。

> **2026-09-13 M05一時表示接続（`7db036c`後）:** モデルタブへ「隠す／表示」
> 「このモデルだけ表示」「すべて表示」を接続。Scene別local stateで、共有所属・履歴・
> Saved Viewは変更しない。読み込み済みモデル／カメラ／本文・windowを保持し、所有pin・
> 接続線・hit・gizmo・比較previewを抑制。ProjectAnchorは独立、Captionからlocal再表示可能。
> readonlyでも利用可。新規モデルは表示、明示re-includeは成功後だけ当該hideを解除、
> cold再開時は一時hideを解除。初回test補助コード不備は修正、対象73 PASS。
> 最終型／buildと111 files・2,040 PASS・21既存TODO・失敗0。独立修正review必須残件なし。
> exact結果とindex確認はtodoを参照。実描画・実機・offlineは既存Desktop一括手順に残す。
> 棚卸し30/4/20/10。小UI接続を連鎖させず、次はF01/F02の有限な契約確認へ戻す。
> 未承認は06 §12.6のreview→編集copy対応保持と§11の隔離実装／採用gate分離。
> 段取り委任やauto方針承認をwire批准にしない。通常home・schema・外部保存は未変更。
> ブラウザ修復・pushの同一再試行はしない。

> **2026-09-13 V04背景操作接続（`c6c166f`後）:** 同じ視点タブへpicker／HEX／標準色／
> 適用／取消を接続。カメラ・軸・Orbit・gizmoを作り直さず、表示色だけ変更する。
> 視点へ残す場合だけ既存commandを使う。readonlyの表示調整と共有編集を区別。
> 適用後の正確な読み戻しまでをrollback境界へ含め、失敗時も旧色と再試行可能な入力を保持。
> 独立レビューのrollback指摘は修正確認済み。最終型／buildと111 files・2,035 PASS・21既存TODO。
> 初回rootのimport境界違反も修正し、最終失敗0。exact結果と制約はtodo先頭を参照。
> 限定GLB/PNGで記録／cold再開／視点呼出しも既存テストへ接続。実描画・実機は未受入れ。
> 棚卸し29/5/20/10。通常home・wire・schema・外部自動保存は未変更。
> 06 §12.6の未回答判断と一括Desktop受入れを残す。ブラウザ修復・pushの同一再試行はしない。
> 次の独立候補はM05一時hide／単独表示。Scene所属・共有履歴を変更する代用品にはしない。

> **2026-09-13 C07添付件数接続（`517f4da`後）:** 既存Caption一覧の常時0を実添付数へ接続。
> 同じ画像も添付ごとに数え、確定削除を除外。不明な参照／順序／利用可否は「メディアを確認」。
> galleryと同じ条件を共用し、画像本体を再読込せず一度の集計で一覧へ渡す。
> metadata／限定GLB/PNGの追加・削除・失敗retry・cold再開を既存testsで確認。
> 最終root 111 files／2,032 PASS／21既存TODO、型・build・独立レビューが通過。
> 初回のtest補助コードの2失敗は修正済み、詳細はtodo。実画面／実機／offlineは未確認。
> UI実測は既存Desktop一括手順へ追加。Codexブラウザは接続前に失敗し、修復依頼は繰り返さない。
> 棚卸し28/6/20/10へ更新。次の独立候補はV04背景操作の既存部品接続。
> 未回答の06 §12.6を承認扱いにしない。通常home・wire・schema・push制約は不変更。

> **2026-09-13 ファイル設計の具体化／新しい判断点（docs-only、codeは`f51f8af`）:**
> 06 §12に14 mapのfield／privacy、保護対象、変更要約、有限guard、ZIP配置を記載。
> 独立レビューで現validationの累積64 MiB制限の説明を訂正。他の必須指摘なし。
> ただし閲覧用切出しには、編集copyに必要なモデルfamilyとpin classの対応が不足。
> §12.6に「含めたモデルの対応を保持し、省いたモデルのpinだけ編集時に要確認」を提案。
> 元位置・所有者を保持し、名前／順番／形状から対応を推測しない。schema変更は未批准。
> 次はこの新しい契約判断をPOへ提示し、承認後に復元／receipt／goldenの具体化を完了する。
> 五用途仕様完成／writer実装承認とはしない。通常の閲覧mode・チーム受信は不変更。
> docs diffを検査し、既存source検証は下記を再利用。新テスト／実機PASSは追加していない。
> 保存頻度の委任・外部auto不可時の代替方針を再質問しない。push制約も変更なし。

> **2026-09-13 最新表示修正／保存点設計:** Sceneのmemory／metadata／限定validation画面で、
> 内部ackをfile「保存済み」とするheader・編集結果・Project一覧・案内を修正。
> 「再開用データのみ」と未確定／更新中／失敗／復旧／閲覧を区別し、draft・元履歴を保持。
> 型・build・対象109 tests、最終root 111 files／2,024 PASS／21既存TODOが合格。
> 初回の並行root失敗と2 worker再検査の条件はtodoに記録。通常home・file出力は未変更。
> Codexブラウザ接続は初期化前に拒否され実描画未確認。DOMを実機／offline合格にしない。
> 06 §11.4に、手動／最新auto=backup、送付=Workspace、生成と外部file反映の別receipt、
> full capture無変更判定、失敗安全置換・明示復元を設計。独立read-onlyレビューに必須指摘なし。
> 保存先実装・wire批准ではない。次は06 §11.3の閉じた表／有限実行guardを揃える。
> 段取り・頻度の委任と代替方針は再質問しない。07物理移行profileは別の互換性判断。
> 下記の「現navigationControls未修正」は履歴であり、この限定経路では解消。

> **2026-09-13 最新auto save精緻化（docs-only）:** Projectごとに最新1枠を安全置換、
> 世代は増やさない。任意saveは名前付きcheckpointにでき、自動では上書きしない。
> 頻度・操作triggerのまとめ方はPO委任済み。快適性と肥大化防止を基準に、変更なしskip・
> 連続編集の集約・重い出力の直列化を設計する。履歴／交換baseの切捨て許可ではない。
> 外部auto書込不可環境は「最新の再開用データ＋手動file保存」でPO承認済み。
> 保存先の違いを明記し、ブラウザ保持やdownload開始をfile保存完了とは表示しない。
> 同じ代替方針を再確認しない。既存hostの虚偽save表示を直す次sliceはtodoに記録。
> 下記の世代数未決は更新済み。00 §2.2／UI guidelines正本、runtime・実機保証は未変更。

> **2026-09-13 最新backup方針（docs-only）:** ゲーム型の任意save／auto save併存を
> 00 §2.2へ記録。autoは任意saveを上書きせず、同じProjectの復旧点。どちらも「保存」は
> 外部ローカルファイルへの反映確認時のみ。ブラウザ保持は別の再開用データのまま。
> 失敗時の旧復旧点を保持し、古い点への復旧も無確認置換しない。間隔／世代数／保存先・
> 権限／rotation／実機可否／一式との構造統合は未策定、runtime・自動削除は未実装。

> **2026-09-13 最新の用途確認（説明のみ）:** POは策定・実装・検証の段取りを委任。
> 手順の委任を再確認し続けない。現在の質問は閲覧modeとScene切出し共有、一式と差分、
> 独立copy、backupの復旧範囲。両受信とも未取得変更を統合し、違いは運ぶ内容と基準依存。
> URL modeはデータ配送や範囲除外ではない。用途削除／hosting追加／wire批准はまだ行わない。
> 以下の「gate分離の承認待ち」はこの手順委任以前。用途・閉じた仕様・独立レビュー・
> 実測／正式採用の条件まで済んだ意味ではなく、今回はruntime変更なし。

> **2026-09-13 PO説明・表示方針更新（docs-only）:** 配布者／参加者／統合担当は行為の
> 呼称で、権限差なしとPO確認済み。Projectの「保存」は利用者のローカルファイルへの
> 反映確認時だけ。ブラウザ内保持は再開用であり「保存済み」としない。実際の再開時は
> 対象Project名と「最後のプロジェクトを再開しました」、常時辿れる別Project導線を用意する。
> 正本は00 §2.1／UI guidelines §9.1。現navigationControlsの表示は未修正、実装・受入れ残。
> 06 §11の技術gate分離／artifact-receipt-base案は未承認のまま。以下のsink承認待ちとは
> 区別する。runtime／ファイル書込経路／通常homeは変更せず、docsのみ更新。

> **2026-09-13 次の判断（docs-only）:** 06 §11に「五用途の閉じた仕様・具体的実行上限・
> 独立レビュー→限定検証実装→実測／golden→正式採用」の段階分離を提案。現05 gateは未変更。
> OPFS読戻し確認後は「生成完了」、ブラウザdownload開始をOS保存完了とはしない。
> 07 §10.2はpinScale／未配置／移行control adapterの実不足を整理。atomic-map-1のまま
> portable managed subtree対応済みとはしない。いずれも未批准、新runtime／新PoCなし。
> POへ求めるのはgate分離と完了sinkの扱い。移行adapter／正式容量保証／通常home／公開は別承認。
> 実行系checkpointは`0b2de6b`、2,021 PASS／21 TODO・型/build合格を不変のまま再利用。

> **2026-09-12 実GLBのhard色抜き接続（`40da7ef`後）:** 同じ限定validation材質欄に
> 「指定した色を透過」を接続。元factor／texture／頂点色の照明前binary判定を共有し、
> CPU候補の三角形だけGPUで可視確認。抜けた面のみ通過し、判定失敗ではpinを置かない。
> source／他slot／保存draftを保持。query資源解放・描画状態復元・scope／retry／cold再開を検査。
> 最終111 files／2,021 PASS／21既存TODO、型・build・独立レビュー済み。HTTP200は確認、
> 実GPU／実入力／iPhone／offlineは未受入れ。texture・UV1・mipmap・頂点色・DPRは一括手順5へ。
> 次はstage 3の06/07技術判断を既存案から一括整理し、未批准の実装直前に放置しない。
> 材質全体・TEAM-FLOW-01の完了ではない。新profile／通常home／公開は未変更。
> 新server／tunnel／private入力なし。ローカルcheckpoint、push制約は未変更。

> **2026-09-12 実GLB材質編集の第一段（`7b43264`後）:** validationの全材質slotを
> exact source locatorで実描画Materialへ接続。照明／表裏／Project・Scene範囲／解除を
> 保存し、元PNG/PBR・他instanceを保持。失敗draft・元change retry・cold再開も確認。
> 最終110 files／2,016 PASS／21既存TODO、型・build・独立レビュー済み。既存5173の
> 入口／変更module HTTP200。実描画・実入力・iPhone・offlineは未受入れ（一括手順5）。
> 次は同じGLB範囲のhard chroma＋pick coverage。材質全体の完了とはしない。新profile／
> 06/07／通常home／公開は別境界。ローカルcheckpoint、push制約は未変更。

> **2026-09-12 開いたProjectへの静的GLB追加（`113ecad`後）:** validationのモデルタブに
> 「3Dモデルを追加」を接続。選択時Sceneへ新Assetとして原子的に登録し、実本体・新facts・
> journal保存後に追加表示を準備。同名／同bytesでも独立。旧モデル・Caption・カメラを保持。
> 新body/facts失敗・exact retry・prepared cold復旧・表示失敗後の重複しない再確認を既存testsへ追加。
> 110 files／2,013 PASS／21既存TODO、型・build・read-only独立レビュー済み。
> 既存5173の入口／新module HTTP200。実描画・実入力・iPhone・offline受入れは未完了。
> 一括Desktop手順4に追加。次は承認済み静的GLBの材質編集への既存経路接続、通常home／
> 他形式profile／06/07／公開は別境界。ローカルcheckpoint、push制約は未変更のため再試行しない。
> 以下の「モデル後入れ未接続」は過去checkpoint。棚卸しM01は他形式を含むため分類数を増やさない。

> **2026-09-12 実GLBの配置編集（`6801ea4`後）:** validation hostで既存の
> 移動／回転／均等拡縮gizmo・数値代替・確定／取消を有効化。更新はfresh manual bindingと
> Asset.statusのみ。元GLB・材質・revision・Caption原座標は保持、warm保存の本体再読込なし。
> old fixture writerは変更せず、typed transformAssetへ接続。元ID／changesでretry／cold復旧。
> 最終110 files／2,007 PASS／21既存TODO、型・build・独立レビュー済み。
> 既存5173入口／変更module HTTP200。実描画・実入力・実機は未受入れ。
> 次は開いたvalidation Projectへの静的GLB追加。新形式／replacement推測／通常home／
> 06/07／公開へは広げない。以下の「実モデル配置未接続」は過去checkpoint。

> **2026-09-12 開いたProjectへのPNG追加（`2a8e773`後）:** 同じvalidation編集画面の
> 「メディアを追加」でPNGを選び、選択Captionへ保存。「登録済みメディア」から再利用も可能。
> 元bytesを保持したquota retry、prepared後のcold復旧、保存後の画像表示失敗からの
> no-op確認を既存service/UIテストへ追加。最終110 files／2,004 PASS／21既存TODO、
> 型・build・独立レビュー済み。既存5173の入口／変更moduleはHTTP200（実行証拠ではない）。
> 実ブラウザ・実機は未確認。I02の他still-image形式と実モデル追加／変形／材質は残る。
> 次は既存モデルgizmoと保存commandの実GLBへの接続。通常home／06/07／公開へは進めない。
> 以下は過去checkpoint。PNG後入れの「未接続」はこの行で更新済み。

> **2026-09-12 実fileの同一host接続（`d7be6c7`後）:** 既存dev入口の「実ファイルで検証」
> から新規GLB/PNG検証Projectの作成・一覧・再開、保存本体の形状／元材質／PNG表示へ接続。
> 記録・ピン・添付保存とcold再開、未完了復旧、IME／切替保護、late-disposeを既存testsで確認。
> 最終110 files／2,000 PASS／21既存TODO、型・build・独立レビュー済み（制限時間はtodo）。
> Browser起動は既知の禁止importで失敗し、実描画・実入力は未確認。
> 既存5173で新入口／module HTTP200。一時5174は停止。公開／通常home／既存Projectは不変更。
> 追加file、実モデルの変形・材質編集・alpha対応pickは未接続。一括手動手順はuiux-handoff。
> 限定有効化は承認済み。再承認待ちや合成PoC追加へ戻さず、残るstage-2接続を進める。

> **2026-09-12 限定実file入口のPO承認:** 静的GLB（外部参照なし・内蔵PNG）＋
> 添付PNG、新規検証Project、既存開発hostでの読込・編集・保存・再開を明示承認。
> 05 §13.2とtodo先頭が現行実装範囲。以下の承認待ちは過去checkpoint。
> 通常home・既存Project・正式採用・06/07・実機HTTPS・公開は変更しない。

> **2026-09-12 実fileサービス接続（`023aa59`から）:** strict GLB/PNG検査、fresh
> Project構築、実保存本体の証拠、初期作成のexact中断復旧を既存metadata serviceへ接続。
> 対象58テスト・型・build・独立レビューを確認。root終了後のfresh cacheは現行110 files
> 全件failed=falseだがterminal集計は欠落しており、合計件数のPASS根拠にはしない（todo）。
> UI／viewport／実browser／実機は未接続・未確認。次は同じ開発hostの実本体表示と
> 新規検証Projectの作成／一覧／再開。承認済みなので再承認待ちへ戻さない。

> **2026-09-12 次の接続を実file検証に固定（`9ce0b83`後・文書のみ）:**
> 05 §13.2とtodo先頭へ、既存開発host・新規検証Project・静的GLB（内蔵PNG）＋
> 添付PNGの限定入口案を集約。まだPO承認待ちで、runtimeは合成データ限定のまま。
> 既存loaderの部分表示や画像decode省略を流用して合格にせず、保存済みモデル・材質・
> 画像で作成→表示→選択／再開を通す。新たなPoCや合成UIの小修正で待ちを埋めない。
> 既存Project／通常home／正式採用／06/07／実機HTTPS／公開の承認は含まない。
> 継続通知をPO判断と扱わない。文書差分確認のみで、実行検証結果は直下のcheckpointを参照。

> **2026-09-12 開始Scene競合の起動復旧（`acd30d5`から）:** 新metadataの再開時、
> 開始Sceneを推測して開かず、同じ画面で全候補を比較・明示確定。保存ack後にworkspaceを生成。
> warm解消では現在Scene・カメラ・入力を保持。readonly／保存失敗／元journal retryも既存host内。
> 最終109 files／1,990 PASS／21既存TODO、型・build・独立レビューPASS。実browser／実機は未実施。
> 棚卸し件数は不変（T03は他field／lifecycle等が残る）。次の本筋は限定実file入口のPO判断。
> 通常home、実形式の採用、06/07、公開・pushの境界を越えていない。

> **2026-09-12 M07モデル回転／均等拡縮（`d242b71`から）:** 実file入口の承認待ち中に、
> 承認済みの既存機能を新metadata hostへ接続。モデル原点を基準にgizmo／度数／正倍率を
> 仮表示し、確定でfresh binding＋statusを同時保存。Caption原座標／本体は保持。
> YZ面handle・Esc原回転のexact復元・閲覧専用移行時のIME/取消を修正し独立再レビュー済み。
> 最終109 files／1,986 PASS／21既存TODO、型・build・独立レビューPASS。詳細はtodo。
> 棚卸し25接続／7部分／22別経路／10新規。実browser初期化は再失敗、実機合格なし。
> 次の本筋は実形式→Project作成／選択／再開。先の限定実file有効化のPO回答は未着。
> 継続通知を承認と扱わず、通常home／正式採用／06/07／HTTPS等の境界を維持する。

> **2026-09-12 stream本体保存（`041ebbf`から）:** 非活性S1のOriginBlobStoreと
> 実保存inventoryをmetadata作成・保存・独立再開へ接続。原本streamを増分検証し、
> 保存後の再検証・origin排他・不変receiptで公開。中断／quota／破損は未公開のまま。
> 既存serviceテストでは保存本体を読み、fixture fallbackなし。Caption保存／復旧は
> model本体を再読込しない。既存dev hostへのこのstoreの接続・実file／実機は未実施。
> 最終109 files／1,982 PASS／21既存TODO、型・build・独立レビューPASS。棚卸しは不変。
> 次は実形式検査→初期Project→保存本体表示。exact結果と承認境界はtodo。
> 新規Projectだけの限定実file検証を一括提案する。通常homeや正式採用はまだ変更しない。
> 以下の過去checkpointの「次」ではなく、todo先頭を現行境界として読む。

> **2026-09-12 モデル全Project削除（`df6255f`から）:** 全Scene所属・Caption anchor・
> material routingの原候補を調べ、参照ゼロを確認したAssetだけ削除状態へ。
> 曖昧な依存を無視せず、本体・原履歴・後着参照を保持。保存失敗中は旧選択を残す。
> remote削除後のmaterial入力は二段階の明示取消まで保持する。
> 最終109 files／1,978 PASS／21既存TODO（2 workers）、型・build・独立レビューPASS。
> 棚卸し24接続／7部分／23別経路／10新規。合成host限定であり完成率ではない。
> 次は実Project作成／再開に必要なstream本体保存と検証済みinventoryを既存S1へ接続。
> 実file／通常home／profile／06/07／実機採用は活性化しない。todoが有限境界を所有する。
> 新ブラウザ・iPhone・offline受入れなし。実用チーム版全体は未完了。

> **2026-09-12 Caption全Project削除（`6e2d9d8`から）:** 同じmetadata hostの編集欄から
> 影響Scene・添付・tag登録を確認し、一つの変更で対象と観測済み全edgeを削除状態へ。
> 共有本体・原履歴・競合候補は保持。保存失敗中は旧UI、後着の削除／編集・参照問題は警告。
> remote削除後も未適用本文を表示し、明示取消できる。独立レビュー指摘は修正済み。
> 最終109 files／1,974 PASS／21既存TODO（2 workers）、型・build・独立レビューPASS。
> 当時の次M09は先頭記録を参照。todoが現在の有限境界を所有する。
> 棚卸し23接続／7部分／24別経路／10新規。件数を完成率・工数へ換算しない。
> 実データ・描画・実機・offline受入れは追加されていない。実用チーム版全体は未完了。

> **2026-09-12 Scene基本管理（`468d9ea`から）:** Captionタブの「シーンを管理」から
> 作成・改名・開始Scene設定を新metadata保存へ接続。作成は元Sceneのモデル所属のみ、
> fresh ID／順序保持。Caption・material・View・defaultはコピーしない。
> 相手からの新Scene受信で既存入力／windowを保持。保存中断の同一ID／bytes復旧も確認。
> 最終root 109 files／1,969 PASS／21既存TODO、型・build・独立レビューPASS。
> 棚卸し22接続／7部分／24別経路／11新規。実データ・描画・実機・offlineの追加受入れなし。
> 当時の次C10は先頭記録を参照。todoが現在の次の有限境界を所有する。
> 06の全5用途批准前にS2を活性化しないことを明記。仕様批准／実データ採用は未実施。

> **2026-09-12 位置・色の競合から再編集へ（`452cdec`から）:** 新metadata hostの同じ比較欄で
> 完全なanchor/color候補を選び、保存後に通常編集・相手への返送を続けられる。
> 位置候補は非確定previewのみ。色の不在を保持し、不在同士も明示した因果変更で解消。
> 独立レビュー指摘を修正済み。最終109 files／1,965 PASS／21既存TODO、型・build PASS。
> 当時の次だったScene基本管理は先頭記録を参照。現在の次はtodoを参照。
> 実ブラウザ・実機・offline・通常home／実データ受入れは増えていない。goal全体未完了。

> **2026-09-12 モデル独立copy（`72a64bd`から）:** 同じmetadata hostの「両方残す」で
> 現在の既知Mesh・配置・materialをfresh IDへ完全remap。元Captionと他Sceneは不変更。
> コピー同士の配置／material編集、二人二巡、exact retry／cold reopenを確認。
> 初期seedの所有者取り違え回帰を修正済み。最終root 109 files／1,961 PASS／21既存TODO、
> typecheck/build・独立レビュー完了。正確な範囲と失敗／修正履歴はtodo先頭。
> 当時の次sliceだったピン位置／色競合は先頭記録を参照。現在はScene基本管理へ進む。
> 実ブラウザ初期化は失敗。実入力・実機・offline・通常home／実データの受入れなし。

> **以前のkeep-one checkpoint（`53d7692`から）:** 新metadataの同じ受信欄で
> 合成「モデルのシーン登録」を受け、どの登録を残すか明示選択して保存できる。
> 他の重複edgeだけ解除し、モデル・Caption・他Sceneは不変更。両選択・retry・再開・
> 再受信・後着edgeの再競合を確認。この時点では独立copyは未接続とUIで明示。
> 次は05 §13.2に記載したfresh root／完全ID remap／新record限定factsの縦断接続。
> 最終matrixはtodo先頭。新たな描画・実機・offline・実データ受入れは追加していない。

> **2026-09-12 モデルstatus競合の解消（`0f28455`から）:** 新metadata hostで各候補の
> モデル・配置を比較し、明示選択した一つを保存できる。Caption・添付・所属は保持。
> 合成モデル更新の受信も同じ欄へ接続。失敗retry・cold replay・後着競合の再発を確認。
> root 109 files / 1,955 PASS / 21既存TODO、typecheck/build・独立レビュー完了。
> T03全体／実ブラウザ／実機／offlineは未完了。次はモデル所属の独立copy。
> 準備済み本体を再利用するが、fresh IDの完全remapと検証根拠を同じ保存経路へ接続する。
> 旧PoCを本番へ昇格しない。通常home・実ファイル・06/07の批准境界は未変更。

> **2026-09-12 prepared-model / pin team loop (from `0afad01`):** 新metadataの
> fresh seedはoriginal／updatedの既知本体・検証根拠を初期公開前に準備する。
> 明示したモデル更新はfresh manual bindingを一度だけ保存し、全Sceneの配置と
> Caption本文・anchor・添付・所属を保持。表面が変わったpinは手動修正まで要確認。
> 二人分の独立保存ポートで二巡、ローカル本文、更新／受信失敗のexact retry、
> cold reopen／no-opを確認。旧seedには補充せず、欠けたtarget factsは書込み前拒否。
> 限定検査80 PASS。最終matrix／reviewはtodo先頭。新wire・通常home・実データは未変更。
> ブラウザ初期化は再び失敗し、描画・実入力・実機・offline受入れを追加していない。
> 次は残るモデル競合／独立copy。専用exchange-base/deltaと実データ採用は別gate。
> 現在の棚卸しは20接続／9部分／24別経路／11新規（64群、完成率ではない）。
> 以前の進捗記録は以下。goal全体未完了、push拒否は回避せずローカル作業継続。

> **2026-09-12 Caption独立copy接続 (`d229c11`から):** 新metadata service/同じ開発画面で
> 重複したCaption登録を比較し、明示的に一つ／独立した両方を残せる。
> 本文・anchor・添付・tag所属の完全候補を使用し、不在の任意fieldも維持。
> 別Sceneの元記録は変更しない。retryは元bytes/IDs、再受信no-op、未観測edgeは再競合。
> 独立レビュー指摘を修正済み。検証結果・次sliceはtodo先頭。モデルcopyは未接続。
> 最終tree: typecheck/build PASS、root 109 files / 1,947 PASS / 21既存TODO。
> 次は準備済み合成revisionの切替→pin修正→二人の往復。旧run再seedや実データ活性化なし。
> pushはPOの明示承認後も環境審査で拒否。回避せず、ローカル実装を継続する。
> 全実用チーム版のgoalは未完了。Browser接続はまだ失敗し、実機合格は追加していない。

> **Current implementation approval (2026-09-12):** PO approved the practical
> team-candidate plan. M13/M14 stay later; 62 groups define this candidate's scope.
> Full-source receive under 02 §8 and Caption title/body explicit resolution are
> implemented in the new synthetic metadata service/host; final verification is
> recorded at the top of todo. Next: independent membership copies and saved
> model-update/team rounds. Exact current
> acceptance is at the top of todo and 05 §13.2. Real-data, wire/migration and
> device/release gates are not waived. Base is `b73315b`; use the commit containing
> this receive/text-resolution checkpoint and the final review in todo. The whole
> practical-team plan is not yet implemented. No new human check is requested now.
> Final reviewed tree: typecheck/build PASS; root 109 files / 1,937 PASS / 21 TODO.
> Browser rendering remains pending; no real-file, iPhone, offline or release claim.

> **Pre-implementation audit (2026-09-12, `b73315b`):** PO requests a complete
> implementation/connection inventory and dependency-led sequencing, not priority
> based on the latest UI complaint. [Inventory](implementation-inventory.md) maps
> 64 work groups and all 41 UI tasks; 19 are connected only within the synthetic
> metadata host. The 45 remaining groups mix small UI connections, other-path
> ports and new behavior; they are not equivalent effort. Recommended next is
> approved full-source receive (02 §8) in the new service, then explicit conflict
> resolution and model-update/team round trips. Contribution wire/real-data
> activation remain gated. This turn is docs-only; no new test or product PASS.
> The new-host Desktop batch remains pending, not a blanket stop on independent
> authorized implementation; do not repeat old journal/saved-host checks.

> **Latest connection (2026-09-12, from `c3a6ec1`):** model translation now uses
> the metadata service: fresh immutable binding plus active status in one original
> change, same-provider current model projection, exact retry and cold reopen.
> Shared gizmo preview/cancel changes resident transforms and Asset-anchored pin
> display only, not original Caption coordinates, memberships or saved model
> payloads. Numeric entry remains available; geometry replacement remains excluded.
> Independent storage/UI reviews have no blocker. Typecheck/build/HTTP graph PASS;
> root tests: 109 files / 1,919 PASS / 21 TODO. Package/lock/public/ordinary entry
> and build configuration are unchanged. Browser setup still fails before
> selection (`node:process`), so actual input/raster/native storage is not accepted.
> Next: PO's consolidated eight-group **new metadata host** Desktop check in
> uiux-handoff; old journal and old saved-mode PASS are not repeated. Server was
> left running at `http://127.0.0.1:5173/`; verify availability before reissuing the
> link. Enter `/dev.html?mode=project-scene`, select `新しい保存方式を試す` and keep
> its resulting URL. No real files, tunnel or PWA/iPhone claim. The next S1/team
> production slice remains open; do not imply full product completion.

> **Preceding connection (2026-09-12, from `b9d99a4`):** the same `storage=metadata`
> host now saves explicit known-PNG registration/attachments, description/order
> edits and confirmed attachment deletion. Existing run seeds and edits remain;
> no fixture image substitutes for missing saved bytes. The journal binds the
> blob delta and retains exact originals for retry/cold recovery. Last-attachment
> deletion keeps the verified media resource/body. Five new host tests and two
> independent reviews cover this bounded connection. Typecheck/build/HTTP graph
> PASS; root two-worker tests: 109 files / 1,915 PASS / 21 TODO, exit 0.
> Next: existing model placement via fresh binding and the same current body,
> not geometry replacement, team wire or another probe. Ordinary home/old saved
> modes and real-file input remain unchanged. Browser/iOS evidence stays batched.

> **Preceding connection (2026-09-11, after `c9c480a`):** the same `storage=metadata`
> host now persists exact Project/Scene material create/appearance-edit/confirmed
> reset using the existing journal/retry. Complete original routing reservations
> refuse duplicate/unresolved targets without a winner. Readonly inspection and
> actual Project identity are connected. The UI authors lighting/sidedness/hard
> chroma; exact sRGB is retained by the source but no base-color input was added.
> Typecheck/focused 40 tests/build/HTTP graph PASS; independent reviews have no
> scoped blocker. Full two-worker root run: 109 files / 1,910 PASS / 21 TODO,
> exit 0; diff-check PASS. No new binary,
> reseeding, schema/dependency, old-mode or ordinary-home change. Next is known
> synthetic media/attachments after specifying their missing inventory/introduction
> boundary; never silently replace existing runs or use fixture-image fallback.
> Browser/physical storage/iOS remains separately pending; no repeat PO batch.

> **Preceding connection (2026-09-11, after `1fe2857`):** the same `storage=metadata`
> host now connects Saved View creation/recapture/name/order/confirmed deletion
> and Scene entry set/clear to its existing journal/retry. View recall is local,
> and entry assignment never recalls immediately. Exact original per-field IDs
> preserve stale/conflict detection; optional entry absence is not a schema change.
> Mounted memory-port create/reopen/readonly/retry tests pass and independent
> reviews have no scoped blocker. Typecheck/build/HTTP graph PASS; full two-worker
> run 109 files / 1,907 PASS / 21 TODO, exit 0. Next is exact Project/Scene material
> override editing/reset with the existing catalogs; current todo owns its boundary.
> Real browser/physical storage/iOS remains pending; old modes and ordinary home
> are unchanged. Do not repeat the old PO batch or ask for S1 permission again.

> **Preceding connection (2026-09-11, after `b40b698`):** `storage=metadata` now
> connects Caption text/color, pin add/move and Scene Caption/model include/exclude
> to the same S1 journal/save/reopen service. Preview/cancel stays local; new pin
> IDs and fields persist atomically. Exclusion removes only the selected Scene
> reference, never the Caption/model or other Scenes. Unknown/conflicting old
> values block replacement without choosing a winner. Independent source and UI
> review findings are closed. Typecheck/build/HTTP graph PASS; the final full run
> with two workers passes 109 files / 1,904 tests / 21 TODO. The first high-load
> run timed out in two unchanged filesystem tests; no assertion was weakened.
> Current todo retains both results and the checkpoint boundary.
> Next at that checkpoint was existing Saved View authoring/save/recall, beginning
> with exact per-field history versions, not a new source or storage probe.
> Model geometry/placement, material/media/Saved View writes and exchange remain
> unconnected in this mode; old modes retain them. No migration or ordinary-home
> change. Batch actual-browser/iOS evidence later; do not request S1 approval again.

> **Preceding connection (2026-09-11, after `6a9c2ed`):** the same development entry
> offers `新しい保存方式を試す`, a new synthetic-only `storage=metadata` run.
> Dedicated OPFS/IndexedDB/Web Locks and fixture inventory connect the S1 service
> to the existing editor; title+body Apply produces one original change/journal.
> Old saved runs and ordinary home are untouched. Four host tests cover mounted
> recorded DOM/memory-port save, cold reopen, readonly/close and exact retry.
> HTTP dependency/Wasm regression passes. Independent review findings are fixed.
> Final checks: typecheck/build PASS; 109 files / 1,900 PASS / 21 TODO. Two initial
> full-suite polling timeouts were replaced with actual completion notifications;
> the final complete run is clean. No dependency, public data or deploy change.
> Browser bootstrap still fails before selection (`node:process` unavailable),
> so actual input/raster/OPFS/IDB/iOS remains pending. Current todo supersedes this
> checkpoint's title/body-only limit; uiux-handoff owns one later manual
> batch. Do not request S1 approval again or repeat the closed old saved-host tests.

> **Latest implementation (2026-09-11, after `d4d665d`):** the new-workspace service
> connects original initialization/Caption commands to fenced pinned-Repo storage,
> an exact retained journal and marker-last publication. Independent stored reopen,
> failure/retry, valid local concurrency and persistent content-fact reuse pass
> synthetic memory-port tests. One interrupted-publication test exposed that
> Automerge 3.4.1 `getAllChanges(view)` includes newer history; exact ancestor-byte
> selection now fixes it. Independent review findings are corrected. Final
> typecheck/build PASS; 108 files / 1,896 PASS / 21 TODO. Current todo owns the
> scoped receipt. Next is actual browser storage/inventory wiring
> for a new synthetic namespace in the existing host, not another disposable
> probe. Ordinary UI/old saved data and real-file/device/adoption gates are unchanged.
> No repeat of the already passed PO interaction tests is requested.

> **Current authorization (2026-09-11, from `a26350c`):** PO explicitly approved
> the S1 implementation-order exception and three pinned root dependencies in
> 05 §13.2. Proceed with the finite creation/edit/save/reopen service; retain
> existing saved runs, ordinary home and real-data/adoption gates. The proposal's
> pending-approval statements below are now historical, not a reason to stop again.

> **Dependency preflight (2026-09-11):** approved exact packages/lockfile added;
> no service or UI activation yet. Audit found three new runtime-chain moderate
> entries for one uuid advisory, plus five unchanged toolchain entries. Independent
> review found no Repo calls to the affected UUID functions, but this is not a
> root-scope waiver. PO then approved the Repo-only uuid 11.1.1 override; it is
> installed, actual Repo compatibility passes and runtime audit is clear. The
> five unchanged toolchain findings remain separate. S1 order stays approved;
> do not ask for the original dependency/ordering or closed manual tests again.

> **Historical decision package (2026-09-11, from `36f2fa2`):** the PO asked to
> continue; root and two read-only reviewers matched the existing CAS/metadata
> evidence to remaining G1-A/C requirements without repeating tests. Empty-root
> bootstrap is already accepted engineering scope, not a new policy question.
> 05 §13.2 now labels one NOT-YET-APPROVED ordering amendment: implement the S1
> production-quality service first with new synthetic-only development activation;
> retain all product adoption/real-data gates. It includes exact pinned root
> dependency introduction only if approved/reviewed/audited. Current todo owns
> the finite residual table and first-slice acceptance. No code or gate changed.

> **Latest PO result (2026-09-11, served `f341833`):** all four saved-host Desktop
> groups PASS: distinct-field editing and two-way receive, both participants'
> same-URL reload, explicit concurrent-title choice and propagation, replay with
> no duplicates and final reload. This closes that manual hold; do not ask for
> the same batch again. Evidence is PO-reported, not agent-observed. Host fault
> injection, real files, offline/PWA, physical iPhone and full `TEAM-FLOW-01` remain
> outside this receipt. Earlier browser-pending statements below are historical
> for these four groups only. Current todo owns the next approved-boundary check.

> **Current implementation (2026-09-11, from `2c27890`):** PO approved the opt-in
> saved-development mode in 05 §13.4. The existing host now connects two saved
> synthetic histories, separate fixed exchange bases, acknowledged-head UI and
> exact retained retry/recovery. Default memory mode/ordinary home are unchanged;
> no real files or product adoption. `保存・再開を試す` starts separate synthetic
> data; keep its resulting URL to reopen. Partial initialization fails visibly
> without reseeding or memory fallback. Node/mounted tests and browser evidence
> remain distinct. The prescribed Browser bootstrap still fails before selection
> (`node:process` unavailable); no real browser storage/input PASS. Current todo
> owns final executed evidence and the next finite exit; usage 55% left.

> **Saved-entry correction (2026-09-11, after `43a06e4`):** PO's browser failed
> before evaluating the saved module. The journal's full Automerge browser entry
> pulled raw Wasm ESM unsupported by root Vite; entry HTTP 200 had not tested its
> dependencies. The shared import now uses the already-initialized slim API;
> Node initialization is test-only. The client-HTTP graph regression fails before
> and passes after the correction; saved/reopen tests also pass. Keep the same
> saved URL and reload, without data deletion or recreation. This fixes module
> transport, not proof of actual browser storage/input; current todo owns checks.

> **Current continuation (2026-09-10, after readiness `77a22b0`):** PO approved
> keeping unplaced Captions editable. Specification 05 §9.4 defines the proposed
> atomic mapping and late-input rules; 06 §§4.1/5.1/8–9 define base evidence,
> nonvisual-owner conversion and full/delta recovery vectors. Independent review
> covers this draft only. Companion 07 now records source identities/ID keys,
> baseline/registration, guarded old Scene/attachment replacement and shared
> original-artifact requirements, with four calculated identity examples. Its
> §§5–7.2 now draft shared unit/birth guards and the prepared-migration source.
> Four added existing-candidate feasibility checks pass; complete Node harness
> 10/10, not converter/storage/adoption proof. The isolated journal now connects a
> dedicated preparedMigration source to retained bytes and recovery with eight
> added synthetic cases. The full existing development source now also connects
> domain/managed/birth inspection at original heads, actual temporary-CAS checks
> and journal reopen/replay under an explicit candidate-only flat profile. Seven
> added service cases retain local work and withhold only affected authority.
> Next consolidate the finite existing-host activation/approval gap; do not start
> another provider/probe campaign. Wire/profile/adoption inputs remain separate.
> Production schema, user files/storage and UI are unchanged. No renewed preservation
> question, closed Chrome journal rerun or immediate human test is needed.

> **2026-09-10 update:** PO reports the five prescribed camera/pin/window manual
> groups PASS at `7540478`, not full team/device/storage acceptance. The subsequent
> Scene-first UX is PO-approved and implemented in the same development host:
> Caption-top Scene list, list/pin color filtering, surface-first add, selected-pin
> `位置を調整` and right-side window tools. Spec 05 §13.4 retains internal ownership;
> no automatic rebind or ordinary-entry/storage change. Current todo records
> executable checks; the changed arrangement still needs rendered acceptance.

> **Current direction (2026-09-09):** PO approved thin whole-workflow delivery.
> Specification 05 §13.4 now permits one connected synthetic development host
> through an explicit nondefault mode of the existing `dev.html`. First connect
> two Scenes, shared Caption editing and model membership; then extend that same
> host toward the two-round team flow and gated durable product services.
> `tasks/todo.md` top and `critical-path.md` §8 own the current plan. The first
> host loop now exists at `dev.html?mode=project-scene`: shared Caption edits,
> model membership and Scene/task switching in page memory. That same served host
> now connects two independent candidate histories: different-field merge, explicit
> scalar choice, retained drafts/model memberships, second round and replay. This
> is synthetic memory exchange, not team files or durable writes. Known model
> binding updates and explicit manual pin corrections now connect to the same
> two-round loop, retaining drafts and Scene references. Explicit membership
> keep-one and independent Caption keep-both are also connected (known synthetic
> fixture only; media scope below). Exact synthetic model keep-both now also connects:
> fresh model/frame/representation/material IDs, verified tiny fixture bytes and
> immutable digests; selected-model translation creates a new binding and passes
> a second exchange without changing the original. Unsupported closure variants
> refuse, not silently omit. Exact fixture triangle/pin display now connects fit,
> six axes/projection and retained temporary cameras, with explicit recovery.
> Multiple retained Caption windows also connect confirmed text and eligible pin
> lines; close/reopen, front order and drag/keyboard/arrange are local UI state.
> Scene-owned Saved Views now connect creation/recapture/recall, naming/order,
> confirmed deletion and entry setting. Exact camera/solid-background captures
> use the same causal history; entry applies once, not on refresh or actor return.
> Exact-target Scene/Project material edits now connect lighting/sidedness/hard
> chroma on the known triangle, explicit conflicts/reset and Scene-only material
> re-keying for independent model copies. Unknown effects stay diagnosed; no
> blend/dither adoption. Fixed PNG media now connects add/description/order,
> confirmed deletion, comparison-window images and causal delete/edit recovery.
> Independent Caption copies retain image bodies with fresh attachment IDs;
> tag support remains empty-fixture-only. Failure retains exact commands/drafts.
> Current todo records tests and independent review.
> File/storage effects remain unconnected; do not claim full model-copy admission,
> renderer adoption, integrated v2 or rendered acceptance. The finite provider
> connection is now closed in development scope as described below; intermediate
> A/B/C statements record implementation order, not current tasks. Real file inputs and
> image pan/pinch/filters remain pending, not removed conveniences.
> Provider stage A now checks the decoded amended root/all record kinds and
> preserves unknown subtrees. This is structural success only; B must validate
> the complete graph/candidates/exact content evidence before C can replace the
> same host's known-only authority. B now includes whole-record graph inspection,
> actual canonical immutable metadata hashes and prior identity, keeping weak
> absence separate from invalid references. Complete candidate/causal/external
> content evidence and C remain open. Neutral original-change inspection now
> retains absent/concurrent candidates and inspects historical immutable/lifecycle
> mutations. The served candidate exposes original flat-string evidence alongside
> its existing fixture projection. Candidate composition now checks all current
> values/references and reserves keys without choosing a winner. Full synthetic
> record data passes two actual candidate rounds/save-reload. Executable external
> content verification now binds exact snapshots/records and separately checks
> bounds/catalogs/family contribution/equivalence/source indices and fixed PNGs.
> Weak-only sources are not fetched. Evidence stays development-fixture-only.
> A pure scoped provider now maps these checks into same-token SceneState/resources
> and attachment/tag/media details; source/candidates and all diagnostics remain.
> Current fields and strong model closures fail independently, with source-optics
> validation and no backward failure from annotations into models. C's same-host
> source now has canonical original operations and an asynchronously verified
> driver. Two-actor/equivalent-model/independent-Caption-copy/retry tests reach its
> pair. The served development entry/session now selects that verified driver.
> All editors and team commands share pending/failure/exact retry acknowledgment;
> drafts and review choices clear only after confirmation. Mounted checks cover
> two rounds, both independent copy types, all editors and duplicate material
> review without restoring a rendering winner. C now has code/mounted connection
> evidence; no ordinary UI, GC/save, browser/device or adoption claim. Durable/file
> prerequisites are named in todo. New-Caption/pin creation now uses an explicit
> model, AssetFrame coordinates and surface, creating one membership through the
> same verified acknowledgment. Cancel/IME/stale/retry, new-Caption independent
> copies/media/second exchange and pin creation on model copies have code/mounted
> evidence. Direct canvas position selection/preview now connects the selected
> resident fixture surface to the same confirmation/cancel/retry path. CPU and
> mounted checks cover transforms, clipping, occlusion and gesture cancellation;
> no native-input/raster PASS. The PO stopped that test because numeric placement
> and buried controls were not human-operable. The correction connects transient
> translate handles and Shift+click on the explicit selected model, keeps exits
> beside the viewport and moves detail/comparison controls right; numbers become
> a collapsed supplement. Multiple windows already existed, not a future-only
> feature. Native hit-testing/layout of the correction remains unverified; do not
> repeat the withdrawn old test or claim usability from DOM checks.
> Follow-up PO report exposed camera/placement input competition, also on Shift.
> The host now reserves primary placement sequences before Orbit starts and
> combines that reservation with gizmo activity. Actual Orbit handler regressions
> cover both entry paths; native-input/raster acceptance remains pending.
> Latest PO behavior change: the development camera now uses Blender basic mouse
> bindings (MMB orbit, Shift+MMB pan, wheel/Ctrl+MMB zoom); left input stays with
> selection/pin placement. Explicit Caption selection accumulates open windows
> by default. Redundant retain toggles are removed; × closes each independently,
> refresh does not reopen it, and explicit selection/open does. No full Blender
> keymap/frame equivalence, native-input or device acceptance is implied.
> One finite correction, not a guard campaign; real storage retains its gates.
> Windows Computer Use initialized but stopped automatically on unsafe-to-resolve
> Chrome URL; no browser input/PASS or bypass. Keep the existing batched UI lane.
> No repeated journal check or scheduling approval is needed. Real-data/current
> app activation, technology adoption, wire/migration and release gates remain.
> Accepted UI/UX and visual principles remain in `docs/ui-product-guidelines.md`.
>
> All checkpoint updates below are history. Old “next component” or “needs
> approval” statements do not override the current plan or its explicit gates.

> **Completed platform correction (2026-09-09):** The PO ran the prepared journal
> in Chrome and reported a concrete failure: recovery/no-op logged success but
> immediate view reported missing data; manual and other-tab views later succeeded.
> Deterministic regression reproduces two read-only CAS checks competing for a
> fail-fast lock. Only verified-presence reads now queue on that same lock;
> mutations retain fail-fast admission and real failures preserve their cause.
> Current todo/isolated README own exact checks and served build identity. The
> preview shows `検証版：同時読み取り修正 1`. The PO subsequently supplied the same-run
> Chrome recheck: three no-op/local-read/other-tab-notification sequences and two
> final reloads, READY with new content and no new FAIL. Bounded correction PASS;
> earlier initialization/recovery evidence is reused, not a fresh full corrected
> run. Manual hold closed; do not repeat or reset. Exact result is in current todo
> and the existing probe README. No app, dependency, schema, iOS/PWA or adoption
> changed. The subsequent early-development scope approval is 05 §13.4 above.

> **Current sequencing correction (2026-09-09):** PO requested a completion-path
> audit at `d8f52d1` (clean, 21 ahead of local tracking; no fetch). Ten recent
> executable commits are useful disconnected components, not a new completed
> `TEAM-FLOW-01` step. Two bounded read-only reviews agree: prioritize the already
> prepared OPFS/IndexedDB journal real-browser batch, not another individual
> Caption validator by default. `tasks/todo.md` and `critical-path.md` §8 own the
> finite completion map and current readiness/result. The previous “next component”
> statements below are historical, not scheduling authority. No repeated 5184/5185
> test, new page or adoption waiver. Full provider, gated storage, wire/recipe
> ratification, integrated services/UI and physical-device evidence remain open.

> **Current approval update (2026-09-08):** The PO explicitly approved advancing
> storage-neutral validators/reusable UI components without real-data/storage
> connection. Specification 05 §13.3 supersedes the approval hold below, not
> technology/package/device gates. Use current todo; do not ask again for that
> scheduling choice, wire current application entry paths or infer full UI PASS.

> The first reusable boundary is implemented in `src/domain`: safe decoded JSON
> and individual Scene/membership record shapes, not full Project validation.
> Existing pure Scene commands share its local-name guard. Typecheck, focused
> 19 tests, full 81 files/1,665 tests (two workers; 21 existing todo) and build
> pass. Independent review findings are fixed and confirmed. No current app,
> storage or renderer hookup; current todo owns the active reusable UI boundary.

> Reusable Scene/four-task navigation is now also implemented in
> `src/ui/projectScene`. It retains local selection/search/list memories, blocks
> Scene changes during uncommitted input, exposes unavailable-current Scene and
> save/recovery states, and emits plans instead of mutating Project/camera/storage.
> Independent review's missing-current-selection finding is fixed and confirmed.
> Typecheck, 25 focused tests, all 82 test files (1,671 PASS / 21 existing todo,
> two workers) and build pass. Current todo owns the next Caption-list component.
> Native browser keyboard/IME, visual/mobile
> layout and full application integration remain pending; no new page/server or
> human verification is requested by this slice.

> **Current Caption-list update (2026-09-08):** `src/ui/projectScene` now also
> has a retained current-Scene list, search/exact-owner filters and direct color
> controls immediately above the list. Colors filter only pins, not list rows;
> all/explicit/none and per-Scene state stay distinct. Unknown owner/color/text
> stays explicit, hidden-owner and review actions are host intentions, and no
> selection ends a pending edit. Scoped style and DOM-contract tests are not
> rendered evidence. Independent review's combined color-hidden/review feedback
> finding is corrected and confirmed. Current todo owns exact checks/next scope.
> Root typecheck, 50 focused tests, full two-worker test suite and build pass;
> the next component is selected detail/retained comparison-window state.
> No current app, storage, renderer, package, new page/server or manual probe
> changed. Full content-editor/window integration and platform gates remain open.

> **Current Caption-detail update (2026-09-08):** Reusable title/body/color
> draft controls and Scene-scoped multiple-window STATE now exist under the same
> disconnected boundary. Sparse apply plans preserve independent conflicted fields;
> stale/failure paths retain input, cancel is confirmed, shared-Scene impact stays
> visible. Closing/front/arranging windows never changes editing selection.
> Independent review's CR/CRLF-preservation finding is fixed and confirmed, with
> ambiguous newline edits retained and blocked before apply. Root typecheck,
> 46 focused tests, full 85 files / 1,699 PASS (21 existing todo; two workers)
> and build pass. No actual floating layer, connector, durable-save or browser/IME
> acceptance is claimed. Current todo owns the next Caption inclusion/mode-control
> component; no new Product Owner action, server or repeated probe is needed.

> **Current Caption-action update (2026-09-08):** The same disconnected UI now
> includes an existing-Project Caption picker and add/move controls with a separate
> near-stage confirm/cancel strip. Inclusion emits exact membership-only intent;
> add requires explicit model, move shows its existing owner, and shared impact
> remains visible. Failed/stale proposals stay retained, and cancel confirms exact
> mode plus proposal. Independent review's target-label P2 is fixed and confirmed.
> Typecheck, 60 focused tests, full 87 files / 1,713 PASS (21 existing todo) and
> build pass. Actual picking/anchor writes, renderer/storage and browser/device
> acceptance remain unimplemented/unverified. Current todo owns the next viewing-
> aid component; no new human check, probe page/server or current-app hookup.

> **Current viewing-aid update (2026-09-08):** The disconnected UI now has fit,
> six explicit Project-axis directions, observed projection, exact Scene-owned
> Saved View recall and independent entry-view choice/apply/cancel. A near-stage
> fit shortcut shares the same intention path. Stale Scene/frame/view/draft
> refuses effects without default selection or losing input; camera/entry failures
> stay separate. Independent findings are fixed and confirmed. Typecheck, 49
> focused tests, final 88 files / 1,724 PASS (21 existing todo) and build pass.
> These are reusable control contracts, not actual camera/storage/browser/device
> results. Named-view authoring/background controls remain next in current todo;
> no current-app hookup, new page/server or human check is requested.
>
> **Current view-authoring update (2026-09-08):** Reusable create/name/edit,
> exact camera+background recapture, dependency-aware confirmed deletion and
> earlier/later intentions now accompany the view controls. Solid-background
> HEX/picker/standard-color has independent draft/apply/cancel, no hidden rounding
> of captures and no durable-save claim. Creation never changes entry; deletion
> never auto-clears it. Independent review's cross-lane applying-state P2 and the
> source-isolation allowlist adjustment are fixed/confirmed. Root typecheck, 58
> focused tests, final 89 files / 1,736 PASS (21 existing todo) and build pass.
> Still no current app, renderer/storage, real capture/undo or browser/device
> acceptance. Current todo owns the next model-list/Scene-membership component;
> no new page/server or repeated human test is requested.
>
> **Current model-inventory update (2026-09-08):** Reusable all-Project model
> list/search/Scene filter and observed `このシーンに表示` controls now exist.
> Exact include/exclude intentions preserve selection, retained input and original
> failed-operation target; absent, unresolved, temporarily hidden and unavailable
> states remain distinct. Exclusion consequences and Project-wide placement scope
> are visible. Independent review found no blocking issue and confirmed the
> normal-omission correction. Typecheck, 49 focused tests, final 90 files / 1,748
> PASS (21 existing todo) and build pass. No current-app/model-byte/renderer/storage
> integration or browser/device acceptance. Current todo owns the next exact-target
> Material component; no new human test, page/server or release change is requested.
>
> **Current material update (2026-09-09):** Exact model/surface and Scene/Project
> scope, whole-record precedence, retained appearance editing and confirmed override
> removal now exist as disconnected controls. A pure atomic-intent guard preserves
> unknown data and untouched exact color. Independent refusal/selector findings
> are fixed and confirmed. Typecheck, 29 focused tests, final 92 files / 1,765 PASS
> (21 existing todo) and build pass. No current-app, real material rendering,
> browser/IME/storage/device acceptance. The PO permits continuing accepted tasks
> without another check; current todo proceeds to individual MaterialOverride
> record admission, not a new probe or integrated release.
>
> **Current material-record update (2026-09-09):** Continued without a PO pause
> to individual MaterialOverride admission: exact nominal ID/routing/target,
> shared unchanged lifecycle and atomic-value checks, with unknown fields retained
> and flagged. Independent review found no blocking issue. Typecheck, 41 focused
> tests, final 93 files / 1,770 PASS (21 existing todo) and build pass. This does
> not validate graph/catalog ownership, source/backend support, causal state or
> payloads and does not connect the app. Current todo owns the next pure Caption/
> anchor admission component. No new manual check, page/server or adoption claim.
>
> **Current package design update (2026-09-08):**
> `docs/specs/06-project-package-wire.md` is a reviewed **PROPOSED / UNRATIFIED**
> companion under 05 §7.5, not a format/version or S2 adoption. It separates five
> purposes, exact delta/base state, one-Scene privacy and required journal changes;
> §10 owns the remaining ratification inputs. No executable code, dependency,
> server or additional manual test changed. The scheduling proposal to advance
> full storage-neutral validators/reusable UI components was pending at that
> draft checkpoint; the later approval at the top supersedes that hold, not this
> wire proposal's ratification. Preserve required platform/device gates and do
> not repeat completed proofs or create another auxiliary page while waiting.

> **Current retention update (2026-09-08):** Isolated `poc/cas-io/retention.ts`
> now proves shared-Project retention and grace-period orphan collection with
> actual synthetic files. Typecheck and 14/14 tests pass; independent review's
> unfinished-journal bypass is fixed and confirmed. All mutations share the same
> injected Node writer; pending/opaque/invalid inventories fail closed, deletion
> removes the receipt before payload, and interruption rechecks roots on retry.
> Full domain root derivation, actual metadata journal/browser integration,
> platform/scale/iOS adoption and UI are still open. Existing source/dependencies
> and earlier evidence are unchanged; no new page/server or user-data deletion.
> Reuse this bounded result rather than repeat it as another workstream.

> **Current semantic-purpose update (2026-09-08):** Isolated `purposes.ts` derives
> all five semantic closures from one causal synthetic Project. Typecheck and
> 17/17 focused tests pass; independent review's unknown-field/root-candidate
> finding is fixed and confirmed. Exact same-lineage changes, base-relative blob
> plans, backup-only exchange records, one-Scene review/minimal hidden owners and
> fresh whole-Project clean re-keying are proven only in this small decoded graph.
> The existing probe README owns its boundaries. No production source/dependency,
> wire, browser page/server, GC deletion or UI connection changed. Full domain,
> platform/scale/device adoption remains open; use current todo and do not repeat
> the completed manual tests or this semantic proof as another workstream.

> **Current browser journal preparation (2026-09-08):** The same exact journal
> now has an isolated OPFS files/inventory + pinned Repo/IndexedDB metadata port
> and one resumable page, `poc/scene-history/journal.html`. Its result log survives
> reload. Typecheck/build, 29 reused journal tests and four new library-lifecycle
> cases pass; independent review findings are corrected and confirmed. No real
> browser/OPFS-IDB/cross-tab result is claimed. The page is not running yet; its
> README owns the developer launch and later one-batch human instructions. No new
> server/tunnel, browser bootstrap retry, Chrome switch or production wiring was
> performed. Actual platform, domain/privacy/GC/scale adoption gates remain open.
> Use current todo; do not grow another probe page or repeat completed manual tests.

> **Current journal prerequisite update (2026-09-08):** `poc/scene-history`
> now contains an isolated exact source/ordinal-change journal protocol using
> separate real Node metadata/journal stores and the existing isolated CAS.
> Isolated typecheck, 29 journal tests and six existing history tests pass. Its
> independent review findings are fixed and confirmed: missing inventory refuses
> facade requests, and loss after `metadataDurable` requires repair rather than
> silent replay. Original-byte local/remote recovery and old-head publication
> barriers are proven only within the stated synthetic Node boundary. No remaining
> P0/P1 was found there. See current todo and the probe README for exact limits.
> Root typecheck/build and all 80 test files pass with `--maxWorkers=2`; the initial
> default-parallel script-suite timeouts are retained separately in that record.
> This is not actual OPFS/IndexedDB coordination, GC, complete domain validation,
> platform/scale adoption or UI integration. Next work must close those real
> prerequisites, not repeat the same Node fault matrix or completed human sequence.
> Application source/dependencies remain unchanged; usage remaining is 43 percent.

> **Current OPFS evidence update (2026-09-08):** `poc/cas-io` now also has
> a dedicated synthetic OPFS backend and one-action local probe with separate
> reload/readback. Isolated typecheck/build and the full 500 MiB cross-runtime
> recipe check pass; focused review findings are corrected and confirmed.
> After a file:// launch failed before module loading, a loopback preview of
> `e51fea8` was built and its page/script HTTP 200 verified. The PO then supplied
> READY and PASS for reopening/hash-checking the saved 500 MiB payload. This is
> narrow user-operated OPFS readback evidence. The PO does not remember the
> initial completion and has no log: that result is unknown, not failed. Do not
> ask again for this unavailable evidence or repeat the stress run for it; this
> is not a new PO approval hold for already approved implementation work.
> The README owns the exact attribution and limits. No HTTPS tunnel was started.
> Broader OPFS/iOS, full journal, inventory/GC, privacy/scale and adoption still
> remain. Application code and completed history-probe evidence are unchanged.

> **Current I/O prerequisite update (2026-09-08):** Under the PO's autonomous
> continuation request, `poc/cas-io` now supplies a disposable Node filesystem
> streaming/publication proof. The 500 MiB exact-digest round trip and focused
> cancellation/quota/interruption/dedup/corruption checks pass; review's cleanup
> P2 is fixed and confirmed. See its README and current todo for exact evidence.
> This is not OPFS/iOS, full cross-store journal or technology adoption. Root
> application source/dependencies remain unchanged. Human checks stay batched;
> do not repeat the completed history probe or infer browser PASS from Node.

> **Current pure-core update (2026-09-08):** The PO approved advancing the
> disconnected Scene core while browser storage evidence is blocked. Specification
> 05 §13.1 is the narrow scheduling exception. `src/scene` now provides pure Scene
> command planning, snapshot-token checks and conflict-aware composition through
> a validated resource read projection. No existing application entry imports it;
> there is no storage, renderer, package, migration or UI activation. See the top
> of `tasks/todo.md` for exact verification and remaining prerequisites. The
> browser failure below does not make the new domain tests browser evidence.
> Focused core tests 12/12, typecheck, all 80 test files (1,658 PASS / 21 existing
> todo) and build pass. Independent review's one ordering P2 is corrected and
> confirmed closed. Next work cannot silently connect storage/UI before its gates.

> **Current update (2026-09-08 isolated implementation):** The approved
> implementation-to-UI-verification goal is active in scope, with a user decision
> required if usage remaining falls below 10 percent (latest: 46 percent).
> `poc/scene-history` contains the disposable S1-entry history proof (6/6 PASS)
> and a Repo/IndexedDB storage probe. Product Owner screenshot/log evidence now
> confirms save/failure/retry, page reload/readback and the second-tab barrier
> while the owner holds the lock. Follow-up screenshots from a resumed pending
> run now confirm refusal, recovery of two original changes and both-tab READY
> revision-2 with independent Repo readback and unchanged base; the subsequent
> final page-reload/readback logs also pass. The PO explicitly confirmed the no-op
> replay line, closing this bounded manual sequence. Automatic other-tab refresh
> is not independently established; this is not process-kill/device or G1-C
> acceptance. Do not ask to repeat the unchanged sequence. Root application wiring and
> dependencies are unchanged. See the current top of `tasks/todo.md` for exact
> tests, the isolated dependency advisory, scope exclusions and the recurring
> browser-control blockers. Do not call partial PoC evidence production
> adoption or UI/device acceptance. The PO now defers human Chrome checks into
> one later session and permits provisional in-app testing; the latter also
> failed before page access, so neither repair nor identical retries continue.
> The probe README consolidates actions/expected results and separates the
> three evidence lanes. Only documentation/non-browser verification can proceed
> at this boundary; deferred checks do not waive production-adoption gates.
> Do not create another synthetic matrix or architecture rewrite.

> **Historical update (2026-09-08 focused correction):** Contract checkpoint
> `25b9a776de84a2bb0fb4eb4d78aa542aeb64fb48` is pushed. The Product Owner then
> selected explicit keep-one/keep-both conflict choices, with keep-both creating
> independently editable Caption/model items. Specification 05 sections 8, 12.6
> and 13 define the correction, one continuing-team acceptance flow and the
> immediate S1 entry; specification 03 section 6 maps the updated G1-C evidence.
> Use the current top of `tasks/todo.md`. S1/S2 own their required iOS storage
> checks; S3 owns integrated product/UI acceptance. Reuse applicable evidence and
> do not repeat broad review or unchanged tests after the focused correction.

> **Historical update (2026-09-07 ProjectScene/team contract):** The Product Owner
> accepted the Project-as-typed-workspace, persistent ProjectScene and continuing
> causal team-work direction, including separate Team Workspace/Contribution/
> review/backup/clean purposes and full-Project editing. The preserved current
> implementation checkpoint is `21786771bdb39800a29f835fa4f25535cd01d5bc` and
> is pushed on `g0-baseline`. ADR-0002 and
> `docs/specs/05-project-scene-team-workflow.md` are the new accepted, not-yet-
> implemented authority; `tasks/team-operations-review.md` retains the audit
> rationale and `docs/ui-product-guidelines.md` the UI/UX and visual direction.
> Current Native DisplaySet/fixed-baseline behavior and all frozen input bytes
> remain unchanged. The contract and cross-document/privacy reviews found no
> remaining P0/P1. The current boundary ends after preserving and presenting this
> docs-only checkpoint; S1 has not started. A later requested continuation begins
> with the S1 meta-audit and slice statement. Stop before S2/S3, dependency
> adoption, release, Pages or Service Worker work.

> **Historical completed update (2026-09-06 implementation):** The Product Owner approved
> D1–D4 and all three bounded legacy-convenience UI slices. Production code,
> focused acceptance and independent read-only code review are complete with no
> remaining P0/P1. Rendered Desktop/41-task measurement and physical-iPhone
> acceptance remain open; see `tasks/uiux-parity-plan.md` §9 and `tasks/todo.md`.
> This does not authorize release, commit/push, Pages or Service Worker changes.

> **Historical superseded planning update (2026-09-06):** PO requested a renewed legacy-convenience audit
> and a remaining-work-first UI/UX plan. See `tasks/uiux-parity-plan.md` and the
> current top of `tasks/todo.md`. This is document-only planning; D1–D4 and further
> implementation require PO review. Existing UI code stays uncommitted and its
> live Desktop/iPhone acceptance and independent final diff review remain open.

> **Historical superseded update (2026-09-05):** The PO subsequently approved the refined UI
> design and requested an existing-function/UI crosswalk followed by implementation.
> See `tasks/uiux-implementation.md` and the top of `tasks/todo.md` for the current
> worktree and verification boundary. The no-production-authorization statements
> below describe the earlier handoff, not the current UI authorization. This UI
> change has no new rendered/physical-iPhone acceptance and no release approval.

> **Historical checkpoint status (superseded by the 2026-09-07 update):** the bounded Native-only write-authority path,
> device-side HEIC-to-JPEG compatibility path, automated checks and Product
> Owner Desktop/physical-iPhone acceptance are complete. The latest production
> implementation is `6b2a28a0e5983676c9dc5d97534d916e3288f40d`; the accepted
> result checkpoint at the start of this handoff preparation is
> `87a249d4ab85308c0486366c5516bc82dd7ff139`. Its clean GitHub Actions run
> passed and no P0/P1 was unresolved. At that checkpoint, the next authorized workstream was a
> task-based public-candidate UI/UX audit and design pass; see
> `tasks/uiux-handoff.md`. This does not authorize production or release work.
>
> This file is navigation and handoff context, not a product specification.
> Code/tests define observed behavior; accepted specifications define product
> invariants. If this file disagrees with either, stop and resolve the mismatch.

## 1. Canonical checkpoint

- Repository: `ChoRdChario/LociView`
- Branch: `g0-baseline`
- UI/UX handoff preparation start checkpoint:
  `87a249d4ab85308c0486366c5516bc82dd7ff139`
- Accepted documentation checkpoint: `5f2a19df9fcfd50215d1313c1265e6cdf82872b4`
- Native Package Exchange implementation:
  `0b5dd461d761fc0669b1c0c80b3d6549cd01b1e6`
- Direct-LociMyu acceptance synchronization:
  `aa3a55b67a220c222c0ad503413a5a706e636cfe`
- Option-A bounded implementation:
  `9c5596b6df712df0105904c9f2e0ecc62e1440a0`
- Accepted corrective executable commit:
  `f6c88967155b0c83d4bcdd4fec6b4a78d9caf772`
- First-candidate device-side HEIC compatibility start HEAD:
  `14257e0a13526f7233e474c0f61b259cd443933d`; exact implementation commit:
  `6b2a28a0e5983676c9dc5d97534d916e3288f40d`.
- Accepted Native Package Exchange tree verification: typecheck, 60 test files /
  1,478 passing tests with 21 existing todo, and production build all PASS.
- Option-A pre-HEIC executable checkpoint: the indexed tree passed typecheck,
  61 test files / 1,501 tests with 21 existing todo and both production builds.
  The corrective tree adds two focused passing tests; its one unrelated
  five-second verifier timeout passed on immediate single-test and full-file
  reruns (1/1 and 82/82). Independent read-only reviews found no remaining
  code P0/P1.
- Product Owner acceptance: option-A Desktop PASS, including immediate unsaved
  Caption pin/overlay display; physical-iPhone PASS includes Native restore/
  save/completely-offline-reopen and the later device-side HEIC-to-JPEG
  compatibility flow; no unresolved P0/P1.
- At the handoff preparation start checkpoint, local `g0-baseline` matched
  `origin/g0-baseline`, the worktree was clean, no commit was unpushed, GitHub
  Actions run `33885272816` passed on the same SHA, and no temporary preview,
  tunnel or HEIC PoC process was running.
- The first candidate does not require Windows HEIF/HEVC extensions and does
  not ship a decoder. Users make a separate JPEG on their device and attach
  that JPEG; direct original-byte HEIC/HEIF remains required post-candidate
  work. The existing libheif+libde265 decoder stays an isolated local PoC, and
  generated output remains outside the application/Pages/Service Worker graph.
  On the implementation tree, typecheck, 65 files / 1,542 tests with 21 existing todo,
  ordinary and Pages-path builds, public-codec isolation and Edge 152 actual
  JPEG/PNG/GIF/WebP decode all pass. Two independent reviews found no P0/P1.
  The Product Owner then accepted the physical-iPhone flow: direct HEIC was
  rejected with guidance, the separately exported JPEG was added and displayed,
  and the saved Project reopened with the attachment after Safari restart while
  completely offline.

Do not hard-code this document's own commit as the checkout target. At the
start of a fresh session, verify that current `g0-baseline` is a clean descendant
of `5f2a19d` and matches `origin/g0-baseline`.

## 2. Read order

Read these before the public-candidate UI/UX audit:

1. `AGENTS.md`
2. `PROJECT_MAP.md`
3. `docs/README.md`
4. this file
5. `tasks/uiux-handoff.md`
6. the top current boundary and next decision in `tasks/todo.md`
7. `tasks/critical-path.md` sections 7, 8 and 12
8. `tasks/lessons.md` section “長期プロジェクトと長期Codexセッションを分離する”
9. `docs/specs/00-product-contract.md` `PROD-13`–`PROD-16`, sections 4–8
   and 10, then
   `docs/specs/02-storage-package-migration.md` §31 and
   `docs/specs/03-gates-and-delivery.md` §3.8 for the selected Native-only
   candidate boundary; read `docs/specs/02-storage-package-migration.md` §29.3
   for current first-candidate HEIC compatibility; read §30 only if package
   detail is needed

Do not reconstruct current scope from chat history, the superseded roadmap or
old unchecked gate prose.

## 3. Public-candidate safety boundaries closed at the accepted scope

The items below remain closed for the accepted public-candidate safety contract;
the team-operation review does not reclassify its fail-closed implementation as
defective. A separately Product Owner-approved continuing-team contract may
supersede history/package semantics through updated specifications and new
acceptance before implementation.

Treat these as complete unless a newly reproduced P0/P1 directly blocks release:

- first production GS path and physical-iPhone rendering correction;
- streamed Native complete backup/restore;
- repeated multi-format Assets, independent transforms and per-Asset visibility;
- Caption ownership/placement/search/deletion, images, color, pin scale and
  temporary movable/resizable overlay;
- DisplaySet-linked Captions, material appearance and Saved Views;
- non-destructive frozen-v1 to Native conversion;
- direct LociMyu ZIP to Native conversion with source bytes preserved;
- Native Package Exchange:
  - collaboration package with one fixed baseline and Project lineage;
  - Caption/new-image three-way merge;
  - conflict report with zero Project writes;
  - idempotent re-import and lineage rejection;
  - source-nonmergeable review/share package, View mode by default; a restored
    v1 copy may later begin only a new independent lineage;
  - clean editable copy with a new Project ID/lineage;
  - existing complete backup retained as a separate purpose.

Within current candidate maintenance, do not reopen package permutations, extra camera inference, material-system
expansion, memory instrumentation, Proxy edge cases or additional physical-
iPhone evidence matrices without a release-blocking P0/P1. The authorized UX
session may identify workflow and presentation changes, but it may not make
production changes before Product Owner approval.

## 4. Product invariants that must not drift

- User-visible display/select/edit unit: Asset.
- Binary unit: Representation.
- Durable save, snapshot publication and activation unit: Project.
- Mesh, ordinary Point and GS are rendering formats, not exclusive display
  modes. Visibility is independent per Asset.
- Interaction Proxy belongs to its GS Asset and is not a user-visible layer.
- DisplaySet binds Caption membership, material appearance and an optional
  default Saved View. It is not an Asset layer/group/preset system.
- Native LociView Project is the durable authority. Frozen v1 and LociMyu ZIP
  are preserved, read-only conversion sources.
- Compare is excluded from MVP, the release gate and the critical path.
- Spark is the provisionally accepted first GS path, not a permanent decision
  for every renderer architecture.

This checkpoint does not complete G0/G0-S/G1, permanently adopt Spark or any
renderer, integrate `main`, or approve a release. Applicable gates remain
governed by `tasks/critical-path.md` until the Product Owner decides otherwise.

## 5. Selected candidate boundary and authorized implementation

The Product Owner selected option A on 2026-09-03. Native Project is the only
user-writable authority in the first public candidate. Legacy v1 remains safe
import, explicit View and non-destructive conversion into a separate Native
Project only. This does **not** remove Native Package Exchange or its accepted
Caption/new-image collaboration merge.

The Product Owner authorized the bounded `RC-A-01`–`RC-A-07` implementation on
2026-09-03 and accepted its Desktop product flow after the bounded corrective
commit. The resulting
implementation enforces the restriction at service/store/filesystem boundaries,
not only by hiding controls, and converts under an exclusive source-snapshot
guard without granting legacy Edit authority. Reportable malformed source lines remain exact
and non-active; a divergent operation opens no authoritative View and blocks
Native publication. The bounded v1 import must also remain inactive or exact
complete across an interrupted completion-manifest write and allow safe retry.
Legacy package/CSV export and device-local legacy-source deletion are absent.
Without durable OPFS,
legacy registration/conversion is unavailable rather than presented as
transiently saved. General journal, quarantine/resolution, writable-v1 S2/S3
work, package permutations and Compare remain excluded. UI production changes
now require the separate audit/design and Product Owner approval described in
`tasks/uiux-handoff.md`. A bounded private staging receipt closes only exact
import-marker publication; it is not
a package entry, source authority or general journal. One short ordinary-home
LociMyu discovery label/help route is release hygiene, not a new
importer or general UI-polish workstream.

For first-candidate Caption images, Native writes PNG/JPEG/WebP/GIF only.
Direct HEIC/HEIF selection fails closed before publication and explains how to
make a separate JPEG locally on the device. LociMyu HEIC/HEIF remains in the
conversion inventory/report but is not automatically attached; only an exact
source relation names the corresponding DisplaySet and Caption, and an unknown
relation is never guessed. The original HEIC and source ZIP stay with the user;
the manually added JPEG is the only Native media authority. This policy does
not delete the isolated decoder PoC or cancel post-candidate direct HEIC work.

Also surface these genuine release decisions/blockers:

- project-wide license adoption;
- third-party and built-output notices;
- application/package version and exact release SHA;
- current README and ordinary-home LociMyu discovery;
- clean-tree CI on the eventual final executable SHA (`87a249d` passed, but a
  later production change requires a new exact-tree result);
- `g0-baseline` to `main` integration method;
- named rollback point and previous-build rollback procedure;
- GitHub Pages/base-path/Service Worker update verification;
- remove the advertised POST share target unless a separately approved handler
  is implemented; the generated Service Worker currently has no POST handler;
- Spark absence from the normal v1 route and precache;
- absence of representative private source bytes from Git/build;
- whether public docs may retain private-source-derived fingerprint/name
  metadata.

Option A does not authorize license adoption, version/SHA selection, `main`
integration, Release creation or Pages deployment. Those remain separate Product
Owner decisions after RC-A implementation and exact-tree verification.

## 6. Next fresh session

The next session starts from the 2026-09-08 update at the top of this file and
the first current boundary in `tasks/todo.md`. Read ADR-0002, specification 05,
`tasks/team-operations-review.md` and `docs/ui-product-guidelines.md`; verify the
Git/worktree boundary read-only. Next execute the bounded S1 adapter-harness entry
in specification 05 section 13 after its existing dependency conditions; use its
result to close the remaining G1-A/C prerequisites before production storage.
No additional general audit/planning workstream is required. S2 stays
blocked until the separately specified ProjectScene migration and five-purpose
package-wire companions pass. S1/S2 collect their required physical-iOS storage/
recovery evidence; S3 owns the integrated product UI and `TEAM-FLOW-01` device run.
Stop before dependency adoption, license/version decisions, `main`, Pages,
Service Worker or deployment.

The older instruction to begin the 41-task UI walkthrough was completed or
superseded and is not the next workstream. Rendered Desktop and physical-iPhone
UI acceptance remain open but inactive until S3. Never use this document's
embedded SHA as an unchecked checkout target.
