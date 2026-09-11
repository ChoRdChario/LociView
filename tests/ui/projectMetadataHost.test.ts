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
import { metadataFixtureLimits, metadataProjectView, createMetadataFixture, metadataPreparedModels } from '../../src/harness/projectScene/metadataFixture';
import { inspectProjectCandidates } from '../../src/domain/projectCandidates';
import { writeMetadataSeed } from '../../src/harness/projectScene/metadataStorage';
import { underWriteLease } from '../../src/projectMetadata/persistence';
import type { MetadataEdit } from '../../src/projectMetadata/commands';
import { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { planViewAuthor } from '../../src/ui/projectScene/viewAuthoringState';
import { planView } from '../../src/ui/projectScene/viewState';
import { SyntheticViewSession, type DisplayCapture } from '../../src/harness/projectScene/viewSession';
import { materialBucket, materialKey, materialTarget, type MaterialRouting } from '../../src/harness/projectScene/materialHistory';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { canonicalFixture, fixtureRecordDigest, moveFixtureModel, createFixtureModel, fixtureModelIds, allocateModelCopyIds } from '../../src/harness/projectScene/modelClosure';
import { assetCopySource } from '../../src/projectMetadata/modelMembership';
import { assetMembershipGroups, type AssetMembershipResolution } from '../../src/projectMetadata/membership';
import { readMetadataModel } from '../../src/harness/projectScene/metadataModelRecords';
import { metadataProviderReady } from '../../src/projectMetadata/session';
import { metadataImmutableReader } from '../../src/projectMetadata/records';
import { assetStatusCandidates } from '../../src/projectMetadata/assetStatus';
import { modelClosureKey } from '../../src/harness/projectScene/modelHistory';
import type { JsonObject } from '../../src/domain/values';
import { metadataModels } from '../../src/harness/projectScene/metadataFixture';
import { fixtureMedia, captionAttachments } from '../../src/harness/projectScene/mediaHistory';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';
import { createMetadataReceiveControls } from '../../src/harness/projectScene/metadataReceiveControls';

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
      return { sourceMembershipId, ids: { ...ids, membership: fresh('sam') }, materialId: source.material ? fresh('ovr') : null,
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

describe('saved explicit model status resolution; synthetic ports/DOM only', () => {
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
      propose = model; return { update: d => { display = d; }, setActive() {}, camera() {}, retry() {}, dispose() {},
        read: () => ({ token: 'viewport', ready: true, issue: null, dragging: false, projection: 'perspective', axis: null, pins: [] }) };
    } });
    const root = record(w.root); button(root, 'モデル').fire('click'); selectModel(s); w.render();
    const begin = button(root, 'モデルの位置を編集'); expect(begin.hidden).toBe(false); expect(begin.disabled).toBe(false);
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
    setInput(named(panel, 'メディアを選択'), fixtureMedia[index]!.record.id);
    await acknowledge(s, () => button(panel, 'メディアを追加').fire('click')); w.render();
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
      { ...command, copies: [{ ...copy, materialId: 'ovr_' + 'e'.repeat(32) }] },
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
    expect(descendants(list).some(n => n.textContent === 'この選択・入力はまだ保存されていません。')).toBe(true);
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
    const gallery = area(named(ui.root, 'キャプションのウィンドウ'), '添付メディア');
    expect(descendants(gallery).filter(n => n.tag === 'img').map(n => (n as unknown as HTMLImageElement).src)).toEqual(fixtureMedia.map(m => `data:image/png;base64,${m.base64}`));
    button(ui.panel, '説明を編集').fire('click'); setInput(named(ui.panel, 'メディアの説明'), '保存した説明');
    await acknowledge(s, () => button(ui.panel, '説明を適用').fire('click')); ui.w.render();
    expect(rows()[0]!.altText).toEqual({ kind: 'value', value: '保存した説明' });
    await acknowledge(s, () => button(ui.panel, '後へ').fire('click')); ui.w.render(); expect(rows()[1]!.id).toBe(first);
    const reader = await h.open(), readonly = new SyntheticSession(reader.authority), readUI = mediaHost(readonly);
    expect(button(readUI.panel, 'メディアを追加').disabled).toBe(true); expect(button(readUI.panel, '説明を編集').disabled).toBe(true);
    const readGallery = area(named(readUI.root, 'キャプションのウィンドウ'), '添付メディア');
    button(readGallery, '拡大').fire('click'); expect(button(readGallery, '縮小')).toBeDefined();
    expect(readonly.media.add(readonly.mediaContext(), fixtureMedia[0]!.record.id)).toBe(false);
    readUI.w.dispose(); await reader.dispose();
    await ui.remove(); await ui.remove(); expect(rows()).toHaveLength(0); expect(host.read().state).toBe('ready');
    expect(Object.keys(s.snapshot.mediaData!.records)).toHaveLength(2);
    expect(s.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '先の作業を保持' });
    expect(await Promise.all(seedPaths.map(p => h.base.readBytes(p)))).toEqual(seedBytes);
    expect(host.content.counts.bodyBytes).toBe(0); ui.w.dispose(); await host.dispose();
    const cold = await h.open(), cs = new SyntheticSession(cold.authority), cu = mediaHost(cs);
    expect(cold.read().state).toBe('ready'); expect(Object.keys(cs.snapshot.mediaData!.images!)).toHaveLength(2);
    expect(captionAttachments(cs.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    await cu.add(0); expect(cs.acknowledgment.state).toBe('idle');
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
    const unknownRoute = altered(d => { d.materialOverridesById[id].routing = new A.ImmutableString(canonicalFixture({ ...route, future: true })); });
    const unknownRouteProvider = await read(unknownRoute);
    expect(materialBucket(metadataProjectView(unknownRouteProvider).materialData, route).kind).toBe('unresolved');
    for (const command of [edit, reset, { ...create, overrideId: `ovr_${'e'.repeat(32)}` }])
      expect(() => unknownRoute.prepareEdit(unknownRoute.token, command, unknownRouteProvider, tx)).toThrow();
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
