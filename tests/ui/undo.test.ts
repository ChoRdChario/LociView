import { describe, expect, it } from 'vitest';
import { isVisible, visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';
import { UndoManager } from '../../src/ui/undo';

const USER: Identity = { userId: 'usr_U', deviceId: 'dev_D', displayName: 'u' };

async function setup(): Promise<{ store: ProjectStore; undo: UndoManager }> {
  const store = await ProjectStore.create(new MemoryFS(), 'p', 't', USER);
  return { store, undo: new UndoManager(store) };
}

describe('UndoManager', () => {
  it('create → undo で消え、redo で同じIDのまま復活する', async () => {
    const { store, undo } = await setup();
    const id = undo.create('caption', { title: 'A', color: '#f00' });
    expect(isVisible(store.state.byKind.caption![id]!)).toBe(true);

    undo.undo();
    expect(isVisible(store.state.byKind.caption![id]!)).toBe(false);

    undo.redo();
    expect(isVisible(store.state.byKind.caption![id]!)).toBe(true);
    expect(store.state.byKind.caption![id]!.fields.title).toBe('A');
  });

  it('update → undo で前の値へ戻る（op追記として）', async () => {
    const { store, undo } = await setup();
    const id = undo.create('caption', { title: 'v1' });
    undo.update('caption', id, { title: 'v2' });
    expect(store.state.byKind.caption![id]!.fields.title).toBe('v2');

    const opsBefore = store.allOps.length;
    undo.undo();
    expect(store.state.byKind.caption![id]!.fields.title).toBe('v1');
    expect(store.allOps.length).toBe(opsBefore + 1); // 履歴は消えず追記される
  });

  it('delete → undo で全フィールドが復元される（update-wins復活）', async () => {
    const { store, undo } = await setup();
    const id = undo.create('caption', { title: 'keep', body: 'B', color: '#0f0' });
    undo.delete('caption', id);
    expect(isVisible(store.state.byKind.caption![id]!)).toBe(false);

    undo.undo();
    const rec = store.state.byKind.caption![id]!;
    expect(isVisible(rec)).toBe(true);
    expect(rec.fields.title).toBe('keep');
    expect(rec.fields.body).toBe('B');
  });

  it('transaction は1回のundoでまとめて戻る', async () => {
    const { store, undo } = await setup();
    undo.transaction((tx) => {
      tx.create('caption', { title: 'a' });
      tx.create('caption', { title: 'b' });
    });
    const count = (): number => visibleEntities(store.state, 'caption').length;
    expect(count()).toBe(2);
    undo.undo();
    expect(count()).toBe(0);
    undo.redo();
    expect(count()).toBe(2);
  });

  it('新しい編集でredoスタックはクリアされる', async () => {
    const { undo } = await setup();
    const id = undo.create('caption', { title: 'x' });
    undo.undo();
    expect(undo.canRedo).toBe(true);
    undo.update('caption', id, { title: 'y' });
    expect(undo.canRedo).toBe(false);
  });
});
