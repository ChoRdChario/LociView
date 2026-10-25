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
npm run test:e2e -- project-workflow.spec.ts --timings --record-trace
```

`--timings` opts the validation page into local Performance measures for host
generation, output refresh, display, download and selected-file verification.
Attachments include cumulative underlying OPFS/IndexedDB call counts and durations
by fixed family, without paths or content. Subtract the before/after snapshots
for each action. Parent stages include their children; aggregate I/O durations may
overlap. These measurements do not isolate every internal ZIP/validation/queue
stage. No storage access or validation is skipped to collect them.

Normal runs omit continuous Playwright operation tracing. `--record-trace` opts
into full traces; it is a wrapper boolean, not a Playwright trace-mode argument.
Two independent browser processes with recording can substantially increase run
time. Screenshots, reports, original-byte checks and failure diagnostics remain in
normal runs. `--no-trace` remains an explicit compatibility alias for that mode;
combining it with `--record-trace` is an error. All functional assertions,
generated inputs, dedicated profiles, deadlines and retry policy are unchanged.
Record the flags with any timing comparison. A single execution is an observation,
not a stable latency guarantee. Older runs retain their recorded trace condition;
their defaults preceded this change. Detailed page instrumentation is opt-in.

## Acceptance and artifacts

The connected regression creates a Project, places a pin using numeric model-local
coordinates, edits Caption text and adds a generated image. It downloads a named
backup, validates saved bytes through the existing package reader, and selects the
actual downloaded file in the UI before expecting a verified-save acknowledgment.
It checks reload, full browser close/relaunch using the same dedicated profile,
and restoration of that backup in a separate empty profile followed by editing
and another verified backup. Original model/image bytes and Project identity must
survive. Browser exceptions fail the test.

The team regression uses two independent persistent Chromium profiles and two
Scenes. A distributes a real Workspace; B opens it without a separate model
import, edits text and adds a distinct image. A's update produces a body conflict
that requires an explicit choice. Four actual Contribution files then complete
two bidirectional rounds against the explicitly selected original Workspace.
Final backups verify original model/images, every contributed change byte,
identity and unchanged base proofs. Replaying an accepted file must leave source,
records and that workspace's base table unchanged. Both browsers fully close and
relaunch, then UI and fresh backups must retain the same state/history/table.
Generated/imported base observations differ legitimately between participants.
This is bounded file-workflow evidence, not all of TEAM-FLOW-01: model replacement,
pin correction, keep-both, representative interruption, offline and device lanes
retain their own remaining acceptance.

Browser cache, profiles, downloads, screenshots, optional traces, environment/build identity
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
