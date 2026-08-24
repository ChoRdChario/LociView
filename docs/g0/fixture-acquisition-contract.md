# G0 fixture acquisition and Release restore contract

> Status: `PROPOSED SECURITY/EVIDENCE CONTRACT / NOT IMPLEMENTED`.
>
> The Product Owner approved the two-mode boundary and fixture-Release
> publication lifecycle on 2026-08-24. The numeric envelope, exact redirect
> origins and receipt schema in this revision remain proposed and require
> explicit Product Owner ratification before network-capable implementation.

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

The proposed commands are:

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
| B failure after clean EOF/exact match but local commit failure | canonical source identity; measured tuple exactly equals the descriptor; `stableTransportIdentity=true`; `streamEnded=true`; `expectedMatch=true`; failure error is limited to applicable local containment/cache/publish/receipt codes | `none` or `partial-deleted` with null path before byte publication; `orphan-cache` with non-null path only after exact bytes were published but no success receipt committed |

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

Receipt filenames derive only from the validated request ID and unpredictable
attempt ID. They never contain a URL, host, asset name or remote error text.
An exit-2 failure before a descriptor yields a valid request ID and exact raw
digest produces no receipt; stderr still contains only the fixed error code.
After that validation boundary, every outcome attempts the mode-specific
receipt.

## 5. Proposed numeric envelope

These values require Product Owner ratification before implementation:

| Limit | Proposed value |
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
| Minimum free-space headroom before streaming | requested maximum + 512 MiB |
| Directory entries inspected per acquisition root/tier | 1,000 |
| Concurrent writers | 1 |
| Automatic retries | 0 |

Mode B stops after `expectedBytes + 1` observed final-body bytes, subject to the
2 GiB expected-byte cap; the one-byte probe distinguishes extra bytes. Mode A
stops after `maximumBytes + 1`. Redirect bodies are never consumed. Header and
body counters use safe integers. The overall deadline never resets and includes
redirects, streaming, sync, receipt validation and cleanup. The idle timer is
refreshed only by a non-empty final-body chunk.

One tool-owned writer lock protects the acquisition root. A busy or stale lock
fails closed; v1 does not break or delete another process's lock. Stale partials
remain non-authoritative, count against the root quota and cause a bounded
diagnostic rather than automatic destructive cleanup. A separately reviewed
cleanup command is outside this slice.
Before streaming, both `currentRootBytes + requestedMaximum <= 6 GiB` and the
free-space headroom rule must hold; satisfying only one limit is insufficient.

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

Its only proposed origins are `https://github.com:443` and
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
directory is synced where the platform supports it.

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
5. publish or rehash/reuse bytes with no-clobber semantics;
6. write, sync, re-read, schema/privacy-validate and no-clobber-publish the
   receipt; and
7. report exit 0 only after the receipt is durable at its local path.

If step 6 fails after byte publication, exit code 6 is returned and the byte
copy is an `orphan-cache`: it is not a successful result and must be fully
rehashed on the next attempt. Failure receipts use the same atomic validation
and no-clobber rules. If no receipt can be written, stderr contains only a fixed
error code and hop index.

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

Stop before network implementation until the proposed numeric envelope,
Mode-B redirect origins and exact receipt fields are explicitly ratified. Stop
before Mode A until exact upstream origins and its code-owned allowlist are
separately approved. Stop before real network acquisition, Release creation or
publication, upload, registry adoption, exact-asset privacy/license approval,
push, deploy or product release without their separately required Product Owner
decisions.
