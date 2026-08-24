# G0 fixture acquisition and Release restore contract

> Status: `PRODUCT-OWNER RATIFIED SECURITY/EVIDENCE CONTRACT / NOT IMPLEMENTED`.
>
> The Product Owner approved the two-mode boundary and fixture-Release
> publication lifecycle, then ratified this revision's exact numeric envelope,
> two Mode-B origins and exact descriptor/receipt schema on 2026-08-24. This
> authorizes the dependency-free Mode-B network-capable implementation defined
> here. The Product Owner also ratified the timeout/commit, safe-lock receipt
> exception and conservative quota clarification in this revision on the same
> date. It does not authorize real network acquisition, a Release operation,
> upload, publication, registry adoption, push, deploy or product release.

## 1. Purpose and authority

This contract defines the bounded pre-adoption acquisition boundary required by
`G0-REG-01` and `G0-EXIT-01`. It does not amend the fixture registry, run-record
or external-artifact-manifest schemas. It does not adopt bytes, grant G0 credit,
ratify a renderer/profile or authorize a GitHub Release operation.

Normal `fixtures:verify`, `evidence:verify` and `npm test` remain offline. The
runId-bound external-artifact manifest is not a pre-adoption receipt and MUST
NOT be silently reused as one.

The public contracts are deliberately distinct:

- **Mode A — upstream candidate exploration** observes bytes from a separately
  approved public upstream origin and publishes them only to an unverified
  local tier. It never creates a stable fixture identity.
- **Mode B — exact fixture-Release restore** re-fetches a canonical LociView
  fixture-only Release asset and proves exact streamed byte count and SHA-256.
  Its receipt is pre-adoption transport evidence only.

One internal bounded streaming core MAY be shared. A mode flag, descriptor
field, CLI option or environment variable MUST NOT reinterpret one public
contract as the other.

The first implementation slice is **Mode B only**. Mode A remains unimplemented
until the Product Owner approves the exact upstream origin set and a reviewed
code-owned allowlist change. Descriptor data alone never grants network access.

## 2. Commands and trust anchor

The contracted commands are:

```text
npm run fixtures:candidate:acquire -- --descriptor <path>
npm run fixtures:release:restore -- --descriptor <path>
npm run fixtures:receipt:verify -- --receipt <path>
```

The candidate command is specified but is not added by the first implementation
slice.

CLI descriptors MUST:

1. be portable repository-relative paths below
   `fixtures/acquisition/descriptors/`;
2. be exact stage-0 indexed regular Git blobs, not links, submodules,
   worktree-only files or `.git/**` paths;
3. have worktree bytes equal to the indexed blob;
4. be at most 64 KiB and pass bounded, duplicate-member-safe UTF-8 JSON
   parsing before schema validation; and
5. have their raw-byte SHA-256 recorded in the receipt. The digest is of the
   exact descriptor bytes, not reserialized JSON.

Mode A origins must be the intersection of its descriptor and a reviewed
code-owned exact-origin allowlist. Mode B uses only the code-owned origins and
path rule in section 6. No CLI argument, descriptor member, inherited proxy,
custom agent or environment variable may widen either allowlist.

The production CLI always uses the production transport. An injected transport
or loopback policy seam exists only as an imported test API; it is not
selectable from CLI arguments, descriptors or environment variables.

## 3. Descriptor schemas

Both schemas set `additionalProperties: false`. IDs use
`^[a-z0-9][a-z0-9._-]{2,95}$`; byte counts are non-negative safe integers; all
strings are well-formed Unicode. Schema parsing has a maximum depth of 8,
128 total object members, 16 items in any array and 2,048 code units in any
non-URL string.

### 3.1 Mode A descriptor

Schema ID: `g0-upstream-candidate-acquisition-1`.

| Field | Exact contract |
|---|---|
| `$schema` | Constant repository-relative schema path |
| `schemaVersion` | Constant `g0-upstream-candidate-acquisition-1` |
| `requestId` | Portable acquisition ID |
| `sourceUrl` | Canonical public HTTPS URL without user information, query or fragment |
| `allowedRedirectOrigins` | Sorted unique exact normalized origins; each must also be present in the code-owned allowlist |
| `ephemeralQueryOrigins` | Sorted unique subset of `allowedRedirectOrigins`; each needs separate code-owned approval |
| `maximumBytes` | Positive safe integer no greater than the hard 2 GiB cap |
| `portableFileName` | Portable non-reserved leaf name; used only as a display hint, never directly as a filesystem target |

