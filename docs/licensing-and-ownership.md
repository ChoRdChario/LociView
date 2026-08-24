# Licensing and ownership proposal

> Status: `PRODUCT-OWNER APPROVED DIRECTION / PROPOSED ADOPTION / NO LICENSE GRANT`
>
> This document records an approved product direction and a candidate license
> boundary. It does **not** make a general project-wide grant from the Product
> Owner to use, copy, modify or distribute LociView. Limited rights arising from
> applicable hosting-platform terms, ordinary technical access to a deployed
> build or a file-specific third-party license remain governed by those terms;
> they do not create a project-wide LociView license. No project-wide license
> exists until a separate, reviewed adoption change adds the exact license text
> and scope.

## 1. Freedom-first product commitment

Official LociView releases do not withhold functions, project access or data
freedoms in order to sell their restoration. Commercial and non-commercial
users receive the same official functionality under the same software license.
The project does not introduce a paid edition, feature-unlock entitlement,
account requirement, online activation, telemetry requirement, usage limit,
watermark or delayed access as a condition of ordinary use.

Funding is separated from permission to use the software. Sponsorship, grants,
support, training, migration assistance and other paid work may fund public
development or compensate additional labor, but they do not turn an existing
LociView freedom into a product that must be bought back.

## 2. Product Owner ownership and attribution record

On 2026-08-24, in response to the explicit relicensing checklist, the Product
Owner confirmed that there are no exceptions to the following statement:

- the Product Owner owns and may relicense the relevant LociMyu and LociView
  code;
- no employer, client, co-author or other third party retains an undisclosed
  right in that code; and
- no known copied portion lacks the authority required for the proposed
  relicensing.

The exact public copyright display name selected by the Product Owner is:

```text
ChoRd.
```

This is an engineering provenance and decision record. Git author metadata,
AI-assistance trailers and this record do not independently prove title in a
legal dispute. If contrary provenance is later discovered, adoption stops for
the affected material and that material is removed, independently licensed or
reimplemented from an approved clean specification before distribution under a
project license.

The record does not claim ownership of third-party libraries, external models,
images, data, fixtures, trademarks or user projects. Those boundaries remain
subject to their own rights and licenses.

## 3. Legacy LociMyu boundary

Current LociView contains identified LociMyu-derived implementation, including
the material/shader behavior, viewer behavior and caption-overlay lineage
recorded in the current source and rendering documentation. The Product Owner's
relicensing authority above is the proposed authority for licensing those
covered LociView implementations.

The archived LociMyu end-user Terms are not a source-code license. A future
LociView license applies only to the exact LociView files and versions placed
under it. It does not retroactively relicense an archived LociMyu distribution,
change the terms under which an old copy was received, or claim rights in any
third-party element that may be present in legacy evidence. The eventual
LociView notice must state this separation explicitly.

## 4. Proposed software license

The proposed default software license is the unmodified Mozilla Public License
2.0, SPDX identifier `MPL-2.0`.

- Keep the canonical MPL text unmodified, including its exhibits, but do not
  attach the Exhibit B incompatibility notice to Covered Software.
- Do not add a custom author-attribution, sponsor-display or non-commercial
  clause.
- Do not offer a proprietary or paid feature-unlock alternative license as the
  normal funding model.
- Preserve the standard MPL copyright, patent, source-availability, notice,
  warranty and liability boundaries.

MPL file-level reciprocity is the intended balance: a distributor of a changed
covered LociView file makes that file's Source Code Form available under MPL. A
new separate file that contains no MPL-covered code, or a Larger Work that
combines covered and separate material, is not automatically made entirely MPL-
covered. Copying or moving covered code into a new file does not escape the
MPL's definition of a Modification. This protects improvements to the existing
project without using license pressure to sell ordinary functionality or
unnecessarily constraining separate integrations.

LociView's deployed HTML, CSS and JavaScript are delivered to a browser and are
therefore distribution of client code. When distributing Executable Form, the
distributor must make the covered software's Source Code Form available under
the MPL and inform recipients how to obtain it. The notice may be delivered by
the page or another recipient-facing part of the distribution; it need not be
embedded in every minified file.

As a LociView release policy, above the choice of notice mechanism, every
distributed build must identify an immutable source revision or release tag,
not merely a moving branch. Verification must prove that a recipient can find
the notice in the built output and retrieve the Source Code Form for the exact
distributed artifact, and that the source remains available while that artifact
is distributed.

`AGPL-3.0-only` is a reconsideration candidate only if a later Product Owner
approved product invariant introduces important server-side functionality and
requires source availability for modified publicly hosted deployments. It is
not adopted in anticipation of an unapproved server architecture.

## 5. Proposed license scope

The formal adoption change must contain an exact path/scope manifest. The
intended boundary is:

