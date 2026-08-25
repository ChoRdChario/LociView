# Storage, package and migration specification

> Status: `PRODUCT-OWNER APPROVED / NOT IMPLEMENTED`

## 1. Scope and candidate status

This document defines durable metadata, binary storage, package exchange, merge semantics and v1 conversion. It does not adopt Automerge or a hashing/ZIP dependency. The leading candidate is Automerge metadata with Automerge Repo browser storage plus an OPFS SHA-256 content-addressed blob store (CAS); adoption requires every G1 storage gate in this document and `03-gates-and-delivery.md` to pass.

The production boundary is:

```text
UI/domain command
  -> ProjectSession
       -> MetadataRepository
       -> AssetTransactionService
            -> TransactionJournal
            -> BlobStore
  -> PackageService
  -> V1MigrationService
```

Automerge types, OPFS paths, ZIP entries and renderer objects MUST remain behind these ports.

## 2. Truth layers

| Layer | Responsibility | Not responsible for |
|---|---|---|
| `ProjectDocV2` | Mergeable logical metadata and semantic intent | Binary bytes, UI session, renderer state |
| `MetadataRepository` | Open/change/merge/conflict inspection/durability barrier | Asset streaming and package layout |
| `BlobStore` | Verified immutable byte streams addressed by digest | Logical asset identity |
| `TransactionJournal` | Recovery across metadata/blob durability boundaries | Domain merge policy |
| `PackageService` | Streamed import/export and package-purpose closure | Live editing state |
| local UI state | Selection, gizmo, pending camera, preferences, diagnostics | Shared project truth |

`ProjectDocV2` is the logical source of truth. The local repository and CAS are the durable working copy. A `.lociview` package is an exchange/backup container; download initiation is not proof that the user retained the file.

UI MUST distinguish `queued`, `durable on this device`, `package generated/download started`, and `failed`. It MUST NOT label a memory-only change as saved.

## 3. Metadata model

Conceptual root:

```ts
interface ProjectDocV2 {
  schema: { major: 2; minor: number };
  identity: {
    projectId: ProjectId;
    historyEpoch: HistoryEpoch;
    lineageSeed: string; // 32 random bytes, lowercase hex
  };
  project: Project;
  assetsById: Record<AssetId, Asset>;
  assetRevisionsById: Record<AssetRevisionId, AssetRevision>;
  assetBindingsById: Record<AssetBindingRevisionId, AssetBindingRevision>;
  representationsById: Record<RepresentationId, Representation>;
  mediaResourcesById: Record<MediaResourceId, MediaResource>;
  captionsById: Record<CaptionId, Caption>;
  captionAttachmentsById: Record<CaptionAttachmentId, CaptionAttachment>;
  captionTagsById: Record<TagId, CaptionTag>;
  captionTagMembershipsById: Record<TagMembershipId, CaptionTagMembership>;
  displaySetsById: Record<DisplaySetId, DisplaySet>;
  viewsById: Record<ViewId, SavedView>;
  materialOverridesById: Record<OverrideId, MaterialOverride>;
  migrationSupport?: MigrationSupportV1;
}

interface BlobRef {
  algorithm: 'sha256';
  digest: string;       // 64 lowercase hexadecimal characters
  byteLength: number;   // safe non-negative integer
  mediaType: string;
}

type EntityLifecycle =
  | {
      state: 'active';
      eventId: LifecycleEventId;
      reason?: 'initial' | 'restore' | 'migrationResolution' | 'conflictResolution';
    }
  | {
      state: 'deleted';
      eventId: LifecycleEventId;
      reason: 'userDelete' | 'replacement' | 'migrationResolution' | 'conflictResolution';
    };

interface MetadataEnvelope {
  adapter: 'automerge';
  adapterFormatVersion: string;
  lineageProof: {
    kind: 'automerge-root-change-v1';
    rootChangeHash: string;
  };
}
```

### 3.1 ID grammar and semantic limits

Every portable logical ID matches:

```text
^(prj|hep|frm|ast|bnd|rev|rep|fam|lay|slot|cmp|grp|cap|att|tag|tgm|med|set|view|ovr|evt|mig|iss|pkg|snp)_[0-9a-f]{32}$
```

Prefixes identify project, history epoch, frame, asset, binding, revision, representation, variant family, material layout, material slot, anchor compatibility, composite group, caption, attachment, tag, tag membership, media resource, display set, view, override, lifecycle event, migration case, migration issue, package and review snapshot respectively. A nominal ID field accepts only its assigned prefix. New IDs use 128 CSPRNG bits. Deterministic migration IDs use the first 128 bits of a domain-separated SHA-256 and MUST collision-check the full canonical key before reuse. IDs are lowercase ASCII and are never NFC-transformed. SHA-256 values and lineage seeds are exactly 64 lowercase hexadecimal characters.

`MetadataEnvelope.adapterFormatVersion` is 1–64 printable ASCII characters. `rootChangeHash` is the adapter's 32-byte root hash encoded as 64 lowercase hexadecimal characters; the exact pinned Automerge adapter must prove this conversion in its gate. Package versions are 1–128 printable ASCII characters, entry paths are at most 512 UTF-8 bytes after canonical validation, and every declared count/byte length is a non-negative safe integer.

Wire-level semantic ceilings are independent of lower device/package budgets:

| Value | Maximum / grammar |
|---|---|
| Project, asset, set, view, tag and media label | 256 Unicode scalars |
| Caption title / body / attachment alt text | 512 / 65,536 / 4,096 Unicode scalars |
| `orderKey` | `[0-9A-Za-z]{1,64}` |
| MIME type | 127 printable ASCII characters and valid type/subtype syntax |
| FormatProfile or tool ID / tool version | 64 ASCII characters / 128 Unicode scalars |
| Representations or derivation inputs per revision | 4,096 |
| Material slots per catalog | 65,536 |
| Attachments or tag memberships per caption | 4,096 each |
| Selected assets per saved view | 4,096 |
| Entity records / decoded domain nodes | 1,000,000 / 5,000,000 |
| Domain nesting depth | 32 |

Every command and import checks field limits before persistence. Serialized JSON/Automerge entry, history length, archive and device-specific limits are separately fixed by G0/G1 and may be lower; reaching a semantic ceiling never promises that a target device can open that project.

Rules:

- All IDs are canonical opaque identifiers with length and character limits.
- SHA-256 is byte identity, not logical entity identity.
- Immutable representation, media-resource, revision and binding records carry a canonical payload digest and do not carry `EntityLifecycle`. The same ID with different content is invalid, even if a CRDT could merge its fields.
- Mutable entity maps (`Asset`, `Caption`, `CaptionAttachment`, `CaptionTag`, `CaptionTagMembership`, `DisplaySet`, `SavedView` and `MaterialOverride`) never remove an entity to express a user deletion. Each entity carries an explicit lifecycle tombstone; clean/review snapshots may omit resolved tombstones. The singleton `Project` is not deletable inside its own metadata document; local workspace deletion is outside mergeable project state.
- Immutable record maps are append-only in a collaboration lineage. Logical retirement means loss of every current/conflict/retention strong root; it never edits/removes the record or reuses its ID. An unreferenced blob may later be collected, but immutable metadata remains available for merge validation and diagnosis.
- Collections use ID-keyed maps and field-level changes. Arrays such as attachments are not replaced wholesale for independent membership edits.
- Fields declared atomic by the domain (`EntityLifecycle`, `Asset.status`, caption anchor, saved camera/background/presentation, and material routing/appearance/compositing) change only through whole-value commands. The adapter must encode each as one conflictable canonical value or an immutable-value ID and return complete candidates; nested mutation APIs are forbidden. If the pinned metadata library cannot preserve whole candidates under concurrent replacement, it fails the gate.
- `AssetRevision` and `AssetBindingRevision` cannot be modified after creation. A conflict inside an immutable record makes it invalid and prevents activation.
- The ownership and frame-equality invariants in `01-domain-rendering.md` are package/import/command validation boundaries. Syntactically valid cross-asset bindings, revisions, parent links or cross-frame anchors/views are invalid and cannot enter authoritative metadata or SceneDocument.
- OPFS path, object URL, local absolute path, engine handle, backend render flag and Automerge document URL are not portable domain fields.
- Unknown minor fields are retained and ignored within an editable collaboration lineage. Because an older writer cannot infer their semantic or privacy effect, every unrecognized field blocks history-free export unless the pinned snapshot builder explicitly recognizes it through a versioned copy/omit policy. Unknown major schema is read-only or rejected before any durable change.
- A known-field edit preserves every unknown sibling/nested subtree byte-semantically after canonical decoding, including inside an atomic value. If changing a discriminator would make preservation impossible, the older writer blocks that command. No command rebuilds a known-only object from a lossy DTO.
- Numbers are finite and bounded. Validators enforce object depth, node count, collection count, string length and serialized byte budgets.
- Dangerous keys including `__proto__`, `prototype` and `constructor` are rejected recursively. Temporary indexes use `Map` or null-prototype objects.
- Persisted v2 structural strings and known single-line portable fields reject C0 (`U+0000`–`U+001F`), DEL/C1 (`U+007F`–`U+009F`) and line separators `U+2028/U+2029`. `Caption.body` alone may contain TAB, LF and CR among those characters; it preserves their exact scalar sequence and does not normalize newline style. Unknown legacy evidence follows the separate raw-evidence contract below and is not silently promoted into a v2 field.

### 3.2 Canonical bytes and digests

`LociCanonicalJsonV1` is RFC 8785 JSON Canonicalization Scheme after LociView domain validation. Command boundaries normalize user-authored portable strings to NFC before persistence. Persisted v2 domain strings MUST already be NFC; the canonical encoder rejects rather than silently changes a non-NFC stored value. Before object construction or encoding:

- raw JSON is parsed by a duplicate-aware reader that rejects repeated member names before ordinary object construction; input MUST be valid Unicode scalar text, and two distinct keys that would become equal under NFC are also rejected;
- every persisted portable string and object key is already NFC; IDs/references use the ASCII-only ID grammar; opaque legacy evidence remains raw bytes outside canonical domain records;
- object keys are included and ordered by RFC 8785; every retained unknown minor field is included;
- numbers are finite IEEE-754 values; integer fields are safe integers; negative zero normalizes to zero;
- quaternion and transform values use the canonical rules in `01-domain-rendering.md` before encoding;
- arrays retain semantic order; set-like values are represented as ID-keyed maps or sorted by their specification;
- a record's `payloadDigest`, repository clocks and CRDT metadata are excluded from that record's payload.

All prefixes below are the exact ASCII bytes shown, including the final line-feed byte `0x0a`. `JCS(x)` means UTF-8 encoding of RFC 8785 canonical JSON after the validation above. Concatenation is byte concatenation, and every result is lowercase SHA-256 hex.

Immutable payload digests use exactly one of these record-kind tokens and prefixes:

| Record | Kind token | Exact ASCII prefix |
|---|---|---|
| `Representation` | `representation` | `lociview:v2:immutable:representation:jcs-v1\n` |
| `AssetRevision` | `asset-revision` | `lociview:v2:immutable:asset-revision:jcs-v1\n` |
| `AssetBindingRevision` | `asset-binding-revision` | `lociview:v2:immutable:asset-binding-revision:jcs-v1\n` |
| `MediaResource` | `media-resource` | `lociview:v2:immutable:media-resource:jcs-v1\n` |

For each row, `payloadDigest = SHA256(ASCII(prefix) || JCS(record without payloadDigest))`. A placeholder or implementation-defined spelling of `record-kind` is invalid.

V1 operation evidence uses a separate canonical projection because legacy strings were not required to be NFC. Its closed wire shape is:

```ts
type V1EvidenceValue =
  | null
  | boolean
  | number
  | string
  | readonly V1EvidenceValue[]
  | V1EvidenceObject;

interface V1EvidenceObject {
  readonly [key: string]: V1EvidenceValue;
}

interface V1CanonicalOperationBase {
  op: number;
  hlc: string;
  actor: string;
  user: string;
  e: string;
  id: string;
}

type V1CanonicalOperation =
  | (V1CanonicalOperationBase & {
      t: 'create' | 'update';
      v: V1EvidenceObject;
    })
  | (V1CanonicalOperationBase & {
      t: 'delete';
      v?: never;
    });
```

The duplicate-aware parser accepts exactly the seven common members `op`, `hlc`, `actor`, `user`, `t`, `e` and `id`. `create`/`update` additionally require a present, non-null plain-object `v`; `delete` requires `v` to be absent. `null` is never equivalent to absence. Any extra top-level member, missing member or wrong type creates a migration issue and leaves the raw line as opaque evidence; it does not produce a canonical operation or enter the reducer. `v` is a plain JSON object whose complete recursively nested member/value tree—including unknown entity fields—is retained. Duplicate raw keys, invalid Unicode scalar text, dangerous keys (`__proto__`, `prototype`, `constructor`), non-finite decoded numbers, excessive depth/nodes/strings or an NFC collision between two object keys are rejected before ordinary object construction.

Legacy evidence strings and keys are **not Unicode-normalized** for the operation digest. Their decoded Unicode scalar sequence is preserved exactly; RFC 8785 orders and encodes it without an NFC preprocessing step. Call this byte encoder `LegacyJcsV1`. Thus NFC/NFD differences in the same `(actor, op)` are divergent unless the raw scalar sequences are identical. Normalization to v2 is a later field-aware migration step and cannot change duplicate-operation equality.

Canonical evidence acceptance is distinct from active-field acceptance. A JSON-escaped control remains a valid scalar in unknown/raw `v` evidence and therefore participates in the digest. Before a known operation enters the v1 reducer or v2 mapping, its field policy is applied: structural fields use the ASCII grammars below; known single-line values reject C0/C1 controls; caption body permits TAB, LF and CR exactly; a disallowed control creates an issue/quarantine while retaining raw evidence. G0-S open/merge and v2 migration share this parser, field table and golden corpus, so neither path may apply a recursive blanket control filter.

The remaining operation validation is exact:

