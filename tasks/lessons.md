# Lessons

## 2026-07-16: 既存機能の廃止提案は運用ヒアリングを先にする

- 設計初版で「シート切替はタグで代替・廃止」と提案したが、実運用ではシート切替が「マテリアルの見え方（半透明/Unlit）× キャプション位置 × ビュー」を束ねた**見え方セット**として使われており、単なる分類機能ではなかった
- ルール: LociMyuの既存機能を削る・簡略化する提案をする前に、その機能が実運用でどう使われているかを必ず確認する。機能の表面的な形（シート）ではなく、運用上の役割（見え方の切替）を見る

## 2026-07-20: 依存追加時は脆弱性を確認し、用途に照らして判断する

- xlsx読取のためSheetJS(npm `xlsx`)を入れたところ、修正版が公開されていないPrototype Pollution/ReDoS（high）が検出された
- 本アプリは「他人が作ったZIPを解析する」用途であり、パーサの脆弱性は直接の攻撃面になる。→ 依存を外し、必要な機能（読み取り専用・セル値取得のみ）を自前実装した（`src/io/xlsx.ts`、依存ゼロ・線形時間の正規表現のみ）
- ルール: 依存を追加したら `npm audit` を必ず確認する。脆弱性がある場合、「機能のどこまでが本当に必要か」を問い直す。全機能ライブラリの一部だけが必要なら、自前実装が最も安全で軽いことが多い

## 2026-07-21: 移行機能は合成データではなく実データで検証する

ユーザーの実データ（LociMyu実プロジェクト）を投入したところ、合成テストでは全て通っていた移行機能に5件の不具合が見つかった。

1. **gidの正体を取り違えていた** — `__LM_MATERIALS.sheetGid` はGoogle Sheetsの内部ID（`617884617`）だが、xlsxにはこれが保存されない。私はxlsxのシート番号（1,2,3）をgidとして使っていたため、マテリアル・ビューが一切正しいセットに割り当たらなかった。→ `__LM_SHEET_NAMES`（LociMyuが記録している対応表）＋出現順の推定で解決
2. **xlsxの数値が指数表記** — `6.17884617E8`。合成データでは文字列で書いていたため露見しなかった
3. **`Number('') === 0` かつ `isFinite(0) === true`** — 空欄のfov列が0になり、平行投影のfrustumが潰れて画面が真っ暗になった。fallbackが効かない典型的な罠
4. **実運用では名前付きビューが存在しない** — 保存されていたのは `__last`（最後に見ていた視点）だけ。これを「内部用」としてスキップしていたため、視点が1つも移行されなかった
5. **バックアップファイルの同梱** — `LociMyu Save.xlsx` と `LociMyu Save backup.xlsx` の両方を読み、同一IDのキャプションが二重生成されて所属セットが壊れていた

- ルール: 変換・移行系の機能は、**必ず実データで一度通す**。合成テストは自分の理解を検証するだけで、他システムの実際の出力形式は検証できない。特に「他システムが書いたファイル」を読む機能では、仕様の推測が外れていても合成テストは全て通ってしまう
- ルール: 数値パースのfallbackは `Number.isFinite` だけでは不十分。空文字を明示的に弾く
- ルール: 元実装のバグを修正した場合、移行時に「当時の見え方」が変わる。修正が正しくても、移行では元の挙動を再現し、変更点を利用者に伝える

## 2026-06-29: 実証済みのZIP運用はUI/UXを含むシステムとして改善する

- ZIP方式を固定成果物の手作業配布だけと捉えず、生成、更新、差分確認、source folder導線まで含めて評価する。
- ユーザーが「ZIPでなければ成立しなかった」という実績を示した場合、理論上純粋な代替方式より、実証済み方式を安全で短い操作へ変える案を優先する。
- 編集元とruntime配布物を分離し、可搬containerを交換媒体として扱う。

## 2026-06-30: HTML parserの安全性は実際のsinkで検証する

- `innerHTML`、SVG、template、select等の挙動は、一般論や`script`の非実行だけでXSS可否を判断しない。
- 実コードと同じ挿入先・template・対象browserで、DOM注入、event属性残存、自動実行を分けた最小PoCを行う。

## 2026-08-16: GSとmeshの共存には同一空間の補修・交差を含める

- meshは別表示物だけでなく、GS欠損部を補うため同一領域で交差・重複し得る。
- `interactionProxy`、`visualPatch`、`splatExclusion`を異なるroleとして保存・描画し、collision用meshをvisual/depthへ流用しない。
- 不透明補修でも境界のちらつき、halo、二重表現を評価する。

## 2026-08-16: 半透明は数値ではなく合成意図としてモデル化する

- source material、user override、requested compositing policy、backendが選んだeffective modeを分離する。
- mask/ditherによるcoverageと、smooth blend/transmissionによる光学的透明を区別する。
- GSと交差するsmooth transparencyを保証できないbackendでは近似であることをUIへ示し、renderer固有の`depthWrite`や`renderOrder`を永続化しない。

## 2026-08-16: 閉じたmeshを前面・背面の一組へ単純化しない

- 航空機のような凹凸、翼、胴体を持つ形状では、一画素の視線上に多数のmesh面が並ぶ。
- 単純なfront/back depth二層を一般解として提案せず、Mesh、GS、Compareと、保証範囲を限定したIntegratedを分ける。
- 比較用途ではwipe、flicker、wireframe、dither等、厳密透明合成を要求しないUXも正式な解法として検討する。

## 2026-08-16: audit copyを現行実装だと仮定しない

- 製品名や世代が変わっている場合、最初にcanonical repository、entry point、git ref、build metadataを特定する。
- 現行コードが見つからない時は旧codeから断定せず、確認できた版、確認できない版、必要資料を明示する。

## 2026-08-18: 技術的G0より前にactive workspaceを一つにする

- 旧版展開物、添付ZIP、audit copy、現行repoが同じ探索範囲にあると、検索量だけでなく正本誤認が発生する。
- 設計・fixture固定・実装前にcanonical repository、baseline commit、active source root、archive root、generated/dependency exclusionsを固定する。
- ファイル数削減のために健全なmoduleを結合しない。削減対象は重複source、展開済みarchive、生成物、無効repo、raw researchである。
- 整理前にhash manifestと復元可能なbackupを作り、build/testが同等であることを確認する。
