# Fresh-session handoff

Read [current todo](todo.md) first. It owns the next action, worktree state, check
results and approval boundaries; this handoff deliberately does not duplicate them.
Use [inventory](implementation-inventory.md) for coverage, [map](../PROJECT_MAP.md)
for code locations and [document index](../docs/README.md) for applicable contracts.

## Resume safely

1. Read AGENTS.md and the short current records above. Check actual branch, HEAD,
   worktree and remote state read-only; preserve existing changes.
2. Follow the active task in todo. Environment maintenance is complete;
   the product continuation is the connected backup restore/edit/Contribution flow.
3. Inspect only its relevant source/tests/contracts. The current dirty restore
   implementation must not be described as absent or as already accepted.
4. Continue approved work without repeated PO confirmation. Report only a real
   new decision/authority boundary or the completed requested result.

## Non-negotiable distinctions

- The goal is a practical team candidate, not a complete MVP or release authorization.
- Ordinary Native, synthetic hosts and limited GLB/PNG validation have separate evidence.
- Stored original bytes and failed/pending states remain visible; no inferred winner,
  relation, destructive operation or silent fallback. Internal resume is not external saving.
- Physical iPhone, offline and adoption gates cannot be replaced by Node/DOM/dev-server checks.
- One writer; bounded read-only parallel reviews. A clean checkpoint can support a
  fresh task, but do not create/switch tasks without the user's request.

Historical implementation logs and older approvals are in
[preserved records](../docs/history/development-through-2026-09-14/README.md).
They explain provenance; they do not override the current task or revive old waits.