- `op` is a safe integer from 1 through `Number.MAX_SAFE_INTEGER`;
- `actor` matches case-sensitive ASCII `^a_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{13}$`;
- `hlc` is `<ISO>-<counter>-<actor>` where `<ISO>` is exactly 24 ASCII bytes in UTC millisecond form, parses to a finite instant and round-trips through `Date.toISOString()` byte-for-byte, `<counter>` is exactly four lowercase hexadecimal digits, and the suffix equals the operation's `actor`;
- `user` is empty for legacy anonymous evidence or matches case-sensitive canonical `usr_` plus the ULID grammar defined below;
- `e` is 1–32 Unicode scalars and `id` is 1–128; neither is normalized for evidence equality, and neither may equal a reserved prototype key. For known v1 kinds, `id` must have the canonical prefix/ULID pair `set/set`, `caption/cap`, `view/view`, `material/mat`, `asset/ast`, `profile/usr`, or `meta/meta`. The sole reader/migration exception is a `caption` ID matching exact ASCII `^cap_LM[0-9A-HJKMNP-TV-Z]{24}$`, the historical LociMyu converter class frozen by `04-locimyu-conversion.md`; it may remain active and be referenced by later update/delete operations, but a new converter or allocator never synthesizes it. A near-miss or its use with another known kind is invalid. An unknown kind/ID remains canonical evidence but cannot create active v2 state without a registered migration policy.

`canonicalOperationDigest = SHA256(ASCII("lociview:v1:operation:jcs-v1\n") || LegacyJcsV1(operation))`. Object member order and insignificant JSON whitespace do not affect it; string normalization, absent/null and unknown payload fields do.

The source-set wire value and fingerprint are exact:

```ts
interface MigrationSourceSetV1 {
  sources: readonly {
    sha256: Sha256Hex;
    byteLength: number;
  }[];
}
```

Each source tuple is validated, exact duplicate tuples are removed, the same digest paired with a different length is rejected, and the remaining tuples are sorted by `sha256` then numeric `byteLength`. `sourceSetFingerprint = SHA256(ASCII("lociview:v2:migration-source-set:jcs-v1\n") || JCS({ sources }))`.

The canonical v1 ULID suffix is case-sensitive ASCII `^[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$`; aliases, lowercase, ambiguous `I/L/O/U`, wrong length and non-ASCII are invalid. A valid v1 project identifier is exactly `^prj_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$`. Missing, `null`, non-string or noncanonical values are reported as absent/invalid evidence and are never silently repaired.

`legacyLineageKey` is also a 64-character lowercase SHA-256. If at least one selected copy has a valid v1 project identifier, all valid identifiers MUST match byte-for-byte and that identifier chooses the project-ID route. A source with a missing/invalid identifier may join that selected set only through an explicit recorded lineage decision; a disagreeing valid identifier blocks the set. If no selected copy has a valid identifier, use the source-root route. The project-ID preimage is:

```text
ASCII("lociview:v2:legacy-lineage:v1-project-id:jcs-v1\n")
|| JCS({ "projectId": <validated canonical ASCII v1 project identifier> })
```

When no selected copy has a valid project identifier, sort the initial source tuples by `sha256` then `byteLength`, choose the first, and use:

```text
ASCII("lociview:v2:legacy-lineage:source-root:jcs-v1\n")
|| JCS({ "sha256": <chosen digest>, "byteLength": <chosen length> })
```

The first conversion freezes this key; later evidence never changes it. A disagreeing valid identifier is a lineage conflict, not another source-root candidate, and a later missing/invalid source requires the same explicit review rule.

Every enabled v1 migration build carries one ratified semantic recipe companion that closes byte/container detection order, per-format validation, contribution/material extraction, every default/omission/order rule and normative vectors. Its portable descriptor is:

```ts
interface V1MigrationRecipeDescriptorV1 {
  schema: 'lociview-v1-migration-recipe-descriptor-1';
  recipeId: 'v1-migration-recipe-1';
  specificationSha256: Sha256Hex;
  goldenManifestSha256: Sha256Hex;
  canonicalizer: 'legacy-jcs-v1';
  immutableBuilder: 'lociview-v1-immutable-builder-1';
}
```

`specificationSha256` hashes the exact UTF-8 bytes of the ratified recipe companion and `goldenManifestSha256` hashes its canonical manifest of input hashes, expected inspection bytes, complete output record bytes and expected issues. `recipeDescriptorDigest = SHA256(ASCII("lociview:v2:v1-migration-recipe-descriptor:jcs-v1\n") || JCS(descriptor))`. This document reserves the recipe ID but does not invent those two hashes: the canonical-conversion gate immediately before production-sequence step 8 must ratify the companion and manifest before any durable conversion is enabled. Every implementation, browser worker and test runtime must use that exact descriptor and pass every vector. A semantic change requires a new recipe ID and descriptor; migration is disabled rather than falling back to another detector.

Within the product, one `recipeId` is permanently bound to exactly one descriptor digest. The ratified companion and normative golden manifest are bitwise immutable; editorial guidance and additional non-normative regression fixtures live outside those bytes. A descriptor mismatch for an existing `recipeId` fails before planning. Thus `recipeId` is the sole semantic version/ID input, while descriptor hashes prove that an implementation is entitled to use it.

Deterministic migration IDs use this exact preimage:

```text
ASCII("lociview:v2:migration-id:" + kind + ":jcs-v1\n")
|| JCS({ "legacyLineageKey": <64 lowercase hex>,
         "recipeId": "v1-migration-recipe-1",
         "kind": kind, "key": key })
```

The full SHA-256 is retained with the canonical preimage in the migration plan/registry. The portable ID is `<prefix>_` plus the first 32 hex characters. Reuse is allowed only when both the full digest and canonical preimage match; a truncated collision aborts conversion. Any canonical inspection, key matching or immutable payload change requires a new `recipeId`; an implementation cannot reinterpret an existing ID by substituting another descriptor.

The output kind/prefix table is closed for v1 conversion:

| `kind` | Prefix | `key` recipe |
|---|---|---|
| `frame` | `frm` | `projectSupport/projectFrame`, or `assetSupport/assetFrame` |
| `asset` | `ast` | `v1Entity/asset` |
| `asset-binding` | `bnd` | `assetSupport/assetBinding` |
| `asset-revision` | `rev` | `assetSupport/assetRevision` |
| `representation` | `rep` | `assetSupport/sourceRepresentation` plus contribution |
| `variant-family` | `fam` | `assetSupport/variantFamily` plus contribution |
| `material-layout` | `lay` | `assetSupport/materialLayout` plus contribution |
| `material-slot` | `slot` | `materialSlot` |
| `anchor-compatibility` | `cmp` | `assetSupport/anchorCompatibility`, or `assetSupport/missingSourceAnchorCompatibility` |
| `composite-group` | `grp` | `compositeGroup` |
| `caption` | `cap` | `v1Entity/caption` |
| `attachment` | `att` | `attachment` |
| `tag` | `tag` | `tag` |
| `tag-membership` | `tgm` | `tagMembership` |
| `media-resource` | `med` | `mediaResource` |
| `display-set` | `set` | `v1Entity/set`, or `projectSupport/fallbackDisplaySet` |
| `view` | `view` | `v1Entity/view` |
| `override` | `ovr` | `v1Entity/material` |
| `lifecycle-event` | `evt` | `lifecycleEvent` |
| `migration-issue` | `iss` | `migrationIssue` |

`key` is exactly one member of this discriminated union; no concatenated free-form key is allowed:

```ts
type LegacyEntityKindV1 = 'meta' | 'profile' | 'set' | 'caption' | 'view' | 'material' | 'asset';
type V1ModelContribution = 'mesh' | 'points';

type MigrationOutputKindV1 =
  | 'frame'
  | 'asset'
  | 'asset-binding'
  | 'asset-revision'
  | 'representation'
  | 'variant-family'
  | 'material-layout'
  | 'material-slot'
  | 'anchor-compatibility'
  | 'composite-group'
  | 'caption'
  | 'attachment'
  | 'tag'
  | 'tag-membership'
  | 'media-resource'
  | 'display-set'
  | 'view'
  | 'override'
  | 'lifecycle-event'
  | 'migration-issue';

type MutableMigrationOutputKindV1 =
  | 'asset'
  | 'caption'
  | 'attachment'
  | 'tag'
  | 'tag-membership'
  | 'display-set'
  | 'view'
  | 'override';

type MigrationLifecycleStateReasonV1 =
  | { state: 'active'; reason: 'initial' | 'migrationResolution' }
  | { state: 'deleted'; reason: 'migrationResolution' };

type MigrationLegacyKeyV1 =
  | { keyKind: 'v1Entity'; entityKind: LegacyEntityKindV1; entityId: string }
  | { keyKind: 'projectSupport'; role: 'projectFrame' | 'fallbackDisplaySet' }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'assetFrame';
    }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'variantFamily';
      contentRevisionKey: Sha256Hex;
      contribution: V1ModelContribution;
    }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'assetRevision' | 'anchorCompatibility';
      contentRevisionKey: Sha256Hex;
    }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'missingSourceAnchorCompatibility';
    }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'sourceRepresentation' | 'materialLayout';
      contentRevisionKey: Sha256Hex;
      contribution: V1ModelContribution;
    }
  | {
      keyKind: 'assetSupport';
      assetEntityId: string;
      role: 'assetBinding';
      contentRevisionKey: Sha256Hex;
      alignmentStateKey: Sha256Hex;
    }
  | {
      keyKind: 'materialSlot';
      assetEntityId: string;
      materialLayoutId: MaterialLayoutId;
      materialKeyRawUtf8Sha256: Sha256Hex;
    }
  | {
      keyKind: 'attachment';
      captionEntityId: string;
      mediaAssetEntityId: string;
      sourceFieldOperationDigest: Sha256Hex;
      sourceOccurrenceIndex: number;
    }
  | {
      keyKind: 'mediaResource';
      mediaAssetEntityId: string;
      mediaRevisionKey: Sha256Hex;
    }
  | { keyKind: 'tag'; labelNfc: string; labelRawUtf8Sha256: Sha256Hex }
  | { keyKind: 'tagMembership'; captionEntityId: string; tagId: TagId }
  | { keyKind: 'compositeGroup'; assetEntityId: string; sourceKeyRawUtf8Sha256: Sha256Hex }
  | ({
      keyKind: 'lifecycleEvent';
      targetKind: MutableMigrationOutputKindV1;
      targetFullDigest: Sha256Hex;
      previousEventId: LifecycleEventId | null;
      transitionEvidenceKind: 'v1Operation' | 'migrationDecision' | 'syntheticInitial';
      transitionEvidenceDigest: Sha256Hex;
    } & MigrationLifecycleStateReasonV1)
  | { keyKind: 'migrationIssue'; issueKind: string; sourceSha256: Sha256Hex; locator: string };
```

`MigrationOutputKindV1` is the exact `kind` column of the table. Both `keyKind` and any slash-suffixed discriminator must match the table row; other combinations are invalid. Legacy entity IDs and `assetEntityId`/`captionEntityId`/`mediaAssetEntityId` are canonical v1 IDs. `missingSourceAnchorCompatibility` is valid only for a final v1 model Asset whose required source bytes are unavailable and therefore has no `contentRevisionKey`; it creates one deterministic compatibility class for that logical asset and recipe and is never used in an `AssetRevision.anchorCompatibilityClasses` entry. For a newly discovered legacy attachment occurrence, `sourceFieldOperationDigest` is the agreed canonical digest of the immutable create/update operation that supplied the winning `attachments` field, and `sourceOccurrenceIndex` is that occurrence's zero-based position inside that immutable operation value. These fields seed an ID once; current array position and current MediaResource revision never enter an existing attachment's identity. Every `*RawUtf8Sha256` field hashes the exact pre-normalization UTF-8 scalar sequence with plain SHA-256; it distinguishes legacy identity strings that normalize to the same NFC value without placing raw paths/names in portable identity. `labelNfc` follows the tag-label limit and is paired with `labelRawUtf8Sha256`, so canonically equivalent but byte-distinct legacy tags never collapse silently; tag membership targets the resulting `tagId`. `issueKind` matches `[a-z][a-z0-9.-]{0,63}`, and `locator` is an NFC 1–1,024-scalar package-logical source/line locator that cannot contain an absolute/local path. Labels/locators are not case-folded or path-expanded. Project ID, history epoch, migration case ID, package ID and review snapshot ID are fresh CSPRNG IDs and are never produced by this migration-ID function.

For `lifecycleEvent`, ordinary visibility uses `transitionEvidenceKind: 'v1Operation'` and the `canonicalOperationDigest` of the accepted maximum visibility-writing v1 operation: the winning `lastWrite` for active or winning delete for deleted. If a collision/attachment review decision itself determines visibility without one such operation, use `transitionEvidenceKind: 'migrationDecision'` and the digest of the canonical portable decision value stored in MigrationSupport; a runtime-created actor/HLC is never an ID input. A first-conversion entity has `previousEventId: null`; active uses `reason: 'initial'`, while an initially observed deleted state uses `reason: 'migrationResolution'`. Every later accepted visibility transition uses `reason: 'migrationResolution'` and the current authoritative lifecycle event ID as `previousEventId`. A deleted key with `reason: 'initial'` is invalid. If a later copy leaves visibility unchanged, the existing lifecycle value/event ID is retained rather than minted again. Thus `active -> deleted -> active`, and a later reuse of the same earlier decision, each form a new event chain; replay or unchanged visibility remains idempotent.

The only source-less lifecycle is the recipe-mandated active fallback DisplaySet created when no accepted v1 set exists. It uses `transitionEvidenceKind: 'syntheticInitial'`, `previousEventId: null`, `state: 'active'`, `reason: 'initial'`, and:

```text
transitionEvidenceDigest = SHA256(
  ASCII("lociview:v2:v1-lifecycle-synthetic-initial:jcs-v1\n")
  || JCS({ "legacyLineageKey": legacyLineageKey,
           "recipeId": "v1-migration-recipe-1",
           "targetKind": "display-set",
           "targetFullDigest": targetFullDigest })
)
```

`targetFullDigest` must be the registered full migration digest for `projectSupport/fallbackDisplaySet`. No other target or later transition may use `syntheticInitial`; adding another synthetic mutable entity requires a new recipe companion/version.

