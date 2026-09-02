# LociView

LociView is the local-first successor to LociMyu: an offline browser application for viewing 3D data, attaching captions, and exchanging mergeable project packages.

> Current status (2026-09-03): the legacy-v1 build remains deployed. On
> `g0-baseline`, the bounded Native production candidate implements multi-format
> Assets including Gaussian Splatting, DisplaySet/material/Caption conversion,
> streamed backup/restore and purpose-separated package exchange; Product Owner
> Desktop and physical-iPhone acceptance passed. Public-release integration,
> licensing/notices and remaining release gates are incomplete. Spark remains a
> provisional GS path, and the general proposed v2 storage/renderer architecture
> is not implemented.
>
> Public build: https://chordchario.github.io/LociView/
> Fresh-session checkpoint: [`tasks/handoff.md`](tasks/handoff.md)

## Current v1

- `.lociview` ZIP packages contain models, images, and project records for exchange and backup.
- Active work uses an OPFS workspace when available; the fallback `MemoryFS` is non-durable.
- Project state is derived from per-actor JSONL operations using the current HLC/LWW implementation.
- GLB, OBJ, STL, and ordinary PLY mesh/point data are supported.
- Display sets group captions, material appearance, and saved views.
- The product is a Vite/TypeScript PWA with no runtime Google API dependency.

The current operation log has known concurrency and durability limitations. Treat it as a v1 compatibility format, not as the approved v2 persistence choice.

## Licensing status

No project-wide software or documentation license has been adopted yet. The
Product Owner has not made a general LociView grant to copy, modify or
redistribute the project. Limited rights arising from applicable hosting-
platform terms, ordinary technical access to a deployed build or a file-
specific third-party license remain governed by those terms; they do not create
a project-wide LociView license.

The Product Owner approved a freedom-first direction with standard `MPL-2.0` as
the proposed software license and separate documentation, fixture, user-data,
trademark and sponsor boundaries. The current
[licensing/ownership proposal](docs/licensing-and-ownership.md) and
[sponsorship proposal](docs/sponsorship-policy.md) are decision records, not
license grants. A top-level license will be a separate independently reviewed
and explicitly approved adoption change.

## Start development

```powershell
npm ci
npm run typecheck
npm test
npm run dev
```

`index.html` is the product entry point. `dev.html` is a manual viewer harness.

## Read in this order

1. [AGENTS.md](AGENTS.md) — project working rules and exclusions
2. [PROJECT_MAP.md](PROJECT_MAP.md) — current code entry points and responsibilities
3. [docs/README.md](docs/README.md) — authority/status of every document
4. [tasks/todo.md](tasks/todo.md) — active work only

Read [docs/v2/00-approved-direction.md](docs/v2/00-approved-direction.md) only for G0+, renderer, storage, migration, GS, or v2 specification work. It is approved direction, not current implementation.

Legacy alpha source and raw research are intentionally kept outside the active repository. Their hashes and provenance are recorded in [docs/history/legacy-locimyu-alpha.md](docs/history/legacy-locimyu-alpha.md).