The source origin itself must be in both allowlists. A descriptor may narrow a
hard timeout, byte or redirect limit in a later schema revision but cannot raise
one in this version.

### 3.2 Mode B descriptor

Schema ID: `g0-fixture-release-restore-1`.

| Field | Exact contract |
|---|---|
| `$schema` | Constant repository-relative schema path |
| `schemaVersion` | Constant `g0-fixture-release-restore-1` |
| `requestId` | Portable acquisition ID |
| `locator` | Exact canonical LociView fixture-Release locator defined in section 6 |
| `expectedSha256` | Lowercase 64-hex SHA-256 |
| `expectedBytes` | Positive safe integer no greater than 2 GiB |

The asset name is derived from the validated locator and is never accepted as a
second, potentially divergent filesystem identity.

## 4. Receipt schemas and false-credit constants

Mode A uses `g0-upstream-candidate-receipt-1`; Mode B uses
`g0-fixture-release-restore-receipt-1`. Receipts reject unknown and duplicate
members and use the same structural limits as descriptors, with a 128 KiB file
limit.

Every receipt contains exactly these top-level fields:

| Field | Exact contract |
|---|---|
| `$schema` | Constant mode-specific repository-relative schema path |
| `schemaVersion` | Constant mode-specific receipt version |
| `mode` | `candidate` or `release-restore` |
| `trustTier` | Constant `pre-adoption-transport-only` |
| `requestId` | Descriptor request ID |
| `attemptId` | Tool-generated unpredictable portable ID; never supplied by the descriptor |
| `descriptor` | Exact object `{ path, sha256 }`, containing the normalized repository path and exact raw-byte SHA-256 |
| `startedAtUtc` / `completedAtUtc` | Strict UTC timestamps |
| `outcome` | `success` or `failure` |
| `error` | `null` on success; fixed error object on failure |
| `sourceIdentity` | Validated initial stable URL, or `null` when validation did not complete |
| `transport` | Sanitized measured transport facts below |
| `local` | Local cache/publication disposition below |
| `stableTransportIdentity` | Constant `false` for A; for B, `true` only after `sourceIdentity` is the validated canonical Release locator and otherwise `false` |
| `stableFixtureIdentity` | Constant `false` |
| `registryAdopted` | Constant `false` |
| `g0Credit` | Constant `false` |
| `rendererOrProfileRatified` | Constant `false` |
| `deviceEvidence` | Constant `false` |

`error` contains only `{ code, exitCode, retryable, hopIndex }`. `code` is a
closed enum from section 10; `hopIndex` is a non-negative integer or `null`.
No raw exception message or cause is serializable.

`transport` contains exactly:

- `redirectOrigins`: normalized origin enums only, with no path/query;
- `redirectCount`;
- `finalOrigin`: normalized origin or `null`;
- `status`: final integer status or `null`;
- `declaredBytes`: one validated Content-Length value or `null`;
- `measuredBytes`: bytes actually read from the final body;
- `measuredSha256`: a digest only after a clean body EOF, otherwise `null`;
- `streamEnded`: whether clean EOF was observed; and
- `expectedMatch`: `true`/`false` for B after clean EOF, otherwise `null`.

`local` contains exactly `{ disposition, relativePath }`. `disposition` is one
of `none`, `partial-deleted`, `unverified-published`, `verified-published`,
`cache-reused` or `orphan-cache`; `relativePath` is a sanitized acquisition-root
relative path or `null`.

Success requires `error: null`, clean EOF, a complete measured digest, an
atomically published success receipt and one of the mode-appropriate published
or reused dispositions. Failure requires an error object. A partial-stream
digest is never recorded as if it identified complete bytes.

The following condition table is closed; no other combination is valid:

