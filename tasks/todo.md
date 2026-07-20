# LociView 開発

## 実装フェーズ（2026-07-18 開始）

- [x] バリアフリー要件（CSV/座標コピペ）とFR-32/33を資料反映
- [x] プロジェクト土台（Vite + TypeScript + Vitest、依存lock、git初期化）
- [x] **P0-1: op-logコアエンジン** — ids/hlc/schema/reduce/merge/jsonl + テスト37件全通過（決定性をシャッフル/重複/分割のプロパティテストで証明）
- [x] Platform層: WorkspaceFS抽象 + MemoryFS + OPFS実装（OPFS実機検証は後続）
- [x] AssetPipeline: ZIP入出力（zip.js）+ 健全性ガード（トラバーサル/zip bomb/ネスト拒否）
- [x] ProjectStore: dispatch→追記→再導出の単方向フロー、2者マージ収束テスト済み
- [x] プロジェクトZIP往復（export/inspect/import/merge/差分ZIP、captions.csv・snapshot.json同梱）
- [x] CSV入出力（BOM・完全精度・formulaガード往復・座標コピペ・modelName付替え・新セット生成）
- [x] ViewerCore: three.jsシーン + GLB/OBJ/STL/PLYローダ + ピン（ブラウザ実機で4形式の描画・ピック・ZIP往復を確認）
- [ ] xlsxインポート（SheetJS。Drive ZIP移行ウィザードの一部）
- [ ] マテリアル調整のViewerCore実装（unlit・クロマキーシェーダパッチ移植）
- [ ] 平行投影・±XYZカメラ・ビュープリセット適用

### 検証環境メモ
- Claude Codeのブラウザペインでは rAF が発火せず screenshot も不可。検証は renderOnce() + ピクセルサンプリングで行う（viewer.tsのupdateMatrixWorld防御はこの環境で発見した実バグ由来）
- [x] UI/UXモック作成・提示（docs/mockups/ui-mock-v1.html、Artifact公開済み）
- [x] UI/UXコンセンサス確定（docs/05冒頭に記録: 5タブ・データタブ分離・長押しピン・ダーク継承）
- [x] **製品UI v1実装** — ホーム/ビューア画面/5タブ/Undo・Redo/検索/セット切替/マージレポート/
      ボトムシート3段階/長押しピン追加。ブラウザ実機で作成→編集→Undo→リロード復元(OPFS)→
      モバイルシート→長押し追加まで検証済み
- [x] **Drive ZIP移行ウィザード + LociMyu移行**（FR-02） — 自前xlsxリーダー、シート→表示セット変換、
      __LM_VIEWS/__LM_MATERIALS移行、決定的captionId、画像手動リンク+fileId対応表CSV。
      ブラウザ実機でZIP投入→ウィザード→2セット/3キャプション/ビュー/マテリアル/画像リンクまで検証済み
- [ ] PWA化（Service Worker・manifest・file_handlers）
- [ ] Material拡張（unlit・クロマキー移植）、平行投影
- [ ] iOS実機検証（P0-2。ユーザー協力）→ MVP完了判定（docs/01成功基準1〜3）
- [ ] PWA化、iOS実機検証（P0-2はユーザー協力が必要）

# LociView 設計フェーズ

## Plan

- [x] Locimyu2 の監査資料・ソースを調査し、現行アーキテクチャとデータ構造を把握する
- [x] ビジョン・要件定義書を作成する（docs/01）
- [x] データフォーマット仕様書を作成する（docs/02）★マージ可能セーブデータの核心
- [x] アプリアーキテクチャ設計書を作成する（docs/03）
- [x] 3Dフォーマット対応・描画設計書を作成する（docs/04）
- [x] UI/UX設計書を作成する（docs/05）
- [x] デバイス展開・オフライン戦略書を作成する（docs/06）
- [x] ロードマップと未決事項リストを作成する（docs/07）
- [x] README（資料インデックス）を作成する
- [x] ユーザーレビュー第1回 → U-03/U-05/U-06確定（docs/07「確定済み事項」参照）
- [x] 設計思想を docs/00-design-philosophy.md として文書化（4+1層・依存一方通行・データが幹）
- [x] 改善提案7項目 → 全採用。FR-14/15/26〜31登録、U-07確定、音声メモは添付一般化(attachments+kind)で将来予約
- [ ] 残る未決事項（U-01/02/04）の確定 → Phase 0 PoC計画へ

## 前提（ユーザー要求の整理）

1. ローカルデータ起動が前提。ネット回線なしで全機能が動くこと
2. Google Driveのスプレッドシート+画像群をzipのまま放り込めばビューアが起動
3. セーブデータはgit的にマージ可能。複数人のキャプションを統合・更新できる
4. 編集ユーザー・キャプションに固有IDを振る
5. GLBに加えて obj / fbx / stl / 点群 に対応
6. HTMLベース。スマホ含む幅広いデバイスで動く（横展開の容易さ重視）
7. スマホでセーブデータを取り回せるかの検討が必要
8. UI/ビューイングのUIUXはLociMyuから概ね継承

## Review（2026-07-16 設計初版）

- Locimyu2の構造監査（locimyu-public-release-review.md）を土台に採用。監査が提案していた「event log方式」「assetId間接参照」「UUID主キー」は、Sheets上ではなくローカルファイル（op-log JSONL）で実装する方針とした
- セーブデータのマージは「状態の3-wayマージ」ではなく「編集者ごとの追記専用ログの和集合」で実現。CRDTライブラリは不採用（自前のフィールド単位LWW + HLCで十分、人間可読性を優先）
- スマホのセーブデータ取り回しは「OPFSワークスペース + 明示的書き出し（共有シート）」で全プラットフォーム成立と結論。ただしiOS実機PoC（P0-2）が最重要検証項目
- 未決事項7件（U-01〜07）をdocs/07に集約。特にU-03（シート切替相当の要否）とU-06（点群の実データ）はユーザーヒアリングが必要

## Review（2026-07-16 ヒアリング反映）

- U-03: シート切替=見え方セット（マテリアル透明度×キャプション位置×ビュー）と判明。**表示セット（set エンティティ）を第一級で導入**（docs/02 §5、docs/05 §2、FR-13）。caption/material/view全てsetIdスコープに変更
- U-06: 点群はPLY → PLYをMVPへ引き上げ（docs/04対応表更新）
- U-05: 移行は1プロジェクト・約200キャプション → 手動リンクUI+Apps Script対応表CSVの半自動で確定（LociMyu本体改修なし）
- 教訓をtasks/lessons.mdに記録（既存機能の廃止提案は運用ヒアリング先行）
