# 02. データフォーマット仕様（プロジェクトパッケージとマージ）

LociViewの核心。「git的にマージ可能なセーブデータ」をどう実現するかを定義する。

## 1. 設計方針

**「状態をマージする」のではなく「操作を蓄積する」。**

gitのマージが難しいのは、2つの完成状態から共通祖先を探して差分を突き合わせるからである。LociViewは逆に、**各編集者が自分専用の追記専用ログ（op-log）にしか書かない**構造にする。すると:

- マージ = ログファイルの和集合。ファイル単位の衝突が構造的に発生しない
- 現在の状態 = 全ログを決定的な順序で畳み込んだ結果。誰がどの順で統合しても同じ状態になる
- 履歴が常に残る。「いつ誰が何を書いたか」が記録として保存される（記録用途と相性が良い）

これはLociMyu監査が提案した「堅牢方式（`__LM_EVENTS` append + reduce）」を、Sheetsではなくファイルで実装するものである。CRDTライブラリ（Automerge等）は採用しない。理由: 必要なのはLWW-map程度の単純な合成であり、自前実装が小さく済む上、データが人間可読なJSONLとして残る（NFR-03）。

## 2. プロジェクトパッケージ構造

プロジェクト = 1個のZIP。拡張子は `.lociview`（実体はただのzip。`.zip`のままでも開ける）。

```
example.lociview (ZIP)
├─ lociview.json              # マニフェスト（必須・これがあればLociViewプロジェクト）
├─ ops/                       # 追記専用ログ群（セーブデータ本体）
│   ├─ a_7f3k2m9q.jsonl       #   actorId ごとに1ファイル
│   └─ a_x81p0c4d.jsonl
├─ snapshot.json              # 任意: ログ畳み込み済みの状態キャッシュ（高速起動用）
├─ captions.csv               # 任意: 人間閲覧用のキャプション一覧（派生キャッシュ。正本はops。エクスポート時に自動生成）
├─ models/                    # 3Dモデル原本（無改変で格納）
│   └─ ast_01J8XQ....glb
├─ media/                     # キャプション添付（画像・映像等、assetId名で格納）
│   └─ ast_01J8XR....jpg
└─ thumbs/                    # 任意: 添付サムネイル（webp）
    └─ ast_01J8XR....webp
```

### lociview.json（マニフェスト）

```json
{
  "format": "lociview-project",
  "schemaVersion": 1,
  "projectId": "prj_01J8XQZK3M9QWERTYUIOP123",
  "name": "○○遺構 実測記録",
  "createdAt": "2026-07-16T09:00:00.000Z",
  "generator": "LociView/0.1.0"
}
```

- `projectId` は作成時に発行されるULIDで**不変**。マージ可否の判定キー（同一projectIdのZIPのみマージ対象。異なる場合は「別プロジェクトとして開く/強制マージ」を選ばせる）
- アセットの実体一覧・キャプション・ビュー等は全て `ops/` から導出する。マニフェストには可変状態を持たせない（マニフェスト自体のマージ問題を避けるため）

## 3. ID体系

| ID | 形式 | 発行タイミング | 役割 |
|---|---|---|---|
| `projectId` | `prj_` + ULID | プロジェクト作成時 | プロジェクト同一性。マージ判定キー |
| `userId` | `usr_` + ULID | アプリ初回起動時に端末で自己発行 | 編集者の恒久ID。表示名・ピン既定色と紐づく |
| `deviceId` | `dev_` + ULID | 端末×ブラウザごとに発行 | 同一ユーザーの複数端末を区別 |
| `actorId` | `a_` + hash(userId, deviceId) 短縮 | 導出 | op-logファイル名。「この筆の主」 |
| `captionId` 等 entityId | `cap_` / `view_` / `ast_` + ULID | エンティティ作成時 | エンティティの恒久ID |
| `opId` | `(actorId, seq)` の組 | 操作ごと | 操作の一意性。seqはactor内で単調増加する整数 |

