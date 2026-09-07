# LociView team-operation suitability review

> Status: `READ-ONLY PRODUCT-FIT REVIEW / PROPOSED TARGET DIRECTION / NO
> IMPLEMENTATION AUTHORITY`
>
> Review date: 2026-09-07. Further UI editing is paused. This document does not
> authorize production code, schema, package-version, dependency, renderer,
> migration, release, Pages or Service Worker changes.

## 1. Review question and verdict

The review asks a stricter question than whether the current merge is safe:

> Can one knowledgeable LociView operator prepare and maintain a Project in a
> way that lets the rest of a team participate without each person learning
> model import, replacement, alignment and package internals?

**Verdict:** partly, for one bounded Caption-collection campaign; not yet for a
continuing team Project.

- A coordinator can prepare a Project once and distribute one self-contained
  collaboration file. Recipients receive the same editable Project lineage and
  the included model bytes, so they do not need to import or replace the model
  separately.
- From that one fixed state, people can safely contribute disjoint Caption
  fields and required new images. Lineage mismatch, unsupported Project-state
  changes and conflicts fail closed with zero Project writes.
- The workflow stops being ordinary team operation when work requires a second
  round on the same Caption field, a model revision, Asset placement, visibility,
  material, DisplaySet, Saved View or other Project evolution. The original
  baseline never advances and those domains do not merge.
- Every collaboration exchange is self-contained and carries all Representation
  bytes plus its baseline/Caption-referenced media closure. Streaming protects
  memory; it does not make a large GS contribution small to transfer, identify
  or archive.
- The UI permits contributors to make valid local changes that cannot return to
  the coordinator, and conflict output does not identify a usable in-app
  resolution path.

This is not a newly discovered silent-corruption P0/P1 in the accepted bounded
implementation. The fail-closed rules are valuable. The findings below use
separate product-fit labels:

- `TEAM-BLOCKER`: an intended continuing team outcome cannot be completed;
- `TEAM-GAP`: the outcome is possible only with material manual burden or risk;
- `TEAM-POLISH`: the outcome works, but clarity or efficiency can improve.

## 2. Evidence and limits

The review traces the current Native implementation and its executable contract,
especially:

- `src/nativeGs/packageExchange.ts` and `captionThreeWayMerge.ts`;
- `src/nativeGs/packageSnapshots.ts`, `storage.ts`, `schema.ts` and `app.ts`;
- `src/nativeGs/importPreflight.ts` and `collaborationUi.ts`;
- `docs/specs/02-storage-package-migration.md` §§30–32;
- `docs/v2/00-approved-direction.md` and the accepted v2 specifications for the
  future lineage/history direction.

Current code and tests govern observed behavior. General v2 lineage, Automerge
and CAS text is accepted future direction, not current implementation or a passed
technology gate. No private representative source path, filename, hash or
internal source label is needed for this review.

This is a semantic and operational audit. It does not claim a new rendered
Desktop, offline/PWA or physical-iPhone pass.

## 3. Identity: what “the same model” means today

The current implementation deliberately uses several identities rather than one
filename or hash shortcut.

| Layer | Current authority | Consequence for a team |
|---|---|---|
| Exact stored bytes | SHA-256, byte length and media type in the blob reference | Import/export/write boundaries verify exact bytes; ordinary open does not promise to rehash every Representation, and byte equality does not establish Project/model lineage |
| Representation | Representation ID and declared role/profile | Identifies one display/source/proxy representation inside one revision |
| Logical model | Asset ID plus its AssetFrame | Carries the user's model identity and Caption coordinate frame across an explicit replacement |
| Model version | AssetRevision selected by the active binding | Keeps replacements immutable and allows the current model revision to change without changing the Asset ID |
| Caption/surface compatibility | Owning Asset, AssetFrame position, authored revision evidence and compatibility class | Preserves a Caption position, then marks uncertain compatibility for review instead of silently remapping it |
| Project lineage | Project ID | Determines which Project a collaboration package may target |
| Current bounded merge base | Baseline ID plus unsupported-state digest and baseline Caption/media values | Requires matching records and unchanged unsupported Project state; it does not prove causal descent from shared history |