#### Portable migration support

Migration continuity is project truth, not a device-local cache. A converted collaboration lineage contains this known technical subtree:

```ts
interface MigrationSupportV1 {
  schema: 'lociview-migration-support-1';
  casesById: Record<MigrationCaseId, V1MigrationCaseV1>;
}

interface V1MigrationCaseV1 {
  id: MigrationCaseId;
  legacyLineageKey: Sha256Hex;
  recipe: V1MigrationRecipeDescriptorV1;
  deterministicIdsByPortableId: Record<string, V1DeterministicIdRegistrationV1>;
  plansByDigest: Record<Sha256Hex, V1MigrationPlanV1>;
  activePlanDigest: Sha256Hex;
}

interface V1DeterministicIdRegistrationV1 {
  portableId: string;
  outputKind: MigrationOutputKindV1;
  fullDigest: Sha256Hex;
  canonicalPreimageBase64Url: string;
}

interface V1MigrationPlanV1 {
  digest: Sha256Hex;
  parentPlanDigest?: Sha256Hex;
  sourceSet: MigrationSourceSetV1;
  sourceSetFingerprint: Sha256Hex;
  decisionRecords: readonly V1MigrationDecisionRecordV1[];
  acceptedMappingBaseline: BlobRef;
}

interface AcceptedV1MappingBaselineV1 {
  schema: 'lociview-v1-mapping-baseline-1';
  units: readonly {
    legacyEntityKind: LegacyEntityKindV1;
    legacyEntityId: string;
    targetPortableId: string;
    mappingUnit: string;
    acceptedSourceValueDigest: Sha256Hex;
    acceptedTargetValueDigest: Sha256Hex;
  }[];
  attachmentSequences: readonly {
    captionId: CaptionId;
    entries: readonly {
      attachmentId: CaptionAttachmentId;
      mediaAssetEntityId: string;
      sourceFieldOperationDigest: Sha256Hex;
      sourceOccurrenceIndex: number;
    }[];
  }[];
}

interface V1MigrationDecisionRecordV1 {
  digest: Sha256Hex;
  kind: string;
  canonicalValueBase64Url: string;
}
```

Base64url is RFC 4648 URL-safe encoding without padding and decodes to bounded canonical UTF-8 bytes. `canonicalPreimageBase64Url` is the exact deterministic-ID preimage above; decoding and hashing it must reproduce both `fullDigest` and `portableId`. Each decision value uses the closed canonical schema in the ratified recipe companion and excludes filenames/paths, contributor IDs and wall-clock time. A decision digest is `SHA256(ASCII("lociview:v2:v1-migration-decision:jcs-v1\n") || decodedCanonicalValue)`; its `kind` must match the decoded closed discriminator.

`acceptedMappingBaseline` is a CAS blob with media type `application/vnd.lociview.v1-mapping-baseline+jcs` whose decoded value is exactly `AcceptedV1MappingBaselineV1`. The ratified companion defines the closed `mappingUnit` tokens and value projection for each known field. A present legacy source value is digested with `SHA256(ASCII("lociview:v2:v1-baseline-source-present:jcs-v1\n") || LegacyJcsV1(value))`; absence is the digest of exact ASCII `lociview:v2:v1-baseline-source-absent\n`. A present target value uses the corresponding `...:target-present:jcs-v1\n` prefix plus `JCS(value)`, and absence uses `lociview:v2:v1-baseline-target-absent\n`. On later copy, incoming and current values are available, so these accepted digests are sufficient for a recipe-defined three-way decision without retaining old caption text or other raw values.

For each unit, compare incoming source/current target digests with the accepted pair. Unchanged source preserves the current target. Changed source with unchanged target applies the recipe mapping. If both changed, map the incoming value and accept only when its target digest equals the current target digest; otherwise create an explicit migration conflict. Creation/deletion uses the absent sentinels. No unit may be combined with another unit unless the ratified companion declares one atomic mapping unit matching the v2 atomic-field contract.

Baseline units sort by legacy kind, legacy ID, target ID and mapping-unit token; tokens match `[a-z][a-z0-9.-]{0,63}` and duplicate tuples are invalid. Attachment groups sort by CaptionId and retain entry order. Unknown/raw evidence, source bytes, paths, contributor IDs, time and previous user content are excluded. The canonical UTF-8 blob is hash/size verified under the normal blob-first journal and subject to a G0 per-plan/total migration-support budget. `V1MigrationPlanV1.digest = SHA256(ASCII("lociview:v2:v1-migration-plan:jcs-v1\n") || JCS(plan without digest))`, with unique decision records sorted by digest and source tuples under their canonical source-set order. Every decision record digest/kind must reproduce from its decoded closed canonical value; duplicate decision digests are invalid.

Case `id`, `legacyLineageKey` and recipe descriptor are immutable. The `casesById`, `deterministicIdsByPortableId` and `plansByDigest` map keys equal the nested case ID, `portableId` and plan `digest` respectively. ID registrations and plans are append-only; one portable ID with another preimage/full digest or one plan digest with another value quarantines the project. The first accepted plan omits `parentPlanDigest`; every later plan names one already-present plan in the same case. Self-parenting, missing parents and cycles are invalid. `activePlanDigest` is one atomic scalar and every retained candidate resolves to a plan in that case. A later-copy transaction stages the new baseline blob, appends all ID registrations and one complete plan, applies its domain changes and replaces this pointer in the same metadata transaction. Concurrent later-copy imports preserve both plans and produce a pointer conflict that blocks only another v1 import until explicitly resolved; normal SceneDocument/editing may continue, while any domain conflicts created by those imports follow the ordinary fail-closed rules. A derived index enforces at most one case for each `legacyLineageKey`.

Collaboration packages include this subtree whenever present and include every baseline blob for an active or conflicting plan, making later-copy conversion portable to another device. Those baselines are strong roots; inactive historical-plan baselines are weak audit references and may be collected after the retention grace period, after which that old plan cannot be reactivated for migration without repair. Review and clean packages omit the subtree and baseline blobs; a clean copy is a new lineage and the UI states that it cannot continue the source project's later-v1-copy migration. A local fingerprint index may accelerate lookup but is rebuildable and never authoritative.

For a validated final v1 model asset, content and alignment revisions use separate exact keys:

```text
contentRevisionKey = SHA256(
  ASCII("lociview:v2:v1-model-content:jcs-v1\n")
  || LegacyJcsV1({ "assetEntityId": id, "blobSha256": digest, "byteLength": length,
                   "mimeRawUtf8Sha256": SHA256(UTF8(rawMime)),
                   "inspectionDigest": inspectionDigest })
)

alignmentStateKey = SHA256(
  ASCII("lociview:v2:v1-model-alignment:jcs-v1\n")
  || LegacyJcsV1({ "assetEntityId": id, "transform": exactValidatedFinalV1Transform })
)
```

`exactValidatedFinalV1Transform` is the effective closed v1 runtime value `{scale, upAxis}`: finite positive scale and `upAxis` exactly `Y|Z`; a missing transform uses `{scale:1,upAxis:"Y"}`. The v1 document's historical `offset` was not applied by the frozen runtime, so its presence is reported and retained only in raw migration evidence; it does not enter this alignment key or the v2 binding. Other extra transform members are likewise evidence, not silently interpreted. Invalid or ambiguous effective transform is an issue, not a guessed key. A later copy with changed bytes creates new representation/revision/layout/compatibility IDs; alignment-only change creates a new binding while retaining content records. Missing model bytes create no `contentRevisionKey`, binding key or immutable content record, but a valid effective transform still creates `alignmentStateKey` and the portable pending placement specified below.

For the model content key, `rawMime` is the exact final v1 `mime` string, including the historically common empty string; it must be valid scalar text of 0–127 characters. Missing/non-string/over-budget MIME is an issue. Actual decoder selection still comes from byte/container validation, never this declaration.

A v1 media asset revision key is likewise exact and includes logical metadata rather than using content hash as identity:

```text
mediaRevisionKey = SHA256(
  ASCII("lociview:v2:v1-media-revision:jcs-v1\n")
  || LegacyJcsV1({ "mediaAssetEntityId": id, "kind": exactV1Kind,
                   "originalNameRawUtf8Sha256": SHA256(UTF8(rawOriginalName)),
                   "mimeRawUtf8Sha256": SHA256(UTF8(rawMime)),
                   "blobSha256": digest, "byteLength": length,
                   "inspectionDigest": inspectionDigest })
)
```

`exactV1Kind` is one of `image|video|audio|other`; `rawOriginalName` is exact valid scalar text of 0–1,024 characters and `rawMime` is exact valid scalar text of 0–127 characters, so empty historical values remain distinct from a missing/non-string field. They are hashed before later NFC display conversion. An invalid field or missing bytes produces an issue/evidence record, not a MediaResource. The MediaResource migration ID uses `{mediaAssetEntityId, mediaRevisionKey}`; CAS still deduplicates equal `blobSha256` bytes across otherwise distinct logical resources.

#### V1 immutable recipe 1

The ratified descriptor for `recipeId = "v1-migration-recipe-1"` plus `lociview-v1-immutable-builder-1` closes the construction of every digest-protected record. Inspection results are canonical inputs, not mutable decoder objects:

```ts
interface V1ModelInspectionV1 {
  schema: 'lociview-v1-model-inspection-1';
  source:
    | { format: 'glb'; verifiedMediaType: 'model/gltf-binary'; formatProfile: FormatProfileRef }
    | { format: 'gltf'; verifiedMediaType: 'model/gltf+json'; formatProfile: FormatProfileRef }
    | { format: 'obj'; verifiedMediaType: 'model/obj'; formatProfile: FormatProfileRef }
    | { format: 'stl'; verifiedMediaType: 'model/stl'; formatProfile: FormatProfileRef }
    | { format: 'ply'; verifiedMediaType: 'application/octet-stream'; formatProfile: FormatProfileRef };
  contributions: readonly {
    kind: V1ModelContribution;
    logicalBoundsAsset: Aabb3;
    materialSlots: readonly {
      sourceMaterialIndex: number;
      materialKeyRawUtf8Sha256: Sha256Hex;
      sourceSemantics: SourceMaterialSemantics;
      displayNameNfc?: string;
    }[];
  }[];
}

type V1MediaInspectionV1 =
  | {
      schema: 'lociview-v1-media-inspection-1';
      mediaKind: 'image';
      verifiedMediaType: 'image/png' | 'image/jpeg' | 'image/webp';
    }
  | {
      schema: 'lociview-v1-media-inspection-1';
      mediaKind: 'video';
      verifiedMediaType: 'video/mp4' | 'video/webm';
    }
  | {
      schema: 'lociview-v1-media-inspection-1';
      mediaKind: 'audio';
      verifiedMediaType: 'audio/mpeg' | 'audio/mp4' | 'audio/wav' | 'audio/ogg';
    }
  | {
      schema: 'lociview-v1-media-inspection-1';
      mediaKind: 'document';
      verifiedMediaType: 'application/octet-stream';
    };
```

The descriptor-bound inspector defined by the ratified companion determines format by validated bytes under its fixed detection order; filename extension and declared MIME never choose a branch. Each branch also names the one ratified `FormatProfileRef` whose exact specification fixes static pose, coordinate/contribution/material/source-occurrence enumeration and bounds behavior for that branch. The companion pins the complete format/media/profile triple and its one-to-one profile-ID/specification-digest registry; an unknown/mismatched profile or another decoder default is invalid. The discriminated `source` union is the complete mapping, so `glb/application-octet-stream` and every other cross-pair are invalid. The inspector accepts only self-contained source bytes, produces contributions in fixed `mesh`, then `points` order, and emits each kind at most once. A mixed source emits both; an empty source, animation/skin/morph state not representable by that profile's deterministic static pose, or unsupported visual primitive mode is blocking rather than silently omitted. A descriptor-bound `staticPoseBake` may be a later explicit derivative, but recipe 1 never samples a clip or autoplays during migration.

For each contribution the same inspector emits one finite canonical `logicalBoundsAsset` and exposes a canonical source-material table whose consecutive `sourceMaterialIndex` values start at zero and identify the renderer-addressable decoded material entries for that contribution. The profile fixes primitive support and bounds rules; a GS profile would also fix its opacity/covariance support cutoff. It computes the exact legacy raw material key and complete `SourceMaterialSemantics` for each entry, rejects one raw key resolving to multiple entries and rejects a SHA-256 collision, then emits slots sorted by `materialKeyRawUtf8Sha256`; `sourceMaterialIndex` retains the table lookup and is not the sorted-array position. A display name is NFC and present only when it passes the 256-scalar portable-label contract; otherwise it is omitted and an issue is recorded. A backend must reproduce the profile, table, bounds and semantics or bake a derived representation with an explicit catalog; it cannot guess a locator from a material name or materialize its own alpha class. Model `inspectionDigest = SHA256(ASCII("lociview:v2:v1-model-inspection:jcs-v1\n") || JCS(inspection))`.

The ratified profiles/recipe companion explicitly cover glTF/GLB alpha-mode defaulting, MASK default/explicit cutoff, vertex/texture alpha, unlit/double-sided and supported transmission extensions; OBJ dissolve/alpha-map behavior; STL's synthetic opaque surface material; and PLY material/vertex-alpha behavior. A contribution with no authored material object still emits the one synthetic default slot required by the domain contract, but the slot's `SourceMaterialSemantics` comes from the profile-validated vertex/point/face color-alpha and format attributes. RGB-only input, or RGBA whose source alpha is proven identically one, maps to synthetic opaque; any source alpha below one, or alpha not proven constant, maps to the profile's explicit non-opaque classification. Synthetic identity never discards source alpha. Source transmission and mask coverage are retained as independent `SourceMaterialSemantics` axes. No engine material default may fill an omitted inspection value.

The inspected model blob is the verified v1 `path` source, never `optimizedPath`. The latter is a replaceable v1 display cache without sufficient immutable provenance; recipe 1 reports it as legacy evidence and does not treat it as source or a v2 derivative. If original `path` bytes are missing, the asset follows the unresolved rule even when an optimized cache survives.

