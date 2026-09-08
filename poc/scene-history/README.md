# Isolated Scene history candidate

Disposable S1-entry experiment, not production code or an adopted dependency.
The root application does not import this directory. The synthetic domain is a
small adapter probe, not the complete ProjectDocV2 schema, storage validator,
package wire or migration implementation. Source: specification 05 sections 8,
12 and 13; specification 03 section 6.

Candidate: `@automerge/automerge` exactly `3.4.1` (MIT). Its own lockfile pins
transitive dependencies. Installation disables lifecycle scripts. Run from this
directory: `npm ci --ignore-scripts`, `npm audit`, `npm test`.

The experiment checks TEAM-PKG-08 causal branches and TEAM-HIST-01/03/06 explicit
conflicts, detached exact replay, fake-blob independence and saved-byte reload.
Atomic Caption fields use immutable scalar strings at the adapter boundary;
Automerge's materialized winner is never an authoritative UI projection.
No OPFS, browser/iPhone durability, performance threshold, full model-remap,
package/converter or G1 adoption claim follows from these results.

Executed S1-entry result (2026-09-08): Node harness 6/6 PASS, scoped npm audit
zero vulnerabilities; independent read-only review found no blocking P0/P1.
Two adapter details are necessary: choosing a materialized scalar candidate
still needs an explicit delete/replacement to record resolution, and historical
conflict inspection reconstructs the recorded change closure in a fresh document.
The probe observed current rather than historical nested conflict candidates
with a shared-handle `view`; large-history reconstruction cost remains unmeasured.

API references: https://automerge.org/automerge/api-docs/js/
and https://automerge.org/docs/reference/documents/conflicts/ .

## Five-purpose semantic closure — bounded contract

Specification 03 §6 and specification 05 §7/TEAM-PKG-06/09 require five outputs
derived from one causal synthetic Project. This probe uses an explicitly small
decoded resource graph over the pinned adapter, not the ProjectDocV2 wire,
complete domain validator or production exporter. Each graph field is an atomic
JSON scalar; the probe inspects all adapter candidates, never a materialized
winner. Structural validation of real coordinates, immutable digests, source
profiles, full surface evidence and migration recipes remains outside this port.

The graph includes two Scenes, shared and unassigned resources, Scene-external
Caption owners, model revisions, attachments, tags, Saved Views and materials.
The semantic builder follows typed strong edges rather than ID-looking strings.
History-bearing outputs retain original causal bytes and verified source root;
Contribution uses one explicit retained base and omits only payloads guaranteed
by its verified closure. Backup alone includes disclosed exchange-base records.
Opaque inventory and registered active migration-baseline bytes are conservative
same-lineage roots. A GC-attempt decision here can only refuse; it deletes nothing.

Review uses one explicitly selected Scene, independently of UI filters/camera,
and provides counts, metadata disclosure and minimal nonvisual owner projections.
It blocks required conflicts/missing data; the sole optional-view exception needs
the exact `開始視点なし` confirmation. Clean follows all active Project resources
and starts a fresh genesis. Both use an explicit known-field projection, re-key
nominal references and compatibility/composite equality classes, omit old weak
parents/history/migration/contributor values, and reject any unrecognized field.
The nonvisual owner is an in-memory test projection, not a ratified review schema.
Nonmanual source evidence can be retained in clean only through an explicit
validated evidence port; there is no guessed relation or new sanitization policy.
Original model/media bytes are unchanged and their embedded metadata is disclosed.

Acceptance checks semantic contents plus raw/decompressed-change sentinels,
complete closure and unchanged source/base. Small synthetic bytes suffice; reuse
the unchanged 500 MiB and durable-base evidence rather than repeat those runs.
No manifest, container, package ID/summary wire, import/restore UI, platform I/O,
cross-project GC or adoption is implemented by this probe. Its input/output
objects are nonpersisted test ports, not a new compatibility contract.

