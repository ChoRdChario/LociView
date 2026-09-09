# LociView UI/UX product guidelines

> Status: `PRODUCT-OWNER APPROVED UI/UX PRINCIPLES / IMPLEMENTATION AND
> ACCEPTANCE STATUS ARE SECTION-SPECIFIC`
>
> Consolidated: 2026-09-07. These guidelines preserve the interaction,
> information-architecture, writing and visual direction approved during the
> public-candidate UI/UX closure. They do not by themselves claim that the
> current worktree has passed rendered Desktop or physical-iPhone acceptance.

## 1. Authority and scope

This document governs how LociView explains and presents already accepted
product behavior. It does not redefine storage, package, merge, renderer,
migration, media-format or access-control semantics.

When sources disagree, use the following order for the relevant purpose:

1. accepted product specifications and ADRs govern behavior and safety;
2. current code and executable tests govern observed implementation;
3. this document governs accepted interaction and presentation principles;
4. task audit files provide rationale and evidence, not a new product contract.

The labels used below are deliberate:

- **Accepted requirement:** Product Owner-approved direction. An implementation
  may still be missing or awaiting acceptance.
- **Current implementation:** behavior directly observable in current code and
  tests. A dirty worktree is not a release or candidate claim.
- **Evidence pending:** implemented or designed behavior whose rendered,
  assistive-technology or device acceptance is not complete.
- **Proposed:** a recommendation that needs a separate product decision before
  implementation.

## 2. Product experience and visual north star

> Classification: **Accepted requirement**. The quoted product sentence is also
> the **current implementation** wording pattern.

The current implementation and accepted wording pattern use a complete,
concrete statement:

> LociViewは、3Dデータにキャプションとメディアを添付するツールです。

The experience should be **readable like a research document and legible like
an instrument whose target and state are always clear**.

- The 3D subject and the user's record are primary. Branding and controls are
  quieter than the work.
- Calm document-like surfaces provide cleanliness and continuity. A small
  amount of instrument-like precision appears in selected states, dividers,
  measurements and active controls.
- Traditional does not mean ornamental. Do not add decorative grids, scan
  lines, distressed textures, oversized frames or game-like animation merely
  to create atmosphere.
- External visual references are inspiration only. Do not copy third-party
  artwork, typefaces, icons, patterns, sound or motion.
- UI color and 3D-stage background are independent systems. Changing the scene
  background must not recolor the application chrome.

## 3. User-visible mental model and terminology

> Classification: **Accepted requirement**.

Use the smallest set of concepts needed to predict the result of an action.
Internal representation, schema and package terminology remains in diagnostics
or contextual details unless the user must decide something about it.

| User-visible concept | Meaning | Must not be confused with |
|---|---|---|
| プロジェクト | The durable workspace containing models, Captions, media, Scenes and saved views | An exported file, a temporary view or a browser tab |
| モデル | A logical 3D subject with one Project-wide active revision and alignment | A rendering mode, Scene or filename |
| キャプション | One Project record normally tied to an explicitly chosen model location and reusable in multiple Scenes | A copied per-Scene note, generic image caption or inferred model relation |
| メディア | Images and other content attached to a Caption | A separate model, surface material or an automatically inferred source relation |
| シーン | A named Project presentation selecting models and Captions, Scene appearance and an optional entry view | A model revision, renderer scene object or temporary filter |
| モデルの表示 | Whether a model belongs to the current Scene | Replacing the model or selecting a model revision |
| マテリアル | How a supported model surface is drawn | Model visibility or Caption color |
| 保存した視点 | A reusable camera and 3D-background state owned by one Scene | Project save, Scene membership or model placement |
| 完全バックアップ | A complete restore of the same Project | A merge contribution or independent copy |
| Team Workspace | A self-contained whole-Project starting point or same-lineage update | A thin change file, account access control or a backup promise |
| Contribution | The dependency-closed difference between current and verified-base history, including valid sibling changes, plus only newly required bytes | A hand-selected subset, standalone restore, filename-based merge or rewritten rebase |
| 閲覧共有用ファイル | One explicitly selected Scene closure that cannot merge back and opens in View first | Access control, permanent read-only enforcement, automatic privacy scrubbing or a backup |
| 編集用コピー | An independent editable Project with new identity | A branch that can later merge into the source |

