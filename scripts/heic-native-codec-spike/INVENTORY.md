# HEIC implementation and public-path inventory

Audit date: 2026-09-03. Baseline: `g0-baseline` at
`a733f4e6512d94647fafda446237dfc68f9de228` before the uncommitted isolation
work. The remote repository is public.

## File/path classification

| Classification | Path or artifact | Evidence and effect |
|---|---|---|
| production path | `src/assets/importWizard.ts` | Detects a bounded HEIF `ftyp` signature for LociMyu inventory. It is not a decoder. |
| production path | `src/nativeGs/locimyuConversion.ts` | Reports HEIC/HEIF as a known but unsupported Native media profile; it does not admit source bytes to the current snapshot. |
| production path | `src/ui/imagePicker.ts`, `src/ui/imageWindow.ts`, `src/ui/tabs/caption.ts` | Browser image presentation/fallback labels only. No codec wrapper, Wasm import or decoder registration. |
| production path | `src/nativeGs/schema.ts`, `src/nativeGs/storage.ts`, `src/nativeGs/app.ts` | Current Native schema/admission/UI accept JPEG, PNG, WebP and GIF, not HEIC. This keeps unimplemented HEIC out of Project writes. |
| development only | none | The Vite development entry has no decoder import, URL or feature flag. Existing `dev-dist` has no decoder artifact. |
| test/fixture only | `tests/assets/importWizard.test.ts` | A short synthetic `ftyp` probe tests inventory detection. No actual HEIC image is tracked. |
| test/fixture only | `tests/scripts/heicPublicIsolation.test.ts`, `tests/scripts/heicNativeCodecProvider.test.ts` | Synthetic strings/bytes exercise the isolation and provider contracts. They contain no decodable HEIC. |
| local PoC only | `scripts/heic-decoder-poc/**` | Reproducible source/build recipe, bridge, Worker/client and local harness for libheif+libde265. It is not imported by Vite/npm/CI production build. |
| local PoC only | `.artifacts/heic-decoder-poc/**` | Ignored downloads, sources, build tree, link map, test inputs and generated JS/Wasm. These are not tracked or copied to `public`/`dist`. |
| local spike only | `scripts/heic-native-codec-spike/**` | Provider/capability contract and manual page. It contains no codec library or binary and is outside production graphs. |
| unreachable from ordinary UI | both directories above | They require an explicit local procedure. There is no product import, dynamic import, lazy URL or production feature flag. |
| determination boundary | GitHub source archives | A public branch archive contains the tracked PoC source/build recipe because the repository itself is public. It does not contain ignored generated output. A future tagged source archive will do the same unless the tracked-source policy changes. |

Repository/history scans found no tracked `.heic`, `.heif` or generated decoder
`.wasm`. The public PoC result does contain a limited class of derived evidence
from a private representative source (decoded dimensions/output size), but no
private filename, source digest or source bytes. The values are not repeated in
this inventory.

## Dependencies and exact local PoC identity

The application package manager has no HEIC wrapper, libheif, libde265 or
Emscripten dependency. The isolated PoC pins:

| Component | Version / exact identity | Role |
|---|---|---|
| libheif | 1.23.3, commit `78c9746aea226b22885e8d35241353ce669c4ea5` | HEIF container and decode API in local PoC |
| libde265 | 1.1.2, commit `d0bcab76380c079358a3156b3e3b37d17c00a078` | local PoC HEVC decoder only |
| Emscripten | 3.1.61, source commit `67fa4c16496b157a7fc3377afd69ee0445e8a6e3` | local compiler/runtime glue |
| CMake / Ninja | Visual Studio CMake 3.31.6-msvc6 / Ninja 1.12.1 | local host build tools |

Exact archive URLs and SHA-256 values are in
`scripts/heic-decoder-poc/upstream-sources.json`; generated-output identity is
in `POC-RESULT.md`. The private source is not an identity authority for the
decoder build.