Two users importing the same exact model bytes separately create different
Project, Asset, frame, revision, Representation and compatibility identities.
They cannot merge merely because the hash or filename matches. This is correct:
source relation is a semantic decision and must not be guessed.

An explicitly distributed collaboration package is different. Importing it into
an empty workspace preserves the Project/Asset lineage and includes the verified
model bytes, creating an editable same-lineage copy.

## 4. Workflow roles

These are workflow responsibilities, not accounts, permissions or security
roles. The current product has no authenticated team identity.

| Role | Job | Current support |
|---|---|---|
| Coordinator | Prepares models, alignment, presentation and the first team file | Strong for initial preparation and self-contained distribution |
| Contributor | Adds or corrects assigned Captions/media without managing the base model | Technically possible, but no contributor-safe lane prevents nonmergeable edits |
| Integrator | Receives files, validates lineage, previews and merges changes | Safe fail-closed merge; weak provenance, conflict diagnosis and repeated-round support |
| Reviewer/recipient | Reads a bounded presentation without returning changes | Review/share cannot merge to its source and opens in View first; the restored v1 Project can later be edited only as an independent lineage, and privacy/access limits need clearer disclosure |

One person may fill coordinator and integrator responsibilities. Naming the
responsibility does not grant authority or imply a server-side role system.

## 5. Current end-to-end lifecycle

### 5.1 Prepare and distribute

1. The coordinator imports one or more models and finishes model placement,
   visibility, materials, DisplaySets, Saved Views, pin scale and existing
   Captions.
2. The first collaboration export stores a `collaborationBaseline` back into the
   source Project and reuses it forever. There is no rebase, history graph or
   automatic baseline advancement.
3. The package contains every Representation, plus media present in the fixed
   baseline or referenced by a current Caption, with the verified byte closure
   required by that resulting snapshot. New unreferenced media is omitted.
4. A recipient with no matching Project restores a full editable same-lineage
   copy. This is the point at which one skilled operator successfully lowers the
   initial participation cost for everyone else.

Important current side effect: the baseline is persisted before the browser/OS
file handoff is known to have completed. Code ordering therefore allows a later
cancelled or failed external save to leave the source Project baseline-fixed even
though the user did not obtain the file. This is a source-backed inference; a
focused regression test for that exact failure ordering was not found.

### 5.2 Contribute and integrate

1. The bounded merge domain is Caption state plus new image media required by
   the merged Captions.
2. Title, body, color, anchor/unplaced state, owner Asset, DisplaySet membership
   and ordered attachment IDs are compared as independent atomic fields.
3. Different Captions or different fields can combine. The same field changed to
   different values, delete-versus-edit, incompatible media or unsupported tags
   conflict.
4. All conflicts are collected before writing. Any conflict or unsupported-state
   difference produces zero Project writes.
5. There is no per-conflict chooser. The user must identify and correct a source
   copy, export it again and retry.

The current UI collapses conflict detail into general sentences even though the
current merge result already contains a Caption ID and field. It does not show
those available identifiers in an actionable way. Baseline/local/incoming
candidate values and file/person provenance are not carried by the current
conflict record; exposing those requires a future history/package contract, not
only a UI formatting change.

### 5.3 Why a second round fails

Suppose a Caption field starts as `A`, a contribution changes it to `B`, and the
integrator accepts it. The permanent baseline is still `A`. If a later package
based on the accepted `B` changes that field to `C`, both local `B` and incoming
`C` differ from baseline `A`; the bounded merge treats them as concurrent
changes, not a causal `B → C` update.

Thus “merge, redistribute, improve, merge again” does not form a continuing
collaboration history. A safe manual workaround must close the old lineage and
start a new campaign, leaving no late old-lineage contribution outstanding.

### 5.4 Model replacement and Project evolution

An explicit model replacement correctly preserves the logical Asset ID,
AssetFrame and placement and creates a new immutable revision/Representation
with a fresh compatibility class. Every placed Caption on that replaced Asset
therefore becomes `needsReview`; unplaced Captions and Captions owned by other
Assets do not. Replacement never rerays, snaps or silently maps positions to the
new surface.