`Team Workspace` and `Contribution` are contract names in this document; their
final short Japanese control labels require rendered copy review and are not
ratified by translating them mechanically.

### 3.1 Asset and Representation language

> Classification: **Accepted requirement**.

One logical user model is an Asset. Mesh, ordinary points and Gaussian
Splatting are Representation kinds used to display that Asset. They are not
separate top-level work modes. An interaction Proxy is an explicitly related
same-Asset placement aid; it is not another visible model and must never be
chosen from proximity, filename or load order.

Ordinary UI says `モデル` or, at file selection, `3Dモデル`. It exposes a
Representation kind only when it changes a real capability or recovery step.

Model revision is supporting context, not a navigation mode. Every Scene that
contains a model uses the same Project-wide active revision and alignment.
Revision evidence appears when replacement, `要確認`, conflict or recovery
changes a user decision; the Scene selector never asks which revision to use.

### 3.2 Current media boundary

> Classification: **Accepted requirement** for the media-neutral concept;
> **current implementation** for the listed still-image formats.

`メディア` is the durable user concept because video and audio remain product
requirements. The current public-candidate path accepts PNG, JPEG, WebP and GIF
still images only. Do not expose unavailable video/audio controls or imply that
an original HEIC/HEIF file is retained when the user attached a separately
created JPEG.

## 4. Information architecture

> Classification: **Accepted requirement**.

### 4.1 One start surface

There is one normal home at `/`.

- Use one intent-based file entry, `ファイルを開く…`.
- Do not ask the user to choose Native, legacy, backup, GS, Point or Mesh before
  the selected content has been inspected.
- After selection, show only the detected purpose, what will happen, what will
  be saved, and any choice or warning that changes the decision.
- A model selected through the same entry proceeds to new-Project creation.
- Existing on-device Projects remain a separate, scannable list with explicit
  View, Edit and file-operation results.
- Rare device/offline preparation belongs in contextual disclosure after it is
  relevant; it is not a competing start mode.

### 4.2 Workspace structure

The normal Desktop workspace has three stable regions:

1. a shared header for Project identity, View/Edit state, save state,
   current Scene and file/help actions;
2. the 3D stage, with frequent view recovery close to it;
3. a right-side task area with four purpose-based tabs.

The four tabs preserve LociMyu's useful function grouping while adding the
model-management responsibility required by LociView:

| Tab | User questions it answers | Contents |
|---|---|---|
| キャプション | What is recorded in this Scene? What should I add or correct? | Current-Scene search, model filter, pin-color filters, list, existing-Project Caption inclusion, add/place/move, title/body/color and attached media |
| モデル | What Project models exist, and which belong to this Scene? | Project model list, Scene membership, Project-wide placement/alignment and replacement, pin scale, format-specific applicable controls, add and delete |
| マテリアル | How should this surface look in this Scene? | Explicit target model/surface, Scene or Project scope, opacity, sidedness, unlit and applicable chroma controls |
| 視点 | From where and against what background should I inspect this Scene? | Six directions, projection, Scene-owned Saved View recall/manage, entry view and 3D background |

Scene switching, Project save state and file exchange stay outside the tabs
because they affect or frame more than one task. Frequent `全体表示` and
Saved View recall may also have a shortcut beside the 3D stage; the shortcut
must use the same state and must not create a second view system.

Tab changes move the UI only. They do not implicitly save, select a different
model, apply a view, change Scene, end a mode or discard unfinished input.
Scene selection itself is local session state: it changes the resolved
presentation and applies that Scene's valid entry view once, but it never changes
the Project-wide active model revision/alignment or silently changes the Project
default Scene.

## 5. Caption-first interaction

> Classification: **Accepted requirement**.

Caption work is the ordinary center of the product.

1. Search or select an existing Caption, or use the Caption-add action.
2. For a new Caption, show the explicit target model before placement.
3. Keep adding, moving and re-placing the pin adjacent in the action hierarchy.
4. Show title, body, color and media for the selected Caption without making
   the user leave the list context.
5. Preserve list position, selection and unfinished fields during nearby view
   and tab operations.

