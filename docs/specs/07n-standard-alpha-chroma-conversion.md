# Standard alpha/chroma material workflow

Status: **APPROVED — PO direction and implementation authorized 2026-10-28; exact
connection/goldens independently reviewed; bounded validation/Desktop workflow
implemented and automatically verified, not adopted.** The PO chose standard
new-format material operations, originals/existing data retained, affected targets
and reasons explained before conversion, with implementation and automatic checks
as one group. This is not approval to pass or remove G1-D. [Todo](../../tasks/todo.md)
owns current work and executed evidence.

## Outcome and boundaries

Native, frozen-v1 and single-model LociMyu material adjustments → inspected
target-specific explanation → conversion → ordinary scoped edit/reset → all five
file purposes/two returns with local work → selected restore and cold reopen.
Use standard01§4.2 source coverage followed by appearance opacity/chroma. Preserve
original ZIP/model/image bytes, coordinates, exact source addresses, old recipes,
existing Project metadata, storage/wire/profile identities and recovery fences.
No old-appearance compatibility evaluator or silent alpha-to-cutout conversion.

Admit closed surface opaque/MASK/BLEND source semantics on verified visual Mesh
slots. Keep Basic→lit, Point/GS/Proxy material editing, transmission, unknown
intent/semantics, ambiguous/shared legacy addresses and other formats unsupported.
No new dependency, schema, public FormatProfile or general ordinary activation.
The new editable admission applies only to map2. Existing map1 Projects retain
their prior source/edit restrictions, including refusal of BLEND-source edits.

Smooth intent is editable/storable/recoverable. Actual smooth composition remains
behind01§4.2/§7 and03 G1-D. This companion supersedes only05's earlier command/UI
prohibitions on inherit fractional opacity/softness and BLEND-source editing;
its smooth display/production/adoption restrictions remain. Before that gate, affected
material contributions are locally hidden with an explanation; other ready
geometry/Caption controls remain usable. The user may explicitly select supported
cutout or opaque coverage using the same material editor. Never change persistent
intent to obtain a display fallback. Mesh-only does not bypass this gate. Dither
and experimental smooth production connection are not enabled by this companion.

The separately approved[01g companion](01g-desktop-smooth-display-proposal.md)
subsequently authorizes conditional approximate display only in the01e static
PC candidate, including sourceMASK-before-appearance and BLEND final-alpha math.
Its owned viewport policy does not change this migration/editor contract, map1,
persisted intent or old recipes. The local-hide behavior above remains in other
routes and as the candidate's explicit unsupported-display fallback.

## Standard evaluation and editor

Use the existing map2 atoms and existing source profiles, not a new interpretation:

1. source opaque coverage=1; source MASK coverage=(original factor × texture alpha
   × vertex alpha >= original cutoff); source BLEND coverage=that original alpha.
2. appearance alpha=clamp(source coverage × opacity × chroma coverage,0,1).
   Chroma uses pre-lighting resolved linear RGB, normalized distance `/sqrt(3)`
   and01's zero/positive softness rule. Disabled chroma does not participate.
3. inherit resolves to smooth for source BLEND/opacity<1/positive active softness,
   otherwise mask for source MASK/active hard chroma, otherwise opaque. Explicit
   opaque ignores source coverage and requires absent/one opacity and no active
   chroma; explicit mask compares the complete alpha to its saved cutoff.
4. surviving opaque/mask samples output alpha1 and write depth. Mask cutoff0 can
   accept alpha0; never discard source MASK/BLEND before final evaluation.

Source material templates/textures are immutable. Capture original factor/cutoff
before applying appearance to an owned clone. The display and existing Boolean
GPU coverage probe share the same binary predicate. A failed/unknown probe cannot
place a pin. Redirected smooth contributions have no color/depth/pick contribution;
this does not invent a smooth pick threshold or claim G1-D acceptance.

Keep the current editor, scope, conflict resolution, retry and reset. Add a
familiar half-transparent coverage choice; preserve original/inherit, opaque and
cutout. Allow exact standard intent through typed commands and conflict resolution
even when display is redirected. Explain redirection beside the affected material
and in the viewport. Do not use an unsupported display state to erase a saved
setting, block unrelated work or force a new wizard.

## New recipes and exact value rules

Add immutable recipes `native-project-scene-recipe-10`,
`v1-project-scene-migration-recipe-8`, and
`locimyu-project-scene-migration-recipe-6`. Use existing source-key grammars and
JCS/hash/collision rules with the new recipe namespace. Ratify exact identity
vectors before implementation. Initial-origin markers, receipts and retries must
recognize the new recipes and refuse downgrade/rebinding to an old subset.
The exact nine identity vectors are in
[the companion golden file](profiles/standard-alpha-chroma-conversion.goldens.json);
this is an ID contract, not a new source/display FormatProfile.

Select a new recipe only when an effective addressed material has opacity other
than1, active chroma, or source coverage other than opaque. All retained Native
appearance rows count, including hidden Scenes/revisions. v1 uses current active
rows after all-history typing; LociMyu uses existing current/valid/matched rows.
Otherwise keep exact old recipe selection, mappings, report shapes and bytes.
No row is invented for unaddressed source materials. Source-only BLEND remains
source BLEND and uses the same display redirect; it does not alone create a new
conversion recipe/override or rewrite its source profile.

