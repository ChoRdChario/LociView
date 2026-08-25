# LociMyu conversion and deferred-review contract

> Status: `APPROVED IDENTITY/SOURCE AUTHORITY / LOCAL RETENTION SPECIFICATION BLOCKED / NOT IMPLEMENTED`
> Approved: 2026-08-26
> Identity recipe: `locimyu-caption-id-2`

## 1. Scope and authority

This specification is the normative companion for converting one selected
LociMyu workbook plus the model, media and optional file-ID map found in its
outer ZIP into a new current LociView project. It closes the identity and
source-authority portions of `PROD-13` and `PROD-14`; it does not close their
local-retention or portable-review portions, and it is separate from LociView
v1-package to v2 migration.

For this conversion path only, this document supersedes the frozen
`02-data-format.md` statement that a Caption ID is derived from the legacy ID
alone. It does not change the canonical v1 ULID grammar or package grammar. It
adds only the closed historical-reader exception recorded in
`02-storage-package-migration.md`, and it does not rewrite an existing
`cap_LM...` Caption ID. Historical fixtures containing `cap_LM...` remain
evidence of the pre-recipe converter, not accepted output for a new conversion.

The approved delivery is split deliberately:

1. freeze and implement canonical Caption identity plus preservation of every
   duplicate occurrence, including the pure section-4.1 authority projection
   needed to choose `legacyGid` versus `sheetName` for identity only;
2. close the device-local wire, parser-admission and storage-capability contract;
3. reuse that same projection to implement source-authority activation decisions
   and the device-local deferred-review sidecar together, so rejected guesses
   have a durable review destination;
4. specify portable review/resolution exchange separately before any package
   includes private source or review evidence.

Completing step 1 alone does not claim complete `PROD-13` implementation.

## 2. Ordinary-user behavior

This is the completed-converter behavior. The identity-only first slice changes
Caption identity and duplicate preservation only; it does not claim or expose a
review backlog, and it does not change guessed relationship behavior before
steps 2 and 3 above pass. It does implement section 4.1 as a pure ID-planning
projection, without applying that projection to views/materials yet. During the
transition it uses the stricter preflight stop in section 4.3 rather than
silently dropping a row that needs the missing review destination.

- The user may choose one workbook when several candidate workbooks exist.
  That is a coarse source-authority choice. The importer MUST NOT ask the user
  to decide individual IDs, duplicate winners, guessed sheets or media matches.
- Every otherwise-valid non-empty Caption row becomes a distinct active
  Caption. Duplicate legacy IDs never select a winner and never fan one source
  row into another row's identity.
- A source-authoritative sheet or media relationship is applied automatically.
  An inferred, conflicting, missing or ambiguous relationship remains inactive
  or unlinked and produces a deferred-review item.
- The ordinary result reports imported counts and aggregate deferred-review
  counts. Raw IDs, hashes, source paths and internal storage terms are shown
  only in an explicit expert detail view.
- After the device-local gate passes, conversion blocks before project
  publication only when the bounded source and review evidence cannot be
  preserved, a deterministic identity collision is detected, the container
  cannot be read safely, or a verified write/publication invariant fails.

For the identity-only transition, default workbook selection is deterministic
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
affected view/material row remains backlog-only with its candidates; unrelated
sets and Captions continue.

Step 1 implements this exact order-independent projection only to choose each
Caption sheet's identity key. It does not change current view/material
activation. Step 3 MUST call the same projection result rather than copy or fork
its semantics when activation and backlog behavior are implemented.

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
become review items. Directory order, first/last entry, case folding, substring
and fuzzy/basename winner selection are forbidden. The Caption remains active
with an empty attachment list.

### 4.3 Caption-row disposition and identity-only transition

After the device-local gate passes:

- A completely empty trailing/soft-delete row may be ignored.
- A non-empty row with no usable legacy ID is retained only in source evidence
  plus a review item; it does not create a guessed Caption ID.
- A valid Caption with an invalid coordinate remains active without an anchor
  and receives a review item. Invalid optional color may use the documented UI
  default while retaining the raw source and a diagnosis.
- A duplicate legacy-ID occurrence creates its own Caption plus one review item
  that binds it to the duplicate group. No whole-import stop is required.

Until that gate passes, the identity-only slice performs one complete preflight
of all selected Caption sheets before the first workspace write. A completely
empty row may still be ignored. Any other row with a missing, invalid or
over-limit legacy ID, any invalid/over-limit selected sheet identity, a
non-unique fallback sheet name, a duplicate identity key, or a full/truncated
digest collision rejects the whole conversion with no partial project. This is
a temporary non-loss stop, not permission to discard the unread row. Once the
local source/review destination passes, the completed dispositions above replace
this temporary stop.

## 5. Device-local deferred-review direction

The Product Owner approved a private device-local stock as the first delivery
boundary: keep the exact outer source ZIP plus immutable review facts under a
fresh unpublished project, show ordinary users only an aggregate, and exclude
that private stock from ordinary package export. A later expert can inspect it;
review/share remains source-free. Adding it to collaboration or clean packages
requires a separate package/privacy contract.

That direction is **not yet an implementable storage or wire specification**.
The current `WorkspaceFS` cannot prove exclusive creation, a held single-writer
lock, quota reserve, sync/durability or no-clobber publication. The current
entry point also materializes the outer file before a LociMyu-specific bound,
and the XLSX parser does not retain an unambiguous physical-row locator. No code
may claim a durable/write-once local backlog from this section until a reviewed
amendment closes all of the following:

- exact pre-allocation ZIP, filename/path, XML/shared-string/relationship,
  workbook/sheet/row/cell/scalar, CSV and JSON/JSONL depth/node/string/byte/CPU
  budgets;
- one closed canonical issue-key/record union, duplicate-member rejection,
  candidate derivation and ordering, zero-item bytes, collision rules and
  receipt-to-inventory closure;
- exact source-entry/workbook/physical-row locators, selected-workbook digest,
  identity-plan digest and their binding to the exact outer-source digest;
- a code-owned storage-capability contract covering lock acquisition/loss,
  no-clobber writes, quota/free-space reserve, exact read-back, commit-then-throw,
  receipt-last/root-marker-last publication and interruption recovery;
- explicit export-start/export-complete disclosure, deletion ordering,
  absence verification and truthful partial-deletion reporting.

The intended namespace remains private `.local/locimyu-v1/**`; v1 operations,
assets and `lociview.json` never reference it, current export allowlists exclude
it, and crafted package entries never become device-local authority. These are
privacy/authority constraints on the future design, not authority to write the
sidecar now. The local-only bridge does not complete `PROD-01` or portable
`PROD-13`.

The identity-only slice may land and be integration-tested before this gate, but
it is not a release-complete reviewable conversion. It does not retain the outer
source ZIP or enough provenance to reconstruct later review evidence from the
project/package alone. If that transitional build is exposed to a user, the
import confirmation and completed full-export flow MUST plainly say that the
original outer ZIP must be kept and that a LociView export is not its backup.
No release may claim “what could not be read is available later” until the local
gate and its acceptance pass.

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
- `LM-ID-09`: until local retention passes, any user-reachable transitional
  flow carries the source-retention/export limitation in section 5.
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

The exact `LM-REV-*` acceptance set is specification-blocked by section 5 and
must be added in the same reviewed amendment as the local wire/capability
contract, before implementation.