The ordinary list shows Captions included in the current Scene. A separate
progressively disclosed picker can add an existing Project Caption to this Scene
without copying it. Editing one Caption changes that shared Project record; when
it belongs to multiple Scenes, show the affected Scene count at the edit point.
`このシーンから外す` removes only membership. Project-wide deletion is a
separate destructive action that names the affected Scenes and attachments.
Existing/imported Project-space Captions remain visible in one explicit
model-independent list/filter bucket and can be re-anchored deliberately. New
Project-space Caption authoring is outside the current accepted slice. No surface
hit, empty Scene or missing model ever creates one or fabricates an owner model.

The Caption list stays in the right task area on Desktop. It must not live below
the page or behind a collapsed section that forces page travel to identify the
selected pin. Direct pin-color circles sit immediately above the list, below
search/owner controls; filtering should take one action per color and must not
be hidden behind a generic menu.

Floating Caption windows are view aids on the 3D stage, connected to their pins
when a connector is meaningful. They do not replace the list as the selection
authority. Explicit selection opens and retains each window by default; selecting
the next Caption does not replace earlier windows. Re-selecting an open Caption
brings the same window forward without duplicates. No separate retain action is
required. Users close windows individually; refresh does not reopen a dismissed
window, but an explicit re-selection/open does. The user can bring one forward or
arrange them without altering Project data. Use the familiar
`×` for closing, with an accessible name. Do not repeat `選択中 01` when the list
highlight and window title already convey the same state.

