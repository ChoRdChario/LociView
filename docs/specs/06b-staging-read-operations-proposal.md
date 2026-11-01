# 復元準備中の、操作に閉じた読み取り監査

Status: **§§1–5 ACCEPTED —PO承認2026-11-01、限定実装・検証済み。§6はPROPOSED・未採択。**
安全境界・実差分・実行証拠の独立レビュー済み。正確な実行範囲・時間・残件はtodoを参照し、
一般の容量・速度保証や採用／公開合格へ拡張しない。
対象は[06](06-project-package-wire.md)の「Bounded read-operation audits」と
[06a](06a-first-backup-open-proposal.md)の復元準備。§§1–5だけが明示された純readの例外を認め、
それ以外のstagingの各I/O監査は維持する。01iとは別のPO承認であり、§6を含めない。
作業・実行結果は[todo](../../tasks/todo.md)を正本とする。

## 1. 利用者の結果と実測

高画素Projectの復元中に同じ所有者記録を何千回も読み直す増幅を減らし、原本検査・
中断復旧・公開前の確認を保つ。新しい画面や設定は追加しない。

以下は提案時の原因整理のための観測。承認後の同条件before／after比較と接続結果は
[todoの現在欄](../../tasks/todo.md)に記録し、この別条件の数値と混ぜない。

01iの専用Chromium／自前ローカルorigin／新しいpersistent profileで、実データの
バックアップから復元した。4Scene・103Caption・27添付・26画像・4視点・23材質設定。
元ZIP／モデル／画像の内容ハッシュ保持を照合した。初回復元はCaption／編集139.717秒、
3D147.558秒。内部段階はpersist8.518、open-staging5.754、initialize82.786、
projection2.876、display5.846、select15.672、adopt17.947秒だった。

復元確認から3D表示までの観測では、所有者記録のreadStreamが23,429回／52.949秒、
周辺listが2,422回／14.512秒、所有者記録のlistが2,406回／7.465秒。
native画像準備は195回／18.810秒。これらには包含・重複する時間があるため加算しない。
ファイル容量だけ、GPUだけ、画像decodeだけを原因とはしない。以前の別条件の163秒や
小規模データの94秒との速度比較でもない。
同じ復元済みProjectのオフライン書き出し121.671秒も観測した。この案はwrite fenceの
間引きを含まず、その待ち時間全体を解決するとは主張しない。

狙いは、必要な検査を同じ読み取りの内部で維持しつつ、所有者監査回数をI/O／chunk数から
明示的な読み取り操作数へ近づけること。秒数・削減率・全端末の容量保証は設けない。

## 2. 判断対象と変えない境界

既存のoperation-owned read-only FS／factory callback方式を、**復元準備中の純粋な
読み取り部分だけ**に延長する。`auditReadOperations: true`をstaging全体へ設定する案ではない。
`initializeBackup`、`Session.resume`、復元全体、Selection処理全体をcallbackで包まない。

各読み取り操作の開始と終了では、素のrootから従来の完全な所有者監査を行う。
閉じる監査の失敗は、callback内部のcatchや成功扱いで隠せない。次は従来どおり別々に
fresh検査する。

- 入力ZIPのCRC／SHA／実長、全体hash、metadata、source／closure／protected inventory。
- 保存後readback、Prepared後の永続本体再読込、元履歴とCASの確認、全canonical content検査。
- strict write、stream／close、journal staging、durability、publication、Selection前後、復旧。
- 既存の初回absence証明、所有者の参照同一性、FSとfactoryの組、Project／generation対応。

wire／ID／recipe／保存記録は変更しない。画像準備の成功や古いinspectionを、新しい
書込・公開・復旧の根拠へ流用しない。01hの検証時期変更は含めない。

## 3. 具体的なportと許可する読み取り

`generationScope`のcallback生成部分を内部helperへ整理し、同じroot／lease／正確な
generation factoryから、期限付きのreadonly FS／factoryを作る。StorageやUIへ公開しない。
`withMetadataRead`の既存Selected/original動作は保持する。stagingは一般の登録を有効化せず、
復元controllerが明示する純粋なsuboperationへだけcapabilityを渡す。

