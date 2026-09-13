# LociView project instructions

## Canonical scope

- This repository is the only active source of truth for LociView.
- On a fresh session or workstream change, read the short `tasks/todo.md` current boundary, `PROJECT_MAP.md` and `docs/README.md`; then open only the relevant contracts and code. For an ongoing bounded fix, start at its target and tests without re-reading every entrypoint.
- `tasks/todo.md` owns current work, checks and next actions; `tasks/implementation-inventory.md` owns route-specific feature coverage. Map, index and handoff link to these records rather than duplicating progress counts or per-commit logs.
- Read only relevant entries from `tasks/lessons.md`. `docs/history` is evidence, not an active task queue or a source of renewed approval requirements.
- Authority is purpose-specific:
  - working rules: `AGENTS.md`;
  - currently observed behavior: code and executable tests;
  - v1 package/wire compatibility: frozen v1 contract plus golden fixtures;
  - accepted architecture/product invariants: an accepted ADR constrains PoCs and specifications immediately;
  - candidate technology and performance guarantees: adopted only after their explicit gate passes.
- If code, tests, and the applicable compatibility/specification contract disagree, stop and record the discrepancy. Do not silently redefine the contract to match the code.
- Documents marked `PROPOSED` are not implemented.
- Do not use `G:\00_AI_dev\Locimyu2` or `G:\00_AI_dev\_archive` unless a task explicitly concerns legacy evidence.

## Normal search scope

- Start from the task's target file, its tests, and direct imports.
- Do not recursively inspect `.git`, `node_modules`, `dist`, `coverage`, or `dev-dist`.
- Read `public/samples`, `docs/mockups`, and `package-lock.json` only when relevant.

## Architecture rules

- Interactive entity edits use the active route's command boundary: `ProjectStore.dispatch()` for legacy v1, the accepted Native services for Native, and `MetadataProjectSession` commands for the bounded ProjectScene path (specification 05). Never write storage directly from UI or mix route authorities.
- Project creation and new-package import validate the container path/manifest but preserve v1 operation-log source text according to the frozen v1 contract, including forward-compatible unknown content and reportable malformed lines.
- Merge into an opened project goes through the project/package merge services, which validate/accept operations and coordinate log and binary writes; do not bypass these boundaries from UI code.
- Binary I/O goes through `WorkspaceFS` and asset/package helpers.
- UI-only state belongs in `AppContext.ui`.
- `core`, `platform`, and `viewer` must not import from `ui`.
- `viewer` must not depend on project storage or package formats.
- Do not expand the existing directory-level `assets`/`io` cycle.
- Treat ZIP, JSONL, CSV, XLSX, model files, filenames, and imported metadata as untrusted input.
- Do not add runtime CDN or network dependencies. Dependency additions require approval, lockfile review, and `npm audit`.

## AI collaboration

- One implementation branch has one writer at a time. Multiple AIs do not edit the same files concurrently.
- The implementation AI does not approve its own architecture, security-sensitive change, migration, or final diff.
- Independent reviewers are read-only and judge the approved specification, diff, and executed evidence.
- Chat history is not a specification. Move approved decisions and acceptance criteria into this repository before implementation.
- A PoC is disposable and isolated. Do not promote PoC code directly into production without a production implementation and review.
- Record a short outcome-oriented plan before non-trivial implementation. Existing PO approval covers normal sequencing, relevant tests and fixes within that scope; do not request the same approval at each helper or checkpoint.
- Keep one writer and use bounded read-only parallel work when it helps. Run heavy whole-workspace tests/builds serially. Review the meaningful final diff once; re-review only later substantive changes or unresolved findings, not identical code merely because it was staged.

## Short meta-audits

- Run a short meta-audit at a connected workflow milestone, before changing an acceptance contract/workstream, when scope must expand, when a new P0/P1 or external/specification dependency appears, or when auxiliary work grows without closing a user workflow or gate item. Do not make each helper a separate audit milestone.
- Recheck branch, HEAD, worktree, active gate and exit criteria, recent production versus auxiliary changes, verification, known failures, blockers and external evidence lanes. Treat the previous priority and next-slice choice as hypotheses, not authority.
- Prefer closing an accepted boundary, ordinaryizing a known failure or removing a release blocker over increasing test, fixture, review or commit counts. Add auxiliary verification only when the current slice cannot be judged safely with existing acceptance.
- Keep the audit brief and use existing repository evidence. If the current strategy still follows the critical path, record that conclusion concisely and continue; do not turn meta-audit into a separate workstream.
- Before the next connected unit, record the user outcome, relevant acceptance, exclusions and genuine stop conditions briefly in todo. Reuse existing checks and records; do not create another matrix or PoC unless a concrete evidence gap requires it.
- Change priority or slice structure autonomously within the approved product/gate scope when evidence supports it. Stop and ask the Product Owner before resolving a specification conflict, ratifying a product policy or numeric guarantee, making a large architecture or compatibility/migration decision, expanding beyond approved scope, or crossing a release/deploy/destructive boundary.

