import { describe, expect, it, vi } from 'vitest';
import * as T from 'three';
import { checkGsPacked } from '../src/viewer/gsPacked';
import { queueGsDecode } from '../src/viewer/gsDecodeQueue';

const row = (degree = 4) => ({ center: new T.Vector3(), scales: new T.Vector3(1, 1, 1), quaternion: new T.Quaternion(),
  color: new T.Color(.5, .2, .1), opacity: .5, sh: Array.from({ length: degree * (degree + 2) }, () => new T.Color(.01, -.01, .02)) });
function mesh(count: number, degree = 4, change?: (r: ReturnType<typeof row>, i: number) => void) {
  return { isInitialized: true, numSplats: count, splats: { getNumSplats: () => count, getNumSh: () => degree,
    getSplat: (i: number) => { const r = row(degree); change?.(r, i); return r; } } } as unknown as Parameters<typeof checkGsPacked>[0];
}
describe('owned cooperative packed GS verification', () => {
  it.each([0, 1, 2, 3, 4])('checks every public decoded row at SH%d', async degree => {
    const progress = vi.fn(); await checkGsPacked(mesh(7, degree), { count: 7, degree }, new AbortController().signal, progress);
    expect(progress).toHaveBeenLastCalledWith(7);
  });
  it.each(['count', 'degree'] as const)('refuses %s mismatch before adoption', async field => {
    await expect(checkGsPacked(mesh(7), { count: field === 'count' ? 8 : 7, degree: field === 'degree' ? 3 : 4 }, new AbortController().signal)).rejects.toThrow('全係数');
  });
  it.each([0, 4, 8])('refuses invalid data at row%d including the final row', async index => {
    const mutations = [(r: ReturnType<typeof row>) => { r.center.x = NaN; }, (r: ReturnType<typeof row>) => { r.scales.z = 1e-100; },
      (r: ReturnType<typeof row>) => { r.quaternion.set(0, 0, 0, 0); }, (r: ReturnType<typeof row>) => { r.opacity = Infinity; },
      (r: ReturnType<typeof row>) => { r.sh[23]!.b = NaN; }, (r: ReturnType<typeof row>) => { r.sh.pop(); },
      (r: ReturnType<typeof row>) => { r.color.r = 1e10; }];
    for (const change of mutations) await expect(checkGsPacked(mesh(9, 4, (r, i) => { if (i === index) change(r); }), { count: 9, degree: 4 }, new AbortController().signal)).rejects.toThrow();
  });
  it('keeps the queue owner and reservation until native completion and checking cancel settle', async () => {
    vi.useFakeTimers(); const clock = vi.spyOn(performance, 'now').mockImplementation(() => 20 * clock.mock.calls.length);
    const controller = new AbortController(), progress = vi.fn(), dispose = vi.fn(), release = vi.fn(), retire = vi.fn();
    let finish!: () => void; const native = new Promise<void>(resolve => { finish = resolve; });
    const lease = queueGsDecode({}, () => ({ value: {}, initialized: native.then(() => checkGsPacked(mesh(1024), { count: 1024, degree: 4 }, controller.signal, progress)), dispose }), () => ({ release, retire }));
    const rejected = expect(lease.promise).rejects.toThrow();
    const nextFactory = vi.fn(() => ({ value: 'next', initialized: Promise.resolve(), dispose() {} })), next = queueGsDecode({}, nextFactory);
    try {
      expect(dispose).not.toHaveBeenCalled(); finish(); await Promise.resolve(); expect(progress).toHaveBeenCalledWith(256);
      expect(release).not.toHaveBeenCalled(); expect(nextFactory).not.toHaveBeenCalled(); controller.abort(); lease.cancel();
      expect(nextFactory).not.toHaveBeenCalled(); await vi.runAllTimersAsync(); await rejected; expect(await next.promise).toBe('next'); next.cancel();
      expect(dispose).toHaveBeenCalledOnce(); expect(release).toHaveBeenCalledOnce(); expect(progress).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); vi.useRealTimers(); }
  });
});
