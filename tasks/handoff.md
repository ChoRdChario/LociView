# Fresh-session handoff — public-candidate preparation

> **Current update (2026-09-08 focused correction):** Contract checkpoint
> `25b9a776de84a2bb0fb4eb4d78aa542aeb64fb48` is pushed. The Product Owner then
> selected explicit keep-one/keep-both conflict choices, with keep-both creating
> independently editable Caption/model items. Specification 05 sections 8, 12.6
> and 13 define the correction, one continuing-team acceptance flow and the
> immediate S1 entry; specification 03 section 6 maps the updated G1-C evidence.
> Use the current top of `tasks/todo.md`. S1/S2 own their required iOS storage
> checks; S3 owns integrated product/UI acceptance. Reuse applicable evidence and
> do not repeat broad review or unchanged tests after the focused correction.

> **Historical update (2026-09-07 ProjectScene/team contract):** The Product Owner
> accepted the Project-as-typed-workspace, persistent ProjectScene and continuing
> causal team-work direction, including separate Team Workspace/Contribution/
> review/backup/clean purposes and full-Project editing. The preserved current
> implementation checkpoint is `21786771bdb39800a29f835fa4f25535cd01d5bc` and
> is pushed on `g0-baseline`. ADR-0002 and
> `docs/specs/05-project-scene-team-workflow.md` are the new accepted, not-yet-
> implemented authority; `tasks/team-operations-review.md` retains the audit
> rationale and `docs/ui-product-guidelines.md` the UI/UX and visual direction.
> Current Native DisplaySet/fixed-baseline behavior and all frozen input bytes
> remain unchanged. The contract and cross-document/privacy reviews found no
> remaining P0/P1. The current boundary ends after preserving and presenting this
> docs-only checkpoint; S1 has not started. A later requested continuation begins
> with the S1 meta-audit and slice statement. Stop before S2/S3, dependency
> adoption, release, Pages or Service Worker work.

> **Historical completed update (2026-09-06 implementation):** The Product Owner approved
> D1–D4 and all three bounded legacy-convenience UI slices. Production code,
> focused acceptance and independent read-only code review are complete with no
> remaining P0/P1. Rendered Desktop/41-task measurement and physical-iPhone
> acceptance remain open; see `tasks/uiux-parity-plan.md` §9 and `tasks/todo.md`.
> This does not authorize release, commit/push, Pages or Service Worker changes.

> **Historical superseded planning update (2026-09-06):** PO requested a renewed legacy-convenience audit
> and a remaining-work-first UI/UX plan. See `tasks/uiux-parity-plan.md` and the
> current top of `tasks/todo.md`. This is document-only planning; D1–D4 and further
> implementation require PO review. Existing UI code stays uncommitted and its
> live Desktop/iPhone acceptance and independent final diff review remain open.

> **Historical superseded update (2026-09-05):** The PO subsequently approved the refined UI
> design and requested an existing-function/UI crosswalk followed by implementation.
> See `tasks/uiux-implementation.md` and the top of `tasks/todo.md` for the current
> worktree and verification boundary. The no-production-authorization statements
> below describe the earlier handoff, not the current UI authorization. This UI
> change has no new rendered/physical-iPhone acceptance and no release approval.

> **Historical checkpoint status (superseded by the 2026-09-07 update):** the bounded Native-only write-authority path,
> device-side HEIC-to-JPEG compatibility path, automated checks and Product
> Owner Desktop/physical-iPhone acceptance are complete. The latest production
> implementation is `6b2a28a0e5983676c9dc5d97534d916e3288f40d`; the accepted
> result checkpoint at the start of this handoff preparation is
> `87a249d4ab85308c0486366c5516bc82dd7ff139`. Its clean GitHub Actions run
> passed and no P0/P1 was unresolved. At that checkpoint, the next authorized workstream was a
> task-based public-candidate UI/UX audit and design pass; see
> `tasks/uiux-handoff.md`. This does not authorize production or release work.
>
> This file is navigation and handoff context, not a product specification.
> Code/tests define observed behavior; accepted specifications define product
> invariants. If this file disagrees with either, stop and resolve the mismatch.

## 1. Canonical checkpoint

- Repository: `ChoRdChario/LociView`
- Branch: `g0-baseline`
- UI/UX handoff preparation start checkpoint:
  `87a249d4ab85308c0486366c5516bc82dd7ff139`
- Accepted documentation checkpoint: `5f2a19df9fcfd50215d1313c1265e6cdf82872b4`
- Native Package Exchange implementation:
  `0b5dd461d761fc0669b1c0c80b3d6549cd01b1e6`
- Direct-LociMyu acceptance synchronization:
  `aa3a55b67a220c222c0ad503413a5a706e636cfe`
- Option-A bounded implementation:
  `9c5596b6df712df0105904c9f2e0ecc62e1440a0`
- Accepted corrective executable commit:
  `f6c88967155b0c83d4bcdd4fec6b4a78d9caf772`
