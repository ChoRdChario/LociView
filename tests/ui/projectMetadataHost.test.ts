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
import { metadataFixtureLimits, metadataProjectView } from '../../src/harness/projectScene/metadataFixture';
import type { MetadataEdit } from '../../src/projectMetadata/commands';
import { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { planViewAuthor } from '../../src/ui/projectScene/viewAuthoringState';
import { planView } from '../../src/ui/projectScene/viewState';
import { SyntheticViewSession, type DisplayCapture } from '../../src/harness/projectScene/viewSession';
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
const button = (r: RecordedNode, text: string) => descendants(r).find(n => n.tag === 'button' && n.textContent === text)!;
const picker = (r: RecordedNode, label: string) => descendants(r).find(n => n.tag === 'select' && n.attributes.get('aria-label') === label)!;
const area = (r: RecordedNode, label: string) => descendants(r).find(n => n.tag === 'section' && n.attributes.get('aria-label') === label)!;
const displayCapture = (): DisplayCapture => ({ camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0],
  projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.1234567, 0.42, 0.8] } });
function viewHost(s: SyntheticSession) {
  let capture = displayCapture(), cameraToken = 0; const recalls: DisplayCapture[] = [];
  const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { viewportFactory: () => ({
    update() {}, setActive() {}, read: () => ({ token: String(cameraToken), ready: true, issue: null, dragging: false,
      projection: 'perspective', axis: null, pins: [] }), capture: () => capture,
    recall: p => { recalls.push(p); }, camera() {}, retry() {}, dispose() {},
  }) });
  const r = record(w.root); button(r, '視点').fire('click'); const author = area(r, '視点の作成と管理');
  const name = descendants(author).find(n => n.tag === 'input')!;
  return { w, r, author, recalls, picker: picker(r, '保存した視点'),
    capture(next: DisplayCapture) { capture = next; cameraToken++; w.render(); },
    name(text: string) { name.value = text; name.fire('input'); },
    async add(text: string) { button(author, '視点を作る').fire('click'); this.name(text);
      await acknowledge(s, () => button(author, '視点を追加').fire('click')); w.render(); return this.picker.value; },
  };
}
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

  it('connects saved View create/recapture/rename/order/entry/confirmed-delete and cold recall through the mounted controls', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = viewHost(s);
    const initialChanges = host.read().source!.originalChanges().length;
    const first = await ui.add('最初の視点'); expect(first).toMatch(/^view_/);
    expect(s.acknowledgment.state).toBe('idle'); expect(host.read().source!.originalChanges()).toHaveLength(initialChanges + 1);
    expect(s.snapshot.viewData!.records[first]!.background).toEqual({ kind: 'value', value: displayCapture().background });
    expect(ui.recalls).toHaveLength(0); button(area(ui.r, '保存した視点'), '表示').fire('click');
    expect(ui.recalls).toEqual([displayCapture()]);
    const next = { ...displayCapture(), camera: { ...displayCapture().camera, position: [3, 4, 9] as const } };
    ui.capture(next); button(ui.author, '編集').fire('click'); ui.name('入口');
    button(ui.author, '現在の表示を使用').fire('click');
    await acknowledge(s, () => button(ui.author, '変更を適用').fire('click')); ui.w.render();
    expect(s.snapshot.viewData!.records[first]!.camera).toEqual({ kind: 'value', value: next.camera });
    const second = await ui.add('別の視点');
    await acknowledge(s, () => button(ui.author, '前へ').fire('click')); ui.w.render();
    const rows = s.snapshot.viewData!.records;
    expect(rows[second]!.orderKey.kind === 'value' && rows[first]!.orderKey.kind === 'value' &&
      rows[second]!.orderKey.value < rows[first]!.orderKey.value).toBe(true);
    ui.picker.value = first; ui.picker.fire('change');
    const entry = area(ui.r, '開始時の設定'), choice = picker(entry, 'シーンを開いたときの視点');
    const oldVersion = s.snapshot.viewData!.versions[`scene/${f.overview}/entry`];
    choice.value = first; choice.fire('change');
    await acknowledge(s, () => button(entry, '設定を適用').fire('click')); ui.w.render();
    expect(ui.recalls).toHaveLength(1); expect(button(ui.author, '削除').disabled).toBe(true);
    choice.value = ''; choice.fire('change');
    await acknowledge(s, () => button(entry, '設定を適用').fire('click')); ui.w.render();
    expect(s.snapshot.state.scenes[f.overview]!.defaultViewId).toEqual({ kind: 'value', value: null });
    expect(s.snapshot.viewData!.versions[`scene/${f.overview}/entry`]).not.toBe(oldVersion);
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    expect(p.details.mutable.scenesById[f.overview]!.defaultViewId).toEqual({ kind: 'value', value: undefined });
    button(ui.author, '削除').fire('click');
    expect(s.snapshot.viewData!.records[first]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    await acknowledge(s, () => button(ui.author, '削除する').fire('click')); ui.w.render();
    expect(s.snapshot.viewData!.records[first]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    const reader = await h.open(), readSession = new SyntheticSession(reader.authority), readUI = viewHost(readSession);
    expect(readUI.author.hidden).toBe(true);
    readUI.picker.value = second; readUI.picker.fire('change'); button(area(readUI.r, '保存した視点'), '表示').fire('click');
    expect(readUI.recalls).toHaveLength(1); expect(picker(area(readUI.r, '開始時の設定'), 'シーンを開いたときの視点').disabled).toBe(true);
    readUI.w.dispose(); await reader.dispose(); ui.w.dispose(); await host.dispose();
    const cold = await h.open(), coldSession = new SyntheticSession(cold.authority), coldUI = viewHost(coldSession);
    expect(cold.content.counts.bodyBytes).toBe(0); expect(cold.authority.read().viewData!.records[first]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    coldUI.picker.value = second; coldUI.picker.fire('change'); button(area(coldUI.r, '保存した視点'), '表示').fire('click');
    expect(coldUI.recalls).toEqual([next]);
    expect(cold.read().source!.originalChanges()).toHaveLength(initialChanges + 7);
    coldUI.w.dispose(); await cold.dispose();
  });

  it('retains a failed View capture and original ID/bytes until exact retry confirms the same draft', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = viewHost(s);
    h.base.rejectPublication = true; await ui.add('復旧する視点');
    expect(s.acknowledgment.state).toBe('failed'); expect(Object.keys(s.snapshot.viewData!.records)).toHaveLength(0);
    expect(s.views.pending).toBe('text');
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    ui.capture({ ...displayCapture(), background: { kind: 'solid', colorSrgb: [1, 1, 1] } });
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); }); ui.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.views.pending).toBeNull();
    const id = ui.picker.value; expect(s.snapshot.viewData!.records[id]!.background).toEqual({ kind: 'value', value: displayCapture().background });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    await host.authority.retry!(); expect(Object.keys(host.authority.read().viewData!.records)).toEqual([id]);
    ui.w.dispose(); await host.dispose(); const cold = await h.open();
    expect(cold.authority.read().viewData!.records[id]).toBeDefined(); await cold.dispose();
  });

  it('uses original per-field versions for recapture and refuses stale, conflicting, cross-Scene and referenced View writes', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!, provider = host.read().provider!, tx = 'b'.repeat(32);
    const id = `view_${'a'.repeat(32)}`, camera = { ...displayCapture().camera }, background = { ...displayCapture().background };
    const created = seed.prepareEdit(seed.token, { kind: 'createView', viewId: id, sceneId: f.overview,
      projectFrameId: host.authority.read().resources.projectFrameId, name: '視点', orderKey: 'A', camera, background, eventId: `evt_${tx}` }, provider, tx);
    const read = (source: ProjectMetadataSource) => readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    const original = await read(created); let current = metadataProjectView(original);
    const view = new SyntheticViewSession(() => current, () => f.overview, () => false);
    const runtime = { kind: 'ready' as const, token: 'camera', sceneId: f.overview, projectFrameId: current.resources.projectFrameId,
      projection: 'perspective' as const, axis: null, bounds: { kind: 'value' as const, value: 'available' as const } };
    const context = () => view.context(runtime, null), author = () => view.authorContext(context(), displayCapture);
    expect(view.accept(planView(context(), { kind: 'select', viewId: id }), context(), () => {})).toBe(true);
    expect(view.acceptAuthor(planViewAuthor(author(), { kind: 'edit' }), author())).toBe(true);
    expect(view.acceptAuthor(planViewAuthor(author(), { kind: 'capture' }), author())).toBe(true);
    const key = `view/${id}/camera`, version = current.viewData!.versions[key];
    const unrelated = created.prepareEdit(created.token, { kind: 'editCaption', captionId: f.shared, edits: { title: '別の編集' } }, original, tx);
    current = metadataProjectView(await read(unrelated)); expect(current.viewData!.versions[key]).toBe(version);
    expect(planViewAuthor(author(), { kind: 'apply' }).kind).toBe('apply');
    const edit = { kind: 'editView' as const, sceneId: f.overview, viewId: id, edits: { camera, background } };
    expect(() => created.prepareEdit('stale', edit, original, tx)).toThrow(/stale/);
    expect(() => created.prepareEdit(created.token, { ...edit, sceneId: f.detail }, original, tx)).toThrow(/scope/);
    const referenced = created.prepareEdit(created.token, { kind: 'setEntryView', sceneId: f.overview, viewId: id }, original, tx);
    const referencedProvider = await read(referenced);
    expect(() => referenced.prepareEdit(referenced.token, { kind: 'deleteView', sceneId: f.overview, viewId: id, eventId: `evt_${tx}` }, referencedProvider, tx)).toThrow(/referenced/);
    const [raw] = A.applyChanges(A.init<any>(), created.originalChanges());
    const same = A.change(A.clone(raw), d => { const old = d.viewsById[id].camera; delete d.viewsById[id].camera; d.viewsById[id].camera = old; });
    const explicitSame = ProjectMetadataSource.reopen(A.getAllChanges(same), created.proof, metadataFixtureLimits);
    current = metadataProjectView(await read(explicitSame)); expect(current.viewData!.records[id]!.camera).toEqual({ kind: 'value', value: camera });
    expect(current.viewData!.versions[key]).not.toBe(version); expect(planViewAuthor(author(), { kind: 'apply' }).kind).toBe('blocked');
    const alternate = created.prepareEdit(created.token, { ...edit, edits: { camera: { ...camera, position: [3, 4, 9] }, background } }, original, tx);
    const back = alternate.prepareEdit(alternate.token, edit, await read(alternate), tx);
    current = metadataProjectView(await read(back)); expect(current.viewData!.versions[key]).not.toBe(version);
    expect(planViewAuthor(author(), { kind: 'apply' }).kind).toBe('blocked');
    const conflict = explicitSame.appendOriginal(alternate.originalChanges()), conflictProvider = await read(conflict);
    current = metadataProjectView(conflictProvider); expect(current.viewData!.records[id]!.camera.kind).toBe('unresolved');
    expect(current.viewData!.cells[key]).toBeUndefined();
    expect(() => conflict.prepareEdit(conflict.token, edit, conflictProvider, tx)).toThrow(/unresolved/);
    expect(host.read().source!.token).toBe(seed.token); await host.dispose();
  });
});