However, a model revision changes the unsupported-state digest. So do Asset
addition/removal, model placement, visibility, DisplaySet definitions, Saved
Views, materials, pin scale and other non-Caption presentation state. After such
a change, current collaboration export/merge rejects the whole relationship.

The coordinator can distribute a new independent clean copy, but old branches
cannot merge into that new lineage. Current behavior therefore cannot express:

- one coordinator updates the model once;
- every contributor receives that exact revision;
- unchanged Caption work remains mergeable;
- one person's reviewed pin correction propagates to the others;
- concurrent model replacements remain visible for an explicit decision.

### 5.5 Review/share, clean copy and recovery

- **Review/share** creates a separately keyed allowlisted snapshot that cannot
  merge back into the source and opens in View first. In current v1, its restored
  independent Project is not permanently read-only: it may later be opened in
  Edit and start its own unrelated collaboration lineage. It is not permanent
  access control and does not scrub embedded model/image metadata or user-provided
  media labels.
- **Clean editable copy** creates an independent Project lineage. It is useful
  for handoff or a new campaign, but cannot return changes to the source.
- **Complete backup** restores the same Project exactly and is not a
  collaboration file. If that Project already exists on the device, current
  preflight promises restoration but storage rejects the duplicate Project ID.
  A separate destructive route exists—delete the on-device Project, then restore—
  but preflight does not integrate it into an atomic, backup-first replacement
  workflow.

## 6. Suitability matrix

| Team outcome | Current fit | Reason |
|---|---|---|
| One person works locally and makes backups | Strong with one recovery gap | Native Project is the durable working source; complete backup is distinct, but same-Project restore requires a separate destructive delete/restore route |
| A coordinator prepares the model once for first-time participants | Suitable | The first collaboration package is self-contained and preserves exact lineage |
| Several people submit disjoint Caption work once | Bounded suitable | Safe three-way merge when every copy shares the frozen base and nobody changes unsupported state |
| The same Caption is refined across several rounds | Not suitable | No causal head/rebase; permanent first baseline creates false concurrency |
| The coordinator replaces or adds a model during team work | Not suitable | Asset/Revision changes are outside the merge domain and invalidate the baseline digest |
| Contributors change visibility, view, material or DisplaySet | Not suitable for return | Locally valid edits make later collaboration export/merge fail |
| A large-GS team exchanges frequent small Caption edits | Operationally poor | Every package includes unchanged Representation bytes again |
| The integrator resolves overlapping edits | Not suitable | Fail-closed detection exists, but no actionable review/resolution queue exists |
| External recipients review a selected presentation | Bounded suitable | It cannot merge to the source and starts in View, but the restored independent Project is not permanently read-only; privacy scrub and access revocation are not provided |
| A new owner receives an independent editable copy | Suitable | Clean copy explicitly creates new identity and does not imply mergeability |

## 7. What should be preserved

The current design already provides valuable foundations for a team product:

1. **Local-first, account-free work.** Initial distribution and merge can happen
   through files without a required cloud or Google dependency.
2. **Self-contained first onboarding.** Recipients can receive the exact prepared
   Project and model, rather than repeat expert import/alignment work.
3. **Strict target/baseline matching.** The product never uses filename,
   proximity or package order to guess which Project/model another file belongs
   to. Current v1 still lacks causal-history proof.
4. **Verified bytes.** Incoming package binaries are length/hash checked before
   publication. A full restore stages its required closure; merge into an
   existing Project stages only genuinely new media, and active publication
   remains snapshot/marker-last.
5. **No automatic conflict winner.** Unsupported or conflicting input stops with
   zero writes instead of silently losing one person's work.
6. **Purpose separation.** Backup, collaboration, review/share and clean copy
   have different manifests and results; renaming cannot change purpose.
7. **Logical Asset continuity.** Asset/AssetFrame identity and `needsReview`
   provide a sound basis for safe future model revisions without guessed surface
   remapping.
