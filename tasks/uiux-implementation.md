# Approved public-candidate UI implementation

Status: BASE UI IMPLEMENTED / LEGACY-CONVENIENCE EXTENSION IN `uiux-parity-plan.md` /
RENDERED UI ACCEPTANCE PENDING.

2026-09-06 update: the Product Owner approved D1–D4 and the three follow-on
legacy-convenience slices. They are implemented and independently code-reviewed
with no remaining P0/P1. The execution record and current verification limits are
in `tasks/uiux-parity-plan.md` §9 and the top of `tasks/todo.md`. The 2026-09-05
evidence below remains a historical record of the base UI, not the current tree.
Follow-up 2026-09-06: `uiux-parity-plan.md` records the renewed legacy-convenience
audit and PROPOSED remaining-work plan. The 42 groups below describe Native
coverage, not full LociMyu parity. No further code is authorized by that planning turn.
PO requested the existing-function/UI crosswalk followed by
implementation on 2026-09-05. This is UI approval, not release or new storage policy.
Design authority: `uiux-audit-design.md` §§20.5–23; color circles immediately above
the Caption list, below search/owner fields. Current behavior: source and tests.

## Baseline and limits

- Branch `g0-baseline`, HEAD `d2302ec7e31e563448393ae3b42798e27d219b14`.
- Local origin tracking comparison 0 ahead / 0 behind; no remote fetch performed.
- Pre-existing worktree changes: todo, lessons, untracked audit/design report.
- Existing PO Desktop/iPhone acceptance is for the earlier implementation only.
- Browser connection retry failed at initialization. No click/timing/rendered or
  new physical-device acceptance is claimed by the code-backed crosswalk.
- No private source bytes or identifiers are required for this work.

## Existing functionality → production UI crosswalk

All 42 groups from design §21.3 were checked again against current source by the
writer and two read-only reviewers. No group is unassigned. Rows represent feature
groups, not interaction counts. This table is the implementation checklist;
placement is not evidence of executed UI acceptance.

| ID | Existing capability | Destination / preserved boundary |
|---|---|---|
| F01 | Project, View/Edit, close | Common header; explicit reopen/mode, guarded home |
| F02 | Save, saving, success/failure | Header; existing rollback on failure remains explicit |
| F03 | Lock, read-only, dirty, leave/reload | Common status; never hidden behind a tab |
| H01 | File picker/drop, container inspection | Single home, file-open; OS drop hook retained |
| H02 | Native list, View/Edit, exports, delete | Single home project rows; latest-state/lock checks |
| H03 | Name, Mesh/Point, GS, optional explicit Proxy | Home creation form; mixed input, no empty project |
| H04 | Restore, LociMyu conversion, v1 view/conversion, reports | Same home intake; original sources preserved |
| D01 | DisplaySet switch | Shared header; not Asset visibility or tab selection |
| C01 | List, search/owner, select/deselect, count/empty | Caption tab list; separate scrolling and details |
| C02 | New target, place, cancel | Caption action band; target independent from selection |
| C03 | Move/finish, surface reposition, owner confirmation | Beside new/selected pin; explicit cancel, no implicit save |
| C04 | Title/body/color | Selected detail; title limit and permissions retained |
| C05 | Select image, attach+save, format guidance | “メディアを追加”; clean Edit only, current image formats |
| C06 | Panel image and overlay image viewer | Detail/float; retain both including unplaced Caption access |
| C07 | Connected floating Caption, drag/resize/close | 3D stage; one selected window, title and × |
| C08 | Unplaced/review/hidden reasons, delete confirmation | List/detail; no silent owner/relation inference |
| M01 | Independent model target | Model tab; does not follow Caption/material target |
| M02 | Individual/bulk visibility | Model tab; Edit, normal save |
| M03 | Translate/rotate/scale gizmo and numeric apply | Model placement; preserve unapplied input on tab switch |
| M04 | Pin-scale number/log slider/value | Model detail; existing 0.001–1000 bound |
| M05 | Point diameter slider/value | Point only, View allowed, UI-only |
| M06 | GS Proxy status/explicit input | Model context and add/replace; no independent Proxy asset |
| M07 | Add, inspect, progress/failure | Model management; saves ALL working changes immediately |
| M08 | Replace/delete/guards | Model management; replacement saves ALL working changes |
| A01 | Mesh/slot and support status | Material tab; exact DisplaySet/Representation/slot |
| A02 | Opacity, double-sided, unlit, reset | Material base controls; remove override, not source edit |
| A03 | Chroma, color, tolerance, feather | “特定の色を透かす”; reasons for unsupported surfaces |
| V01 | Six axes, whole fit | View tab and 3D shortcut; no inferred front orientation |
| V02 | Perspective/orthographic | View/3D shortcut, UI-only |
| V03 | Saved View select/apply | View; selection alone never changes camera |
| V04 | View name/create/update/delete | View; create sets current set switch-view, normal save |
| V05 | 3D background color | View lower priority; separate from interface palette |
| E01 | Full backup | File/share → guarded home → named project's existing export |
| E02 | Collaboration export | Same entry; baseline/lineage semantics unchanged |
| E03 | Review/share | Same entry; DURABLE allowlist, not current UI filters |
| E04 | Clean editable copy | Same entry; new identity, cannot merge into origin |
| E05 | Merge/noop/conflict/retry | File/share, named clean Edit; conflict all-or-nothing |
| E06 | Progress/cancel/read-back/OS save/stage cleanup | Home result; keep real cancellation boundaries |
| G01 | Mouse/touch/camera/placement guidance | Help and visible mode action band |
| G02 | GS offline preparation/install/storage warning | Home device guidance; dev never offline evidence |
| G03 | Loading/readiness/errors/diagnostics/unload/reload | Shared status plus help/device details |
| G04 | Profile display name | Home; legacy read-only profile guard retained |

