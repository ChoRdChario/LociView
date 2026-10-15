# ProjectScene and continuing-team workflow contract

> Status: `PRODUCT-OWNER APPROVED CONTRACT / CORE, RECORD GUARDS, UI COMPONENTS AND SYNTHETIC WORKSPACE LOOP; INTEGRATED V2 NOT IMPLEMENTED`
>
> Approved: 2026-09-07
> Scheduling amendment: 2026-09-09, §13.4. Connected synthetic development
> delivery is approved; the first in-memory loop exists, not rendered/storage or
> whole-product acceptance. Current evidence/remaining connections: `tasks/todo.md`.
>
> Architecture authority: `docs/adr/0002-project-scenes-and-continuing-team-history.md`

## 1. Scope, precedence and non-claims

This specification defines the future v2 Project/Scene composition model and
continuing file-based team workflow. It supersedes the general-v2 DisplaySet and
single collaboration-package language in:

- `00-product-contract.md` section 3 and section 4.6;
- `01-domain-rendering.md` sections 2.2, 4.2--4.5, 5--6 and the affected
  section 12 acceptance rows, but only where they encode DisplaySet-based
  presentation rather than ProjectScene-based presentation;
- `02-storage-package-migration.md` sections 3--3.3, 5, 8--12 and their
  affected acceptance rows, but only where they encode DisplaySet fields,
  presentation conflicts/migration/export closure or the former single
  `collaboration` package purpose.

It does **not** change frozen v1, current Native snapshot schema 1, Native
portable package 1/2, Native Package Exchange 1, the implemented fixed-baseline
merge, or the implemented LociMyu-to-Native receiver. Those remain exact
compatibility inputs until an explicit converter publishes a separate v2
Project. Historical Native sections in `02-storage-package-migration.md` retain
their current authority for those bytes.

This document does not adopt Automerge, CAS, a ZIP/hash dependency, a renderer,
a package version, a release candidate or a deployment. Candidate technology
must still pass the applicable G1 gates before production use.

## 2. User model and fixed boundaries

### 2.1 Project resources

A LociView Project is the durable working source of truth. It retains typed
resources rather than one untyped Unity-style Asset union:

- a logical visual `Asset`, its AssetFrame, immutable AssetRevisions,
  AssetBindingRevisions and Representations;
- a `Caption`, its anchor, attachments and tags;
- immutable `MediaResource` records and bytes;
- `SavedView` records;
- Project- or Scene-scoped `MaterialOverride` records;
- persistent `ProjectScene` records and explicit membership edges.

The ordinary UI calls these `モデル`, `キャプション`, `メディア`,
`保存した視点` and `シーン`. The internal word `Asset` remains the
logical 3D model/AssetFrame owner. It is not the user-visible umbrella term for
all Project content.

### 2.2 Scene responsibility

A ProjectScene determines:

1. which logical Assets are persistently displayed;
2. which Captions belong to the Scene's browsing/authoring set;
3. which Scene-scoped material intent overrides Project/source intent;
4. which one Saved View, if any, is applied once when the Scene is entered.

A Scene does not own model bytes, Caption content, media bytes, Asset alignment
or Asset revision selection. It references a logical Asset, not a revision.
Temporary search, pin-color filtering, selection, isolation, free camera,
floating-window layout and gizmo input are UI state and never Scene membership.

### 2.3 Model revision boundary

`Asset.status.activeBindingId` remains the Project-wide authority for the active
AssetRevision and `assetToProject` alignment. Replacing a model creates immutable
Representation/AssetRevision/AssetBindingRevision records and atomically changes
that pointer after required bytes are durable. It does not rewrite Scene edges.

An Asset-anchored Caption continues to name its logical Asset/AssetFrame and
retains authored revision plus compatibility evidence. Caption title, body and
media changes made against an older revision remain eligible for causal
integration. If anchor compatibility with the active revision is not proven,
the Caption remains preserved and becomes `needsReview`; it is never discarded,
reraycast, moved or silently attached to another model. A Project-anchored
Caption has no model revision dependency and keeps its ProjectFrame coordinate.

PO clarification (2026-09-13, after `c2a00f3`): `needsReview` is a pin status,
not a hide command. When the authored position and current frame transform are
authoritative, keep the pin visible and selectable at that position. Preserve its
chosen color; distinguish the review status separately on the pin and Caption
list. Selection opens its Caption and permits the existing explicit correction.
Displaying it neither proves compatibility nor clears the status. Ordinary Scene
membership, explicit visibility and color filters still apply. Missing, invalid
or conflicting position authority is a separate unavailable-position case:
preserve the record/list/recovery path without inventing coordinates or a winner.
Bounded ProjectScene connection now displays these pins with their original color
and a separate review badge. The viewport returns the exact immutable display input
used for projection; overlay/lines accept only that current receipt, finite points
and current pin membership. Window lines also require the current source and Scene.
Local hiding does not erase the review status. This is display-only code/port-test
evidence, not rendered/native-input/device or ordinary-app acceptance; see todo.

## 3. Persistent metadata

### 3.1 IDs and root maps

The portable ID grammar in `02-storage-package-migration.md` adds:

```text
scn  ProjectScene
sam  SceneAssetMembership
scm  SceneCaptionMembership
```

The resulting exact grammar is:

```text
^(prj|hep|frm|ast|bnd|rev|rep|fam|lay|slot|cmp|grp|cap|att|tag|tgm|med|set|scn|sam|scm|view|ovr|evt|mig|iss|pkg|snp)_[0-9a-f]{32}$
```

`set_` remains admitted only where closed legacy migration support or a
superseded DisplaySet input requires it; no ProjectScene writer emits a `set_`
as a Scene or membership ID.

Each suffix remains 128 CSPRNG bits for ordinary creation. A migration-created
ID uses the existing domain-separated full-digest registry and collision check;
simple prefix replacement, filename, current array position and content hash are
not ID recipes.

The general-v2 root replaces `displaySetsById` and adds two ID-keyed edge maps:

```ts
interface ProjectDocV2 {
  schema: { major: 2; minor: number };
  identity: {
    projectId: ProjectId;
    historyEpoch: HistoryEpoch;
    lineageSeed: string;
  };
  project: Project;
  assetsById: Record<AssetId, Asset>;
  assetRevisionsById: Record<AssetRevisionId, AssetRevision>;
  assetBindingsById: Record<AssetBindingRevisionId, AssetBindingRevision>;
  representationsById: Record<RepresentationId, Representation>;
  mediaResourcesById: Record<MediaResourceId, MediaResource>;
  captionsById: Record<CaptionId, Caption>;
  captionAttachmentsById: Record<CaptionAttachmentId, CaptionAttachment>;
  captionTagsById: Record<TagId, CaptionTag>;
  captionTagMembershipsById: Record<TagMembershipId, CaptionTagMembership>;
  scenesById: Record<ProjectSceneId, ProjectScene>;
  sceneAssetMembershipsById: Record<SceneAssetMembershipId, SceneAssetMembership>;
  sceneCaptionMembershipsById: Record<SceneCaptionMembershipId, SceneCaptionMembership>;
  viewsById: Record<ViewId, SavedView>;
  materialOverridesById: Record<OverrideId, MaterialOverride>;
  migrationSupport?: MigrationSupportV1;
}
```

All other v2 root fields and immutable-record rules remain those of
`02-storage-package-migration.md`.

For this amended root, Project/Asset/Scene/View/Tag/Media labels remain limited
to 256 Unicode scalars and `orderKey` retains `[0-9A-Za-z]{1,64}`. There is no
additional per-Scene membership ceiling: Scene Asset/Caption membership records
consume the existing maximum of 1,000,000 entity records and 5,000,000 decoded
domain nodes. The superseded `Selected assets per saved view` limit does not
apply because a SavedView stores no membership. Lower practical device/package
budgets require G1-C and physical-device evidence; they do not change these wire
ceilings silently.

`ProjectScene`, `SceneAssetMembership` and `SceneCaptionMembership` join the
mutable entity maps and use lifecycle tombstones. Their map keys equal nested
IDs, records are never array-replaced, and the same nominal ID with another
entity kind or invalid endpoint is rejected. The singleton Project remains
non-deletable. All immutable-record, unknown-field, string, numeric, dangerous-
key and canonical-byte rules in the general v2 contract continue unchanged.

### 3.2 ProjectScene and memberships

```ts
interface Project {
  title: string;
  frame: ProjectFrame;
  defaultSceneId: ProjectSceneId;
}

interface ProjectScene {
  id: ProjectSceneId;
  name: string;
  orderKey: string;
  defaultViewId?: ViewId;
  lifecycle: EntityLifecycle;
}

interface SceneAssetMembership {
  id: SceneAssetMembershipId;
  sceneId: ProjectSceneId;
  assetId: AssetId;
  orderKey: string;
  lifecycle: EntityLifecycle;
}

interface SceneCaptionMembership {
  id: SceneCaptionMembershipId;
  sceneId: ProjectSceneId;
  captionId: CaptionId;
  orderKey: string;
  lifecycle: EntityLifecycle;
}
```

Every editable Project has at least one active Scene and
`Project.defaultSceneId` resolves to one active Scene. An active
SceneAssetMembership is the sole durable authority that its Asset is displayed
in that Scene. A missing or deleted edge means it is not displayed; there is no
second persistent hidden-Asset list. Temporary isolate/hide is local UI state.

At most one active edge may own semantic key `(sceneId, assetId)` and at most one
may own `(sceneId, captionId)`. Multiple active IDs for one key are retained as
a duplicate-key conflict and apply none until the user selects which to keep or
explicitly keeps both as independent resources under section 8. Matching
endpoints never authorize automatic coalescing. Edge collections order by `orderKey`
then stable ID. Reordering one edge changes that edge's atomic order key; it does
not rewrite an array.

An active SceneCaptionMembership may reference an Asset-anchored Caption whose
owner Asset is not displayed in the Scene. The Caption remains in the Scene list
with the ordinary action `モデルを表示`; its 3D marker, connector and placement
hit target are suppressed. The resolver does not delete the Caption or activate
the model. A `ProjectAnchor` has no owner Asset: it stays in ProjectFrame and its
marker is eligible whenever its Caption membership is active, independent of
Scene Asset membership. UI model filters provide one explicit model-independent
bucket rather than inventing an owner.

**M05 bounded connection detail (2026-09-13):** the existing Model tab provides
`隠す` / `表示`, `このモデルだけ表示`, and `すべて表示` independently of
the Scene-membership checkbox. These are local per-Project/per-Scene display
actions, also available to readonly viewers; they do not write membership,
metadata, history, package scope or Saved Views. Hide IDs live only in the open
session's existing UI memory. Scene switching retains each Scene's local choice;
a cold Project reopen starts without temporary hiding.

`このモデルだけ表示` shows the selected, valid included model and hides the
other currently displayable included models. It is a one-shot action, not a
persistent isolation mode: later additions are visible by default. `すべて表示`
clears this Scene's local hide choices; it does not restore a prior hide stack
or add absent memberships. Unavailable/conflicted/deleted models are not
reclassified as temporarily hidden, and their diagnostics remain visible.
An explicit membership re-include clears that Asset's local hide only after the
shared include is acknowledged; a failed include preserves the previous choice.

Keep already loaded residents while changing only their display flags; no body
reload is needed. Visible bounds and explicit fit use the visible subset, but
hide/show never auto-fits or changes the current pose/background/axis. Caption
lists, open windows and unrelated text drafts remain. Asset-owned pins,
connectors and placement hits are suppressed while hidden; ProjectAnchor remains
independent even with no visible models. `モデルを表示` restores an included,
temporarily hidden owner locally; only a genuinely absent membership uses the
existing shared include command. Reject stale/IME/pin/gizmo/camera/competing View
input before changing visibility. Reuse existing planner, recorded DOM, renderer
and limited-GLB host tests for these invariants, readonly use, new additions,
Scene isolation and cold reopen. These are bounded connection checks, not
rendered, physical-iPhone, offline, adoption or TEAM-FLOW acceptance.

### 3.3 Caption, Saved View and material deltas

The v2 `Caption` no longer contains `displaySetId` or an owning Scene field. A
Caption may have active membership in zero, one or multiple Scenes. Its body,
anchor, attachments and tag relationships remain one Project resource and are
not copied per Scene.

```ts
interface SavedView {
  id: ViewId;
  sceneId: ProjectSceneId;
  name: string;
  orderKey: string;
  projectFrameId: FrameId;
  camera: ProjectCamera;
  background: BackgroundIntent;
  lifecycle: EntityLifecycle;
}

interface MaterialOverride {
  id: OverrideId;
  routing: {
    scope: { kind: 'project' } | { kind: 'scene'; sceneId: ProjectSceneId };
    target: {
      assetId: AssetId;
      variantFamilyId: VariantFamilyId;
      materialLayoutId: MaterialLayoutId;
      logicalMaterialSlotId: MaterialSlotId;
    };
  };
  appearance: MaterialAppearanceIntent;
  compositing: MaterialCompositingIntent;
  lifecycle: EntityLifecycle;
}
```

A Scene default must name an active SavedView belonging to that same Scene. A
SavedView stores camera and 3D-background intent only. It does not duplicate
Asset membership, Caption membership, temporary filters or selection.

Material precedence is one exact Scene override, then one exact Project
override, then immutable source semantics. Duplicate semantic keys at either
scope apply none. A Scene override is a whole-record replacement, not a nested
merge with Project intent.

Media has no direct Scene membership in this version. A Scene reaches media
through active Caption memberships and active CaptionAttachment records.

### 3.4 Atomic fields, references and retention

The ProjectScene amendment replaces the affected DisplaySet rows in the general
v2 mutable-field/reference tables as follows:

| Record | Atomic/immutable boundary | Reference and unresolved behavior |
|---|---|---|
| `Project.defaultSceneId` | one atomic required scalar | must resolve to one active Scene; conflict blocks only the shared startup default, never chooses a candidate |
| `ProjectScene` | `name`, `orderKey`, `defaultViewId` and lifecycle are independent atomic fields | missing/conflicted name renders a review placeholder; default conflict leaves free camera unchanged; lifecycle conflict blocks that Scene |
| `SceneAssetMembership` | `(sceneId, assetId)` is one immutable endpoint pair; `orderKey` and lifecycle are atomic | a missing/deleted endpoint applies no edge and is an orphan issue; retargeting tombstones/creates rather than mutating half an endpoint pair |
| `SceneCaptionMembership` | `(sceneId, captionId)` is one immutable endpoint pair; `orderKey` and lifecycle are atomic | a missing/deleted endpoint applies no edge and is an orphan issue; no Caption content is copied into the edge |
| `SavedView.sceneId` | immutable owner edge | moving between Scenes creates a new view and tombstones the old only through an explicit command; a wrong-Scene default never applies |
| `MaterialOverride.routing` | Scene/Project scope and complete target remain one atomic routing field | an inactive Scene/Asset target applies no override and remains reviewable; no partial target is materialized |

Project resource lifecycle, not Scene membership, owns durable whole-Project
bytes. Every active Asset binding strongly roots its required Representation
records/blobs even when the Asset currently belongs to no Scene. Every active
CaptionAttachment strongly roots its MediaResource/blob even when the Caption
belongs to no Scene. Team Workspace, complete backup and clean copy follow these
whole-Project roots; review alone uses the selected-Scene closure in section 7.3.

Every unresolved conflict candidate and protected opaque record/blob stays a
strong root for same-lineage Workspace, Contribution and backup until explicit
resolution and the existing retention/GC contract permit collection. A
membership tombstone removes only that presentation reference. It never deletes
the target resource or makes its bytes collectible by itself. Review and clean
never use CRDT/materialized winners to reduce closure.

Project resource deletion is an explicit dependency plan, not implicit cascade.
A Scene cannot be deleted while it is the Project default, the last active Scene
or is referenced by active memberships, Scene overrides or Saved Views; those
references must be explicitly reassigned/tombstoned first. A Saved View cannot be
deleted while its Scene names it as default. An Asset cannot be deleted while an
active SceneAssetMembership, Asset-anchored Caption or MaterialOverride references
it; the user must remove/re-anchor/tombstone each dependent item first.

Finite M09 implementation boundary (2026-09-12): model deletion checks the whole
raw candidate graph, not the current Scene or visible renderer objects. Every
SceneAssetMembership.assetId, Caption.anchor and MaterialOverride.routing candidate
must be proven unrelated or belong to a resolved deleted record without a concurrent
delete/edit. Unknown or ambiguous potentially related values block deletion and
remain visible for review. Active target identity/lifecycle is required, not a
resolved display/status/name. Confirmation binds the current source token; one
command updates Asset.lifecycle only to userDelete, preserving immutable model
records, facts, original history and bytes. Late references are retained with
review warnings, never silently cascaded. Ordinary dependency removal remains
explicit; this slice does not add restoration, GC or general orphan repair.

Deleting a Caption after confirmation tombstones the named Caption plus every
causally observed active SceneCaptionMembership, attachment and tag membership in
one command; unshared MediaResources become collectible only under the existing
retention rule. Restoring a parent never restores child tombstones implicitly.
A concurrent unseen dependent edge is retained as an orphan/reference conflict
for explicit repair; it is not silently cascaded, and every conflict-required
record/blob remains protected.

Finite C10 implementation boundary (2026-09-12): confirmation binds the source
token and complete observed membership/attachment/tag edge ID sets. All raw
endpoint and lifecycle candidates are checked, including duplicate edges; a
potentially related unknown/ambiguous endpoint refuses the action. Only resolved
tombstones are excluded. The command changes lifecycle alone in one causal
change, so unresolved title/body/anchor/color/order/alt-text need not be selected
first. Confirmation names affected Scenes and attachments; Media/Tag definitions
and model/binary bytes are not deleted. Until durable acknowledgement the old UI
is retained. Remote deletion never silently discards local unapplied input;
retain that input with explicit cancellation and show later reference/delete-edit
issues on reopen. General restoration/orphan repair is not added by this slice.

## 4. Commands and state transitions

Every durable user action below is one validated logical metadata command. The
selected metadata adapter must encode it as one causal change, and commands that
also introduce bytes use the cross-store journal before publishing a new head.
Until S1 explicitly replaces the production storage port after its gate, current
v1/Native edits continue through their existing accepted write authorities.

### 4.1 Session-only Scene selection

- Selecting an active Scene changes `AppContext.ui.activeSceneId` only.
- It does not change Project history, dirty state or `defaultSceneId`.
- On open, a valid locally retained `activeSceneId` is restored. If none exists,
  the exact active `Project.defaultSceneId` is selected. If that required edge is
  missing, deleted or conflicted, the Project enters the defined repair state;
  it never selects the first Scene, an ordered neighbor or a filename-derived
  alternative.
- The resolver derives the complete target Scene from one authoritative Project
  snapshot before the viewer publishes it. Prior-Scene membership/material state
  is never reused as an input.
- After membership/material publication, the Scene's valid `defaultViewId` is
  applied once. A missing/deleted/conflicted default leaves the camera unchanged
  and reports the exact issue. It never substitutes another view.
- Tab identity remains stable. Per-Scene search, filters, list scroll, selected
  Caption and retained-window intent may be remembered locally, never exported.

### 4.2 Scene authoring

A normal new-Project transaction creates one fresh active ProjectScene, sets it
as `Project.defaultSceneId`, selects it locally and adds each explicitly admitted
initial model through an active SceneAssetMembership. The Scene receives the
localized product default name (for Japanese, `シーン 1`) and can be renamed;
the user is not asked to invent a Scene before seeing the Project. It creates no
Caption, material override or Saved View. Content inspection may route a selected
3D model into this transaction, but filename and Representation kind never name
or partition the Scene.

The first bounded authoring surface supports:

- create a Scene with an explicit non-empty name;
- rename one exact Scene;
- explicitly set the Project default Scene;
- include or exclude one exact Project Asset;
- include or exclude one exact Project Caption;
- set/clear one valid same-Scene entry Saved View;
- author Scene-scoped material intent through the existing material target rules.

Creating a Scene takes an explicit `sourceSceneId` equal to the current active
Scene. It copies only that Scene's active Asset memberships, in their resolved
order, under fresh membership IDs. It copies no Caption membership, material
override or default view. This deterministic default preserves LociMyu's useful
"same model, new sheet" starting point without copying records or inferring a
relationship. The confirmation states this result briefly.

Scene selection never changes the default automatically. Scene duplication,
deletion and reorder UI are outside the first bounded UI slice. Domain deletion
must nevertheless reject deletion of the last active Scene and must not cascade
delete Project resources; a later UI requires an explicit dependent-edge plan.

### 4.3 Resource creation, update and removal

- Creating a Caption from a Scene atomically creates the Caption and its active
  SceneCaptionMembership. New placement requires one explicit target model; a
  missed surface, empty Scene or absent model never creates a `ProjectAnchor`.
  Existing/imported Project-anchored Captions remain readable, listable and
  explicitly re-anchorable, but new ProjectAnchor authoring is outside this
  bounded contract. Adding an existing Project Caption creates only an explicit
  membership.
- Editing a Caption changes that one Project resource. When it belongs to more
  than one Scene, the UI shows the affected Scene count before the edit is
  committed or beside the editor.
- `このシーンから外す` tombstones only the exact membership.
  `プロジェクトから削除` is a separate destructive command that names every
  affected Scene/attachment dependency and requires confirmation.
- Adding a model atomically activates its immutable Asset binding and adds an
  active membership to the explicitly named current Scene. It adds no edge to
  other Scenes.
- Replacing a model changes the Project-wide Asset binding after verified blob
  publication. Every SceneAssetMembership remains unchanged.
- Excluding a model from a Scene never deletes its Asset, revisions, bytes or
  Captions. Captions retained in that Scene follow section 3.2.
- Retargeting a membership never edits its immutable endpoint pair. The command
  tombstones the exact old edge and creates the exact new edge as one logical
  change after validating both endpoints.

No command matches or reuses a resource because of filename, label, digest,
byte equality, proximity, bounds, transform similarity, array position or load
order. Exact stable ID or explicit source-authoritative conversion evidence is
required.

### 4.4 Explicit pin parent changes (PO-approved 2026-09-13)

The PO adopted one `親モデルを変更` operation for an existing Asset-anchored
Caption to another Asset and for an existing/imported ProjectAnchor to an Asset.
This extends explicit re-anchoring beyond same-owner movement; it is not model
replacement, a Scene move, automatic relation matching or new ProjectAnchor creation.
Bounded connection (2026-09-13): the metadata/limited GLB validation hosts expose
the separate `reparentPin` command; ordinary `movePin` remains same-owner only.
The memory preview host also connects it; old fixed-owner history hosts do not.
Current executed evidence is in todo. Browser/native-input/iPhone and ordinary
route adoption are not implied by this connection.

Select a Caption, choose the new parent explicitly, preview its position, adjust
with the existing gizmo or verified model-surface input if needed, then confirm
or cancel. Put the entry next to `位置を調整`, not in Scene management. Parentless
but placed Captions use the same entry. Do not require numerical coordinates as
the sole placement method, infer a target from proximity/name or create a new
Caption as a replacement for changing the existing one.

When the old Project-space position is authoritative, preserve that displayed
position by converting it into the explicitly selected target's local frame:
`pTarget = inverse(targetToProject) * pProject`. For an Asset anchor, obtain
`pProject` from its verified source placement; for a ProjectAnchor use its
validated Project-frame position. Require a valid invertible target placement
and exact current target binding/placement eligibility. This coordinate conversion
does not infer model equivalence, snap to a surface or itself confirm the edit.
Validate the new anchor's frame, compatibility and manual placement evidence
against the selected target; never copy these assertions from the old parent.
If the old position cannot be reconstructed, disclose that fact and require the
user to choose a new position; never invent an origin or a successful preview.
Conflicting/invalid anchor authority uses existing conflict/recovery first.

Confirm writes the complete new Asset anchor in one explicit metadata command
through the existing session/journal. Keep the Caption ID, title/body/color,
attachments/tags and every SceneCaptionMembership; preserve the old anchor in
causal history. Do not edit model placement or SceneAssetMembership. Before
confirmation show the affected Scene count: the same Caption's parent changes
in every Scene, and where the new parent is absent its existing list-only rules
apply. Do not automatically show the model in those Scenes.

Preview/draft is local; cancellation changes no shared data. Failed writes keep
the old published state and retry the original proposed change/IDs exactly.
Readonly, stale source/target placement, concurrent drafts/IME and in-flight
writes use existing guards. Concurrent parent/position changes retain complete
anchor candidates; never merge one parent's ID with another candidate's position.

