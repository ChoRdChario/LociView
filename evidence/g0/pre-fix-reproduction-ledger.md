# G0-S pre-fix reproduction ledger

> Status: `COMPLETE WITH ONE PO-APPROVED HISTORICAL-UNAVAILABLE ROW`
>
> Recorded: 2026-08-26 on branch `g0-baseline` from HEAD `d63a90b`.
>
> This ledger proves only the recorded unfixed behavior. It does not claim that
> the current tree passes G0-S, that a fix is complete, or that G0 has exited.

## Method and evidence meaning

Each reproduction used an isolated detached worktree. The named Git commit
supplied the production code and historical test bytes. Only the literal test
modifier `it.fails` was mechanically changed to `it` inside that disposable
worktree; no assertion, fixture, helper or production byte was changed. Vitest
3.2.7, which is pinned by every listed commit's `package-lock.json`, then wrote
the raw JSON result under [`reproductions/`](reproductions/).

An artifact is valid reproduction evidence when all of the following hold:

- its named code and test revisions are restorable from Git;
- the focused command exits nonzero with `success:false`;
- the JSON contains the ordinary failed assertion names and failure messages;
- the failure belongs to the historical expected-failure assertion, while its
  ordinary setup/control assertions remain independently visible;
- the artifact is described as a 2026-08-26 rerun, never as a historical log.

The common procedure was:

```powershell
git worktree add --detach <temporary-worktree> <unfixed-commit>
node -e "const fs=require('fs');for(const p of process.argv.slice(1)){const s=fs.readFileSync(p,'utf8');fs.writeFileSync(p,s.replaceAll('it.fails','it'));}" <test-files>
<repository>/node_modules/.bin/vitest.cmd --root <temporary-worktree> run <test-files> --reporter=json --outputFile=<artifact>
```

For `G0S-BLOB-ADD`, the acceptance test did not exist at the unfixed commit.
The exact test blob from `cc01313` was checked out over code commit `1d733eb`;
that hybrid is called out below and is not mislabelled as a historical test run.

## Gate-family ownership and provenance

