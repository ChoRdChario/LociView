# Superseded GS / Proxy draft, 2026-10-27

This retains the unapproved proposal published at Git checkpoint `35c0a4d`.
The PO requested a rendering-requirements reassessment after checking SH4 support.
The [revised 01b proposal](../../specs/01b-gs-proxy-project-scene-proposal.md)
supersedes its SH3-only, full-source CPU/screen recommendation and pending approval.
Nothing in this archive is approved, implemented, adopted or a current work queue.

The [original draft](01b-gs-proxy-project-scene-proposal.md) retains the original
body with only relative Markdown links rebased for this location. Its four
candidate JSON files are retained byte-for-byte, with their original SHA-256:

| Candidate | SHA-256 |
|---|---|
| [GS source](profiles/gs-ply-sh3-1.profile.json) | `746cc3fda107a52fdc14efe079b6ddda0297cc084b11205c3b5e3cd1b20a4970` |
| [Proxy](profiles/proxy-glb-1.profile.json) | `383e4352199eedbd99b89550d9a899a8182d50f005c8e9a1ff9daa2b2402f7ff` |
| [Semantic goldens](profiles/gs-ply-sh3-1.goldens.json) | `d3c7fc4782006faa66628848192af585d56d9fb5d31da36d9202cf10ca223e85` |
| [Screen presentation](profiles/gs-screen-1.presentation.json) | `51ac8c27546c0b7e197a6431919610bd1ac45676bfd201d8fc1e0a301dac7f98` |

Prior document/numeric checks and the 2-suite/28-test GS fixture regression
verified those exact inputs, not practical GS rendering. The original byte-bound
G0 document was restored after indexed-blob and registered-SHA failures; neither
fixture registry nor assertions were changed. Ignored local proposal evidence
retains those failures. The existing six approved Point01a JSON remain unchanged.

Reassessment found that the current 64MiB/100k/8M-scalar admission cannot reach
the existing 500k renderer fixture, SH4 needs separate consideration, and the
per-view numeric predicate can make a whole GS unavailable after a small pan.
This invalidates the product recommendation, without claiming a runtime bug in
an implementation that does not exist. Source/covariance/SH reference vectors
may inform later independent oracles; they do not ratify the archived profiles.