Implementation/acceptance: first add the explicit command and coordinate planner
for the current Asset/Project anchor union, then connect the existing pin form,
gizmo and saved host; reuse current tests for A-to-B and Project-to-Asset, rotated/
scaled frames, unavailable source position, explicit placement/cancel, multiple
Scenes, stale/conflict rejection, failure/retry/cold reopen and team re-receive.
Native input/browser/iPhone evidence stays in the consolidated acceptance batch.
No new schema, file format, general parent removal, bulk reassignment or new page
is authorized by this operation. Genuine unplaced records retain §9.4's separate
schema/migration dependency; the §12.6 review-package mapping in specification 06
is not ratified by accepting this user-facing operation.

The existing pin controls disclose a destination selector under `親モデルを変更`,
beside `位置を調整`. `位置を確認` starts the local proposal; the existing surface/
gizmo path and `親モデルと位置を確定` finish it. Destination selection starts empty,
and source changes invalidate both late selector input and prepared coordinates.
The dedicated authority never infers this intent from ordinary anchor edits.
Only `captionsById[id].anchor` changes; metadata read derives its current owner.
No copy identity, Scene edge or model binding is rewritten.

## 5. Authoritative Scene resolution

The derived renderer-neutral `SceneDocument` is distinct from the persistent
`ProjectScene` and from a renderer's own scene object.

Given one authoritative metadata snapshot and one explicit active Scene ID, the
resolver:

1. validates the Scene lifecycle and every relevant conflict set;
2. selects active, non-conflicted Asset memberships and resolves each Asset's
   Project-wide active binding and Representation contribution;
3. selects active, non-conflicted Caption memberships, preserving list entries
   whose owner Asset is not displayed while suppressing their markers;
4. resolves material intent independently for every exact target using the
   precedence in section 3.3;
5. exposes the optional valid entry view without applying it recursively;
6. returns diagnostics and repair actions for every excluded unit.

The resolver never renders a metadata library's materialized conflict winner.
An unresolved active-binding conflict excludes that Asset from every Scene's
authoritative render/edit/export projection while preserving all revisions,
memberships, Captions and blobs. An unresolved membership conflict excludes only
that `(Scene, resource)` edge. An anchor conflict suppresses only that pin. A
material conflict suppresses only that override. A default-view conflict leaves
the Scene composition usable and the free camera unchanged.

If the requested Scene itself is missing, deleted or conflicted, the UI keeps
the previous valid Scene and publishes no partial replacement. A resource or
blob failure inside a valid Scene preserves the safe remainder and names the
affected model/record; it never chooses an alternative resource.

## 6. Causal team history

### 6.1 Lineage and editable scope

Continuing team work uses one verified Project identity/history epoch and a
causal head set. All users open the same Project model and may use every normal
Edit capability; there is no separate restricted contributor schema or hidden
Caption-only branch.

Every durable command preserves its exact causal dependencies. Two integrators
publishing from one base create detectable divergent heads. Wall-clock time,
display name and package arrival order are provenance hints only.

The package records a machine-verifiable package ID, Project identity, verified
adapter/root proof, base heads and target heads. An optional human memo/label is
allowed. A deterministic automatic summary of changed entity/field classes and
new blob counts is mandatory and is recomputed/verified from the exact change
set; it is not identity, authorization or a substitute for conflict inspection.

### 6.2 Contribution change set

A Contribution base is one exact, locally retained exchange-base record naming
the heads declared by a Team Workspace that the intended receiver is expected to
hold. For a Project opened from a Team Workspace, that Workspace establishes the
initial record. A coordinator may retain the exact heads of a Team Workspace it
generated as an available distribution base, but generation alone never proves
which recipient received it.

Export includes the complete dependency-closed set of changes reachable from
current local heads but not from the explicitly selected exchange base. Users
cannot omit an inconvenient change or manually choose a supposedly mergeable
subset. Importing a Contribution may add sibling heads to the local Project, but
does not advance any exchange base: the intended receiver is not thereby known
to possess either the incoming sibling or the user's earlier local changes.
Consequently both remain in the next export when neither descends from the
selected base; a receiver that already has one sees its hashes as no-ops.

Exporting cannot prove receipt and therefore does not mutate Project history or
silently advance a base. A newer verified Team Workspace contributes its own
declared heads as a separate selectable base; the heads produced by merging it
with local-only work do not replace that record. Re-exporting the same base/head
may reproduce the same change hashes; import is hash-idempotent.

The exact delta is `reachable(current heads) - reachable(base heads)`. A current
head may be a sibling rather than a descendant of each base head: it is valid
when every included change dependency is either in that delta or already in the
verified base closure. This is ordinary causal integration, not a history rewrite
or automatic rebase. If the base is absent locally, has the wrong lineage, or the
subtraction leaves a dependency in neither closure, export stops and offers
another retained base or a full Team Workspace. No filename, most-recent import
or current merged-head shortcut selects a base.

Exchange-base records are durable workspace-local state keyed by exact Project
identity/history epoch and Team Workspace package ID. Each retains the verified
manifest digest, its exact declared head set, whether that Workspace was imported
or locally generated, and an optional bounded human exchange label. They are not
ProjectDoc changes, do not merge between participants, contain no filesystem
path and make no receipt/authentication claim. They survive ordinary reopen.
Complete backup includes and discloses them for same-Project workflow recovery;
Team Workspace, Contribution, review and clean copy exclude them. If the records
are missing, stale or conflict with the restored Project identity, the UI cannot
reconstruct them from current heads or filenames and offers a new Team Workspace
base instead. Section 7.5's package companion must define their exact local wire,
head grammar, limits and atomic update point before S2.

## 7. Package purposes and closure

The future v2 manifest is a closed discriminated union with five purposes. The
exact entry encoding remains conditional on the streaming/hash gate, but each
purpose must have its own discriminator; changing a filename never changes it.

| Purpose | Identity/history | Required content | Import result |
|---|---|---|---|
| complete backup | same Project, exact local durable history | complete protected metadata/blob/migration closure plus disclosed workspace-local exchange-base records needed for workflow recovery | restore the same Project through explicit recover/replace choices; never silent overwrite |
| Team Workspace | same Project and mergeable causal history | self-contained current/conflicting/opaque metadata and every required blob | start or update editable work without selecting source models |
| Contribution | same Project, exact base/target heads and change bytes | dependency-closed `reachable(current heads) - reachable(base heads)`, including valid siblings, plus blobs newly required relative to that base | merge into an existing verified base; never standalone restore or rewritten rebase |
| review/share | no source lineage/history | allowlisted closure of one explicit Scene | open in View first; never merge to source |
| clean copy | fresh Project/epoch/root | complete current editable whole-Project state under re-keyed identity | open as an independent editable Project |

### 7.1 Team Workspace

A Team Workspace contains enough verified metadata, history proof and blob
closure to start without any other file. It includes every active or conflicting
resource needed by the current Project and every protected opaque blob when an
older writer cannot prove reachability. It excludes device-local UI state and
does not claim authentication.

### 7.2 Contribution

A Contribution contains original change bytes with their exact dependencies and
only blob bytes not guaranteed by its verified base. A Caption-only contribution
therefore neither reads nor re-embeds an unchanged large model payload. A model
revision contribution contains the newly required model/derivative bytes once,
but not unchanged prior GS bytes.

The receiver requires the declared Project identity/root proof, every base head,
every change dependency and every new required blob. A missing base/dependency or
blob, wrong lineage, corrupt byte or over-budget batch fails before metadata
activation and requests a Team Workspace or exact repair.

### 7.3 Review/share

The user explicitly selects one durable Scene. The preflight names that Scene and
shows included model, Caption and transitive media counts plus original metadata/
label disclosure. Search text, pin colors, temporary windows, free camera,
selection and local isolate never change closure.

The builder includes the selected Scene, its active Asset/Caption memberships,
required active Asset bindings/Representations, applicable material intent, the
Scene's active Saved Views and media reached through included Captions. It re-keys
every included nominal ID and omits source lineage, history, migration support,
deleted values and contributor identity. It never claims EXIF or embedded model
metadata sanitization. A future sanitized purpose requires a separate contract.

An included Asset-anchored Caption whose owner Asset is active in the Project but
not a Scene Asset member retains its anchor against a re-keyed minimal nonvisual
owner record containing only the Asset/AssetFrame identity and transform evidence
needed for referential integrity. It pulls no Representation payload, creates no
Scene Asset membership and remains list-only with its marker suppressed. It is
never rewritten to a ProjectAnchor. The package-wire companion fixes that owner
record schema and disclosure before S2.

The selected Scene lifecycle and every membership, included resource lifecycle,
required active binding, included Caption field/anchor, applicable material and
required blob must be authoritative. An unresolved conflict or missing required
value in that closure blocks review generation and names the affected item; it is
never resolved by a library winner or silent omission. A conflicted optional
entry view may be omitted only after the preflight explicitly states `開始視点なし`
and the user confirms that exact degradation; the re-keyed selected Scene then
becomes the review snapshot's sole default. Conflicts elsewhere in the Project
do not block review. A future rule that omits any other affected optional closure
requires its own allowlist and disclosure acceptance.

The review wire remains an immutable, nonmergeable snapshot and opens in View.
If its recipient later chooses to edit, LociView explicitly creates a new clean
Project/lineage from that one-Scene closure before the first edit. It never turns
the review package into a branch of, or Contribution to, the source Project.

### 7.4 Complete backup and clean copy

Complete backup remains exact same-Project recovery and carries every protected
whole-Project Scene/resource/history requirement plus the workspace-local
exchange-base records defined in section 6.2. It excludes ordinary transient UI
state and discloses that the exchange records are workflow hints, not proof that
a recipient received a file. Clean copy constructs a fresh
genesis for the full current Project, including all active Scenes/resources,
under a new Project/epoch/root and re-keyed IDs. It contains no source history or
migration continuity and cannot merge back. Clean copy blocks unresolved included
semantic conflicts rather than selecting or omitting a winner.

### 7.5 Mandatory package-wire gate before S2

**PO-approved gate-order amendment (2026-09-13, after `1edc3f5`):** the new
package reader/writer may be implemented in the existing isolated validation
path after the complete five-purpose implementation contract and independent
review are fixed. Executable/golden and measured device evidence are obtained
there before ordinary-route activation and formal profile/budget adoption.
This approves the staged order proposed in 06 §11, not its entire proposed
wire/schema or the separate review-to-edit amendment in 06 §12.6. All acceptance,
source preservation and separate migration/release decisions remain. The
pre-first-byte requirements below now govern the complete implementation
contract; they do not demand new-runtime measurements before that runtime exists.

The semantic purpose discriminator is closed to
`teamWorkspace | contribution | review | backup | clean`; an implementation may
not encode these as the old `collaboration` kind plus filename or UI state.
Before S2 writes or accepts one byte, a versioned package companion must ratify:

- the exact manifest union and canonical encoding for all five discriminators;
- sorted, unique adapter-native base and target head sets and their grammar;
- exact change descriptors, dependency closure, blob delta and manifest binding;
- the fresh-CSPRNG package ID, mandatory verified automatic summary and optional
  bounded memo fields without treating either label as merge authority;
- a self-contained Team Workspace/backup metadata envelope, a base-dependent
  Contribution envelope, a fresh-lineage clean envelope and the exact one-Scene
  review snapshot schema;
- resource budgets, stream order, container-signature/content inspection,
  privacy roots, interruption recovery and golden valid/invalid vectors.

The former `PackageManifest` and `LociReviewSnapshotV2` in
`02-storage-package-migration.md` remain superseded for the ProjectScene writer;
they are not silently widened. This specification authorizes the bounded wire
design/gate, not package production code or a package version.

## 8. Conflict import and resolution

A structurally valid same-lineage Contribution may introduce semantic conflicts.
The receiver stages and verifies new blobs and the complete change batch, then
atomically publishes the exact history even when authoritative projection of an
affected unit must stop. The import result distinguishes `changes integrated,
review required` from invalid-package failure.

At minimum the adapter/resolver distinguishes:

| Conflict | Authoritative effect before resolution |
|---|---|
| different Caption fields | merge independently |
| same Caption scalar/anchor | retain candidates; block only that field/pin |
| Scene/Asset or Scene/Caption membership | retain edges; block only the semantic edge |
| Project default Scene | keep local valid active Scene; block shared startup default |
| Scene default Saved View | keep Scene; do not apply a default |
| Scene name/order | retain Scene with explicit review placeholder/order conflict |
| Material routing/appearance/compositing | apply no conflicted override |
| concurrent Asset active binding | display no candidate as authoritative in any Scene |
| lifecycle delete versus edit/restore | exclude affected entity and preserve dependent orphan review items |
| same immutable ID, different payload | invalid/tampered input; quarantine or reject before activation |

Resolution is one explicit causal command after all candidate changes. It
selects one complete candidate, writes a manually combined valid value, or uses
the explicit membership keep-both operation below. The UI
does not automatically make a duplicate alternative. Every losing candidate and
its provenance remain in history. Only labelled read-only preview may show a
candidate before resolution.

A duplicate membership-key conflict is resolved by the user's explicit choice:
keep a named candidate or keep both. Do not coalesce even equal endpoint pairs
automatically. Before confirmation show the affected Scene, resources and all
candidates; neither arrival order nor an ID sort chooses for the user.

- Keep one: retain the selected exact edge ID and tombstone the other observed
  active IDs for that semantic key. Losing candidates remain in history.
- Keep both: retain the candidate explicitly confirmed as continuing the original
  resource and create a separately editable resource for each other selected
  candidate. The preflight identifies original versus copy and the original's
  other-Scene references; this assignment must not be hidden in a default winner.
  The new resource belongs only to the conflict's Scene. Other Scene references
  and other resources are not silently redirected or copied.
- For a Caption copy, use fresh Caption, attachment and tag-membership IDs;
  preserve the confirmed content/anchor and reference the same immutable media
  and Project tag definitions. Later text, anchor and attachment edits are
  independent. This never infers or changes the anchor's model ownership.
- For a model copy, allocate a new Asset and AssetFrame and rebuild the confirmed
  active editable revision/binding/Representation closure with new nominal IDs
  and metadata digests. Preserve numeric frame/placement and internal source/
  proxy/compatibility relationships through an explicit complete remap. Reuse
  verified immutable payload bytes through BlobStore; do not duplicate large
  blobs or introduce a second active revision of the original Asset. Re-key the
  confirmed effective material intent for the copy in this Scene. Existing
  Captions remain attached to the original model and are not copied/re-anchored.

Keep-both retains the confirmed original edge, tombstones every other observed
conflicting edge and creates one new edge/resource per other selected candidate
as one causal command, leaving one active edge per `(Scene, resource)` key. The
command carries all chosen candidate IDs and the complete fresh-ID/reference map;
retry/replay uses that same command rather than minting additional copies. All
dependencies and required bytes must validate before publication. An unresolved
required resource field, invalid remap, quota or failure leaves the previous
published state/candidates available; it never publishes a partial copy.

This bounded independent-copy operation is the Scene membership conflict action,
not a general Scene duplicate tool. Other conflict types keep their typed
choose/manual-combine resolution; a scalar/default pointer cannot store two
values by exposing an unimplemented keep-both action. The command depends on
every observed candidate. An unseen concurrent edge remains detectable and
reopens the conflict; no automatic winner or automatic duplicate is introduced.

## 9. Migration

**PO-approved one-time cutover (2026-09-14; supersedes later-old-input clauses):**
convert the selected old source into a new Project, then use and distribute that
Project's files for all subsequent work. Initial Native/frozen-v1/LociMyu reading,
faithful value/payload mapping and source preservation remain required. Continued
old-format updates into the converted Project and their dedicated bridges are
withdrawn, not deferred. New-format team history/recovery remains unchanged.

ProjectScene migration uses a new immutable companion recipe,
`v1-project-scene-migration-recipe-1`. It does not reinterpret, amend or emit
new output under `v1-migration-recipe-1`, whose `display-set`/`set_` output and
golden vectors remain closed. Before S2 implementation, the new recipe must
ratify every canonical source key, domain-separated preimage, full digest,
collision check, output kind and golden byte/hash vector. Until that companion
passes its gate, durable ProjectScene conversion remains disabled.

The [07 one-time migration companion](07-project-scene-migration.md) owns the
reduced initial-conversion boundary. Its previous late-update control maps,
common legacy ancestors and parallel-introduction protocol are superseded, not
mandatory prerequisites for initial conversion. Concrete source mapping and any
necessary target-format changes still precede implementation.

Every admitted Native/frozen-v1/LociMyu model and media payload is retained
byte-for-byte under a verified digest and byte length, either by safely reusing
the same immutable local blob or by streaming an exact copy into the v2 store.
Migration never re-encodes, normalizes or edits a payload to satisfy the new
schema. Every unavailable, unsupported or intentionally unlinked source payload
is counted with its source-authoritative reason and output impact; it is never
silently omitted or replaced. The source container and current Native bytes stay
unchanged whether conversion succeeds, fails or is cancelled.

### 9.1 Native snapshot 1 / DisplaySet

Conversion writes a new v2 Project and never extends or rewrites Native schema 1.

- each effective DisplaySet becomes one ProjectScene and preserves its name,
  order and valid default Saved View relation;
- each Caption becomes a Project resource plus one SceneCaptionMembership for
  its exact effective DisplaySet;
- each set-scoped material record becomes a Scene-scoped override;
- each Saved View receives its exact owning Scene;
- the conversion-time effective visible Asset set (`assets` minus durable global
  hidden IDs and after exact supported-mode resolution) becomes active
  SceneAssetMemberships in every converted Scene;
- hidden Assets remain Project resources without those memberships;
- the exact persisted active DisplaySet initializes `Project.defaultSceneId`;
  subsequent active Scene selection is local UI state;
- an old presentation that cannot be represented without guessing a partial
  Representation-kind relationship stops with a conversion issue instead of
  manufacturing Scene membership.

DisplaySet-free older Native data materializes one deterministic fallback Scene.
All converted IDs use the migration registry and full collision checks.

### 9.2 LociMyu

Each admitted Caption sheet becomes one ProjectScene. The one exact
source-authoritative model becomes a logical Asset with active membership in
every Scene. Each Caption receives membership in its source sheet's Scene.
Material/default-view relations activate only from the exact or explicitly
confirmed GID relationship defined by `04-locimyu-conversion.md`. Media remains a
Project resource reached through exact Caption attachments.

The current `locimyu-caption-id-2` result is a frozen Native/v1 `cap_` plus an
uppercase Crockford value and is not a valid v2 CaptionId. The new ProjectScene
recipe therefore retains that source ID and its full 32-byte identity digest as
source evidence, then registers a separate deterministic lowercase-hex v2
CaptionId through the migration registry and full collision check. It never
rewrites the Native ID, truncates it again without checking the full source key
or treats the source ID as already-valid v2 wire data. The new recipe companion
must fix the exact preimage and golden mappings before writes.

Google Drive identity, filename adjacency, sheet order, similar material names,
single-model global state and ambiguous relation inference are not migrated.
Inactive/unlinked source relationships remain accounted for in the unchanged
source ZIP plus exportable report.

### 9.3 Frozen v1 and the post-migration cutover

Frozen v1 conversion creates deterministic Scene/membership records through the
new `v1-project-scene-migration-recipe-1` companion and remains distinct from
LociMyu conversion. The companion consumes the frozen source evidence directly;
it does not treat closed `v1-migration-recipe-1` DisplaySet output as if it were
a ProjectScene.

The converted Project supplies the team through one Workspace. Later Native or
frozen-v1 changes are not a supported update to that Project, even if old IDs,
names or baselines match. Explain that subsequent work uses the converted file;
do not silently import, overwrite, merge or create a second Project on rejection.
A separate explicit conversion is independent, not a way to bypass that boundary.
No fixed-baseline bridge registration, mapped legacy ancestor or managed old-input
control graph is required solely for continuing cross-format updates.

### 9.4 Unplaced Caption preservation (2026-09-10)

