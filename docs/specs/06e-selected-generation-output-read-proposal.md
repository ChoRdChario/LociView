# 復元後の出力準備における読み取り単位

Status: **ACCEPTED —PO承認2026-11-08・§5を含む限定実装とWindows自動検証完了**。
§§7–8は**PO承認2026-11-09**。§§6–8の限定実装とWindows自動検証完了。
対象は通常selected generationの読取と新しいBackupの成功表示。実機iPhone・一般公開の合格ではない。
仕様06b §6.2のZIP証拠共有範囲を拡大しない。実行証拠と残件は[todo](../../tasks/todo.md)。
今回のGS協調検査・未確認ZIP整理は[仕様10](10-gs-loading-and-output-attempt-cleanup.md)。
§10は**PO承認2026-11-10 —限定評価済み・不採用**。実時間の改善条件を確認できず、製品コードは従来経路へ戻した。

## 1. 利用者の結果と確認した問題

バックアップ復元後も、小規模な保存・一時ファイル整理・同じ出力の再開を、
復元前に近い待ち時間で進められるようにする。保存後の照合と中断復旧を維持する。

Windows専用Chromium156、合成GLB1つ・Caption1件の実OPFS経路で、復元後の
容量エラー表示が既存15秒の待機条件を超えた。条件を変えず失敗を保持した。
別の診断走行では同じ15秒条件の違反はなく、表示まで14.193秒、整理7.052秒、
同じ出力の再開からダウンロードまで6.872秒だった。機能の継続とデータ保持は
確認できたが、小規模保存10秒の開発目標を満たすとは扱わない。

診断の保存準備は10.070秒、エラー表示を含むHost全体13.739秒。復元後の
ready-before1.587秒、capture2.118秒、ready-final1.421秒、persist1.951秒、
ready-finish1.559秒。復元前の同じ走行ではHost全体2.556秒だった。
一例であり速度保証や原因の寄与率ではない。

静的追跡では、通常のselected generationのpublic FS読み書きが、それぞれの
前後で`readRestoreControls`を呼び、復元管理記録とgeneration内のファイルを
新しく確認する。これが純粋な読取の中でも繰り返される。OPFSのlist自体は既に
字句prefixに応じた枝刈りを実装済みであり、全領域走査の新規修正とは説明しない。
artifact共有ロックはgenerate終了後の表示照会で使われ、今回の待ちを新しい
ロック逆転と断定する根拠はない。

## 2. 一括判断する範囲

次の**純粋な読取1回の内部**に限り、既存のgeneration-owned readonly FS/factoryを
一貫して渡し、復元先・処理状態の確認をその読取の開始と終了へ集約する。

- それぞれ独立した1回の`MetadataProjectSession.outputReady`。
- Backup capture内の、変更しないsource／base／inventoryの一まとまりの照会。
- 1回の`WorkspaceSender.outputOverview`内の表示照会。
- PO承認2026-11-09の§7：通常selected generationのpublic `MetadataProjectSession.read`1回。

`outputOverview`は既に`withMetadataRead`を使用する。追加の外側wrapperではなく、
`jobsDirect`の`readCurrentBackup`と`availableBasesDirect`が元のSessionから読む経路を、
同じderived fs／factoryの非採用projectionへそろえる。public `Session.read`の追加は
後述§7の独立した1回に限り、overviewのprojectionとは別に終了確認後だけ採用する。

上記の各経路を接続・検証する。先に工程別の実測と読み取りの対応を取り、
効果がある経路だけを接続する。rawファイル・モデル・画像の全検査やSHA-256照合は
省略せず、06b §6.2のZIP証拠共有範囲も広げない。

**集約しない境界**：別のready呼出し、captureからpersistへの移行、個々のwrite、
write後readback、Journal書込・読戻し、publication、Selection、復旧、別コマンド、再試行、cold再開。
とくに`writeReceipt`全体をreadonly callbackで囲む案や、コマンド全体に復元管理記録を
キャッシュする案は採用しない。persistの遅さは、この案で解消済みとは約束しない。

## 3. 内部portと所有

既存`withMetadataRead`の`MetadataReadPorts { fs, factory }`を使用する。
Sessionのprivate読取、captureのprivate純粋照会、表示照会へ、同じcallback内の
portsを明示的に渡す。内部projectionはacknowledgments／lastなどのSession状態を
変更しない。`BackupSourceCapture.prepare`の前後の照会も、この非採用projectionから
確定前のplain bytes／source／descriptionだけを得る。終了監査後にのみ受理した結果を
必要なSession状態へ採用する。UIは従来どおりtyped Session／Senderを呼ぶだけとする。
viewer、保存形式、公開API、変換ID、新しい依存には変更を加えない。

実装ではSession内部のJournal／repository／scene-append／receive読取へportsを渡す。
overviewはSessionが所有する内部callback portから同じportsと非採用projectionを得る。
任意の外部FSへpublic `read`を付け替えるAPIは設けない。overviewはSession状態を採用せず、
outputReadyとcaptureは必要なcandidateだけを終了監査後に採用する。
constructorに結び付いた既存のcontent検査・CAS／media observerは厳しい検査を維持し、
その所有者を偽って付け替えない。これらが残す待ち時間は工程別に報告する。

FS・factory・ProjectRoot・mutation authority・selected generationを一致させ、
成功結果は開始／終了とも新しい復元管理情報で監査してから受理する。失敗した観測は
所有する処理をdrainして拒否し、結果を採用しない。normal selectedの既存の例外処理を
維持し、stagingの「失敗時にも終了監査」の契約を変更・拡張しない。内部FSのwriteは拒否し、stream、
factory、readonly capabilityを外へ逃がさない。返すものは確定したdata-onlyの
読取結果に限り、終了検査に成功するまでSession／画面の結果へ採用しない。
取消、lease喪失、closing、owner／selection変更では失効する。未完了のprojectionは
待ち合わせて結果を拒否し、期限切れreadはawait後にも確認する。outputReady／Backup captureの
state採用直前にも取消・editable authorityを再確認し、その確認と採用の間にはawaitを置かない。
§7のpublic readは既存の読取権限に従い、閲覧専用／復元pendingの読取へeditable条件を加えない。

`outputReady`内の純粋なJournal読取では、選択generationの管理情報監査を開始／終了へ
集約する。Journal内容・bindingの検証は維持するが、その内部の管理情報監査回数を
従来どおりとは約束しない。すべてのJournal書込・readback・publication・復旧の各fenceは
別々に新しく確認し、このcallbackに含めない。

途中の状態変更を終了時に検出する場合がある。raw FSからの外部改変が終了検査前に
元へ戻された場合（同じ長さの破損を含むABA）は、このcallbackの管理情報監査では
検出しない場合がある。保存領域のsnapshot保証ではない。この検出時期の差が判断点となる。
write-onceの管理記録、append-onlyのSelection、正規writerの排他条件は保持する。
終了検査を跨ぐ証拠の再利用はしない。
stagingで許可するconsumerの追加ではなく、normal selected generationの上記経路に限る。

