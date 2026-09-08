# Disconnected ProjectScene UI components

Reusable components under specification 05 §13.3. Only synthetic tests currently
import them. They do not open files, read/write storage, acknowledge saves, apply
camera views or import the current Native application. No new demo/probe page.

`navigationState.ts` builds conflict-aware Scene choices and token-bound local
navigation plans. Scene selection is explicit; it never guesses a default or
uses a lifecycle/order/name conflict winner. Tab changes retain all per-Scene
selection/search/list-position/color memories and do not end an active mode.
Uncommitted text/IME/pin/model placement blocks changing Scene, with a nearby
reason. Dirty/failed save state does not itself block harmless navigation.

`navigationControls.ts` provides separate DOM slots: Scene/save state for the
shared header, and four labelled task buttons for the right task area. Native
select/buttons retain keyboard semantics and accessible names. The callback emits
a plan only; the select restores the host's previous selection until the host
accepts/re-renders. Static controls survive re-render and save-state refresh does
not replace options unnecessarily. Imported labels/messages are textContent only.
If the current Scene disappears, is deleted or has unresolved availability, the
control explains its state and offers explicit selection of another available
Scene. It never silently switches or leaves an unexplained blank selection.
Disposal removes event listeners and elements. The host owns finish/cancel
actions beside actual editors, tab panel focus, responsive layout and styling.

Before applying `enterScene`, the eventual host must revalidate the snapshot
token, session identity and pending input with `navigationPlanIsCurrent`, resolve
the complete new Scene and then atomically swap the presentation. Recheck after
asynchronous preparation; a superseded plan must be replanned, never committed.
It applies a valid entry view once, not on tab changes or same-Scene reselection.
That renderer/storage integration is not implemented here. Text/IME editor nodes
must stay alive across tab changes; a host must not erase a draft on unmount.
Session memories belong in AppContext.ui, never in a shared Project record.

## Caption list and pin colors

`captionListState.ts` consumes one explicit current-Scene projection. Membership,
owner identity, text/color conflicts, media counts and pin availability must be
validated/resolved upstream; this is not a new metadata schema or validator.
Unavailable source and duplicate row IDs refuse a successful list. An unknown
color is not default yellow; an unknown owner is not a ProjectAnchor or a guessed
Asset. Model-independent and unresolved-owner filters are distinct. Search uses
title OR body and combines with exact owner filtering, retaining input order.
Uncertain matches stay reachable with review labels instead of false exclusion.

Pin colors filter 3D pins only, never list rows, editor content or selection.
`SceneUiMemory.pinColors = null` includes future colors; an explicit array is an
exact set, including empty = none. Temporarily absent colors remain in memory.
Search/owner filtering preserves selected identity and offers explicit reveal if
it hides that row. Model-hidden/unavailable/needs-review rows remain inspectable.
`showModel`/`review` are host intentions, not writes or automatic re-anchoring.
The host provides an actionable `mutationBlock` for View/lock/recovery states.

`captionListControls.ts` keeps search/owner controls, color circles with `全色`,
then the list, without a collapsed color menu. Row controls are keyed; content is
text-only, and CSS colors accept hex only. Selection uses a neutral edge/fill and
color buttons use pressed state/checkmarks, not pin colors as application status.
The separate scoped `captionList.css` follows the accepted warm-greige/system-font
direction and 44px targets; it is NOT imported by the current application.

Host contract before later integration:

- Keep one memory per Scene and commit local `change` plans synchronously using
  `captionListPlanIsCurrent`; do not mutate memory in place. Revalidate pending
  input/access as well as source token/session before asynchronous effects.
- Keep content editor drafts/window intent separate and mounted. The list cannot
  save, erase or acknowledge them. Pending editing blocks changing Caption;
  search and pin colors themselves do not end modes or mutate Project state.