The same descriptor-bound inspector ignores declared MIME for selection, sniffs against the inline allowlist and returns exactly one legal discriminated media branch. A v1 `image|video|audio` whose bytes do not validate as its declared class is an issue with no MediaResource. V1 `other` always returns the `document/application-octet-stream` branch and is download-only. Media `inspectionDigest = SHA256(ASCII("lociview:v2:v1-media-inspection:jcs-v1\n") || JCS(inspection))`.

`lociview-v1-immutable-builder-1` creates only the following complete wire objects. “Omit” means absent, not `null`; a member not shown is forbidden. Migrated ProjectFrame is `{id:migrationId('frame',projectSupport/projectFrame),handedness:'right',upAxis:'+Y',unit:{kind:'unknown'}}`. Each logical model Asset gets `assetFrameId = migrationId('frame',assetSupport/assetFrame)`. A migrated Representation aliases that AssetFrame as its RepresentationFrame; no separate RepresentationFrame ID is created.

For one inspected contribution, first build material slots from its sorted inspection rows, then sort the resulting slots by `logicalMaterialSlotId`:

```ts
const slots: readonly MaterialSlot[] = inspectionRows
  .map((s) => ({
    logicalMaterialSlotId: migrationId('material-slot', {
      keyKind: 'materialSlot', assetEntityId, materialLayoutId,
      materialKeyRawUtf8Sha256: s.materialKeyRawUtf8Sha256
    }),
    sourceLocator: { kind: 'representationMaterial', slotIndex: s.sourceMaterialIndex },
    sourceSemantics: s.sourceSemantics,
    ...(s.displayNameNfc === undefined ? {} : { displayName: s.displayNameNfc })
  }))
  .sort(byLogicalMaterialSlotId);
```

For the next object, `contributionInspection` is the exact current row from `inspection.contributions`; `contribution` is its `kind`. The exact Representation value before its digest is:

```ts
const representationWithoutDigest = {
  id: migrationId('representation', sourceRepresentationKey),
  assetId,
  representationFrameId: assetFrameId,
  contentKind: contribution === 'mesh' ? 'mesh' : 'pointCloud',
  purposes: ['source', 'display'],
  role: contribution === 'mesh' ? 'meshPrimary' : 'pointPrimary',
  variantFamilyId: migrationId('variant-family', variantFamilyKey),
  formatProfile: inspection.source.formatProfile,
  blob: {
    algorithm: 'sha256', digest: blobDigest, byteLength,
    mediaType: inspection.source.verifiedMediaType
  },
  representationToAsset: {
    translation: [0, 0, 0], rotationXYZW: [0, 0, 0, 1],
    uniformScale: 1, reflection: 'none'
  },
  logicalBoundsAsset: contributionInspection.logicalBoundsAsset,
  derivedFrom: [],
  materialCatalog: { layoutId: materialLayoutId, slots }
};
```

`materialLayoutId`, `sourceRepresentationKey` and `variantFamilyKey` are the exact contribution-specific migration keys above. `derivation`, `compositeGroupId`, `targetGsVariantFamilyIds` and `proxyForGsVariantFamilyId` are absent. Representation has no provenance member.

The one AssetRevision provenance constant is:

```ts
const migrationProvenance = {
  origin: 'migration',
  tool: { id: 'lociview.v1-migration', version: 'v1-migration-recipe-1' },
  sourceMediaType: inspection.source.verifiedMediaType,
  inputBlobDigests: [blobDigest]
};
```

The exact `allContributionVariantFamilyIdsSortedLexicographically` value is the non-empty, deduplicated, lexicographically sorted set of the VariantFamily IDs of every migrated pickable visual contribution emitted for that legacy model. Because v1 captions do not carry reliable family-level surface provenance, recipe 1 conservatively places those base families in one compatibility class; any later change to one member replaces that whole class, while adding an independent repair-patch singleton class does not. The exact AssetRevision and AssetBindingRevision values before their digests are:

```ts
const assetRevisionWithoutDigest = {
  id: migrationId('asset-revision', assetRevisionKey),
  assetId,
  representationIds: allContributionRepresentationIdsSortedLexicographically,
  anchorCompatibilityClasses: [{
    id: migrationId('anchor-compatibility', contentCompatibilityKey),
    targetVariantFamilyIds: allContributionVariantFamilyIdsSortedLexicographically
  }],
  provenance: migrationProvenance
};

const assetBindingWithoutDigest = {
  id: migrationId('asset-binding', assetBindingKey),
  assetId,
  assetRevisionId: assetRevisionWithoutDigest.id,
  assetToProject: {
    translation: [0, 0, 0],
    rotationXYZW: upAxis === 'Y'
      ? [0, 0, 0, 1]
      : [-0.7071067811865476, 0, 0, 0.7071067811865476],
    uniformScale: effectiveV1Scale
  },
  method: 'migration'
};
```

`parentRevisionId`, `materialCompatibilityMaps`, `parentBindingId` and `residual` are absent, including on later v1-copy import. The exact MediaResource value before its digest is:

```ts
const mediaResourceWithoutDigest = {
  id: migrationId('media-resource', { keyKind: 'mediaResource', mediaAssetEntityId, mediaRevisionKey }),
  blob: {
    algorithm: 'sha256', digest: blobDigest, byteLength,
    mediaType: mediaInspection.verifiedMediaType
  },
  mediaKind: mediaInspection.mediaKind,
  ...(portableLabel === undefined ? {} : { label: portableLabel })
};
```

`portableLabel` is absent for an empty raw name; otherwise it is the NFC result only when within the 256-scalar contract. Invalid/over-limit input omits it and creates an issue. Declared MIME never enters verified BlobRef media type. Each final record appends only `payloadDigest` computed from the complete corresponding `*WithoutDigest` value by section 3.2. Full record bytes/digests—not merely inspection/key bytes—are golden vectors for single mesh, point-only, mixed mesh+point, every source format, empty/over-limit names, empty/wrong MIME and every allowed media class. Regenerating a known deterministic ID must use the registry's exact recipe/descriptor binding and reproduce its full preimage, full record bytes and payload digest or abort.

Golden canonical byte and hash vectors cover Unicode, normalization collisions, key order, `-0`, exponent notation, quaternions, unknown fields, all four immutable record kinds, both lineage-key routes, source tuple ordering/deduplication/rejection, every migration output kind and every key recipe. Two v1 operations with the same `(actor, sequence)` are idempotent only when their canonical-operation digests match. Whitespace and JSON key order may differ; a digest mismatch is a divergent collision. When equivalent, the hardened v1 reducer receives one `V1CanonicalOperation` decoded from the agreed `LegacyJcsV1` bytes, never an input-order-selected raw candidate. Field-aware conversion to NFC v2 values happens only after reduction and preserves/reports identity collisions as specified above; it does not weaken the v2 persisted-NFC rule. Raw source lines remain available as migration evidence but are not the equality rule.

RFC 8785: <https://www.rfc-editor.org/rfc/rfc8785>.

### 3.3 Reference strength and nested privacy

Reference strength is semantic, not “every ID-looking string is reachable”:

| Reference | Collaboration/runtime and GC | Review/share | Clean editable copy |
|---|---|---|---|
| Project default set; ready asset active binding; binding revision; revision representations and compatibility-class target families; representation `blob`; active caption/set/view/override/tag/attachment parents | Strong. Target metadata and required current blobs must resolve before authoritative use. | Include only the reviewed presentation closure and rewrite active compatibility to the flattened ID-membership snapshot. | Include the editable current closure and rewrite full classes/targets to new-lineage IDs. |
| `Representation.derivedFrom` for a currently reachable derivative | Strong editable-source edge. Included source records/blobs are retained so the derivative can be regenerated. | Drop derivation edge after snapshot transformation; include only display bytes. | Include and remap the required source closure, or block if it is unavailable. |
| `parentBindingId`, `parentRevisionId` | Weak lineage edge. Target immutable metadata remains in the append-only document; it does not protect blobs. | Omit. | Omit when re-rooting. |
| Anchor `authoredAssetRevisionId`, `hitEvidence.source.representationId`, `hitEvidence.source.surfaceRef` | Weak provenance. It never protects a revision/blob and cannot make an anchor invalid by absence. | Always omit `authoredAssetRevisionId` and the complete `hitEvidence.source`; retain the canonical anchor, compatibility ID, hit method and confidence. | For nonmanual evidence, remap authored revision and complete source together only when both targets are in the editable closure and pass the owner/method/content/role/surface contract; otherwise omit both. For `manual`, set authored revision to the rebuilt active revision only when its class is active/compatible; omit it while preserving `needsReview` otherwise. |
| `MaterialCompatibilityMap` source revision and provenance/derivation input digests | Weak audit evidence after mapping resolution; it does not protect bytes by itself. | Omit or sanitize through the pinned snapshot policy. | Current overrides must already target the active layout; omit historical maps when re-rooting. |
| `MigrationSupportV1` active/conflicting plan `acceptedMappingBaseline` | Strong technical-lineage edge required for a portable later-copy diff. Inactive historical-plan baseline is weak after retention. | Omit with the complete migration-support subtree. | Omit; the new lineage cannot continue the old migration case. |

`Provenance` and `DerivationRecord` are collaboration-visible technical metadata. Review/clean export may retain only the explicitly allowlisted `origin`, tool ID/version, media type and digests that refer to included resources; changing any nested immutable payload requires a new record ID and recomputed payload digest. `MaterialSourceLocator` is included only with its representation. `SurfaceRef` follows its weak source rule. `BackgroundIntent` and current semantic material intent are presentation data. None of these types may contain local paths, user/device identity or free-form provenance notes.

## 4. Lineage and merge eligibility

`projectId` or a copied lineage seed alone does not prove shared CRDT history. The Automerge candidate uses a constructible, non-self-referential bootstrap:

1. create one first Automerge change containing schema, project ID, history epoch, random lineage seed and empty root collections; it does not contain its own hash;
2. obtain that exact change hash from the pinned Automerge adapter;
3. store the `MetadataEnvelope.lineageProof` beside the metadata bytes and in the package manifest;
4. on every open/merge, verify that the metadata actually contains that root change and that its bootstrap payload matches the document identity.

A collaboration merge requires:

1. equal `projectId`;
2. equal `historyEpoch`;
3. equal `lineageSeed`;
4. equal verified `MetadataEnvelope.lineageProof`;
5. evidence that both metadata documents actually descend from that root change.

A clean editable copy receives a new project ID, history epoch, lineage seed, bootstrap history and envelope. Independently converting two v1 copies and assigning the same domain identifiers does not make them mergeable; known copies are converted together into one canonical genesis. If Automerge is rejected, a replacement adapter MUST define an equally verifiable envelope proof in a superseding specification; adapter proof does not enter SceneDocument.

Actor/display names and wall-clock timestamps are provenance hints, not cryptographic identity. Packages are not authenticated unless a later signature ADR adds such a guarantee. Hash inventories detect corruption and mismatched content, not a malicious author who rewrites both bytes and manifest.

## 5. Conflict semantics

Automerge's deterministic materialized value is not automatically the product decision. The repository adapter MUST expose all conflicting values and change provenance needed by the review UI.

| Conflict | Product behavior |
|---|---|
| Different fields of the same caption | Merge automatically |
| Same scalar field | Preserve candidates; show conflict; explicit re-assignment resolves it |
| Same atomic semantic object (`EntityLifecycle`, `Asset.status`, `Caption.anchor`, saved-view values, material routing/appearance/compositing) | Preserve complete object candidates; never merge nested components into a hybrid |
| Concurrent `activeBindingId` | Exclude from every authoritative scene/edit/export; allow only labelled read-only candidate preview |
| Same immutable ID, different payload | Reject or quarantine the package |
| Delete versus edit | Keep the tombstone and edited values; use causal analysis and a review queue |
| Attachment/tag membership | ID-keyed element merge, not array-level winner |
| Parent delete versus concurrent child add | Preserve the child as an orphan review item; never cascade or resurrect implicitly |
| Distinct active MaterialOverride IDs with one semantic `(scope,target)` key | Preserve every record; derive a duplicate-key conflict and apply none |
| Unknown minor field | Preserve round-trip without interpreting in the collaboration lineage; block history-free export until a versioned policy recognizes it |

No consumer may use the metadata library's materialized winner for an unresolved semantic conflict. Before SceneDocument, edit-command and history-free-export projection, `MetadataRepository` supplies every conflict set to the domain resolver. An unresolved `EntityLifecycle` conflict excludes that entity from authoritative scene, caption/media presentation, normal editing and clean export regardless of which candidate currently materializes; dependent children remain preserved/protected but are excluded as pending-orphan review items. The only permitted mutation on the entity is an explicit conflict-resolution/copy command causally after all candidates. A user-selected candidate MAY be previewed in a separately labelled read-only diagnostic view, never as authoritative state.

The same fail-closed rule applies to an unresolved `Asset.status` discriminator. Other atomic conflicts exclude the affected semantic projection: an anchor conflict excludes that pin, a saved-view conflict prevents applying that saved field, and a material routing/appearance/compositing conflict excludes that override rather than guessing a backend value. Review/share may explicitly omit the complete affected presentation closure with a disclosure; clean editable export always blocks until every included conflict has a resolution change. Collaboration packages preserve every candidate and required blob.

Projection is closed by field class; “exclude” never means choose the library winner:

