# G0 evidence records

This directory contains small schemas, pending templates and future summaries.
It contains no completed physical-device measurement yet.

- `schema/device-environment.schema.json`: privacy-safe device/environment
  identity for a repeatable test class.
- `schema/run-record.schema.json`: one fixture/build/environment measurement.
- `schema/external-artifact-manifest.schema.json`: hashes and restore metadata
  for large evidence kept outside Git.
- `templates/`: deliberately pending examples. Copy them when recording a run;
  do not overwrite the templates with results.

Use `null` for an unknown value. Never substitute zero, another device's value,
or a model specification found online for a value that was not measured on the
test device. There are no dedicated serial-number, hostname or account-ID
fields, but schemas cannot detect secrets or identifiers hidden in free-text
notes, URLs, locators or hardware strings. Review those fields before commit;
never store credentials in a URL or a local path containing an account name.

Large fixtures, traces, screenshots and videos stay outside Git. A manifest
entry is useful only when its locator/acquisition process and retention policy
make the bytes restorable; a SHA-256 alone is not a backup.

Run `npm run evidence:verify` after adding or editing evidence. A complete run
must resolve its environment and fixture ID/hash, and any referenced external
manifest must resolve to the same run.
