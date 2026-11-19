# Continue from the last publication after an unwritten local edit

Status: **PO APPROVED2026-11-19 — bounded PC/touch development checkpoint verified.**
The original/restored crash workflows, focused safety cases, full code checkpoint,
offline suite and frozen-artifact PC/touch file flows have executed. Exact checks
and remaining device acceptance are recorded in todo;
this is not general adoption, arbitrary repair or release approval.
The owner requested investigation/fixes for reopening and subsequently chose
Caption autosave. Neither direction authorizes ignoring an unfinished Journal.
The owner explicitly authorized implementation and automated verification of this
bounded recovery contract. It closes one reproduced state before increasing automatic writes.
It does not claim to repair the external, unexplained `receipt-invalid` report.
[06k](06k-autosave-interruption-admission-proposal.md), separately approved2026-11-19,
extends only schema2's sealed single-part admission and restored prepared media.
The schema1 and malformed-control rules below remain unchanged.

## 1. User outcome and exact boundary

When a browser stops after a valid local-command start but before any change
file is created, continue from the exact last durably published state. Keep the
unfinished start and every other original byte. Say that the unfinished input
was not saved; never call that input recovered.

The current reader intentionally remains pending, and cold retry refuses
`incomplete-staging-repair`. Specification02 §7.0.1 permits a different hot,
pre-writer compensation only;06e explicitly records the cold limitation. An
additional terminal state is required here. A screen exit alone is insufficient.

## 2. Eligibility —all conditions, checked again on action

1. A cold Project with edit authority, no retained in-memory command/UI input
   and no other in-flight operation. The Project write lease, selected generation,
   original-root/restore binding, repository and source proof all match.
2. Exactly one unfinished last Journal transaction. Its canonical `staging.json`
   has purpose `localCommand`, the preceding terminal node and one unambiguous
   effective publication reachable through that node. IDs, proof, base heads and
   required capabilities validate. Consecutive closed nodes are permitted only
   when every link resolves to that exact effective publication.
3. Its complete transaction directory contains **only `staging.json`**. Any
   change file, source/evidence part, preparation, durability or publication file
   refuses this path, including empty, partial or malformed files.
4. The complete preceding chain and original parts validate. Its effective last
   publication has exactly the start's base heads and proof/repository binding.
5. Read the **whole current repository**, not only a view at the old heads.
   Its complete original-change set and exact bytes equal the validated published
   source. Extra heads/history, missing changes or unexplained repository data
   refuse recovery. An ancestor view alone cannot prove no new data was applied.
   The pinned Repo2.5.6 physical reader takes one bounded owned `loadRange([])`
   observation. Accept only its UUID identity row and exact document snapshot /
   incremental keys. Check incremental raw SHA-256 and the SDK's snapshot
   headsHash (returned head strings joined in their returned order, then UTF-8
   SHA-256). Unknown keys, duplicate/missing rows and unresolved dependencies in
   a snapshot or the aggregate refuse. Decode each snapshot and the bounded,
   snapshot-first aggregate as complete input; an incremental decoder must not
   hide torn trailing bytes merely because no missing dependency is reported.
   Decode that same owned observation;
   never validate one set of rows and load a different set for the proof.
6. Existing content/inventory checks succeed. No unfinished import, merge,
   append, copy, first restore or generation-selection operation may compete.

This is not general rollback. Initialize/import/receive/restore/copy/append,
hot retained input, prepared/published transactions and corrupt receipts retain
their existing recovery or repair paths. Do not broaden the candidate merely
because its user-visible error happens to have the same text.

## 3. Proposed private receipt and linear chain

Add one write-once `closedLocal.json` in the existing transaction directory.
Its canonical record contains exactly these fields:

| Field | Value |
|---|---|
| `schema` | `lociview-metadata-closed-local-1` |
| `transactionId`, `repositoryId` | Exact IDs from the validated start |
| `start` | Existing EvidenceRef shape `{sha256,byteLength}` for the exact canonical start bytes |
| `effectivePublication` | `{transactionId,receipt,heads}`; receipt is EvidenceRef for the exact canonical published.json of the effective publication, heads are its nonempty sorted unique heads |
| `baseChangeSet` | `{sha256,count}` for the complete original-change set below |
| `resolution` | `retain-published-state` |

To seal the base set, decode each already-validated original change and require
unique change hashes. Sort ascending by that lowercase hash, then form rows with
exact keys `expectedChangeHash`, `byteLength`, `bytesSha256`. Hash UTF-8 bytes of
`lociview:metadata:closed-local-base:jcs-v1\n` (one trailing LF byte, not literal
backslash/n characters), followed by existing canonical
`json({changes:rows})`. Count is the number of rows. Eligibility also compares
actual exact change bytes by hash; an ancestor view or a claimed digest alone
does not prove the complete repository is unchanged.

Use existing canonical JSON, SHA-256, technical IDs, EvidenceRef validation,
metadata limits and receipt helpers. Reject extra keys, unsupported schema,
noncanonical bytes or mismatched evidence. Proof binding is inherited from the
exact start and validated chain; no public package purpose, conversion ID,
CRDT operation, timestamp or editor declaration is added.