8. **Review omits source lineage.** It cannot merge back into the source. If its
   independent restored Project later starts collaboration, that is a new,
   unrelated lineage.

The redesign should extend these invariants, not replace them with convenience
heuristics.

## 8. Product-fit findings

### TEAM-BLOCKER 1 — no continuing collaboration head

The first baseline never advances and accepted changes have no causal head.
Repeated editing of one field cannot be distinguished from concurrency. A team
Project needs an explicit epoch/head/history contract, stale-branch detection and
a safe advance/rebase rule.

### TEAM-BLOCKER 2 — model and presentation changes cannot propagate

Model revisions and the presentation state needed to understand them invalidate
the current merge. This defeats the key coordinator outcome: maintain one
canonical Project so the rest of the team can continue contributing. Model
revision must become an explicit, reviewable team change or the product must
truthfully define collaboration as short frozen campaigns.

### TEAM-GAP 1 — no contributor-safe work boundary

A same-lineage collaboration copy opens as a broadly editable Project. Most
non-Caption edits are locally valid and durable, but make subsequent team export
or merge impossible. Warnings exist around some Saved View/DisplaySet controls,
not as a Project-wide role/scope state. The product needs either:

- a contributor lane that keeps mergeable work within the accepted scope; or
- a complete merge contract for those Project domains.

It must not let a participant discover the boundary only after completing work.

### TEAM-GAP 2 — conflict detection has no in-app resolution workflow

Zero-write detection protects current v1 data, but ordinary team work also needs
to recover. An immediate bounded improvement can expose the affected Caption and
field already present in the current result. A continuing team contract must
additionally carry base/local/incoming values and provenance, retain every
candidate, accept an explicit choice or edit, and publish a resolution as new
history. The accepted current recovery—manually correct a source and export
again—exists, but the affected copies must first agree on the chosen value (or
one must return to baseline), otherwise retry reproduces the same conflict.

### TEAM-GAP 3 — unchanged model bytes dominate each exchange

Every Caption contribution carries every Representation again, plus the baseline
and Caption-referenced media closure retained in that package.
For a small Project this is inconvenient; for large GS and repeated contribution
rounds it can defeat practical team exchange. Bounded-memory streaming is still
required, but transfer scope should distinguish initial/full recovery from a
change contribution that requires an already verified base.

### TEAM-GAP 4 — collaboration state and export side effects are unclear

The first export durably freezes a baseline, but preflight describes only the
recipient file. The Project should expose its collaboration state, base/head and
mergeable scope before the action. Failure to save the external file must not be
mistaken for “nothing changed.”

### TEAM-GAP 5 — provenance and receipt history are missing

The package has Project/snapshot/generation/baseline facts but no durable
human-readable contributor, branch/workstream, causal head or receipt record.
The local profile display name is not authenticated actor identity. Teams cannot
reliably answer who supplied a file, what causal base it used or which newer
Project state to send back. Reimport can detect a semantic no-op and say the
change is already reflected, but that is not a person/file receipt history.

Filename conventions may help people organize files, but filenames must never
become merge authority.

### TEAM-GAP 6 — same-Project intake repeats the file selection

Selecting a collaboration file for a Project already on the device redirects to
the Project Edit session but drops the selected input. The user must select the
same file again and receives no persistent “continue this import” state. This is
especially costly for a coordinator processing many submissions.

### TEAM-GAP 7 — backup recovery requires a separate destructive route

When the same Project exists, complete-backup preflight still offers restoration,
then duplicate-ID protection rejects it. A user can separately delete the local
Project and retry restore, but the steps are not an integrated atomic replacement
flow. The safe choices should be explicit: open the existing Project, keep an
independent copy when genuinely intended, or back up and deliberately replace.
No implicit overwrite is acceptable.

### TEAM-GAP 8 — external disclosure is underexplained

Review/share preflight reports selected content and counts but does not say that
included original model/image metadata and media labels are transferred without
automatic scrubbing. A sender may mistake an allowlisted Project snapshot for a
privacy sanitizer. Final confirmation needs an inspectable disclosure summary;
sanitization is a separate product decision.

