import { describe, expect, it } from 'vitest';
import { ProjectStore, type Identity } from '../../src/core/store';
import { visibleEntities } from '../../src/core/reduce';
import { MemoryFS } from '../../src/platform/fs';

const USER_A: Identity = { userId: 'usr_AAA', deviceId: 'dev_A1', displayName: '田中' };
const USER_B: Identity = { userId: 'usr_BBB', deviceId: 'dev_B1', displayName: '鈴木' };

describe('ProjectStore 基本フロー', () => {
  it('create → 既定セットと自分のprofileが存在する', async () => {
    const fs = new MemoryFS();
    const store = await ProjectStore.create(fs, 'projects/p1', 'テスト現場', USER_A);
    expect(store.manifest.name).toBe('テスト現場');
    expect(visibleEntities(store.state, 'set')).toHaveLength(1);
    expect(visibleEntities(store.state, 'profile')).toHaveLength(1);
  });

  it('dispatch → 自分のログファイルに追記される', async () => {
    const fs = new MemoryFS();
    const store = await ProjectStore.create(fs, 'projects/p1', 'p', USER_A);
    const capId = store.createEntity('caption', { title: '亀裂', body: '', color: '#f00' });
    store.updateEntity('caption', capId, { body: '幅3mm' });
    await store.flush();

    const logFiles = await fs.list('projects/p1/ops/');
    expect(logFiles).toHaveLength(1);
    expect(logFiles[0]).toContain(store.actorId);
    const text = await fs.readText(logFiles[0]!);
    expect(text!.trim().split('\n')).toHaveLength(4); // set + profile + create + update
  });

  it('open → 保存済み状態を完全復元する', async () => {
    const fs = new MemoryFS();
    const store1 = await ProjectStore.create(fs, 'projects/p1', 'p', USER_A);
    const capId = store1.createEntity('caption', { title: 'A', color: '#f00' });
    store1.updateEntity('caption', capId, { title: 'B' });
    await store1.flush();

    const store2 = await ProjectStore.open(fs, 'projects/p1', USER_A);
    expect(store2.state).toEqual(store1.state);
    expect(store2.loadErrors).toHaveLength(0);
  });

  it('再オープン後もseqが継続し、opIdが重複しない', async () => {
    const fs = new MemoryFS();
    const store1 = await ProjectStore.create(fs, 'projects/p1', 'p', USER_A);
    store1.createEntity('caption', { title: 'x' });
    await store1.flush();
    const maxSeq1 = store1.vector[store1.actorId]!;

    const store2 = await ProjectStore.open(fs, 'projects/p1', USER_A);
    const op = store2.dispatch({ t: 'create', e: 'caption', id: 'cap_NEW', v: { title: 'y' } });
    expect(op.op).toBe(maxSeq1 + 1);
  });

  it('subscribe → dispatchごとに通知される', async () => {
    const fs = new MemoryFS();
    const store = await ProjectStore.create(fs, 'projects/p1', 'p', USER_A);
    let calls = 0;
    const unsub = store.subscribe(() => calls++);
    store.createEntity('caption', { title: 'x' });
    store.createEntity('caption', { title: 'y' });
    unsub();
    store.createEntity('caption', { title: 'z' });
    expect(calls).toBe(2);
  });
});

describe('ProjectStore 2者マージ（UC2）', () => {
  it('AとBが別々に編集 → 相互マージで両者の状態が一致する', async () => {
    // Aがプロジェクトを作り、Bへ渡す（= Bは同じopsから開く）
    const fsA = new MemoryFS();
    const storeA = await ProjectStore.create(fsA, 'p', 'shared', USER_A);
    const capShared = storeA.createEntity('caption', { title: '共有ピン', color: '#00f' });
    await storeA.flush();

    const fsB = new MemoryFS();
    for (const f of await fsA.list('p/')) {
      await fsB.writeBytes(f, (await fsA.readBytes(f))!);
    }
    const storeB = await ProjectStore.open(fsB, 'p', USER_B);

    // 双方がオフラインで編集
    storeA.updateEntity('caption', capShared, { title: 'Aの改題' });
    const capA = storeA.createEntity('caption', { title: 'Aの新規' });
    storeB.updateEntity('caption', capShared, { body: 'Bの補足' });
    const capB = storeB.createEntity('caption', { title: 'Bの新規' });
    await storeA.flush();
    await storeB.flush();

    // 相互マージ（ZIP受け渡しの中身と等価）
    const reportForB = storeB.mergeExternal([...storeA.allOps]);
    const reportForA = storeA.mergeExternal([...storeB.allOps]);

    expect(storeA.state).toEqual(storeB.state);
    const captions = visibleEntities(storeA.state, 'caption');
    expect(captions).toHaveLength(3);
    const shared = captions.find((c) => c.id === capShared)!;
    expect(shared.fields.title).toBe('Aの改題'); // 別フィールドは両立
    expect(shared.fields.body).toBe('Bの補足');
    expect(captions.map((c) => c.id)).toContain(capA);
    expect(captions.map((c) => c.id)).toContain(capB);

    expect(reportForB.created.map((r) => r.id)).toContain(capA);
    expect(reportForA.created.map((r) => r.id)).toContain(capB);
  });

  it('マージ後の追記は相手の全opより後のhlcになる', async () => {
    const fsA = new MemoryFS();
    const storeA = await ProjectStore.create(fsA, 'p', 'x', USER_A);
    storeA.createEntity('caption', { title: 'a' });

    const fsB = new MemoryFS();
    const storeB = await ProjectStore.create(fsB, 'q', 'x2', USER_B);
    storeB.mergeExternal([...storeA.allOps]);
    const op = storeB.dispatch({ t: 'create', e: 'caption', id: 'cap_X', v: { title: 'b' } });

    const maxIncoming = [...storeA.allOps].map((o) => o.hlc).sort().pop()!;
    expect(op.hlc > maxIncoming).toBe(true);
  });

  it('他人のopは他人のログファイルへ保存され、自分のログは汚れない', async () => {
    const fsA = new MemoryFS();
    const storeA = await ProjectStore.create(fsA, 'p', 'x', USER_A);
    storeA.createEntity('caption', { title: 'a' });
    await storeA.flush();

    const fsB = new MemoryFS();
    const storeB = await ProjectStore.create(fsB, 'p', 'x', USER_B);
    await storeB.flush();
    const ownLogBefore = await fsB.readText(`p/ops/${storeB.actorId}.jsonl`);

    storeB.mergeExternal([...storeA.allOps]);
    await storeB.flush();

    const ownLogAfter = await fsB.readText(`p/ops/${storeB.actorId}.jsonl`);
    expect(ownLogAfter).toBe(ownLogBefore);
    const files = await fsB.list('p/ops/');
    expect(files).toHaveLength(2);
  });
});
