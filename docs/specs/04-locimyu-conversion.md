# LociMyu conversion identity, source authority and report contract

> Status: `PRODUCT-OWNER APPROVED / BOUNDED DIRECT ADAPTER IMPLEMENTED / REPRESENTATIVE RETRY`
> Approved: 2026-08-26
> Direct-adapter boundary approved: 2026-08-31
> Identity recipe: `locimyu-caption-id-2`

## 1. Scope and authority

This specification is the normative companion for converting one selected
LociMyu workbook plus the model, media and optional file-ID map found in its
outer ZIP directly into a new native LociView Project. It closes the identity,
source-authority, source-retention and conversion-accounting boundary for the
first adapter under `PROD-13` and `PROD-14`. It is separate from LociView
v1-package-to-native migration.

For this conversion path only, this document supersedes the frozen
`02-data-format.md` statement that a Caption ID is derived from the legacy ID
alone. It does not change the canonical v1 ULID grammar or package grammar. It
adds only the closed historical-reader exception recorded in
`02-storage-package-migration.md`, and it does not rewrite an existing
`cap_LM...` Caption ID. Historical fixtures containing `cap_LM...` remain
evidence of the pre-recipe converter, not accepted output for a new conversion.

The approved delivery is bounded deliberately:

1. reuse the implemented canonical Caption identity and preserve every
   duplicate occurrence;
2. preflight one selected workbook and the outer ZIP, applying only the exact
   one-to-one authority projections in section 4;
3. create a new native Project through the existing verified
   binary/media-write, snapshot-last and marker-last publication boundary;
4. emit an exportable conversion report. The outer ZIP remains separately
   retained by the user and is not copied into the Project.

The first adapter adds no device-local sidecar, quarantine/review database or
portable review continuity. Its native output is the working source of truth;
the separately retained ZIP plus report are the audit/reconversion inputs.

## 2. Ordinary-user behavior

This is the first direct-adapter behavior.

- The user may choose one workbook when several candidate workbooks exist.
  That is a coarse source-authority choice. The importer MUST NOT ask the user
  to decide individual IDs, duplicate winners, guessed sheets or media matches.
- Every otherwise-valid non-empty Caption row becomes a distinct active
  Caption. Duplicate legacy IDs never select a winner and never fan one source
  row into another row's identity.
- A source-authoritative sheet or media relationship is applied automatically.
  An inferred, conflicting, missing or ambiguous relationship remains inactive
  or unlinked and is recorded in the conversion report. The Caption itself
  remains active when its identity and content are otherwise valid.
- The ordinary result reports imported and reported counts. The exportable
  report records the source sheet, physical/logical row where available, source
  ID, affected field, reason and impact.
- Conversion blocks before Project publication when stable identity cannot be
  produced, a duplicate canonical key or full/truncated digest collision is
  detected, the selected source cannot be read safely, or a verified
  write/publication invariant fails. A report is still made available for a
  blocked preflight.

Default workbook selection is deterministic
and uses the same decoded snapshots that identity analysis uses. Candidates
recognized as LociMyu precede unrelated tables; candidates with at least one
admitted non-empty Caption precede recognized-but-empty candidates; then a
non-backup filename, greater admitted Caption count and original archive order
break ties, in that order. Reserved internal sheets and completely empty rows
never contribute to this count. A candidate-local source validation failure
(invalid/missing identity input, non-unique fallback sheet name or duplicate
canonical key) may be reported and skipped in favor of the next candidate.
WebCrypto/provider failure, invalid digest output, identity postcondition or
internal-invariant failure, and full/truncated digest collision abort planning;
they MUST NOT be downgraded to a bad workbook or bypassed by a generic table.

Archive/container warnings, current-workbook warnings and the current selection
notice are distinct UI state. Changing the selected workbook replaces the latter
two as a unit; a candidate-local validation failure leaves the prior selection
and any user-entered media links intact while reporting that candidate's
failure. A fatal provider, collision or invariant failure invalidates that
wizard plan: confirmation and further source selection stay disabled until the
user cancels and rebuilds the plan. The current
selection and current-workbook diagnostic group remain visible independently of
bounded archive/rejected-candidate diagnostics; bounded groups report the number
of additional items instead of silently hiding the whole group.

## 3. Canonical Caption identity

### 3.1 Identity key

`locimyu-caption-id-2` uses the following closed value:

```ts
interface LociMyuCaptionIdentityKeyV2 {
  legacyId: string;
  occurrence: number;
  sheetIdentity:
    | { kind: 'legacyGid'; value: string }
    | { kind: 'sheetName'; value: string };
}
```

Every use of “trim”, “trimmed” or “empty after trimming” in sections 3 and 4
means `LociMyuTrimV1` exactly; host-language or parser-specific whitespace rules
are forbidden. The fields are determined as follows:

