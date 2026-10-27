# Dedicated browser tests

The repository owns a Playwright Test lane for the nondefault ProjectScene
validation build. It launches matching downloaded Chromium with generated GLB,
approved synthetic XYZ/RGB ASCII PLY and image inputs in dedicated profiles.
It does not connect to the user's browser.

The approved01e PC candidate has a separate `playwright.desktop.config.ts` lane.
It builds `desktop-dist` and opens the actual `index.html` root, with Service Workers
blocked, local-only requests and matching dedicated Chromium. It neither activates
the normal PWA nor connects to a personal Chrome profile. Normal/validation and
Desktop evidence are separate. All previews use4182 exclusively; run them serially.

```powershell
npm run test:e2e -- --config playwright.desktop.config.ts desktop-entry.spec.ts
npm run test:e2e -- --config playwright.desktop.config.ts gs-workflow.spec.ts --grep 'SH4と面'
npm run test:e2e -- --config playwright.desktop.config.ts desktop-large-gs.spec.ts
```

The large test generates/verifies a fixed owned178MB SH4 grid when absent; no user
file or distributed binary fixture is required. It exercises all five purposes,
return, Review edit-copy, absent-original restore and cold restart across dedicated
profiles, verifying original digest/history/records and forbidding whole-GS
`Blob.arrayBuffer()` in application code. Its native source/full-resident SDK path
is not progressive paging or a total-RAM/device guarantee. The download deadline
remains300s; the longer overall deadline only accommodates the connected actions.
Artifacts and interrupted/failing profiles remain under ignored `.artifacts/e2e`.
For a local candidate preview, use `npm run build:desktop` then
`npm run preview:desktop`; it creates no SW/install assets. Continuing existing
validation data requires the same origin/profile; a different output directory
alone does not transfer data. Do not deploy this candidate over a normal PWA root.

The separate `playwright.normal.config.ts` builds/previews the ordinary `index.html`
entry for07j's existing Native/v1 compatibility smoke. Run it with
`npm run test:e2e -- --config playwright.normal.config.ts`. Its dedicated profiles
are distinct from validation. The Native GS case explicitly prepares the existing
Spark2.1 cache and allows its Service Worker; other cases block workers. Local
normal-entry evidence is not physical-device/offline/PWA acceptance or new GS support.
The GS and initial-conversion/team cases use short unique ASCII profiles under `.artifacts/e2e/profiles`.
The longer test-title-derived Windows profile produced an actual CacheStorage
`Unexpected internal error` during Service Worker installation; the short profile
passed preparation. This is test-environment evidence, not a product PWA fix.
The material/team lane also failed to open its recipient with the longer nested
profile and passed with the short profile; it retains separate failed/final records.

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
overlap. Backup diagnostics additionally separate capture/persist/finish/job and the
job's input/space/stream-close/artifact-inspection/final-input/receipt phases.
The outer generation span includes the complete Session workflow. Stream-close
includes producer/backpressure and generation guards, not just native disk time.
Native write counts from controlled sink unit tests are distinct from this browser
telemetry. These measurements do not isolate every internal ZIP/validation/queue
stage. No storage access or validation is skipped to collect them.

