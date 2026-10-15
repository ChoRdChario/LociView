# Documentation authority index

Use this index to select the contract relevant to a task. It is not an implementation
log. [Current work](../tasks/todo.md) and [feature inventory](../tasks/implementation-inventory.md)
record executed evidence and connections; do not infer those from a document title.

## Purpose-specific authority

| Question | Read |
|---|---|
| How to work, verify and push | [AGENTS.md](../AGENTS.md) |
| Where code lives | [PROJECT_MAP.md](../PROJECT_MAP.md) |
| What currently works / remains | [todo](../tasks/todo.md), [inventory](../tasks/implementation-inventory.md), then code/tests |
| Frozen legacy-v1 wire compatibility | [02-data-format.md](02-data-format.md) and golden fixtures |
| Accepted architecture / reconsideration | [ADR-0001](adr/0001-v2-foundation.md), [ADR-0002](adr/0002-project-scenes-and-continuing-team-history.md) |
| Product, privacy and media boundaries | [specification 00](specs/00-product-contract.md) |
| Frames, revisions, picking and rendering | [specification 01](specs/01-domain-rendering.md) |
| Storage, journal, Native package and migration boundaries | [specification 02](specs/02-storage-package-migration.md) |
| Adoption, device/performance and release gates | [specification 03](specs/03-gates-and-delivery.md), [G0 coverage](g0/g0-coverage-map.md) |
| LociMyu → Native conversion | [specification 04](specs/04-locimyu-conversion.md) |
| Project/Scene team work and TEAM-FLOW-01 | [specification 05](specs/05-project-scene-team-workflow.md), especially §§7.5, 12.6, 13.2 |
| Approved first backup opening when the original Project is absent | [First-backup companion](specs/06a-first-backup-open-proposal.md); exact absent predecessor/P2/S2 and recovery/selection contract approved 2026-10-16; not implemented or adopted |
| Workspace, Contribution, backup, review, clean copy | [specification 06](specs/06-project-package-wire.md), especially §§8, 11–12 and section-local status |
| One-time Native/v1/LociMyu conversion and cutover | [specification 07](specs/07-project-scene-migration.md); continued old-format updates were withdrawn by PO 2026-09-14; initial mapping/compatibility remains to be closed |
| Approved bounded Native material conversion | [Appearance companion](specs/07a-native-appearance-conversion-proposal.md); recipe-2/profile/subset approved 2026-10-15; implementation/evidence remain in todo |
| Approved first frozen-v1 → ProjectScene conversion | [v1 companion](specs/07b-frozen-v1-conversion-proposal.md); exact bounded recipe/subset approved 2026-10-15; implementation/evidence remain in todo |
| Approved first LociMyu → ProjectScene conversion | [LociMyu companion](specs/07c-locimyu-project-scene-conversion-proposal.md); exact recipe/subset approved 2026-10-15; implementation/evidence remain in todo |
| Approved JPEG photos and embedded textures extension | [JPEG companion](specs/07d-jpeg-project-scene-proposal.md); two additive profiles/four recipes approved 2026-10-15; bounded implementation/evidence in todo, not adopted |
| Approved WebP/GIF photo extension | [WebP/GIF companion](specs/07e-webp-gif-project-scene-proposal.md); four additive recipes and existing raw-image display approved 2026-10-15; implementation/evidence in todo, not adopted |
| Approved frozen-v1 explicit default-View extension | [Default-View companion](specs/07f-frozen-v1-default-view-proposal.md); exact recipe-4 approved 2026-10-16; bounded implementation/evidence in todo, not adopted |
| Approved frozen-v1 model placement extension | [Placement companion](specs/07g-frozen-v1-placement-proposal.md); exact additive recipe-5 and saved-offset compatibility approved 2026-10-16; implementation/evidence in todo, not adopted |
| Approved LociMyu Scene material extension | [Material companion](specs/07h-locimyu-material-proposal.md); exact recipe-4/Scene-slot identity and disabled-chroma source-only limit approved 2026-10-16; bounded implementation/evidence in todo, not adopted |
| UI intent, writing, visual tone and interaction | [UI product guidelines](ui-product-guidelines.md); [UI task mapping](../tasks/uiux-handoff.md) for historical audit evidence |
| Ownership, license or sponsorship | [licensing](licensing-and-ownership.md), [sponsorship](sponsorship-policy.md); direction is not adoption or a license grant |

An accepted ADR constrains implementation immediately. A proposal is not approval;
approved direction is not technology adoption; code is not device/offline acceptance.
If code/tests and an applicable contract conflict, record the discrepancy rather
than silently changing the contract. Historical titles/anchors in specifications
may be retained intentionally: read their status amendments before inferring a wait.

## Current implementation distinction

- Ordinary legacy v1, bounded Native, synthetic Scene hosts and limited real GLB/PNG
  validation are different evidence lanes. Do not transfer acceptance between them.
- Specification 02 contains implemented bounded Native sections alongside general
  v2 boundaries. Specification 04 has bounded Native conversion acceptance.
- Specification 05 has bounded core/metadata/UI and real-file validation connections.
  This is not ordinary-app adoption or the complete practical-team result.
- Specification 06 permits isolated implementation before general adoption (§11).
  Five-purpose file connections and remaining handoffs are recorded in inventory;
  exact checks/worktree status are in todo. Selected-Scene review/edit-copy policy
  is approved in §12.6. A clean writer alone does not supply omitted review
  relations or approve all profiles; inventory distinguishes explicit handoff
  connection from ordinary-home/device adoption.
- Specification 07 records the approved one-time cutover and reduced initial
  conversion plan. Its former bridge/§11 proposal is superseded, not a pending
  approval request. Earlier portable-identity or synthetic evidence is not an
  implemented converter. New-format continuing teamwork remains required.

## Legacy documents and history

`00-design-philosophy.md` gives enduring principles with v1 examples.
`01-vision-requirements.md`, `04-formats-rendering.md`, `05-ui-ux.md`,
`06-device-offline.md`, `08-ios-test-guide.md` and `09-locimyu-migration.md`
are legacy baselines/runbooks, not new team-workflow guarantees.
`03-architecture.md` contains implementation drift; `07-roadmap.md` is superseded.
Use [specification index](specs/README.md) for contracts and local section status.

Per-checkpoint status and the prior detailed classification are retained in the
[historical records](history/development-through-2026-09-14/README.md).
Open only the record needed for a concrete compatibility or evidence question.

The 2026-09-14 working-guidance cleanup follows OpenAI's
[Astra skills/instructions guidance](https://learn.chatgpt.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)
and [model guidance](https://developers.openai.com/api/docs/guides/latest-model).
These inform development procedure, not LociView's product contracts or acceptance.