- `legacyId` is the non-empty legacy ID after `LociMyuTrimV1`. That operation
  removes only the following code points, repeatedly, from both ends:
  `U+0009`–`U+000D`, `U+0020`, `U+00A0`, `U+1680`, `U+2000`–`U+200A`,
  `U+2028`, `U+2029`, `U+202F`, `U+205F`, `U+3000`, and `U+FEFF`. Interior
  code points are unchanged. The remaining Unicode scalar sequence is
  otherwise unchanged; NFC/NFD and case differences remain different.
- The decoded row sequence is the accepted decoder's encounter order: XLSX
  `<row>` element document order or CSV record order. It is not re-sorted by an
  XLSX physical-row attribute, and missing physical indices do not insert
  synthetic rows. The first decoded row is the header and is excluded.
- `occurrence` is the zero-based ordinal in that decoded data-row sequence among
  rows with the same trimmed `legacyId` in the same Caption sheet. Rows with
  another ID do not affect it. A completely empty row—every decoded cell is
  empty after `LociMyuTrimV1`—does not affect it. Every other row must pass the
  identity-only preflight in section 4.3 before any identity plan is accepted.
- `sheetIdentity.kind = legacyGid` only when section 4 admits one exact,
  conflict-free, one-to-one `__LM_SHEET_NAMES` mapping for that Caption sheet.
  `value` is its trimmed GID.
- Otherwise `kind = sheetName` and `value` is the exact trimmed worksheet name.
  A selected workbook with non-unique fallback Caption-sheet names is rejected
  before IDs or workspace writes because it cannot preserve distinct identity
  under this recipe. Ordinal or inferred GIDs never enter the identity key.

The key rejects an empty value, a lone surrogate, an occurrence outside
`0 <= occurrence <= Number.MAX_SAFE_INTEGER`, a legacy ID over 128 Unicode
scalars, or a sheet identity value over 256 Unicode scalars. A future semantic
change requires another recipe ID; it MUST NOT reinterpret this recipe.

### 3.2 Byte preimage and ID encoding

`LegacyJcsV1` means RFC 8785 JCS without Unicode normalization, as defined in
`02-storage-package-migration.md`. The exact preimage and digest are:

```text
preimage =
  ASCII("lociview:v1:locimyu-caption-id:2:jcs-v1\n")
  || LegacyJcsV1(identityKey)

fullDigest = SHA256(preimage)
```

The first 128 digest bits are interpreted as one unsigned big-endian integer
and encoded as exactly 26 uppercase Crockford Base32 characters using
`0123456789ABCDEFGHJKMNPQRSTVWXYZ`, including the two leading zero padding
bits. The portable ID is `cap_` plus those 26 characters and therefore matches
`^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$`.

This is a deterministic synthetic use of the v1 ULID-shaped entity-ID space.
Its leading 48 bits come from the digest, not from wall-clock creation time, and
MUST NOT be interpreted as a migrated creation timestamp. This conversion-only
exception supersedes the normal self-issued/time-sortable-ID description in the
frozen v1 document without changing the accepted ID grammar.

The implementation keeps the exact preimage and all 32 digest bytes while
planning. If two different preimages produce the same portable ID, or two
different preimages produce the same full digest, conversion aborts before any
workspace write. Salting, retrying with randomness and first/last-wins are
forbidden.

Golden vectors (the prefix includes one LF byte):

| Identity key | Full SHA-256 | Caption ID |
|---|---|---|
| `{"legacyId":"c_SYNTH_A","occurrence":0,"sheetIdentity":{"kind":"legacyGid","value":"0"}}` | `1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309` | `cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40` |
| `{"legacyId":"c_SYNTH_B","occurrence":0,"sheetIdentity":{"kind":"legacyGid","value":"617884617"}}` | `8b53b92ddf5babd667d6221b89f8336bc44c2ad204c8826c05904500180fc582` | `cap_4BAEWJVQTVNFB6FNH23E4ZGCVB` |
| `{"legacyId":"c_DUPLICATE","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"A"}}` | `c7e583e82099c732b7cbbcf191f8807a46cc86e3ce6e64cf20b09b35fdb7a12f` | `cap_67WP1YG84SRWSBFJXWY68ZH03T` |
| `{"legacyId":"c_DUPLICATE","occurrence":1,"sheetIdentity":{"kind":"sheetName","value":"A"}}` | `0c45adbf105b9ad551c6cdbe44931d193f51e8d93ac5db99f1450c6b23caeba2` | `cap_0C8PPVY42VKBAN3HPDQS29678S` |
| `{"legacyId":"c_DUPLICATE","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"B"}}` | `f88081b973a362541b0629581f218f00e2f04b12598de9966d524b744799080d` | `cap_7RG20VJWX3C9A1P1H9B0FJ33R0` |
| `{"legacyId":"c_合成","occurrence":0,"sheetIdentity":{"kind":"sheetName","value":"写真"}}` | `71c01b3b6f58926b2fe975262481405b34ab8d264b9fdfa1582884383d90d993` | `cap_3HR0DKPVTRJ9NJZTBN4RJ82G2V` |