> `PO-APPROVED OUTCOME / MAP-2 AMENDMENT APPROVED 2026-09-20 / BOUNDED IMPLEMENTATION`
>
> [07 §5.1](07-project-scene-migration.md#51-reduced-target-amendment--po-approved-2026-09-20-bounded-implementation)
> fixes the accepted version binding. Map-2 now connects unplaced records to
> list/text/media, explicit first placement, saved commands and review/clean/file
> preservation. Executed checks are in [todo](../../tasks/todo.md). Map-1 is
> unchanged; initial-conversion recipes, ordinary entry and browser/device
> adoption are not completed by this implementation. The gap below describes
> the pre-amendment map-1 boundary, not a remaining map-2 schema decision.

There is a real source/target representability gap, not a new failure in the
current Native path. Native `NativeCaptionV1` permits `anchor: null` with a known
or absent `ownerAssetId`. Specification 02's bounded Native receiver keeps these
Captions editable, and specification 04 §4.3 preserves a valid Caption with an
invalid coordinate as active/unplaced. In contrast, the current v2 Caption
contract and `src/domain/projectMutableFields.ts` require an anchor accepted by
`ProjectRecordFields.anchor`: only `asset` or `project`, both with coordinates.
The current target has no authoritative unplaced state. A conversion recipe
cannot fix this by inventing coordinates, choosing a model or deleting the Caption.

PO approved: preserve an unplaced Caption as an active list item with
its text, supported media, tags and exact Scene memberships; show `未配置` and no
3D marker until an explicit placement command. Retain any source-authoritative
known owner without requiring a position; an absent owner remains absent. Do not
turn an unknown/conflicted placement into an ordinary unplaced state or infer a
ProjectAnchor. This closes the product question, not approval of an exact schema,
migration recipe, real-file activation or expanded media support.

#### 9.4.1 Atomic representation and placement (map-2 approved)

Extend the existing atomic `Caption.anchor` union by exactly:

```ts
{ kind: 'unplaced'; ownerAssetId?: AssetId }
```

The object is closed. An absent owner is omitted, not `null`; coordinates, frame,
revision, compatibility, normal and hit evidence are forbidden in this branch.
The optional owner comes only from validated source authority or an explicit
accepted operation, never filename, model count, geometry or current selection.
It is a strong logical ownership reference, including in conflict candidates:
retain its Asset and the Asset's ordinary required closure. Rendering an unplaced
Caption does not load that closure's model bytes or require a binding/transform.
Missing/deleted/conflicted owners remain reportable; do not erase the reference,
silently cascade-delete the Caption or describe that case as ordinary ownerless.
This unplaced-schema amendment itself adds no general unlink/reassign-owner
command. The later, separately approved §4.4 adds explicit parent reassignment
for already placed Asset/Project anchors; it does not activate this unplaced union.

| State | List and editing | 3D / recovery |
|---|---|---|
| Authoritative unplaced | Editable text/media/tags and exact Scene memberships; `未配置` | No marker/connector; explicit first placement |
| Placed, owner hidden or absent from Scene | Retain placed anchor and record | Existing reveal/missing-model route, not a new placement |
| Placed, compatibility needs review | Preserve authored position/evidence | Existing `needsReview` route; no automatic rebind |
| Missing/invalid/conflicting anchor or owner | Preserve source and all valid candidates; report affected state | Repair/explicit conflict resolution, not unplaced fallback |

First placement updates the existing Caption ID, not a newly created Caption.
A known owner restricts verified surface placement to that Asset. Without a
known owner, the user's unique verified surface hit supplies the owner; ambiguity,
stale scene/transform, miss or unavailable model cannot confirm. Position gizmo
and explicit confirm/cancel follow the existing pin workflow. Confirm replaces
the whole anchor atomically with a valid Asset anchor. Cancel/failure preserves
the original anchor, text/media/tags and memberships. No ProjectAnchor fallback.
Concurrent placement/owner changes retain whole anchor candidates, never combine
one candidate's owner with another's coordinates. Concurrent unrelated text/media
edits still integrate normally. `両方残す` allocates independent Caption and owned
attachment/membership IDs under §8, copies the chosen anchor unchanged and follows
existing tag/media sharing rules; later placement of either copy is independent.

#### 9.4.2 Proposed one-time conversion mapping

The new recipe companion in §9.1 must record exact source Caption/owner mappings,
the exact source placement value and immutable source evidence separately
from the editable target anchor. Do not extend or reinterpret the closed old
recipe or `MigrationSupportV1`.

| Admitted source | Exact target mapping |
|---|---|
| Native `anchor: null`, authoritative owner | Unplaced with the mapped owner ID; no invented frame/position/revision |
| Native `anchor: null`, owner absent | Unplaced without owner; no synthetic Asset |
| LociMyu invalid coordinate allowed by 04 §4.3 | Preserve active Caption, issue report and exact sheet/model authority; map to unplaced under the new recipe |
| Positioned source | Existing exact positioned-anchor mapping; never downgrade because model is hidden |
| Conflicting/invalid source authority outside the admitted conversion rule | Preserve/report; do not select a winner or convert corruption to normal unplaced |

Native owner and anchor form one validated source placement tuple during initial
conversion. Preserve its exact meaning; do not synthesize cross-product candidates
or serialize a winner for an unresolved source tuple. Interrupted conversion
reuses its frozen destination and original generated bytes. A completed retry
must not reset edits made later in the new Project. Further old-format updates
are unsupported rather than mapped to new anchor changes.

Team Workspace and backup preserve unplaced values, candidates and their required
initial-conversion evidence. Contribution sends exact base-relative changes
and newly required evidence/payloads; placement-only edits do not reread unchanged
model bodies. Review includes every active Caption of the selected Scene even if
unplaced; clean includes all active Project resources. Both history-free purposes
re-key known owners, preserve absent owners, and omit source/history
evidence. Neither adds Scene-model memberships. Minimal nonvisual owners and
review-to-clean mapping are specified in companion 06 §5.1.

#### 9.4.3 Finite acceptance and implementation boundary

Reuse source conversion, conflict, keep-both and export/reopen fixtures; add only
the cases needed to distinguish known-owner/ownerless unplaced, malformed versus
normal state, first placement confirm/cancel/failure, unrelated text integration,
concurrent new-format placement candidates, completed-conversion retry after new edits,
independent copy placement and five-purpose closure/privacy. Include an unplaced
Caption whose owner is unresolved and one with no Scene membership. Expected
results are exact preserved IDs/content/membership within a lineage and typed
re-keying for history-free output, not merely a count of visible markers.

This is a proposed technical amendment requiring independent review and inclusion
in the schema/recipe/wire ratification package. Current record admission still
accepts only positioned anchors. ProjectScene real-file conversion remains gated;
current Native reader/writer and the synthetic host are unchanged by this text.

## 10. Atomicity, interruption and recovery

Local commands and remote batches use the existing v2 cross-store journal
contract: verify/stage new blobs, prepare exact detached metadata change bytes,
apply without changing dependencies, verify expected final heads and publish one
complete authoritative snapshot. No intermediate prefix is exposed to another
tab, export or renderer.

- cancellation, quota failure, missing bytes, hash mismatch or dependency failure
  leaves the prior published heads authoritative;
- restart resumes or quarantines one exact journal idempotently;
- a semantic-conflict batch publishes all verified history at once and marks only
  affected projection unavailable;
- replay of an already present change hash is an explicit no-op;
- output failure never labels a package retained merely because generation or a
  browser download started;
- residual staging/destination artifacts are named with a recovery/cleanup path.

Pure validation of an owned immutable metadata source may be retained within that
source instance. Repeated `read()`/token access reuses the deeply frozen result;
editing, appending or reopening a source validates a new instance. This is not a
storage cache: journal/publication, original bytes, content receipts and body
presence remain freshly checked at their existing persistence/output boundaries.
Acceptance includes immutable returned data, distinct edited/reopened snapshots,
and continued rejection of missing/corrupt durable data after a successful read.
Filesystem listing retains the existing sorted lexical `startsWith(prefix)`
result, including partial names and empty-prefix full listing. OPFS traversal
must not descend into unrelated directory branches for a scoped query. Each call
still observes current entries and propagates errors from the relevant subtree;
this optimization neither caches directory contents nor changes stored paths.

## 11. UI contract

The Desktop workspace retains four tabs: `キャプション`, `モデル`,
`マテリアル`, `視点`. Scene is a cross-tab context in the shared header,
not a fifth tab or a rendering mode.

- Caption: current-Scene list, direct pin-color filters, Project Caption picker,
  add/place/move, selected details and multiple floating windows.
- Model: all Project models with `このシーンに表示`; placement,
  alignment and replacement are clearly Project-wide.
- Material: `このシーンでの見え方`, with exact model/surface target.
- View: free camera plus Scene-owned Named Views and explicit
  `シーンを開いたときの視点` selection.

Placement, pin movement, model gizmo and unresolved text input provide a nearby
finish/cancel path. A Scene switch is disabled only while that transition would
discard an uncommitted modal/gizmo value; the UI names the reason and action.
Ordinary dirty Project changes are neither saved nor discarded by switching.

The iPhone layout presents the same capabilities and decisions through reflow:
Project/save state, always reachable Scene selector, 3D stage, then the same four
tabs. It preserves IME input, selection/list position, failure state and mode exit
under the software keyboard. It is not a reduced contributor mode.

Revision/base/head/internal hashes remain hidden in ordinary idle UI. Model
replacement, `needsReview`, conflict, package preflight and recovery reveal only
the concise consequence/action first, with technical evidence under details.
Team-file preflight distinguishes all five purposes, the current whole-Project
or one-Scene scope, the selected exchange base when required, every unsent change
class and newly required byte total. A generated-Workspace base is labelled as
valid only for a recipient of that exact Workspace; the UI never claims receipt
or advances it merely because export completed.

### 11.1 Bounded local View/Edit connection (2026-09-13)

P07's first new-path connection is the opt-in static-GLB/PNG validation workspace,
not ordinary home, the synthetic metadata host or review-package conversion.
An existing Project can be opened deliberately with `閲覧で開く` without asking
for or holding a write lock. `編集で開く` / `編集を開始する` must obtain the
existing Project lock and reload durable state before enabling commands. Lock
unavailability leaves View usable, with a reason and explicit retry action;
there is no automatic lock promotion, role/ACL or shared-data URL.

Switching retains the same Session, viewport and Scene-local camera/window/filter
memory. Draft, IME, drag, in-flight or failed Edit work blocks a switch. During
asynchronous handoff, UI input and facade mutations are blocked. The candidate
host must finish its durable read, display preparation and current-Scene
validation before replacing the old host; publication failure rolls back to the
old read host. Do not silently select another Scene. Release the old host only
after successful publication; failed/late candidates release their own lease.

View may request Edit for a pending journal so explicit recovery remains
reachable. Such a host is recovery-only, not ready for ordinary editing. View
never writes creation, metadata, binary or recovery state; controls alone are
not the guard. No file has been saved by changing mode or retaining browser data.

Acceptance reuses existing limited-file/recorded-DOM and multi-tab-lock tests:
deliberate View plus a separate editor, durable Edit handoff, lock/read/display
failure fallback, retained Scene/camera/windows/filter, pending-input refusal,
explicit recovery and disposal of late candidates. Actual browser and physical
iPhone evidence remains in the consolidated acceptance batch.

### 11.2 Bounded Caption-window size input (2026-09-13)

C09 connects the existing Scene-local `WindowRect`/`place` intent in the same
comparison windows. A corner handle offers pointer resizing and arrow-key
adjustment; activating it without dragging cycles preset sizes. This is a local
viewing operation available in View as well as Edit, not a Project write, Saved
View layout, Caption selection, pin move or media transformation. Keep the
existing muted panel treatment, short accessible name and visible focus/press.

During a pointer gesture only the displayed rectangle changes. Pointer release
commits one current placement; Esc, cancellation, capture loss, stale source/
Scene/selection, viewport extent change or disposal restores the last accepted
size. A drag must not also activate the non-drag preset. Reuse the existing
window-pending guard to block conflicting Scene/model/pin/P07 operations.
Other pending input blocks starting an adjustment and is never discarded.

Keep each card, body/media nodes and body scroll mounted during adjustment;
repaint the connector from its new displayed edge. Preserve other windows,
selected Caption, source token/history and Scene-local size across Scene return.
Shrinking the viewport clamps display only, without overwriting the preferred
size; enlarging it restores that preference. Interactive sizing must leave the
header/close action and scrolling content usable. CSS-pixel minima/presets are
layout defaults, not ratified device/capacity guarantees.

Reuse the window connection/state and saved-host tests for pointer/key/preset,
cancel/stale/late/dispose, retained DOM/content/memory and readonly/P07 refusal.
Recorded DOM does not emulate native capture, text-range selection, raster or
touch. Their real-browser/physical-iPhone checks stay in the consolidated batch;
this does not activate ordinary home or imply complete team-flow acceptance.

### 11.3 Bounded initial pin-color connection (2026-09-13)

C04 adds `追加色` beside the existing add action, using a native color control
and the established muted styling. Store its selected hex color in Scene-local
pin-mode memory, independently of list color filters, selected Caption edits,
Saved Views and Project history. Scene return and same-Session View/Edit handoff
retain it; cold Project reopen uses the existing default, not a new user setting.

Capture the operation's initial color at `beginAdd`, or at direct `add` for
Shift/surface/numeric entry. A later target selection must not recapture it.
Pending placement/move, other input/IME, readonly and in-flight/failed updates
block color changes; stale Scene/source input cannot change the new target.
Cancellation clears only the operation capture, not the next-add preference.
Existing-pin movement does not recolor it. Do not reset filters when an added
color is hidden: use the existing explicit filtered-result notice/reveal path.

Pass the captured color through the existing internal `addPin` command as its
optional `colorSrgb` field. Omission retains the existing default for callers;
an explicitly supplied value must pass the existing three-component finite
0..1 color validation. Create Caption, membership and initial color in one
original change, never a subsequent recolor. Source schema, old wire/receipts
and existing Caption records do not change. Failure/retry retains the original
color, IDs and change bytes; no success is shown before the existing acknowledgment.

Acceptance extends the current pin-mode/workspace/viewport and metadata/file
tests: repeated chosen-color addition, Scene return, ordinary/Shift placement,
cancel/move/filter independence, stale/busy/readonly/invalid rejection and exact
retry/cold reopen. Recorded DOM and memory ports are not native color-picker,
touch, rendered contrast or iPhone evidence; keep those in the existing batch.

## 12. Acceptance

### 12.1 Scene/domain

- `SCN-DOM-01`: two Scenes with different Asset/Caption memberships, material
  intent and entry views switch A -> B -> A without one frame of cross-Scene
  leakage. Scene selection adds no metadata change and preserves Project dirty state.
- `SCN-DOM-02`: an active Asset membership is the only durable visibility
  authority. Temporary filter/isolate never changes metadata or package closure.
- `SCN-DOM-03`: one Caption referenced by two Scenes retains one ID/content;
  editing it appears in both. Removing one membership preserves the other,
  attachments and media bytes.
- `SCN-DOM-04`: adding a model creates membership only in the named Scene;
  replacing it preserves every Scene edge and AssetFrame. Unproven anchors enter
  `needsReview` without automatic remap.
- `SCN-DOM-05`: duplicate semantic memberships, conflicted Scene lifecycle,
  missing owner Asset and missing/default-view cases produce exactly the bounded
  projections and recovery actions in sections 3 and 5.
- `SCN-DOM-06`: creating a Scene copies only the source Scene's active Asset
  memberships and creates no Caption/material/default-view copy.
- `SCN-DOM-07`: an Asset-anchored Caption whose model is absent stays in the
  Scene list with no marker; an existing/imported ProjectAnchor Caption in the
  same Scene renders independently and is never assigned an inferred owner Asset.
- `SCN-DOM-08`: membership removal does not collect Project resources/blobs;
  Scene/View/Asset deletion blocks on active dependencies, Caption deletion
  tombstones every observed child edge, and a concurrent unseen edge remains a
  protected orphan without silent cascade under both merge orders.
- `SCN-DOM-09`: new-Project creation publishes one default/active Scene and every
  admitted initial model membership atomically, with no inferred Scene split or
  extra Caption/material/view records.

### 12.2 History and conflicts

- `TEAM-HIST-01`: different Caption fields and distinct entities converge under
  both merge orders; same-field conflicts retain every candidate/provenance and
  expose no library materialized winner.
- `TEAM-HIST-02`: membership, Project default Scene, Scene default View,
  material and active-binding conflicts block only their specified projection.
- `TEAM-HIST-03`: explicit choose/manual-combine resolution is causal after every
  candidate, restores authoritative projection and retains losing history.
- `TEAM-HIST-04`: two integrators publishing from one base produce detectable
  divergent heads; time/order never replaces either branch.
- `TEAM-HIST-05`: 10,000-Caption/50,000-change, two-tab and restart fixtures meet
  the ratified metadata budgets before adapter adoption.
- `TEAM-HIST-06`: duplicate Scene membership keys apply none. Resolution observes
  all known edge IDs and supports user-selected keep-one or keep-both. Keep-both
  creates independent Caption/model identities with an exact remap and no silent
  other-Scene or Caption retargeting; editing one copy leaves the other unchanged.
  Both merge orders, replay, interrupted copy and one later unseen edge preserve
  candidate history, uniqueness and the same conflict semantics.

### 12.3 Packages and recovery

- `TEAM-PKG-01`: a fresh device opens one Team Workspace offline with all active
  Scenes/resources and can produce a valid Contribution without re-importing a model.
- `TEAM-PKG-02`: a Caption-only Contribution reads and embeds zero unchanged
  payload bytes from an existing verified 500 MiB GS; a model revision includes
  exactly its newly required blobs.
- `TEAM-PKG-03`: missing/wrong base, dependency, lineage or blob yields zero
  metadata activation. A valid semantic conflict publishes the complete batch
  and affected review state atomically.
- `TEAM-PKG-04`: repeated import is a no-op; late contributions and two divergent
  heads preserve exact causal dependencies in both arrival orders.
- `TEAM-PKG-05`: cancel, quota, corruption, crash and second-tab observation at
  every journal boundary expose only the complete old or complete new heads.
- `TEAM-PKG-06`: review contains exactly one selected Scene closure and no source
  identity/history; complete backup restores the same Project; clean copy has a
  fresh lineage and all active Project Scenes/resources.
- `TEAM-PKG-07`: human memo is non-authoritative; the mandatory automatic
  summary reproduces from the exact package/change set. The fresh-CSPRNG package
  ID satisfies its grammar/uniqueness rule and is bound to the verified manifest;
  it is not derived from the changes. Declared base and target heads are
  validated against the included dependency graph.
- `TEAM-PKG-08`: from base O, local unsent A plus imported sibling B exports both
  A and B against O; importing B does not advance the exchange base and a receiver
  already holding B deduplicates it. If newer Workspace head W descends from O
  while local A remains its sibling, exporting against W includes A because A's
  dependencies exist in W's closure; no rebase is fabricated. Importing/generating
  a newer Team Workspace records only its declared heads, survives restart/backup
  and never substitutes local merged heads or a most-recent filename.
- `TEAM-PKG-09`: review blocks a selected Scene lifecycle, membership, included
  resource/binding/Caption/material or blob conflict, while an unrelated Project
  conflict does not block it. A conflicted optional entry view follows the one
  disclosed omission rule; no candidate/materialized winner enters the package.

### 12.4 Migration

- `SCN-MIG-01`: implicit/one/multiple Native DisplaySets, global hidden Assets,
  active set, Caption/material/view/default relations and supported presentation
  filters convert deterministically and reproduce the same initial appearance.
- `SCN-MIG-02`: an unrepresentable partial-kind presentation stops/reports rather
  than assigning a guessed Scene edge.
- `SCN-MIG-03`: LociMyu sheets become Scenes, the authoritative model belongs to
  all, and exact GID Caption/material/view relations switch together. Ambiguous
  relations remain inactive/report-only and source bytes remain unchanged.
- `SCN-MIG-04`: Native/frozen-v1/LociMyu inputs remain readable and unchanged;
  repeated conversion through the separately ratified ProjectScene recipe is
  deterministic and every converted Project is v2-only-write. The closed
  `v1-migration-recipe-1` output is never reinterpreted.
- `SCN-MIG-05`: **withdrawn by PO 2026-09-14**, not PASS or deferred. The
  fixed-baseline late-Native bridge is no longer a delivery/acceptance requirement.
- `SCN-MIG-06`: every admitted model/media payload preserves exact digest, byte
  length and bytes in v2; unsupported, missing and unlinked inputs are fully
  accounted for, and success/failure/cancel leaves every source byte unchanged.
- `SCN-MIG-07`: after one-time conversion, new-format Workspace/Contribution
  exchange continues; an old-format update does not mutate the converted Project
  and explains the cutover. Conversion retry does not duplicate/reset that Project.

### 12.5 UI and devices

- `SCN-UI-01`: Desktop keeps Scene context visible across all four tabs; Caption
  selection, list scroll, filters, windows and tab state follow the local-state
  contract through A/B switching.
- `SCN-UI-02`: add/include/exclude/replace/delete wording distinguishes Scene
  membership from Project resource destruction and shows multi-Scene Caption impact.
- `SCN-UI-03`: conflict, missing blob, `needsReview`, unsaved, save failure and
  recovery remain visible without page travel or hidden mode exits.
- `SCN-UI-04`: keyboard-only, touch without hover, 200% zoom, approximately
  320 CSS px, long Japanese names, 100-Caption lists, short height and IME/keyboard
  cases retain target, state and recovery controls.
- `SCN-UI-05`: recorded Desktop evidence and a physical-iPhone run cover Scene
  switch/authoring, full Project editing, Project-wide revision review,
  `needsReview` and conflict resolution, all five package preflights/import/export,
  failure recovery, save and completely offline reopen. Dev server, DOM tests and
  Desktop emulation do not count as device/PWA PASS.

### 12.6 Continuing-team acceptance through the whole product

`TEAM-FLOW-01` is the required completion scenario for this workstream. Use one
synthetic two-Scene Project and two independent participant workspaces:

1. The coordinator distributes a Team Workspace; the participant opens it and
   edits Caption text/media without separately importing a model.
2. While those changes remain local, the coordinator replaces one model and
   distributes the updated Team Workspace. The participant integrates it without
   losing local Caption edits; every Scene referencing that Asset uses the new
   revision. Positions are preserved; only unproven compatibility is `needsReview`.
3. One participant explicitly corrects an affected pin and sends a Contribution.
   The coordinator receives both pending Caption work and that correction with
   original causal dependencies, then makes and exchanges a second edit round.
4. A duplicate Scene membership conflict requires keep-one/keep-both selection;
   exercise keep-both and verify independent subsequent edits and no duplicated
   copies on replay. Genuine field conflicts retain explicit resolution.
5. Save, restart and reopen offline in both workspaces. Verify both rounds, Scene
   membership, model update, independent copies and pin correction; replaying an
   accepted Contribution is a no-op. Inject one representative interrupted import
   and retry using the existing journal-boundary checks for the remaining faults.

Run the service-level chain in S2 and the ordinary UI chain on Desktop and physical
iPhone in S3. Reuse `SCN-DOM-03/04`, `TEAM-HIST-01/03/06`, `TEAM-PKG-01/04/05/08`
and `SCN-UI-05` fixtures/assertions; do not multiply them into another exhaustive
matrix. S3 completion requires this integrated outcome, not merely individual
test counts. Existing Native test passes provide regression evidence only.

## 13. Bounded implementation sequence

### 13.1 Approved scheduling exception — pure Scene core (2026-09-08)

The Product Owner approved advancing the storage/renderer-neutral Scene core
while browser adapter evidence is blocked. This exception permits production-
quality pure modules and tests, not their activation in the current application.
It supersedes only the gate-before-domain ordering in this section, ADR-0002
and specification 03 section 10. Metadata/CAS adoption, durable commands,
migration/package changes and UI wiring retain every existing prerequisite.

Implement Scene creation (including initial default), rename/default/view
selection, exact membership inclusion/exclusion, guarded deletion and deterministic
composition planning. Use an explicit conflict-aware, validated resource read
projection: no Automerge types, storage I/O, blob reads, renderer, network,
dependency addition or changes to existing v1/Native paths. The read projection
is not a new serialized ProjectDocV2 schema or an untrusted-file validator.
Its provider must eventually validate full resource/representation/material/view
closures and supply all conflicts; missing or unresolved inputs fail closed.

Pure command planning returns an immutable logical Scene change with the source
snapshot token. It acknowledges no save and changes no active UI/session state.
The future write authority must check that token, revalidate, encode one causal
change and durably publish before use; a stale plan is never applied directly.
Resource content edits, revision activation, keep-both deep remapping, journal,
media, full render-plan construction and frame-by-frame/device acceptance remain
in their existing slices, not silently implemented by this exception.

Acceptance reuses the pure portions of SCN-DOM-01–09: A/B/A composition with no
state leakage; shared Caption membership without copying; current Project-wide
model binding selection and preserved needsReview anchors; duplicate/conflicted
edge exclusion; hidden-owner list entries versus ProjectAnchor markers; explicit
default/view validation; source-Scene model-only creation; and non-cascading
membership/Scene deletion. Tests must also show input immutability, stale-token
rejection and absent imports from application entry points. These are domain
results only, not completion of those integrated acceptance IDs.

### 13.2 Gated storage and integrated delivery

**Caption list scale connection (2026-09-14; implementation of 03 §6):**
The existing ProjectScene list must window mounted rows, not truncate its logical
source. Search, colors, counts, unknown/recovery items and filter visibility still
use every admitted Caption. Offscreen is not filtered-out. An explicit selection
can mount and reveal an initially absent row inside the list without scrolling
the page or recalling the camera. Keep keyed focus and Scene-local scroll memory;
keyboard navigation must reach records beyond the mounted range and still leave
the list at its true ends. Rows remain variable-height: wrapped titles, status,
owner and recovery controls are never clipped to an assumed fixed height. Measure
visible rows, invalidate stale width/zoom measurements and preserve a visible
anchor as measurements change. Rendering estimates/overscan are internal details,
not capacity or latency promises. Keep the current command/file guards, IME and
source ownership; do not write metadata for scrolling. Reuse the existing list
and host tests. Bounded recorded DOM at 10,000 rows is implementation evidence only;
actual browser/iOS, full metadata history and G0 budgets remain G1-C adoption evidence.

S1–S3 name delivery stages, not three indivisible commits. The immediate S1 entry
is one disposable candidate-adapter harness for the existing `TEAM-PKG-08` causal
sequence and section 8 conflict choices. Its input is one synthetic Project with
two Scenes, one Asset and shared Captions; O/A/B/W branches exercise exact change
subtraction, no base advancement, candidate retention and explicit resolution.
Use a fake blob port for this first metadata proof and make no I/O/device claim.

Before running that harness, inventory the already executed evidence once:
Native storage/portable-package/merge tests provide regression and reusable
fixtures, not proof of Automerge or CAS. The current application has no adopted
metadata adapter. Record the exact candidate version and isolated dependency
scope for the existing dependency approval, then run the harness. Its exit is
the bounded assertions passing on the pinned adapter or one concrete failed
capability and alternative. Do not add another planning document or broad
fixture campaign before executing it. A pass is partial G1-C evidence; complete
only the still-missing G1-A/C criteria before production storage adoption.

1. **S1 — Scene-capable v2 core:** after metadata/CAS gates, implement ProjectDocV2,
   ProjectSession/MetadataRepository, journal, Scene records/commands/resolver under
   a nondefault feature boundary. No converter, package or production UI.
2. **S2 — migration and team exchange:** implement Native/frozen-v1/LociMyu
   one-time converters and all five package purposes, but only
   after the new migration companion and package-wire companion in sections 7.5
   and 9 pass independent review and their gates. No UI polish, renderer
   expansion or release work.
3. **S3 — product UI and acceptance:** connect the shared Scene selector, four
   task tabs, conflict/`needsReview` recovery and package preflights; complete
   Desktop and physical-iPhone evidence. No Pages, Service Worker, `main`, release
   or deployment action.

S1/S2 include the physical-iOS storage/durability/recovery checks required by the
specific changed path. S3 owns the integrated UI/device acceptance; it is neither
the first possible storage test nor a substitute for adapter/I/O evidence.
The first harness, production adapter/journal, domain/resolver and production
exchange changes each close a named requirement using focused evidence.

**Product-connection planning clarification (2026-10-15; documentation only):**
The ordinary ProjectScene UI should express edits through the existing typed
`MetadataProjectSession` commands and read provider-derived display models.
Synthetic string-map/JSON intent adapters and fixture assumptions remain harness
concerns. Before connecting the ordinary entry, specify only the required ports,
import boundaries and connected open/edit/save/reopen acceptance; retain Session
authority, exact source history, failure recovery and all applicable adoption
gates. Extract only the required composition when that workflow is implemented;
this direction does not promote the validation host or its storage namespace,
change formats/dependencies, or authorize activation before gate completion.

**Bounded product composition implementation boundary (2026-10-15):** implement
the connected open → Scene/Caption/pin/media edit → file save/send/receive →
independent reopen workflow in `src/ui/projectScene`, selectable with
`editor=project` in the existing nondefault validation entry. Preserve the existing
editor while this composition is integrated; no ordinary-home activation or
aggregate feature/profile/device acceptance follows.

- Product modules read the verified Scene provider and issue existing typed
  MetadataEdit commands through a narrow host port. They must not import harness,
  fixture geometry, string-map intent adapters, raw Session, FS or package writers.
- The host's typed dispatch shares execute/editable/profile/content/display-ready
  checks with the existing adapter. Binary introduction and file/recovery operations
  retain their existing service boundaries; restored hosts use current services.
- Inject a viewport runtime adapter from the validation composition. Preserve exact
  source/Scene/binding/revision/representation/family/class pick identity, render and
  camera receipts, coverage/occlusion/stale rejection and the existing GLB renderer.
  Do not move the synthetic viewport/session into product UI.
- One UI-owned interaction guard covers drafts/IME, selection, pin proposals,
  asynchronous edits and file tools. A failure keeps its exact input/command;
  success follows confirmed publication/display. Browser download is not file-save
  confirmation. Source history, backup restoration and file jobs stay authoritative.
- Acceptance uses the new composition through one real-file workflow, typed edit
  and media/pin actions, named backup and two-round Workspace/Contribution exchange,
  cold reopen, guarded input and same-command recovery. Reuse service fault tests;
  add exact import isolation and representative composition tests. Record missing
  rendered/device evidence for the grouped candidate, without pausing development.

**Product panel integration clarification (2026-10-15):** extend that same bounded
composition with stable Caption/model/Saved View/material task panels. Reuse the
accepted pure controls and planners. Narrow adapter reads may expose their typed
same-token projections and original candidate/version identities; they expose no
raw Session, history string maps, file system or model bytes. Model body addition,
replacement and placement use the existing guarded services. Local model hiding
and model previews remain Scene-local UI state, with the existing runtime injected.
View capture/recall/projection/background forward to the current runtime, preserving
exact paired values, field versions and rollback/read-back checks; entry changes
remain metadata-only. Material edits/resolutions use existing typed commands and
profile/slot admission. One shared operation owner retains input, IDs and exact
commands through failure, while each panel distinguishes its own draft from other
pending input. Validate representative model/view/material edits through file
output and independent reopen, plus existing focused invariant/fault tests. This
adds no renderer, storage, compatibility, profile or ordinary-entry policy.

**Product attachment integration clarification (2026-10-15):** extend the same
composition with registered admitted PNG reuse, attachment description/order,
confirmed detachment and the existing common thumbnail/viewer controls. Reads
retain exact Caption/attachment/resource identities and distinguish uncertain
relations from an empty list. Writes use existing typed attachment commands and
the shared operation owner; original IDs/inputs remain fixed through retry.
Detachment tombstones only the selected attachment, preserving media bytes and
other Captions. Viewer navigation is local, preserves editing drafts and rejects
late image events/results after identity, Scene or component lifetime changes.
Retain verified immutable body identity across unrelated edits, bound mounted
thumbnails with the existing pagination, and release object URLs on replacement
or disposal. An opaque host image-lifetime read must follow the underlying current
content service, rather than the stable mode facade, so host handoff invalidates
old readers/promises without exposing that service. Confirm connected
reuse/edit/detach → file exchange/cold reopen plus
existing viewer fault coverage. This is a composition change within the current
PNG lane, not additional media/profile or browser/device acceptance.

**Detached PNG handoff correction (2026-10-15):** a Workspace may retain an
immutable historical media declaration without its weak-only body, as already
required by specification 06's guaranteed-inventory boundary. On fresh receipt,
request all strong-closure media and physically supplied media; retain an omitted,
never-received weak PNG as unavailable, with its original declaration and diagnostic.
It is not an available catalog choice. Only the exact unrequested weak
`verified-media-bytes-required` issue may coexist with whole-Project readiness;
an executed failed/missing/stale/malformed check still blocks readiness.
Locally acknowledged media remains subject to verification after detachment.
Owned content-evidence receipts and prepared/published local/staged or original
physical-manifest witnesses prevent loss from being reclassified as never received,
including loss of both receipt types. A matching body in another Project's origin
CAS alone does not admit omitted media or make it a catalog choice.
Reuse of known records never repairs them
from incoming bytes. No wire, schema, retention or general weak-record reactivation
policy changes. Acceptance: last global detachment → fresh Workspace import →
read/edit/export/cold reopen, unavailable-media disclosure, and acknowledged-media
loss rejection with no repair writes. Backup protected-inventory verification and
required/conflicted media checks remain unchanged.

**Product comparison-window integration (2026-10-15):** connect the existing
Caption window state/controls to the same product composition. Consecutive
explicit selections retain separate windows; reselecting the same row or using
the detail action reopens a dismissed window without resetting its draft.
Window front/close never selects another editing Caption or writes Project
history. Move/resize/arrange are guarded against drafts/IME/other operations;
an active gesture blocks conflicting Scene/file/camera/edit actions, including
Orbit wheel/touch input through the existing viewport input reservation. Preserve
Scene-local placement, confirmed content, stable DOM/scroll and non-drag controls.
Share one workspace-level image viewer and the existing exact verified PNG cache
between the editor and fixed-Caption window galleries, including other task tabs.
Use the current exact rendered display object as the projection receipt, including
same-token hide/filter updates, plus source/Scene/finite visible points for lines.
The latest needsReview clarification in §2 remains authoritative. Keep rendering
failure/retry controls outside the floating overlap. Reuse existing interruption
tests and verify the connected product workflow, readonly/local state and exact
image-service invalidation. No new persistence or renderer/profile adoption.

**Product Caption management integration (2026-10-15):** compose the accepted
Project-wide deletion (§4.3) and explicit parent change (§4.4) in the same editor.
Read the exact deletion impact through a typed read-only adapter and dispatch the
existing command with all observed edge IDs after confirmation; preserve shared
resource bodies and clear local selection/windows only after success. Incoming
deletion keeps draft identity/text while explaining why apply is unavailable.
Use the existing verified coordinate planner through a read adapter for parent
preview; an explicit empty-first destination and separate reparent intent must
never be inferred from an ordinary move. Require current source/Scene/target and
known affected Scene count, reserve existing surface/gizmo input, disclose
list-only effects and require a surface when the old position is unavailable.
Retain proposals on failure and retry the exact original command. Keep the
existing draft/IME/window/file/readonly guards, cancellation and metadata
authority; this introduces no new persistence, compatibility or adoption claim.

**Product Scene/membership integration (2026-10-15):** connect the accepted Scene
name/default operations (§4.2) and existing Caption inclusion/exclusion in the
same product composition. Capture source token and Scene when a create/rename/
default draft begins; stale drafts keep input but cannot commit. Setting the
default does not navigate the current editor. Preserve creation's model-only
inheritance and exact IDs across retry. Reuse the pure membership picker with a
complete Project inventory, Scene-local local state and no automatic editor/owner
selection. Inspect original mutable membership endpoints/lifecycle, including
unprojected, duplicate and delete/edit candidates, before claiming absent/included.
Dispatch the existing membership-only commands with one exact edge/fresh IDs;
clear only the excluded Scene's editing selection after durable acknowledgement.
Keep the shared draft/IME/gesture/file/readonly guards and existing conflict
boundaries. No new schema, format, general recovery or adoption is implied.

**Product conflict/recovery integration (2026-10-15):** connect the existing
Scene-name/startup and Caption field/lifecycle/membership decisions in §8 to the
same typed composition. Keep checked candidate preparation in the validation
read adapter and one operation/retry owner in the product workspace. Use a whole
Project review area so excluded/conflicting Captions remain reachable. Scene-name
resolution may preserve unapplied Caption text; startup choices refuse other
pending input. A cold unresolved default uses the existing explicit startup
controls without constructing a Scene editor until saved acknowledgement; warm
resolution retains navigation/camera/draft identity. Preserve full candidate
validation, absence, parent-only recovery and independent-copy semantics. No new
recovery policy, wire/storage authority, adoption or ordinary entry is introduced.

Each production slice requires a short meta-audit, exact-tree tests/build, one
independent read-only review and a reversible commit. Run focused checks during
editing, then the required full matrix once on the final executable tree. Reuse
passing evidence while its code, dependencies and contract remain applicable.
Documentation-only corrections receive diff/reference/contract checks, not an
unchanged application test rerun. Review findings outside the active acceptance
go to backlog unless they directly threaten correctness or completion. Do not
repeat broad review after the focused correction is confirmed.
A gate failure, specification conflict,
unproven migration relation, new P0/P1, required scope expansion or release/
destructive boundary stops the slice and returns to Product Owner review.

**PO-approved scheduling amendment (2026-09-11):** following
the saved-host Desktop receipt, permit implementation of the S1 production-quality
metadata/storage service before aggregate G1-A/C adoption, while keeping its
activation limited to newly created synthetic workspaces in the existing development
host. The PO explicitly approved this order and the three pinned root dependencies.
This supersedes only §13.2's gate-before-implementation ordering, not any hard-pass
requirement or a product support/adoption claim. Real-data activation remains gated.

The first bounded slice would create the approved 02 §4 empty-root bootstrap and
external lineage proof, then append initial Project/Scene contents in later original
changes. Connect creation → exact Caption command → durable acknowledgment →
independent reopen, retaining original changes and the old published view on
interruption/retry. No existing saved-development history is rebased, reseeded or
converted; the populated FLAT_FORMAT remains isolated in its existing namespace.
Implement a reviewed production service rather than copying the PoC into `src`.
Use the existing pinned candidate versions only: Automerge 3.4.1, Repo 2.5.6 and
its IndexedDB adapter 2.5.6. Moving these to root dependencies is part of the
requested approval, with lockfile review and `npm audit` before acceptance; it
does not authorize unrelated upgrades or accept new vulnerability findings.
The PO subsequently approved a Repo 2.5.6-only `uuid` override to 11.1.1 for
GHSA-w5hq-g745-h8pq, conditional on exact API compatibility, lockfile review and
fresh audit. The top-level three pins remain unchanged; no other dependency
upgrade or toolchain vulnerability waiver follows.

The service must separate immutable verified-content evidence from a metadata
snapshot: a Caption-only command and cold recovery check verified inventory and
presence without rereading/re-hashing existing large bodies. New or suspect bodies
still require byte/profile verification. A development-only warm cache does not
satisfy this requirement and is not a separate prerequisite project.

Reuse the current domain/Scene core, exact-change and journal acceptance. First
prove the new service on synthetic inputs; then connect that service to the same
development UI without changing existing runs. No real user-file admission,
ordinary home, migration or five-purpose wire, origin-wide destructive GC,
new media/profile, release or Pages/SW change is included. Full G1-A/C evidence,
applicable physical-iOS checks and explicit adoption still precede real-Project
activation. S2 retains independent wire/recipe ratification. Failure of the new
service is visible; no fallback silently reuses the old PoC writer.

**PO-approved limited real-file validation entry (2026-09-12):**

PO explicitly approved enabling this exception to synthetic-only development
activation above. This is not an implementation receipt or general adoption. The
critical next connected task is actual file inspection → new Project creation →
saved-body rendering → select/reopen, not another synthetic catalog or PoC page.
The approval covers implementing and activating the following finite validation
scope; ordinary-home and formal adoption gates below are unchanged.

- **Scope:** newly created validation Projects in the existing development host;
  self-contained static GLB Mesh with embedded PNG textures, and attached PNG.
  No external resources, animation, skinning, morph targets or unsupported
  required extensions. This first slice does not remove other approved Native
  model/media formats from the practical-team completion target.
- **Admission:** inspect bytes and structure, not filenames. Validate all admitted
  geometry, material/texture references and embedded/attached PNG content. An
  existing loader producing some visible triangles is not sufficient: the Native
  inspection can skip image decoding, and its loader can replace external URLs
  with empty data plus warnings. Missing, corrupt or unsupported content must
  not silently become omitted geometry, placeholder textures or default material
  and then count as a successful import. Reuse existing parsers, PNG verification
  and resource disposal only where they meet this stricter finite contract.
- **Construction and persistence:** construct fresh immutable records and exact
  content evidence from the admitted input using the existing metadata/service
  and WorkspaceFS boundaries. Preserve source bytes and authored coordinates;
  do not infer source relations, model equivalence or cross-model pin matching.
  Reuse the streamed body store, verified inventory and marker-last creation.
  Only a complete, verified Project becomes ready/selectable; interrupted creation
  remains visible as incomplete, with an explicit recovery path, not as a ready
  list entry. Existing saved namespaces and Projects are untouched.
- **Connected use:** the viewport/gallery must read verified saved models, images
  and materials, including an independent cold reopen, without fixture fallback.
  Then connect create/select/reopen and the existing record/edit/save flow on that
  same host. Keep temporary camera/filter/window state separate from shared edits.
  Failed body or metadata persistence retains the original input and failed state;
  exact saved-command retry never regenerates history or claims a completed save.
- **Acceptance:** reuse current service/host tests for successful creation and
  cold reopen, unsupported/missing/corrupt input refusal, interruption/retry,
  switching without losing unsaved input, and unchanged original files/old
  Projects. Render actual saved geometry, texture/material and attached image in
  the available browser; record unavailable browser/device checks as pending.
  Final executable-tree typecheck/test/build and independent review remain
  required. Do not copy old Native or synthetic-only passes into this lane.
- **Limits and exclusions:** record actual test environment and file sizes as
  observations, not capacity/performance guarantees. Caller budgets are not a
  measured support promise. Full G1-A/C, applicable physical-iOS checks and exact
  profile ratification still precede formal real-Project adoption. Ordinary home,
  old-data migration, five-purpose wire, added dependencies, new formats, GC,
  Pages/Service Worker/release and iPhone HTTPS exposure remain outside this
  exception. Required new authority stops only its affected boundary.

**PO-approved static validation execution (2026-09-20):** the existing limited
GLB/PNG validation screen may also run in the exact `project-scene-validation`
build mode. Reuse `dev.html`, the current services and validation namespaces;
URL parameters cannot select the older writers in this build. Produce a separate
`validation-dist` with no copied public assets, ordinary app/old PoC entry graph,
PWA manifest or Service Worker registration/generation. Ordinary and Spark/PWA
build behavior remains unchanged. The static shell shows loading/failure state,
not the old interactive harness before startup. Verify mode isolation, the actual
bundle's module/assets inventory, and local HTTP execution. This is permission
for a local built validation route, not ordinary-home activation, offline/PWA
acceptance, increased limits, a new model profile or release. An iPhone HTTPS
route still requires the exact candidate build and one-route approval.

Finite implementation notes for that validation entry: use an owned
`development-validation` evidence scope, distinct from synthetic fixtures and
ratified profiles; this is transient evidence, not a wire/schema change. The first
GLB executor reads version-2 JSON/BIN, one declared/default scene, static triangle
primitives and core metallic-roughness materials (including unlit). Sparse
accessors, animation/skin/morph, other primitive types and unimplemented
extensions are explicitly rejected, never silently ignored. Names/extras remain
source data, not identity authority. Embedded PNGs are integrity-checked and
decoded; declared numeric values, references, geometry and bounds must be valid.
Implementation budgets are explicit caller constraints, not newly adopted
capacity guarantees. Reuse existing scene/content commands and Three rendering;
do not widen the legacy reader to achieve this validation.

Creation retains its exact two original changes and proof in a hash-bound local
initial-source receipt before beginning the service journal. If initialization
stops after journal.start but before prepared, a finite internal recovery method
may reuse only those same saved originals and the existing initialize start:
same proof, empty base, no predecessor, no published Project, exact existing part
bytes and no extra ordinals. Missing unacknowledged parts may be completed;
different/torn parts fail without overwrite. Prepared journals always recover
from their stored parts, never refill missing acknowledged bytes from memory or
the initial-source receipt. No new transaction/source IDs, migration or wire
format follows from this recovery seam.

Saved-body display connection uses a discriminated, plain-data model read DTO:
fixture closures retain their exact validator; validation-GLB closures retain the
actual complete saved binding/revision/representation plus frame IDs. File bytes,
decoded images and Three resources stay outside shared snapshots in a disposable
resident port. Existing pin/camera/window UI consumes the common projection; no
fixture geometry, single-slot color or material default substitutes for real data.
Fixture-only copy/update writers must reject the validation branch at execution,
in addition to capability controls. Source GLB material/texture/alpha semantics
are preserved; any missing decoder/texture result fails the display, never a
partially successful model. This is an internal read/render connection, not a
second storage authority or a change to the formal renderer adoption gate.

The opt-in host uses `storage=validation` and a fixed new metadata namespace,
with no lookup/creation fallback into previous namespaces. Reuse the existing
browser Wasm/IndexedDB adapter guard and saved editor lifecycle; synthetic demo
receive is optional and absent here. The selector enumerates published service
state read-only; incomplete entries offer recovery, never the ready action.
Cold initial-source recovery checks the expected Project ID before any source
is handed to the writer. A rejected command with unchanged ready storage is not
a pending save and must not enable no-op acknowledgement of unapplied input.
Creation-name IME and editor draft/save state block creation/switch as appropriate.
Late open/render results after disposal are drained and released, not mounted.
The first connected selector introduces all selected models/PNG at creation;
the next bounded connection adds one PNG to an opened Caption through the same
media editor. The file picker captures the exact Scene/Caption/token; a changed
target or read-only tab must reject before mutation. Strict PNG decoding and
owned bytes precede the existing `createAttachment` command. The content service
stages those exact bytes after journal start; media-resource and attachment
records publish together only after verified durable save. Failed staging keeps
the same input/identities for in-session retry. After journal preparation, cold
recovery uses stored original changes and verified bodies, not a new attachment.
An interruption before preparation retains the existing visible repair state;
it must not claim success or silently create a replacement. Invalid input creates
no pending transaction; the user can replace or explicitly cancel that selection.
The existing combined validation-byte budget also bounds saved referenced input
plus the new file, without converting it into a capacity guarantee. Existing
model bodies are not reread for attachment-only edits. Real-model addition and
material editing remain explicit later connections; placement follows the bounded
contract below, not a synthetic fallback. Alpha-mask/blended
surface picking is unavailable pending an alpha-aware picker; source appearance
is preserved and the limitation is visible. Browser execution budgets (64 MiB
combined input, 4 MiB JSON, 100,000 structural items, 8,000,000 accessor values,
16,777,216 image pixels) are caller refusal limits, not measured support promises.

Validation-GLB placement connection reuses the already approved M07 semantics:
Move/Rotate/positive uniform scale about the model origin, preview/confirm/cancel,
same all-Scene Asset placement and unchanged Caption asset-local coordinates.
Use the existing common read closure for the draft and an explicit typed host
operation containing Scene, Asset, expected binding, one retained new binding ID
and the confirmed transform. Do not route saved GLB through fixture factories.
The host seals a fresh manual binding with the current binding as parent and the
same revision, then submits existing `transformAsset` through the metadata
session. Existing command validation rejects stale/unknown/conflicted ownership,
invalid rotations/scales and read-only writes. No new schema/profile/fact executor
is needed: representation, revision, bytes and material catalog stay unchanged.
Save/retry does not reread existing bodies; cold rendering may load them normally.
After failure, preserve the draft, prepared identity and original journal changes.
Acceptance reuses current model-gizmo tests plus real-format host tests covering
pin-following preview/cancel, exact binding-only save, failure/retry/cold reopen,
same-value no-op, IME/read-only/stale refusal and unchanged resident content.
Actual browser/iPhone evidence remains pending with the consolidated batch.
Model addition/copy/revision changes, material editing, nonuniform/negative scale,
alpha-aware picking, ordinary home and formal adoption are not part of this seam.

The next validation-only connection adds one static GLB to an opened Project as
a new independent Asset in the explicitly selected Scene. Reuse the initial
builder's one-model records, strict content inspection and identity placement;
preserve source coordinates. Same names or bytes never imply replacement or
shared editable identity (CAS may reuse identical body bytes). The finite typed
`addAsset` command creates one Asset, revision, representation, root binding and
Scene membership in one original change. All record and nested declaration IDs
must be fresh against retained history; exact schema, ownership, closure and
current active Scene are checked before beginning a transaction.

An owned validation model-fact plan inspects only the newly prepared body before
journal start; old model evidence uses persisted receipts/inventory. Keep original
changes, input identities and exact blob refs, begin the existing local-command
journal, stage new GLB bytes and only their content facts, then publish once after
full verification. Carry new refs through existing `stagedBlobs`; delta verification
accepts only the already scoped PNG/GLB bodies. No journal schema/wire change or
fallback fixture evidence. After preparation, cold recovery uses stored originals,
body and evidence. Before preparation, an interrupted cold run remains visibly
incomplete/repair-required, as with PNG introduction; no automatic rebuild claim.

Before the UI acknowledges the added Asset, prepare only missing representations
in a temporary renderer cache. Commit the new resident templates only when all
decodes succeed. Keep the editor, old residents, camera and selection/draft state;
do not remount the entire Project to add a model. Display failure after publication
retains old UI plus failed input; retry prepares display and confirms the same
saved Asset without another command. Late-disposed preparations release their
resources without cache publication. The model-tab `3Dモデルを追加` picker captures
Scene/token and a fresh Asset ID; input/IME/save/read-only guards remain in force.

Acceptance: independent addition/current-Scene-only membership and later pin/
placement editing/cold reopen; equal-name/equal-byte independence; stale/read-only/
limits/unknown/collision refusal; body/fact/metadata interruption and exact retry/
prepared cold recovery; zero extra old-body reads; new-body corruption/evidence
mismatch refusal; partial/failed/late-disposed render preparation without duplicate
save. Use existing service/host/renderer tests, not a new PoC or generic file API.
Other formats, existing old-namespace Projects, replacement/copy inference,
material editing, wire/migration, ordinary home and formal adoption stay outside.

The next validation-only connection applies §2.3 to an explicitly selected new
static GLB for an existing Asset. `replaceAssetModel` carries Scene/Asset IDs,
expected active binding, and one new Representation/revision/manual binding.
Require a current active, unambiguous target in that Scene, complete known old
binding and exact new records. Preserve Asset/AssetFrame, label/lifecycle,
asset-to-project transform and every Scene edge, Caption and attachment. The new
binding names the old binding as parent; all new record, family, compatibility,
material-layout/slot and RepresentationFrame IDs are fresh against retained history.
Neither equal filenames/bytes nor a similar surface declares compatibility.
The revision has only the selected Mesh Representation, identity Representation
placement and inspected source material catalog; old overrides are not remapped.

Plan these immutable records and the active pointer in one local-command change,
using the existing validation model-fact plan, owned input and `stagedBlobs`.
Verify before journaling, stage required bytes/facts, publish metadata once and
prepare the new resident before UI acknowledgment. On failure preserve old display,
selection and exact prepared changes; retry never generates a second revision.
The model tab first captures the target/token and selected file, then shows affected
Scene count and retained-record/pin consequences with explicit confirm/cancel.
Pending/IME/read-only/stale/disposed guards cover the entire selection. No raw
file input is translated through the synthetic prepared-version adapter.

Acceptance reuses existing GLB/PNG, journal and file tests: invalid/stale input
leaves the original Project unchanged; same-Asset replacement affects all Scenes
without rewriting Caption data; updated Workspace receive preserves local edits
and known-position needsReview pins; explicit current-surface correction and
Contribution return/replay/cold reopen retain the complete original history.
Include publication failure/exact retry and existing resident failure coverage.
No new wire/schema/profile, implicit material matching, general revision manager,
Point/GS/Proxy expansion or adoption/ordinary-home/device credit is granted.

Validation-GLB material connection reuses existing scoped MaterialOverride commands,
the mounted editor and saved source catalog. Enumerate every logical slot with its
exact family/layout/slot target; do not use only the first slot. Existing command
source admission remains unchanged: opaque, surface optics, lit, front-sided
originals. Other source slots remain identifiable but explicitly non-editable.
This first render seam supports lighting inherit/lit/unlit and sidedness, preserving
base-color factors, vertex colors, UVs/textures and the original PBR settings on
reset. An existing baseColorSrgb intent may replace only the color factor, not the
texture. It does not introduce a new color-edit control. Chroma, fractional alpha,
mask/dither/blend/transmission and other original source semantics remain visible
unconnected effects; never persist an unsupported candidate through this host.

At actual GLTF decode, retain explicit material/primitive association with the
inspected glTF material index or the proven implicit-default slot. Unknown or
inconsistent associations fail display preparation. No name, arbitrary traversal
order, geometry similarity or shared object inference may establish a source
relation. Cloned instances carry that verified ephemeral mapping. Apply intent
to exact slot clones only; never mutate cache templates, shared textures, original
GLB bytes or another Asset/Scene. Lit rendering clones original PBR material;
unlit rendering uses base color/map/vertex color without lighting. Returning to
inherit/lit or removing an override recreates the original settings. Scene intent
replaces the whole Project intent, not a per-field merge. Unsupported or conflicted
effects must be diagnosed, never silently presented as successfully applied.

Warm saved material edits need no model-body reads. Keep existing exact journal
retry/cold reopen and UI draft/IME/readonly guards. Validation admission at the
host rejects unsupported candidate effects before journaling. Renderer cache
preparation validates applicable slot intents before acknowledging a saved view;
display failure retains the existing failed/retry state, without repeating writes.
Acceptance reuses existing tests: two slots with shared primitives, an implicit
material, scene/project precedence, lighting/side/reset with textures/PBR retained,
exact source mapping (including repeated nodes), body-read-free save/retry/cold
reopen, invalid source/effect refusal and disposal. Browser/GPU/iPhone evidence
remains separate. This seam does not finish all material capabilities, approve new
profiles or change shader/dependency/wire/migration/ordinary-home/release boundaries.

The next validation-GLB connection adds existing hard chroma (softness zero) to
the same editable source slots. Use 01 §4.2 exactly: source linear factor times
texture/vertex contributions (or replacement factor from baseColorSrgb), evaluated
before lighting, with `length(colorLinear-keyLinear)/sqrt(3) <= tolerance` discarded.
Do not reinterpret already-linear glTF factors/vertex colors as sRGB. Inherited
hard chroma is binary coverage; surviving fragments keep alpha one and depth writes.
Source opaque ignores source image alpha. Do not reuse legacy smoothstep/blend
chroma, change the original texture filtering, or admit fractional/soft effects.
The existing explicit opaque+chroma rejection remains; explicit mask/dither/blend
policies remain outside this bounded host's current admission.

Texture-aware verification remains an internal boolean coverage check for an
already known CPU triangle candidate, not GPU ID/depth positioning or automatic
cross-Asset selection. Both CPU ray and GPU check use the same canonical drawing-
buffer pixel center, camera, transforms, material and current token. The probe
renders only that triangle with all original interpolated attributes and the
same sampler/hard-chroma predicate, not the entire Mesh. Use an even-origin 2x2
target and a translated original-sized viewport, retaining the original camera
and derivative-quad alignment without allocating a full-screen target. Only the
probe's final output is a binary marker. Do not change visible-material sampling.
Canonical center coverage is not a guarantee about fractional MSAA edge coverage.

The picker skips proven discarded candidates, then chooses the nearest covered
candidate within the selected Asset. Other Assets' proven discarded faces do not
occlude; covered or unknown foreground does. Existing identity, visibility, sidedness,
clipping and equal-depth ambiguity guards remain. Missing shader support, compile/
context/readback errors and exhausted work are unknown, never transparency. The
development execution ceiling is 128 GPU candidate checks per pointer operation;
exceeding it refuses placement with a visible retry/viewpoint instruction, not a
capacity/latency guarantee. Query resources are transient and disposed on model
change/close; original textures are shared read-only. Restore all modified renderer
state in finally and retain current saved data/drafts after query failure.

Acceptance extends current shader/material/picking tests for the normalized hard
boundary, Standard/Basic source preservation, multiple/normalized attributes,
same-Asset holes and other-Asset occlusion, canonical fractional-DPR sampling,
state/resource restoration, failed readback and the finite-work refusal. Reuse the
existing saved material retry/reopen checks; add no PoC. Actual texture/vertex/mipmap
GPU output and iPhone verification stay pending until measured on the exact build.
No new profile, dependency, package/wire, source relation, ordinary entry or release
permission is implied by this internal coverage implementation.

**S1 metadata foundation — implementation contract (2026-09-11):**

The first reusable source module implements 02 §4 bootstrap and original atomic
history without activating storage or UI. It is an intermediate part of the
approved creation/edit/durable-reopen slice, not a new gate or its completion.
The private adapter profile `lociview-automerge-atomic-map-1` uses pinned 3.4.1
`/slim`: schema/identity are canonical JSON immutable scalars, Project and the
14 record collections are permanent maps created in the first change. Mutable
records have permanent child maps; each whole logical field is one canonical
JSON immutable scalar, and an immutable record is one whole-record scalar.
This is a library encoding, not a package/wire or logical-schema ratification.

All raw operations are validated before last-write-per-field projection. Paths
come from original container birth object IDs and causal ancestry, never from
the library winner tree. Collection replacement and mutable-record deletion,
recreation or competing container creation are outside this physical profile
and rejected, including an invalid edit later undone inside the same change.
Root schema/identity are immutable; the first change contains no Project fields
or records. The external proof binds its exact hash and identity. Initial
contents are a later change; bootstrap alone is not a ready Project.

Canonical scalar decoding rejects duplicate/noncanonical JSON spellings and
preserves unknown scalar siblings/subtrees without rebuilding known-only DTOs.
Every original change byte, dependency, operation ID, absent candidate and
same-value concurrent candidate is retained. The existing candidate/domain
inspectors remain responsible for semantic validity and conflicts; this source
adapter alone is neither a complete content verifier nor write acknowledgment.
Normal Caption text preparation rejects stale tokens and unresolved target or
lifecycle fields. A later ProjectSession must additionally require the full
current provider, write lease, journal and durable barrier before applying it.

Acceptance reuses the existing all-map fixture and neutral history assertions:
empty bootstrap/later initialization; exact-byte reopen and duplicate no-op;
distinct-field merge and explicit same-field conflict; absence/unknown retention;
invalid structure/root proof rejected before projection; bounded configured
input checks. Budgets are caller supplied, not new measured product limits.
Arbitrary untrusted binary admission/worker resource isolation, persistence,
cold content evidence, conflict resolution commands, UI wiring and physical
iOS remain the following S1 work. No saved PoC run is imported or converted.

**S1 persistence connection — bounded implementation contract (2026-09-11):**

New `projectMetadata` service modules may use the existing project-scoped
WorkspaceFS/mutation authority and pinned Repo storage adapter. They remain
disconnected from ordinary entries and existing saved runs. Repo is an I/O
component only: no DocHandle, network adapter, automatic callback acknowledgment
or model/storage fallback. Its hidden `storageSubsystem.loadDoc/saveDoc` seam is
version-local, fenced for the entire write/readback operation, and independently
reopened to compare original bytes and heads. Read-only open never seeds storage.

The private new-workspace creation receipt retains the empty bootstrap and later
initialization changes, withheld from readiness together. It is not a package
batch or an extension of the §8 one-change local-command union. Subsequent Caption
commands use §8's one original change, transaction message, captured durable
dependencies, hashes, byte digests and retained ordinal parts. Their retry never
reinvokes the command. Valid additional local concurrent history is retained and
rechecked, not overwritten or rejected merely for having additional heads.

Append-only internal transaction directories retain staging, verified descriptors,
metadata-durable evidence and a final publication receipt linked to its predecessor.
No rename/overwrite atomicity is assumed. Torn or inconsistent records fail closed;
an unfinished transaction keeps the preceding published snapshot read-only (or
creation incomplete if none exists). A save callback is not publication. Retry
revalidates the complete retained batch, stored source and final content closure,
then independently reads publication back; a repeated completed retry is a no-op.
These private receipts are not ProjectDoc fields or a public wire/version promise.

Persistent content facts are keyed by verifier/policy version, evidence scope,
exact immutable records and context, excluding only the transient metadata token.
The trusted executable byte/profile verifier and verified-inventory/presence port
remain explicit dependencies, never imported metadata authority. Cold hits must
check receipt integrity, exact request, current inventory/presence and current
`checkContentFacts`, then return facts bound to the new token. Missing, corrupt,
suspect or mismatched evidence cannot reuse cached facts. This is not a new
BlobStore, ratified format profile or evidence that real bodies were verified.

Acceptance: initialization and Caption save with independent reopen; pre-apply
and post-save/pre-publication interruption; retained exact-byte retry and no-op;
partial/corrupt journal refusal; missing storage and lost lease refusal; local
concurrency preservation; cold content reuse without body reads and rejection of
missing/suspect inventory. Use existing synthetic fixtures and injected storage
faults. Browser OPFS/IndexedDB wiring, physical iOS, arbitrary untrusted binary
resource isolation, remote exchange and full S1/TEAM-FLOW-01 remain unclosed.

**S1 new synthetic browser host — implementation contract (2026-09-11):**

Use the existing `dev.html?mode=project-scene` entry with a separate explicit
`storage=metadata` option and fresh technical run identity. Never load/convert
the old saved pair or activate ordinary home. A dedicated OPFS root, IndexedDB
database and project-lifetime Web Lock isolate each new run. Existing database
presence is checked before constructing the pinned adapter (whose constructor
can create storage). Missing/partial storage is visible repair, not reseeding.
New creation requires an empty dedicated root; an initial immutable fixture
descriptor precedes body preparation. Creation interruption before a metadata
journal may resume only that exact retained descriptor/known body plan.

The initial records derive independently from the existing two-Scene/two-model/
two-Caption fixture and empty remaining collections. Only exact original triangle
bodies and their existing declared profile are admitted. The application writes
and checks their full BlobRefs and byte digests before publishing immutable local
inventory receipts. Current inventory/presence checks read those receipts and
body file sizes; cached content facts still revalidate exact immutable records
and verifier version. No new generic decoder or media input is implied.

Reuse `createDevelopmentWorkspace` with a narrow `SyntheticAuthority`, not the
PoC flat-history/pair interface. Its synchronous view is the last verified
published provider. Title and body edited together form one original command
and one transaction; they are not separately saved under one Apply acknowledgment.
Scene navigation, camera presets, selection/filtering and comparison windows
remain local viewing operations. This initial saved-service mode exposes only
Caption text writes; color changes, pin/model edits, Scene authoring, material,
media, Saved View authoring and exchange are labelled unconnected and rejected
at handler/authority boundaries. Existing memory/old saved modes retain them.
This temporary activation limit does not delete any product requirement.

The exclusive editor may activate only after fresh saved-state inspection.
A second opener is read-only and never seeds or retries writes. Pending changes
retain old display and explicit recovery; no fake fixture view replaces a
missing provider. Disposal stops new work, drains tracked writes and releases
the lease; pagehide never promises an asynchronous save completed. Unapplied
drafts, active saves and pending recovery retain navigation warnings.

Acceptance combines mounted existing UI with the production service, independent
storage opens, exact dual-field transaction/retry, changed-field persistence,
read-only refusal, cold zero-body verification and local Wasm/module loading.
Browser input/raster, physical iOS and offline/PWA evidence remain separately
required, not inferred from HTTP or memory-backed port tests.

**S1 known PNG extension — implementation contract (2026-09-12):**

Extend only `storage=metadata` to explicit introduction of the two existing tiny
synthetic PNGs. The owned host resolves a selected known ID to its exact record
and bytes. Never reseed an existing run or introduce media on ordinary open.
Under the existing lease, validate intent, write staging intent, persist/compare/
hash the known body and inventory, then author one original local command that
adds the immutable whole-record MediaResource and mutable Attachment. Reuse an
identical existing MediaResource; conflicting content/ID is refused, not replaced.
Description/order edits and confirmed Attachment tombstones are metadata-only.
No endpoint editing, implicit restore, media-body deletion or generic import.

The local journal binds canonical newly introduced/explicitly restaged BlobRefs
into the existing 02 §8 digest. Old private receipts omit this list and continue
to mean the exact empty list; initialization digest is unchanged. In-memory
preparation retains intent/IDs until exact original bytes exist; after that retries
never reauthor. Cold incomplete staging remains visible repair. Prepared recovery
verifies its saved media delta before publishing; it never recreates missing bodies
from fixtures. New content-fact creation is limited to the exact just-staged media,
not enabled for arbitrary existing content. Triangle executor/cache stays unchanged.

This host additionally requests checks for retained unattached MediaResources so
deleting the last Attachment does not create false repair. The opt-in inspection
does not make inactive media a strong reference, package root or GC root. Its
failures remain visible; no unverified diagnostic is simply discarded. The gallery
uses the same provider and hash-checked saved PNG bytes (including cold opens),
not the static source image as fallback. Caption candidate ownership, attachment
availability and delete/edit review are preserved; unknown affected values refuse
commands. Readonly permits gallery viewing, not registration or attachment edits.

Acceptance: add both PNGs to a previously edited run; reuse without duplicate
MediaResources; description/order/delete including the last attachment; cold
reopen; retained ID/original-byte recovery; missing or same-size corrupt saved
image refusal; no extra model-body reads and old mode compatibility. No real file,
new format/profile, dependency, schema/wire, old saved-run conversion, deployment,
browser/native-input/physical-iOS or aggregate G1/S1 acceptance follows.

**S1 typed editing extension — implementation contract (2026-09-11):**

Extend only the new synthetic saved host with existing user-intent commands:
Caption title/body/color edit; manual Asset-anchor add/move; Scene Caption/model
include/exclude. An add creates the permanent Caption field map and its Scene
membership field map in one original change, with empty text and the existing
default color. Moving a pin changes only its atomic anchor; its owner Asset and
frame must remain the same. The explicitly selected current Scene/model/family
must be resolved and included. Confirmation creates source-less manual evidence,
never fabricated mesh/GS picking evidence or inferred owner matching.

The service plans from its own fresh verified provider under the existing lease.
Reuse Scene membership domain commands; an exclusion writes only the chosen
membership lifecycle, not the resource, its other memberships or unknown fields.
Unknown/conflicting affected endpoints, lifecycle, field or semantic duplicate
reservations block ordinary commands rather than choosing a winner. New IDs
must be absent across all physical record maps, including tombstones. Every
command is canonical-cloned, explicitly shaped and field-validated; no generic
patch/import API is exposed through the host. Preserve scalar-field atomicity,
original changes and existing content-fact/marker-last recovery rules.

The old flat UI payloads are only an internal compatibility seam: an exact
allowlisted translator creates typed commands, with selected Scene context.
The new source never adopts or copies a PoC document. Only pin/membership/color
capabilities are enabled; model geometry/placement, Scene creation/rename UI,
material/media/Saved View writes and exchange remain unconnected in this mode.
Newly added Caption owners/templates must come from the verified provider, not
from the two initial fixture IDs. No reseeding, migration or new wire follows.

Acceptance adds the existing host's pin add/gizmo-confirm/cancel, color edit,
shared Scene include/exclude/reinclude, model exclude/reinclude and cold reopen, plus exact-byte
retry and stale/conflicting/rebinding refusal. Existing input and pure Scene
tests remain reusable evidence; actual browser/native input and iOS acceptance
are still separate and may not be inferred from these tests.

The existing Caption membership picker must expose `このシーンから外す` for
an explicitly selected included Caption, beside the non-deletion consequence.
It removes only the current Scene's exact resolved membership and preserves the
Caption and all other Scene memberships. Absent/deleted/unresolved membership,
stale selection, pending drafts, composition or saving refuse this command.
Re-inclusion creates a fresh membership; no tombstone or resource is reused.

**S1 model translation extension — implementation contract (2026-09-12):**

In the same synthetic metadata host, a typed `moveAsset` intent introduces one
fresh immutable binding and updates Asset.status in one original localCommand.
The fresh provider must confirm the selected active Scene membership, Asset,
expected current binding and revision. The new binding has method manual and
parent=current binding, changes only translation, and preserves revision,
rotation and positive uniform scale. Unknown old binding/transform/status,
unresolved affected state, reused IDs or stale context refuse the command.
No Blob is added and no saved model payload is re-read/re-hashed; reuse the existing
retained journal and exact retry without regenerating IDs or original changes.
The tiny known fixture's in-process reconstruction/validation is not a saved
payload read and is not covered by this I/O statement.

Runtime model versions come from the same provider's current binding and exact
known revision/Representation records, never an initial-binding fallback. A
transient Project-frame model-origin translation proposal reuses the pin gizmo's
pointer arbitration and cancellation. Preview moves only the resident transform
and associated visible Asset-anchored pins; source, immutable records and camera
pose remain unchanged. Numeric input is an alternative. Confirm saves once;
cancel restores the confirmed display. Failed acknowledgment retains the draft
and exact prepared binding for retry. Geometry replacement remains unavailable.

Acceptance: preview/cancel without writes; consecutive confirmed moves and cold
reopen; shared-Scene placement with unchanged original Caption coordinates and
memberships; same revision/body and zero extra model-byte reads; failed publication
and exact retry; stale/readonly/conflict/unknown refusal. Existing pointer tests
are reused, with model-target routing added. Actual raster/native pointer and
OPFS/IndexedDB behavior need a later explicit Desktop batch. This does not close
01 §9 alignment, full S1, TEAM-FLOW-01 or physical iOS. Rotation/scale authoring,
model replacement, exchange, undo, Scene-specific transforms and new wire/schema
are excluded.

**S1 M07 rotation/uniform-scale extension — implementation contract (2026-09-12):**

The approved practical-team plan includes rotation and uniform scaling. This
extension supersedes only the preceding M06 slice's rotation/scale exclusion,
in the same new metadata development host and known saved geometry. Existing
memory/old-saved modes keep their earlier authoring capabilities.

A typed `transformAsset` command reuses the complete `moveAsset` authority and
dependency guards but accepts the existing canonical quaternion and positive
uniform scale as well as translation. It creates a fresh manual binding with
parent=current binding and identical revision, then changes Asset.status in the
same journal transaction. `moveAsset` remains translation-only. Unknown evidence,
affected conflicts, stale membership/binding and reused IDs still refuse. Existing
Caption coordinates, surface classes, geometry bytes and Scene membership remain.

The nearby placement controls offer Move/Rotate/Scale with a gizmo and finite
numeric position/degrees/positive-scale alternatives. Rotation is about the Asset
origin, represented in ProjectFrame; degree fields use XYZ Euler input, while
the authored quaternion remains canonical. Reading an unchanged numeric display
must not rewrite its original quaternion. All scale handles propose one positive
uniform scale, never reflection or nonuniform stretch. Invalid numeric input is
retained, cannot confirm and never becomes an invented default transform.

Preview changes the resident model and Asset-anchored pin positions together,
not camera, source/history or saved state. Mode changes, Esc/pointer cancellation,
multiple pointers and lost authority reuse the existing input arbitration; do not
make pin gizmos rotate/scale. Confirm writes once; cancellation restores the saved
display. Failed publication retains the exact prepared binding/original changes
and draft for retry. No additional body read is needed for these metadata edits.

Acceptance reuses existing placement, actual Orbit handler arbitration, mocked
Transform callback and saved-host tests; these are not native browser input:
rotation and uniform-scale preview/cancel, input guards, full preview/clipping/pin
consistency, unchanged source/body/other Scene data, explicit saved status conflict
resolution, two-recipient return, exact retry/cold reopen and repeat no-op. Actual
browser/iPhone input remains in the consolidated batch; no new profile, real-file
activation, arbitrary pivot, M13 alignment/Undo or M14 repair is included.

**S1 Saved View extension — implementation contract (2026-09-11):**

**V04 connection detail (2026-09-13, within the existing stage-2 scope):** mount
the existing solid-background controls in the View tab of the same host. Draft
HEX/picker/standard choices do not change the renderer until explicit apply.
Current background is UI-only and available with read-only Project access; only
View capture/create/update uses the existing metadata commands and journal.
Background and View-author/entry drafts cannot overlap. Draft/composition joins
the existing pending guard for Scene/Project switching and survives failed apply,
runtime loss and stale source. Cancel changes neither current display nor history.

Add a background-only viewport operation, not a camera recall. Validate the exact
solid sRGB value and render plus verify exact read-back inside one rollback
boundary before acknowledgement or Scene-memory/listener publication; retain the previous logical
and rendered background on failure (or report renderer loss if rollback cannot
render). Camera pose/projection/axis, Orbit/gizmo instances, geometry/material and
pin coordinates stay unchanged. The draft source token covers exact background,
not rounded HEX or unrelated camera motion. Clear the draft only after exact
read-back matches the requested background. Use ProjectScene's current initial
`#e8e6e2` as this host's standard; do not change the old Native standard or UI theme.
Unedited high-precision color remains untouched. Unsupported/transparent input
does not become a guessed solid color. Background apply is not a file-save claim.
The host connects the existing pure `ui/projectScene/viewBackgroundState` planner.
HEX presentation stays inside that UI boundary; the viewport adds no direct
Native-controller, Native-storage or background-helper dependency.

Reuse existing background component, recorded renderer, mounted View and saved-
host tests: apply versus draft/cancel, invalid HEX/IME/stale/lost runtime, readonly
local use, camera/control preservation and rollback, View capture after apply,
original bytes on failed View recording/retry, and cold reopen/recall. Recorded
renderer/DOM evidence does not provide native input/GPU/iPhone/offline acceptance;
those remain in the consolidated batch. No new package/schema/adoption follows.

Extend that same synthetic saved host to the already specified View authoring and
entry operations. Typed commands create a fresh Scene-owned View; edit name,
order, or a captured camera/background pair; tombstone an explicitly confirmed
unreferenced View; and set/clear the selected Scene's entry pointer. The source
checks fresh provider, active lifecycle, exact Scene/ProjectFrame and all affected
old field values before one original change. Unknown atomic subtrees and unresolved
affected fields refuse replacement. Creation never sets entry. Ordering uses the
existing exact-neighbor UI planner and token guard, without collection rebalance.
Camera and background capture stay paired in one change, with exact radian FOV or
orthographic span and solid sRGB; transparent background remains unsupported in
this bounded host. No model/Caption membership, body or material is changed.

The defaultViewId wire/domain field is optional, not nullable. Setting adds/updates
that scalar after the existing Scene command validates the reference; clearing
deletes only that optional field in the same permanent Scene map. The UI alone
projects absence to null. Missing/deleted/other-Scene View references and any
unresolved Scene entry that could reference a deleted View refuse ordinary edits.
No new schema or generic delete/patch API follows.

The small host ViewData projection uses provider-owned values and the original
candidate path/changeId/operationId/value-kind sets already exposed by inspection.
Stable sorted candidate identity strings are per-field versions. Never derive
these versions from value hashes, wall-clock time or the whole snapshot token.
An initially unwritten entry and an explicit later absence have different version
evidence. Unknown/unresolved values are not replaced by a winner or placeholder;
only resolved fields become acknowledgment cells. Source/Provider contracts are
unchanged. Recall and camera navigation remain local; setting entry does not
recall it, and refresh does not reapply Scene entry. Read-only openers cannot
author or change entry. The same retained journal owns all save/retry evidence.

Acceptance reuses existing View UI tests and adds new saved-host mounted create/
rename/recapture/order/entry/delete, independent cold reopen and exact-byte retry.
Unrelated Caption edits preserve camera field versions; explicit same-value and
ABA camera changes alter them; conflicts, stale source, cross-Scene targets and
referenced deletion are refused. Actual browser, physical storage/iOS, offline
and aggregate adoption remain separate, not inferred from memory-backed ports.

**S1 material extension — implementation contract (2026-09-11):**

The same new synthetic saved host connects existing Project/Scene material UI.
Three typed commands create a fresh override in one change, replace appearance
only, or tombstone one explicitly confirmed override. Routing/compositing are
not rewritten by editing/reset; permanent records and original bytes remain.
Validate fresh token, active Asset/current verified binding and exact family,
layout and logical slot. Scene scope requires the current active Scene; Project
scope does not require Scene membership. Reuse the verified opaque/surface source
catalogs, without rereading geometry or introducing a profile or binary.

Before every create/edit/reset, inspect all original routing candidates and
reserve every known semantic key. Only a resolved deleted lifecycle releases a
reservation. Duplicate owners, unresolved affected routing/lifecycle/intent,
unclassifiable routing and unknown affected atomic subtrees refuse ordinary writes;
they never appear as an empty slot or choose a winner. Preserve unrelated fields.
Validate appearance/compositing coupling; the bounded connection retains existing
solid color, lighting, sidedness and hard chroma capability, not smooth blend,
dither, soft chroma or transmission. No new renderer policy is adopted.
The current UI authors lighting/sidedness/hard chroma; the typed command also
preserves exact solid sRGB. It does not yet expose a base-color input; adding
that control is a separate bounded UI completion, not part of this connection.

The small host MaterialData projection uses the same provider values for display
and acknowledgment. It retains original routing candidates for reservation;
unclassifiable routes explicitly prevent proving absence, not synthetic targets.
Only exact resolved fields yield acknowledgment cells. MaterialContext identifies
the actual new Project, not the legacy synthetic fixture Project. Existing modes
keep their existing identity. Drafts remain token/selection guarded and exact
failed commands retain IDs and original bytes for retry. Read-only tabs may inspect
targets/scopes but cannot author/reset. Scene overrides replace the whole Project
intent; confirmed reset falls back to Project or source without nested merging.

Acceptance: mounted Project/Scene create/edit/confirmed reset and visible-effect
data, cold saved reopen, no extra model body reads, readonly inspection, exact
failure retry without duplicate IDs, stale/duplicate/conflict/unknown/catalog
refusal. Reuse existing material and viewport tests. Actual raster/input,
OPFS/IndexedDB/iOS and adoption remain separate pending evidence.

**Real-file material conflict continuation (2026-09-14):**

The same Metadata Session gains `resolveMaterialIntent` and
`resolveMaterialDuplicates`. The first names an override, active Scene and exact
original operation IDs for whole appearance and compositing atoms. At least one
atom must be conflicted. An unambiguous atom is retained exactly without a new
field write (its operation ID guards the selected pair); each conflicted
atom requires an explicit choice. Validate the selected pair together and publish
one causal change, so simultaneous conflicts do not require an invalid intermediate
pair. Never synthesize a per-property merge or select a materialized winner.

Require active, known lifecycle and exact routing, active target Asset/current
verified binding and exact family/layout/logical slot with the existing source
semantics. Retain every routing reservation, including potential duplicate owners;
unclassifiable or affected ambiguous/unknown routing refuses. Field resolution may
precede duplicate cleanup, but it neither releases reservations nor guesses an
owner. Unresolved lifecycle, delete/edit and general routing repair stay outside
this unit and remain visible. Unknown/invalid atomic content is retained/refused.

Duplicate resolution names the complete observed same-routing owner set, one
explicit retained owner and a fresh lifecycle event. Require all affected records
to be complete, active and supported. Tombstone only the other overrides with
`conflictResolution`; do not delete records, change the survivor or remap targets.
Scene scope and Project scope are separate keys; whole Scene-over-Project precedence
remains unchanged. Original source and unrelated overrides survive.

The real-GLB host applies its existing exact-slot `validationMaterialIssue`
admission to selected full intents before journaling, including the resolution
port, not only ordinary material writes. No mask/dither/blend/soft/transmission
expansion is implied by the wider metadata schema. UI uses familiar model/surface/
scope labels, no selected default for conflicts, exact command capture and existing
input/IME/read-only/pending/stale/dispose/retry guards. A pure preflight reports an
incompatible selection without entering a persistent retry; the user can choose
again. Duplicate projection DTOs are not candidate readers. Choice alone changes no
material or warm camera/Scene; ordinary editing/reset becomes available after
resolution. Reuse real-file and metadata tests for receive, coupled choices,
duplicate cleanup, normal edit/reset, exact failure retry, Contribution return,
replay and cold reopen. No new PoC, wire, dependency, Native or adoption credit.

**PO-approved practical-team completion and full-source receive (2026-09-12):**
the first completion target is a usable team candidate under TEAM-FLOW-01, with
real files, ordinary Project/Scene/editing flows, five-purpose exchange and
Desktop/physical-iPhone/offline acceptance. Inventory M13 full alignment and M14
visual repair stay required later capabilities, not first-candidate blockers.
The original target was the other 62 inventory groups. The PO's 2026-09-14
one-time cutover withdraws F09, leaving 61 in the practical-team target; this is
a scope reduction, not a completion claim. Initial conversion, real-data,
wire/migration, dependency and release gates remain where still applicable.

First implement `MetadataProjectSession.receiveFullSource(expectedToken, input)`
using accepted 02 §8, not proposed 06 delta/base-completion. Its internal input is
complete metadata bytes plus source proof, declared remote heads and package ID;
the identifier is not authentication or lineage. Copy and bound input, load the
pinned complete source, verify actual root/identity/envelope/DAG/heads, then derive
the complete missing original change set from a fresh durable base under the lease.
Only already verified known synthetic bodies are allowed; validate the detached
final strong/conflict/opaque closure. The existing host also verifies retained
MediaResources; this slice does not claim general weak/historical-media import.
Reject preflight without altering the existing Project or creating a journal.

Add only the remote journal branch: fixed `source-metadata.am`, exact source
descriptor, topologically ordered original parts, expected final heads and the
02 §8 digest. Do not change old initialize/local receipt semantics. Keep source
bytes across retry. Verify source-derived completeness, not only part hashes.
Before publication, current history must be base plus an exact subset of this
batch, then exactly the expected final heads; an unexpected writer is repair.
If metadataDurable was acknowledged, missing acknowledged originals are repair,
not a permission to silently rebuild them. Local retries still permit their
previous legitimate extra concurrent heads. Zero missing changes create no
metadata transaction/publication. No history is rolled back or squashed.

Every pending reader sees only the prior publication read-only. Proper semantic
conflicts remain candidates and block affected operations, not arbitrary unrelated
fields; malformed source/missing required evidence never becomes a winner or a
usable projection. Original source/parts survive failure; cold prepared recovery
uses them exactly and incomplete non-resumable staging remains visible repair.
Extend the existing synthetic host with an explicit bounded receive demonstration,
not a new page or ordinary file importer. Existing source/persistence/host cases
cover retained local changes, linear/diamond DAGs, semantic conflict, preflight
rejection, partial apply, metadataDurable/publication faults, no-op and cold
inventory reuse. One focused independent review and final root checks precede
checkpoint; rendered/device acceptance remains separate. Subsequent slices add
explicit resolution/independent copies and the saved model-update/team loop.

**Next bounded command under the approved resolution contract (2026-09-12):**
`resolveCaptionText` carries Caption ID, `title`/`body` and either an explicitly
selected candidate operation ID or manually combined text. The session token
binds the complete observed candidates. Require active, unambiguous Caption
identity/lifecycle and valid known string candidates; stale/absent/invalid choices
refuse before writing. Normal `editCaption` continues to reject unresolved fields.
One new local causal command observes all candidates, including equal-valued
candidates; selecting the currently materialized value must still resolve the
conflict. Pinned Automerge can encode that assignment as a partial candidate
deletion. The owned explicit-resolution authoring therefore deletes the observed
field and writes the choice within the same original change, exposing no
intermediate absence; the whole-field physical validation remains unchanged.
Losing originals remain, unrelated fields are untouched and unseen
concurrent edits can reopen the conflict. Only manual text is normalized as new
author input. Use the existing local journal/retry, not a new receipt or wire.

Connect comparison/explicit choice/manual text in the same synthetic receive area,
with no default winner and no scalar keep-both. Preserve local drafts; block IME,
readonly and in-flight interaction. Before confirmation name the affected Caption
and field. Memory/DOM tests cover choice/manual/equal values, stale refusal,
failure/cold retry and continued edit; actual rendering remains the batched lane.
Independent Caption/model copies and non-text conflicts remain the next finite
commands, not implied by this text-resolution implementation.

**Caption lifecycle recovery under §3.4/§8 (2026-09-13, implementation detail):**

The existing metadata review area offers a parent-only `resolveCaptionLifecycle`
command for exact `concurrent-delete-edit` diagnostics (including a single current
deleted lifecycle candidate), or a checked current candidate set containing both
deleted and active states. Do not turn an ordinary tombstone/all-active conflict
into a general restore operation. Validate identity, every current Caption field
candidate and historical-invalid/unknown issues without requiring scalar/anchor
conflicts to be resolved first. Invalid history (event reuse, initial after delete,
edit after delete without restore, identity mutation) is not repaired by appending
another event.

The metadata service's existing whole-source admission remains unchanged,
including its unverified-evidence refusals. This command does not broaden weak
surface-index evidence admission or adopt an additional input profile.

Confirmation binds source token, Caption ID, the complete observed lifecycle
operation-ID set and a fresh event ID. Write only Caption.lifecycle: deleted with
`conflictResolution`, or active with `restore`, causally after all current source
heads. Both choices require one new event, never copying an old lifecycle value
or considering keep-deleted a no-op. Retain this command/event and original bytes
across failures; existing journal checks/publication/retry are unchanged.

Before confirmation identify the Caption, show all retained title/body/anchor/
color candidates and list related Scene/attachment/tag records, including deleted
and potentially related ambiguous records. No default choice. Parent restoration
does not revive a child tombstone; unchanged late active edges may become usable
again and must be disclosed. Keeping deletion leaves their orphan warnings. No
source relation is inferred, no child or blob is changed, and no unrelated field
winner/Scene/camera is selected. Invalid/unknown input remains visible with a
refusal, not a partial count masquerading as a complete dependency list.

Keep local drafts and failed/stale choices, guard composing/readonly and refresh
without replacing dirty forms. Scalar resolution stays blocked while the Caption
lifecycle is unresolved/deleted. A restored unplaced Caption is reusable through
the existing explicit Scene-include action (fresh membership, no old-edge restore).
Reuse deletion/metadata-host tests for both receive orders, single-deleted+edit,
delete/restore, unresolved text/anchor, late edges and child tombstones, fresh-event
refusal, failed publication/exact cold retry, return/no-op replay and UI guards.
No new page, storage/wire/profile/home, general restoration/orphan repair or
rendered/device acceptance is implied.

**Saved View conflict connection under §8 (2026-09-13, implementation detail):**

Extend the existing metadata-host comparison form and typed command boundary for
`viewsById` name/orderKey/camera/background and `scenesById.defaultViewId`.
Validate the complete candidate set, exact active identity/lifecycle/Scene/Frame
and every known value. Reject incomplete/unknown candidates or ambiguous/deleted
parents; never offer only a valid subset. Entry candidates may be absent, or name
an active View in that same Scene and ProjectFrame; other unresolved View fields
remain independent and still prevent their affected normal operations.

Choose one original operation explicitly, or enter a name under the existing
View-name normalization rules. No preselected winner. A camera choice includes
position/target/up/projection as one atom; a background choice preserves the exact
solid sRGB atom. Do not mix axes, average values, recapture or extend profiles.
Show human-readable camera/projection and color values; order choices describe
their position among currently resolved same-Scene Views (disclose unresolved
neighbors), not an unexplained internal order key. Entry choices identify the
View or `開始視点なし`.
Use Scene plus View labels throughout; disambiguate repeated names with stable
record-order numbers rather than exposing internal IDs. Only valid resolved
same-Frame neighbors participate in order descriptions.

Resolve only the chosen field causally after all observed originals, including
equal values and absent/absent entry candidates. Keep the same source-token,
original-change journal, one durable publication and exact retry contract. No
warm recall or background/Scene change occurs on choice, resolution or receive;
explicit recall and next-entry behavior keep their existing guards. Keep local
drafts, windows, IME, stale/refused input and failed choices intact.

Reuse metadata-host/View tests: complete/equal/absent choices, normal
rename/reorder/recapture/entry/recall after resolution, other-field preservation,
participant return and no-op replay, exact cold retry, malformed/unknown/parent
refusal, stale/IME/readonly. No new page, lifecycle/ownership policy, general
orphan repair, wire/schema/sink/dependency/profile/home or release change. A
recorded DOM/fake viewport remains non-rendered evidence; the existing browser
and physical-device acceptance batch remains open.

**Scene-name conflict connection under §8 (2026-09-13):**
The existing metadata host adds `resolveSceneName` with Scene ID and either a
selected candidate operation ID or manually entered name. Require the exact
source token, unambiguous active Scene identity/lifecycle without delete/edit,
and all valid known required name candidates. Validate manual input with the
existing Scene-name normalization/length rules; preserve a selected candidate's
exact value. A single existing journaled command removes/writes the name atomically,
including equal-valued candidates. Normal rename still refuses unresolved names.
No Scene selection, order, default, membership, model or Caption field is changed.

Use the existing comparison form, showing all candidate names and no selected
winner. Allow explicit choice or a new valid name, not scalar keep-both. Keep
the explicit development import boundary: that form may use `sceneAuthoring`'s
checked candidate reader and the existing pure `normalizeSceneName` helper, not
new storage/network access. Preserve stale/failed/IME input and block
readonly/in-flight application. After acknowledged
resolution keep current Scene/camera/windows/drafts and allow ordinary rename.
Existing metadata-host tests cover both choices/equal values, manual validation,
return/no-op/later conflict, exact cold retry and invalid/stale/lifecycle refusal.
This is implementation detail of the accepted scalar contract, not a new schema,
file format or lifecycle-resolution policy. Actual rendering/device checks remain
in the consolidated batch; no new PoC or ordinary-home activation.

**Startup Scene conflict recovery implementation contract (2026-09-12):**
Under §§4.1/8, `resolveDefaultScene` selects one explicit candidate operation ID
of Project.defaultSceneId at the exact source token. Inspect every candidate;
require a valid, known required Scene ID and unambiguous active Scene lifecycle
for each target. Never silently omit an unsupported/deleted/ambiguous candidate.
An unresolved name uses a review label, not an invented name or a guessed Scene.
One local causal command removes then writes the selected whole scalar in the
same original change (also for equal values). Normal setDefaultScene still
refuses a conflict. No new wire, header field or journal branch is introduced.

At cold open in the existing metadata host, inspect the published startup edge
before constructing SyntheticSession. If it conflicts, show all candidates and
explicit selection in that same host; do not open the first Scene. Mount the
workspace only after acknowledged saved resolution. A warm workspace keeps its
current Scene, camera and draft objects; resolution changes the shared next-open
default, not local navigation. Refuse confirmation during another pending input,
composition, readonly, stale source or save; retain selection until explicit
cancel or successful acknowledgement. Failed publication keeps the exact journal
and selection; retry restores those original bytes, never regenerates a choice.
Dirty choices participate in refresh/leave protection. Dispose prevents late
callbacks from remounting, while host disposal still waits for active storage.
Distinguish a saved semantic conflict from incomplete or failed persistence.

Reuse existing host/DOM acceptance: cold conflict -> explicit choice -> saved
startup, warm local-state preservation, both candidate orders/equal values,
normal-write/stale/invalid/readonly refusal, failed save and exact cold recovery,
returned resolution and replay, and no post-dispose remount. Unknown/missing/
deleted/default lifecycle repair and Scene-name/View resolution remain outside
this command, with no silent fallback. Real input/raster/device acceptance is
still the consolidated lane; ordinary home and real-data gates are unchanged.

**Independent Caption membership resolution implementation (2026-09-12):**
`resolveCaptionMembership` carries Scene/Caption IDs, the complete observed active
edge IDs, explicitly selected original edge, `one`/`both`, a fresh event ID and
the complete source-edge to fresh Caption/edge/attachment/tag-membership ID maps.
Recompute reservations from complete current candidates, including edges omitted
from normal projection by duplicate-key review. Unknown/ambiguous endpoints that
could reach this key block this resolution; unrelated proven-different keys do not.
Keep-one tombstones only the other observed edges. Keep-both also copies each
other edge's confirmed Caption content into an independent resource in this Scene.

Copy complete current fields, preserving optional absence. Unknown or unresolved
copy fields/dependencies fail closed rather than being omitted or copied as a
materialized winner. Copy active attachments/tag memberships under fresh IDs;
retain immutable MediaResources, Project tag definitions and exact anchor ownership.
Preserve attachment ordering, assigning ordered keys only if fresh-ID tie-breaking
would otherwise change equal-key order. All outputs and graph/content closure
validate before one local journal publication. Repeated retry uses the original
generated IDs/bytes; replay adds nothing and a later unseen edge can conflict again.

The same development host exposes a labelled synthetic membership update plus
comparison/explicit original and keep-one/independent-both choices, showing the
original's other Scene references before confirmation. Text conflicts must be
resolved before copy; this command is not scalar keep-both or general duplication.
Existing memory/old saved sources are evidence only, not implementation imports.
Reuse saved host/media/failure ports for the new command's acceptance.

**Scene authoring implementation boundary (2026-09-12):**
The same metadata development host may expose §4.2 create, rename and explicit
Project-default commands. Each carries an exact metadata token and typed intent,
not a UI-to-storage patch. Creation names the current source Scene, fresh Scene
and membership IDs and lifecycle event. Check complete source membership
candidates, including unprojectable endpoints, before calling the existing Scene
planner. Unknown or conflicting source membership never becomes a partial copy.
Persist only the new Scene and its active Asset edges in one original change.
Rename checks the exact active Scene and resolved name. Set-default checks the
exact active target and resolved Project default; write only project.defaultSceneId
through a dedicated header edit, preserving all other Project header fields.

Use compact controls below the Caption-tab Scene selector. Creation explains
that the Scene's models are inherited but Captions are not. Scene names are
explicit nonempty input. Pending/composing input, stale selection, readonly and
failed saves retain their existing guards. Allocate fresh IDs once per confirmed
command and reuse original bytes for retry. After publication, initialize local
memories only for newly observed Scenes, including received Scenes; preserve all
existing Scene memories. Successful creation may select the new Scene through
local navigation, never by changing the Project default. Default changes do not
switch the current Scene; a cold open follows §4.1, with no inferred fallback.

Reuse Scene core and metadata-host tests: create, register a Caption, rename,
set-default, reopen and two-party receive; untouched source/other resources,
stable copied membership order, original-ID/byte retry and incomplete/stale/
conflicting-source rejection. No Scene delete/reorder/general-duplicate UI,
new Project catalog, real-file activation, new schema/wire or device credit.

**Caption position/color resolution implementation boundary (2026-09-12):**
Under §8 the existing metadata host may select a complete `anchor` or `colorSrgb`
candidate with exact source token, Caption ID, field and candidate operation ID.
Require complete valid known candidates and active unambiguous Caption lifecycle;
delete/edit ambiguity is not a field-resolution action. Preserve optional color
absence as absence, not a default value. Use one original causal change after all
observed candidates, even when the chosen value equals the library's winner.
Keep other fields, attachments, Scene membership and original history unchanged.
For absent/absent color candidates, the pinned adapter must still emit a causal
field write: set a valid scalar then delete it inside the same change. Only the
final absent write is projected; original bytes retain both operations. A bare
delete or an empty change is not resolution. In the existing synthetic host,
resolved absence uses its existing standard color for display only, with a
separate unset marker. Ordinary text edits must not persist that display color;
explicit color input must remain distinguishable from absence.

Position choice preserves the complete authored owner/frame/revision/class and
optional evidence; it does not combine coordinates or infer a model relation.
An older authored compatibility class may remain needs-review after selection.
Existing manual pin correction handles the next user action, not resolution.
Only a labelled noninteractive preview may show a candidate in the existing
viewport before confirmation, with the current exact visible owner's transform.
If its frame/owner is not available, explain why no preview is shown. Preview
does not switch Scene, reveal a hidden model, alter camera or become a saved pin.

Reuse existing comparison and saved-host tests for explicit/no-default choice,
full candidate/absence retention, stale/unknown/lifecycle refusal, same-original
save retry/cold reopen, normal editing after resolution and two-person return/
replay. No new ProjectAnchor/unplaced authoring, general re-anchor or schema,
new wire/body input, separate PoC or intermediate human gate is included.

**Real-file field-resolution connection under §8 (2026-09-14):**
The limited GLB/PNG validation workspace uses the same full field forms above,
not only Caption text: anchor/color, Scene name/entry View, and View
name/order/camera/solid background. No new command, source schema or file profile.
Capture the complete typed command and token when confirmation is pressed;
failed work must not reread mutable controls on retry. All forms contribute to
the existing Session/file/Project/mode/IME/readonly/stale/dispose guards.
Anchor comparison checks the current visible owner, without revealing hidden
models or claiming internal resume data is a saved external file. Warm receipt
and resolution retain Scene/camera; Project startup-default recovery remains
the existing separate cold-entry control, not a guessed fallback.
Reuse field and real-file tests for complete/absent values, no preselected
winner, read-only preview, exact retry, subsequent edits and Contribution
return/replay/cold reopen. Recorded DOM and injected viewport evidence does not
close browser, physical-device, offline or normal-entry adoption.

The real-file return check found an existing encoding defect: entry-absence
resolution wrote a temporary `null`, which 06's original-history summary correctly
rejects. Optional View references remain absent, never nullable. For the causal
set/delete needed by absent/absent resolution, reuse an exact valid View ID already
written at that same Scene's defaultViewId address in complete original scalar
history, including same-change overwritten writes. It is immediately deleted in
the same new change; no reference/default/candidate is published from that witness.
Do not create a phantom ID, choose another Scene/View or weaken historical-value
checks. Bound the original inspection by existing metadata limits, and refuse
before mutation if no such witness exists. Already invalid original changes stay
untouched and fail existing package inspection; this repair is not a migration.

**Model membership resolution implementation boundary (2026-09-12):**
The model-membership keep-one command follows §8 independently of keep-both:
`resolveAssetMembership` carries Scene/Asset, all observed active edge IDs,
explicit original edge and an event ID. It tombstones only the other observed
edges in one original change. Unknown endpoints that could reach that key and
unresolved edge fields reject; no inferred winner or geometry/Caption deletion.
An incomplete copy implementation must not be offered as a successful keep-both.

Next bounded keep-both implementation rebuilds only the confirmed active editable
closure of the exact known triangle. It is not a historical clone. The new
Asset's fresh root binding preserves the source's current numeric transform and
`method`, but has no `parentBindingId` pointing back into the original Asset.
The original Asset, its complete binding history and all original Caption anchors
remain unchanged. This implements §8's independent active-copy semantics; it is
not permission to remove a parent from existing records or omit unknown source/
proxy/compatibility relationships. The fixture's parent→method default must not
silently change a copied manual placement to import. Current fixture revisions
have no revision parent; unsupported relationships block the copy until their
complete remap exists.

Carry a complete fresh map for Asset/frame, binding/revision/Representation,
family/compatibility, material layout/slot, Scene edge and any effective material
override. Keep numeric frames, source semantics, profile and BlobRef unchanged;
recompute immutable metadata digests and validate every output. Re-key the
confirmed effective Scene-then-Project material as a Scene override for the copy.
Do not redirect other Scenes or existing Caption anchors.

Fresh Representation IDs require their own content requests/facts; a receipt
keyed to the original record cannot become a receipt for the copy. Use a bounded
owned new-record fact-preparation port with a read-only complete `base`/`next`
plan. Only IDs absent from the base's complete original history qualify. Validate
the complete exact known rekeyed record and existing durable blob inventory;
unknown fields/profiles/relationships, new body bytes and existing missing facts
do not gain a replenishment path. Limit fact creation to the new requests, never
pass allow-new-evidence to the complete final provider. This does not adopt a
general importer, a fact-transfer wire or a new persistence receipt format.
An introduced record retained only in weak inactive history does not create a
new body-read requirement: prepare only requests required by the complete final
provider. Initial seed preparation still matches exact declared records/owners;
an executable-body match must never substitute a different seed Asset's IDs.

Local and remote operations retain exact prepared original changes/full source
before staging these facts under the existing journal lease. Validate the final
candidate with ordinary no-new-evidence checks before publication. Same-writer
preparation retry uses the retained plan/IDs/bytes; after the prepared journal
marker, all retry/cold reads verify only already stored evidence. An incomplete
preparation after cold interruption remains explicit repair, not silent rebuild.
Use existing saved host tests for local independent move/material edit, two-party
return/no-op/cold reopen, retry and missing/unknown evidence refusal. No new PoC
page or intermediate human gate is needed for this synthetic-only command.

The validation-file connection applies this same independent-copy command to its
already admitted static GLB closure. Preserve every material slot, not just slot
zero. The internal command carries one explicit source-slot → fresh-slot mapping
and a fresh override ID or null for each slot. Rebuild and seal the exact active
records, preserving BlobRef, source locators/semantics, profile, numeric frames,
placement and provenance. Use the complete effective Scene-then-Project override
per slot; a Scene override replaces the whole Project override, not selected fields.
Unknown/incomplete closure or ambiguous material intent blocks copying, not keep-one.

Fresh copy facts may inspect only verified-present bodies already declared by the
base Project; no file selection, new body spool or duplicate payload is required.
Prepare requests for each new Representation, including more than one copy, with
read-only inspection. Stage only these fresh facts under the existing journal and
use ordinary no-new-evidence checks for old records and after Prepared. Preserve
exact IDs/changes/fact acknowledgements on retry; missing acknowledged bodies or
facts are not reconstructed. Locally selected new-model input remains a distinct
owned path and cannot serve as a substitute for missing existing content.

Acceptance reuses the existing file/keep-both/facts suites: explicit original and
copy choice, multi-slot material preservation, independent copy-only placement,
material/model update, unchanged original/other-Scene/Caption references, return,
replay/cold reopen and interrupted retry. No general copy, new profile, wire/schema,
Point/GS/Proxy expansion, normal entry or measured adoption is claimed.

**Bounded prepared-revision implementation (2026-09-12):**
The already-approved synthetic metadata host may prepare its two known geometry
versions before initial publication. Active seed Assets remain on the initial
version; a separate immutable prepared catalog carries the additional revision
and Representation. In the initialization write lease, retain exact declared
body bytes/inventory and verify both active and detached updated candidates
through the existing provider/content verifier, then publish only the initial
seed. Old seeds/runs must not gain records, bodies or facts by reseeding on reopen.

`activatePreparedRevision` is an explicit local command with Scene/Asset IDs,
expected current binding, selected stored revision and a fresh manual binding.
Require exact current resolved ownership/placement and known complete target
records. Preserve the current asset-to-project transform and every Caption
anchor/text/attachment/Scene membership; author a fresh binding plus Asset status
in one original change. Later reads/edits/receive keep new-evidence permission
disabled: missing target facts fail closed. Reuse existing model choice/confirm
controls; different compatibility keeps pins needs-review until explicit manual
correction. Confirm update/cancel, all-Scene effect, pin correction, retry/cold
reopen and full-source two-party exchange without new body reads or source reset.
No user-body importer, new wire/delta/base receipt, general revision manager,
same-surface assertion, content-evidence format change or real-data adoption.

Implementation clarification for retained inactive revisions: a provider DTO is
only active-display authority, not a source-record preparation DTO. A future
activation target is read from complete equal valid known immutable candidates;
no ambiguous value is selected. Before journaling, its activated candidate must
pass all current provider/content checks. The new metadata service may retain
the exact `verified-profile-content-bounds-catalog-required` diagnostic for a
Representation outside the complete known active strong closure without treating
the whole Project as unready. All executed checks, unknown/invalid and other
unverified issues remain blocking. This does not verify an inactive body, grant
display authority, add a GC root or request weak historical bytes. Domain provider
projection remains unchanged. Initial detached target verification supplies facts;
normal activation/receive/reopen cannot manufacture missing facts.

Implemented evidence is limited to the synthetic metadata host and storage/DOM
ports: prepared original/updated activation, explicit pin correction, two complete
source exchange rounds, old seed preservation, local and remote publication retry,
replay and cold reopen. It does not close file purposes, exchange-base/delta,
real-data, rendering/device/offline gates or the whole practical-team candidate.

**Next finite command under §8 — explicit active-model conflict choice:**
For a same-Asset `status` conflict, compare all complete valid known source
candidates and their verified binding/revision/placement, with no initial choice.
`resolveAssetStatus` carries the exact source token, Asset and selected candidate
operation ID. Require resolved active lifecycle, all observed valid candidates
and their required stored content; reject unknown/incomplete/stale choices before
journaling. Assign only the selected complete status after every observed change
in one causal command; no new binding, combined placement or inferred pin repair.
Retain original candidates/history, Caption data and all Scene references. Use the
existing service, conflict controls and exact retry path. Acceptance covers two
prepared update/placement branches, no authoritative model before selection,
explicit whole-Project selection, failed-publication retry/cold reopen/no-op and
an unseen later candidate reopening conflict. Independent model copy, general
lifecycle resolution, body introduction, wire/migration and ordinary activation
are separate subsequent work.

The initial status-resolution implementation is limited to competing `ready`
bindings of active Assets. Unresolved-source statuses or lifecycle conflicts are
not silently converted to a ready model; they retain diagnostics and require
their later typed repair/resolution path. A labelled synthetic model-receive demo
may branch from the saved original seed (never the edited receiver) and retain
its exact source in the existing remote journal. If that seed has no prepared
updated revision, reject without replenishing it. Compare all candidates separately
from the authoritative viewport; show model/placement and all-Scene impact, select
no candidate by default, and retain stale/failed/IME-protected choices. No preview
is to become the current Asset before the saved causal choice is confirmed.

The validation-file connection extends this same command to received static GLB
candidates admitted by the existing content/profile checks. Reuse the conflict
controls with the opened host's limits and Session-owned input guards. An explicit
`候補 N を表示` action prepares one exact candidate Representation and binding
placement in a separate read-only viewport; it selects no resolution by itself.
The preview uses source materials and says so; it does not apply Scene overrides,
show pins, create gizmos, or attach edit/pick callbacks. The current Scene and Asset
projection remain unresolved until the explicit causal choice is acknowledged.

Use existing readonly render DTO/resident/viewport ports and verified read-only
body access, never synthetic model reconstruction or an alternate mutable Project.
No model is decoded merely by listing candidates. Release a superseded, cancelled,
stale or disposed preview, including late asynchronous completion. Show missing
body/renderer failures with retry; do not substitute old cached geometry. Capture
the exact token and operation before apply, retain selection on failure and reject
stale/IME/file-input/read-only mutation. Existing publication/display retry owns the
original changes. No new history, wire/profile, general revision browser or model
copy policy is added. Contribution retains its existing strong closure: original
history retention is not a promise to send every losing weak body to a new recipient.
Acceptance reuses real-file conflicting GLB updates, all-Scene suppression/choice,
local Caption/media preservation, isolated preview/disposal/failure, exact retry,
Contribution return/replay and cold reopen. This is not live/device/adoption evidence.

The continued-edit flow must not reject adding media/models merely because an old
weak model is outside the active display projection. Capacity accounting reads
complete known immutable source blob declarations, counts each digest once and
rejects inconsistent sizes/unknown records. It does not read or restore old bodies,
make them display-authoritative, or change the existing validation capacity ceiling.

### 13.3 Approved scheduling exception — validators and UI components (2026-09-08)

The PO explicitly approved advancing storage-neutral data validation and reusable
UI components while the required storage/platform evidence continues separately.
This extends only implementation scheduling beyond §13.1; it does not approve
the proposed package companion, adapter adoption or existing-app activation.

Production-quality pure domain validators may implement the accepted Project,
Scene, resource, frame, anchor and conflict rules in specifications 01/02/05.
Reusable UI components may consume explicit synthetic/conflict-aware read ports
and emit intentions to a test host. Neither connects to real Projects, storage,
package readers/writers, model/media payloads or the current application entry.
No synthetic action acknowledges a durable save or claims actual team exchange.
Existing Native presentation primitives may be reused without importing their
storage/controller side effects. No candidate dependency or renderer is adopted.

Work in bounded reusable modules, not another disposable probe application.
Admission of a record is not admission of a whole Project: report which structural,
reference, causal/conflict and blob checks have actually executed. Never brand a
partial record validator as a complete validated SceneResources provider.
Unknown minor subtrees remain preserved; invalid data, unavailable required
checks, semantic conflicts and unsaved state stay distinct. UI validation and
temporary selection never choose a conflict winner or infer source relations.

Acceptance is proportionate to each component: exact domain rules and malformed
input/refusal, retained unknown data, side-effect-free operation and absence of
imports from current entry paths; UI intentions, selection/mode/unsaved-state
preservation, accessible concise labels and rendered evidence where available.
Synthetic component/DOM tests are not browser, storage, integrated UI or iPhone
PASS. Missing browser/device evidence stays pending without forcing repeated
unchanged manual probes before continuing another authorized pure component.
After this exception, production storage/UI integration still follows §13.2's
gates. The later §13.4 permits earlier connected synthetic development delivery.

### 13.4 Approved sequencing — thin whole workflow first (2026-09-09)

**PO-approved (2026-09-11): isolated saved-development
mode in the same host.** The PO approved the proposed opt-in addition; the
default page-memory mode below remains available. The service connection at `2abb57a` permits a
finite next step without pretending that product adoption has passed: add an
explicit opt-in to save/reopen only the same synthetic two-participant workspace
in dedicated development storage. Keep the current memory mode and ordinary
home unchanged. No existing v1/Native Project or arbitrary user file is admitted.

Reuse the existing BrowserPorts, full development-source service,
command encoder and shared UI. Do not create a new probe page or parallel UI.
One bounded implementation connects initialization → confirmed local edits →
two-participant receive/explicit conflict choices → reload/reopen → recovery.
Initial and subsequent publication must await full domain/guard and actual-CAS
checks. Both participants' exact original histories and their separately recorded
exchange bases survive restart. Only acknowledged published heads are UI authority;
unfinished journals expose the old view and a visible recovery state. A failed
write retains the same draft/change bytes, without an implicit memory fallback,
silent reset, automatic winner or data clearing. Do not label these saves as
ordinary production Project durability.

Implementation boundary: retain a closed development pair manifest with two
distinct participant locators, stable actor IDs and separate fixed exchange-base
heads. The shared full seed has only the immutable service foundation control;
do not introduce source-managed/birth registrations without their corresponding
atomic UI choices. A pair-ready marker follows both validated initializations.
An incomplete initialization is a visible failure, never permission to reseed.
Before journal side effects, retain the exact authored source plus a bounded
working descriptor. Local resubmission may reuse an unowned staging transaction
only with its original transaction ID, target and exact base dependencies; it
never reauthors the change. Remote retry retains its exact source. Reopen exposes
pending work explicitly and only publishes the journal's acknowledged view.

Reuse the latest mounted team/pin/model/media/view/material tests and the 135
isolated service/journal checks. Add only the missing host/persistence seam and
one connected saved two-round/reopen/retry check, then batch native browser input
verification. Browser input and actual storage receipts remain separate evidence.
The explicit candidate flat-root profile remains distinct from product bootstrap
and format adoption. Runtime adoption, real data/import/export, portable migration
artifact/recipe/wire, main/release, PWA/offline and physical-iPhone gates are not
waived by approval of this development-only mode. The complete product/UI goal
remains open after this intermediate connection.

**Bounded code connection (2026-09-11):** `development-saved.ts` and
`development-saved-browser.ts` now connect this opt-in to the existing entry,
team workspace and acknowledgment controls. The default mode remains memory-only.
Node-backed saved-driver tests cover two rounds, explicit choices, original-byte
reopen/replay, pre-prepared/durable interruption, mounted recovery, descriptor
replacement failure and uncertain cleanup response. They do not execute the
browser pair manifest or prove actual OPFS/IndexedDB persistence. The permitted
browser-control bootstrap failed before selection. Separately, after the module
loading correction at served `f341833`, the PO reported all four prescribed
Desktop groups PASS: distinct-field edits/two-way receive, same-URL reopen for
both participants, explicit concurrent-title selection/propagation, and replay
with unchanged content/count followed by final reopen. This closes the limited
manual saved-host batch, not host fault injection, cross-tab/process behavior,
physical-device acceptance or full `TEAM-FLOW-01`. No product adoption, general
file exchange or offline/PWA claim follows from this receipt.

**PO-approved Scene-first interaction amendment (2026-09-10, from `4ad055c`):**
in the same synthetic development host, replace required model preselection for
new Caption placement with explicit selection of a visible resident surface.
This supersedes the preselected-model input restrictions in §4.3 and the earlier
§13.4 additions below, not the AssetAnchor/owner contract. `ピンを追加` arms local
surface selection; Shift+primary click can select a surface directly. Resolve
only a unique visible front hit from the currently verified resident models.
Same-depth ambiguity, unsupported/hidden surfaces, miss, stale snapshot/camera,
cancelled drag and multiple pointers must not invent a target or create a Caption.
Show the exact chosen target beside the provisional position; existing gizmo and
explicit confirm/cancel continue. No automatic source/family relation, owner rebind,
ProjectAnchor fallback, schema or storage change. A non-pointer target/coordinate
alternative may stay in contextual progressive disclosure, not the normal entry.

`位置を調整` operates on the selected Caption's existing owner/current position;
it does not ask for add-target selection. Compatible moves start the gizmo at that
position without a surface re-pick. Incompatible model updates still require
current-surface review. Pending/failed work and exact retries stay intact.

Use one shared Scene navigation state with a Scene list at the top of the Caption
tab and current-Scene context in other tabs. This supersedes the shared-header
placement requirement only; Scene effects, valid entry view and draft guards stay.
Ordinary Caption browsing uses Scene, search and direct color circles, not model
classification. Color filtering applies to list rows and pins together, without
changing selection, open windows, membership or history; unknown colors remain
discoverable with diagnosis and a filtered selection has an explicit reveal path.
Everyday owner filters/subtitles are removed; hidden/missing owner recovery stays.
Place secondary window tools in the right Caption panel, outside the 3D stage.

Acceptance: no preselection for button/Shift add; exact picked owner through confirm,
cancel/retry and later model movement; overlap/miss/stale/drag/multitouch rejection;
existing-position move without repick and no automatic rebind; Scene buttons and
tab context with pending guards; list/pin colors with unknown and reveal recovery;
window tools in sidebar with existing close/reopen/draft behavior. Reuse the PO's
five-group `7540478` PASS only for unchanged behavior. New native rendering/input
and physical-iPhone evidence remain pending; no general model/file/storage claim.

The PO chose to assemble a thin, usable whole before refining each subsystem.
This supersedes disconnected component expansion as the default next work and
the former hold on an early synthetic development host. It changes delivery
order, not the product contract, migration/wire ratification or technology gates.

Use one reusable development integration host, reached by an explicit nondefault
mode of the existing `dev.html` entry. Reuse the Scene core and UI components;
do not create a parallel UI implementation or a succession of disposable pages.
Start with a fixed synthetic Project containing two Scenes, shared Captions and
two model resources. The host must not open existing v1/Native Projects, touch
their storage, or become the ordinary home entry. Its synthetic read projection
is not a serialized schema or proof of full untrusted-Project admission.

Deliver three connected milestones in that same host:

1. **Workspace loop:** select a Scene, inspect/edit a shared Caption, include or
   exclude a model, and return to the first Scene. Connect the shared header and
   four task tabs, preserving per-Scene selection, drafts and temporary filters.
   Revalidate snapshot-bound intentions before applying to in-memory synthetic
   state. Pending input must be finished or explicitly cancelled before a Scene
   switch when the existing navigation contract requires it. Model exclusion is
   membership-only, not resource deletion. Expose unconnected renderer, media,
   view or material effects honestly; a button or static placeholder is not a
   completed operation. Page-memory changes are explicitly unsaved and lost on
   reload, never acknowledged as durable Project writes.
2. **Continuing-team loop:** extend the same host toward §12.6's two-participant,
   model-update, retained local work, explicit pin correction, conflict choice
   and second-round flow. Connect genuine operations through the appropriate
   service ports; do not simulate successful merges by replacing snapshots or
   choosing winners. Candidate-adapter experiments remain isolated, using the
   existing pinned scope; do not copy PoC code into production or adopt a
   dependency implicitly. Unconnected operations remain marked pending.
3. **Durable product loop:** after the applicable §13.2 prerequisites, connect
   the production provider, storage, import/export and recovery services to the
   same workflow. Complete both service-level and ordinary-UI `TEAM-FLOW-01`,
   including restart/offline reopen and physical-iPhone evidence. Synthetic
   development execution does not waive those requirements or pass S1–S3.

Track coverage by user operation as implemented, connected and verified, with
the remaining gap explicit. The whole scope includes the existing accepted
conveniences: direct pin-color filters, retained comparison windows, media,
viewing presets/Saved Views, model and material controls and the five package
purposes. Delaying connection or polish does not remove those requirements.
Each milestone may take bounded commits, but each commit must advance this
shared workflow rather than merely add another detached component.

Use focused tests while connecting; run the required full checks on each final
executable checkpoint and reuse unchanged evidence. Batch human browser/device
checks at meaningful connected outcomes. Correct loss of work, invalid references,
hidden unsaved/failure state and unsafe conflict handling immediately; defer
nonblocking visual polish. A required gate/ratification blocks its actual
activation, not unrelated authorized development. Before such a boundary,
report the exact missing prerequisite instead of inventing substitute work.

**New-Caption connection amendment (from `f567884`):** within this synthetic
host, the existing add-pin intent uses an explicitly selected, included model
with a verified projection, AssetFrame XYZ and a chosen current surface class.
Empty coordinates are not origin defaults. Confirmation authors one fresh
Caption with explicit immutable creation owner/frame and `initial` lifecycle,
empty title/body, existing muted gold pin color `#a08045`, an atomic manual
AssetAnchor and exactly one current-Scene Caption membership. These values are
authored before original candidate changes, not supplied by a read-time fixture
template. Existing Captions, model membership and other Scenes do not change.
The creation sidecar is development command metadata, not a new persisted schema.

Creation and membership are one causal command. Snapshot/target/IME checks and
the common acknowledgment apply. Cancellation before confirmation creates
nothing; pending/failure preserves the proposal and exact staged IDs/bytes for
retry. Only confirmed publication selects/opens the new Caption. Any active
list filter remains unchanged; report if it hides the new selection. Later edits,
media, Scene inclusion, explicit conflicts and keep-both copies of that Caption
must use the same existing paths. Copy lineage may terminate at a declared new
Caption, never at an invented initial fixture. Known anchor admission uses the
declared owner/frame and exact known model closure history, including model
copies, without owner rebinding or coordinate remapping.

Acceptance: create/edit/receive; cancel with no change; stale model, incomplete
coordinates, IME and failed admission retain work; retry creates one Caption and
one membership with the same original change; copy the new Caption via explicit
duplicate-membership review, edit independently and exchange a second time.
This bounded step is manual coordinate authoring only. Direct viewport picking /
preview is the next interaction connection. Real files/storage, durable save,
Native activation, general model admission and browser/device credit are excluded.

Observed bounded result: the source command and mounted host now implement that
manual-creation path. Original-parent checks require a unique already-included
model, current frame/revision/class and exact manual evidence; they do not run as
an aggregate-receive rule that would reject later Scene memberships. Mounted
actual-candidate tests cover creation/retry/edit/exchange, filters, stale target,
independent Caption/attachment copy and creation/correction on a model copy.
Focused refusals cover partial creation, duplicate initial membership, wrong or
stale owner evidence, missing manual evidence and identity mutation. Read-only
review cleared the missing-evidence fix. Executed scope is code/mounted only;
direct viewport picking, browser/IME/device and durable/file gates remain open.

**Direct-position connection (from `b04cd43`):** the same host may propose an
AssetFrame position from its exact resident opaque fixture triangle under the
explicitly selected model. Use the current rendered mesh, sidedness, constant
material visibility and camera clip; unrelated opaque surfaces may reject an
occluded candidate but never become the selected target. No unrendered/unsupported
model, hidden owner or automatic family/model relationship participates. The hit
is transformed from ProjectFrame through inverse Asset-to-Project exactly once.
The resident Representation identifies its current family/class; it is not guessed
from geometry or names. A preview and the numeric XYZ editor share one transient
candidate. Confirm uses the existing complete source-less `manual` anchor, not
saved triangle/source/normal provenance. Cancel and failed admission keep their
existing meanings; preview never writes history or replaces the confirmed marker.

Bind pointer start/end to the same Scene/model snapshot, camera, viewport size
and position, and active renderer instance. Accept a primary unmodified pointer
release only after OrbitControls has ended; reject actual camera change, movement
over a development-only 4 CSS-pixel click slop, multiple pointers, cancel/lost
capture and stale/hidden/context-loss transitions. Click slop is a transient input
implementation detail, not a ratified picking-radius/performance guarantee. Keep
numeric input as a non-pointer path; no requirement becomes drag-only. A miss
retains the previous candidate and reports that it was not changed.

Acceptance is exact CPU triangle intersection plus existing DOM/controller tests:
nonidentity Representation/Asset transforms, perspective/orthographic clip and
backface/material/occlusion rules; rejected drag/multi-pointer/stale gestures;
preview -> numeric correction -> confirmation or cancellation and exact retry.
GPU/native input and physical-iPhone acceptance remain the batched external lane.
This adds no general profile, GS/Point/proxy/gizmo support or storage activation.

**PO interaction correction (from `56bbeb3`):** the previous bounded exclusion of
gizmo/Shift input is superseded for this development host. Before resuming human
tests, connect existing Three.js translation handles to the provisional position.
Axis/plane/screen translation changes only the proposal, including off-surface
positions; explicit confirmation still writes one complete manual AssetAnchor.
Convert ProjectFrame to AssetFrame once. A current compatible move retains its
class; needsReview still requires an explicit current surface selection, never
cleared by coordinates alone. Orbit is disabled during handle manipulation;
cancelled drag restores its initial proposal, final cancel restores the confirmed
pin, and failures retain exact proposal/change bytes. Stale owner/source, hidden
host and context loss detach interaction without publishing.

Shift+primary click on the explicitly selected added-to model starts the same
add proposal; during placement a surface click or Shift+click repositions it.
Keep release/movement/multi-pointer/stale guards, reject other modifiers and
exclude gizmo handles from the surface action. No inferred model relation or
instant durable addition. A normal add button plus surface tap remains available.
This supersedes the earlier wait-for-Orbit release routing. The PO's follow-up
camera-conflict report requires primary placement sequences
to be reserved on pointerdown, including Shift addition before a preview exists.
Orbit must not begin rotation/pan for that sequence, including rejected movement
or additional pointers. Compose the reservation with gizmo activity; releasing
one must not override the other. Release/cancel/hidden/dispose restore ordinary
camera availability. Never weaken source/pending checks or rely on a microtask
running after native bubble listeners. Regress actual Orbit handlers as well as
the existing authored-controller tests; native browser acceptance remains separate.
Add/move and finish/cancel stay adjacent to the stage outside the detail scroller;
numeric editing is collapsed supplemental UI. The right task area contains list
and detail without shrinking the form into nested one-line scroll areas. Expose
the existing open/retain comparison-window actions; no new window semantics.
Acceptance reuses current session/history/window tests and adds handle transform,
cancel/stale/Orbit lifetime, shortcut and layout-ownership checks. CPU/DOM evidence
is not native rendering/touch/IME acceptance. No new files/storage/profile gate.

**PO navigation/window amendment (from `d0ac27c`):** in this same development
host, use Blender's basic Desktop bindings: MMB orbit, Shift+MMB pan and wheel /
Ctrl+MMB zoom. Left/right mouse drags do not move the camera; left/Shift+left
remain available for explicit selection/placement, with existing reservation and
gizmo ownership. Preserve touch input and camera/frame/storage semantics. Other
Blender navigation/keymap modes are not claimed by this bounded change.
Explicit Caption selection/open now retains that window in the existing local
Scene/actor memory. Subsequent selections accumulate windows, not duplicates;
no additional comparison-retain action is needed. × removes only that window
and records dismissal; refresh never reopens it. Explicit re-selection/open may
reopen it. Remove redundant retain toggles from this UI, preserving order,
placement, draft isolation, suppressed membership and stale-plan checks.
This supersedes the earlier follower/opt-in-retain presentation in §13.4; no
Project data/history changes. Regress actual Orbit handlers plus connected list/
pin open, multiple windows, independent close and explicit reopen.

Observed PO correction: provisional translation handles, explicit-model
Shift+click addition and near-stage action/right-detail ownership are connected.
CPU/mounted checks cover the single world-to-asset transform, Orbit exclusion,
drag-start restoration on Escape/cancel/lost capture/multiple-pointer interruption,
camera replacement/disposal and explicit final confirmation/cancel. Independent
review's pointer-owner finding is fixed and rechecked. Existing async retry and
comparison-window tests pass. This is code/object/DOM evidence only, not native
handle hit-testing, event ordering or rendered usability. Current todo records
executed full checks; the PO's withdrawn old manual test is not a new hold.

Previous bounded result: exact resident picking, a separate provisional marker,
numeric correction and the existing confirmed creation/move/cancel/retry path
are now connected. CPU intersections cover transforms, side/material/occlusion
and perspective/orthographic clipping, including the viewport's negative near
plane. Mounted pointer guards reject drag, multi-pointer, capture loss, hidden
host, resize/camera/context changes; failed admission retains the proposal.
The independent review's orthographic ray-origin issue is fixed and its regression
passes. Root/scoped types, full root tests and both builds pass; executed counts
are in current todo. No GPU, native pointer, IME, device or durable-file PASS.

**Historical implementation plan — complete provider (from `5225110`):** this is
one finite implementation boundary derived from §§13.3/13.4 and specifications
01/02, not adoption of the candidate, a new wire format, decoder or numeric policy.
The exit is a complete conflict-aware validated provider connected to this same
host, retaining source data and all diagnostics. Individual stages below do not
authorize casting partial results into trusted `SceneResources`.

| Stage | Contract and reused work | Acceptance / remaining evidence |
|---|---|---|
| A: decoded record structure | One whole amended Project root; all map keys/IDs, known fields/unions, canonical frames/transforms/cameras/anchors, models/media/tags/views and existing Scene/material guards. Reuse safe decoded-value cloning, nominal/lifecycle checks and material intent. Preserve unknown minor subtrees and flag them; never repair persisted text. | One explicit `valid-records` result, not a valid Project. Reject every malformed candidate when stage B supplies it. Bound whole-tree depth/nodes, total entities and specified per-record collections. Structural digest/type declarations do not certify bytes/profile/graph/causality. |
| B: closure and conflict authority | Consume complete atomic candidates/provenance from a neutral read port, immutable prior identity and externally verified blob/profile summaries. Validate every record/candidate, immutable digests/append-only identity, owner/frame/parent/DAG/family/catalog/partition/proxy/exclusion relations; preserve strong/weak roots and unknown data. | No materialized winner. Missing required evidence blocks the affected authority; absent weak provenance does not invalidate a canonical pin. Causal delete/edit, orphans, order/scalar/lifecycle and duplicate semantic keys remain actionable. Evidence is bound to exact bytes/profile/metadata, never inferred from labels or synthesized as success. |
| C: same-host provider connection | Emit SceneState/resources with one snapshot token plus retained full records/candidates/diagnostics, using the existing Scene resolver. Replace known-only validation assumptions at the existing synthetic history boundary; do not add a parallel UI/probe. | Actual candidate two-round/copy/recovery and adversarial closure checks on the same provider. Exact fixture evidence remains development-only; no real-file/default-entry activation. Partial record success never reaches this output. One final independent review and required whole-tree checks; browser/iPhone remain the existing batched lane. |

Stages may be committed separately but this boundary stays open until C passes.

**C source/acknowledgment detail:** the earlier disposable host encodes some
compound commands in one string cell; it cannot be retrospectively expanded into
several purported original operation IDs. For a newly initialized page-memory
pair, translate its explicit commands to the already specified atomic Project
fields *before* the candidate records a change. Author Project identity/frame,
Scene metadata and initial lifecycles in that exact bootstrap, not as later
read-time defaults. Repeated closure inclusion registers an identical immutable
record once; mutable equal edits still record their own operation. Membership
lifecycle edits do not reassign immutable endpoints or unchanged order fields.
Retain command-specific UI data separately with its original change provenance;
it is not a second Project authority. Keep the exact original DAG/operations and
verify source-to-command correspondence, including explicit absence and copies.
This changes only the unpersisted demonstration representation, never old history,
wire bytes, adopted schema or current-app data. Complete asynchronous admission
must precede publication of the same-token pair and clearing drafts; failed or
stale admission retains prior confirmed state and the pending command/retry IDs.
The existing host's full source adapter, authority replacement and connected
two-round/copy/recovery evidence remain one C exit, not separate feature gates.

For that same-host hookup, use one working-state acknowledgment coordinator per
participant across Caption, model/pin/membership, View, material, attachment and
team receive/choice. Existing synchronous synthetic test ports may settle inline;
the verified driver settles asynchronously. Keep the exact confirmation callback,
draft/plan and IDs while checking or retryable failure. Only after the driver
confirms its scoped pair may the session publish it and clear the corresponding
input. Retry uses the retained staged document, not a repeated event handler or
new command IDs. A confirmation-only retry must not republish original changes.
Permanent source rejection releases the operation lock and preserves old state
and the error; pending or retained failure blocks overlapping mutation/navigation.
Show checking/failure and retry beside the existing workspace, still explicitly
unsaved/page-memory-only. Preserve source/candidate diagnostics behind the pair.
This is the existing connected host, not a parallel UI or production activation.

**Observed C connection (2026-09-09, code/mounted scope):** the served development
entry initializes the canonical-source verified pair before mounting the existing
workspace. All working editors and team receive/choice/copy share confirmation
and exact retained retry. Original field/DAG and content evidence remain on that
pair; command-specific source material candidates are exposed separately for
explicit duplicate review, never restored as renderer authority. Async new-View
confirmation clears its exact old DOM target before selecting the new view.
Actual pinned candidate/mounted controls cover pending/failure, two rounds,
explicit choices, independent Caption/model copies and editor confirmation.
The single A/B/C implementation exit is therefore code/mounted-only; ordinary
UI, real files/storage, browser/IME/iPhone and adoption remain separately gated.

The connected fixture includes inactive equivalent revisions. Repeated-class
verification still requires exact complete owner/family/member metadata, but an
inactive member need not trigger a historical blob read. The application-owned
verifier may reuse geometry already obtained by actual byte/profile/AssetFrame
decoding, keyed by the complete blob descriptor, profile, transform and content
kind/role. It must rebind the proof to the exact queried records and current token;
missing evidence stays unverified. This clears only class-equivalence diagnostics,
not source-index, current-content or unrelated graph errors. Labels or matching
declared digests without prior actual decoding are insufficient.

No per-record review campaign or default expansion into UI polish. Stage A is
authorized pure decoded-data validation only: no raw JSON parser, portable writer,
blob reading or current Project activation. Stage B must retain unknown metadata
and all conflict roots; history-free export remains blocked without its separate
versioned policy. Do not change field atomicity/identity/retention to fit a library.
Real FormatProfile/goldens, metadata/CAS adoption, wire/migration recipe and physical
iOS storage evidence retain their explicit gates before durable product activation.
A contract disagreement stops that affected implementation for PO resolution.

**Stage A observed implementation:** `src/domain/projectRecords.ts` validates
one already decoded amended root and all 14 record maps, reusing the existing
Scene/material value rules and safe clone. `projectRecordFields.ts` checks known
nested values; unknown root/record/nested values remain in the frozen result.
Migration support remains protected opaque data, not validated migration state.
Camera nonparallel checks use exact transient binary64 integer arithmetic, so
overflow/underflow do not create an unapproved coordinate-range restriction.
Result `valid-records` provides no token/SceneResources, resolved conflict, verified
digest/blob/profile or write receipt. All B/C requirements above remain open.

**Stage B implementation detail (not a new persisted contract):** whole-record
graph inspection first reuses A and retains its frozen records. It recomputes
all four immutable payload digests from the exact canonical metadata preimage
specified in 02 §3.2, and compares any supplied same-lineage prior records for
append-only/immutable identity. It reports affected record/field diagnostics,
known strong versus weak edges, and unmet semantic evidence, without returning
SceneResources, a conflict winner, retention/GC permission or a storage receipt.
Known graph checks include every model closure/frame/family/class/role relation,
material mappings and active resource references. Weak absent provenance is
not invalid position data; wrong existing provenance is diagnosed. Unknown data
stays protected, including migration support. Complete candidate/causal context,
actual verified profile/blob semantics and the C connection remain mandatory;
passing this inspection is not completion of B or permission to activate data.

**Stage B observed partial implementation:** `src/domain/projectGraph.ts` now
implements that inspection through the model/resource graph modules. Exact
metadata preimages use platform SHA-256; prior same-lineage records enforce
immutable payload/frame/Scene-owner/endpoint identity and retain tombstones.
Missing weak source evidence is not invalid position data. Known role-required
catalogs, invalid partitions and conflicting material-map sets are diagnosed
without guessing a source or applying a map as an alias. Known active roots
include resources outside Scenes; parent/input/anchor provenance edges are weak.
The result explicitly lists missing candidate/causal, verified-content and
same-token authority. It is not a complete provider and does not activate the UI.

**Stage B neutral history-read detail:** a nonpersistent read inspection accepts
the source snapshot token/heads and complete original change DAG, with each
change's final whole-field write identity/value. An absent value is explicit and
distinct from JSON null. Derive maximal concurrent writes without selecting a
materialized winner. The adapter must prove exact extraction, including deleted
cells and rejection of nested writes inside known atomic fields; the neutral
inspector checks internal DAG/head/identity/budget consistency and retains every
historical write. Known immutable mutations and lifecycle delete/edit causality
are inspected across history, not only live candidates. Unknown fields/candidates
remain protected and uninterpreted. Limits are explicit caller execution budgets,
not a newly ratified product count/performance guarantee. This intermediate read
result is not a Project validator, write/GC receipt or SceneResources. Complete
candidate value/graph checks and externally verified content plus C still gate
the provider. The isolated flat-string adapter is a pinned development proof only,
not an adopted metadata schema/adapter or a portable format.

**Observed neutral read component:** `atomicHistory.ts` and
`projectHistoryReview.ts` now implement DAG/head/write-identity inspection,
absent/equal/concurrent candidate retention and immutable/lifecycle history review.
Same complete canonical payloads under one ID in the four immutable maps retain
all registrations; this idempotence does not relax frame/endpoint conflicts.
The isolated `atomic-read.ts` checks every original flat operation and retains
deleted keys; `development.ts` exposes raw-string evidence beside its existing
fixture projection. Stable read enumeration changes no original encoded byte.
All Project candidate-value/graph/content composition and C authority remain
pending; the intermediate result lists these missing authorities explicitly.

**Candidate composition implementation detail:** validate known atomic fields
directly with the same guards used by whole-record admission; do not construct a
record from arbitrary candidate winners or enumerate Cartesian whole Projects.
Required absent values are invalid, while optional absence remains a distinct
valid candidate. A missing field in an unresolved projection is not source absence.
Keep an index of all original records/fields and current candidate references
apart from any unambiguous diagnostic projection. Whole immutable records retain
their exact digest and identity checks. Coupled material appearance/compositing
rules are checked when both are unambiguous; a conflict in either applies no
override. Never insert a default to make a candidate pass that check.
All current candidate parent/target references reserve their semantic keys by
record ID, including records with unresolved lifecycle or routing; candidates of
one record do not count as multiple owners. Absent/deleted/unresolved parents
are distinct from proven owner/frame mismatch. Preserve unknown original data
and protected roots without converting every historical weak reference into a
permanent strong root. External semantic evidence must bind the exact metadata,
profile and blob digest/length it actually checked. Missing evidence stays scoped
and non-authoritative; this does not approve a FormatProfile or a new wire format.

**Observed candidate composition:** `projectCandidates.ts` now joins the neutral
history inspection with shared header/mutable-field/immutable-record guards,
exact immutable digests and known reference inspection. Its input includes the
adapter's decoded schema and complete map-presence inventory (including empty
maps); that declaration is not proof of a general adapter's source extraction.
All original candidates remain, and checked operation IDs stay inspectable even
when another candidate is malformed. Diagnostic partial records contain only
unambiguous checked values; omitted fields never mean source deletion. Candidate
references reserve semantic keys by owner ID, distinguish pending parents from
deleted/missing ones and preserve valid candidate references behind invalid
siblings. The actual pinned flat-map proof now feeds a full synthetic Project
through two rounds and save/reload. This returns `project-candidate-inspection`,
not a complete provider: exact external-content evidence, affected-closure
projection and C's same-host authority remain required. No real schema adapter,
BlobStore, import/export or ordinary-app activation follows from this result.