### TEAM-GAP 9 — the coordinator cannot estimate re-review work

Model replacement warns that Caption anchors may need review but does not show
the affected Caption count or a review queue. The replacement is saved
immediately, so the coordinator cannot estimate the team follow-up before
committing to it.

### TEAM-GAP 10 — file/model intake is not yet fully intent-based

The approved direction is content-derived routing for new Project, model add and
model replace. Current add/replace UI still asks for a rendering kind before file
inspection. This inconsistency makes team instructions depend on internal format
knowledge and should be addressed only after the team contract is decided.

### TEAM-GAP 11 — current collaboration wording is broader than the contract

The home explanation says that people using the same Project can exchange
Caption changes through a collaboration file. Same Project lineage is necessary
but not sufficient: they also need the same fixed baseline and unchanged
unsupported state. Copy should describe the actual team workflow after the
architecture decision, not compensate for it beforehand.

### TEAM-POLISH items

- Review/share confirmation gives only aggregate counts and no final visual/item
  summary for the exact external disclosure.
- Merge progress/result is not consistently exposed as an announced live status.
- `バックアップ`, `完全バックアップ` and similar purpose labels drift between
  surfaces instead of using one stable term.
- Model replacement confirmation should name the affected model and review count
  immediately before the saved action.
- Human-facing exported filenames could include a round/generation/date hint for
  organization, while manifest identity remains the only authority.

## 9. Safe bounded operating procedure for the current product

Until the team contract changes, the only defensible team procedure is a frozen,
one-shot hub-and-spoke campaign:

1. Assign one coordinator/integrator and one canonical Project.
2. Finish every model, placement, visibility, DisplaySet, material, Saved View
   and pin-scale decision before the first collaboration export.
3. Make and retain a complete backup.
4. Distribute the same first collaboration package to every contributor. Tell
   contributors not to import the model independently.
5. Freeze every non-Caption Project edit. Contributors change only agreed
   Caption fields/anchors/attachments and supported new images.
6. Assign Caption or field ownership outside LociView to reduce overlap; current
   packages have no actor/workstream record.
7. Each contributor explicitly saves supported work, exports a collaboration
   file from that restored lineage and retains the Project, export and prior
   source until the coordinator confirms receipt.
8. Before each merge, the coordinator saves or deliberately discards local
   unsaved edits, retains the exact received file and records its external owner,
   receipt time and expected campaign.
9. The coordinator merges submissions sequentially and records `accepted`,
   `already applied`, `conflict` or `failed` outside LociView. A conflicting or
   failed merge is zero-write; keep the unchanged input available for diagnosis
   and retry.
10. After each successful merge or a predeclared checkpoint, create a new complete
    backup of the canonical Project.
11. On conflict, do not force or rename a package. Keep both sources, agree on
    the semantic value, then make the affected field equal in both copies (or
    return one copy to baseline) before exporting the corrected source again.
12. Close the campaign only after every expected contribution is received.
13. For a model update or second editing round: export a clean copy from the
    integrated result; restore it once as the coordinator's new Project; make
    the first collaboration export from that Project; distribute that exact
    collaboration file to everyone. Do not distribute the clean copy for each
    person to baseline independently. Reject late packages from the old lineage
    and keep the prior backup.

This procedure is safe but too restrictive and labor-intensive to be the final
team experience. It should be presented as a current limitation, not marketed as
general collaborative editing.

## 10. Proposed target workflow

The target remains local-first and file-exchange capable. It does not require a
cloud service or accounts.

### 10.1 Separate full workspace from contribution

1. **Team workspace package:** a self-contained exact base for a new participant,
   new device or full recovery. It includes the verified required model/media
   closure.
2. **Contribution package:** requires an existing verified Project lineage/head
   and carries causally identified metadata changes plus only genuinely new
   blobs. It never silently falls back to a guessed base.
3. **Review/share:** remains separately keyed, carries no source lineage and
   cannot merge back into its source.
4. **Complete backup:** remains an exact same-Project restore.
5. **Clean editable copy:** remains an independent lineage.