| ID | Known defect family | Unfixed code / compatible test revision | Focused files | Observed pre-fix result | Current disposition |
|---|---|---|---|---|---|
| `G0S-TAB-ACTOR` | Two stores reused one actor/sequence space and silently reduced distinct operations as duplicates | `4e220e4` / `4e220e4` (initial assertion also at `5791413`) | `tests/core/multiTabSafety.test.ts` | 10/15 ordinary assertions fail after modifier expansion: actor uniqueness, two deterministic 2,000-op schedules, raw/reopen/reduced-state retention and shared-actor append | Actor-instance portion fixed by `07d2eb2`; shared-external-actor append remains open |
| `G0S-TAB-TXN` | Package merge and model replacement interleaved canonical log/blob mutation | `836530d` / `836530d` | `tests/assets/packageReplacementConcurrency.test.ts` | 4/9 fail in merge-first and replacement-first orders; serialization and point-in-time blob closure both fail | Open; waits for the project-scoped mutation-authority decision |
| `G0S-WRITE` | One rejected append poisoned the queue, skipped recovery and made memory diverge from durable reopen | `fe0d82e` / `fe0d82e` (initial assertion also at `5791413`) | `tests/core/durableWriteQueue.test.ts` | 16/28 fail across transient, repeated-quota, partial, commit-then-throw and persistent recovery | Production root fixed by `4271e8c`; device durability and overall gate exit remain open |
| `G0S-OP-INGRESS` | Known-field controls/identity shapes could activate; divergent same-key operations could first-win | `637d01e` / `637d01e` (base corpus at `b646922`) | `tests/core/g0sOpIngress.test.ts` | 70/299 fail. This includes the 14 currently open known-field/identity rows and 6 divergent-key rows, plus failures later closed by the ingress fixes | Structural firewall fixed by `6e0d958`; typed known-field quarantine and divergent-key resolution remain open |
| `G0S-OP-BUDGET` | Oversized local operations could enter memory/queue even though reload/package ingress rejected them | `7bf5749` / `7bf5749` | `tests/core/g0sOpBudgets.test.ts` | 6/18 fail at memory/listener, actor-log and reopen/clock boundaries | Fixed by `512b8f9`; exact numeric limits remain provisional, not product guarantees |
| `G0S-BLOB-BASE` | Model replacement and native import/merge could publish metadata before a required blob/durable boundary | `5791413` / `5791413` | `tests/assets/modelReplace.test.ts`, `tests/assets/package.test.ts` | All seven initial G0-S assertions fail, including the three blob-order assertions | Superseded by the more exact rows below; retained as the first provenance anchor |
| `G0S-BLOB-PUB` | Import, merge and replacement could expose prefix logs, corrupt bytes or premature cleanup | `14329ea` / `14329ea` | `tests/assets/modelReplacementDurability.test.ts`, `tests/assets/packagePublication.test.ts` | 30/84 fail with exact marker/log/blob/notification/cleanup assertions | Replacement fixed by `1d733eb`; most import/merge verification fixed by `4271e8c` and `99133fd`; manifest/actor-log crash-atomic prefix rows remain open |
| `G0S-BLOB-VERIFY` | Resolved corrupt or omitted required blobs could be accepted during native import/merge | `f8c6556` / `f8c6556` | `tests/assets/packagePublication.test.ts` | 29/74 fail at read-back, notification, marker and old-or-complete authority boundaries | Fixed portions are ordinary regressions after `4271e8c`/`99133fd`; actor-log atomic publication remains open |
| `G0S-BLOB-WIZARD` | Import wizard published its root marker before the complete planned closure | `c9566c7` / `c9566c7` | `tests/assets/importWizardPublication.test.ts` | 7/14 fail across marker start and interruption rows | Fixed by `e24fb03` except the root-marker-prefix crash row, which remains open |
| `G0S-BLOB-ADD` | Model addition could acknowledge metadata against unverified/corrupt/missing durable bytes | code `1d733eb`; test blob `cc01313:tests/assets/modelAdditionDurability.test.ts` | `tests/assets/modelAdditionDurability.test.ts` | Actual hybrid rerun fails 6/9: verification was not observed, publication/final authority was unsafe, and rejected append could still be acknowledged | Fixed by `cc01313`; provenance is a recorded hybrid rerun rather than a contemporaneous characterization |
| `G0S-BLOB-ATTACH` | Caption attachment publication needed the same verified blob-before-metadata boundary | candidate code parent `512b8f9`; production seam and test first appear together at `fd5df28` | `tests/assets/captionAttachmentDurability.test.ts` exists only after the fix | **`historical reproduction unavailable`: no compatible pre-fix test/API exists and no failure artifact is claimed.** | Product Owner approved the explicit exception. Current fix acceptance at `fd5df28` remains; no retroactive test, fixture or evidence work is authorized and this row is never described as a pre-fix failure or PASS. |
| `G0S-MAL-ENVELOPE` | Malicious package shapes could inspect/apply partially or mutate existing authority | `8694756` / `8694756` | `tests/assets/maliciousPackage.test.ts` | 67/124 fail after expansion; exact inspection, mutation, marker, state/reopen and clock assertions are in the raw result | Subsequent minimal fixes close most rows; future-major edit policy remains open |
| `G0S-MAL-MANIFEST` | Duplicate/ambiguous members, invalid scalars, reserved keys and non-finite values could activate | `aa1ebb4` / `aa1ebb4`, containing rows introduced at `9d67a56`, `5825727`, `2c10fda`, `aa1ebb4` | `tests/assets/maliciousPackage.test.ts` | 135/245 fail after expansion, with per-case marker/sentinel/old-authority failures | Fixed by `e95c180` and `b976ebc`; related UTF-8/path/special-entry fixes remain ordinary regressions |
| `G0S-MAL-ZIP` | Control paths, parent/child ambiguity, disguised nested ZIP, CRC and encryption mismatch were accepted | `bd09790` / `bd09790` | `tests/assets/zipioStructure.test.ts` | 11/23 fail as ordinary assertions | Fixed by `bec3f76`; portable collisions, UTF-8 and Unix special entries were later fixed by `2017a5a`, `8be3098` and `6c0e344` |
| `G0-MIG-ADJACENT` | Six known v1/LociMyu migration gaps were frozen with the representative fixtures | `3809ca0` / `3809ca0` | `tests/assets/v1MigrationFixtures.test.ts` | 6/12 fail; the exact assertion names are in the raw result | Caption identity/duplicate occurrence rows fixed by `fa3e423`; four policy/data rows remain. These adjacent rows do not by themselves close `G0S-TAB/WRITE/OP/BLOB` |

## Currently open expected-failure rows

The current tree retains 36 runtime expected-failure rows. They are not counted
as fixes or gate completion:

- 3 shared-actor append-retention rows;
- 4 package manifest/actor-log crash-atomic publication rows;
- 1 import-wizard root-marker-prefix row;
- 2 package/replacement serialization rows;
- 14 known-field/identity operation-policy rows;
- 6 divergent same-key collision rows;
- 2 future-major edit-policy rows;
- 4 adjacent migration policy/data rows.

The first six bullets are the remaining `G0S-TAB`, `G0S-BLOB` and `G0S-OP`
production roots. Future-major and migration rows retain their separately
approved specification/deferred-review boundaries; finding them here does not
automatically pull them into the next production slice.

## Raw reproduction artifacts

