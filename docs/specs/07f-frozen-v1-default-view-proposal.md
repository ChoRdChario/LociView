# Frozen-v1 explicit default-View conversion companion

Status: **PROPOSED — not approved, implemented or adopted.**
This is a concrete bounded companion to [07b](07b-frozen-v1-conversion-proposal.md),
[07d](07d-jpeg-project-scene-proposal.md) and [07e](07e-webp-gif-project-scene-proposal.md).
It needs PO ratification before implementation. Current work and executed evidence
belong to [todo](../../tasks/todo.md); this document grants no release or adoption credit.

## User outcome and compatibility choice

Open an otherwise admitted frozen-v1 Project that stores an explicit starting
View → confirm conversion → open each Scene at that saved View → edit, save a
named backup/Workspace, restore and cold reopen without losing that relationship.

[Frozen v1 §5](../02-data-format.md#5-エンティティスキーマ) specifies explicit
`defaultViewId` priority, with the latest same-set saved View only when no default
is set. The old viewer currently chooses latest lastWrite; 07b therefore refuses
nonnull defaults instead of silently choosing a different meaning. This companion
maps the frozen contract. **保存済み明示視点を優先するため、旧画面が最新の保存日時から選んでいた視点とは
異なる視点で開く場合がある。** This is the user-visible compatibility impact to
ratify, not a proposal to change the frozen wire or legacy viewer.

## Closed source admission and mapping

All 07b/07d/07e source, raw-byte, operation, model, photo and target field checks
remain in force except the nonnull Set default exclusion described here. The
converter continues inspecting every retained original operation before reduction.

1. A present Set `defaultViewId` must be null or a canonical frozen View ID:
   `view_` followed by 26 Crockford uppercase ULID characters, first character
   0–7. Do not trim, normalize, coerce or resolve names. Check this type/ID in every
   retained Set operation, including nonwinning writes and deleted Sets.
2. Reduce distinct valid operations with the existing frozen field-LWW/HLC and
   update-wins rules. Same `(actor,op)` with divergent content still refuses the
   whole input. No new winner or target conflict is inferred.
3. For each reduced active Set, a winning nonnull default must resolve to an
   admitted active perspective View in that same Set. Dangling, deleted,
   cross-Set or unsupported winning references refuse the complete conversion.
   Map it to that View's new ID as Scene.defaultViewId.
4. For an absent/null winning default, retain the existing greatest-lastWrite
   same-set View fallback; with no View omit target defaultViewId, never persist
   null. Keep the existing latest-lastWrite tie refusal for every active Set,
   including a Set with an explicit default. View order and camera mapping remain
   unchanged.
5. Historical nonwinning default references and defaults on reduced deleted Sets
   need type/ID checks, not a current target relationship. Preserve their exact
   raw log bytes in the private original ZIP and its existing operation inventory;
   do not materialize deleted Scenes/Views or invent current links from them.

The first ordered active Scene remains Project.defaultSceneId. An explicit saved
View is that Scene's entry setting, not a local current-Scene change or a command
that changes another person's screen. Inline `defaultCameraState`, orthographic
Views, materials, nonidentity model transforms and all other excluded source
fields remain refused exactly as before. No Native or LociMyu recipe changes.

## One additive immutable recipe

Propose exactly `v1-project-scene-migration-recipe-4`. Select it iff any retained
Set operation has a present nonnull defaultViewId, even when that write later
loses, becomes null, or belongs to a deleted Set. Malformed values still refuse;
there is no old-refusal → new-recipe fallback. A source with no such history keeps
its existing PNG-only recipe-1, JPEG recipe-2 or WebP/GIF-photo recipe-3 selection,
receipt meanings and ready/retry timing.

Recipe-4 handles the currently admitted PNG/JPEG/WebP/GIF photo mixture without
further MIME-based domains. Each Representation retains its actual exact PNG/JPEG
base profile from admission; there is no new GLB, renderer or map profile. A
photo-only format never changes a model profile.

Inherit 07b's entire closed output-prefix/source-key table, including attachment
array occurrence and lifecycle event nesting. The only ID-domain substitution is:

```text
"lociview:v1-project-scene-migration-recipe-4:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

The escape denotes one LF. UTF-8 has no BOM/final LF or normalization; target ID is
`prefix+'_'+fullSha256.slice(0,32)`. Retain full digest/preimage; recipe-4 rejects
full-digest collisions across prefixes, shortened-ID collisions and incompatible
entity bindings. Exact repeated lookup is allowed. Sort mapping evidence by ASCII
target ID independently of digest completion. Old recipe-1 collision/order rules
and all old IDs stay unchanged.

Fix conversionId to 32 zeroes and sourceZipSha256 to 64 ones for these normative
preimage vectors. Target IDs use the first 32 hex digits of the full SHA below.

| Prefix | Exact sourceKey | UTF-8 bytes | Full SHA-256 |
|---|---|---:|---|
| scn | `["set","set_00000000000000000000000001"]` | 205 | `e2728b516a8b2af68ed5c8f25fb09d0fc9292524bd4f486986a003befaf55d5e` |
| view | `["view","view_00000000000000000000000001"]` | 208 | `9fa00183cc5811cb7e0869552787a9960313b33a86cf37862669338e123a3a84` |
| med | `["media","ast_00000000000000000000000002"]` | 207 | `afbada4ebc1babfddb99d709c54266b79911e8d78561ead56aaea05d9b066186` |
| att | `["attachment","cap_00000000000000000000000001",1,"ast_00000000000000000000000002"]` | 247 | `72948f287470591ba3df9623b85bb860ffdcc6de00cb6e3fb446b48d78ef35c0` |

## Captured persistence, recovery and privacy

Extend only the closed recipe literal in the existing conversion receipt and
`validation-initial-2` / independent `validation-origin-1` binding. Bind the exact
original ZIP, raw fingerprints, admitted inventory, captured conversion/Project
identity, full mappings and initial proof/length/digest. Before persistence or
converter cold publication/explicit completed retry, rederive history-based
selection and each effective default from original source, recompute expected
records/mappings against captured identity and compare the retained initial.
Never regenerate history, IDs, initial bytes or missing acknowledged evidence.
Completed retry preserves later target edits. Generic initialization must not
bypass bound-origin obligations if private sidecars disappear or are downgraded.

Ordinary ready opening and warm later-edit retry retain their current lifetime;
they gain no requirement to reread private conversion input. Reuse existing
summary/source-only counts and private original ZIP instead of a new report
framework. Default history remains accounted for in raw fingerprints/inventory.
Backup/Workspace/review/Clean continue excluding private conversion inputs,
receipts and report; no new export purpose, source-history copy or identifier leak.

## Narrow implementation and acceptance

Use existing frozen read/plan/map, typed Session/provider, content, file and
selected-generation restore ports. Add no ProjectStore route, Native intermediate
DTO, UI storage write, generic migration framework, dependency or public fixture.

Reuse service faults plus one representative connected file workflow: explicit
older View wins over a newer same-set View; absent/null retains latest; nonwinning
and deleted-Set history selects recipe-4 without creating dangling target links.
Refuse malformed IDs, effective dangling/deleted/cross-Set/unsupported defaults,
divergent duplicate operations, inline cameras and existing latest-View ties.
Check four vectors, new-only collision/order, PNG/JPEG/WebP/GIF recipe-4 selection
and no-default old dispatch. Cover source mutation, independent-origin/sidecar
loss and downgrade, interrupted/cold initialization, completed later-edit retry,
actual selected-generation restore/edit/cold and ordinary output privacy. Existing
field/camera/profile/old-recipe oracles and outer test budgets remain unchanged.

Independently review the meaningful diff, then run the required final serial
checkpoint and HTTP build identity once at its connected source/test boundary.
Synthetic/recorded-DOM checks are not actual View rendering, browser/device,
offline or anonymized-real-source evidence. Ordinary home, broader v1 conversion,
profile/storage adoption and deployment stay gated. Stop affected work for a real
new contract/authority conflict. **No implementation is authorized by this proposal
until its exact companion is ratified.**
