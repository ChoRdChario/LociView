# Fresh-session handoff — release-candidate preparation

> Status: `CURRENT HANDOFF`; updated after the Product Owner selected and
> authorized the bounded Native-only write-authority implementation (option A)
> on 2026-09-03. The bounded implementation, indexed-tree automated matrix and
> Product Owner Desktop acceptance are complete; clean-checkout CI remains
> pending. The later first-candidate device-side HEIC compatibility tree has
> completed automated, Edge, independent-review and Product Owner physical-
> iPhone acceptance. The bounded implementation is fixed at
> `6b2a28a0e5983676c9dc5d97534d916e3288f40d`.
>
> This file is navigation and handoff context, not a product specification.
> Code/tests define observed behavior; accepted specifications define product
> invariants. If this file disagrees with either, stop and resolve the mismatch.

## 1. Canonical checkpoint

- Repository: `ChoRdChario/LociView`
- Branch: `g0-baseline`
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
- Current executable candidate: the option-A indexed tree passed typecheck,
  61 test files / 1,501 tests with 21 existing todo and both production builds.
  The corrective tree adds two focused passing tests; its one unrelated
  five-second verifier timeout passed on immediate single-test and full-file
  reruns (1/1 and 82/82). Independent read-only reviews found no remaining
  code P0/P1.
- Product Owner acceptance: option-A Desktop PASS, including immediate unsaved
  Caption pin/overlay display; physical-iPhone PASS includes Native restore/
  save/completely-offline-reopen and the later device-side HEIC-to-JPEG
  compatibility flow; no unresolved P0/P1.
- The device-side HEIC implementation and evidence commits remain local pending
  push. The worktree was clean before this result-only update, and its temporary
  preview server and HTTPS tunnel were stopped after acceptance.
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

Read only these before the first Product Owner decision:

1. `AGENTS.md`
2. `PROJECT_MAP.md`
3. `docs/README.md`
4. this file
5. the top current boundary in `tasks/todo.md`
6. `tasks/critical-path.md` sections 7, 8 and 12
7. `tasks/lessons.md` section “長期プロジェクトと長期Codexセッションを分離する”
8. `docs/specs/02-storage-package-migration.md` §31 and
   `docs/specs/03-gates-and-delivery.md` §3.8 for the selected Native-only
   candidate boundary; read `docs/specs/02-storage-package-migration.md` §29.3
   for current first-candidate HEIC compatibility; read §30 only if package
   detail is needed

Do not reconstruct current scope from chat history, the superseded roadmap or
old unchecked gate prose.

## 3. Closed production boundaries

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
  - non-mergeable review/share package, View mode by default;
  - clean editable copy with a new Project ID/lineage;
  - existing complete backup retained as a separate purpose.

Do not reopen package permutations, extra camera inference, material-system
expansion, Caption-overlay polish, memory instrumentation, Proxy edge cases or
additional physical-iPhone matrices without a release-blocking P0/P1.

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
work, package permutations, UI polish and Compare remain excluded. A bounded
private staging receipt closes only exact import-marker publication; it is not
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
- clean-tree CI;
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

## 6. First message for the fresh session

Copy the following as the first user message. Replace `<CURRENT_HEAD>` only
after checking Git; it must be a clean `g0-baseline` descendant of `5f2a19d`.

```text
LociViewのrelease-candidate準備を引き継いでください。

開始checkpoint：

- repository: ChoRdChario/LociView
- branch: g0-baseline
- HEAD: <CURRENT_HEAD>
- accepted product checkpoint: 5f2a19df9fcfd50215d1313c1265e6cdf82872b4
- Native Package Exchange implementation: 0b5dd461d761fc0669b1c0c80b3d6549cd01b1e6
- Desktop／physical iPhone Product Owner acceptance: PASS（端末側HEIC→JPEG互換
  フローを含む）
- unresolved P0／P1: なし

最初にread-onlyでbranch、HEAD、worktree、originとの差、private sourceの
Git／build非混入、一時server／tunnel停止を確認してください。その後、
`AGENTS.md`、`PROJECT_MAP.md`、`docs/README.md`、`tasks/handoff.md`、
`tasks/todo.md`の先頭、`tasks/critical-path.md`の該当節、関連する
`tasks/lessons.md`を読んでください。

Direct LociMyu Product Acceptance、DisplaySet／material／Caption／Saved View、
Caption overlay、iPhone texture correction、Native backup／restore、Native
Package Exchangeは完了済みです。新しいrelease-blocking P0／P1がない限り、
追加hardening、package permutation、UI polishへ戻らないでください。
CompareはMVP／release gate／critical pathから除外済みです。

Product Ownerは初回public candidateについてAを選択済みです。Nativeだけを
ユーザー書込み可能とし、legacy v1はsafe import／View／非破壊Native変換専用に
します。Native Package ExchangeのCaption／new-image mergeは残します。

production実装前に、`docs/specs/02-storage-package-migration.md` §31の
`RC-A-01`〜`RC-A-07`と`tasks/todo.md`のbounded planを確認してください。
一般S2／S3 hardening、package permutation、UI polish、Compareへ戻らないで
ください。

併せてlicense／notices、version／exact release SHA、README、clean CI、
main統合、rollback、Pages／Service Worker、LociMyu変換の発見性、
private-source由来metadataの公開可否だけを整理してください。

計画確認まではproduction実装を行わず、確認後もlicense採用、version／exact
release SHA確定、main merge、Release作成、Pages deploymentは別承認まで
行わないでください。

`RELEASE CANDIDATE OPTION A: PRODUCT OWNER ACCEPTANCE PASS`
```