Keep a single Journal chain. A validated closed-local entry is a terminal node
with **no new publication and no document change**. Distinguish the last terminal
transaction from its effective data publication. A subsequent command links to
that terminal transaction while taking base heads/proof/data capabilities from
the effective publication. Never fabricate `published.json`, delete a chain node,
start an uninspected sibling or count this resolution as a successful edit.

The reader must inspect the closed receipt and all of its bindings, including
after later normal commands. Data-required capabilities follow the effective
publication; aborted intent must not create a new data capability or attribution.
Its own start must still be understood by the reader. Preserve all existing
prepared/durable/publication chain and exact-once rules.

Centralize this distinction in the typed Journal observation used by normal
open/read/dispatch, retained retry, receive and append preparation, and restored
destination verification: **closed is terminal, not pending; structural predecessor
is the terminal node; data/publication references use the effective publication**.
Do not add scattered generic `ignorePending` switches. Existing comparisons
against the last publication must be audited, including Session receive/retry
and BackupRestoreJob's pending prepared-text binding.

## 4. Execution and interruption

Under one uninterrupted Project write lease, repeat eligibility against fresh
selected-generation/source/repository observations. Write the canonical closure
once, read it back, and recheck unchanged repository/publication/generation.
Only ordinary full readiness validation may then permit editing/export.

The post-closure eligibility inspection already performs a fresh ordinary
`read(true)`, adopts its ready state and checks the complete repository against
that read. Return that checked read rather than repeat it immediately. A
restored scope may retain its own opaque ticket instead of issuing another one
inside destination verification; the Session action still repeats full fresh
eligibility before and after writing. Destination verification, controls checks,
write-lease fences and the subsequent strict Host reopen remain independent.

New resolution requires start-only. Confirmation after a lost success response
instead requires exactly start plus the complete identical closure, no other
transaction files, the same current terminal and unchanged whole repository.
It verifies without another write. A later terminal makes the old recovery
ticket stale; use ordinary readiness rather than replaying that action.

The DB, existing Journal files, original ZIPs, models, photos and prior operation
bytes are not rewritten. A complete identical closure is idempotent. A partial,
unreadable, conflicting or torn closure is repair state; it must not be overwritten
or claimed successful. This remaining interruption window is explicit, not hidden.
The proposal therefore does not by itself qualify every autosave interruption.

Older development readers reject this unfamiliar private Journal state. Current
data without a closure remains readable by the current format. No public release
compatibility or migration framework is added; pre-release older-build reopen is
outside acceptance. Existing unfinished jobs must retain their actual rules.

## 5. Original and restored application connection

Original cold Sessions already expose the previous published candidate as pending.
Do not turn that candidate into an editable/exportable source by UI assignment.
Expose only a typed recovery operation/candidate through the existing Host boundary.

Restored generations need their own strict admission connection:
`BackupRestoreJob.verifyDestination()` currently accepts pending recovery only for
a prepared single-change text command and otherwise rejects before a Host exists.
Validate selected-generation/original-root/restore/source bindings first, then
obtain a narrowly scoped recovery ticket. That ticket may perform only this
resolution; it grants no generic Session, backup overwrite or repair permission.
After success, reopen through the ordinary strict Host path and validate readiness.

Use the existing refusal surface and one action such as
`最後に保存された内容で続ける`, beside
`このブラウザに保存済みの内容から再開します。保存途中の変更は反映されません。`.
Retain the current safe exit. Do not offer a delete/reset action or automatically
resolve an uncertain candidate. Failure stays local and preserves every byte.

## 6. Required evidence before connection

- Original and restored generations; real start-only crash on PC/touch; resolve,
  edit, actual export and independent cold reopen with exact previous history.
- Before/after byte equality for all existing paths; only the new closure and
  later legitimate edits/output may be added. Model/photo/original hashes match.
- Complete closure retry is idempotent; duplicate actions create no duplicate
  operation, Undo entry, declaration or history branch.
- Zero-byte/partial/complete change part, extra repository operation, unknown
  capability, corrupt prior receipt or uncertain predecessor all refuse.
- Root/selection/proof change, lease loss, competing receive/restore and hot
  retained input refuse. Normal read-only access cannot execute resolution.
- Crash/failure before/after closure write/readback/readiness; no false success.
  Prepared/durable/publication/acknowledgement interruptions retain exact-once
  recovery and never lose an acknowledged edit.
- Reopen after new regular commands and after another resolved interruption;
  the effective publication and linear terminal chain remain unambiguous.
- After resolution, receive a real collaboration update and append a Scene;
  then interrupt the next text command after preparation and recover cold.
  Existing prepared/exact-once recovery must work beyond the new terminal node,
  for original and restored destinations, including consecutive closed nodes.

Use existing service fault tests and representative browser crash flows. Do not
expand the rule to other partial or corrupt states merely to pass those tests.
Any broader recovery or atomic metadata-DB alternative needs separate design
evidence. Autosave remains unconnected until its interruption admission is met.
