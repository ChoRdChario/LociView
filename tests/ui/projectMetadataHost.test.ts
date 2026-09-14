import { describe, expect, it, vi } from 'vitest';
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
import { metadataFixtureLimits, metadataProjectView, createMetadataFixture, metadataPreparedModels } from '../../src/harness/projectScene/metadataFixture';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { writeMetadataSeed } from '../../src/harness/projectScene/metadataStorage';
import { underWriteLease } from '../../src/projectMetadata/persistence';
import { summarizeFullHistory } from '../../src/projectPackage/historySummary';
import type { MetadataEdit } from '../../src/projectMetadata/commands';
import { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { planViewAuthor } from '../../src/ui/projectScene/viewAuthoringState';
import { planView } from '../../src/ui/projectScene/viewState';
import { SyntheticViewSession, type DisplayCapture } from '../../src/harness/projectScene/viewSession';
import { materialBucket, materialKey, materialTarget, type MaterialRouting } from '../../src/harness/projectScene/materialHistory';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { degreesRotation, rotationDegrees } from '../../src/harness/projectScene/modelTransform';
import { canonicalFixture, fixtureRecordDigest, moveFixtureModel, createFixtureModel, fixtureModelIds, allocateModelCopyIds, readFixtureModel } from '../../src/harness/projectScene/modelClosure';
import { assetCopySource } from '../../src/projectMetadata/modelMembership';
import { assetMembershipGroups, type AssetMembershipResolution } from '../../src/projectMetadata/membership';
import { readMetadataModel } from '../../src/harness/projectScene/metadataModelRecords';
import { metadataProviderReady } from '../../src/projectMetadata/session';
import { metadataImmutableReader } from '../../src/projectMetadata/records';
import { assetStatusCandidates } from '../../src/projectMetadata/assetStatus';
import { captionFieldCandidates } from '../../src/projectMetadata/captionCandidates';
import { materialResolutionContext } from '../../src/projectMetadata/materialResolution';
import { modelClosureKey } from '../../src/harness/projectScene/modelHistory';
import type { JsonObject } from '../../src/domain/values';
import { metadataModels } from '../../src/harness/projectScene/metadataFixture';
import { fixtureMedia, captionAttachments } from '../../src/harness/projectScene/mediaHistory';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
import { createMetadataReceiveControls } from '../../src/harness/projectScene/metadataReceiveControls';
import type { SyntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { captionDeletionImpact, captionLifecycleRecovery, type CaptionLifecycleResolution } from '../../src/projectMetadata/captionDeletion';
import type { CaptionDeletionCommand } from '../../src/scene/commands';
import { assetDeletionImpact } from '../../src/projectMetadata/assetDeletion';
import { modelListView } from '../../src/ui/projectScene/modelListState';
import { defaultSceneCandidates } from '../../src/projectMetadata/startupScene';
import { createMetadataWorkspace } from '../../src/harness/projectScene/metadataWorkspace';
import { sceneNameCandidates } from '../../src/projectMetadata/sceneAuthoring';
import { viewFieldCandidates, entryViewCandidates, type ViewChoiceField } from '../../src/projectMetadata/viewResolution';

class FaultFS extends MemoryFS {
  rejectPublication = false; rejectImage = false; writes = 0;
  rejectEvidenceAfter: number | null = null;
  override async writeText(path: string, data: string) {
    if (this.rejectPublication && path.endsWith('/published.json')) throw Error('synthetic quota');
    if (path.includes('/evidence/') && this.rejectEvidenceAfter !== null && this.rejectEvidenceAfter-- === 0) throw Error('synthetic evidence quota');
    this.writes++; return super.writeText(path, data);
  }
  override async writeBytes(path: string, data: Uint8Array) {
    if (this.rejectImage && fixtureMedia.some(m => path.endsWith(`${m.record.blob.digest}.bin`))) throw Error('synthetic image quota');
    this.writes++; return super.writeBytes(path, data);
  }
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
const named = (r: RecordedNode, label: string) => descendants(r).find(n => n.attributes.get('aria-label') === label)!;
const setInput = (n: RecordedNode, text: string) => { n.value = text; n.fire(n.tag === 'select' ? 'change' : 'input'); };
function materialHost(s: SyntheticSession, assetId: string = f.equipment) {
  const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), r = record(w.root);
  button(r, 'マテリアル').fire('click'); const panel = named(r, 'マテリアル');
  setInput(named(panel, 'モデル'), assetId); const surface = named(panel, '面'); setInput(surface, surface.children[1]!.value);
  return { w, panel, scope: (v: string) => setInput(named(panel, '適用範囲'), v),
    begin: () => button(panel, '設定を編集').fire('click'), edit: (label: string, text: string) => setInput(named(panel, label), text),
    async apply() { await acknowledge(s, () => button(panel, '変更を適用').fire('click')); w.render(); },
    async reset() { button(panel, 'この範囲の設定を解除').fire('click');
      await acknowledge(s, () => button(panel, '設定を解除する').fire('click')); w.render(); },
  };
}
const displayCapture = (): DisplayCapture => ({ camera: { position: [1, 2, 8], target: [0, 0, 0], up: [0, 1, 0],
  projection: { kind: 'perspective', verticalFovRadians: 0.7 } }, background: { kind: 'solid', colorSrgb: [0.1234567, 0.42, 0.8] } });
function viewHost(s: SyntheticSession) {
  let capture = displayCapture(), cameraToken = 0; const recalls: DisplayCapture[] = [];
  const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { viewportFactory: () => ({
    update() {}, setActive() {}, read: () => ({ token: String(cameraToken), ready: true, issue: null, dragging: false,
      projection: 'perspective', axis: null, pins: [] }), capture: () => capture,
    recall: p => { recalls.push(p); }, setBackground: (background, verify) => { capture = { ...capture, background }; verify?.(); cameraToken++; }, camera() {}, retry() {}, dispose() {},
  }) });
  const r = record(w.root); button(r, '視点').fire('click'); const author = area(r, '視点の作成と管理');
  const name = descendants(author).find(n => n.tag === 'input')!;
  return { w, r, author, recalls, picker: picker(r, '保存した視点'),
    capture(next: DisplayCapture) { capture = next; cameraToken++; w.render(); },
    background(hex: string) { const panel = area(r, '3D背景'), input = named(panel, '背景色'); input.value = hex; input.fire('input'); button(panel, '背景に適用').fire('click'); },
    name(text: string) { name.value = text; name.fire('input'); },
    async add(text: string) { button(author, '視点を作る').fire('click'); this.name(text);
      await acknowledge(s, () => button(author, '視点を追加').fire('click')); w.render(); return this.picker.value; },
  };
}
const select = (s: SyntheticSession, captionId = f.shared) => s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId }));
const selectModel = (s: SyntheticSession) => s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }));
async function acknowledge(s: SyntheticSession, action: () => void) {
  let unsubscribe = () => {};
  try {
    await new Promise<void>(resolve => {
      unsubscribe = s.acknowledgment.subscribe(() => { if (s.acknowledgment.state !== 'checking') resolve(); });
      action(); if (s.acknowledgment.state !== 'checking') resolve();
    });
  } finally { unsubscribe(); }
}

const fullSource = (source: ProjectMetadataSource, n: number) => ({ packageId: `pkg_${n.toString(16).padStart(32, '0')}`,
  metadataBytes: source.encodeFullSource(), proof: source.proof, remoteHeads: source.heads });

