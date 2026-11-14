import { describe, expect, it, vi } from 'vitest';
import { MemoryFS } from '../src/platform/fs';
import { registerReadOperation, registerStagingReadOperation } from '../src/projectMetadata/persistence';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { assertOutputSpace } from '../src/projectPackage/outputSpace';
import { PACKAGE_LIMITS as L } from '../src/projectPackage/contract';

const prefix = 'v2/packages/';
const unusedFactory: MetadataStorageFactory = () => { throw Error('capacity must not open a repository'); };
const gate = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };

describe('output capacity observation', () => {
  it('uses one owned reader, consumes only sizes and does not accept before closing', async () => {
    const raw = new MemoryFS(), reader = new MemoryFS(), scanned = gate(), closing = gate();
    const body = vi.fn(() => { throw Error('capacity must not consume bodies'); });
    vi.spyOn(raw, 'list').mockRejectedValue(Error('unowned list'));
    vi.spyOn(raw, 'readStream').mockRejectedValue(Error('unowned read'));
    const list = vi.spyOn(reader, 'list').mockResolvedValue([prefix + 'a', prefix + 'b']);
    const read = vi.spyOn(reader, 'readStream').mockResolvedValue({ size: 17, stream: body });
    const run = vi.fn(async action => { const value = await action({ fs: reader, factory: unusedFactory }); scanned.resolve(); await closing.promise; return value; });
    registerReadOperation(raw, unusedFactory, run);
    let accepted = false;
    const pending = assertOutputSpace(raw, prefix, 19).then(value => { expect(value).toBeUndefined(); accepted = true; });
    await scanned.promise; expect(accepted).toBe(false);
    expect(run).toHaveBeenCalledTimes(1); expect(list).toHaveBeenCalledExactlyOnceWith(prefix);
    expect(read.mock.calls.map(([path]) => path)).toEqual([prefix + 'a', prefix + 'b']); expect(body).not.toHaveBeenCalled();
    closing.resolve(); await pending; expect(accepted).toBe(true);
  });
  it('refuses closing selection failure before the caller can write', async () => {
    const raw = new MemoryFS(), reader = new MemoryFS(), write = vi.spyOn(raw, 'writeBytes');
    registerReadOperation(raw, unusedFactory, async action => { await action({ fs: reader, factory: unusedFactory }); throw Error('selection changed'); });
    await expect((async () => { await assertOutputSpace(raw, prefix, 0); await raw.writeBytes(prefix + 'next', new Uint8Array(1)); })()).rejects.toThrow('selection changed');
    expect(write).not.toHaveBeenCalled();
  });
  it('keeps unnamed staging on the strict filesystem', async () => {
    const raw = new MemoryFS(), run = vi.fn(async () => { throw Error('staging scope widened'); });
    await raw.writeBytes(prefix + 'one', new Uint8Array(5));
    const read = vi.spyOn(raw, 'readStream');
    registerStagingReadOperation(raw, unusedFactory, run);
    await assertOutputSpace(raw, prefix, 0);
    expect(run).not.toHaveBeenCalled(); expect(read).toHaveBeenCalledExactlyOnceWith(prefix + 'one');
  });
  it.each([
    ['missing', null, 'output-space-read'], ['negative', -1, 'output-space-read'],
    ['fractional', 0.5, 'output-space-read'], ['unsafe', Number.MAX_SAFE_INTEGER + 1, 'output-space-read'],
    ['nonfinite', NaN, 'output-space-read'], ['total', Number.MAX_SAFE_INTEGER, 'output-space-budget'],
  ] as const)('rejects %s without consuming a body', async (_, size, reason) => {
    const raw = new MemoryFS(), body = vi.fn(() => { throw Error('body read'); });
    vi.spyOn(raw, 'list').mockResolvedValue([prefix + 'one']);
    vi.spyOn(raw, 'readStream').mockResolvedValue(size === null ? null : { size, stream: body });
    await expect(assertOutputSpace(raw, prefix, 0)).rejects.toThrow(reason); expect(body).not.toHaveBeenCalled();
  });
  it('retains the entry-count ceiling before opening any file', async () => {
    const raw = new MemoryFS(), read = vi.spyOn(raw, 'readStream');
    vi.spyOn(raw, 'list').mockResolvedValue(Array.from({ length: L.entryCount + 1 }, (_, i) => prefix + i));
    await expect(assertOutputSpace(raw, prefix, 0)).rejects.toThrow('output-space-budget'); expect(read).not.toHaveBeenCalled();
  });
});
