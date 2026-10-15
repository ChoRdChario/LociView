# JPEG photos and embedded textures companion

Status: **PO ratified 2026-10-15 — bounded implementation authorized;
not implemented, not adopted.**
This is one connected extension of [05](05-project-scene-team-workflow.md),
[07](07-project-scene-migration.md), [07a](07a-native-appearance-conversion-proposal.md),
[07b](07b-frozen-v1-conversion-proposal.md) and
[07c](07c-locimyu-project-scene-conversion-proposal.md). It does not change their
existing recipes/profiles, Projects, retained inputs or pending jobs. It is a
separate documentation checkpoint from the bounded LociMyu implementation.

## One decision and connected result

PO decision ratified 2026-10-15: photos follow their recorded orientation and ordinary
browser color management; model textures keep the model format's standard
orientation/color rules; original JPEG bytes, including metadata, are retained.
The practical consequence is that shared photos may include their original
shooting/location metadata. No automatic stripping, re-encoding or original
deletion is proposed. Inherit 05 §7.3's existing file preflight disclosure of
original metadata/labels where it changes the sharing decision; do not add a
separate sanitization policy/dialog or claim metadata removal.

Outcome: add a JPEG photo, create/open a static GLB containing JPEG, or convert
an admitted Native/frozen-v1/LociMyu input that actually requires JPEG → edit
Scene/Caption/media and first-place → named backup/Workspace/independent review →
cold reopen and retained-source recovery. This is confined to the existing
nondefault validation/product composition. Ordinary entry, broader formats,
fractional-opacity/active-chroma mapping, dependencies, new numeric guarantees,
browser/device/offline adoption and release remain outside this proposal.

## JPEG-1 byte and display boundary

Inspect owned bytes, not filename extensions or MIME assertions. Require exact
SOI at the start, one complete frame, supported scans and one terminal EOI at
EOF. Walk bounded marker/segment lengths and entropy boundaries, including byte
stuffing, fill and restart markers. Reject truncation, overflow, trailing data,
second images, unsupported frame/coding modes and malformed references. Admit
SOF0/1/2 only, 8-bit one- or three-component images, positive frame dimensions and
no DNL. Retain the host's file/segment/work/pixel budgets; no larger limit or
latency promise is introduced. Header recognition alone never admits an image:
require an actual browser decoder result, check dimensions and always close
temporary bitmaps on success, failure and stale completion.

