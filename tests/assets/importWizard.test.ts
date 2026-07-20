import { describe, expect, it } from 'vitest';
import { applyImportPlan, buildImportPlan } from '../../src/assets/importWizard';
import { writeZipEntries, readZipEntries } from '../../src/assets/zipio';
import { legacyCaptionId } from '../../src/io/locimyu';
import { isVisible, visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { makeXlsx } from '../helpers/makeXlsx';

const USER: Identity = { userId: 'usr_M', deviceId: 'dev_M', displayName: '移行者' };
const enc = new TextEncoder();

const CAP_HEADER = ['id', 'title', 'body', 'color', 'posX', 'posY', 'posZ', 'imageFileId', 'createdAt', 'updatedAt'];
const VIEWS_HEADER = ['id', 'captionSheetGid', 'name', 'bgColor', 'cameraType', 'eyeX', 'eyeY', 'eyeZ', 'targetX', 'targetY', 'targetZ', 'upX', 'upY', 'upZ', 'fov', 'createdAt', 'updatedAt'];
const MAT_HEADER = ['materialKey', 'opacity', 'doubleSided', 'unlitLike', 'chromaEnable', 'chromaColor', 'chromaTolerance', 'chromaFeather', 'roughness', 'metalness', 'emissiveHex', 'updatedAt', 'updatedBy', 'sheetGid'];

/** Google Drive のフォルダZIPダウンロードを模した ZIP を作る */
async function makeDriveZip(opts: { withFileIdMap?: boolean } = {}): Promise<Uint8Array> {
  const xlsx = await makeXlsx([
    {
      name: '通常表示',
      rows: [
        CAP_HEADER,
        ['c_a1', '北壁の亀裂', '幅3mm', '#eab308', '1.5', '2', '-3', 'DRIVEID_A', '2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z'],
        ['c_a2', '基礎の露出', '', '#f87171', '0.5', '0', '0', '', '', ''],
      ],
    },
    {
      name: '半透明・内部',
      rows: [
        CAP_HEADER,
        ['c_b1', '内部の空洞', '', '#4ade80', '0', '1', '0', '', '', ''],
      ],
    },
    {
      name: '__LM_VIEWS',
      rows: [
        VIEWS_HEADER,
        ['v_1', '1', '全景', '#202124', 'perspective', '1', '2', '3', '0', '0', '0', '0', '1', '0', '50', '', ''],
      ],
    },
    {
      name: '__LM_MATERIALS',
      rows: [
        MAT_HEADER,
        ['Wall', '0.4', 'true', 'false', 'false', '', '', '', '', '', '', '', '', '2'],
      ],
    },
  ]);

  // 最小STL（cube相当は不要。ヘッダのみで検出される）
  const stl = enc.encode('solid s\nfacet normal 0 0 1\n outer loop\n  vertex 0 0 0\n  vertex 1 0 0\n  vertex 0 1 0\n endloop\nendfacet\nendsolid s\n');

  const entries = [
    { path: 'LociMyu Save - 現場A.xlsx', data: xlsx },
    { path: 'site.stl', data: stl },
    { path: '写真/kiretsu_01.jpg', data: enc.encode('JPEGDATA') },
    { path: '写真/kiso.png', data: enc.encode('PNGDATA') },
  ];
  if (opts.withFileIdMap === true) {
    entries.push({
      path: 'fileid-map.csv',
      data: enc.encode('fileId,filename\nDRIVEID_A,kiretsu_01.jpg\n'),
    });
  }
  return writeZipEntries(entries);
}

describe('buildImportPlan', () => {
  it('Drive ZIPの中身を分類し、LociMyu移行を検出する', async () => {
    const zip = await makeDriveZip();
    const plan = await buildImportPlan(await readZipEntries(zip));

    expect(plan.models.map((m) => m.name)).toEqual(['site.stl']);
    expect(plan.images.map((i) => i.name).sort()).toEqual(['kiretsu_01.jpg', 'kiso.png']);
    expect(plan.migration).not.toBeNull();
    expect(plan.migration!.sets.map((s) => s.name)).toEqual(['通常表示', '半透明・内部']);
    expect(plan.migration!.views).toHaveLength(1);
    expect(plan.migration!.materials).toHaveLength(1);
    expect(plan.migration!.unlinkedImages.size).toBe(1);
  });

  it('fileId対応表CSVを読み分ける（キャプションCSVと混同しない）', async () => {
    const zip = await makeDriveZip({ withFileIdMap: true });
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.fileIdMap.get('DRIVEID_A')).toBe('kiretsu_01.jpg');
    expect(plan.tables.some((t) => t.name === 'fileid-map')).toBe(false);
  });

  it('Excelロックファイル・隠しファイルを無視する', async () => {
    const zip = await writeZipEntries([
      { path: '~$book.xlsx', data: enc.encode('PK') },
      { path: '.DS_Store', data: enc.encode('x') },
      { path: 'a.png', data: enc.encode('PNG') },
    ]);
    const plan = await buildImportPlan(await readZipEntries(zip));
    expect(plan.images).toHaveLength(1);
    expect(plan.tables).toHaveLength(0);
  });
});

