// lociview.json マニフェスト (docs/02 §2)
// 可変状態は持たせない。可変なものはすべて ops から導出する。

import { newId } from './ids';
import { parseJsonWithoutDuplicateMembers } from './json';
import { cloneValidatedJsonObject } from './schema';

export const MANIFEST_FORMAT = 'lociview-project';
export const SCHEMA_VERSION = 1;
export const GENERATOR = 'LociView/0.0.1';

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
