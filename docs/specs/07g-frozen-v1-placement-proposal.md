# Frozen-v1 model placement conversion companion

Status: **PROPOSED — unratified, not implemented or adopted.**
This connected companion extends [07b](07b-frozen-v1-conversion-proposal.md),
[07d](07d-jpeg-project-scene-proposal.md), [07e](07e-webp-gif-project-scene-proposal.md)
and [07f](07f-frozen-v1-default-view-proposal.md) only as specified below.
It requires exact PO ratification before implementation. [Todo](../../tasks/todo.md)
owns current implementation/evidence; this proposal gives no release credit.

## Outcome and the compatibility decision

Open an otherwise admitted frozen-v1 Project with model placement → inspect the
affected placement → convert → open the intended Scene/View → edit → named
backup/Workspace/review → selected-generation restore, further edit and cold reopen.

The old [model transform](../../src/viewer/viewer.ts) applies positive scale and
Y/Z-up to modelRoot, which also owns model-local pins. Those settings already
agree with the source pin coordinates; transforming pins again would be wrong.
Its setter does not apply the recorded offset. The source contract does not fix
offset's frame or addition order.

**Proposed decision:** apply saved offset as translation in the new Project frame,
after rotation and scale. Models and their pins can therefore move compared with
the old viewer. Disclose this effect before confirmation. Cancel preserves the
input and writes no Project. Scale/Y-or-Z-up keep their existing geometric meaning;
this is not exact old-screen replay when a nonzero offset exists.

## Closed source and model mapping

Keep all original ZIP/log accounting, frozen admission/LWW, current reference,
photo/model content checks and target map-2 rules from the approved companions.
Unknown fields, divergent `(actor,op)`, invalid values and unsupported whole inputs
remain refused without repair. Inspect all retained fields, including overwritten
or deleted records; do not use caches or UI state as authority.

For a retained model transform, permit exactly scale/upAxis/offset. Omitted
components mean 1 / Y / [0,0,0]. Require finite strictly positive uniform scale,
upAxis exactly Y or Z, and a finite three-component offset. Do not substitute the
old viewer's fallback for malformed scale/axis, infer a unit or bake/re-encode GLB.
An image transform remains unsupported. Use existing model-kind checks for partial
operations; a transform cannot acquire authority on another asset kind.

Map only the reduced active model placement to binding.assetToProject:

```text
T(p) = offset + scale * R(p)
Y-up: R(x,y,z) = (x,y,z)
Z-up: R(x,y,z) = (x,z,-y)
```

