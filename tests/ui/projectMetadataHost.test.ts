import { describe, expect, it } from 'vitest';
import * as A from '@automerge/automerge'; // Node-only initialization, not browser evidence.
import { MemoryFS } from '../../src/platform/fs';
import { ProjectMutationCoordinator } from '../../src/platform/projectLock';
import { openMetadataHost, metadataArea } from '../../src/harness/projectScene/metadataHost';
import type { MetadataStorageFactory } from '../../src/projectMetadata/repository';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { planCaptionApply, editCaptionDraft } from '../../src/ui/projectScene/captionDetailState';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { planCaptionInclude } from '../../src/ui/projectScene/captionIncludeState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { readProjectScene } from '../../src/scene/projectProvider';
import { metadataFixtureLimits } from '../../src/harness/projectScene/metadataFixture';
import type { MetadataEdit } from '../../src/projectMetadata/commands';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

class FaultFS extends MemoryFS {
  rejectPublication = false; writes = 0;
  override async writeText(path: string, data: string) {
    if (this.rejectPublication && path.endsWith('/published.json')) throw Error('synthetic quota');
    this.writes++; return super.writeText(path, data);
  }
  override async writeBytes(path: string, data: Uint8Array) { this.writes++; return super.writeBytes(path, data); }
}
function fixture() {
  const base = new FaultFS(), coordinator = ProjectMutationCoordinator.local();
  const rows = new Map<string, Uint8Array>(), fault = { save: false, writes: 0 }, createCalls: boolean[] = [];
  const matches = (key: string, prefix: string[]) => prefix.every((p, i) => JSON.parse(key)[i] === p);
  const factory: MetadataStorageFactory = () => ({
    load: async key => rows.get(JSON.stringify(key))?.slice(),
    save: async (key, bytes) => { if (fault.save) throw Error('synthetic quota'); rows.set(JSON.stringify(key), bytes.slice()); fault.writes++; },
    remove: async key => { rows.delete(JSON.stringify(key)); },
    loadRange: async prefix => [...rows].filter(([k]) => matches(k, prefix)).map(([key, data]) => ({ key: JSON.parse(key), data: data.slice() })),
    removeRange: async prefix => { for (const key of rows.keys()) if (matches(key, prefix)) rows.delete(key); },
  });
  const run = 'a'.repeat(32);
  const open = (create = false) => openMetadataHost({ base, coordinator, run, create,
    openStorage: async allow => { createCalls.push(allow); return { factory, dispose: async () => {} }; } });
  return { base, rows, fault, createCalls, open, run };
}
const descendants = (node: RecordedNode): RecordedNode[] => [node, ...node.children.flatMap(descendants)];
const select = (s: SyntheticSession, captionId = f.shared) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId }));
async function acknowledge(s: SyntheticSession, action: () => void) {
  let unsubscribe = () => {};
  try {
    await new Promise<void>(resolve => {
      unsubscribe = s.acknowledgment.subscribe(() => { if (s.acknowledgment.state !== 'checking') resolve(); });
      action(); if (s.acknowledgment.state !== 'checking') resolve();
    });
  } finally { unsubscribe(); }
}
async function apply(s: SyntheticSession, edits: { title?: string; body?: string; color?: string }) {
  for (const [name, text] of Object.entries(edits)) {
    const ctx = s.detailContext();
    const draft = editCaptionDraft(ctx.draft!, ctx.source, name as 'title' | 'body' | 'color', text);
    expect(s.acceptDetail({ kind: 'draft', baseDraft: ctx.draft!, draft })).toBe(true);
  }
  const plan = planCaptionApply(s.detailContext()); if (plan.kind !== 'apply') throw Error(plan.reason);
  await acknowledge(s, () => { s.acceptDetail(plan); });
}

