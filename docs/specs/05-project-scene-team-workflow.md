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

The [07 migration/Native-bridge companion](07-project-scene-migration.md) now
drafts those source domains/ID mappings and portable evidence, including source-
atomic relation guards and parallel-introduction requirements. It is unratified;
its §10 lists remaining exact inspector/adapter/journal/whole-output inputs.

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

### 9.4 Unplaced Caption preservation (2026-09-10)

> `PO-APPROVED OUTCOME / TECHNICAL AMENDMENT PROPOSED / NOT IMPLEMENTED`

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

#### 9.4.1 Proposed atomic representation and placement

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
This amendment does not add a general unlink/reassign-owner command.

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

#### 9.4.2 Proposed conversion and late-bridge mapping

The new recipe companion in §9.1 must record exact source Caption/owner mappings,
the canonical baseline placement value and immutable source evidence separately
from the editable target anchor. Do not extend or reinterpret the closed old
recipe or `MigrationSupportV1`.

| Admitted source | Exact target mapping |
|---|---|
| Native `anchor: null`, authoritative owner | Unplaced with the mapped owner ID; no invented frame/position/revision |
| Native `anchor: null`, owner absent | Unplaced without owner; no synthetic Asset |
| LociMyu invalid coordinate allowed by 04 §4.3 | Preserve active Caption, issue report and exact sheet/model authority; map to unplaced under the new recipe |
| Positioned source | Existing exact positioned-anchor mapping; never downgrade because model is hidden |
| Conflicting/invalid source authority outside the admitted conversion rule | Preserve/report; do not select a winner or convert corruption to normal unplaced |

Native owner and anchor are separate atomic source fields. The bridge compares
their complete canonical placement tuple against the registered old baseline.
If unchanged, emit no anchor change: a later v2 placement must survive an old
unplaced input and text-only edits. If changed, map the authoritative tuple as one
whole-anchor descendant of the registered common v2 ancestor, not of current
heads. An unresolved source tuple blocks that affected bridge mapping with its
source intact; do not synthesize cross-product candidates or serialize a winner.
Concurrent valid v2 placement then follows ordinary whole-anchor conflict choice.
Same-input replay reuses registered mappings and original generated change bytes,
never refreshes its baseline from current v2 state.

Team Workspace and backup preserve unplaced values, candidates and their required
portable migration/bridge evidence. Contribution sends exact base-relative changes
and newly required evidence/payloads; placement-only edits do not reread unchanged
model bodies. Review includes every active Caption of the selected Scene even if
unplaced; clean includes all active Project resources. Both history-free purposes
re-key known owners, preserve absent owners, and omit source/history/bridge
evidence. Neither adds Scene-model memberships. Minimal nonvisual owners and
review-to-clean mapping are specified in companion 06 §5.1.

#### 9.4.3 Finite acceptance and implementation boundary

Reuse source conversion, conflict, keep-both and export/reopen fixtures; add only
the cases needed to distinguish known-owner/ownerless unplaced, malformed versus
normal state, first placement confirm/cancel/failure, unrelated text integration,
concurrent placement candidates, identical late-source replay after v2 placement,
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

**S1 Saved View extension — implementation contract (2026-09-11):**

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