Whether `team workspace` and `contribution` become two explicit purposes or two
strict modes under collaboration is a Product Owner/package-contract decision.

This thin contribution proposal does **not** fit the currently accepted general
v2 package rule in `docs/specs/02-storage-package-migration.md` §9.1, which
requires every collaboration package to carry the complete required blob
closure. D2 therefore asks whether to explicitly amend/supersede that clause
with a new base-dependent package contract. Until such approval and specification
exist, §9.1 remains authoritative and no thin collaboration package is implied.

Terminology remains separated while D2 is open:

| Status | User-visible label | Meaning |
|---|---|---|
| Current canonical term | `完全バックアップ` | Exact same-Project restore |
| Current canonical term | `共同編集用ファイル` | Current bounded fixed-baseline Caption/image exchange |
| Current canonical term | `閲覧共有用ファイル` | Allowlisted copy that cannot merge back into its source and opens in View first |
| Current canonical term | `編集用コピー` | Independent editable lineage |
| Proposed working label only | `チーム作業用一式（仮）` | Future self-contained team workspace |
| Proposed working label only | `変更ファイル（仮）` | Future verified-base-dependent contribution |

The proposed labels are discussion aids, not approved UI copy. Manifest/internal
purpose values remain implementation terms and are not user-facing alternatives.

### 10.2 Coordinator-to-contributor lifecycle

1. The coordinator prepares a Project and publishes a named team baseline/head.
2. A contributor imports the full workspace once or opens an already verified
   local copy.
3. The workspace visibly shows role/responsibility, base/head, mergeable scope,
   pending local changes and new blob size.
4. A contributor exports a base-dependent contribution. If D2 is approved,
   omitting unchanged Representation bytes may make it smaller, but no package-
   size or transfer-count guarantee is implied.
5. The integrator previews exact changes and external provenance before writes.
6. A valid future-history import atomically publishes its complete history batch.
   Nonconflicting fields project normally; semantic conflicts enter an explicit
   review queue, retain every candidate and block only their affected
   authoritative projection under the accepted conflict contract.
7. The integrator publishes the resulting head or a refreshed full workspace. A stale
   contributor can update/rebase through a defined, fail-closed path.

### 10.3 Model-revision lifecycle

1. A coordinator proposes a replacement for one explicit logical Asset.
2. One logical revision is authored once and its exact verified bytes are
   distributed unchanged to each recipient as a Project change; recipients do
   not independently re-import the source model.
3. Asset/AssetFrame identity and Caption positions remain stable. Compatibility
   rules mark affected Captions `needsReview`; the product never guesses a new
   surface relation.
4. The team sees the affected count and review queue before publication.
5. A person's explicit Caption re-placement is an ordinary mergeable Caption
   change and can propagate to others.
6. Concurrent model replacements remain two candidates until the designated
   coordinator/integrator explicitly resolves them; file order is never a
   winner rule. Authentication or permission authority, if required, needs a
   separate contract.
7. Late branches are detected by causal base/head. The contract defines whether
   their Caption-only changes can rebase or require manual review.

## 11. Proposed state and recovery model

```text
Prepared Project
      |
      v
Published team head ---- full workspace ----> New participant
      |                                           |
      +---- verified base ---- contribution <-----+
      |
      v
Integrator preflight
   | exact/no conflict        | valid semantic conflict
   v                          v
New causal head          Candidate history retained
   |                     authoritative projection blocked
   |                          |
   +---- redistribute <-------+-- explicit resolution change
   |
   +---- model revision ----> needs-review queue ----> published head
```

| Condition | Required behavior | Forbidden shortcut |
|---|---|---|
| Unknown Project/source relation | Stop and ask for the intended source or correct workspace | Filename/hash-only lineage guess |
| Missing base or required blob | No Project write; request the full workspace or exact missing content | Substitute a nearby/local model |
| Stale contribution | Identify expected and actual head; offer the defined update/review path | Treat arrival order as history |
| Same-field Caption conflict | Atomically retain candidate history, show Caption, field and all values/provenance, and block the affected authoritative projection until explicit resolution | Automatic local/incoming winner |
| Concurrent model revision | Keep both revision candidates and affected Caption review state | Last file wins |
| Replacement changes surface compatibility | Preserve AssetFrame coordinates and mark review | Automatic reraycast/remap |
| External share contains original metadata/labels | Disclose and preview included material | Call an allowlist a privacy scrub |
| Same-Project backup restore | Open existing or require an explicit backed-up replacement decision | Silent overwrite |

