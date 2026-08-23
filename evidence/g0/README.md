# G0 evidence records

This directory contains small schemas, pending templates and future summaries.
It contains no completed physical-device measurement yet.

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

Use `null` for an unknown value. Never substitute zero, another device's value,
or a model specification found online for a value that was not measured on the
test device. There are no dedicated serial-number, hostname or account-ID
fields, but schemas cannot detect secrets or identifiers hidden in free-text
notes, URLs, locators or hardware strings. Review those fields before commit;
never store credentials in a URL or a local path containing an account name.

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

A complete run resolves its environment and all fixture metadata. Git-tier
fixture and trace bytes, plus `package-lock.json`, are read from the recorded
build commit rather than trusted from the current checkout; that commit must be
an ancestor of the evidence checkout's `HEAD`. Each Git blob is limited to
64 MiB, and one verification run may hash at most 8 GiB of unique local source
bytes. Generated fixtures must be byte-reproducible regular non-link files
under `.artifacts/fixtures/`. A generated trace cannot complete a run until a
durable trace-recipe contract exists; use a Git trace or a same-run external
manifest instead. External bytes
must resolve by locator, kind, digest and size in the same run's recorded
artifact manifest. The verifier never executes restore instructions or fetches
remote content.
