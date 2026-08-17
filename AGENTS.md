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

## Change rules

- For architecture, storage schema, renderer, migration, security, or package changes: write or update the specification and acceptance criteria before implementation.
- Keep changes small and reversible. Do not combine dependency upgrades, refactors, and features in one change.
- When v2 migration is implemented, preserve v1 input and use dual-read/v2-only-write unless a later accepted specification says otherwise. This does not prohibit maintenance of the current v1 writer before that migration exists.
- Do not describe Gaussian Splatting, Automerge, CAS, multiple simultaneous models, or renderer ports as implemented until their gate has passed and the code exists.

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
