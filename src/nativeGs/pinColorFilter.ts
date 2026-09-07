/** Session-local display state. Never serialized into a project or package. */
export function nativePinColorKey(color: string | undefined): string {
  const key = (color ?? '#eab308').trim().toLowerCase();
  return /^#[\da-f]{3}$/u.test(key)
    ? `#${[...key.slice(1)].map((digit) => digit + digit).join('')}` : key;
}

export class NativePinColorFilter {
  private readonly sets = new Map<string, Set<string>>();

  /** null means ALL (including future colors); an empty set means NONE. */
  selected(displaySetId: string): ReadonlySet<string> | null {
    const selected = this.sets.get(displaySetId);
    return selected === undefined ? null : new Set(selected);
  }

  includes(displaySetId: string, color: string | undefined): boolean {
    return this.sets.get(displaySetId)?.has(nativePinColorKey(color)) ?? true;
  }

  toggle(displaySetId: string, color: string, available: readonly string[]): void {
    const selected = this.sets.get(displaySetId) ?? new Set(available.map(nativePinColorKey));
    const key = nativePinColorKey(color);
    if (selected.has(key)) selected.delete(key);
    else selected.add(key);
    this.sets.set(displaySetId, selected);
  }

  show(displaySetId: string, color: string | undefined): void {
    this.sets.get(displaySetId)?.add(nativePinColorKey(color));
  }

  all(displaySetId: string): void { this.sets.delete(displaySetId); }
}
