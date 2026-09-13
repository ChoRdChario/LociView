# Working lessons

Keep durable corrections here; update an existing rule when the same issue recurs.
Working procedure is in [AGENTS.md](../AGENTS.md); product behavior remains governed
by accepted specifications and [UI guidelines](../docs/ui-product-guidelines.md).
Read only the relevant topic, not every historical incident.

## Whole-product progress and bounded verification

- 2026-09-14: Finish connected user operations before polishing helpers. Internal
  checks stay focused; final tests/build/review belong to the connected milestone.
  Do not make audit, fixture or commit counts substitutes for missing user flows.
- Current work belongs in todo, coverage in inventory, contracts in specifications.
  Map/handoff/index should link rather than repeat changing counts and next steps.
- An approved plan authorizes its ordinary implementation/fixes. Stop only at an
  actual new decision/authority boundary; a prior historical wait is not a new one.

## 長期プロジェクトと長期Codexセッションを分離する

- Preserve the checkpoint, pending work, evidence and acceptance boundaries in the
  repository. Recommend a fresh task when old context repeatedly obscures current
  work; do not create one without the user's request.
- Keep one writer; parallel reviewers read only. Run heavy shared-workspace checks
  serially. Verify staged content equals the tested/reviewed content; do not repeat
  an unchanged source review solely because the same files were staged.
- An environment/tool failure is not product failure. Try a genuinely different,
  authorized path; do not retry the same denied operation or fabricate acceptance.

## User intent, saving and visible status

- Use a complete product description with LociView as subject and short intent-based
  action labels. Remove redundant help, but retain failure, effects and recovery.
- Internal resume/autosave is not a confirmed external file save. A latest resume
  slot is not permission to discard continuing causal history or protected bodies.
- Team-workflow labels describe actions, not fixed distributor/participant roles.
  Independent keep-both means independently editable records; never infer a winner.
- Scene and pin color organize records; model-relative anchors define position.
  needsReview is a status: known-position pins remain visible/selectable, with
  explicit parent reassignment and a missing-model group as specified.
- Pin placement owns its gesture, including Shift+click. Blender-style camera
  input and accumulated Caption windows follow the accepted UI interaction rules.
- Human tests require a usable position-editing UI, the exact served link and
  steps stated in the tester's visible words. Retest only the affected boundary.

## Historical topic lookup

The [original lesson record](../docs/history/development-through-2026-09-14/tasks/lessons.md)
retains every incident. Search its headings only when the task needs that evidence:

| Topic | Search terms / current contract |
|---|---|
| Storage, recovery, evidence | `読み取りの競合`, `500`, `saved`, `journal`; specifications 02/05/06 |
| UI composition, tone, wording | `UI`, `文言`, `全体`, `一覧`; UI product guidelines |
| Native/LociMyu conversion | `LociMyu`, `source`, `migration`; specifications 04/07 |
| Rendering and pins | `renderer`, `interaction`, `pin`, `半透明`; specifications 01/05 |
| iPhone/offline and browser operation | `実機`, `offline`, `PWA`, `操作環境`; relevant gate/runbook |

Historical numeric thresholds or old stop rules do not override current AGENTS,
approved contracts or delegated task scope. Do not revive superseded workstreams.
