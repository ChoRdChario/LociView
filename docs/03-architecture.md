# 03. アプリケーションアーキテクチャ

> Status: `HISTORICAL DESIGN`. Several statements differ from current code. Use `PROJECT_MAP.md`, code, and tests for current behavior. See `docs/README.md`.

## 1. 全体像

```
┌────────────────────────────────────────────────────────┐
│  UI Layer（画面・パネル・入力）                            │
│   Home / Viewer(Caption・Material・Model・Views) / Merge │
├────────────────────────────────────────────────────────┤
│  App Core                                              │
│   ProjectStore     … プロジェクトの開閉・状態管理           │
│   OpLogEngine      … op追記・reduce・HLC・マージ ★docs/02 │
│   AssetPipeline    … ZIP入出力・フォーマット判定・登記      │
│   ImportExport     … xlsx/csv往復・LociMyu移行           │
├────────────────────────────────────────────────────────┤
│  ViewerCore（three.js ラッパ）                           │
│   SceneManager / ModelLoaderRegistry / PinLayer /       │
│   MaterialAdapter / CameraRig                  ★docs/04 │
├────────────────────────────────────────────────────────┤
│  Platform Layer（環境差吸収）                             │
│   WorkspaceFS(OPFS) / FilePickers / ShareExport /       │
│   ServiceWorker(PWA)                           ★docs/06 │
└────────────────────────────────────────────────────────┘
```

LociMyu監査が提案した境界（ProjectRepository / CaptionRepository / AssetProvider / ViewerAdapter）を継承しつつ、Google API層を丸ごと削除した構成。**どの層も`window`グローバル・カスタムイベントの暗黙結合を使わない**（LociMyuの49パッチ構造の反省）。モジュール間は型付きインターフェースとexplicitなstoreで接続する。

## 2. 技術スタック（選定と理由)

| 領域 | 選定 | 理由 |
|---|---|---|
| 言語/ビルド | TypeScript + Vite | 依存lock・bundle・監査P1解消。型はop-log/スキーマの守りに必須 |
| 3D | three.js（バンドル・バージョン固定） | LociMyu資産（ビューア操作・シェーダパッチ）の知見をそのまま移植可能 |
| UIフレームワーク | **なし（vanilla TS + 軽量store）** | UI規模は中程度。フレームワーク寿命にアプリ寿命を縛らせない。ただしPreact採用は未決事項U-01として保留 |
| ZIP | zip.js（ストリーミング）| 数百MBのモデル・点群をメモリに全展開せずOPFSへ流すため。小型で済むならfflateへ差し替え可（U-02） |
| xlsx | SheetJS CE（インポート時のみ動的import） | Drive ZIPのxlsx読取に必要。エクスポートはCSV優先でバンドル肥大を回避 |
| ID | ULID（自前実装 or ulidx） | 128bit・時刻順・依存極小 |
| 状態管理 | 自前の型付きstore（pub/sub） | reduceの出力=不変stateを流すだけ。外部依存不要 |
| テスト | Vitest（OpLogEngineは網羅的に） | マージの決定性はテストで担保する必須領域 |

**実行時CDN依存はゼロ**。three.jsもフォントも全てバンドルする（オフライン原則の帰結でもある）。

## 3. ビルドターゲット

同一コードベースから2形態を出力する。

1. **PWAビルド**（主形態）: 静的サイト + Service Worker precache。GitHub Pages等に一度置けば、以後オフライン起動・ホーム画面インストール可
2. **シングルファイルビルド**（可搬形態）: `lociview.html` 1ファイルに全アセットをインライン化（vite-plugin-singlefile）。USBメモリ・プロジェクトZIPへの同梱・メール添付で配れる。ネットに一切触れない環境（`file://` 起動）でも動く
   - `file://` 制約: Service Worker・OPFS不可 → ワークスペースはメモリ+明示エクスポートのみのフォールバックモードで動作する

「アプリ自体もデータと一緒に持ち運べる」ことは、10年後の閲覧可能性（NFR-03）への保険にもなる。

このシングルファイルビルドは、**自己完結ビューア書き出し（FR-29、Phase 3）の技術基盤**でもある: 閲覧専用ビルド + プロジェクトデータの埋め込み = 「ダブルクリックで開ける納品物HTML」。

## 4. モジュール仕様（要点）

### ProjectStore
- 開いているプロジェクトの reduce済みstate（captions/views/materials/assets/profiles）を保持し、UIへ購読を提供
- 書き込みは必ず `dispatch(op)` 経由 → OpLogEngineが自ログへ追記 → 新stateを再導出（差分適用）→ 購読者へ通知。単方向データフロー

### OpLogEngine
- HLC管理、seq採番、JSONL追記（OPFSへ逐次flush = 自動保存FR-10）、reduce、バージョンベクトル、マージ差分抽出
- **純粋関数としてreduceを実装し、Vitestでプロパティテスト**（順序シャッフル・重複投入・分割統合で結果一致）を張る

### AssetPipeline
- ZIP読取（ストリーミング→OPFS展開）、健全性ガード（docs/02 §8）、フォーマット判定（拡張子+マジックバイト）、assetId発行と登記、エクスポート時のZIP再構築
- インポートウィザードのバックエンド（lociview.json有無 → open / merge / import の振り分け）

### ViewerCore
- LociMyu `viewer.module.cdn.js` の機能等価物: シーン・ライト・OrbitControls・raycastピン・ピンパルス・色フィルタ・マテリアルシェーダパッチ（クロマキー）・カメラ状態get/set・背景色
- 変更点: ModelLoaderRegistryによる多フォーマット対応、決定的マテリアルキー、モデルローカル座標系のピン（docs/04）
- three.jsオブジェクトの破棄（dispose）を型で強制するリソース管理を導入（監査チェックリスト「object URL/texture破棄」）

### Platform Layer
- 環境検出と能力フォールバックを一元化: OPFS有無 / File System Access API有無 / Web Share有無 / メモリクラス
- UIやCoreは「保存できるか」をこの層に問い合わせるだけで、ブラウザ差を知らない

## 5. セキュリティ設計（監査チェックリストの継承）

- CSP: `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'`（PWA形態。meta CSPで適用）。`unsafe-inline`/`unsafe-eval` 不使用
- 全外部入力（ZIP内文字列・モデル内マテリアル名・xlsxセル）はuntrusted: `textContent`のみ、長さ上限、正規化
- GLB/glTF内の外部URI参照は拒否（オフライン原則により正当な用途がない）
- ネットワーク通信ゼロが原則のため、token漏洩・API誤送信の問題領域そのものが消滅する
- 依存はlockfile固定 + `npm audit` をCIに組み込む

## 6. リポジトリ構成（実装開始時）

```
LociView/
├─ docs/                  # 本設計資料
├─ tasks/                 # todo / lessons
├─ src/
│   ├─ core/              # OpLogEngine, ProjectStore, ids, hlc, schema
│   ├─ assets/            # AssetPipeline, zip, guards, importers(xlsx, locimyu)
│   ├─ viewer/            # ViewerCore一式
│   ├─ ui/                # 画面・パネル・レスポンシブ
│   ├─ platform/          # opfs, pickers, share, sw
│   └─ main.ts
├─ public/
├─ tests/
└─ vite.config.ts
```