**External-content composition implementation detail:** the candidate inspector
invokes an application-owned verifier service; imported JSON receipts are never
an evidence input. Every request and response binds the snapshot token, complete
immutable records (including payload digest, full BlobRef and exact profile),
and the requested fact/context. No cache keyed only by ID or blob hash suffices.
Individually check decoded static contribution/bounds/catalog, authoritative family
envelope, same-family logical contribution, repeated-class surface equivalence,
media bytes and source occurrence
ranges. A bounds subset is not an authoritative envelope or surface-equivalence
proof. Family authority must be explicitly evidenced by the verifier, not selected
by ID, arrival order or filenames. Catalog facts must cover every source locator
with exact source semantics. Surface ranges are representation-local occurrences,
not flattened renderer indices. Only already verified source bytes can range-check
weak pin provenance; absent bytes leave canonical position intact.
The known-active strong-reference closure controls byte requests. A Representation
named only by weak history/pin metadata is not fetched to inspect that provenance.
Its deferred content diagnosis stays retained; the known closure is not a GC permit.
Missing, unsupported, failed, stale and malformed responses stay distinct scoped
diagnostics. Clear only the matching unmet-evidence diagnosis, never unrelated
conflict, immutable or graph errors. Development-fixture evidence is labelled and
cannot grant ratified-profile/product authority. The existing triangle and two
PNGs supply the exact development implementation, with actual byte/hash/content
checks; no new decoder/profile adoption. Preserve source candidates and known
strong/weak edges. This composition still precedes affected-closure projection
and C's same-token host connection; it is not a write/GC or SceneResources receipt.

