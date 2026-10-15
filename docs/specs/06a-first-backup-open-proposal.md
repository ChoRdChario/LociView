# First backup opening into an absent Project

Status: **APPROVED — exact companion ratified by PO 2026-10-16; Implemented in nondefault validation with Node/injected/recorded-DOM evidence, not adopted.**
This additive companion to [06](06-project-package-wire.md) addresses the missing
first-open path, separately from the existing ready-Project replacement restore.
The accepted unified file selector does not authorize this storage branch.
[Todo](../../tasks/todo.md) owns current implementation and executed evidence.

## Decision and user outcome

Open a named backup on a device where its original Project is provably absent →
confirm the backup's saved point and that no local work is being replaced →
restore its exact original identity/history/bases/bodies into a dedicated local
generation → edit → exchange files → cold reopen that selected generation.

The ratified decision adds a closed **absent predecessor**, rather than
invent a ready Project to satisfy the current restore API. No Project/epoch/entity
IDs, lineage or original changes are regenerated. Only existing local job/
generation identifiers are fresh. A discovered ready Project continues through
the existing explicit replacement confirmation; this first-open branch cannot
silently replace it. An existing empty or damaged original database is not absence.

This approves neither general lost-storage repair nor Workspace merging of a
backup. Existing profiles, format admission, package wire, fullBackup proof/seal,
protected inventory, historical exchange bases and CAS no-repair rules stay fixed.

## Proving absence without creating a database

Under the existing logical Project lease, bind the original FS root and database
family to the inspected backup's complete Project proof. Use a successful
noncreating `originalDatabasePresent(): Promise<boolean>` probe: `false` alone
proves the original database is absent. The browser adapter checks the exact
original name through the existing database-enumeration boundary; its first-only
probe must reject unknown raw enumeration entries rather than silently dropping
them. Existing ordinary enumeration behavior stays unchanged. Unsupported enumeration,
errors, unknown names, or an existing database with no rows are not absence.
Do not call the ordinary original-generation opener to discover this condition.

The original root must have no files outside recognized `v2/local-restore/` and
`v2/generations/` retention, no Selection and no other pending operation. Every
retained local control/path/generation database must have the owner and phase
described below. Shared CAS outside the original root need not be empty. Unknown
FS/DB content, missing acknowledgments, partial controls or evidence of an earlier
ready original fail closed; do not delete or rewrite them to manufacture absence.

Only these terminal jobs may remain when preparing another first open:

- A valid new Prepared-2, no Start/Index/DbOpened/destination FS or DB/Selection,
  and its explicit existing Abandoned-1 record. Its Prepared-2 proves absent
  provenance; a partial unacknowledged input may remain inert and is never source
  authority. Do not trust or splice that partial ZIP.
- A valid new Start-2 with the same complete Project proof, matching Prepared-2,
  exact acknowledged input, and its verified Result-1.cancelled. Keep the existing
  stage-dependent Index/DbOpened/generation constraints and all retained bytes.

**Any Start-1 is prior-ready evidence**, even if cancelled. A Prepared-1 without
Start also lacks first-open provenance. Neither is eligible for this branch;
preserve it and require repair or a separately specified lost-current recovery.
Old ready restore/cancellation/abandonment behavior is not changed by this rule.

## Exact additive local records

Use the existing paths, EvidenceRef `{sha256,byteLength}`, MetadataProof and limits
from 06. New alternatives have exact keys, explicit nulls and no unknown fields:

```ts
type AbsentSnapshot = {
  originalPaths: []; originalDatabase: false; selection: null;
  terminalJobs: {
    jobId: string;
    prepared: EvidenceRef; start: EvidenceRef | null;
    terminal: { kind: 'abandoned' | 'cancelled'; evidence: EvidenceRef };
    dbOpened: EvidenceRef | null;
    retainedPaths: string[]; generationDatabase: boolean;
  }[];
};
type RestorePreparedAbsent2 = {
  schema: 'lociview-local-restore-prepared-2'; jobId: string;
  archive: EvidenceRef; manifest: EvidenceRef; metadata: EvidenceRef;
  protectedInventory: EvidenceRef; exchangeBases: EvidenceRef;
  baseEvidence: EvidenceRef[];
  backup: { proof: MetadataProof; heads: string[] };
  absence: AbsentSnapshot;
};
type RestoreStartAbsent2 = {
  schema: 'lociview-local-restore-start-2'; jobId: string;
  prepared: EvidenceRef; previousSelection: null;
  current: { kind: 'absent'; retained: EvidenceRef };
  backup: { proof: MetadataProof; heads: string[] };
};
```