## 12. Product decisions required before implementation planning

### D1 — What collaboration promise is the product making?

**Recommendation:** support continuing multi-round Project work, not only frozen
Caption campaigns. If the first candidate intentionally remains campaign-based,
name that limit plainly and do not use general co-editing language.

### D2 — Is a thin contribution package a distinct purpose?

**Recommendation:** distinguish a self-contained team workspace from a
base-dependent contribution in the contract and UI. Both must carry explicit
purpose; a filename never selects the mode.

### D3 — What can a contributor change?

**Recommendation:** stage delivery. First make a contributor lane whose allowed
operations exactly match the merge contract; separately extend the history model
so managed model revisions and necessary presentation changes can become
reviewable team changes. Do not leave broadly editable but unreturnable state.

### D4 — How are conflicts and model revisions resolved?

**Recommendation:** preserve base/local/incoming candidates and produce an
explicit resolution change. The UI may recommend based on provenance or scope,
but must never materialize a winner automatically.

### D5 — What provenance is required without accounts?

**Recommendation:** require a machine-verifiable package ID and base/head.
Record the human-readable contribution label, workstream, display name and
wall-clock creation time as provenance hints, not identity or authentication.
Authentication/signatures and server roles are separate decisions.

### D6 — What is the external privacy promise?

**Recommendation:** immediately specify accurate disclosure for original model,
image metadata and labels. Decide separately whether a future sanitized share
purpose removes metadata; do not imply sanitization today.

### D7 — How do old lineage and package versions migrate?

**Recommendation:** preserve current inputs and fail closed. Define dual-read and
new-write behavior, late old-branch handling and recovery fixtures before changing
schema/package behavior. The accepted v2 direction informs this decision but is
not proof that the current Native path already implements it.

### Accepted direction — Project history and model revisions (2026-09-07)

The Product Owner accepted the following core direction after comparing the
current Native behavior with the original LociMyu Google Drive/Sheets flow:

- continuing team work uses one Project lineage with explicit causal base/head;
- a model revision is an immutable change in that Project history, not a replacement
  Project snapshot that overwrites or strands local Caption work;
- a Caption names its logical Asset/AssetFrame and retains authored-revision and
  compatibility evidence; it does not make a filename, URL, blob digest or exact
  revision the independent authority for which model is active;
- Caption title/body/media changes made from an older model revision remain eligible
  for causal integration; an anchor whose compatibility with the active revision is
  unproven is retained and becomes `needsReview` rather than being discarded or
  silently remapped;
- competing anchor edits or model revisions retain candidates until an explicit
  resolution change; arrival order never selects a winner.

This is an accepted product/architecture direction, not an implementation or a
complete storage contract. D2, D3, D5-D7 and the exact history/rebase/conflict
schema remain open. The current fixed-baseline collaboration path still rejects a
model-state difference and must not be described as already supporting this flow.

## 13. Acceptance scenarios for a future contract

The implementation plan should not be approved until the chosen design can state
expected results for all of these scenarios:

1. A coordinator imports and aligns a model once; a new contributor can start
   Caption work without choosing or replacing that model.
2. Two contributors edit different Caption fields; both changes integrate and a
   second causal edit to one accepted field remains a normal update.
3. Two contributors edit the same field differently; the future history adapter
   atomically retains every candidate and provenance, excludes the conflicted
   field from authoritative projection and never uses a materialized winner.
   An explicit resolution change restores the authoritative value.
4. The coordinator authors one logical model revision; its exact bytes distribute
   unchanged to recipients without independent source-model re-import,
   AssetFrame coordinates remain stable and affected Captions form a review
   queue.