describe('new synthetic saved host (memory ports and recorded DOM, not real browser/iOS acceptance)', { timeout: 15_000 }, () => {
  it('mounts the existing editor, applies title+body as one original change, and cold-reopens without reading model bodies', async () => {
    const h = fixture(), host = await h.open(true);
    expect(host.read().state).toBe('ready'); expect(host.content.counts.bodyBytes).toBeGreaterThan(0);
    const session = new SyntheticSession(host.authority), document = new RecordedDocument();
    const mounted = createDevelopmentWorkspace(document.asDocument(), session);
    expect(select(session)).toBe(true); mounted.render();
    expect(session.captionTextOnly).toBe(true);
    const inputs = descendants(record(mounted.root)).filter(n => n.tag === 'input');
    expect(inputs.find(n => n.value.startsWith('#'))?.readOnly).toBe(false);
    const before = host.read().source!.originalChanges();
    await apply(session, { title: '保存するタイトル', body: '保存する本文' }); mounted.render();
    expect(session.acknowledgment.state).toBe('idle'); expect(session.message).toBe('変更を保存しました。');
    const after = host.read().source!.originalChanges(); expect(after).toHaveLength(before.length + 1);
    for (const bytes of before) expect(after.some(b => A.decodeChange(b).hash === A.decodeChange(bytes).hash && b.every((v, i) => v === bytes[i]))).toBe(true);
    expect(session.acceptNavigation(planNavigation(session.snapshot.state, session.session, session.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true);
    expect(session.snapshot.resources.captions[f.shared]?.body).toEqual({ kind: 'value', value: '保存する本文' });
    mounted.dispose(); await host.dispose();
    const cold = await h.open(); expect(cold.read().state).toBe('ready'); expect(cold.content.counts.bodyBytes).toBe(0);
    expect(cold.authority.read().resources.captions[f.shared]?.title).toEqual({ kind: 'value', value: '保存するタイトル' });
    await cold.authority.write(cold.authority.read().state.token, { [`caption/${f.shared}/body`]: '次の本文' });
    expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('keeps a second opener read-only, rejects pin paths and unsupported writes, then releases the lock for another opener', async () => {
    const h = fixture(), writer = await h.open(true), reader = await h.open();
    expect(reader.authority.readOnly).toBe(true); expect(h.createCalls).toEqual([true, false]);
    const writes = [h.base.writes, h.fault.writes], session = new SyntheticSession(reader.authority);
    select(session); expect(session.detailContext().mutationBlock).toContain('閲覧専用');
    expect(session.pinCreationTargets()).toEqual([]); expect(session.pinShortcutTarget()).toBeNull();
    expect(session.acceptPin(planPinMode(session.pinContext(), { kind: 'add' }))).toBe(false);
    await expect(reader.authority.write(reader.authority.read().state.token, { [`caption/${f.shared}/title`]: '拒否' })).rejects.toThrow();
    await expect(writer.authority.write(writer.authority.read().state.token, { [`caption/${f.shared}/template`]: f.second })).rejects.toThrow();
    expect([h.base.writes, h.fault.writes]).toEqual(writes);
    await writer.dispose(); await reader.dispose();
    await expect(writer.authority.write(writer.authority.read().state.token, { [`caption/${f.shared}/body`]: '閉じた後' })).rejects.toThrow();
    expect([h.base.writes, h.fault.writes]).toEqual(writes);
    const next = await h.open(); expect(next.authority.readOnly).toBe(false); await next.dispose();
  });

  it('retains the same original title+body edit after storage failure and retry, with no success before publication', async () => {
    const h = fixture(), host = await h.open(true), session = new SyntheticSession(host.authority);
    select(session); const before = session.snapshot;
    h.base.rejectPublication = true; await apply(session, { title: '再試行するタイトル', body: '再試行する本文' });
    expect(session.acknowledgment.state).toBe('failed'); expect(session.snapshot).toBe(before);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const retained = await Promise.all(paths.map(async p => [p, await h.base.readBytes(p)] as const));
    h.base.rejectPublication = false; await acknowledge(session, () => { session.retryWorking(); });
    expect(session.acknowledgment.state).toBe('idle');
    expect(session.snapshot.resources.captions[f.shared]?.body).toEqual({ kind: 'value', value: '再試行する本文' });
    for (const [p, bytes] of retained) expect(await h.base.readBytes(p)).toEqual(bytes);
    expect(host.read().source!.originalChanges()).toHaveLength(3); await host.dispose();
  });

  it('cold-recovers an unfinished initialization without create=1 or generating a different seed', async () => {
    const h = fixture(); h.base.rejectPublication = true;
    const first = await h.open(true); expect(first.read().state).toBe('pending'); expect(first.read().provider).toBeNull();
    const seedPath = `${metadataArea}/${h.run}/v2/metadata/seed/0.amchange`, bytes = await h.base.readBytes(seedPath);
    await first.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(); expect(cold.read().state).toBe('pending');
    await cold.authority.retry!(); expect(cold.read().state).toBe('ready');
    expect(await h.base.readBytes(seedPath)).toEqual(bytes); expect(cold.content.counts.bodyBytes).toBe(0);
    await cold.dispose();
  });

  it('saves pin add/move/color and Scene membership through the existing controls, then cold-reopens the same records', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    const mounted = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s);
    const before = host.read().source!.originalChanges().length;
    const target = s.pinCreationTargets().find(t => t.assetId === f.equipment)!;
    expect(s.acceptPinCreation(target, [1, 2, 3])).toBe(true);
    expect(host.read().source!.originalChanges()).toHaveLength(before); // Preview has no saved write.
    const cancelled = s.pinContext();
    expect(s.acceptPin(planPinMode(cancelled, { kind: 'cancel', confirmedMode: cancelled.memory.mode, confirmedProposal: cancelled.proposal }))).toBe(true);
    expect(host.read().source!.originalChanges()).toHaveLength(before);
    expect(s.acceptPinCreation(target, [1, 2, 3])).toBe(true);
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    expect(s.acknowledgment.state).toBe('idle');
    const captionId = s.memory.selectedCaptionId!; expect(captionId).not.toBe(f.shared);
    expect(host.read().source!.originalChanges()).toHaveLength(before + 1);
    expect(s.snapshot.captionOwners[captionId]).toEqual({ assetId: f.equipment, assetFrameId: target.assetFrameId });
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.pinPreviewAnchor).toMatchObject({ positionAsset: [1, 2, 3] });
    expect(s.acceptPinSurface(s.pinSurfaceTarget()!, [4, 5, 6], true)).toBe(true);
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    await apply(s, { title: '追加したピン', color: '#57758b' });
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true);
    expect(s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId }))).toBe(true);
    await acknowledge(s, () => { s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); });
    expect(select(s, captionId)).toBe(true);
    const includedEdge = Object.values(s.snapshot.state.captionMemberships).find(e => e.sceneId === f.detail && e.resourceId === captionId)!;
    mounted.render();
    const remove = descendants(record(mounted.root)).find(n => n.tag === 'button' && n.textContent === 'このシーンから外す')!;
    expect(remove).toBeDefined(); expect(remove.disabled).toBe(false);
    await acknowledge(s, () => { remove.fire('click'); });
    expect(s.snapshot.state.captionMemberships[includedEdge.id]?.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(s.snapshot.resources.captions[captionId]).toBeDefined(); expect(s.memory.selectedCaptionId).toBeNull();
    expect(Object.values(s.snapshot.state.captionMemberships).some(e => e.sceneId === f.overview && e.resourceId === captionId &&
      e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active')).toBe(true);
    await acknowledge(s, () => { s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); });
    expect(select(s, captionId)).toBe(true);
    await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.equipment, included: false })); });
    expect(s.composition.assets).toHaveLength(0); expect(s.snapshot.resources.assets[f.equipment]).toBeDefined();
    expect(s.snapshot.resources.captions[captionId]).toBeDefined();
    await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.equipment, included: true })); });
    expect(s.composition.assets).toHaveLength(1); expect(s.beginModelPlacement()).toBe(false);
    mounted.render(); mounted.dispose(); await host.dispose();
    const cold = await h.open(); const reopened = cold.authority.read();
    expect(reopened.resources.captions[captionId]?.anchor).toMatchObject({ value: { assetId: f.equipment, positionAsset: [4, 5, 6] } });
    expect(reopened.colors[captionId]).toEqual({ kind: 'value', value: '#57758b' });
    expect(Object.values(reopened.state.captionMemberships).filter(e => e.resourceId === captionId &&
      e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active')).toHaveLength(2);
    expect(reopened.state.captionMemberships[includedEdge.id]?.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(cold.content.counts.bodyBytes).toBe(0);
    expect(cold.read().source!.originalChanges()).toHaveLength(before + 8); await cold.dispose();
  });

  it('retries a failed pin creation with the same ID and original bytes, not a second Caption', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [2, 3, 4])).toBe(true);
    h.base.rejectPublication = true;
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    expect(s.acknowledgment.state).toBe('failed'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(2);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(3);
    const id = s.memory.selectedCaptionId; expect(id).toBeTruthy();
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(originals);
    await host.authority.retry!(); expect(Object.keys(host.authority.read().resources.captions)).toHaveLength(3);
    await host.dispose(); const cold = await h.open(); expect(cold.authority.read().resources.captions[id!]).toBeDefined(); await cold.dispose();
  });

  it('refuses stale/hidden/rebound/conflicting pins and duplicate IDs without selecting a winner', async () => {
    const h = fixture(), host = await h.open(true), source = host.read().source!, provider = host.read().provider!;
    const s = new SyntheticSession(host.authority); select(s);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    const anchor = s.pinPreviewAnchor!, tx = 'd'.repeat(32);
    const command: MetadataEdit = { kind: 'movePin', sceneId: f.overview, captionId: f.shared, anchor };
    expect(() => source.prepareEdit('stale', command, provider, tx)).toThrow(/stale/);
    expect(() => source.prepareEdit(source.token, { ...command, anchor: { ...anchor, assetId: f.structure } } as MetadataEdit, provider, tx)).toThrow(/owner/);
    expect(() => source.prepareEdit(source.token, { ...command, anchor: { ...anchor, authoredAnchorCompatibilityId: `cmp_${'f'.repeat(32)}` } } as MetadataEdit, provider, tx)).toThrow(/model-changed/);
    expect(() => source.prepareEdit(source.token, { kind: 'addPin', sceneId: f.overview, captionId: f.shared,
      membershipId: `scm_${'f'.repeat(32)}`, eventId: `evt_${'f'.repeat(32)}`, anchor }, provider, tx)).toThrow(/duplicate|exists/);
    if (provider.kind !== 'scene-provider') throw Error('fixture provider unavailable');
    const modelEdge = Object.values(provider.state.assetMemberships).find(e => e.sceneId === f.overview && e.resourceId === f.equipment)!;
    const hidden = source.prepareEdit(source.token, { kind: 'exclude', resourceKind: 'asset', membershipId: modelEdge.id,
      eventId: `evt_${'d'.repeat(32)}` }, provider, tx);
    const hiddenView = await readProjectScene(hidden.read(), metadataFixtureLimits, host.content.verifier(false));
    expect(() => hidden.prepareEdit(hidden.token, command, hiddenView, 'c'.repeat(32))).toThrow(/model-changed/);
    const first = source.prepareEdit(source.token, { ...command, anchor: { ...anchor, positionAsset: [1, 2, 3] } } as MetadataEdit, provider, tx);
    const second = source.prepareEdit(source.token, { ...command, anchor: { ...anchor, positionAsset: [4, 5, 6] } } as MetadataEdit, provider, 'e'.repeat(32));
    const conflict = first.appendOriginal(second.originalChanges());
    const conflictView = await readProjectScene(conflict.read(), metadataFixtureLimits, host.content.verifier(false));
    expect(() => conflict.prepareEdit(conflict.token, command, conflictView, tx)).toThrow(/unresolved/);
    expect(host.read().source!.token).toBe(source.token); await host.dispose();
  });
});