### 2026-11-11 Backup履歴行の候補評価（不採用）

同じreadonly観測内のstate／完全open／step-chain検査の重複を、検証coreを
保持して整理する候補を限定評価した。Ki-84の固定入力・独立profile・各3回の
実測では、overview中央値2.900秒→3.144秒、Host全体11.877秒→12.049秒で、
待ち時間の短縮を確認できなかった。保存・再開・素材照合は6回とも成功したが、
性能改善として採用せず、製品コード・試験を評価前の経路へ戻した。
試行差から悪化の因果関係は断定しない。public state／open／steps／downloadの
検査と既存の所有・終了監査を維持する。この記録は新しい再利用範囲の承認ではない。
診断と各回の数値・未採用の差分は既存の作業記録と私的な評価資料へ保持する。

## 4. 受入れ

- 同じ合成入力・履歴・ブラウザ・画面で、復元前／復元後の各工程を3回測り、
  管理記録の監査回数・時間と実際の操作時間を分ける。既存15秒条件と開発目標は変更しない。
- 同じ出力ID・原本／画像／モデルのハッシュ・本文・所属・配置・視点・描画設定を保持。
  整理、生成、ダウンロード、照合、閉じる操作、cold再開まで確認する。
- closing時まで残る管理情報改変・同じ長さの破損・Selection変更、lease喪失、
  別FS/factory、期限切れreaderを拒否し、古い結果を採用しない。readonly facadeを
  通じたwriteは常に拒否する。外部ABAの検出限界は上記のとおり維持・明記する。
- write／readback／publication／復旧の各監査と改変拒否を既存のサービス試験で確認。
  PC・タッチ相当・二窓と、ブラウザ／サーバー完全終了後のオフライン継続を再確認。
- 独立レビューと必要な最終チェック後にのみ開発候補へ接続。一般公開・iPhone実機合格は含めない。

承認境界：PO2026-11-08が当初の3経路の限定実装・自動検証を承認した。
public readは2026-11-09に§7で別途承認された。
これ以外はpublic I/Oごとの監査と個別承認された例外を保持する。新しい検査寿命・
書込／復旧境界の集約・製品方針・公開判断が必要になった場合だけ該当部分を止める。

## 5. 通常保存の低層I/O改善（2026-11-08）

POはファイル別のwrite／close／再照合計測と、保存・復旧の安全性を維持する改善を指示した。
これは§2の読取寿命を広げる承認ではない。すべての原本とcapture／prepared／index／Startの
個別保存・fresh readback、生成前後とcold復旧の照合、全write／Journal／公開fenceは維持する。

実装前のネイティブ計測ではwrite／closeは各数msであり、その前後には多数のnative lookupと
ancestor entries反復がある。正確な計測値・入力・比較条件はtodoへ記録する。非同期iteratorは
next待機まで測り、累積時間を実時間として合算しない。原本・本文や実パスは製品UIに追加しない。

対象prefixへ直接到達する最初の候補では、entries回数は減ったがdirectory lookupが増え、
実時間の改善を確認できなかった。これは採用根拠にせず比較証拠を保持する。

次の候補は、1回のfreshな`OpfsFS.list`の内部だけで、独立したdirectory iteratorの待機を
最大4workerまで重ねる。呼出し全体で上限を共有し、空きがなければ同じworkerで直列巡回する。
全directoryをqueueへ保持したり、再帰ごとに4並列へ増幅したりしない。同じiteratorのnextは
直列とし、失敗が分かったら新規処理を止め、開始済みの操作とiteratorの終了を待ってから拒否する。
最初の失敗を保持し、終了時の二次エラーで置き換えない。成功は全worker終了後のsort済み完全一覧だけ。

handle・entry・検証結果を別listやwrite/readbackへ保持しない。既存の字句prefixと枝刈りを保ち、
存在しない／fileで塞がれた経路の空結果、新規・削除・置換の反映と、権限／読取エラーの拒否を維持する。
callerの検証は従来どおりsort済み一覧から同じ順で行う。監査回数、管理記録のfreshな逐次読取、
正規writerの排他・書込照合・復旧順は変更しない。数値4は内部実行上限で、製品の容量保証ではない。

受入れは既存のprefix／freshness／失敗伝播試験、書込・再照合・改変拒否・中断復旧と、同一入力の
通常保存3回の前後比較（詳細probeを外した対照も含む）、PC／touch／完全終了offlineの接続試験。
深い木でもnative nextの同時数が4以下、held siblingの進行と失敗時drain／一次エラー保持を検証する。
実時間の効果を確認できた経路だけを採用する。
新しい容量／速度保証、schema、変換ID、依存、一般公開を含めない。

追加承認2026-11-10：[06f](06f-opfs-parent-lookup-proposal.md)は、4種類のreadonly読取に限り
親directoryのlocator hintを1個保持する別の方針である。上記listの寿命は拡張せず、
File／内容／検証結果と、write／保存後照合／復旧の検査は共有しない。採否・実行証拠はtodoを参照する。

## 6. Ki-84の同一素材消費と不要な再構築の評価（2026-11-09）

POはKi-84の本文編集→保存→cold再開の計測・改善と、過剰な確認／複雑化の再評価を指示した。
固定51,270,879B入力のSHA・103Caption・43素材・元3変更を基準に、現行HEADから3回計測する。
異なる時期・入力の過去値を改善前へ流用しない。実行証拠と残件はtodoに集約する。

`OriginBlobStore.openReadOnly().stream()`で検査した同じ消費を、capture／ZIP writerが再度SHAする箇所を評価した。
実file-viewへ束縛したprivate WeakMapと消費ごとのEOFで外側SHAを省略する試作は、機能試験と実ファイル往復を
通過したが、利用者の待ち時間改善を確認できず**採用しない**。全比較値・試作ソース・試験は私的評価領域へ保持する。
I/O時間の比率で実時間を補正せず、初期測定・候補・旧ビルド再対照を区別する。合格になるまで走行を追加しない。

採用する変更は次の最小限に限定する。新しいWeakMap／bounded reader／partition APIを製品へ残さず、
既存のcapture／ZIP writerとすべてのSHA照合・予算・保存／復旧fenceを保持する。

- 既存checksum readerの所有copyを組込み`new Uint8Array(input)`で作り、入力subclassのslice／species
  hookにコピーを委譲しない。元bytes・type／size／count／長さの検査、外側への所有copyを維持する。
- reader取消状態をawaitの前後に確認し、取消済みの遅延EOFから完了callbackを通知しない。
  正常EOF、AbortSignal、failure callback、upstream cancel／lock解放の既存経路を保持する。
- 同じowned durable sourceのJournal baseHeadsは、全履歴から別documentを再構成せず既存のheads getterを
  利用する。どちらも同じdocumentのsort済みheadsで、保存内容／read／検証／transaction fenceを変えない。

