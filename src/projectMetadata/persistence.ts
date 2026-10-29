import { parseJsonWithoutDuplicateMembers } from '../core/json';
import { canonical } from '../domain/projectGraphSupport';
import { cloneCanonicalValue, type JsonValue } from '../domain/values';
import type { ProjectWorkspaceFS, ProjectMutationAuthority } from '../platform/fs';
import type { MetadataStorageFactory } from './repository';
import { fail, type MetadataLimits } from './format';

export const equalBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);
export const json = (v: unknown) => canonical(v as JsonValue);
export const technicalId = (v: unknown): string => typeof v === 'string' && /^[0-9a-f]{32}$/.test(v) ? v : fail('technical-id');
export const newId = () => crypto.randomUUID().replaceAll('-', '');
export async function digest(bytes: Uint8Array): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer))].map(v => v.toString(16).padStart(2, '0')).join('');
}
export const jsonDigest = (v: unknown) => digest(new TextEncoder().encode(json(v)));
export const metadataPath = (fs: ProjectWorkspaceFS, suffix: string) => `${fs.projectRoot ? `${fs.projectRoot}/` : ''}v2/metadata/${suffix}`;

/** Local receipts, not arbitrary package parsing. Bound before parsing; never log contents. */
export async function readReceipt<T>(fs: ProjectWorkspaceFS, path: string, limits: MetadataLimits): Promise<T | null> {
  const file = await fs.readStream(path);
  if (!file) return null;
  if (file.size > limits.maxTotalBytes) fail('receipt-budget');
  const bytes = await fs.readBytes(path);
  if (!bytes || bytes.length !== file.size) return fail('receipt-read');
  return decodeReceipt<T>(bytes, limits);
}

/** Pure local-receipt decoding; callers retain ownership of fresh, bounded I/O. */
export function decodeReceipt<T>(bytes: Uint8Array, limits: MetadataLimits): T {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const value = cloneCanonicalValue(parseJsonWithoutDuplicateMembers(text), limits);
    if (!value || typeof value !== 'object' || Array.isArray(value) || json(value) !== text) fail('receipt-canonical');
    return value as T;
  } catch { return fail('receipt-invalid'); }
}

/** Write-once, compare/read back. A torn file is repair state, not implicit overwrite permission. */
export async function writeReceipt(fs: ProjectWorkspaceFS, path: string, value: unknown, limits: MetadataLimits): Promise<void> {
  const checked = cloneCanonicalValue(value, limits), text = json(checked);
  if (new TextEncoder().encode(text).length > limits.maxTotalBytes) fail('receipt-budget');
  const previous = await readReceipt(fs, path, limits);
  if (previous !== null) { if (json(previous) !== text) fail('receipt-exists'); return; }
  fs.mutationAuthority.assertWorkspaceWriteAuthorized();
  await fs.writeText(path, text);
  fs.mutationAuthority.assertWorkspaceWriteAuthorized();
  if (json(await readReceipt(fs, path, limits)) !== text) fail('receipt-readback');
}

// Serialize all service instances sharing the same project lease, not just one UI instance.
const queues = new WeakMap<ProjectMutationAuthority, Promise<unknown>>();
const writeFences = new WeakMap<ProjectWorkspaceFS, () => Promise<void>>();
export interface MetadataReadPorts { readonly fs: ProjectWorkspaceFS; readonly factory?: MetadataStorageFactory }
type ReadOperation = <T>(action: (ports: MetadataReadPorts) => Promise<T>) => Promise<T>;
const readOperations = new WeakMap<ProjectWorkspaceFS, { factory: MetadataStorageFactory; run: ReadOperation }>();
/** Internal generation binding; does not grant writes or replace a root lease. */
export function registerReadOperation(fs: ProjectWorkspaceFS, factory: MetadataStorageFactory, run: ReadOperation): void {
  if (readOperations.has(fs)) fail('read-operation-already-bound');
  readOperations.set(fs, { factory, run });
}
export function withMetadataRead<T>(fs: ProjectWorkspaceFS, factory: MetadataStorageFactory | undefined,
  action: (ports: MetadataReadPorts) => Promise<T>): Promise<T> {
  const operation = readOperations.get(fs);
  if (!operation) return action({ fs, factory });
  if (factory && operation.factory !== factory) return Promise.reject(Error('generation-storage-binding'));
  return operation.run(action);
}
/** Internal scoped-capability hook; does not grant or replace the root lease. */
export function registerWriteFence(fs: ProjectWorkspaceFS, fence: () => Promise<void>): void {
  if (writeFences.has(fs)) fail('write-fence-already-bound');
  writeFences.set(fs, fence);
}
export async function underWriteLease<T>(fs: ProjectWorkspaceFS, action: () => Promise<T>): Promise<T> {
  const authority = fs.mutationAuthority;
  const prior = queues.get(authority) ?? Promise.resolve();
  const run = prior.catch(() => undefined).then(async () => {
    authority.assertEditable(); const finish = authority.beginWorkspaceWrite();
    const fence = writeFences.get(fs);
    try {
      if (fence) await fence();
      const result = await action();
      if (fence) await fence();
      authority.assertWorkspaceWriteAuthorized(); return result;
    }
    finally { finish(); }
  });
  queues.set(authority, run);
  try { return await run; } finally { if (queues.get(authority) === run) queues.delete(authority); }
}
