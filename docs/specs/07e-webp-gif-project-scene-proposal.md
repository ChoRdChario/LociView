# WebP and GIF photo attachment companion

Status: **PO RATIFIED 2026-10-15 — bounded implementation verified in the nondefault route; not adopted.**
The PO explicitly approved this exact companion on 2026-10-15. Executed checks and
remaining evidence are recorded in [todo](../../tasks/todo.md). This is a separate
connected implementation after [07d](07d-jpeg-project-scene-proposal.md); approval
does not activate ordinary entry or pass browser/device/adoption gates.

## Connected result and ratified decision

Add/open a WebP or GIF photo, or convert an admitted Native/frozen-v1/LociMyu
input containing one → Caption editing/placement and image organization/viewing
→ named backup/Workspace/independent review → restore/edit/cold reopen in the
existing nondefault validation/product route. Preserve the original image bytes
and metadata. Keep Native's existing raw-Blob-to-`img` display behavior, including
any animation the browser displays; do not introduce flattening or an animation
rejection policy. Animation controls, synchronized playback, timing/loop/color/
orientation equivalence across browsers and devices are not promised.

This extends the existing accepted image-format scope in [02](02-storage-package-migration.md)
and [04](04-locimyu-conversion.md) through new target recipes. It does not change
the four PNG/JPEG GLB profiles, existing recipes/prepared jobs or [07a](07a-native-appearance-conversion-proposal.md)'s
appearance subset. GLB WebP/GIF textures/extensions, other formats, active chroma/
fractional opacity, ordinary entry, dependencies, adoption and release are excluded.

## Closed photo admission and display boundary

Classify owned bytes, never file name/type hints. Walk the complete container
under the existing caller's file/item/work/pixel budgets before admission; no
header-only or bounded-prefix success. Refuse truncated/overflowing structures,
conflicting reconstruction declarations, out-of-bounds frame rectangles, missing
image payload or extra trailing/second-container bytes. Retain safe opaque
metadata/unknown blocks in place; never follow their URLs or executable content.

| Format | Ratified byte subset |
|---|---|
| WebP | Exact RIFF/WEBP size and complete padded chunks; simple VP8/VP8L and extended VP8X, alpha and ANIM/ANMF forms. Check declared canvas, feature/reconstruction ordering, recognized chunk multiplicity, frame bounds and nested frame-image/alpha payload structure. Preserve bounded EXIF/XMP/ICCP and unknown chunks as opaque bytes. No new Exif parser, TIFF carrier interpretation or metadata-to-Project authority. |
| GIF | Exact GIF87a/GIF89a header, positive logical canvas, complete global/local color tables, image descriptors/frame bounds, image-data subblocks and terminal trailer at EOF. Check LZW minimum-code-size/container framing and standard extension/control block lengths/references; retain application/comment/other bounded extension payloads without promoting them into Project text or controls. Require an image payload. No JavaScript LZW/pixel decoder. |

Count all chunks/blocks/frames against the existing item/work budgets; account
inspected bytes and cumulative frame-canvas pixel work with checked arithmetic
against existing `maxValues`, and each logical canvas against `maxPixels`.
Do not add a new frame-count constant, duration limit or product capacity promise.
Compressed coefficient/LZW/VP8 decoding remains with the browser decoder.

Require an actual temporary bitmap from the original owned Blob with its exact
checked MIME, `imageOrientation:'from-image'`, `colorSpaceConversion:'default'`,
`premultiplyAlpha:'none'` and no resizing. Always close temporary bitmaps on
success, failure and stale completion. GIF bitmap dimensions must match its
logical canvas. Since WebP Exif remains opaque and browser behavior can differ,
WebP decoded dimensions must equal exactly the declared `(width,height)` or
its exact transpose `(height,width)`; no other dimensions are accepted. This
checks bounded raster geometry, not Exif application or correct orientation.
Do not infer a tag, rotate, normalize or re-encode from the observed dimensions.