Executed 2026-09-08: isolated typecheck and 17/17 semantic tests PASS. The five
outputs come from the same actual causal fixture, not five prebuilt expected
packages. Original heads/change bytes, current-minus-base blob plans, minimal
hidden owners, required material/view conflicts, optional-view confirmation,
compatibility/composite equality remapping and clean fresh genesis are asserted.
Raw JSON/decompressed-change scans complement parsed reference/closure checks.
Unknown nested/root-map candidates fail closed; no CRDT winner silently authorizes
a snapshot. Independent review's unknown-field finding is fixed and confirmed,
including hidden root candidates. No blocking finding remains in this subset.

Run from the repository root:

```powershell
npx tsc --noEmit --project poc/scene-history/journal.tsconfig.json
npx vitest run --config poc/scene-history/journal.vitest.config.ts poc/scene-history/purposes.test.ts
```

The receipt inventory/evidence callback are explicit validated test ports; this
does not implement full frame/surface validation, actual GC or S2 wire. Blob lists
show which bytes would be carried; no new streaming, 500 MiB, OPFS or device claim
follows from this in-memory builder. Prior source/dependencies remain unchanged,
so root regression and actual I/O proofs retain their previous bounded attribution.

## Exact cross-store journal protocol — bounded Node proof PASS

Specification 02 §8 and specification 05 §10/13.2 authorize the next disposable
proof. Use the already pinned Automerge 3.4.1 and the isolated CAS implementation;
no new dependency or production import. Unlike the earlier inline catalog,
source metadata and original changes are separate source/ordinal files; the
journal contains the specified target, descriptors and domain-separated JCS
change-set digest. A proper synthetic bootstrap adds schema, identity/lineageSeed,
empty collections and a separately held root proof. The earlier tiny fixture is
not silently promoted to a complete ProjectDocV2 schema.

The test uses separate temporary Node filesystem areas for metadata changes,
journal/control and real CAS bytes. Complete writes are fsynced; interruption
injection and a shared Node single-writer gate are not browser locks, IndexedDB
durability, process-kill/power-loss or device evidence. Metadata publication
retains old published heads while pending and refuses mutation/export/GC facade
requests. Local recovery permits valid concurrent history; remote recovery
requires exactly the base-plus-source change set and final heads. Never rebuild
an old mutation or replace imported dependencies. Source completeness must work
when receiver-local siblings are absent from the source document.

A synthetic conflict-aware domain test port supplies final strong/opaque closure;
hidden intermediate and weak historical references are not final requirements.
Conservative inventory protection precedes metadata activation and checks already
verified blob receipts/presence without reading their payload. Invalid/missing
final closure cannot publish. This port is not the full domain/frame validator,
unknown-field policy, cross-project reachability analysis or garbage collector.

Initial proof ceilings: 64 changes, 1 MiB per change, 8 MiB aggregate metadata,
256 KiB journal JSON and 10,000 decoded journal nodes/depth 32. These are test-only
limits, not ratified G0/G1, target-device or hostile compressed-metadata guarantees.
Retain the journal and original source/part artifacts after completion for this
experiment; cleanup/grace GC remains unproved. A torn journal/control record
refuses repair rather than guessing state. Existing browser/history/stress proofs
are reused and no duplicate manual run is requested. No adoption or S2 wire credit.

Executed 2026-09-08: isolated typecheck and 29/29 journal tests PASS; the existing
six causal-history tests also PASS. The tests cover exact local concurrent replay,
remote diamond interruption/publication, source subtraction with receiver-local
siblings, final conflict/opaque closure, tamper/quota refusal and zero existing-CAS
payload reads during metadata operations. A fresh port instance reads the same
separate real files; this is not process-kill or browser-restart evidence.

Independent read-only review's two active findings are corrected and confirmed:
missing inventory now rejects edit/export/GC as well as presenting read-only repair;
`metadataDurable` requires every acknowledged hash/original byte (and exact remote
heads) already present. Missing acknowledged metadata is repair-required, not
silently recreated from parts. Only `blobsVerified` permits missing-part recovery.
Identity-map conflicts are rejected even when the projected fields happen to match.
No P0/P1 remains in this bounded review. Retained-source validation on a completed
replay never republishes old heads over legitimate later edits.