## Change rules

- For architecture, storage schema, renderer, migration, security, or package changes: write or update the specification and acceptance criteria before implementation.
- Keep changes small and reversible. Do not combine dependency upgrades, refactors, and features in one change.
- When v2 migration is implemented, preserve v1 input and use dual-read/v2-only-write unless a later accepted specification says otherwise. This does not prohibit maintenance of the current v1 writer before that migration exists.
- Do not describe Gaussian Splatting, Automerge, CAS, multiple simultaneous models, or renderer ports as adopted, generally supported or gate-passed until the applicable gate has passed and the code exists. `Implemented` may describe only an exact bounded production path whose code and executed evidence exist; it must state the tested scope and must not imply aggregate gate, adoption, broader support or release credit.

## UI copy rules

- Introduce the product with a complete statement whose subject is `LociView` and
  whose predicate names its core user-facing capability. Do not substitute an
  imperative fragment or an unexplained slogan for the product description.
- Label an action by the result the user wants, using familiar terms and a short
  verb phrase such as `ファイルを開く` or `メディアを追加`. Do not use internal
  formats, implementation steps or a control type as the action name.
- Use one stable term for one concept. A visible control label and its accessible
  name must use the same wording; supplemental help belongs in an accessible
  description, not in an inflated control name.
- Helper text may add only information that changes the current action or decision:
  a required condition, important consequence or non-obvious alternative. Remove
  paraphrases of the label and routine narration of automatic behavior.
- Prefer input-neutral wording such as `選択`. Mention `ここにドロップ` only as
  an additional discoverable path. Do not use `クリック` or `タップ` unless the
  task genuinely depends on that input method, and never make dragging the only
  way to complete an action.
- If content inspection can choose one safe path, expose one intent-based entry and
  reveal the detected result and conditional controls afterward. Do not ask the
  user to choose a file type or internal role that the product can determine.
- Use progressive disclosure for rare or state-specific controls. Keep one primary
  action per decision point and avoid competing cards that lead to the same result.
- Brevity must not hide failure, ambiguity, unsaved state, destructive effects,
  source preservation or recovery. State these beside the affected control when
  they become relevant, in plain language without blame.
- Describe collaboration with its user-visible scope. Do not use generic wording
  such as `other data can be merged` when the implemented path requires the same
  Project lineage and a collaboration file; never imply cross-model matching.
- Review every string in its rendered context: if removing it changes no user
  decision, prevents no error and removes no recovery instruction, remove it or
  move it to contextual help.

## Verification

During a connected implementation unit, use focused checks for the changed behavior.
At its final source/test tree, run at minimum (serially):

```powershell
npm run typecheck
npm test
npm run build
```

Also run `npm run build:harness` when the changed path ships in the isolated harness.
After a check passes, repeat or broaden it only for relevant subsequent changes,
failures or unresolved concerns. Staging unchanged content, updating result prose,
or an unpushed commit is not a reason to repeat all runtime checks. Validate that
the staged source/test content is the reviewed and tested content instead.

For documentation/instruction-only changes, check the diff, local links, retained
history and instruction/contract consistency; no runtime suite/build is required.
This exception does not verify pre-existing dirty product code.

For GitHub Pages/PWA path changes, also verify:

```powershell
$env:BASE_PATH='/LociView/'
npm run build
```

For dependency changes, also run `npm audit`. Rendering changes require recorded browser evidence; mobile-sensitive rendering or storage changes require physical iOS verification. Group human checks at the approved adoption/candidate boundaries unless a concrete new risk requires an earlier check. Do not count dev-server checks as offline/PWA evidence or old-route acceptance as new-route acceptance.

## Checkpoints and Push

- PO authorization renewed 2026-09-14: commit and push suitable verified checkpoints to the existing `g0-baseline` branch without asking at every checkpoint. Keep unrelated or unverified work out of the commit.
- Before pushing, check the actual branch/remote, staged scope, required evidence, outgoing changes for private source material, and whether the push triggers deployment. Never force-push as routine cleanup.
- Push authorization is not release/deployment authorization. `main`, Pages, Service Worker, license/version, public fixture distribution and release remain separately gated. A pending push does not block local implementation or require repeated tests.
- User permission and environment approval are separate. A known denied action must not be retried unchanged or bypassed; use a materially safer authorized alternative or report the exact remaining constraint.
- Update todo with the checkpoint and remaining work; use Git for commit identity instead of copying full logs into every document. A fresh task is useful at a safe handoff, but create it only on user request.
