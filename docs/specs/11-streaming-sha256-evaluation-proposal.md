# 照合計算の高速化 —分割SHA-256の評価案

Status: **PROPOSED。新依存の導入・実装・製品接続は未承認／未実施。**
契約・技術の独立レビューで指摘を解消した評価案であり、ライブラリの安全性・性能合格ではない。

## 1. 利用者の結果と根拠

原本・画質と、読み込み／書込後／復旧時の完全な照合を残したまま、計算自体を速くする。
設定・操作手順・ファイル種別は増やさない。今回の快適化の実装・実測・最終検証は
[todo](../../tasks/todo.md)、現行契約内の整理は[06e §9](06e-selected-generation-output-read-proposal.md)を参照する。

Ki-84の出力CPU診断1回では、Native SHA圧縮の自己CPU約2.47秒とrotate約0.46秒を観測した。
これは出力全体約26秒のすべてではなく、50万点GSの削減秒数でもない。復元の44件の
検証情報保存約20.4秒には管理確認・I/Oも含まれ、本案で消えるとは扱わない。
現在の協調実行で画面停止は減ったが、暗号計算そのものは残るため、別の実装を評価する。
このCPU集計には今回対象外の出力ZIP全体SHAや`packageByteHash`も含まれるため、約2.93秒を
削減可能量にしない。対象caller別CPU・初期化回数・初回compile／再利用時を分けて評価する。

## 2. 一括判断する範囲

- 新しい固定依存`hash-wasm@4.13.0`を評価導入する。依存のlockfile・integrity・同梱内容・
  ライセンスを確認し、`npm audit`を行う。既存のproduct LICENSE・version・公開方針は変更しない。
- 最初の接続対象は`checkedBlobStream`と`PackageArchive.inspect`のSHA-256だけ。
  現在の`NativeSha256`は残し、他のNative/GS用途を無条件に置換しない。CRC32は変更しない。
- 技術評価・独立レビュー・実操作の効果・受入れがすべて合格した場合だけ、この2経路への
  接続まで同じ単位で進める。効果がなければ現行実装を維持する。一般公開は含まない。
- [AGENTS.md](../../AGENTS.md)の新依存承認が必要。仕様06b/06c/06eの検査例外を広げる承認は
  求めない。新しいpartial preview、検査延期、write/readback/復旧fenceの集約は対象外。

## 3. 実装境界と不変条件

公開API・保存形式・SHA-256の値・変換ID・profile・受入れ上限は変えない。内部の分割hash
factoryだけで実装を選ぶ。`core`/`viewer`からUI・Project保存・package形式へ依存を加えない。
内部portは`update(Uint8Array): void`と`digestHex(): string`に閉じ、生成だけを非同期にする。
呼出し元の既存のlive/abort/cancel確認を使い、factoryへProjectや保存の権限を渡さない。
依存方向は対象2caller→純粋hash adapter→固定依存／既存Native classに閉じる。
既存のpure hash付近を使い、移設や新しいディレクトリcycleを同時に加えない。

- `createSHA256()`の独立instanceをhashごとに所有する。共有状態を持つone-shot helperは使わない。
  entry全体／archive全体の別状態を保持し、別operation・owner・FS・入力へ状態や結果を貸さない。
- `save()`/`load()`による中間状態の永続化・共有・再開、digest/proofのcacheは導入しない。
  ライブラリ内のimmutableなコンパイル済みcode cacheと、入力や検査済み証拠を区別する。
- 既存のraw chunk数・サイズ・全量の予算、全量の所有copy、同じ全bytesと順序を維持する。
  一つの巨大ArrayBufferへの全ファイル展開は行わない。CRC・各SHA・保存後照合を省略しない。
- 非同期初期化の前後でもowner/abort/cancelを確認する。借用bytesを保持してawaitしない。
  取消後はchunk・digest・完了通知を採用しない。各stream/inspectionが自身の状態を破棄する。
  init拒否・取消では上流readerのcancel／lock解放を行い、遅延resolve/rejectも観測する。
  所有するinitのsettleと遅延instanceの参照破棄まで待ち、失効後にread/update/completeへ進まない。
  ライブラリの公開APIには明示的なdisposeがないため、参照の破棄を物理RAMの即時解放や
  native cleanup完了とみなさない。反復利用の残留・peakを評価し、悪化する接続は採用しない。
