# 08c: HEIC原本と端末内で作る表示用画像

Status: **製品方針・設計から実装への継続をPO承認2026-10-30。技術設計・最終差分の独立レビューPASS。限定ProjectScene／PC候補経路を実装・自動検証済み**。
POは、各画像を一度だけ読める環境でJPEG/PNGにし、原本と表示用画像を保存・共有して、
非対応端末でもオフラインで使う方針を承認した。以下はその実装契約であり、実行結果の正本は
[todo](../../tasks/todo.md)。同梱HEVCデコーダの採用・配布保留、一般公開、実機・PWA合格は変更しない。

## 1. 利用者の流れと範囲

新規Projectのメディア選択、既存Projectの「メディアを追加」でHEICを選んだ場合、
対応ブラウザの標準デコーダで一度読み、端末内で表示用PNGを作る。原本とPNGを一つの記録として
保存する。Captionウィンドウの既存ギャラリー／画像ビューアはPNGを表示し、受信側はHEICの
ネイティブデコードを要求せず、同じPNGを編集・保存・再共有・復元・再開でも使う。

PNGはブラウザがデコードした画素を現在の向き・寸法で出力する。黙った縮小、JPEG化、品質値の
設定追加はしない。原本のHDR・色域・撮影メタデータまでの同一再現は約束しない。ブラウザ間の
PNGバイト一致も要求せず、**最初に生成した実バイト**を固定して検証・再試行・共有する。
両本体を既存のファイル・Project合計・画素・処理上限へ算入し、超過は書込み前に説明して拒否する。

HEIC単体を読めない最初の端末では、対応端末で追加して作業一式を渡すか、別JPEG/PNGを追加する
既存の案内を維持する。手動の原本／表示画像ペア選択、画像貼付け、画面取得、外部ビューア埋込み、
OSコーデック導入は今回追加しない。これらは自動生成の成立に必要な前提ではない。
画像を表示できるOS／アプリが存在することと、当該ブラウザで生成できることは別である。

既存の単体HEIC・その他メディア・変換レシピ・原changeは変更しない。既存単体HEICは従来の
native-only条件を維持する。開いただけでimmutable記録を追加・置換する自動移行はしない。
今回の新しい組を用意できる入力は、現在の単画像HEIC構造検査の範囲に限る。

## 2. データとBlobの権威

MediaResourceの既存`blob`はHEIC原本のままとし、次のoptionalな既知フィールドを追加する。
同じimmutable記録の`payloadDigest`が、原本・表示画像・寸法の組を結び付ける。

```ts
portableDisplay?: {
  kind: 'native-heic-raster-v1';
  blob: BlobRef; // image/pngのみ
  width: number;
  height: number;
}
```

このフィールドは`mediaKind:image`かつ原本`blob.mediaType:image/heic`の場合だけ有効。
表示用BlobはPNG、正の安全な整数の寸法、実PNGの寸法と一致し、原本構造が示す主画像の寸法と
同じか、従来native-onlyと同じ縦横入替の範囲に限る。未知のkind・キー・不正なBlobRef・別形式・
不一致寸法・曖昧な組を拒否する。元のHEICに対応するcrop／rotation／色の精度を、この寸法条件だけで
保証したとはしない。既存のMediaResource ID・原本取得の意味を表示用Blobへ読み替えない。

root map、schema2.0/2.1、map1/map2、MetadataProof、identity／lineage、actor、token、
既存のimmutable digestアルゴリズムを変更しない。新しく組を作る場合だけ通常の新media IDと
既存のimmutable digest計算を使う。添付は通常のtyped Sessionコマンドでこの記録を参照する。

共通の小さなdomain helperで、Representationは原本1つ、MediaResourceは原本とoptionalな
表示用Blobを列挙する。graph strong edge、現在／競合／baseのclosure、容量、presence／receipt、
staging、保護、復元、再有効化が同じ列挙結果を使い、片方だけの保存を成功としない。
物理本体は既存どおりdigestで重複排除し、同じdigestで長さが異なる入力を拒否する。

## 3. 生成と検証の意味

