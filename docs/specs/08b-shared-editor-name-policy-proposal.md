# 08b: 共有する変更に任意の編集者名を残す

Status: **製品方針はPO承認済み2026-10-29。以下の技術設計はPROPOSED・未実装**。
POは方針の具体化を承認した。旧版での読込を止める互換性境界とその実装は、
この具体案の独立レビュー後にまとめて判断する。保存設計の承認・runtime検証・
adoptionや公開を示す文書ではない。現在の実装・検証は[todo](../../tasks/todo.md)が正本。

## 1. 承認済みの利用者向け方針

更新の受信や競合候補の確認で、どの編集者名を付けた変更か分かるようにする。
対象は今後この端末で確定する編集への任意の自己申告名と、既存のCaptionのフィールド・
競合候補への補助表示。ログイン、本人確認、人や端末の同一性判定、汎用履歴画面は追加しない。
名前や時刻で競合の勝者を決めず、Caption全体に単一の「最終編集者」を推測しない。

- Project設定で名前を任意入力し、**「このプロジェクトの今後の編集にこの名前を残す」**
  を明示的に有効化する。初期状態は無効。現在のブラウザ内表示名は入力の初期値にだけ使う。
- 操作の確定時に名前を固定する。名前変更・停止は今後の編集にだけ適用し、過去や相手の
  元changeを書き換えない。保存失敗・再試行で別の名前を付け直さない。
- 未記録の変更は「編集者情報なし」。Automerge actor IDから過去の人物を推測しない。
  同じ名前も同じ人物とは扱わない。
- 作業一式・変更分・バックアップには該当する履歴とともに保持し、出力前に開示する。
  閲覧用シーン・独立コピーでは元の編集者情報を除外する。
- 文章へ手入力された氏名や素材内の情報を匿名化する機能ではない。停止や独立コピーで、
  既に相手へ渡した情報を削除したとは説明しない。

製品方針の独立レビュー2026-10-29はPASS。以下は、その承認を保存設計の承認へ
読み替えずに具体化した技術案である。

## 2. 現在の境界と最小構成

現在の[仕様08](08-daily-authoring-workflow.md)の表示名はブラウザ内のUI設定であり、
Project履歴へ含まれない。既存実装は変更していない。
[仕様02 §8・§9.4](02-storage-package-migration.md)と
[仕様06 §6](06-project-package-wire.md)に対する将来の追加を以下に定義する。
現行のv1 message完全一致・閉じたjournal/manifest契約は、実装承認までは現行のまま。

保存するのは**名前付きの元changeのmessage**と、旧版を止める**必須機能の宣言**だけとする。
新しい人物ID、contributor表、root map、actor固定化、ライブラリ依存を追加しない。
map1/map2・schema2.0/2.1・MetadataProof・root hash・token形式は維持する。
既存のexchange-baseのmanifest・metadata・digestも書き換えない。

接続先は[Source](../../src/projectMetadata/source.ts)、[物理形式の検査](../../src/projectMetadata/format.ts)、
[Session](../../src/projectMetadata/session.ts)、[journal](../../src/projectMetadata/journal.ts)、
[manifest](../../src/projectPackage/manifest.ts)。現在のgenesisはroot map数が固定である。
root scalarを編集ごとに足す方式はno-opを名前だけの編集に変えてしまう。
`extraBytes`は固定済みAutomergeの公開writer/decoder型で対応が約束されていないため使わない。

## 3. 元change内の正確な宣言

名前なしは従来の`lociview:transaction:v1:<transactionId>`を維持する。
名前ありの将来のローカル操作は、次のprefixとcanonical JSONの連結をmessageとする。

```text
lociview:transaction:v2:{"editor":{"kind":"self-declared","name":"表示名"},"transactionId":"0123456789abcdef0123456789abcdef"}
```

- JSONのキーは上の閉じた形だけ。元changeのbyte予算を先に検査し、既存の
  `parseJsonWithoutDuplicateMembers(text, {maxDepth, maxNodes})`でbounded parseする。
  root/editorのplain objectと全キーの完全一致、各値の型、`scalarLength`によるUnicode scalar/
  string予算を検査し、既存canonical encoderの再出力とmessageが完全一致すること。
  transactionIdは既存と同じ32桁lowercase hex。time・actor・人物ID・自己change hashは加えない。