Within a newly selected recipe, map every effective material row consistently:

| Family | Appearance and defaults |
|---|---|
| Native10 | Stored opacity and side; unlit true→unlit, otherwise inherit. Keep existing Native key-color8bit compatibility quantization and tolerance `/sqrt(3)`. Active feather maps as stored feather `/sqrt(3)`, including exact0 (hard chroma); disabled chroma retains its existing target values/quantization, including dormant softness. |
| v1-8 | Opacity absent→1; side absent→omit/inherit source; unlit/unlitLike true→unlit, otherwise inherit. Active chroma key defaults to black, `tolerance` defaults to0.1, feather defaults to0; divide tolerance/feather bysqrt(3). `tol` stays source/report-only as in the actual old viewer; do not silently treat it as another authoritative field. Disabled chroma values stay in the source/private explanation only, as in old recipes. |
| LociMyu6 | Existing exact Scene/name→index mapping and true/false parsing. Opacity blank→1; side/unlit blanks keep existing false meaning. Active key blank→black; active tolerance blank→0.1 (repo's legacy import default); feather blank→0. Divide tolerance/feather bysqrt(3). Disabled chroma remains source/private-explanation-only. Invalid/inactive rows keep existing accounting, never guess owners. |

New target coverage/optics initially remain inherit. An opacity value is a new
appearance multiplier, not replacement of the source factor. Native/v1's old
minimum feather0.0001 is not carried into active hard chroma. Previously ignored
Basic chroma becomes standard active chroma; Native's old transparency/depth flags
are not persisted or simulated. These are deliberate normalized semantics, not
promises of old-renderer pixel identity. Existing recipes retain their exact
old dormant-value and absent-side behavior.

All raw values, ignored aliases/default evidence and unused/deleted history stay
in the retained original and existing family-specific private explanation. New
v1 report values labelled source-only must actually be source-only; active mapped
chroma must not be described as omitted. New recipe reports/witnesses are verified
again from original bytes and catalogs. Do not unconditionally extend old report
or witness shapes. Native witnesses keep their existing shape and source-derived
plain/spatial/Mesh lanes; its single-use CAS verified-read lifetime remains exact.

## Before-conversion explanation

Derive a readonly notice list only after complete source admission from checked
rows/catalogs. Each item identifies the source Scene, model and exact material or
row/slot, and the applicable reasons: source-alpha/multiplier ordering, normalized
chroma distance/default/zero feather, Basic chroma becoming effective, or gated
smooth display. Use source labels as text, never HTML or authorizing flags.

Show a concise summary and inspectable affected-target/reason list beside the
existing conversion action. State original preservation and explain any smooth
contribution that will be hidden until the user explicitly changes its coverage.
Use the same display DTO and wording across the three source families. Keep one
conversion action and current cancel/reselect flow; do not require another
per-material approval. Preview/cancel/reselect performs no Project/journal/CAS
acknowledgement/publication. Stale evaluations cannot authorize creation.

New Native summary DTOs need not extend its closed persisted receipt/report;
derive notices from the already inspected original/compact catalog. v1/LociMyu
retain accurate private explanation through their existing report ownership.
Private originals/receipts/explanations stay outside all five public outputs.
Include unaddressed source-only BLEND in display-redirection notices even when it
does not select a new recipe or create an override.

## Ports, verification and stop conditions

Domain owns the pure closed Mesh-source capability and standard coverage resolver;
viewer owns binary shader/probe configuration, without storage/package/UI imports.
projectScene connects verified decoded classes/catalog slots and display notices.
The owning Project interprets its explicit semanticProfile before the resident
port receives normalized display intent. Never infer metadata semantics from a
Representation FormatProfile in the renderer, including base-profile v1/LociMyu.
Typed Session commands retain source/role/stale/conflict/unknown validation. UI
consumes typed display/notice models and emits existing commands only. Preserve
exact import allowlists; run sceneCore early when these imports change.

Reuse focused material/source tests and existing file-flow helpers. Cover exact
new ID vectors, old recipe/golden identity, source opaque/MASK/BLEND, source/final
cutoff0/1, factor/texture/RGBA, disabled/zero/soft chroma, Basic and lit refusal,
preview/cancel no writes, target/reason display, explicit cutout/reset/redirect,
three Native receipt lanes and source reselect, v1/LociMyu defaults/source-only
values, tamper/downgrade refusal and preserving later edits on recovery retry.
One connected Chromium workflow covers representative normalization warnings,
editing/reset, five outputs/two returns with local work, restore and cold. Reuse
service tests for remaining source/default/fault combinations. Required final
checks and independent review precede the suitable g0 checkpoint/push.
Directly assert that prepare/evaluate→cancel/reselect/obsolete completion performs
zero Project-FS writes, DB creation/save, CAS put and journal initialization, not
merely that no acknowledgement/publication is visible afterward.

Stop only affected work for a genuine contract conflict or new compositor/adoption
authority. Physical-iOS/offline/PWA/general adoption/release remain separate. The
PO's normalization/implementation approval does not require another family/helper
confirmation; G1-D is an actual separate display boundary, not a whole-unit pause.
