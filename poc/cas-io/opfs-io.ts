// Browser test backend only. Never opens the application's workspace.
import { CHUNK_BYTES, type Io, type Sink, type Source } from './candidate';

const AREA = 'lociview-isolated-cas-io-20260908';
export const PROBE_LOCK = 'lociview:isolated-cas-io:writer:v1';
const absent = (error: unknown) => error instanceof DOMException && error.name === 'NotFoundError';

export class OpfsIo implements Io {
  fault?: { match: (key: string) => boolean; afterBytes: number; error: Error };
  largestChunk = 0;
  payloadReads = 0;
  payloadWrites = 0;
  private constructor(private readonly root: FileSystemDirectoryHandle) {}
  static async open(run: string): Promise<OpfsIo> {
    if (!/^[0-9a-f]{32}$/.test(run)) throw new Error('invalid synthetic run');
    if (!navigator.storage?.getDirectory || !navigator.locks) throw new Error('OPFS またはブラウザの保存ロックを利用できません。');
    const origin = await navigator.storage.getDirectory();
    const area = await origin.getDirectoryHandle(AREA, { create: true });
    return new OpfsIo(await area.getDirectoryHandle(run, { create: true }));
  }
  async exclusive<T>(task: () => Promise<T>): Promise<T> {
    return await navigator.locks.request(PROBE_LOCK, { mode: 'exclusive', ifAvailable: true }, lock => {
      if (!lock) throw new DOMException('別のタブで検証中です。完了後に保存結果を確認してください。', 'InvalidStateError');
      return task();
    });
  }
  private async location(key: string, create: boolean): Promise<{ dir: FileSystemDirectoryHandle; name: string } | null> {
    if (!/^(?:(?:receipts\/[0-9a-f]{32}|verified\/[0-9a-f]{64})\.json|staging\/[0-9a-f]{32}\.bin|blobs\/[0-9a-f]{64})$/.test(key))
      throw new Error('invalid isolated I/O key');
    const [directory, name] = key.split('/');
    try { return { dir: await this.root.getDirectoryHandle(directory!, { create }), name: name! }; }
    catch (error) { if (!create && absent(error)) return null; throw error; }
  }
  private async handle(key: string, create: boolean): Promise<FileSystemFileHandle | null> {
    const location = await this.location(key, create); if (!location) return null;
    try { return await location.dir.getFileHandle(location.name, { create }); }
    catch (error) { if (!create && absent(error)) return null; throw error; }
  }
  async read(key: string): Promise<Source | null> {
    const handle = await this.handle(key, false); if (!handle) return null;
    const file = await handle.getFile(); const io = this;
    return { size: file.size, async *chunks() {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
        // Explicit bounded slice; never file/entry-wide arrayBuffer().
        const bytes = new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
        io.largestChunk = Math.max(io.largestChunk, bytes.length);
        if (key.startsWith('blobs/')) io.payloadReads += bytes.length;
        yield bytes;
      }
    } };
  }
  async write(key: string, parts: AsyncIterable<Uint8Array>): Promise<void> {
    const handle = (await this.handle(key, true))!;
    const writer = await handle.createWritable(); let count = 0;
    try {
      for await (const part of parts) {
        if (part.length > CHUNK_BYTES) throw new Error('oversized I/O chunk');
        this.largestChunk = Math.max(this.largestChunk, part.length);
        const fault = this.fault?.match(key) ? this.fault : undefined;
        const length = Math.min(part.length, fault ? Math.max(0, fault.afterBytes - count) : part.length);
        if (length) {
          // Owned ArrayBuffer-backed chunk for the DOM writable API.
          await writer.write(new Uint8Array(part.subarray(0, length))); count += length;
          if (key.startsWith('blobs/')) this.payloadWrites += length;
        }
        if (fault && count >= fault.afterBytes) throw fault.error;
      }
      await writer.close();
    } catch (error) {
      try { await writer.abort(error); } catch { /* preserve original failure */ }
      throw error;
    }
  }
  async remove(key: string): Promise<void> {
    const location = await this.location(key, false); if (!location) return;
    try { await location.dir.removeEntry(location.name); }
    catch (error) { if (!absent(error)) throw error; }
  }
  outputSink(): Sink {
    // Private synthetic OPFS sink, not a browser download/share implementation.
    // Open lazily: candidate.export owns the browser lock before sink writes.
    let writer: FileSystemWritableFileStream | undefined;
    const root = this.root;
    const writable = async () => {
      if (!writer) writer = await (await root.getFileHandle('synthetic-export.bin', { create: true })).createWritable();
      return writer;
    };
    return {
      async write(bytes) {
        if (bytes.length > CHUNK_BYTES) throw new Error('oversized output chunk');
        await (await writable()).write(new Uint8Array(bytes));
      },
      async commit() { await (await writable()).close(); },
      async abort() { if (writer) await writer.abort(); },
    };
  }
  async outputSource(): Promise<Source> {
    const handle = await this.root.getFileHandle('synthetic-export.bin'); const file = await handle.getFile();
    return { size: file.size, async *chunks() {
      for (let offset = 0; offset < file.size; offset += CHUNK_BYTES)
        yield new Uint8Array(await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer());
    } };
  }
}