describe('Saved View conflict resolution; saved memory ports and recorded DOM only', () => {
  const id = `view_${'a'.repeat(32)}`, otherId = `view_${'b'.repeat(32)}`, tx = 'c'.repeat(32);
  const jsonCapture = () => ({ camera: { ...displayCapture().camera }, background: { ...displayCapture().background } });
  const labels = { name: '名前', orderKey: '並び順', camera: 'カメラ', background: '背景', defaultViewId: '開始視点' };
  type TestedField = keyof typeof labels;
  const raw = (source: ProjectMetadataSource, change: (doc: any) => void) => {
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    return source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), change)));
  };
  const branch = (source: ProjectMetadataSource, field: TestedField, value: unknown) => raw(source, d => {
    const record = field === 'defaultViewId' ? d.scenesById[f.overview] : d.viewsById[id];
    delete record[field];
    record[field] = new A.ImmutableString(canonicalFixture(value === undefined ? id : value));
    if (value === undefined) delete record[field]; // Explicit absence even when it was already absent.
  });
  const setup = async (field: TestedField, first: unknown, second: unknown) => {
    const h = fixture(), host = await h.open(true);
    const read = (source: ProjectMetadataSource) => readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    let seed = host.read().source!;
    for (const [viewId, name, orderKey] of [[id, '入口', 'B'], [otherId, '奥', 'M']]) {
      seed = seed.prepareEdit(seed.token, { kind: 'createView', viewId: viewId!, name: name!, orderKey: orderKey!,
        sceneId: f.overview, projectFrameId: host.authority.read().resources.projectFrameId,
        ...jsonCapture(), eventId: `evt_${tx}` }, await read(seed), tx);
    }
    const one = branch(seed, field, first), two = branch(seed, field, second);
    await host.receive(host.read().source!.token, fullSource(one, 1500));
    await host.receive(host.read().source!.token, fullSource(two, 1501));
    const recalls: DisplayCapture[] = [], background = vi.fn();
    const mount = createMetadataWorkspace(new RecordedDocument().asDocument(), host, () => ({
      update() {}, setActive() {}, read: () => ({ token: 'camera', ready: true, issue: null, dragging: false,
        projection: 'perspective', axis: null, pins: [] }), capture: displayCapture,
      recall: value => { recalls.push(value); }, setBackground: background, camera() {}, retry() {}, dispose() {},
    }));
    const root = record(mount.root), s = mount.session!;
    const choice = (name: TestedField = field) => descendants(root).find(n => n.tag === 'select' &&
      n.attributes.get('aria-label')?.endsWith(`：${labels[name]}の解消方法`))!;
    const form = (name: TestedField = field) => descendants(root).find(n => n.tag === 'li' && descendants(n).includes(choice(name)))!;
    const choices = (name: TestedField = field) => {
      const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
      return name === 'defaultViewId' ? entryViewCandidates(p, f.overview, metadataFixtureLimits).candidates :
        viewFieldCandidates(p, id, name, metadataFixtureLimits).candidates;
    };
    const command = (operationId: string, name: TestedField = field): Extract<MetadataEdit, { kind: 'resolveEntryView' | 'resolveViewField' }> => name === 'defaultViewId' ?
      { kind: 'resolveEntryView', sceneId: f.overview, operationId } :
      { kind: 'resolveViewField', sceneId: f.overview, viewId: id, field: name, choice: { kind: 'candidate', operationId } };
    return { h, host, read, seed, one, two, mount, root, s, recalls, background, choice, form, choices, command };
  };

  const fields: [ViewChoiceField, unknown, unknown][] = [
    ['name', '入口の確認', '設備の確認'], ['orderKey', 'A', 'Z'],
    ['camera', displayCapture().camera, { ...displayCapture().camera, position: [3, 2, 8], projection: { kind: 'orthographic', verticalSpan: 12.34567 } }],
    ['background', displayCapture().background, { kind: 'solid', colorSrgb: [0.7654321, 0.4, 0.2] }],
  ];
  it.each(fields)('resolves complete %s atoms, returns editable history and replays without warm recall', async (field, first, second) => {
    const u = await setup(field, first, second), { h, host, mount, s } = u, before = host.read().source!;
    select(s); const detail = s.detailContext();
    s.acceptDetail({ kind: 'draft', baseDraft: detail.draft!, draft: editCaptionDraft(detail.draft!, detail.source, 'body', '手元の入力を保持') });
    const memory = s.memory, windows = s.windowMemory;
    expect(u.choice().value).toBe(''); expect(button(u.form(), '競合を解消').disabled).toBe(true);
    const copy = descendants(u.form()).map(n => n.textContent).join(' ');
    if (field === 'orderKey') { expect(copy).toContain('奥」の後'); expect(copy).toContain('奥」の前'); }
    if (field === 'camera') { expect(copy).toContain('縦幅 12.34567'); expect(copy).toContain('上方向 0 / 1 / 0'); }
    if (field === 'background') expect(copy).toContain('0.7654321 / 0.4 / 0.2');
    const selected = u.choices().find(c => c.value.kind === 'value' && canonicalFixture(c.value.value) === canonicalFixture(second))!;
    setInput(u.choice(), selected.operationId);
    expect(host.read().source!.token).toBe(before.token); expect(u.recalls).toHaveLength(0);
    await acknowledge(s, () => button(u.form(), '競合を解消').fire('click')); mount.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.snapshot.viewData!.records[id]![field]).toEqual({ kind: 'value', value: second });
    expect(u.recalls).toHaveLength(0); expect(u.background).not.toHaveBeenCalled();
    expect(s.sceneId).toBe(f.overview); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(s.detailContext().draft!.edits.body).toBe('手元の入力を保持');
    const saved = host.read().source!;
    expect(saved.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    for (const bytes of before.originalChanges()) expect(saved.originalChanges().some(b => Buffer.from(b).equals(Buffer.from(bytes)))).toBe(true);
    // The participant can use ordinary edit (including recapture of camera+background) again.
    const participant = u.one.appendOriginal(saved.originalChanges()), edits = field === 'name' ? { name: '二巡目の視点' } :
      field === 'orderKey' ? { orderKey: 'C' } : jsonCapture();
    const returned = participant.prepareEdit(participant.token, { kind: 'editView', sceneId: f.overview, viewId: id, edits }, await u.read(participant), tx);
    await host.receive(saved.token, fullSource(returned, 1502)); s.refreshHistory(); mount.render();
    const heads = host.read().source!.heads, writes = h.base.writes;
    await host.receive(host.read().source!.token, fullSource(returned, 1502)); expect(h.base.writes).toBe(writes);
    expect(u.recalls).toHaveLength(0); expect(u.background).not.toHaveBeenCalled();
    await mount.dispose(); const cold = await h.open(); expect(cold.read().source!.heads).toEqual(heads);
    const cs = new SyntheticSession(cold.authority), ui = viewHost(cs);
    setInput(ui.picker, id); button(area(ui.r, '保存した視点'), '表示').fire('click'); expect(ui.recalls).toEqual([displayCapture()]);
    button(ui.author, '編集').fire('click'); ui.name('通常編集が可能');
    if (field === 'camera' || field === 'background') {
      ui.capture({ ...displayCapture(), camera: { ...displayCapture().camera, position: [4, 5, 9] } });
      button(ui.author, '現在の表示を使用').fire('click');
    }
    await acknowledge(cs, () => button(ui.author, '変更を適用').fire('click')); ui.w.render();
    expect(cs.acknowledgment.state).toBe('idle'); expect(cs.snapshot.viewData!.records[id]!.name).toEqual({ kind: 'value', value: '通常編集が可能' });
    if (field === 'camera' || field === 'background') expect(cs.snapshot.viewData!.records[id]!.camera).toMatchObject({ value: { position: [4, 5, 9] } });
    if (field === 'orderKey') {
      await acknowledge(cs, () => button(ui.author, '後へ').fire('click')); ui.w.render();
      const order = cs.snapshot.viewData!.records[id]!.orderKey; expect(order.kind === 'value' && order.value > 'M').toBe(true);
    }
    const late = branch(u.seed, field, first);
    await cold.receive(cold.read().source!.token, fullSource(late, 1505)); cs.refreshHistory(); ui.w.render();
    expect(cs.snapshot.viewData!.records[id]![field].kind).toBe('unresolved'); expect(ui.recalls).toHaveLength(1);
    ui.w.dispose(); await cold.dispose();
  }, 15000); // Same bounded budget as existing saved-host roundtrips; no operation deadline or global timeout change.

  it.each(['equal', 'manual'] as const)('resolves %s names in one causal change and leaves other field candidates untouched', async mode => {
    const u = await setup('name', '同じ名前', '同じ名前'), beforeExtra = u.host.read().source!;
    const a = branch(beforeExtra, 'camera', displayCapture().camera), b = branch(beforeExtra, 'camera', { ...displayCapture().camera, position: [9, 2, 8] });
    await u.host.receive(beforeExtra.token, fullSource(a.appendOriginal(b.originalChanges()), 1503)); u.s.refreshHistory(); u.mount.render();
    const before = u.host.read().source!, cameraChoices = u.choices('camera');
    setInput(u.choice(), mode === 'equal' ? u.choices()[0]!.operationId : 'manual');
    if (mode === 'manual') setInput(descendants(u.form()).find(n => n.tag === 'textarea')!, '  Cafe\u0301  ');
    await acknowledge(u.s, () => button(u.form(), '競合を解消').fire('click')); u.mount.render();
    expect(u.s.snapshot.viewData!.records[id]!.name).toEqual({ kind: 'value', value: mode === 'equal' ? '同じ名前' : '  Café  ' });
    expect(u.host.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(u.choices('camera')).toEqual(cameraChoices); expect(u.s.snapshot.viewData!.records[id]!.camera.kind).toBe('unresolved');
    expect(u.recalls).toHaveLength(0); await u.mount.dispose();
  });

  it.each(['distinct', 'absent', 'bothAbsent', 'equal'] as const)('resolves %s entry candidates without storing null or recalling on warm receive', async mode => {
    const first = mode === 'bothAbsent' ? undefined : id, second = mode === 'distinct' ? otherId : mode === 'equal' ? id : undefined;
    const u = await setup('defaultViewId', first, second), before = u.host.read().source!;
    const selected = u.choices().find(c => second === undefined ? c.value.kind === 'absent' : c.value.kind === 'value' && c.value.value === second)!;
    const copy = descendants(u.form()).map(n => n.textContent).join(' ');
    expect(copy).toContain(second === undefined ? '開始視点なし' : second === id ? '入口' : '奥');
    setInput(u.choice(), selected.operationId); await acknowledge(u.s, () => button(u.form(), '競合を解消').fire('click')); u.mount.render();
    expect(u.s.acknowledgment.state).toBe('idle'); expect(u.s.snapshot.state.scenes[f.overview]!.defaultViewId).toEqual({ kind: 'value', value: second ?? null });
    const p = u.host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    expect(p.details.mutable.scenesById[f.overview]!.defaultViewId).toEqual({ kind: 'value', value: second });
    const saved = u.host.read().source!; expect(saved.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    const original = await saved.inspectOriginal({ maxNodes: metadataFixtureLimits.maxNodes, maxWork: metadataFixtureLimits.maxWork });
    expect(() => summarizeFullHistory(original)).not.toThrow();
    const entryWrites = original.scalars.filter(op => op.path.join('/') === `scenesById/${f.overview}/defaultViewId`);
    expect(entryWrites.every(op => op.value.kind === 'absent' || typeof op.value.value === 'string')).toBe(true);
    if (mode === 'bothAbsent') expect(before.read().history.changes.flatMap(c => c.writes)
      .filter(op => op.path.join('/') === `scenesById/${f.overview}/defaultViewId`).every(op => op.value.kind === 'absent')).toBe(true);
    expect(u.recalls).toHaveLength(0); expect(u.background).not.toHaveBeenCalled();
    // Ordinary entry setting is available again from the same mounted workspace.
    button(u.root, '視点').fire('click'); const entry = area(u.root, '開始時の設定');
    setInput(picker(entry, 'シーンを開いたときの視点'), second === id ? otherId : id);
    await acknowledge(u.s, () => button(entry, '設定を適用').fire('click')); u.mount.render();
    expect(u.s.acknowledgment.state).toBe('idle'); expect(u.recalls).toHaveLength(0);
    const heads = u.host.read().source!.heads;
    await u.mount.dispose(); const cold = await u.h.open(); expect(cold.read().source!.heads).toEqual(heads); await cold.dispose();
  });

  it.each(['camera', 'defaultViewId'] as const)('keeps failed %s choices and reuses exact original journal on cold retry', async field => {
    const u = await setup(field, field === 'camera' ? displayCapture().camera : id,
      field === 'camera' ? displayCapture().camera : undefined), before = u.host.read().source!;
    const chosen = field === 'camera' ? u.choices()[0]! : u.choices().find(c => c.value.kind === 'absent')!;
    setInput(u.choice(), chosen.operationId); u.h.base.rejectPublication = true;
    await acknowledge(u.s, () => button(u.form(), '競合を解消').fire('click')); u.mount.render();
    expect(u.s.acknowledgment.state).toBe('failed'); expect(u.choice().value).toBe(chosen.operationId);
    expect(u.host.read().source!.token).toBe(before.token); expect(u.recalls).toHaveLength(0);
    const paths = (await u.h.base.list(`${metadataArea}/${u.h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => u.h.base.readBytes(p)));
    await u.mount.dispose(); u.h.base.rejectPublication = false;
    const cold = await u.h.open(); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(await Promise.all(paths.map(p => u.h.base.readBytes(p)))).toEqual(bytes);
    const snapshot = cold.authority.read();
    expect(field === 'camera' ? snapshot.viewData!.records[id]!.camera : snapshot.state.scenes[f.overview]!.defaultViewId)
      .toEqual({ kind: 'value', value: field === 'camera' ? displayCapture().camera : null });
    const heads = cold.read().source!.heads; await cold.authority.retry!(); expect(cold.read().source!.heads).toEqual(heads); await cold.dispose();
  });

  it('distinguishes same-name Views and their Scenes in headings, entry choices and order descriptions', async () => {
    const u = await setup('defaultViewId', id, otherId), source = u.host.read().source!;
    const renamed = raw(source, d => {
      for (const viewId of [id, otherId]) d.viewsById[viewId].name = new A.ImmutableString(JSON.stringify('同名'));
    });
    const third = `view_${'d'.repeat(32)}`;
    const added = renamed.prepareEdit(renamed.token, { kind: 'createView', viewId: third, sceneId: f.detail,
      projectFrameId: u.s.snapshot.resources.projectFrameId, name: '同名', orderKey: 'B', ...jsonCapture(), eventId: `evt_${tx}` }, await u.read(renamed), tx);
    const changed = (x: number) => raw(added, d => {
      for (const viewId of [id, third]) {
        delete d.viewsById[viewId].camera;
        d.viewsById[viewId].camera = new A.ImmutableString(canonicalFixture({ ...displayCapture().camera, position: [x, 2, 8] }));
      }
    });
    const conflict = changed(3).appendOriginal(changed(4).originalChanges());
    await u.host.receive(source.token, fullSource(conflict, 1506)); u.s.refreshHistory(); u.mount.render();
    const selectors = descendants(u.root).filter(n => n.tag === 'select' && n.attributes.get('aria-label')?.endsWith('：カメラの解消方法'));
    expect(selectors).toHaveLength(2);
    expect(selectors.map(n => n.attributes.get('aria-label'))).toEqual(expect.arrayContaining([
      expect.stringContaining('全体 › 同名（視点 1）'), expect.stringContaining('設備の確認 › 同名'),
    ]));
    const copy = descendants(u.form()).map(n => n.textContent).join(' ');
    expect(copy).toContain('全体 › 同名（視点 1）'); expect(copy).toContain('全体 › 同名（視点 2）');
    const order = branch(conflict, 'orderKey', 'A').appendOriginal(branch(conflict, 'orderKey', 'Z').originalChanges());
    await u.host.receive(conflict.token, fullSource(order, 1507)); u.s.refreshHistory(); u.mount.render();
    const orderCopy = descendants(u.form('orderKey')).map(n => n.textContent).join(' ');
    expect(orderCopy).toContain('「全体 › 同名（視点 2）」の前'); expect(orderCopy).toContain('「全体 › 同名（視点 2）」の後');
    expect(orderCopy).not.toContain('設備の確認'); await u.mount.dispose();
  });

  it('retains IME/invalid/stale View names and refuses readonly resolution with no writes', async () => {
    const u = await setup('name', '入口', '別名'), before = u.host.read().source!;
    setInput(u.choice(), 'manual'); const input = descendants(u.form()).find(n => n.tag === 'textarea')!;
    for (const text of ['', ' ', '二\n行', 'x'.repeat(257)]) {
      setInput(input, text); expect(button(u.form(), '競合を解消').disabled).toBe(true);
      const writes = u.h.base.writes; button(u.form(), '競合を解消').fire('click'); expect(u.h.base.writes).toBe(writes);
    }
    setInput(input, '編集中'); input.fire('compositionstart'); expect(button(u.form(), '競合を解消').disabled).toBe(true);
    const writes = u.h.base.writes; button(u.form(), '競合を解消').fire('click'); expect(u.h.base.writes).toBe(writes); input.fire('compositionend');
    const remote = await before.prepareCaptionText(before.token, f.shared, 'title', '更新');
    await u.host.receive(before.token, fullSource(remote, 1504)); u.s.refreshHistory(); u.mount.render();
    expect(descendants(u.form()).find(n => n.tag === 'textarea')).toBe(input); expect(input.value).toBe('編集中');
    expect(button(u.form(), '競合を解消').disabled).toBe(true);
    await expect(u.host.resolve(before.token, u.command(u.choices()[0]!.operationId))).rejects.toThrow(/command-not-ready/);
    button(u.form(), '取り消す').fire('click'); u.mount.render(); expect(u.choice().value).toBe('');
    const reader = await u.h.open(), ro = createMetadataWorkspace(new RecordedDocument().asDocument(), reader);
    const pick = descendants(record(ro.root)).find(n => n.tag === 'select' && n.attributes.get('aria-label')?.endsWith('：名前の解消方法'))!;
    expect(pick.disabled).toBe(true);
    await expect(reader.resolve(reader.read().source!.token, u.command(u.choices()[0]!.operationId))).rejects.toThrow(/閲覧専用/);
    await ro.dispose(); await u.mount.dispose();
  });

  it('refuses invalid fields, unknown/partial atoms, deleted/ambiguous parents and wrong Scene/Frame references', async () => {
    const u = await setup('camera', displayCapture().camera, displayCapture().camera), source = u.host.read().source!, provider = u.host.read().provider!;
    const command = u.command(u.choices()[0]!.operationId), writes = u.h.base.writes;
    for (const edit of [{ ...command, extra: true }, { ...command, sceneId: f.detail }, { ...command, field: 'lifecycle' },
      { ...command, choice: { kind: 'manual', text: '勝手な値' } }, { ...command, choice: { kind: 'candidate', operationId: 'unknown' } }])
      expect(() => source.prepareEdit(source.token, edit as MetadataEdit, provider, tx)).toThrow();
    const variants = [
      raw(source, d => { d.viewsById[id].camera = new A.ImmutableString(canonicalFixture({ ...displayCapture().camera, future: 1 })); }),
      raw(source, d => { delete d.viewsById[id].camera; }),
      raw(source, d => { d.viewsById[id].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', reason: 'userDelete', eventId: `evt_${tx}` })); }),
      raw(source, d => { d.viewsById[id].projectFrameId = new A.ImmutableString(JSON.stringify(`frm_${tx}`)); }),
      raw(source, d => { d.viewsById[id].sceneId = new A.ImmutableString(JSON.stringify(f.detail)); }),
      raw(source, d => { d.scenesById[f.overview].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', reason: 'userDelete', eventId: `evt_${tx}` })); }),
    ];
    variants.push(variants[0]!.appendOriginal(branch(source, 'camera', displayCapture().camera).originalChanges())); // Valid plus unknown must not expose a valid subset.
    for (const altered of variants) {
      const p = await u.read(altered); expect(() => altered.prepareEdit(altered.token, command, p, tx)).toThrow();
    }
    const one = raw(source, d => { d.viewsById[id].sceneId = new A.ImmutableString(JSON.stringify(f.detail)); });
    const two = raw(source, d => { delete d.viewsById[id].sceneId; d.viewsById[id].sceneId = new A.ImmutableString(JSON.stringify(f.overview)); });
    const ambiguous = one.appendOriginal(two.originalChanges());
    expect(() => ambiguous.prepareEdit(ambiguous.token, command, provider, tx)).toThrow();
    const bp = await u.read(ambiguous); if (bp.kind !== 'scene-provider') throw Error('provider');
    expect(() => viewFieldCandidates(bp, id, 'camera', metadataFixtureLimits)).toThrow();
    const unsupported = branch(source, 'background', { kind: 'transparent' }).appendOriginal(branch(source, 'background', displayCapture().background).originalChanges());
    const up = await u.read(unsupported); if (up.kind !== 'scene-provider') throw Error('provider');
    expect(() => viewFieldCandidates(up, id, 'background', metadataFixtureLimits)).toThrow(/solid/);
    const entry = branch(ambiguous, 'defaultViewId', id).appendOriginal(branch(ambiguous, 'defaultViewId', undefined).originalChanges());
    const ep = await u.read(entry); if (ep.kind !== 'scene-provider') throw Error('provider');
    expect(() => entryViewCandidates(ep, f.overview, metadataFixtureLimits)).toThrow();
    for (const bad of [variants[2]!, variants[3]!, variants[4]!]) {
      const e = branch(bad, 'defaultViewId', id).appendOriginal(branch(bad, 'defaultViewId', undefined).originalChanges());
      const p = await u.read(e); if (p.kind !== 'scene-provider') throw Error('provider');
      expect(() => entryViewCandidates(p, f.overview, metadataFixtureLimits)).toThrow();
    }
    // Old malformed null witnesses remain unexportable; do not invent an ID to hide that history.
    const invalidAbsence = () => raw(u.seed, d => {
      d.scenesById[f.overview].defaultViewId = new A.ImmutableString('null'); delete d.scenesById[f.overview].defaultViewId;
    });
    const noWitness = invalidAbsence().appendOriginal(invalidAbsence().originalChanges()), untouched = noWitness.originalChanges();
    const np = await u.read(noWitness); if (np.kind !== 'scene-provider') throw Error('provider');
    const absent = entryViewCandidates(np, f.overview, metadataFixtureLimits).candidates[0]!;
    expect(() => noWitness.prepareEdit(noWitness.token, { kind: 'resolveEntryView', sceneId: f.overview, operationId: absent.operationId }, np, tx))
      .toThrow('entry-absence-witness');
    const invalidOriginal = await noWitness.inspectOriginal({ maxNodes: metadataFixtureLimits.maxNodes, maxWork: metadataFixtureLimits.maxWork });
    expect(() => summarizeFullHistory(invalidOriginal)).toThrow('summary-historical-value-unsupported');
    expect(noWitness.originalChanges()).toEqual(untouched);
    expect(u.h.base.writes).toBe(writes); expect(u.host.read().source!.token).toBe(source.token); await u.mount.dispose();
  });
});

describe('Scene name conflict resolution; saved memory ports and recorded DOM only', () => {
  const raw = (source: ProjectMetadataSource, change: (doc: any) => void) => {
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    return source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), change)));
  };
  const branch = (source: ProjectMetadataSource, name: string) => raw(source, doc => {
    delete doc.scenesById[f.overview].name; doc.scenesById[f.overview].name = new A.ImmutableString(JSON.stringify(name));
  });
  const setup = async (equal = false) => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!;
    const one = branch(seed, '現場の記録'), two = branch(seed, equal ? '現場の記録' : '設備の調査');
    await host.receive(seed.token, fullSource(one, 1400)); await host.receive(host.read().source!.token, fullSource(two, 1401));
    const mount = createMetadataWorkspace(new RecordedDocument().asDocument(), host), root = record(mount.root), s = mount.session!;
    const choice = () => picker(root, '現在のシーン：名前の解消方法');
    const form = () => descendants(root).find(n => n.tag === 'li' && descendants(n).includes(choice()))!;
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    return { h, host, seed, one, two, mount, root, s, choice, form, names: sceneNameCandidates(p, f.overview, metadataFixtureLimits) };
  };

  it.each(['first', 'second', 'equal', 'manual'] as const)('resolves %s without changing other work, returns and replays original history', async mode => {
    const u = await setup(mode === 'equal'), { h, host, mount, s } = u;
    const before = host.read().source!, state = s.snapshot.state, captions = s.snapshot.resources.captions;
    select(s); const detail = s.detailContext();
    s.acceptDetail({ kind: 'draft', baseDraft: detail.draft!, draft: editCaptionDraft(detail.draft!, detail.source, 'body', '未適用の手元メモ') });
    const windows = s.windowMemory, memory = s.memory;
    expect(u.choice().value).toBe(''); expect(button(u.form(), '競合を解消').disabled).toBe(true);
    const selected = mode === 'second' ? u.names.find(c => c.name === '設備の調査')! : u.names.find(c => c.name === '現場の記録')!;
    setInput(u.choice(), mode === 'manual' ? 'manual' : selected.operationId);
    if (mode === 'manual') setInput(named(u.form(), '現在のシーン：名前の入力'), '  Cafe\u0301 調査  ');
    const expected = mode === 'manual' ? '  Café 調査  ' : selected.name;
    await acknowledge(s, () => button(u.form(), '競合を解消').fire('click')); mount.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.snapshot.state.scenes[f.overview]!.name).toEqual({ kind: 'value', value: expected });
    expect(s.sceneId).toBe(f.overview); expect(s.windowMemory).toBe(windows); expect(s.memory).toBe(memory);
    expect(s.detailContext().draft?.edits.body).toBe('未適用の手元メモ');
    expect(s.snapshot.state.assetMemberships).toEqual(state.assetMemberships); expect(s.snapshot.state.captionMemberships).toEqual(state.captionMemberships);
    expect(s.snapshot.state.defaultSceneId).toEqual(state.defaultSceneId); expect(s.snapshot.state.scenes[f.detail]).toEqual(state.scenes[f.detail]);
    expect(s.snapshot.resources.captions).toEqual(captions);
    const saved = host.read().source!; expect(saved.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    for (const bytes of before.originalChanges()) expect(saved.originalChanges().some(b => Buffer.from(b).equals(Buffer.from(bytes)))).toBe(true);
    // An existing participant receives the resolved history, then ordinary rename works again.
    const participant = u.one.appendOriginal(saved.originalChanges());
    const p = await readProjectScene(participant.read(), metadataFixtureLimits, host.content.verifier(false));
    const returned = participant.prepareEdit(participant.token, { kind: 'renameScene', sceneId: f.overview, name: '二巡目の確認' }, p, 'c'.repeat(32));
    await host.receive(saved.token, fullSource(returned, 1402)); s.refreshHistory();
    expect(s.snapshot.state.scenes[f.overview]!.name).toEqual({ kind: 'value', value: '二巡目の確認' });
    const heads = host.read().source!.heads, writes = h.base.writes;
    await host.receive(host.read().source!.token, fullSource(returned, 1402)); expect(h.base.writes).toBe(writes);
    await mount.dispose(); const cold = await h.open(); expect(cold.read().source!.heads).toEqual(heads);
    expect(cold.authority.read().state.scenes[f.overview]!.name).toEqual({ kind: 'value', value: '二巡目の確認' });
    // An unseen concurrent name still reopens the conflict; no preferred winner survives.
    await cold.receive(cold.read().source!.token, fullSource(branch(before, '後着の名前'), 1403));
    expect(cold.authority.read().state.scenes[f.overview]!.name.kind).toBe('unresolved'); await cold.dispose();
  });

  it('preserves IME and stale manual input, rejects readonly and invalid names before writing', async () => {
    const u = await setup(), { h, host, mount, s } = u, before = host.read().source!;
    const originalForm = u.form();
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true); mount.render();
    expect(picker(u.root, '現在のシーン：名前の解消方法')).toBeUndefined();
    expect(descendants(u.root)).toContain(originalForm);
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.overview }))).toBe(true); mount.render();
    expect(u.form()).toBe(originalForm);
    setInput(u.choice(), 'manual'); const input = named(u.form(), '現在のシーン：名前の入力');
    for (const name of ['', '  ', '改\n行', 'a'.repeat(257)]) {
      setInput(input, name); expect(button(u.form(), '競合を解消').disabled).toBe(true);
      expect(descendants(u.form()).some(n => n.textContent.includes('空白だけの名前は使えません'))).toBe(true);
      const writes = h.base.writes; button(u.form(), '競合を解消').fire('click'); expect(h.base.writes).toBe(writes);
    }
    setInput(input, '残す入力'); input.fire('compositionstart'); mount.render();
    const writes = h.base.writes; button(u.form(), '競合を解消').fire('click'); expect(h.base.writes).toBe(writes);
    expect(button(u.form(), '競合を解消').disabled).toBe(true); input.fire('compositionend'); mount.render();
    const remote = await before.prepareCaptionText(before.token, f.shared, 'body', '別の編集');
    await host.receive(before.token, fullSource(remote, 1404)); s.refreshHistory(); mount.render();
    expect(named(u.form(), '現在のシーン：名前の入力')).toBe(input); expect(input.value).toBe('残す入力');
    expect(button(u.form(), '競合を解消').disabled).toBe(true);
    const afterReceiveWrites = h.base.writes;
    await expect(host.resolve(before.token, { kind: 'resolveSceneName', sceneId: f.overview,
      choice: { kind: 'candidate', operationId: u.names[0]!.operationId } })).rejects.toThrow(/command-not-ready/);
    expect(h.base.writes).toBe(afterReceiveWrites);
    button(u.form(), '取り消す').fire('click'); mount.render(); expect(u.choice().value).toBe('');
    const reader = await h.open(), readonly = createMetadataWorkspace(new RecordedDocument().asDocument(), reader), r = record(readonly.root);
    expect(picker(r, '現在のシーン：名前の解消方法').disabled).toBe(true);
    await expect(reader.resolve(reader.read().source!.token, { kind: 'resolveSceneName', sceneId: f.overview,
      choice: { kind: 'candidate', operationId: u.names[0]!.operationId } })).rejects.toThrow(/閲覧専用/);
    await readonly.dispose(); await mount.dispose();
  });

  it('retains failed choice and recovers the exact journal after cold reopen without regenerating resolution', async () => {
    const u = await setup(), { h, host, mount, s } = u;
    const before = host.read().source!, chosen = u.names[0]!; setInput(u.choice(), chosen.operationId);
    h.base.rejectPublication = true; await acknowledge(s, () => button(u.form(), '競合を解消').fire('click')); mount.render();
    expect(s.acknowledgment.state).toBe('failed'); expect(u.choice().value).toBe(chosen.operationId);
    expect(s.snapshot.state.scenes[f.overview]!.name.kind).toBe('unresolved');
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    await mount.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.authority.read().state.scenes[f.overview]!.name).toEqual({ kind: 'value', value: chosen.name });
    expect(cold.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const heads = cold.read().source!.heads; await cold.authority.retry!(); expect(cold.read().source!.heads).toEqual(heads); await cold.dispose();
  });

  it('refuses incomplete/unknown/deleted/lifecycle-ambiguous sources and invalid commands without writes', async () => {
    const u = await setup(), { h, host, mount } = u, source = host.read().source!, provider = host.read().provider!;
    const command = { kind: 'resolveSceneName' as const, sceneId: f.overview,
      choice: { kind: 'candidate' as const, operationId: u.names[0]!.operationId } }, tx = 'c'.repeat(32), writes = h.base.writes;
    for (const invalid of [{ ...command, choice: { kind: 'candidate', operationId: 'unknown' } },
      { ...command, extra: true }, { ...command, sceneId: f.detail }, { ...command, choice: { ...command.choice, extra: true } },
      ...['', '  ', 'bad\nname', 'a'.repeat(257)].map(text => ({ ...command, choice: { kind: 'manual', text } }))])
      expect(() => source.prepareEdit(source.token, invalid as MetadataEdit, provider, tx)).toThrow();
    expect(() => source.prepareEdit(source.token, { kind: 'renameScene', sceneId: f.overview, name: '勝手に上書き' }, provider, tx)).toThrow();
    const changed = [
      raw(source, d => { d.scenesById[f.overview].name = new A.ImmutableString('42'); }),
      raw(source, d => { delete d.scenesById[f.overview].name; }),
      raw(source, d => { d.scenesById[f.overview].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', eventId: `evt_${tx}`, reason: 'userDelete' })); }),
      raw(source, d => { d.scenesById[f.overview].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'active', eventId: `evt_${tx}`, reason: 'initial', future: true })); }),
      raw(source, d => { d.scenesById[f.overview].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'active', eventId: `evt_${tx}`, reason: 'initial' })); })
        .appendOriginal(raw(source, d => { d.scenesById[f.overview].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'active', eventId: `evt_${'d'.repeat(32)}`, reason: 'initial' })); }).originalChanges()),
    ];
    for (const altered of changed) {
      const p = await readProjectScene(altered.read(), metadataFixtureLimits, host.content.verifier(false));
      expect(() => altered.prepareEdit(altered.token, command, p, tx)).toThrow();
    }
    expect(h.base.writes).toBe(writes); expect(host.read().source!.token).toBe(source.token); await mount.dispose();
  });
});

describe('saved startup Scene conflict recovery; memory ports and recorded DOM only', { timeout: 15000 }, () => {
  const raw = (source: ProjectMetadataSource, change: (doc: any) => void) => {
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    return source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), change)));
  };
  const branch = (source: ProjectMetadataSource, sceneId: string) => raw(source, doc => {
    delete doc.project.defaultSceneId; doc.project.defaultSceneId = new A.ImmutableString(JSON.stringify(sceneId));
  });
  const setup = async (equal = false) => {
    const h = fixture(), host = await h.open(true), source = host.read().source!;
    const one = branch(source, f.overview), two = branch(source, equal ? f.overview : f.detail);
    await host.receive(source.token, fullSource(one, 1200)); await host.receive(host.read().source!.token, fullSource(two, 1201));
    return { h, host, source, one, two };
  };
  const choices = (host: Awaited<ReturnType<typeof openMetadataHost>>) => {
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    return defaultSceneCandidates(p, metadataFixtureLimits);
  };
  const ui = (host: Awaited<ReturnType<typeof openMetadataHost>>, viewport?: Parameters<typeof createMetadataWorkspace>[2]) => {
    const mounted = createMetadataWorkspace(new RecordedDocument().asDocument(), host, viewport), root = record(mounted.root);
    return { mounted, root, panel: named(root, '開始シーンの競合'), select: picker(root, '残す開始シーン') };
  };
  const until = async (check: () => void) => vi.waitFor(check, { timeout: 5000, interval: 10 });

  it('cold-opens without a guessed Scene, resolves either/equal candidate atomically, returns history and replays without duplication', async () => {
    for (const [target, equal] of [[f.overview, false], [f.detail, false], [f.overview, true]] as const) {
      const { h, host: first, source } = await setup(equal), pending = first.read().source!, originalChanges = pending.originalChanges();
      expect(first.read().state).toBe('ready'); expect(first.authority.read().state.defaultSceneId.kind).toBe('unresolved');
      await first.dispose(); const host = await h.open(), u = ui(host), count = host.read().source!.originalChanges().length;
      expect(u.mounted.session).toBeUndefined(); expect(u.panel.hidden).toBe(false); expect(u.select.value).toBe('');
      expect(button(u.panel, '開始シーンを確定').disabled).toBe(true); expect(button(u.root, '更新を再試行').hidden).toBe(true);
      const choice = choices(host).find(c => c.sceneId === target)!; setInput(u.select, choice.operationId);
      expect(u.mounted.hasChanges()).toBe(true); const writes = h.base.writes;
      button(u.root, '再開用データを確認').fire('click'); expect(h.base.writes).toBe(writes); expect(u.select.value).toBe(choice.operationId);
      button(u.panel, '開始シーンを確定').fire('click'); await until(() => expect(u.mounted.session?.sceneId).toBe(target));
      expect(u.panel.hidden).toBe(true); expect(u.mounted.hasChanges()).toBe(false);
      const saved = host.read().source!; expect(saved.originalChanges()).toHaveLength(count + 1);
      for (const part of originalChanges) expect(saved.originalChanges().some(p => Buffer.from(p).equals(Buffer.from(part)))).toBe(true);
      expect(host.authority.read().resources.captions).toEqual(metadataProjectView((await readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false)))).resources.captions);
      await host.receive(saved.token, fullSource(pending, 1202)); u.mounted.session!.refreshHistory();
      expect(host.read().source!.token).toBe(saved.token); expect(host.read().source!.originalChanges()).toHaveLength(count + 1);
      const returned = pending.appendOriginal(saved.originalChanges()), rp = await readProjectScene(returned.read(), metadataFixtureLimits, host.content.verifier(false));
      expect(rp.kind === 'scene-provider' && rp.state.defaultSceneId).toEqual({ kind: 'value', value: target });
      await u.mounted.dispose(); const cold = await h.open(); expect(new SyntheticSession(cold.authority).sceneId).toBe(target); await cold.dispose();
    }
  });

  it('preserves warm Scene/camera/draft state, blocks composition and stale choices, and leaves ordinary conflicting writes refused', async () => {
    let recalls = 0; const camera = displayCapture();
    const h = fixture(), host = await h.open(true), u = ui(host, () => ({ update() {}, setActive() {}, camera() {}, retry() {}, dispose() {},
      capture: () => camera, recall: () => { recalls++; }, read: () => ({ token: 'camera', ready: true, issue: null, dragging: false,
        projection: 'perspective', axis: null, pins: [] }) })), s = u.mounted.session!, seed = host.read().source!, initialRecalls = recalls;
    select(s); const context = s.detailContext(), draft = editCaptionDraft(context.draft!, context.source, 'body', '未確定の追記');
    s.acceptDetail({ kind: 'draft', baseDraft: context.draft!, draft }); const memory = s.memory, windows = s.windowMemory;
    const conflict = branch(seed, f.overview).appendOriginal(branch(seed, f.detail).originalChanges());
    await host.receive(seed.token, fullSource(conflict, 1210)); s.refreshHistory(); u.mounted.render();
    expect(s.sceneId).toBe(f.overview); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows); expect(s.detailContext().draft).toBe(draft);
    expect(button(u.panel, '開始シーンを確定').disabled).toBe(true);
    // A retained editor/IME blocks this separate resolution command until explicitly cancelled.
    s.setSearchComposing(true); u.mounted.render(); expect(u.select.disabled).toBe(true); s.setSearchComposing(false);
    const detail = s.detailContext(); s.acceptDetail({ kind: 'cancel', draft: detail.draft! }); u.mounted.render();
    const choice = choices(host).find(c => c.sceneId === f.detail)!; setInput(u.select, choice.operationId);
    const before = host.read().source!, writes = h.base.writes;
    await expect(host.authority.authorScene!(before.token, { kind: 'setDefaultScene', sceneId: f.detail })).rejects.toThrow();
    await expect(host.resolve(before.token, { kind: 'resolveDefaultScene', operationId: 'unseen' })).rejects.toThrow();
    await expect(host.resolve('stale', { kind: 'resolveDefaultScene', operationId: choice.operationId })).rejects.toThrow();
    expect(h.base.writes).toBe(writes);
    const remote = await before.prepareCaptionText(before.token, f.shared, 'title', '別の更新');
    await host.receive(before.token, fullSource(remote, 1211)); s.refreshHistory(); u.mounted.render();
    expect(u.select.value).toBe(choice.operationId); expect(button(u.panel, '開始シーンを確定').disabled).toBe(true);
    button(u.panel, '取り消す').fire('click'); setInput(u.select, choices(host).find(c => c.sceneId === f.detail)!.operationId);
    await acknowledge(s, () => button(u.panel, '開始シーンを確定').fire('click')); u.mounted.render();
    expect(s.sceneId).toBe(f.overview); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(recalls).toBe(initialRecalls); expect(camera).toEqual(displayCapture());
    expect(s.snapshot.state.defaultSceneId).toEqual({ kind: 'value', value: f.detail }); await u.mounted.dispose();
  });

  it('retains failed choice and original journal through cold retry, and lets a readonly opener refresh only after the writer resolves', async () => {
    const { h, host } = await setup(), reader = await h.open(), ro = ui(reader), u = ui(host);
    expect(ro.select.disabled).toBe(true); expect(ro.mounted.session).toBeUndefined();
    const choice = choices(host).find(c => c.sceneId === f.detail)!;
    await expect(reader.resolve(reader.read().source!.token, { kind: 'resolveDefaultScene', operationId: choice.operationId })).rejects.toThrow(/閲覧専用/);
    setInput(u.select, choice.operationId); h.base.rejectPublication = true;
    button(u.panel, '開始シーンを確定').fire('click'); await until(() => expect(button(u.root, '更新を再試行').hidden).toBe(false));
    expect(u.mounted.session).toBeUndefined(); expect(u.select.value).toBe(choice.operationId); expect(u.select.disabled).toBe(true);
    expect(button(u.panel, '取り消す').disabled).toBe(true); expect(host.authority.read().state.defaultSceneId.kind).toBe('unresolved');
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const parts = await Promise.all(paths.map(p => h.base.readBytes(p)));
    button(u.root, '更新を再試行').fire('click'); expect(button(u.root, '更新を再試行').disabled).toBe(true);
    await until(() => expect(button(u.root, '更新を再試行').disabled).toBe(false));
    expect(u.select.value).toBe(choice.operationId); expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(parts);
    await u.mounted.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(), reopened = ui(cold); expect(cold.read().state).toBe('pending'); expect(reopened.mounted.session).toBeUndefined();
    button(reopened.root, '更新を再試行').fire('click'); await until(() => expect(reopened.mounted.session?.sceneId).toBe(f.detail));
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(parts);
    button(ro.root, '再開用データを確認').fire('click'); await until(() => expect(ro.mounted.session?.sceneId).toBe(f.detail));
    expect(ro.mounted.session!.readOnly).toBe(true); await reopened.mounted.dispose(); await ro.mounted.dispose();
  });

  it('rejects incomplete target authority without writes, and never mounts a workspace after disposal of an in-flight confirmation', async () => {
    const { host, source } = await setup(); const conflict = host.read().source!;
    const deleted = raw(conflict, d => { d.scenesById[f.detail].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', eventId: `evt_${'e'.repeat(32)}`, reason: 'userDelete' })); });
    for (const corrupt of [deleted,
      raw(conflict, d => { d.scenesById[f.detail].id = new A.ImmutableString(JSON.stringify(f.overview)); })]) {
      const p = await readProjectScene(corrupt.read(), metadataFixtureLimits, host.content.verifier(false));
      if (corrupt === deleted) {
        expect(p.kind).toBe('scene-provider');
        if (p.kind !== 'scene-provider') throw Error('provider');
        expect(p.details.mutable.scenesById[f.detail]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted', reason: 'userDelete' } });
      }
      expect(() => corrupt.prepareEdit(corrupt.token, { kind: 'resolveDefaultScene', operationId: choices(host)[0]!.operationId }, p, 'c'.repeat(32))).toThrow();
    }
    const p = await readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    expect(() => source.prepareEdit(source.token, { kind: 'resolveDefaultScene', operationId: 'missing' }, p, 'c'.repeat(32))).toThrow();
    let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
    const gated = { ...host, resolve: async (...args: Parameters<typeof host.resolve>) => { const result = await host.resolve(...args); await wait; return result; } };
    const u = ui(gated); setInput(u.select, choices(host)[0]!.operationId); button(u.panel, '開始シーンを確定').fire('click');
    await until(() => expect(host.authority.read().state.defaultSceneId.kind).toBe('value'));
    expect(u.mounted.session).toBeUndefined(); await u.mounted.dispose(); release(); await wait; await Promise.resolve();
    expect(u.mounted.session).toBeUndefined(); expect(descendants(u.root).some(n => n.tag === 'main')).toBe(false);
  });
});

describe('saved Asset deletion; synthetic ports and recorded DOM only', { timeout: 15000 }, () => {
  const id = (p: string, n: number) => `${p}_${n.toString(16).padStart(32, '0')}`;
  const scalar = (v: unknown) => new A.ImmutableString(canonicalFixture(v));
  const raw = (source: ProjectMetadataSource, change: (doc: any) => void) => {
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    return source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), change)));
  };
  const moveScene = (s: SyntheticSession, sceneId: string) => {
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId }))).toBe(true);
  };
  const clearReferences = async (s: SyntheticSession) => {
    select(s); expect(s.beginCaptionDeletion()).toBe(true); await acknowledge(s, () => { s.confirmCaptionDeletion(); });
    for (const sceneId of [f.overview, f.detail]) {
      moveScene(s, sceneId); selectModel(s);
      await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.equipment, included: false })); });
      expect(s.acknowledgment.state).toBe('idle');
    }
    moveScene(s, f.overview); selectModel(s);
  };
  const setup = async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!, s = new SyntheticSession(host.authority);
    await clearReferences(s); return { h, host, s, seed };
  };
  const ui = (s: SyntheticSession) => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s); button(record(w.root), 'モデル').fire('click');
    button(named(record(w.root), 'モデル'), '設備').fire('click');
    return { w, root: named(record(w.root), 'モデルの削除') };
  };
  it('shows all dependency kinds and waits for explicit cleanup, then saves one Asset tombstone without touching models/bytes', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), material = materialHost(s);
    material.scope('project'); material.begin(); material.edit('照明', 'unlit'); await material.apply(); material.w.dispose();
    const u = ui(s); button(u.root, 'プロジェクトから削除').fire('click');
    expect(s.modelDeletion?.impact.dependencies.map(d => d.kind).sort()).toEqual(['caption', 'material', 'scene', 'scene']);
    expect(descendants(u.root).filter(n => n.tag === 'li')).toHaveLength(4); expect(button(u.root, '削除する').disabled).toBe(true);
    const writes = h.base.writes; expect(s.confirmAssetDeletion()).toBe(false); expect(h.base.writes).toBe(writes);
    expect(s.modelUpdateContext().issue).toBe('削除の確認を終えてください。'); expect(s.beginModelPlacement()).toBe(false);
    button(u.root, '取り消す').fire('click'); await clearReferences(s); u.w.render();
    button(u.root, 'プロジェクトから削除').fire('click'); expect(s.modelDeletion!.impact.dependencies.map(d => d.kind)).toEqual(['material']);
    button(u.root, '取り消す').fire('click'); u.w.dispose();
    const reset = materialHost(s); reset.scope('project'); await reset.reset(); reset.w.dispose();
    const final = ui(s), before = host.read().source!, original = s.snapshot, windows = s.windowMemory, captionMemory = s.memory;
    const bin = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.bin') || p.includes('/evidence/'));
    const bytes = await Promise.all(bin.map(p => h.base.readBytes(p))), bodyBytes = host.content.counts.bodyBytes;
    expect(s.modelContext().memory.filter).toBe('all'); expect(modelListView(s.modelContext()).rows.map(r => r.item.id)).toContain(f.equipment);
    button(final.root, 'プロジェクトから削除').fire('click'); expect(s.modelDeletion!.impact.dependencies).toEqual([]);
    await acknowledge(s, () => button(final.root, '削除する').fire('click')); final.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.modelDeletion).toBeNull(); expect(s.modelContext().memory.assetId).toBeNull();
    expect(s.snapshot.resources.assets[f.equipment]!.lifecycle).toMatchObject({ value: { state: 'deleted', reason: 'userDelete' } });
    expect(modelListView(s.modelContext()).rows.map(r => r.item.id)).toEqual([f.structure]);
    expect(s.snapshot.resources.assets[f.structure]).toEqual(original.resources.assets[f.structure]);
    expect(s.snapshot.resources.captions).toEqual(original.resources.captions); expect(s.windowMemory).toBe(windows); expect(s.memory).toBe(captionMemory);
    const after = host.read().source!; expect(after.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    const newChanges = after.read().history.changes.filter(c => !before.read().history.changes.some(b => b.id === c.id));
    expect(newChanges.flatMap(c => c.writes.map(w => w.path))).toEqual([['assetsById', f.equipment, 'lifecycle']]);
    expect(await Promise.all(bin.map(p => h.base.readBytes(p)))).toEqual(bytes); expect(host.content.counts.bodyBytes).toBe(bodyBytes);
    final.w.dispose(); await host.dispose(); const cold = await h.open();
    expect(cold.read().source!.token).toBe(after.token); expect(cold.authority.read().modelVersions!.some(v => v.assetId === f.equipment)).toBe(false); await cold.dispose();
  });
  it('keeps model selection until saved retry, rejects readonly/pending/stale confirmation and cold-recovers exact original bytes', async () => {
    const { h, host, s } = await setup(); let external = true, readonly = false;
    const guarded = new SyntheticSession({ ...host.authority, get readOnly() { return readonly; } }, () => external); const g = ui(guarded);
    expect(guarded.beginAssetDeletion()).toBe(false); external = false;
    guarded.setSearchComposing(true); expect(guarded.beginAssetDeletion()).toBe(false); guarded.setSearchComposing(false);
    readonly = true; expect(guarded.beginAssetDeletion()).toBe(false); readonly = false;
    expect(guarded.beginAssetDeletion()).toBe(true); external = true; expect(guarded.confirmAssetDeletion()).toBe(false); external = false;
    readonly = true; expect(guarded.confirmAssetDeletion()).toBe(false); readonly = false;
    const source = host.read().source!, p = host.read().provider!;
    const remote = source.prepareEdit(source.token, { kind: 'renameScene', sceneId: f.overview, name: '変更後' }, p, 'a'.repeat(32));
    await host.receive(source.token, fullSource(remote, 951)); guarded.refreshHistory(); g.w.render();
    expect(button(g.root, '削除する').disabled).toBe(true); expect(guarded.confirmAssetDeletion()).toBe(false); guarded.cancelAssetDeletion();
    expect(guarded.beginAssetDeletion()).toBe(true); const old = guarded.snapshot, memory = guarded.modelContext().memory;
    h.base.rejectPublication = true; await acknowledge(guarded, () => { guarded.confirmAssetDeletion(); }); g.w.render();
    expect(guarded.acknowledgment.state).toBe('failed'); expect(guarded.snapshot).toBe(old); expect(guarded.modelContext().memory).toBe(memory);
    expect(modelListView(guarded.modelContext()).rows.some(r => r.item.id === f.equipment)).toBe(true); expect(guarded.cancelAssetDeletion()).toBe(false);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    g.w.dispose(); await host.dispose(); h.base.rejectPublication = false; const cold = await h.open();
    expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.authority.read().resources.assets[f.equipment]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes); expect(s.snapshot.resources.assets[f.equipment]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    await cold.dispose();
  });
  it('retains late references and remote-deleted material drafts, with no automatic cascade or repeat publication', async () => {
    const { h, host, s } = await setup(), seed = host.read().source!;
    const other = fixture(); for (const path of await h.base.list(`${metadataArea}/${h.run}/`)) await other.base.writeBytes(path, (await h.base.readBytes(path))!);
    for (const [key, bytes] of h.rows) other.rows.set(key, bytes.slice()); const recipient = await other.open(), rs = new SyntheticSession(recipient.authority);
    const m = materialHost(rs); m.begin(); m.edit('照明', 'unlit'); const draft = rs.materialContext().draft;
    expect(s.beginAssetDeletion()).toBe(true); await acknowledge(s, () => { s.confirmAssetDeletion(); }); const deleted = host.read().source!;
    await recipient.receive(seed.token, fullSource(deleted, 960)); rs.refreshHistory(); m.w.render();
    expect(rs.materialContext().draft).toBe(draft); expect(button(m.panel, '変更を適用').disabled).toBe(true);
    button(m.panel, '取り消す').fire('click'); expect(rs.materialContext().draft).toBe(draft);
    button(m.panel, '変更を取り消す').fire('click'); expect(rs.materialContext().draft).toBeNull(); expect(rs.pending).toBeNull(); m.w.dispose();
    const late = seed.prepareEdit(seed.token, { kind: 'include', sceneId: f.detail, resourceKind: 'asset', resourceId: f.equipment,
      membershipId: id('sam', 960), orderKey: 'Z', eventId: id('evt', 960) }, await readProjectScene(seed.read(), metadataFixtureLimits, host.content.verifier(false)), 'b'.repeat(32));
    await host.receive(deleted.token, fullSource(late, 961)); const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(provider.issues.some(i => i.kind === 'orphan' && i.path.includes(id('sam', 960)))).toBe(true);
    expect(provider.details.mutable.sceneAssetMembershipsById[id('sam', 960)]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    s.refreshHistory(); const controls = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {});
    expect(named(record(controls.root), '削除と参照の要確認').hidden).toBe(false);
    const token = host.read().source!.token, count = host.read().source!.originalChanges().length;
    await host.receive(token, fullSource(late, 961)); expect(host.read().source!.token).toBe(token); expect(host.read().source!.originalChanges()).toHaveLength(count);
    controls.dispose(); await host.dispose(); await recipient.dispose();
  });
  it('checks every raw anchor/routing/edge candidate, unresolved lifecycle and delete-edit, never just the current projection', async () => {
    const { host, seed, s } = await setup(), clean = host.read().source!, provider = host.read().provider!;
    const read = (source: ProjectMetadataSource) => readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    const impact = async (source: ProjectMetadataSource) => { const p = await read(source); if (p.kind !== 'scene-provider') throw Error('provider'); return assetDeletionImpact(p, f.equipment, metadataFixtureLimits); };
    const cmd: MetadataEdit = { kind: 'deleteAsset', assetId: f.equipment, eventId: id('evt', 970) };
    expect(() => clean.prepareEdit('stale', cmd, provider, 'c'.repeat(32))).toThrow(/stale/);
    expect(() => clean.prepareEdit(clean.token, { ...cmd, extra: true } as MetadataEdit, provider, 'c'.repeat(32))).toThrow(/shape/);
    const revived = raw(clean, d => { d.captionsById[f.shared].lifecycle = scalar({ state: 'active', reason: 'restore', eventId: id('evt', 971) }); });
    expect((await impact(revived)).dependencies.map(d => d.kind)).toEqual(['caption']);
    const project = raw(revived, d => { d.captionsById[f.shared].anchor = scalar({ kind: 'project', projectFrameId: s.snapshot.resources.projectFrameId, positionProject: [0, 0, 0] }); });
    expect((await impact(project)).dependencies).toEqual([]);
    const anchor = s.snapshot.resources.captions[f.shared]!.anchor; if (anchor.kind !== 'value') throw Error('anchor');
    const own = raw(revived, d => { delete d.captionsById[f.shared].anchor; d.captionsById[f.shared].anchor = scalar(anchor.value); });
    expect((await impact(project.appendOriginal(own.originalChanges()))).dependencies).toMatchObject([{ kind: 'caption', uncertain: true }]);
    const unknown = raw(project, d => { d.captionsById[f.shared].anchor = scalar({ kind: 'future' }); });
    expect((await impact(unknown)).dependencies).toMatchObject([{ kind: 'caption', uncertain: true }]);
    const edited = seed.prepareEdit(seed.token, { kind: 'editCaption', captionId: f.shared, edits: { body: '後着' } }, await read(seed), 'd'.repeat(32));
    expect((await impact(clean.appendOriginal(edited.originalChanges()))).dependencies).toMatchObject([{ kind: 'caption', uncertain: true }]);
    const target = materialTarget(metadataModels.find(m => m.assetId === f.equipment)!.closure);
    const routing = { scope: { kind: 'project' }, target: { ...target } };
    const withMaterial = raw(clean, d => { d.materialOverridesById[id('ovr', 972)] = { id: scalar(id('ovr', 972)), routing: scalar(routing),
      lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 972) }), appearance: scalar({ lighting: 'unlit' }), compositing: scalar({ coverage: { policy: 'inherit' }, optics: 'inherit' }) }; });
    expect((await impact(withMaterial)).dependencies.map(d => d.kind)).toEqual(['material']);
    const otherTarget = materialTarget(metadataModels.find(m => m.assetId === f.structure)!.closure);
    const x = raw(withMaterial, d => { d.materialOverridesById[id('ovr', 972)].routing = scalar({ scope: { kind: 'scene', sceneId: f.detail }, target: otherTarget }); });
    const y = raw(withMaterial, d => { delete d.materialOverridesById[id('ovr', 972)].routing; d.materialOverridesById[id('ovr', 972)].routing = scalar(routing); });
    expect((await impact(x)).dependencies).toEqual([]);
    const cp = await read(x.appendOriginal(y.originalChanges())); if (cp.kind !== 'scene-provider') throw Error('provider');
    expect(assetDeletionImpact(cp, f.equipment, metadataFixtureLimits).dependencies).toMatchObject([{ kind: 'material', uncertain: true }]);
    expect(() => assetDeletionImpact(cp, f.equipment, { ...metadataFixtureLimits, maxWork: 1 })).toThrow(/limit/);
    const edge = id('sam', 973), active = { state: 'active', reason: 'initial', eventId: id('evt', 973) };
    const withEdge = raw(clean, d => { d.sceneAssetMembershipsById[edge] = { id: scalar(edge), sceneId: scalar(f.detail),
      assetId: scalar(f.equipment), orderKey: scalar('Z'), lifecycle: scalar(active) }; });
    expect((await impact(withEdge)).dependencies).toMatchObject([{ kind: 'scene', sceneId: f.detail, uncertain: false }]);
    const otherEdge = raw(withEdge, d => { d.sceneAssetMembershipsById[edge].assetId = scalar(f.structure); });
    const ownEdge = raw(withEdge, d => { delete d.sceneAssetMembershipsById[edge].assetId; d.sceneAssetMembershipsById[edge].assetId = scalar(f.equipment); });
    expect((await impact(otherEdge)).dependencies).toEqual([]);
    expect((await impact(otherEdge.appendOriginal(ownEdge.originalChanges()))).dependencies).toMatchObject([{ kind: 'scene', uncertain: true }]);
    const deletedEdge = raw(withEdge, d => { d.sceneAssetMembershipsById[edge].lifecycle = scalar({ state: 'deleted', reason: 'userDelete', eventId: id('evt', 974) }); });
    expect((await impact(deletedEdge)).dependencies).toEqual([]);
    const restoredEdge = raw(withEdge, d => { d.sceneAssetMembershipsById[edge].lifecycle = scalar({ state: 'active', reason: 'restore', eventId: id('evt', 975) }); });
    expect((await impact(deletedEdge.appendOriginal(restoredEdge.originalChanges()))).dependencies).toMatchObject([{ kind: 'scene', uncertain: true }]);
    const unknownEdge = raw(withEdge, d => { d.sceneAssetMembershipsById[edge].assetId = scalar({ future: true }); });
    expect((await impact(unknownEdge)).dependencies).toMatchObject([{ kind: 'scene', uncertain: true }]);
    const unknownTarget = raw(clean, d => { d.assetsById[f.equipment].lifecycle = scalar({ state: 'future' }); });
    await expect(impact(unknownTarget)).rejects.toThrow();
    expect(host.read().source!.token).toBe(clean.token); await host.dispose();
  });
});

describe('saved Caption deletion; synthetic ports and recorded DOM only', { timeout: 15000 }, () => {
  const id = (p: string, n: number) => `${p}_${n.toString(16).padStart(32, '0')}`;
  const rawChange = (source: ProjectMetadataSource, change: (doc: any) => void) => {
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    return source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), change)));
  };
  const scalar = (v: unknown) => new A.ImmutableString(canonicalFixture(v));
  const command = (host: Awaited<ReturnType<ReturnType<typeof fixture>['open']>>): CaptionDeletionCommand => {
    const impact = host.authority.captionDeletionImpact!(host.read().source!.token, f.shared);
    return { kind: 'deleteCaption', captionId: f.shared, observedMembershipIds: impact.memberships.map(e => e.id),
      observedAttachmentIds: impact.attachments.map(e => e.id), observedTagMembershipIds: impact.tags.map(e => e.id), eventId: id('evt', 902) };
  };
  const ui = (s: SyntheticSession) => { select(s); const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s);
    return { w, root: named(record(w.root), 'キャプションの削除') }; };
  const clonePorts = async (a: ReturnType<typeof fixture>) => {
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, bytes] of a.rows) b.rows.set(key, bytes.slice()); return b;
  };
  const recoveryCommand = (host: Awaited<ReturnType<ReturnType<typeof fixture>['open']>>, state: 'active' | 'deleted', event = 980): CaptionLifecycleResolution => {
    const p = host.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    const source = captionLifecycleRecovery(p, f.shared, metadataFixtureLimits);
    return { kind: 'resolveCaptionLifecycle', captionId: f.shared, state, eventId: id('evt', event),
      observedOperationIds: source.lifecycle.candidates.map(c => c.operationId) };
  };
  const deleteAndEdit = async (host: Awaited<ReturnType<ReturnType<typeof fixture>['open']>>, lateEdge = false) => {
    const seed = host.read().source!, provider = host.read().provider!;
    let remote = seed.prepareEdit(seed.token, { kind: 'editCaption', captionId: f.shared, edits: { body: '削除と同時に届いた記録' } }, provider, '7'.repeat(32));
    if (lateEdge) remote = rawChange(remote, d => {
      const edge = Object.values(d.sceneCaptionMembershipsById).find((e: any) => String(e.captionId) === canonicalFixture(f.shared)) as any;
      d.sceneCaptionMembershipsById[id('scm', 981)] = { ...edge, id: scalar(id('scm', 981)) };
    });
    await host.authority.deleteCaption!(seed.token, command(host)); const deleted = host.read().source!;
    await host.receive(deleted.token, fullSource(remote, 981)); return { seed, deleted, remote };
  };
  it.each(['active', 'deleted'] as const)('resolves a single deleted candidate to %s, preserves all children and returns original history without duplication', async state => {
    const a = fixture(), ah = await a.open(true), b = await clonePorts(a), bh = await b.open();
    const { seed, deleted, remote } = await deleteAndEdit(ah, true);
    await bh.receive(seed.token, fullSource(remote, 981)); await bh.receive(bh.read().source!.token, fullSource(deleted, 982));
    expect(bh.read().source!.token).toBe(ah.read().source!.token);
    const before = ah.read().source!, p = ah.read().provider!; if (p.kind !== 'scene-provider') throw Error('provider');
    const impact = captionLifecycleRecovery(p, f.shared, metadataFixtureLimits);
    expect(impact.deleteEdit).toBe(true); expect(impact.lifecycle.candidates).toHaveLength(1);
    expect(impact.children.some(c => c.state === 'deleted')).toBe(true);
    expect(impact.children.some(c => c.id === id('scm', 981) && c.state === 'active')).toBe(true);
    const s = new SyntheticSession(ah.authority), scene = s.sceneId, memory = s.memory, windows = s.windowMemory;
    const controls = createMetadataReceiveControls(new RecordedDocument().asDocument(), ah, s, () => {});
    const region = named(record(controls.root), 'キャプションの削除・復元'), choice = descendants(region).find(n => n.tag === 'select')!;
    expect(choice.value).toBe(''); expect(button(region, '選択を確定').disabled).toBe(true);
    expect(descendants(region).some(n => n.textContent.includes('削除済み・復元しません'))).toBe(true);
    expect(descendants(region).some(n => n.textContent.includes('親の復元後に再表示'))).toBe(true);
    setInput(choice, state); await acknowledge(s, () => button(region, '選択を確定').fire('click')); controls.render();
    expect(s.acknowledgment.state).toBe('idle'); const after = ah.read().source!, q = ah.read().provider!;
    if (q.kind !== 'scene-provider') throw Error('provider');
    expect(after.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(q.resources.captions[f.shared]!.lifecycle).toMatchObject({ kind: 'value', value: { state, reason: state === 'active' ? 'restore' : 'conflictResolution' } });
    expect(q.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: '削除と同時に届いた記録' });
    expect(q.issues.some(i => i.code === 'concurrent-delete-edit')).toBe(false);
    // Parent recovery changes reference diagnostics, not the original child atoms.
    const untouched = (v: typeof p) => v.inspection.candidates.fields.filter(c =>
      c.path.join('/') !== `captionsById/${f.shared}/lifecycle`).map(c => ({ path: c.path, candidates: c.candidates }));
    expect(untouched(q)).toEqual(untouched(p));
    const { lifecycle: _beforeLife, ...captionBefore } = p.details.mutable.captionsById[f.shared]!;
    const { lifecycle: _afterLife, ...captionAfter } = q.details.mutable.captionsById[f.shared]!;
    expect(captionAfter).toEqual(captionBefore); expect(q.details.immutable).toEqual(p.details.immutable);
    expect(q.details.mutable.captionsById[f.second]).toEqual(p.details.mutable.captionsById[f.second]);
    expect(q.issues.some(i => i.kind === 'orphan' && i.path.includes(id('scm', 981)))).toBe(state === 'deleted');
    expect(s.composition.captions.some(c => c.captionId === f.shared)).toBe(state === 'active');
    expect(s.sceneId).toBe(scene); expect(s.memory).toBe(memory); expect(s.windowMemory).toBe(windows);
    expect(named(record(controls.root), '削除と参照の要確認').hidden).toBe(false);
    expect(descendants(region).some(n => n.textContent.includes(state === 'active' ? 'キャプションを復元しました' : '削除状態を確定しました'))).toBe(true);
    await bh.receive(bh.read().source!.token, fullSource(after, 983));
    expect(bh.read().source!.token).toBe(after.token);
    const token = after.token, count = after.originalChanges().length;
    await ah.receive(token, fullSource(bh.read().source!, 984)); await bh.receive(token, fullSource(after, 983));
    expect(ah.read().source!.originalChanges()).toHaveLength(count); expect(bh.read().source!.token).toBe(token);
    controls.dispose(); await ah.dispose(); const cold = await a.open();
    expect(cold.read().source!.token).toBe(token); expect(cold.read().source!.originalChanges()).toEqual(after.originalChanges());
    await cold.dispose(); await bh.dispose();
  });
  it('restores only the parent with competing restore/text/anchor candidates, and reuses it via a fresh Scene registration', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), media = mediaHost(s);
    await media.add(0); media.w.dispose();
    const tagged = rawChange(host.read().source!, d => {
      d.captionTagsById[id('tag', 985)] = { id: scalar(id('tag', 985)), label: scalar('確認'), orderKey: scalar('A'),
        lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 985) }) };
      d.captionTagMembershipsById[id('tgm', 985)] = { id: scalar(id('tgm', 985)), captionId: scalar(f.shared), tagId: scalar(id('tag', 985)),
        lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 985) }) };
    });
    await host.receive(host.read().source!.token, fullSource(tagged, 985));
    const { seed } = await deleteAndEdit(host);
    const one = rawChange(seed, d => {
      d.captionsById[f.shared].lifecycle = scalar({ state: 'active', reason: 'restore', eventId: id('evt', 986) });
      d.captionsById[f.shared].body = scalar('復元側の本文');
      d.captionsById[f.shared].anchor = scalar({ kind: 'project', projectFrameId: s.snapshot.resources.projectFrameId, positionProject: [2, 3, 4] });
    });
    const two = rawChange(seed, d => { d.captionsById[f.shared].anchor = scalar({ kind: 'project', projectFrameId: s.snapshot.resources.projectFrameId, positionProject: [5, 6, 7] }); });
    await host.receive(host.read().source!.token, fullSource(one.appendOriginal(two.originalChanges()), 986));
    const before = host.read().provider!; if (before.kind !== 'scene-provider') throw Error('provider');
    const recovery = captionLifecycleRecovery(before, f.shared, metadataFixtureLimits);
    expect(recovery.lifecycle.candidates).toHaveLength(2);
    expect(recovery.children.filter(c => c.state === 'deleted').map(c => c.kind)).toEqual(expect.arrayContaining(['scene', 'attachment', 'tag']));
    const bins = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.bin'));
    const bytes = await Promise.all(bins.map(p => h.base.readBytes(p)));
    await host.resolve(host.read().source!.token, recoveryCommand(host, 'active', 987)); s.refreshHistory();
    const after = host.read().provider!; if (after.kind !== 'scene-provider') throw Error('provider');
    expect(after.resources.captions[f.shared]!.body.kind).toBe('unresolved');
    expect(after.resources.captions[f.shared]!.anchor.kind).toBe('unresolved');
    expect(after.details.mutable.captionAttachmentsById).toEqual(before.details.mutable.captionAttachmentsById);
    expect(after.details.mutable.captionTagMembershipsById).toEqual(before.details.mutable.captionTagMembershipsById);
    expect(after.state.captionMemberships).toEqual(before.state.captionMemberships);
    expect(s.composition.captions.some(c => c.captionId === f.shared)).toBe(false);
    expect(await Promise.all(bins.map(p => h.base.readBytes(p)))).toEqual(bytes);
    // Existing Scene include creates a new edge; original child tombstones stay intact.
    s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId: f.shared }));
    expect(planCaptionInclude(s.includeContext(), { kind: 'include' }).kind).toBe('include');
    await acknowledge(s, () => { s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); });
    expect(s.acknowledgment.state).toBe('idle');
    const included = host.read().provider!; if (included.kind !== 'scene-provider') throw Error('provider');
    const edges = Object.values(included.state.captionMemberships).filter(e => e.resourceId === f.shared);
    expect(edges).toHaveLength(recovery.children.filter(c => c.kind === 'scene').length + 1);
    for (const child of recovery.children.filter(c => c.kind === 'scene'))
      expect(included.details.mutable.sceneCaptionMembershipsById[child.id]).toEqual(before.details.mutable.sceneCaptionMembershipsById[child.id]);
    expect(included.resources.captions[f.shared]!.body).toEqual(after.resources.captions[f.shared]!.body);
    await host.dispose();
  });
  it('retains unapplied local input, blocks IME/readonly/stale choices, and enables scalar resolution only after parent recovery', async () => {
    const h = fixture(), host = await h.open(true); let readonly = false;
    const s = new SyntheticSession({ ...host.authority, get readOnly() { return readonly; } });
    select(s); const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), detail = named(record(w.root), 'キャプションの詳細');
    setInput(named(detail, '本文'), '未適用の原稿');
    const { seed } = await deleteAndEdit(host);
    const extra = rawChange(seed, d => { d.captionsById[f.shared].body = scalar('もう一つの原文'); });
    await host.receive(host.read().source!.token, fullSource(extra, 988)); s.refreshHistory(); w.render();
    const controls = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(controls.root);
    const region = named(root, 'キャプションの削除・復元');
    let choice = descendants(region).find(n => n.tag === 'select')!;
    const textForm = descendants(root).find(n => n.tag === 'li' && descendants(n).some(c => c.tag === 'textarea'))!;
    const scalarChoice = descendants(textForm).find(n => n.tag === 'select')!;
    setInput(scalarChoice, scalarChoice.children[1]!.value); expect(button(textForm, '競合を解消').disabled).toBe(true);
    setInput(choice, 'active'); const token = host.read().source!.token, writes = h.base.writes;
    s.setSearchComposing(true); controls.render(); button(region, '選択を確定').fire('click'); expect(host.read().source!.token).toBe(token);
    s.setSearchComposing(false); readonly = true; controls.render();
    expect(button(region, '選択を確定').disabled).toBe(true); button(region, '選択を確定').fire('click'); readonly = false;
    expect(h.base.writes).toBe(writes); expect(named(detail, '本文').value).toBe('未適用の原稿');
    const other = await host.read().source!.prepareCaptionText(token, f.second, 'body', '別の変更');
    await host.receive(token, fullSource(other, 989)); s.refreshHistory(); controls.render();
    expect(choice.value).toBe('active'); expect(button(region, '選択を確定').disabled).toBe(true);
    button(region, '取り消す').fire('click'); choice = descendants(region).find(n => n.tag === 'select')!;
    expect(choice.value).toBe(''); setInput(choice, 'active');
    await acknowledge(s, () => button(region, '選択を確定').fire('click')); w.render(); controls.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(named(detail, '本文').value).toBe('未適用の原稿');
    // A selected scalar form stays stale, never auto-applies its candidate.
    expect(button(textForm, '競合を解消').disabled).toBe(true); expect(scalarChoice.value).not.toBe('');
    button(textForm, '取り消す').fire('click');
    const fresh = descendants(root).find(n => n.tag === 'li' && descendants(n).some(c => c.tag === 'textarea'))!;
    const freshChoice = descendants(fresh).find(n => n.tag === 'select')!; setInput(freshChoice, freshChoice.children[1]!.value);
    expect(button(fresh, '競合を解消').disabled).toBe(false); expect(s.pending).toBe('text');
    controls.dispose(); w.dispose(); await host.dispose();
  });
  it('recovers failed publication cold using the same lifecycle event and original bytes, with no-op retry', async () => {
    const h = fixture(), host = await h.open(true); await deleteAndEdit(host);
    const before = host.read().source!, c = recoveryCommand(host, 'active', 990);
    h.base.rejectPublication = true; await expect(host.resolve(before.token, c)).rejects.toThrow('変更を保持しています');
    expect(host.read().source!.token).toBe(before.token);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p))); await host.dispose();
    h.base.rejectPublication = false; const cold = await h.open(); expect(cold.read().state).toBe('pending');
    await cold.authority.retry!(); const after = cold.read().source!;
    expect(cold.authority.read().resources.captions[f.shared]!.lifecycle).toMatchObject({ value: { state: 'active', reason: 'restore', eventId: c.eventId } });
    expect(after.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    await cold.authority.retry!(); expect(cold.read().source!.originalChanges()).toEqual(after.originalChanges());
    await cold.dispose(); const reopened = await h.open(); expect(reopened.read().source!.token).toBe(after.token); await reopened.dispose();
  });
  it('discloses an ambiguous child without choosing its parent and retains the mounted decision until exact same-host retry', async () => {
    const h = fixture(), host = await h.open(true), media = mediaHost(new SyntheticSession(host.authority));
    await media.add(0); media.w.dispose(); await deleteAndEdit(host, true);
    const source = rawChange(host.read().source!, d => {
      const original = Object.values(d.captionAttachmentsById)[0] as any;
      d.captionAttachmentsById[id('att', 993)] = { ...original, id: scalar(id('att', 993)),
        lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 993) }) };
    });
    const branch = (captionId: string) => rawChange(source, d => {
      delete d.captionAttachmentsById[id('att', 993)].captionId;
      d.captionAttachmentsById[id('att', 993)].captionId = scalar(captionId);
    });
    await host.receive(host.read().source!.token, fullSource(branch(f.shared).appendOriginal(branch(f.second).originalChanges()), 993));
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(captionLifecycleRecovery(provider, f.shared, metadataFixtureLimits).children.find(c => c.id === id('att', 993))?.uncertain).toBe(true);
    const ui = createMetadataWorkspace(new RecordedDocument().asDocument(), host), s = ui.session!;
    const region = named(record(ui.root), 'キャプションの削除・復元'), choice = descendants(region).find(n => n.tag === 'select')!;
    expect(descendants(region).some(n => n.textContent.includes('対応先を要確認'))).toBe(true);
    setInput(choice, 'active'); expect(ui.hasChanges()).toBe(true);
    const before = host.read().source!; h.base.rejectPublication = true;
    await acknowledge(s, () => button(region, '選択を確定').fire('click')); ui.render();
    expect(s.acknowledgment.state).toBe('failed'); expect(host.read().source!.token).toBe(before.token);
    expect(choice.value).toBe('active'); expect(button(region, '取り消す').disabled).toBe(true);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p))); h.base.rejectPublication = false;
    await acknowledge(s, () => { s.retryWorking(); expect(s.acknowledgment.state).toBe('checking'); }); ui.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false);
    expect(host.read().source!.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const after = host.read().provider!; if (after.kind !== 'scene-provider') throw Error('provider');
    const edge = (p: typeof after) => p.inspection.candidates.fields.find(c => c.path.join('/') === `captionAttachmentsById/${id('att', 993)}/captionId`);
    expect(edge(after)?.candidates).toEqual(edge(provider)?.candidates); expect(edge(after)?.candidates).toHaveLength(2);
    expect(descendants(region).some(n => n.textContent.includes('キャプションの追加・除外'))).toBe(true);
    await ui.dispose();
  });
  it('refuses incomplete observations, reused events and invalid history without publication; normal tombstones are not generalized restore', async () => {
    const h = fixture(), host = await h.open(true), initial = host.read().provider!;
    if (initial.kind !== 'scene-provider') throw Error('provider');
    expect(() => captionLifecycleRecovery(initial, f.shared, metadataFixtureLimits)).toThrow('not-conflicted');
    const { seed, deleted } = await deleteAndEdit(host);
    const deletedProvider = await readProjectScene(deleted.read(), metadataFixtureLimits, host.content.verifier(false));
    if (deletedProvider.kind !== 'scene-provider') throw Error('provider');
    expect(() => captionLifecycleRecovery(deletedProvider, f.shared, metadataFixtureLimits)).toThrow('not-conflicted');
    const source = host.read().source!, provider = host.read().provider!, c = recoveryCommand(host, 'active', 991), writes = h.base.writes;
    for (const bad of [{ ...c, observedOperationIds: [] }, { ...c, observedOperationIds: [...c.observedOperationIds, ...c.observedOperationIds] },
      { ...c, observedOperationIds: ['unknown'] }, { ...c, eventId: id('evt', 902) }, { ...c, eventId: 'invalid' },
      { ...c, state: 'unknown' }, { ...c, extra: true }, { ...c, captionId: f.second }])
      expect(() => source.prepareEdit(source.token, bad as MetadataEdit, provider, '8'.repeat(32))).toThrow();
    await expect(host.resolve('stale', c)).rejects.toThrow(); expect(h.base.writes).toBe(writes);
    for (const invalid of [
      rawChange(deleted, d => { d.captionsById[f.shared].body = scalar('削除を観測した後の不正編集'); }),
      rawChange(deleted, d => { d.captionsById[f.shared].lifecycle = scalar({ state: 'active', reason: 'initial', eventId: id('evt', 992) }); }),
      rawChange(seed, d => { d.captionsById[f.shared].id = scalar(f.second); }),
      rawChange(seed, d => { d.captionsById[f.shared].future = scalar({ unknown: true }); }),
    ]) {
      const merged = source.appendOriginal(invalid.originalChanges()), p = await readProjectScene(merged.read(), metadataFixtureLimits, host.content.verifier(false));
      if (p.kind === 'scene-provider') expect(() => captionLifecycleRecovery(p, f.shared, metadataFixtureLimits)).toThrow();
      expect(() => merged.prepareEdit(merged.token, c, p, '8'.repeat(32))).toThrow();
    }
    expect(host.read().source!.token).toBe(source.token); expect(host.read().state).toBe('ready'); await host.dispose();
  });
  it('confirms every observed edge, tombstones in one change and preserves scalar candidates/shared content through reopen', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), media = mediaHost(s);
    await media.add(0); const initial = host.read().source!, edge = Object.values(s.snapshot.state.captionMemberships).find(e => e.resourceId === f.shared)!;
    const tagged = rawChange(initial, d => {
      d.captionTagsById[id('tag', 901)] = { id: scalar(id('tag', 901)), label: scalar('確認'), colorSrgb: scalar([1, 0, 0]), orderKey: scalar('A'),
        lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 901) }) };
      d.captionTagMembershipsById[id('tgm', 901)] = { id: scalar(id('tgm', 901)), captionId: scalar(f.shared), tagId: scalar(id('tag', 901)),
        lifecycle: scalar({ state: 'active', reason: 'initial', eventId: id('evt', 901) }) };
      d.sceneCaptionMembershipsById[id('scm', 901)] = { ...d.sceneCaptionMembershipsById[edge.id], id: scalar(id('scm', 901)) };
    });
    const p = await readProjectScene(tagged.read(), metadataFixtureLimits, host.content.verifier(false), { verifyRetainedMedia: true });
    const first = tagged.prepareEdit(tagged.token, { kind: 'editCaption', captionId: f.shared, edits: { title: '一方' } }, p, '1'.repeat(32));
    const second = tagged.prepareEdit(tagged.token, { kind: 'editCaption', captionId: f.shared, edits: { title: '他方' } }, p, '2'.repeat(32));
    await host.receive(initial.token, fullSource(first.appendOriginal(second.originalChanges()), 902)); s.refreshHistory(); media.w.dispose();
    const u = ui(s), before = host.read().source!, beforeView = s.snapshot, impact = host.authority.captionDeletionImpact!(before.token, f.shared);
    const binPaths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.bin'));
    const binBytes = await Promise.all(binPaths.map(p => h.base.readBytes(p))), bodyBytes = host.content.counts.bodyBytes;
    button(u.root, 'プロジェクトから削除').fire('click'); expect(s.captionDeletion?.title).toBe('タイトルに競合あり');
    expect(impact.memberships).toHaveLength(3); expect(impact.attachments).toHaveLength(1); expect(impact.tags).toHaveLength(1);
    expect(descendants(u.root).filter(n => n.tag === 'li')).toHaveLength(5);
    expect(s.media.begin(s.mediaContext(), impact.attachments[0]!.id)).toBe(false);
    await acknowledge(s, () => button(u.root, '削除する').fire('click')); u.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.captionDeletion).toBeNull(); expect(s.memory.selectedCaptionId).toBeNull();
    const after = host.read().source!, provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(after.originalChanges()).toHaveLength(before.originalChanges().length + 1);
    for (const [map, ids] of [['captionsById', [f.shared]], ['sceneCaptionMembershipsById', impact.memberships.map(e => e.id)],
      ['captionAttachmentsById', impact.attachments.map(e => e.id)], ['captionTagMembershipsById', impact.tags.map(e => e.id)]] as const)
      for (const key of ids) expect(provider.details.mutable[map][key]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted', reason: 'userDelete' } });
    expect(provider.resources.captions[f.shared]!.title.kind).toBe('unresolved');
    expect(s.snapshot.resources.captions[f.second]).toEqual(beforeView.resources.captions[f.second]);
    expect(s.snapshot.resources.assets).toEqual(beforeView.resources.assets); expect(s.composition.captions.map(c => c.captionId)).toEqual([f.second]);
    expect(provider.details.mutable.captionTagsById[id('tag', 901)]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    expect(Object.keys(provider.details.immutable.mediaResourcesById)).toHaveLength(1);
    expect(await Promise.all(binPaths.map(p => h.base.readBytes(p)))).toEqual(binBytes);
    expect(host.content.counts.bodyBytes).toBe(bodyBytes);
    u.w.dispose(); await host.dispose(); const cold = await h.open(); expect(cold.read().source!.token).toBe(after.token);
    expect(cold.authority.read().resources.captions[f.shared]!.lifecycle).toMatchObject({ value: { state: 'deleted' } }); await cold.dispose();
  });
  it('guards cancel, IME, readonly, external drafts and stale confirmation; retains old UI and retries exact failed bytes cold', async () => {
    const h = fixture(), host = await h.open(true); let external = true, readonly = false;
    const s = new SyntheticSession({ ...host.authority, get readOnly() { return readonly; } }, () => external), u = ui(s);
    expect(s.beginCaptionDeletion()).toBe(false); external = false; s.setSearchComposing(true); expect(s.beginCaptionDeletion()).toBe(false); s.setSearchComposing(false);
    readonly = true; expect(s.beginCaptionDeletion()).toBe(false); readonly = false;
    const writes = h.base.writes; expect(s.beginCaptionDeletion()).toBe(true); s.cancelCaptionDeletion(); expect(h.base.writes).toBe(writes);
    expect(s.beginCaptionDeletion()).toBe(true); external = true; expect(s.confirmCaptionDeletion()).toBe(false); external = false;
    await host.receive(s.snapshot.state.token); s.refreshHistory(); u.w.render(); expect(button(u.root, '削除する').disabled).toBe(true);
    expect(s.confirmCaptionDeletion()).toBe(false); s.cancelCaptionDeletion(); expect(s.beginCaptionDeletion()).toBe(true);
    readonly = true; expect(s.confirmCaptionDeletion()).toBe(false); readonly = false;
    const old = s.snapshot, windows = s.windowMemory; h.base.rejectPublication = true;
    await acknowledge(s, () => { s.confirmCaptionDeletion(); }); u.w.render();
    expect(s.acknowledgment.state).toBe('failed'); expect(s.snapshot).toBe(old); expect(s.windowMemory).toBe(windows);
    expect(s.memory.selectedCaptionId).toBe(f.shared); expect(s.captionDeletion).not.toBeNull(); expect(s.cancelCaptionDeletion()).toBe(false);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    u.w.dispose(); await host.dispose(); h.base.rejectPublication = false; const cold = await h.open();
    expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(cold.authority.read().resources.captions[f.shared]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes); await cold.dispose();
  });
  it('retains late edges/delete-edit in both receive orders, warns after reopen and replays without duplication', async () => {
    const a = fixture(), ah = await a.open(true), b = await clonePorts(a), bh = await b.open();
    const seed = ah.read().source!, p = ah.read().provider!;
    const updated = seed.prepareEdit(seed.token, { kind: 'editCaption', captionId: f.shared, edits: { body: '参加者の追記' } }, p, '3'.repeat(32));
    const late = rawChange(updated, d => {
      const edge = Object.values(d.sceneCaptionMembershipsById).find((e: any) => String(e.captionId) === canonicalFixture(f.shared)) as any;
      d.sceneCaptionMembershipsById[id('scm', 904)] = { ...edge, id: scalar(id('scm', 904)) };
    });
    await ah.authority.deleteCaption!(seed.token, command(ah)); const deleted = ah.read().source!;
    const edgeOnly = rawChange(seed, d => {
      const edge = Object.values(d.sceneCaptionMembershipsById).find((e: any) => String(e.captionId) === canonicalFixture(f.shared)) as any;
      d.sceneCaptionMembershipsById[id('scm', 907)] = { ...edge, id: scalar(id('scm', 907)) };
    });
    const orphan = await readProjectScene(deleted.appendOriginal(edgeOnly.originalChanges()).read(), metadataFixtureLimits, ah.content.verifier(false));
    if (orphan.kind !== 'scene-provider') throw Error('provider');
    expect(orphan.issues.some(i => i.kind === 'orphan' && i.path.includes(id('scm', 907)))).toBe(true);
    expect(orphan.details.mutable.sceneCaptionMembershipsById[id('scm', 907)]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    await ah.receive(deleted.token, fullSource(late, 905));
    await bh.receive(seed.token, fullSource(late, 905)); await bh.receive(bh.read().source!.token, fullSource(deleted, 906));
    expect(bh.read().source!.token).toBe(ah.read().source!.token);
    const provider = ah.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(provider.issues.some(i => i.code === 'concurrent-delete-edit')).toBe(true);
    expect(provider.details.mutable.sceneCaptionMembershipsById[id('scm', 904)]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    expect(provider.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: '参加者の追記' });
    const token = ah.read().source!.token, count = ah.read().source!.originalChanges().length;
    await ah.receive(token, fullSource(late, 905)); expect(ah.read().source!.token).toBe(token); expect(ah.read().source!.originalChanges()).toHaveLength(count);
    await ah.dispose(); const cold = await a.open(), s = new SyntheticSession(cold.authority), doc = new RecordedDocument();
    const controls = createMetadataReceiveControls(doc.asDocument(), cold, s, () => {});
    expect(named(record(controls.root), '削除と参照の要確認').hidden).toBe(false);
    expect(descendants(record(controls.root)).some(n => n.textContent.includes('削除と編集が競合'))).toBe(true);
    controls.dispose(); await cold.dispose(); await bh.dispose();
  });
  it('keeps local unapplied text visible after remote deletion, then allows explicit cancellation without writes', async () => {
    const a = fixture(), ah = await a.open(true), seed = ah.read().source!, b = await clonePorts(a), bh = await b.open(), sb = new SyntheticSession(bh.authority), u = ui(sb);
    const detail = named(record(u.w.root), 'キャプションの詳細'); setInput(named(detail, '本文'), 'まだ保存していない文章');
    await ah.authority.deleteCaption!(ah.read().source!.token, command(ah));
    await bh.receive(bh.read().source!.token, fullSource(ah.read().source!, 910)); sb.refreshHistory(); u.w.render();
    expect(sb.detailContext().source.kind).toBe('unavailable'); expect(named(detail, '本文').value).toBe('まだ保存していない文章');
    expect(sb.detailContext().source).toMatchObject({ reason: 'このキャプションは削除されました。' });
    expect(named(detail, '本文').readOnly).toBe(true); expect(button(detail, '変更を適用').disabled).toBe(true);
    const token = bh.read().source!.token, writes = b.base.writes;
    button(detail, '取り消す').fire('click'); button(detail, '変更を取り消す').fire('click');
    expect(sb.pending).toBeNull(); expect(sb.detailContext().draft).toBeNull(); expect(bh.read().source!.token).toBe(token); expect(b.base.writes).toBe(writes);
    const restored = rawChange(seed, d => { d.captionsById[f.shared].lifecycle = scalar({ state: 'active', reason: 'restore', eventId: id('evt', 914) }); });
    await bh.receive(token, fullSource(restored, 914)); sb.refreshHistory();
    const provider = bh.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(provider.issues.some(i => i.code === 'concurrent-delete-edit')).toBe(false);
    const controls = createMetadataReceiveControls(new RecordedDocument().asDocument(), bh, sb, () => {});
    expect(named(record(controls.root), '削除と参照の要確認').hidden).toBe(false);
    expect(descendants(record(controls.root)).some(n => n.textContent.includes('削除・復元の状態が競合'))).toBe(true); controls.dispose();
    u.w.dispose(); await ah.dispose(); await bh.dispose();
  });
  it('refuses incomplete/duplicate observed sets and ambiguous raw endpoint/lifecycle without altering the Project', async () => {
    const h = fixture(), host = await h.open(true), source = host.read().source!, provider = host.read().provider!, c = command(host);
    const invalid = [{ ...c, observedMembershipIds: [] }, { ...c, observedMembershipIds: [c.observedMembershipIds[0]!, c.observedMembershipIds[0]!] }, { ...c, extra: true }];
    for (const bad of invalid) expect(() => source.prepareEdit(source.token, bad, provider, '4'.repeat(32))).toThrow();
    expect(() => source.prepareEdit('stale', c, provider, '4'.repeat(32))).toThrow(/stale/);
    const edge = c.observedMembershipIds[0]!;
    for (const [field, firstValue, secondValue] of [['captionId', f.shared, f.second], ['sceneId', f.overview, f.detail],
      ['lifecycle', { state: 'active', reason: 'restore', eventId: id('evt', 912) }, { state: 'deleted', reason: 'userDelete', eventId: id('evt', 913) }]] as const) {
      const x = rawChange(source, d => { delete d.sceneCaptionMembershipsById[edge][field]; d.sceneCaptionMembershipsById[edge][field] = scalar(firstValue); });
      const y = rawChange(source, d => { delete d.sceneCaptionMembershipsById[edge][field]; d.sceneCaptionMembershipsById[edge][field] = scalar(secondValue); });
      const merged = x.appendOriginal(y.originalChanges()), p = await readProjectScene(merged.read(), metadataFixtureLimits, host.content.verifier(false));
      if (p.kind !== 'scene-provider') throw Error('provider'); expect(() => captionDeletionImpact(p, f.shared, metadataFixtureLimits)).toThrow();
    }
    const unknown = rawChange(source, d => { d.sceneCaptionMembershipsById[edge].captionId = scalar({ future: true }); });
    const up = await readProjectScene(unknown.read(), metadataFixtureLimits, host.content.verifier(false));
    if (up.kind !== 'scene-provider') throw Error('provider'); expect(() => captionDeletionImpact(up, f.shared, metadataFixtureLimits)).toThrow();
    expect(host.read().source!.token).toBe(source.token); await host.dispose();
  });
});

describe('saved Scene authoring; synthetic ports and recorded DOM only', () => {
  const sceneUI = (s: SyntheticSession) => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), r = named(record(w.root), 'シーンの管理');
    return { w, r, name: () => named(r, 'シーン名'),
      begin(label: string) { button(r, label).fire('click'); },
      async apply(label: string) { await acknowledge(s, () => button(r, label).fire('click')); w.render(); },
    };
  };
  it('creates a named Scene, registers Captions, renames/sets default and exchanges without resetting local memory', async () => {
    const a = fixture(), ah = await a.open(true), seed = ah.read().source!, original = ah.authority.read();
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, bytes] of a.rows) b.rows.set(key, bytes.slice());
    const bh = await b.open(), sa = new SyntheticSession(ah.authority), sb = new SyntheticSession(bh.authority);
    const ui = sceneUI(sa), ub = sceneUI(sb); select(sb);
    const windows = sb.windowMemory, memory = sb.memory;
    const detail = sb.detailContext(); sb.acceptDetail({ kind: 'draft', baseDraft: detail.draft!,
      draft: editCaptionDraft(detail.draft!, detail.source, 'body', '受信前の入力') });
    ui.begin('シーンを作成'); expect(sa.pending).toBe('text'); expect(button(ui.r, '作成').disabled).toBe(true);
    setInput(ui.name(), '  Cafe\u0301  '); await ui.apply('作成');
    expect(sa.acknowledgment.state).toBe('idle'); const id = sa.sceneId;
    expect(id).not.toBe(f.overview); expect(sa.snapshot.state.scenes[id]!.name).toEqual({ kind: 'value', value: '  Café  ' });
    expect(sa.snapshot.state.defaultSceneId).toEqual(original.state.defaultSceneId);
    expect(sa.snapshot.state.scenes[f.overview]).toEqual(original.state.scenes[f.overview]);
    expect(sa.composition.assets.map(a => a.assetId)).toEqual([f.structure, f.equipment]);
    expect(sa.composition.captions).toHaveLength(0); expect(sa.snapshot.resources).toMatchObject({ captions: original.resources.captions, views: original.resources.views, materials: original.resources.materials });
    expect(sa.snapshot.state.scenes[id]!.defaultViewId).toEqual({ kind: 'value', value: null });
    expect(sa.snapshot.state.captionMemberships).toEqual(original.state.captionMemberships);
    sa.acceptInclude(planCaptionInclude(sa.includeContext(), { kind: 'select', captionId: f.shared }));
    await acknowledge(sa, () => { sa.acceptInclude(planCaptionInclude(sa.includeContext(), { kind: 'include' })); });
    expect(sa.composition.captions.map(c => c.captionId)).toEqual([f.shared]);
    ui.begin('名前を変更'); setInput(ui.name(), '共同確認'); await ui.apply('変更');
    ui.begin('開始シーンにする'); await ui.apply('設定');
    expect(sa.snapshot.state.defaultSceneId).toEqual({ kind: 'value', value: id });
    expect(sa.sceneId).toBe(id);
    const changed = ah.read().source!; await bh.receive(seed.token, fullSource(changed, 931)); sb.refreshHistory(); ub.w.render();
    expect(sb.sceneId).toBe(f.overview); expect(sb.windowMemory).toBe(windows); expect(sb.memory).toBe(memory);
    expect(sb.detailContext().draft?.edits.body).toBe('受信前の入力');
    sb.acceptDetail({ kind: 'cancel', draft: sb.detailContext().draft! });
    expect(sb.acceptNavigation(planNavigation(sb.snapshot.state, sb.session, sb.pending, { kind: 'scene', sceneId: id }))).toBe(true);
    ub.w.render(); expect(sb.captionContext().source.kind).toBe('ready'); expect(sb.windowMemory.sceneId).toBe(id);
    ub.begin('名前を変更'); setInput(ub.name(), '参加者から返送'); await ub.apply('変更');
    await ah.receive(changed.token, fullSource(bh.read().source!, 932)); sa.refreshHistory(); ui.w.render();
    expect(sa.snapshot.state.scenes[id]!.name).toEqual({ kind: 'value', value: '参加者から返送' });
    const heads = ah.read().source!.heads, writes = a.base.writes;
    await ah.receive(ah.read().source!.token, fullSource(changed, 931)); expect(a.base.writes).toBe(writes);
    ui.w.dispose(); ub.w.dispose(); await ah.dispose(); await bh.dispose();
    const cold = await a.open(), cs = new SyntheticSession(cold.authority);
    expect(cold.read().source!.heads).toEqual(heads); expect(cs.sceneId).toBe(id); expect(cs.composition.captions).toHaveLength(1);
    await cold.dispose();
  }, 30_000);

  it('retains composing/stale Scene input and exact new IDs across failed publication and cold recovery', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = sceneUI(s);
    const before = host.read().source!; ui.begin('シーンを作成'); setInput(ui.name(), '保存する確認');
    ui.name().fire('compositionstart'); expect(s.pending).toBe('composition'); expect(button(ui.r, '作成').disabled).toBe(true);
    expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(false);
    expect(s.applySceneAuthoring()).toBe(false); expect(host.read().source!.token).toBe(before.token);
    ui.name().fire('compositionend'); h.base.rejectPublication = true; await ui.apply('作成');
    expect(s.acknowledgment.state).toBe('failed'); expect(s.sceneId).toBe(f.overview); expect(s.sceneAuthoringDraft!.name).toBe('保存する確認');
    expect(Object.keys(s.snapshot.state.scenes)).toHaveLength(2);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    ui.w.dispose(); await host.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const cs = new SyntheticSession(cold.authority), ci = sceneUI(cs);
    expect(Object.keys(cs.snapshot.state.scenes)).toHaveLength(3); expect(cs.sceneId).toBe(f.overview);
    const count = cold.read().source!.originalChanges().length;
    ci.begin('名前を変更'); setInput(ci.name(), '保持する名前');
    const current = cold.read().source!, remote = await current.prepareCaptionText(current.token, f.shared, 'body', '同時受信');
    await cold.receive(current.token, fullSource(remote, 933)); cs.refreshHistory(); ci.w.render();
    expect(ci.name().value).toBe('保持する名前'); expect(button(ci.r, '変更').disabled).toBe(true);
    expect(cs.applySceneAuthoring()).toBe(false); expect(cold.read().source!.originalChanges()).toHaveLength(count + 1);
    button(ci.r, '取り消す').fire('click'); expect(cs.pending).toBeNull();
    const readonly = await h.open(), rs = new SyntheticSession(readonly.authority), ri = sceneUI(rs);
    expect(button(ri.r, 'シーンを作成').disabled).toBe(true); expect(rs.beginSceneAuthoring('create')).toBe(false);
    ri.w.dispose(); await readonly.dispose(); ci.w.dispose(); await cold.dispose();
  }, 30_000);

  it('rejects ambiguous raw memberships and conflicting name/default without writes, and preserves equal-key source order', async () => {
    const h = fixture(), host = await h.open(true), source = host.read().source!, provider = host.read().provider!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const command = { kind: 'createScene' as const, sceneId: `scn_${'d'.repeat(32)}`, sourceSceneId: f.overview, activeSceneId: f.overview,
      name: '新しい確認', orderKey: 'Z', membershipIds: [`sam_${'e'.repeat(32)}`, `sam_${'d'.repeat(32)}`], eventId: `evt_${'e'.repeat(32)}` };
    const writes = h.base.writes;
    for (const invalid of [{ ...command, activeSceneId: f.detail }, { ...command, name: '  ' }, { ...command, name: '不正\n改行' },
      { ...command, sceneId: f.overview }, { ...command, membershipIds: [command.membershipIds[0]!, command.membershipIds[0]!] },
      { ...command, membershipIds: [] }, { ...command, extra: true }])
      await expect(host.authority.authorScene!(source.token, invalid)).rejects.toThrow();
    await expect(host.authority.authorScene!('stale', command)).rejects.toThrow();
    expect(h.base.writes).toBe(writes); expect(host.read().state).toBe('ready');
    const [doc] = A.applyChanges(A.init<any>(), source.originalChanges());
    const changed = (fn: (d: any) => void) => source.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), fn)));
    const read = (s: ProjectMetadataSource) => readProjectScene(s.read(), metadataFixtureLimits, host.content.verifier(false));
    const sam = Object.values(provider.state.assetMemberships).find(e => e.sceneId === f.overview)!.id;
    const one = changed(d => { d.sceneAssetMembershipsById[sam].sceneId = new A.ImmutableString(JSON.stringify(f.detail)); });
    const two = changed(d => { delete d.sceneAssetMembershipsById[sam].sceneId; d.sceneAssetMembershipsById[sam].sceneId = new A.ImmutableString(JSON.stringify(f.overview)); });
    const ambiguous = one.appendOriginal(two.originalChanges()), ap = await read(ambiguous);
    expect(() => ambiguous.prepareEdit(ambiguous.token, command, ap, 'c'.repeat(32))).toThrow();
    const unknown = changed(d => { d.sceneAssetMembershipsById[sam].future = new A.ImmutableString('true'); }), up = await read(unknown);
    expect(() => unknown.prepareEdit(unknown.token, command, up, 'c'.repeat(32))).toThrow();
    for (const field of ['name', 'default'] as const) {
      const branch = (value: string) => changed(d => {
        if (field === 'name') d.scenesById[f.overview].name = new A.ImmutableString(JSON.stringify(value));
        else { delete d.project.defaultSceneId; d.project.defaultSceneId = new A.ImmutableString(JSON.stringify(value)); }
      });
      const conflict = branch(field === 'name' ? '名前1' : f.overview).appendOriginal(branch(field === 'name' ? '名前2' : f.detail).originalChanges());
      const cp = await read(conflict), edit = field === 'name' ? { kind: 'renameScene' as const, sceneId: f.overview, name: '自動選択しない' } :
        { kind: 'setDefaultScene' as const, sceneId: f.overview };
      expect(() => conflict.prepareEdit(conflict.token, edit, cp, 'c'.repeat(32))).toThrow();
    }
    const equalOrder = changed(d => { for (const edge of Object.values(d.sceneAssetMembershipsById) as any[])
      if (edge.sceneId.toString() === JSON.stringify(f.overview)) edge.orderKey = new A.ImmutableString('"A"'); });
    const ep = await read(equalOrder); if (ep.kind !== 'scene-provider') throw Error('provider');
    const expected = Object.values(ep.state.assetMemberships).filter(e => e.sceneId === f.overview).sort((a, b) => a.id < b.id ? -1 : 1).map(e => e.resourceId);
    const created = equalOrder.prepareEdit(equalOrder.token, command, ep, 'c'.repeat(32)), cp = await read(created);
    if (cp.kind !== 'scene-provider') throw Error('provider');
    const copied = Object.values(cp.state.assetMemberships).filter(e => e.sceneId === command.sceneId)
      .sort((a, b) => (a.orderKey as { value: string }).value < (b.orderKey as { value: string }).value ? -1 : 1);
    expect(copied.map(e => e.resourceId)).toEqual(expected); expect(copied[0]!.orderKey).not.toEqual(copied[1]!.orderKey);
    expect(cp.state.defaultSceneId).toEqual(ep.state.defaultSceneId); expect(cp.state.captionMemberships).toEqual(ep.state.captionMemberships);
    await host.dispose();
  });

  it('ends an existing Scene IME draft after readonly transition without allowing any metadata write', async () => {
    const h = fixture(), host = await h.open(true); let readOnly = false;
    const s = new SyntheticSession({ ...host.authority, get readOnly() { return readOnly; } }), ui = sceneUI(s);
    ui.begin('シーンを作成'); setInput(ui.name(), '入力'); ui.name().fire('compositionstart');
    const token = host.read().source!.token, writes = h.base.writes;
    readOnly = true; ui.w.render(); ui.name().value = '入力完了'; ui.name().fire('compositionend');
    expect(s.sceneAuthoringDraft).toMatchObject({ name: '入力完了', composing: false });
    expect(button(ui.r, '作成').disabled).toBe(true); expect(s.applySceneAuthoring()).toBe(false);
    expect(button(ui.r, '取り消す').disabled).toBe(false); button(ui.r, '取り消す').fire('click');
    expect(s.sceneAuthoringDraft).toBeNull(); expect(host.read().source!.token).toBe(token); expect(h.base.writes).toBe(writes);
    ui.w.dispose(); await host.dispose();
  });
});

describe('saved Caption position/color conflict resolution; synthetic ports and recorded DOM only', () => {
  it('causally resolves absent/absent color candidates once, including exact cold retry and recipient replay', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!;
    const receiver = fixture();
    for (const path of await h.base.list(`${metadataArea}/${h.run}/`)) await receiver.base.writeBytes(path, (await h.base.readBytes(path))!);
    for (const [key, data] of h.rows) receiver.rows.set(key, data.slice());
    const [doc] = A.applyChanges(A.init<any>(), seed.originalChanges());
    const first = A.change(A.clone(doc), d => { delete d.captionsById[f.shared].colorSrgb; });
    const second = A.change(A.clone(doc), d => { delete d.captionsById[f.shared].colorSrgb; });
    const merged = seed.appendOriginal([...A.getChanges(doc, first), ...A.getChanges(doc, second)]);
    const input = fullSource(merged, 921); await host.receive(seed.token, input);
    const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const choices = captionFieldCandidates(provider, f.shared, 'colorSrgb', metadataFixtureLimits);
    expect(choices).toHaveLength(2); expect(choices.every(c => c.value.kind === 'absent')).toBe(true);
    h.base.rejectPublication = true;
    await expect(host.resolve(merged.token, { kind: 'resolveCaptionField', captionId: f.shared,
      field: 'colorSrgb', operationId: choices[0]!.operationId })).rejects.toThrow();
    expect(host.read().source!.token).toBe(merged.token);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    await host.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const resolved = cold.read().source!;
    expect(resolved.originalChanges()).toHaveLength(merged.originalChanges().length + 1);
    const inspection = await inspectProjectCandidates(resolved.read(), metadataFixtureLimits);
    if (inspection.kind !== 'project-candidate-inspection') throw Error('inspection');
    const field = inspection.fields.find(fld => fld.path.join('/') === `captionsById/${f.shared}/colorSrgb`)!;
    expect(field.candidates).toHaveLength(1); expect(field.candidates[0]!.value).toEqual({ kind: 'absent' });
    const [physical] = A.applyChanges(A.init<any>(), resolved.originalChanges());
    expect(Object.hasOwn(physical.captionsById[f.shared], 'colorSrgb')).toBe(false);
    const count = h.base.writes; await cold.receive(resolved.token, input); expect(h.base.writes).toBe(count);
    const reopened = await receiver.open();
    await reopened.receive(seed.token, fullSource(resolved, 922)); expect(reopened.read().source!.heads).toEqual(resolved.heads);
    const rp = reopened.read().provider!; if (rp.kind !== 'scene-provider') throw Error('provider');
    expect(rp.details.mutable.captionsById[f.shared]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    await reopened.receive(resolved.token, input); expect(reopened.read().source!.heads).toEqual(resolved.heads);
    await reopened.dispose(); await cold.dispose();
  });

  it.each(['anchor', 'colorSrgb'] as const)('chooses complete %s candidates, previews without authority, retries and returns editable data', async field => {
    const a = fixture(), seedHost = await a.open(true); await seedHost.dispose();
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, bytes] of a.rows) b.rows.set(key, bytes.slice());
    const ah = await a.open(), bh = await b.open(), sa = new SyntheticSession(ah.authority), sb = new SyntheticSession(bh.authority);
    let display: SyntheticDisplay | undefined;
    const doc = new RecordedDocument().asDocument(), wa = createDevelopmentWorkspace(doc, sa, { viewportFactory: () => ({
      update(next) { if (next.readOnly) throw Error('expected editor display'); display = next; }, setActive() {}, read: () => ({ token: 'comparison', ready: true, issue: null, dragging: false,
        projection: 'perspective', axis: null, pins: [], preview: { x: 20, y: 30, visible: true } }), camera() {}, retry() {}, dispose() {},
    }) });
    const wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
    select(sa); select(sb);
    if (field === 'anchor') { await correctPin(sa, [1, 2, 3]); await correctPin(sb, [3, 2, 1]); }
    else { await apply(sa, { color: '#334455' }); await apply(sb, { color: '#abcdef' }); }
    await apply(sa, { body: '手元の本文を保持' });
    const remote = fullSource(bh.read().source!, 901);
    await ah.receive(ah.read().source!.token, remote); sa.refreshHistory(); wa.render();
    const conflicted = ah.read().source!, provider = ah.read().provider!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const candidates = captionFieldCandidates(provider, f.shared, field, metadataFixtureLimits);
    expect(candidates).toHaveLength(2);
    const chosen = candidates[1]!, command = { kind: 'resolveCaptionField' as const, captionId: f.shared, field, operationId: chosen.operationId };
    const ui = createMetadataReceiveControls(doc, ah, sa, wa.render), root = record(ui.root);
    const form = named(root, '未解決の候補').children.find(n => descendants(n).some(n => n.textContent.includes(field === 'anchor' ? 'ピン位置' : 'ピンの色')))!;
    const selectChoice = descendants(form).find(n => n.tag === 'select')!, confirm = button(form, '競合を解消');
    expect(selectChoice.value).toBe(''); expect(confirm.disabled).toBe(true); expect(sa.captionComparisonPreview).toBeNull();
    expect(selectChoice.children.some(n => n.value === 'manual')).toBe(false);
    expect(display!.pins.some(p => p.id === f.shared)).toBe(false);
    const writes = a.base.writes; setInput(selectChoice, chosen.operationId); wa.render();
    expect(a.base.writes).toBe(writes); expect(ah.read().source!.token).toBe(conflicted.token);
    if (field === 'anchor') {
      expect(display!.preview).toBeDefined(); expect(display!.pinEdit).toBeUndefined();
      expect(record(wa.root).children.length).toBeGreaterThan(0);
      const marker = descendants(record(wa.root)).find(n => n.className === 'lv-development-pin-preview')!;
      expect(marker.textContent).toBe('候補 2（未確定）'); expect(display!.pins.some(p => p.id === f.shared)).toBe(false);
      button(form, '取り消す').fire('click'); wa.render(); expect(display!.preview).toBeUndefined();
      const again = named(root, '未解決の候補').children[0]!;
      expect(sa.acceptModel(planModelList(sa.modelContext(), { kind: 'visibility', action: 'hide', assetId: f.equipment }))).toBe(true);
      setInput(descendants(again).find(n => n.tag === 'select')!, chosen.operationId); wa.render();
      expect(sa.captionComparisonPreview).toBeNull(); expect(display!.preview).toBeUndefined();
      expect(descendants(again).some(n => n.textContent.includes('モデルが非表示'))).toBe(true);
      expect(sa.hiddenAssetIds).toContain(f.equipment); expect(a.base.writes).toBe(writes);
      button(again, '取り消す').fire('click');
      expect(sa.acceptModel(planModelList(sa.modelContext(), { kind: 'visibility', action: 'show', assetId: f.equipment }))).toBe(true);
      setInput(descendants(named(root, '未解決の候補').children[0]!).find(n => n.tag === 'select')!, chosen.operationId);
    }
    const freshForm = named(root, '未解決の候補').children[0]!;
    a.base.rejectPublication = true; await acknowledge(sa, () => button(freshForm, '競合を解消').fire('click'));
    expect(sa.acknowledgment.state).toBe('failed'); expect(ah.read().source!.token).toBe(conflicted.token);
    const parts = (await a.base.list(`${metadataArea}/${a.run}/`)).filter(p => p.endsWith('.amchange'));
    const originalParts = await Promise.all(parts.map(p => a.base.readBytes(p)));
    a.base.rejectPublication = false; await acknowledge(sa, () => { sa.retryWorking(); }); wa.render(); ui.render();
    expect(sa.acknowledgment.state).toBe('idle'); expect(await Promise.all(parts.map(p => a.base.readBytes(p)))).toEqual(originalParts);
    const resolved = ah.read().provider!; if (resolved.kind !== 'scene-provider') throw Error('provider');
    expect(resolved.details.mutable.captionsById[f.shared]![field]).toEqual({ kind: 'value', value: chosen.value.kind === 'value' ? chosen.value.value : undefined });
    expect(ah.read().source!.originalChanges()).toHaveLength(conflicted.originalChanges().length + 1);
    expect(sa.snapshot.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: '手元の本文を保持' });
    expect(sa.snapshot.state.captionMemberships).toEqual(provider.state.captionMemberships);
    if (field === 'anchor') await correctPin(sa, [4, 2, 3]); else { select(sa); await apply(sa, { color: '#123456' }); }
    await bh.receive(bh.read().source!.token, fullSource(ah.read().source!, 902)); sb.refreshHistory();
    expect(sb.snapshot.resources.captions[f.shared]).toEqual(sa.snapshot.resources.captions[f.shared]);
    if (field === 'anchor') await correctPin(sb, [5, 2, 3]); else { select(sb); await apply(sb, { color: '#654321' }); }
    await ah.receive(ah.read().source!.token, fullSource(bh.read().source!, 903)); sa.refreshHistory();
    const received = ah.read().source!, count = a.base.writes;
    await ah.receive(received.token, remote); expect(a.base.writes).toBe(count); expect(ah.read().source!.token).toBe(received.token);
    // A stale command cannot repeat the earlier choice after subsequent edits.
    await expect(ah.resolve(conflicted.token, command)).rejects.toThrow(); expect(ah.read().state).toBe('ready');
    const finalHeads = received.heads; ui.dispose(); wa.dispose(); wb.dispose(); await ah.dispose(); await bh.dispose();
    const cold = await a.open(); expect(cold.read().source!.heads).toEqual(finalHeads); expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  }, 30_000);

  it('keeps explicit color absence through save/reopen, resumes editing, and rejects incomplete/lifecycle/stale choices without writes', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!;
    const [doc] = A.applyChanges(A.init<any>(), seed.originalChanges());
    const absent = A.change(A.clone(doc), d => { delete d.captionsById[f.shared].colorSrgb; });
    const present = A.change(A.clone(doc), d => { d.captionsById[f.shared].colorSrgb = new A.ImmutableString('[0.2,0.4,0.6]'); });
    const merged = seed.appendOriginal([...A.getChanges(doc, absent), ...A.getChanges(doc, present)]);
    await host.receive(seed.token, fullSource(merged, 911));
    const s = new SyntheticSession(host.authority), provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const candidates = captionFieldCandidates(provider, f.shared, 'colorSrgb', metadataFixtureLimits);
    const choice = candidates.find(c => c.value.kind === 'absent')!;
    const command = { kind: 'resolveCaptionField' as const, captionId: f.shared, field: 'colorSrgb' as const, operationId: choice.operationId };
    const source = host.read().source!, writes = h.base.writes;
    for (const invalid of [{ ...command, operationId: 'missing' }, { ...command, field: 'title' }, { ...command, captionId: f.second }])
      await expect(host.resolve(source.token, invalid as typeof command)).rejects.toThrow();
    const unknownProvider = { ...provider, inspection: { ...provider.inspection, candidates: { ...provider.inspection.candidates,
      fields: provider.inspection.candidates.fields.map(fld => fld.path.join('/') === `captionsById/${f.shared}/colorSrgb` ? { ...fld, hasUnknownFields: true } : fld) } } };
    expect(() => source.prepareEdit(source.token, command, unknownProvider, 'c'.repeat(32))).toThrow();
    const blockedProvider = { ...provider, issues: [...provider.issues, { path: ['captionsById', f.shared], code: 'concurrent-delete-edit', kind: 'review' as const }] };
    expect(() => source.prepareEdit(source.token, command, blockedProvider, 'c'.repeat(32))).toThrow();
    const reader = await h.open(); await expect(reader.resolve(source.token, command)).rejects.toThrow(); await reader.dispose();
    expect(h.base.writes).toBe(writes);
    await host.resolve(source.token, command); s.refreshHistory(); select(s);
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), root = record(w.root);
    expect(s.snapshot.unsetCaptionColors).toContain(f.shared);
    expect(s.detailContext().source).toMatchObject({ kind: 'ready', caption: { color: { kind: 'value', value: '' } } });
    expect(descendants(root).some(n => n.textContent.includes('未設定（標準色で表示）'))).toBe(true);
    await apply(s, { body: '色を補完しない' });
    const current = host.read().provider!; if (current.kind !== 'scene-provider') throw Error('provider');
    expect(current.details.mutable.captionsById[f.shared]!.colorSrgb).toEqual({ kind: 'value', value: undefined });
    w.dispose(); await host.dispose(); const cold = await h.open(), cs = new SyntheticSession(cold.authority); select(cs);
    expect(cs.snapshot.unsetCaptionColors).toContain(f.shared);
    const cw = createDevelopmentWorkspace(new RecordedDocument().asDocument(), cs), cr = record(cw.root);
    const picker = named(cr, '色を選択'); setInput(picker, '#334455'); setInput(picker, '#a08045');
    await acknowledge(cs, () => button(cr, '変更を適用').fire('click')); cw.render();
    expect(cs.acknowledgment.state).toBe('idle'); expect(cs.snapshot.unsetCaptionColors).not.toContain(f.shared);
    const final = cold.read().provider!; if (final.kind !== 'scene-provider') throw Error('provider');
    expect(final.details.mutable.captionsById[f.shared]!.colorSrgb).toEqual({ kind: 'value', value: [160 / 255, 128 / 255, 69 / 255] });
    cw.dispose(); await cold.dispose();
  });
});
async function updateModel(s: SyntheticSession) {
  selectModel(s); const c = s.modelUpdateContext(), version = c.choices[0]!;
  await acknowledge(s, () => { s.acceptModelUpdate({ token: c.token, sceneId: c.sceneId,
    assetId: c.assetId!, bindingId: version.projection.bindingId }); });
}
async function correctPin(s: SyntheticSession, position: readonly [number, number, number]) {
  expect(select(s)).toBe(true);
  expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
  expect(s.acceptPinSurface(s.pinSurfaceTarget()!, position, true)).toBe(true);
  const plan = planPinMode(s.pinContext(), { kind: 'finish' });
  await acknowledge(s, () => { s.acceptPin(plan); });
  expect(s.acknowledgment.state).toBe('idle');
}
function modelCopyCommand(host: Awaited<ReturnType<typeof openMetadataHost>>): AssetMembershipResolution {
  const provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
  const g = assetMembershipGroups(provider, metadataFixtureLimits)[0]!, source = assetCopySource(provider, g.sceneId, g.assetId, metadataFixtureLimits);
  const model = readMetadataModel(source.asset.assetFrameId as string, source.binding, source.revision, source.representation);
  let n = 3000; const fresh = (prefix: string) => `${prefix}_${(++n).toString(16).padStart(32, '0')}`;
  return { kind: 'resolveAssetMembership', sceneId: g.sceneId, assetId: g.assetId, observedMembershipIds: g.edgeIds,
    originalMembershipId: g.edgeIds[0]!, choice: 'both', eventId: fresh('evt'), copies: g.edgeIds.slice(1).map(sourceMembershipId => {
      const ids = allocateModelCopyIds(fixtureModelIds(model), fresh), copy = createFixtureModel(ids, model.shape, model.binding.assetToProject, undefined, model.binding.method);
      const { slot, ...rootIds } = ids;
      return { sourceMembershipId, ids: { ...rootIds, membership: fresh('sam') },
        slots: [{ sourceId: source.materials[0]!.sourceId, targetId: slot, materialId: source.materials[0]!.material ? fresh('ovr') : null }],
        binding: JSON.parse(canonicalFixture(copy.binding)), revision: JSON.parse(canonicalFixture(copy.revision)), representation: JSON.parse(canonicalFixture(copy.representation)) };
    }) };
}
async function conflictingModel(h: ReturnType<typeof fixture>) {
  const host = await h.open(true), s = new SyntheticSession(host.authority);
  s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
  await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.structure, included: true })); });
  await host.receive(host.read().source!.token, undefined, 'assetMembership'); s.refreshHistory();
  return { host, s, command: modelCopyCommand(host) };
}

describe('saved explicit model status resolution; synthetic ports/DOM only', { timeout: 15_000 }, () => {
  it.each([0, 1])('chooses complete candidate %s, preserves Caption data and retries exact bytes; unseen update conflicts again', async index => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), media = mediaHost(s);
    await media.add(0); media.w.dispose(); const seed = host.read().source!;
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s); select(s); await apply(s, { body: '手元の記録を保持' });
    selectModel(s); const initial = s.modelUpdateContext().current!.closure;
    expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement(['6', '2', '1']);
    await acknowledge(s, () => { s.finishModelPlacement(); });
    const records = s.snapshot.resources.captions, attachments = s.snapshot.mediaData;
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    setInput(picker(root, '受信する合成更新'), 'model');
    await acknowledge(s, () => button(root, '開発用の更新を受け取る').fire('click'));
    expect(host.read().state).toBe('ready'); expect(s.snapshot.resources.assets[f.equipment]!.projection.kind).toBe('unresolved');
    for (const scene of [f.overview, f.detail]) expect(syntheticDisplay(s.snapshot, scene, null, null).models.some(m => m.binding.assetId === f.equipment)).toBe(false);
    const source = host.read().source!, provider = host.read().provider!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const candidates = assetStatusCandidates(provider, f.equipment, metadataFixtureLimits); expect(candidates).toHaveLength(2);
    const list = named(root, 'モデルの競合'), choice = picker(list, '残すモデルと配置'), confirm = button(list, 'このモデルと配置を使う');
    expect(choice.value).toBe(''); expect(confirm.disabled).toBe(true); expect(ui.hasChanges()).toBe(false);
    expect(descendants(list).some(n => n.textContent.includes('6 / 2 / 1'))).toBe(true);
    const selected = candidates[index]!; setInput(choice, selected.operationId); expect(ui.hasChanges()).toBe(true);
    expect(confirm.disabled).toBe(false); expect(s.snapshot.resources.assets[f.equipment]!.projection.kind).toBe('unresolved');
    h.base.rejectPublication = true; await acknowledge(s, () => confirm.fire('click'));
    expect(s.acknowledgment.state).toBe('failed'); expect(choice.value).toBe(selected.operationId);
    expect(host.read().source!.token).toBe(source.token);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p))), prepared = source.appendOriginal(bytes.map(b => b!));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false); expect(list.children).toHaveLength(0);
    expect(host.read().source!.token).toBe(prepared.token); expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    expect(host.read().source!.originalChanges()).toHaveLength(source.originalChanges().length + 1);
    expect(s.snapshot.resources.captions).toEqual(records); expect(s.snapshot.mediaData).toEqual(attachments);
    const bound = s.snapshot.resources.assets[f.equipment]!.projection;
    expect(bound).toMatchObject({ kind: 'value', value: { bindingId: selected.binding.id, revisionId: selected.revision.id } });
    for (const scene of [f.overview, f.detail]) expect(syntheticDisplay(s.snapshot, scene, null, null).models.find(m => m.binding.assetId === f.equipment)!.binding).toEqual(selected.binding);
    const frozen = host.read().source!.originalChanges(); ui.dispose(); w.dispose(); await host.dispose();
    const cold = await h.open(); expect(cold.read().source!.originalChanges()).toEqual(frozen);
    const count = h.base.writes; await cold.receive(cold.read().source!.token, undefined, 'model');
    expect(h.base.writes).toBe(count); expect(cold.read().source!.originalChanges()).toEqual(frozen);
    // An edit from before resolution is unseen, not a later serial overwrite.
    const binding = moveFixtureModel(initial, `bnd_${'d'.repeat(32)}`, [9, 3, 2]).binding;
    const earlierProvider = await readProjectScene(seed.read(), metadataFixtureLimits, cold.content.verifier(false));
    const unseen = seed.prepareEdit(seed.token, { kind: 'moveAsset', sceneId: f.overview, assetId: f.equipment,
      expectedBindingId: initial.binding.id, binding: JSON.parse(canonicalFixture(binding)) }, earlierProvider, 'e'.repeat(32));
    await cold.receive(cold.read().source!.token, fullSource(unseen, 99));
    expect(cold.read().state).toBe('ready'); expect(cold.authority.read().resources.assets[f.equipment]!.projection.kind).toBe('unresolved');
    expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('retains stale selections and IME drafts, and rejects invalid/readonly choices without journaling', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s); select(s); await apply(s, { title: '手元のタイトル' });
    selectModel(s); s.beginModelPlacement(); s.changeModelPlacement(['6', '2', '1']); await acknowledge(s, () => { s.finishModelPlacement(); });
    await host.receive(host.read().source!.token, undefined, 'model'); s.refreshHistory();
    await host.receive(host.read().source!.token); s.refreshHistory();
    const source = host.read().source!, provider = host.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    const candidates = assetStatusCandidates(provider, f.equipment, metadataFixtureLimits), operationId = candidates[0]!.operationId;
    const command = { kind: 'resolveAssetStatus' as const, assetId: f.equipment, operationId };
    const writes = h.base.writes, repoWrites = h.fault.writes;
    for (const invalid of [{ ...command, operationId: '' }, { ...command, assetId: f.structure }])
      await expect(host.resolve(source.token, invalid)).rejects.toThrow();
    await expect(host.resolve('stale', command)).rejects.toThrow();
    expect(h.base.writes).toBe(writes); expect(h.fault.writes).toBe(repoWrites); expect(host.read().state).toBe('ready');
    expect(() => assetStatusCandidates(provider, f.equipment, { ...metadataFixtureLimits, maxWork: provider.inspection.workUsed })).toThrow(/limit/);
    const statusField = provider.inspection.candidates.fields.find(fld => fld.path.join('/') === `assetsById/${f.equipment}/status`)!;
    const malformed = { ...provider, inspection: { ...provider.inspection, candidates: { ...provider.inspection.candidates,
      fields: provider.inspection.candidates.fields.map(fld => fld === statusField ? { ...fld, hasUnknownFields: true } : fld) } } };
    expect(() => source.prepareEdit(source.token, command, malformed, 'f'.repeat(32))).toThrow();
    const reader = await h.open(); await expect(reader.resolve(source.token, command)).rejects.toThrow(/閲覧専用/); await reader.dispose();
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root), list = named(root, 'モデルの競合');
    const choice = picker(list, '残すモデルと配置'), confirm = button(list, 'このモデルと配置を使う');
    setInput(choice, operationId);
    const texts = named(root, '未解決の候補'), method = descendants(texts).find(n => n.tag === 'select')!;
    setInput(method, 'manual'); const text = descendants(texts).find(n => n.tag === 'textarea')!;
    setInput(text, '編集中'); text.fire('compositionstart'); expect(confirm.disabled).toBe(true);
    confirm.fire('click'); expect(host.read().source!.token).toBe(source.token); text.fire('compositionend'); expect(confirm.disabled).toBe(false);
    const remote = await source.prepareCaptionText(source.token, f.shared, 'body', '後から届いた本文');
    await host.receive(source.token, fullSource(remote, 88)); s.refreshHistory(); ui.render();
    expect(choice.value).toBe(operationId); expect(confirm.disabled).toBe(true); expect(text.value).toBe('編集中');
    expect(descendants(list).some(n => n.textContent.includes('内容が更新されています'))).toBe(true);
    button(list, '選択を取り消す').fire('click'); expect(picker(list, '残すモデルと配置').value).toBe('');
    ui.dispose(); w.dispose(); await host.dispose();
  });
});

describe('saved prepared model activation and two-participant loop; synthetic evidence only', () => {
  it('requires explicit choice, preserves placement/records and corrects only the selected pin after update', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), media = mediaHost(s);
    await media.add(0); media.w.dispose();
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), root = record(w.root);
    selectModel(s); button(root, 'モデル').fire('click'); w.render();
    expect(s.beginModelPlacement()).toBe(true); expect(s.changeModelPlacement(['6', '2', '1'])).toBe(true);
    await acknowledge(s, () => { s.finishModelPlacement(); }); w.render();
    const before = s.snapshot, source = host.read().source!, current = s.modelUpdateContext().current!.closure;
    const choose = picker(root, '更新する合成モデル'), confirm = button(root, 'このモデルに更新');
    expect(confirm.disabled).toBe(true); setInput(choose, choose.children[1]!.value);
    expect(confirm.disabled).toBe(false); expect(s.snapshot).toBe(before);
    setInput(choose, ''); expect(confirm.disabled).toBe(true); expect(host.read().source!.token).toBe(source.token);
    setInput(choose, choose.children[1]!.value); h.base.rejectPublication = true;
    await acknowledge(s, () => confirm.fire('click')); w.render(); expect(s.acknowledgment.state).toBe('failed');
    expect(s.snapshot).toBe(before); expect(host.read().source!.token).toBe(source.token);
    const parts = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(parts.map(p => h.base.readBytes(p)));
    const prepared = source.appendOriginal(bytes.map(b => b!));
    const targetProvider = await readProjectScene(prepared.read(), metadataFixtureLimits, host.content.verifier(false));
    if (targetProvider.kind !== 'scene-provider') throw Error('prepared update');
    const pendingBinding = targetProvider.resources.assets[f.equipment]!.projection;
    expect(pendingBinding.kind).toBe('value');
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); }); w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(host.read().source!.token).toBe(prepared.token);
    expect(await Promise.all(parts.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const updated = s.modelUpdateContext().current!.closure;
    expect(updated.binding.id).toBe(pendingBinding.kind === 'value' ? pendingBinding.value.bindingId : undefined);
    expect(updated.binding.id).not.toBe(s.modelUpdateContext().choices[0]!.projection.bindingId);
    expect(updated.binding).toMatchObject({ parentBindingId: current.binding.id, method: 'manual', assetToProject: current.binding.assetToProject });
    expect(updated.shape).toBe('updated'); expect(s.modelUpdateContext().current!.label).toBe('形状を更新したモデル');
    expect(s.snapshot.resources.captions).toEqual(before.resources.captions);
    expect(s.snapshot.mediaData).toEqual(before.mediaData);
    expect(s.snapshot.state.captionMemberships).toEqual(before.state.captionMemberships);
    for (const scene of [f.overview, f.detail]) expect(syntheticDisplay(s.snapshot, scene, null, null).models.find(m => m.binding.assetId === f.equipment)!.revision.id).toBe(updated.revision.id);
    expect(s.composition.captions.find(c => c.captionId === f.shared)!.marker).toBe('needsReview');
    await correctPin(s, [3, 2, 1]);
    expect(s.composition.captions.find(c => c.captionId === f.shared)!.marker).toBe('visible');
    expect(s.snapshot.resources.captions[f.shared]!.anchor).toMatchObject({ value: { positionAsset: [3, 2, 1], authoredAssetRevisionId: updated.revision.id } });
    expect(s.snapshot.resources.captions[f.second]).toEqual(before.resources.captions[f.second]);
    const history = host.read().source!.originalChanges(); w.dispose(); await host.dispose();
    const cold = await h.open(); expect(cold.read().state).toBe('ready'); expect(cold.read().source!.originalChanges()).toEqual(history);
    expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('refuses unverified inactive targets before journal, preserves old ready state and never repairs facts on reopen', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); selectModel(s);
    const seed = host.read().source!, provider = host.read().provider!, ctx = s.modelUpdateContext(), target = ctx.choices[0]!;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(() => metadataImmutableReader(provider, { ...metadataFixtureLimits, maxWork: provider.inspection.workUsed })).toThrow(/work/);
    const closure = createFixtureModel({ ...fixtureModelIds(target.closure), binding: `bnd_${'c'.repeat(32)}` }, 'updated',
      ctx.current!.closure.binding.assetToProject, ctx.current!.projection.bindingId);
    const command: Extract<MetadataEdit, { kind: 'activatePreparedRevision' }> = { kind: 'activatePreparedRevision', sceneId: f.overview,
      assetId: f.equipment, expectedBindingId: ctx.current!.projection.bindingId, revisionId: target.projection.revisionId,
      binding: JSON.parse(canonicalFixture(closure.binding)) };
    for (const invalid of [{ ...command, expectedBindingId: target.projection.bindingId }, { ...command, assetId: f.structure },
      { ...command, binding: { ...command.binding, id: ctx.current!.projection.bindingId } },
      { ...command, binding: { ...command.binding, assetToProject: { ...closure.binding.assetToProject, translation: [9, 9, 9] } } }])
      expect(() => seed.prepareEdit(seed.token, invalid, provider, 'd'.repeat(32))).toThrow();
    const remote = seed.prepareEdit(seed.token, command, provider, 'd'.repeat(32));
    const facts = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/evidence/'));
    const targetFacts: string[] = [];
    for (const path of facts) if ((await h.base.readText(path))!.includes(target.closure.representation.id)) targetFacts.push(path);
    expect(targetFacts.length).toBeGreaterThan(0); for (const path of targetFacts) await h.base.remove(path);
    const files = await h.base.list(`${metadataArea}/${h.run}/`), writes = h.base.writes, repoWrites = h.fault.writes, bytes = host.content.counts.bodyBytes;
    await updateModel(s);
    expect(s.acknowledgment.state).toBe('idle'); expect(s.acknowledgment.error).toBeTruthy();
    expect(host.read().state).toBe('ready'); expect(host.read().source!.token).toBe(seed.token); expect(s.retryWorking()).toBe(false);
    await expect(host.receive(seed.token, fullSource(remote, 1))).rejects.toThrow();
    await host.authority.retry!(); expect(host.read().state).toBe('ready');
    expect(await h.base.list(`${metadataArea}/${h.run}/`)).toEqual(files); expect(h.base.writes).toBe(writes); expect(h.fault.writes).toBe(repoWrites);
    expect(host.content.counts.bodyBytes).toBe(bytes); await host.dispose();
    const cold = await h.open(); expect(cold.read().state).toBe('ready'); expect(cold.read().source!.token).toBe(seed.token);
    for (const path of targetFacts) expect(await h.base.exists(path)).toBe(false);
    expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('exchanges two saved model/pin rounds with local text, exact interrupted recovery and no-op replay', async () => {
    const a = fixture(), first = await a.open(true), initial = new SyntheticSession(first.authority), media = mediaHost(initial);
    await media.add(0); media.w.dispose(); const original = first.read().source!.originalChanges(); await first.dispose();
    // Independent synthetic device storage copied at distribution; not a package encoder or wire acceptance.
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, value] of a.rows) b.rows.set(key, value.slice());
    let ah = await a.open(), bh = await b.open(), sa = new SyntheticSession(ah.authority), sb = new SyntheticSession(bh.authority);
    let wa = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sa), wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
    const attachment = captionAttachments(sa.snapshot.mediaData, f.shared).ready[0]!.id;
    for (let round = 1; round <= 2; round++) {
      select(sb); await apply(sb, { body: `参加者の記録${round}` }); select(sa); await apply(sa, { title: `担当者の記録${round}` });
      const oldAnchor = sb.snapshot.resources.captions[f.shared]!.anchor;
      await updateModel(sa); expect(sa.acknowledgment.state).toBe('idle');
      const send = fullSource(ah.read().source!, round * 2), before = bh.read().source!;
      if (round === 1) {
        b.base.rejectPublication = true; await expect(bh.receive(before.token, send)).rejects.toThrow();
        expect(bh.read().source!.token).toBe(before.token); expect(bh.read().state).toBe('pending');
        const parts = (await b.base.list(`${metadataArea}/${b.run}/`)).filter(p => p.endsWith('.amchange'));
        const bytes = await Promise.all(parts.map(p => b.base.readBytes(p)));
        wb.dispose(); await bh.dispose(); b.base.rejectPublication = false; bh = await b.open();
        expect(bh.read().state).toBe('pending'); await bh.authority.retry!();
        expect(await Promise.all(parts.map(p => b.base.readBytes(p)))).toEqual(bytes);
        sb = new SyntheticSession(bh.authority); wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
      } else { await bh.receive(before.token, send); sb.refreshHistory(); }
      expect(sb.snapshot.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: `参加者の記録${round}` });
      expect(sb.snapshot.resources.captions[f.shared]!.anchor).toEqual(oldAnchor);
      expect(sb.composition.captions.find(c => c.captionId === f.shared)!.marker).toBe('needsReview');
      await correctPin(sb, [round, 2, 3]);
      const reply = fullSource(bh.read().source!, round * 2 + 1);
      await ah.receive(ah.read().source!.token, reply); sa.refreshHistory();
      expect(sa.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: `担当者の記録${round}` });
      expect(sa.snapshot.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: `参加者の記録${round}` });
      expect(sa.composition.captions.find(c => c.captionId === f.shared)!.marker).toBe('visible');
      expect(captionAttachments(sa.snapshot.mediaData, f.shared).ready[0]!.id).toBe(attachment);
      const heads = ah.read().source!.heads, writes = a.base.writes;
      await ah.receive(ah.read().source!.token, reply); expect(ah.read().source!.heads).toEqual(heads); expect(a.base.writes).toBe(writes);
      expect(heads).toEqual(bh.read().source!.heads);
      for (const originalPart of original) expect(ah.read().source!.originalChanges()).toContainEqual(originalPart);
      wa.dispose(); wb.dispose(); await ah.dispose(); await bh.dispose();
      ah = await a.open(); bh = await b.open(); sa = new SyntheticSession(ah.authority); sb = new SyntheticSession(bh.authority);
      wa = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sa); wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
      expect(ah.read().source!.heads).toEqual(heads); expect(bh.read().source!.heads).toEqual(heads);
      expect(ah.content.counts.bodyBytes).toBe(0); expect(bh.content.counts.bodyBytes).toBe(0);
    }
    wa.dispose(); wb.dispose(); await ah.dispose(); await bh.dispose();
  }, 20000);
});

describe('saved model translation; synthetic storage/DOM evidence only', () => {
  it('prepares declared model versions without publishing a preparation candidate', async () => {
    const h = fixture(), host = await h.open(true);
    expect(host.read().state).toBe('ready');
    const s = new SyntheticSession(host.authority); selectModel(s);
    expect(host.read().source!.originalChanges()).toHaveLength(2);
    expect(s.modelUpdateContext().current!.closure.shape).toBe('original');
    expect(s.modelUpdateContext().choices.map(v => v.closure.shape)).toEqual(['updated']);
    const provider = host.read().provider!;
    expect(provider.kind).toBe('scene-provider');
    if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(provider.issues.some(i => i.code === 'verified-profile-content-bounds-catalog-required')).toBe(true);
    expect(metadataProviderReady(provider, metadataFixtureLimits)).toBe(true);
    const inactiveRep = s.modelUpdateContext().choices[0]!.closure.representation.id;
    // Readiness follows all active roots/strong candidate edges, never current Scene or a chosen winner.
    const candidates = provider.inspection.candidates;
    expect(metadataProviderReady({ ...provider, inspection: { ...provider.inspection, candidates: { ...candidates,
      knownActiveRoots: [...candidates.knownActiveRoots, inactiveRep] } } }, metadataFixtureLimits)).toBe(false);
    expect(metadataProviderReady({ ...provider, inspection: { ...provider.inspection, candidates: { ...candidates,
      knownReferences: [...candidates.knownReferences, { ...candidates.knownReferences[0]!,
        from: candidates.knownActiveRoots[0]!, to: inactiveRep, strength: 'strong' }] } } }, metadataFixtureLimits)).toBe(false);
    const history = host.read().source!.originalChanges(), facts = await h.base.list(`${metadataArea}/${h.run}/`);
    expect(facts.filter(p => p.includes('/evidence/')).length).toBeGreaterThan(0);
    await host.dispose(); const cold = await h.open();
    expect(cold.read().source!.originalChanges()).toEqual(history); expect(cold.content.counts.bodyBytes).toBe(0);
    await cold.dispose();
  });

  it('retains an old seed without prepared revisions or body replenishment, and keeps placement editable', async () => {
    const h = fixture(), seed = createMetadataFixture(h.run), inspection = await inspectProjectCandidates(seed.read(), metadataFixtureLimits);
    if (inspection.kind !== 'project-candidate-inspection') throw Error('seed');
    const records = structuredClone(inspection.unambiguousRecords) as Record<string, any>;
    for (const v of metadataPreparedModels.filter(v => v.closure.shape === 'updated')) {
      delete records.assetBindingsById[v.projection.bindingId]; delete records.assetRevisionsById[v.projection.revisionId];
      delete records.representationsById[v.closure.representation.id];
    }
    const old = ProjectMetadataSource.bootstrap(records.schema, records.identity, metadataFixtureLimits).initialize(records);
    const lease = await ProjectMutationCoordinator.local().tryAcquire(h.base, `${metadataArea}/${h.run}`, `old-seed:${h.run}`);
    lease.activateNewProject(); await underWriteLease(lease.workspace, () => writeMetadataSeed(lease.workspace, old));
    lease.beginClose(); await lease.waitForWorkspaceIdle(); lease.sealWorkspaceWritesForRelease(); lease.release();
    const host = await h.open(true), s = new SyntheticSession(host.authority); selectModel(s);
    expect(s.modelUpdateContext().choices).toHaveLength(0); expect(s.beginModelPlacement()).toBe(true); expect(s.finishModelPlacement()).toBe(true);
    const files = await h.base.list(`${metadataArea}/${h.run}/`);
    expect(files.filter(p => p.includes('fixture-content/') && p.endsWith('.bin'))).toHaveLength(1);
    expect(host.read().source!.originalChanges()).toEqual(old.originalChanges());
    await host.dispose();
  });
  it('connects mounted preview/cancel/confirm, consecutive bindings and shared-Scene cold reopen without model body reads', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    const original = s.snapshot, changes = host.read().source!.originalChanges().length, count = host.content.counts.bodyBytes;
    let display: ReturnType<typeof syntheticDisplay> | undefined;
    let propose: Parameters<import('../../src/harness/projectScene/viewportHost').ViewportFactory>[3];
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { viewportFactory: (_canvas, _changed, _pin, model) => {
      propose = model; return { update: d => { if (d.readOnly) throw Error('expected editor display'); display = d; }, setActive() {}, camera() {}, retry() {}, dispose() {},
        read: () => ({ token: 'viewport', ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }) };
    } });
    const root = record(w.root); button(root, 'モデル').fire('click'); selectModel(s); w.render();
    const begin = button(root, 'モデルの配置を編集'); expect(begin.hidden).toBe(false); expect(begin.disabled).toBe(false);
    begin.fire('click'); const proposal = display!.modelEdit!;
    expect(propose!(proposal.target, [6, 2, 1])).toBe(true); expect(s.snapshot).toBe(original);
    expect(display!.modelEdit!.position).toEqual([6, 2, 1]); expect(host.read().source!.originalChanges()).toHaveLength(changes);
    button(root, '配置を取り消す').fire('click'); expect(display!.modelEdit).toBeUndefined(); expect(s.snapshot).toBe(original);
    let parent = s.modelUpdateContext().current!.closure.binding.id;
    for (const position of [[6, 2, 1], [7, 3, 2]] as const) {
      begin.fire('click'); expect(propose!(display!.modelEdit!.target, position)).toBe(true);
      await acknowledge(s, () => button(root, '配置を確定').fire('click')); w.render();
      expect(s.acknowledgment.state).toBe('idle'); expect(s.modelPlacement).toBeNull();
      const current = s.modelUpdateContext().current!.closure;
      expect(current.binding).toMatchObject({ parentBindingId: parent, method: 'manual', assetToProject: { translation: position } });
      expect(current.revision).toEqual(original.modelVersions!.find(v => v.assetId === f.equipment)!.closure.revision);
      parent = current.binding.id;
      for (const sceneId of [f.overview, f.detail]) expect(syntheticDisplay(s.snapshot, sceneId, null, null).models.find(m => m.binding.assetId === f.equipment)!.binding.assetToProject.translation).toEqual(position);
    }
    expect(s.snapshot.resources.captions).toEqual(original.resources.captions);
    expect(s.snapshot.state.assetMemberships).toEqual(original.state.assetMemberships);
    expect(s.snapshot.state.captionMemberships).toEqual(original.state.captionMemberships);
    expect(host.content.counts.bodyBytes).toBe(count); expect(host.read().source!.originalChanges()).toHaveLength(changes + 2);
    const reader = await h.open(), readSession = new SyntheticSession(reader.authority); selectModel(readSession);
    expect(readSession.beginModelPlacement()).toBe(false); await reader.dispose(); w.dispose(); await host.dispose();
    const cold = await h.open(), reopened = new SyntheticSession(cold.authority); selectModel(reopened);
    expect(reopened.modelUpdateContext().current!.closure.binding.id).toBe(parent);
    expect(reopened.modelUpdateContext().current!.closure.binding.assetToProject.translation).toEqual([7, 3, 2]);
    expect(reopened.modelUpdateContext().choices.map(v => v.closure.shape)).toEqual(['updated']); expect(cold.content.counts.bodyBytes).toBe(0);
    expect(reopened.beginModelPlacement()).toBe(true); expect(reopened.finishModelPlacement()).toBe(true);
    expect(cold.read().source!.originalChanges()).toHaveLength(changes + 2); await cold.dispose();
  });

  it('retains the same prepared binding, draft and original bytes until publication retry', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); selectModel(s);
    const original = s.snapshot, changes = host.read().source!.originalChanges().length, count = host.content.counts.bodyBytes;
    s.beginModelPlacement(); s.changeModelPlacement(['6', '2', '1']); h.base.rejectPublication = true;
    await acknowledge(s, () => { s.finishModelPlacement(); });
    expect(s.acknowledgment.state).toBe('failed'); expect(s.snapshot).toBe(original);
    const binding = s.modelPlacement!.prepared!.binding.id;
    expect(s.modelPlacementProposal()!.enabled).toBe(false); expect(s.changeModelPlacement(['8', '2', '1'])).toBe(false);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(s.modelPlacement).toBeNull();
    expect(s.modelUpdateContext().current!.closure.binding.id).toBe(binding);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    expect(host.read().source!.originalChanges()).toHaveLength(changes + 1); expect(host.content.counts.bodyBytes).toBe(count);
    await host.authority.retry!(); expect(host.read().source!.originalChanges()).toHaveLength(changes + 1);
    await host.dispose(); const cold = await h.open();
    expect(cold.authority.read().modelVersions!.find(v => v.assetId === f.equipment)!.closure.binding.id).toBe(binding); await cold.dispose();
  });

  it('refuses stale/hidden/conflicting/unknown/reused bindings and non-translation or geometry intents', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!, provider = host.read().provider!;
    const prior = host.authority.read().modelVersions!.find(v => v.assetId === f.equipment)!.closure;
    const closure = moveFixtureModel(prior, `bnd_${'d'.repeat(32)}`, [6, 2, 1]), tx = 'c'.repeat(32);
    const command: Extract<MetadataEdit, { kind: 'moveAsset' }> = { kind: 'moveAsset', sceneId: f.overview, assetId: f.equipment,
      expectedBindingId: prior.binding.id, binding: JSON.parse(canonicalFixture(closure.binding)) };
    const read = (source: ProjectMetadataSource) => readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    expect(() => seed.prepareEdit('stale', command, provider, tx)).toThrow(/stale/);
    expect(() => seed.prepareEdit(seed.token, { ...command, expectedBindingId: `bnd_${tx}` }, provider, tx)).toThrow(/stale/);
    for (const fields of [{ id: prior.binding.id }, { assetId: f.structure }, { assetRevisionId: `rev_${tx}` },
      { assetToProject: { ...closure.binding.assetToProject, uniformScale: 2 } }]) {
      expect(() => seed.prepareEdit(seed.token, { ...command, binding: JSON.parse(canonicalFixture({ ...command.binding, ...fields })) as JsonObject }, provider, tx)).toThrow();
    }
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const edge = Object.values(provider.state.assetMemberships).find(e => e.sceneId === f.overview && e.resourceId === f.equipment)!;
    const hidden = seed.prepareEdit(seed.token, { kind: 'exclude', resourceKind: 'asset', membershipId: edge.id, eventId: `evt_${tx}` }, provider, tx);
    const hiddenProvider = await read(hidden); expect(() => hidden.prepareEdit(hidden.token, command, hiddenProvider, tx)).toThrow(/stale/);
    const a = seed.prepareEdit(seed.token, command, provider, tx);
    const b = seed.prepareEdit(seed.token, { ...command, binding: JSON.parse(canonicalFixture(moveFixtureModel(prior, `bnd_${'e'.repeat(32)}`, [7, 2, 1]).binding)) }, provider, 'e'.repeat(32));
    const conflict = a.appendOriginal(b.originalChanges()), conflictProvider = await read(conflict);
    expect(() => conflict.prepareEdit(conflict.token, command, conflictProvider, tx)).toThrow();
    expect(metadataProjectView(conflictProvider).modelVersions!.some(v => v.assetId === f.equipment)).toBe(false);
    const raw = A.applyChanges(A.init<any>(), seed.originalChanges())[0];
    const unknownBinding = { ...prior.binding, future: true };
    const digest = fixtureRecordDigest('asset-binding-revision', unknownBinding);
    const changed = A.change(A.clone(raw), d => { d.assetBindingsById[prior.binding.id] = new A.ImmutableString(canonicalFixture({ ...unknownBinding, payloadDigest: digest })); });
    const unknown = ProjectMetadataSource.reopen(A.getAllChanges(changed), seed.proof, metadataFixtureLimits), unknownProvider = await read(unknown);
    expect(() => unknown.prepareEdit(unknown.token, command, unknownProvider, tx)).toThrow();
    expect(metadataProjectView(unknownProvider).modelVersions!.some(v => v.assetId === f.equipment)).toBe(false);
    const changedGeometry = { ...closure, shape: 'updated' };
    const writes = h.base.writes;
    await expect(host.authority.write(seed.token, { [`asset/${f.equipment}/binding`]: closure.binding.id,
      [modelClosureKey(closure.binding.id)]: canonicalFixture(changedGeometry) }, { sceneId: f.overview })).rejects.toThrow();
    expect(h.base.writes).toBe(writes); expect(host.read().source!.token).toBe(seed.token); await host.dispose();
  });
});
describe('M07 saved model rotation and positive uniform scale', () => {
  it('connects degree/scale controls, invalid input and IME guards, cancel and exact saved cold reopen without body reads', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); selectModel(s);
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), root = record(w.root);
    const original = s.snapshot, before = s.modelUpdateContext().current!.closure, bytes = host.content.counts.bodyBytes, n = host.read().source!.originalChanges().length;
    button(root, 'モデルの配置を編集').fire('click'); const strip = area(root, 'モデル配置・開発用');
    const rotation = named(strip, '回転Z（度）'), scale = named(strip, '倍率');
    button(strip, '回転').fire('click'); expect(rotation.parentElement!.hidden).toBe(false); expect(scale.parentElement!.hidden).toBe(true);
    rotation.fire('compositionstart'); setInput(rotation, '90'); w.render();
    expect(button(strip, '回転').disabled).toBe(true); expect(s.finishModelPlacement()).toBe(false);
    rotation.fire('compositionend'); button(strip, '均等拡縮').fire('click'); setInput(scale, '-1'); w.render();
    expect(s.modelPlacementProposal()).toBeUndefined(); expect(s.finishModelPlacement()).toBe(false);
    expect(s.snapshot).toBe(original); expect(scale.value).toBe('-1');
    setInput(scale, '2'); button(strip, '回転').fire('click'); w.render();
    expect(s.modelPlacementProposal()!.manipulation!.mode).toBe('rotate');
    expect(s.modelPlacementProposal()!.manipulation!.uniformScale).toBe(2);
    expect(s.snapshot).toBe(original); button(strip, '配置を取り消す').fire('click');
    expect(s.modelPlacement).toBeNull(); expect(host.read().source!.originalChanges()).toHaveLength(n);
    button(root, 'モデルの配置を編集').fire('click');
    button(strip, '回転').fire('click'); setInput(rotation, '90'); button(strip, '均等拡縮').fire('click'); setInput(scale, '2');
    await acknowledge(s, () => button(strip, '配置を確定').fire('click')); w.render();
    expect(s.acknowledgment.state).toBe('idle'); const saved = s.modelUpdateContext().current!.closure;
    expect(saved.binding.assetToProject.rotationXYZW).toEqual(degreesRotation(['0', '0', '90']));
    expect(saved.binding.assetToProject.uniformScale).toBe(2); expect(saved.binding.parentBindingId).toBe(before.binding.id);
    expect(saved.representation).toEqual(before.representation); expect(saved.revision).toEqual(before.revision);
    expect(s.snapshot.resources.captions).toEqual(original.resources.captions);
    expect(s.snapshot.state.assetMemberships).toEqual(original.state.assetMemberships);
    for (const scene of [f.overview, f.detail]) expect(syntheticDisplay(s.snapshot, scene, null, null).models.find(m => m.binding.assetId === f.equipment)!.binding).toEqual(saved.binding);
    expect(host.read().source!.originalChanges()).toHaveLength(n + 1); expect(host.content.counts.bodyBytes).toBe(bytes);
    w.dispose(); await host.dispose(); const cold = await h.open(), c = new SyntheticSession(cold.authority); selectModel(c);
    expect(c.modelUpdateContext().current!.closure.binding).toEqual(saved.binding); expect(cold.content.counts.bodyBytes).toBe(0);
    c.beginModelPlacement(); c.changeModelTransform(c.modelPlacement!.angles, c.modelPlacement!.scale);
    expect(c.finishModelPlacement()).toBe(true); expect(cold.read().source!.originalChanges()).toHaveLength(n + 1);
    await cold.dispose();
  });
  it('retains full transform/original changes on failed publication and exchanges two saved rounds without duplicate history', async () => {
    const a = fixture(), initial = await a.open(true); await initial.dispose();
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, bytes] of a.rows) b.rows.set(key, bytes.slice());
    const ah = await a.open(), bh = await b.open(), sa = new SyntheticSession(ah.authority), sb = new SyntheticSession(bh.authority); selectModel(sa); selectModel(sb);
    const old = sa.snapshot; sa.beginModelPlacement(); sa.changeModelTransform(['20', '30', '40'], '3'); a.base.rejectPublication = true;
    await acknowledge(sa, () => { sa.finishModelPlacement(); }); expect(sa.acknowledgment.state).toBe('failed'); expect(sa.snapshot).toBe(old);
    const prepared = sa.modelPlacement!.prepared!, paths = (await a.base.list(`${metadataArea}/${a.run}/`)).filter(p => p.endsWith('.amchange'));
    const savedBytes = await Promise.all(paths.map(p => a.base.readBytes(p)));
    expect(sa.changeModelTransform(['0', '0', '0'], '1')).toBe(false);
    a.base.rejectPublication = false; await acknowledge(sa, () => { sa.retryWorking(); });
    expect(sa.modelUpdateContext().current!.closure.binding).toEqual(prepared.binding);
    expect(await Promise.all(paths.map(p => a.base.readBytes(p)))).toEqual(savedBytes);
    await bh.receive(bh.read().source!.token, fullSource(ah.read().source!, 970)); sb.refreshHistory();
    expect(sb.modelUpdateContext().current!.closure.binding).toEqual(prepared.binding);
    sb.beginModelPlacement(); sb.changeModelTransform(['40', '50', '60'], '4'); await acknowledge(sb, () => { sb.finishModelPlacement(); });
    await ah.receive(ah.read().source!.token, fullSource(bh.read().source!, 971)); sa.refreshHistory();
    expect(sa.modelUpdateContext().current!.closure.binding).toEqual(sb.modelUpdateContext().current!.closure.binding);
    const n = ah.read().source!.originalChanges().length;
    await ah.receive(ah.read().source!.token, fullSource(bh.read().source!, 971)); expect(ah.read().source!.originalChanges()).toHaveLength(n);
    const final = sa.modelUpdateContext().current!.closure.binding; await ah.dispose(); await bh.dispose();
    const cold = await a.open(); expect(cold.authority.read().modelVersions!.find(v => v.assetId === f.equipment)!.closure.binding).toEqual(final); await cold.dispose();
  });
  it('preserves exact original quaternion on cancellation and rejects invalid/stale transform commands and old-host authoring', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); selectModel(s);
    const prior = readFixtureModel(canonicalFixture(s.modelUpdateContext().current!.closure)), rotation = [0, 0, 0, 1 - 2e-13] as const;
    const bound = createFixtureModel({ ...fixtureModelIds(prior), binding: `bnd_${'4'.repeat(32)}` }, prior.shape,
      { ...prior.binding.assetToProject, rotationXYZW: rotation }, prior.binding.id);
    await host.authority.write(s.snapshot.state.token, { [`asset/${f.equipment}/binding`]: bound.binding.id,
      [modelClosureKey(bound.binding.id)]: canonicalFixture(bound) }, { sceneId: f.overview }); s.refreshHistory();
    const n = host.read().source!.originalChanges().length; s.beginModelPlacement(); s.setModelTransformMode('rotate'); const p = s.modelPlacementProposal()!;
    s.acceptModelPosition(p.target, p.position, { mode: 'rotate', rotationXYZW: degreesRotation(['0', '0', '30']), uniformScale: p.manipulation!.uniformScale });
    expect(s.acceptModelPosition(p.target, p.position, p.manipulation)).toBe(true);
    expect(s.modelPlacement!.rotation).toEqual(rotation); expect(s.finishModelPlacement()).toBe(true); expect(host.read().source!.originalChanges()).toHaveLength(n);
    const source = host.read().source!, provider = host.read().provider!;
    const next = createFixtureModel({ ...fixtureModelIds(bound), binding: `bnd_${'5'.repeat(32)}` }, bound.shape,
      { ...bound.binding.assetToProject, rotationXYZW: degreesRotation(['0', '20', '0']), uniformScale: 2 }, bound.binding.id);
    const cmd = { kind: 'transformAsset' as const, sceneId: f.overview, assetId: f.equipment, expectedBindingId: bound.binding.id, binding: next.binding as unknown as JsonObject };
    expect(() => source.prepareEdit('stale', cmd, provider, 'f'.repeat(32))).toThrow();
    for (const transform of [{ ...next.binding.assetToProject, uniformScale: 0 }, { ...next.binding.assetToProject, uniformScale: -2 },
      { ...next.binding.assetToProject, rotationXYZW: [0, 0, 0, -1] }, { ...next.binding.assetToProject, rotationXYZW: [0, 0, 0, 2] }]) {
      const binding = { ...next.binding, assetToProject: transform }; const invalid = { ...binding, payloadDigest: fixtureRecordDigest('asset-binding-revision', binding) };
      expect(() => source.prepareEdit(source.token, { ...cmd, binding: invalid }, provider, 'f'.repeat(32))).toThrow();
    }
    const readOnly = await h.open(), rs = new SyntheticSession(readOnly.authority); selectModel(rs); expect(rs.beginModelPlacement()).toBe(false);
    let becameReadonly = false;
    const guarded = new SyntheticSession({ ...host.authority, get readOnly() { return becameReadonly; } }); selectModel(guarded);
    const ui = createDevelopmentWorkspace(new RecordedDocument().asDocument(), guarded), root = record(ui.root);
    button(root, 'モデルの配置を編集').fire('click'); button(root, '回転').fire('click');
    const input = named(root, '回転Z（度）'); input.fire('compositionstart'); input.value = '25'; input.fire('input');
    becameReadonly = true; ui.render(); input.value = '35'; input.fire('compositionend');
    expect(guarded.modelPlacement!.composing).toBe(false); expect(guarded.modelPlacement!.angles[2]).toBe('35');
    expect(input.value).toBe('35'); expect(button(root, '配置を確定').disabled).toBe(true); expect(guarded.finishModelPlacement()).toBe(false);
    button(root, '配置を取り消す').fire('click'); expect(guarded.modelPlacement).toBeNull(); expect(host.read().source!.originalChanges()).toHaveLength(n); ui.dispose();
    const old = new SyntheticSession(); selectModel(old); old.beginModelPlacement(); expect(old.setModelTransformMode('rotate')).toBe(false);
    expect(old.changeModelTransform(rotationDegrees(rotation), '2')).toBe(false); await readOnly.dispose(); await host.dispose();
  });
});
async function apply(s: SyntheticSession, edits: { title?: string; body?: string; color?: string }) {
  for (const [name, text] of Object.entries(edits)) {
    const ctx = s.detailContext();
    const draft = editCaptionDraft(ctx.draft!, ctx.source, name as 'title' | 'body' | 'color', text);
    expect(s.acceptDetail({ kind: 'draft', baseDraft: ctx.draft!, draft })).toBe(true);
  }
  const plan = planCaptionApply(s.detailContext()); if (plan.kind !== 'apply') throw Error(plan.reason);
  await acknowledge(s, () => { s.acceptDetail(plan); });
}
function mediaHost(s: SyntheticSession) {
  select(s); const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), root = record(w.root), panel = area(root, 'メディア');
  return { w, root, panel, async add(index: number) {
    button(named(panel, 'メディアを選択'), fixtureMedia[index]!.record.label).fire('click');
    await acknowledge(s, () => button(panel, '選択したメディアを添付').fire('click')); w.render();
  }, async remove() {
    button(panel, '添付を削除').fire('click');
    const confirm = descendants(panel).find(n => n.tag === 'section' && n.children.some(c => c.textContent.includes('画像本体と別キャプション')))!;
    await acknowledge(s, () => button(confirm, '添付を削除').fire('click')); w.render();
  } };
}

describe('new synthetic saved host (memory ports and recorded DOM, not real browser/iOS acceptance)', { timeout: 15_000 }, () => {
  it('rejects incomplete model copy remaps before journaling, preserves inactive missing evidence and refuses prepared-fact repair', async () => {
    const h = fixture(), { host, command } = await conflictingModel(h), source = host.read().source!, provider = host.read().provider!;
    const copy = command.copies![0]!, baseWrites = [h.base.writes, h.fault.writes];
    const invalid: AssetMembershipResolution[] = [
      { ...command, copies: [] }, { ...command, copies: [{ ...copy, ids: { ...copy.ids, assetFrame: 'frm_' + '3'.padStart(32, '0') } }] },
      { ...command, copies: [{ ...copy, ids: { ...copy.ids, family: copy.ids.asset } }] },
      { ...command, copies: [{ ...copy, representation: { ...copy.representation, role: 'pointPrimary' } }] },
      { ...command, copies: [{ ...copy, binding: { ...copy.binding, parentBindingId: 'bnd_' + '1'.padStart(32, '0') } }] },
      { ...command, copies: [{ ...copy, revision: { ...copy.revision, extra: true } }] },
      { ...command, copies: [{ ...copy, slots: copy.slots.map(s => ({ ...s, materialId: 'ovr_' + 'e'.repeat(32) })) }] },
      { ...command, copies: [{ ...copy, slots: [] }] },
      { ...command, copies: [{ ...copy, slots: [copy.slots[0]!, copy.slots[0]!] }] },
    ];
    for (const bad of invalid) await expect(host.resolve(source.token, bad)).rejects.toThrow();
    await expect(host.resolve(source.token, { ...command, copies: [{ ...copy, representation: { ...copy.representation, payloadDigest: 'f'.repeat(64) } }] })).rejects.toThrow();
    expect([h.base.writes, h.fault.writes]).toEqual(baseWrites); expect(host.read().state).toBe('ready');
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const fields = provider.inspection.candidates.fields.map(field => field.path[0] === 'representationsById' && field.path[1] === 'rep_' + '1'.padStart(32, '0') ? { ...field, hasUnknownFields: true } : field);
    expect(() => source.prepareEdit(source.token, command, { ...provider, inspection: { ...provider.inspection, candidates: { ...provider.inspection.candidates, fields } } }, 'd'.repeat(32))).toThrow();
    // An old inactive missing receipt must not be silently regenerated by the new-record path.
    const old = metadataPreparedModels.find(v => v.assetId === f.structure && v.closure.shape === 'updated')!.closure.representation.id;
    const oldPaths: string[] = [];
    for (const path of await h.base.list(`${metadataArea}/${h.run}/`)) if (path.includes('/evidence/') && (await h.base.readText(path))!.includes(old)) oldPaths.push(path);
    for (const path of oldPaths) await h.base.remove(path);
    { // A prepared-copy publication failure retains exact originals but does not permit fact repair.
      h.base.rejectPublication = true; await expect(host.resolve(source.token, command)).rejects.toThrow();
      expect(host.read().state).toBe('pending'); const preparedFacts: string[] = [];
      for (const path of await h.base.list(`${metadataArea}/${h.run}/`)) if (path.includes('/evidence/') && (await h.base.readText(path))!.includes(copy.ids.representation)) preparedFacts.push(path);
      expect(preparedFacts).toHaveLength(2); for (const path of oldPaths) expect(await h.base.exists(path)).toBe(false);
      await h.base.remove(preparedFacts[0]!); h.base.rejectPublication = false;
      const reads = host.content.counts.bodyBytes; await expect(host.authority.retry!()).rejects.toThrow();
      expect(await h.base.exists(preparedFacts[0]!)).toBe(false); expect(host.content.counts.bodyBytes).toBe(reads);
      expect(host.read().source!.token).toBe(source.token); await host.dispose();
      const cold = await h.open(); await expect(cold.authority.retry!()).rejects.toThrow();
      expect(await h.base.exists(preparedFacts[0]!)).toBe(false); expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
    }
  });

  it('retries a partial new-model fact preparation with the same copy IDs and no acknowledged fact replenishment', async () => {
    const h = fixture(), { host, command } = await conflictingModel(h), source = host.read().source!, copy = command.copies![0]!;
    h.base.rejectEvidenceAfter = 1; await expect(host.resolve(source.token, command)).rejects.toThrow();
    expect(host.read().state).toBe('pending'); expect(host.read().source!.token).toBe(source.token);
    const saved: string[] = [];
    for (const path of await h.base.list(`${metadataArea}/${h.run}/`)) if (path.includes('/evidence/') && (await h.base.readText(path))!.includes(copy.ids.representation)) saved.push(path);
    expect(saved).toHaveLength(1); const first = await h.base.readText(saved[0]!);
    h.base.rejectEvidenceAfter = null; await host.authority.retry!();
    expect(host.read().state).toBe('ready'); expect(await h.base.readText(saved[0]!)).toBe(first);
    expect(host.read().source!.originalChanges()).toHaveLength(source.originalChanges().length + 1);
    const project = host.authority.read(); expect(project.resources.assets[copy.ids.asset]).toBeDefined();
    expect(Object.keys(project.resources.assets)).toHaveLength(3);
    const bytes = host.read().source!.originalChanges(); await host.dispose(); const cold = await h.open();
    expect(cold.read().source!.originalChanges()).toEqual(bytes); expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('receives a retained inactive model copy without requiring weak content or creating its facts', async () => {
    const h = fixture(), { host, command } = await conflictingModel(h), source = host.read().source!, provider = host.read().provider!;
    const copy = source.prepareEdit(source.token, command, provider, 'b'.repeat(32)), ids = command.copies![0]!.ids;
    const [doc] = A.applyChanges(A.init<Record<string, any>>(), copy.originalChanges());
    const deleted = A.change(doc, draft => {
      for (const [map, id] of [['assetsById', ids.asset], ['sceneAssetMembershipsById', ids.membership]])
        draft[map!][id!].lifecycle = new A.ImmutableString(canonicalFixture({ state: 'deleted', reason: 'userDelete', eventId: 'evt_' + 'b'.repeat(32) }));
    });
    const remote = ProjectMetadataSource.reopen(A.getAllChanges(deleted), source.proof, metadataFixtureLimits), reads = host.content.counts.bodyBytes;
    const oldFacts = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/evidence/'));
    await host.receive(source.token, fullSource(remote, 905)); expect(host.read().state).toBe('ready');
    expect(host.content.counts.bodyBytes).toBe(reads);
    expect((await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/evidence/'))).toEqual(oldFacts);
    await host.dispose();
  });

  it('keeps independent model copies with placement/material, exact save retry and two saved recipients returning original history', async () => {
    const a = fixture(), initial = await a.open(true); await initial.dispose();
    const b = fixture(); for (const path of await a.base.list(`${metadataArea}/${a.run}/`)) await b.base.writeBytes(path, (await a.base.readBytes(path))!);
    for (const [key, bytes] of a.rows) b.rows.set(key, bytes.slice());
    let ah = await a.open(), bh = await b.open(), sa = new SyntheticSession(ah.authority), sb = new SyntheticSession(bh.authority);
    let wa = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sa), wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
    const move = async (s: SyntheticSession, assetId: string, x: string) => {
      expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId }))).toBe(true);
      expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement([x, '2', '1']);
      await acknowledge(s, () => { s.finishModelPlacement(); }); expect(s.acknowledgment.state).toBe('idle');
    };
    await move(sa, f.structure, '6');
    const update = sa.modelUpdateContext(), nextVersion = update.choices[0]!;
    await acknowledge(sa, () => { sa.acceptModelUpdate({ token: update.token, sceneId: update.sceneId,
      assetId: f.structure, bindingId: nextVersion.projection.bindingId }); });
    expect(sa.acknowledgment.state).toBe('idle');
    const mat = materialHost(sa, f.structure); mat.scope('project'); mat.begin(); mat.edit('照明', 'unlit'); await mat.apply(); mat.w.dispose();
    for (const s of [sa, sb]) {
      s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
      await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.structure, included: true })); });
    }
    select(sb); await apply(sb, { body: '参加者の記録' });
    await ah.receive(ah.read().source!.token, fullSource(bh.read().source!, 900)); sa.refreshHistory();
    const before = sa.snapshot, original = before.modelVersions!.find(v => v.assetId === f.structure)!;
    const bodies = (await a.base.list(`${metadataArea}/${a.run}/`)).filter(p => p.includes('/fixture-content/'));
    const bodyBytes = await Promise.all(bodies.map(p => a.base.readBytes(p)));
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), ah, sa, () => {}), root = record(ui.root);
    const list = named(root, '重複したモデル登録'), originalChoice = named(list, '元として残す登録'), choice = named(list, '重複の解消方法');
    setInput(originalChoice, originalChoice.children[1]!.value); setInput(choice, 'both');
    const confirm = button(list, '登録の重複を解消'); expect(confirm.disabled).toBe(false);
    a.base.rejectPublication = true; const token = ah.read().source!.token;
    await acknowledge(sa, () => confirm.fire('click')); expect(sa.acknowledgment.state).toBe('failed');
    expect(ah.read().source!.token).toBe(token); expect(choice.value).toBe('both');
    const parts = (await a.base.list(`${metadataArea}/${a.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(parts.map(p => a.base.readBytes(p)));
    a.base.rejectPublication = false; await acknowledge(sa, () => { sa.retryWorking(); });
    expect(sa.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false);
    expect(await Promise.all(parts.map(p => a.base.readBytes(p)))).toEqual(originals);
    const copy = sa.snapshot.modelVersions!.find(v => !before.resources.assets[v.assetId])!; expect(copy).toBeDefined();
    expect(copy.closure.binding.parentBindingId).toBeUndefined(); expect(copy.closure.binding.method).toBe('manual');
    expect(copy.closure.shape).toBe('updated');
    expect(copy.closure.binding.assetToProject).toEqual(original.closure.binding.assetToProject);
    expect(copy.closure.representation.blob).toEqual(original.closure.representation.blob);
    expect(sa.snapshot.resources.captions).toEqual(before.resources.captions);
    expect(sa.snapshot.state.captionMemberships).toEqual(before.state.captionMemberships);
    expect(syntheticDisplay(sa.snapshot, f.overview, null, null).models.some(m => m.binding.assetId === copy.assetId)).toBe(false);
    const ownMaterial = Object.values(sa.snapshot.materialData!.records).find(m => m.routing.kind === 'value' && m.routing.value.target.assetId === copy.assetId)!;
    expect(ownMaterial.appearance).toEqual({ kind: 'value', value: { lighting: 'unlit' } });
    expect(ownMaterial.routing.kind === 'value' && ownMaterial.routing.value.scope).toEqual({ kind: 'scene', sceneId: f.detail });
    await move(sa, copy.assetId, '9'); const copiedMaterial = materialHost(sa, copy.assetId);
    copiedMaterial.scope('scene'); copiedMaterial.begin(); copiedMaterial.edit('照明', 'lit'); await copiedMaterial.apply(); copiedMaterial.w.dispose();
    expect(sa.snapshot.modelVersions!.find(v => v.assetId === f.structure)!.closure).toEqual(original.closure);
    expect(await Promise.all(bodies.map(p => a.base.readBytes(p)))).toEqual(bodyBytes);
    expect((await a.base.list(`${metadataArea}/${a.run}/`)).filter(p => p.includes('/fixture-content/'))).toEqual(bodies);
    const sent = fullSource(ah.read().source!, 901); b.base.rejectPublication = true;
    await expect(bh.receive(bh.read().source!.token, sent)).rejects.toThrow(); expect(bh.read().state).toBe('pending');
    wb.dispose(); await bh.dispose(); b.base.rejectPublication = false; bh = await b.open(); await bh.authority.retry!();
    sb = new SyntheticSession(bh.authority); wb = createDevelopmentWorkspace(new RecordedDocument().asDocument(), sb);
    sb.acceptNavigation(planNavigation(sb.snapshot.state, sb.session, sb.pending, { kind: 'scene', sceneId: f.detail }));
    expect(bh.content.counts.bodyBytes).toBe(0); await move(sb, copy.assetId, '7');
    const reply = fullSource(bh.read().source!, 902); await ah.receive(ah.read().source!.token, reply); sa.refreshHistory();
    expect(sa.snapshot.modelVersions!.find(v => v.assetId === copy.assetId)!.closure.binding.assetToProject.translation).toEqual([7, 2, 1]);
    expect(sa.snapshot.resources.captions).toEqual(before.resources.captions);
    const writes = [a.base.writes, a.fault.writes], reads = ah.content.counts.bodyBytes;
    await ah.receive(ah.read().source!.token, reply); expect([a.base.writes, a.fault.writes]).toEqual(writes); expect(ah.content.counts.bodyBytes).toBe(reads);
    // Second round changes the original independently while the participant adds more Caption text.
    select(sb); await apply(sb, { body: '参加者の二巡目の記録' }); await move(sa, f.structure, '12');
    await bh.receive(bh.read().source!.token, fullSource(ah.read().source!, 903)); sb.refreshHistory();
    expect(sb.snapshot.modelVersions!.find(v => v.assetId === copy.assetId)!.closure.binding.assetToProject.translation).toEqual([7, 2, 1]);
    await ah.receive(ah.read().source!.token, fullSource(bh.read().source!, 904)); sa.refreshHistory();
    expect(sa.snapshot.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: '参加者の二巡目の記録' });
    const saved = ah.read().source!; ui.dispose(); wa.dispose(); wb.dispose(); await ah.dispose(); await bh.dispose();
    ah = await a.open(); bh = await b.open(); expect(ah.read().source!.heads).toEqual(bh.read().source!.heads);
    expect(ah.read().source!.originalChanges()).toEqual(saved.originalChanges()); expect(ah.content.counts.bodyBytes).toBe(0);
    await ah.dispose(); await bh.dispose();
  }, 40_000);

  it.each([1, 2])('retains explicitly selected model registration %s without deleting a model or Caption, retry/cold replay and late edge', async selectedIndex => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), seed = host.read().source!;
    const seedProvider = host.read().provider!;
    s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
    await acknowledge(s, () => { s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.structure, included: true })); });
    const before = s.snapshot, bodyReads = host.content.counts.bodyBytes;
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    setInput(named(root, '受信する合成更新'), 'assetMembership');
    await acknowledge(s, () => button(root, '開発用の更新を受け取る').fire('click'));
    const list = named(root, '重複したモデル登録'), original = named(list, '元として残す登録'), choice = named(list, '重複の解消方法');
    const confirm = button(list, '登録の重複を解消');
    expect(original.children).toHaveLength(3); expect(original.value).toBe(''); expect(choice.value).toBe(''); expect(confirm.disabled).toBe(true);
    expect(choice.children.some(c => c.value === 'both')).toBe(true);
    expect(descendants(list).some(n => n.textContent.includes('キャプション・他のシーンは変わりません'))).toBe(true);
    const ids = original.children.slice(1).map(c => c.value), chosen = ids[selectedIndex - 1]!;
    const token = host.read().source!.token, command = { kind: 'resolveAssetMembership' as const, sceneId: f.detail, assetId: f.structure,
      observedMembershipIds: ids, originalMembershipId: chosen, choice: 'one' as const, eventId: `evt_${'e'.repeat(32)}` };
    const writes = [h.base.writes, h.fault.writes];
    await expect(host.resolve(seed.token, command)).rejects.toThrow();
    await expect(host.resolve(token, { ...command, observedMembershipIds: ids.slice(1) })).rejects.toThrow();
    await expect(host.resolve(token, { ...command, originalMembershipId: 'sam_' + 'f'.repeat(32) })).rejects.toThrow();
    expect([h.base.writes, h.fault.writes]).toEqual(writes); expect(host.read().state).toBe('ready');
    const reader = await h.open(); await expect(reader.resolve(token, command)).rejects.toThrow(/閲覧専用/); await reader.dispose();
    setInput(original, chosen); setInput(choice, 'one'); expect(confirm.disabled).toBe(false);
    s.setSearchComposing(true); ui.render(); expect(confirm.disabled).toBe(true);
    s.setSearchComposing(false); ui.render();
    h.base.rejectPublication = true; await acknowledge(s, () => confirm.fire('click'));
    expect(s.acknowledgment.state).toBe('failed'); expect(original.value).toBe(chosen); expect(ui.hasChanges()).toBe(true);
    expect(host.read().source!.token).toBe(token);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const current = s.snapshot, activeEdges = Object.values(current.state.assetMemberships).filter(e =>
      e.sceneId === f.detail && e.resourceId === f.structure && e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active');
    expect(activeEdges.map(e => e.id)).toEqual([chosen]);
    expect(current.resources).toEqual({ ...before.resources, token: current.resources.token }); expect(current.modelVersions).toEqual(before.modelVersions);
    expect(current.state.captionMemberships).toEqual(before.state.captionMemberships);
    for (const e of Object.values(before.state.assetMemberships).filter(e => e.sceneId !== f.detail)) expect(current.state.assetMemberships[e.id]).toEqual(e);
    const saved = host.read().source!, saveCount = [h.base.writes, h.fault.writes];
    ui.dispose(); await host.dispose(); const cold = await h.open();
    await cold.receive(saved.token, undefined, 'assetMembership'); expect(cold.read().source!.originalChanges()).toEqual(saved.originalChanges());
    expect([h.base.writes, h.fault.writes]).toEqual(saveCount); expect(cold.content.counts.bodyBytes).toBe(0);
    const late = seed.prepareEdit(seed.token, { kind: 'include', sceneId: f.detail, resourceKind: 'asset', resourceId: f.structure,
      membershipId: `sam_${'d'.repeat(32)}`, orderKey: 'C', eventId: `evt_${'d'.repeat(32)}` }, seedProvider, 'd'.repeat(32));
    await cold.receive(saved.token, fullSource(late, 997));
    const lateUi = createMetadataReceiveControls(new RecordedDocument().asDocument(), cold, new SyntheticSession(cold.authority), () => {});
    expect(named(named(record(lateUi.root), '重複したモデル登録'), '元として残す登録').children).toHaveLength(3);
    expect(host.content.counts.bodyBytes).toBe(bodyReads); lateUi.dispose(); await cold.dispose();
  });

  it('connects explicit independent copies, retained draft/failed publication, cold replay and independent editing', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
    s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId: f.second }));
    await acknowledge(s, () => { s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); });
    const before = s.snapshot, count = host.content.counts.bodyBytes;
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    setInput(named(root, '受信する合成更新'), 'membership');
    await acknowledge(s, () => button(root, '開発用の更新を受け取る').fire('click'));
    const list = named(root, '重複した登録'), original = named(list, '元として残す登録'), choice = named(list, '重複の解消方法');
    const confirm = button(list, '登録の重複を解消');
    expect(descendants(list).some(n => n.textContent.includes('元の記録を参照するシーン：全体'))).toBe(true);
    expect(original.value).toBe(''); expect(choice.value).toBe(''); expect(confirm.disabled).toBe(true);
    setInput(original, original.children[1]!.value); expect(confirm.disabled).toBe(true);
    setInput(choice, 'both'); expect(confirm.disabled).toBe(false); expect(ui.hasChanges()).toBe(true);
    const token = host.read().source!.token; s.setSearchComposing(true); ui.render();
    expect(confirm.disabled).toBe(true); confirm.fire('click'); expect(host.read().source!.token).toBe(token);
    s.setSearchComposing(false); ui.render();
    h.base.rejectPublication = true; await acknowledge(s, () => confirm.fire('click'));
    expect(s.acknowledgment.state).toBe('failed'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(2);
    expect(choice.value).toBe('both'); expect(ui.hasChanges()).toBe(true);
    const retained = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(retained.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false);
    expect(await Promise.all(retained.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const copyId = Object.keys(s.snapshot.resources.captions).find(id => !before.resources.captions[id])!;
    expect(select(s, copyId)).toBe(true); await apply(s, { body: '別々に編集した本文' });
    expect(s.snapshot.resources.captions[f.second]).toEqual(before.resources.captions[f.second]);
    const source = host.read().source!, writes = h.fault.writes;
    ui.dispose(); await host.dispose(); const cold = await h.open();
    await cold.receive(source.token, undefined, 'membership');
    expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges()); expect(h.fault.writes).toBe(writes);
    expect(cold.authority.read().resources.captions[copyId]!.body).toEqual({ kind: 'value', value: '別々に編集した本文' });
    expect(host.content.counts.bodyBytes).toBe(count); expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('retains a stale membership decision and does not resolve on behalf of a readonly reader', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
    s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId: f.second }));
    await acknowledge(s, () => { s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); });
    await host.receive(host.read().source!.token, undefined, 'membership'); s.refreshHistory();
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    const original = named(root, '元として残す登録'), choice = named(root, '重複の解消方法');
    setInput(original, original.children[1]!.value); setInput(choice, 'one');
    const reader = await h.open(), rs = new SyntheticSession(reader.authority);
    const ru = createMetadataReceiveControls(new RecordedDocument().asDocument(), reader, rs, () => {});
    expect(button(record(ru.root), '登録の重複を解消').disabled).toBe(true); ru.dispose(); await reader.dispose();
    select(s); await apply(s, { body: '別の記録の編集' }); ui.render(); const token = host.read().source!.token;
    expect(named(root, '重複の解消方法')).toBe(choice); expect(choice.value).toBe('one'); expect(ui.hasChanges()).toBe(true);
    const confirm = button(root, '登録の重複を解消'); expect(confirm.disabled).toBe(true); confirm.fire('click');
    expect(host.read().source!.token).toBe(token);
    button(root, '選択を取り消す').fire('click'); expect(named(root, '重複の解消方法').value).toBe('');
    expect(ui.hasChanges()).toBe(false); ui.dispose(); await host.dispose();
  });

  it('receives through the mounted control, retains a draft and text candidates, and cold-replays the same source', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); select(s);
    await apply(s, { title: '手元のタイトル' });
    const ctx = s.detailContext(), draft = editCaptionDraft(ctx.draft!, ctx.source, 'body', '入力中の本文');
    s.acceptDetail({ kind: 'draft', baseDraft: ctx.draft!, draft });
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    const workspace = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s, { onAction: () => ui.render() });
    const search = named(record(workspace.root), '検索');
    const receive = button(root, '開発用の更新を受け取る'), before = host.read().source!.token, count = host.content.counts.bodyBytes;
    search.fire('compositionstart'); expect(receive.disabled).toBe(true); receive.fire('click');
    expect(host.read().source!.token).toBe(before); search.fire('compositionend');
    expect(receive.disabled).toBe(false); await acknowledge(s, () => receive.fire('click'));
    expect(s.detailContext().draft).toBe(draft); expect(s.snapshot.resources.captions[f.shared]!.title.kind).toBe('unresolved');
    const texts = descendants(named(root, '未解決の候補')).map(n => n.textContent).join(' ');
    expect(texts).toContain('手元のタイトル'); expect(texts).toContain('配布された記録');
    await apply(s, { body: '入力中の本文' });
    expect(s.snapshot.resources.captions[f.shared]!.body).toEqual({ kind: 'value', value: '入力中の本文' });
    expect(host.content.counts.bodyBytes).toBe(count);
    const source = host.read().source!, writes = h.fault.writes, files = h.base.writes;
    await acknowledge(s, () => receive.fire('click')); expect(host.read().source!.token).toBe(source.token);
    expect(h.fault.writes).toBe(writes); expect(h.base.writes).toBe(files);
    const reader = await h.open(), readonly = new SyntheticSession(reader.authority);
    const readonlyUI = createMetadataReceiveControls(new RecordedDocument().asDocument(), reader, readonly, () => {});
    expect(button(record(readonlyUI.root), '開発用の更新を受け取る').disabled).toBe(true);
    await expect(reader.receive(source.token)).rejects.toThrow(/閲覧専用/);
    readonlyUI.dispose(); await reader.dispose(); workspace.dispose(); ui.dispose(); await host.dispose();
    const cold = await h.open(); await cold.receive(source.token);
    expect(cold.read().source!.originalChanges()).toEqual(source.originalChanges());
    expect(h.fault.writes).toBe(writes); expect(h.base.writes).toBe(files); await cold.dispose();
  });

  it('keeps old UI until remote publication retry, retaining original source bytes', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), original = s.snapshot;
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {});
    h.base.rejectPublication = true;
    await acknowledge(s, () => button(record(ui.root), '開発用の更新を受け取る').fire('click'));
    expect(s.acknowledgment.state).toBe('failed'); expect(s.snapshot).toBe(original);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('source-metadata.am') || p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(s.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '配布された記録' });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    ui.dispose(); await host.dispose();
  });

  it('requires an explicit text resolution, preserves IME/manual draft and retries the same saved decision', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority); select(s);
    await apply(s, { title: '手元の候補' });
    const ui = createMetadataReceiveControls(new RecordedDocument().asDocument(), host, s, () => {}), root = record(ui.root);
    await acknowledge(s, () => button(root, '開発用の更新を受け取る').fire('click'));
    const list = named(root, '未解決の候補'), choice = descendants(list).find(n => n.tag === 'select')!;
    const text = descendants(list).find(n => n.tag === 'textarea')!, confirm = button(list, '競合を解消');
    expect(choice.value).toBe(''); expect(confirm.disabled).toBe(true); expect(ui.hasChanges()).toBe(false);
    setInput(choice, 'manual'); setInput(text, '統合した文言'); expect(ui.hasChanges()).toBe(true);
    expect(descendants(list).some(n => n.textContent === 'この選択・入力はまだ適用されていません。')).toBe(true);
    const token = host.read().source!.token;
    text.fire('compositionstart'); expect(confirm.disabled).toBe(true);
    expect(button(root, '開発用の更新を受け取る').disabled).toBe(true); confirm.fire('click');
    expect(host.read().source!.token).toBe(token); text.fire('compositionend');
    h.base.rejectPublication = true; await acknowledge(s, () => confirm.fire('click'));
    expect(s.acknowledgment.state).toBe('failed'); expect(text.value).toBe('統合した文言'); expect(ui.hasChanges()).toBe(true);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(ui.hasChanges()).toBe(false); expect(list.children).toHaveLength(0);
    expect(s.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '統合した文言' });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    ui.dispose(); await host.dispose();
    const cold = await h.open(); expect(cold.authority.read().resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '統合した文言' });
    await cold.dispose();
  });

  it('does not mislabel a preflight refusal as an incomplete save or acknowledge it through retry', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), source = host.read().source!;
    const files = h.base.writes, writes = h.fault.writes;
    await acknowledge(s, () => { s.applyWorking(() => host.receive(source.token, { packageId: `pkg_${h.run}`,
      metadataBytes: source.encodeFullSource(), proof: source.proof, remoteHeads: ['f'.repeat(64)] }), () => s.refreshHistory()); });
    expect(s.acknowledgment.state).toBe('idle'); expect(s.acknowledgment.error).toContain('受け取れません');
    expect(host.authority.status!().kind).toBe('idle'); expect(s.retryWorking()).toBe(false);
    expect(h.base.writes).toBe(files); expect(h.fault.writes).toBe(writes);
    select(s); await apply(s, { body: '拒否後も編集できる' }); expect(host.read().state).toBe('ready'); await host.dispose();
  });

  it('adds saved PNGs to an existing edited run, edits/reorders/removes attachments and cold-reopens retained media without reseeding', async () => {
    const h = fixture(), initial = await h.open(true), initialSession = new SyntheticSession(initial.authority); select(initialSession);
    await apply(initialSession, { title: '先の作業を保持' });
    const originals = initial.read().source!.originalChanges(), seedPaths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/seed/'));
    const seedBytes = await Promise.all(seedPaths.map(p => h.base.readBytes(p))); await initial.dispose();
    const host = await h.open(), s = new SyntheticSession(host.authority), ui = mediaHost(s);
    expect(s.snapshot.mediaData!.images).toEqual({}); expect(ui.panel.hidden).toBe(false);
    await ui.add(0); expect(s.acknowledgment.state).toBe('idle'); await ui.add(1); expect(s.acknowledgment.state).toBe('idle');
    const rows = () => captionAttachments(s.snapshot.mediaData, f.shared).ready, first = rows()[0]!.id;
    expect(rows()).toHaveLength(2); expect(host.read().source!.originalChanges()).toHaveLength(originals.length + 2);
    expect(descendants(named(ui.root, 'キャプション')).some(n => n.textContent === 'メディア 2')).toBe(true);
    const gallery = area(named(ui.root, 'キャプションのウィンドウ'), '添付メディア');
    expect(descendants(gallery).filter(n => n.tag === 'img').map(n => (n as unknown as HTMLImageElement).src)).toEqual(fixtureMedia.map(m => `data:image/png;base64,${m.base64}`));
    button(ui.panel, '説明を編集').fire('click'); setInput(named(ui.panel, 'メディアの説明'), '保存した説明');
    await acknowledge(s, () => button(ui.panel, '説明を適用').fire('click')); ui.w.render();
    expect(rows()[0]!.altText).toEqual({ kind: 'value', value: '保存した説明' });
    await acknowledge(s, () => button(ui.panel, '後へ').fire('click')); ui.w.render(); expect(rows()[1]!.id).toBe(first);
    const reader = await h.open(), readonly = new SyntheticSession(reader.authority), readUI = mediaHost(readonly);
    expect(button(readUI.panel, '選択したメディアを添付').disabled).toBe(true); expect(button(readUI.panel, '説明を編集').disabled).toBe(true);
    const readGallery = area(named(readUI.root, 'キャプションのウィンドウ'), '添付メディア');
    button(readGallery, '画像を表示').fire('click'); expect(named(readUI.root, '画像ビューア').open).toBe(true);
    expect(readonly.media.add(readonly.mediaContext(), fixtureMedia[0]!.record.id)).toBe(false);
    readUI.w.dispose(); await reader.dispose();
    await ui.remove(); await ui.remove(); expect(rows()).toHaveLength(0); expect(host.read().state).toBe('ready');
    expect(descendants(named(ui.root, 'キャプション')).some(n => n.textContent.includes('メディア '))).toBe(false);
    expect(Object.keys(s.snapshot.mediaData!.records)).toHaveLength(2);
    expect(s.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '先の作業を保持' });
    expect(await Promise.all(seedPaths.map(p => h.base.readBytes(p)))).toEqual(seedBytes);
    expect(host.content.counts.bodyBytes).toBe(0); ui.w.dispose(); await host.dispose();
    const cold = await h.open(), cs = new SyntheticSession(cold.authority), cu = mediaHost(cs);
    expect(cold.read().state).toBe('ready'); expect(Object.keys(cs.snapshot.mediaData!.images!)).toHaveLength(2);
    expect(captionAttachments(cs.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    await cu.add(0); expect(cs.acknowledgment.state).toBe('idle');
    expect(descendants(named(cu.root, 'キャプション')).some(n => n.textContent === 'メディア 1')).toBe(true);
    expect(captionAttachments(cs.snapshot.mediaData, f.shared).ready[0]!.id).not.toBe(first);
    const provider = cold.read().provider!; if (provider.kind !== 'scene-provider') throw Error('provider');
    expect(Object.keys(provider.details.immutable.mediaResourcesById)).toHaveLength(2); expect(cold.content.counts.bodyBytes).toBe(0);
    cu.w.dispose(); await cold.dispose();
  });

  it('retains PNG attachment ID and original journal bytes across failed publication and exact recovery', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = mediaHost(s);
    h.base.rejectPublication = true; await ui.add(0); expect(s.acknowledgment.state).toBe('failed');
    expect(captionAttachments(s.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/journal/') && p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p))), failed = s.media.failed!;
    const preparedPaths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('/blobsVerified.json'));
    const prepared = await Promise.all(preparedPaths.map(async p => JSON.parse((await h.base.readText(p))!)));
    expect(prepared.find(p => p.start.purpose === 'localCommand').stagedBlobs).toEqual([fixtureMedia[0]!.record.blob]);
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); }); ui.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.media.failed).toBeNull();
    const id = Object.keys(failed.changes)[0]!.split('/')[1]!;
    expect(captionAttachments(s.snapshot.mediaData, f.shared).ready.map(r => r.id)).toEqual([id]);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    await host.authority.retry!(); expect(Object.keys(host.authority.read().mediaData!.records)).toEqual([id]);
    ui.w.dispose(); await host.dispose(); const cold = await h.open(); expect(cold.authority.read().mediaData!.records[id]).toBeDefined(); await cold.dispose();
  });

  it('retains a pre-blob-failure intent for same-host retry but never cold-regenerates incomplete staging', async () => {
    for (const coldRecovery of [false, true]) {
      const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = mediaHost(s);
      h.base.rejectImage = true; await ui.add(0); expect(s.acknowledgment.state).toBe('failed');
      const id = Object.keys(s.media.failed!.changes)[0]!.split('/')[1]!; h.base.rejectImage = false;
      if (!coldRecovery) {
        await acknowledge(s, () => { s.retryWorking(); }); expect(s.acknowledgment.state).toBe('idle');
        expect(captionAttachments(s.snapshot.mediaData, f.shared).ready.map(r => r.id)).toEqual([id]);
      }
      ui.w.dispose(); await host.dispose();
      const cold = await h.open();
      if (coldRecovery) {
        expect(cold.read().state).toBe('pending'); await expect(cold.authority.retry!()).rejects.toThrow();
        expect(cold.authority.read().mediaData!.images).toEqual({});
        expect((await h.base.list(`${metadataArea}/${h.run}/`)).some(p => p.endsWith(`${fixtureMedia[0]!.record.blob.digest}.bin`))).toBe(false);
      }
      await cold.dispose();
    }
  });

  it('refuses missing and same-size corrupt saved PNGs on cold open or prepared recovery; never uses fixture fallback', async () => {
    for (const pending of [false, true]) for (const corrupt of [false, true]) {
      const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = mediaHost(s);
      h.base.rejectPublication = pending; await ui.add(0);
      expect(s.acknowledgment.state).toBe(pending ? 'failed' : 'idle');
      ui.w.dispose(); await host.dispose(); h.base.rejectPublication = false;
      const paths = await h.base.list(`${metadataArea}/${h.run}/`), path = paths.find(p => p.endsWith(`${fixtureMedia[0]!.record.blob.digest}.bin`))!;
      const bytes = (await h.base.readBytes(path))!;
      if (corrupt) { bytes[bytes.length - 1] = bytes[bytes.length - 1]! ^ 1; await h.base.writeBytes(path, bytes); }
      else await h.base.remove(path);
      if (pending) {
        const cold = await h.open(); expect(cold.read().state).toBe('pending');
        await expect(cold.authority.retry!()).rejects.toThrow(); expect(cold.authority.read().mediaData!.images).toEqual({}); await cold.dispose();
      } else await expect(h.open()).rejects.toThrow(/保存内容/);
      if (corrupt) expect(await h.base.readBytes(path)).toEqual(bytes); else expect(await h.base.exists(path)).toBe(false);
    }
  });

  it('cold-recovers the exact prepared media change and refuses stale, cross-caption, conflict and unknown attachment edits', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = mediaHost(s);
    h.base.rejectPublication = true; await ui.add(0);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.includes('/journal/') && p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    ui.w.dispose(); await host.dispose(); h.base.rejectPublication = false;
    const cold = await h.open(); expect(cold.read().state).toBe('pending'); await cold.authority.retry!();
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    const source = cold.read().source!, provider = cold.read().provider!, id = Object.keys(cold.authority.read().mediaData!.records)[0]!;
    const tx = 'b'.repeat(32), edit: MetadataEdit = { kind: 'editAttachment', sceneId: f.overview, captionId: f.shared, attachmentId: id, field: 'altText', value: '説明' };
    expect(() => source.prepareEdit('stale', edit, provider, tx)).toThrow(/stale/);
    expect(() => source.prepareEdit(source.token, { ...edit, captionId: f.second }, provider, tx)).toThrow(/owner/);
    const read = (value: ProjectMetadataSource) => readProjectScene(value.read(), metadataFixtureLimits, cold.content.verifier(false), { verifyRetainedMedia: true });
    const first = source.prepareEdit(source.token, edit, provider, tx);
    const second = source.prepareEdit(source.token, { ...edit, value: '別の説明' }, provider, 'c'.repeat(32));
    const conflict = first.appendOriginal(second.originalChanges()), cp = await read(conflict);
    const data = metadataProjectView(cp, cold.content.images).mediaData!;
    expect(data.records[id]!.altText.kind).toBe('unresolved'); expect(data.cells[`attachment/${id}/altText`]).toBeUndefined();
    expect(captionAttachments(data, f.shared).ready).toHaveLength(1); // Image stays viewable while description needs review.
    expect(() => conflict.prepareEdit(conflict.token, edit, cp, tx)).toThrow(/unresolved/);
    const [raw] = A.applyChanges(A.init<any>(), source.originalChanges());
    const changed = A.change(A.clone(raw), d => {
      d.captionAttachmentsById[id].lifecycle = new A.ImmutableString(canonicalFixture({
        state: 'active', eventId: `evt_${tx}`, reason: 'initial', futurePolicy: true }));
    });
    const unknown = ProjectMetadataSource.reopen(A.getAllChanges(changed), source.proof, metadataFixtureLimits);
    const awaitProvider = await read(unknown);
    expect(() => unknown.prepareEdit(unknown.token, edit, awaitProvider, tx)).toThrow(/unknown/);
    expect(cold.read().source!.token).toBe(source.token); expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });
  it('saves exact Project/Scene material effects, confirmed reset and tombstones through cold reopen; readonly permits inspection only', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = materialHost(s);
    const before = host.read().source!.originalChanges().length, bodies = host.content.counts.bodyBytes;
    const display = (scene = f.overview) => syntheticDisplay(s.snapshot, scene, null, null).materials![f.equipment];
    const state = s.snapshot.state, captions = s.snapshot.resources.captions;
    expect(s.materialContext().source.projectId).toBe(`prj_${h.run}`);
    expect(new SyntheticSession().materialContext().source.projectId).toBe(f.project);
    expect(ui.panel.hidden).toBe(false);
    ui.scope('project'); ui.begin(); ui.edit('照明', 'unlit'); await ui.apply();
    expect(s.acknowledgment.state).toBe('idle'); expect(display()).toMatchObject({ unlit: true, doubleSided: false });
    const projectId = Object.keys(s.snapshot.materialData!.records)[0]!;
    ui.scope('scene'); ui.begin(); ui.edit('表示する面', 'double'); await ui.apply();
    const sceneId = Object.keys(s.snapshot.materialData!.records).find(id => id !== projectId)!;
    expect(display()).toMatchObject({ unlit: true, doubleSided: true });
    expect(display(f.detail)).toMatchObject({ unlit: true, doubleSided: false });
    ui.begin(); ui.edit('照明', 'lit'); await ui.apply(); expect(display()).toMatchObject({ unlit: false, doubleSided: true });
    // Later Project editing leaves the whole Scene override independently double-sided.
    ui.scope('project'); ui.begin(); ui.edit('照明', 'lit'); await ui.apply();
    expect(display()).not.toEqual(display(f.detail));
    ui.scope('scene'); button(ui.panel, 'この範囲の設定を解除').fire('click');
    expect(s.snapshot.materialData!.records[sceneId]!.lifecycle).toMatchObject({ value: { state: 'active' } });
    await acknowledge(s, () => button(ui.panel, '設定を解除する').fire('click')); ui.w.render();
    expect(display()).toEqual(display(f.detail));
    expect(s.snapshot.materialData!.records[sceneId]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    // Source-color hard chroma in another fresh Scene override, after reset releases the key.
    ui.begin(); ui.edit('指定した色を透過', 'on'); ui.edit('透過する色', '#a8a29a'); await ui.apply();
    expect(display()).toMatchObject({ visible: false }); expect(display(f.detail)).toMatchObject({ visible: true });
    const expected = display();
    expect(s.snapshot.state.assetMemberships).toEqual(state.assetMemberships);
    expect(s.snapshot.state.captionMemberships).toEqual(state.captionMemberships);
    expect(s.snapshot.resources.captions).toEqual(captions); expect(host.content.counts.bodyBytes).toBe(bodies);
    const reader = await h.open(), readonly = new SyntheticSession(reader.authority), readUI = materialHost(readonly);
    expect(readonly.readOnly).toBe(true); expect(readUI.panel.hidden).toBe(false); readUI.scope('project');
    expect(readonly.materialContext().selection.scope).toBe('project'); expect(button(readUI.panel, '設定を編集').disabled).toBe(true);
    expect(button(readUI.panel, 'この範囲の設定を解除').disabled).toBe(true);
    readUI.w.dispose(); await reader.dispose(); ui.w.dispose(); await host.dispose();
    const cold = await h.open(), coldSession = new SyntheticSession(cold.authority), coldUI = materialHost(coldSession);
    expect(cold.content.counts.bodyBytes).toBe(0);
    expect(syntheticDisplay(coldSession.snapshot, f.overview, null, null).materials![f.equipment]).toEqual(expected);
    expect(coldSession.snapshot.materialData!.records[sceneId]!.lifecycle).toMatchObject({ value: { state: 'deleted' } });
    expect(cold.read().source!.originalChanges()).toHaveLength(before + 6);
    await coldUI.reset(); coldUI.scope('project'); await coldUI.reset();
    expect(syntheticDisplay(coldSession.snapshot, f.overview, null, null).materials![f.equipment]).toMatchObject({ unlit: false, doubleSided: false, visible: true });
    coldUI.w.dispose(); await cold.dispose();
  });

  it('retains a failed material draft, exact target, fresh override ID and original bytes until saved retry', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority), ui = materialHost(s);
    ui.begin(); ui.edit('照明', 'unlit'); const draft = s.materialContext().draft, selection = s.materialContext().selection;
    h.base.rejectPublication = true; await ui.apply();
    expect(s.acknowledgment.state).toBe('failed'); expect(s.materialContext().draft).toBe(draft);
    expect(s.materialContext().selection).toBe(selection); expect(Object.keys(s.snapshot.materialData!.records)).toHaveLength(0);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); }); ui.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.materialContext().draft).toBeNull();
    const ids = Object.keys(s.snapshot.materialData!.records); expect(ids).toHaveLength(1);
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    await host.authority.retry!(); expect(Object.keys(host.authority.read().materialData!.records)).toEqual(ids);
    ui.w.dispose(); await host.dispose(); const cold = await h.open();
    expect(Object.keys(cold.authority.read().materialData!.records)).toEqual(ids);
    expect(syntheticDisplay(cold.authority.read(), f.overview, null, null).materials![f.equipment]).toMatchObject({ unlit: true }); await cold.dispose();
  });

  it('refuses stale/catalog/duplicate/conflicting/unknown material writes and never exposes reserved targets as empty', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!, tx = 'c'.repeat(32), id = `ovr_${tx}`;
    const target = materialTarget(metadataModels.find(m => m.assetId === f.equipment)!.closure);
    const route: MaterialRouting = { scope: { kind: 'scene', sceneId: f.overview }, target };
    const create: Extract<MetadataEdit, { kind: 'createMaterial' }> = { kind: 'createMaterial', sceneId: f.overview, overrideId: id,
      routing: { scope: { ...route.scope }, target: { ...target } }, appearance: { lighting: 'unlit' },
      compositing: { coverage: { policy: 'inherit' }, optics: 'inherit' }, eventId: `evt_${tx}` };
    const read = (source: ProjectMetadataSource) => readProjectScene(source.read(), metadataFixtureLimits, host.content.verifier(false));
    const initial = host.read().provider!;
    expect(() => seed.prepareEdit('stale', create, initial, tx)).toThrow(/stale/);
    expect(() => seed.prepareEdit(seed.token, { ...create, sceneId: f.detail }, initial, tx)).toThrow(/scene/);
    expect(() => seed.prepareEdit(seed.token, { ...create, routing: { ...create.routing, target: { ...target, logicalMaterialSlotId: `slot_${tx}` } } }, initial, tx)).toThrow(/target/);
    for (const patch of [{ appearance: { opacity: 0.5 } }, { appearance: { extra: true } },
      { compositing: { coverage: { policy: 'ditherCoverage' }, optics: 'inherit' } },
      { compositing: { coverage: { policy: 'inherit' }, optics: 'transmission' } }])
      expect(() => seed.prepareEdit(seed.token, { ...create, ...patch } as MetadataEdit, initial, tx)).toThrow();
    const made = seed.prepareEdit(seed.token, create, initial, tx), provider = await read(made);
    const exactColor = [0.123456789, 0.42, 0.8];
    const colored = made.prepareEdit(made.token, { kind: 'editMaterial', sceneId: f.overview, overrideId: id,
      appearance: { baseColorSrgb: exactColor } }, provider, tx);
    const coloredView = metadataProjectView(await read(colored));
    expect(coloredView.materialData!.records[id]!.appearance).toEqual({ kind: 'value', value: { baseColorSrgb: exactColor } });
    const unchanged = metadataProjectView(provider).materialData!.cells;
    for (const field of ['routing', 'compositing', 'lifecycle'])
      expect(coloredView.materialData!.cells[materialKey(id, field)]).toEqual(unchanged[materialKey(id, field)]);
    const edit: MetadataEdit = { kind: 'editMaterial', sceneId: f.overview, overrideId: id, appearance: { doubleSided: true } };
    const reset: MetadataEdit = { kind: 'resetMaterial', sceneId: f.overview, overrideId: id, eventId: `evt_${tx}` };
    expect(() => made.prepareEdit(made.token, { ...create, overrideId: `ovr_${'d'.repeat(32)}` }, provider, tx)).toThrow(/reserved/);
    const [raw] = A.applyChanges(A.init<any>(), made.originalChanges());
    const altered = (change: (d: any) => void) => ProjectMetadataSource.reopen(A.getAllChanges(A.change(A.clone(raw), change)), made.proof, metadataFixtureLimits);
    const unknown = altered(d => { d.materialOverridesById[id].appearance = new A.ImmutableString(canonicalFixture({ lighting: 'unlit', future: { retained: true } })); });
    const unknownProvider = await read(unknown);
    for (const command of [edit, reset]) expect(() => unknown.prepareEdit(unknown.token, command, unknownProvider, tx)).toThrow();
    const alternateRoute = { ...route, scope: { kind: 'project' as const } };
    const a = altered(d => { d.materialOverridesById[id].routing = new A.ImmutableString(canonicalFixture(alternateRoute)); });
    const b = altered(d => { const old = d.materialOverridesById[id].routing; delete d.materialOverridesById[id].routing; d.materialOverridesById[id].routing = old; });
    const conflict = a.appendOriginal(b.originalChanges()), conflicted = await read(conflict), projected = metadataProjectView(conflicted);
    expect(materialBucket(projected.materialData, route).kind).toBe('unresolved');
    expect(materialBucket(projected.materialData, alternateRoute).kind).toBe('unresolved');
    expect(projected.materialData!.cells[materialKey(id, 'routing')]).toBeUndefined();
    for (const command of [edit, reset, { ...create, overrideId: `ovr_${'e'.repeat(32)}` }])
      expect(() => conflict.prepareEdit(conflict.token, command, conflicted, tx)).toThrow();
    const duplicate = altered(d => { const copy = `ovr_${'f'.repeat(32)}`; d.materialOverridesById[copy] = {};
      for (const [field, value] of Object.entries(d.materialOverridesById[id])) d.materialOverridesById[copy][field] = field === 'id' ? new A.ImmutableString(canonicalFixture(copy)) : value; });
    const dupProvider = await read(duplicate), dupView = metadataProjectView(dupProvider);
    expect(materialBucket(dupView.materialData, route).kind).toBe('unresolved');
    for (const command of [edit, reset]) expect(() => duplicate.prepareEdit(duplicate.token, command, dupProvider, tx)).toThrow();
    if (dupProvider.kind !== 'scene-provider') throw Error('provider');
    const observedOverrideIds = [id, `ovr_${'f'.repeat(32)}`];
    const keep: MetadataEdit = { kind: 'resolveMaterialDuplicates', sceneId: f.overview, overrideId: id, observedOverrideIds, eventId: `evt_${'6'.repeat(32)}` };
    for (const change of [{ observedOverrideIds: [id] }, { observedOverrideIds: [id, id] }, { overrideId: `ovr_${'0'.repeat(32)}` }, { sceneId: f.detail }])
      expect(() => duplicate.prepareEdit(duplicate.token, { ...keep, ...change }, dupProvider, tx)).toThrow();
    const cleaned = duplicate.prepareEdit(duplicate.token, keep, dupProvider, tx), cleanedRead = await read(cleaned);
    if (cleanedRead.kind !== 'scene-provider') throw Error('provider');
    expect(cleanedRead.issues.filter(i => i.path[0] === 'materialOverridesById')).toEqual([]);
    expect(metadataProjectView(cleanedRead).materialData!.records[id]).toEqual(metadataProjectView(provider).materialData!.records[id]);
    expect(metadataProjectView(cleanedRead).materialData!.records[observedOverrideIds[1]!]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted', reason: 'conflictResolution' } });
    const branchA = altered(d => { delete d.materialOverridesById[id].appearance; d.materialOverridesById[id].appearance = new A.ImmutableString(canonicalFixture({ lighting: 'unlit' })); });
    const branchB = altered(d => { d.materialOverridesById[id].appearance = new A.ImmutableString(canonicalFixture({ doubleSided: true })); });
    const pair = branchA.appendOriginal(branchB.originalChanges()), pairRead = await read(pair);
    if (pairRead.kind !== 'scene-provider') throw Error('provider');
    const context = materialResolutionContext(pairRead, f.overview, id, metadataFixtureLimits), atom = context.atoms(id, 'appearance')[0]!, companion = context.atoms(id, 'compositing')[0]!;
    const resolve: MetadataEdit = { kind: 'resolveMaterialIntent', sceneId: f.overview, overrideId: id, appearanceOperationId: atom.operationId, compositingOperationId: companion.operationId };
    const resolved = pair.prepareEdit(pair.token, resolve, pairRead, tx), resolvedRead = await read(resolved);
    if (resolvedRead.kind !== 'scene-provider') throw Error('provider');
    const companionField = (p: typeof pairRead) => p.inspection.candidates.fields.find(f => f.path.join('/') === `materialOverridesById/${id}/compositing`);
    expect(companionField(resolvedRead)).toEqual(companionField(pairRead));
    expect(resolvedRead.details.mutable.materialOverridesById[id]!.appearance).toEqual({ kind: 'value', value: atom.value });
    const originalInspection = await resolved.inspectOriginal({ maxNodes: metadataFixtureLimits.maxNodes, maxWork: metadataFixtureLimits.maxWork });
    expect(() => summarizeFullHistory(originalInspection)).not.toThrow();
    for (const change of [{ appearanceOperationId: 'missing' }, { compositingOperationId: atom.operationId }, { sceneId: f.detail }])
      expect(() => pair.prepareEdit(pair.token, { ...resolve, ...change }, pairRead, tx)).toThrow();
    expect(() => pair.prepareEdit('stale', resolve, pairRead, tx)).toThrow(/stale/);
    expect(() => materialResolutionContext(pairRead, f.overview, id, { ...metadataFixtureLimits, maxWork: 1 })).toThrow(/limit/);
    const unknownRoute = altered(d => { d.materialOverridesById[id].routing = new A.ImmutableString(canonicalFixture({ ...route, future: true })); });
    const unknownRouteProvider = await read(unknownRoute);
    expect(materialBucket(metadataProjectView(unknownRouteProvider).materialData, route).kind).toBe('unresolved');
    for (const command of [edit, reset, { ...create, overrideId: `ovr_${'e'.repeat(32)}` }])
      expect(() => unknownRoute.prepareEdit(unknownRoute.token, command, unknownRouteProvider, tx)).toThrow();
    for (const [source, p] of [[unknownRoute, unknownRouteProvider], [unknown, unknownProvider], [conflict, conflicted]] as const)
      expect(() => source.prepareEdit(source.token, resolve, p, tx)).toThrow();
    const absentRoute = altered(d => { delete d.materialOverridesById[id].routing; }), absentProvider = await read(absentRoute);
    const uncertain = metadataProjectView(absentProvider).materialData!;
    expect(uncertain.routingUncertain).toBe(true); expect(materialBucket(uncertain, route).kind).toBe('unresolved');
    expect(materialBucket(uncertain, alternateRoute).kind).toBe('unresolved');
    expect(() => absentRoute.prepareEdit(absentRoute.token, { ...create, overrideId: `ovr_${'e'.repeat(32)}` }, absentProvider, tx)).toThrow();
    expect(host.read().source!.token).toBe(seed.token); await host.dispose();
  });
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
    expect(session.acknowledgment.state).toBe('idle'); expect(session.message).toBe('変更を適用しました。');
    mounted.render();
    const status = descendants(record(mounted.root)).find(n => n.className === 'lv-save-status')!;
    expect(status.textContent).toBe('再開用データのみ');
    expect(descendants(record(mounted.root)).some(n => n.textContent.includes('ファイル保存は未接続です。'))).toBe(true);
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
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#2468ac' }))).toBe(true);
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
    expect(s.snapshot.colors[captionId]).toEqual({ kind: 'value', value: '#2468ac' });
    expect(s.snapshot.captionOwners[captionId]).toEqual({ assetId: f.equipment, assetFrameId: target.assetFrameId });
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.pinPreviewAnchor).toMatchObject({ positionAsset: [1, 2, 3] });
    expect(s.acceptPinSurface(s.pinSurfaceTarget()!, [4, 5, 6], true)).toBe(true);
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    expect(s.snapshot.colors[captionId]).toEqual({ kind: 'value', value: '#2468ac' });
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

  it.each(['asset', 'project'] as const)('reparents a %s anchor with one retained change, exact retry and cold reopen', async kind => {
    const h = fixture(), host = await h.open(true);
    if (kind === 'project') {
      const seed = host.read().source!, [doc] = A.applyChanges(A.init<any>(), seed.originalChanges());
      const changed = A.change(A.clone(doc), d => { d.captionsById[f.shared].anchor = new A.ImmutableString(canonicalFixture({
        kind: 'project', projectFrameId: host.authority.read().resources.projectFrameId, positionProject: [7, 8, 9] })); });
      await host.receive(seed.token, fullSource(seed.appendOriginal(A.getChanges(doc, changed)), 1201));
    }
    const s = new SyntheticSession(host.authority); select(s);
    const source = host.read().source!, provider = host.read().provider!, before = s.snapshot;
    if (provider.kind !== 'scene-provider') throw Error('provider');
    const count = source.originalChanges().length;
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'reparent', assetId: f.structure }))).toBe(true);
    const anchor = s.pinPreviewAnchor!; expect(anchor).toMatchObject({ assetId: f.structure });
    expect(host.read().source!.originalChanges()).toHaveLength(count);
    h.base.rejectPublication = true;
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    expect(s.acknowledgment.state).toBe('failed'); expect(s.snapshot).toBe(before);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(s.snapshot.resources.captions[f.shared]!.anchor).toEqual({ kind: 'value', value: anchor });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(bytes);
    expect(host.read().source!.originalChanges()).toHaveLength(count + 1);
    const next = host.read().provider!; if (next.kind !== 'scene-provider') throw Error('provider');
    const { anchor: _old, ...oldRecord } = provider.details.mutable.captionsById[f.shared]!;
    const { anchor: _new, ...newRecord } = next.details.mutable.captionsById[f.shared]!;
    expect(newRecord).toEqual(oldRecord);
    for (const map of ['sceneCaptionMembershipsById', 'sceneAssetMembershipsById', 'captionAttachmentsById', 'captionTagMembershipsById', 'assetsById'] as const)
      expect(next.details.mutable[map]).toEqual(provider.details.mutable[map]);
    expect(s.snapshot.captionOwners[f.shared]!.assetId).toBe(f.structure);
    const complete = host.read().source!;
    await host.receive(complete.token, fullSource(complete, 1202)); expect(host.read().source!.token).toBe(complete.token);
    await host.dispose(); const cold = await h.open();
    expect(cold.authority.read().resources.captions[f.shared]!.anchor).toEqual({ kind: 'value', value: anchor });
    expect(cold.content.counts.bodyBytes).toBe(0); await cold.dispose();
  });

  it('retains whole parent/position conflict candidates, resolves explicitly and refuses unknown old anchors', async () => {
    const h = fixture(), host = await h.open(true), seed = host.read().source!, provider = host.read().provider!;
    const s = new SyntheticSession(host.authority); select(s);
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' })); const old = s.pinPreviewAnchor!;
    const c = s.pinContext(); s.acceptPin(planPinMode(c, { kind: 'cancel', confirmedMode: c.memory.mode, confirmedProposal: c.proposal }));
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'reparent', assetId: f.structure })); const next = s.pinPreviewAnchor!;
    const command: MetadataEdit = { kind: 'reparentPin', sceneId: f.overview, captionId: f.shared, anchor: next };
    const local = seed.prepareEdit(seed.token, command, provider, '1'.repeat(32));
    const remote = seed.prepareEdit(seed.token, { kind: 'movePin', sceneId: f.overview, captionId: f.shared,
      anchor: { ...old, positionAsset: [10, 11, 12] } } as MetadataEdit, provider, '2'.repeat(32));
    const merged = local.appendOriginal(remote.originalChanges());
    await host.receive(seed.token, fullSource(merged, 1203));
    const conflicted = host.read().provider!; if (conflicted.kind !== 'scene-provider') throw Error('provider');
    const field = captionFieldCandidates(conflicted, f.shared, 'anchor', metadataFixtureLimits);
    expect(field).toHaveLength(2);
    expect(field.map(c => c.value)).toEqual(expect.arrayContaining([{ kind: 'value', value: next },
      { kind: 'value', value: { ...old, positionAsset: [10, 11, 12] } }]));
    expect(() => merged.prepareEdit(merged.token, command, conflicted, '3'.repeat(32))).toThrow(/unresolved/);
    const chosen = field.find(c => c.value.kind === 'value' && canonicalFixture(c.value.value) === canonicalFixture(next))!;
    await host.resolve(host.read().source!.token, { kind: 'resolveCaptionField', captionId: f.shared, field: 'anchor', operationId: chosen.operationId });
    const complete = host.read().source!; await host.receive(complete.token, fullSource(remote, 1204));
    expect(host.read().source!.token).toBe(complete.token);
    const [doc] = A.applyChanges(A.init<any>(), seed.originalChanges());
    const unknown = seed.appendOriginal(A.getChanges(doc, A.change(A.clone(doc), d => {
      d.captionsById[f.shared].anchor = new A.ImmutableString(canonicalFixture({ ...old, future: { preserve: true } }));
    })));
    const unknownView = await readProjectScene(unknown.read(), metadataFixtureLimits, host.content.verifier(false));
    expect(() => unknown.prepareEdit(unknown.token, command, unknownView, '4'.repeat(32))).toThrow();
    await host.dispose();
  });

  it('retries a failed pin creation with the same ID and original bytes, not a second Caption', async () => {
    const h = fixture(), host = await h.open(true), s = new SyntheticSession(host.authority);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#123456' }))).toBe(true);
    expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [2, 3, 4])).toBe(true);
    h.base.rejectPublication = true;
    await acknowledge(s, () => { s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' })); });
    expect(s.acknowledgment.state).toBe('failed'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(2);
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const originals = await Promise.all(paths.map(p => h.base.readBytes(p)));
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'color', color: '#ffffff' }))).toBe(false);
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); });
    expect(s.acknowledgment.state).toBe('idle'); expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(3);
    const id = s.memory.selectedCaptionId; expect(id).toBeTruthy();
    expect(s.snapshot.colors[id!]).toEqual({ kind: 'value', value: '#123456' });
    expect(await Promise.all(paths.map(p => h.base.readBytes(p)))).toEqual(originals);
    await host.authority.retry!(); expect(Object.keys(host.authority.read().resources.captions)).toHaveLength(3);
    await host.dispose(); const cold = await h.open(); expect(cold.authority.read().resources.captions[id!]).toBeDefined();
    expect(cold.authority.read().colors[id!]).toEqual({ kind: 'value', value: '#123456' });
    expect(new SyntheticSession(cold.authority).pinContext().memory.addColor).toBe('#a08045'); await cold.dispose();
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
    const addition: MetadataEdit = { kind: 'addPin', sceneId: f.overview, captionId: `cap_${'f'.repeat(32)}`,
      membershipId: `scm_${'f'.repeat(32)}`, eventId: `evt_${'f'.repeat(32)}`, anchor };
    for (const colorSrgb of [null, [], [0, 0], [0, 0, 0, 1], [-0.1, 0, 0], [0, 1.1, 0], [0, NaN, 0], '#123456'])
      expect(() => source.prepareEdit(source.token, { ...addition, colorSrgb } as MetadataEdit, provider, tx)).toThrow();
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
    const next = { ...displayCapture(), camera: { ...displayCapture().camera, position: [3, 4, 9] as const },
      background: { kind: 'solid' as const, colorSrgb: [36 / 255, 104 / 255, 172 / 255] as const } };
    ui.capture({ ...next, background: displayCapture().background }); ui.background('#2468ac');
    expect(host.read().source!.originalChanges()).toHaveLength(initialChanges + 1);
    button(ui.author, '編集').fire('click'); ui.name('入口');
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
    const readToken = reader.read().source!.token; readUI.background('#abcdef');
    expect(readSession.pending).toBeNull(); expect(named(area(readUI.r, '3D背景'), '背景色').value).toBe('#abcdef');
    expect(reader.read().source!.token).toBe(readToken);
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
    ui.background('#2468ac'); const appliedBackground = { kind: 'solid', colorSrgb: [36 / 255, 104 / 255, 172 / 255] };
    h.base.rejectPublication = true; await ui.add('復旧する視点');
    expect(s.acknowledgment.state).toBe('failed'); expect(Object.keys(s.snapshot.viewData!.records)).toHaveLength(0);
    expect(s.views.pending).toBe('text');
    const paths = (await h.base.list(`${metadataArea}/${h.run}/`)).filter(p => p.endsWith('.amchange'));
    const bytes = await Promise.all(paths.map(p => h.base.readBytes(p)));
    ui.capture({ ...displayCapture(), background: { kind: 'solid', colorSrgb: [1, 1, 1] } });
    h.base.rejectPublication = false; await acknowledge(s, () => { s.retryWorking(); }); ui.w.render();
    expect(s.acknowledgment.state).toBe('idle'); expect(s.views.pending).toBeNull();
    const id = ui.picker.value; expect(s.snapshot.viewData!.records[id]!.background).toEqual({ kind: 'value', value: appliedBackground });
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