Root regression: typecheck/build PASS and `npm test -- --maxWorkers=2` passes all
80 files / 1,658 tests (21 existing todo). The default-parallel run first timed out
in 19 tests across five unchanged script suites, with follow-on temporary-cleanup
errors. The bounded-worker run changed neither assertions nor the 5-second test
limit; retain the initial failure rather than describing the default run as PASS.

Run from the repository root:

```powershell
npx tsc --noEmit --project poc/scene-history/journal.tsconfig.json
npx vitest run --config poc/scene-history/journal.vitest.config.ts
npm test --prefix poc/scene-history
```

Remaining adoption prerequisites are actual OPFS/IndexedDB coordination and its
platform interruption evidence, the complete domain/privacy/reachability contract,
GC, scale and ratified budgets. This result does not satisfy those gates and does
not connect the adapter, Scene core or new team flow to the application UI.

## Browser cross-store journal port — bounded resumed Chrome check PASS

**2026-09-09 PO-reported correction result: PASS within the resumed-run scope.**
The supplied page shows `検証版：同時読み取り修正 1`, READY and the expected
updated title/body/revision. After reload, the log from `16:43:11.803Z` through
`16:44:05.468Z` records three no-op/zero-publication operations, each followed by
successful local observation and other-tab notification, then two fresh page-load
observations. No new FAIL appears in that supplied corrected-build interval.
The served build identity below belongs to executable correction `96c218b`.

This closes the reported simultaneous-read false-repair defect and its human
Chrome recheck. Earlier initialization, interrupted old-state reload and exact
recovery/one-publication evidence are reused from the same preserved run; their
two pre-fix observation failures remain historical failures. It is not a new
from-empty full run on the corrected build or agent-operated browser evidence.
No further repetition/reset is requested. Process-kill, physical iOS, offline/PWA,
scale, full application integration and G1-A/C adoption remain outside this PASS.

**Preserved pre-fix failure:** The PO's actual Chrome batch reached the
intended pending state, retained it across reload, and logged exact recovery with
one publication. Immediate post-recovery observation failed; a manual observation
and the other tab's notification later read the new state. A repeated recovery
logged no-op/zero publication and then the same observation failure. This is a
failed overall platform run, not missing-payload proof or an aggregate PASS.

The deterministic regression reproduces the cause through the actual `OpfsIo`
locking method with Node Web Locks and synthetic Node files: notification and
local readers compete for a fail-fast exclusive CAS lock, and `view()` converted
the rejected read into generic missing-data repair. Verified-presence observation
now waits on that same exclusive lock; mutation admission remains fail-fast.
Receipt/size/presence checks remain intact, and failed observation retains its
actual cause. Node's existing queue and retention's already-owned lease do not
acquire an extra lock. No notification suppression, automatic retry/write, schema,
dependency or published-head change is introduced. This fixes an existing probe
implementation defect; the accepted journal contract and candidate gates remain.

Correction acceptance: two deliberately overlapping pending/recovered views
retain the correct published heads without repair flags, payload reads, metadata
writes or publications; a contending mutation still refuses. Missing/corrupt or
denied receipt reads still yield read-only failure with the original cause.
Reuse the existing exact recovery/no-op/interruption matrix. Do not reset the
existing browser run; its corrected real-browser result is recorded above.

Executed correction evidence: both simultaneous-view regressions failed before
the fix and all five new cases passed after it. The existing journal/Repo/purpose
suite passes 55/55; CAS/retention passes 30/30 selected cases (the unchanged 500 MiB
case was deliberately not rerun). Both isolated typechecks and the journal build
pass. Independent targeted review found no blocking regression. These Node/build
results are separate from the subsequently supplied human Chrome result above.

The same loopback preview now serves `検証版：同時読み取り修正 1`. At
`2026-09-08T16:23:11Z`, HTTP 200 bytes matched the local corrected build:

| Build entry | Bytes | SHA-256 |
|---|---:|---|
| `journal.html` | 2,004 | `f40df16d20aad930e8524addf7ab7c1e53577c7d4f82b4ec54d712214289f516` |
| `assets/journal-D0JQ1cDN.js` | 243,589 | `3ba869b2ff40b7125e6cd2743b6749b1c48003aa8a99b7acbac987974b3741ff` |
| `assets/automerge-CntZrugP.wasm` | 3,571,259 | `304ea6e230898ed66af3c29ac554a36c15bbe03f5c8816b5310fddb88f7f5d78` |

