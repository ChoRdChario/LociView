import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createModelDisplayLoader, type ModelDisplayOwner } from '../../src/ui/modelDisplay';
import type { AppContext } from '../../src/ui/context';
import type { LoadedModel } from '../../src/viewer/loaders';
import { loadModel } from '../../src/viewer/loaders';

vi.mock('../../src/viewer/loaders', async original => ({
  ...await original<typeof import('../../src/viewer/loaders')>(), loadModel: vi.fn(),
}));
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((r, fail) => { resolve = r; reject = fail; });
  return { promise, resolve, reject };
}
function model() {
  const geometry = new THREE.BoxGeometry(), material = new THREE.MeshBasicMaterial();
  const disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
  const value: LoadedModel = { root: new THREE.Mesh(geometry, material), kind: 'mesh', materials: [],
    stats: { vertices: 8, triangles: 12, points: 0, meshes: 1 }, warnings: [] };
  return { value, disposed };
}
function setup() {
  const a = { id: 'a', fields: { path: 'a.glb', transform: { scale: 2, upAxis: 'Z' } } };
  const b = { id: 'b', fields: { path: 'b.glb' } };
  let recovery: number | null = 1;
  let available = true;
  const viewer = {
    prepareDisplay: vi.fn((): 'ready' | 'waiting' | 'failed' => available ? 'ready' : 'waiting'),
    isDisplayAvailable: () => available,
    get displayRecovery() { return recovery; },
    finishDisplayRecovery: vi.fn((token: number) => { if (token === recovery) recovery = null; }),
    setModel: vi.fn(), clearModel: vi.fn(), setModelTransform: vi.fn(),
  };
  const ctx = { dir: 'projects/p', fs: { readBytes: vi.fn(async (): Promise<Uint8Array | null> => new Uint8Array([1, 2, 3])) }, viewer,
    asset: (id: string) => id === 'a' ? a : id === 'b' ? b : null,
    ui: { activeModelAssetId: 'a', loadedModelAssetId: null }, syncPins: vi.fn(), syncMaterials: vi.fn(), notify: vi.fn() };
  let owner: ModelDisplayOwner | null = { context: ctx as unknown as AppContext, access: {} as ModelDisplayOwner['access'], navigation: 1 };
  const report = vi.fn(async () => {}), recovered = vi.fn();
  const loader = createModelDisplayLoader(() => owner, report, recovered);
  return { ctx, viewer, report, recovered, loader, setOwner: (next: ModelDisplayOwner | null) => { owner = next; },
    owner: () => owner!, lose: (token: number) => { recovery = token; available = false; }, restore: () => { available = true; } };
}
beforeEach(() => vi.mocked(loadModel).mockReset());