- ULIDは128bit・時刻順ソート可能・衝突確率は実用上ゼロ。サーバなしの自己発行で成立する
- **actorIdをファイル名にする**ことで「1ファイル1書き手」を強制し、和集合マージを保証する
- userIdは認証ではなく「署名欄」。なりすまし防止は目的にしない（信頼できる仲間内での統合が前提。非目標参照）

## 4. op-log 仕様

### 4.1 ファイル形式

`ops/<actorId>.jsonl` — 1行1操作のJSON Lines。**自分のactorIdのファイルにしか書かない。既存行は絶対に書き換えない。**

```jsonl
{"op":1,"hlc":"2026-07-16T09:12:33.120Z-0003-a_7f3k2m9q","actor":"a_7f3k2m9q","user":"usr_01J8...","t":"create","e":"caption","id":"cap_01J8XR5T...","v":{"title":"北壁の亀裂","body":"","color":"#eab308","anchor":{...}}}
{"op":2,"hlc":"2026-07-16T09:13:05.876Z-0000-a_7f3k2m9q","actor":"a_7f3k2m9q","user":"usr_01J8...","t":"update","e":"caption","id":"cap_01J8XR5T...","v":{"body":"幅約3mm、上方へ伸長"}}
{"op":3,"hlc":"2026-07-16T09:20:11.002Z-0000-a_7f3k2m9q","actor":"a_7f3k2m9q","user":"usr_01J8...","t":"delete","e":"caption","id":"cap_01J8XQAA..."}
```

| フィールド | 内容 |
|---|---|
| `op` | actor内シーケンス番号（1始まり単調増加）。`(actor, op)` が opId |
| `hlc` | Hybrid Logical Clock（後述）。全操作の全順序を決める |
| `actor` / `user` | 書き手。userは表示・集計用 |
| `t` | 操作種別: `create` / `update` / `delete` |
| `e` | エンティティ種別: `set` / `caption` / `view` / `material` / `asset` / `meta` / `profile` |
| `id` | 対象エンティティID |
| `v` | createは全フィールド、updateは**変更フィールドのみ**のパッチ。deleteは省略 |

### 4.2 HLC（Hybrid Logical Clock）

`hlc = 物理時刻(ISO8601 ms) + "-" + 論理カウンタ(4桁hex) + "-" + actorId`

- 生成規則: 新しいopのhlcは `max(現在時刻, 自分が観測した最大hlc)` を取り、同時刻なら論理カウンタを+1する
- 端末の時計が狂っていても、**取り込んだ他者のログより過去のhlcを発行しない**ことが保証される（マージ後の追記が必ず「後」になる）
- 比較は文字列比較で完結する（同時刻・同カウンタはactorIdで決定的にタイブレーク）

### 4.3 状態の導出（reduce）

1. 全 `ops/*.jsonl` を読み、`(actor, op)` で重複排除する（同じファイルを二重に取り込んでも安全）
2. 全操作をhlc昇順にソートする
3. 順に適用する:
   - `create`: エンティティ生成。既存なら（同一ZIPの再取り込み等）フィールドごとにLWW適用
   - `update`: **フィールド単位のLast-Writer-Wins**。フィールドごとに「最後に書いたhlc」を記録し、より新しいhlcの値だけが勝つ
   - `delete`: tombstone化。ただし**update-wins規則**（後述）
4. 結果がビューアに表示される状態

決定性: 入力（opの集合）が同じなら、取り込み順・統合者によらず結果は同一（NFR-02充足）。

### 4.4 競合ポリシー

| ケース | 解決 |
|---|---|
| 別々のキャプションを編集 | 競合なし。両方反映 |
| 同一キャプションの別フィールド（Aがtitle、Bがbody） | 競合なし。両方反映（フィールド単位LWWの利点） |
| 同一キャプションの同一フィールド | hlcが新しい方が勝つ（LWW）。敗れた値もログに残るため、マージレポートに「上書きされた変更」として列挙する |
| 削除 vs 並行更新 | **更新が勝つ（update-wins）**。削除op以降のhlcを持つupdateがあればエンティティは復活する。記録用途では「消したつもりが誰かが加筆していた」場合に加筆を守る方が安全 |
| 同一entityIdの二重create | 実質起きない（ULID）。起きた場合はフィールドLWWで合成 |