5. One reviewer re-places a `needsReview` Caption and that explicit correction
   propagates without remapping unrelated Captions.
6. Two model revisions compete; both remain available and no arrival order wins.
7. A late contribution based on an older head is identified and either safely
   rebased under the accepted contract or sent to explicit review.
8. If D2 explicitly replaces the current required-blob-closure rule, a large-GS
   Caption-only contribution omits unchanged model bytes while a fresh
   participant can still receive a self-contained full workspace.
9. An unknown or separately imported identical model never auto-matches a team
   Project.
10. Review/share confirms exact included objects and warns about unsanitized
    original metadata/labels.
11. Restoring a backup when the same Project exists offers only recoverable,
    explicit choices and never overwrites silently.
12. Desktop and physical iPhone can inspect role, base/head, pending change,
    conflict and recovery states without hidden mode exits or page travel.
13. Cancelling or failing output after a team head/base is prepared publishes no
    partial head and never activates or reports a partial package as complete.
    Any residual staging/destination artifact is identified with a recovery or
    cleanup path. If local head state was already made durable, the UI names it
    and an idempotent retry exports that same head.
14. Interrupted contribution merge or resolution never exposes an incomplete
    metadata/history batch. A completed conflict import retains every candidate
    while the affected authoritative projection stays blocked; retry is
    idempotent and does not duplicate history.
15. Quota exhaustion, a missing new blob or byte/hash failure publishes no partial
    head and never activates or reports a partial package as complete. Residual
    staging/destination artifacts are identified, staging is recoverable and the
    exact missing requirement is reported.
16. Replaying an already accepted contribution is an explicit no-op and creates
    no new head or duplicate blob.
17. Two integrators publishing from the same base produce detectable divergent
    heads that must be merged/reviewed; neither wall-clock time nor last file
    arrival silently replaces the other.

## 14. Recommended next boundary

Do not resume UI implementation yet.

1. Product Owner decides D1–D7, especially continuing history, contribution
   packaging and model-revision ownership.
2. Record the chosen team lifecycle, identity/history rules, package purposes,
   conflict commands, migration and acceptance cases in the applicable product
   and storage specifications.
3. Only then create bounded implementation slices. Storage/history/package
   changes receive their own tests, migration review and independent security/
   architecture review; contributor and conflict UI follows the accepted
   behavior rather than inventing it.

Explicit non-goals for this review are a cloud backend, accounts, real-time
presence, cross-Project guessing, automatic Caption remapping, automatic conflict
winners, direct HEIC/video/audio work, dependency adoption and release work.

## 15. Independent review and evidence record

Three independent read-only review lanes checked current collaboration/storage
semantics, the full team lifecycle, UI/UX authority and cross-document navigation.
Corrections made before final PASS include:

- separating matching baseline records from proof of causal descent;
- describing the exact current Representation/media closure and staging scope;
- limiting model-replacement review to placed Captions on the replaced Asset;
- distinguishing source-nonmergeable review from permanent read-only behavior;
- moving contributor guard, in-app conflict recovery and transfer volume from
  `TEAM-BLOCKER` to `TEAM-GAP` under this document's definitions;
- separating current v1 zero-write conflicts from the accepted future contract
  that durably retains conflict history while blocking authoritative projection;
- recording that a thin contribution package conflicts with the currently
  accepted general v2 required-blob-closure rule and needs a Product Owner/spec
  decision;
- completing current return/receipt/backup/retry and future interruption/quota/
  idempotence/divergent-integrator recovery scenarios.

Final documentation checks:

- branch `g0-baseline`, HEAD
  `d2302ec7e31e563448393ae3b42798e27d219b14`, origin comparison `0 ahead / 0 behind`;
- `git diff --check`: PASS for the existing worktree;
- new review/guideline documents contain no private representative path,
  filename, source digest or source bytes;
- no listener remained on the temporary development port;
- no application test/build or rendered/device acceptance was claimed or needed
  for this documentation-only review.

The pre-existing uncommitted UI implementation worktree remains intact and
paused. No production code, product specification or release state was changed
by this review.