Prepared-2 and Start-2 occupy the existing `prepared.json` and `start.json` paths.
`prepared` references the actual Prepared-2; `current.retained` references its
actual `absence` value. `backup` is rederived from the owned BackupArchive's
source.proof/heads and must be equal in both records. Archive/metadata/inventory/
base refs retain the existing descriptor rules and cumulative limits; baseEvidence
remains SHA-sorted/deduplicated. Job IDs remain 32 lowercase hex.

Sort terminalJobs by jobId and retainedPaths by UTF-16 code-unit order, strictly
increasing/unique. Paths are exact recognized root-relative paths, without path
normalization or a locale comparator. Every ref binds the actual canonical
Prepared/Start/terminal/DbOpened record. The database boolean is the successful
noncreating probe for that job's dedicated generation. Check the controls/input/
phase/FS/DB relations in addition to their fingerprints: a hash alone is not an
absence capability. No global CAS rehash or separate observation ledger is added.

Index-1, DbOpened-1, Selection-1, Result-1 and Abandoned-1 keep their exact existing
shapes; their existing refs may bind Start-2 under this closed alternative. Old
Prepared-1/Start-1 bytes, readers and current fingerprints remain unchanged.
`RestoreCurrent.generationId:null` continues to mean a **ready original**, never
absence. A prior binary rejects the unknown Start-2 schema; it must not read it
as Start-1 or construct a fallback original Project.

Encoding is unchanged `restoreRef`: existing canonical `json` (recursive sorted
object keys, retained array order), UTF-8, no BOM or final newline, SHA-256 and
actual byteLength. There is no new hash domain or codec. Empty snapshot golden:

```json
{"originalDatabase":false,"originalPaths":[],"selection":null,"terminalJobs":[]}
```

Exactly **80 bytes**, SHA-256
`660e5c4adda3b21a94ca15ab3c318893fe91f5d9027b3bb8e4880417d8e0085f`.
Node and independent .NET calculations agree. Actual Prepared-2/Start-2 and
cancelled/abandoned successor-snapshot vectors must use the existing owned backup
fixture's real refs/proof/heads during implementation acceptance; illustrative
hashes must not be presented as original-source evidence.

## Confirmation, selection and recovery lifetime

Preparation owns an immutable backup Blob slice and its inspected archive ref;
it writes nothing. Under the same root authority, compare the captured absence
again at confirmation before the first write. Only after validated absence and
explicit confirmation, activate the existing held absent-root write capability;
do not invoke the original opener/bootstrap or add a lease framework.
Write Prepared-2 → owned input.zip,
close/reinspect the acknowledged exact input → recheck the absence predecessor
before Start-2 → read back Start-2 and Index-1. Reserve the complete existing
control/input lifecycle before writing. Do not repair a lost acknowledged input
from memory or another file merely because its intended proof is equal.

Only that first warm attempt receives the existing one-use `allowCreate:true`
permit for its dedicated generation database. Never create the original database.
Read back DbOpened-1 before destination Repo/journal/facts/base initialization.
Reuse `initializeBackup(job)`, exact original history/fullBackup binding, original
base table/evidence and verified full protected inventory. Existing acknowledged
body/receipt loss remains repair; a selected backup cannot implicitly refill it.

Recompute the same absence snapshot during pending Start-2 cold entry and
immediately before Selection, alongside ordinary owning-job/destination checks.
Exclude only the current job's exact owned artifacts for its current phase, and
validate those artifacts separately: pre-Start Prepared/input; later matching
Start/Index; and dedicated DB/DbOpened/destination only under the same job's
existing stage capability. Never broadly ignore local-restore/generation data.
Probe failures or a new original/unknown database, Project file or foreign pending
job make confirmation/selection stale. The lease and rechecks protect cooperating
app operations; they do not promise universal atomicity against arbitrary APIs.

After destination display preparation and exact source/base/body verification,
append/read back Selection-1 with `previous:null`, then Result-1.selected. The
selected generation keeps the backup's identity and original changes. This is
the sole switch point; staging capabilities expire. Selection without Result
completes that exact handoff, without another Selection. Lost acknowledged
Selection requires repair. Later restores use the selected ready current and
ordinary Start-1; later edits never recompare historical absence snapshots.

All cold openings use `allowCreate:false`. The existing compatible empty
same-job DB may finish its DbOpened handoff; an absent/lost DB is not recreated.
Before Selection, explicit cancellation writes only its fixed terminal Result,
leaves the Project unselected and retains every byte/database. Missing Index is
cancellable only under the existing beforeInitializationWithoutIndex proof;
pre-Start abandonment keeps its existing no-Start/no-destination conditions.
After Selection, resume selected data/display; do not roll back or bootstrap an
original. Terminal historical jobs validate their original refs/acknowledgments,
not today's absence. A subsequent first open captures a new snapshot containing
the eligible terminal jobs, so legitimate terminal additions do not invalidate
their older observations.

## UI and import boundaries

