# Dedicated browser tests

The repository owns a Playwright Test lane for the nondefault ProjectScene
validation build. It launches matching downloaded Chromium with generated GLB/PNG
inputs and dedicated profiles. It does not connect to the user's browser.

## Run

From the repository root, after `npm ci`:

```powershell
npm run test:e2e:install
npm run test:e2e
```

The first command downloads the browser matching the exact locked Playwright
version. Reinstall it after a Playwright upgrade. The wrapper uses the same
workspace-local browser cache for installation and execution; no global runner or
existing Chrome executable is selected.

Tests build `validation-dist`, then own a preview bound to `127.0.0.1:4182`.
An occupied port is an error. Finish another local preview before running; the
runner does not terminate or reuse an unknown server. Browser page requests are
limited to this origin and generated Blob/data resources. Package/browser downloads
and browser process execution remain subject to the host's managed permissions.

For latency diagnosis with the same functional assertions:

```powershell
npm run test:e2e -- --timings
npm run test:e2e -- --timings --no-trace
```

`--timings` opts the validation page into local Performance measures for host
generation, output refresh, display, download and selected-file verification.
Attachments include cumulative underlying OPFS/IndexedDB call counts and durations
by fixed family, without paths or content. Subtract the before/after snapshots
for each action. Parent stages include their children; aggregate I/O durations may
overlap. These measurements do not isolate every internal ZIP/validation/queue
stage. No storage access or validation is skipped to collect them.

`--no-trace` omits the Playwright operation traces to compare tracing overhead;
functional assertions, generated inputs, dedicated profiles and reports remain.
Record the flags with any timing comparison. A single execution is an observation,
not a stable latency guarantee. Ordinary runs retain tracing and omit detailed
page instrumentation.

## Acceptance and artifacts

The connected regression creates a Project, places a pin using numeric model-local
coordinates, edits Caption text and adds a generated image. It downloads a named
backup, validates saved bytes through the existing package reader, and selects the
actual downloaded file in the UI before expecting a verified-save acknowledgment.
It checks reload, full browser close/relaunch using the same dedicated profile,
and restoration of that backup in a separate empty profile followed by editing
and another verified backup. Original model/image bytes and Project identity must
survive. Browser exceptions fail the test.

Browser cache, profiles, downloads, screenshots, traces, environment/build identity
and HTML/JSON reports stay under ignored `.artifacts/e2e/`. Each execution has a
separate `runs/<identifier>/` directory, so a later run retains earlier failures.
These artifacts contain synthetic test data only. Browser installation is reused.

`tests/e2e/*.spec.ts` is separate from the Node Vitest `*.test.ts` suite. Continue
running the existing required checkpoint checks; passing E2E does not replace them.
Functional storage waits have generous bounded deadlines. Recorded whole-action
times include undifferentiated storage/validation/display/handoff work; they are
diagnostic observations, not performance acceptance or a product capacity promise.

This is desktop dedicated-Chromium evidence for the recorded validation build and
headless execution. It does not verify the broken Chrome plugin, physical iPhone,
offline/PWA, ordinary-entry activation, broader format support or aggregate adoption.
Current execution outcomes and next work belong in [todo](../tasks/todo.md).

Playwright references: [installation](https://playwright.dev/docs/intro),
[web server ownership](https://playwright.dev/docs/test-webserver),
[downloads](https://playwright.dev/docs/downloads).