受入れはsubclass入力・借用bufferの所有、遅延EOF中の取消／abort／正常完了、既存の改変拒否・保存照合・
中断復旧試験と、最終採用ソースでのKi-84実ファイル保存／cold再開で確認する。
試作3回の機能PASSは最終採用ソースの合格へ読み替えない。速度向上を証明したとは扱わない。

## 7. 通常Session読取の開始・終了確認（PO承認2026-11-09）

次の候補は、通常のselected generationで`MetadataProjectSession.read()`を**1回呼ぶ間だけ**、既存の
`withMetadataRead`と所有者束縛済みreadonly portsを使う案である。当初の3経路へ4つ目のconsumerを追加する
契約変更であり、独立設計レビュー後にPOが承認した。stagingの許可consumerは増やさない。
狙うのは本文command前のread、公開後readback、初回／cold再開のSession読取である。通常の保存準備は
既に§2のscoped readerを使うため、この案でZIP生成／download自体が速くなるとは見込まない。

- その読取の開始・終了で復元管理情報、generation、factory／読取所有権をfreshに確認する。
  Journal／repositoryの読取候補は同じports内で作る。verifierの原本／内容検査は既存経路に保持する。
- `adoptRead`によるsource／provider／last／acknowledgmentの更新は終了確認成功後だけとする。
  成功後は追加awaitを挟まず同期的に採用する。開始・終了確認の失敗は外側で扱い、last／ack参照を更新せず、
  失敗を扱う時点の現在のlastに基づくrepair-requiredを返す。並行する別readの成功を古い値へ戻さない。
  未検査candidateをreadyとして公開しない。既存の読取エラー表現をthrowへ変更しない。
- 閲覧専用や復元pending時に許可されている読取を維持する。output生成用のassertEditableを流用して
  閲覧を禁止しない。命令／書込のeditable・lease確認は既存の独立した境界で行う。
- command前、write/readback後、公開後、復旧中に呼ぶ別々のreadは、その都度新しく開始・終了する。
  呼出し間の結果・body・証拠は共有せず、書込・Journal・公開・保存後照合・復旧fenceを統合しない。
- 途中の管理情報変更は終了時に検出する場合がある。既存§3と同じ外部ABAの限界があり、snapshot保証や
  途中即時検出を主張しない。終了確認の不合格は候補を採用しない。

承認後の接続条件：同じKi-84で各3回の処理別／全操作の実測、改変・欠損・Selection変更・lease喪失、
readonly／pending表示、別FS/factory、期限外／未完了reader、書込後／公開後照合とcold復旧を既存試験で
検証する。PC／touch・完全終了offlineと独立差分レビューを含め、実時間の効果がなければ採用しない。
新しい保存形式・ID・依存・容量保証・公開は含まない。

## 8. 保存成功直後の新しい履歴1件の反映（PO承認2026-11-09）

通常の新しいBackup生成に成功した直後は、生成コマンドの同じ所有期間内で確認済みの新job1件だけを
既存の履歴表示へ反映する案である。仕様06のsame-command presentation例外は現在current-source表示だけを
許し、readonly preview以外の出力後は全履歴を無条件に再照会する。本節はその**成功直後の表示用再照会**の
例外であり、独立設計レビュー後に§7とまとめてPOが承認した。

- 新jobの行は、実ZIP全検査・durable input再検査・artifactVerified書込／読戻し・外側Session fenceと
  Sender package操作がすべて成功してから採用する。実jobのID、検証済みStartの名前、所有済みsourceのtoken、
  実出力の検査で確定したHEIC対応要件・編集者名の含有flagsを使う。編集者名そのもの、FS・Job object・digestの
  検証能力をUIへ渡さず、表示情報をサービスの許可証へ使わない。
- 既存same-command presentationの確認を再利用し、同じHost connection／FS／Session／Senderと、readyな
  source／providerのtoken・proof・publicationに限定する。変更・閉じる・unknownな状態では行を
  採用しない。stale:falseなどを推測しない。必要な事実を得られなければ現行の全照会へ戻す。
- 実ファイルの説明と名前には新jobの実際の情報を使う。生成前の説明との差があれば現行の再確認を維持する。
  原本・ZIP・completion・保護対象・download時のfresh全検査と、書込／公開／復旧のfenceは変えない。
  Serviceの通知は変更不能な値とし、Hostは既存の表示行と同じ所有copyを持つ。`stale`未確定でも、同じtokenの
  generated行について実際に観測したdownload開始は表示できる。ファイル照合済み／現在内容との一致へは読み替えず、
  それらには従来どおりfreshな照会結果を要求する。
- 変更されていない過去のjob／base表示は直前の表示情報を保持する。**過去履歴の破損を表示する時点は次の
  全照会まで遅れる場合がある**。これは意図した表示・検出時期の変更で、過去行のfresh保証を主張しない。
- 失敗、retry／中断再開、初回／cold起動、明示的な全照会は現在どおり全履歴を新しく確認する。
  Workspace等のbaseを追加する生成、選択出力、独立コピー、保存ファイル照合は今回の例外に含めない。

承認後の接続条件：既存行を欠損／重複させず、新行の説明・名前を実ファイルと照合する。HEIC／編集者名の
事前説明との差、owner切替・期限外callback・各段階失敗・retry／coldの復旧を検証する。過去履歴を改変した
場合、新fileを渡す検査は維持され、次の全照会で過去の破損を検出することを確認する。同じKi-84で3回測り、
生成・履歴照会・downloadを分けて効果を確認できた場合だけ採用する。保存形式・ID・依存・公開は変更しない。

## 9. 残る待ち時間の観測と操作の整理（2026-11-09）

POはPC／スマホの快適化を継続し、具体的な改善点がなくなるまで実装・検証するよう指示した。
本節は既存契約内の実行・表示の整理であり、追加の検査例外や新しい製品方針ではない。

- 任意のdata-only診断callbackで、素材ごとのopen／ZIP add、control／original add、ZIP close、
  close後のpipeline待機を分ける。固定の工程名と経過時間だけを通知し、原本path・digest・本文を渡さない。
  callbackの例外は成功／失敗・取消・返却内容に影響させず、消費順・SHA／CRC・所有copy・予算・backpressure・
  write／readback／復旧fenceは変えない。native write／closeとLong Taskは私的ブラウザprobeで分離する。
  body-addは読取／SHA／CRCとsink待機を含み、pipeline-waitはZIP close後の残りだけである。
  並行区間を合算してI/O時間と呼ばず、probeなしの操作時間と区別する。
  初回復元のfact-saveも、固定のfact種別ごとにreceipt読取・inventory前後・executor・receipt保存を
  同じ任意callbackで分離できる。通知にrecord・path・digestは含めず、保存後照合・順序・証拠の
  寿命は変更しない。receipt保存の合計を純粋なwrite時間と呼ばない。
  2026-11-12の純計算評価（GSのSH重み・行scratch、GLBの頂点scratch、復元controlの
  canonical UTF-8サイズだけを使う箇所の不要SHA）は撤回・未接続。同じ式・走査・検査境界を保った
  候補だったが、固定した実データ比較で無劣化と効果を確定できなかった。変更前にもGS復元の
  待機上限到達があり、環境負荷を原因と断定せず、失敗状態と全観測を保持する。診断追加だけを残し、
  デコード結果の共有、SHA／CRC・abort・I/O境界の省略や検査寿命の拡張は採用しない。
