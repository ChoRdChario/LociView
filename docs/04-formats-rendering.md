# 04. 3Dフォーマット対応と描画設計

## 1. 対応フォーマット計画

| フォーマット | ローダ | Phase | 備考・制約 |
|---|---|---|---|
| GLB / glTF | three.js GLTFLoader | MVP | 現行同等。埋め込みテクスチャ対応。外部URI参照は拒否 |
| STL (binary/ascii) | STLLoader | MVP | マテリアル情報なし → 既定マテリアルを適用。単位・上軸問題が頻発（§3） |
| OBJ + MTL | OBJLoader / MTLLoader | MVP | MTL・テクスチャはZIP内相対パスで解決。MTL欠落時は既定マテリアル |
| PLY | PLYLoader | **MVP** | ユーザーの点群主要フォーマットと確認済み。メッシュ・点群の両方があり得る。頂点色対応 |
| FBX | FBXLoader | 2 | FBX 7.x系（2011以降）対象。旧ASCII FBXは非対応と明記。単位cm既定に注意 |
| PCD | PCDLoader | 2 | 点群。intensity等の属性 |
| LAS / LAZ | laz-perf (WASM) 経由で自前ジオメトリ化 | 需要確認後 | WASMバンドル増・メモリ大。分類/強度の色分け需要を確認してから |
| E57 | — | 対象外 | 需要確認まで見送り（非目標） |

### ModelLoaderRegistry

```
detect(file) → {format, confidence}   // 拡張子 + マジックバイト
load(file, deps) → ModelAsset          // deps: MTL・テクスチャ等の随伴ファイル解決コールバック
```

全ローダは共通の `ModelAsset` を返す:

```ts
interface ModelAsset {
  root: THREE.Object3D;
  kind: 'mesh' | 'points' | 'mixed';
  materials: MaterialEntry[];   // 決定的キー付き（§4）
  stats: { vertices, triangles, points, textures, bounds };
}
```

- ローダ本体は**動的import**でコード分割する（GLBしか使わないユーザーにFBX/WASMのコストを払わせない。ただしPWA precacheには全て含め、オフラインでも全形式が動く）

## 2. 内部変換はしない（原本主義）

取り込んだモデルをGLB等へ内部変換して統一する案は**採らない**。

- 変換は情報を落とす（点群属性、FBX階層、STLの真円度はどのみち無いが…）
- 記録用途では「取り込んだ原本がそのまま入っている」ことが監査可能性として価値を持つ
- 代償としてロード時パースが毎回走るが、パース済みジオメトリのIndexedDBキャッシュ（assetIdキー）で二回目以降を高速化する（Phase 2最適化、キャッシュは常に捨てられる）

## 3. 単位・座標系の正規化（表示レイヤー）

STL/FBX/点群で「デカすぎる・寝ている・遠すぎる」が必ず起きる。原本は触らず、asset登記簿の `transform` に表示時変換を保存する（docs/02 §5）。

- インポート時に自動推定: バウンディングボックスが極端（>1000 or <0.01）ならスケール候補を提示、FBXはcm→m既定、STLはZ-up→Y-up候補を提示
- Modelタブ（新設、docs/05）でスケール/上軸/センタリングを手動調整可能。調整はopとして記録されるため、マージしても全員のビューが揃う
- **ピンアンカーはこのtransform適用後のモデルローカル座標で保存**する。transformを後から変えてもピンはモデルに追従する

## 4. 決定的マテリアルキー（LociMyu P1解消）

マテリアル設定の保存キーを表示名から独立させる。

```
materialKey = m/<meshPath>/<primitiveIndex>/<materialSlot>
  例: "m/Root|Building|WallN/0/2"
優先: glTF extras.lociviewId があればそれを使用（将来の出力ツール連携用）
```

- 同名マテリアルが複数あっても衝突しない。名前変更にも耐える
- UI表示は従来どおりマテリアル名（重複時は連番付与）
- モデル差し替え時はキー不一致分を「未適用設定」として保持し、再割り当てUIを提供する（Phase 2）

## 5. ピンアンカーの頑健化

docs/02 §5 のanchor構造の運用:

1. 通常時: `position`（モデルローカル）で描画。最速
2. モデル更新後（同一assetIdの実体差し替え/transform変更）: `nodePath + triIndex + bary` から位置を再導出し、成功すればpositionを更新するopを提案。失敗（形状大変更）なら「迷子ピン」リストに出し、手動再配置を促す
3. 点群アンカー: 面が無いため `position + 最近傍点インデックス` を保持。再導出は近傍探索で行う

## 6. 点群レンダリング

- `THREE.Points` + カスタムShaderMaterial。sizeAttenuation、丸ポイントスプライト
- MVP範囲（PLY点群）: 点サイズ調整 + 頂点色/単色表示。色モード拡張（高さグラデーション・強度）と自動サブサンプルはPhase 2
- 色モード: RGB（頂点色）/ 単色 / 高さグラデーション / 強度（属性がある場合）。Materialタブが点群検出時にこのUIへ切り替わる（docs/05）
- 性能目標: デスクトップ500万点 / スマホ100万点で30fps。超過時は**ロード時ランダムサブサンプル**（率をModelタブで可変、原本は無傷）を既定動作にする
- 本格LOD（octree / Potree方式）は需要と実データ規模を見て判断。当面サブサンプルで運用する
- ピッキング: raycastのPoints閾値をカメラ距離で調整。タップ半径はタッチ時に拡大

## 6.5 マテリアル拡張（実装済み 2026-07-21）

`src/viewer/shaderPatch.ts` — LociMyu `viewer.module.cdn.js` の `patchMaterialShader` を移植。

- **Unlit**: ライティングを無視し、素の拡散色を出力する。図面的な確認・テクスチャ色の確認用
- **クロマキー**: 指定色との距離を `smoothstep(tolerance, tolerance+feather, dist)` で評価し透過させる

**移植時に修正した元実装のバグ**: LociMyuは `#include <dithering_fragment>` の直後で `diffuseColor.a` を
変更していたが、その時点では `opaque_fragment` により `gl_FragColor` が確定済みのため透過が反映されない。
LociViewでは (1) `color_fragment` 直後にライティング前の色を `lvBaseColor` へ退避し、
(2) `tonemapping_fragment` の直前で `gl_FragColor.a` を直接操作する形に変更した。
これにより「指定色が実際に透明になる」ことをピクセル実測で確認済み。

**移行時の扱い**: LociMyu時代のクロマキー設定は「設定しても効かなかった」ため、当時の見え方は
クロマキーOFFの状態である。修正版でそのまま有効化すると移行後に見た目が激変してしまうので、
**設定値は保持したまま `enable: false` で取り込み**、取込完了ダイアログでその旨を伝える。
ユーザーはMaterialタブから任意に有効化できる。

## 7. レンダリングパイプライン共通

- LociMyuから移植: HemisphereLight+DirectionalLight、SRGBColorSpace、OrbitControls、ピンのSphere+パルスRing、クロマキーonBeforeCompileパッチ
- 追加: WebGL2前提（2026年時点で実質全ブラウザ）、`powerPreference: 'high-performance'`、コンテキストロスト復帰処理（スマホで頻発するため必須）
- メモリガード: モデルロード前にサイズ・頂点数を検査し、端末メモリクラス（Platform Layer提供）に応じて警告 or サブサンプル提案
- dispose規律: ModelAsset単位でgeometry/material/textureを確実に破棄（監査チェックリスト継承）
