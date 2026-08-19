# G0 device and performance evidence runbook

> Status: `G0 EVIDENCE CONTRACT / NO MEASUREMENTS RECORDED`

This runbook records comparable evidence without claiming that a pending device
or an unmeasured threshold has passed. The existing `docs/08-ios-test-guide.md`
remains the short v1 UX smoke test; it is not performance evidence.

## Target environments

- iPhone 14 Pro, physical device, Safari PWA is the oldest repeatedly testable
  iOS alpha target.
- Windows desktop and Windows tablet PC are separate device classes. Use the
  same chosen primary Chromium browser and version where possible.
- iPad/iPadOS is not a supported class until a physical iPad can be tested
  repeatedly.

Never record a serial number, hostname, account name, device advertising ID or
other durable personal identifier. Unknown fields remain `null`; they are not
estimated.

## Before a run

1. Use a clean Git commit. Run dependency install, typecheck, full tests and a
   production build.
2. Set `build.deliveryMode` explicitly. Record the full commit hash, lockfile
   SHA-256 and the served `index.html`/`sw.js` hashes for either mode. A local
   run keeps workflow/deploy fields null; a deployed run also records workflow
   run and an HTTPS deploy URL.
3. Confirm the installed PWA has updated. A run against an unidentifiable or
   stale service worker is `invalid`.
4. Verify the fixture against `fixtures/registry.json`. Save mobile fixtures to
   "On My iPhone" before going offline; do not rely on an undownloaded iCloud
   placeholder.
5. Register the fixed camera/input trace ID, SHA-256, bytes, version and restore
   locator. A complete run uses a Git trace or a same-run recorded external
   artifact; generated traces remain incomplete until a durable recipe contract
   exists. A run without the same restorable trace cannot be marked complete.
6. Fix viewport, DPR, drawing-buffer size, power mode and thermal condition.
   Performance video capture is a separate run because recording changes load.

The current app does not yet expose all build/resource fields. Leave missing
values `null` and mark the run `incomplete`; do not infer them from another run.

## Measurement sequence

1. Perform five offline, warm-service-worker cold-process launches.
2. Record project open, first preview and fully usable as separate timestamps.
3. After ten seconds warm-up, run a fixed 120-second foreground camera trace.
   Exclude hidden/background intervals from frame statistics.
4. Perform at least 30 ground-truth picks. Separate ray/pick computation from
   the long-press or pointer gesture time.
5. Perform three background/foreground cycles, ten minutes continuous use and
   twenty load/unload cycles.
6. Inspect, import and export a package. Reopen it and compare semantic state,
   registered fixture/blob hashes and pin counts.
7. Store large logs, traces, screenshots and videos outside Git. Register them
   through the external-artifact manifest with SHA-256 and retention metadata.

iOS JavaScript heap data may be unavailable. Record that as `unavailable`, not
zero, and use the application resource ledger, renderer handles, storage,
context loss and unexpected reloads as complementary evidence.

Gaussian Splatting is `unsupported` in the v1 baseline. Do not invent v1 GS
frame, memory or pick measurements.

## Provisional observations

The following values are seeds for measurement and remain **unapproved** until
the product owner reviews real runs. The templates cannot record a gate `pass`:

- offline launch: 5/5;
- median at least 24 fps and p95 frame interval at most 66.7 ms;
- goal: 30 fps / 50 ms;
- first preview within 5 seconds;
- direct-pick p95: desktop 100 ms, iOS 150 ms;
- pick error within two screen pixels or one projected footprint;
- background restore 3/3 and no reload/context loss during ten minutes;
- resource plateau after twenty load/unload cycles;
- where comparable heap samples exist, final-five median no more than 10%
  above the first stable five and no approved positive slope;
- storage remaining after cleanup no more than `max(5 MiB, fixture bytes * 5%)`
  above the post-first-cycle baseline.

Use `within-provisional`, `outside-provisional` or `not-evaluated`. Only a later
product-owner decision can turn measured values into support guarantees.

## Evidence validation

- Each run references one measured environment record and one registered
  fixture digest, plus one restorable camera/input trace.
- Five launch samples report p50/max, not p95. Percentiles require at least 20
  samples; pick evidence requires at least 30.
- CPU time around `renderer.render()` is not GPU completion time and must not be
  labelled as such.
- Raw JSON, screenshots, exclusions and external artifact hashes are reviewed
  by a non-implementing reviewer before a gate decision.
- Run `npm run evidence:verify` to apply the bundled schemas and check bounded
  input, duplicate IDs, privacy-sensitive strings, source bytes and
  cross-record references. Git inputs are verified at the recorded build
  commit, which must be an ancestor of the evidence checkout's `HEAD`.
  Generated fixtures must be byte-reproducible regular non-link files under
  `.artifacts/fixtures/`; generated traces cannot complete a run until a durable
  recipe contract exists. External inputs resolve through the same run's
  manifest. One Git source blob is limited to 64 MiB
  and one verification run to 8 GiB of unique local source bytes. The command
  does not execute restore instructions or fetch remote artifacts.
- The current schema has no locator for served `index.html` or `sw.js` bytes.
  Their digest fields are required and shape-checked, but a reviewer must still
  compare them with the actual local/deployed response before accepting a run.