競合の自動解決結果は必ず**マージレポートUI**（docs/05参照）に表示し、記録として `ops/` に解決者の修正opを追記できるようにする。

### 4.5 snapshot.json（任意の高速化）

```json
{
  "schemaVersion": 1,
  "vector": { "a_7f3k2m9q": 152, "a_x81p0c4d": 87 },
  "state": { "captions": {...}, "views": {...}, "materials": {...}, "assets": {...} }
}
```

- `vector` = 畳み込み済みの per-actor 最大seq（バージョンベクトル）
- 起動時: snapshotを読み、vectorを超えるopだけ追い適用する。snapshotが無い/壊れていればopsから全再構築する。**snapshotは常に捨てられるキャッシュ**であり、正本はopsのみ
- エクスポート時に最新snapshotを同梱する（スマホでの起動高速化）

### 4.6 コンパクション（将来）

ログ肥大時（目安: 数万op超）に、全actorの合意済み範囲をsnapshotへ確定し古いログを `ops/archive/` へ移す操作を定義できる。ただしMVPでは実装しない。キャプション用途のop数は高々数千であり、JSONL数千行は無視できるサイズのため。

## 5. エンティティスキーマ

### set（表示セット）★LociMyuのシート切替の継承

LociMyuでは「シート切替」が単なるキャプション分類ではなく、**マテリアル設定（透明度・Unlit等）とキャプション位置とビューを束ねた「見え方セット」**として運用されている（例: 半透明表示用セットでは内部にピンを置き、通常表示用セットでは表面にピンを置く）。LociViewはこれを第一級の概念として引き継ぐ。

```json
{
  "id": "set_01J8XQ...",
  "name": "半透明・内部指摘用",
  "defaultViewId": "view_01J8...",
  "order": 1,
  "deletedAt": null
}
```

- caption / material / view の各エンティティは `setId` を持ち、セットに属する
- **セット切替 = アクティブsetIdの変更**。表示キャプション・適用マテリアル設定・ビュープリセット一覧が一括で切り替わり、`defaultViewId`（未設定なら当該セットで最後に保存したビュー）が適用される — LociMyuの挙動（materials saved per sheet / `__LM_VIEWS` のsheetGidスコープ / シート切替時のビュー適用）と同型
- プロジェクト作成時に既定セット1つを自動生成する。セットの追加・改名・並び替え・削除もopとして記録され、通常どおりマージされる
- アクティブsetIdは端末ローカルの一時状態であり、opには記録しない（他人の画面を切り替えない）

### caption

```json
{
  "id": "cap_01J8XR5T8K...",
  "setId": "set_01J8XQ...",
  "title": "北壁の亀裂",
  "body": "幅約3mm、上方へ伸長",
  "color": "#eab308",
  "tags": [],
  "attachments": ["ast_01J8XR..."],
  "anchor": {
    "modelAssetId": "ast_01J8XQ...",
    "position": [0.412, 1.033, -0.207],
    "normal": [0.0, 0.0, 1.0],
    "nodePath": "Root/Building/WallN",
    "triIndex": 15230,
    "bary": [0.2, 0.5, 0.3]
  },
  "createdBy": "usr_...", "createdAt": "...",
  "updatedBy": "usr_...", "updatedAt": "..."
}
```

- LociMyuからの変更点: `imageFileId`(単数・Drive ID) → `attachments`(複数・assetId)、座標はワールドではなく**モデルローカル座標**、アンカーに面情報を付加（モデル差し替え時の再配置に使用。docs/04参照）
- `attachments` は種類を問わないasset参照。添付の種類はasset側の `kind` が持つため、**将来音声等を足してもcaptionスキーマは変わらない**
- `position` だけでも成立する（nodePath以降はfallback用の冗長情報）

### asset（モデル・画像の登記簿）