The isolated dependency lock is unchanged from the identity below. Preserve the
earlier failed run rather than replacing its evidence. For the PO's already
recovered run: reload BOTH existing tabs without changing their URLs, wait for
the correction label and new-state READY, then use `復旧して再確認` in the second
tab. Expect no-op/zero publication followed by READY, and `他タブ通知後` in the
first tab without a manual observation. Reload both once more. No NEW FAIL should
be appended; previous FAIL rows intentionally remain in the stored log. Supply
these steps in chat when asking for recheck; no new run or start-button action.

Bounded prerequisite under specification 02 §8: run the same journal engine
against OPFS source/part/control/inventory files, the pinned Repo/IndexedDB adapter
for original metadata, the existing OPFS CAS and a browser-owned per-run lock.
No inline journal changes or in-memory metadata substitute. The synthetic run has
a separate stored identity/root proof and Repo document locator, and never opens
the application database or a prior probe's run. All public reads reconstruct only
published heads through a fresh repository; no live handle is a UI authority.

One batched page prepares an initial local edit and a remote diamond, deliberately
stops after one durable remote change, verifies old-head/read-only behavior and
then offers exact recovery/readback. The page retains bounded result logs in OPFS
before showing them, so reload does not erase the evidence. A completed recovery
must prove exact original hashes/bytes and a repeated no-op without payload reads.
Other-tab/reload checks remain separately attributable, not inferred from fresh
Repo instances. This is neither process-kill nor physical-iOS/offline/PWA evidence.

The pinned Repo 2.5.6 `removeFromCache`/DocHandle unload path was found to schedule
a save during cleanup. This port therefore creates no DocHandles: a fresh Repo's
version-pinned `storageSubsystem.loadDoc/saveDoc` explicitly reads/awaits the same
IDB storage implementation, then a fresh Repo verifies exact bytes. These hidden
APIs remain an isolated candidate seam, not an adopted production API. Storage
identity is initialized only under the writer lease. Cleanup first rejects new
writes and drains started transactions; there is no autosave queue or live handle
to flush while reading or releasing a lease.

The backend must preserve failed/pending state on OPFS/IndexedDB errors and must
not auto-reset or regenerate a failed run. Missing/corrupt session/control/files
fail closed. Run initialization is synthetic preparation, not production Project
creation/migration. No GC/cleanup, full domain/privacy/scale adoption, S2 encoding,
new dependency, human stress rerun, tunnel or production UI is included.

Executed 2026-09-08: isolated TypeScript check and browser build PASS; the unchanged
exact journal suite passes 29/29, and four additional pinned-Repo lifecycle tests
pass (read/cleanup write-free, missing-identity refusal, no cleanup retry after
failed save, started-write drain with late-write refusal). Their memory test port
proves only library lifecycle; it is not IndexedDB/OPFS or browser evidence.
Independent read-only review confirmed both findings closed: metadata payload-read
counters now exclude newly staged blob verification, and DocHandle cleanup no
longer schedules unowned saves. No blocking finding remains in this preparation.
Root code/dependencies/build inputs are unchanged, so the `a401a77` root matrix
remains applicable; it is not repeated for the isolated page.

No browser execution or new server is recorded for this slice. The separate
Windows screen-control connection was available, but its skill forbids operating
the ChatGPT app UI, so it was not used to bypass the unavailable in-app browser
control. Chrome was not silently substituted for the selected in-app browser.
No unchanged browser bootstrap retry or immediate human request was made.

Developer launch, from this directory (not a currently running link):

```powershell
node ../../node_modules/vite/bin/vite.js build --config journal.vite.config.mjs
node ../../node_modules/vite/bin/vite.js preview --config journal.vite.config.mjs
```