| Mode/outcome | Required transport facts | Allowed local disposition |
|---|---|---|
| A success | validated `sourceIdentity`; `stableTransportIdentity=false`; `streamEnded=true`; measured digest present; `expectedMatch=null` | `unverified-published` or `cache-reused`, with non-null relative path |
| B success | `sourceIdentity` equals descriptor `locator`; `stableTransportIdentity=true`; status 200; `streamEnded=true`; `expectedMatch=true`; measured bytes/digest exactly equal descriptor `expectedBytes`/`expectedSha256` | `verified-published` or `cache-reused`, with non-null relative path |
| A failure | `stableTransportIdentity=false`; `expectedMatch=null`; source identity is validated or null | `none` or `partial-deleted` with null path; `orphan-cache` with non-null path only after local publication failure |
| B failure before locator validation | `sourceIdentity=null`; `stableTransportIdentity=false`; `expectedMatch=null` | `none` or `partial-deleted` with null path |
| B failure after locator validation but before clean EOF | canonical source identity; `stableTransportIdentity=true`; `streamEnded=false`; measured digest and `expectedMatch` are null | `none` or `partial-deleted` with null path |
| B failure after clean EOF/mismatch | canonical source identity; `stableTransportIdentity=true`; `streamEnded=true`; measured digest present; `expectedMatch=false` | `none` or `partial-deleted` with null path; mismatched bytes never enter `verified-transport` or `orphan-cache` |
| B failure after clean EOF/exact match but before the durable success-receipt commit point | canonical source identity; measured tuple exactly equals the descriptor; `stableTransportIdentity=true`; `streamEnded=true`; `expectedMatch=true`; `E_OVERALL_TIMEOUT` is allowed when expiry is observed before the receipt commit-critical section begins; every other failure is limited to applicable local containment/cache/publish/receipt codes | `none` or `partial-deleted` with null path before byte publication; `orphan-cache` with non-null path only after exact bytes were published by this attempt but no durable success receipt committed |

For every failure, `error.exitCode` must equal section 10's mapping for
`error.code`. For every disposition ending in `published`, `cache-reused` or
`orphan-cache`, `relativePath` is required; it is null for `none` and
`partial-deleted`.

JSON Schema enforces the within-receipt branches but cannot prove equality with
a separate descriptor. The offline `fixtures:receipt:verify` command therefore
resolves the exact indexed descriptor path, verifies its raw digest and schema,
then cross-checks mode/schema, request ID, source identity, expected tuple,
measured tuple, outcome, false-credit constants, error/exit mapping and local
disposition. A self-asserted `expectedMatch: true` never suffices. Receipt
construction calls the same semantic validator before atomic publication; an
independent reviewer can rerun the offline command without network access.
The verifier acquires the same zero-byte exclusive writer lock with the same
safe precheck, `wx` and identity rules, then holds its handle from before opening
the receipt through file identity, bounded read, semantic/local-path checks and
post-validation identity checks. A pre-existing lock or `EEXIST` yields a fixed
fail-closed verifier result. The verifier releases only its own identity-checked
lock after the verdict and never creates an acquisition receipt. A check-only
lock-existence probe is forbidden: serialization covers the complete receipt
observation, so an indeterminate in-progress or failed publication cannot become
independent success evidence during a race.

Receipt filenames derive only from the validated request ID and unpredictable
attempt ID. They never contain a URL, host, asset name or remote error text.
An exit-2 failure before a descriptor yields a valid request ID and exact raw
digest produces no receipt; stderr still contains only the fixed error code.
After descriptor validation and successful safe writer-lock acquisition, every
outcome attempts the mode-specific receipt. A failure that prevents safe root
initialization or lock acquisition, including `E_LOCK_BUSY`, produces no receipt
and emits only its fixed code and hop index.

## 5. Ratified numeric envelope

The Product Owner ratified these exact values for Mode-B implementation on
2026-08-24:

| Limit | Ratified value |
|---|---:|
| Final body / one local candidate or restore | 2 GiB |
| Connect phase per hop (DNS + TCP + TLS + headers) | 15 seconds |
| Body idle interval | 30 seconds |
| Monotonic overall attempt deadline | 30 minutes |
| Redirects | 5 |
| Response headers per hop | 64 KiB |
| DNS A/AAAA answers per hop | 16 |
| Descriptor / receipt bytes | 64 KiB / 128 KiB |
| Acquisition-root total bytes | 6 GiB |
| Minimum free-space headroom before streaming | requested maximum + 128 KiB receipt reservation + 512 MiB |
| Directory entries inspected per acquisition root/tier | 1,000 |
| Concurrent writers | 1 |
| Automatic retries | 0 |

