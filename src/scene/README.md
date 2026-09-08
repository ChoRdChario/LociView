# Disconnected pure Scene core

Implements the scheduling exception in specification 05 §13.1. Tests and the
explicit synthetic development host (§13.4) import these modules; current
Native/v1 behavior and storage are unchanged.

- `types.ts`: conflict-aware Scene/resource read projection, not ProjectDocV2 wire.
- `commands.ts`: plans one logical Scene edit without acknowledging or saving it.
- `resolve.ts`: derives composition, entry-view intent and bounded diagnostics
  from one snapshot. It accepts no prior Scene and applies no camera/UI changes.

The future adapter must supply a complete validated resource projection with the
same token as the Scene data. It owns full schema validation, immutable binding/
representation/anchor/material checks, blob availability and complete conflict
candidates. Never translate an unresolved materialized value to `kind: 'value'`.
Opaque camera/background/material values here have already been validated by that
provider; this module does not accept a raw package or renderer object.

Before publication the future write authority must check the snapshot token,
revalidate the plan and encode exactly one causal command, retaining unknown data
and existing IDs. Do not persist the read projection, replace whole CRDT maps, or
treat `previewScenePlan` as a durable commit. `needsReview` retains the authored
anchor coordinate; a hidden-owner entry is still listable with no marker.

Remaining: production storage/causal adapter and journal, full resource validators/resolver,
resource content commands, deep keep-both remapping, conversion/exchange, actual
SceneDocument/render plan, ordinary UI integration and device acceptance.
Synthetic UI/view/media connections already exist; see current todo. Full
provider stages A/B/C must not be replaced with fixture assumptions.
No dependency, storage or renderer adoption follows from core tests.