- First-candidate device-side HEIC compatibility start HEAD:
  `14257e0a13526f7233e474c0f61b259cd443933d`; exact implementation commit:
  `6b2a28a0e5983676c9dc5d97534d916e3288f40d`.
- Accepted Native Package Exchange tree verification: typecheck, 60 test files /
  1,478 passing tests with 21 existing todo, and production build all PASS.
- Option-A pre-HEIC executable checkpoint: the indexed tree passed typecheck,
  61 test files / 1,501 tests with 21 existing todo and both production builds.
  The corrective tree adds two focused passing tests; its one unrelated
  five-second verifier timeout passed on immediate single-test and full-file
  reruns (1/1 and 82/82). Independent read-only reviews found no remaining
  code P0/P1.
- Product Owner acceptance: option-A Desktop PASS, including immediate unsaved
  Caption pin/overlay display; physical-iPhone PASS includes Native restore/
  save/completely-offline-reopen and the later device-side HEIC-to-JPEG
  compatibility flow; no unresolved P0/P1.
- At the handoff preparation start checkpoint, local `g0-baseline` matched
  `origin/g0-baseline`, the worktree was clean, no commit was unpushed, GitHub
  Actions run `33885272816` passed on the same SHA, and no temporary preview,
  tunnel or HEIC PoC process was running.
- The first candidate does not require Windows HEIF/HEVC extensions and does
  not ship a decoder. Users make a separate JPEG on their device and attach
  that JPEG; direct original-byte HEIC/HEIF remains required post-candidate
  work. The existing libheif+libde265 decoder stays an isolated local PoC, and
  generated output remains outside the application/Pages/Service Worker graph.
  On the implementation tree, typecheck, 65 files / 1,542 tests with 21 existing todo,
  ordinary and Pages-path builds, public-codec isolation and Edge 152 actual
  JPEG/PNG/GIF/WebP decode all pass. Two independent reviews found no P0/P1.
  The Product Owner then accepted the physical-iPhone flow: direct HEIC was
  rejected with guidance, the separately exported JPEG was added and displayed,
  and the saved Project reopened with the attachment after Safari restart while
  completely offline.

Do not hard-code this document's own commit as the checkout target. At the
start of a fresh session, verify that current `g0-baseline` is a clean descendant
of `5f2a19d` and matches `origin/g0-baseline`.

## 2. Read order

Read these before the public-candidate UI/UX audit:

1. `AGENTS.md`
2. `PROJECT_MAP.md`
3. `docs/README.md`
4. this file
5. `tasks/uiux-handoff.md`
6. the top current boundary and next decision in `tasks/todo.md`
7. `tasks/critical-path.md` sections 7, 8 and 12
8. `tasks/lessons.md` section “長期プロジェクトと長期Codexセッションを分離する”
9. `docs/specs/00-product-contract.md` `PROD-13`–`PROD-16`, sections 4–8
   and 10, then
   `docs/specs/02-storage-package-migration.md` §31 and
   `docs/specs/03-gates-and-delivery.md` §3.8 for the selected Native-only
   candidate boundary; read `docs/specs/02-storage-package-migration.md` §29.3
   for current first-candidate HEIC compatibility; read §30 only if package
   detail is needed

Do not reconstruct current scope from chat history, the superseded roadmap or
old unchecked gate prose.

## 3. Public-candidate safety boundaries closed at the accepted scope

The items below remain closed for the accepted public-candidate safety contract;
the team-operation review does not reclassify its fail-closed implementation as
defective. A separately Product Owner-approved continuing-team contract may
supersede history/package semantics through updated specifications and new
acceptance before implementation.

Treat these as complete unless a newly reproduced P0/P1 directly blocks release:

- first production GS path and physical-iPhone rendering correction;
- streamed Native complete backup/restore;
- repeated multi-format Assets, independent transforms and per-Asset visibility;
- Caption ownership/placement/search/deletion, images, color, pin scale and
  temporary movable/resizable overlay;
- DisplaySet-linked Captions, material appearance and Saved Views;
- non-destructive frozen-v1 to Native conversion;
- direct LociMyu ZIP to Native conversion with source bytes preserved;
- Native Package Exchange:
  - collaboration package with one fixed baseline and Project lineage;
  - Caption/new-image three-way merge;
  - conflict report with zero Project writes;
  - idempotent re-import and lineage rejection;
  - source-nonmergeable review/share package, View mode by default; a restored
    v1 copy may later begin only a new independent lineage;
  - clean editable copy with a new Project ID/lineage;
  - existing complete backup retained as a separate purpose.

Within current candidate maintenance, do not reopen package permutations, extra camera inference, material-system
expansion, memory instrumentation, Proxy edge cases or additional physical-
iPhone evidence matrices without a release-blocking P0/P1. The authorized UX
session may identify workflow and presentation changes, but it may not make
production changes before Product Owner approval.

## 4. Product invariants that must not drift