The PO-specified Desktop camera uses Blender's basic mouse bindings: middle-button
drag orbits, Shift+middle pans, and wheel/Ctrl+middle zooms. Left-button input is
reserved for selection/placement, including Shift+left for pin addition. Keep
existing touch alternatives and explicit view controls; do not imply full Blender
keymap, frame conventions, fly/walk or input-emulation support. Reference:
[Blender navigation](https://docs.blender.org/manual/en/5.0/editors/3dview/navigate/navigation.html).

## 6. Decision-load policy

> Classification: **Accepted requirement**.

Every control and message belongs to one of three classes.

| Class | Treatment | Examples |
|---|---|---|
| The user must decide | Keep explicit, name the affected object and consequence | Caption meaning, the model on which to place a new Caption, what to do after a detected conflict, destructive action, source authority, external disclosure |
| A safe deterministic default exists | Perform it and report the result only when useful | Content-derived supported format routing, initial non-destructive view, fit-to-visible-bounds |
| Rare or state-specific | Hide initially and reveal at the relevant task/state | GS placement aid, advanced material controls, diagnostics, recovery details |

Reducing decisions never authorizes semantic guessing. The product must not:

- infer a source relation from filenames, proximity or ordering;
- choose a conflict winner without confirmation;
- silently remap a Caption to another surface or model;
- perform an unconfirmed destructive operation;
- infer a package purpose from its filename;
- hide failure, unsaved state, unsupported state or the recovery path.

If file content or purpose remains genuinely ambiguous after strict inspection,
stop and explain the needed evidence; do not turn ambiguity into a guessed role
choice. The current Native fixed-baseline path rejects an unsupported or
conflicting merge without writes. The accepted ProjectScene/team-history target
instead retains a completely verified causal batch atomically, blocks only the
affected authoritative projection and requires an explicit later resolution;
it never presents a library-selected value as the winner.

For a duplicate Scene membership conflict, show the named candidates with
keep-one and `両方残す` choices. Keep-both creates independently editable
Caption/model items, not two linked aliases. Confirm which continues the original
and which becomes a copy, disclose other-Scene effects and leave existing Caption
model ownership unchanged. Preview the actual result; do not automatically merge
equal-looking choices or choose an original candidate for the user. Other typed
conflicts expose only their implemented resolution actions.

## 7. Writing and labels

> Classification: **Accepted requirement**.

### 7.1 Core rules

- Start with the user's object and desired result: `ファイルを開く`,
  `3Dモデルを選択`, `メディアを追加`, `この端末へ保存`.
- Give the product a grammatical subject. Avoid unexplained fragments such as
  `3Dを見て、場所に記録する`.
- Use one stable term for one concept across home, preflight, workspace,
  confirmation, success and recovery.
- Prefer input-neutral `選択`. Mention dropping only as an additional route;
  do not make mouse or touch vocabulary part of the product model.
- Confirmation buttons name the result (`復元する`, `統合する`, `削除する`),
  not `OK`.
- Familiar symbols such as `×` and image arrows may replace words only when
  their accessible name remains explicit. Do not iconize the four tab names.

### 7.2 Helper text test

Helper text earns its place only if it changes the current decision, prevents a
likely error or supplies recovery. Remove it or move it to contextual help when
it merely paraphrases the label, narrates automatic inspection, advertises an
implementation detail or combines unrelated facts.

Brevity does not apply to a hidden consequence. Show the following beside the
affected action when relevant:

- where work is stored and whether it is already durable;
- whether other pending edits will be saved too;
- whether a file can merge back, only open for review, or creates a new Project;
- the exact scope and prerequisites of collaboration;
- what original bytes, labels or metadata leave the device;
- what failed, what stayed unchanged and what the user can safely do next.

A team-file preflight first names the purpose and result. When the user needs
the evidence, it then reveals whether the file is whole-Project or base-dependent,
the verified base/head relation, every unsent change class, newly included byte
size, the generated change summary and any optional human memo. The ordinary
surface does not expose raw IDs or hashes, but it also cannot hide an unsent
model, Scene, material or view change behind a Caption-only description.
For a Contribution, the visible base means the exact Team Workspace expected at
the recipient. Importing a sibling Contribution or finishing an export does not
silently advance it. When no verified base record remains, the recovery is a new
Team Workspace rather than a guessed recent file.

## 8. Visual language

> Classification: **Accepted requirement**. Exact worktree token values below
> are a **current implementation snapshot / evidence pending**, not permanent
> brand constants.

### 8.1 Color

The accepted base is a low-chroma warm greige: cleaner and quieter than a green
interface, warmer than neutral office gray, and substantially less saturated
than tan. Current worktree reference tokens are:

| Role | Reference |
|---|---|
| application background | `#e6e4e2` |
| panel | `#f2f0ee` |
| field | `#faf9f8` |
| primary text | `#312f2d` |
| secondary text | `#504d4a` |
| structural line | `#817c78` |
| quiet divider | `#d2cfcb` |
| primary action | `#413d39` |
| destructive state | `#8b2c29` |

These are a controlled starting palette, not an irrevocable brand standard.
Rendered contrast, display variation and physical-device acceptance can tune a
token while preserving the semantic hierarchy and low-saturation direction.

Pin colors are user data. Never reuse them as success, warning, error or
selection colors. Status also needs text, shape or position; color alone is not
sufficient.

### 8.2 Typography and brand

- Use the platform system sans stack until a separately reviewed font decision.
- Body text is normally 14–16 CSS px; helper text may be 13 px when contrast and
  density remain comfortable.
- Use a restrained 400/500/600 weight ladder. Do not compensate for weak
  hierarchy with pervasive bold text.
- Until the Product Owner supplies a logo, `LociView` is a quiet 14 px,
  normal-weight wordmark. It must not compete with the Project name or task.
- Avoid decorative monospaced text, condensed display faces and runtime font
  downloads.

### 8.3 Geometry, borders and depth

- Use mostly rectangular controls and panels with approximately 2 px corners.
- Establish hierarchy with spacing, grouping, weight and border strength before
  adding fill or shadow.
- Use small, directional shadows only for real layers such as dialogs, popovers
  and floating Caption windows.
- Primary actions use a clear filled surface; secondary actions use a quieter
  field/panel surface and border; destructive actions are distinct but are not
  visually dominant until relevant.
- A pressed control must feel engaged through a changed fill, inset edge and/or
  approximately 1 px movement. Hover alone is not activation feedback.
- Selected, pressed and keyboard focus are different states and remain visually
  distinguishable when they coincide.

## 9. Components, state and recovery

> Classification: **Accepted requirement**. Individual recovery behaviors remain
> **implementation- and evidence-specific**.

- Interactive targets start from a 44 CSS px touch target unless the platform
  supplies a larger requirement. Dense visual marks may be smaller inside that
  target.
- Visible focus remains at least as clear as selection. Keyboard navigation
  follows visual order and does not require a pointer-only drag.
- Unknown icons keep text labels. Repeated familiar icons use one stroke family,
  one meaning and an accessible name.
- Disabled controls explain the reason and next available action nearby; do not
  rely on faded appearance alone.
- Modes such as pin placement, pin movement and model gizmo work show the active
  object, current mode and an always-reachable finish/cancel path close to the
  stage.
- Save state is workspace-wide and remains visible across tab switches: `未保存`,
  saving, saved and failed must not disappear because the user switched tabs.
- Project identity and current Scene remain understandable across every tab.
  Local Scene selection, camera and filters are not shown as shared edits;
  membership, default Scene, Scene entry view and named Saved Views are.
- Long-running import/export/merge uses a perceivable status region. A cancel
  action appears only where cancellation is actually supported.
- A failed mutation keeps the last durable Project intact, preserves recoverable
  input where the accepted implementation supports it, and states the safe
  retry or rollback path.
- Collaboration, backup and share preflights describe the actual implemented
  contract. The current Native fixed-baseline path must not promise continuing
  co-editing. The future team path distinguishes self-contained Team Workspace,
  base-dependent Contribution, one-Scene review, same-Project backup and
  independent clean copy.

## 10. Responsive behavior

> Classification: **Accepted requirement / evidence pending**.

Desktop keeps the 3D stage and right task area simultaneously visible. Caption
list and details scroll within the task area so browser-page scrolling is not
required to confirm a selected pin.

On a narrow or short display, reflow the same concepts instead of shrinking the
Desktop layout. Preserve object names, action labels, save/failure state,
selection and mode exits. The list and detail may switch within one Caption tab,
but each provides a direct return to the other. Respect safe areas and the
onscreen keyboard, and never hide the only way to end a placement or gizmo mode.

Multiple floating windows may be arranged on a constrained stage, but that is
UI-only state. Responsive behavior must not silently close retained windows,
change selection, mutate Scene membership or lose the user's explicit
comparison intent. A separate one-window mode remains proposed, not approved.

Narrow layouts provide the same Project administration and decisions as
Desktop: Scene selection/authoring, Project-wide model replacement/alignment,
Caption reuse, material/view editing, team-file preflight, revision review and
conflict resolution. Device resource limits may reject an operation safely
before writes with a clear next step; they do not define a reduced contributor
role or silently hide a capability category.

## 11. Accessibility and evidence

> Classification: **Accepted requirement / evidence pending**.

Applicable WCAG 2.2 AA criteria are the verification target. Contrast checks
include 4.5:1 for normal text, 3:1 for large text and 3:1 for visual information
required to identify controls or states under SC 1.4.11. Focus visibility, order
and obscuration are checked under their applicable criteria. This is not a
conformance claim.

Acceptance checks include:

- keyboard-only traversal, visible focus and logical order;
- touch without hover, including 44 px targets and drag alternatives;
- 200% zoom and approximately 320 CSS px width;
- long Japanese labels, IME input, many Captions and empty/error states;
- reduced motion and non-color status cues;
- Scene A/B switching without cross-Scene leakage or an implicit Project edit;
- adding one existing Caption to another Scene without copying its content;
- Project-wide model replacement showing all affected Scenes and `要確認` state;
- temporary camera versus shared Saved View and separate entry-view assignment;
- all five file purposes with exact whole/base-dependent/one-Scene consequences;
- affected-only semantic conflict blocking and an explicit resolution/recovery path;
- feature-parity reachability on physical iPhone, not a contributor-only layout;
- Desktop rendered walkthrough and physical-iPhone checks where the change is
  mobile-sensitive.

DOM structure or CSS inspection proves neither visual quality nor physical
device acceptance. A development server is not offline/PWA evidence.

## 12. Implementation snapshot and change control

> Classification: **Current implementation snapshot / no rendered acceptance**.

As inspected on 2026-09-07, branch `g0-baseline` at checkpoint
`21786771bdb39800a29f835fa4f25535cd01d5bc` contains the one-home composition,
four-tab workspace, Caption list/detail, pin-color controls, multiple
Caption-window comparison and the warm-greige visual system. The current Native
implementation still persists DisplaySets and uses fixed-baseline package
exchange. ProjectScene, continuing causal Contribution and the five-purpose v2
package contract are accepted but not implemented. The relevant current code is
under `src/ui` and `src/nativeGs`; task-specific evidence remains in
`tasks/uiux-implementation.md` and `tasks/uiux-parity-plan.md`.

Automated checks can establish structure and state contracts; rendered Desktop
and any newly required physical-iPhone acceptance remain separately recorded
evidence. A changed interaction principle or product behavior requires the
applicable Product Owner and specification decision before implementation; this
document must not be used to conceal a behavior or architecture gap with copy or
layout alone.
