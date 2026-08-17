# LociView

LociView is the local-first successor to LociMyu: an offline browser application for viewing 3D data, attaching captions, and exchanging mergeable project packages.

> Current status (2026-08-18): a v1 build is implemented and deployed, but several documented v1 targets, physical-iOS acceptance, and public-release hardening remain incomplete. Gaussian Splatting and the proposed v2 storage/renderer architecture are not implemented yet.
>
> Public build: https://chordchario.github.io/LociView/

## Current v1

- `.lociview` ZIP packages contain models, images, and project records for exchange and backup.
- Active work uses an OPFS workspace when available; the fallback `MemoryFS` is non-durable.
- Project state is derived from per-actor JSONL operations using the current HLC/LWW implementation.
- GLB, OBJ, STL, and ordinary PLY mesh/point data are supported.
- Display sets group captions, material appearance, and saved views.
- The product is a Vite/TypeScript PWA with no runtime Google API dependency.

The current operation log has known concurrency and durability limitations. Treat it as a v1 compatibility format, not as the approved v2 persistence choice.

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
