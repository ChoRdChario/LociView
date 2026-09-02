# Fresh-session handoff — release-candidate preparation

> Status: `CURRENT HANDOFF`; prepared after Native Package Exchange Product
> Owner acceptance on 2026-09-03.
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
- Verification on the final executable tree: typecheck, 60 test files / 1,478
  passing tests with 21 existing todo, and production build all PASS.
- Product Owner acceptance: Desktop PASS; physical iPhone PASS; no unresolved
  P0/P1.
- At handoff preparation, `origin/g0-baseline` matched the local branch, the
  worktree was clean, and temporary preview/Cloudflare Tunnel were stopped.

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
8. `docs/specs/02-storage-package-migration.md` §30 only if package detail is
   needed

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

## 5. Next Product Owner decision

The next work is release-candidate preparation, not feature exploration.

Present and compare only:

- **A — recommended:** Native Project is the only writable public-candidate
  format. Legacy v1 remains open/view/non-destructive-Native-convert only.
- **B:** retain legacy-v1 edit/merge in the public candidate and keep its
  remaining G0S-S2/S3 roots as release blockers.

Also surface these genuine release decisions/blockers:

- project-wide license adoption;
- third-party and built-output notices;
- application/package version and exact release SHA;
- current README and ordinary-home LociMyu discovery;
- clean-tree CI;
- `g0-baseline` to `main` integration method;
- named rollback point and previous-build rollback procedure;
- GitHub Pages/base-path/Service Worker update verification;
- Spark absence from the normal v1 route and precache;
- absence of representative private source bytes from Git/build;
- whether public docs may retain private-source-derived fingerprint/name
  metadata.

Until the Product Owner chooses, do not implement the mode change, adopt a
license, set the release version, merge `main` or deploy Pages.

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
- Desktop／physical iPhone Product Owner acceptance: PASS
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

次は追加機能実装ではなく、初回public candidateのProduct Owner判断です。
read-only監査後、次の2案を完成速度、安全性、既存データ、UI複雑性で比較し、
Aを原則推奨してください。

A. Nativeだけを書込み可能とし、legacy v1はopen／view／Native変換専用
B. legacy v1編集／mergeを維持し、残るG0S-S2／S3をrelease blockerにする

併せてlicense／notices、version／exact release SHA、README、clean CI、
main統合、rollback、Pages／Service Worker、LociMyu変換の発見性、
private-source由来metadataの公開可否だけを整理してください。

Product Owner判断まではproduction実装、license採用、version確定、main merge、
Pages deploymentを行わず、最大2案と推奨を報告して停止してください。

`RELEASE CANDIDATE PREPARATION: READY FOR PRODUCT OWNER DECISION`
```
