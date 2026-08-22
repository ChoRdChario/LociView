import { beforeAll, describe, expect, it } from 'vitest';
import {
  exportOpsOnlyZip,
  exportProjectZip,
  importNewProject,
  inspectZip,
  mergeFromInspection,
} from '../../src/assets/package';
import { addModelAsset } from '../../src/assets/modelAsset';
import { readZipEntries, sanitizeZipPath, writeZipEntries, ZipGuardError } from '../../src/assets/zipio';
import { visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { FaultInjectingMemoryFS } from '../helpers/faultFs';

const USER_A: Identity = { userId: 'usr_AAA', deviceId: 'dev_A1', displayName: '田中' };
const USER_B: Identity = { userId: 'usr_BBB', deviceId: 'dev_B1', displayName: '鈴木' };

const encoder = new TextEncoder();

async function makeProject(fs: MemoryFS = new MemoryFS()): Promise<{ fs: MemoryFS; store: ProjectStore; dir: string }> {
  const dir = 'projects/p1';
  const store = await ProjectStore.create(fs, dir, '現場A', USER_A);
  const astId = store.createEntity('asset', {
    kind: 'model',
    path: 'models/ast_M.glb',
    originalName: 'site.glb',
    mime: 'model/gltf-binary',
  });
  await fs.writeBytes(`${dir}/models/ast_M.glb`, encoder.encode('GLB-DUMMY'));
  store.createEntity('caption', {
    title: '北壁の亀裂',
    body: '幅3mm',
    color: '#eab308',
    tags: ['要観察'],
    attachments: [],
    anchor: { modelAssetId: astId, position: [0.1, 2.3, -4.5] },
  });
  await store.flush();
  return { fs, store, dir };
}

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function visibleAssetBlobsMatch(
  fs: MemoryFS,
  dir: string,
  store: ProjectStore,
  expectedByPath: ReadonlyMap<string, Uint8Array>,
): Promise<boolean> {
  for (const asset of visibleEntities(store.state, 'asset')) {
    const path = asset.fields.path;
    if (typeof path !== 'string') return false;
    const expected = expectedByPath.get(path);
    const actual = await fs.readBytes(`${dir}/${path}`);
    if (expected === undefined || actual === null || !bytesEqual(actual, expected)) return false;
    if (typeof asset.fields.size === 'number' && asset.fields.size !== actual.length) return false;

    const optimizedPath = asset.fields.optimizedPath;
    if (typeof optimizedPath === 'string' && optimizedPath !== '') {
      const expectedOptimized = expectedByPath.get(optimizedPath);
      const actualOptimized = await fs.readBytes(`${dir}/${optimizedPath}`);
      if (
        expectedOptimized === undefined ||
        actualOptimized === null ||
        !bytesEqual(actualOptimized, expectedOptimized)
      ) return false;
      if (typeof asset.fields.optimizedSize === 'number' && asset.fields.optimizedSize !== actualOptimized.length) return false;
    }
  }
  return true;
}

function expectedBinaries(inspection: Awaited<ReturnType<typeof inspectZip>>): Map<string, Uint8Array> {
  return new Map(inspection.binaries.map(({ path, data }) => [path, data]));
}

describe('sanitizeZipPath', () => {
  it('通常パスを許可し、危険パスを拒否する', () => {
    expect(sanitizeZipPath('models/a.glb')).toBe('models/a.glb');
    expect(sanitizeZipPath('media/写真 1.jpg')).toBe('media/写真 1.jpg');
    expect(sanitizeZipPath('../etc/passwd')).toBeNull();
    expect(sanitizeZipPath('a/../../b')).toBeNull();
    expect(sanitizeZipPath('/absolute')).toBeNull();
    expect(sanitizeZipPath('C:/windows')).toBeNull();
    expect(sanitizeZipPath('a\\b')).toBeNull();
  });
});

describe('ZIPガード', () => {
  it('エントリ数超過を拒否する', async () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({
      path: `f${i}.txt`,
      data: encoder.encode('x'),
    }));
    const zip = await writeZipEntries(entries);
    await expect(
      readZipEntries(zip, { maxEntries: 10, maxTotalBytes: 1e9, maxEntryBytes: 1e9 }),
    ).rejects.toThrow(ZipGuardError);
  });

  it('展開サイズ超過を拒否する', async () => {
    const zip = await writeZipEntries([{ path: 'big.bin', data: new Uint8Array(2000) }]);
    await expect(
      readZipEntries(zip, { maxEntries: 100, maxTotalBytes: 1e9, maxEntryBytes: 1000 }),
    ).rejects.toThrow(/entry-too-large|big/);
  });

  it('ネストアーカイブを拒否する', async () => {
    const zip = await writeZipEntries([{ path: 'inner.zip', data: encoder.encode('PK') }]);
    await expect(readZipEntries(zip)).rejects.toThrow(/nested/);
  });

  it('パストラバーサルエントリを拒否する', async () => {
    const zip = await writeZipEntries([{ path: '../evil.txt', data: encoder.encode('x') }]);
    await expect(readZipEntries(zip)).rejects.toThrow(/unsafe/);
  });
});