- 名前はtrim済み・非空・最大256 UTF-16 code units。既存ブラウザ名の上限を踏襲し、
  C0制御文字とDEL、不正なUnicodeを拒否する。NFC等へ自動正規化せず、確定した文字列を保つ。
  trimで空になる入力は有効化できない。共有向け検証を既存の私的表示名へ遡及適用しない。
  `cloneCanonicalValue`/`ProjectRecordFields`は非NFC文字列を拒否するため、このheader宣言や
  LocalEditorContextの検査には使わない。限定した閉じた形を検査して不変値へコピーする。
  既存のdomain recordのNFC契約を弱めず、元changeのheaderだけを別のcodecとして扱う。
- 予約した`lociview:transaction:v2:`で始まるmessageは厳密に検査し、不正なら入力を保持したまま
  有効化・公開を拒否する。その他の従来messageは名前を推測せず、元bytesのまま保持する。
  将来の宣言形式は別の必須機能が必要で、未知の必須機能を受理しない。
- 宣言は**それを含む元changeのhash**にだけ属する。transactionId・名前・actorが等しい別changeを
  同一人物・同一操作へまとめない。同じhashのbytes一致、deps・元change保持の既存検査は維持する。
- Sourceは完全な元履歴から、source tokenに束縛したreadonlyの`changeHash → editor宣言`投影を作る。
  既存の`AtomicHistory`の形、candidateのoperationId/changeId、因果関係・勝者判定は変えない。
  任意の未検証JSONをこの投影として受け取らない。

localCommandのjournal検査は「既存v1の完全一致」または「厳密v2かつ当該journalの
transactionIdと一致」に限る。prefix一致へ弱めない。現行の1操作1元changeを保つ。
初期化・変換、受信、復元の元changeに現在の利用者名を付けない。

## 4. 明示設定・確定・再試行

ブラウザ共通の私的表示名は残す。共有用は別のProject単位のローカルUI設定
`{enabled, name}`とし、immutableなProject identityとroot lineage proofへ束縛する。
tokenやファイル名をキーにせず、共有metadataへenabledを保存しない。
同じ端末・同じlineageの再開は設定を保ち、新しい端末・独立コピーは無効で開始する。
元Projectの設定や受信した名前から有効化を推測しない。

[AppContext.ui](../../src/ui/context.ts)と[browserUiState](../../src/projectScene/browserUiState.ts)が
ローカル状態を所有する。[workspace ports](../../src/ui/projectScene/projectWorkspacePorts.ts)へ
Projectに束縛した設定のread/saveを追加し、hostが次の不変値を作ってSessionへ渡す。

```ts
type LocalEditorContext =
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'self-declared'; name: string }>;
```

型と検査はmetadata側に置き、SessionがUIやlocalStorageを参照しない。未確定入力は捕捉しない。
設定保存の失敗・不正な有効設定は知らせ、黙って別名や無記名へ置換しない。
設定の保存だけではProjectの元change・journalを増やさない。

利用者が編集を確定し、Projectに束縛されたhostのローカル操作入口へ入った時点で、
**最初のawaitより前**に検証済み設定を値としてコピーする。
メディアdecode、モデル検査、材質preflight、lease取得の後で名前を読み直さない。
dispatch、Scene操作、削除、ピン移動、GS/Proxy確定、モデル・メディア操作を同じ規則へ接続する。

Sessionのretained commandと、media staging後にprepareEditする`introduction`にも
同じcontextを保持する。元changeができた後は既存のexact partsを再利用し、retry/cold復旧で
設定を再参照しない。元change準備前のcold中断は既存のincomplete-staging-repair境界を維持する。
新しい復旧保証やvalidation lifetimeを暗黙に追加しない。

| 操作 | 名前の扱い |
|---|---|
| 通常の確定編集 | 捕捉した名前を同じ元changeへ保存 |
| 通常の同値編集 | 元changeも名前だけのtransactionも作らない |
| 明示的な競合解消 | 解消した人の新しい操作として捕捉。同値候補の解消も対象 |
| Undo/Redo | 新しい補償操作へ現在の名前を捕捉。元操作の名前は変更しない |
| Project初期化・変換・Clean生成 | 自動付与しない |
| import・receive・Backup復元 | 元履歴の情報を保持し、受信者名を付けない |
| retry・保存照合・再開・表示だけの変更 | 新しい申告を生成しない |

失敗した編集から名前だけを公開せず、既存のwrite/readback/publication fenceと同じ結果にする。

## 5. 互換性境界 —追加の判断対象

