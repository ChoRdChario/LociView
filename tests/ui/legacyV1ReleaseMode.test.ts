import { describe, expect, it } from 'vitest';
import { addCaptionAttachments } from '../../src/assets/captionAttachment';
import { addModelAsset, replaceModelAsset } from '../../src/assets/modelAsset';
import { exportProjectZip, inspectZip, mergeFromInspection } from '../../src/assets/package';
import { writeZipEntries } from '../../src/assets/zipio';
import { createManifest } from '../../src/core/manifest';
import type { Op } from '../../src/core/schema';
import { ProjectStore, type Identity } from '../../src/core/store';
import { applyCsvPlan, type CsvImportPlan } from '../../src/io/csv';
import { MemoryFS, ProjectMutationDeniedError } from '../../src/platform/fs';
import { decideHomeIntakeRoute } from '../../src/ui/home';
import { describeProjectAccess } from '../../src/ui/saveStatus';
import { serializeConventionalSourceReport } from '../../src/ui/conventionalSourceReport';

const identity: Identity = {
  userId: 'usr_00000000000000000000000070',
  deviceId: 'dev_00000000000000000000000070',
  displayName: 'release-mode',
};
const actorA = 'a_0000000000000';
const actorB = 'a_0000000000001';
const encoder = new TextEncoder();

function sourceOp(
  op: number,
  actor: string,
  e: string,
  id: string,
  v: Record<string, unknown>,
): Op {
  return {
    op,
    hlc: `2026-09-03T00:00:00.000Z-${(op - 1).toString(16).padStart(4, '0')}-${actor}`,
    actor,
    user: identity.userId,
    t: 'create',
    e,
    id,
    v,
  };
}

function invalidUtf8ManifestBytes(): Uint8Array {
  const text = JSON.stringify({ ...createManifest('__INVALID__'), name: '__INVALID__' });
  const token = '"__INVALID__"';
  const start = text.indexOf(token);
  const prefix = encoder.encode(text.slice(0, start + 1));
  const suffix = encoder.encode(text.slice(start + token.length - 1));
  return new Uint8Array([...prefix, 0xc3, 0x28, ...suffix]);
}

async function inventory(fs: MemoryFS, dir: string): Promise<Array<[string, number[]]>> {
  const paths = await fs.list(`${dir}/`);
  return Promise.all(paths.map(async (path): Promise<[string, number[]]> => [
    path,
    [...((await fs.readBytes(path)) ?? new Uint8Array())],
  ]));
}

