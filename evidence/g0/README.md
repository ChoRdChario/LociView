# G0 evidence records

This directory contains small schemas, pending templates and future summaries.
It contains no completed physical-device measurement yet.

[`pre-fix-reproduction-ledger.md`](pre-fix-reproduction-ledger.md) maps the
known G0-S defect families to exact unfixed/test revisions and saved ordinary-
failure reruns. It is partial because one caption-attachment boundary has no
compatible pre-fix characterization; it therefore does not claim G0 exit.

`npm run evidence:verify` returning success proves only that the templates and
records currently present are structurally and cross-referentially valid. A
pending-only repository is expected to pass that command; verifier success is
not G0 completion and cannot replace the exit evidence in
`docs/specs/03-gates-and-delivery.md`.

- `schema/device-environment.schema.json`: privacy-safe device/environment
  identity for a repeatable test class.
- `schema/run-record.schema.json`: one fixture/build/environment measurement.
- `schema/external-artifact-manifest.schema.json`: hashes and restore metadata
  for large evidence kept outside Git.
- `templates/`: deliberately pending examples. Keep this directory unchanged.
  Copy environment, run and artifact-manifest records into `devices/`, `runs/`
  and `manifests/`, respectively; create those directories when first needed.

Use the field's `null` or schema-defined `unknown` representation for an
unavailable fact. Never substitute zero, another device's value or a model
specification found online for a value that was not measured on the test
device. There are no dedicated serial-number, hostname or account-ID fields,
but schemas cannot detect secrets or identifiers hidden in free-text notes,
URLs, locators or hardware strings. Review those fields before commit; never
store credentials in a URL or a local path containing an account name.

A measured iPhone 14 Pro environment may keep RAM, GPU, free-storage, charge
and low-power-mode facts `null`, and power source or thermal condition
`unknown`, when the device does not expose them. Its identity/version, launch
mode, viewport, DPR and drawing buffer remain mandatory, and measured Windows
records retain their non-null resource requirements. The schema represents an
unavailable fact; it cannot prove that the operator attempted to observe it.
That remains an evidence-review responsibility.

Large fixtures, large traces, screenshots and videos stay outside Git. A manifest
entry is useful only when its locator/acquisition process and retention policy
make the bytes restorable; a SHA-256 alone is not a backup.

Run `npm run evidence:verify` after adding or editing evidence. The command
applies the bundled Draft 2020-12 schemas to every template and record before
it performs identity, privacy and cross-record checks. It also bounds JSON
input size and count; large fixture and trace bytes are hashed as streams.

`build.deliveryMode` is explicit. Pending templates use `null`; measured runs
use `local` or `deployed`. A complete local run keeps `workflowRunId` and
`deployUrl` null, while a complete deployed run supplies both. Both modes keep
the served `index.html` and service-worker digests. These two served-file
digests currently have no byte locator in the schema, so the verifier checks
their required shape but the reviewer must still compare them with the served
deployment.

A `g0-device-run-2` complete run separates the application build from its
measurement inputs. `build.gitCommit` identifies the application that actually
ran and supplies its `package-lock.json`. `evidenceSource.gitCommit` supplies
`fixtures/registry.json`, Git-tier fixture and trace bytes, Git license text and
semantic specification/oracle bindings; `fixtureRegistrySha256` independently
records the exact registry blob digest. Both commits must be ancestors of the
evidence checkout's `HEAD`, but they need not be the same. This permits an
honest run of a deployed build that predates the later G0 corpus without
retroactively claiming that the corpus shipped in that build.

The verifier reads the registry from the evidence-source commit with bounded,
duplicate-member-safe parsing and the trusted registry-v2 schema. Those inputs
therefore cannot be replaced by current-worktree metadata. Each Git blob is
limited to 64 MiB, and one verification run may hash at most 8 GiB of unique
local source bytes. Generated fixtures must be byte-reproducible regular non-link files
under `.artifacts/fixtures/`. A generated trace cannot complete a run until a
durable trace-recipe contract exists; use a Git trace or a same-run external
manifest instead. External bytes must resolve by locator, kind, digest and size
in the same run's recorded artifact manifest. The verifier never executes
restore instructions or fetches remote content.

Fixture registry v2 represents a public external fixture with the exact
fixture-only GitHub Release URL at `storage.transport.locator`; it does not use
a repository `path` for external bytes. Registry validation also requires the
versioned/no-overwrite retention declaration, approved entry-specific license
and attribution record, external restore provenance and an explicit warning
that acquisition verification remains pending. Matching that metadata to a run
manifest is intentionally offline and does not prove that the remote bytes are
available or hash correctly. A separate, explicit acquisition verifier must
stream and hash the Release asset before the fixture is adopted or earns G0
credit. The evidence command therefore reports the number of unique external
fixture transports as pending separate acquisition verification even when all
metadata cross-references are valid.
