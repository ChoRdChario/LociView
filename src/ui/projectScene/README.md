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

Current evidence covers pure plans and DOM-contract tests only. Actual browser
keyboard/focus, layout, contrast, mobile reflow, IME, stage composition and iPhone
acceptance remain pending. DOM test doubles and current production build do not
constitute rendered evidence for these disconnected components.