Every artifact is a Vitest JSON report with `success:false`, ordinary failed
assertion names and failure messages. Counts are total/passed/failed/todo.

| Artifact | Counts | Bytes | SHA-256 |
|---|---:|---:|---|
| [`g0s-initial-5791413.json`](reproductions/g0s-initial-5791413.json) | 29 / 22 / 7 / 0 | 18,010 | `15dc2b8d597cb70de7dd7d6ab23f5642a3712dd7061b90adc81eb7a59d91bf4a` |
| [`g0s-tab-4e220e4.json`](reproductions/g0s-tab-4e220e4.json) | 15 / 5 / 10 / 0 | 16,250 | `6b4347134432a4e6ff162eb48621663f6f03d1360880ade9238807ee1637c885` |
| [`g0s-tab-transaction-836530d.json`](reproductions/g0s-tab-transaction-836530d.json) | 9 / 5 / 4 / 0 | 8,352 | `d4d597f1047f85d32d2e3735c82b04ff4c2577076f49990ee7f511ace07a69fe` |
| [`g0s-write-fe0d82e.json`](reproductions/g0s-write-fe0d82e.json) | 28 / 10 / 16 / 2 | 26,107 | `7583d3907dce40d7cb12d4f1bb8b8cc8ee3637479c4c7a945c66d1fd2d622f56` |
| [`g0s-op-ingress-637d01e.json`](reproductions/g0s-op-ingress-637d01e.json) | 299 / 227 / 70 / 2 | 196,607 | `8567b85cefdc618fff07834b40502881ab8332fec23979f193264ce1d74deebb` |
| [`g0s-op-budgets-7bf5749.json`](reproductions/g0s-op-budgets-7bf5749.json) | 18 / 10 / 6 / 2 | 13,697 | `f0a7cb210bfd5ed3521ec7149ecf3e05afe245b62d36aeb5a4c1ce0bbaf7f61b` |
| [`g0s-blob-publication-14329ea.json`](reproductions/g0s-blob-publication-14329ea.json) | 84 / 47 / 30 / 7 | 61,461 | `9c7ac5f7622bdcef0720351af7b53a4fe777a4a355b5dca725872d79832228af` |
| [`g0s-blob-verification-f8c6556.json`](reproductions/g0s-blob-verification-f8c6556.json) | 74 / 43 / 29 / 2 | 57,633 | `cfb0cd374a16ddb12a7a44f45ee183f1096d8bc39b6f72cc340664058bbd9790` |
| [`g0s-blob-wizard-c9566c7.json`](reproductions/g0s-blob-wizard-c9566c7.json) | 14 / 7 / 7 / 0 | 13,166 | `46868074f367337508b7bfac67d1c9cfd9d258eaa70733dfa957defe4cf4df1c` |
| [`g0s-blob-model-addition-1d733eb-plus-cc01313-test.json`](reproductions/g0s-blob-model-addition-1d733eb-plus-cc01313-test.json) | 9 / 3 / 6 / 0 | 10,513 | `59a63ca8ff69bb1e1594f323430d5ac3377787ee39f818a2123806c182212d12` |
| [`g0s-malicious-envelope-8694756.json`](reproductions/g0s-malicious-envelope-8694756.json) | 124 / 52 / 67 / 5 | 122,914 | `144c62a9e4bfc4fa56459557e223e34b848f0c601c04c2dc11d04d92a1b1d27b` |
| [`g0s-malicious-manifest-aa1ebb4.json`](reproductions/g0s-malicious-manifest-aa1ebb4.json) | 245 / 99 / 135 / 11 | 252,244 | `7c9cfd22599fda94670eb2fee6241744a7660bf266693a24d67b2bb6bc95db9a` |
| [`g0s-malicious-zip-bd09790.json`](reproductions/g0s-malicious-zip-bd09790.json) | 23 / 12 / 11 / 0 | 21,038 | `db6bdebfb5edd865c32da91f5b7b9c5984fa3628c78ed9097e591769563bdf48` |
| [`g0-migration-3809ca0.json`](reproductions/g0-migration-3809ca0.json) | 12 / 5 / 6 / 1 | 10,641 | `cc463bfaa7cc55cddd94370509285e0209fd80616ae2e606b67e2204719abdea` |

## Honest gate disposition

`G0-CHAR-01`, `G0-CHAR-02` and `G0-EXIT-03` are covered under the narrow
Product-Owner-approved exception recorded above. This means that every known
family has an exact evidence/disposition row; it does **not** mean caption
attachments have pre-fix failure or PASS evidence. Their acceptance and
testable production seam were introduced together at `fd5df28`, so the row is
permanently labelled `historical reproduction unavailable`.

No compatibility reconstruction, additional test, fixture or evidence work is
authorized for that missing historical seam. Current fix acceptance remains the
only executable caption-attachment result.
