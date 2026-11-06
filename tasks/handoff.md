# Fresh-session handoff

Read [current todo](todo.md), [project map](../PROJECT_MAP.md), then
[document authority](../docs/README.md). Todo owns the current outcome, exact
source/test evidence, failed attempts, measurements, remaining work and stop
conditions. [Inventory](implementation-inventory.md) owns route-specific coverage.
Check actual branch/HEAD/worktree and preserve existing changes.

## Accepted boundary

The exact [06b](../docs/specs/06b-staging-read-operations-proposal.md) exceptions
include §6.1 Review-copy inspection and §6.2 integrity sharing inside one
outputReady. General §6 payload sharing is not approved. Do not extend these
lifetimes to a whole Session, source capture, write/readback or recovery.
[09 §10](../docs/specs/09-desktop-offline-candidate-proposal.md) permits exact
same-build/SRI boot-resource repair; it does not permit arbitrary network fallback,
foreign cache/Project writes or forced activation. Follow their recorded contracts
and todo rather than renewing an approval from historical prose.

## Verification and delivery

[AGENTS.md](../AGENTS.md) owns working rules and required checks. Reuse passed
checks only at the exact relevant source/settings; repeat for substantive changes,
failures or unresolved concerns, not for staging or result-text updates.
Use the [browser runbook](../docs/browser-testing.md), installed Playwright and
dedicated owned profiles/origins. Do not touch the user's4182. Compare served
assets/base/manifest with the intended immutable candidate before crediting4191;
a stale Worker or a subpath build is not root-base delivery evidence.
Normal-SW/offline evidence is separate from bypassed UI checks. Mobile Chromium
and Windows WebKit are not physical iPhone/Safari memory, codec or PWA acceptance.

Keep private originals/audits and all.artifacts local. AGENTS.md authorizes suitable
verified g0-baseline checkpoints, not main/Pages/release. Report remaining work and
the next engineering step with the outcome. Create a new chat/task only on request.

## Retained history

The [previous handoff](https://github.com/ChoRdChario/LociView/blob/c9a0940c0df578d5b451a10a75a6f2f8e757a65c/tasks/handoff.md)
is retained in Git. Earlier dated observations are evidence, not a current queue,
new capacity guarantee or renewed approval requirement. Follow todo for current
status and the document index for accepted versus proposed contracts.