Mode B stops after `expectedBytes + 1` observed final-body bytes, subject to the
2 GiB expected-byte cap; the one-byte probe distinguishes extra bytes and is
never persisted. Mode A stops after `maximumBytes + 1`. Redirect bodies are
never consumed. Header and body counters use safe integers.

The monotonic overall deadline never resets and covers all work before the
success-receipt commit-critical section, including redirects, streaming, byte
sync, cache publication or reuse, receipt construction/validation/staging and
pre-commit cleanup. It is checked before and after every pre-commit await and
immediately before that section begins. Before another failure has been fixed,
at or after expiry no new success step or success-receipt commit-critical
section begins, every abortable network operation is cancelled, and the outcome
is fixed as `E_OVERALL_TIMEOUT` / exit 4, including after clean EOF and an exact
match. Exact bytes already published by this attempt then have `orphan-cache`
disposition; a pre-existing cache selected for reuse does not.

An in-flight filesystem operation is not forcibly cancellable and is allowed to
settle. Its local effects are re-inspected before another step or failure
disposition is chosen. The receipt commit-critical section comprises atomic
no-clobber publication of the already written, synced, re-read and validated
receipt; removal of every source name hard-linked to it; final single-link and
containment revalidation; and supported directory sync. If that section begins
before the deadline, it completes without interruption and its actual result is
authoritative: a durable validated receipt commits success and exit 0 even when
completion is observed after the deadline, while a failed section retains its
applicable local/receipt code and exit 6.

Once any failure code is fixed, only that outcome's failure-receipt attempt and
tool-owned safety cleanup may continue. A later deadline or secondary receipt or
cleanup error does not replace the fixed primary code/exit, and neither may
restore success. In particular, a fixed timeout remains exit 4. The deadline is
an outcome/admission deadline, not a guarantee that an already running
non-cancellable filesystem call or safety cleanup returns by exactly 30
minutes. The body idle timer is refreshed only by a non-empty final-body chunk.

One tool-owned writer lock protects the acquisition root. Before its zero-byte
exclusive `wx` file is created, a bounded root precheck reserves one root entry
for it and requires the pre-lock file-byte total to remain within 6 GiB. After
the lock is acquired, the authoritative root/tier byte and entry inspection is
re-run. A busy or stale lock fails closed; v1 does not break or delete another
process's lock. Stale partials remain non-authoritative, count against the root
quota and cause a bounded diagnostic rather than automatic destructive cleanup.
A separately reviewed cleanup command is outside this slice.
After the fixed tier directories and safe writer lock exist, bounded inspection
requires every existing file to be regular, non-link and single-link. Under the
lock, `currentRootBytes` is the BigInt sum of each accepted file's logical size,
including the lock, stale partials, caches and receipts; unsafe or multiply
linked entries fail rather than being deduplicated. Directory metadata is not a
file byte. A transient hard-link source and destination created by this attempt
refer to one allocation and are counted once only inside the tool-owned cache or
receipt no-clobber publication critical section.

For Mode B, admission before transport requires both:

```text
currentRootBytes + expectedBytes + 128 KiB <= 6 GiB
availableFilesystemBytes >= expectedBytes + 128 KiB + 512 MiB
```

The 128 KiB reserves at most one receipt inode at a time. Receipt staging and
its no-clobber destination may temporarily give that inode two names, but no
second receipt inode may be created without removing the prior owned inode or
re-running quota and slot admission. Anticipated cache reuse never reduces the
conservative byte reservation.

The implementation also reserves the maximum simultaneously required directory
entries before transport: one body-staging name in `partial`, one cache name in
`verified-transport`, and one receipt-staging plus one receipt-publication name
in `receipts`. Fixed directories and the writer-lock name are counted before
the checks; the acquisition root and every tier remain at or below 1,000 entries
throughout the transaction. Existing destinations do not relax the reservation.
A failure receipt reuses the receipt staging budget or fails closed without
creating another name.