具体的には、`persistence`の内部登録を4つのclosed consumer名
`journal.entries`／`journal.validateParts`／`journal.readRestoredBases`／`repository.read`
に限定する。既存pure-reader呼出しだけがその名前を渡し、無名・対象外の呼出しは
staging公開FS／factoryのstrict経路を使う。selected／originalの既存登録は変えない。
generationのstaging owner portは同期`assertOwner(fs, factory): void`で、復元Jobが持つ
private mapの正確なpairだけを認める。各live確認はこの照合と`assertEditable`、
active／disposed確認を行い、rootの`pending`監査はentry／closingで実行する。
`openStaging`に既存signalが渡された場合は同じowner closureへ捕捉し、返却後のabortも
次live／closingで拒否する。通常の公開scopeやsignal未指定callerの取消契約は拡張しない。
readerがthrow／取消で終わってもclosing監査を行い、その拒否をreader内部で隠さない。
同authorityの`underWriteLease`を取り直さず、既存controllerのleaseを確認する。

最初の対象は、Journalの`entries`／`validateParts`／`readRestoredBases`とRepositoryの
`read`の、既存pure private-readerをstaging controllerが明示実行する範囲とする。
rootのlocal-restoreにある永続input.zipのinspectはgeneration namespace外なので、この
初回scopeから除く。`validateRestore`全体、`Session.read`全体、`modelFacts.stage`は包まない。

読み取り専用content／closure／projection／display検査へ広げる場合は、
`allowNewEvidence=false`、receiptを書くexecutor不可、CASは`openReadOnly`に限定する。
facadeからその操作専用のreaderを新しく構成し、元contentの`checkRead=scope.check`や
元Sessionを捕捉して権限を読み替えない。displayの返値もowned facts／bytes／取得済み
immutable Blobに限定し、GLTFparserや遅延関数を返さない。各helperは入力ID・limits・
proof・record JSONをawait前に所有し、callback内のnested readerも同じfacadeを使う。
Jobをfacadeで開いた場合は同じfacadeで検査し、元FS所有のlive Jobを読み替えない。

`media.stage`、CAS put、journal append、DB persist、Selection、receipt出力は対象外。
読み取りが返すのはowned DTO／bytes、完全取得したimmutable Blob、または既存のimmutable
検査結果だけ。Job、Session、factory、lazy stream、storage authorityは外へ返さない。
source／closure等の検査内容と新しい呼出しごとの再実行は省略しない。

## 4. 寿命・並行操作・ABA

各callbackはそのProjectの既存exclusive logical leaseと、復元controllerの直列な操作に
結び付ける。開始時に正確なJob／generation／Prepared／Start／phaseを監査し、終了時にも
同じ対応と、許されていない進行や変更がないことを監査する。名前や値が似ている別Jobを
同じ所有者としない。operation tokenは毎回新しくし、終了したtokenを再利用しない。
stagingでは正確なprivate scoped FS／factory pairとそのJobの登録をentryで照合する。
authority closing／lease喪失はtokenのlive確認とclosing auditの双方で拒否する。

readonly capability自体の全writeは拒否する。公開FS／factoryは常に従来のstrict経路を通り、
callbackの存在で高速経路へ切り替わる共有flagは作らない。並行callbackで権限を貸し借り
しない。callbackからcontrollerのwrite／phase進行を呼べるportも渡さない。

中断・closing・dispose・lease喪失・所有者変更ではreadを拒否し、終了監査が完了するまで
結果を採用しない。callbackはfinallyで失効し、そこからescaped handleを使う操作は、後の
callbackが始まっていても拒否する。書込へ進むときは既存strict fenceで再監査する。

ABAの安全性は、同じ正規writerがexclusive lease／直列controllerを守り、監査対象の
append-only進行を巻き戻さないことに依存する。変更したcontrolを外部から同じbytesへ戻す
不正な直接storage改変の完全検出や、OS全体のsnapshot isolationは約束しない。
正常経路でJob／phaseが一度変わって同じtokenへ戻る実装は認めず、そうした正規ABAが
成立するならこの案を適用しない。上記根拠は実装前の独立レビュー対象とする。

## 5. 受入れと接続条件

既存のstorage／復旧試験を再利用し、少なくとも次を確認する。

- 同じ入力・履歴・identity・原本hash・全content検査・選択結果を保持し、全工程を完遂する。
- callback終了時の所有者／Selection／control欠落・破損・phase変更は結果採用前に拒否する。
- callback内の全write、callback外へのstream／factory逃避、別FS／factory、期限切れtokenを拒否する。
- callback実行中の通常アクセスはstrictのまま、並行readは別寿命、closingは待機せず採用拒否する。
- read失敗・取消・decode失敗・quota／中断の後、元ファイル再選択で安全に再試行できる。
- Prepared／永続readback／publication／Selectionの前後fresh検査に従来の故障注入が効く。

