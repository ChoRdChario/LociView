# Gaussian PLY source-profile preflight

> Status: `G0 PREFLIGHT CANDIDATE / NOT RATIFIED / NO RENDERER GUARANTEE`

## 1. Purpose and authority

This document prepares one deliberately narrow Gaussian Splatting (GS) source
shape for later G0 fixture work. It is a decision aid, not an adopted
`FormatProfile`, fixture, decoder contract, renderer capability, performance
claim or iOS support guarantee.

The approved specifications remain authoritative. In particular, a
`FormatProfileRef` becomes eligible only after its exact specification bytes,
SHA-256 binding and normative goldens are ratified under
[`01-domain-rendering.md`](../specs/01-domain-rendering.md) and
[`03-gates-and-delivery.md`](../specs/03-gates-and-delivery.md). Nothing in this
preflight overrides those requirements or changes the current v1 rule that PLY
means ordinary mesh/point data and GS is unsupported.

The provisional handle `lociview-gs-ply-f32le-sh3-1` is used only to discuss the
candidate. It MUST NOT appear in persisted project data or a backend capability
profile unless a later product-owner ratification binds that ID to one exact
specification digest.

## 2. Scope

This preflight covers only:

- an exact structural and record-level PLY envelope suitable for a tiny
  characterization golden;
- the boundary between ordinary PLY, the exact GS candidate and partial or
  ambiguous GS-like PLY;
- the separation of transport evidence from a future semantic oracle;
- the primary-source, license and product-owner decisions required before
  candidate characterization can become profile evidence.

This document does not ratify fixture bytes. A companion G0-GSF-A
characterization may add a tiny, deterministic source recipe, candidate PLY and
diagnostic output while all three remain non-normative. Medium/large load
fixtures, generated or external artifact retention tiers, runtime/paged
derivatives, package paths, renderer bakeoff work, iPhone 14 Pro measurements
and all G1-B evidence are outside G0-GSF-A.

## 3. Exact candidate byte envelope

The candidate is a strict, Graphdeco-compatible source subset rather than a
claim that every file named `.ply` has the same meaning.

- PLY magic is `ply` followed by LF.
- The format line is exactly `format binary_little_endian 1.0` followed by LF.
- There is exactly one `vertex` element and no face or other element.
- Every vertex property is scalar PLY `float` (IEEE-754 binary32).
- `comment` and `obj_info` lines carry no GS semantics. The canonical tiny
  characterization uses exactly one project-owned comment line,
  `comment LociView deterministic synthetic SH3 profile golden v1`, and no
  `obj_info`; its complete header bytes are transport-oracle-bound. A bounded
  inspector may ignore other well-formed metadata lines for classification,
  but they do not alter the exact element/property contract. List properties,
  aliases and extra elements or properties are not admitted.
- The header ends with `end_header` followed by LF.
- The payload contains exactly `vertexCount * 248` bytes and no trailing bytes.
- Every decoded scalar is finite. The four rotation scalars must not form a
  zero-length or otherwise non-normalizable quaternion.

Each record has exactly 62 little-endian float32 values in this order:

```text
x y z
nx ny nz
f_dc_0 f_dc_1 f_dc_2
f_rest_0 ... f_rest_44
opacity
scale_0 scale_1 scale_2
rot_0 rot_1 rot_2 rot_3
```

The candidate interpretation is Graphdeco-compatible: the three DC values are
RGB; the 45 remaining degree-1-through-degree-3 spherical-harmonic values are
15 values for R, then 15 for G, then 15 for B; encoded opacity is a logit;
encoded scale is logarithmic; and `rot_0..3` is the quaternion in `w, x, y, z`
order before normalization. `nx/ny/nz` are compatibility placeholders, not a
claim that GS has a pickable surface normal. Whether the first profile requires
positive zero or permits finite ignored values remains a ratification input.
These statements remain candidate semantics until the ratification work in
section 6 supplies exact formulas and goldens.

Filename extension and declared MIME are hints only. Detection begins with
validated bytes and bounded header inspection; neither `.ply` nor
`application/octet-stream` selects this candidate by itself.

## 4. Classification boundary

The future inspector must make one of the following decisions without falling
back by extension:

The G0-GSF-A inspector performs complete payload validation only for the exact
GS candidate. An ordinary mesh/point outcome is deliberately marked
`header-classification-only`: it is a routing result, not permission to decode,
render or activate the resource. A separate ordinary-format validator must
validate that payload before use.

1. **Ordinary PLY** — a mesh- or point-shaped PLY header with no GS semantic
   signature is routed to ordinary-geometry validation. The existing
   ordinary-point smoke PLY is the positive control and keeps `splatCount: 0`.
2. **Exact candidate GS PLY** — only the complete envelope and exact property
   table in section 3 can enter this candidate's semantic validation. Passing
   the header alone is not enough; size, finite values, quaternion validity and
   future configured budgets must also pass.
