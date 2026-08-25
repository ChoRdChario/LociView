# Synthetic v1 migration fixtures

These small fixtures reproduce exact v1 shapes observed during earlier migration work without copying operational content or personal data.

- `locimyu-drive-exact-v1.zip` is a synthetic Google Drive folder download with a primary and backup workbook, numeric scientific-notation sheet GID, `__last` orthographic view with blank FOV/up cells, append-style material rows, a file-ID map, valid tiny model/image bytes, and an ignored Excel lock file.
- `native-v1-base.lociview`, `native-v1-branch-a.lociview`, and `native-v1-branch-b.lociview` are one v1 project lineage. They contain fixed canonical IDs/HLCs, stale derived caches, an intentionally non-canonical raw JSON line with a safe unknown `v` field, and branch-exclusive blobs.

Run `node scripts/fixtures/generate-v1-migration-fixtures.mjs --write` only when intentionally regenerating the checked-in transport bytes. The generator never creates or rewrites either expected oracle. `npm run fixtures:verify` rebuilds the artifacts twice, checks byte determinism, binds the transport inventory to the manually authored, independently reviewed oracles, and compares the checked-in bytes. The migration tests exercise the production parsers and compare their normalized results with the semantic oracle plus its identity overlay.

The whole ZIP SHA-256 is transport identity, not migration semantics. `expected.v1.json` remains the pre-recipe historical oracle, including its original `cap_LM...` IDs. `expected.locimyu-caption-id-2.json` separately binds the approved recipe-2 vectors and overlays only those historical Caption identities for current conversions; it does not rewrite the historical record. Other semantic truth is the logical entry inventory, workbook cell projection, raw operation text, binary hashes, and normalized state recorded by `expected.v1.json`. ZIP timestamps, offsets, compression metadata, random migrated IDs, and newly generated HLCs are not semantic goldens.

These are synthetic characterization fixtures based on previously observed shapes. They do **not** satisfy the separate requirement for an anonymized real v1 fixture in `STO-MIG-01`; that gate remains open until an approved artifact is available.
