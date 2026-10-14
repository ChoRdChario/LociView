/** UI-only measured offsets. Estimates are not fixed row heights or a capacity promise. */
export class CaptionRowLayout {
  private ids: readonly string[] = [];
  private indices = new Map<string, number>();
  private heights = new Map<string, number>();
  private offsets = new Float64Array(1);
  update(ids: readonly string[], invalidate = false) {
    this.ids = ids; this.indices = new Map(ids.map((id, index) => [id, index]));
    if (invalidate) this.heights.clear();
    // Scene/filter changes are not deletions. Keep measurements for this mounted
    // Project so returning to a remembered pixel position still means the same row.
    this.rebuild();
  }
  measure(id: string, height: number): boolean {
    if (!this.indices.has(id) || !Number.isFinite(height) || height <= 0 || this.heights.get(id) === height) return false;
    this.heights.set(id, height); return true;
  }
  rebuild() {
    this.offsets = new Float64Array(this.ids.length + 1);
    for (let i = 0; i < this.ids.length; i++) this.offsets[i + 1] = this.offsets[i]! + (this.heights.get(this.ids[i]!) ?? 112);
  }
  index(id: string) { return this.indices.get(id); }
  top(index: number) { return this.offsets[index] ?? 0; }
  get total() { return this.top(this.ids.length); }
  at(top: number) {
    let low = 0, high = this.ids.length;
    while (low < high) { const mid = (low + high) >>> 1;
      if (this.top(mid + 1) <= top) low = mid + 1; else high = mid;
    }
    return Math.min(low, Math.max(0, this.ids.length - 1));
  }
  anchor(top: number) {
    const index = this.at(top); return { id: this.ids[index], inside: top - this.top(index) };
  }
  restore(anchor: ReturnType<CaptionRowLayout['anchor']>, fallback: number) {
    const index = anchor.id === undefined ? undefined : this.index(anchor.id);
    return index === undefined ? fallback : Math.max(0, this.top(index) + anchor.inside);
  }
  window(top: number, height: number, focusedId?: string) {
    if (!this.ids.length) return [];
    const first = this.at(Math.max(0, top - 300)), last = this.at(top + (height || 480) + 300);
    const indices = Array.from({ length: last - first + 1 }, (_, i) => first + i);
    const focus = focusedId === undefined ? undefined : this.index(focusedId);
    if (focus !== undefined && (focus < first || focus > last)) indices.push(focus);
    return indices.sort((a, b) => a - b);
  }
}