## 6. URL, redirect, DNS and TLS policy

Every hop, in both modes, is re-parsed and re-authorized before connection:

- scheme is exactly `https`;
- user information and fragment are absent;
- hostname is canonical ASCII without a trailing dot;
- the normalized origin, including explicit port, is allowlisted;
- Mode B uses port 443 only;
- redirect status is exactly one of 301, 302, 303, 307 or 308 and has exactly
  one valid `Location` value; relative locations resolve against the current
  URL and then pass the complete policy again; and
- initial identities have no query.

Mode B's initial URL must match the existing registry-v2 canonical path:

```text
https://github.com/ChoRdChario/LociView/releases/download/fixtures-v<integer>[.<integer>...]/<portable-asset-name>
```

Its only approved origins are `https://github.com:443` and
`https://release-assets.githubusercontent.com:443`. A query is permitted only
on a redirect to the latter origin. It exists only in memory for that request.
Mode A permits a redirect query only when the exact origin is separately listed
in both its `ephemeralQueryOrigins` and the reviewed code-owned allowlist.

For every hostname and hop, DNS resolution is bounded to 16 A/AAAA answers.
IPv4, IPv6 and IPv4-mapped IPv6 are normalized before classification. Every
answer must be a public routable unicast address; literal, unspecified,
loopback, link-local, private, carrier-grade NAT, multicast, documentation,
benchmark and other special-use ranges fail the whole hop.

The transport connects directly to one vetted address without an implicit
second resolution or environment proxy. It preserves the approved hostname in
the HTTP `Host` header and TLS `servername`, performs normal certificate and
hostname verification, and verifies that the connected socket's remote address
equals the pinned normalized address. Proxy agents, inherited proxy settings,
custom CAs that disable verification and redirecting agents are not used.

Only a fully validated initial stable identity may enter `sourceIdentity`.
Redirects contribute normalized origins and hop indexes only. Raw `Location`,
redirect path/query, response headers, invalid input, TLS/parser errors and raw
exception messages/causes never enter stdout, stderr, receipts, filenames or
partial-file contents.

## 7. HTTP and streaming rules

Requests use GET and `Accept-Encoding: identity`. A final response succeeds only
with status 200, no unsupported Content-Encoding and a readable byte stream.
Status 206 and every other non-redirect status fail closed; response bodies and
headers are not echoed.

Content-Length is advisory, never authoritative. If present, it must be one
unambiguous canonical decimal safe integer. Mode A rejects a value above its
maximum. Mode B rejects a value different from `expectedBytes`. In all accepted
cases the streamed count and SHA-256 decide the outcome. Missing Content-Length
is allowed.

The final body streams once into a tool-created partial file while an
incremental SHA-256 and exact byte count are updated. Status error, truncation,
extra bytes, digest mismatch, stream error, timeout, oversize and cancellation
fail closed. Mode A success means only that a complete bounded stream was
observed; Mode B additionally requires the exact expected count and digest.

## 8. Staging, cache and no-clobber publication

Implementation creates ignored repository-local roots:

```text
.artifacts/acquisition/partial/
.artifacts/acquisition/unverified/
.artifacts/acquisition/verified-transport/
.artifacts/acquisition/receipts/
```

All path components are fixed by code or derived from validated IDs/digests;
descriptor/URL leaf text is not used directly as a target. Before use, every
ancestor is boundedly inspected as a real non-link directory within the real
acquisition root. Existing files must be regular non-link, single-link files.
File handles are revalidated with `fstat`; containment and ancestor checks run
immediately before and after publication.

Partial files use unpredictable names and exclusive `wx` creation. After clean
EOF the file is flushed, synced and closed. Publication uses a same-filesystem
atomic **no-clobber** primitive (for example link-then-unlink where supported),
not a replacement rename. There is no overwrite fallback. The destination
link must succeed, its source name must be removed, the final destination must
be revalidated as contained and single-link, and both source and destination
directories must be synced where the platform supports it before byte
publication completes. Only specifically allowlisted platform-unsupported
directory-sync results may be waived; every other sync error fails closed.

On `EEXIST`, the existing destination is re-inspected and streamed through the
same byte-count/SHA-256 verifier. An exact match may be reused; a mismatch is
left unchanged and fails. Cache names and prior receipts never substitute for
rehashing.

