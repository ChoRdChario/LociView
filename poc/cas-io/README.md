# Isolated bounded CAS I/O proof

Disposable prerequisite evidence for S1, specification 02 §7 and G1-A. No
production adoption, application import, package wire or dependency addition.
Use the existing incremental `NativeSha256` implementation unchanged.

Hypothesis: a stream can be staged, size/hash-verified, copied without relying on
atomic rename and published by a final verified receipt. Interrupted copy or an
interruption between complete receipt writes can resume from verified staging.
A torn receipt is an explicit repair refusal, not silently recoverable or missing.
Unverified bytes are unavailable through the candidate's export API. Existing
verified content is immutable; concurrent identical imports under
one enforced writer deduplicate to one verified payload.

The candidate is backend-neutral. The executable test backend is a fresh local
filesystem directory, NOT OPFS/IndexedDB. A promise queue enforces one process's
single writer, NOT an origin-wide browser lock. Small CAS-only receipts describe
staging and verified-source recovery; they are not the §8 cross-store metadata
journal, ProjectStorageEnvelope, package completion marker or CAS adoption.

Checks: deterministic 500 MiB incompressible stream, incremental SHA-256 versus
Node's independent digest, bounded source/copy/export chunks; cancellation,
injected quota, every CAS receipt/copy boundary, duplicate import and corruption.
Stress chunks and the declared live-buffer code bound must stay below the
existing provisional 64 MiB I/O ceiling. The chunk size is observed; the bound is
code accounting, not a measured heap/RSS/browser/OS/GPU budget or product limit.
Failure preserves any existing published blob; unverified residual files remain
outside visible CAS. Retry uses verified staged bytes, not a guessed original.
The test export sink writes a temporary synthetic file and acknowledges completion
only after sync/close. It is not an atomic filesystem-availability guarantee or
evidence that a browser download can be withheld or rolled back.

Run from repository root:

```powershell
npx vitest run --config poc/cas-io/vitest.config.ts
npx tsc --noEmit --project poc/cas-io/tsconfig.json
```

Missing adoption evidence remains explicit: real OPFS flush/interruption, browser
single-writer and GC coordination, physical iOS/background/quota, CSP/offline,
metadata journal/inventory atomicity, grace-period cross-project GC and real
package import/export closure. These Node checks cannot replace those results.
Reuse passing history/browser/core proofs; do not repeat their manual sequence.

## Executed Node result (2026-09-08)

Isolated typecheck and 17 tests PASS. The 500 MiB case completed in 45.947 s,
including its oracle generation, import, export and independent output reread;
this is one local observation, not a browser/product performance threshold.
Observed chunk maximum: 1,048,576 bytes. Static live-buffer accounting:
3,162,112 bytes (3 MiB + 16 KiB), not a heap/RSS measurement. The final payload
count was one; a completed-transaction replay read zero payload bytes.

Synthetic byte length: 524,288,000. Node and the incremental implementation
agreed on SHA-256
`c8c0875f52ef7820dad6085b1dee88707fa92c5216f950472a2f446ae90cec7b`.
Only the deterministic recipe/digest is retained; generated scratch data was
removed by the test cleanup. No representative/private source was used.

One independent read-only review narrowed the receipt/sink/buffer claims above
and found an invalid-export cleanup P2. Moving validation inside the outer
abort guard fixes it; isolated typecheck and the focused actual-file-sink
regression PASS, followed by reviewer confirmation. Other executable paths are
unchanged from the 17-test run. Root typecheck, 80 files / 1,658 PASS / 21 existing
todo and build PASS; existing import/chunk warnings remain. The application does
not import this proof. No gate adoption or new browser/device acceptance follows.

## OPFS browser preparation (not yet browser-verified)

