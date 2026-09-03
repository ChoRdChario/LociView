# Native/WebCodecs HEIC spike result

> Result date: 2026-09-03. Status: `PARTIAL / CURRENT WINDOWS HOST UNSUPPORTED / MORE DEVICE EVIDENCE REQUIRED`.
>
> This evidence does not connect a codec to production and does not approve
> libheif/libde265 distribution or HEVC patent coverage.

## Safari native evidence

Physical iPhone 14 Pro, iOS 18.7, Safari 26.6.1:

| Check | Result |
|---|---|
| selected HEIC declared/container type | PASS |
| `HTMLImageElement.decode()` | PASS |
| `createImageBitmap()` | PASS |
| dimensions | PASS |
| orientation and mirror/rotation | PASS |
| corrupt/truncated explicit failure | PASS |
| IndexedDB copy after Safari restart | PASS |
| network-disconnected local decode | PASS |
| Blob/Object URL/display resource release | PASS (Product Owner observed) |
| original bytes retained by the smoke | PASS; no re-encode or replacement |
| Display P3 | NOT TESTED |
| ICC profile fidelity | NOT TESTED |
| HDR/10-bit fidelity | NOT TESTED |

The native path did not contain or fall back to libde265. This was a smoke of
the platform decode path, not a production Native Project implementation.

## Windows Edge evidence

A read-only transient probe was executed on Microsoft Edge 152.0.4191.53 using
an isolated secure same-origin page and Worker. The checked-in manual page
reproduces only the main-thread `isConfigSupported()` portion; it does not
claim to reproduce configure or picture decode. No persistent server remained
after the executed probe.

| Check | Result |
|---|---|
| `VideoDecoder` / `EncodedVideoChunk` present | PASS |
| H.264 control capability | PASS |
| `hvc1.1.6.L93.B0`, all acceleration preferences | FAIL (`supported:false`) |
| current-user HEVC Video Extension registration | FAIL (none found) |
| all-user extension inventory | NOT TESTED (access denied) |
| extension-present Windows machine | NOT TESTED |
| native `<img>.decode()` / `createImageBitmap()` for public HEIC | FAIL |
| public libheif example hvcC, upstream-generated codec string | FAIL (`NotSupportedError`: malformed/ambiguous codec name) |
| same hvcC with normalized `hvc1.1.6.L120.90` | FAIL (`supported:false`; unsupported configuration) |
| actual HEVC picture decode on this host | BLOCKED by missing capability |
| offline actual decode | NOT TESTED; decode capability absent |
| 8-bit HEIC actual decode | BLOCKED on this host |
| 10-bit HEIC | NOT TESTED |
| iPhone 14 Pro file through Edge path | NOT TESTED |
| orientation / color profile / large image | NOT TESTED |
| multi-image / Live Photo-derived input | NOT TESTED |
| browser crash or long main-thread block | PASS for the bounded transient probe only |

The current-user package query returned no HEVC Video Extension. An all-user
query was attempted read-only but Windows denied access, so absence for every
Windows account is not claimed.

## Pinned libheif WebCodecs backend audit

The pinned libheif 1.23.3 backend is Emscripten-only, experimental and disabled
by default. Source inspection plus the public example reproduced these gaps:

- its generated HEVC codec string does not encode compatibility/constraint
  fields in the form Edge accepts;
- it retains only the last VCL NAL despite a WebCodecs chunk requiring one
  complete access unit, so multi-slice stills are not safely covered;
- it does not gate selection on `isConfigSupported()`;
- flush completion and decoder/frame cleanup are incomplete on failure paths;
  and
- its reported libheif decoder availability is not actual browser/OS
  capability evidence.

No upstream patch was applied and no parser-only Wasm was adopted. A future
spike needs a documented minimal patch, `WITH_LIBDE265=OFF`, an extension-
present Windows device, exact-config capability success and actual decode
success before production can be proposed.

## Decision

- Safari native still decode: technically usable for the tested device/file,
  with P3/ICC/HDR coverage still open.
- Edge WebCodecs/OS decode: unavailable on the current host and not yet proven
  on an extension-present machine.
- local libde265 Wasm: remains local PoC only and is not a fallback.

Candidate classification: **D (additional physical-device testing is
required).** Safari native decode is viable for the tested subset, but that
does not establish an Edge path or cross-device public-candidate coverage.

## Completion matrix

The classifications below are HEIC-specific. Existing JPEG/PNG/WebP/GIF and
non-HEIC Project/package regressions are stated separately and do not substitute
for missing HEIC evidence.

| Required target | Classification | Evidence boundary |
|---|---|---|
| Safari native HEIC | PASS | Tested iPhone 14 Pro/file scope only; P3/ICC/HDR remain open. |
| Edge WebCodecs HEVC | FAIL | Current Edge exposes the API but reports tested HEVC configurations unsupported. |
| Windows HEVC extension present | NOT TESTED | No approved extension-present device was available. |
| Windows HEVC extension absent | PASS (fail-closed) | Current-user extension absent; capability returned unsupported without PoC fallback. |
| offline reopen | PASS / NOT TESTED | Safari IndexedDB/restart/network-off smoke passed; Edge actual decode is not tested. |
| original bytes retained | PARTIAL | Safari/spike do not re-encode, and the provider contract isolates a disposable decode copy; production HEIC storage is not implemented. |
| Native save/reopen with HEIC | NOT TESTED | No production HEIC admission or schema-2 implementation exists. Existing non-HEIC save/reopen remains covered by regression tests. |
| `.lociview` export/restore with HEIC | NOT TESTED | No HEIC package transport is implemented. Existing non-HEIC export/restore remains covered by regression tests. |
| production exclusion | PASS | No decoder dependency/import/feature flag/asset; post-build verifier passes. |
| Service Worker exclusion | PASS | Generated worker contains no PoC URL or decoder asset; verifier runs before Pages upload. |

## Blockers by responsibility

| Blocker class | Status | Detail |
|---|---|---|
| technical | BLOCKED for Edge adoption | Current OS capability is absent; pinned experimental libheif WebCodecs code has codec-string, access-unit and lifecycle gaps. |
| security | PARTIAL | Local libde265 PoC has bounded controls, but no public decoder has a reviewed production Worker, limits, malformed matrix or emergency replacement path. |
| LGPL preparation | BLOCKED | libheif remains LGPL even without libde265; no adopted recipient notice/corresponding-source/relink kit exists. |
| external legal/patent | BLOCKED | No external HEVC patent authorization conclusion has been made. |
| device compatibility | BLOCKED pending evidence | Extension-present Windows, 10-bit, P3/ICC/HDR, large/multi-image and Live Photo-derived cases are untested. |

There is no unresolved P0 in the currently published product because no HEIC
decoder is published. The blockers above prevent claiming a public Edge HEIC
path or advancing the libde265 PoC into production.
