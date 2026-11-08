# 復元後の出力準備における読み取り単位

Status: **ACCEPTED —PO承認2026-11-08・限定実装とWindows自動検証完了**。
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

`outputOverview`は既に`withMetadataRead`を使用する。追加の外側wrapperではなく、
`jobsDirect`の`readCurrentBackup`と`availableBasesDirect`が元のSessionから読む経路を、
同じderived fs／factoryの非採用projectionへそろえる。public `Session.read`全体の
契約を広げない。

3つをまとめて接続・検証する。先に工程別の実測と読み取りの対応を取り、
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
待ち合わせて結果を拒否し、期限切れreadはawait後にも確認する。state採用直前にも
取消・editable authorityを再確認し、その確認と採用の間にはawaitを置かない。

`outputReady`内の純粋なJournal読取では、選択generationの管理情報監査を開始／終了へ
集約する。Journal内容・bindingの検証は維持するが、その内部の管理情報監査回数を
従来どおりとは約束しない。すべてのJournal書込・readback・publication・復旧の各fenceは
別々に新しく確認し、このcallbackに含めない。

途中の状態変更を終了時に検出する場合がある。raw FSからの外部改変が終了検査前に
元へ戻された場合（同じ長さの破損を含むABA）は、このcallbackの管理情報監査では
検出しない場合がある。保存領域のsnapshot保証ではない。この検出時期の差が判断点となる。
write-onceの管理記録、append-onlyのSelection、正規writerの排他条件は保持する。
終了検査を跨ぐ証拠の再利用はしない。
stagingで許可するconsumerの追加ではなく、normal selected generationの上記3経路に限る。

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

承認境界：PO2026-11-08が上記3経路の限定実装・自動検証を承認した。
これ以外はpublic I/Oごとの監査と個別承認された例外を保持する。新しい検査寿命・
書込／復旧境界の集約・製品方針・公開判断が必要になった場合だけ該当部分を止める。