The existing single-user workflow also records two user-facing boundaries:
final Save action → download event, and selected-file confirmation → matching
acknowledgment. Driver overhead is included; human picker/decision time and OS
save completion are separate. The broader save/file-check span remains available.
A test-only Event Timing observer requests a16ms reporting threshold, records at
most512 numeric/event-name samples per document and marks support/truncation.
Attachments are cumulative per document; deduplicate by document time origin,
interaction ID, event name and start time, rather than adding snapshots. Several
events can belong to one gesture. Empty/unsupported data is not zero latency.
The [Event Timing API working draft](https://www.w3.org/TR/event-timing/) describes
this event grouping and duration reporting; the pinned browser is the executed
evidence. These are local next-paint event observations, not field INP, p75/p95, asynchronous
completion or physical-device acceptance. Use the development targets in the
[UI guidelines](ui-product-guidelines.md#22-快適さの開発目標と報告po方針-2026-10-26)
to prioritize work; functional assertions and existing deadlines remain unchanged.

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

The [point workflow](../tests/e2e/point-workflow.spec.ts) covers 01a's admitted
ASCII PLY, RGB/disc pixels at DPR1/2, local diameter/placement/visibility,
source-centre recording and explicit manual adjustment, Caption/image edits,
actual backup/Workspace/Contribution/Review files, full cold restart and
absent-Project restore followed by editing and checked save. A separate case uses
a transformed large-coordinate GLB to prove GPU occlusion, then source-centre
selection after hiding that Mesh. Unsupported DPR3 is local to point display;
existing Mesh/Caption/media stay usable. Individual run results and final-build
identity remain in todo; a passing case never relabels a failed aggregate run.
This is not arbitrary PLY/GS, physical-device, offline or adoption acceptance.

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
This is bounded file-workflow evidence, not all of TEAM-FLOW-01. The separate
model/copy cases below do not close the integrated ordinary-entry, broader fault,
offline or physical-device acceptance.

The model regression shares one placed model across two Scenes and retains a
peer's local text and distinct image while receiving a replacement. It checks the
replacement confirmation/cancel, preserved placement and original model bytes,
visible colored review pins and a separate badge. A review pin must first select
the current model surface before numeric adjustment and confirmation; an actual
canvas intersection is checked against the new model's geometry. Contribution
return/replay and both full browser restarts retain the visible corrected pin,
body and images. A's fresh post-restart backup must exactly match B's pre-close
records/history and all four original model/image blobs.

One test-only native OPFS failure rejects publication-marker creation before the
file exists, after metadata persistence. The existing incomplete-Project list →
`編集で開く` → `更新を再試行` route must publish the same transaction, prepared
receipt and original change bytes after complete browser shutdown. This adds no
product fault controls or storage bypass. It is an injected publication failure,
not OS crash, power-loss, physical-device durability or all interruption phases.
Actual downloads are inspected with existing package readers. The single-user
case separately covers selecting a downloaded backup for the UI's verified-save
acknowledgment; do not transfer that UI acknowledgment to every model/team output.

The same model chain also interrupts an actual received Workspace update before
native creation of input.zip, after its closed input binding is durable. A wrong
valid Workspace is rejected in the mounted editor without changing those receipts.
After full shutdown, the catalog/edit entry exposes exact original-file reselection
and receive resumption, with the same job/input bytes and the eventual journal
publication. Existing local text and two images must survive. This is a received
file interruption, separate from the local replacement-publication fault above;
it is not OS-crash/power-loss evidence or every import interruption phase.

Continue that same Project into a second exchange: independent body edits create
a real field conflict, independent Scene inclusion creates duplicate Caption
membership, and both require explicit choices. Preserve the original and a Scene-
only copy; edit their names/bodies and the copy's attachment description separately,
return actual Contribution bytes and replay them. Both cold UIs verify both Scenes,
independent records/media and corrected pins. A's post-cold backup is compared with
B's final pre-close records/history and original four model/image blobs. This
connects bounded Desktop team operations in one chain; ordinary-entry, offline,
physical-iPhone and aggregate TEAM-FLOW-01/S3 acceptance remain separate.

The keep-both regression creates real duplicate model and Caption memberships
through independent Scene inclusion in two profiles and actual Contribution
reception. Existing confirmation forms name the affected Scene/resource, continuing
original, Scene-only independent copy and other-Scene references. They require an
explicit original; no generated copy name or extra wizard is introduced. Rendered
captures and computed styles check readable current choices.

A real Workspace then carries the split to the peer. Subsequent edits separately
change original/copy model placement, Caption text and attachment descriptions;
the copied Caption's numeric pin move retains its original model owner and leaves
the original pin unchanged. The existing model-recovery case separately protects
the required surface selection for incompatible pins. Downloaded packages check
fresh owned model/Caption/attachment IDs, original Scene references, shared exact
model/image bytes and complete original/contributed change bytes. Replay must
leave two independent records, without another copy. Both full browser restarts
check UI/text/images and model placement; A's post-restart backup exactly matches
B's pre-close records/history. This does not claim a fresh post-restart archive
from B, every copy-compatible format, offline startup or aggregate team adoption.

The shared initial-conversion case uses owned generated Native portable-v2,
frozen-v1 JSONL and LociMyu CSV ZIPs, each with admitted static GLB/PNG bytes.
It exercises content detection and confirmation/cancellation, then editing an
existing Caption, actual image decode, named download, selected-file verification,
full browser close/relaunch and a fresh backup. Format-specific Scene/resource/
attachment counts, placed and unplaced model owners, original geometry/photo bytes
and exact converted records/raw changes/heads/identity survive. Frozen duplicate image
attachments remain separate, and LociMyu requires an explicit title/re-evaluation
without an unrelated View/material relation decision. Scoped hidden semantics keep
unneeded creation/confirmation controls out of the current decision.

This is the recorded recipe/subset only, not every Native/v1/LociMyu format, later
appearance recipe or LociMyu XLSX/auxiliary-table path. Original input ZIPs and
private explanations are excluded from ordinary output; generated model/image
bytes remain. Cancellation is observed UI behavior here; its no-write invariant
has separate Node coverage. First output gets the actual UI verified-file
acknowledgment; the post-cold output is archive-inspected. It is not offline/PWA,
physical-device, ordinary-home or adoption evidence.

The narrow-screen regression uses the same admitted Native input generator with
100 owned Caption records, long Japanese titles and generated GLB/PNG bytes. At
100 records the existing ordinary DOM tab order applies; virtualization begins
above that boundary. It uses a 320×720 CSS-pixel viewport with DPR2 and no-hover
touch emulation, then 568×320 while a simulated composition/draft is retained.
Keyboard task navigation and list Tab navigation, visible focus, numeric-pin
cancellation, attachment description editing, image decode/modal/focus return,
actual selected-file save verification and full close/relaunch are connected.
Both backups compare decoded records, original change bytes, heads and identity;
original model/image bytes and the cancelled pin position must survive. Save/send
targets meet the existing 44 CSS-pixel criterion, and recorded phases check page
width. This is neither a 100-record capacity promise nor physical touch/native IME,
actual browser zoom, software-keyboard, offline/PWA or ordinary-route acceptance.

## One grouped device handoff

Run the existing candidate workflow and retain its artifacts:

```powershell
npm run test:e2e -- responsive-workflow.spec.ts --timings
```

Use that execution's report, `実行環境` attachment and local files together;
[todo](../tasks/todo.md) identifies the current reviewed run. Its result directory
contains `100-caption-native.zip`, the two actual saved ZIPs and rendered captures.
Record the source commit, build mode/entry, served asset SHA256 values and each
transferred file's exact path, byte length and SHA256. The input has the project
name `Nativeから引き継ぐ記録`, Scenes `観察`/`全体`, 100 records in `観察`, two model
resources (one hidden) and two image resources. The long final title starts `100：`.
Do not silently rebuild and call it the same tested candidate. Keep existing site
storage; never delete other projects, change namespaces or clear the user's profile
to obtain a passing result.

For a grouped session, record the actual device model, OS/browser version,
tab versus installed PWA, viewport/DPR, browser zoom, input/keyboard/IME,
site usage/quota, power/thermal conditions and unknown values. On the exact
candidate: open the input → reach long records by keyboard/touch → edit Japanese
text with the actual keyboard and edit/view an image → enter and cancel a numeric
pin move → save a named backup and select its actual saved file for verification
→ fully close and reopen → confirm the edits/images/pin and inspect a fresh backup.
Save screenshots, raw output files and hashes beside that session's receipt;
record actual browser 200% zoom separately from viewport resizing/DPR. Reuse the
existing two-profile team/file artifacts for the subsequent five-purpose and
interruption/recovery acceptance; this small input alone does not close those gates.

The current validation build has no Service Worker or PWA manifest. Its loopback
HTTP route is desktop-only; physical iPhone use needs a separately approved exact
build and trusted HTTPS route under specification 05. No external server, tunnel
or publication is authorized by this runbook. Offline startup remains pending for
an approved offline-capable candidate: establish its recorded cache/install state,
disconnect the network, then repeat initial/cold opening, edits, file output and
recovery with original-byte inspection. A dev-server visit or an already-open page
is not offline/PWA acceptance. Ordinary home activation retains the applicable
storage/device/adoption gates. Keep these unexecuted fields pending and continue
other authorized development without requesting per-control PO testing.

Browser cache, profiles, downloads, screenshots, optional traces, environment/build identity
and HTML/JSON reports stay under ignored `.artifacts/e2e/`. Each execution has a
separate `runs/<identifier>/` directory, so a later run retains earlier failures.
These artifacts contain synthetic test data only. Browser installation is reused.

The Desktop candidate's `desktop-loading.spec.ts` cold-reopens an owned Point +
textured-GLB Project with image decode deliberately held. It checks early Caption
search/reading, actual ready-Point pixels/camera, fenced changes/files, local spinner
and reduced motion, retained search/selection and identical backup history after
release. This is a presentation/fence check with an artificial delay, not a loading
speed benchmark. Run it through `playwright.desktop.config.ts`; todo owns results.

`tests/e2e/*.spec.ts` is separate from the Node Vitest `*.test.ts` suite. Continue
running the existing required checkpoint checks; passing E2E does not replace them.
Functional storage waits have generous bounded deadlines. Recorded whole-action
times include undifferentiated storage/validation/display/handoff work; they are
diagnostic observations, not performance acceptance or a product capacity promise.

This is desktop dedicated-Chromium evidence for the recorded validation build and
headless execution. It does not verify the broken Chrome plugin, physical iPhone,
offline/PWA, general ordinary-release activation, broader format support or aggregate adoption.
Current execution outcomes and next work belong in [todo](../tasks/todo.md).

Playwright references: [installation](https://playwright.dev/docs/intro),
[web server ownership](https://playwright.dev/docs/test-webserver),
[downloads](https://playwright.dev/docs/downloads).