- 通常再開で不要な初期化案内の探索は、必要性を実測したうえでsource-lessの案内を決める場面へ限定できる。
  unknownをfalseと扱わず、その案内の前には従来のfresh探索を行う。原本／Session／内容／復旧検査は省略しない。
  今回は未採用。先行閲覧の接続で記録を読める待ちを先に減らし、初期化案内のfresh探索は保持する。
- 同じ描画観測内のピン対応付けは同じidと検査条件のままMapへ整理できる。別frameやownerへ証拠を保持しない。
  添付・描画調整のDOMとfocusは、同じ対象の操作の続きを保ち、別対象・失敗・dispose・利用者のfocus移動を奪わない。
  多数添付で説明編集を終えたときや描画設定の内容をスクロールして適用／取消したときは、
  復帰先を画面内へ戻すことまで確認する。固定フッターが見えるだけでは完了としない。
  同じ説明IDを持つ親labelがある場合、説明の位置だけをlabel全体の矩形で決め、欄名・説明入口・値を覆わない。
  実際のfocus／所有者／IME／表示・取消条件や、カメラの明示配置を変更しない。
- immutableな描画入力のtoken／pins／previewの署名は、admitDisplay成功後の各updateで（同じobjectでも）
  display代入と同じ位置に確定する。idleを含む各RAFでは保存した署名と既存serial／pose／size／backgroundを
  別々に比較し、pins全体の反復JSON化を省く。blockedNextで現署名を変えず、非表示時の保持とframe／pick／
  再入／非同期resident／camera-only通知は維持する。renderer loop、profile、描画品質、adoption gateは変更しない。

通常の直接再開にも既存01e§9のreadonly先行閲覧を接続する。freshなSession.readの終了監査成功後、Project/runと
incoming proofの一致を確認し、restore-pendingでないreadyなsource/providerから既存ResumeReading DTOの所有済み
文字列だけを任意observerへ渡す。新規作成・ファイル取込・初回復元・review-copy・repair/pending/source-lessは
この通知に含めない。source/provider/FS/command portは渡さず、受信・出力履歴・初期化案内の探索と検査は従来どおり
完了まで続ける。Hostの完成・編集・保存・復旧判断を早めない。診断通知と同様、observer失敗はHost成否を変えない。

通知先は同じopening/run/disposeの所有期間だけで既存createResumeReadingを表示し、完成後の既存IME待機と
検索・選択移送を使う。自動再開で既にreaderがある場合は通知で作り直さない。失敗・owner切替・disposeで通知を
失効させ、未完了の復旧／失敗導線へ戻す。直接再開中の閲覧・検索・本文、編集／保存port不在、遅延callback拒否、
失敗とdispose、IME／選択移送を検証する。Catalog／Hostの各独立検査やsaved編集内容の確認は省略しない。

専用ChromiumのKi-84診断では、出力中のSHA圧縮に自己CPU約2.47秒、Long Taskの最大508msを観測した
（診断1回であり速度保証ではない）。次の内部スケジューリングを評価する。raw入力chunkを検査し全量を所有copy
にしてから、同じSHAへ64KiBずつ順に渡す。内部目安8msを超え、同じchunkの残りがある場合だけ既存の
task-yield方式を用い、前後でabort／cancelを確認する。借用bytesのままawaitせず、取消後はchunkや完了通知を
返さない。raw chunk数／サイズ／全量の予算と外側へ返すchunkは変えない。

ZIP検査でも既存1MiB native読取／64KiB論理検査／block後yieldを保持し、block内の論理piece間で同じ
時間条件のtask-yieldを許す。yield後にはowner／abortを新しく確認する。CRCと各SHAに渡す全bytes・順序・
native／logical読取予算・完全検査後の採用は保持する。8msは内部の協調実行目安で、停止上限や性能保証ではない。
最初のawait前にcopyを完了し、yield中の借用元buffer改変、取消／abort／正常完了、lock解放と既存の改変拒否・中断復旧を検証する。
同じKi-84で操作全体の時間と停止を比較し、効果を確認できた範囲だけ採用する。

追加のtask境界は`core/taskYield`の純粋な内部関数へまとめ、blobStream／zipArchiveだけから参照する。
各呼出しで一対のMessageChannelを所有し、null通知後に両portとhandlerを解放してから戻る。
未対応・初期化／送信失敗・messageerrorでは作成済み資源を解放して既存timerへ戻す。
片方のclose失敗でも他方の解放を試み、解放失敗は拒否して保存や検査を成功扱いしない。
遅延／二重通知を無視し、永続queue・port共有・worker・bytesの送信は導入しない。
既存ZIPのblock後timerとすべてのowner／abort確認は維持する。task sourceの優先順やpaintを保証せず、
旧timerとの実時間・停止比較と、両port解放／失敗／fallback・保持したtask中の取消で採否を判断する。

受入れは同一Ki-84／small fixtureの実操作・処理別計測、既存の改変拒否・保存照合・中断復旧、PC／touchの
keyboard／focus／IME／切替を用いる。実測で効果のない高速化案は採用しない。新しい検査寿命の集約や弱参照の
fallback変更は本節に含めず、必要になれば独立した仕様判断を行う。一般公開・実機Safari合格を含まない。

描画の適用・取消・設定解除後は、既存の所有対象・完了条件・利用者のフォーカス移動の確認を通過した場合だけ
入力位置へ戻す。この同期focusイベントでは任意の説明を自動表示せず、結果の3D表示を覆わないようにする。
入力欄の自動スクロールとaria-describedbyは保持し、次のTab移動・説明入口・2秒hoverでは従来どおり説明を読める。
抑制は対象要素と同期呼出しの間だけとし、永続フラグ・タイマー・保存状態を追加しない。

### 9.0. 復元済みgenerationの完了readから本文を先に渡す（PO継続指示2026-11-11）

既存のdata-only先行閲覧を、openingで既に完了したfresh Session.readにも接続する。
検査結果・source/providerを後続のHostへ採用する変更ではない。実装前の境界を次に固定する。

- `BackupRestoreJob.openSelected`のarchive／Journal／Session／repository／全body／bases検査と
  closing scope.checkが成功した既存callback内で、`validatedResumeReading`から所有済み文字列DTOだけを
  同期的に作る。後で変換するためのMetadataSessionRead／source／providerは保持しない。