| Field class and members | Authoritative SceneDocument / UI projection | Editing and history-free output |
|---|---|---|
| Immutable identity/frame: every `id`, `Project.frame`, `Asset.assetFrameId`, `SavedView.projectFrameId`, immutable-record fields | A conflict or mutation under one ID is invalid. Project-frame conflict blocks the whole project scene; asset-frame conflict excludes that asset/closure; saved-view frame conflict excludes that view. | Normal editing of the affected closure is blocked; collaboration quarantines/preserves evidence, review/clean block rather than repair in place. |
| Existence/content selector: every `EntityLifecycle`, `Asset.status` | Exclude the complete entity and dependent projection. | Only resolve/copy commands; review may omit an optional complete closure with disclosure, clean blocks. |
| Required project root: `Project.defaultDisplaySetId` | Do not infer a shared startup set. The project may be inspected using an explicit local active-set choice, clearly marked as not the resolved default. | Only the default edge needs resolution; review/clean block because their Project requires a valid default. |
| Parent/target edge: `Caption.displaySetId`, `CaptionAttachment.captionId/mediaResourceId`, `CaptionTagMembership.captionId/tagId`, `MaterialOverride.routing` | Exclude the edge-owning caption, attachment, membership or override. Candidate parents/resources remain protected. A caption exclusion also suppresses its presented children without tombstoning them. | Block normal edits to that owner except resolve/reassign/copy. Review may omit the whole optional owner/closure; clean blocks if included. |
| Optional default edge: `DisplaySet.defaultViewId` | Keep the set but do not auto-apply a view; expose the conflict on set selection. | Other set fields remain editable; the edge itself requires resolution. Review may omit the default edge only when its snapshot schema allows an absent default and discloses it; clean blocks an included conflict. |
| Atomic spatial/presentation value: `Caption.anchor`, saved camera/background/presentation, material appearance/compositing | Exclude only the affected pin, saved-field application or override; retain unrelated entity content with a conflict marker. | Only the atomic field requires resolution; review may omit the entire affected presentation item, clean blocks it. |
| Derived semantic uniqueness: active MaterialOverride `(scope,assetId,variantFamilyId,materialLayoutId,logicalMaterialSlotId)` | If two IDs own one key, exclude all records for that key at that scope and do not fall through to an arbitrary duplicate. Other targets/scopes remain valid. | Resolution tombstones/retargets all but one after observing every record. Collaboration preserves all; review may omit that target with disclosure; clean blocks while included. |
| Ordered membership: every `orderKey` | Remove the item from authoritative order and place it in a labelled conflict tray; never sort by a materialized candidate. The item's non-order content remains inspectable. | Reorder resolution writes one new key after all candidates. Review may omit the item with disclosure; clean blocks it. |
| Presentation scalar: `Project.title`, `Asset.label`, `DisplaySet.name`, `SavedView.name`, `CaptionTag.label/colorSrgb`, `Caption.title/body/colorSrgb` and `CaptionAttachment.altText` | Preserve nonconflicting behavior, but render the conflicted field as a neutral conflict placeholder with candidate UI, never as one value. A conflicted tag label suppresses that tag/memberships from normal filtering until resolved. | Independent fields may still be edited; the conflicted field needs explicit assignment. Review must omit the complete optional item or resolve; required Project/Asset labels block. Clean blocks included conflicts. |

Any mutable field added by a schema minor version declares one of these classes in its extension policy before an older/newer writer may project or export it. If no class is known, unknown-field fail-closed rules apply. A dependent child excluded here remains a collaboration/GC root whenever any conflict candidate references it.

Deletion of a mutable entity atomically replaces the entire lifecycle with `state: 'deleted'`, a new random event ID and reason, and never removes the map entry. Restore likewise replaces the entire lifecycle with a new active event; nested lifecycle writes are invalid. Normal local updates to a deleted entity are rejected until an explicit restore command. The metadata adapter compares the Automerge change that wrote the lifecycle event with changes to entity fields:

- an edit causally observed by the delete needs no separate delete/edit conflict;
- an edit concurrent with the delete enters the review queue with both values;
- an edit causally after delete without an explicit restore is invalid/quarantined;
- resolution creates a new change after all candidates: keep the tombstone, restore the entity, or copy selected values to a new entity ID.

Attachment and tag membership use child ID-keyed mutable records with the same lifecycle rule. Immutable record retirement is a distinct reachability operation and never writes lifecycle fields into a digest-protected payload. Package export cannot physically omit a tombstone from a mergeable lineage; history-free snapshot builders may omit a resolved deleted entity.

The conflict UI records what was chosen without claiming the recorded actor is a verified person. Unresolved records remain exportable only in collaboration packages; review/share export MUST resolve them or disclose and safely omit the affected presentation item.

Automerge documents preserve conflict values and merge shared history, which is why the candidate is useful; current behavior MUST be revalidated against the exact pinned version: <https://automerge.org/docs/reference/documents/conflicts/>.

## 6. MetadataRepository candidate requirements

The candidate adapter MUST provide:

- open/create from a known lineage;
- one domain transaction per logical command;
- merge and full conflict inspection;
- subscription without exposing mutable library objects;
- a documented durability barrier used by UI and package export;
- deterministic snapshot at recorded heads;
- multi-tab coordination or an enforced single-writer fallback;
- resource limits and cancellation for untrusted metadata load;
- exact-version export/import and upgrade tests.

Official Automerge Repo documentation says its IndexedDB storage adapter is safe for concurrent repository use, but live tab updates require a network adapter such as BroadcastChannel. LociView MUST test both properties rather than infer one from the other: <https://automerge.org/docs/reference/repositories/storage/> and <https://automerge.org/docs/reference/repositories/networking/>.

If the exact library version cannot provide or support a provable durability acknowledgement, safe multi-tab behavior, conflict access, bounded load, offline CSP operation, or history-free export construction, the candidate is rejected and a replacement ADR is required. The project does not fall back to indefinitely extending the v1 log by default.

## 7. BlobStore and CAS

Internal layout MAY resemble:

```text
v2/blobs/sha256/ab/<remaining-digest>
v2/staging/<transaction-id>/<part>
v2/journal/<transaction-id>/journal.json
v2/journal/<transaction-id>/source-metadata.am
v2/journal/<transaction-id>/changes/<8-digit-ordinal>.amchange
```

The path is internal; only `BlobRef` is portable.

BlobStore requirements:

- accept `ReadableStream<Uint8Array>` or an equivalent bounded source;
- write bounded chunks with backpressure;
- calculate incremental SHA-256 and byte count during staging;
- compare expected digest/size when supplied;
- publish immutable content only after verification;
- deduplicate equal digests across projects;
- return stream/File-like handles, never require `readBytes()` for large content;
- support cancellation and report quota separately from corruption;
- verify content before export and when corruption is suspected;
- serialize publish/GC using a proven origin-wide lock or enforce a single writer.

`crypto.subtle.digest()` consumes the complete input and is not a streaming hash. The incremental implementation or dependency is a PoC decision with CSP, worker, WASM, license, lockfile and iOS evidence.

CAS bytes are immutable, and persistent collection is distinct from runtime residency eviction. `ResourceManager` may release decoded CPU/GPU objects, object URLs and open stream handles under pressure; that action never deletes a CAS blob. BlobStore MUST NOT remove a verified digest while it is reachable from any current, unresolved-conflict, opaque-inventory, retention-pin, unfinished-journal or active-package root. Every representation in an active revision—including source, display, preview and interaction derivatives—every active/conflicting attachment and every active/conflicting MigrationSupport plan baseline therefore remains reopenable and exportable. Reproducibility alone does not make a currently referenced derivative collectible.

A persistent derivative becomes eligible for grace-period GC only after a new immutable revision/binding that omits it is durably active and every other protection root has disappeared. If any strongly referenced digest is missing, the project opens degraded/read-only for repair and collaboration/history-free export refuses; the implementation never describes the absence as ordinary cache eviction.

## 8. Cross-store transaction journal

OPFS and IndexedDB do not share one atomic transaction. The same journal protocol covers a one-change local command and a collaboration-package merge containing multiple original Automerge changes. A local command has exactly one entry; it is rejected if it cannot fit the G0 metadata-change budget. A package merge preserves the original remote change bytes and causal graph instead of squashing them into a new local change. The durable journal holds:

```ts
interface TransactionJournalBaseV1 {
  transactionId: string; // 128 random bits, lowercase hex; local technical identity
  purpose: 'localCommand' | 'remotePackageMerge';
  target: {
    identity: ProjectDocV2['identity'];
    metadataEnvelope: MetadataEnvelope;
  };
}

interface ExactMetadataChangePartV1 {
  ordinal: number;
  expectedChangeHash: Sha256Hex;
  dependencies: readonly Sha256Hex[];
  byteLength: number;
  bytesSha256: Sha256Hex;
}

interface PreparedMetadataBatchBaseV1 {
  baseHeads: readonly Sha256Hex[];
  exactChangeSetDigest: Sha256Hex;
  changes: readonly ExactMetadataChangePartV1[];
}

interface LocalCommandBatchV1 extends PreparedMetadataBatchBaseV1 {
  kind: 'localCommand';
  changes: readonly [ExactMetadataChangePartV1];
}

interface RemotePackageMergeBatchV1 extends PreparedMetadataBatchBaseV1 {
  kind: 'remotePackageMerge';
  source: {
    packageId: PackageId;
    metadataSha256: Sha256Hex;
    metadataByteLength: number;
    metadataEnvelope: MetadataEnvelope;
    remoteHeads: readonly Sha256Hex[];
  };
  expectedFinalHeads: readonly Sha256Hex[];
}

type PreparedMetadataBatchV1 = LocalCommandBatchV1 | RemotePackageMergeBatchV1;

type PreparedTransactionJournalV1 =
  | (TransactionJournalBaseV1 & {
      state: 'staging';
      sourceResume:
        | { kind: 'none' }
        | { kind: 'localLease'; leaseId: string };
    })
  | (TransactionJournalBaseV1 & {
      state: 'blobsVerified' | 'metadataDurable';
      stagedBlobs: readonly BlobRef[];
      metadataBatch: PreparedMetadataBatchV1;
    });
```

`leaseId` is 128 random bits as 32 lowercase hexadecimal characters and resolves only through the local source adapter; the journal never embeds a source path or file handle and never trusts a lease as content identity. Exact change bytes are copied with bounded I/O to ordinal-named internal files before `blobsVerified`; eight-digit zero-padded ordinals are derived from the descriptor and never supplied by a package. Remote source metadata bytes are likewise copied to the fixed internal path above. The JSON journal stores descriptors, not inline change bytes.

`baseHeads`, dependencies, remote heads and final heads are sorted unique lowercase hashes. Ordinals are contiguous from zero; lengths are safe positive integers. Changes are unique by expected hash and in dependency-topological order, with equal-rank ready changes ordered lexicographically by hash. Each file's plain SHA-256 must equal `bytesSha256`; the pinned adapter's canonical 32-byte change hash must equal `expectedChangeHash`; decoded dependencies must exactly equal the descriptor. Every dependency is reachable from `baseHeads` or appears at a smaller ordinal. A local batch has one change whose dependencies equal `baseHeads` and whose message is `lociview:transaction:v1:<transactionId>`. Imported changes retain original actor, sequence, time, bytes, dependencies and message.

For a remote batch, `source-metadata.am` must match `metadataSha256`/length, decode under the exact pinned adapter, carry the stated envelope/root/heads and reproduce the complete missing-change set relative to the document at `baseHeads`. `expectedFinalHeads` are the exact heads after detached full-batch apply. A zero-missing-change merge creates no metadata journal/change; any verified missing blob follows the blob-repair path only.

`exactChangeSetDigest` detects a torn or truncated durable journal:

```text
SHA256(
  ASCII("lociview:v2:metadata-change-set:jcs-v1\n")
  || JCS({
       "transactionId": transactionId,
       "target": target,
       "purpose": purpose,
       "stagedBlobs": stagedBlobs,
       "metadataBatch": metadataBatch without exactChangeSetDigest
     })
)
```

The complete target envelope, staged-blob delta, remote source descriptor, expected final heads and ordered change descriptors are therefore committed. `purpose` must equal the batch `kind`; `stagedBlobs` is a canonical sorted unique set of only newly introduced or explicitly restaged BlobRefs. The digest is an integrity check, not authentication; recovery also revalidates source metadata and detached final state. Before prepare/apply/recovery, the repository verifies target identity, adapter format/root proof and actual descent from that root as required by section 4; copied identity fields cannot redirect a journal to another document root. Change count, aggregate descriptor/change bytes and decoded metadata nodes have hard G1-C budgets; an over-budget remote batch is rejected, never split into user-visible transactions.

The recoverable protocol is:

1. inspect preliminary schema/limits/quota and durably write `staging` with transaction, target, purpose and resume intent only;
2. stream/hash/inspect sources; for a package, side-effect-free validate its manifest, exact metadata bytes, source envelope/root and declared heads;
3. verify and publish the package's declared strong/opaque blob inventory or the local command's candidate blobs;
4. acquire the project-wide import/recovery barrier, revalidate target lineage and capture its durable `baseHeads`;
5. for a local command, only now allocate content-derived IDs and prepare one detached change; for a package, compute the complete remote changes missing from the base without rewriting/rebasing;
6. topologically order and stream each exact change into its ordinal part, verifying byte digest, adapter hash and dependencies;
7. apply the full list to a hidden detached clone at `baseHeads`; validate its domain/conflict/opaque state and complete final strong/opaque BlobRef closure. A remote batch also computes and validates exact `expectedFinalHeads`; a local batch validates the detached result but does not require later current-head equality. Every final reference must be present in the durable target's verified `ProjectStorageEnvelope`/CAS inventory or in the newly verified `stagedBlobs` delta;
8. compute `exactChangeSetDigest` and durably replace the journal with complete `blobsVerified` descriptors and staged-blob delta;
9. apply only missing exact changes in ordinal order—never rerun a mutation closure or synthesize a replacement change—and await the metadata durability barrier;
10. prove every expected change hash is durable. For a remote batch under its barrier also require current heads to equal `expectedFinalHeads`; for a local batch, permit additional concurrent heads and do not require complete head-set equality. Then update the journal to `metadataDurable`;
11. recheck final-closure inventory membership and staged-blob verification records, remove staging, release the barrier and publish one resolved repository update.

For a local command, the captured heads have passed the repository durability barrier. From head capture through detached prepare, durable change-part/`blobsVerified` write and exact apply, the originating actor's command queue is serialized so it cannot consume the same actor sequence elsewhere. For a package merge, the dependency closure is validated against the durable base plus preceding parts. Already-durable changes from distinct actors remain valid concurrency and imported dependencies are never rewritten. The detached-final logical closure includes unresolved conflicts, but the journal records only its storage delta. Existing verified inventory membership/presence is checked without rehashing every GS/media byte; byte rehash is reserved for newly staged/restaged data or corruption suspicion. Transient prefix-only and weak historical references are not required.

