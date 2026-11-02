# 復元準備中の、内容照合に閉じた読み取り

Status: **ACCEPTED / Implemented（限定PC候補）—PO承認2026-11-03、独立設計・実差分・証拠レビュー済み。
正確な復元Job/pairのreadonly content hookだけを接続し、Ki84の実測・編集・外部保存・
別環境復元・cold再開と最終自動検証を確認した。一般の性能保証・採用合格・公開は含まない。**

この案は[06](06-project-package-wire.md)が許可するstaging読取consumerを追加する判断であり、
[06b §§1–5](06b-staging-read-operations-proposal.md)の既存4consumerに加え、ここで明示した
readonly content hookだけが追加承認された。
06b §6のZIP証拠共有、01hの検査延期、Session全体の一括化は含めない。
実行結果・現在の作業は[todo](../../tasks/todo.md)を正本とする。

## 1. 利用者の結果と根拠

Ki84の復元で初期化が待ち時間の中心になっている。今回の隣接した再読込の除去に続き、
保存済みの内容照合receiptを読む際の所有者監査の増幅を調べる。原本・履歴・本体の検査を
省かず、編集・保存・復旧の安全条件を保つ。新しい設定や画面は追加しない。

既存の読み取り専用content hookは、strong closure内の全要求を照合する一まとまりに
なっている。ただしstagingでは許可名がないため、各receipt I/Oでstrict監査を行う。
その一まとまりの開始・終了に監査を集約する候補が本案である。

今回計測するKi84バックアップのgraphでは42メディアすべてを46のactive添付が参照する。これは現在のhookを
使用できる可能性を示すgraph上の確認であり、実際のhook呼出し回数や削減秒数ではない。
family別I/O集計にはgeneration内のdata読み取りも含まれるため、全件を重複監査とはしない。
追加計測で対象hookが実際にcritical pathを占めることを確かめ、同条件の実時間と完全性を
確認できた場合だけPC候補へ接続する。効果がなければ範囲を広げず、strict経路を維持する。

## 2. 一括判断する範囲・port

- `StagingReadConsumer`のclosed allowlistに`content.readonlyInspection`を追加する。
  使えるのは`PersistentContentVerifier(allowNewEvidence=false).withReadonlyContent`だけ。
- 既存`withMetadataRead`から、その正確なJob・private FS/factory pairに結び付いたreadonly
  facadeを受け取り、receipt-only readerを構成する。元SessionやValidationContentの
  `checkRead`を捕捉して権限を読み替えない。
- domainの候補検査・closure・要求順・one invocation/await/scope/lifetime検査は保持する。
  callbackは`Promise<void>`、渡すportは`scope`と`verify`だけ。外へ出すのはowned照合結果。
  limits/version/scopeを所有し、各要求・key・contextを最初のawait前にdeep captureする。
- 各receiptのfresh read、canonical key・digest・factsの照合は毎回実行する。Origin CASの
  inventoryは別の既存readonly portで各ref/requestごとにfresh検査する。存在・suspect状態や
  receiptをcacheしない。executor・native decode・CAS put・receipt writeは呼ばない。
- strong closure外に一つでもメディアがある場合の既存fallbackを保持する。効果を出すために
  fallbackや外部retained-media callbackの位置・順序を変えない。

単独`verify(false)`、`hasEvidence`、`verifier(true)`は許可名を付けず、従来どおりとする。
Session.read/checked/initialize/resume全体、モデル・メディア処理全体、stage、原ZIP検査、
Prepared、全本体検査、実write/close/readback、publication、Selection、cold復旧は囲まない。
保存形式・ID・変換規則・依存・容量／速度保証・公開方針は変更しない。

## 3. 安全条件と判断点

06bと同じexclusive logical lease・直列controller・正確なJob/FS/factory所有者へ束縛する。
各操作の開始・終了にroot-backed完全監査を行い、各I/O前後にlive/abort/dispose/closingと
所有者を確認する。全writeを拒否し、finallyで失効する。通常のpublic FSは常にstrict。
並行callbackや後のcallbackへ権限を貸さず、expired reader/factory/streamは使用できない。

domainが個別の照合失敗を捕捉しても、終了監査の拒否はその外側で全結果の採用を拒否する。
終了監査を通過する前に結果から編集・保存・選択を進めない。次のwrite境界はfreshのまま。

**所有者のdisk control変更を検出する時点が、各receipt I/Oから内容照合の終了時へ遅れる
場合があることがPOの判断点。** 検査内容・freshなreceipt読取を省く案ではない。
通常writerがleaseとappend-only進行を守ることを前提とする。同じcontrolを外部から変更し
元bytesへ戻す不正な直接改変の完全検出や、OS全体のsnapshot isolationは保証しない。

## 4. 受入れ・接続条件

既存のcontent・06b staging・restore故障試験と一つの実データ経路を再利用する。

1. 同じsourceで要求順・facts・inspection結果・原本／履歴／identityを保持する。繰り返す要求も
   receiptとCAS inventoryをfreshに照合し、missing/suspectや後の破損を拒否する。
2. weak mediaではhookへ入らず、fallback／外部callback順が不変。単独verify/hasEvidenceと
   allowNewEvidence経路はstrict、readonly readerがexecutorやwriteを呼ばないことを確認する。
3. 実stagingの開始／終了でcontrol欠落・変更・取消・Selection・abort・lease closing・disposeを
   注入し、全結果の採用拒否を確認する。domainが内側の失敗を捕捉しても終了拒否を隠さない。
4. 正確なowner/pair、失効reader、遅いcallback、並行public strictアクセスを確認する。
   後続のPrepared・write/readback・publication・Selection・cold復旧の故障検出を保持する。
5. 内容を含まない既存方式の計測を用い、実際のhook利用と対象段階の時間／I/Oを分ける。
   同じKi84バックアップ・Chromium・viewport・fresh専用profileで比較し、全43本体hash・履歴・
   bases・編集→外部保存→再開を照合する。別条件の過去秒数を効果としない。
6. 独立設計／実差分レビュー、必要な自動回帰と最終checkpointを経て接続する。未確認項目を
   合格に含めず、一般公開・iPhone実機／実GPU合格・全端末の性能保証へ拡張しない。
