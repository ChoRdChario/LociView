# Documentation authority index

This index prevents current v1 behavior, historical plans, and the proposed v2 architecture from being treated as one specification.

## Purpose-specific authority

| Purpose | Authority |
|---|---|
| Working and collaboration rules | `AGENTS.md` |
| Currently observed implementation behavior | Current code and executable tests |
| v1 package/wire compatibility | Frozen v1 contract plus G0 golden fixtures |
| Accepted architecture/product invariants | Accepted ADR; constrains PoCs and specifications immediately |
| Candidate technology and performance guarantees | Adopted specification only after the relevant gate passes |
| Navigation and known current risks | `PROJECT_MAP.md` |
| Active work sequencing | `tasks/todo.md`; never a product specification |
| Recurrent failure patterns | Task-relevant entries in `tasks/lessons.md`; advisory until promoted to a rule/ADR |

If observed code conflicts with the applicable compatibility or accepted future contract, stop and resolve the discrepancy explicitly. Neither side silently overwrites the other.

## Classification

| Document | Status | Use |
|---|---|---|
| `00-design-philosophy.md` | `CURRENT PRINCIPLES / V1 EXAMPLES` | Long-lived principles; operation-log examples are v1-specific |
| `01-vision-requirements.md` | `V1 BASELINE / PARTLY SUPERSEDED` | Original goals and v1 requirements; not the new v2 scope |
| `02-data-format.md` | `FROZEN V1 FORMAT` | Compatibility and migration reference only; do not extend for v2 writes |
| `03-architecture.md` | `HISTORICAL DESIGN` | Contains implementation drift; use code and `PROJECT_MAP.md` for current behavior |
| `04-formats-rendering.md` | `V1 RENDERING BASELINE` | Default-v1 GLB/OBJ/STL/ordinary PLY; the bounded native GS path is outside this legacy contract |
| `05-ui-ux.md` | `V1 PRODUCT + SUPERSEDED DRAFTS` | Current UI intent mixed with earlier proposals; code wins on conflict |
| `06-device-offline.md` | `V1 PRODUCT + UNVERIFIED TARGETS` | OPFS/PWA intent; size, streaming, sharing, and single-file claims are not guarantees |
| `07-roadmap.md` | `SUPERSEDED 2026-07 ROADMAP` | Historical only; never use as the active plan |
| `08-ios-test-guide.md` | `V1 QA RUNBOOK` | Current manual v1 check, not a v2 GS performance specification |
| `09-locimyu-migration.md` | `V1 LEGACY RUNBOOK` | Existing legacy import guidance; ambiguous filename cases remain possible |
| `licensing-and-ownership.md` | `PRODUCT-OWNER APPROVED DIRECTION / PROPOSED ADOPTION / NO LICENSE GRANT` | Ownership/relicensing record, freedom-first MPL-2.0 candidate, material scopes and formal adoption gate |
| `sponsorship-policy.md` | `PRODUCT-OWNER APPROVED DIRECTION / PROPOSED OPERATIONAL POLICY` | Sponsor acknowledgement, individual consultation, privacy, influence and release boundaries; no sponsor is accepted by the document |
| `g0/device-performance-runbook.md` | `G0 EVIDENCE CONTRACT / NO MEASUREMENTS RECORDED` | Repeatable device/performance procedure and provisional, unapproved observations |
| `g0/g0-coverage-map.md` | `G0 ACTIVE COVERAGE MAP / NO GATE CLAIM` | One-to-one status and blocker map for every G0 section 2.1–2.4 requirement |
| `g0/gs-source-profile-candidate.md` | `G0 PREFLIGHT CANDIDATE / NOT RATIFIED / NO RENDERER GUARANTEE` | Exact Gaussian PLY source-envelope preflight and ratification inputs; companion tiny artifacts remain characterization, not a FormatProfile, renderer or support claim |
| `g0/fixture-acquisition-contract.md` | `PRODUCT-OWNER RATIFIED / MODE B IMPLEMENTED OFFLINE / MODE A NOT IMPLEMENTED` | Exact Mode-B CLI/core/schemas exist and are offline-verified; real network, Release, publication and adoption actions remain unexecuted and retain separate stops |
| `v2/00-approved-direction.md` | `ACCEPTED DIRECTION SUMMARY / NON-NORMATIVE / NOT IMPLEMENTED` | Navigation summary; ADR and approved specifications are authoritative |
| `adr/0001-v2-foundation.md` | `ACCEPTED DIRECTION / CONDITIONAL TECHNOLOGY` | Rationale, rejected alternatives, and reconsideration triggers |
| `history/legacy-locimyu-alpha.md` | `PROVENANCE` | Location and hashes of archived legacy evidence |
| `history/task-ledger-through-d32a6a0.md` | `HISTORICAL TASK LEDGER` | Completed development records through the pre-consolidation native checkpoint; not an active plan or product specification |
| `specs/README.md` | `PRODUCT-OWNER APPROVED CONTRACT / NOT IMPLEMENTED` | Index and authority for the gated v2 implementation contract |
| `specs/00-product-contract.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | Product guarantees, MVP boundary, privacy and mobile behavior |
| `specs/01-domain-rendering.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | Frames, revisions, SceneDocument, modes, picking and renderer gates |
| `specs/02-storage-package-migration.md` | `PRODUCT-OWNER APPROVED / BOUNDED NATIVE PATHS THROUGH §26 IMPLEMENTED / GENERAL V2 NOT IMPLEMENTED` | General metadata/CAS candidate boundaries plus the implemented native snapshot/package, multi-Asset and exact ordinary-point boundaries |
| `specs/03-gates-and-delivery.md` | `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED` | G0/G0-S/G1 evidence, thresholds, feature flags, rollback and schedule |
| `specs/04-locimyu-conversion.md` | `APPROVED IDENTITY/SOURCE AUTHORITY / LOCAL RETENTION SPECIFICATION BLOCKED / NOT IMPLEMENTED` | Exact LociMyu Caption identity/source-authority and the bounded local-review design stop |

## Known implementation drift

- Current ZIP/package code is not bounded-memory streaming despite older architecture text.
- Current XLSX reading is the local minimal reader in `src/io/xlsx.ts`, not SheetJS.
- Strict CSP and single-file distribution are goals, not current implemented controls.
- Current export is download-based; File System Access/Web Share flows described in older documents are incomplete.
- Default-v1 viewer holds one model and its PLY support is not Gaussian Splatting; the isolated `?mode=native-gs` production path has separate exact ASCII ordinary-point and SH2/SH3 GS admission and remains bounded.
- Current material identity and loader behavior differ from parts of `04-formats-rendering.md`.

Do not repair these documents opportunistically during unrelated code changes. Update the relevant current contract or v2 specification in a dedicated documentation change with code evidence.