- Feed `onComposition` into the host's input guard. Same-Scene refresh preserves
  composing search text. A different-Scene render returns false while composing;
  the host must defer its whole Scene switch, not switch the stage independently.
  Do not dispose an actively composing component or use disposal to cancel input.
- Give the root a constrained flex task area and load the scoped stylesheet. The
  list is its own positioned scroll container. Retain desired scroll position
  across hidden/clamped lists; re-render after revealing a hidden task area.
  Call `revealSelected` only for explicit selection, not routine refresh. It
  changes the inner list's scrollTop, never scrollIntoView or browser-page scroll.
- A blocked/unavailable source needs the host's actual recovery surface. A list
  button cannot manufacture missing model bytes, owner relations or permissions.

## Selected detail and comparison-window state

`captionDetailState.ts` and `captionDetailControls.ts` cover current-Scene
title/body/color drafts, shared-Scene impact and explicit apply/cancel requests.
Only edited fields enter an apply plan. Unresolved fields show neutral placeholders
and review actions; an independent field can still be edited. Unknown Scene count
blocks apply until the host can disclose actual impact. Whole-resource unavailable
state blocks normal edits but keeps locally authored text distinguishable.

`src/domain/captionText.ts` implements only the accepted local title/body scalar,
NFC and control rules (02 §§3.1–3.2): it preserves body TAB/LF/CR and never rewrites
imported source. Color in this UI port is a hex authoring value, NOT a persisted
`colorSrgb` field or complete Caption DTO. The eventual command adapter must map
only explicit edits, preserve unknown siblings and validate full lifecycle,
reference, atomic-field and causal requirements. No media file/thumbnail I/O,
attachments editing, pin placement or conflict-resolution command is added here.

Detail host contract:

- Start one draft per Caption identity with `beginCaptionDraft`; same shared
  Caption never acquires independent content drafts merely by appearing in two
  Scenes. Keep draft objects immutable. Accept local `draft` events synchronously
  only against their exact `baseDraft`; they are UI state, not shared edits.
- A first edit captures the actually observed field. Incoming changes to an
  already edited field block apply without rebasing or losing that input. Changes
  to unrelated fields do not cause an accidental whole-record replacement.
- Feed `draft.composing`/`hasCaptionDraft` into the host's selection/Scene guards.
  Do not unmount drafts during tab operations. Different-Caption/Scene render
  returns false while input remains; the host must defer the entire transition.
  Same-Caption refresh/source failure retains active composition until it ends.
- `textareaBody.ts` maps LF-only textarea values back onto unchanged source
  CR/CRLF tokens. Validated `beforeinput` ranges identify replaced newline tokens;
  without an exact range, ambiguous newline edits retain input and block apply.
  The user can copy that input and explicitly cancel/re-edit; later typing or a
  title-only apply cannot silently clear the issue. This is a tested mapping
  contract, not evidence of real browser/IME event ordering.
- Recheck `captionApplyIsCurrent` before dispatch. A returned plan grants no
  write authority and proves no persistence. Host feedback keeps applying/failure
  visible; workspace save state remains the navigation host's independent state.
  `acceptCaptionApply` clears only the exact submitted draft after the host
  confirms working-state application and supplies matching observed values; it
  returns the original draft on mismatch/newer input. It never acknowledges a
  durable save. Never use a missing/failed reply as success.
- Cancel first opens a confirmation for the exact draft. Handle the `cancel`
  event explicitly; confirmation becomes invalid if the draft changes. In-flight
  apply cannot be cancelled through this UI-only route.
- The form and optional native color picker are static nodes. Unknown/invalid
  color hides the picker so its implicit black default is never projected as data.
  Scoped `captionDetail.css` is disconnected. Native IME/caret/newline behavior
  and visual/mobile acceptance remain required later, not proven by DOM records.

