# Legacy LociMyu alpha provenance

> Status: `PROVENANCE`
> This evidence is intentionally outside the active repository and must be consulted only for legacy migration or security-history work.

## Archived artifacts

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `LociMyu-alpha/2026-08-18/app.edit.entry (2).zip` | 275864 | `37821EA1192624174CB49D93DD4B1C60349E693F3E4D6C356CCA1297828C5A58` |
| `Locimyu2-research-2026-08-18/Locimyu2-research-2026-08-18.zip` | 456371 | `80F680310C8A6366C5148CBB734319536B3F94121019111453A2760B9772EA00` |
| `LociView-pre-g1-2026-08-18/LociView.bundle` | 495543 | `D58DBE7D8BF25B4519D0C1BFCAEE6C45F03EB8D5C7E952914B0420EF49DAFE4B` |

Developer-machine archive root at the time of capture:

```text
G:\00_AI_dev\_archive\
```

`SHA256SUMS.csv`, the 94-file tracked-source manifest, and the 119-file research-workspace manifest are stored with the artifacts.

## Baseline

- Canonical current repository: `G:\00_AI_dev\LociView`
- Baseline commit before G-1: `4f6e48196041d7ae39a11aba04f647db99deb450`
- The Git bundle verifies as a complete history.
- The research ZIP contains 119 entries matching its 119-row source manifest.
- The outer legacy ZIP contains 56 entries and is sufficient to reproduce the audited legacy source bundle.

Do not extract these files into the active workspace. Migration tests should use small, anonymized, purpose-built fixtures with their own provenance and expected results.
