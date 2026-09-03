# Isolated HEIC decoder PoC

Status: `DISPOSABLE POC / NOT PRODUCTION / NOT DISTRIBUTION APPROVED`.

This is a local technical experiment only. Production use and public
deployment are prohibited. HEVC patent review is incomplete, the LGPL public
distribution/relink kit is incomplete, and production security hardening is
incomplete. A separate independent review and Product Owner approval are
required before any generated decoder output may be distributed externally.

This directory proves only the bounded local decoder candidate accepted in
`docs/specs/02-storage-package-migration.md` section 29.1. It is intentionally
outside the application TypeScript, Vite and Service Worker graphs. Generated
JavaScript/WASM, upstream sources, the toolchain, test inputs and results stay
under the ignored `/.artifacts/heic-decoder-poc/` directory. Nothing generated
here may be copied to `public/`, `dist/` or production code without a separate
production implementation and review.

The PoC decodes one non-sequence HEVC still at a time. It accepts one top-level
primary `hvc1` item or a primary grid whose leaves are all `hvc1`; thumbnails,
alpha and auxiliary items do not count as additional top-level images. Other
codecs, tracks/sequences, multiple top-level images, layered/other derived
primary items, malformed input and over-budget input fail explicitly. libheif
applies crop/rotation/mirror exactly once and produces packed RGBA8 for the
standalone browser harness.

The PoC limits are deliberately provisional rather than public product
guarantees:

- input: 32 MiB;
- either dimension: 16,384 pixels;
- decoded area: 50,000,000 pixels;
- packed RGBA output: 200 MiB;
- libheif-accounted total memory: 384 MiB;
- Wasm linear memory: at most 512 MiB;
- items: 1,024; grid tiles: 256; decode timeout: 20 seconds.

The main thread transfers the input `ArrayBuffer` to one same-origin module
Worker. The Worker copies once into Wasm, copies only visible RGBA row bytes
back into a JavaScript-owned buffer, releases decoder state and transfers that
buffer to the caller. Cancel, timeout, replacement selection and close all
terminate the Worker. A late request ID cannot publish over the current one.

## Reproduce

From repository root in PowerShell:

```powershell
./scripts/heic-decoder-poc/prepare.ps1
./scripts/heic-decoder-poc/build.ps1
python -m http.server 4199 --bind 127.0.0.1 --directory .artifacts/heic-decoder-poc/site
```

Open `http://127.0.0.1:4199/` in Edge. Select a local HEIC/HEIF; the page never
uploads it and never logs its filename or digest. The generated site has a
restrictive same-origin CSP and contains no runtime CDN or external fetch.

`run-edge-smoke.mjs` is a Windows Edge driver for this isolated harness. It
uses a caller-supplied Playwright Core installation without adding it to this
application's dependencies or lockfile, launches the installed Edge with a
disposable profile, and exercises decode, cancel, cleanup and rejection.
Input paths are not included in its JSON result.

`prepare.ps1` downloads only the exact official archives in
`upstream-sources.json`, verifies their SHA-256 before extraction, and installs
the exact emsdk release into the ignored artifact directory. `build.ps1`
requires those verified inputs, discards and re-extracts the source/build trees
from the verified archives on every run, uses the detected Visual Studio
CMake/Ninja, disables external encoder/codec backends and plugin loading, then
records the generated JS/WASM size and SHA-256 in an ignored result manifest.
The exposed bridge is decode-only; generic libheif encoder/container objects
remain in the static link and are not claimed to be absent.

The official libheif example files may be used transiently from the verified
source tree. No private representative source and no upstream test image is
tracked by this repository. Public distribution remains blocked on an
approved LGPL source/relink kit and a separate HEVC patent decision.

The exact unadopted component inventory, generated-output digest and remaining
distribution boundary are recorded in
`DISTRIBUTION-NOTICE-CANDIDATE.md`. That candidate is engineering evidence, not
a license adoption or permission to publish the Wasm.
