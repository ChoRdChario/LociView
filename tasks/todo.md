# LociView active work

Completed v1 implementation history remains available in Git before the G-1 cleanup baseline (`4f6e481`). This file contains only active and next work.

## G-1 — Repository normalization

- [x] Confirm `G:/00_AI_dev/LociView` as the canonical Git repository and record baseline commit
- [x] Inventory current, generated, dependency, legacy, and research files
- [x] Archive legacy alpha, raw research workspace, and complete current Git history with SHA-256 manifests
- [x] Add repository working rules, project map, documentation authority index, and legacy provenance
- [x] Record accepted v2 foundation decisions and reconsideration triggers in an ADR
- [x] Remove active documentation links to the old `Locimyu2` workspace
- [x] Mark v1, historical, superseded, and proposed-v2 documents explicitly
- [x] Mark misleading mixed-document sections inline where a top-level status was insufficient
- [x] Merge curated lessons from the retired research workspace
- [x] Remove generated `dist`, verify one production rebuild, then remove the generated output again
- [x] Complete consolidated typecheck, full tests, build, archive verification, and independent Git review
- [ ] Switch Codex and Claude workspace roots to `G:/00_AI_dev/LociView`
- [ ] Keep the old `Locimyu2` directory read-only until the workspace switch is confirmed; do not permanently delete it in G-1

## G0 — Baseline fixtures and acceptance contracts

Start only after G-1 passes.

- [ ] Freeze representative v1 projects and migration fixtures
- [ ] Add small/medium/large GS fixtures with provenance and expected results
- [ ] Add mesh/GS intersection and closed translucent aircraft reference scenes
- [ ] Record target desktop and physical-iOS devices
- [ ] Measure current load, memory, frame-time, picking, and package baselines
- [ ] Approve support guarantees, degradation behavior, and Go/No-Go thresholds

## G0-S — v1 safety stabilization (blocking before G1 feature work)

- [ ] Add deterministic reproductions for same-browser multi-tab actor/sequence collision
- [ ] Add a failure-injection test for a rejected append followed by later writes and durable-state/UI divergence
- [ ] Add untrusted-operation tests for reserved/prototype keys and canonical HLC/ID validation
- [ ] Add interruption/concurrency tests for package/model operation-to-blob updates
- [ ] Implement the smallest root fixes without coupling them to the v2 storage rewrite
- [ ] Distinguish queued, durably saved, and exported state in user-visible status
- [ ] Run malicious-package and regression tests, then update the deployed v1 build before G1

## G1+ — Proposed v2 gates

Start only after G0 and G0-S pass. See `docs/v2/00-approved-direction.md`. Order:

1. bounded-memory streaming/CAS package PoC;
2. Spark/Three versus PlayCanvas renderer bakeoff;
3. Automerge durability/merge/privacy PoC;
4. renderer/storage-neutral ports with unchanged v1 behavior;
5. v2 persistence, canonical migration, and the GS vertical slice.