- `WebAssembly`または必要な`compile`/`instantiate` APIが存在しないという、閉じた事前条件だけで
  現行Native実装を選べる。「入力前」はこのhasherの最初のupdate前を指し、既存header/control検査や
  archive読取の順序は変えない。kernelのfallbackだけでアプリ全体の未対応環境を対応扱いしない。
  `createSHA256()`の任意rejection、CSP/compile/instantiate/メモリ/未知の不整合はcatch-allで
  Native成功へ落とさない。未知の初期化／更新／終了失敗を成功扱いせず、途中から別実装へ継ぎ足さない。
  失敗・再試行・解放の挙動を明示的に検証する。新しいUI選択肢は作らない。
- 固定版は失敗したcompile Promiseもcacheする。同じpageの再試行で回復すると約束しない。
  この失敗と再読み込み後の再開／再選択を試験し、既存のエラー領域で必要な対処を案内する。
  private cacheを直接書き換えず、Project・保存済み記録・復旧記録を消さない。
- 分割入力と既存task境界を保持し、初期化・計算・解放のCPU/メモリと画面停止を測る。
  実RAM・速度・停止時間の新しい数値保証は作らない。
- npmから固定したcodeをアプリへ同梱し、CDN・実行時network取得・外部送信を加えない。
  実際にbundleへ入るalgorithmとライセンス表記を確認し、不要なalgorithmを有効化しない。
  offline precache/SRI/更新分離を従来の試験で検証する。

## 4. 受入れと採用条件

1. 既存Nativeと独立したNode crypto／ブラウザ標準SHA-256と、空入力・全byte値・padding/block/
   chunk境界・分割方法の違い・実ファイルで一致する。改変・欠損・上限拒否とエラー分類を維持する。
2. 同時に使う独立instance、初期化中／chunk中の取消・dispose・古いowner、init/update/finish失敗を
   検証する。streamのlockと資源を解放し、遅延完了・不完全な証拠を採用しない。
3. 同じKi-84バックアップと50万点SH4ファイルで各3回測る。SHA段階、記録表示、編集可能、ファイル生成、
   実download、cold再開を区別する。microbenchmarkや上流の速度表だけを採用根拠にしない。
   比較は新しい専用browser/pageでDevTools/Debugger/CPU Profilerを有効化せず実施する。
   CPU診断は別cohortとし、libraryのglobal初期化mutexとcold/warmの費用を無料・並列と扱わない。
4. 本文／所属／視点／描画、全assetのhash/length、原本履歴・Project identityを保持する。
   保存後の実ファイル検査、二つの環境間の往復、中断復旧と再選択を既存試験で確認する。
5. 小規模データ・PC／スマホ相当、Edge/Chrome、完全終了offline、必要な隔離検査とcheckpointを
   実行する。物理iPhone/Safariのメモリ・IME・発熱・保存を、自動試験の合格へ読み替えない。
6. source/lockfile/ライセンス/bundleと最終差分を独立レビューする。通常操作の待ち・画面停止・資源を
   悪化させず、実操作で効果を確認した範囲だけ接続する。未達は合格へ含めない。

## 5. 読み取り調査の一次資料（2026-11-10）

まだインストールも性能評価も行っていない。バージョン・API・配布形態を確認した段階である。

- [npmの配布情報](https://www.npmjs.com/package/hash-wasm?activeTab=versions)：4.13.0。
- [固定tagのpackage情報](https://github.com/Daninet/hash-wasm/blob/v4.13.0/package.json)、
  [release](https://github.com/Daninet/hash-wasm/releases/tag/v4.13.0)：新しいcompilerでWASMを再buildしており、
  旧版の性能や互換性を流用しない。
- [固定tagのSHA-256 API](https://github.com/Daninet/hash-wasm/blob/v4.13.0/lib/sha256.ts)、
  [WASM interface](https://github.com/Daninet/hash-wasm/blob/v4.13.0/lib/WASMInterface.ts)：分割updateと独立状態を確認。
- [README](https://github.com/Daninet/hash-wasm/blob/v4.13.0/README.md)：WASMは埋め込みcodeとして配布される。
  CDNの使用例は本案に採用しない。
- [LICENSE](https://github.com/Daninet/hash-wasm/blob/v4.13.0/LICENSE)と
  [SHAのC header](https://github.com/Daninet/hash-wasm/blob/v4.13.0/src/sha256.c)：同梱の表記・条件をレビューする。