- generation接続が成功し、最新controlsからrestorePendingでないと確認できた通常再開だけを対象とする。
  run／proofのProject／provider tokenの一致とreadyを確認し、通知前に既存connection.checkをfreshに行う。
  新規・incoming・review-copy・first-backup復旧／失敗・source-lessは除外する。
  first-backupの目的は通常Hostへの引継ぎ前にも保持し、除去済みのflagから通常再開と推測しない。
- 外部observerをopeningの下層callback内から呼ばない。接続成功後に一度だけ通知し、observer例外は
  Hostの成否に影響させない。openingの完了readがない元generation等は、従来のHost read後へfallbackする。
  後続の独立Host Session.read、incoming照合、受信／出力／初期化の探索・検査をすべて残す。
- 既存readerとopening/run/disposeのowner、失敗時の撤去、IME完了待機、token／Scene一致時だけの
  検索・選択・focus移送を使う。既存readerを作り直さず、readonly表示から命令・保存portを渡さない。
- `validationGeneration`の任意の内部診断callbackは、完了readの通知と呼出し目的を明示する。
  Catalogはcatalog.destination、Hostはhost.destinationの既存計測名を保つ。通知の有無で目的を推測しない。

受入れは、復元済みの保存本文を持つfixtureで後続Host readを保持し、その間の本文閲覧・検索、
命令／保存port不在とIME／選択移送を確認する。opening検査／終了確認／selection失効・pendingでは通知せず、
後続失敗・dispose／owner交代・別tokenを従来の失効／handoff照合で扱う。元generationのfallbackと
各目的の除外も保持する。Ki-84の3+3比較では、一覧の出現と実際に本文を開いて読めた時点を別に測り、
保存ファイル・履歴・全素材の照合とcold編集／3Dの結果を維持する。実時間の効果がなければ採用しない。

### 9.1. 同じfreshな管理情報と出力streamの内部整理（2026-11-10）

POの本文編集→保存→再開の改善指示に基づく内部実装候補であり、実時間の採否はtodoに記録する。
§5の非採用direct-directory探索や§6の非採用SHA証拠再利用を再接続しない。
新しい検査寿命・読取省略・保存形式・依存・速度保証は追加しない。

**Native管理情報のbyte読取候補は不採用。** 下記の限定設計・故障試験は確認したが、
最初のKi-84比較では編集・保存の改善条件を確認できず、factory／WeakMap／fast readerは製品から外した。
負荷変動を補正して効果を主張しない。実測と候補ソースは私的評価領域へ保持する。
管理情報は従来のstreamで消費する。別に切り分けたZIP転送／空flushの整理も、
Ki-84の操作全体で実用的な改善を確認できず不採用とした。両候補の製品コード・依存は残さない。
以下は再接続を認める仕様ではなく、不採用候補の設計記録である。

- `platform/nativeFileSnapshot`は、`OpfsFS.readStream`がその呼出しで取得したFileと、
  既存と同形の返却viewだけを結ぶprivate WeakMapを持つ。size/stream/blobのown data descriptorを
  登録し、正確な同一view・同一descriptorのときだけ、既存上限内の全量Native byte読取を使える。
  保持するのはFile参照とview識別情報だけで、bytes・digest・検査結果・FS・権限・pathは保持しない。
  Native readerの呼出しごとに全bytesを所有bufferへ読み、結果を再利用しない。
- `restoreControls.freshControlReceipt`だけがこのreaderを使う。独立したinventoryのsize-only openと
  その後のfresh `readStream`、receiptの意味検査順・累積budget・上位の開始／終了監査は従来どおり。
  Materialize前にBlob intrinsic sizeと登録size・view sizeの全一致／既存上限を確認し、全長と
  終了時のdescriptor一致を確認してから既存のfatal UTF-8／canonical JSON／shape照合へ渡す。
  超過／不一致／読取失敗は拒否し、stream成功へfallbackしない。
- 未登録・clone・Proxy・事前にsize/stream/blobを差し替えたviewは従来streamへ残す。
  読取中にviewが変われば結果を拒否する。generationScopeのviewは常に別objectなので未登録であり、
  body／EOF前後のowner確認を省略しない。MemoryFSとcustom viewも従来の全stream検査・取消・解放を使う。
  `WorkspaceFS`の公開interfaceは変えず、factoryの製品importはOpfsFS、readerの製品importは
  restoreControlsだけへ限定する。UI・viewer・保存権限への依存は加えない。
- ZIP生成の内部identity bridgeを省いて、既存のSHA／1MiB集約transformへwriterを直接接続できる。
  外側BackupOutputJobのFS bridge、raw chunk予算・消費順・所有copy・backpressure・全量SHA/CRC・
  EOF/close/pipeline待機・失敗時のcancel/drainは維持する。OPFS writerもpending bytesが無い場合の
  空flush awaitだけを省ける。実際のwrite/flush/close/abortとその失敗は従来どおり扱う。

受入れは既存のfresh-open／inventory非消費・改変／欠損／stream読取／cleanup失敗を変更せず再利用する。
Native経路にはfull size／上限・arrayBuffer拒否・非canonical／invalid UTF-8／長さ不一致、同一viewの
差替え／getter・読取中変更の拒否、wrapper／generation viewの非適用を追加する。
借用buffer・sink失敗・取消・pipeline drain・保存後照合・中断復旧を維持し、probe無しの同一Ki-84と
大容量SH4の操作全体で効果を確認できた範囲だけ残す。物理I/O件数の削減やSafari実機合格とは扱わない。

### 9.2. 再開表示の独立した履歴照会を重ねる評価（2026-11-11）

POの全体回帰・Ki-84／50万点GSの待ち時間改善指示に沿う、既存契約内の内部scheduling評価。
独立設計レビューで新しい検査寿命・保存権限・製品方針を追加しない範囲を確認した。
**評価結果：未実装のまま不採用。** 固定61c5f9aの大GS通し試験の非重複stage残余から、
コピー作成直後のScene照会上限18.2ms、原Projectのcoldで50.3msを観測した。
最終復元先coldの残余395.6msは100ms未満の根拠にはならないが、3つの独立したreadiness検査や
約9秒のReview照会全体を省く案ではない。限定的な効果へ並列制御・故障試験を増やさず直列を維持する。
この単回の上限解析を速度改善・一般端末の保証と扱わない。以下は接続しなかった設計と受入条件である。

Hostの1回の`reloadReceive`内で、互いに依存しない`sceneAppendStates`と`ReviewEditJob.states`だけを
開始する。各照会は従来どおり独立したfresh検査を行い、両方の完了を待ってから表示状態へ反映する。
同じfs／session／接続と未終了のHostだけが結果を採用する。終了時も開始済み照会をdrainする。
失敗側の以前の表示配列とerror、Review失敗時のcompleted-child Map全破棄を維持する。
その後の`receiver.jobs`は成功したReview Mapへ依存し、`reloadOutput`は全中断状態の確定後に行う。
各照会と並列区間を別に計測し、重なる時間を加算しない。