Keep the unified intent. Inspect backup content with BackupArchive and retain the
owned file/ref and saved-point summary. Propose optional
`ValidationHostOptions.firstBackup: Readonly<{file:Blob;archive:EvidenceRef}>`,
forwarded through the existing selector open port after its current positional
arguments. It is exclusive with initial/workspaceFile/reviewEdit. The Host
reinspects the actual bytes; a UI summary/ref does not grant restore authority.

Extend existing RestoreDatabasePorts with optional noncreating
`originalDatabasePresent()` for this first-only branch, and add
`BackupRestoreJob.prepareFirstOpen(root,file,limits,databases)` in the existing
job authority. Missing port rejects first open while old ready restore stays
unchanged. Do not instantiate a fake Session/provider/ready publication to call
the current API. Keep package/metadata code independent of harness/UI imports.

Before opening the original database, Host/catalog recognize valid Prepared-2/
Start-2 and resolve first-open state. The open result may add a discriminated
`kind:'first-backup-recovery'` alternative with validated backup identity/title
(or unknown title), job/phase/error, confirm/retry/cancel/abandon/dispose actions;
it supplies **no ordinary Session/provider**. Preview confirmation writes only
through the job. Preview cancellation is no-write disposal; after writes the
existing explicit terminal actions apply. Only verified selection hands the
same lease/lifetime once to the actual selected Host. No ordinary renderer is
mounted before then. Pending first-open is visible before renderer work.

A root containing only eligible terminal records is displayed as “Projectなし・
復元記録を保持”; it offers file opening/new first-open, not ordinary View/Edit or
last-Project resume success. Do not invent Project data/title to populate the
catalog. Rendering after Selection uses the restored startup Scene and existing
fresh editor/residents. Display failure resumes selected data; remember/announce
success only after actual publication, readiness and successful mount.

## Acceptance and affected stops

Reuse existing service/fault tests plus one named-backup → empty original root →
explicit first restore → typed edit/file handoff → selected-generation cold reopen
flow. Assert full original history/proof/identity, historical bases/protected
bodies, source bytes, no original DB/bootstrap and no local controls in ordinary
outputs. Exercise preview cancel without writes, cancellation residues → new
first open, actual selection/display failure, and the original ready Start-1 path.

Focused cases cover original DB present/empty, failed/unsupported probe, unknown
FS/DB, ANY Start-1/Prepared-1, foreign full proof, pending/partial/lost-ack input,
stale confirmation/selection, own-job phase exclusion, missing Index/DbOpened/DB/
Selection/Result and CAS loss. Keep existing limits, warm-create/cold-noncreation
and selected-generation fences. Freeze actual P2/S2/successor-snapshot vectors
from real test fixtures and independently recompute refs before final acceptance.
Node/injected/recorded-DOM evidence is not browser/storage/device/offline adoption.

Stop affected work for unprovable absence, inconsistent ownership/acknowledgments,
a changed lease/predecessor or any need to weaken old Start-1/current semantics.
New profiles/numeric policy, dependencies, ordinary-home activation, cleanup/
deletion, release/deployment and managed-browser-denial retries are excluded.
PO explicitly ratified this exact absent-predecessor/local-record and recovery/
selection contract on 2026-10-16 and authorized its bounded implementation.
That approval does not claim implementation, browser/device acceptance or adoption.

## Bounded implementation evidence

The nondefault validation route connects content-inspected backup confirmation
to recovery-only opening, dedicated-generation initialization/selection, actual
typed edits, file output and selected cold reopening. Normal Host/ready Start-1,
wire/seals and existing profiles remain unchanged. The browser adapter adds only
the strict noncreating original-name observation; injected enumeration tests do
not count as actual browser storage evidence. Todo owns the passed final checks
and HTTP identity evidence; ordinary/browser/device/offline gates remain separate.

The real owned synthetic backup captured in the service acceptance was 19704
bytes, SHA-256 `6b22328fd6ac885073cfc60e590050f4d79cc9ffecbc6e800c31728ecc4e8e31`.
These three exact canonical UTF-8 records (no BOM or final LF) were captured from
that test, then independently re-canonicalized and hashed with Node and .NET.
They are local implementation evidence, not distributed input fixtures.

| Record | Bytes | SHA-256 |
|---|---:|---|
| Prepared-2 | 1529 | `68891617508803a840fee420c80d7900702cf453282f59fd02e3c0ce2a84c34a` |
| Start-2 | 942 | `e0c9aecc4c17b2ec668fcbc64bb69bdfd66483611b10553cdd82a45d91920ef6` |
| Next absence snapshot after cancellation | 871 | `80b7528f399e24842712afbdf10676561297e28ab09ab777f379f67de8ff9544` |

The Start binds that Prepared and its exact backup proof/heads; the next snapshot
binds the actual cancelled job and retained paths. The acceptance also compares
all three refs against an independent digest of the actual canonical bytes.
