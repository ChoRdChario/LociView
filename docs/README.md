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
| `04-formats-rendering.md` | `V1 RENDERING BASELINE` | GLB/OBJ/STL/ordinary PLY; Gaussian Splatting is not implemented |
| `05-ui-ux.md` | `V1 PRODUCT + SUPERSEDED DRAFTS` | Current UI intent mixed with earlier proposals; code wins on conflict |
| `06-device-offline.md` | `V1 PRODUCT + UNVERIFIED TARGETS` | OPFS/PWA intent; size, streaming, sharing, and single-file claims are not guarantees |
| `07-roadmap.md` | `SUPERSEDED 2026-07 ROADMAP` | Historical only; never use as the active plan |
| `08-ios-test-guide.md` | `V1 QA RUNBOOK` | Current manual v1 check, not a v2 GS performance specification |
| `09-locimyu-migration.md` | `V1 LEGACY RUNBOOK` | Existing legacy import guidance; ambiguous filename cases remain possible |
| `v2/00-approved-direction.md` | `ACCEPTED DIRECTION SUMMARY / NON-NORMATIVE / NOT IMPLEMENTED` | Navigation summary; ADR and approved specifications are authoritative |
| `adr/0001-v2-foundation.md` | `ACCEPTED DIRECTION / CONDITIONAL TECHNOLOGY` | Rationale, rejected alternatives, and reconsideration triggers |
| `history/legacy-locimyu-alpha.md` | `PROVENANCE` | Location and hashes of archived legacy evidence |
| `specs/README.md` | `PROPOSED IMPLEMENTATION CONTRACT / NOT IMPLEMENTED` | Index and authority for the review-ready v2 specification package |
| `specs/00-product-contract.md` | `PROPOSED FOR APPROVAL` | Product guarantees, MVP boundary, privacy and mobile behavior |
| `specs/01-domain-rendering.md` | `PROPOSED FOR APPROVAL` | Frames, revisions, SceneDocument, modes, picking and renderer gates |
| `specs/02-storage-package-migration.md` | `PROPOSED FOR APPROVAL` | Metadata/CAS candidate boundaries, transactions, package purposes and conversion |
| `specs/03-gates-and-delivery.md` | `PROPOSED FOR APPROVAL` | G0/G0-S/G1 evidence, thresholds, feature flags, rollback and schedule |

## Known implementation drift

- Current ZIP/package code is not bounded-memory streaming despite older architecture text.
- Current XLSX reading is the local minimal reader in `src/io/xlsx.ts`, not SheetJS.
- Strict CSP and single-file distribution are goals, not current implemented controls.
- Current export is download-based; File System Access/Web Share flows described in older documents are incomplete.
- Current viewer holds one model, and current PLY support is not Gaussian Splatting.
- Current material identity and loader behavior differ from parts of `04-formats-rendering.md`.

Do not repair these documents opportunistically during unrelated code changes. Update the relevant current contract or v2 specification in a dedicated documentation change with code evidence.