生成は構造検査・上限確認の後、所有されたnative bitmapが閉じられる前に一度だけ行う。
既存の20秒上限をnative decode・canvas export・PNG検証を含む生成全体に適用する。
取消・時間上限・選択世代を維持し、成功／失敗／取消／遅延完了でbitmap・canvas・URLを
解放する。生成したPNGは既存PNG検査・実デコードでも検査してから記録とともに固定する。
二度目の無制限HEICデコードや、失敗後の再生成を追加しない。
新規選択では、名前入力より前の既存20秒native対応検査を維持する。これはPNGを生成せず、
書込みも行わない独立したpreflightであり、作成確定時の一回の生成とは別に実行する。
選択取消のAbortSignalと世代境界はこのpreflightに適用し、作成開始後は既存の処理中／再試行境界を使う。
生成portは所有されたbitmapからPNG Blobを返すencoderとし、生成サービスがbitmapを必ず閉じる。
encoderはcanvasとabort listenerを所有し、完了・取消・timeoutで解放する。`toBlob`がnullを返す、
例外、callbackの遅延・未完了でも上限内に終了し、後着PNGを公開しない。PNG bytesはサービスで
検査・所有してから呼出元へ渡す。読込み不能時は「HEICを読み込めるブラウザ」で追加・保存する
条件を示し、OSアプリで表示できるだけでブラウザ生成も可能と案内しない。

新しい組の受信・保存読戻し・再開の検証は、次の異なる事実を区別する。

- 原本: digest／長さ／実形式と、既存のself-contained単画像HEIC構造・参照・寸法上限を検査する。
- 表示用画像: digest／長さ／実PNG構造・実デコード・保存された寸法・原本構造との寸法条件を検査する。
- 関連付け: immutable記録全体・payloadDigest・完全な両BlobRefに一致することを検査する。

非対応端末はHEIC native decoderを呼ばない。この端末が確認できるのは原本の構造・バイトと
表示PNGの有効性・関連付けであり、両者の視覚的同一性やHEICの完全なデコード成功ではない。
送信者のmetadataやハッシュを、画素同一性の証明として信用しない。UIは「表示用画像」と区別し、
原本の色・HDR等と異なる可能性を必要な場面で説明する。

ContentRequestは完全な記録を含める。新しい組のmedia factsは従来の`mediaKind/mediaType`に加えて、
`portableDisplay:{sourceCheck:'structure',displayCheck:'decoded',width,height}`を要求する閉じた分岐を持つ。
寸法は記録と実PNGに一致する。単体メディアではこの追加factを受け入れない。
既存のreceiptは完全な記録が異なるため新しい組の証拠にはならず、同じexecutor全体の
無理由な失効・既存本体の補完・古い検証結果の操作間流用は行わない。

## 4. 書込み・受信・復旧

UIはファイル意図だけを渡し、`ValidationContent`等のアプリ側サービスが原本とPNGを所有する。
Sessionへ入る前に完全な記録と両本体を固定する。
pairedのcold再開では検証済みjournal partからmetadataだけを先に再構成し、原本とPNGの
完全な関連付けを得てから本体を検証する。本体の保存・fact・publicationの境界は変更しない。media introductionのstaged refs、retained context、
acknowledged集合、原本が既存でも表示用本体が新しい場合の計画を両Blob単位で扱う。
保存失敗・同一操作の再試行・prepared cold復旧は同じ元changeと同じ両本体を再使用する。
編集者名も08bどおり確定時の値を保つ。準備前coldの既存修復制限を緩めない。

受信・import・restoreの各計画は、入ってくる本体と既存所有本体を個別に判定する。
既存acknowledged本体の欠損・破損を、受信ファイルや再生成で補完しない。
片方の不在・破損・不整合では公開前に止め、手元の編集・原本・履歴・修復用入力を保持する。
検証済みの記録が共通raw digestを使っても、新しいPNGを検査せず既存メディア扱いにしない。

通常の`image()`等の原本取得は原本バイトを返す意味を維持する。
UI用の明示的な表示画像取得はPNGバイトとPNG MIMEを返し、既存のCaption内ギャラリー・
共通ビューアが利用する。PNGをHEIC MIMEのまま返さない。viewerはProjectやpackageをparseしない。

## 5. 必須reader機能と旧版

08bの閉じたsingletonを、既知の有限な正規順集合として扱う共通codecへ整理する。
既知の機能は`editor-attribution-v1`と新しい`portable-heic-display-v1`の二つ。
`requiredCapabilities`は必要な場合だけ存在し、空配列・重複・未知・非正規順・欠落・余剰を拒否する。
08bだけを使う既存の正規バイト・エラー回復の意味は維持する。

Sourceは、物理形式の検査中に全元scalarのmedia記録から新機能の使用を検出する。
上書き済みの元scalarも含め、原changeを変更せずにchange hashとの対応を保持する。
現在のmaterialized winnerや文字列の偶然の一致から判定しない。
編集者名は従来どおり専用messageから導出し、この二つの機能を混同しない。