- User-visible display/select/edit unit: Asset.
- Binary unit: Representation.
- Durable save, snapshot publication and activation unit: Project.
- Mesh, ordinary Point and GS are rendering formats, not exclusive display
  modes. Visibility is independent per Asset.
- Interaction Proxy belongs to its GS Asset and is not a user-visible layer.
- DisplaySet binds Caption membership, material appearance and an optional
  default Saved View. It is not an Asset layer/group/preset system.
- Native LociView Project is the durable authority. Frozen v1 and LociMyu ZIP
  are preserved, read-only conversion sources.
- Compare is excluded from MVP, the release gate and the critical path.
- Spark is the provisionally accepted first GS path, not a permanent decision
  for every renderer architecture.

This checkpoint does not complete G0/G0-S/G1, permanently adopt Spark or any
renderer, integrate `main`, or approve a release. Applicable gates remain
governed by `tasks/critical-path.md` until the Product Owner decides otherwise.

## 5. Selected candidate boundary and authorized implementation

The Product Owner selected option A on 2026-09-03. Native Project is the only
user-writable authority in the first public candidate. Legacy v1 remains safe
import, explicit View and non-destructive conversion into a separate Native
Project only. This does **not** remove Native Package Exchange or its accepted
Caption/new-image collaboration merge.

The Product Owner authorized the bounded `RC-A-01`–`RC-A-07` implementation on
2026-09-03 and accepted its Desktop product flow after the bounded corrective
commit. The resulting
implementation enforces the restriction at service/store/filesystem boundaries,
not only by hiding controls, and converts under an exclusive source-snapshot
guard without granting legacy Edit authority. Reportable malformed source lines remain exact
and non-active; a divergent operation opens no authoritative View and blocks
Native publication. The bounded v1 import must also remain inactive or exact
complete across an interrupted completion-manifest write and allow safe retry.
Legacy package/CSV export and device-local legacy-source deletion are absent.
Without durable OPFS,
legacy registration/conversion is unavailable rather than presented as
transiently saved. General journal, quarantine/resolution, writable-v1 S2/S3
work, package permutations and Compare remain excluded. UI production changes
now require the separate audit/design and Product Owner approval described in
`tasks/uiux-handoff.md`. A bounded private staging receipt closes only exact
import-marker publication; it is not
a package entry, source authority or general journal. One short ordinary-home
LociMyu discovery label/help route is release hygiene, not a new
importer or general UI-polish workstream.

For first-candidate Caption images, Native writes PNG/JPEG/WebP/GIF only.
Direct HEIC/HEIF selection fails closed before publication and explains how to
make a separate JPEG locally on the device. LociMyu HEIC/HEIF remains in the
conversion inventory/report but is not automatically attached; only an exact
source relation names the corresponding DisplaySet and Caption, and an unknown
relation is never guessed. The original HEIC and source ZIP stay with the user;
the manually added JPEG is the only Native media authority. This policy does
not delete the isolated decoder PoC or cancel post-candidate direct HEIC work.

Also surface these genuine release decisions/blockers:

- project-wide license adoption;
- third-party and built-output notices;
- application/package version and exact release SHA;
- current README and ordinary-home LociMyu discovery;
- clean-tree CI on the eventual final executable SHA (`87a249d` passed, but a
  later production change requires a new exact-tree result);
- `g0-baseline` to `main` integration method;
- named rollback point and previous-build rollback procedure;
- GitHub Pages/base-path/Service Worker update verification;
- remove the advertised POST share target unless a separately approved handler
  is implemented; the generated Service Worker currently has no POST handler;
- Spark absence from the normal v1 route and precache;
- absence of representative private source bytes from Git/build;
- whether public docs may retain private-source-derived fingerprint/name
  metadata.

Option A does not authorize license adoption, version/SHA selection, `main`
integration, Release creation or Pages deployment. Those remain separate Product
Owner decisions after RC-A implementation and exact-tree verification.

## 6. Next fresh session

The next session starts from the 2026-09-08 update at the top of this file and
the first current boundary in `tasks/todo.md`. Read ADR-0002, specification 05,
`tasks/team-operations-review.md` and `docs/ui-product-guidelines.md`; verify the
Git/worktree boundary read-only. Next execute the bounded S1 adapter-harness entry
in specification 05 section 13 after its existing dependency conditions; use its
result to close the remaining G1-A/C prerequisites before production storage.
No additional general audit/planning workstream is required. S2 stays
blocked until the separately specified ProjectScene migration and five-purpose
package-wire companions pass. S1/S2 collect their required physical-iOS storage/
recovery evidence; S3 owns the integrated product UI and `TEAM-FLOW-01` device run.
Stop before dependency adoption, license/version decisions, `main`, Pages,
Service Worker or deployment.

The older instruction to begin the 41-task UI walkthrough was completed or
superseded and is not the next workstream. Rendered Desktop and physical-iPhone
UI acceptance remain open but inactive until S3. Never use this document's
embedded SHA as an unchecked checkout target.
