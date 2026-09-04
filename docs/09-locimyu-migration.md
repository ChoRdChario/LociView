# 09. LociMyu 移行ガイド（画像の確実な結び付け）

> Status: `V1 LEGACY RUNBOOK`. Preserve source data and review ambiguous duplicate filenames; this guide is not an unconditional correctness guarantee.

LociMyuのキャプションは画像を **Google Drive のファイルID**（例 `1l1vZn40tg5xIo6r4-…`）で参照している。
Driveフォルダを丸ごとZIPダウンロードしても、この**ファイルID→ファイル名の対応表はZIPに含まれない**ため、
オフラインのLociViewだけでは「どのキャプションがどの画像か」を自動判定できない。

対応表があれば、取り込み時に**どのキャプションがどの画像を参照していたか**を正確に判定できる。
PNG／JPEG／WebP／GIFは自動添付される。初回public candidateで直接扱わない
HEIC／HEIFは対応関係を説明ファイルへ残し、端末で別のJPEGとして書き出した後に手動添付する。
以下の手順で対応表を作る。

## 手順（初回だけ・5分）

### 1. 対応表を作るスクリプトを実行する

LociMyuのスプレッドシートを開き、メニュー **拡張機能 → Apps Script** を開いて、
以下を貼り付けて実行する（初回は権限の許可を求められる）。

```javascript
function exportFileIdMap() {
  // このスプレッドシートが入っているフォルダ内の全ファイルの「ID, 名前」を書き出す
  const ssFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
  const folder = ssFile.getParents().next();

  const rows = [['fileId', 'filename']];
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    rows.push([f.getId(), f.getName()]);
  }

  // フォルダ内に fileid-map.csv として保存する（ZIPに一緒に入る）
  const csv = rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  folder.createFile('fileid-map.csv', '﻿' + csv, 'text/csv');

  Logger.log('fileid-map.csv を作成しました（' + (rows.length - 1) + '件）');
}
```

実行すると、フォルダ内に **`fileid-map.csv`** が作られる（fileIdとファイル名の対応表）。

### 2. フォルダをZIPダウンロードする

Google Driveでフォルダを右クリック → **ダウンロード**（ZIPになる）。
`fileid-map.csv` も一緒に入る。

### 3. LociViewに取り込む

そのZIPをLociViewで開くと対応表が自動的に使われ、対応形式の画像は
**正しいキャプションへ結び付いた状態**で取り込まれる。HEIC／HEIFは添付せず、
正確な対応先と端末上のJPEG変換が必要なことを説明ファイルへ記録する。
元ZIPを保管したまま変換を完了し、書き出したJPEGを新しいプロジェクトの
該当キャプションへ追加する。JPEGを元のDriveファイルIDと自動推測して結び付けることはない。

## 補足

- 対応表がない場合でも取り込みはできる。画像はプロジェクトに入るので、
  各キャプションの編集画面の **「🖼 プロジェクト画像」** から手動で選んで添付できる。
- 対応表CSVは、ZIPに同梱せず**後からLociViewのデータタブでCSVとして取り込む**運用も可能（次段で対応予定）。
- スクリプトはフォルダ内の**全ファイル**を列挙するため、画像以外（モデル・スプレッドシート）も
  含まれるが問題ない（LociViewは画像参照だけに使う）。
- ファイル名に拡張子が無い画像（Drive上でHEICが拡張子なしになる等）も、
  LociViewは内容からinventoryへ検出する。HEIC／HEIFは上記のとおり説明ファイルへ
  記録するだけで、初回public candidateのNative Projectへは直接添付しない。