ローカルjournalは、一度要求した機能を後続へ継承する。各公開entryの要件は先行要件・
当該元parts・実受信manifestの和に一致し、完全なdurable sourceの要件も公開前後に満たす。
原本にない要件を任意に自己申告させず、元parts／base evidenceから計算する。
immutable startが説明できない新機能のextra durable headは、08bと同じく公開前に拒否する。
旧版が古いpublicationへfallbackして開かないようにする。

| 出力 | 実内容と要件の導出 |
|---|---|
| Workspace | 保存する元履歴から導出。到達する原本とPNGを両方保持 |
| Contribution | 検証済みbaseと再構築targetの要件の和。両Blobからbaseが保証する本体だけを除く |
| Backup | 現在sourceと全archived base evidenceの要件の和。base-onlyの組も保持 |
| Clean | 実際の新記録から再計算。両本体をそのまま保持し、再生成しない。編集者名は除外 |
| Review | 実際のsnapshotから再計算。既存の画像原本保持方針どおり両本体を保持。編集者名は除外 |

Clean/Reviewはportable要件を許すが、08bの編集者名要件は引き続き禁止する。
direct capture、archive検査、cold再構築、固定output job、再取得で同じ要件を使う。
原本の撮影情報が共有される既存の説明は維持する。表示用PNGだけを渡す新しい出力目的は追加しない。
新しい組を含むデータには対応版を要求し、既存readerが片方を無視して開くことを防ぐ。

## 6. 責任とimport境界

- `domain`の小さなportable-media helper: descriptor／Blob列挙／表示Ref。UI・storage・packageをimportしない。
- `projectMetadata`の共通required-capability codecとSource: 元parts由来の要件、typed Sessionとjournal。
- `projectFiles`のmedia生成・record-aware検査・本体計画: WorkspaceFS／asset serviceを通す。
- `projectPackage`: 両Blob closure・snapshot/Clean複製・上記の要件導出。
- `projectScene`／`ui/projectScene`: typed表示モデルと既存の画像部品。storage直書きなし。

新しいruntime依存・CDN・サーバー・codec binary・OS導入は加えない。
core/platform/viewerからUIへのimport、viewerからProject/packageへのimportを増やさない。
新しいmodule境界のsceneCore exact allowlistは早期に確認する。

## 7. 受入れと証拠の範囲

1. 対応生成portで一度だけnative decode／PNG生成し、原本・PNG・immutable組を固定する。
   上限・無効PNG・異寸法・取消・late callbackで書込みせず資源を解放する。
2. 既存Project追加と新規Projectの両入口を確認する。名前確定、部分staging失敗、publication失敗、
   prepared cold再試行でも両本体と元changeが変わらない。
3. map1/map2、無要件・名前のみ・portableのみ・両方、欠落／余剰／未知／非正規要件、
   raw既存＋PNG新規、base-onlyの組、片方の欠損／改ざんを既存service testsで確認する。
4. HEIC decoderを呼ぶと失敗する受信者で、Caption内PNG表示・編集・5目的・往復・復元・coldを確認する。
   実際の固定旧readerのpackage／local journal拒否も検証する。旧readerは08b対応済みの直前版
   `fe20109`（製品コード`135359f`）を固定し、名前のみは開け、portableのみ／両方は拒否することを確認する。
   既存08bの`6c3788e`証拠は置き換えない。
5. Chromiumで生成入口を通す場合、HEICだけ既知PNGの実ImageBitmapへ置換する狭いテスト注入を使える。
   これはcanvasから保存への接続証拠であり、Chromiumのnative HEIC対応の証拠ではない。
   製品側にテスト専用の許可portや検査迂回を公開しない。
6. 生成済みのProjectと画像を用いた通信遮断で、開いた画面の閲覧・保存と、ロード済みページ内での
   Project開き直しを区別して確認する。
   現行DesktopのService Workerなし／E2EのSW blockを維持し、その証拠をオフラインcold起動・
   PWAインストール・実機Safariの合格へ読み替えない。

最終source/test treeで必須の直列checkpoint checks、関連する実ブラウザflow、独立diff reviewを行う。
実SafariのHEIC・向き・色・HDR・大画像と、アプリshellのオフラインcold起動は別の受入れとして残す。
この不足は明示し、通常の実装・故障修正をPOの小さな手動テスト待ちにしない。
