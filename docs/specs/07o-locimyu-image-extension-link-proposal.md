# LociMyu unique extension-only image relationship companion

Status: **APPROVED by PO2026-11-02; bounded implementation/focused and actual
Ki84 convert/edit/backup/restore/cold and final required Windows checks complete.
Git/actual new Linux CI delivery remains pending. No aggregate adoption or release credit.**
PO explicitly selected this07o proposal, including separate new conversion and
preservation of the already edited Project. No additional per-helper approval is
required within these boundaries.
This adds one explicitly bounded exception to [04 §4.2](04-locimyu-conversion.md#42-media-relationships)
for new [07c](07c-locimyu-project-scene-conversion-proposal.md) conversions.
The existing exact-filename rule and recipes1–6 remain unchanged for their receipts.

## Outcome and frozen identity boundary

Resolve a source-authoritative file-ID map name that omits only the image extension,
without guessing from a Caption title or choosing among competing files. The
old registry through `locimyu-project-scene-migration-recipe-6` remains frozen;
`locimyu-project-scene-migration-recipe-7` is registered for this approved new rule. Do not
reinterpret any prior recipe or `locimyu-caption-id-2`.

Recipe7 retains current model/material/Caption mapping and validation semantics;
its new migration identity namespace records this different relationship rule.
Use it only for a newly confirmed conversion that actually uses this exception.
Ordinary exact-only conversions keep their current recipe selection. Opening,
restoring or exporting an existing Project never relinks its attachments or
upgrades its receipt. The original ZIP, file map and previous receipts are immutable.
Reconversion creates a **separate Project** and preserves the current Project;
existing edits, including material adjustments, are not migrated automatically.
It does not repair already edited Projects in place. Backfilling one would need a
separate current-Project/original-SHA/receipt/Caption-mapping contract and explicit
authorization; no automatic history rewrite or overwrite is proposed here.

## Exact relationship rule

1. Apply existing `LociMyuTrimV1`, nonempty map-pair deduplication, bijective
   file-ID/name checks and incomplete-row taint checks first, without repair.
2. Try the current exact, case-sensitive full basename match first. Its success,
   ambiguity and normal image admission retain their current behavior.
3. Only when that exact candidate set is empty may a mapped filename with **no
   ASCII dot** use the exception. Names containing a dot remain exact-only in
   this initial narrow companion; never strip or rewrite a supplied extension.
4. Enumerate **all** archive entries recognized as images by the existing import
   inventory, including unsupported formats and byte-recognized files with an
   unknown filename extension. Remove only the final nonempty dot-suffix from
   each trimmed basename and compare the entire stem
   exactly and case-sensitively with the mapped name. Duplicate basenames in
   different directories count as different candidates. Do not search Caption
   titles, remove underscores, normalize case, repair IDs or choose by row order.
5. Exactly one candidate is required before checking whether its format is
   supported. A JPEG plus HEIC/AVIF/BMP or another recognized image with the same
   stem is ambiguous; do not filter unsupported candidates to manufacture uniqueness.
   Zero/multiple candidates remain unlinked and reportable. In particular,
   `photo.jpg` plus `photo.bin` containing JPEG bytes is ambiguous. Only after
   counting may the sole candidate's suffix be required to be `jpg`, `jpeg`,
   `png`, `gif`, `webp`, `bmp`, `avif`, `heic`, `heif` or `heix`, case-insensitively.
   An unknown-extension sole candidate remains unlinked and reportable under this
   narrow exception; existing exact-match behavior is unchanged.
6. Before adopting a fallback, check reverse uniqueness/taint for the candidate's
   full basename and all map-name aliases with that exact stem (bare stem or any
   final nonempty dot-suffix). Another file ID or an incomplete row naming any
   such alias refuses this new fallback; it never changes a current exact match.
   For example, map A→`photo`, B→`photo.jpg` with ZIP `photo.jpg` must not attach
   A to B's file. An incomplete row with filename `photo.jpg` also blocks A's
   fallback. Do not repair aliases by row order or archive absence.
7. Run every current byte, MIME, dimension, resource, decode and content check on
   the sole candidate. Unsupported or invalid bytes do not fall back to another
   file. Keep all source/closure, write/readback and receipt checks unchanged.

The separate bounded conversion report must identify the rule, source file ID,
mapped filename and selected exact archive path using its existing item-named
issue/candidate reporting. Do not claim the map originally supplied an extension.
Preserve source fingerprints and account for every remaining unlinked reference.

### Conditional rejection diagnostics

A unique extension-only candidate can fail the unchanged normal image admission.
Buffer that refusal during planning; do not call it ambiguous or attach another
file. If at least one other fallback is actually admitted and the plan selects
recipe7, replace only that reference's generic unlinked warning with the actual
normal-admission reason and the existing bounded candidate fields: rule, source
file ID, mapped filename and exact archive path. Keep its Caption source ID, row,
warning severity and source-retention impact; emit one warning per reference.
The report does not certify image admission or repair the source.

If no fallback is admitted, discard the buffered detail and retain the exact old
recipe1–6 plan/report, including invalid-, unsupported- and ambiguous-only inputs.
Catalog/stream errors, cancellation and unknown errors still propagate; only the
existing classified normal image refusal is reportable. Do not change JPEG or
other byte/structure/decoder/resource checks, limits or recovery boundaries.

## Concrete implementation ports and replay

Keep the existing source→mapping→prepared conversion composition and exact import
boundaries; add no UI storage or generic repair port.

- `planLociMyuSource` is the fresh-conversion planner. Its private body may use
  the approved fallback, but selects recipe7 only after at least one fallback
  actually passes normal image validation and becomes an attachment. Merely
  finding a candidate or an excluded HEIC never selects recipe7.
- Add a closed-recipe replay entry `planLociMyuSourceForRecipe` around that same
  private body. Recipes1–6 select exact-only planning; recipe7 selects this rule
  and must reconstruct an actual recipe7 plan. Validate the recipe discriminator
  at runtime. `verifyRetained` calls this entry only after its existing complete
  receipt validation, using the validated receipt recipe, not a frontend flag.
  Keep every subsequent source/records/report/ID comparison and fresh check.
- Register recipe7 in the existing closed conversion-receipt/initial-origin
  validators and mapping namespace. Its source-key/material-target support uses
  the latest existing recipe6 semantics, including unchanged normalization and
  source-only accounting; no new material interpretation. Keep every recipe1–6
  condition/output unchanged. The receipt/report formats and versions remain;
  record new relationships through their existing bounded item-named issues.
- Keep source/report fingerprints and original stream equality checks, pending
  preparation, lease, readback, CAS and Session creation/recovery unchanged.
  New confirmation owns a new conversionId/ProjectId and never writes the old
  Project. A previously registered recipe6 Project with the same ZIP digest must
  not redirect the recipe7 confirmation to that old Project. Existing same-
  conversion duplicate/recovery behavior remains; inspect the actual catalog
  lookup before adding any exception, and test both identities remain intact.

Independently review these exact ports/receipt selections before source edits;
the PO decision already covers their ordinary bounded implementation.

## Limits and acceptance

Private Ki84 inspection finds20 extension-only references to17 distinct bodies;
if every normal image check passes, the candidate becomes43 media/47 attachments
instead of26/27. These counts are a hypothesis, not an executed conversion PASS.
One underscore mismatch and one mistyped ID remain unlinked for explicit manual
review. Fifteen HEIC references retain the current exclusion; this proposal does
not enable Windows HEIC decoding or infer that a separately exported JPEG has the
same Drive ID. Native image admission remains a separate environment/policy gate.

The actual Ki84 conversion admits42 media/46 attachments with19 fallback
references and18 unlinked references. One sole JPEG candidate is refused by the
existing complete-codestream check: a final restart marker is followed directly
by EOI without an entropy-coded segment. Browser decoding alone does not override
that check. Keep this original unchanged; the18 include15 HEIC, two ID/name source
errors and this JPEG refusal. The43/47 prediction above was conditional on every
normal admission passing. The actual file/independent restore/cold chain completes
with42/46; all43 model/image payloads remain byte-exact. The final inline18-entry
explanation is display-only and preserves the preceding report bytes.

Acceptance also covers a mixed valid/invalid fallback report with the exact
refusal reason, file ID and path; retained recipe7 reconstructs it identically.
Existing zero-valid fallback fixtures must still compare equal to exact-only
plans/reports and create/reopen their unchanged old recipe.

Before implementation, review the exact source/identity/report changes. Acceptance
must cover uniqueness across supported/unsupported formats, tainted/non-bijective
maps (including both candidate-alias counterexamples above), case/directory/dot
differences, unchanged old recipes, complete original/data
oracles and actual image display in a new conversion. Preserve original assertions
and all conversion/recovery fences; no fuzzy matcher or general repair subsystem.

The complete legacy ZIP is retained locally as conversion source but is excluded
from ordinary backup/Workspace/Contribution/Review/Clean exports by07c. Users must
save the original ZIP and separate conversion report themselves for audit or
reconversion. A converted backup does not contain every unattached source image.