ファイル／receipt／source／検査結果を別の読取へ共有せず、Sessionのwrite／Journal／公開／保存後照合／
cold・中断復旧の順序や検査を変えない。失敗を成功へ変えるfallbackや自動再試行は加えない。
受入れは両照会の進行・失敗後のMap破棄／以前の状態保持・終了中の結果不採用、既存の改変拒否と復旧、
PC／touchの再開・保存を確認する。同じ固定Ki-84／50万点SH4各3回の実時間を比較し、効果がない候補は戻す。
新しい容量／速度保証、依存、形式、公開は含めない。

### 9.3. ZIPのblock末尾のタスク切替を統一する限定評価（2026-11-11）

**評価結果：限定実装・各3回の実操作比較済み、不採用。** Ki-84保存は中央値17.435→17.851秒、
50万点GSは24.712→24.429秒で、実用的な短縮を確認できなかった。GSの保存済み本文表示は
6.298→7.207秒だった。小さな初回検査短縮や一部復元の改善だけでは採用しない。
元のblock後timerへ戻し、この候補だけの追加試験・応答性診断も私的評価領域へ保持した。
検査省略や新たな許容値で合格させず、実測と撤回理由はtodoへ集約する。
以下は評価設計の記録であり、製品への再接続を認めない。

POの待ち時間改善・内部cleanup指示に沿い、独立設計レビュー済みの既存契約内の評価とする。
§9の「既存ZIPのblock後timerを維持」は前sliceの除外条件であり、今回に限って下記の1箇所を更新する。
検査結果の寿命・検出時点・権限・保存形式を変える承認ではない。実時間と安全性を確認するまで採用としない。

`PackageArchive`の1MiB native block末尾で、残りがある場合の`setTimeout(0)`を、既存のone-shot
`yieldTask`へ統一する。64KiBごとのlogical piece、全bytesのSHA／CRC、raw予算、block内部の8ms協調境界、
前後のowner／abort確認を維持する。読取を省略・先行せず、既存helperの両port解放・失敗伝播・timer fallbackを使う。
共有queue／永続port／新しいcache・worker・依存を作らず、書込・公開・fresh読戻し・生成物照合・復旧fenceは変えない。
task sourceの優先順やpaint順、一般端末の速度を保証しない。

受入れは既存のtimer取消→次native block未読を緩めず、block末尾のheld yield中のabort後にも
次blockを読まず拒否する決定的試験を加える。owner喪失は既存のinspect後・終了fenceで不採用にする。
元の失敗・上限・改変・欠損・完全SHA／CRC・取消とtaskYieldのport解放／fallback試験を維持する。
同じKi-84／50万点SH4の各3回で実操作と応答性を確認し、PC／touch、offline、保存後照合・中断復旧を通す。
効果がない、取消や応答性が悪化する場合は戻す。実行証拠と採否はtodoへ記録する。

### 9.4. 本文変更の開始時に同じ内容を二度組み立てない

本文・タイトル変更を受け付ける際は、既存のSession読取の開始・終了確認の内側で
Journalの最新公開記録、DBの現在の全head、記録と素材の照合結果を一組として取得する。
DBの全headと公開headが完全一致し、終了確認まで成功した場合だけ、この命令に渡す。
未公開head、未完了処理、保存済み素材の欠損、古い編集画面は書込前に拒否する。
通常閲覧では従来どおり公開時点の履歴を読める。再開処理では現在headが保存した基点と
一致するとき、同じ所有済み履歴を基点として使う。不一致なら履歴を基点まで読み直す。
書込、保存後の全量照合、公開前後、復旧と別命令の検査は独立したままとする。
受入れは復元済みKi-84の本文変更・外部保存・再開と、未公開headを含むDBでの書込拒否。

## 10. 管理記録1件の読取を独立した単位にする

Status: **PO承認2026-11-10 —限定実装・Ki-84／50万点SH4の比較評価済み・不採用**。
機能・故障試験は通過したが、操作全体の実用的な短縮を確認できなかった。
全比較値と試作ソース／試験は私的評価領域へ保持し、製品は元のper-I/O経路を維持する。
以下は承認した評価範囲の記録であり、自動的な再接続を認めない。

### 利用者の結果と根拠

本文1件の編集、ファイル保存、再開の待ちを減らす。2026-11-10のKi-84診断では、
編集中のnative write5回が合計約8ms、close5回が約5msなのに対し、getFileは2707回、
directory取得は16305回だった。保存中はwrite58回が約299ms、close10回が約22ms、
getFile5221回、directory取得31722回だった。重複する非同期処理の合計であり、
これらを足して操作時間や改善見込みとはしない。診断と通常計測はtodoで区別する。

`readReceipt`は1件の小さいJSONを、size確認用の`readStream`と別のfresh `readBytes`で読む。
通常generationのpublic portでは、それぞれの前後に復元管理情報の全監査が入り、
1件の読取で最大4回になる。提案は、この**1件の純粋読取の開始と終了に各1回**を行うこと。
Native管理情報のbyte読取候補やSHA証拠再利用を復活させず、既存のreadonly portを使う。
速度目標・対応容量・保存形式・依存は追加しない。

### 厳密な範囲と検出時期

- 対象は既存のnormal登録を持つgenerationの`readReceipt`1回だけ。`BackupRestoreJob.openSelected`の
  接続に加え、`openValidationGeneration(create=true)`が既に登録している元世代
  （`generationId:null`／`allowCreate:true`）も含む。登録対象を増やさず、stagingは含めない。
  既存`withMetadataRead`へ渡す
  callback内で、derived fsを使ってsize-only open、別のfresh全量読取、長さ確認、fatal UTF-8、
  duplicate member拒否、予算・canonical JSON検査をすべて実行する。成功結果は終了時の
  全監査が成功してから返す。内容・digest・File・FS・監査済み証拠をキャッシュしない。
  callback自身が失敗した場合は、成功結果を返さずnormal `readOperation`の既存の例外処理を保つ。
  この場合の終了監査を新しく保証しない。stagingの失敗時closing契約も変更しない。
- 既存の読取権限を維持し、readonlyの閲覧へ`assertEditable`条件を加えない。
  読取owner・selected generation・scopeの失効は既存の確認で拒否する。mutation lease喪失に
  対する書込拒否は、既存のwrite／`underWriteLease` fenceで維持する。
- public/default portのper-I/O監査は変更しない。root/custom FSは従来動作、stagingは
  未承認consumerとして従来のstrict fallbackへ残す。既存のnamed読取に渡されたderived fsは
  登録対象でないため、既存の外側closing監査を使い、新しい入れ子の監査や登録を追加しない。
- `writeReceipt`全体を囲まない。前値の読取、実際のwrite、書込後のfresh読戻しは別々の段階。
  前値と読戻しの各`readReceipt`の内部だけが対象であり、両者を共有・統合しない。
  **書込後の読戻しの成功結果も、全bytes検査と独立した開始／終了の全監査を通過してから受け入れる。**
  `underWriteLease`、個々のwrite前後、Journal、publication、Selection、保存後の実ファイル照合、
  ダウンロード直前の新しい照合、中断復旧の外側境界は維持する。
