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

Current evidence covers pure plans and DOM-contract tests only. Actual browser
keyboard/focus, layout, contrast, mobile reflow, IME, stage composition and iPhone
acceptance remain pending. DOM test doubles and current production build do not
constitute rendered evidence for these disconnected components.