### 3.3 Repeat conversion and transition

- The same decoded selected workbook and the same admitted authoritative sheet
  map produce the same Caption IDs in browser, worker and test runtimes.
- Reordering rows with other legacy IDs does not change an ID. Reordering two
  occurrences of the same legacy ID is inherently ambiguous: the recipe
  preserves all rows but does not claim that content-to-occurrence continuity
  can be inferred. A later-copy workflow must use its reviewed mapping baseline
  rather than silently treating row order as identity evidence.
- A v1 reader accepts exactly `^cap_LM[0-9A-HJKMNP-TV-Z]{24}$` for the
  `caption` kind as a historical LociMyu compatibility class. New converters
  and ID allocators never synthesize that class; updates/deletes may retain and
  reference an already-read historical Caption. Near-misses and use with any
  other entity kind remain invalid. No alias, rewrite or automatic merge with
  recipe-2 IDs is authorized here.

## 4. Source-authority rules

### 4.1 Sheet relationships

For `__LM_SHEET_NAMES`, the importer applies `LociMyuTrimV1` to the GID and
uses `LociMyuTrimV1(sheetTitle)`, or `LociMyuTrimV1(displayName)` only when the
former is empty. A completely empty map row is ignored and exact non-empty
duplicate pairs are deduplicated. Any other incomplete row taints its non-empty
GID or title; row order never repairs, overrides or selects it. A relationship
is authoritative only when all of these are true:

1. one distinct non-empty GID maps to one distinct non-empty title;
2. that title maps back to only that GID;
3. the title exactly and case-sensitively matches one Caption sheet;
4. no second Caption sheet has the same `LociMyuTrimV1` fallback name.

Only then may view/material rows bearing that GID be applied to the matched set.
Conflicting map rows, an absent mapping, a non-unique title, ordinal position,
GID first-seen order and the first available set are non-authoritative. Each
affected view/material row remains inactive and is recorded in the conversion
report with its candidates; unrelated sets and Captions continue.

The direct adapter MUST reuse this exact order-independent projection both for
Caption-sheet identity and for view/material activation. It MUST NOT consume the
legacy importer's ordinal or first-available guessed mapping.

### 4.2 Media relationships

The optional file-ID map is source-authoritative for one Caption attachment
only when one `LociMyuTrimV1` file ID maps to one distinct
`LociMyuTrimV1` filename, that filename maps back to only that file ID, and the
filename exactly and case-sensitively matches one recognized media-entry
basename after `LociMyuTrimV1` in the selected outer ZIP. A completely empty map
row is ignored and exact non-empty duplicate pairs are deduplicated. Any other
incomplete row taints its non-empty file ID or filename; row order never repairs,
overrides or selects it.

Zero matches, multiple map values, multiple file IDs for one filename, or
multiple archive entries with the same mapped basename remain unlinked and
are recorded in the conversion report. Directory order, first/last entry, case
folding, substring and fuzzy/basename winner selection are forbidden. The
Caption remains active with an empty attachment list.

### 4.3 Caption-row disposition

- A completely empty trailing/soft-delete row may be ignored.
- A non-empty otherwise-valid row with no usable stable legacy ID does not
  create a guessed Caption ID. It blocks the whole conversion before Project
  publication and is recorded in the report.
- A valid Caption with an invalid coordinate remains active without an anchor
  and receives a report entry. Invalid optional color may use the documented UI
  default while the report records the affected field and impact.
- Every duplicate legacy-ID occurrence creates its own Caption and is accounted
  for. No winner is selected and no occurrence is merged.
- A duplicate canonical identity key, invalid or over-limit selected sheet
  identity, non-unique fallback sheet name, or full/truncated digest collision
  rejects the whole conversion before any Project write. The report records the
  blocking item; this is not permission to discard it.

### 4.4 Initial model and coordinate owner

The first direct adapter admits exactly one supported model entry. Its local
frame is the LociMyu dataset's model/Caption frame and is declared as the native
Project frame with an identity Asset binding; this is the source adapter's frame
definition, not inferred registration between independent models. That Asset
owns valid source Caption positions and is the only material target.

Zero supported models or multiple candidate models block publication rather
than choosing one or placing unrelated models at guessed identity transforms.
Every candidate is listed in the report. Images remain Caption media and never
become visual Assets.

## 5. Source retention and conversion-report boundary

