// Test backend only. Local disk evidence is NOT browser OPFS/IndexedDB evidence.
import { open, mkdir, stat, unlink, readdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { CHUNK_BYTES, type Io, type Sink, type Source } from './candidate';

export class NodeIo implements Io {
  private queue: Promise<unknown> = Promise.resolve();
  fault?: { match: (key: string) => boolean; afterBytes: number; error: Error };
  readPayloadBytes = 0;
  largestChunk = 0;
  writes: string[] = [];
  constructor(readonly root: string) {}
  private path(key: string): string {
    if (!/^(?:(?:receipts\/[0-9a-f]{32}|verified\/[0-9a-f]{64})\.json|staging\/[0-9a-f]{32}\.bin|blobs\/[0-9a-f]{64})$/.test(key))
      throw new Error('invalid isolated I/O key');
    const target = resolve(this.root, key);
    if (!target.startsWith(resolve(this.root) + sep)) throw new Error('path outside isolated I/O root');
    return target;
  }
  exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {}); return result;
  }
  async read(key: string): Promise<Source | null> {
    const path = this.path(key);
    let size: number;
    try { size = (await stat(path)).size; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    const io = this;
    return { size, async *chunks() {
      const file = await open(path, 'r');
      // One reusable buffer per open stream. Consumers must finish each write
      // before asking for the next chunk, just like the candidate's backpressure.
      const buffer = new Uint8Array(Math.min(CHUNK_BYTES, Math.max(1, size)));
      try {
        let position = 0;
        while (true) {
          const result = await file.read(buffer, 0, buffer.length, position);
          if (!result.bytesRead) break;
          position += result.bytesRead;
          io.largestChunk = Math.max(io.largestChunk, result.bytesRead);
          if (key.startsWith('blobs/')) io.readPayloadBytes += result.bytesRead;
          yield buffer.subarray(0, result.bytesRead);
        }
      } finally { await file.close(); }
    } };
  }
  async write(key: string, chunks: AsyncIterable<Uint8Array>): Promise<void> {
    const path = this.path(key); await mkdir(dirname(path), { recursive: true });
    const file = await open(path, 'w'); this.writes.push(key);
    let position = 0;
    try {
      for await (const chunk of chunks) {
        this.largestChunk = Math.max(this.largestChunk, chunk.byteLength);
        let offset = 0;
        while (offset < chunk.byteLength) {
          const fault = this.fault?.match(key) ? this.fault : undefined;
          if (fault && position >= fault.afterBytes) throw fault.error;
          const length = Math.min(chunk.byteLength - offset, fault ? fault.afterBytes - position : Infinity);
          const result = await file.write(chunk, offset, length, position);
          if (!result.bytesWritten) throw new Error('zero write');
          position += result.bytesWritten; offset += result.bytesWritten;
        }
      }
      await file.sync();
    } finally { await file.close(); }
  }
  async remove(key: string): Promise<void> {
    try { await unlink(this.path(key)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  async blobCount(): Promise<number> {
    try { return (await readdir(resolve(this.root, 'blobs'))).length; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error; }
  }
}

export async function fileSink(path: string): Promise<Sink & { committed: boolean; aborted: boolean }> {
  const file = await open(path, 'wx'); let position = 0; let closed = false;
  const sink: Sink & { committed: boolean; aborted: boolean } = {
    committed: false, aborted: false,
    async write(bytes) {
      let offset = 0;
      while (offset < bytes.byteLength) {
        const result = await file.write(bytes, offset, bytes.byteLength - offset, position);
        if (!result.bytesWritten) throw new Error('zero sink write');
        offset += result.bytesWritten; position += result.bytesWritten;
      }
    },
    async commit() { await file.sync(); await file.close(); closed = true; this.committed = true; },
    async abort() { if (!closed) { await file.close(); closed = true; } this.aborted = true; },
  };
  return sink;
}