Parse recognized Exif APP1/TIFF orientation with bounded endian/type/count/offset
and IFD traversal checks. Reject invalid, duplicate/conflicting orientation or
malformed Exif rather than substituting another orientation. Other source
metadata stays byte-exact and does not become Project authority. Do not follow
URLs, external resources, embedded thumbnails or metadata executable content.
Primary-image orientation is the 0th IFD's tag. The 1st IFD describes a thumbnail;
its orientation does not override or duplicate the primary tag. Keep offset,
length and cycle checks on inspected IFD structures; do not decode/follow the
thumbnail image. Multiple primary orientation tags in IFD0 or separate Exif
APP1 segments remain invalid. This distinction follows
[CIPA Exif 2.3 §§4.5.4 and 4.5.8](https://www.cipa.jp/std/documents/e/DC-008-2012_E.pdf).
A second recognized `Exif\0\0` APP1 container is ambiguous and refuses even if
one or both omit Orientation; do not choose a first/last/only-present source.
Non-Exif APP1 metadata remains opaque. This follows the primary Exif container
boundary in [CIPA Exif 2.3 §§4.7 and 4.7.2](https://www.cipa.jp/std/documents/e/DC-008-2012_E_C.pdf),
without importing unrelated scan/table restrictions into the SOF1/2 subset above.

| Use | Closed implementation behavior |
|---|---|
| Caption photo | Admit JFIF or Exif-only JPEG in the byte subset above. Absent orientation means 1; valid 1–8 is applied exactly once with `imageOrientation:'from-image'`. Decoder/display dimensions swap for 5–8. Use `colorSpaceConversion:'default'`, no resize and `premultiplyAlpha:'none'`; ICC metadata may influence ordinary browser display. JPEG is opaque; PNG decoding stays unchanged. No cross-browser/device pixel equality is promised. |
| GLB embedded texture | Require the glTF JFIF arrangement, one Y or three ordered Y/Cb/Cr components. Orientation must be absent or exactly 1; refuse 2–8 and invalid/conflicting values before publication. Decode with `colorSpaceConversion:'none'`, no resize, and retain current UV/flip/material-role transfer-function/alpha rules. ICC and other image color metadata do not alter texture interpretation. |

The distinction follows the [glTF image/JPEG requirements](https://github.com/KhronosGroup/glTF/blob/main/specification/2.0/Specification.adoc#383-images)
and [HTML ImageBitmap orientation/color options](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#imagebitmapoptions),
read 2026-10-15. The latter leaves default color conversion to the implementation;
the proposal does not turn that into a deterministic color-conversion guarantee.
Retaining bytes and accepting a safe decoded image are separate from GPU/device
rendering acceptance. Unsupported authoritative active content refuses the
complete operation, with original preservation and the existing conversion
report; already source-only content keeps its inherited disposition.

## Two additive immutable development profiles

These exact ASCII texts are UTF-8 without BOM/final LF. They are bounded
development profiles, not formal support-profile adoption. Their inherited
profile/hash pairs stay unchanged.

`development-validation-glb-jpeg-1`, **792 bytes**, SHA-256
`a08a1c90496df087b1cd454dd29177ff3da7fdc8b5ebfb07156189479a8f8db8`:

```text
LociView development validation GLB JPEG 1. Inherit development-validation-glb-1@077c5da2241deb7956026fe20376dee9301d70b29d10a436d673f37909e4186f exactly except embedded image admission: PNG remains unchanged; JPEG follows companion 07d JPEG-1 with JFIF immediately after SOI, SOF0/1/2, 8-bit one Y or three ordered YCbCr components, no DNL, complete bounded codestream and actual decode. Require Exif orientation absent or 1; reject invalid, duplicate or conflicting orientation. Ignore ICC and other image color metadata for textures; preserve existing material-role transfer functions, UV and alpha semantics. Decode with colorSpaceConversion none and no resize; retain original GLB/JPEG bytes including metadata. No external resources or other new feature. Not a ratified support profile.
```

`development-validation-glb-occurrence-jpeg-1`, **752 bytes**, SHA-256
`63c0b3828fbf76ab6f92807d412b5680146965c2c9be8d12c12fb30e3d681fdb`:

```text
LociView development validation GLB occurrence JPEG 1. Inherit development-validation-glb-occurrence-1@9bbf1243a3786d54a6439104614c46e502a3cdfa20dc9e9d610ee1da42cf059f exactly except replace its embedded-PNG-only admission with development-validation-glb-jpeg-1@a08a1c90496df087b1cd454dd29177ff3da7fdc8b5ebfb07156189479a8f8db8. Keep selected-scene occurrence enumeration, ordinal slots, source material semantics, per-occurrence clones, bijective Three 0.180.0 parser-association proof and original source surface identities unchanged. Conversion witnesses bind each Representation's actual exact profile, original GLB, layout and slot; ordinary sharing rederives public GLB/profile facts without private witness export. Not a ratified support profile.
```

Only a retained Representation containing declared embedded JPEG selects its new
profile; a JPEG photo alone never relabels a PNG-only model. PNG-only models keep
their existing exact profile, including within a new-recipe conversion. Recheck
every embedded image under the inherited all-content rules, including unused
image declarations; do not hide an unsupported image outside the selected Mesh.
Never retry an old reader/profile refusal as a new profile merely to make it pass.

## Four new recipes, exact inherited keys

Fresh conversion may select a new recipe only after source-authoritative admission
establishes that an output JPEG media resource or embedded JPEG in a retained
Representation is required. Filename, deleted/unlinked/source-only JPEG and
unrelated origin CAS presence do not select a recipe or admit a resource. A
non-JPEG input uses its existing recipe; all unrelated refusal conditions remain.
Here unlinked means a source-only payload without an admitted target record;
an already admitted/registered target media resource still counts when it has
no current Caption attachment, preserving each base recipe's resource scope.
Selection is internal to the same file-open/convert intent, not a format choice
the user must make. A new recipe gives every new record its new domain; do not
mix old/new domains within one conversion.

| New immutable recipe | Exact base grammar/mapping inherited |
|---|---|
| `native-project-scene-recipe-3` | 07 §5.3 recipe-1, no appearance records; all source keys, including material-index slots and nested lifecycle events, unchanged |
| `native-project-scene-recipe-4` | 07a recipe-2 with nonempty admitted appearances; occurrence-pair slots, override keys, quantizer/subset and one-retained-Representation addressed-family rule unchanged |
| `v1-project-scene-migration-recipe-2` | 07b recipe-1, including attachment array occurrence, ordering, retained/deleted/source-only accounting and exact closed source keys |
| `locimyu-project-scene-migration-recipe-2` | 07c recipe-1, including unchanged 04 Caption identity/full digest, exact workbook path, decoded row ordinal, complete relation confirmation, private report and attachment index zero |

For each new recipe use its literal name in the existing preimage domain:

```text
"lociview:" + recipe + ":id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

For the LociMyu recipe only, preserve its extra workbookPath element:

```text
"lociview:locimyu-project-scene-migration-recipe-2:id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,workbookPath,outputPrefix,sourceKey])
```

The escape is one LF; no BOM/final LF, normalization, salting or random collision
fallback. Output is `prefix + '_' + fullSha256.slice(0,32)` with full evidence
retained. Closed output-kind/key and source-preservation rules are inherited
from the indicated exact base recipe. One additive collision requirement applies
to all four new recipes: reject equal full digests for different preimages across
all output prefixes, as well as shortened target-ID collisions, duplicate
canonical keys and incompatible output kinds. This does not add that stronger
cross-prefix requirement retrospectively to the old Native/v1 recipes.
Repeated lookup of the identical entity/binding is permitted; distinct source
entities must not acquire one canonical key by overwrite or winner selection.
New-recipe mapping evidence is
ordered by ASCII target ID independently of digest completion order. This does
not revise old receipts' byte interpretation.

Native recipe-4 witnesses bind each Representation's actual old/new occurrence
profile/hash, source GLB, pair/ordinal/slot and target layout. A photo-only JPEG
conversion still witnesses old occurrence-profile Representations. Exact initial
source/proof, original archive, recipe/source/appearance dispatch, full expected
records and all mappings are checked before persistence/cold publication. New
recipes use the independent initial-origin binding plus exact initial receipt
as in 07b/c, adding only these four closed recipe cases. Existing Native1/2,
v1-1, LociMyu1 and generic-creation evidence/ready timing are not reinterpreted.
Retain captured IDs and Automerge changes; completed retry preserves later edits,
missing acknowledged evidence is refusal and never regeneration/repair permission.
Private original/mapping/report/witness data stays out of ordinary package output.

### Identity vectors

Fix conversionId to 32 zeroes, sourceZipSha256 to 64 ones and workbookPath to
`data.xlsx`. All inherited Native/v1 source IDs below are literal synthetic IDs.
For LociMyu, `C0` is the unchanged 04/07c pair
`['cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40','1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309']`.
Lengths include the complete UTF-8 domain and compact tuple above. Initial
Automerge/record vectors are implementation-fixture acceptance, not invented here.

| Recipe | Prefix | Exact sourceKey | Bytes | Full SHA-256 |
|---|---|---|---:|---|
| `native-project-scene-recipe-3` | `med` | `["media","med_00000000000000000000000001"]` | 201 | `eed0d039ede87befc0368cc953593029db3f4e5d7743fec386edb14af6a0c99f` |
| `native-project-scene-recipe-3` | `slot` | `["material-slot","rep_00000000000000000000000001","gltfMaterial",0]` | 227 | `f9c8b341c41b44848841e4c016181f808969102a3c14b1c414f2179c5bcf7a1c` |
| `native-project-scene-recipe-4` | `slot` | `["material-occurrence","rep_00000000000000000000000001",0,0]` | 220 | `9ae5413dd3d4d961c8bd47bbc0c5cd7b13598924060a94e4fd7d646c22d1b1d5` |
| `native-project-scene-recipe-4` | `evt` | `["initial-event","ovr",["mesh-appearance","mat_00000000000000000000000001"]]` | 235 | `298882c816fe1c49ab87335339295fe4b91b335430efbde5bce102239b606f43` |
| `v1-project-scene-migration-recipe-2` | `rep` | `["model-representation","ast_00000000000000000000000001"]` | 222 | `7e6ad124bfcf254fe6eedf23b3abb22a050faf82cc2010951bac464dad0650f9` |
| `v1-project-scene-migration-recipe-2` | `att` | `["attachment","cap_00000000000000000000000001",1,"ast_00000000000000000000000002"]` | 247 | `6765b874139010d9d3e485dfb6b923285c6dc4ff8edc8dbd749f413456080eee` |
| `locimyu-project-scene-migration-recipe-2` | `cap` | `["caption",["cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40","1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309"]]` | 295 | `d054863797cf33ee967162eae0979fb45cd0e63042b871cf947e2cc1ee55d2a4` |
| `locimyu-project-scene-migration-recipe-2` | `att` | `["attachment",["cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40","1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309"],0,"media/写真.jpg"]` | 319 | `40a267791106b0d85532d628f4d28b70716116a074ad543046b8e4179f394e95` |

## Narrow implementation ports and acceptance

For implementation, add a bounded `projectFiles/jpeg.ts` inspector and typed JPEG
decoder usage (`photo` versus `glb-texture`); keep PNG's existing API/behavior.
Use existing content/blob/fact lifetimes, typed Session commands and raw package
services. Extend only named GLB/occurrence/profile/material validators, content
inspection, converter source/mapping/recovery, validation viewport/photo adapters
and exact import allowlists needed by this workflow. UI receives verified bytes
through current provider/host ports, never source filenames/URLs as image sources.
No UI storage access, decoder CDN, generic migration framework or new package
purpose. Existing five-purpose wire and map2/schema2.1 stay unchanged.

Reuse service faults and one representative connected raw-file workflow per
changed integration boundary. Cover JFIF/Exif-only photo, all eight orientations,
dimension swap, ICC intent separation, embedded grayscale/YCbCr and progressive
JPEG, malformed/truncated/oversized/extra-image/Exif/EOI rejection and decoder
failure/close. Verify fresh direct input and the four exact recipes/profiles;
prove PNG-only dispatch and old prepared receipts remain unchanged. Preserve
equal-byte distinct resources and attachment occurrences, named backup/Workspace/
review privacy, detached-media owned-evidence loss fences, cold initial recovery
and later-edit retry isolation. Recompute hashes/vectors independently and use
existing exact boundary tests plus one final serial checkpoint and read-only
diff/security review. Rendering/orientation and mobile behavior need the grouped
browser/device lane; injected decode/recorded DOM cannot satisfy it.

This exact choice/profile/recipe companion is ratified for bounded implementation.
Stop only affected work for an actual spec conflict/new scope,
managed authority or release boundary. Broader image/model formats and material
semantics remain required future companions; this proposal does not adopt them.
