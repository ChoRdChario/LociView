# LociView project instructions

## Canonical scope

- This repository is the only active source of truth for LociView.
- Read `PROJECT_MAP.md` and `docs/README.md` before non-trivial work. Read only task-relevant entries from `tasks/lessons.md`.
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

- Interactive entity edits in an opened project go through `ProjectStore.dispatch()`.
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

## Short meta-audits

- Run a short meta-audit after a meaningful slice, before changing acceptance contract/workstream/subsystem, when scope must expand, when a new P0/P1 or external/specification dependency appears, or when auxiliary tests/fixtures/docs keep growing without closing a production boundary or gate item.
- Recheck branch, HEAD, worktree, active gate and exit criteria, recent production versus auxiliary changes, verification, known failures, blockers and external evidence lanes. Treat the previous priority and next-slice choice as hypotheses, not authority.
- Prefer closing an accepted boundary, ordinaryizing a known failure or removing a release blocker over increasing test, fixture, review or commit counts. Add auxiliary verification only when the current slice cannot be judged safely with existing acceptance.
- Keep the audit brief and use existing repository evidence. If the current strategy still follows the critical path, record that conclusion concisely and continue; do not turn meta-audit into a separate workstream.
- Before the next slice, state its target, purpose, boundary/acceptance, production scope, reused and genuinely missing acceptance, completion criteria, exclusions and stop conditions.
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

Run at minimum:

```powershell
npm run typecheck
npm test
npm run build
```

For GitHub Pages/PWA path changes, also verify:

```powershell
$env:BASE_PATH='/LociView/'
npm run build
```

For dependency changes, also run `npm audit`. Rendering changes require recorded browser evidence; mobile-sensitive rendering or storage changes require physical iOS verification.
