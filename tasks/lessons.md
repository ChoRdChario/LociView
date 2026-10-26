# Working lessons

Keep durable corrections here; update an existing rule when the same issue recurs.
Working procedure is in [AGENTS.md](../AGENTS.md); product behavior remains governed
by accepted specifications and [UI guidelines](../docs/ui-product-guidelines.md).
Read only the relevant topic, not every historical incident.

## Whole-product progress and bounded verification

- 2026-09-14: Finish connected user operations before polishing helpers. Internal
  checks stay focused; final tests/build/review belong to the connected milestone.
  Do not make audit, fixture or commit counts substitutes for missing user flows.
  A field/control is not automatically a milestone: group adjacent changes under
  the same user workflow and reuse invariant tests instead of multiplying full
  roundtrips. Keep the required final suite/review and data-loss safeguards.
  The PO observed 90% allowance consumption in one overnight goal run; calendar
  estimates must include available usage, not assume 6–8 agent hours every day.
  Distinguish measured test wall time from unmeasured model/quota attribution.
  2026-10-15 refinement: give one writer the connected workflow through review;
  use read-only agents for independent cause/recipe/contract work. Prioritize the
  missing adoption condition and keep remaining features in scope. New agent
  capability does not establish a throughput multiplier or waive device evidence.
  PO correction later that day: build the integrated workflow before grouped
  human testing. Do not turn each small improvement or fixture into a PO test
  request. Pending human acceptance is recorded, not a dependency of continued
  implementation; actual adoption/release gates and autonomous checks remain.
  Completion reports must state the delivered result and remaining limits; until
  the application is complete, always include the concrete next planned unit
  (PO instruction 2026-10-15). A verified slice is not application completion.
  2026-10-27 priority correction: keep the missing accepted features on the
  critical path until the complete set is integrated and coherent. Do not let
  measured latency, helper optimization or repeated verification displace feature
  completion. Refactor as needed for integration; fix blocking/data-loss defects
  promptly and keep ordinary performance polish in backlog. Reports distinguish
  missing implementation, integration, acceptance and performance explicitly.
- 2026-09-20: Runtime checks also have a UX cost. Measure the complete user
  action's I/O amplification before adding more validation. Reuse owned evidence
  within an explicitly bounded operation; retain input, write, publication and
  recovery safeguards. Do not repeat a full manual walkthrough to assess one
  latency fix, or add a new test framework for checks existing suites can cover.
  When a final whole-suite run is next, do not first repeat entire large integration
  suites: filter the changed regression during editing, then run the final suite once.
  2026-10-15 refinement: the second pass reduced synthetic root listings, while
  Chrome acceptance stayed open. Measure the real action's storage, validation,
  projection/refresh, package generation and download waits before another fix.
  Repeated output discovery and harness conversion are hypotheses to investigate,
  not established browser bottlenecks. Preserve the accepted read-operation
  lifetime and all write/publication/recovery checks.
  When different connected cases exceed waits in consecutive full runs, stop
  individual poll fixes/full reruns and inspect their common operation completion
  and resource lifetime. Await actual owner/UI confirmation, close fixture-owned
  mocks/hosts even on failure and remove unused setup while retaining original
  inputs, history/results and outer budgets. A retained mock graph is evidence
  of a lifetime defect, not proof of a particular timeout or product latency.
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
  2026-10-26 refinement: verify local commands, component identity and reinstall
  source before prescribing repair. Separate app/runtime, bundled operation plugin
  and browser extension failures; do not repeat generic UI/restart advice against
  an unchanged preconnection import error. A feedback submission does not establish
  an individual reply channel; never make an unverified reply a development gate.
  Before uninstalling a loaded plugin, check its helper usage and release that
  exact helper through normal approved maintenance. A failed uninstall can leave
  missing manifests while inventory still says installed; verify required files.

## User intent, saving and visible status

- Use a complete product description with LociView as subject and short intent-based
  action labels. Remove redundant help, but retain failure, effects and recovery.
  Daily work must not require package-purpose, receipt or reference-management
  knowledge. Follow UI guidelines §§2.1/4.4–4.5/6.1/9.2: meaningful choices,
  contextual detail and no routine internal inspection, without deleting useful
  viewing functions or weakening explicit decisions and recovery guarantees.
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
  steps stated in the tester's visible words. Request them once a complete
  workflow is ready, and group the affected checks; do not repeatedly interrupt
  the PO for individual controls or use their availability to sequence development.
  Before recommending a file, run its exact bytes through that route's admission
  and creation/reopen path. A similarly named or synthetic in-test fixture is not
  evidence for the file handed to the tester; keep local-only samples out of public builds.

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