## Build and final-link audit

The local PoC recipe explicitly sets:

```text
ENABLE_PLUGIN_LOADING=OFF
WITH_LIBDE265=ON
WITH_LIBDE265_PLUGIN=OFF
WITH_X265=OFF
WITH_KVAZAAR=OFF
WITH_UVG266=OFF
WITH_VVDEC=OFF
WITH_VVENC=OFF
WITH_X264=OFF
WITH_OpenH264_DECODER=OFF
WITH_DAV1D=OFF
WITH_AOM_DECODER=OFF
WITH_AOM_ENCODER=OFF
WITH_SvtEnc=OFF
WITH_RAV1E=OFF
WITH_JPEG_DECODER=OFF
WITH_JPEG_ENCODER=OFF
WITH_OpenJPEG_ENCODER=OFF
WITH_OpenJPEG_DECODER=OFF
WITH_FFMPEG_DECODER=OFF
WITH_OPENJPH_ENCODER=OFF
WITH_WEBCODECS=OFF
WITH_UNCOMPRESSED_CODEC=OFF
ENABLE_EXPERIMENTAL_FEATURES=OFF
ENABLE_MULTITHREADING_SUPPORT=OFF
ENABLE_PARALLEL_TILE_DECODING=OFF
```

The completed build graph/link map, not only the CMake cache, shows libde265 as
the sole external codec backend. There is no linked x265, kvazaar, external
AV1/VVC/JPEG/AVC/FFmpeg codec library or dynamic plugin loader. The libheif
static archive does retain generic encoder/container objects and a built-in
mask encoder. Therefore external encoder/backend exclusion is `PASS`, while
the stronger claim that every encoder-side object is absent is `PARTIAL`.

## Bundler, offline and publication reachability

- `.wasm`: the generated local decoder exists only below the ignored artifact
  root. The current `dist`, `dev-dist` and tracked Git tree contain none.
- wrapper/Worker: tracked only under `scripts/heic-decoder-poc`; no production
  import or URL reference exists.
- Vite/dynamic/lazy loading: no decoder entry, dynamic import or asset copy.
- Service Worker: the current generated worker contains no decoder URL. Its
  generic production glob would precache any `.wasm` accidentally emitted to
  `dist`, so the post-build isolation check is mandatory before upload.
- Pages: the workflow uploads only `dist`; the isolation check now runs after
  the build and before `upload-pages-artifact`.
- Release packaging: no release workflow or binary Release exists. Any future
  artifact publisher must run the same verifier before upload.
- normal CI: never downloads or builds the PoC. A separate build-only status
  workflow runs the isolation verifier for `g0-baseline` and PRs to `main`.

## Future distribution/security preparation status

| Requirement | Status | Current evidence |
|---|---|---|
| exact source versions/commits/URLs/digests | implemented | pin file and PoC result |
| exact Emscripten/CMake/build flags/recipe | implemented | build script and result |
| wrapper and dedicated Worker source | implemented (local PoC only) | bridge/client/Worker |
| input/dimension/pixel/item/time/memory limits | implemented (local PoC only) | bridge/client; not adopted product guarantees |
| malformed/unsupported/sequence tests | implemented (local PoC only) | Edge PoC evidence |
| applied upstream patch | not applicable | none was applied to the libde265 PoC |
| license/copyright source inventory | partially implemented | candidate notice; no adopted recipient notice |
| corresponding source/relink/replacement kit | not implemented / externally blocked | independent LGPL decision required |
| third-party and built-output notices | not implemented | candidates only, not adopted |
| dependency/advisory monitoring | not implemented | no automated watcher |
| SBOM | not implemented | no release SBOM |
| emergency public-decoder replacement | not implemented | no public decoder exists |
| HEVC patent authorization | externally blocked | requires external legal confirmation |
| production hardening and product acceptance | not implemented | codec not connected to product |

This inventory is engineering evidence, not a legal conclusion or distribution
approval.