The displayed image remains the original checked Blob through the shared `img`
viewer. Browser color/metadata/animation interpretation is inherited; the
verification bitmap never replaces or flattens the original. All-frame container
inspection and a successful bitmap decode do **not** prove every animation
frame's pixel decoding or playback. Browser/device evidence remains separate.
In particular, [HTML's Blob bitmap algorithm](https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#dom-createimagebitmap-dev)
selects the default image or first frame of an animation. Structure references:
[WebP container](https://developers.google.com/speed/webp/docs/riff_container),
[GIF89a](https://www.w3.org/Graphics/GIF/spec-gif89a.txt), read 2026-10-15.

Original shooting/location/comments/application metadata may be shared. Inherit
[05 §7.3](05-project-scene-team-workflow.md)'s
existing disclosure, without a sanitization purpose, stripping dialog or claim.

## Four additive immutable recipes

Select internally only when source-authoritative admission produces a retained
`image/webp` or `image/gif` media resource. An admitted registered resource counts
even when unattached; a deleted/unlinked/source-only payload, filename or unrelated
origin CAS does not. PNG/JPEG-only conversions keep their existing recipe.
Mixed admitted WebP/GIF/JPEG/PNG uses one new recipe domain for all new records.
Unrelated old-recipe refusal must not fall back to these domains.

| Ratified recipe | Exact base mapping/key grammar inherited |
|---|---|
| `native-project-scene-recipe-5` | 07d recipe-3 / original recipe-1 keys; no appearance records |
| `native-project-scene-recipe-6` | 07d recipe-4 / 07a recipe-2 keys and admitted appearance subset |
| `v1-project-scene-migration-recipe-3` | 07d recipe-2 / 07b recipe-1, including attachment array occurrence and source-only accounting |
| `locimyu-project-scene-migration-recipe-3` | 07d recipe-2 / 07c recipe-1, unchanged 04 Caption identity/full digest, workbook path, row ordinal and complete confirmation |

Every retained Representation keeps its actual exact PNG/JPEG base/occurrence
profile. Photo-only WebP/GIF never changes a model profile; recipe-6 witnesses
bind each actual old/new occurrence pair. No fifth GLB profile is created.

The exact preimage is UTF-8, without BOM/final LF or normalization:

```text
"lociview:" + recipe + ":id:jcs-v1\n"
+ JSON.stringify([conversionId,sourceZipSha256,outputPrefix,sourceKey])
```

For LociMyu only, insert `workbookPath` between sourceZipSha256 and outputPrefix.
The escape denotes one LF. Target ID remains `prefix+'_'+fullSha256.slice(0,32)`.
Inherit the closed base output kinds, full evidence, equal-byte distinct resource
identities and attachment occurrence keys. Reject full-hash collisions across
prefixes, shortened-ID collisions and incompatible/duplicate entity bindings;
identical repeated lookup is permitted. Sort mapping evidence by ASCII target ID
independently of asynchronous digest completion. No old domain is reinterpreted.

Use the exact independent initial-origin binding and closed initial/conversion
receipts with only these four new literals. Recompute source-derived dispatch,
per-Representation profile, expected records and mappings against captured
identity before persistence or converter cold publication/explicit completed
retry; never regenerate initial changes or repair acknowledged evidence. Ordinary
ready opening and later-edit retry keep their existing lifetime and do not gain
a requirement to reread private conversion input. Private source/report/witness
remains outside ordinary five-purpose package output.

### Identity vectors

Fix conversionId to 32 zeroes, sourceZipSha256 to 64 ones and workbookPath to
`data.xlsx`. `C0` is the unchanged 04/07c Caption/full-digest pair printed below.
Lengths include the complete domain and compact tuple; initial graph acceptance
belongs to implementation fixtures, not a second metadata generator.

| Recipe | Prefix | Exact sourceKey | Bytes | Full SHA-256 |
|---|---|---|---:|---|
| `native-project-scene-recipe-5` | `med` | `["media","med_00000000000000000000000001"]` | 201 | `4e8be5b7cbedf823648485ce5ba63ec71ff662c62608bae55ce903765160bbdc` |
| `native-project-scene-recipe-5` | `att` | `["attachment","cap_00000000000000000000000001",1,"med_00000000000000000000000002"]` | 241 | `1ab3f2b01f97f6a7bf7373b47f6161246309028056815dc633d40f107248b3f2` |
| `native-project-scene-recipe-6` | `slot` | `["material-occurrence","rep_00000000000000000000000001",0,0]` | 220 | `e5e81ada851e55aeab6abfbf381f6aae1e47fb0515fc5fb571cd889159c46fce` |
| `native-project-scene-recipe-6` | `evt` | `["initial-event","ovr",["mesh-appearance","mat_00000000000000000000000001"]]` | 235 | `bc85882e9919aff77b4d384f1f48603f47b63ff0cb8bfd21d8e1cdf2d5c123a5` |
| `v1-project-scene-migration-recipe-3` | `med` | `["media","ast_00000000000000000000000002"]` | 207 | `f6d51a8091c97ec364a8a75cbf2e2ad7d791e125208f84154d294ff8f610aee0` |
| `v1-project-scene-migration-recipe-3` | `att` | `["attachment","cap_00000000000000000000000001",1,"ast_00000000000000000000000002"]` | 247 | `c8ce8906da7bcdb53d4a8131fbe98db7d0256520b0f7be0100ef79c0696b6e43` |
| `locimyu-project-scene-migration-recipe-3` | `med` | `["media","media/写真.webp"]` | 211 | `101666434ca0943ff5793868c9de599ab49037551edae7ea655d48a3cec28142` |
| `locimyu-project-scene-migration-recipe-3` | `att` | `["attachment",["cap_0TVSSJ69V3DJPVB0ZMWRGZ7J40","1ade732327636cadb583f4e621f3c880e14d093ec00523b35cafee626bbc3309"],0,"media/写真.gif"]` | 319 | `8ac115a0759e7ca4992dc49937bc9a2e68dc65868c2cd7db16185eb8e7b5a343` |

## Narrow ports and acceptance

Use bounded format inspectors and a typed temporary photo decoder through the
existing image/content/fact/provider/shared-viewer/file/generation ports. Preserve
all existing PNG/JPEG positional APIs, decoder defaults and evidence lifetimes.
No new image backend, storage schema, runtime dependency or general migration
framework. Keep whole-operation refusal/source preservation and exact captured
retry. Browser unsupported decode remains an explicit failure, not MIME fallback.

Reuse existing service faults and one representative connected file workflow per
changed integration boundary. Cover real compressed lossy/lossless/alpha and
animated WebP, static/animated/palette/interlaced GIF, complete late-frame
structure inspection, budgets/truncation/trailing/malformed references, decoder
failure/dimension bounds/close and original Blob MIME/bytes. Verify four exact
recipe vectors, PNG/JPEG-only and source-only non-dispatch, per-Representation
profiles/witnesses, duplicate attachment/resource preservation, interrupted/cold
initialization, downgrade/lost-origin refusal, later edits, detached-owned loss,
named backup/Workspace/review privacy and restore/current-generation reopen.
Actual image orientation/color/playback and mobile behavior need the grouped
browser/device lane; Node bitmap injection is not that evidence.

Obtain independent compatibility/security/UI reviews and one final serial
checkpoint at the connected source/test boundary. Stop affected work for a real
contract/authority/scope conflict. The recorded PO ratification authorizes this
bounded implementation; ordinary implementation and checks need no renewed approval.