The prepared route is `http://127.0.0.1:5186/journal.html`. Before handing it to a
human, verify that exact page and its referenced JS/WASM return HTTP 200 and bind
the build to its source checkpoint. The prior 5184/5185 builds are not replaced.

Later batched execution follows the four steps displayed on the page. The initial
tab stops with `初期タイトル` / `手元の追記` / `revision-1`, read-only. Reload must
retain that view and the saved log. Open the page's same-run link in a second tab;
recover there to `共有されたタイトル` / `統合後の本文` / `revision-2`, with exact-byte
and one-publication PASS. A second recovery must report no-op/zero publications.
Confirm the first tab's automatic update separately, then reload/read back in
both tabs. Log rows include a tab token and observation origin so an actual
notification is not confused with a manual check. Report failures once, in one
batch; do not reset the run, remove browser data or repeat the 500 MiB probe.
The full G1-A/C device, process-kill, domain/privacy, GC and scale requirements
remain open, as do production integration and the eventual S3 product UI flow.

### 2026-09-09 existing journal build readiness — execution still pending

The completion-path audit selected this already prepared platform run; no new
probe was created. Built from executable source
`d8f52d1f9dbb7fdac00af1989eef012fc2252aaa`, with only task/documentation changes
in the worktree. Isolated lockfile SHA-256:
`9b9530bdfbb526e03c59df582df9f3908e0e587de507f45a794461f77dcd5ff5`.
Existing build passed. At `2026-09-08T15:34:55Z` (2026-09-09 JST), the loopback
preview served these exact local build bytes with HTTP 200:

| Build entry | Bytes | SHA-256 |
|---|---:|---|
| `journal.html` | 1,956 | `01249fa4ef1589dfb6c86789f7e3a4a897e3a720886410d9f30a094eea671c78` |
| `assets/journal-CMgrBqoP.js` | 243,461 | `afc35fcc03c8f1c03233adc9e952d6ab438331db03bfe43b70e695b76f94f962` |
| `assets/automerge-CntZrugP.wasm` | 3,571,259 | `304ea6e230898ed66af3c29ac554a36c15bbe03f5c8816b5310fddb88f7f5d78` |

The in-app automation connection failed before navigation; no page action, real
OPFS/IndexedDB result or runtime PASS was observed by the agent. Do not repeat
bootstrap attempts or silently switch the automation to Chrome. This is the one
pending human Chrome batch, distinct from the completed earlier history probe
and the 500 MiB readback. HTTP readiness is not platform or device evidence.
The server is temporary; recheck HTTP before offering this link in a later turn.

#### 人間による一括確認（今回の未実施分だけ）

