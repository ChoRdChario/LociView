import { describe, expect, it } from 'vitest';
import { withJobDiscovery, type JobDiscovery } from '../src/projectPackage/jobDiscovery';

describe('operation-owned job discovery', () => {
  it('refuses unknown ids and expires after success and failure', async () => {
    let escaped!: JobDiscovery<string>;
    await withJobDiscovery(async () => ['one'], async id => id, async scope => {
      escaped = scope;
      expect(Object.isFrozen(scope.ids)).toBe(true);
      await expect(scope.read('other')).rejects.toThrow('owner');
      expect(await scope.read('one')).toBe('one');
    });
    await expect(escaped.read('one')).rejects.toThrow('expired');
    await expect(withJobDiscovery(async () => ['one'], async id => id, async scope => {
      escaped = scope; throw Error('closing failure');
    })).rejects.toThrow('closing failure');
    await expect(escaped.read('one')).rejects.toThrow('expired');
  });
  it('refuses an unawaited read and drains it before returning', async () => {
    let finish!: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    const observation = withJobDiscovery(async () => ['one'], async id => { await held; return id; }, async scope => {
      const pending = scope.read('one'); void pending.catch(() => {}); finish();
    });
    await expect(observation).rejects.toThrow('unfinished');
  });
});