describe('ordinary legacy display preparation ownership', () => {
  it('syncs model, transform, pins and materials before finishing the exact recovery', async () => {
    const s = setup(), candidate = model(); vi.mocked(loadModel).mockResolvedValue(candidate.value);
    await s.loader.load('a', 1);
    expect(s.ctx.ui.loadedModelAssetId).toBe('a');
    expect(s.viewer.setModel).toHaveBeenCalledWith(candidate.value);
    expect(s.viewer.setModelTransform).toHaveBeenCalledWith({ scale: 2, upAxis: 'Z' });
    expect(s.ctx.syncPins.mock.invocationCallOrder[0]).toBeLessThan(s.viewer.finishDisplayRecovery.mock.invocationCallOrder[0]!);
    expect(s.ctx.syncMaterials.mock.invocationCallOrder[0]).toBeLessThan(s.viewer.finishDisplayRecovery.mock.invocationCallOrder[0]!);
    expect(s.recovered).toHaveBeenCalledOnce(); expect(candidate.disposed).not.toHaveBeenCalled();
  });
  it.each(['context', 'access', 'navigation'] as const)('discards a pending read after %s changes', async field => {
    const s = setup(), read = deferred<Uint8Array>(); s.ctx.fs.readBytes.mockReturnValue(read.promise);
    const waiting = s.loader.load('a', 1), owner = s.owner();
    s.setOwner({ ...owner, [field]: field === 'navigation' ? 2 : {} });
    read.resolve(new Uint8Array([1])); await waiting;
    expect(loadModel).not.toHaveBeenCalled(); expect(s.viewer.setModel).not.toHaveBeenCalled();
    expect(s.report).not.toHaveBeenCalled(); expect(s.viewer.finishDisplayRecovery).not.toHaveBeenCalled();
  });
  it('releases a late decoded candidate after a different model wins', async () => {
    const s = setup(), first = model(), second = model(), pending = deferred<LoadedModel>();
    vi.mocked(loadModel).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(second.value);
    const waiting = s.loader.load('a', 1); await vi.waitFor(() => expect(loadModel).toHaveBeenCalledOnce());
    const signal = vi.mocked(loadModel).mock.calls[0]![2]!.signal!;
    await s.loader.load('b'); expect(signal.aborted).toBe(true);
    pending.resolve(first.value); await waiting;
    expect(first.disposed).toHaveBeenCalledOnce(); expect(second.disposed).not.toHaveBeenCalled();
    expect(s.viewer.setModel).toHaveBeenCalledExactlyOnceWith(second.value); expect(s.ctx.ui.loadedModelAssetId).toBe('b');
    expect(s.viewer.finishDisplayRecovery.mock.invocationCallOrder[0]).toBeLessThan(s.viewer.setModel.mock.invocationCallOrder[0]!);
    expect(s.recovered).not.toHaveBeenCalled(); expect(s.report).not.toHaveBeenCalled();
  });
  it('a second loss invalidates decode and its finally cannot finish the new recovery', async () => {
    const s = setup(), first = model(), second = model(), pending = deferred<LoadedModel>();
    vi.mocked(loadModel).mockReturnValueOnce(pending.promise).mockResolvedValueOnce(second.value);
    const waiting = s.loader.load('a', 1); await vi.waitFor(() => expect(loadModel).toHaveBeenCalledOnce());
    s.lose(2); s.loader.cancel(); pending.resolve(first.value); await waiting;
    expect(first.disposed).toHaveBeenCalledOnce(); expect(s.viewer.finishDisplayRecovery).not.toHaveBeenCalled();
    s.restore(); await s.loader.load('a', 2); expect(s.viewer.finishDisplayRecovery).toHaveBeenCalledExactlyOnceWith(2);
  });
  it('reports read failure with 表示 still available, and the same loader can retry', async () => {
    const s = setup(); s.ctx.fs.readBytes.mockRejectedValueOnce(new Error('read failed'));
    await s.loader.load('a', 1); expect(s.report).toHaveBeenCalledWith('モデル読込失敗', 'read failed');
    expect(s.ctx.ui.loadedModelAssetId).toBeNull(); expect(s.viewer.finishDisplayRecovery).not.toHaveBeenCalled();
    vi.mocked(loadModel).mockResolvedValue(model().value); await s.loader.load('a');
    expect(s.ctx.ui.loadedModelAssetId).toBe('a'); expect(s.viewer.setModel).toHaveBeenCalledOnce();
    expect(s.viewer.finishDisplayRecovery).toHaveBeenCalledExactlyOnceWith(1);
    expect(s.ctx.syncMaterials.mock.invocationCallOrder[0]).toBeLessThan(s.viewer.finishDisplayRecovery.mock.invocationCallOrder[0]!);
  });
  it('does not read while the connection is lost and suppresses stale read errors', async () => {
    const s = setup(); s.lose(2); await s.loader.load('a'); expect(s.ctx.fs.readBytes).not.toHaveBeenCalled();
    s.restore(); const pending = deferred<Uint8Array>(); s.ctx.fs.readBytes.mockReturnValue(pending.promise);
    const waiting = s.loader.load('a', 2); s.setOwner(null); pending.reject(new Error('late read error')); await waiting;
    expect(s.report).not.toHaveBeenCalled(); expect(s.viewer.setModel).not.toHaveBeenCalled();
  });
  it('reports final-render failure and leaves the model eligible for manual retry', async () => {
    const s = setup(); vi.mocked(loadModel).mockResolvedValue(model().value);
    s.viewer.finishDisplayRecovery.mockImplementationOnce(() => { throw new Error('render failed'); });
    await s.loader.load('a', 1);
    expect(s.report).toHaveBeenCalledWith('モデル読込失敗', 'render failed'); expect(s.recovered).not.toHaveBeenCalled();
    expect(s.ctx.ui.loadedModelAssetId).toBeNull(); expect(s.viewer.clearModel).toHaveBeenCalledOnce();
    await s.loader.load('a'); expect(s.ctx.ui.loadedModelAssetId).toBe('a'); expect(s.recovered).toHaveBeenCalledOnce();
  });
  it('preserves recovery ownership through allocation failure and a same-model manual retry', async () => {
    const s = setup(); s.viewer.prepareDisplay.mockReturnValueOnce('failed');
    await s.loader.load('a', 1); expect(s.ctx.fs.readBytes).not.toHaveBeenCalled(); expect(s.report).toHaveBeenCalledOnce();
    vi.mocked(loadModel).mockResolvedValue(model().value); await s.loader.load('a');
    expect(s.ctx.syncMaterials.mock.invocationCallOrder[0]).toBeLessThan(s.viewer.finishDisplayRecovery.mock.invocationCallOrder[0]!);
    expect(s.recovered).toHaveBeenCalledOnce();
  });
});