Reuse the exact candidate and deterministic byte recipe in a separate loopback
page with no production imports other than the unchanged hash implementation.
Uses a dedicated synthetic-only OPFS directory and real `navigator.locks`, bounded
file slices and awaited writes. Preserve interrupted synthetic data for explicit
recovery/readback; never clear an origin or user workspace. One button will run
the prepared cases; reload/readback is a separate action so persistence is not
inferred from an in-memory handle. Human execution is deferred as a batch.
This preparation adds no OPFS/iOS PASS, download sink, GC, journal, offline/PWA
or technology-adoption credit. No temporary server or HTTPS tunnel is started.

Isolated typecheck/build PASS. The browser WebCrypto AES-CTR recipe was executed
under Node against independent Node AES/SHA-256 at 5 MiB + 19 bytes and the full
500 MiB, including counter carries and the pinned expected digest (one focused
test PASS). This validates recipe parity, not execution of OPFS or browser APIs
on a target device. Browser buffers/copy behavior remain unmeasured; the earlier
Node-only 3 MiB + 16 KiB figure is not transferred to this backend.

Focused independent read-only review found an overbroad READY/readback claim and
a recovery hint that included the pre-large-data stage. Both are corrected and
confirmed: readback acknowledges only the saved large payload, and a run stopped
before that payload exists needs a new run after retaining its URL/log. Latest
isolated typecheck/build pass. No agent or human has executed this OPFS page yet.

### 開発側の準備

`poc/cas-io` で次を実行します。新しい依存ライブラリは不要です。

```powershell
node ../../node_modules/vite/bin/vite.js build --config vite.config.mjs
node ../../node_modules/vite/bin/vite.js preview --config vite.config.mjs
```

一括確認を依頼する直前に開発側でHTTP応答を確認し、実行buildを記録してから
`http://127.0.0.1:5185/` を案内します。以前の保存検証（5184）の再実施は不要です。
このlocalhost経路はDesktopだけの案内です。iPhone用の経路ではありません。
現時点でサーバー起動・人間への実行依頼は行っていません。

### 後日の一括確認手順

1. 案内されたページに「隔離・大容量保存検証」が表示されることを確認します。
   空き容量は約1.5 GiBが目安です。実際の容量不足はエラーとして表示されます。
2. 「検証を実行」を選択し、このタブを開いたまま待ちます。数分かかる場合があります。
   容量不足・中止・途中停止・復旧は小さい合成データで自動検証し、その後に
   500 MiBの保存・出力を実行します。注入した容量不足は実際の端末容量測定ではありません。
3. `READY / この限定検証が完了` と、500 MiBのサイズ・ハッシュ一致を含むPASSが
   表示されたら、ログ全体と画面を保存します。ページを再読み込みするとログは消えます。
4. 同じページを再読み込みし、「保存結果を確認」を選択します。
   `READY / 保存済み本体の確認が完了` と再オープンのPASSを保存します。
   これは保存済み本体の再確認です。手順2で失敗した出力などの合格を意味しません。
5. 結果をまとめて開発側へ渡します。ボタンごとの返信は不要です。

失敗・中止の場合はログとその時点のURLを残してください。同じURLの
「保存結果を確認」は大容量データ本体の復旧だけを試みます。未検証・破損状態は
拒否し、事前の小規模検証中など、大容量データの保存開始前には復旧対象がありません。
その場合は記録を残してから、新しい検証を実行してください。「検証を実行」を
再び選ぶと別の合成検証になります。前回のデータは削除せず、ページ下の
「前の検証結果」リンクから確認できますが、そのリンク表示も再読み込みで消えます。
必要なURLは別途保存してください。利用者のプロジェクトを消す操作はありません。
大量の反復実行は不要です。

「同じ検証を別タブで開く」は同じ合成runを参照します。先のタブが保存ロックを
保持している間、2つ目のタブの保存結果確認は「別のタブで検証中」と拒否されます。
この跨タブ挙動は実測待ちで、自動通知・2writer収束の証拠ではありません。
500 MiBのOPFS出力はブラウザ内部の合成ファイルです。一般のダウンロード先や
iPhoneの共有先への有界出力、実quota、プロセスkill、完全offlineは別の未確認事項です。
