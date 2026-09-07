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

## Browser storage probe (execution pending)

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

Manual execution: use a dedicated Chrome tab at the loopback route. Select
`保存・失敗・再試行を検証`; retain the visible results, including any FAIL. Reload
and select `保存状態を確認`. Select `統合の途中で停止`, open the provided second-tab
link, and select `未完了時の操作拒否を検証` there: only the old view should be visible.
Reload the first tab (this is tab interruption, not browser/process restart),
then check refusal in the second tab again. Select `元の変更データから復旧`, verify
the complete new view appears in both tabs, and select recovery once more to
check no-op replay. Record which steps actually ran; do not infer a PASS from
the absence of a reported failure. No real project data or model bytes are used.