describe('プロジェクトZIP往復', () => {
  it('export → inspect → importNewProject で状態・バイナリ・CSVが保たれる', async () => {
    const { fs, store, dir } = await makeProject();
    const zip = await exportProjectZip(fs, dir, store);

    const insp = await inspectZip(zip);
    expect(insp.kind).toBe('lociview');
    expect(insp.manifest!.projectId).toBe(store.manifest.projectId);
    expect(insp.opsErrorCount).toBe(0);

    const fs2 = new MemoryFS();
    await importNewProject(fs2, 'projects/imported', insp);
    const store2 = await ProjectStore.open(fs2, 'projects/imported', USER_B);

    expect(store2.state).toEqual(store.state);
    expect(await fs2.readBytes('projects/imported/models/ast_M.glb')).toEqual(
      encoder.encode('GLB-DUMMY'),
    );
  });

  it('エクスポートZIPに閲覧用captions.csvとsnapshot.jsonが同梱される', async () => {
    const { fs, store, dir } = await makeProject();
    const zip = await exportProjectZip(fs, dir, store);
    const entries = await readZipEntries(zip);
    const paths = entries.map((e) => e.path);
    expect(paths).toContain('captions.csv');
    expect(paths).toContain('snapshot.json');
    const csvBytes = entries.find((e) => e.path === 'captions.csv')!.data;
    const csv = new TextDecoder().decode(csvBytes);
    expect(csv).toContain('北壁の亀裂');
    // UTF-8 BOM (EF BB BF) がバイト列先頭にあること（TextDecoderは復号時にBOMを除去する）
    expect([csvBytes[0], csvBytes[1], csvBytes[2]]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('ops原文がbyte単位で保存される（未知フィールド素通しの担保）', async () => {
    const { fs, store, dir } = await makeProject();
    // 将来バージョンが書いたopを模擬（未知フィールドfutureX付き）
    const iso = new Date().toISOString();
    const futureLine =
      JSON.stringify({
        op: 1,
        hlc: `${iso}-0000-a_FUTURE`,
        actor: 'a_FUTURE',
        user: 'usr_F',
        t: 'create',
        e: 'hologram',
        id: 'holo_1',
        v: { shape: 'cube' },
        futureX: { nested: true },
      }) + '\n';
    await fs.writeText(`${dir}/ops/a_FUTURE.jsonl`, futureLine);
    const store2 = await ProjectStore.open(fs, dir, USER_A);

    const zip = await exportProjectZip(fs, dir, store2);
    const insp = await inspectZip(zip);
    const futureFile = insp.opsFiles.find((f) => f.path === 'ops/a_FUTURE.jsonl');
    expect(futureFile!.text).toBe(futureLine);
  });
});

describe('ZIPマージ（UC2: 回覧統合）', () => {
  it('別コピーで編集されたZIPを取り込むと統合され、冪等である', async () => {
    const { fs, store, dir } = await makeProject();
    const zip = await exportProjectZip(fs, dir, store);

    // Bが自分のワークスペースに展開して編集
    const fsB = new MemoryFS();
    await importNewProject(fsB, 'p', await inspectZip(zip));
    const storeB = await ProjectStore.open(fsB, 'p', USER_B);
    storeB.createEntity('caption', { title: 'Bの発見', color: '#00f' });
    await storeB.flush();
    const zipB = await exportProjectZip(fsB, 'p', storeB);

    // Aが取り込む
    const inspB = await inspectZip(zipB);
    const report = await mergeFromInspection(fs, dir, store, inspB);
    expect(report.created).toHaveLength(1);
    expect(visibleEntities(store.state, 'caption')).toHaveLength(2);

    // 同じZIPをもう一度 → 何も起きない
    const report2 = await mergeFromInspection(fs, dir, store, await inspectZip(zipB));
    expect(report2.created).toHaveLength(0);
    expect(visibleEntities(store.state, 'caption')).toHaveLength(2);
  });

  it('projectId不一致のZIPは拒否する', async () => {
    const { fs, store, dir } = await makeProject();
    const other = await makeProject();
    const zipOther = await exportProjectZip(other.fs, other.dir, other.store);
    await expect(mergeFromInspection(fs, dir, store, await inspectZip(zipOther))).rejects.toThrow(
      /mismatch/,
    );
  });

  it('opsのみの差分ZIPでもマージできる', async () => {
    const { fs, store, dir } = await makeProject();
    const zip = await exportProjectZip(fs, dir, store);
    const fsB = new MemoryFS();
    await importNewProject(fsB, 'p', await inspectZip(zip));
    const storeB = await ProjectStore.open(fsB, 'p', USER_B);
    storeB.createEntity('caption', { title: '軽量差分' });
    await storeB.flush();

    const diffZip = await exportOpsOnlyZip(fsB, 'p', storeB);
    const report = await mergeFromInspection(fs, dir, store, await inspectZip(diffZip));
    expect(report.created).toHaveLength(1);
  });
});

describe('G0-S characterization: package interruption', () => {
  describe('G0S-BLOB/import precondition', () => {
    let safe: boolean;

    beforeAll(async () => {
      const source = await makeProject();
      const inspection = await inspectZip(await exportProjectZip(source.fs, source.dir, source.store));
      const target = new FaultInjectingMemoryFS();
      const targetDir = 'projects/interrupted-import';
      const failedBinary = inspection.binaries[0]!;
      target.failNext('writeBytes', `${targetDir}/${failedBinary.path}`);

      await importNewProject(target, targetDir, inspection).catch(() => undefined);
      target.assertAllConsumed();
      const active = await target.exists(`${targetDir}/lociview.json`);
      let opened = false;
      let blobsMatch = false;
      if (active) {
        try {
          const reopened = await ProjectStore.open(target, targetDir, USER_B);
          opened = true;
          blobsMatch = await visibleAssetBlobsMatch(target, targetDir, reopened, expectedBinaries(inspection));
        } catch {
          // An active marker plus an unopenable project is unsafe, not inactive staging.
        }
      }
      safe = !active || (opened && blobsMatch);
    });

    it.fails('G0S-BLOB/import: interrupted new-project import is either inactive or has every referenced blob', () => {
      expect(safe).toBe(true);
    });
  });

  describe('G0S-BLOB/merge precondition', () => {
    let safe: boolean;

    beforeAll(async () => {
      const targetFs = new FaultInjectingMemoryFS();
      const target = await makeProject(targetFs);
      const baseZip = await exportProjectZip(target.fs, target.dir, target.store);

      const peerFs = new MemoryFS();
      await importNewProject(peerFs, 'projects/peer', await inspectZip(baseZip));
      const peerStore = await ProjectStore.open(peerFs, 'projects/peer', USER_B);
      const incomingAssetId = await addModelAsset(
        peerFs,
        'projects/peer',
        peerStore,
        'incoming.stl',
        encoder.encode('solid incoming\nendsolid incoming\n'),
      );
      await peerStore.flush();
      const incomingPath = peerStore.state.byKind.asset![incomingAssetId]!.fields.path as string;
      const incoming = await inspectZip(await exportProjectZip(peerFs, 'projects/peer', peerStore));

      targetFs.failNext('writeBytes', `${target.dir}/${incomingPath}`);
      await mergeFromInspection(targetFs, target.dir, target.store, incoming).catch(() => undefined);
      targetFs.assertAllConsumed();
      await target.store.flush().catch(() => undefined);

      safe = false;
      try {
        const reopened = await ProjectStore.open(targetFs, target.dir, USER_A);
        safe = await visibleAssetBlobsMatch(targetFs, target.dir, reopened, expectedBinaries(incoming));
      } catch {
        // A merge must not make an existing project unopenable.
      }
    });

    it('G0S-BLOB/merge: interrupted package merge never leaves visible metadata pointing to a missing blob', () => {
      expect(safe).toBe(true);
    });
  });
});