同一backup・候補source・Chromium・viewport・profile条件で、変更前後のCaption／3D／編集、
restore.first各段階、IO回数、native準備回数、実ファイル出力と再開を記録する。
監査回数だけを速度合格とせず、実時間と画面の操作可能性を併記する。
独立レビュー、必要な自動回帰と最終checkpointを経て接続する。POは§§1–5を承認済み。
一般公開・iPhone実機合格・新たな速度保証を含めない。

## 6. 別の未承認事項：同じpure読取内のZIP整合性証拠

**PROPOSED・未採択・未実装。今回の改善候補として承認を求めない。**
本節はstaging監査の例外ではなく、別の検査寿命判断を必要とする。
上の§1–5を承認しても、payload検査の共有を許可したことにはならない。

500k SH4の既存の閲覧ファイルで、通常のコピー操作も240秒を超え、その後はeditorまで
正常に進む。別の私的なphase診断ではcopy→editor374.358秒、archive全検査50巡で262.561秒、
GS全検査5巡で64.419秒、SHA入力20.116GBだった。nestedの所要は加算できず、診断条件の
値を通常条件の速度保証にしない。小さいSHA算術候補は約12–16%のNode測定改善に留まり、
製品には採用していない。§1–5のmetadata監査だけで、このraw ZIP反復がなくなるわけではない。

検討する最初のconsumerは、既存original／selected read-operation内の
`assertReviewEditSlot`の**void preflight一回だけ**とする。Session全体、copy command全体、
staging、一般`reviewEditStates`、Prepared／Jobを返す公開APIには広げない。

ただし独立callgraph reviewでは、completed分岐のoriginal.zip／copy.zip／child input.zipは
別artifactを各1回読むため、このcallback内の重複は0だった。共有余地が明確なのは
incomplete＋ownChild分岐でstates後に同じparentを再読込する場合などに限られる。
この狭い案を50巡の大半や完成copy後のbackupの改善策とせず、現在のcritical pathから外す。
50巡のpayload寿命の設計は別の後続課題とし、効果のない小capability実装を先行させない。

callbackの最初に必要な各artifactを現在のFSからfresh取得し、実長・全entry CRC／SHA・
container hash・manifest／closureを従来どおり完全検査する。そのnative immutable Blobの
整合性証拠だけを、同じcallback内のnested parent／child確認で共有する候補とする。
同じfilename／長さ／保存済みdigestだけを根拠に、新しいdisk bytesを検査済みとはしない。
別artifactの検査も一つのdigestへまとめない。control／recipe／metadata／parent-child／
journal／publicationの対応は従来どおり再構築・照合する。

証拠はprivateな正確なFS／root／generation／lease／callback寿命と、親子ID・descriptor・
Start参照・検査policyへ束縛する。await前に入力を所有し、callback内の全readerへ明示的に
同じ能力を渡す。共有のglobal flag／path cache／hash cacheは作らない。返値はvoidで、
Prepared／Job／stream／証拠capabilityを外へ渡さない。終了監査が拒否した場合は結果を
採用せず、finallyで証拠を失効する。

別public call、別callback、retry／cold再開、各ZIPのwrite後readback、publication／selection前の
fresh境界を跨がない。取消・closing・lease喪失・owner変更でも失効する。通常writerが
exclusive leaseとappend-only bindingを守ることが前提で、任意の外部raw FS改変に対する
snapshot保証ではない。同callback中の同size破損や元bytesへ戻すABAは、保持したBlobでは
即時検出できず、次のfresh境界まで検出が遅れ得る。**この検出時期の差がPOの判断点**である。

接続には、この範囲の独立設計reviewと明示承認が必要。既存実artifactで同callback内の
二重検査だけが減ること、別callback／retry／write後の破損が依然拒否されること、owner／
closing／期限切れとcapability逃避を拒否することを既存service試験で確認する。
実時間・全検査回数・原本／履歴／identity／生成結果を同条件で照合し、50巡がどれだけ減るかは
実装後の実測で判断する。GS scalar検査や01hのon-demand延期、全操作のcache承認にはしない。