While a remote journal is unfinished, every tab displays only the last published authoritative snapshot read-only. `MetadataRepository` suppresses intermediate SceneDocument/subscription/BroadcastChannel publication, edits, package/snapshot export and GC/reachability recomputation. A project-scoped cross-tab lock prevents a new metadata command until recovery completes or quarantines the batch. Low-level storage may contain a prefix after a crash, but no prefix is user-visible or accepted as a new command base. The pinned repository/lock adapter must prove this barrier across a second tab, crash and browser restart in G1-C; otherwise it is rejected or forced into a proven single-writer fallback.

The protocol MUST NOT assume a filesystem rename is atomic or available. Publish behavior is part of the BlobStore contract and is tested by interruption.

Recovery scans unfinished journals before presenting a project:

- `staging`: resume only if the source is safely resumable; otherwise discard staging with metadata unchanged.
- `blobsVerified`: revalidate target lineage, change-set digest, every change part/descriptor/dependency, staged blob and final-closure inventory membership. For remote batches also revalidate source metadata and exact `expectedFinalHeads`. Skip hashes already present and apply missing parts in order. A remote batch requires current-head equality under its barrier; a local batch requires its one expected hash/dependencies but permits other concurrent heads. It never rebuilds a change on current heads or exposes a remote prefix.
- `metadataDurable`: verify every expected hash, staged-blob record and final-closure inventory membership; additionally require remote current heads to equal `expectedFinalHeads`, while local concurrent heads remain legal. Finish cleanup, then expose the project once.
- digest/bytes/dependency/message/target/source mismatch, incomplete/noncanonical descriptors, missing base dependency, an unexpected writer during a remote barrier, remote final-head mismatch, or a BlobRef missing from the prevalidated detached-final required strong/conflict/opaque closure: quarantine or degraded/read-only repair; never regenerate, roll back CRDT history, silently delete or choose a winner. Additional valid local-batch concurrent heads are not an unexpected-writer failure. A hidden prefix or weak historical reference alone is not a missing-blob failure and never enters resolver/GC projection.

Applying an exact Automerge change is hash-idempotent. If replacement `C` became durable after local `T` was prepared but before recovery applies it, `T` keeps its original dependencies and remains concurrent rather than becoming a causal stale overwrite. A collaboration batch preserves each remote dependency and resumes after any already-durable prefix without squashing history. ProjectDoc receives no receipt map or hash self-reference. The pinned adapter MUST prove detached local preparation, exact remote extraction, byte-for-byte application, hash presence/idempotence, full-set/final-head verification, cross-tab isolation and prefix recovery in G1-C; inability to prove any property rejects the candidate.

Each local project also has a schema-independent `ProjectStorageEnvelope` containing a conservative set of every CAS digest protected by that project plus `opaqueReachability: boolean`. Blob publication adds to this inventory before metadata activation. Recognized strong roots are active mutable entities, their immutable closure including `derivedFrom`, active/conflicting MigrationSupport plan baselines, unresolved conflicts, explicit retention pins, unfinished journals and active package jobs; an append-only but otherwise unreachable immutable metadata record does not alone protect its blob.

If any unrecognized minor field exists, `opaqueReachability` is true because an older build cannot know whether it names a blob. On such an import, every blob declared by the collaboration manifest is added to the protected inventory before activation. While the flag is true, the project inventory cannot shrink and destructive GC cannot remove any digest protected for that project. Collaboration export includes every protected digest or refuses safely if any is missing/over budget. Only a newer validator that understands every field may recompute verified reachability and clear the flag. Future-major, unreadable, corrupt or missing-inventory projects also make global destructive GC fail closed. GC uses a grace period and rechecks all roots under the origin-wide lock; mutable reference counts are not the source of truth.

Because immutable metadata maps are append-only, a reference added on another branch always finds the same payload after merge. A local command that creates a strong blob edge cannot become durable until BlobStore verifies the bytes. Package merge stages its declared strong/opaque blob closure before metadata merge. Thus concurrent loss of the last local root and addition of a new root keeps/restages the record bytes or yields an explicit missing-blob rejection; it never creates an authoritative dangling reference.

Quota preflight includes missing CAS bytes, maximum staging/copy working space, metadata/package overhead and a G0 safety margin. It is advisory; every write still handles `QuotaExceededError` and preserves the old active binding.

## 9. Package envelope and purposes

The v2 container manifest is a discriminated union. Entry paths are canonical forward-slash paths:

```ts
interface PackageManifestBase {
  format: 'lociview-package-v2';
  schema: { major: 2; minor: number };
  packageId: PackageId;
  createdByVersion: string;
  metadata: { path: string; digest: Sha256Hex; byteLength: number; mediaType: string };
  blobs: readonly { path: string; ref: BlobRef }[];
  declaredLimits: PackageDeclaredLimits;
}

interface PackageDeclaredLimits {
  entryCount: number;
  totalUncompressedBytes: number;
  largestEntryBytes: number;
}

type PackageManifest =
  | (PackageManifestBase & {
      kind: 'collaboration';
      mergePolicy: 'sameLineage';
      identity: ProjectDocV2['identity'];
      metadataEnvelope: MetadataEnvelope;
    })
  | (PackageManifestBase & {
      kind: 'cleanEditable';
      mergePolicy: 'sameLineage';
      identity: ProjectDocV2['identity']; // newly generated lineage
      metadataEnvelope: MetadataEnvelope;
    })
  | (PackageManifestBase & {
      kind: 'review';
      mergePolicy: 'none';
      snapshotId: SnapshotId;
      identity?: never;
      metadataEnvelope?: never;
    });
```

Collaboration and clean packages contain a verifiable editable metadata lineage; manifest identity/proof must exactly match the decoded metadata document and bootstrap proof. Review contains a `LociReviewSnapshotV2` entry rather than an Automerge document, its manifest/snapshot IDs must match, and it carries no source project ID, history epoch, lineage seed or adapter proof by default. Adding correlatable source identity to review would require a future explicit privacy field and product approval; copying an unverifiable lineage proof is forbidden.

### 9.1 Collaboration package

- Contains the mergeable metadata document and required blob closure.
- Merge is allowed only for verified common lineage.
- Contains history and MUST be labelled accordingly.
- Includes every blob reachable from recognized current strong roots and unresolved conflict candidates, including active/conflicting MigrationSupport plan baselines. When `opaqueReachability` is true it includes the entire protected project inventory or refuses safely.
- Export fails if any required blob is absent or corrupt.
- It is labelled **current-project collaboration backup with merge history**. Historical restoration of deleted-only asset bytes is not an MVP guarantee; metadata history may name an old digest whose deleted-only bytes are absent.

### 9.2 Review/share package

- Contains no Automerge binary or mergeable operation history.
- Is constructed from an allowlisted current snapshot schema.
- Is read-only and declares `mergePolicy: none`.
- Omits deleted records, old values, actor/change history, local preferences, `migrationSupport`, migration source records and unreferenced blobs.
- Contains only resources reachable from the reviewed presentation.
- Media EXIF stripping is a separate opt-in/export guarantee.

`LociReviewSnapshotV2` is a separate, non-editable wire schema:

```ts
interface LociReviewSnapshotV2 {
  schema: { kind: 'lociview-review'; major: 2; minor: number };
  snapshotId: SnapshotId;
  project: { title: string; frame: ProjectFrame; defaultDisplaySetId: DisplaySetId };
  assetsById: Record<AssetId, {
    id: AssetId;
    label: string;
    assetFrameId: FrameId;
    assetToProject: Sim3;
    compatibleAnchorClassIds: readonly AnchorCompatibilityId[];
    representationIds: readonly RepresentationId[];
  }>;
  representationsById: Record<RepresentationId, ReviewRepresentation>;
  mediaResourcesById: Record<MediaResourceId, MediaResource>;
  captionsById: Record<CaptionId, ReviewCaptionV2>;
  captionAttachmentsById: Record<CaptionAttachmentId, Omit<CaptionAttachment, 'lifecycle'>>;
  captionTagsById: Record<TagId, Omit<CaptionTag, 'lifecycle'>>;
  captionTagMembershipsById: Record<TagMembershipId, Omit<CaptionTagMembership, 'lifecycle'>>;
  displaySetsById: Record<DisplaySetId, Omit<DisplaySet, 'lifecycle'>>;
  viewsById: Record<ViewId, Omit<SavedView, 'lifecycle'>>;
  materialOverridesById: Record<OverrideId, Omit<MaterialOverride, 'lifecycle'>>;
}

interface ReviewCaptionV2 {
  id: CaptionId;
  displaySetId: DisplaySetId;
  title: string;
  body: string;
  colorSrgb?: readonly [number, number, number];
  anchor: ReviewAssetAnchorV2 | ProjectAnchor;
}

interface ReviewAssetAnchorBaseV2 {
  kind: 'asset';
  assetId: AssetId;
  assetFrameId: FrameId;
  positionAsset: Vec3;
  authoredAnchorCompatibilityId: AnchorCompatibilityId;
}

type ReviewAssetAnchorV2 =
  | (ReviewAssetAnchorBaseV2 & {
      normalAsset?: never;
      hitEvidence: {
        method: 'manual';
      };
    })
  | (ReviewAssetAnchorBaseV2 & {
      normalAsset?: Vec3;
      hitEvidence?: {
        method: 'mesh' | 'point-cloud' | 'direct-splat' | 'gpu-id-depth' | 'proxy';
        confidence?: number;
      };
    });

interface ReviewRepresentation {
  id: RepresentationId;
  assetId: AssetId;
  representationFrameId: FrameId;
  contentKind: RepresentationContentKind;
  purposes: readonly ('display' | 'preview' | 'interaction')[];
  role: RepresentationRole;
  variantFamilyId: VariantFamilyId;
  formatProfile: FormatProfileRef;
  blob: BlobRef;
  representationToAsset: CanonicalTransform;
  logicalBoundsAsset: Aabb3;
  materialCatalog?: MaterialCatalog;
  compositeGroupId?: CompositeGroupId;
  targetGsVariantFamilyIds?: readonly VariantFamilyId[];
  proxyForGsVariantFamilyId?: VariantFamilyId;
}
```

This snapshot has package-local IDs, no parent/derivation lineage, no lifecycle/history fields and no source ProjectDoc identity. Media resources are re-keyed and re-digested while retaining verified blob digests. The builder applies one complete old-to-snapshot reference map, strips `source` purpose and every non-closure locator, then validates all references before writing the manifest.

Each Review Asset's `compatibleAnchorClassIds` is sorted and deduplicated and may be empty. Across both those lists and every Review anchor—including absent/`needsReview` IDs—one mapped compatibility ID belongs to exactly one Review Asset; cross-asset reuse invalidates the snapshot. A Review asset-anchor compares its ID only with its own Asset's list: membership means compatible, absence is valid `needsReview`, and membership only under another Asset is an invalid cross-owner reference. These are standalone Review-schema validation rules and do not rely on the omitted ProjectDoc revision topology.

### 9.3 Clean editable copy

- Blocks until every semantic conflict affecting included state has an explicit resolution change. It MUST NOT choose an Automerge materialized winner or silently omit a candidate.
- Constructs a new metadata genesis from validated current state.
- Uses a new project ID, history epoch, lineage seed, bootstrap change and verified adapter lineage proof.
- Omits old history, deleted values, prior contributors and local-only metadata.
- Omits `migrationSupport`; the export UI states that the clean lineage cannot accept later v1 copies through the source case.
- Includes active bindings and immutable records required to realize editable current state. Optional non-resolving caption provenance such as an omitted `authoredAssetRevisionId` does not add an old revision or blob to this closure; the `authoredAnchorCompatibilityId` equality class is preserved under a new package-local ID.
- Cannot merge back into the source project; descendants of the new copy can merge with each other.

The clean builder performs a topological re-root, never field-redaction under old immutable IDs:

1. compute the editable strong closure and block conflicts, orphans, missing blobs and unresolved material mappings;
2. mint a complete one-to-one old-to-new map for every included source ID with prefix `prj`, `hep`, `frm`, `ast`, `bnd`, `rev`, `rep`, `fam`, `lay`, `slot`, `cmp`, `grp`, `cap`, `att`, `tag`, `tgm`, `med`, `set`, `view`, `ovr` or `evt`; source `mig`/`iss` records are excluded and may not remain referenced, and source `pkg`/`snp` envelope IDs are never copied. Clean output creates fresh `prj`, `hep` and `pkg` IDs; review output creates fresh `snp` and `pkg` IDs and no `prj`/`hep` identity;
3. copy included source/media blobs by digest, then rebuild every included Representation with remapped `derivedFrom` and allowlisted provenance;
4. rebuild AssetRevisions without `parentRevisionId` or historical material-compatibility maps, remap each anchor-class ID plus its exact target-family set, recompute payload digests, then rebuild bindings without `parentBindingId`;
5. rebuild active mutable entities with new IDs/lifecycle events and rewrite every strong reference, including active binding, set/view, caption/tag/attachment and material routing;
6. for clean output, remap a nonmanual weak anchor revision and complete `hitEvidence.source` together only when both targets are already included and compatible; otherwise omit both. For `manual`, set authored revision to the rebuilt active revision when its remapped class is active/compatible and omit it when that class remains `needsReview`. In every branch retain the canonical anchor, method/allowed confidence and compatibility semantics under the remapped compatibility ID. Review output always omits revision/source because its flattened schema has no AssetRevision records;
7. verify all payload digests, full reference closure and absence of source project/epoch/actor/provenance sentinels before constructing the fresh Automerge genesis.

All source records/anchors that share one `AnchorCompatibilityId` map to the same new `cmp` ID, and distinct compatibility classes remain distinct. From one validated, unconflicted active revision, the flattened review Asset derives `compatibleAnchorClassIds` as the sorted, deduplicated intersection of active class IDs with class IDs referenced by included captions. It does not retain target-family topology or unrelated active classes because review is a non-editable snapshot of the validated export-time compatibility state. An included review anchor is compatible exactly when its mapped ID is in that list; absence is valid `needsReview`. This status and pin visibility are intentionally independent of whether the presentation subset includes the original source family. Review cannot pick, rebind, edit or become a clean copy. Every patch/exclusion member of one `CompositeGroupId` maps to the same new `grp` ID, and distinct groups remain distinct. The review builder applies the same complete package-local mapping and equality-class rules but emits flattened snapshot records rather than editable revisions/bindings. Any transformation of an immutable payload therefore produces a new ID/digest in clean output or a snapshot-local record in review output.

