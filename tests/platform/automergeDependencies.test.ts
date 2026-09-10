import { expect, it } from 'vitest';
import * as A from '@automerge/automerge';
import { Repo, interpretAsDocumentId, parseAutomergeUrl, stringifyAutomergeUrl,
  type AnyDocumentId, type StorageAdapterInterface } from '@automerge/automerge-repo/slim';

/** Package compatibility only. Memory storage is not browser durability evidence. */
it('keeps Repo UUID generation/parse and independent stored import compatible with the scoped override', async () => {
  const rows = new Map<string, Uint8Array>();
  const matches = (key: string, prefix: string[]) => prefix.every((p, i) => JSON.parse(key)[i] === p);
  const storage: StorageAdapterInterface = {
    load: async key => rows.get(JSON.stringify(key))?.slice(),
    save: async (key, bytes) => { rows.set(JSON.stringify(key), bytes.slice()); },
    remove: async key => { rows.delete(JSON.stringify(key)); },
    loadRange: async prefix => [...rows].filter(([key]) => matches(key, prefix))
      .map(([key, data]) => ({ key: JSON.parse(key), data: data.slice() })),
    removeRange: async prefix => { for (const key of rows.keys()) if (matches(key, prefix)) rows.delete(key); },
  };
  const source = A.from({ title: 'Dependency compatibility' });
  const original = A.getAllChanges(source);
  const repo = new Repo({ storage, network: [] });
  let other: Repo | undefined;
  try {
    const created = repo.create({ title: 'Created' });
    const imported = repo.import<{ title: string }>(A.save(source));
    for (const handle of [created, imported]) {
      const parsed = parseAutomergeUrl(handle.url);
      expect(parsed.binaryDocumentId).toHaveLength(16);
      expect(stringifyAutomergeUrl(parsed.binaryDocumentId)).toBe(handle.url);
    }
    const storageId = await repo.storageId();
    expect(storageId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Legacy UUID conversion exercises Repo's uuid validate/parse call sites.
    const id = interpretAsDocumentId(String(storageId) as AnyDocumentId);
    expect(parseAutomergeUrl(stringifyAutomergeUrl(id)).binaryDocumentId).toHaveLength(16);
    await repo.flush();
    other = new Repo({ storage, network: [] });
    expect(await other.storageId()).toBe(storageId);
    const reopened = (await other.find<{ title: string }>(imported.url)).doc();
    expect(A.getHeads(reopened)).toEqual(A.getHeads(source));
    expect(A.getAllChanges(reopened)).toEqual(original);
    expect(reopened.title).toBe(source.title);
  } finally {
    await repo.shutdown();
    if (other) await other.shutdown();
  }
});
