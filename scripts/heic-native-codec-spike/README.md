# Isolated native/WebCodecs HEIC spike

Status: `TECHNICAL SPIKE / NOT PRODUCTION / NO CODEC BINARY`.

This directory tests the public-provider boundary approved in
`docs/specs/02-storage-package-migration.md` section 29.2. It is outside the
application, Vite and Service Worker graphs. It does not contain libheif,
libde265, a decoder Wasm, a package dependency or a production feature flag.

The spike separates three responsibilities:

- `safari-native`: browser-native still-image presentation;
- `webcodecs-hevc`: HEIF parsing followed by OS/WebCodecs HEVC decode; and
- `libde265-local-poc`: the existing local experiment, which the public
  registry rejects and never uses as fallback.

`provider-boundary.mjs` is a contract probe, not application architecture. It
proves that original source bytes can remain untouched while presentation is
unsupported, that public-provider selection is capability based, and that a
selected provider's decode failure does not cascade to the local PoC.

`web/` is a local manual capability page. Serve only this directory, then open
it in the browser under test:

```powershell
python -m http.server 4203 --bind 127.0.0.1 --directory scripts/heic-native-codec-spike/web
```

The page calls `VideoDecoder.isConfigSupported()` for representative HEVC and
H.264 control configurations. It downloads nothing and performs no file
decode. Stop the server after the result is copied.

The Windows result is recorded in `RESULT.md`. A parser-only libheif build was
not promoted from this spike because the current host reports no HEVC
capability and the pinned upstream WebCodecs backend has independently
reproduced codec-string, multi-VCL and lifecycle gaps. The proposed build flags
remain:

```text
WITH_LIBDE265=OFF
WITH_WEBCODECS=ON
WITH_X265=OFF
WITH_KVAZAAR=OFF
ENABLE_PLUGIN_LOADING=OFF
```

An extension-present Windows device must first prove capability and actual
decode with the same exact configuration. No result here permits libde265
publication, closes libheif LGPL preparation, or resolves HEVC patent review.
