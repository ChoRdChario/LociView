/** Let the camera receive real touches from either the canvas or projected pins.
 * Only a solitary, stationary touch can activate a pin on release. */
export function createPinCameraSurface(
  document: Document, canvas: HTMLCanvasElement, shortcut: HTMLButtonElement, pins: HTMLElement, stage: HTMLElement,
  allowPinNavigation: () => boolean,
  selectPin: (button: HTMLButtonElement, release: PointerEvent) => void,
) {
  const surface = document.createElement('div');
  surface.className = 'lv-pin-camera-surface';
  // Preserve canvas → search → pins in keyboard order.
  surface.append(canvas, shortcut, pins);
  shortcut.addEventListener('pointerdown', event => event.stopPropagation());
  shortcut.addEventListener('wheel', event => event.stopPropagation());
  const touches = new Set<number>();
  let tap: { id: number; x: number; y: number } | undefined;
  let releasedTap: PointerEvent | undefined;
  let suppressClick = false;
  let multiple = false;

  surface.addEventListener('pointerdown', event => {
    releasedTap = undefined;
    if (shortcut.contains(event.target as Node)) return;
    if (event.pointerType !== 'touch') { suppressClick = false; return; }
    // A captured pin can disappear offscreen before its release reaches us.
    if (event.isPrimary) touches.clear();
    if (!touches.size) { suppressClick = false; multiple = false; }
    touches.add(event.pointerId);
    tap = undefined;
    if (touches.size > 1 || !event.isPrimary) { suppressClick = true; multiple = true; }
    else if (pins.contains(event.target as Node)) tap = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, true);
  pins.addEventListener('pointerdown', event => {
    // Mouse pin drags have their own left/right button handling.
    if (event.pointerType !== 'touch' || !allowPinNavigation()) event.stopPropagation();
  });
  pins.addEventListener('wheel', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || !allowPinNavigation()) event.stopPropagation();
  });
  surface.addEventListener('pointermove', event => {
    if (multiple && touches.size === 1 && touches.has(event.pointerId)) {
      event.stopPropagation(); // Lifting the last finger must not turn a pinch into an orbit.
      return;
    }
    if (tap?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8) {
      event.stopPropagation(); // Keep finger wobble from orbiting during a tap.
      return;
    }
    tap = undefined;
    suppressClick = true;
  }, true);
  const finish = (event: PointerEvent) => {
    if (!touches.delete(event.pointerId)) return;
    if (event.type !== 'pointerup') suppressClick = true;
    if (tap?.id === event.pointerId) {
      if (event.type === 'pointerup' && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 8) releasedTap = event;
      else suppressClick = true;
      tap = undefined;
    }
  };
  surface.addEventListener('pointerup', finish, true);
  surface.addEventListener('pointercancel', finish, true);
  surface.addEventListener('lostpointercapture', finish, true);
  // Chromium can omit click just after an orbit. At touchend the camera has
  // already released its pointer, so the record can be opened and focused once.
  pins.addEventListener('touchend', event => {
    const release = releasedTap;
    releasedTap = undefined;
    const button = (event.target as Element).closest<HTMLButtonElement>('button');
    if (!release || event.touches.length || !button || button !== release.target || button.disabled) return;
    event.preventDefault();
    suppressClick = true;
    selectPin(button, release);
  }, { passive: false });
  pins.addEventListener('click', event => {
    if (suppressClick && event.detail) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  // OrbitControls captures its first pointer on the surface. The original canvas
  // or button still needs the release for placement or native click activation.
  stage.addEventListener('pointerdown', event => {
    if (!surface.hasPointerCapture?.(event.pointerId)) return;
    const origin = event.target as HTMLElement;
    if (surface.contains(origin) && origin !== surface) origin.setPointerCapture(event.pointerId);
  });
  return surface;
}
