import type { WorkspaceFS } from '../platform/fs';

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

/**
 * Write one v1 blob and verify the exact stored bytes before metadata may refer
 * to it. The copy prevents either the caller or the filesystem adapter from
 * changing the comparison source while the asynchronous write is in flight.
 */
export async function writeVerifiedBytes(
  fs: WorkspaceFS,
  path: string,
  bytes: Uint8Array,
): Promise<void> {
  const expected = new Uint8Array(bytes);
  await fs.writeBytes(path, new Uint8Array(expected));
  const stored = await fs.readBytes(path);
  if (stored === null || !bytesEqual(stored, expected)) {
    throw new Error(`blob verification failed: ${path}`);
  }
}