`captionWindowState.ts` manages only Scene-scoped retention, dismissal, z-order
and preferred position/size; no floating DOM layer, connector or geometry allocator
is added. The host owns the sole editing selection and supplies it to every plan.
Retained windows plus the selected follower are deduplicated. `close` records an
explicit dismissal without clearing selection/draft, so refresh cannot reopen the
selected follower. An explicit selection/reopen event calls `open` for that selected
Caption; opening another comparison uses `retain`. Front/place/arrange never select.

Window plans bind source, memory and selection. Missing/unavailable memberships
suppress projection without deleting retained intent; hidden/review pins do not
close their content windows. Exact complete valid arrangements preserve all open
windows, and invalid/incomplete arrangements change nothing. Geometry fitting,
connector eligibility and responsive clamps belong to the later renderer/host;
they must not rewrite preferred positions or introduce a single-window fallback.
Closing one Scene's copy does not erase another Scene's retention or placement.

Current evidence covers pure plans and DOM-contract tests only. Actual browser
keyboard/focus, layout, contrast, mobile reflow, IME, stage composition and iPhone
acceptance remain pending. DOM test doubles and current production build do not
constitute rendered evidence for these disconnected components.

## Existing Caption inclusion and pin modes

`captionIncludeState.ts` / `captionIncludeControls.ts` provide a native disclosure,
search and exact-ID picker over the host's complete current-Project inventory.
The inventory distinguishes lifecycle from this Scene's membership; duplicate
row IDs, unavailable inventory and unresolved membership never become a default
choice. Unknown title/body/owner fields do not prohibit independent membership
inclusion. A selected item remains identifiable outside search or during source
loss; search/IME and failure stay local. No picker selection changes the current
editor, and no inclusion request copies content, re-anchors or shows its owner.

The later host must bind `include` to the existing Scene `include` command for
that exact Caption/Scene, supply fresh membership/event IDs and order, recheck
`captionIncludePlanIsCurrent`, validate the complete current causal/resource
closure, and apply through the write authority. The reusable core preview test
proves membership-only composition, NOT full validation or a durable write.
Accept local `change` plans synchronously against their exact memory; in-flight
feedback blocks repeated submission. A failure preserves selection for retry.
On confirmed inclusion, refresh membership to `included` rather than pretending
the exported intent saved anything. `review` is an explicit host recovery request.

`pinModeState.ts` / `pinModeControls.ts` expose adjacent add/move actions and a
separate `modeStrip`. Mount the strip near the stage outside tab/unmount/scroll
lifetimes. The `追加先モデル` selector starts empty even for one model; move shows
the selected Caption and its exact existing owner BEFORE entry, independent of
that selector. A shared Caption discloses affected Scene count; unknown impact
blocks movement. `captionActions.css` supplies disconnected scoped controls,
44px targets and an explicit root-hidden rule; actual layout remains unverified.

Pin host contract before integration:

- Read ports are immutable, complete, conflict-aware projections, not raw JSON.
  Model target tokens cover binding/frame, chosen family/current compatibility
  class, effective visibility/membership and separate add/move eligibility.
  Move-target tokens also cover Caption anchor/owner, availability and affected
  Scene count. No token is a timestamp, filename, best-match relation or save flag.
- The host resolves ambiguous visual families and needsReview in their explicit
  recovery workflow before exposing eligibility. Add requires a valid explicit
  interaction target; a missing GS proxy blocks only new placement. A compatible
  existing pin may remain movable without that proxy. This UI never picks a
  surface, fabricates a ProjectAnchor, changes owner or resolves an anchor conflict.
- `otherPending` contains OTHER editors' unfinished input, not this pin mode.
  Feed this mode to navigation/list guards as `pinPlacement` or `pinMove`; tab
  changes alone never end it. An attempted cross-Scene render while active returns
  false and the host must defer the entire transition, not just this control.
