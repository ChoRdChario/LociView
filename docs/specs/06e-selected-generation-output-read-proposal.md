# 復元後の出力準備における読み取り単位

Status: **ACCEPTED —PO承認2026-11-08・§5を含む限定実装とWindows自動検証完了**。
§§7–8は**PO承認2026-11-09**。§§6–8の限定実装とWindows自動検証完了。
対象は通常selected generationの読取と新しいBackupの成功表示。実機iPhone・一般公開の合格ではない。
仕様06b §6.2のZIP証拠共有範囲を拡大しない。実行証拠と残件は[todo](../../tasks/todo.md)。
今回のGS協調検査・未確認ZIP整理は[仕様10](10-gs-loading-and-output-attempt-cleanup.md)。

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