| Material | Proposed treatment |
|---|---|
| Product source, tests, build/development scripts, schemas and copyrightable configuration | `MPL-2.0` |
| Browser entry points and styles that form the application | `MPL-2.0` |
| Project-authored public documentation and specifications | Prose and non-executable illustrations: `CC-BY-4.0`, with `ChoRd.` as the project author credit and the required retained attribution/notices. Substantive code, schemas, algorithms, regular expressions and executable examples: `MPL-2.0`, unless an exact snippet is deliberately marked `CC0-1.0` after review |
| Small project-authored synthetic fixture bytes intended for unrestricted interoperability/testing | Prefer `CC0-1.0` after an exact-entry ownership and privacy review; never blanket-license the fixture tree |
| Fixture generators, verifiers and executable fixture schemas | `MPL-2.0` where included in the exact software scope |
| Third-party code, data, models, images and fixtures | Their upstream license and attribution; never relicensed by the LociView project license |
| `LociView` name, logo and official-release identity | Separate trademark/brand policy and exact mark/logo asset map; no implied trademark grant. An approved unmodified build receives only the redistribution permissions expressly stated by that policy |
| User-created projects, models, images, captions and exports | Not licensed to the project merely by using LociView; users retain their rights subject to the rights in their source material |
| Private operational evidence, including the raw Ki84 archive | Outside the public license and distribution boundary |

Before adoption, each mixed-content document must carry an unambiguous notice or
be covered by a machine-checkable manifest that distinguishes its CC-BY prose
from MPL-covered code/schema material and any exact CC0 snippet. Repository
operations and evidence records such as `AGENTS.md`, `tasks/**` and run-specific
evidence remain outside the proposed documentation grant until the formal
adoption scope explicitly classifies them. Facts that are not protected by
copyright are not made restrictable merely by being listed here.

## 6. Third-party and fixture obligations

The current deployed alpha already distributes third-party software, including
Three.js under MIT, zip.js under BSD-3-Clause and Workbox under MIT. Compliance
with those licenses is an existing distribution obligation; it does not wait
for adoption of a LociView project license. The 2026-08-24 deployed-output
inspection did not establish that complete required notices are available for
every bundled dependency and output. This is a release-safety blocker before
the next deployment: enumerate the exact bundled third-party material and
verify that each required notice is accessible to recipients of the exact built
artifact.

Formal license adoption additionally requires a reviewed
`THIRD_PARTY_NOTICES` and a repeatable build/distribution check. Sponsor
acknowledgement must not imply that a dependency author or fixture creator
endorses LociView or a sponsor.

The current fixture registry remains entry-specific and authoritative for
fixture provenance. Its existing entries remain `NOASSERTION`/unreviewed until
an exact entry receives an approved license review. A project code or
documentation license does not change that state. For CC BY material, the bound
attribution record must include, when supplied or applicable, the creator,
title/credit line, copyright notice, source, license URL or a durable copy of the
license text, retained license/disclaimer notices and an indication of changes.
Those fields remain separate from `ChoRd.` and sponsor acknowledgement.

## 7. Contributor policy direction

The proposed community contribution model is inbound-equals-outbound under the
exact license declared for each accepted path or material: `MPL-2.0` for
software and substantive code/schema material, and `CC-BY-4.0` for covered
documentation prose. A contribution spanning scopes must explicitly cover each
applicable license. An entry or snippet proposed for `CC0-1.0` requires an
explicit rights-holder dedication and entry-specific review; a Developer
Certificate of Origin sign-off alone is not that dedication.

Before external contributions are accepted, a public `CONTRIBUTING` policy and
sign-off/certification flow must identify the applicable outbound license.
Developer Certificate of Origin 1.1 sign-off is required at least for MPL-
scoped contributions. Its public contribution, personal-information and sign-
off record is retained indefinitely and may be redistributed as the DCO states;
contributors must receive that notice before submission. Until a separate
CC-BY or CC0 contribution flow is adopted, external contributions are limited
to MPL-scoped paths. Sponsors receive no copyright, relicensing or governance
privilege by funding the project.

A broad asymmetric contributor agreement that permits a future proprietary
conversion is not part of the approved direction. Any later need to change the
project license or adopt network copyleft requires the rights and explicit
decision process applicable at that time; it is not silently reserved through
sponsorship.

## 8. Formal adoption gate

Adding a top-level license is a separate, reviewable and externally meaningful
change. It requires all of the following:

1. an exact scope manifest for code, mixed documentation content, assets,
   fixtures and exclusions;
2. the unmodified canonical license texts, correct SPDX expressions, and an
   exact Exhibit A notice or SPDX-based application mechanism for every covered
   source path;
3. a reviewed copyright/authorship notice using `ChoRd.`;
4. clearance of every in-scope file as Product-Owner-owned or compatibly
   licensed, complete third-party distribution notices and dependency/output
   inspection;
5. a clear LociMyu legacy-terms separation;
6. a recipient-facing built-output notice bound to the exact deployed/released
   revision, plus a successful retrieval check for its Source Code Form and a
   policy that keeps that source available while the artifact is distributed;
7. an adopted exact name/logo asset map and trademark policy granting the needed
   unmodified-build redistribution permission, or removal/exclusion of those
   marks and assets from the distributable build;
8. independent license/provenance and product-boundary review, with no unresolved
   P0/P1 finding or ownership/license-compatibility blocker;
9. Product Owner approval of the final diff and exact commit before publication;
10. the ordinary G0/G0-S release gates for any deployment or stabilized release.

Until that gate closes, this repository remains without an adopted project-wide
license. This proposal must not be presented as permission or as a completed
open-source release.

## 9. Canonical references

These links are interpretive references for the proposal, not substitutes for
the exact license texts required by the formal adoption gate:

- [Mozilla Public License 2.0](https://www.mozilla.org/MPL/2.0/)
- [Mozilla MPL 2.0 FAQ](https://www.mozilla.org/MPL/2.0/FAQ/)
- [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- [Creative Commons FAQ: software](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software)
- [Developer Certificate of Origin 1.1](https://developercertificate.org/)