### Findings closed before implementation

1. Both add AND replace save other pending working changes. Say so before either.
2. Native package picker deliberately has no `accept` restriction for iPhone.
3. Export acquires a lock and reloads durable data. Close an open session first;
   never call its handler while retaining the project's Edit lock.
4. Panel images remain accessible even when a Caption cannot have a 3D overlay.
5. Tab/layout/filter updates must not call `setSnapshot`/`selectCaption`: those
   calls reset placement/gizmo state. DOM inputs, canvas and Viewer stay mounted.
6. Conversion/merge do not have user cancellation. Do not invent a working Cancel.
7. Legacy-only set create/rename, attachment detach/reorder and background reset
   are NOT missing existing Native functions and are not added here.

## Bounded implementation slices and acceptance

### 1 — One start screen

Compose existing Native home controls and ordinary import/legacy/profile controls
at `/`. New creation is a disclosed form on this screen, not a second home. Keep
the package inspection/restore service and direct export user gesture. A model
file may enter the creation form without selecting it again; ambiguous PLY role
requires an explicit choice and Proxy relations are never guessed.

Accept: H01–H04/G02/G04 and all four exports remain reachable; legacy read-only and
conversion services unchanged; current iPhone picker constraint retained; source
files unchanged. No storage/layout migration, package purpose inference or SW work.

### 2 — Workspace hierarchy and visual system

Fresh production composition using existing controls/handlers, not promotion of
the conversation mock. Four tabs: キャプション / モデル / マテリアル / 視点.
Shared project/save/DisplaySet/status; independently scrolling list and details.
Compact layout switches list/content without discarding selection, fields or list
position. Neutral low-chroma greige, restrained system-sans brand, 2px corners,
44px targets, differentiated primary/secondary/pressed/focus/disabled states.

Accept: remaining 42 groups have the assigned entry and unchanged mutation paths;
tab switches preserve DOM identity, input, search, selection, target, camera, dirty
and modes. No format expansion, model refactor, backend rewrite or new dependencies.

### 3 — P01 and explicit UI states

P01 is an approved NEW UI-only feature, not one of the existing 42 groups. Direct
color circles above the list, per DisplaySet; all-mode includes new colors; partial
sets retain intent including zero. Filter only 3D pins, AND existing visibility and
readiness. Both hit paths exclude hidden pins. Keep list, selection, detail/window;
hide only the connector when a selected pin is filtered. “色で非表示 / 表示” restores
its color without overriding hidden Assets. No dirty flag, schema or export effect.

Explicit placement/reposition exit must not depend on a hidden tab. Preserve
failure/lock information and current save rollback; input-retaining save recovery
is deferred because it changes the accepted behavior, not just the layout.