**Observed external-content composition:** `projectContent.ts` now runs candidate
admission and the executable verifier, checking exact frozen request/response
bindings and individual fact summaries. `projectContentChecks.ts` checks static
content bounds, complete catalog locator/semantics bijection, authority/member
coverage and source-local ranges. Multi-candidate family contribution is checked
even when its class occurs in only one revision. The isolated development verifier
executes actual known triangle byte/hash/geometry and fixed PNG container/CRC/
bounded-decompression checks. Its scope is always `development-fixture`; it is not
an adopted profile or general decoder. Missing/unsupported/failed/stale/malformed
results are distinct, and only corresponding unverified diagnoses are replaced.
All other candidate/history/graph issues and source data remain. This returns
`project-content-inspection`, not SceneResources. Affected-closure projection and
the served host's complete-authority switch still gate completion of B/C.

**Affected-closure projection implementation detail:** one pure Scene provider
entry invokes the complete candidate/content inspection rather than accepting a
caller-cast receipt. It retains that frozen source and all diagnostics beside
one scope-labelled, same-token SceneState/SceneResources pair and attachment/tag/
media detail fields. Invalid/unresolved identity or ProjectFrame returns no pair;
title/startup-default problems do not invent a replacement Scene or global failure.
Read every known atomic field from the exact current candidates; equal mutable
values still conflict, optional absence remains explicit, and no value is selected
to satisfy validation. Unknown minor fields remain retained and ignored under
02 §3.1, not a history-free permission. Known unsafe/unknown-discriminator fields
remain unavailable. A model requires its unambiguous active binding/revision and
validated strong immutable/content closure; weak history does not request old
bytes or propagate unrelated old content failures. Invalid existing owner/class
metadata remains an error. Model failure suppresses its projection and pin, not
Caption text/lifecycle; material or attachment issues never invalidate a model.
Candidate semantic-key reservations suppress all competing members at that exact
scope/key, including peers of omitted unresolved endpoint/routing records. An
invalid Scene material can still fall back to a valid whole Project override.
The provider also checks source-dependent optics at the exact verified catalog:
every requested transmission candidate needs source transmission parameters.
Failure blocks that intent only, not the model or a valid lower-scope override.
View camera/background and default are independent; no free-camera replacement.
Attachment endpoint/lifecycle/order or unavailable media suppresses only that
attachment, while alt-text conflict suppresses only its description. Tag label/
order conflict blocks its normal filter item, not Caption content. Source fields
remain separately available for repair; projection never edits them. The pair is
a read result, not a command, store receipt, source-adapter proof, adopted profile
or real-file activation. C must still connect and verify this exact boundary on
the same served synthetic host before the finite complete-provider exit closes.