- 変更点は管理情報の検出時期。size確認と内容読取の間の管理情報改変は終了時に検出する場合がある。
  終了監査まで残る復元管理controlの同じ長さの破損・Selection変更は拒否して結果を返さない。一時的な外部改変が
  終了前に元へ戻るABAは、この単位の監査では検出しない場合がある。snapshot保証は追加しない。
  読取対象のreceipt自身がcanonicalとして有効な別値へ変わった場合は、`readReceipt`単独で
  意味の正誤を保証せず、従来のcallerによるJournal・参照・期待値照合で判断する。
  `writeReceipt`の書込後比較も従来の`json`全値一致を維持する。
  これは§4の「これ以外はpublic I/Oごとの監査」への、PO承認済みの限定例外である。

### 受入れと採否

既存のgeneration／persistence／Journal／output／復旧試験を再利用し、次を追加・確認する。

- size用openと内容のfresh再読取を維持する。対象receiptの欠損・過大size・読取失敗・非canonical・
  invalid UTF-8、復元管理controlの同サイズ破損、終了時Selection変更、読取owner失効・disposeで
  成功結果を採用しない。有効な別値への差替えは既存callerの期待値照合で拒否する経路を確認する。
- 既存のreadonly facadeへwriteできず、callback由来portが期限後に使えない。並行する別の
  public読取を軽量化しない。既存named読取は余分な入れ子監査を増やさない。
- write失敗、torn receipt、書込後の読戻し改変、読戻し終了監査失敗を拒否する。次のJournal／
  publicationへ進まない。書込権限喪失も従来どおり拒否する。改変した既存記録を上書きして修復扱いにしない。
- staging／未登録FS／原本の読取、書込・確定・復旧の監査を変更しない。改変拒否、受信中断、
  元ファイル再選択、手元編集保持、返送、cold再開を既存の代表経路で確認する。
- 同一Ki-84・50万点SH4を独立した専用Chromiumで各3回比較する。本文適用、ファイル生成、
  実ファイル取得、記録の先行表示、編集可能、3D表示を分ける。機能試験合格だけで採用せず、
  操作全体で効果と安全性を確認できた範囲だけ残す。新しい許容遅延や再試行で合格させない。

実装時はrootのcheckpoint、PC／touch、専用offline、HEIC隔離、独立最終レビューを行う。
実機iPhone／Safariの合格・一般公開は含めない。効果がない場合は内部変更を取り下げ、測定を保持する。

## 本文編集の保存タイミング再検討（2026-11-13・設計案）

対象は復元済みPC候補でタイトルと本文だけを編集する操作。第一候補の限定評価と、
効果・安全性を実測で確認できた場合の接続は2026-11-13にPO承認。第二候補および
単一DB方式は未採用。成功通知を先送り／先取りするUI変更はこの承認に含まない。

Ki-84の交互計測で、新版の本文適用3回はそれぞれ復元管理領域を89回列挙し、ファイルを
623・623・624回開いた。同じ区間の書き込みは各回とも変更バイナリ1回、管理用テキスト4回、
DBへの保存1回。モデル・写真を書き戻すストリームは0回だった。回数は1回復元した実データの
値で、すべてのプロジェクトに共通する定数ではない。

| 利用者の操作 | 必要な保存と画面の反応 |
| --- | --- |
| 文章を入力、日本語を変換、検索、カメラを動かす | 入力・表示をその場で更新する。未適用の文章は現在の画面の下書きで、強制終了すると失われる。 |
| 本文とタイトルを「変更を適用」 | 変わった項目を一つの変更として端末内で確定する。実際の変更がなければ保存処理を始めない。完了表示は強制終了しても同じ内容に戻れる時点に限る。 |
| 写真を添付、ピン位置や開始視点を確定 | 写真は明示的な追加時に原本を登録し、その後は参照を使う。位置・視点は確定した結果を記録する。本文と写真を同時に適用し、写真だけ失敗した場合は、確定した本文を保って写真を再試行できる。 |
| ファイルに保存・共有 | その時点の確定済み状態と対象原本から持ち出すファイルを生成し、照合する。通常の編集からZIP生成を起動しない。 |

**評価の第一候補。** 本文だけの確定を既存の編集ロック下の1操作として扱う。
操作開始、DBへの確定直前、他の画面に見える状態へ公開する直前、公開結果を読み戻して
成功を返す時点に、対象プロジェクト・復元状態の新しい確認を置く。四つは評価する境界であり、
必要な回数の保証ではない。同じ段階の細かな読み書きは操作専用の保存先に限る。
各書込みの権限、変更履歴・書いた本文の読み戻し、復旧時の厳密な検査はそれぞれ維持する。
別タブや古い操作からこの一時的な権限を使えないこと、操作が失敗したときは以後の書込みと
成功通知を止めることを検証する。段階の途中で復元情報が別内容に差し替わると次の境界で検出する。
途中で元に戻る改変を常に検出する保証はできない。既存の仕様06の書込み前後の契約を変更するため、
効果と安全性の両方を確認できた範囲だけ製品へ接続する。

比較対象として、モデル・写真を伴わない本文変更に限り、本文の変更データ・元の版・
新しい確定位置を同じ端末DBの1取引で保存する方式もある。途中終了で三つとも入るか、
いずれも入らないことをDB側で担保できれば、本文1件にファイルをまたぐ確定処理を
適用する必要が減る。ただし現行の再開・受信・書き出しは、既存の履歴の確定記録を読む。
別の正本を増やしたり、後から失敗しうる二重書込みで同期したりする設計では採用しない。
履歴・既存バックアップ・共有時の識別が一意に保てること、同じ操作IDでやり直しても
一度しか反映されないことが実証できる場合だけ、保存設計の変更案として比較する。

判断には同じKi-84で本文の入力・適用・再開を比較し、確認の回数、開いたファイル数、
操作を続けられるまでの秒数を別々に使う。通常の適用、無変更、IME取消、2タブ間の競合、
保存権限の失効、各段階での強制終了と再開、故意の差し替え、直後の保存・共有で見える本文を調べる。
適用成功を表示した後は必ず新本文へ戻せること、回復できた変更が正確に1回だけ反映されることを
必要条件にする。現行では準備開始の記録だけが書かれ、変更データ一式の準備確定前に
ブラウザを強制終了すると、再開先で通常編集に自動復帰できない場合がある
（`incomplete-staging-repair`）。この段階の入力を復元できたことにしない。
検証では前の確定済み本文の保全と編集再開の可否を分け、復旧処理を勝手に進めない。
この窓もなくすには、準備データと準備完了を一つの永続化処理にする等の追加設計が必要になる。