- A `PinProposal` is an opaque identity for a fully validated TRANSIENT candidate
  retained by the host; its exact `mode` reference and unique candidate token
  change when input changes. No coordinates, surface hit or complete anchor are
  constructed here. Finish rechecks target/Caption eligibility and exact proposal.
  Host rechecks `pinModePlanIsCurrent` immediately before the real command and
  after asynchronous preparation. Stale input stays visible until explicit cancel
  and restart; it is not rebased onto a different binding or Caption.
- Actual finish must atomically create Caption + Scene membership, or replace the
  existing complete manual anchor under 01 §4.1. That command, source-byte policy,
  undo and durable acknowledgement are NOT implemented by these UI modules.
  Retain mode/proposal while applying or failed; clear only the exact submitted
  input after host-confirmed working-state success. Workspace save state is separate.
- Cancel first confirms the exact mode AND proposal. Changing the proposal invalidates
  the confirmation. Source/access loss does not hide local cancellation, but an
  in-flight command cannot be interrupted through this UI-only path. Never dispose
  the component or clear a proposal as an implicit cancel.

These additions require no new browser page, server, model bytes or human probe.
Tests verify authored DOM/intents and retained synthetic identities, not actual
browser input, gizmos, position accuracy, rendering, storage or device acceptance.

## Viewing aids and Scene entry-view controls

`viewState.ts` / `viewControls.ts` separate free camera, exact Scene-owned Saved
View recall and the Scene's entry-view draft. Fit, six explicit Project-axis
directions (`+X` through `-Z`) and observed projection are camera intentions.
They never infer a model's front/up, alter Caption input or clear a pin mode.
The separate `stageTools` fit shortcut uses the same host and intention path.
Read-only metadata does not prohibit safe camera use; actual unsafe camera
publication (for example an active pointer drag) is a separate `cameraBlock`.

Selecting a Saved View does not recall it. Recall requests its exact resolved
camera AND background, but changes no membership, material or entry-view pointer.
Setting/clearing `シーンを開いたときの視点` emits only that Scene's pointer;
it never recalls the view now. No first/default/foreign view is automatically
selected. Missing/deleted/duplicate/conflicted view state stays explicit; an
independent name/order conflict does not block a resolved camera/background.

Host contract before integration:

- Source is a validated, immutable, conflict-aware projection; camera/background
  values are already fully validated upstream, not raw imported metadata. Runtime
  tokens cover camera/background, visible logical-Asset union bounds, viewport,
  Scene and ProjectFrame identity. Wrong-identity runtime state displays neutrally.
- Implement fit/axis with the bounded Native logical-bounds semantics (02 §18),
  not hidden support geometry. Projection preserves pose and apparent span. These
  modules contain no camera math and do not prove actual framing/projection.
- Keep immutable memory per Scene in UI state. Accept local `change` plans
  synchronously against the exact memory. Recheck `viewPlanIsCurrent` before an
  effect and after asynchronous preparation; stale effects must not publish.
  The host owns one in-flight effect per lane and provides applying/failure state.
- Entry draft captures the original pointer, including `null`; external updates
  never rebase it. Apply maps only to Scene `setView` through future write authority.
  `acceptEntryView` clears only the exact submitted draft after host-confirmed
  working-state success with matching Scene/frame/pointer, never a durable save.
  Failure retains the draft. Cancel remains available on source/access loss,
  except during an in-flight apply. Camera and entry failure lanes are separate.
- A different Scene/frame render returns false while an entry draft or either
  effect is pending. Defer the whole host transition and keep this component
  mounted. Do not erase Caption/pin state to run a camera action or dispose a
  pending draft. Scene entry applies its valid entry view once under navigation's
  later host contract, not from these controls or ordinary re-render.

`viewControls.css` is disconnected, like the other task styles. Current evidence
is pure/DOM contract tests only; no rendered/current-app/device acceptance.
Named-view capture/update/delete/reorder and background authoring remain separate
unimplemented UI work. No new page/server, storage/package/renderer or real Project
connection is introduced.