Translation is the exact source offset, uniformScale the source scale. Follow
[01 §2.2](01-domain-rendering.md#22-transform-forms)'s canonical quaternion rule
using these precomputed normalized constants as normative serialized values:

- Y: `[0,0,0,1]`.
- Z: `[-0.7071067811865475,0,0,0.7071067811865475]`.

The Z constant was normalized from the -90-degree rotation and has positive w,
positive zeros and unit length within the existing tolerance. Use it directly on
initial mapping and recovery. Keep existing unit/sign/canonical validation. Do not
use runtime Math.hypot, trigonometry or normalization results to rederive or rewrite
the expected/persisted quaternion; that can change the exact floating value used
in retained-record comparison. This is one fixed rotation,
not a new general numeric kernel or tolerance-based evidence fence.

Keep original GLB bytes, node transforms, Representation-to-Asset identity and
logical bounds in Asset space. Positioned Caption coordinates remain model-local
positionAsset, with the same owner/frame/revision/class mapping; do not transform
them before applying the binding. Known-owner/ownerless unplaced Captions retain
their meanings. Source normals stay existing private source-only evidence.
Saved perspective eye/target/up remain in Project space; do not multiply them by
model scale, offset or pinScale. Every active model still belongs to every Scene.

## New-recipe readiness and derived finite checks

Before recipe-5 becomes ready or publishes, require all reduced active models'
eight logical-bound corners and every positioned pin's resulting Project point
to be finite under their complete binding. All reduced active perspective Saved
Views must satisfy the [existing runtime camera guard](../../src/harness/projectScene/viewHistory.ts):
finite nonzero eye-target distance, unit up and nonparallel basis, valid perspective
projection and existing solid-background rules. Reuse current target/runtime
conditions in narrow conversion helpers; metadata readiness alone is insufficient.
Refuse the whole input before publication if derived results cannot be displayed.
No new numeric capacity guarantee, arbitrary limit, clamp or renderer is added.
These checks belong only to new recipe-5, never old recipe-1/2/3/4.

## One additive domain, conditional disclosure and exact IDs

Propose exactly `v1-project-scene-migration-recipe-5`. Select it iff any retained
model transform differs from the previously admitted identity subset 1/Y/[0,0,0].
Historical overwritten/deleted values count for this immutable domain selection.
Otherwise preserve recipe-4 explicit-default-history priority, then recipe-3/2/1
photo dispatch. Do not retry an unrelated old refusal under the new domain.

Recipe-5 includes current PNG/JPEG/WebP/GIF photos and explicit default rules
without further format-specific domains. Keep existing GLB profiles; each v1
Representation retains its actual admitted PNG/JPEG base profile. Original
resources/attachment occurrences, Scene/View order and latest-lastWrite tie
refusal remain unchanged.

Only new recipe-5 summary/report adds `appliedModelOffsets`, a nonnegative safe
integer counting reduced-active models whose offset has any nonzero component.
Recompute and bind it from original source. A historical-only trigger may have
zero. Existing report shapes and old receipts stay fixed. For a nonzero count,
show the conditional preview consequence:

`モデルの保存済み位置補正を適用します。旧画面では反映されていなかった配置です。`

Inherit all 07b output prefixes/source keys, attachment occurrence and lifecycle
nesting. UTF-8 preimage has no BOM/final LF or normalization:

```text
"lociview:v1-project-scene-migration-recipe-5:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

The escape is one LF. ID is prefix+'_'+SHA256.slice(0,32). Retain full digests and
preimages, reject full-digest collisions across prefixes, shortened-ID collisions
and incompatible entity bindings; exact repeated lookup is allowed. Mapping
evidence sorts by ASCII target ID regardless of digest completion. Old domains
are never relabelled. Fix conversionId=32 zeroes and sourceZipSha256=64 ones:

| Prefix | Exact sourceKey | UTF-8 bytes | Full SHA-256 |
|---|---|---:|---|
| bnd | `["model-binding","ast_00000000000000000000000001"]` | 215 | `34941857f5f9b58365dd533b5b502031138c5b39c8e4ccd37aba8aabf316b608` |
| view | `["view","view_00000000000000000000000001"]` | 208 | `0ab007615ff0b38788d7f7308d00756d0af04209f7085d447a1684c62779ccc3` |
| cap | `["caption","cap_00000000000000000000000001"]` | 209 | `03dfa04bbd13962624b7a809635e5bdc075bc11799331a477e8e3425ec7e1648` |
| tag | `["tag","記録"]` | 181 | `fdc95ad164bf19492a5405f019793156be14cb895a5bff0f3da634ff511c950e` |

## Captured recovery, ports and acceptance

Add only the new literal and recipe-discriminated report field to the existing
closed conversion/initial/origin receipts. Inherit original ZIP/raw fingerprints/
inventory, captured Project identity, full mapping and exact initial proof/bytes.
Before persistence or converter cold publication/explicit completed retry,
recompute selection, placement/count/expected records against captured identity
and compare the retained initial. Never regenerate history or missing acknowledged
evidence; completed retry preserves later target edits. Independent origin prevents
sidecar loss/downgrade from falling into generic initialization. Ordinary ready
open and warm later-edit retry gain no private-source reread.

Use existing frozen read/plan/map, Session/provider, content/file/generation and
conditional preview ports. Keep projectFiles free of harness/UI imports; necessary
private scalar helpers mirror accepted target/runtime checks without a general
framework. No new renderer, GLB profile, storage/package wire or dependency.
Keep private source/receipt/report out of ordinary five-purpose output.

Reuse one representative connected workflow combining scale2/Z-up/offset[10,20,30],
pin[.25,.5,0] → approximately [10.5,20,29], an explicit perspective View and a
second Scene. Verify preview consequence/count and cancel/no-write, exact local
coordinates/GLB/profile, typed edits, named backup/Workspace/review, actual selected-
generation restore/edit/cold and source/privacy preservation. Use service cases for
all-retained/current selection, malformed transforms/derived overflow, old dispatch,
four golden/collision/order, source/initial forging, origin/sidecar loss/downgrade
and completed later-edit fences. Keep existing assertions and outer budgets.

## Explicit remaining scope and stop conditions

Every retained ortho:true camera remains refused as before. The source lacks
saved zoom/span; a future approximate mapping also needs a portable exact-source/
record numerical policy. [ECMAScript Math.tan](https://tc39.es/ecma262/multipage/numbers-and-dates.html#sec-math.tan)
and Math.hypot are implementation-approximated: a stated expression alone does
not guarantee bit-identical rederived initial records across engines. Do not add
an epsilon fence, FOV table, math library or silently weaken exact comparison here.
Existing LociMyu semantics remain unchanged.

Inline defaultCameraState stays refused on every presence: its producer, consumer,
schema and priority meaning remain unresolved. Materials, Native active appearance,
other formats, ordinary entry and adoption remain separate scope. Tests using
generated input/recorded DOM are not browser/GPU/device/offline, old-screen pixel
or anonymized-real-source acceptance.

Independently review the meaningful diff and run one required final serial
checkpoint plus HTTP build identity at the connected source/test boundary.
Stop affected work for a real new authority/contract conflict. **Implementation
of this proposal is prohibited until its exact PO ratification.**