Accidental concurrent tool processes are in scope and are serialized by the
writer lock. An adversary with independent write access to the acquisition root
during a run is outside the v1 local-tool threat model; pre-existing links,
junctions, hard-link aliases, path escape and ordinary races are still rejected
as above.

## 9. Bytes/receipt commit ordering and cleanup

The receipt is the success commit marker and is published last:

1. validate the exact indexed descriptor and acquire the writer lock;
2. stream, hash and sync the partial bytes;
3. prepare a receipt object using fixed error mappings;
4. schema-validate and privacy-scan the receipt;
5. publish or rehash/reuse bytes using section 8's complete no-clobber
   publication critical section;
6. write, sync, re-read, schema/privacy-validate and no-clobber-publish the
   receipt; remove its hard-linked source name, revalidate a single contained
   final link and sync supported directories as one commit-critical section; and
7. report exit 0 only after the receipt is durable at its local path.

If step 6 begins before the deadline and fails after byte publication, its
applicable local/receipt exit code 6 is returned and the byte copy is an
`orphan-cache`: it is not a successful result and must be fully rehashed on the
next attempt. If timeout was fixed before step 6, no success commit begins and
its exit 4 remains authoritative. Failure receipts use the same atomic
validation and no-clobber rules. If no receipt can be written, stderr contains
only a fixed error code and hop index.

Once the durable success receipt is committed, the outcome is irreversible.
Only closing detached handles, deleting non-aliasing attempt scratch and
identity-checked release of this attempt's writer lock are post-commit
housekeeping. A later clock crossing or housekeeping failure never deletes or
rewrites committed state, changes exit 0 to failure or publishes a second
receipt. Residual tool-owned names remain non-authoritative and count against
the next invocation's quotas.

A failing invocation MUST NOT leave a final success receipt that the offline
verifier can accept. If a final success-receipt name becomes visible and a later
commit-critical substep fails, the tool either removes that exact owned link,
syncs the affected directory where supported and revalidates its absence before
releasing the writer lock, or retains the fail-closed writer lock and any
staging alias while returning failure. Later cleanup in that invocation MUST
NOT transform the visible receipt into a verifier-acceptable single-link result.
Conversely, a contained, single-link, semantically valid final success receipt
observed while the verifier owns the lock and no producer lock pre-existed is an
observable committed success and cannot coexist with a producer-reported
failure.

Every failure attempts to close handles and remove its own exclusive partial.
Cleanup failure never changes failure into success. Residual names contain only
attempt IDs, count against quota and are never consulted as authoritative data.

Successful and failed invocations leave `fixtures/registry.json`, evidence
records, Git inputs and authoritative fixture paths byte-for-byte unchanged.

## 10. Exit and retryability table

Automatic retry count is zero. `retryable` is advisory for a new explicit
invocation and follows this closed table:

| Error class | Exit | Retryable |
|---|---:|---|
| `E_USAGE`, `E_DESCRIPTOR`, `E_SCHEMA` | 2 | false |
| `E_URL_POLICY`, `E_REDIRECT_POLICY`, `E_ADDRESS_POLICY`, `E_SECRET_POLICY` | 3 | false |
| `E_DNS_IO`, `E_TCP_IO`, `E_TLS_IO`, `E_STREAM_IO` | 4 | true |
| `E_TLS_IDENTITY`, `E_HTTP_AUTH`, `E_HTTP_NOT_FOUND`, `E_HTTP_OTHER_4XX` | 4 | false |
| `E_HTTP_408`, `E_HTTP_425`, `E_HTTP_429`, `E_HTTP_5XX` | 4 | true |
| `E_CONTENT_ENCODING` | 4 | false |
| `E_CANCELLED` | 4 | false |
| `E_CONNECT_TIMEOUT`, `E_IDLE_TIMEOUT`, `E_OVERALL_TIMEOUT` | 4 | true |
| `E_DECLARED_LENGTH`, `E_OVERSIZE`, `E_EXTRA_BYTES`, `E_DIGEST_MISMATCH` | 5 | false |
| `E_TRUNCATED` | 5 | true |
| `E_LOCK_BUSY`, `E_NO_SPACE`, `E_LOCAL_IO` | 6 | true |
| `E_CONTAINMENT`, `E_LINK`, `E_CACHE_MISMATCH`, `E_PUBLISH_CONFLICT` | 6 | false |
| `E_RECEIPT_SCHEMA`, `E_RECEIPT_PRIVACY` | 6 | false |
| `E_RECEIPT_IO` | 6 | true |