このPCのChromeで [隔離・統合保存検証](http://127.0.0.1:5186/journal.html) を開きます。
本番プロジェクトや以前の検証データには触れません。最初の表示は `未作成` です。
途中で返答する必要はありません。最後に2つのタブの結果をまとめて共有してください。

| 順番 | 操作する画面と操作 | 確認する表示 |
|---|---|---|
| 1 | 最初のタブで `保存・中断を検証` を選ぶ | `READ-ONLY / 未完了の統合あり`。内容は `初期タイトル` / `手元の追記` / `revision-1`。これは意図した中断で、完了ではありません |
| 2 | 最初のタブを再読み込みする。URL末尾は変更しない | 同じ旧内容と未完了表示、保存された結果ログが残る |
| 3 | ページ内の `同じ検証を別タブで開く` から2つ目のタブを開き、`復旧して再確認` を選ぶ | `READY / 復旧後の保存内容を確認済み`。内容は `共有されたタイトル` / `統合後の本文` / `revision-2`。ログに `PASS 復旧: 元の変更バイト・headsが一致。公開1回、既存モデルの読込0バイト` |
| 4 | 最初のタブへ戻る。再読み込みや `保存状態を確認` はまだ押さない | 新内容へ自動更新され、ログに `他タブ通知後` がある。ない場合は自動通知未確認として報告する |
| 5 | 2つ目のタブで再度 `復旧して再確認` を選び、その後両方のタブを再読み込みする | ログに `PASS no-op: 元の変更を再追加せず、再公開も0回`。両方のタブに新内容とREADY表示が残る |

赤いエラーや `FAILED` が出た場合はそこで停止し、表示内容と保存された結果を
まとめて送ってください。データ削除・新しいrunでのやり直し・旧5184/5185試験の
再実行は不要です。この限定試験の成功だけで、プロセス強制終了、実機iPhone、
オフライン/PWA、大容量の出力、本番UIや保存方式の正式採用が済んだとは扱いません。

## Browser storage probe (bounded manual sequence PASS; G1-C partial evidence)

Product Owner supplied visible log text and a screenshot on 2026-09-08 after
running `保存・失敗・再試行を検証` on the loopback probe associated with checkpoint
`fffce25`. The output reports PASS for initial metadata durability, withholding
acknowledgement/publication while storage is gated, injected quota rejection and
retry, and a fresh Repo's exact heads/hash/original-change-byte readback. Visible
state is READY with title `Retry survived`, body `Durable participant edit`,
model revision `revision-1`, and `base unchanged=true`. These are user-operated
browser results, not agent-operated automation. Browser family/version and OS
are not established by this screenshot. A subsequent user-operated sequence
supplied logs after page reload/readback (same READY state and exact original
bytes PASS), then `PAUSED: 1/3 original changes durable; zero prefix publication`,
and a second tab displaying the unchanged old view as READ-ONLY plus
`PASS DENIED synthetic facade request`. The exchange base remained unchanged.
This confirms tab reload readback and the pending guard while the owner tab
holds its writer lock.

Follow-up: the PO reported "以前の中断状態から再開" and supplied two screenshots.
The recovery-tab log contains `PASS DENIED synthetic facade request`, then
`PASS recovered 2 missing original changes; one final publication; base unchanged`.
Both visible pages end at READY with `Coordinator title`, `Final remote body`
and `revision-2`, and report fresh Repo heads/hash/original-byte readback PASS
with `base unchanged=true`. The preceding failed start reached the pending-run
guard inside the exclusive lock, establishing that the old writer lock was no
longer held at that point. This supports the resumed pending-state barrier and
exact missing-change recovery; it is not a separately measured process-kill or
power-loss test. Automatic versus manually requested other-tab refresh and final
page-reload ordering are not established by these screenshots. The explicit
`PASS no pending batch; replay is a no-op` line is not present: that confirmation
remains pending. Browser family/version/OS are not inferred from cropped pages.
After the requested final page-reload/readback step, the PO supplied text showing
READY `Coordinator title` / `Final remote body` / `revision-2`, repeated independent
Repo heads/hash/original-byte PASS and `base unchanged=true`. Record this as the
user-operated final readback result, not agent browser automation. The PO then
explicitly confirmed that `PASS no pending batch; replay is a no-op` appeared
before reloading. That last result is user attestation, not a retained screenshot.
The bounded save/failure/retry, pending-state refusal, exact recovery and no-op/
reopen sequence is complete; do not request this same sequence again unchanged.
Other-tab automatic refresh remains unconfirmed separately from data recovery.
This evidence does not expand the exclusions below or complete G1-C.

Repo and IndexedDB adapter are pinned to 2.5.6 (MIT), retaining Automerge 3.4.1.
The upstream latest tag was a prerelease; this probe uses the last stable version.
Scoped npm audit reports **three moderate entries**, all propagated from uuid
9.0.1 / GHSA-w5hq-g745-h8pq. Independent source review permits synthetic-only
localhost execution: Repo generates v4 using a fixed 16-byte buffer/implicit
zero offset or no supplied buffer; imported input cannot choose buffer bounds.
This is not an audit-clean or production-adoption claim. Reassess before adoption.
No override or prerequisite production dependency change was made.

From this directory, run `node ../../node_modules/vite/bin/vite.js build --config
vite.config.mjs`, then the same command with `preview` in place of `build`.
The single loopback route is http://127.0.0.1:5184/. It has no PWA or public assets.
The harness uses its own `lociview-isolated-scene-history-20260908` IndexedDB
database and no user file inputs, production storage, model payloads or network
adapters. It never deletes previous synthetic documents.

The probe checks a version-pinned `Repo.flush()` acknowledgement against a fresh
Repo's exact original changes, gated writes, injected quota failure/retry,
durable local exchange-base records and a browser-owned single-writer lock.
During a deliberately durable remote prefix, a separately committed test catalog
serves only the last published snapshot; one synthetic facade request is refused
by the lock/pending guard. This does not exercise actual edit/export/GC services.
Reloading the owner drops its lock but not the pending flag;
recovery validates original source changes and applies only missing changes.
This tiny IndexedDB catalog stores inline synthetic metadata and is **not** the
section 8 OPFS cross-store journal, complete domain validator or blob inventory.
It does not prove power-loss, process-kill, browser-restart, iOS, resource budgets,
full two-writer convergence, CAS, CSP/offline or application UI acceptance.

### 実行手順と未確認項目（Chromeでまとめて確認）

2026-09-08: POはCodex内ブラウザでの暫定確認と、後日の人間によるChrome一括確認を
選択した。内蔵ブラウザもページ操作前の接続初期化で停止したため、暫定実測は未実施。
Chrome修復の反復は中止する。以前の手動証拠、内蔵ブラウザの暫定証拠、Chromeの
最終証拠を混同しない。この手順は合成データの保存プローブであり、本番UIの試験ではない。

#### 何を確かめるテストか

データの統合が途中で止まっても、途中の内容を表示せず、保存済みの元データから
復旧できるかを確かめます。実際のプロジェクトやファイルは使いません。

#### 準備とタブの呼び方

1. Chromeで http://127.0.0.1:5184/ を開き、「隔離・保存検証」と表示されることを確認します。
   接続エラーの場合は操作を進めず、サーバーの起動を担当者に依頼してください。
2. このページを開いたタブを、以下では **最初のタブ** と呼びます。
   同じ検証画面がほかのタブにも開いている場合は、それらだけを閉じ、最初のタブを再読み込みします。
3. **2つ目のタブ** は、下の手順4でページ内リンクから追加するタブです。
   別のChromeウィンドウやシークレットウィンドウを用意する必要はありません。

画面上部に `未作成` または `READY` と表示されていれば、手順1から始めます。
`READ-ONLY / 未完了の統合あり` と表示されていれば、以前の中断状態が残っています。
その画面を保存し、表示内容が下記の「旧表示」と一致することを確認して手順4へ進んでください。
この場合、手順1〜3は「以前の中断状態から再開のため未実施」と報告します。
別の内容や `FAILED` が表示される場合は、そこで止めて画面を共有してください。

再読み込みにはChromeの再読み込みボタンを使います。**再読み込みで画面のログは消えるため、
その直前にスクリーンショットまたはログのコピーを保存してください。**
ブラウザの保存データは削除せず、各操作の結果を待ってから次へ進みます。

| 手順 | 操作 | 期待結果 | 既存の手動証拠 |
|---|---|---|---|
| 1 | **最初のタブ**で `保存・失敗・再試行を検証` を押し、READYになるまで待つ | 初期保存、保存待ち中の未公開、注入した容量不足と再試行がPASS。最後は下記の旧表示 | あり |
| 2 | **最初のタブ**の画面を保存して再読み込みし、`保存状態を確認` を押す | 旧表示と `PASS independent Repo reopen: heads, hashes and original bytes`。`base unchanged=true` | あり |
| 3 | **最初のタブ**で `統合の途中で停止` を押す | `PAUSED: 1/3 original changes durable; zero prefix publication`。`READ-ONLY / 未完了の統合あり` で旧表示のまま | あり |
| 4 | **最初のタブ**の `同じ検証を別タブで開く` を押す。開いた **2つ目のタブ**に切り替え、`未完了時の操作拒否を検証` を押す | `PASS DENIED synthetic facade request`。旧表示のまま | あり（以前の実測では最初のタブが操作権を保持中） |
| 5 | **最初のタブ**に戻り、画面を保存して再読み込みする。読込後、**2つ目のタブ**へ戻り、再び `未完了時の操作拒否を検証` を押す | 最初のタブの操作権が解放された後も `PASS DENIED synthetic facade request`。両タブとも未完了・旧表示 | 再開した未完了状態での拒否は確認済み。再読み込みの操作順自体は画像から判定しない |
| 6 | **2つ目のタブ**で `元の変更データから復旧` を押す。最初のタブにも切り替えて表示を確認する（まだ再読み込みしない） | `PASS recovered 2 missing original changes; one final publication; base unchanged`。両タブがREADY・下記の新表示になる | 復旧と両タブの新表示は確認済み。自動更新か手動確認かは未確認 |
| 7 | **2つ目のタブ**でもう一度 `元の変更データから復旧` を押す | `PASS no pending batch; replay is a no-op`。新表示のまま、再コピーや変更なし | POが再読み込み前に表示されたと明示確認。画像ではなく本人の報告による証拠 |
| 8 | **最初のタブ**と **2つ目のタブ**でそれぞれ `保存状態を確認` を押す。その後、2つ目のタブの画面を保存して再読み込みし、もう一度 `保存状態を確認` を押す | 新表示、独立Repoによる元の変更バイト検証PASS、`base unchanged=true` | 両タブの独立Repo再読込PASSに加え、追加依頼後の最終再読込ログも確認済み |

旧表示: `READY`（中断後はREAD-ONLY）と
`{"title":"Retry survived","body":"Durable participant edit","modelRevision":"revision-1"}`。
新表示: `READY` と
`{"title":"Coordinator title","body":"Final remote body","modelRevision":"revision-2"}`。

手順6では必ず2つ目のタブを操作します。最初のタブの復旧ボタンには自分の操作権を
解放する処理もあるため、それを押すだけでは手順5の再読み込みによる中断確認を代替できません。

FAIL、途中結果の表示、意図しない保存内容の変化が出たら、その手順で止めてログを残す。
注入した `EXPECTED background save failure: injected quota` は手順1の想定内だが、
後続の再試行PASSとREADYを必ず確認する。応答停止やログ不足はPASSではなく未確認。
手順6で他タブが自動更新されない場合も記録し、手動の `保存状態を確認` による読込成功と
自動通知成功を分ける。タブ再読込はプロセス強制終了・電源断・オフライン試験の代わりではない。

#### 最後に共有するもの

各操作のたびに担当者へ返答する必要はありません。最後にまとめて、次を共有してください。

- 手順1から実施したか、以前の中断状態から手順4へ進んだか。
- 各手順が期待どおりだったか。違った場合は手順番号と実際の表示。
- 保存した画面またはログ（失敗表示も含める）。
- 手順6で最初のタブも自動で新表示になったか。

実施担当者はChromeのバージョン・OS・日時も記録します。開発担当者はサーバーの
応答確認、対象Git HEAD・ソース差分・buildの記録を担当します。これらを実施者へ
説明せず調査させたり、単にログが無いことから合格と判断したりしないでください。
現状は既存手動証拠1〜4に加え、中断状態からの拒否・復旧・両タブの新表示と独立Repo
再読込PASSを確認済み。追加依頼後のログで最終ページ再読込後の新内容も確認済み。
7のno-opもPOの明示報告で確認済み。この限定的な保存・復旧手順は完了とする。
他タブの自動通知自体は未確認で、データ復旧成功から推定しない。内蔵ブラウザのAI操作に
よる暫定実測は未実施で、Chromeのバージョン等も未記録。
このプローブがすべて通っても残るG1-A/C要件、本番journal/CAS、実機iOSを完了扱いにしない。

### 本番UIの最後のChrome確認との区別

本番UIがS3まで実装された時点で、仕様05 §12.6 `TEAM-FLOW-01` を通常homeから
一続きで確認する: Team Workspaceで参加 → 手元のCaption編集を保持してモデル更新を
受領 → ピン修正とContributionの往復・2回目の編集 → 競合の明示選択と独立コピー →
保存・再起動・オフライン再読込・再取込の冪等性・中断復旧。
現在のプローブにこれらの本番機能はない。S3では実際に用意されたUI文言で手順を確定し、
対象buildを記録する。オフラインはdev serverで判定せず、実機iPhoneも別の証拠とする。
