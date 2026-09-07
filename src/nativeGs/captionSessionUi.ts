import {
  NATIVE_DEFAULT_DISPLAY_SET_ID,
  nativeCaptionDisplaySetIdV1,
  type NativeProjectSnapshotV1,
} from './schema';

export type NativeCaptionComparisonModeV1 = 'all' | 'single';

export interface NativeCaptionWindowPositionV1 {
  readonly leftCss: number;
  readonly topCss: number;
}

export interface NativeCaptionWindowSizeV1 {
  readonly widthCss: number;
  readonly heightCss: number;
}

export interface NativeCaptionWindowResolvedPlacementV1 extends NativeCaptionWindowPositionV1, NativeCaptionWindowSizeV1 {}

/**
 * UI-only state shared by every re-render of one opened Project. Selection is
 * deliberately not stored here: the app/viewer keep one editing authority.
 */
export class NativeCaptionSessionUiV1 {
  private readonly authoringColors = new Map<string, string>();
  private readonly retainedByDisplaySet = new Map<string, Set<string>>();
  private readonly positions = new Map<string, NativeCaptionWindowPositionV1>();
  private readonly sizes = new Map<string, NativeCaptionWindowSizeV1>();
  private readonly resolvedPlacements = new Map<string, NativeCaptionWindowResolvedPlacementV1>();
  private readonly comparisonModes = new Map<string, NativeCaptionComparisonModeV1>();
  private zOrder: string[] = [];

  authoringColor(displaySetId: string): string {
    return this.authoringColors.get(displaySetId) ?? '#eab308';
  }

  setAuthoringColor(displaySetId: string, color: string): void {
    if (!/^#[0-9a-f]{6}$/iu.test(color)) throw new Error('キャプションの色は「#」と6桁の16進数で指定してください。');
    this.authoringColors.set(displaySetId, color.toLowerCase());
  }

  isRetained(displaySetId: string, captionId: string): boolean {
    return this.retainedByDisplaySet.get(displaySetId)?.has(captionId) ?? false;
  }

  setRetained(displaySetId: string, captionId: string, retained: boolean): void {
    const ids = this.retainedByDisplaySet.get(displaySetId) ?? new Set<string>();
    if (retained) ids.add(captionId);
    else ids.delete(captionId);
    if (ids.size === 0) this.retainedByDisplaySet.delete(displaySetId);
    else this.retainedByDisplaySet.set(displaySetId, ids);
    this.bringToFront(captionId);
  }

  close(displaySetId: string, captionId: string): void {
    this.setRetained(displaySetId, captionId, false);
    this.positions.delete(captionId);
    this.sizes.delete(captionId);
    this.resolvedPlacements.delete(captionId);
    this.zOrder = this.zOrder.filter((id) => id !== captionId);
  }

  bringToFront(captionId: string): void {
    this.zOrder = [...this.zOrder.filter((id) => id !== captionId), captionId];
  }

  allOpenCaptionIds(displaySetId: string, selectedCaptionId: string | null): readonly string[] {
    const retained = this.retainedByDisplaySet.get(displaySetId) ?? new Set<string>();
    const ordered = this.zOrder.filter((id) => retained.has(id));
    for (const id of retained) if (!ordered.includes(id)) ordered.push(id);
    if (selectedCaptionId !== null && !ordered.includes(selectedCaptionId)) ordered.push(selectedCaptionId);
    return ordered;
  }

  openCaptionIds(displaySetId: string, selectedCaptionId: string | null): readonly string[] {
    const ordered = this.allOpenCaptionIds(displaySetId, selectedCaptionId);
    if (this.comparisonMode(displaySetId) === 'single' && ordered.length > 1) {
      return [selectedCaptionId !== null && ordered.includes(selectedCaptionId)
        ? selectedCaptionId
        : ordered[ordered.length - 1]!];
    }
    return ordered;
  }

  retainedCount(displaySetId: string): number {
    return this.retainedByDisplaySet.get(displaySetId)?.size ?? 0;
  }

  comparisonMode(displaySetId: string): NativeCaptionComparisonModeV1 {
    return this.comparisonModes.get(displaySetId) ?? 'all';
  }

  setComparisonMode(displaySetId: string, mode: NativeCaptionComparisonModeV1): void {
    this.comparisonModes.set(displaySetId, mode);
  }

  position(captionId: string): NativeCaptionWindowPositionV1 | null {
    return this.positions.get(captionId) ?? null;
  }

  setPosition(captionId: string, position: NativeCaptionWindowPositionV1): void {
    this.positions.set(captionId, position);
  }

  size(captionId: string): NativeCaptionWindowSizeV1 | null {
    return this.sizes.get(captionId) ?? null;
  }

  setSize(captionId: string, size: NativeCaptionWindowSizeV1): void {
    this.sizes.set(captionId, size);
  }

  resolvedPlacement(captionId: string): NativeCaptionWindowResolvedPlacementV1 | null {
    return this.resolvedPlacements.get(captionId) ?? null;
  }

  setResolvedPlacement(captionId: string, placement: NativeCaptionWindowResolvedPlacementV1): void {
    this.resolvedPlacements.set(captionId, placement);
  }

  arrange(captionIds: readonly string[]): void {
    for (const id of captionIds) {
      this.positions.delete(id);
      this.sizes.delete(id);
      this.bringToFront(id);
    }
  }

  reconcile(snapshot: NativeProjectSnapshotV1): void {
    const existing = new Map(snapshot.captions.map((caption) => [caption.id, nativeCaptionDisplaySetIdV1(caption)]));
    for (const [displaySetId, ids] of this.retainedByDisplaySet) {
      for (const id of [...ids]) if (existing.get(id) !== displaySetId) ids.delete(id);
      if (ids.size === 0) this.retainedByDisplaySet.delete(displaySetId);
    }
    const retainedOrExisting = new Set(existing.keys());
    this.zOrder = this.zOrder.filter((id) => retainedOrExisting.has(id));
    for (const id of [...this.positions.keys()]) if (!existing.has(id)) this.positions.delete(id);
    for (const id of [...this.sizes.keys()]) if (!existing.has(id)) this.sizes.delete(id);
    for (const id of [...this.resolvedPlacements.keys()]) if (!existing.has(id)) this.resolvedPlacements.delete(id);
    const validSets = new Set((snapshot.displaySets ?? [{ id: NATIVE_DEFAULT_DISPLAY_SET_ID }]).map((set) => set.id));
    for (const setId of [...this.authoringColors.keys()]) if (!validSets.has(setId)) this.authoringColors.delete(setId);
    for (const setId of [...this.comparisonModes.keys()]) if (!validSets.has(setId)) this.comparisonModes.delete(setId);
  }
}