名前付きmessageは現行readerでも不透明なheaderとして残る。そのまま受理させると、
旧版が名前を表示・開示せずに再共有する。これを避けるため、次の**閉じた任意field**を
新しい`JournalStart`と履歴を扱うpackage manifestへ追加する。

```json
{"requiredCapabilities":["editor-attribution-v1"]}
```

- 必要時だけ存在する。空配列・重複・未知のcapability・余分な値を拒否する。
  finalized source/証拠から導出した要件と宣言が一致しなければ、欠落・余剰ともに拒否する。
  messageや宣言を除去して旧形式へ見せかける変換は行わない。
- ローカルjournalの要件は現在の設定や勝者だけでなく、**完全な元履歴とそのworkspaceで
  保護中のbase evidence**から決める。名前がbase evidenceだけにある復元後も、以後の
  無記名ローカル操作・再開へ継承する。現在sourceに名前がない、または記録を停止したことを
  理由にローカル要件を落とさない。出力manifestは§6の実payload/activation範囲から別に導出し、
  送らないローカル証拠の要件をそのままコピーしない。
- 最初の名前付きlocalCommandは、名前を含む元changeとともに要件をjournalへ固定する。
  stagingが先行する遅延メディア操作では、捕捉した予定contextとbaseの要件をstartへ固定し、
  prepared partsで検査する。pending/失敗後に旧版へ戻すための要件除去はしない。
  journal開始前に判定された通常no-opでは要件だけを記録しない。
- import・receive・restoreは、手元base・再構築したtarget・統合結果、および操作が保護する
  base evidenceの要件の和を公開前のjournalへ固定する。archive自体の検査と、baseを得た後の
  意味的な要件検査の両方を通す。
- **現行の旧readerは未知のJournalStart/manifestキーを拒否するため、該当Project/ファイルを
  開けなくなる。** 現行Sessionは全journalを検査してからpublicationを選ぶので、古い状態へ
  黙ってfallbackしない。新readerは旧履歴を従来どおり開き、混在履歴と既存baseを扱う。
  保証は現行readerの通常のpackage/Session入口についてのもの。任意の古いソフト、手作業で
  抽出・改造したraw source、別に保管された古いバックアップの使用までは制御しない。
- 既存receiptやbase証拠を書き換えない。必須機能は認証・署名ではなく、名前表示・開示に
  対応したreaderを要求する互換性境界である。

有効化前に「名前を残した編集を含むプロジェクトや共有ファイルは、対応版のLociViewで
開く必要があります」と知らせる。受信でも対応が必要な理由を示し、原本を保持する。
履歴へ残った名前は停止しても消えないため、この制限も通常の停止では解除しない。

## 6. ファイル別の保持・除外・開示

| ファイル | 保持／除外と必須機能の判定 |
|---|---|
| 作業一式（Workspace） | 全元履歴の名前を保持。完全sourceから要件と開示を導出 |
| 変更分（Contribution） | 元delta bytesを保持。要件はbaseから再構築したtarget全体、名前を実際に含むかはdeltaから別に導出 |
| バックアップ | current sourceと全exchange-base evidenceの名前を保持。その和から要件と開示を導出。埋込済み旧manifestやdigestは変更しない |
| 閲覧用シーン（Review） | 専用snapshotと必要なblobだけ。元message・名前投影・要件・設定を含めない |
| 独立コピー（Clean） | 現在の編集可能状態からfresh genesisを作る。元message・名前投影・要件・設定を引き継がない |

名前導入前の作業一式も引き続きbaseに選べる。匿名deltaでもbaseに名前があれば要件は必要だが、
そのdeltaに名前のbytesが入っているとは表示しない。手元の名前付き編集を保持した受信でも
統合後のjournalは要件を継承する。再受信no-opは新しい名前やtransactionを作らない。

[出力画面](../../src/projectScene/validationOutputControls.ts)へ、固定した出力sourceから
`includesDeclaredEditorNames`等のtypedな開示モデルを渡す。既存AutomaticSummary件数や
現在のlocal設定から推測しない。Workspace/Backupは含める履歴、Contributionは実deltaを対象に
「記録された編集者名を含みます」と出力前に表示する。名前付きbaseだけを必要とする匿名の
Contributionは、名前を含む旨とは分けて「この変更分を開くには編集者名の表示に対応した
LociViewが必要です」と知らせる。生成中のProject/設定変更や、完成jobの再ダウンロード、
中断後のcold再開でも、実際に固定した内容に対応する説明を使う。

