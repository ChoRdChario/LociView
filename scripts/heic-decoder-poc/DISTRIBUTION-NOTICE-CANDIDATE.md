# HEIC decoder distribution notice candidate

> Status: `ENGINEERING CANDIDATE / NOT ADOPTED / NO DISTRIBUTION APPROVAL`.
>
> This file records the material present in the isolated decoder PoC and the
> release kit that still needs legal/distribution approval. It is not a
> substitute for the upstream license texts, not a project license grant and
> not a conclusion that a public LociView build may distribute these outputs.

## Candidate components

| Component | Exact source | Observed license | PoC use |
|---|---|---|---|
| libheif | tag `v1.23.3`, commit `78c9746aea226b22885e8d35241353ce669c4ea5`, release archive SHA-256 `11c1179e0e4bec33624b87f22ec42c1e993a40d946d44d26f9c431cf1456a863` | library files state GNU LGPL version 3 or later; the archive's `COPYING` is the controlling local evidence | statically linked, decode-only HEIF container layer |
| libde265 | tag `v1.1.2`, commit `d0bcab76380c079358a3156b3e3b37d17c00a078`, release archive SHA-256 `eaacd1943ab0c452c19f6136a36ca227e6b761b39a81eaca8454d48c147e1f67` | library files state GNU LGPL version 3 or later; the archive's `COPYING` is the controlling local evidence | statically linked HEVC decoder |
| Emscripten | release `3.1.61`; emsdk commit `ca7b40ae222a2d8763b6ac845388744b0e57cfb7`; Emscripten source commit `67fa4c16496b157a7fc3377afd69ee0445e8a6e3`; source archive SHA-256 `88232dd77f0efe45327c29091c39e260d69469d2128b752c61e4c8c98d47a6ef`; release compiler revision `28e4a74b579b4157bda5fc34f23c7d3905a8bd6c` | source is dual-licensed MIT or University of Illinois/NCSA; generated JavaScript carries the Emscripten MIT notice | pinned local compiler/runtime glue |

The library and Emscripten-source retrieval URLs and digests are machine-readable in
`upstream-sources.json`. `prepare.ps1` refuses an archive whose digest differs,
and `build.ps1` records the exact compiler identity and generated output
digests. No upstream source patch is used. LociView supplies only the build
recipe, small public-C-API bridge, Worker/client lifecycle and isolated test
harness.

## Current generated PoC output

The ignored 2026-09-03 local build produced:

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `heic-decoder.mjs` | 38,978 | `58988b61e5067c388cbc20609af1e186450a3d3e07f894cdcfcc1d053cab73b0` |
| `heic-decoder.wasm` | 1,182,825 | `99823b33ca6ff71d97dc6afbc79692394dd8e24c6b7c44dd9869e7ada8dade5d` |

These files are deliberately ignored and are not part of the application,
`public/`, `dist/` or the Service Worker graph. The JavaScript retains the
generated Emscripten MIT header. A future distributed build must bind its own
recipient-facing notice to the exact output digests and release revision.

## Unclosed LGPL distribution boundary

The PoC links libheif and libde265 into one Wasm binary. Before that combined
output is publicly distributed, an independent license review and Product
Owner decision must approve a recipient-usable compliance kit. At minimum the
candidate kit must be checked for all of the following:

- durable access to the exact complete corresponding libheif and libde265
  sources, their unmodified license texts and all copyright notices;
- the LociView bridge, build scripts, exact configuration flags and all other
  material needed to reproduce the combined Wasm;
- a practical documented way for a recipient to replace the LGPL libraries
  with modified compatible builds and relink/rebuild the combined work,
  including whatever object/archive or source-based relink material the final
  legal review determines is required;
- installation/use instructions sufficient to run the replacement build, plus
  the applicable reverse-engineering-for-debugging notice;
- Emscripten/toolchain retrieval information and retained generated-runtime
  notices; the exact downloaded Windows compiler payload digest and embedded
  runtime inventory remain part of the unclosed final distribution audit;
- a recipient-facing `THIRD_PARTY_NOTICES` entry and a source-retrieval URL
  kept available for as long as the executable form is distributed; and
- an automated release check that rebuilds or verifies the expected output,
  notices and exact immutable source revision.

The repository currently has a reproducible engineering recipe, but it does
not yet contain an approved public corresponding-source/relink kit or an
adopted recipient-facing notice. Technical success of this PoC therefore does
not close LGPL compliance.

## Separate HEVC patent decision

The software-license analysis above does not decide patent authorization for
HEVC use or distribution in the intended countries and channels. That is a
separate release decision requiring appropriate review. No patent license,
coverage or non-infringement conclusion is recorded here.

## Privacy and fixture boundary

No private representative source, filename, source digest or source bytes are
included in Git, this notice, generated decoder assets or the application
build. Upstream test images and generated rejection probes remain transient in
the ignored artifact directory.

Until both the LGPL/relink kit and the separate HEVC patent decision are
approved, the decoder outputs must remain local PoC artifacts and production
schema/UI/package integration must not begin.