**Observed scoped projection:** `src/scene/projectProvider.ts` now implements the
read entry above. It maps exact current fields and strong immutable dependencies
to same-token SceneState/resources plus attachment/tag/media and full known-field
detail projections, retaining the complete inspection and original candidates.
Unknown minor fields remain protected; unavailable or duplicate endpoints cannot
grant a peer winner. Source-dependent transmission violations carry operation-
bound diagnostics and suppress intent only. The existing flat-map candidate's
two-round/reload test now reaches this pair and the Scene resolver with the title
conflict intact. This is not the served host's authority switch or a general
source-adapter proof. C and the finite complete-provider exit remain open.

**Observed bounded media connection (from `7b57fd2`):** the same host now has two
preloaded public synthetic PNGs. Each immutable MediaResource has a verified
exact blob descriptor and domain-separated metadata digest; history accepts only
those known records/bytes, not arbitrary media admission or a transport format.
CaptionAttachment fields (caption target, media target, alt text, order and
lifecycle) are independent atomic cells under a fresh stable attachment ID.
Validate every candidate and known Caption/media reference before publication.
Unresolved parent/resource/lifecycle never supplies an inline image; unresolved
alt text uses a neutral message, and unresolved order remains visibly unresolved.
No byte/name-based attachment deduplication. Add/reorder/alt edit/removal use the
same causal port; removal confirms and tombstones the attachment, not the media
resource. Draft/command/ID retention, exact token guards and explicit conflict
selection remain mandatory. Independent Caption copy maps every confirmed active
attachment to a fresh ID, retaining the same immutable media and exact metadata,
in its existing one-command keep-both flow; unresolved required fields refuse.
Existing comparison windows show confirmed images, not editor drafts, with
explicit image-load error/retry and bounded enlargement. These effects are page
memory and known public bytes only. No general image decoder/profile adoption,
real files/storage, new media formats or current-app activation; full image
viewing aids and raster/native/device evidence remain required later.
The fixed flat-map candidate additionally exposes original change dependencies
and final per-command field writes through a neutral development-only read port.
This is not a stored metadata/wire extension or an adopted history API. Derive
attachment delete/edit review from causal order, not timestamps: observed edits
need no review, concurrent edits are held, and edits after delete without an
intervening explicit restore are invalid. Keep-deleted/restore resolution writes
a fresh lifecycle event after all candidates. Copying equal-order attachments
allocates keys in the copy's confirmed source order without changing originals.
Lifecycle conflicts use an explicit assignment port guarded by the exact token
and candidate IDs; normal conflict-key writes remain refused. Retain the chosen
state and fresh event across a failed attempt. Delete/edit review displays the
retained explanation/order, including unresolved candidates, before the choice.
If receiving removes the draft's Caption from the current Scene, keep the draft
and block apply but permit explicit cancellation once composition has ended.