A review/share or clean copy MUST NOT be created by saving the original Automerge document and attempting byte redaction. Automerge storage retains editing history as part of the document model: <https://automerge.org/docs/reference/concepts/>.

### 9.4 Export field and privacy matrix

| Field/resource class | Collaboration | Review/share | Clean editable copy |
|---|---|---|---|
| Project ID, history epoch, lineage seed/proof | Include | Exclude; use unrelated snapshot ID | Generate new identity/proof |
| Current project/asset labels, captions, sets, views, material intent | Include | Include reviewed presentation subset | Include current editable state |
| Current contributor IDs, actor IDs, edit timestamps | Include and disclose | Exclude by default; explicit future opt-in requires a new privacy field | Exclude/reset |
| CRDT changes, conflicts, tombstones, deleted/old values | Include | Exclude; unresolved presentation item is resolved or omitted with disclosure | Exclude; all included semantic conflicts must first be explicitly resolved, then build fresh genesis |
| `MigrationSupportV1`: recipe proof, source/operation hashes, canonical decisions, ID preimages and accepted attachment/state mapping | Required when present in a migrated collaboration lineage; disclose as correlatable legacy-migration metadata | Exclude; later-copy continuity is intentionally unavailable | Exclude; the new lineage cannot continue the source migration case |
| Raw migration reports, source bytes and other evidence | Include only under an explicit retention choice and disclose; never required by MigrationSupport | Exclude | Exclude |
| Derivation tool/version/parameters | Include | Include only versioned safe allowlist with local names/paths removed | Same safe allowlist |
| Anchor authored revision and `hitEvidence.source` | Include as weak provenance when present | Omit both; retain method/allowed confidence and canonical anchor | Nonmanual remaps revision/source together only inside a compatible editable closure. Compatible manual sets revision to rebuilt active revision; `needsReview` manual omits it. |
| Source locators and local absolute paths | Logical source indices may be included; local paths never | Local paths never; only display-required logical locators | Local paths never; only editable logical locators |
| Local preferences, device profile, object URLs, OPFS paths | Exclude | Exclude | Exclude |
| Required current visual/attachment blobs | Include current/conflict closure | Include presentation closure | Include editable current closure |
| Deleted-only or otherwise unreferenced blobs | Exclude unless conflict/retention/opaque inventory protects them | Exclude | Exclude |
| Embedded EXIF/model metadata inside an included source blob | Preserved unless a separate scrub option is chosen | Preserved unless scrubbed; disclose | Preserved unless scrubbed; disclose |
| Unrecognized minor fields | Preserve round-trip | Block by default; a pinned versioned snapshot policy may explicitly copy or omit with disclosure | Block by default; a pinned versioned snapshot policy must explicitly preserve or transform it safely |

Snapshot builders use a versioned allowlist for every nested field and report every omission. There is no implicit “safe unknown” category: an unrecognized field always blocks review/clean export until a newer pinned builder or registered extension policy declares criticality, resource reachability, privacy handling and target-package behavior. Privacy tests seed sentinel values in every row of this matrix, including nested provenance and current contributor fields.

## 10. Streaming package safety

Import and export MUST NOT hold the complete archive plus complete entries in memory. Package readers and writers stream to/from BlobStore and a tested output sink. If iOS has no safe large-output sink, the product declares a conservative iOS package limit or directs package building to the desktop tool; it does not claim bounded export based only on streamed input.

The reader rejects before activation:

- absolute, traversal, backslash, NUL or control-character paths;
- duplicate raw or normalized names, Unicode normalization collision and platform case collision;
- duplicate manifest or metadata entries;
- symlink/special/encrypted/unsupported entries;
- prohibited nested archives;
- declared or observed entry/total limits and excessive compression ratio;
- malformed UTF-8, invalid schema or budget-exceeding metadata;
- duplicate raw JSON members, non-NFC persisted strings or NFC-colliding object keys;
- manifest digest/size mismatch and undeclared required blobs;
- same CAS digest with different bytes or length;
- future major schema for edit mode.

Declared limits are integrity metadata, not authority to allocate. Observed counts/sizes must not exceed the declaration, and both declaration and observation must fit the reader's stricter device policy before allocation.

Inspection is side-effect-free. New-project import commits its completion marker last. A partly imported workspace is never listed as a complete project. Existing-project merge uses the exact remote-change batch protocol in section 8: it stages and verifies the final strong/opaque blob closure before metadata application, preserves original history and exposes no partial prefix.

Package export records one consistent set of metadata heads before computing reachability. Concurrent edits go to the next package; an export cannot mix metadata from one moment with a blob closure from another.

## 11. v1 to v2 conversion

Conversion is an explicit new-project operation:

1. select one or more known v1 copies;
2. preserve every source byte and record package SHA-256;
3. establish one stable `legacyLineageKey` and reject copies proven to belong to another v1 project;
4. compute `sourceSetFingerprint` from the sorted source SHA-256/byte-length list using the canonical domain in section 3.2;
5. inspect ZIP, manifest and JSONL with hardened limits;
6. group operations by `(actor, sequence)` and compare canonical-operation digests;
7. quarantine divergent duplicate keys for explicit resolution; allow canonical-equivalent duplicates only;
8. reduce the validated and reviewed union once with a Map-based hardened v1 reducer;
9. build one canonical v2 genesis/history epoch;
10. create a synthetic legacy representation, revision and binding for each current asset whose required model bytes exist, and a typed unresolved asset otherwise;
11. convert anchors, attachments, tags, materials, sets and views with issue reporting;
12. show semantic summary, source hashes, collision decisions and unresolved issues before commit.

A divergent v1 collision never makes a project silently unconvertible or first-wins. The review UI shows both raw sources, canonical forms, provenance and semantic previews. The user chooses:

- keep candidate A;
- keep candidate B;
- preserve both by re-emitting the second as a new reviewed migration command under a synthetic migration actor/sequence after the common validated state, when domain validation permits it.

The choice is stored in a migration-decision record keyed by source-set fingerprint and collision key. “Preserve both” is not raw log forgery: it is a new explicit command with links to both source hashes. Invalid combinations remain blocked with an exportable report.

Specific rules:

- v1 `snapshot.json` is a cache, not migration truth.
- `legacyLineageKey`, `sourceSetFingerprint`, every synthetic semantic ID and every migration issue ID use only the exact canonical preimages, tokens, key recipes and collision rule in section 3.2. No delimiter-concatenated shortcut, filename, input order or source-set fingerprint may enter entity identity.
- `sourceSetFingerprint` identifies only the sorted selected evidence-byte tuples. It does not identify a plan, decisions or report and is never an entity-identity input; those have their own canonical digests.
- `ProjectDocV2.migrationSupport` stores the authoritative case, permanently bound recipe descriptor, append-only source plans, deterministic-ID registrations and accepted attachment/state mapping. A local fingerprint index only reopens that portable case. Later copies MUST use the case's exact recipe/descriptor pair; a newer recipe requires an explicit recipe-upgrade specification or a separate conversion/lineage and cannot reinterpret prior IDs. Re-running the same selected set reuses that conversion unless the user explicitly requests a separate copy; accepting a later copy writes the new plan, pointer and domain delta in one reviewed metadata transaction rather than silently creating another project.
- The pure migration planner is idempotent: identical source set plus identical decision record produces byte-identical canonical snapshot/report excluding repository envelope, creation time, project ID and history epoch. A deliberate separate copy gets new project identity/lineage but the same semantic fingerprint.
- Missing or malformed operations never enter active state; report source file, line and reason.
- Unknown but safe v1 content is retained as an opaque CAS evidence bundle with report metadata.
- Missing model bytes create `Asset.status.kind: 'unresolved'` with no binding, revision, representation or `BlobRef`. When the final v1 transform is valid, that same atomic status stores `pendingAssetToProject` exactly as the immutable builder would have stored it on a binding: translation `[0,0,0]`, rotation `[0,0,0,1]` for Y-up or `[-0.7071067811865476,0,0,0.7071067811865476]` for Z-up, and `uniformScale: effectiveV1Scale`. An invalid/ambiguous transform omits the pending value, emits an issue and later requires explicit alignment; identity is not guessed. The planner creates `missingSourceCompatibilityId = migrationId('anchor-compatibility', {keyKind:'assetSupport',assetEntityId,role:'missingSourceAnchorCompatibility'})`; every migrated AssetAnchor targeting that asset uses it as `authoredAnchorCompatibilityId`, and captions remain attached to the synthetic AssetFrame. A later explicit verified assignment follows the normal blob-first transaction, creates normal content-derived compatibility classes on its new AssetRevision and atomically replaces the status with a ready binding. Unless the reviewed assignment explicitly changes alignment, that binding copies `pendingAssetToProject` exactly. Because the missing-source ID occurs in none of those classes, every preserved caption becomes `needsReview`; assignment cannot alias/reuse the missing-source class, and only an explicit reviewed post-assignment anchor-resolution command may clear the review state.
- A final active v1 asset with `kind: model` maps to one logical v2 `Asset` plus the revision/binding records above. Final active `image|video|audio|other` assets map to `MediaResource`, not spatial `Asset`; `other` is download-only unless a future pinned media policy recognizes it. Unsupported/unknown kinds become issues and opaque evidence rather than guessed media.
- `MediaResource` identity includes the canonical legacy media asset ID and exact `mediaRevisionKey` over kind, original-name/MIME raw digests and blob digest/length. Two v1 asset IDs with identical bytes therefore produce two logical MediaResources that may share one CAS blob and retain separate labels. A later content or logical-metadata change under one legacy asset ID produces a new immutable MediaResource and an explicit attachment retarget, never mutation under the old ID.
- On first conversion, every occurrence in the winning validated v1 `attachments` field creates a separate `CaptionAttachment` seeded by caption ID, legacy media asset ID, the supplying operation digest and raw occurrence index. The registry freezes that logical ID and the accepted left-to-right ID sequence per caption. On a later copy, the planner groups the prior accepted sequence and the new final sequence by `(captionId, mediaAssetEntityId)`. When a group's count is unchanged, its prior IDs are assigned in their prior relative order to the new left-to-right occurrences; moving other media before, after or through that group cannot change those IDs. Current MediaResource revision and current absolute position never determine a reused ID.
- A group changing from zero to nonzero creates new IDs and a group changing to zero proposes explicit tombstones. When both old and new counts are nonzero but unequal, identical legacy references do not reveal which duplicate was inserted or removed. The planner therefore produces a mapping proposal and blocks the migration transaction for explicit review; it never silently moves v2-only fields such as `altText` between duplicate identities. The accepted decision is stored with the migration case and becomes the prior sequence for the next comparison.
- Each matched/new attachment points to the resolved current MediaResource and receives `orderKey = upper-case base36(finalZeroBasedIndex).padStart(13,"0")`; the validated v1 array budget keeps the index within `Number.MAX_SAFE_INTEGER`, so this is fixed-width and inside the 64-character contract. Retarget/reorder changes these mutable fields only in the reviewed migration transaction. A dangling/non-media reference is an issue. Golden fixtures cover identical bytes under different IDs/labels, repeated/interleaved occurrences, front insertion, cross-asset reorder, reviewed duplicate-count increase/decrease, preserved v2-only fields and media-revision replacement without changing matched AttachmentIds.
- Every validated finite v1 caption position is copied component-for-component into the synthetic legacy AssetFrame as `positionAsset`. This migration recipe always omits `normalAsset`. When the source anchor contains a normal member, the planner emits deterministic issue kind `v1-anchor-normal-omitted` and retains the original value only in raw migration evidence. The migration never transforms or recomputes a v1 normal; any later reconstruction is an explicit post-migration command with new provenance or belongs to a different recipe.
- Material name/path mapping applies only when unique and fixture-proven; ambiguity requires review. Identity-bearing legacy `materialKey` and equivalent source keys use their exact raw-UTF-8 digest in migration keys before any display-string NFC conversion. NFC/NFD identity collisions remain distinct review candidates and are never silently merged.
- The recipe companion has a closed field table that converts one accepted v1 material snapshot into whole atomic `appearance` and two-axis `compositing` values. An absent legacy coverage/optics request maps to `{coverage:{policy:'inherit'},optics:'inherit'}`; fixture-proven opacity/chroma/sidedness/lighting values map only to their semantic fields. Legacy engine flags such as queue, `transparent`, depth write or shader name never become intent. An unrecognized or invalid material field makes that override a migration issue instead of selecting a backend default.
- Tags and caption memberships migrate as stable ID-keyed entities. Exact raw-label equality shares one tag; byte-distinct labels that normalize to the same NFC text retain distinct tag IDs and raise a review issue. Repeated references to the same resulting tag within one caption collapse to one set membership with an explicit duplicate report; unknown tag data is reported rather than dropped.
- Views migrate into ProjectFrame. Orthographic span that cannot be derived uniquely is flagged. Set order and each set's default/latest compatible view are derived only from fixture-proven v1 semantics; ambiguity is reported, and at least one fallback set is created.
- Each source set converts once by default. A later-discovered v1 copy changes the fingerprint and enters a migration-diff review, not automatic CRDT merge; every synthetic ID for a previously known canonical legacy key remains unchanged.
- Two separately created conversion epochs never auto-merge.
- Conversion is v2-only-write and never changes or back-writes a v1 source.

## 12. Acceptance contracts

### Metadata candidate

