import { describe, expect, it } from 'vitest';
import { buildImportPlan } from '../src/assets/importWizard';
import { openVerifiedZipCatalog, writeZipEntries } from '../src/assets/zipio';
import { analyzeLociMyuCatalog } from '../src/projectFiles/lociMyuCatalog';
import { equalSourceStreams, sourceStreamProof } from '../src/projectFiles/streamSource';
import { LOCIMYU_CAPTION_HEADER } from '../src/io/locimyu';
const text = (value: string) => new TextEncoder().encode(value);
const limits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 10000 };
function source(parts: number[][]) { return { stream: () => new ReadableStream<Uint8Array>({ start(c) { for (const part of parts) c.enqueue(new Uint8Array(part)); c.close(); } }) }; }

describe('streamed legacy source preservation', () => {
  it('forwards cancellation through the raw-source hash without reading later chunks', async () => {
    const controller = new AbortController(); let calls = 0, cancelled = false;
    const body = { stream: () => new ReadableStream<Uint8Array>({ pull(c) { calls++; c.enqueue(new Uint8Array([1, 2])); controller.abort(); }, cancel() { cancelled = true; } }, { highWaterMark: 0 }) };
    await expect(sourceStreamProof(body, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(calls).toBe(1); expect(cancelled).toBe(true);
  });
  it('compares every byte and both EOFs with independent and empty chunk boundaries', async () => {
    const a = source([[1, 2], [], [3, 4, 5]]), b = source([[], [1], [2, 3, 4], [5], []]);
    expect(await equalSourceStreams(a, b)).toBe(true);
    for (const parts of [[[0, 2, 3, 4, 5]], [[1, 2, 0, 4, 5]], [[1, 2, 3, 4, 0]], [[1, 2, 3, 4]], [[1, 2, 3, 4, 5, 0]], []])
      expect(await equalSourceStreams(a, source(parts))).toBe(false);
    expect(await sourceStreamProof(a)).toEqual(await sourceStreamProof(b));
  });
  it('retains exact table analysis while keeping only catalog references and proofs for binary/source bodies', async () => {
    const caption = LOCIMYU_CAPTION_HEADER.join(',') + '\nc_one,title,body,#ffffff,0,0,0,picture,,,,\n';
    const entries = [{ path: 'model.glb', data: new Uint8Array([103, 108, 84, 70, 0]) },
      { path: 'record.csv', data: text(caption) }, { path: 'old_backup.csv', data: text(caption) },
      { path: 'file_ids.csv', data: text('fileId,filename\npicture,image.png\n') },
      { path: 'image.png', data: new Uint8Array([137, 80, 78, 71, 0, 0, 0, 0, 0, 0, 0, 0]) }];
    const old = await buildImportPlan(entries, { preserveBlockedLociMyuSource: true });
    const catalog = await openVerifiedZipCatalog(new Blob([(await writeZipEntries(entries)).slice().buffer]));
    try {
      const result = await analyzeLociMyuCatalog(catalog, limits, async () => {}, () => {});
      expect(result.imported.diagnostics).toEqual(old.diagnostics); expect(result.imported.selectedSourceIndex).toBe(old.selectedSourceIndex);
      expect(result.imported.sources.map(({ proof: _proof, ...s }) => s)).toEqual(old.sources.map(({ sourceBytes: _bytes, ...s }) => s));
      expect(result.imported.fileIdMapRows).toEqual(old.fileIdMapRows);
      expect(result.imported.images.map(i => [i.path, i.name])).toEqual(old.images.map(i => [i.path, i.name]));
      expect(result.imported.models[0]).not.toHaveProperty('data'); expect(result.imported.sources[0]).not.toHaveProperty('sourceBytes');
    } finally { await catalog.dispose(); }
  });
});