The user retains the exact outer source ZIP separately. The converter reads it
without changing, moving or overwriting it and does not embed or copy the ZIP
into the native Project. Model and source-authoritative image bytes admitted by
the conversion become ordinary native Representation or media content; they are
not a second LociMyu source authority.

The report is a separate exportable JSON document. It accounts for converted,
inactive/unlinked and blocking source information, but it is not a sidecar,
quarantine database or review subsystem. No `.local/locimyu-v1/**` namespace,
generic issue store or portable review continuity is added by this adapter.
`.lociview` backup contains the working native Project and its admitted bytes;
it does not contain the outer ZIP or the report.

Before conversion the UI MUST tell the user to retain the original ZIP. After a
successful or blocked preflight it MUST offer the report and state that the ZIP
plus report are required for audit or reconversion. The product MUST NOT claim
that unconverted source data can be recovered from the native Project alone.

## 6. Acceptance

### Identity slice

- `LM-ID-01`: all six golden vectors reproduce in browser and Node.
- `LM-ID-02`: exact repeat analysis is byte-stable; unrelated row reorder does
  not rotate IDs.
- `LM-ID-03`: the same legacy ID across sheets, within one sheet and in
  byte-identical duplicate rows yields one distinct canonical ID per occurrence.
- `LM-ID-04`: injected truncated/full collision aborts before a workspace write.
- `LM-ID-05`: apply, reopen, full export and re-import preserve Caption count,
  IDs and set membership.
- `LM-ID-06`: checked-in historical `cap_LM` Caption fixtures remain readable
  without rewrite/alias and the new converter never issues that class. Exact
  hardened-reader near-miss/kind rejection is owned by `STO-MIG-20`, not this
  identity-only production slice.
- `LM-ID-07`: the exact trim boundary is exercised; interior trim code points
  remain, and NFC/NFD-distinct scalar sequences produce distinct preimages/IDs.
- `LM-ID-08`: every invalid non-empty-row/key and collision case rejects the
  complete identity-only conversion before any workspace write, while a
  completely empty decoded row is ignored.
- `LM-ID-09`: every user-reachable direct-conversion flow carries the
  source-retention/export limitation in section 5.
- `LM-ID-10`: raw XLSX fixtures carry exact duplicate, incomplete, GID-to-title
  conflict, reverse title-to-GID conflict and permuted sheet-map rows through
  section 4.1 to the expected `legacyGid`/`sheetName` key and final Caption ID.
  A raw CSV fixture fixes fallback-name trimming and occurrence order;
  non-unique fallback names reject before any workspace write. A file-ID CSV is
  section-4.2 input only and never supplies Caption sheet identity.

### Source authority

- `LM-AUTH-01`: every exact/conflicting/missing sheet-map, incomplete/duplicate
  map row, zero/one/many media entry and reverse filename-to-file-ID conflict
  produces the section-4 outcome with no row-order, ordinal, first-set,
  first-file or fuzzy winner.
- `LM-AUTH-02`: multiple workbook candidates use the transition ordering above;
  only typed candidate-local source validation may fall through to an alternate.
  Provider/internal/collision failures remain fatal, and a successful or failed
  manual switch leaves diagnostics, selected preview and manual media links
  consistent with the current workbook.

### Initial LociMyu ZIP -> native adapter

- `LM-ADAPT-01`: the outer ZIP is unchanged and is neither embedded nor copied
  into the Project. A new Project becomes active only after the existing
  verified-write, snapshot-last and marker-last publication sequence.
- `LM-ADAPT-02`: every non-empty Caption row is reconciled. Exact
  source-authoritative relations activate; ambiguous or invalid relations
  remain inactive/unlinked and are reported; an invalid coordinate produces an
  active unplaced Caption.
- `LM-ADAPT-03`: missing stable Caption identity, a duplicate canonical key or
  full/truncated digest collision aborts all Project publication. The blocking
  item remains in an exportable report.
- `LM-ADAPT-04`: successful and blocked preflights produce complete
  accounting with source sheet, physical/logical row where available, source
  ID, affected field, reason, impact and final disposition.
- `LM-ADAPT-05`: snapshot and `.lociview` contain no source ZIP, report,
  sidecar or review database. The UI discloses that the original ZIP and report
  must be retained separately.
- `LM-ADAPT-06`: converted native state survives save/offline reopen and
  `.lociview` export, local deletion, restore and offline reopen; the native
  Project is the working source of truth.
- `LM-ADAPT-07`: one representative direct-LociMyu source proves reconciled
  counts and canonical IDs for DisplaySets, Captions, source-authoritative
  materials/views/media, unplaced and unlinked outcomes, unchanged admitted
  bytes and complete report accounting. The source ZIP hash is equal before and
  after conversion.
