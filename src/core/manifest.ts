// lociview.json マニフェスト (docs/02 §2)
// 可変状態は持たせない。可変なものはすべて ops から導出する。

import { newId } from './ids';
import { parseJsonWithoutDuplicateMembers } from './json';
import { cloneValidatedJsonObject, isPortableSingleLineText } from './schema';

export const MANIFEST_FORMAT = 'lociview-project';
export const SCHEMA_VERSION = 1;
export const GENERATOR = 'LociView/0.0.1';
export const CANDIDATE_V1_IMPORT_RECEIPT_FILE = 'staging/import-manifest.expected';
const CANDIDATE_V1_PROJECT_ID = /^prj_[0-7][0123456789ABCDEFGHJKMNPQRSTVWXYZ]{25}$/u;
const fatalUtf8Decoder = new TextDecoder('utf-8', { fatal: true });

export interface ProjectManifest {
  format: typeof MANIFEST_FORMAT;
  schemaVersion: number;
  projectId: string;
  name: string;
  createdAt: string;
  generator: string;
}

export function createManifest(name: string, now: Date = new Date()): ProjectManifest {
  return {
    format: MANIFEST_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    projectId: newId('prj', now.getTime()),
    name,
    createdAt: now.toISOString(),
    generator: GENERATOR,
  };
}

export function parseManifest(text: string): ProjectManifest {
  let x: unknown;
  try {
    x = parseJsonWithoutDuplicateMembers(text);
  } catch {
    throw new Error('manifest: invalid JSON');
  }
  if (typeof x !== 'object' || x === null) throw new Error('manifest: not an object');
  const m = cloneValidatedJsonObject(x, true);
  if (m === null) throw new Error('manifest: invalid decoded JSON');
  if (m.format !== MANIFEST_FORMAT) throw new Error('manifest: unknown format');
  if (typeof m.schemaVersion !== 'number' || m.schemaVersion < 1) throw new Error('manifest: bad schemaVersion');
  if (m.schemaVersion > SCHEMA_VERSION) {
    // 新しいアプリで作られたデータ。読み込みは試みる（§9 前方互換の努力）が警告対象
    console.warn(`manifest: newer schemaVersion ${m.schemaVersion} (supported: ${SCHEMA_VERSION})`);
  }
  if (typeof m.projectId !== 'string' || !m.projectId.startsWith('prj_')) throw new Error('manifest: bad projectId');
  if (typeof m.name !== 'string') throw new Error('manifest: bad name');
  if (typeof m.createdAt !== 'string') throw new Error('manifest: bad createdAt');
  return {
    format: MANIFEST_FORMAT,
    schemaVersion: m.schemaVersion,
    projectId: m.projectId,
    name: m.name,
    createdAt: m.createdAt,
    generator: typeof m.generator === 'string' ? m.generator : '',
  };
}

/** Strict public-candidate admission for a conventional schema-v1 source. */
export function parseCandidateV1Manifest(text: string): ProjectManifest {
  const manifest = parseManifest(text);
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error('manifest: unsupported conventional source version');
  }
  if (!CANDIDATE_V1_PROJECT_ID.test(manifest.projectId)) {
    throw new Error('manifest: noncanonical conventional project identity');
  }
  if (!isPortableSingleLineText(manifest.name)) {
    throw new Error('manifest: invalid conventional project name');
  }
  return manifest;
}

/** Candidate sources must not pass through replacement-character UTF-8 decoding. */
export function parseCandidateV1ManifestBytes(bytes: Uint8Array): ProjectManifest {
  let text: string;
  try {
    text = fatalUtf8Decoder.decode(bytes);
  } catch {
    throw new Error('manifest: invalid UTF-8');
  }
  return parseCandidateV1Manifest(text);
}

/** Private import staging receipt; it is neither a v1 package entry nor source authority. */
export function candidateV1ImportReceiptPath(dir: string): string {
  return `${dir}/${CANDIDATE_V1_IMPORT_RECEIPT_FILE}`;
}

interface CandidateV1PublicationReader {
  readBytes(path: string): Promise<Uint8Array | null>;
}

export class CandidateV1PublicationIncompleteError extends Error {
  constructor() {
    super('manifest: incomplete conventional import publication');
    this.name = 'CandidateV1PublicationIncompleteError';
  }
}

/**
 * Read one stable marker/receipt pair without accepting a stale parseable
 * marker prefix across an import retry. Correct imports never take either
 * value through an ABA transition, so two equal samples are fail-closed.
 */
export async function readPublishedCandidateV1ManifestBytes(
  reader: CandidateV1PublicationReader,
  dir: string,
): Promise<Uint8Array | null> {
  const receiptPath = candidateV1ImportReceiptPath(dir);
  const markerPath = `${dir}/lociview.json`;
  const receiptBefore = await reader.readBytes(receiptPath);
  const markerBefore = await reader.readBytes(markerPath);
  const receiptAfter = await reader.readBytes(receiptPath);
  const markerAfter = await reader.readBytes(markerPath);
  if (
    !nullableBytesEqual(receiptBefore, receiptAfter) ||
    !nullableBytesEqual(markerBefore, markerAfter)
  ) {
    throw new Error('manifest: conventional import publication changed while reading');
  }
  if (markerAfter === null) return null;
  assertCandidateV1ImportPublicationComplete(markerAfter, receiptAfter);
  return markerAfter;
}

/**
 * A receipt left by an interrupted import makes byte equality, rather than JSON
 * parseability, the activation boundary. Established sources have no receipt.
 */
export function parsePublishedCandidateV1ManifestBytes(
  markerBytes: Uint8Array,
  receiptBytes: Uint8Array | null,
): ProjectManifest {
  assertCandidateV1ImportPublicationComplete(markerBytes, receiptBytes);
  return parseCandidateV1ManifestBytes(markerBytes);
}

export function assertCandidateV1ImportPublicationComplete(
  markerBytes: Uint8Array,
  receiptBytes: Uint8Array | null,
): void {
  if (
    receiptBytes !== null &&
    (markerBytes.length !== receiptBytes.length ||
      !markerBytes.every((value, index) => value === receiptBytes[index]))
  ) {
    throw new CandidateV1PublicationIncompleteError();
  }
}

function nullableBytesEqual(left: Uint8Array | null, right: Uint8Array | null): boolean {
  return left === null
    ? right === null
    : right !== null &&
      left.length === right.length &&
      left.every((value, index) => value === right[index]);
}
