import type { WorkspaceReadableFile } from '../platform/fs';
import { digestNativeStream } from '../nativeGs/sha256';

/** Fresh byte proof; never a lifetime extension of an old storage verification. */
export async function sourceStreamProof(source: Pick<WorkspaceReadableFile, 'stream'>, signal?: AbortSignal) {
  const value = await digestNativeStream(source.stream(), signal);
  return { byteLength: value.byteLength, digest: value.sha256 };
}

/** Exact equality, independent of chunk boundaries; both sources must reach EOF. */
export async function equalSourceStreams(a: Pick<WorkspaceReadableFile, 'stream'>, b: Pick<WorkspaceReadableFile, 'stream'>): Promise<boolean> {
  const left = a.stream().getReader(), right = b.stream().getReader();
  let l = new Uint8Array(0) as Uint8Array<ArrayBufferLike>, r = new Uint8Array(0) as Uint8Array<ArrayBufferLike>, li = 0, ri = 0, ld = false, rd = false;
  try {
    for (;;) {
      while (!ld && li === l.length) { const next = await left.read(); ld = !!next.done; l = next.value ?? new Uint8Array(0); li = 0; }
      while (!rd && ri === r.length) { const next = await right.read(); rd = !!next.done; r = next.value ?? new Uint8Array(0); ri = 0; }
      if (ld || rd) return ld && rd;
      const count = Math.min(l.length - li, r.length - ri);
      for (let i = 0; i < count; i++) if (l[li + i] !== r[ri + i]) return false;
      li += count; ri += count;
    }
  } finally {
    await Promise.allSettled([left.cancel(), right.cancel()]); left.releaseLock(); right.releaseLock();
  }
}

/** OPFS returns a native snapshot. Memory backends retain their documented copy fallback. */
export async function sourceBlob(file: WorkspaceReadableFile): Promise<Blob> {
  if (file.blob) return file.blob();
  const reader = file.stream().getReader(), parts: ArrayBuffer[] = []; let count = 0;
  try {
    for (;;) { const next = await reader.read(); if (next.done) break; count += next.value.length;
      if (!Number.isSafeInteger(count) || count > file.size) throw Error('保存した原本の大きさが一致しません。');
      parts.push(next.value.slice().buffer); }
    if (count !== file.size) throw Error('保存した原本の大きさが一致しません。');
    return new Blob(parts);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
