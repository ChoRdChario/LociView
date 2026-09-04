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

## HEIC/HEIF images in the first candidate

The first public candidate accepts PNG, JPEG, WebP and GIF Caption images. For
an existing HEIC/HEIF photo, export a separate JPEG on the source device and
select that JPEG in LociView. On iPhone, use Preview's **Export** action when it
is available, or a Shortcuts image-conversion action. Changing the Camera app's
global format is optional; it is not a LociView prerequisite. Keep the original
photo separately—LociView neither uploads nor modifies it.

When a LociMyu ZIP contains HEIC/HEIF, LociView reports the file and any exact
Caption relationship but does not attach it in this candidate. Keep the
unchanged ZIP, complete the conversion, export a JPEG on the source device, and
manually add that JPEG to the Caption identified by the conversion report. A
separately exported JPEG is not silently assumed to have the original Drive
file ID.

Direct original-byte HEIC/HEIF support remains a product requirement, but it is
not first-candidate production functionality. The checked-in PoC recipe and
bridge for a libheif+libde265 build are an isolated local experiment only. Its
generated JavaScript/Wasm must not enter the normal application build, GitHub
Pages, a public binary Release or Service Worker cache, and production must not
register or fall back to that decoder.

The repository currently contains the PoC source, bridge and reproducible build
recipe; generated decoder files and private representative source bytes are not
tracked. Public distribution of the generated decoder has not been approved:
HEVC patent review is incomplete, the recipient-facing LGPL source/relink and
notice kit is incomplete, and production security hardening is incomplete.
Technical PoC success is not a license, patent or release decision. Any future
public codec path requires a separate Product Owner approval after independent
review. The completed Safari and Windows capability investigations are retained
as evidence only; neither path is connected to Native Project storage,
conversion, backup or the product UI. This compatibility policy introduces no
snapshot or package version change.

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