Raw platform/provider errors are mapped to one of these codes before any output
or receipt construction. Failure output never includes the raw URL or error.

## 11. Fixture-Release lifecycle

1. Acquire or author exact candidate bytes; inspect them; complete independent
   privacy/license review; obtain Product Owner approval of the exact digest,
   tag, asset name and upload.
2. Upload to a draft fixture-only Release. An authenticated draft re-download
   may prove upload integrity but is not Mode-B public restore evidence. Its
   credential and signed redirect URL are not durable identity or receipt data.
3. Obtain separate Product Owner authorization to publish the unchanged asset
   as **public but unadopted**.
4. Run Mode B without credentials through the canonical public locator and
   independently review the receipt.
5. Obtain separate Product Owner approval before registry adoption.

Never overwrite a registered/public asset in place. A failed candidate uses a
new version. Deletion or replacement remains a separate Product Owner decision.
Registry adoption itself does not grant G0, profile, renderer or device credit;
a future receipt-binding/evidence-contract slice must define that transition.

## 12. Offline acceptance

Focused tests use an injected transport or test-only loopback server behind the
non-CLI seam. Standard tests never use Internet or DNS. They cover at minimum:

- descriptor trust, raw-byte digest, duplicate/depth/member/size limits and
  non-interchangeable schemas;
- every-hop HTTPS/origin/port/query/fragment/userinfo checks, DNS answer limits,
  special IP forms, address pinning, Host/SNI/certificate/remote-address checks
  and redirect status/count/Location rules;
- status, Content-Length, identity encoding, truncation, extra bytes, digest
  mismatch, stream error, cancellation, all timeouts and oversize;
- single-writer/root quota/free-space/stale-partial behavior;
- exclusive partial creation, ancestor/link/hard-link rejection, atomic
  no-clobber publication, `EEXIST` rehash/reuse, mismatch preservation and
  receipt-last/orphan-cache recovery;
- exact exit/retry mapping and success/failure receipt conditionals;
- deadline crossings around every local phase, a non-cancellable filesystem
  operation and receipt commit-critical section crossing the deadline,
  exact-match timeout/orphan behavior and post-commit housekeeping failure;
- equality and one-unit-over root-byte, free-space and root/per-tier entry-slot
  boundaries, including the receipt reservation and non-persisted probe byte;
- no-receipt behavior before safe root/writer-lock ownership;
- failure injection after each receipt publication substep, proving that a
  producer-reported failure never leaves a verifier-acceptable success receipt
  and that an indeterminate final link retains the fail-closed writer lock;
- verifier/producer races paused after final receipt link, after staging unlink
  and before or during supported directory sync; the verifier must never accept
  until durable producer success and writer-lock release;
- redaction across receipt, stdout, stderr, filenames and residual partials;
- proof that neither the injected transport nor policy overrides are selectable
  by CLI, descriptor or environment; and
- proof that both success and failure leave registry/evidence unchanged and
  normal offline verifiers still report external acquisition pending/no G0
  credit after a successful Mode-B receipt.

Independent security and false-credit review must report no unresolved P0/P1
before implementation is accepted.

## 13. Exclusions and stop conditions

The first implementation is dependency-free, outside `src/**` and Mode B only.
It does not add a Release workflow, Mode A production entry point, external
registry entry, adopted receipt binding, run artifact manifest, fixture byte,
device record, project-wide license or renderer/profile behavior.

The Product Owner ratification and clarification recorded on 2026-08-24
authorize the bounded Mode-B network-capable implementation in this contract.
Stop before Mode A until exact upstream origins and its code-owned allowlist are
separately approved. Stop before executing real network acquisition, Release
creation or publication, upload, registry adoption, exact-asset privacy/license
approval, push, deploy or product release without their separately required
Product Owner decisions.
