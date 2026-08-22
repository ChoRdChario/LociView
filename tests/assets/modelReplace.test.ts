import { beforeAll, describe, expect, it } from 'vitest';
import { addModelAsset, replaceModelAsset } from '../../src/assets/modelAsset';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { FaultInjectingMemoryFS } from '../helpers/faultFs';

const USER: Identity = { userId: 'usr_R', deviceId: 'dev_R', displayName: 'r' };
const STL_A = new TextEncoder().encode('solid a\nendsolid a\n');
const STL_B = new TextEncoder().encode('solid b\nfacet normal 0 0 1\nendfacet\nendsolid b\n');

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

async function setup(fs: MemoryFS = new MemoryFS()): Promise<{ fs: MemoryFS; store: ProjectStore; dir: string; assetId: string; capId: string }> {
  const dir = 'projects/p';
  const store = await ProjectStore.create(fs, dir, 'p', USER);
  const assetId = await addModelAsset(fs, dir, store, 'model-a.stl', STL_A);
  // このモデルに紐づくキャプションと、transform/pinScale変更
  const capId = store.createEntity('caption', {
    setId: null,
    title: 'ピン',
    anchor: { modelAssetId: assetId, position: [1, 2, 3] },
  });
  store.updateEntity('asset', assetId, { transform: { scale: 2.5, upAxis: 'Z' }, pinScale: 1.8 });
  await store.flush();
  return { fs, store, dir, assetId, capId };
}

describe('replaceModelAsset', () => {
  it('アセットID・キャプション紐付け・transform/pinScaleを保ち、実体だけ差し替える', async () => {
    const { fs, store, dir, assetId, capId } = await setup();
    const before = store.state.byKind.asset![assetId]!;
    const oldPath = before.fields.path as string;

    await replaceModelAsset(fs, dir, store, assetId, 'model-b.stl', STL_B);

    const after = store.state.byKind.asset![assetId]!;
    // 同じアセットID
    expect(store.state.byKind.asset![assetId]).toBeDefined();
    // 名前・サイズ・パスは更新
    expect(after.fields.originalName).toBe('model-b.stl');
    expect(after.fields.size).toBe(STL_B.length);
    expect(after.fields.path).not.toBe(oldPath);
    // transform / pinScale は保持
    expect(after.fields.transform).toEqual({ scale: 2.5, upAxis: 'Z' });
    expect(after.fields.pinScale).toBe(1.8);
    // キャプションは同じアセットに紐づいたまま
    const cap = store.state.byKind.caption![capId]!;
    expect((cap.fields.anchor as { modelAssetId: string }).modelAssetId).toBe(assetId);
    // 新しい実体が保存され、中身がBになっている
    const newBytes = await fs.readBytes(`${dir}/${after.fields.path as string}`);
    expect(newBytes).toEqual(STL_B);
    // 旧blob cleanupは、共有参照を確認できるdurable GC境界の責務とする。
  });

  it('差し替え後にプロジェクトを開き直しても復元できる', async () => {
    const { fs, store, dir, assetId } = await setup();
    await replaceModelAsset(fs, dir, store, assetId, 'model-b.stl', STL_B);
    await store.flush();

    const reopened = await ProjectStore.open(fs, dir, USER);
    const asset = reopened.state.byKind.asset![assetId]!;
    expect(asset.fields.originalName).toBe('model-b.stl');
    const bytes = await fs.readBytes(`${dir}/${asset.fields.path as string}`);
    expect(bytes).toEqual(STL_B);
  });

  it('存在しないアセットIDは失敗する', async () => {
    const { fs, store, dir } = await setup();
    await expect(replaceModelAsset(fs, dir, store, 'ast_missing', 'x.stl', STL_B)).rejects.toThrow(/not found/);
  });

  describe('G0S-BLOB/replace precondition', () => {
    let safe: boolean;

    beforeAll(async () => {
      const faultFs = new FaultInjectingMemoryFS();
      const { fs, store, dir, assetId } = await setup(faultFs);
      faultFs.failNext('appendText', `${dir}/ops/${store.actorId}.jsonl`);

      let actionRejected = false;
      try {
        await replaceModelAsset(fs, dir, store, assetId, 'model-b.stl', STL_B);
      } catch {
        actionRejected = true;
      }
      faultFs.assertAllConsumed();
      await store.flush().catch(() => undefined);

      const reopened = await ProjectStore.open(fs, dir, USER);
      const fields = reopened.state.byKind.asset![assetId]!.fields;
      const reopenedPath = fields.path;
      const expected = fields.originalName === 'model-a.stl' ? STL_A : fields.originalName === 'model-b.stl' ? STL_B : null;
      const actual = typeof reopenedPath === 'string' ? await fs.readBytes(`${dir}/${reopenedPath}`) : null;
      const optimizedPath = fields.optimizedPath;
      const optimizedSafe =
        typeof optimizedPath !== 'string' || optimizedPath === '' || (await fs.readBytes(`${dir}/${optimizedPath}`)) !== null;
      safe =
        expected !== null &&
        actual !== null &&
        bytesEqual(actual, expected) &&
        fields.size === expected.length &&
        optimizedSafe &&
        (actionRejected || fields.originalName === 'model-b.stl');
    });

    it('G0S-BLOB/replace: interrupted replacement reopens with a binding whose exact blob still exists', () => {
      expect(safe).toBe(true);
    });
  });
});