3. **Partial or ambiguous GS-like PLY** — a PLY containing any GS-specific name
   such as `opacity`, `scale_*`, `rot_*`, `f_dc_*` or `f_rest_*` but not the
   complete candidate table is Unsupported. It is not silently reclassified as
   ordinary points and another GS dialect is not guessed.
4. **Malformed or over-budget input** — invalid header structure, duplicate
   names, unsafe count arithmetic, a truncated/extra payload, non-finite values
   or budget exhaustion is rejected or quarantined with an actionable
   diagnosis. No partial resource is activated.

This boundary intentionally leaves other legitimate GS PLY dialects available
for later, separately versioned profiles.

## 5. Transport evidence and semantic oracle

Transport identity and semantic correctness are independent.

Transport evidence records the exact source byte length, SHA-256, header bytes,
record width, vertex count and restore procedure. A matching whole-file hash
proves which bytes were tested; it does not prove that their Gaussian meaning
was decoded correctly.

The later **normative** semantic oracle is a small, manually authored and
independently reviewed document. A generator-produced `expected.v1.json` may
record transport/header/raw-bit facts and derived diagnostics for the tiny
characterization, but it does not by itself satisfy this requirement. The
normative oracle binds at minimum:

- the candidate/profile specification digest and golden-manifest digest;
- raw float32 bit patterns at fixed source-splat indices;
- decoded means, encoded opacity/scale/quaternion values and SH coefficient
  ordering;
- exact ordinary/exact/partial classification decisions and negative cases;
- the ratified opacity, covariance, finite-support bound and view-dependent
  color results under identity, translation, rotation, positive scale and
  reflection;
- canonical pick anchors and source-splat occurrence ground truth where the
  fixture is intended for picking.

The generator MUST NOT be the sole source of both fixture bytes and all expected
semantic values. A separate reader plus hand-reviewed golden values must catch
a shared layout, coefficient-order or transform bug. ZIP/container-style hash
evidence remains transport evidence only.

## 6. Ratification decisions still open

G0-GSF-A deliberately does not decide the following product semantics:

- the exact opacity/covariance support cutoff, including when a Gaussian has
  empty support;
- the finite conservative `logicalBoundsAsset` formula, numeric tolerance,
  overflow behavior and canonical-zero rules;
- quaternion normalization and covariance construction goldens;
- whether `nx/ny/nz` must be positive zero or are finite ignored placeholders;
- SH basis constants, coefficient evaluation order, camera-to-mean versus
  mean-to-camera direction, color space, `+0.5` bias, clamp and reflection
  behavior;
- the accepted vertex-count/header/decode budgets;
- the exact immutable profile bytes, profile ID/digest registry entry and
  normative golden-manifest digest.

Those choices require product-owner ratification before a backend may advertise
support or G0 may count the initial FormatProfile requirement as complete.

## 7. Primary-source and license preflight

The field layout and candidate activations were characterized against the
Graphdeco-INRIA reference repository, especially
`scene/gaussian_model.py`, and its spherical-harmonic convention. A moving
`main` URL is not evidence. Before ratification, the project must record:

- the full upstream commit SHA and exact source paths used for
  characterization;
- hashes or immutable locators for the reviewed source and license texts;
- which facts are interoperable byte/semantic conventions and which, if any,
  implementation material was derived;
- the repository's non-commercial/research license caution and any separately
  licensed SH material;
- an independent, clean implementation plan that does not copy upstream
  renderer code into LociView.

Primary references:

- <https://github.com/graphdeco-inria/gaussian-splatting/blob/main/scene/gaussian_model.py>
- <https://github.com/graphdeco-inria/gaussian-splatting/blob/main/utils/sh_utils.py>
- <https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/cuda_rasterizer/forward.cu>

This preflight makes no legal or redistribution approval. Until LociView adopts
a top-level license, any project-authored fixture entry continues to use the
registry's honest `NOASSERTION / unreviewed` state.

## 8. G0-GSF-A acceptance checklist

- [x] Candidate status is explicit and cannot be confused with ratification or
  renderer support.
- [x] Binary little-endian PLY structure, 62-float record order and 248-byte
  stride are explicit.
- [x] Ordinary, exact candidate, partial/ambiguous and malformed PLY outcomes
  are fail-closed and extension-neutral.
- [x] Transport evidence is separated from the future semantic oracle.
- [x] Support cutoff, finite bounds and transformed SH/color semantics remain
  explicit product-owner ratification inputs.
- [x] Primary-source commit and license obligations are recorded without
  copying an upstream implementation.
- [x] Large/generated/external fixtures, device evidence, runtime derivatives,
  production code and G1-B are excluded.
- [x] Any companion tiny bytes remain candidate characterization only; no
  ratified profile digest, measured evidence or renderer guarantee is created
  by this preflight.

The next normative or representative-load GS fixture slice may begin only from
a reviewed version of this preflight. It still may not call the profile
ratified until every open item in section 6 has an approved exact answer and
restorable golden evidence.