describe('legacy v1 public-candidate release mode', () => {
  it('routes only Native restore, conventional View, and direct LociMyu conversion', () => {
    expect(decideHomeIntakeRoute({ container: 'native-portable' })).toBe('native-package');
    expect(decideHomeIntakeRoute({ container: 'v1' })).toBe('conventional-view');
    expect(decideHomeIntakeRoute({ container: 'foreign', hasLociMyuSource: true }))
      .toBe('locimyu-conversion');
    expect(decideHomeIntakeRoute({ container: 'foreign', hasLociMyuSource: false }))
      .toBe('unsupported');
  });

  it('presents the conventional source as read-only without an edit escalation', () => {
    const copy = describeProjectAccess('view', 'read-only', '従来形式は閲覧専用です');
    expect(copy).toMatchObject({
      compactText: '従来形式・閲覧専用',
      canRetry: false,
      actionLabel: null,
      actionTitle: null,
    });
    expect(copy.detailText).toContain('新しい形式へ変換');
    expect(`${copy.compactText} ${copy.detailText}`).not.toMatch(/legacy|\bv1\b|writer|operation log/iu);
  });

  it('reports source file, one-based line, and an ordinary-language reason', () => {
    const report = serializeConventionalSourceReport([
      { path: 'projects/example/ops/a_0000000000000.jsonl', line: 7, reason: 'schema violation' },
      { path: 'projects/example/ops/a_0000000000001.jsonl', line: 8, reason: 'operation actor/path mismatch' },
    ]);
    expect(JSON.parse(report)).toMatchObject({
      issues: [
        { file: 'a_0000000000000.jsonl', line: 7, reason: '記録の形式が正しくありません' },
        { file: 'a_0000000000001.jsonl', line: 8, reason: '記録の保存先と識別情報が一致しません' },
      ],
    });
    expect(report).not.toMatch(/legacy|\bv1\b|writer|operation log/iu);
  });

  it('rejects invalid UTF-8 operation bytes instead of replacing or publishing them', async () => {
    const manifest = createManifest('invalid utf8');
    const zip = await writeZipEntries([
      { path: 'lociview.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
      { path: 'ops/a_0000000000000.jsonl', data: new Uint8Array([0xc3, 0x28]) },
    ]);
    await expect(inspectZip(zip)).rejects.toThrow();
  });

  it('rejects invalid UTF-8 manifest bytes in package and retained-source paths', async () => {
    const bytes = invalidUtf8ManifestBytes();
    const zip = await writeZipEntries([{ path: 'lociview.json', data: bytes }]);
    await expect(inspectZip(zip)).rejects.toThrow(/UTF-8/iu);

    const fs = new MemoryFS();
    const dir = 'projects/invalid-manifest-utf8';
    await fs.writeBytes(`${dir}/lociview.json`, bytes);
    await expect(ProjectStore.openLegacySource(fs, dir, identity)).rejects.toThrow(/UTF-8/iu);
  });

  it('reports and excludes operations whose actor does not match their file', async () => {
    const manifest = createManifest('actor mismatch');
    const op = sourceOp(1, actorA, 'view', 'view_01J00000000000000000000001', {
      name: '正面',
      cameraState: { eye: [0, 0, 3], target: [0, 0, 0], up: [0, 1, 0], fov: 45, ortho: false },
      background: '#101010',
    });
    const log = `${JSON.stringify(op)}\n`;
    const fs = new MemoryFS();
    const dir = 'projects/actor-mismatch';
    await fs.writeText(`${dir}/lociview.json`, JSON.stringify(manifest));
    await fs.writeText(`${dir}/ops/${actorB}.jsonl`, log);

    const source = await ProjectStore.openLegacySource(fs, dir, identity);
    expect(source.allOps).toEqual([]);
    expect(source.loadErrors).toEqual([{
      file: `${dir}/ops/${actorB}.jsonl`,
      errors: [{ line: 1, reason: 'operation actor/path mismatch' }],
    }]);

    const zip = await writeZipEntries([
      { path: 'lociview.json', data: encoder.encode(JSON.stringify(manifest)) },
      { path: `ops/${actorB}.jsonl`, data: encoder.encode(log) },
    ]);
    const inspection = await inspectZip(zip);
    expect(inspection.ops).toEqual([]);
    expect(inspection.opsIssues).toContainEqual({
      path: `ops/${actorB}.jsonl`,
      line: 1,
      reason: 'operation actor/path mismatch',
    });
  });

  it('keeps malformed known fields inactive while preserving allowed Caption newlines', async () => {
    const manifest = createManifest('known field policy');
    const operations = [
      sourceOp(1, actorA, 'view', 'view_01J00000000000000000000001', { name: `A\u2028B` }),
      sourceOp(2, actorA, 'view', 'view_01J00000000000000000000002', {
        name: 'broken camera',
        cameraState: { eye: 7, target: [0, 0, 0], up: [0, 1, 0], fov: 45, ortho: false },
      }),
      sourceOp(3, actorA, 'caption', 'cap_01J00000000000000000000003', {
        title: 'broken anchor',
        body: '',
        anchor: { modelAssetId: 'ast_01J00000000000000000000004', position: ['x', 0, 0] },
      }),
      sourceOp(4, actorA, 'asset', 'ast_01J00000000000000000000004', {
        kind: 'model',
        path: 'models/model.glb',
        originalName: 7,
      }),
      sourceOp(5, actorA, 'caption', 'cap_01J00000000000000000000005', {
        title: 'valid',
        body: 'tab\tline one\nline two\rline three',
      }),
    ];
    const fs = new MemoryFS();
    const dir = 'projects/known-field-policy';
    await fs.writeText(`${dir}/lociview.json`, JSON.stringify(manifest));
    await fs.writeText(`${dir}/ops/${actorA}.jsonl`, `${operations.map((op) => JSON.stringify(op)).join('\n')}\n`);

    const source = await ProjectStore.openLegacySource(fs, dir, identity);
    expect(source.loadErrors[0]?.errors).toEqual([
      { line: 1, reason: 'schema violation' },
      { line: 2, reason: 'schema violation' },
      { line: 3, reason: 'schema violation' },
      { line: 4, reason: 'schema violation' },
    ]);
    expect(source.allOps).toEqual([operations[4]]);
    expect(source.state.byKind.caption?.['cap_01J00000000000000000000005']?.fields.body)
      .toBe('tab\tline one\nline two\rline three');
  });

  it('rejects a noncanonical conventional project identity before registration', async () => {
    const manifest = { ...createManifest('invalid identity'), projectId: 'prj_bad' };
    const zip = await writeZipEntries([
      { path: 'lociview.json', data: new TextEncoder().encode(JSON.stringify(manifest)) },
    ]);
    await expect(inspectZip(zip)).rejects.toThrow(/identity/iu);
  });

  it('fails closed at store and service boundaries before any source byte changes', async () => {
    const fs = new MemoryFS();
    const dir = 'projects/read-only-release-source';
    const writable = await ProjectStore.create(fs, dir, 'read only source', identity);
    const modelId = await addModelAsset(fs, dir, writable, 'model.stl', new Uint8Array([1, 2, 3]));
    const captionId = writable.createEntity('caption', {
      title: 'source caption',
      body: '',
      color: '#eab308',
      attachments: [],
    });
    await writable.flush();
    const inspection = await inspectZip(await exportProjectZip(fs, dir, writable));
    const source = await ProjectStore.openLegacySource(fs, dir, identity);
    const before = await inventory(fs, dir);
    const beforeOps = structuredClone(source.allOps);
    const beforeState = structuredClone(source.state);
    const beforeVector = structuredClone(source.vector);
    const csvPlan: CsvImportPlan = {
      updates: [{ id: captionId, patch: { title: 'forbidden' } }],
      creates: [],
      deleteCandidates: [],
      newSetNames: [],
      issues: [],
    };

    const syncMutations = [
      () => source.createEntity('caption', { title: 'forbidden' }),
      () => source.updateEntity('caption', captionId, { title: 'forbidden' }),
      () => source.deleteEntity('caption', captionId),
      () => source.dispatch({ t: 'update', e: 'caption', id: captionId, v: { title: 'forbidden' } }),
      () => source.mergeExternal([]),
      () => applyCsvPlan(source, csvPlan),
    ];
    for (const mutate of syncMutations) expect(mutate).toThrow(ProjectMutationDeniedError);

    await expect(addModelAsset(fs, dir, source, 'new.stl', new Uint8Array([4, 5, 6])))
      .rejects.toBeInstanceOf(ProjectMutationDeniedError);
    await expect(replaceModelAsset(fs, dir, source, modelId, 'replacement.stl', new Uint8Array([7])))
      .rejects.toBeInstanceOf(ProjectMutationDeniedError);
    let attachmentPublished = false;
    await expect(addCaptionAttachments(
      fs,
      dir,
      source,
      captionId,
      [{ name: 'image.png', mime: 'image/png', readBytes: async () => new Uint8Array([8]) }],
      () => { attachmentPublished = true; },
    )).rejects.toBeInstanceOf(ProjectMutationDeniedError);
    await expect(mergeFromInspection(fs, dir, source, inspection))
      .rejects.toBeInstanceOf(ProjectMutationDeniedError);

    expect(attachmentPublished).toBe(false);
    expect(await inventory(fs, dir)).toEqual(before);
    expect(source.allOps).toEqual(beforeOps);
    expect(source.state).toEqual(beforeState);
    expect(source.vector).toEqual(beforeVector);
  });
});