**Observed material connection (from `895169e`):** the same synthetic host
connects exact existing fixture model/family/layout/slot catalogs and the
existing scoped appearance controls. Routing, appearance, compositing and
lifecycle remain separate atomic fields. Duplicate semantic keys contribute no
winner; explicit keep-one tombstones the other records. A Scene override replaces
the whole Project intent; absence falls back to Project/source, never field merge.
Retain exact draft/command/fresh IDs on failure; removal is confirmed tombstone.
Independent model copy captures confirmed effective material in this Scene into
fresh Scene-only overrides on the fresh target; unrelated materials remain intact.
The triangle fixture has one constant source color, alpha one and surface optics.
Its displayed effect supports lit/unlit, sidedness and binary hard chroma using
the specified linear-color distance. Inherited fractional alpha/soft chroma,
transmission and unratified dither are unavailable, never silently converted to
blending or persisted fallback. No new format-profile/adoption/real-renderer
guarantee follows; no files/storage/ordinary app or device acceptance changes.
Connected tests cover exact retry/IDs, concurrent atomic appearance choices,
duplicate-key explicit selection, Scene-only material re-keying during model
copy, second-round exchange, mask cutoff including zero and fixed-color renderer
objects. Conflict controls identify model, scope and exact surface; unresolved
routing is explicitly identified, never assigned a guessed target. These are
candidate/DOM/object checks, not rendered or native-input acceptance.

