# Isolated PC smooth-composition evaluation

[Approved01f](../../docs/specs/01f-desktop-smooth-composition-evaluation.md)
owns authority and exit criteria; [todo](../../tasks/todo.md) owns current results,
failure evidence and next actions. This disposable read-only experiment is not
imported by any ordinary, validation, harness or Desktop product entry. Do not
promote its implementation into a product renderer.

Run the existing dedicated Chromium lane from the repository root:

```powershell
npm run test:e2e -- --config scripts/smooth-composition-evaluation/playwright.config.ts
```

The runner owns a local Vite server on127.0.0.1:4182, dedicated matching Chromium,
synthetic project-owned geometry/SH4 bytes and ignored run artifacts. It does not
use a personal Chrome profile, Project/OPFS/IDB/package APIs or new dependencies.
The camera test contains two real120-second traces; its deadline is not a product
latency guarantee. Do not run another4182 preview concurrently.

## Compared implementations

Both use the pinned public Three0.186/GSL1.4.3 root exports, owned derived materials,
the same camera/context/opaque depth, linear RGB accumulation and one final sRGB
conversion. GSL uniforms are shared by public reference; its source material and
textures stay unchanged. Fixed shader-shape guards reject unexpected code.

- Reference: RGBA32F weighted accumulation, then RGBA16F multiplicative revealage.
- MRT: RGBA32F weighted accumulation plus RG32F optical depth/saturated-alpha count,
  using additive blending for both attachments in one transparent pass. For alpha1,
  a separate count gives revealage0 without an opacity epsilon. Small alpha uses
  the first three terms of `-log(1-alpha)` to avoid cancellation.

Float32 accumulation preserves the admitted bright GS range instead of clamping
original colors. It requires actual float-color/float-blend support. Both forms add
24bytes/pixel:47.46MiB at1920×1080,84.38MiB at2560×1440. Shared opaque depth is
borrowed, never cleared/written by the transparent pass, and detached before its
nonowner targets are disposed. Loss releases live resources before restoration;
recreation reacquires extensions and uses the same owned source.

This is an approximation to transparency, not exact ordered closed-mesh optics.
The method is based on [McGuire and Bavoil's original WBOIT paper](https://jcgt.org/published/0002/02/09/).
The log-revealage MRT form is an evaluation variant, not a new persisted profile.

## Evidence boundaries

Basic-opacity/MASK geometry, eight layers, synthetic closed aircraft and SH4 GS
exercise the public integration. Pixel differences prove actual GS/Mesh contribution
and order stability; reference screenshots need visual inspection. This does not
verify the complete07n source-alpha/texture/chroma/Phong/Standard adapter.

Keep three timing measures distinct: warmed static CPU submission/flush cost,
valid non-disjoint GPU queries, and actual browser frame intervals on matched
camera traces. Static timings exclude asynchronous camera/sort work. A paced
trace can mask GPU headroom loss; retain the separate GPU surcharge and tested GPU.
Never extrapolate this PC run to iOS, unrestricted display size/DPR or lower GPUs.
Chromium's [public implementation](https://chromium.googlesource.com/chromium/src/+/ae1a631ceaf488f5e9cb55755de32b6a505b4b1e/third_party/blink/renderer/modules/webgl/webgl_rendering_context_base.cc)
implements WebGL `finish()` as a flush. Do not interpret the measured JavaScript
call span as a GPU-completion fence or compare it as the same quantity as GPU time.
Renderer geometry/texture counters after unload prove counter stability only,
not a total-memory or decoder-worker guarantee. No offline/PWA/adoption/production
activation/release evidence is supplied here.
