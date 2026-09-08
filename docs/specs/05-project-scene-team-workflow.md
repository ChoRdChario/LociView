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

Deleting a Caption after confirmation tombstones the named Caption plus every
causally observed active SceneCaptionMembership, attachment and tag membership in
one command; unshared MediaResources become collectible only under the existing
retention rule. Restoring a parent never restores child tombstones implicitly.
A concurrent unseen dependent edge is retained as an orphan/reference conflict
for explicit repair; it is not silently cascaded, and every conflict-required
record/blob remains protected.

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

ProjectScene migration uses a new immutable companion recipe,
`v1-project-scene-migration-recipe-1`. It does not reinterpret, amend or emit
new output under `v1-migration-recipe-1`, whose `display-set`/`set_` output and
golden vectors remain closed. Before S2 implementation, the new recipe must
ratify every canonical source key, domain-separated preimage, full digest,
collision check, output kind and golden byte/hash vector. Until that companion
passes its gate, durable ProjectScene conversion remains disabled.

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

### 9.3 Frozen v1 and late Native collaboration files

Frozen v1 conversion creates deterministic Scene/membership records through the
new `v1-project-scene-migration-recipe-1` companion and remains distinct from
LociMyu conversion. The companion consumes the frozen source evidence directly;
it does not treat closed `v1-migration-recipe-1` DisplaySet output as if it were
a ProjectScene.

A Native copy without an accepted fixed collaboration baseline can be converted
as one canonical source only; separately converted copies never auto-merge.
When a Native Project and late Native collaboration package share the exact
verified Project ID, baseline ID and unsupported-state digest, a dedicated bridge
may map that baseline to one common v2 ancestor and convert only the current
Native Caption/media three-way domain into exact descendant changes. It never
treats the old package as a general v2 Contribution.

The bridge records the source package digest/conversion registration for
idempotence. A conflict with later v2 work follows section 8 and preserves
candidates. Missing/unequal baseline evidence, model/presentation differences
outside the old merge contract or ambiguous identity fails without writes.

The bridge registration is portable Project migration truth, not a device-local
cache. Before S2, the ProjectScene recipe companion must define its exact typed
support record in the v2 root, ID/key grammar, source Project/baseline/
unsupported-state evidence, mapped v2 ancestor heads, accepted mapping-baseline
blob, processed-package registration, retention/privacy roots and package
closure. No implementation may improvise this data inside `MigrationSupportV1`,
whose schema is closed, or keep it only in an unexported local index.

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
- `SCN-MIG-05`: the fixed-baseline Native bridge accepts only exact verified old
  Caption/media domain changes, is idempotent and fails closed outside that scope.
- `SCN-MIG-06`: every admitted model/media payload preserves exact digest, byte
  length and bytes in v2; unsupported, missing and unlinked inputs are fully
  accounted for, and success/failure/cancel leaves every source byte unchanged.

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
   converters, the fixed-baseline bridge and all five package purposes, but only
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
history admission. Model keep-both still needs an exact synthetic copy closure.
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
