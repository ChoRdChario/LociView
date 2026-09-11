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
import { materialBucket, materialKey, materialTarget, type MaterialRouting } from '../../src/harness/projectScene/materialHistory';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';
import { canonicalFixture } from '../../src/harness/projectScene/modelClosure';
import { metadataModels } from '../../src/harness/projectScene/metadataFixture';
import { fixtureMedia, captionAttachments } from '../../src/harness/projectScene/mediaHistory';
import { RecordedDocument, record, type RecordedNode } from './domRecorder';

class FaultFS extends MemoryFS {
  rejectPublication = false; rejectImage = false; writes = 0;
  override async writeText(path: string, data: string) {
    if (this.rejectPublication && path.endsWith('/published.json')) throw Error('synthetic quota');
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
function materialHost(s: SyntheticSession) {
  const w = createDevelopmentWorkspace(new RecordedDocument().asDocument(), s), r = record(w.root);
  button(r, 'マテリアル').fire('click'); const panel = named(r, 'マテリアル');
  setInput(named(panel, 'モデル'), f.equipment); const surface = named(panel, '面'); setInput(surface, surface.children[1]!.value);
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