describe('applyImportPlan（LociMyu移行）', () => {
  it('セット・キャプション・ビュー・マテリアルを引き継いで新規プロジェクトを作る', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: '現場A（移行）' });

    expect(result.captionCount).toBe(3);
    expect(result.setCount).toBe(2);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const sets = visibleEntities(store.state, 'set');
    expect(sets.map((s) => s.fields.name)).toEqual(['通常表示', '半透明・内部']);

    const captions = visibleEntities(store.state, 'caption');
    expect(captions).toHaveLength(3);
    const kiretsu = captions.find((c) => c.fields.title === '北壁の亀裂')!;
    expect(kiretsu.id).toBe(legacyCaptionId('c_a1'));
    expect((kiretsu.fields.anchor as { position: number[] }).position).toEqual([1.5, 2, -3]);
    // キャプションは所属セットに正しく割り当てられる
    const setA = sets.find((s) => s.fields.name === '通常表示')!;
    expect(kiretsu.fields.setId).toBe(setA.id);

    const views = visibleEntities(store.state, 'view');
    expect(views).toHaveLength(1);
    expect(views[0]!.fields.name).toBe('全景');
    expect(views[0]!.fields.background).toBe('#202124');

    const materials = visibleEntities(store.state, 'material');
    expect(materials).toHaveLength(1);
    expect(materials[0]!.fields.opacity).toBe(0.4);

    // モデル・画像がアセットとして登記され、実体も保存されている
    const assets = visibleEntities(store.state, 'asset');
    expect(assets.filter((a) => a.fields.kind === 'model')).toHaveLength(1);
    expect(assets.filter((a) => a.fields.kind === 'image')).toHaveLength(2);
    for (const a of assets) {
      expect(await fs.exists(`${result.dir}/${a.fields.path as string}`)).toBe(true);
    }
  });

  it('既定セットは移行セットで置き換えられる（空セットが残らない）', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    const store = await ProjectStore.open(fs, result.dir, USER);
    expect(visibleEntities(store.state, 'set').map((s) => s.fields.name)).not.toContain('標準');
  });

  it('fileId対応表があれば画像を自動リンクする', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip({ withFileIdMap: true })));
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    expect(result.linkedImages).toBe(1);
    expect(result.unlinkedImages).toBe(0);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const kiretsu = visibleEntities(store.state, 'caption').find((c) => c.fields.title === '北壁の亀裂')!;
    const attachments = kiretsu.fields.attachments as string[];
    expect(attachments).toHaveLength(1);
    const asset = store.state.byKind.asset![attachments[0]!]!;
    expect(asset.fields.originalName).toBe('kiretsu_01.jpg');
  });

  it('手動リンクで画像を結び付けられる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const links = new Map([[legacyCaptionId('c_a1'), 'kiso.png']]);
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p', imageLinks: links });
    expect(result.linkedImages).toBe(1);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const cap = store.state.byKind.caption![legacyCaptionId('c_a1')]!;
    const astId = (cap.fields.attachments as string[])[0]!;
    expect(store.state.byKind.asset![astId]!.fields.originalName).toBe('kiso.png');
  });

  it('未リンク画像は legacyImageFileId を保持し、後から解決できる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: 'p' });
    expect(result.unlinkedImages).toBe(1);

    const store = await ProjectStore.open(fs, result.dir, USER);
    const cap = store.state.byKind.caption![legacyCaptionId('c_a1')]!;
    expect(cap.fields.legacyImageFileId).toBe('DRIVEID_A');
  });

  it('同じZIPを二度移行してもキャプションIDが一致する（重複しない）', async () => {
    const fs1 = new MemoryFS();
    const fs2 = new MemoryFS();
    const zip = await makeDriveZip();
    const r1 = await applyImportPlan(fs1, USER, await buildImportPlan(await readZipEntries(zip)), { projectName: 'p1' });
    const r2 = await applyImportPlan(fs2, USER, await buildImportPlan(await readZipEntries(zip)), { projectName: 'p2' });
    const s1 = await ProjectStore.open(fs1, r1.dir, USER);
    const s2 = await ProjectStore.open(fs2, r2.dir, USER);
    const ids1 = visibleEntities(s1.state, 'caption').map((c) => c.id).sort();
    const ids2 = visibleEntities(s2.state, 'caption').map((c) => c.id).sort();
    expect(ids1).toEqual(ids2);
  });

  it('移行後のプロジェクトは通常どおりZIP往復できる', async () => {
    const fs = new MemoryFS();
    const plan = await buildImportPlan(await readZipEntries(await makeDriveZip()));
    const result = await applyImportPlan(fs, USER, plan, { projectName: '移行済み' });
    const store = await ProjectStore.open(fs, result.dir, USER);

    const { exportProjectZip, inspectZip, importNewProject } = await import('../../src/assets/package');
    const zip = await exportProjectZip(fs, result.dir, store);
    const fs2 = new MemoryFS();
    await importNewProject(fs2, 'projects/re', await inspectZip(zip));
    const store2 = await ProjectStore.open(fs2, 'projects/re', USER);
    expect(store2.state).toEqual(store.state);
  });
});
