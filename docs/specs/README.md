# LociView v2 implementation specifications

> Status: `PRODUCT-OWNER APPROVED IMPLEMENTATION CONTRACT / NOT IMPLEMENTED`
> Baseline implementation: normalized v1 commit `fc7054f`; this specification revision is identified by its own Git commit
> Approved: 2026-08-19; Product Owner amendments recorded through 2026-08-26

These documents turn ADR-0001 and the approved v2 direction into testable implementation contracts. They intentionally separate fixed product and domain rules from technologies that may still fail a proof-of-concept gate.

## Authority

The authority order for v2 work is:

1. accepted ADRs;
2. a product-owner-approved specification in this directory;
3. executable contract and migration tests;
4. implementation;
5. task notes and chat history.

`docs/v2/00-approved-direction.md` is a non-normative navigation summary of the ADR and, after approval, these specifications. It cannot override either. Its MVP and gate summaries MUST be updated in the same change when a normative source changes.

The product owner approved this package on 2026-08-19 and authorized work to proceed through its gates in order. Approval authorizes G0 now; it does not bypass G0-S/G1 evidence or mean that GS, multiple models, Automerge, CAS, or renderer backends already exist.

The words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative. A metric marked **provisional** is a gate input to be confirmed in G0, not a released product guarantee.

## Documents

| Document | Purpose |
|---|---|
| [`00-product-contract.md`](00-product-contract.md) | User outcomes, support levels, MVP boundary, security and operational constraints |
| [`01-domain-rendering.md`](01-domain-rendering.md) | Frames, asset revisions, renderer-neutral scene, modes, picking, alignment, GS/iOS lifecycle |
| [`02-storage-package-migration.md`](02-storage-package-migration.md) | Metadata, CAS, transaction recovery, package classes, merge semantics, v1 conversion |
| [`03-gates-and-delivery.md`](03-gates-and-delivery.md) | G0, blocking G0-S, PoC gates, evidence, feature flags, rollback and development sequence |
| [`04-locimyu-conversion.md`](04-locimyu-conversion.md) | Canonical LociMyu Caption identity, source-authority rules and the device-local deferred-review gate |

## Fixed versus conditional decisions

Fixed unless a new ADR supersedes ADR-0001:

- evolve the current app through adapters; no big-bang rewrite;
- `RepresentationFrame -> AssetFrame -> ProjectFrame`;
- immutable asset revisions and atomic revision/alignment bindings;
- renderer- and storage-neutral persistent data;
- Mesh, GS, Compare and Integrated as distinct product modes;
- exact smooth-alpha mesh/GS intersection is not an MVP dependency;
- large package and GS paths cannot require whole-file memory materialization;
- v1 sources are preserved and conversion is explicit.
- LociMyu conversion uses the versioned preserve-all identity and approved deferred-review direction; guessed sheet/media relationships are never activated, and durable local review waits for its separate capability/wire gate.
- caption tags and ordered display sets with explicit default views remain portable;
- review snapshots carry no editable lineage identity, while clean editable copies re-key into a new lineage.

Conditional on a named gate:

- Spark/Three or PlayCanvas as the production renderer;
- Automerge Repo as metadata persistence and merge infrastructure;
- a specific incremental SHA-256 or streaming ZIP implementation;
- direct splat picking as the only GS interaction path;
- WBOIT or any other smooth-transparency compositor;
- the provisional iOS budgets and performance thresholds.

## Change procedure

Every v2 replacement or default-path production task derived from these documents MUST:

1. cite the relevant requirement and acceptance IDs;
2. remain behind the specified feature flag until its gate passes;
3. add executable evidence before changing the default path;
4. receive a read-only review from a context that did not implement it;
5. preserve the last known-good package and renderer path until rollback evidence passes.

G0-S is a correction to the current v1 safety baseline. It is controlled by failing characterization tests, a small isolated change, staged release evidence and Git rollback; it is not required to remain default-off behind a v2 feature flag.

If code, a fixture, and this specification disagree, stop and record the discrepancy. Do not silently redefine a v1 compatibility contract or lower a gate threshold to make a PoC pass.