- `STO-AUT-01`: exact versions are pinned; lockfile, licenses, offline build, CSP/WASM and `npm audit` pass.
- `STO-AUT-02`: two tabs and a third-tab restart converge after 2 x 1,000 edits; 10,000-caption and 50,000-change fixtures remain within G0 budgets.
- `STO-AUT-03`: same-field conflicts retain all candidates; delete versus scalar edit, atomic anchor/camera/material-object edits, child membership and parent-delete versus concurrent-child-add are distinguished causally, and keep/delete, reassign, restore and copy-to-new-ID resolutions pass. Concurrent delete/delete, delete/restore and restore/re-delete run in both merge orders and retain complete `EntityLifecycle` candidates; no state/event/reason hybrid can materialize.
- `STO-AUT-04`: concurrent active bindings cannot silently render.
- `STO-AUT-05`: every injected persistence interruption preserves all changes previously acknowledged durable.
- `STO-AUT-06`: same verified adapter lineage in either package order does not change final semantic state; copied seed, different epoch/root change, or missing root proof is rejected.
- `STO-AUT-07`: unknown/invalid domain values cannot reach SceneDocument.
- `STO-AUT-08`: collaboration, review and clean package privacy/merge semantics match section 9.
- `STO-AUT-09`: `LociCanonicalJsonV1` golden byte/hash vectors and every immutable payload digest match across browser, worker and test runtimes.
- `STO-AUT-10`: raw duplicate JSON members and NFC-colliding object keys are rejected before object construction; input-order reversal for byte-equivalent operation text and ASCII references produces the same canonical reducer input and state, while distinct legacy NFC/NFD scalar sequences under one `(actor, op)` are reported as divergent.
- `STO-AUT-11`: immutable metadata maps remain append-only and IDs are never reused. In both merge orders, concurrent loss of the last local root and a new strong reference to the same record either retains/restages verified bytes or rejects explicitly, never yields an authoritative dangling reference.
- `STO-AUT-12`: for every mutable entity type and both merge orders, unresolved active/deleted, delete/restore and restore/re-delete lifecycle candidates exclude the entity and dependent projection from authoritative SceneDocument, normal edit and clean export. Labelled read-only candidate preview and explicit resolve/copy paths preserve all candidates/blobs and cannot expose an Automerge winner as truth.
- `STO-AUT-13`: each field-class row in section 5 has a two-writer/both-merge-order fixture. Project default, every parent/resource/scope edge, optional default, atomic value, order key and presentation scalar produce exactly the stated exclusion/placeholder/edit/review/clean behavior, while every candidate target/blob remains protected.

### CAS and journal

- `STO-CAS-01`: a 500 MiB incompressible stress package round-trips without whole-file `arrayBuffer()` and with no more than 64 MiB of app-managed simultaneous I/O buffers. This is not total browser/GPU memory or a product size guarantee.
- `STO-CAS-02`: cancellation at every chunk boundary leaves no active dangling metadata.
- `STO-CAS-03`: process interruption at every journal state converges idempotently to a valid old or new state.
- `STO-CAS-04`: quota failure at every write boundary preserves the old active binding.
- `STO-CAS-05`: concurrent equal imports produce one verified physical blob; conflicting bytes never share a digest record.
- `STO-CAS-06`: bit flip, size mismatch and manifest mismatch fail before metadata commit.
- `STO-CAS-07`: shared-blob reachability and grace-period GC preserve remaining projects; opaque unknown fields, future-major, unreadable or missing-inventory projects make destructive GC fail closed.
- `STO-CAS-08`: target physical iOS passes background/restore and quota-pressure recovery.
- `STO-CAS-09`: releasing all decoded/GPU residency leaves CAS bytes for every active source/display/preview/interaction representation and attachment intact across close, reopen, offline use and export. A derivative becomes collectible only after a durable replacement omits it and every other root expires; a missing active digest produces degraded/read-only repair, never a normal cache miss.
- `STO-CAS-10`: crash after exact metadata-change durability but before journal state update, with a concurrent same-field replacement before/after recovery, never regenerates the old mutation on current heads. Hash-present replay is a no-op; hash-absent replay applies the recorded bytes with original dependencies, and bytes/hash/dependency/message/lineage tampering quarantines before exposure.
- `STO-CAS-11`: a collaboration merge with multiple causally related and concurrent remote changes stages all blobs first, preserves original change hashes/dependencies, resumes after every possible durable prefix, and publishes no partial SceneDocument/export to a second tab. Topological ties, duplicates, a missing dependency, cross-tab edits during the barrier and crash/restart run in both orders; only the complete verified hash set becomes visible.
- `STO-CAS-12`: with a verified 500 MiB project blob already in inventory, a caption-only command, crash recovery and collaboration no-op merge read zero payload bytes from that blob and keep `stagedBlobs` empty; they validate inventory membership/presence only. Newly staged/restaged bytes and an explicit corruption-suspicion path still receive full hash verification.

### Package and privacy

- `STO-PKG-01`: the malicious corpus covers every rejection class in section 10 and never causes partial activation.
- `STO-PKG-02`: export under concurrent edit matches one recorded metadata head set.
- `STO-PKG-03`: collaboration export has no missing required blob; opaque reachability includes every protected inventory digest or refuses safely.
- `STO-PKG-04`: sentinel values in every section 9.4 field/resource class are absent or included exactly as specified, verified by parsed archive inspection and raw byte search.
- `STO-PKG-05`: review is nonmergeable; clean copy has a new verified lineage and refuses every unresolved included semantic conflict until explicit resolution.
- `STO-PKG-06`: unknown minor data and a blob referenced only by that unknown field survive old-writer edit, GC attempt, collaboration re-export and new-writer reopen; review/clean block until a pinned explicit field policy exists, and unknown major cannot be durably edited.
- `STO-PKG-07`: CSV values whose first non-whitespace character is `=`, `+`, `-`, or `@` are neutralized as text, including tab/control-prefix fixtures.
- `STO-PKG-08`: review always omits anchor `authoredAssetRevisionId` plus complete `hitEvidence.source`; clean remaps nonmanual revision/source together only inside a compatible editable closure, sets a compatible manual anchor to the rebuilt active revision, and omits revision from a still-`needsReview` manual anchor. From the validated unconflicted active revision, each flattened review Asset carries the sorted, deduplicated intersection of active class IDs with included-caption class IDs, so every included caption deterministically derives compatible/`needsReview` without an AssetRevision map, target-family reference or leakage of unrelated classes. Fixtures also cover omitted `parentBindingId`, `parentRevisionId` and material-map history, duplicate/unsorted IDs, cross-asset ID reuse and a caption whose class exists only under another Asset. Canonical anchor, remapped compatibility class and internal hit method/confidence remain without requiring a persistent per-pin approximation badge. Base and singleton repair classes retain distinct equality classes through review/clean; no dangling required reference/blob appears and review exposes no edit/rebind/clean route.
- `STO-PKG-09`: each manifest discriminator validates only its legal identity/proof fields; review has no source lineage. Review and clean maps re-key every included nominal ID, including `cmp` and `grp`, preserve equality/inequality classes, rewrite every reference, recompute every changed immutable digest, and pass parsed plus raw sentinel scans proving that no source ID/history/provenance remains.
- `STO-PKG-10`: false MIME/extension, active-document polyglots, external model references, malformed media and decode-bomb fixtures follow the untrusted-media contract; download-only content is never embedded or navigated and import never makes a network request or partially activates a decoder result.
- `STO-PKG-11`: a migrated collaboration package includes the exact portable case and every active/conflicting mapping-baseline blob and can continue migration on another device. Parsed and raw sentinel scans prove that review/clean contain no migration support, baseline, preimage, decision or legacy source/operation hash, and their UI discloses continuity loss.
- `STO-PKG-12`: two active MaterialOverride IDs with one semantic scope/target key survive collaboration as a duplicate-key conflict, produce no effective override, are both omitted with disclosure from review when that target is optional, and block an included clean export until a causal tombstone/retarget resolution leaves exactly one.

### Revision and migration

- `STO-REV-01`: replacement and alignment leave every old immutable record and blob digest unchanged.
- `STO-REV-02`: interruption yields either old binding plus old blobs or new binding plus verified new blobs, never a missing reference.
- `STO-REV-03`: concurrent replacement becomes a binding conflict.
- `STO-REV-04`: incompatible anchors/materials never silently rebind.
- `STO-REV-05`: adding a nonvisual derivative creates a new revision and binding with the prior alignment, preserves anchors/materials through declared compatibility, and does not mutate prior records.
- `STO-MIG-01`: anonymized real v1 fixtures are mandatory in addition to synthetic data.
- `STO-MIG-02`: input-copy order yields the same source-set fingerprint, legacy lineage key, deterministic synthetic IDs, canonical semantic snapshot and issue report.
- `STO-MIG-03`: divergent `(actor, sequence)` duplicates are detected; keep-A, keep-B and valid preserve-both decisions are deterministic and never first-wins.
- `STO-MIG-04`: repeated conversion of the same selected source set reuses the registry result by default; the pure planner is byte-identical modulo the explicitly excluded project/envelope/time fields.
- `STO-MIG-05`: source hashes remain unchanged and source files are never overwritten.
- `STO-MIG-06`: frame, spatial asset, caption, attachment, media resource, tag membership, ordered set/default view, material and view mappings match golden expectations. Mesh-only, point-only and mixed one-container models create the exact contribution/family/catalog records; identical bytes under two legacy media asset IDs retain two resources/labels over one CAS blob, and repeated/interleaved attachment occurrences retain count and order.
- `STO-MIG-07`: ambiguity, missing blobs, malformed and unknown operations appear in the report without guessed application; a missing-model asset has no binding or fabricated `BlobRef`, preserves captions under its deterministic missing-source compatibility class, and later becomes ready through the blob-first transaction whose distinct content classes omit that ID and produce `needsReview` rather than silent rebinding.
- `STO-MIG-08`: independently converted epochs cannot auto-merge.
- `STO-MIG-09`: clean export contains no migration-source or old-history sentinel.
- `STO-MIG-10`: adding a later divergent copy to an explicitly reviewed migration case changes the source-set fingerprint/report but preserves every prior logical entity ID. Attachment prepend/reorder and media revision retarget preserve matched AttachmentIds; an unequal nonzero duplicate count cannot commit before an explicit identity mapping, and that mapping preserves every v2-only child field on its chosen ID. Only accepted new/removed occurrences add/tombstone IDs. Previously registered immutable IDs either reproduce identical full bytes/digests or remain untouched while a new recipe/content/alignment key creates a new record; changed model content receives new Representation, VariantFamily, material layout, revision and compatibility IDs so global family invariants never join old/new content accidentally.
- `STO-MIG-11`: the ratified companion/manifest descriptor supplies golden byte/hash vectors for all four complete immutable record payloads under `v1-migration-recipe-1`, canonical/invalid/missing/mixed v1 project-ID route boundaries, both lineage-key preimages, reordered/duplicated source tuples and the differing-length digest rejection, exact FormatProfile pairs, static pose, logical bounds, model/media inspection plus content/alignment keys, every migration output kind/key recipe, fresh-only project/history/case/package/snapshot IDs, and truncated-ID/recipe/profile/descriptor-mismatch abort behavior across browser, worker and test runtimes.
- `STO-MIG-12`: `V1CanonicalOperation` golden bytes cover closed top-level shape, retained unknown nested values, extra top-level rejection, create/update/delete `v` absent/null rules, canonical and malformed HLC/actor/user/entity IDs, raw Unicode scalar preservation and NFC-key collision quarantine. Browser, worker and test runtimes produce identical operation digests and divergent-collision decisions.
- `STO-MIG-13`: missing-model fixtures produce the exact `missingSourceAnchorCompatibility` preimage/ID without a content revision and preserve every valid caption. A scale-100/Z-up fixture stores the exact pending Sim(3); later verified assignment copies it to the binding by default, preserves caption/camera ProjectFrame projection and deterministically produces `needsReview`. Invalid-transform assignment requires explicit alignment, and no path silently aliases the missing-source ID with any content-derived compatibility class.
- `STO-MIG-14`: browser, worker and test migration of v1 anchors always produces identical `positionAsset`, absent `normalAsset`, and the exact presence/absence of `v1-anchor-normal-omitted`; no parser or backend recomputes a normal during this recipe.
- `STO-MIG-15`: initial active/deleted, source-less fallback-set creation, later restore/delete, unchanged-state replay and `decision X -> decision Y -> decision X` toggle fixtures use the exact lifecycle reason, previous-event and transition-evidence preimages. Only the fallback set uses `syntheticInitial`; every actual transition receives a distinct event ID, while replay or unchanged visibility retains the existing event.
- `STO-MIG-16`: after device A converts and adds v2-only attachment data, device B opens a collaboration package and accepts prepend/reorder/media-revision and reviewed duplicate-count copies without changing matched AttachmentIds or v2-only fields. Registry map-key equality, full-preimage hash/prefix, plan/baseline digest, parent/active pointer and concurrent-plan conflict checks fail closed under tampering and both merge orders.
- `STO-MIG-17`: durable conversion is disabled until `v1-migration-recipe-1` has one ratified immutable companion/manifest descriptor and every referenced FormatProfile has its one ratified specification digest. Their model/media inspection and complete immutable-record vectors pass byte-for-byte in browser, worker and test; another descriptor under the same recipe ID or profile digest under the same profile ID is rejected before planning.
- `STO-MIG-18`: profile fixtures cover source opaque/MASK-default/MASK-explicit/BLEND, supported transmission, unlit/double-sided, OBJ dissolve/alpha map, STL synthetic default and PLY vertex alpha. Material-object-less PLY fixtures prove that RGB-only and RGBA-alpha-identically-one inputs receive one synthetic opaque slot, while any RGBA alpha below one receives one synthetic blend slot without alpha erasure. Source semantics, two-axis material intent, logical bounds, IDs, full Representation bytes and payload digests match across browser/worker/test and survive collaboration/review/clean re-keying without backend flags.
- `STO-MIG-19`: recipe 1 emits one sorted compatibility class over every migrated pickable contribution family because v1 lacks reliable family-level pin provenance. Collaboration/clean retain the full partition and exact target sets, while review flattens the validated active classes to sorted ID membership without dangling family references. Adding/removing a singleton repair class leaves the migrated base class and base pins unchanged; a partial base-family replacement rotates the grouped class and reviews all ambiguous legacy pins.
- `STO-MIG-20`: the exact historical `^cap_LM[0-9A-HJKMNP-TV-Z]{24}$` class is admitted only with v1 `caption` operations and survives read/migration plus later update/delete references without rewrite; every near-miss, use with another known kind and attempt by a new converter/allocator is rejected.
