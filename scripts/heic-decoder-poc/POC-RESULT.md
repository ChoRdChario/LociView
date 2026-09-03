# Isolated HEIC decoder PoC result

> Result: `TECHNICAL POC PASS / PRODUCTION NOT STARTED / DISTRIBUTION DECISION REQUIRED`.
>
> Evidence date: 2026-09-03. This is an isolated engineering checkpoint, not
> approval to distribute the decoder or claim production HEIC support.

## Decoder and build identity

| Item | Exact result |
|---|---|
| libheif | `v1.23.3`, commit `78c9746aea226b22885e8d35241353ce669c4ea5`, source archive SHA-256 `11c1179e0e4bec33624b87f22ec42c1e993a40d946d44d26f9c431cf1456a863` |
| libde265 | `v1.1.2`, commit `d0bcab76380c079358a3156b3e3b37d17c00a078`, source archive SHA-256 `eaacd1943ab0c452c19f6136a36ca227e6b761b39a81eaca8454d48c147e1f67` |
| Emscripten | `3.1.61`, source commit `67fa4c16496b157a7fc3377afd69ee0445e8a6e3`, source archive SHA-256 `88232dd77f0efe45327c29091c39e260d69469d2128b752c61e4c8c98d47a6ef`, compiler revision `28e4a74b579b4157bda5fc34f23c7d3905a8bd6c` |
| Host build tools | Visual Studio CMake `3.31.6-msvc6`; Ninja `1.12.1` |
| Source patches | none |
| Generated JavaScript | 38,978 bytes; SHA-256 `58988b61e5067c388cbc20609af1e186450a3d3e07f894cdcfcc1d053cab73b0` |
| Generated Wasm | 1,182,825 bytes; SHA-256 `99823b33ca6ff71d97dc6afbc79692394dd8e24c6b7c44dd9869e7ada8dade5d` |

The exposed bridge enables only bounded HEVC still decode and RGBA8 output.
libde265 is the only linked external codec backend; x265, kvazaar, external
AV1/VVC/JPEG/AVC/FFmpeg backends and dynamic plugin loading are absent from the
final link graph. Upstream libheif still contributes generic encoder/container
objects (including its built-in mask encoder), so this output must not be
described as containing no encoder-side code. Experimental APIs and
multithreading are disabled. Every build re-verifies the downloaded archives,
removes the extracted working trees and re-extracts from those verified
archives before compiling.

## Executed browser evidence

### Windows Edge

The final isolated site was executed in Microsoft Edge `152.0.4191.53`:

- a public upstream single-still HEIC decoded through Wasm to `451 x 461` and
  831,644 RGBA bytes;
- after the first decode, browser networking was disabled and a fresh Worker,
  JavaScript glue and Wasm load decoded successfully from the warmed local
  cache;
- cancel and zero-delay timeout terminated the Worker;
- replacement selection cancelled the stale request and only the newest result
  was displayed;
- three open/close cycles produced the same in-memory RGBA SHA-256 and released
  the displayed canvas backing store;
- structurally truncated and corrupt inputs failed explicitly;
- input above the 32 MiB admission ceiling was rejected before Worker start;
- AVIF primary content failed explicitly as an unsupported codec;
- a valid HEIF sequence with one timeline track failed explicitly as a
  non-still input; and
- all seven page requests were same-origin, with no runtime exception or
  external URL.

The private representative HEIC was also exercised locally without upload. It
decoded through Wasm to `4032 x 3024`, 48,771,072 RGBA bytes with correct
visible orientation. No private filename, source digest, source bytes or
internal source name is recorded here or included in the generated build.

### Physical iPhone 14 Pro

Safari on iOS 18.7 / Safari 26.6.1 decoded the selected HEIC through both
`HTMLImageElement.decode()` and `createImageBitmap()` at `3024 x 4032`.
Orientation and mirror/rotation were correct. Structurally truncated and
corrupt probes failed explicitly. A same-session IndexedDB copy decoded after
Safari restart and with networking disconnected. The Product Owner also
confirmed that the Blob/Object URL and displayed resource were released
normally.

The approved production direction is therefore browser-native decode first on
iPhone. The iPhone Wasm fallback was not run and was not required by this
native-smoke branch. This smoke is not production HEIC acceptance.

### Existing-product regression

On the final executable tree, `npm run typecheck`, all 62 Vitest files (1,503
passing tests and 21 existing todo) and `npm run build` passed. No application
dependency or lockfile changed. The ordinary production build contains no HEIC
decoder JavaScript or Wasm asset.

## Lifecycle and admission boundary proved by the PoC

- One same-origin module Worker decodes one input at a time; generated glue and
  Wasm remain separate same-origin assets.
- Input and RGBA buffers are transferred across the Worker boundary. Cancel,
  timeout, selection replacement and close terminate the Worker, and late
  request IDs cannot publish stale output.
- Decode warnings, missing primary image, unsupported codec, tracks/sequences,
  multiple top-level images, invalid/truncated input and over-budget dimensions,
  pixels or output bytes fail closed.
- Provisional ceilings are 32 MiB input, 16,384 pixels per dimension, 50 million
  pixels, 200 MiB RGBA output, 384 MiB libheif-accounted memory, 512 MiB maximum
  Wasm memory, 1,024 items, 256 grid tiles and 20 seconds per decode. They are
  PoC safety limits, not adopted product guarantees.

## Production and package status

Production integration deliberately did not start because the distribution
stop condition was reached. Consequently:

- Native snapshot schema 2 remains an approved specification, not implemented
  code; the application still reads/writes its existing schema behavior;
- no application or outer package version changed;
- original HEIC source-byte authority, monotonic schema-2 upgrade and
  native-first presentation remain the approved production contract, but no
  HEIC has been admitted to a production Native Project;
- direct Caption add, LociMyu HEIC conversion, the shared media stage, complete
  backup/restore, Package Exchange collaboration, review/share and clean-copy
  HEIC transport were not implemented or claimed; and
- generated decoder files are ignored and absent from application source,
  `public/`, `dist/` and the Service Worker graph.

## Review and unresolved release risks

The isolated decoder/security review found no technical P0/P1 after the build
and lifecycle fixes. It left five bounded P2 items for production acceptance:
compare full URL origins rather than only hostnames in the smoke driver; assert
the exact unsupported/sequence status codes; add representative dimension or
RGBA-budget rejection evidence; tune whole-request peak memory before enabling
an iPhone Wasm fallback; and pin Edge orientation to an explicit visual record
or known-transform fixture.

Public production use remains blocked by these independent distribution
decisions:

- approve and ship a recipient-usable LGPL corresponding-source, replacement/
  relink and notice kit for the statically linked libheif/libde265 Wasm;
- close the exact Windows compiler payload digest and embedded runtime/license
  inventory, including the final recipient-facing built-output notice; and
- decide HEVC patent authorization separately from the software licenses.

`DISTRIBUTION-NOTICE-CANDIDATE.md` records the candidate material and boundary;
it is not an adopted license or a distribution approval.
