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

## Browser storage probe (partial manual evidence)

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
holds its writer lock. Owner-tab interruption, refusal after lock release,
interrupted-batch recovery and no-op replay remain pending.
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

準備: 実施時のGit HEAD、probeソース差分、Chromeのバージョン・OS・日時を記録する。
上記の専用build/previewを使い、同じChromeプロファイルの通常タブAでloopback URLを
開く。別タブBもページ内リンクから開き、同じoriginを使う。サーバー未起動は保存失敗と
区別する。ログにはFAILを含め、各リロード前に画面の状態とログを保存する。
ブラウザのデータ削除、実プロジェクト読込、複数の試験操作の同時実行は行わない。

| 手順 | 操作 | 期待結果 | 既存の手動証拠 |
|---|---|---|---|
| 1 | Aで `保存・失敗・再試行を検証`。完了まで待つ | 初期保存、保存待ち中の未公開、注入した容量不足と再試行がPASS。最後は下記の旧表示 | あり |
| 2 | Aを再読込して `保存状態を確認` | 旧表示と `PASS independent Repo reopen: heads, hashes and original bytes`。`base unchanged=true` | あり |
| 3 | Aで `統合の途中で停止` | `PAUSED: 1/3 original changes durable; zero prefix publication`。`READ-ONLY / 未完了の統合あり` で旧表示のまま | あり |
| 4 | `同じ検証を別タブで開く` からBを開き、Bで `未完了時の操作拒否を検証` | `PASS DENIED synthetic facade request`。旧表示のまま | あり（Aがロック保持中） |
| 5 | Aを再読込。読込完了後、Bで再び `未完了時の操作拒否を検証` | ロック解放後も `PASS DENIED synthetic facade request`。両タブとも未完了・旧表示 | **未確認** |
| 6 | Bで `元の変更データから復旧` | `PASS recovered 2 missing original changes; one final publication; base unchanged`。両タブがREADY・下記の新表示になる | **未確認** |
| 7 | Bでもう一度 `元の変更データから復旧` | `PASS no pending batch; replay is a no-op`。新表示のまま、再コピーや変更なし | **未確認** |
| 8 | 両タブで `保存状態を確認`、Bを再読込して再度確認 | 新表示、独立Repoによる元の変更バイト検証PASS、`base unchanged=true` | 復旧後は未確認（6・7の終端確認） |

旧表示: `READY`（中断後はREAD-ONLY）と
`{"title":"Retry survived","body":"Durable participant edit","modelRevision":"revision-1"}`。
新表示: `READY` と
`{"title":"Coordinator title","body":"Final remote body","modelRevision":"revision-2"}`。

既存のA/Bが手順4までの状態を保持していると確認できれば、5から再開してよい。
別ブラウザ・別プロファイルへの切替では状態引継ぎを仮定せず、1から一続きで実施する。
開始時に未完了表示があれば1を押さず、その状態を記録して中断した回の復旧を先に扱う。
手順6ではBを操作する。Aの復旧ボタン自身がロックを解放する経路で、手順5を代替しない。

FAIL、途中結果の表示、意図しない保存内容の変化が出たら、その手順で止めてログを残す。
注入した `EXPECTED background save failure: injected quota` は手順1の想定内だが、
後続の再試行PASSとREADYを必ず確認する。応答停止やログ不足はPASSではなく未確認。
手順6で他タブが自動更新されない場合も記録し、手動の `保存状態を確認` による読込成功と
自動通知成功を分ける。タブ再読込はプロセス強制終了・電源断・オフライン試験の代わりではない。

結果欄（実施後に記入）: 日時 / HEAD・ソース差分 / browser・version・OS /
各手順のPASS・FAIL・未実施 / リロード前後の状態・ログ / 自動更新か手動確認か。
現状は既存手動証拠が1〜4、内蔵ブラウザ暫定実測は未実施、Chrome一括確認は未実施。
このプローブがすべて通っても残るG1-A/C要件、本番journal/CAS、実機iOSを完了扱いにしない。

### 本番UIの最後のChrome確認との区別

本番UIがS3まで実装された時点で、仕様05 §12.6 `TEAM-FLOW-01` を通常homeから
一続きで確認する: Team Workspaceで参加 → 手元のCaption編集を保持してモデル更新を
受領 → ピン修正とContributionの往復・2回目の編集 → 競合の明示選択と独立コピー →
保存・再起動・オフライン再読込・再取込の冪等性・中断復旧。
現在のプローブにこれらの本番機能はない。S3では実際に用意されたUI文言で手順を確定し、
対象buildを記録する。オフラインはdev serverで判定せず、実機iPhoneも別の証拠とする。
