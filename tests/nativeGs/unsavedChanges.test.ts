import { describe, expect, it, vi } from 'vitest';
import {
  NativeUnsavedChangesGuard,
  type NativeBeforeUnloadTarget,
} from '../../src/nativeGs/unsavedChanges';

class FakeBeforeUnloadTarget implements NativeBeforeUnloadTarget {
  listener: ((event: BeforeUnloadEvent) => void) | null = null;
  addCount = 0;
  removeCount = 0;

  addEventListener(_type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void {
    this.listener = listener;
    this.addCount += 1;
  }

  removeEventListener(_type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void {
    if (this.listener === listener) this.listener = null;
    this.removeCount += 1;
  }
}

function fakeBeforeUnloadEvent(): BeforeUnloadEvent & { prevented: boolean } {
  const event = {
    prevented: false,
    returnValue: undefined,
    preventDefault: () => { event.prevented = true; },
  };
  return event as unknown as BeforeUnloadEvent & { prevented: boolean };
}

describe('native unsaved-change guard', () => {
  it('bypasses confirmation while clean and preserves dirty state when discard is cancelled', async () => {
    const target = new FakeBeforeUnloadTarget();
    const guard = new NativeUnsavedChangesGuard(target);
    const confirm = vi.fn<() => Promise<boolean>>().mockResolvedValue(false);

    await expect(guard.confirmDiscard(confirm)).resolves.toBe(true);
    expect(confirm).not.toHaveBeenCalled();

    guard.markDirty();
    await expect(guard.confirmDiscard(confirm)).resolves.toBe(false);
    expect(guard.isDirty).toBe(true);
    expect(target.listener).not.toBeNull();
  });

  it('protects only the dirty interval and never accumulates listeners', () => {
    const target = new FakeBeforeUnloadTarget();
    const guard = new NativeUnsavedChangesGuard(target);

    guard.markDirty();
    guard.markDirty();
    expect(target.addCount).toBe(1);
    const event = fakeBeforeUnloadEvent();
    target.listener?.(event);
    expect(event.prevented).toBe(true);
    expect(event.returnValue).toBe(true);

    guard.clear();
    expect(guard.isDirty).toBe(false);
    expect(target.listener).toBeNull();
    expect(target.removeCount).toBe(1);

    guard.markDirty();
    guard.dispose();
    expect(target.addCount).toBe(2);
    expect(target.removeCount).toBe(2);
    expect(target.listener).toBeNull();
  });
});