Review/Cleanは「履歴の編集者名は含みません。文章や素材内の名前は残ります」とする。
既存snapshot allowlistとCleanの初期2変更にmessage/time/extraBytesを許さない検査を維持し、
名前投影や設定を誤ってコピーしない。未知情報を一般的に安全扱いする変更はしない。

## 7. 画面とimport境界

既存「設定」内に「編集者名」と承認済みの有効化チェックを置く。設定の確定・取消を使い、
編集ごとの確認や名前だけの別画面は追加しない。補足は「自己申告の名前です。作業一式・
変更分・バックアップに含まれます」「停止しても過去の記録は残ります」と必要な互換性説明に絞る。
現在の「このブラウザの利用者」badgeを過去の作者の証明へ転用しない。

Captionのフィールド・競合候補は既存candidate.changeIdへ検証済み宣言を対応付け、
「編集者名：○○」／「編集者情報なし」を補助表示する。タイトルと本文等の名前は別々に扱う。
表示はtextContentと方向の分離で行い、名前をHTML・選択ID・人物のリンクとして扱わない。
候補の順序・operationIdによる選択・同値の並行候補・名前なし候補は維持する。

Sourceの投影をprovider/hostがtyped display modelに変換し、
[既存の復旧候補port](../../src/ui/projectScene/projectWorkspacePorts.ts)へ補足を渡す。
UIは元changeやpackageをparseせずstorageへ直接書かない。viewerはProject/package/名前設定へ
依存しない。core/platform/viewerからUIをimportしない。

## 8. 実装時の受入れと一括工程

以下は実行済み検証ではなく、実装承認後の受入れ。既存service testsへ不変条件とfaultを追加し、
代表する接続flowでファイル・画面・coldまで通す。名前ごとに全roundtripを複製しない。

1. 初期無効、明示有効、名前変更・停止・取消、別Project/端末/Cleanの分離、設定失敗。
   通常no-opは履歴を増やさず、同値競合解消・Undo/Redoは新しい操作にだけ名前が付く。
2. host入口から非同期preflight/media stagingまでの設定変更、保存失敗、exact retry、cold復旧。
   捕捉名・原bytesが固定され、準備前coldの既存修復制限も変わらない。
3. 旧message、map1/map2、任意actor、未記録候補、同名の異なる候補、フィールドごとの作者、
   競合解消・受信者名の非付与。NFC/NFDの原文字列保持、Unicode/長さ/閉じたJSON/重複キー/
   破損messageを検査する。domain recordのNFC拒否は維持する。
4. 旧base→名前付き編集→Workspace受信→手元編集を保った匿名delta受信→Contribution返送→
   Backup復元→再開で原bytesを照合する。base evidenceだけに名前があるBackupの復元後、
   無記名のローカル編集でもjournal要件が残ることと、出力要件を§6の各範囲で再計算することを確認する。
5. 必須機能の欠落・余剰・未知・改ざんを公開前に拒否。固定した現行旧readerの閉じた検査でも
   manifestと全journalの拒否・古いpublicationへの非fallbackを検証する。新readerの拒否を
   旧reader証拠としない。新readerで旧base/履歴を扱うことも確認する。
6. Review/Cleanの展開済みJSON・全初期change・manifestから名前sentinel/要件/設定を除外する。
   本文や素材に意図的に入れた同名は保持し、匿名化と誤認させない。出力前の実内容の説明と
   中断・完成job再取得の説明も確認する。

変更対象はSource/Session/journal、package capture/manifestとreceive/restore、provider/host/UI。
`tests/projectMetadataPersistence.test.ts`、`tests/projectPackage.test.ts`、
`tests/projectFiles.test.ts`、`tests/ui/projectSceneWorkspace.test.ts`等の既存境界を使い、
新しいimport境界はsceneCoreを早期確認する。独立diff reviewと最終checkpoint checks、
専用Chromiumの接続flowまでまとめる。既存の実機・offline・公開gateは別途維持する。

次の判断は、**この必須機能宣言により名前付き履歴を旧版で開けなくする互換性変更を含め、
本案の編集・受渡し・復旧・再開まで一括実装してよいか**。承認済みの共有方針自体は尋ね直さない。
承認後は通常の実装・関連修正・検証ごとの確認待ちを挟まない。

技術設計の独立レビュー2026-10-29はPASS。非NFC headerの限定検査と、ローカル保護要件／
ファイル別要件の区別を修正して確認済み。package/privacyの独立レビューもPASS。
読み取り設計レビューであり、実装承認・旧readerを実行した証拠・runtime受入れの合格ではない。
