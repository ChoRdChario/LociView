# Gaussian Splat Lite 1.4.3 limited dependency

PO approved this exact dependency with [01c](../specs/01c-gs-sh4-proxy-workflow-proposal.md)
on2026-10-27 for nondefault ProjectScene validation. This does not adopt the renderer,
activate ordinary entry, change LociView's license or authorize release.

- Package: `gaussian-splat-lite@1.4.3`; Apache-2.0.
- Upstream commit: `d8703f7aed0e966e808a3fd3a2e1def3179d90dc`.
- Registry tarball SRI:
  `sha512-nEaZztRZbuz2T23gWp0HvuBo1BHv2cl9brGQTxhNJEj8gBsBJP6jXRWe74paGIvq8vqdlUTrsxjs6jiwsuooWA==`.
- Installation uses the exact registry artifact, unchanged; no fork/runtime CDN.
  Root lockfile is the dependency identity. Three remains0.186.0;07j's actual180
  compatibility aliases and Native Spark2.1/cache ownership remain unchanged.
- Upstream `LICENSE`, `NOTICE` and `THIRD_PARTY_LICENSES.md` are emitted unchanged
  under `third-party/gaussian-splat-lite-1.4.3/` in the validation build only.
  They retain the Apache notice and the included SparkJS, SuperSplat, ruzstd,
  flate2 and zlib-rs notices. Model inputs and mathematical source vectors are
  project-owned; no research-only renderer implementation was copied.
- Dependency review/audit and bundle-isolation evidence belong in
  [current work](../../tasks/todo.md). Existing audit findings are not a clean audit
  or release acceptance.

The new adapter uses only the root package and public typed APIs. In particular,
`display.refreshTransforms(renderer)` refreshes unchanged source ranges before
each draw while WebGL sorting is pending. It does not mutate accumulator ownership,
worker fields or source mappings, and does not claim instantaneous camera-SH updates.