```json
{
  "id": "ast_01J8XQ...",
  "kind": "model",
  "path": "models/ast_01J8XQ....glb",
  "originalName": "site_scan_v3.glb",
  "mime": "model/gltf-binary",
  "size": 48211930,
  "sha256": "...",
  "transform": { "scale": 1.0, "upAxis": "Y", "offset": [0,0,0] },
  "deletedAt": null
}
```

- `kind` は `model | image | video | audio | other`。**MVPでUIを実装するのはmodel/imageのみ**だが、種別はデータ仕様として最初から定義しておく（映像UIはPhase 2 = FR-31、音声UIは需要が出た時点で追加。§9の「未知種別素通し」規則により、古いバージョンのアプリで開いても未対応添付は無視されるだけでデータは壊れない）
- ZIP内の実体ファイル名はassetId。`originalName` は表示用に保持する
- `transform` は原本を改変せずに表示調整を保存するレイヤー（設計原則4）
- ファイル実体のマージ = ZIP間のファイル和集合（assetIdが名前なので衝突しない）。opsのassetエンティティと実体の突き合わせで欠落を検出する

### view / material

LociMyuの `__LM_VIEWS` / `__LM_MATERIALS` に相当する内容をエンティティ化する。

- `view`: `{id, setId, name, cameraState(eye/target/up/fov/ortho), background, createdBy...}`
- `material`: `{id, setId, modelAssetId, materialKey, opacity, doubleSided, unlit, chroma{enable,color,tol,feather}}`
  - `materialKey` は表示名ではなく**決定的マテリアルキー**（docs/04で定義）。LociMyu監査P1「表示名キー」の解消
  - `setId` ごとに独立して保持する（セット切替でマテリアルの見え方が丸ごと切り替わる）。同一 `(setId, modelAssetId, materialKey)` は1エンティティに正規化する

### profile（編集者名簿）

`{id: userId, displayName, defaultPinColor}` — プロジェクトに触れた編集者の表示名を自己申告で記録する。マージ時に「誰の変更か」を人間可読にするため。

## 6. スプレッドシート往復（UC4）とGoogle Drive ZIPインポート（FR-02）

### 6.1 キャプションのCSV/xlsxエクスポート

列: `captionId, setName, title, body, color, tags, attachmentNames, modelName, posX, posY, posZ, createdBy(表示名), createdAt, updatedBy, updatedAt`

- xlsxエクスポート時は表示セットごとに1シート（LociMyuの見た目と揃える）。CSVは `setName` 列で表現する
- CSVは**UTF-8 BOM付き**（ExcelでダブルクリックしてもJIS環境で文字化けしない）。座標は丸めずに完全精度で出力する
- **座標コピペ運用を第一級ユースケースとする**: スプレッドシート上で posX/Y/Z を行間・プロジェクト間・モデル間でコピペし、再取込すれば該当ピンがその位置へ移動する。`modelName` 列を書き換えれば、キャプションの帰属モデルを一括で付け替えられる（モデル入れ替え時の定番手順。`modelName` は asset登記簿の `originalName` で解決する）
- エクスポートZIPには閲覧用 `captions.csv` を常に同梱する。これは snapshot.json と同じ**派生キャッシュ**であり、正本はops。取込時は原則無視するが、opsとの食い違いを検出した場合は「CSVの手編集を反映しますか？」と提案する（FR-33、Phase 2）
- **帰属の意味論**: CSV再取込による変更は「取込を実行した人の編集」としてopに記録される（updatedBy=取込者）。ZIPマージが各編集者の署名を保持するのと異なり、CSVはレビュー・一括修正の道具という位置づけ。この違いはUIの取込確認画面に明記する

- 人間はこの表でtitle/body/color/tagsを一括編集できる
- 再インポート時: `captionId` を突き合わせ、**変更されたセルだけをupdate opとして自分のログに追記**する。行削除は削除確認リスト表示の上でdelete op化。captionIdの無い行は新規create（アンカーが無いキャプションは「未配置」扱いでリスト表示され、後から3D上に配置できる）
- つまりスプレッドシートは「編集用の一時ビュー」であり正本ではない。往復してもop-logの一貫性が壊れない

### 6.2 Google DriveフォルダZIPのインポートウィザード