**Observed Saved View connection (from `e8451a7`):** the same synthetic
host connects existing authoring/recall/entry controls through exact known
Scene-owned records and the neutral causal history port. Camera, background,
name, order, lifecycle and each Scene entry pointer remain independent atomic
fields; capture publishes camera plus background in one logical change. Exact
per-field causal versions prevent silent recapture rebase. Captures retain
ProjectCamera pose/radian FOV or orthographic span and exact solid sRGB, not HEX
or engine-linear values. Unsupported transparent backgrounds refuse explicitly.
Creation never sets entry; selecting/setting entry never recalls immediately.
Confirmed deletion requires no current entry reference and tombstones lifecycle.
Reorder allocates a key between the exact validated neighbors or refuses without
changing anything. Source identities, drafts, capture and allocated IDs survive
failure/retry. Scene entry applies its valid view once after composition, before
retained temporary pose; invalid default leaves the camera unchanged and reports
why. Refresh/receive/actor reactivation never reapply entry. No real file/storage,
general provider/renderer adoption or ordinary-app activation. Tests verify only
this connected synthetic path; native/raster/device evidence remains required.
The fixed candidate adapter derives flat ImmutableString cell versions from
original setter/predecessor operation IDs, including explicit same-value edits;
this is not a generally adopted field-version API. Recall failure preserves the
previous camera/background/control state. Tests also cover unrelated membership
copying after View creation and independent camera/entry failure messages.

**Observed comparison-window connection (from `d12f271`):** reuses existing
Scene-local follower/retained/dismissed/order/placement memory in the same host,
separately for each actor. Floating windows show confirmed Caption text; drafts
remain in the sole detail editor. Fronting/arranging does not select a Caption or
write history. Explicit close and reopen remain distinct. Hidden/review/filtered
pins suppress their connector, not retained content; unavailable memberships
suppress the window without deleting comparison intent. Resize may clamp only
the display rectangle, never erase retained IDs or overwrite stored placement.
Keyboard movement and explicit arrange/front access accompany pointer dragging.
Stale placement is refused, cancelled
placement restores the prior position. No media, new selection authority, schema,
storage or ordinary-app activation; rendered/device evidence remains pending.
Explicit same-row/other-row reselection reopens the follower; refresh does not.
Default positions are stable independently of z-order. Failure/retry controls
stay outside floating overlap. Existing state and mounted connection tests plus
independent read-only review verify this bounded path, not native input/raster.

**Observed bounded display connection (from `775e14e`):** in the same
synthetic host, a thin Three.js/OrbitControls adapter consumes only the known
resolved fixture closure. Meshes apply RepresentationFrame -> AssetFrame ->
ProjectFrame; pins apply only their anchor's AssetFrame -> ProjectFrame. Camera
fit uses the eight-corner transformed logical family envelope, never engine
geometry or pin bounds. Existing view controls connect fit, six axes and
perspective/orthographic projection; temporary pose/span is retained per actor
and Scene, without history writes or automatic fit on ordinary refresh. Only
resolved visible/compatible pins pass the color filter and select through the
existing Caption intention. Single-sided source semantics stay unchanged even
when an axis makes the triangle invisible. Native/v1 controllers, real loaders,
geometry picks/gizmos, Saved View writes, material/media effects and adoption are
excluded. Initialization/context loss/refused projection remain visible and do
not affect metadata edits; runtime resources are released on hide/dispose.
Object/DOM tests prove only these connections, not rendered/native-input/iPhone
acceptance. Projection switching retains pose and target-plane span; Orbit
changes update clipping from semantic bounds. Ready/failure transitions update
the model list without starting a second animation loop. Context restoration
requires explicit retry before drawing resumes. Independent read-only review
confirmed the bounded fixes; current todo and the existing browser batch own
exact executable evidence and the remaining raster/native-input/device lane.

**Observed bounded implementation (2026-09-09, not further adoption):** the
development host now connects two independent memory histories through a neutral
port. The adapter remains in `poc/scene-history` with pinned Automerge 3.4.1 and
local WASM, loaded only while serving the explicit development mode, not either
build. Known fixture Caption fields and exact model-membership commands produce
original causal changes. Different-field edits merge, same-field candidates stay
unresolved until explicitly chosen, and a second round/replay preserves original
bytes and the initial shared base. Refresh retains unapplied drafts and UI memory.
Synthetic cells and in-memory transfers are not a Project schema or package wire.
The same port now includes known synthetic Project-wide model-binding updates
and complete manual anchors. Review correction needs explicit current-family
selection; local text, Scene references and coordinates survive model updates.
Typed binding/anchor conflicts remain unresolved until explicitly chosen. These
are known metadata projections, not full immutable payload/anchor wire admission
or renderer picking/gizmo. Explicit duplicate-membership keep-one and independent
Caption keep-both now connect as one causal command, with retained fresh-ID maps
and no redirection of original/other-Scene references. This fixture has no
attachment/tag records; copying them is not verified. Already-known synthetic
copy descriptors/endpoints cannot be replaced, but this is not general immutable
history admission. Model keep-both now connects for an exact triangle fixture:
explicit original-edge choice, complete fresh Asset/frame/binding/revision/
Representation/family/compatibility/material-layout/slot IDs and a fresh membership
and event, with the same ProjectFrame. Known bytes and canonical immutable digests
are verified, numeric transforms/bounds/source material semantics are preserved.
Only the exact active fixture closure is supported; nonempty parent/derivation/
compatibility-map or effective-material dependencies refuse instead of being
dropped. The fixed fixture profile is not ratified real-format support. A selected
Asset's numeric translation creates a new immutable binding, preserving its
rotation/scale and revision. Copies can be moved independently and exchanged
again without reowning original Captions or changing other-Scene references.
Original fixtures may also be moved; each Asset's placement is still Project-wide.
Retry retains the prepared binding; stale apply retains input and offers cancel.
No Repo/storage, complete provider, production save/exchange, rendered/device
acceptance or S1–S3 credit is implied.
Current todo owns exact executable evidence and remaining connections.

## 14. Explicit non-goals

- cloud backend, accounts, roles, authentication, signatures or real-time presence;
- automatic same-model detection, registration, Caption reraycast or surface remap;
- per-Scene Asset revision, transform or alignment;
- a generic Unity Asset database or Scene hierarchy;
- standalone Scene media layers;
- new ProjectAnchor authoring; existing/imported ProjectAnchor read, Scene
  membership and explicit re-anchoring remain required;
- Scene duplicate/delete/reorder UI in the first bounded candidate;
- multiple-Scene review export or automatic privacy sanitization;
- HEIC/video/audio expansion, animation, renderer/material research or new format support;
- automatic conflict winners or automatic duplicate alternatives;
- license/version/release selection, `main`, Pages, Service Worker or deployment.
