# GS fixture workspace

> Status: `G0-GSF-A CANDIDATE CHARACTERIZATION / NOT RATIFIED / NO RENDERER GUARANTEE`

This directory contains one tiny, deterministic Gaussian Splatting source
characterization. It is not a ratified format profile, representative load,
renderer derivative, performance fixture or measured device evidence.

The current candidate is documented in
[`docs/g0/gs-source-profile-candidate.md`](../../docs/g0/gs-source-profile-candidate.md).
It describes one strict binary-little-endian, 62-float Graphdeco-compatible PLY
shape for preflight discussion only. It is not a ratified `FormatProfileRef` and
cannot be advertised by a renderer.

## Tiny characterization files

| Path | Role | Authority limit |
|---|---|---|
| `source.v1.json` | Manually auditable recipe for eight synthetic splats | Candidate source values, not a real-project or load fixture |
| `profile-golden-sh3-v1.ply` | Deterministic binary-little-endian PLY with 62 float32 values / 248 bytes per splat | Candidate transport artifact, not a supported format promise |
| `expected.v1.json` | Whole-file identity, exact header/raw-bit facts and derived diagnostics | Generator-produced characterization; not an independently authored normative semantic oracle |

These project-authored synthetic files are the sole intended **Git-tier
candidate** in G0-GSF-A. They contain no copied upstream dataset bytes. The
interoperability facts behind their field layout still require an immutable
Graphdeco source-commit and license review; while the repository has no adopted
top-level license, their honest registry state is `NOASSERTION / unreviewed`.
Generated-tier and external-tier loads are separate future work.

The companion generator is
[`scripts/fixtures/generate-gs-profile-fixtures.mjs`](../../scripts/fixtures/generate-gs-profile-fixtures.mjs).
It verifies deterministic bytes and fail-closed candidate classification. Its
derived opacity, scale, quaternion and DC-color diagnostics are useful review
inputs, but they do not ratify support bounds, covariance or view-dependent SH
transform semantics.

## Classification controls

- The existing `public/samples/points.ply` remains ordinary point data with
  `splatCount: 0`; its `.ply` extension never makes it GS.
- The tiny exact candidate must match the complete byte/property envelope and
  the characterization limits recorded beside it.
- A partial or ambiguous GS-like property table must be Unsupported rather than
  silently treated as ordinary points or guessed as another GS dialect.
- Malformed, non-finite, truncated, trailing or over-budget input must fail
  before any resource becomes active.

## Evidence boundary

Any future normative fixture addition must carry two independently reviewable
layers:

1. **Transport** — exact bytes, byte length, SHA-256, header/record layout,
   provenance, license/privacy state and deterministic restore instructions.
2. **Semantics** — a separate oracle for classification, raw sample bits,
   source occurrence, decoded values, profile-derived transforms, finite bounds
   and any pick ground truth.

The byte generator may not serve as the only normative semantic oracle.
`expected.v1.json` is explicitly a generator-produced characterization;
ratification still requires manually authored cases and an independent
reader/review path.

## Conditions before candidate bytes can become normative profile evidence

- the candidate source envelope has completed independent review;
- the product owner has ratified the open support-cutoff, finite-bounds and SH
  transform/color decisions;
- the upstream characterization commit and license texts have immutable
  references;
- the exact profile and golden-manifest digest relationship is defined;
- the intended Git/generated/external tier and restore verification are
  specified before any normative registry entry is created;
- ordinary, exact, partial and malformed classifications have executable
  contract cases.

Medium/large loads, generated or external retention tiers,
`.artifacts/fixtures/gs/`, runtime/paged conversions, iPhone 14 Pro evidence and
G1-B are intentionally deferred beyond G0-GSF-A. The broad task to add
representative small/medium/large GS fixtures therefore remains incomplete.
