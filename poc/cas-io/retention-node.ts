// Real synthetic files; one injected NodeIo writer, NOT cross-process/browser safety.
import { open, mkdir, readdir } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { NodeIo } from './node-io';
import type { Ports } from './retention';

export class RetentionFiles implements Ports {
  fault?: { key: string; afterBytes: number };
  constructor(readonly root: string, readonly cas: NodeIo) {}
  path(key: string): string {
    if (!/^(?:catalog\.json|marks\.json|projects\/prj_[0-9a-f]{32}\.json)$/.test(key)) throw new Error('invalid retention file key');
    const path = resolve(this.root, key);
    if (!path.startsWith(resolve(this.root) + sep)) throw new Error('retention path escaped'); return path;
  }
  async read(key: string): Promise<Uint8Array | null> {
    let file;
    try { file = await open(this.path(key), 'r'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    try {
      const size = (await file.stat()).size; if (size > 256 * 1024) throw new Error('retention metadata budget');
      const result = new Uint8Array(size); let offset = 0;
      while (offset < size) { const { bytesRead } = await file.read(result, offset, size - offset, offset);
        if (!bytesRead) throw new Error('truncated retention file'); offset += bytesRead; }
      return result;
    } finally { await file.close(); }
  }
  async write(key: string, bytes: Uint8Array): Promise<void> {
    const path = this.path(key); await mkdir(dirname(path), { recursive: true }); const file = await open(path, 'w');
    try {
      const limit = this.fault?.key === key ? Math.min(bytes.length, this.fault.afterBytes) : bytes.length;
      let offset = 0;
      while (offset < limit) { const { bytesWritten } = await file.write(bytes, offset, limit - offset, offset);
        if (!bytesWritten) throw new Error('zero retention write'); offset += bytesWritten; }
      await file.sync(); if (limit < bytes.length) throw new Error('injected retention quota');
    } finally { await file.close(); }
  }
  private async names(path: string): Promise<string[]> {
    try { return await readdir(path); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  }
  async projectIds(): Promise<string[]> {
    return (await this.names(resolve(this.root, 'projects'))).map(name => {
      if (!/^prj_[0-9a-f]{32}\.json$/.test(name)) throw new Error('unknown inventory entry'); return name.slice(0, -5);
    }).sort();
  }
  async verifiedDigests(): Promise<string[]> {
    return (await this.names(resolve(this.cas.root, 'verified'))).map(name => {
      if (!/^[0-9a-f]{64}\.json$/.test(name)) throw new Error('unknown receipt entry'); return name.slice(0, -5);
    }).sort();
  }
}
