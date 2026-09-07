# ADR-0002: Project scenes and continuing team history

- Status: Accepted product and architecture direction; implementation remains conditional on the storage gates
- Date: 2026-09-07
- Supersedes: the future-v2 DisplaySet and fixed-campaign collaboration model where identified below
- Preserves: frozen v1, Native snapshot/package compatibility, and the current shipped/default paths until migration is explicitly completed

## Context

2026-09-08 scheduling amendment: the PO approved the pure Scene-core exception
in specification 05 §13.1. Disconnected domain modules/tests may precede storage
gate completion; dependency adoption, persistence and application activation may not.

LociView is intended to let one knowledgeable operator prepare a useful Project
once and lower the participation cost for the rest of a team. The current Native
Project can be distributed self-contained and can safely merge a bounded set of
Caption/image changes from one fixed baseline. It cannot propagate later model,
placement, material, visibility, Saved View or DisplaySet changes through repeated
rounds. A model update therefore strands otherwise valid Caption work unless every
participant independently replaces the model.

The current `DisplaySet` is also narrower than the user model now required. It
binds Caption membership, set-scoped material appearance and an optional default
Saved View, while model visibility remains Project-wide. Renaming that record to
Scene in the UI would promise a composition boundary the data does not provide.

LociMyu avoided part of this problem through one Drive folder, one active model
and Caption sheets whose GID joined Captions, material state and a remembered
view. Drive supplied file/version distribution outside the application. LociView
must preserve the useful coordinated sheet switch without inheriting Drive
identity inference, a single-model assumption or a hidden external version system.

## Decision

1. A LociView Project is the durable working source of truth. It retains typed
   project resources: logical visual Assets, immutable Asset revisions and
   Representations, Captions, MediaResources, Saved Views and material intent.
2. Internal `Asset` remains the logical 3D model and AssetFrame owner. Caption,
   media and view records do not become variants of one generic Asset union.
   Ordinary UI uses the concrete words `モデル`, `キャプション`, `メディア`
   and `保存した視点`.
3. A persistent `ProjectScene` is the user-visible `シーン`. It selects logical
   Assets and Captions through explicit ID-keyed membership records, supplies
   Scene-scoped material intent and may name one entry Saved View. A Caption may
   be referenced by more than one Scene.
4. A Scene references `AssetId`, never `AssetRevisionId`. The active immutable
   revision/binding and Asset-to-Project alignment remain Project-wide. Replacing
   a model preserves every Scene membership and the AssetFrame. Model revision
   identity is supporting infrastructure for safe update, merge and review, not
   a routine mode the user must manage.
5. Caption content, attachments and anchor remain Project resources. An
   Asset-anchored Caption names one AssetFrame; an explicitly model-independent
   Caption names ProjectFrame and is never inferred from a missed surface. An
   edit to a Caption referenced by several Scenes changes that one Caption; the
   UI discloses the affected Scene count. Removing a Caption from a Scene and
   deleting it from the Project are separate commands.
6. `Project.defaultSceneId` is shared Project state. The momentary active Scene,
   free camera, selection, filters, temporary model isolation, gizmo values and
   floating-window arrangement are local UI state. Only an explicitly saved
   Named View shares camera/background intent. Scene switching applies an entry
   view once when present and never silently saves the free camera.
7. Continuing team work uses one Project lineage with explicit causal heads.
   Every participant may edit the full Project. A Contribution contains every
   change in `reachable(current heads) - reachable(base heads)`, including valid
   sibling branches, together with only newly required blob bytes; the UI does
   not make users manually select a mergeable subset or fabricate a rebase.
8. File purposes remain distinct: exact complete backup, self-contained Team
   Workspace, base-dependent Contribution, history-free one-Scene review/share,
   and full-Project new-lineage clean copy. Filenames never determine purpose.
9. Importing a structurally valid same-lineage Contribution atomically retains
   its exact history, candidates and required blobs even when it introduces a
   semantic conflict. Only the affected authoritative projection is blocked.
   Resolution is a new causal command that explicitly chooses a candidate or
   records a manual combined value; arrival time and materialized library values
   never choose a winner. For duplicate Scene memberships the user may keep one
   or explicitly keep both as independently editable Caption/model resources,
   with the original/copy assignment disclosed and confirmed. Equal endpoints
   are not automatically coalesced. Losing candidates remain historical evidence.
10. Invalid package structure, missing causal dependencies, missing required
    blobs, wrong lineage, failed integrity, quota exhaustion or interrupted
    staging publishes no new head. Semantic conflict and invalid input are not
    represented by the same zero-write outcome.
11. Migration is dual-read and v2-only-write. Frozen v1, Native snapshot/package
    versions and LociMyu inputs remain readable and unchanged. A relation may be
    converted only from exact source authority or an explicit user decision;
    filenames, byte equality, hashes, ordering, proximity and visual similarity
    do not prove logical model or Scene relationships.
12. The same administration and recovery capabilities are available on Desktop
    and iPhone through responsive presentation. Mobile is not a restricted
    contributor role.

The detailed schema, command, conflict, package, migration and acceptance
contract is `docs/specs/05-project-scene-team-workflow.md`.

## Rejected as the default path

- Keeping the current fixed collaboration baseline and describing it as
  continuing co-editing.
- Making a Caption package name or locate a model that each recipient must import.
- Treating a content digest or filename as logical model identity.
- Pinning each Scene to a separate Asset revision or alignment.
- Renaming the current DisplaySet in the UI without adding model membership.
- Making a Caption exclusively owned by one Scene and duplicating it merely to
  show the same record in another presentation.
- Restricting ordinary participants to a hidden Caption-only contributor mode
  while the normal UI permits changes that cannot be returned.
- Rejecting an otherwise valid Contribution wholesale because one semantic field
  conflicts, or choosing a conflict winner by file order, timestamp or library
  materialization.
- Storing temporary camera, search, filters, selection or window positions in
  shared Project history.

## Consequences

- The future v2 domain uses `ProjectScene`; the existing Native `DisplaySet`
  remains an exact compatibility input and current implementation until explicit
  conversion.
- Scene selection becomes one cross-tab context. Model membership, Caption
  membership, Scene material and optional entry view resolve together from a
  complete Project state rather than incrementally leaking prior Scene state.
- A model update can be distributed once while older-revision Caption text/media
  changes remain mergeable. Only anchors or material mappings whose compatibility
  is unproven enter a review queue.
- Full Workspace distribution and small iterative Contributions become separate
  size and dependency contracts.
- Causal metadata, CAS and cross-store journaling remain candidate technology.
  No dependency or production path is adopted until its named gates pass.
- Existing Native UI work may supply presentation components, but it cannot be
  promoted by changing labels alone.

## Reconsideration triggers

Reopen this ADR only when evidence shows one of the following:

- a real workflow requires two simultaneously active revisions or alignments of
  the same logical Asset in different Scenes;
- shared Caption identity across Scenes causes unavoidable semantic ambiguity
  that explicit membership and duplication commands cannot resolve;
- the selected causal metadata adapter cannot retain complete field candidates,
  exact remote changes or affected-unit projection under the accepted gate;
- a self-contained Workspace plus base-dependent Contribution cannot meet the
  measured offline/iPhone storage and recovery constraints;
- product research establishes a distinct role/access-control system. That would
  require its own security and product decision and is not inferred from View/Edit
  mode.