DriveフォルダをZIPダウンロードすると、Sheetsは `.xlsx` に変換されて同梱される。これをそのまま放り込んだ場合:

1. ZIP内を走査: `lociview.json` があれば → 通常オープン/マージ
2. なければインポートウィザード起動: モデルファイル（glb/obj/fbx/stl/ply...）、画像群、xlsx/csvを自動検出して一覧表示
3. xlsxがLociMyuスキーマ（`id,title,body,color,posX,posY,posZ,imageFileId,createdAt,updatedAt` ヘッダ）なら移行モード:
   - **キャプションシート1枚 → 表示セット1つ**として変換する（シート名→セット名）。`__LM_MATERIALS` / `__LM_VIEWS` の行は sheetGid/シート対応から各セットの material / view エンティティへ変換する（LociMyuの「シート=見え方セット」運用をそのまま保存する）
   - 各行 → create op（captionId = `cap_` + 旧idから決定的に生成。二度取り込んでも同一IDになりマージで重複しない）
   - `imageFileId` はオフラインでは filename に解決できないため「未リンク画像」として保持し、画像とキャプションを突き合わせる**手動リンクUI**を提供する。補助として `fileId,filename` 対応表CSVの読み込みに対応する（対応表は移行時に一度だけ、ユーザー自身のGoogle Apps Scriptでフォルダを列挙して生成できる。手順スニペットを移行ガイドに同梱する — LociMyu本体の改修は不要）
   - 座標系: LociMyu保存座標はワールド座標。同一モデル・無変換ロードならモデルローカルと一致するため原則そのまま取り込み、`anchor` のfallback情報は空とする
   - 移行対象は現在1プロジェクト・約200キャプション・View設定ありと確認済み。この規模なら移行ウィザードは1回きりの半自動処理で十分であり、専用の自動照合機構は作らない
4. 6.1のLociView標準列スキーマのxlsx/csvなら通常インポート
5. 新規 `projectId` を発行し、原本ファイルをassetIdで登記して `.lociview` を生成

## 7. マージの操作フロー（実装仕様）

「開いているプロジェクトに、別のZIPを放り込む」= マージ。

1. 投入ZIPの `lociview.json` を読む。projectId一致を確認（不一致なら選択肢提示）
2. `ops/*.jsonl` を読み、既知のバージョンベクトルとの差分op集合を抽出する
3. 差分を適用し、**マージレポート**を生成: 新規キャプションn件 / 更新m件 / 削除k件 / LWWで上書きされた変更のリスト（誰のどの値が残り、どれが負けたか）
4. `models/` `media/` の未知assetIdファイルをワークスペースへコピーする
5. 自分の `ops/<自分のactorId>.jsonl` は影響を受けない（追記すらされない — マージは他人のログが増えるだけ）

逆方向（自分の編集を相手へ渡す）は、エクスポートしたZIPを相手が同じ手順で取り込むだけ。git的に言えば「全員が全ブランチをfetchし合う」モデルであり、中央リポジトリを必要としない。

## 8. セキュリティ・健全性ガード（監査チェックリスト継承）

- ZIP展開: パストラバーサル拒否、展開後合計サイズ上限、ファイル数上限、ネストアーカイブ拒否、拡張子とマジックバイトの相互確認
- 文字列: title/body/表示名/マテリアル名/ファイル名は全てuntrusted。DOM挿入は`textContent`のみ（innerHTML禁止）。CSVエクスポート時は先頭 `=+-@` をエスケープ（formula injection対策）
- JSONL: 1行の最大長、op数上限、スキーマバリデーション（不正行はスキップし警告レポート）
- 画像: デコードはブラウザ任せだがサイズ・枚数上限を設ける

## 9. スキーマ進化

- `lociview.json` の `schemaVersion` とopの `e`（エンティティ種別）で判定
- 未知のエンティティ種別・未知フィールドは**保持して素通しする**（古いアプリで開いて保存しても新しいデータを消さない）
- 破壊的変更時はインポート時マイグレーションを実装し、旧schemaVersionの読み込みは永続サポートする（NFR-07）