Accept: pure color-state tests including zero/new colors/per-set/case normalization;
DOM placement/state checks; no storage/serialization changes. Existing renderer
semantics remain except this bounded marker visibility/hit condition. No new
camera algorithms, source relation inference, destructive shortcuts or auto winner.

## Verification and review

- Existing tests: legacy release mode, source selection/conversion, Native storage,
  package exchange/portable snapshots, unsaved guard, Caption list/overlay/offline.
- Required automated: `npm run typecheck`, `npm test`, `npm run build`.
- New UI-focused tests must distinguish structural/pure checks from browser proof.
- Independent read-only diff review after implementation; writer fixes findings.
- Desktop rendered/interaction evidence and physical iPhone remain mandatory for
  acceptance of this rendering change. If browser control stays unavailable, report
  the limitation and do not declare the UI candidate accepted. Fresh offline/PWA
  proof would require exact build and separately approved single HTTPS route.
- No commit, push, main/Pages/version/license/dependency/schema changes authorized.

## Execution record

Production UI changes are present, but rendering/device acceptance is pending.

- One ordinary home composes existing Native controls with package/legacy/LociMyu
  intake, profile and device help. Kept files have explicit roles/removal and retry.
- Four tabs preserve mounted controls. Caption list/content have separate local
  scroll; short viewports can scroll the task pane instead of clipping controls.
- Low-chroma greige is scoped to Native/home and their dialogs; the legacy viewer
  and 3D scene background remain independent. Camera shortcuts are modeless.
- P01 uses session-local per-set color state, actual marker visibility and both
  pick paths. Floating windows keep a reason/reveal action; no storage changes.
- Normal save failure still rolls back, with a visible error. No input-retention
  contract is claimed. Destructive confirmations and export read-back remain.

Read-only reviews found and prompted fixes to cross-home concurrency, stale boot
rendering, retained source selection, restore retry, export-result cleanup state,
post-placement mode timing and overlay color recovery. The workspace review was
interrupted before a final full-diff conclusion; it is not final review approval.

Verification so far: prior full suite 65 files / 1542 passed / 21 existing todo;
25 new tests passed separately (19 color state, 3 mounted navigation/dialog,
3 real Viewer marker/projection/picking methods without WebGL). Typecheck passed.
Build passed with existing-style large chunk/dynamic import warnings. Final full
rerun and final evidence summary follow below. These checks are NOT browser proof.

### Final automated evidence — 2026-09-05

| Check | Result |
|---|---|
| `npm run typecheck` | PASS after correcting type annotations in the test doubles |
| `npm test` | PASS: 69 files, 1572 tests; 21 pre-existing todo; 109.04 seconds |
| `npm run build` | PASS; large-chunk and mixed static/dynamic import warnings remain |
| `git diff --check` | PASS |
| New UI regression tests | 30: 5 home, 19 color state, 3 mounted navigation/dialog, 3 Viewer marker/picking |
| Browser rendering / measured 41-task walkthrough | NOT VERIFIED: browser runtime initialization fails |
| Physical iPhone / offline-PWA evidence | NOT RUN; earlier product acceptance is not new UI acceptance |
| Independent final review | INCOMPLETE; interim findings corrected, no final approval |

The home tests execute the production home composition with test DOM/storage
substitutes: exclusive intake, result-derived navigation block/cleanup, explicit
source replacement and superseded asynchronous boot protection. They do not prove
OS file-picker behavior, rendered layout, touch usability or OPFS performance.

Meta-audit: branch/HEAD remain the baseline above and local tracking divergence is
0/0. UI/source/test/document changes are uncommitted. No public input, dependency,
schema, package semantics, PWA source/config, license/version or deployment change.
No dev server, tunnel or private-source input was started/used for this implementation
run. Build output is ignored and no `dist` files are tracked. Existing public
isolation tests passed; this is not a new exhaustive private-byte forensic audit.

Next acceptance is human/rendered Desktop testing from ordinary `/`, physical
iPhone checks and completed independent review. Do not proceed to another feature,
release or commit merely because the automated checks pass. Fresh task 35/41
offline testing still needs a separately approved exact build and one HTTPS route.
