# LociMyu initial ProjectScene conversion companion

Status: **PROPOSED — no durable implementation or recipe approval.**
This companion fixes the new target identity/admission boundary required by
[05 §9.2](05-project-scene-team-workflow.md#92-locimyu). It preserves the accepted
source semantics in [04](04-locimyu-conversion.md) and the one-time cutover in
[07](07-project-scene-migration.md). It does not change the existing Native
receiver, `locimyu-caption-id-2`, v1 recipes, Projects or prepared jobs.
Current work and evidence remain in [todo](../../tasks/todo.md).

## Decision and connected outcome

Proposed immutable recipe: `locimyu-project-scene-migration-recipe-1`.
One LociMyu outer ZIP → content inspection/workbook selection → conversion
effects and any existing all-or-nothing relation confirmation → new Project with
Scenes, Caption/media and Saved Views → edit/first placement → named backup,
Workspace/independent review and cold reopen. Share the converted Workspace for
subsequent teamwork; independent conversions do not acquire a common lineage.

The first subset admits exactly one self-contained static GLB model under the
existing `development-validation-glb-1` profile and source-authoritatively linked
PNG images. Other model formats, linked JPEG/WebP/GIF and active material
adjustments remain required later work. An otherwise authoritative active value
outside this subset refuses the whole conversion before publication; it must not
be silently converted into report-only data. This differs from a relationship
that was already nonauthoritative under 04 and remains reported/inactive.
No new renderer profile, schema, dependency, ordinary-entry activation, numeric
guarantee, device/offline adoption or release is proposed.

## Source authority and admission

- Own the selected outer ZIP bytes before preparation. Apply the existing safe
  ZIP/XLSX/CSV and metadata budgets, collision/path checks and byte inspectors.
  Do not fetch URLs or Drive content, run workbook formulas or use external
  workbook relationships. Recognize LociMyu content, not an arbitrary spreadsheet.
- Reuse 04's deterministic candidate ordering and coarse workbook selection.
  Bind the selected validated archive path, exact workbook bytes/length/digest,
  tables and diagnostics to this preparation. Changing a selection invalidates
  the prior prepared output and relation confirmation together. Typed candidate
  source failures may fall through as in 04; provider/internal/collision failure
  aborts the plan, without another source or ID fallback.
- Reuse `locimyu-caption-id-2` exactly, including LociMyuTrimV1, identity source,
  decoded row encounter order for duplicate occurrences, missing-ID row reporting and full/short
  collision checks. Preserve its original key, exact preimage/full digest and
  uppercase portable Caption ID privately. Never use that ID as a v2 wire ID.
- Read exact sheet authority with `projectLociMyuCaptionSheetIdentities()`. Use
  `planLociMyuDisplaySetRelationConfirmation()` only for its already-approved
  complete, two-table-corroborated activation proposal. Confirmation is scoped
  to exact selected-workbook bytes/path and the entire ordered proposal. It
  changes activation only, never Caption identity. No inferred GID/ordinal or
  mutable `gidToSetName` map becomes authority.
- Resolve media from all raw `fileIdMapRows`, preserving duplicate/incomplete/
  conflicting rows and 04's exact case-sensitive one-to-one constraints. Do not
  use the lossy `fileIdMap` projection, basename proximity or a first winner.
  An unresolved/ambiguous or HEIC/HEIF relationship keeps its Caption active,
  unattached and explicitly reported as already specified in 04. A valid exact
  relationship to JPEG/WebP/GIF is unsupported by this first target subset and
  blocks this conversion; it is not relabelled as unresolved.
- Exactly one candidate model is required. Do not pick one among several or
  ignore an unsupported second candidate. Inspect its exact GLB bytes under the
  current profile/hash and retain them unchanged. Do not call a writable Native
  converter, export a temporary Native package or use its repaired/random-ID DTO
  as the source of authority.
- Inspect/count every workbook sheet/row and outer entry. Retain raw source
  bytes, selected and unselected candidate evidence, source timestamps/Drive IDs,
  inactive relations and unlinked payload dispositions. Unknown/unmapped source
  fields are named in the report, never made into active target authority.
  Target validation failure or an unaccounted source entry blocks publication.
  Do not truncate text, normalize distinct Unicode strings or invent positions.

## Mapping

Use map-2/schema 2.1 and the existing exact GLB-1 reference at specification SHA-256
`077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f`.
The following mapping supplements 04's source rules; it does not amend them.

| Source | Target |
|---|---|
| Project title | Explicit title captured at conversion confirmation. The suggested title is the selected ZIP filename with its final extension removed; no hidden cleaning/truncation. Require ordinary target title validation. Bind the confirmed title in the receipt and exact initial source bytes/digest, alongside MetadataProof. |
| One model | One logical visual Asset/revision/binding/mesh family/anchor class and GLB Representation. Its validated archive basename is the exact label. Project/Asset/Representation frames are right-handed, +Y up, unit unknown, identity transforms: this is the accepted LociMyu dataset frame, not inferred model alignment. Set `pinScale:1`, LociMyu's established initial default. Preserve original GLB material catalog/semantics; no occurrence reinterpretation or new override capability. |
| Caption sheet | One Scene per admitted sheet, exact LociMyuTrimV1 name. Scene order follows admitted Caption-sheet order in the selected workbook, excluding reserved/internal tables. First Scene initializes defaultSceneId; unknown meta/Google state does not select another. Model belongs to every Scene. |
| Caption | Preserve source title/body after the existing LociMyuTrimV1 cell rule. Valid six-digit source color becomes its integer sRGB channels/255; absent/invalid optional color uses exactly `#eab308`, with invalid values reported. One separate resource per source identity/duplicate occurrence, with membership only in that sheet. Scene order follows admitted nonempty-ID rows; no timestamp sorting or invented legacy history. No source Tag field means no target Tags. |
| Position | A valid finite source coordinate maps directly to the one model's Asset/frame/revision/class tuple with manual hit evidence. Invalid/incomplete position follows 04: preserve this same active Caption with `{kind:'unplaced',ownerAssetId}` and an issue. First placement later retains its ID/content/media. |
| PNG media | One MediaResource per distinct validated archive path reached by an exact attachment relationship. Equal-byte distinct source entries stay separate resources even if CAS shares bytes. Exact bytes/digest/length and archive basename label; one attachment for each admitted Caption's exact imageFileId occurrence, index zero. Unlinked payloads stay source-only with report/accounting. |
| Saved View | Evaluate every nonempty __LM_VIEWS row under 04: source ID and owning GID must be exact/confirmed, basis finite/nondegenerate, type and FOV valid. Source-invalid/unresolved rows remain explicitly report-only under that existing rule. Map accepted eye/target/up exactly, perspective FOV via `fov * (Math.PI / 180)` as in the current receiver, solid six-digit source background or the existing `#101010` default (report invalid nonempty color). View order is admitted decoded row encounter order within its Scene. Duplicate source View IDs do not collapse decoded rows. |
| Orthographic View | Reuse 04's approved compatibility approximation with the current evaluation order: `radians = fovDegrees * (Math.PI / 180)`; `distance = Math.hypot(eye[0]-target[0],eye[1]-target[1],eye[2]-target[2])`; `verticalSpan = 2 * distance * Math.tan(radians / 2)`. Empty FOV uses exactly 45; all-empty up uses `[0,1,0]`; partial/nonfinite values are invalid. Require finite positive span. Report the chosen FOV/defaults/span and approximate status; do not describe span as source-exact. This is not a new approximation policy. |
| View name/default | Exact trimmed name, except the existing reserved `__last` becomes `前回の視点`. Reject otherwise active names that cannot satisfy target validation, without a fabricated replacement. Exactly one active View in a Scene becomes its default; zero/multiple means omit defaultViewId and report ambiguity for multiple, preserving all Views. Do not persist null or choose a latest-row winner. |
| Materials | Any otherwise source-authoritative, active material adjustment is outside this first subset and blocks publication, including adjustments in noncurrent Scenes. Already unresolved/inactive rows stay reported under 04. Exact material-name fan-out, opacity/chroma and all other broader material requirements remain for a later concrete companion; do not treat a multiple-slot exact name as ambiguous to evade them. |

## Closed identity grammar

At confirmation allocate a fresh 32-lowercase-hex conversionId once; Project ID
is `prj_` + conversionId. Capture fresh historyEpoch/lineageSeed and exact initial
changes once. A separate conversion remains independent even for identical ZIPs.

The UTF-8 preimage, without BOM/final LF, is:

```text
ASCII("lociview:locimyu-project-scene-migration-recipe-1:id:jcs-v1\n")
|| JSON.stringify([conversionId, sourceZipSha256, workbookPath, prefix, sourceKey])
```

Here `\n` is one LF. sourceZipSha256 is 64 lowercase hex; workbookPath and all
payload paths are exact validated case-sensitive archive paths from the safe
reader, with collisions after its path canonicalization rejected. No NFC/case
normalization is added. Strings must be valid Unicode scalars; indices are
nonnegative safe integers. Arrays have exactly the closed shapes below.

Define `S = [sheetIdentity.kind,sheetIdentity.value]`, exactly from the approved
source identity projection, and `C = [sourceCaptionId,fullSourceDigestHex]`, from
`locimyu-caption-id-2`. Verify C against the full original key/preimage, never
accept it as a caller-supplied identity. `R` is the one-based decoded row encounter
ordinal, with the header at 1. It is unrelated to XLSX `<row r>` attributes:
gaps/duplicate attributes never create synthetic rows or substitute IDs. CSV uses
the same decoded encounter rule. Every key also binds workbookPath in the preimage.

| Prefix/output | sourceKey |
|---|---|
| frm / Project frame | `['project-frame']` |
| ast / model Asset | `['model',modelPath]` |
| frm / Asset frame | `['asset-frame',modelPath]` |
| rep / Representation | `['model-representation',modelPath]` |
| frm / Representation frame | `['representation-frame',modelPath]` |
| rev / revision | `['model-revision',modelPath]` |
| bnd / binding | `['model-binding',modelPath]` |
| fam / mesh family | `['mesh-family',modelPath]` |
| cmp / anchor class | `['anchor-class',modelPath]` |
| lay / material layout | `['material-layout',modelPath]` |
| slot / material slot | `['material-slot',modelPath,'gltfMaterial',materialIndex]` or `['material-slot',modelPath,'representationMaterial',0]` |
| scn / Scene | `['sheet',S]` |
| sam / model membership | `['scene-asset',S,modelPath]` |
| cap / Caption | `['caption',C]` |
| scm / Caption membership | `['scene-caption',S,C]` |
| med / MediaResource | `['media',imagePath]` |
| att / attachment | `['attachment',C,0,imagePath]` |
| view / Saved View | `['view','__LM_VIEWS',R]` |
| evt / initial lifecycle | `['initial-event',outputPrefix,sourceKeyOfThatRecord]`, only for ast/scn/sam/cap/scm/att/view, without recursive events |

Target ID is `prefix + '_' + sha256(preimage).slice(0,32)`. Retain full preimage,
digest, original source identity and mapping. Reuse only identical bindings;
refuse a full/short collision, duplicate canonical source key or incompatible
output kind before writes, without salting/random retry. A full digest equal for
different preimages blocks even when their output prefixes differ; checking only
the final prefix-bearing target ID is insufficient. All new mutable records
use active/initial lifecycle with that event ID. Immutable records retain the
existing domain canonical-payload/digest rules. No Tag or appearance IDs are
allocated by this first subset.

### Golden vectors

Fix conversionId to 32 zeroes, sourceZipSha256 to 64 ones and workbookPath to
`data.xlsx`. Let `C0` be
`['cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40','1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309']`
and `C1` be
`['cap_0C8PPVY42VKBAN3HPDQS29678S','0c45adbf105b9ad551c6cdbe44931d193f51e8d93ac5db99f1450c6b23caeba2']`.
These are unchanged source vectors from 04. The following lengths count the full
UTF-8 preimage; full SHA-256 is normative, not just the shortened target suffix.

| Prefix | sourceKey | Bytes | Full SHA-256 |
|---|---|---:|---|
| scn | `['sheet',['legacyGid','0']]` | 209 | `840f2c45c15a6597053a7c2e9fb8cf3c80c93a984ae210fdb15f52cb21316a43` |
| cap | `['caption',C0]` | 295 | `0fd07c6db2e1fda97513f3df88e97de95d04322c8da322bec8384b9010d4378a` |
| cap | `['caption',C1]` | 295 | `fd12f31d9e812c26546190d72d51772b971d6fcdee34171ce1bc0f7baa012707` |
| ast | `['model','models/model.glb']` | 210 | `4f5c6f99334c8d563515907162d3c2f9397e573a4002bc5a399e5de2d6ca1ef5` |
| slot | `['material-slot','models/model.glb','gltfMaterial',0]` | 236 | `72e23e167d96d6973df1d85ebe57d5b26f835550da6d0477fef09cdca5d02abf` |
| att | `['attachment',C0,0,'media/写真.png']` | 319 | `b3006562b2d0efb7d0e5dd56dec05830a3fe5328adff9b362557186af2a61bfb` |
| view | `['view','__LM_VIEWS',2]` | 206 | `f8db87482fce55ef9df8d561641a257166a183674a2ed5c16c416c4020b1c910` |
| evt | `['initial-event','cap',['caption',C0]]` | 319 | `a248893b072aed4d33e4e10413ef2a1ea61e4b12273632ef74349af87573f308` |

One target Caption canonical JSON vector, exactly 291 UTF-8 bytes, no final LF:

```json
{"anchor":{"kind":"unplaced","ownerAssetId":"ast_4f5c6f99334c8d563515907162d3c2f9"},"body":"","colorSrgb":[1,0.5019607843137255,0],"id":"cap_0fd07c6db2e1fda97513f3df88e97de9","lifecycle":{"eventId":"evt_a248893b072aed4d33e4e10413ef2a1e","reason":"initial","state":"active"},"title":"記録"}
```

SHA-256: `2a224034a19c6c282494d61b50420dec266219787fd3c8e55282f5f1f4fbaff6`.
This is a record vector, not a claim of deterministic Automerge change bytes.

The selected-workbook decoded-row inventory is compact JSON of
`[[tableIndex,R,[...exactDecodedCellStrings]],...]`, covering all decoded rows
(including headers/empty rows) of all tables in encounter order. tableIndex is
the zero-based table encounter ordinal, not a GID. Use JSON string/number spelling,
no BOM/final LF and no trimming/Unicode normalization of cells in this evidence.
Bind count/digest separately from raw workbook/ZIP fingerprints. This does not
make decoded data a replacement for the original bytes.

One encoding vector is exactly 51 UTF-8 bytes, no final LF:

```json
[[0,1,["id","title"]],[0,2,["c_SYNTH_A","記録"]]]
```

SHA-256: `d6985753bd59123a0e772b4639925e591f8c8b73afb79e1c40f0740cee20efb7`.
It fixes inventory encoding only, not a complete admitted LociMyu workbook.

## Persistence, privacy and ports

The receipt binds recipe, owned original ZIP length/digest, per-entry raw
fingerprints, selected workbook bytes/path, source identity plans, exact ordered
confirmation or absence, confirmed title, complete closed mappings/report,
payload refs and exact initial source/proof/bytes. Revalidate these bindings
before publication/cold recovery; do not regenerate IDs or Automerge history.
Use existing OriginBlobStore, metadata initialization/journal and WorkspaceFS.
Capture an independent closed origin binding for this new recipe as well as its
initial receipt so generic creation cannot bypass conversion verification after
sidecar loss/downgrade. Add an exact recipe case; never reinterpret or loosen the
existing frozen-v1/Native initial evidence and recovery routes. Completed retry
preserves subsequent target edits.

Use `projectFiles/lociMyuSource.ts` → `lociMyuMapping.ts` → `lociMyuConversion.ts`
for source inspection, pure mapping and prepared conversion respectively. The
source module may import assets/zipio, assets/importWizard and io/locimyu plus
existing projectFiles validators/inspectors, domain values and metadata digest
helpers. Mapping consumes that source plan, domain records, the current GLB
profile and existing sealing helpers. Conversion consumes that plan/mapping and
existing creation/content/metadata/blob/lease services. Extend only these exact
file/import allowlists, never a whole directory or the assets/io cycle. The
validation workspace/host may import the prepared-conversion/resume API.
UI receives summaries,
coarse workbook/relation choices and a confirmed preparation object, then uses
the existing typed Session/provider/editor/file ports. No UI storage writes,
Native intermediate package, parallel issue store or generic migration framework.

Original ZIP, private identity/mapping evidence and detailed report never enter
ordinary backup/Workspace/Contribution/review/Clean output. Offer the separate
conversion report explicitly before both success and blocking preflight, stating
that source ZIP plus report are needed for audit/reconversion. This reuses 04's
export intent; it is not automatic disclosure in team files. Internal retention
does not mean an externally saved source/report exists or that a new-format
backup contains the complete original LociMyu data.

The separate JSON report discriminator is
`{format:'lociview-locimyu-to-project-scene-report',version:1}`. Its bounded data
contains source ZIP/workbook fingerprints, confirmed title/selection/relation
basis, input and converted/source-only counts, exact identity/target mappings,
and 04-style issues (severity, source sheet/decoded row/source ID/field, reason,
impact and bounded candidates). Target identity/initial proof may be null before
confirmation; a blocking preflight report must not claim publication. Bind the
captured report in the private conversion receipt. Offer it on explicit report
export, including after a cold conversion reopen; do not reconstruct its source
dispositions from later target edits or change the frozen Native report schema.

## Acceptance and stop conditions

Use code-generated raw XLSX/CSV inside an outer ZIP, one GLB and exact PNGs,
including equal-byte distinct resources, duplicate rows across/within sheets,
missing IDs, positioned/known-owner-unplaced Captions, exact/ambiguous relations,
perspective and approved orthographic Views. Connect preview/workbook and bounded
relation choice → confirmation → product edit/first placement → named backup,
Workspace/review/independent receiver → cold reopen. Reuse source identity and
relation tests; add representative active-unsupported refusals, collision faults,
private-output isolation and interrupted/completed retry on captured bytes.

Independently review the meaningful final diff and run one serial checkpoint at
the connected boundary. Browser/GPU/device/offline and anonymized-real-source
acceptance remain separately pending; do not request PO tests per fixture or
control. Stop only affected work for an actual contract conflict/new scope,
managed authority or release boundary. Ratification of this exact recipe/subset
must precede durable writes. Broader formats/materials stay required; no old-file
update bridge is revived.
