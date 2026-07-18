# LociView 設計資料

LociMyu（Google Drive/Sheets依存の3Dキャプションビューア）の後継。**ネット環境なしで3DCGを用いた記録を作り、複数人の記録を労少なく統合する**ためのローカルファーストHTMLアプリ。

> 状態: 設計フェーズ。実装未着手。初版2026-07-16 → ヒアリング反映・改善7項目採用済み（2026-07-18）。残る未決事項は docs/07 の U-01/02/04 のみ。

## 一言でいうと

- プロジェクト = 1個のZIP（`.lociview`）。モデル・画像・キャプションが全部入り。Drive/LINE/USBで受け渡し
- セーブデータ = 編集者ごとの追記専用ログ（JSONL）。**マージ = ファイルの和集合**なので、複数人の編集が衝突せず決定的に統合できる
- アプリ = PWA。PC・スマホ・タブレットで同一。オフラインで全機能が動く
- 対応形式 = GLB/OBJ/STL/PLY（MVP）→ FBX/PCD（Phase 2）→ LAS/LAZ（需要確認後）
- **表示セット** = LociMyuのシート切替の継承。マテリアルの見え方（半透明/Unlit等）とキャプション位置とビューを束ねて切り替える

## 資料構成

| ドキュメント | 内容 |
|---|---|
| [00-design-philosophy.md](docs/00-design-philosophy.md) | 設計思想。4+1層構造、依存の一方通行、データが幹、機能追加チェックリスト |
| [01-vision-requirements.md](docs/01-vision-requirements.md) | 背景（LociMyuの限界）、ビジョン、ユースケース、機能/非機能要件、非目標 |
| [02-data-format.md](docs/02-data-format.md) | ★核心。プロジェクトパッケージ仕様、ID体系、op-logマージ仕様、競合ポリシー、スプレッドシート往復、移行 |
| [03-architecture.md](docs/03-architecture.md) | レイヤ構成、技術スタック選定、ビルドターゲット（PWA+シングルファイル）、セキュリティ |
| [04-formats-rendering.md](docs/04-formats-rendering.md) | 3Dフォーマット対応表、原本主義、単位/座標正規化、マテリアルキー、点群描画 |
| [05-ui-ux.md](docs/05-ui-ux.md) | LociMyu UI継承方針、画面設計、モバイル対応（ボトムシート/タッチピン）、マージレポートUI |
| [06-device-offline.md](docs/06-device-offline.md) | ワークスペースモデル、プラットフォーム対応マトリクス、スマホでのセーブデータ取り回し、PWA構成 |
| [07-roadmap.md](docs/07-roadmap.md) | Phase 0(PoC)〜3、未決事項リスト（U-01〜07）、LociMyu資産マップ |

## 設計の前提となった調査

- `G:\00_AI_dev\Locimyu2\tasks\locimyu-public-release-review.md` — LociMyu構造監査（P0/P1問題、event log方式・assetId間接参照の提案はここが起点）
- `G:\00_AI_dev\Locimyu2\audit_source\` — LociMyu α 全ソース

## キーとなる設計判断（サマリ）

1. **Google API全廃**（コアから）: ネット必須・同時編集破壊・OAuth審査の3問題を一挙に解消
2. **op-log方式**（CRDTライブラリ不採用）: 1編集者1ファイル追記専用 + HLC + フィールド単位LWW + update-wins。人間可読・決定的・依存ゼロ
3. **原本主義**: 3Dモデル/画像は無改変で格納。調整はすべて別レイヤー（transform/material設定）に記録
4. **ワークスペース分離**: 作業はOPFS自動保存、ZIPは受け渡し時のみ。これがスマホ横展開を成立させる
5. **UIはLociMyu継承**: Caption/Material/Viewsタブ+ステージ構成+シート切替（→表示セット）を維持し、Modelタブとマージレポートを追加