**待ち時間が残る場合の第二候補。** 「いつデータを守るか」と「いつ次の操作を始められるか」を
分ける。既存の復旧記録に今回の変更と元の版を書き、読み戻せた時点で、閲覧や次の本文入力を
再開できるか評価する。状態表示は「端末に保存中」とし、確定済み本文との区別が必要な検索や
プレビューにはその旨を示す。未完了のあいだ、次の変更の確定・共有・ファイル出力・外部からの
取り込みは先行させない。完了前に終了しても同じ編集を一度だけ復旧できることを強制終了で実証する。
表示が先に変わるだけの高速化を避けるため、次の入力開始と実際の保存完了を別々に計測する。
この案で新たに入力した未適用の文章は通常の画面内下書きと同じ扱いになる。

別のUI方針として、本文は「次の記録」へ進むときに自動で確定することも考えられる。
通常の写真確認・スクロール・入力欄からのフォーカス移動は、記録の完了意図を示さない。
特に一つの記録を複数シーンで共用している場合は、移動だけで他シーンの本文まで更新される。
まず明示的な確定と取消を保ち、速度改善とは別に、この操作の意味を変える場合だけ判断する。

「ファイルに保存」まで複数の記録変更をすべてメモリに置く方法では、アプリの終了で最後の
ファイル出力以降の作業を失う。全記録をまとめて保存したい場合も、確定操作を小さい端末内の
変更として先に残し、外部ファイルの生成だけを明示操作にまとめる方を優先する。

今回の計測では、キー入力ごとの保存や写真の再書込みは見つからなかった。一定秒ごとに
全変更を保存するタイマーや、終了時にまとめて保存する方法を先に追加しても、
今の適用時の重複は解消しない。強制終了前の未確定の文章まで引き継ぐ要件が加わった場合は、
端末内の下書きを別に評価する。誤って共有・自動確定したり、別タブの新しい本文を上書きしたり
しないことを条件にする。

### 本文の書き込み前の確認をまとめる

復元完了後の同じ編集権限でタイトル・本文だけを変更する場合、編集用コピーの未完了処理、
現行の履歴と保存先、変更予定の内容を一つの読み取り区間で検査する。モデル・写真の
検査記録はその区間内の保存先から読み、原本が存在することは従来どおり別に確認する。
区間の終了前に検査結果を採用しない。編集権限、保存先と復元の完了状態を改めて確認してから
準備中の変更を保持し、最初の書き込みに進む。確認に失敗した準備は破棄する。
無変更なら書き込みを行わない。保存の途中で終了した場合と成功後の読み戻しには既存の検査を使う。
別の操作や写真表示にはこの区間を貸さない。適用前や最初の書き込み前の強制終了では、
前回の確定済み本文を保ち、入力中の文章は失われることがある。

同じKi-84の実画面で、適用から最初の書き込みまでの確認回数と待ち時間、
適用完了までの時間を測る。準備中の管理情報差し替え、無変更、古い版、原本や検査記録の
欠損、準備後の強制終了、出力したファイルと再開後の本文を確かめる。

同じ本文編集の書き込み前に、現在の状態と編集予定の状態の両方を検査する。
同じ検査規則・対象・条件の検査記録、および同一の完全な原本参照は、
その編集の準備中に一度ずつ確かめればよい。検査記録と原本の存在は別々に確認する。
異なる条件、欠損、検査失敗を成功として再利用しない。原本や記録が確認後に
差し替わった場合、次の独立した検査で判明する。書き込み開始前に一時的な
結果を使い終え、書き込み後の全照合・再試行・中断復旧は新しく読み取る。
検査記録・原本の管理記録は、開いた一つのファイルからサイズと内容を照合する。
復元元の変更履歴と添付一覧も、同じ準備区間の復元検査で確認済みの値を使い、
今の文書に各変更が同じバイト列で含まれることと必要な読取機能を照合する。

### 確定した本文を表示するまでの照合

復元済みプロジェクトの同じ編集権限で、タイトル・本文を1件確定する場合に適用する。
書き込んだ文書を開き直し、全変更の原本との一致と表示に必要な内容を検査する。
確定記録を書いた後は、保存先、過去に確認した確定記録との連続性、今回の変更原本、
文書の現在の版と追加された変更、復元元との対応記録、未完了処理の有無を新しく照合する。
最初の書き込み直前にも、そこで読んだ履歴が準備時の確定記録と一致することを確認する。権限終了時の
確認に通った場合だけ、直前に検査した本文を表示し、今回の変更を確定済みに加える。
この間に別の写真や過去の変更原本が外部から失われた場合は、次の全検査で検出する。
再開、再試行、外部保存と復旧は従来の検査を行う。今回の変更・確定記録の差し替え、
完了表示の直後の強制終了、再開後の本文・変更件数と原本、Ki-84での操作時間を検証する。

### 本文を約1秒で確定するための評価

目標は「変更を適用」を押してから、端末へ確定したことが画面で分かるまでの約1秒。
同じKi-84・同じPCで新旧各3回、実際のクリックから完了文の表示後の描画までを
ブラウザ内で測る。保存操作を自動化した側の経過時間も別に記録する。

現契約内では、1回の文書検査で同じ親レコードと編集者情報を繰り返し取得する処理、
元バイト列が同順で一致するときの変更識別子の再計算、同じ画面更新中のキャプション一覧の
再構築を減らす。保存前には結合した文書自体を検査し、保存後には保存先を開き直す。
変更の欠損、余分な変更、順序が異なる履歴、編集者名、一覧・詳細の同期を検証する。

**PO承認 2026-11-14。** 厳密な検査に通ったプロジェクトを開いたまま、
同じ編集権限でタイトル・本文だけを直す間は、確認対象を文章とその履歴に限定する。
今回の編集の対象・元の版・保存先を照合し、書いた本文と確定記録を読み戻す。編集権限や
保存先の変更、未完了処理、編集対象項目の競合、競合の解消、写真の追加・削除ではこの経路を使わない。再開、外部保存、
共有と中断復旧では原本と過去の復元資料を従来どおり検査する。
完了表示の時点で別の写真や古い復元資料が既に失われていた場合、本文は確定できても、
次の全検査で再開・書き出しが止まり、失われた資料の復元が必要になる場合がある。
同一セッションが確認した確定履歴、現在の版、復元先を照合する。変更の実バイトが対象の本文・
タイトルだけを変えることを確認し、素材・条件・順序が全て一致する検査結果を使って
新しい版の表示を組み立てる。保存前後に実際の文書の版と変更バイトを照合する。
検証済みの元文書と新文書がある場合、各照合では保存先を開き、未解決の依存の有無、現在の版、
全変更の元バイトを比較する。同時編集で列挙順だけが違う履歴も照合する。今回の変更は復旧用に
書いた実バイトを読み、その1件を適用した後、保存した文書をもう一度開いて同じ全量比較を行う。
この一致が取れた文書について、各照合で表示や素材の検査を組み立て直す必要はない。
中断した処理の再試行では新たに全検査する。変更対象の取り違えの拒否、確定直後の強制終了、
原本欠損を検出する次の全検査、編集・書き出し・再開までの実測を接続条件にする。
