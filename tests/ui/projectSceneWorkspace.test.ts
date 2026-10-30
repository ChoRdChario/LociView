import { describe, expect, it } from 'vitest';
import { value } from '../../src/scene/types';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { planNavigation, type TaskId } from '../../src/ui/projectScene/navigationState';
import { captionListView, planCaptionList, type CaptionListIntent } from '../../src/ui/projectScene/captionListState';
import { editCaptionDraft, hasCaptionDraft, planCaptionApply } from '../../src/ui/projectScene/captionDetailState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { RecordedDocument, RecordedNode, record } from './domRecorder';
import { pinPositionInParent } from '../../src/harness/projectScene/pinParent';
import { pointInProject } from '../../src/harness/projectScene/viewportModel';
import { syntheticVersions, versionFromClosure } from '../../src/harness/projectScene/modelFixture';
import { createFixtureModel, fixtureModelIds } from '../../src/harness/projectScene/modelClosure';
import { degreesRotation } from '../../src/harness/projectScene/modelTransform';

const find = (session: SyntheticSession, intent: CaptionListIntent) => session.acceptList(planCaptionList(session.captionContext(), intent));
const navigate = (session: SyntheticSession, sceneId: string) => session.acceptNavigation(
  planNavigation(session.snapshot.state, session.session, session.pending, { kind: 'scene', sceneId }));
const tab = (session: SyntheticSession, task: TaskId) => session.acceptNavigation(
  planNavigation(session.snapshot.state, session.session, session.pending, { kind: 'task', task }));
function edit(session: SyntheticSession, title: string) {
  const ctx = session.detailContext(), draft = editCaptionDraft(ctx.draft!, ctx.source, 'title', title);
  expect(session.acceptDetail({ kind: 'draft', baseDraft: ctx.draft!, draft })).toBe(true);
}
function apply(session: SyntheticSession) {
  const plan = planCaptionApply(session.detailContext());
  if (plan.kind !== 'apply') throw new Error(plan.reason);
  return plan;
}
const toggle = (session: SyntheticSession, included: boolean) => session.acceptModel(
  planModelList(session.modelContext(), { kind: 'membership', assetId: f.equipment, included }));
const descendants = (node: RecordedNode): RecordedNode[] => [node, ...node.children.flatMap(descendants)];
const by = (root: RecordedNode, predicate: (node: RecordedNode) => boolean) => {
  const found = descendants(root).find(predicate); if (!found) throw new Error('Recorded control not found'); return found;
};
const label = (root: RecordedNode, name: string) => by(root, n => n.attributes.get('aria-label') === name);
const button = (root: RecordedNode, text: string) => by(root, n => n.tag === 'button' && n.textContent === text);

describe('connected synthetic development host (not rendered, storage or TEAM-FLOW acceptance)', () => {
  it('changes an existing parent without replacing the Caption, its contents/windows or its Scene memberships', () => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument()), root = record(w.root), s = w.session;
    find(s, { kind: 'select', captionId: f.shared }); w.render(); const before = s.snapshot, windows = s.windowMemory;
    const target = label(root, '変更先モデル'); target.fire('focus'); target.value = f.structure; target.fire('change');
    button(root, '位置を確認').fire('click');
    expect(s.pinContext().memory.mode?.kind).toBe('reparent'); expect(s.snapshot).toBe(before);
    const expected = pinPositionInParent(before, f.shared, f.structure)!;
    expect(s.pinPreviewAnchor).toMatchObject({ assetId: f.structure, positionAsset: expected });
    expect(navigate(s, f.detail)).toBe(false);
    button(root, '親モデルと位置を確定').fire('click');
    const after = s.snapshot;
    expect(after.resources.captions[f.shared]).toEqual({ ...before.resources.captions[f.shared], anchor: after.resources.captions[f.shared]!.anchor });
    expect(after.state.captionMemberships).toEqual(before.state.captionMemberships); expect(after.state.assetMemberships).toEqual(before.state.assetMemberships);
    expect(after.colors).toEqual(before.colors); expect(after.mediaData).toEqual(before.mediaData); expect(s.windowMemory).toEqual(windows);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.pinSurfaceTarget()?.assetId).toBe(f.structure);
    const c = s.pinContext(); s.acceptPin(planPinMode(c, { kind: 'cancel', confirmedMode: c.memory.mode, confirmedProposal: c.proposal }));
    expect(navigate(s, f.detail)).toBe(true);
    expect(s.composition.captions.find(caption => caption.captionId === f.shared)?.marker).toBe('suppressed'); w.dispose();
  });

  it('converts Asset/Project positions through rotated/scaled frames and never invents an unavailable position', () => {
    const base = new SyntheticSession().snapshot;
    const versions = syntheticVersions.map((v, i) => versionFromClosure(createFixtureModel(fixtureModelIds(v.closure), 'original', {
      translation: [i + 2, 3, -4], rotationXYZW: degreesRotation(['0', '30', '90']), uniformScale: i + 2,
    })));
    const project = { ...base, modelVersions: versions };
    const old = base.resources.captions[f.shared]!.anchor;
    if (old.kind !== 'value' || old.value.kind !== 'asset') throw Error('anchor');
    const oldAnchor = old.value;
    const source = versions.find(v => v.assetId === oldAnchor.assetId && v.projection.bindingId ===
      (base.resources.assets[oldAnchor.assetId]!.projection as { value: { bindingId: string } }).value.bindingId)!;
    const destination = versions.find(v => v.assetId === f.structure)!;
    const world = pointInProject(old.value.positionAsset, source.closure.binding.assetToProject);
    const projectAnchor = { ...project, resources: { ...project.resources, captions: { ...project.resources.captions,
      [f.shared]: { ...project.resources.captions[f.shared]!, anchor: value({ kind: 'project' as const, projectFrameId: project.resources.projectFrameId, positionProject: world }) } } } };
    for (const p of [project, projectAnchor]) {
      const converted = pinPositionInParent(p, f.shared, f.structure)!;
      const roundTrip = pointInProject(converted, destination.closure.binding.assetToProject);
      world.forEach((n, i) => expect(roundTrip[i]).toBeCloseTo(n, 10));
    }
    expect(pinPositionInParent({ ...project, modelVersions: versions.filter(v => v.assetId !== oldAnchor.assetId) }, f.shared, f.structure)).toBeNull();
  });

  it('requires manual placement for a missing source, but refuses anchor conflicts; cancellation survives readonly loss', () => {
    const base = new SyntheticSession().snapshot;
    let project = { ...base, resources: { ...base.resources, assets: { ...base.resources.assets,
      [f.equipment]: { ...base.resources.assets[f.equipment]!, projection: { kind: 'unresolved' as const, reason: 'missing' as const } } } } };
    let readOnly = false;
    const s = new SyntheticSession({ get readOnly() { return readOnly; }, read: () => project,
      write: () => { throw Error('not an ordinary move'); }, reparentPin: () => { throw Error('preview only'); } });
    find(s, { kind: 'select', captionId: f.shared });
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'reparent', assetId: f.structure }))).toBe(true);
    expect(s.pinPreviewAnchor).toBeNull(); expect(planPinMode(s.pinContext(), { kind: 'finish' }).kind).toBe('blocked');
    expect(s.message).toContain('元の位置を確認できません');
    expect(s.acceptPinSurface(s.pinSurfaceTarget()!, [1, 2, 3])).toBe(true);
    expect(s.pinPreviewAnchor).toMatchObject({ assetId: f.structure, positionAsset: [1, 2, 3] });
    readOnly = true; expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }))).toBe(false);
    const c = s.pinContext(); expect(s.acceptPin(planPinMode(c, { kind: 'cancel', confirmedMode: c.memory.mode, confirmedProposal: c.proposal }))).toBe(true);
    expect(s.snapshot).toEqual(project); readOnly = false;
    project = { ...project, state: { ...project.state, token: 'conflicted' }, resources: { ...project.resources, token: 'conflicted',
      captions: { ...project.resources.captions, [f.shared]: { ...project.resources.captions[f.shared]!, anchor: { kind: 'unresolved', reason: 'conflict' } } } } };
    s.refreshHistory(); expect(planPinMode(s.pinContext(), { kind: 'reparent', assetId: f.structure }).kind).toBe('blocked');
  });
  it('adds repeatedly with a Scene-local color, independent of filters, existing records, movement and cancellation', () => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument()), root = record(w.root), s = w.session;
    const original = s.snapshot, color = label(root, '追加色'); color.value = '#2468ac'; color.fire('input');
    expect(s.snapshot).toBe(original); expect(s.pinContext().memory.addColor).toBe('#2468ac');
    find(s, { kind: 'color', color: '#a08045' }); const filters = s.memory.pinColors;
    button(root, 'ピンを追加').fire('click'); expect(color.disabled).toBe(true);
    color.value = '#ffffff'; color.fire('input'); expect(s.pinContext().memory.addColor).toBe('#2468ac');
    button(label(root, 'ピンの操作'), '取り消す').fire('click'); button(root, '操作を取り消す').fire('click');
    expect(s.snapshot).toBe(original); expect(s.pinContext().memory.addColor).toBe('#2468ac');
    const ids: string[] = [];
    for (let i = 0; i < 2; i++) {
      if (!i) {
        button(root, 'ピンを追加').fire('click');
        expect(s.acceptPinCreation(s.pinCreationTargets()[0]!, [i, 1, 0])).toBe(true);
      } else {
        button(root, 'このモデルに追加').fire('click'); // Explicit numeric alternative uses the same captured color.
        expect(s.changePinCoordinates({ coordinates: ['1', '1', '0'], familyId: s.pinSurfaceTarget()!.familyId })).toBe(true);
      }
      w.render();
      button(root, '位置を確定').fire('click'); ids.push(s.memory.selectedCaptionId!);
      expect(s.snapshot.colors[ids[i]!]).toEqual(value('#2468ac'));
      expect(s.memory.pinColors).toBe(filters); expect(s.message).toContain('絞り込み');
    }
    expect(ids[0]).not.toBe(ids[1]); expect(s.snapshot.colors[f.shared]).toEqual(original.colors[f.shared]);
    const priorColor = s.snapshot.colors[ids[1]!];
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }))).toBe(true); expect(s.snapshot.colors[ids[1]!]).toEqual(priorColor);
    expect(navigate(s, f.detail)).toBe(true); w.render(); expect(color.value).toBe('#a08045');
    color.fire('focus'); color.value = '#57758b'; color.fire('input');
    expect(navigate(s, f.overview)).toBe(true); w.render(); expect(color.value).toBe('#2468ac');
    expect(s.memory.pinColors).toBe(filters); expect(new SyntheticSession().pinContext().memory.addColor).toBe('#a08045'); w.dispose();
  });

  it('keeps per-Scene local model visibility, Caption windows/drafts and pin recovery separate from shared membership', () => {
    const s = new SyntheticSession(), original = s.snapshot;
    s.setViewportState(true, [f.structure, f.equipment], null);
    const hide = () => s.acceptModel(planModelList(s.modelContext(), { kind: 'visibility', action: 'hide', assetId: f.equipment }));
    find(s, { kind: 'select', captionId: f.shared }); find(s, { kind: 'select', captionId: f.second });
    find(s, { kind: 'select', captionId: f.shared }); const windows = s.windowMemory;
    const oldTarget = s.pinCreationTargets().find(t => t.assetId === f.equipment)!;
    const oldMove = planPinMode(s.pinContext(), { kind: 'move' });
    edit(s, '未確定の本文は保持'); const draft = s.detailContext().draft;
    expect(hide()).toBe(true); expect(s.detailContext().draft).toBe(draft); expect(s.windowMemory).toBe(windows);
    expect(s.snapshot).toBe(original); expect(s.hiddenAssetIds).toEqual([f.equipment]);
    expect(s.captionContext().source).toMatchObject({ kind: 'ready', captions: [expect.objectContaining({ id: f.shared, pin: 'ownerHidden' }), expect.anything()] });
    expect(s.acceptPin(oldMove)).toBe(false); expect(s.acceptPinCreation(oldTarget, [1, 2, 3])).toBe(false);
    expect(s.acceptModel(planModelList(s.modelContext(), { kind: 'visibility', action: 'show', assetId: f.equipment }))).toBe(true);
    expect(s.detailContext().draft).toBe(draft);
    // Applying the user's draft is a separate command, never a visibility side effect.
    expect(s.acceptDetail(apply(s))).toBe(true); const edited = s.snapshot;
    expect(hide()).toBe(true); expect(navigate(s, f.detail)).toBe(true); expect(s.hiddenAssetIds).toEqual([]);
    expect(navigate(s, f.overview)).toBe(true); expect(s.hiddenAssetIds).toEqual([f.equipment]);
    expect(find(s, { kind: 'showModel', captionId: f.shared })).toBe(true);
    expect(s.hiddenAssetIds).toEqual([]); expect(s.snapshot).toBe(edited); expect(s.windowMemory).toBe(windows);
    const planned = planModelList(s.modelContext(), { kind: 'visibility', action: 'hide', assetId: f.equipment });
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.acceptModel(planned)).toBe(false); const pin = s.pinContext();
    expect(s.acceptPin(planPinMode(pin, { kind: 'cancel', confirmedMode: pin.memory.mode, confirmedProposal: pin.proposal }))).toBe(true);
    s.setSearchComposing(true); expect(hide()).toBe(false); s.setSearchComposing(false);
    s.setViewportDragging(true); expect(hide()).toBe(false); s.setViewportDragging(false);
    expect(hide()).toBe(true);
    s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }));
    expect(s.beginModelPlacement()).toBe(false);
    expect(toggle(s, false)).toBe(true); expect(toggle(s, true)).toBe(true);
    expect(s.hiddenAssetIds).toEqual([]); expect(s.snapshot.resources.captions).toEqual(edited.resources.captions);
  });
  it.each([false, true])('keeps working state truthful across failures, pending input and readonly (browser retention: %s)', saved => {
    const project = new SyntheticSession().snapshot;
    let readOnly = false, kind: 'idle' | 'checking' | 'failed' = 'idle';
    const session = new SyntheticSession({ ...(saved ? { storage: 'saved-development' as const } : {}),
      get readOnly() { return readOnly; }, read: () => project,
      write: () => { throw Error('this presentation check must not write'); },
      status: () => ({ kind, error: 'synthetic retained failure' }) });
    const workspace = createDevelopmentWorkspace(new RecordedDocument().asDocument(), session), root = record(workspace.root);
    const status = by(root, n => n.className === 'lv-save-status');
    expect(status.dataset.state).toBe(saved ? 'retained' : 'pageOnly');
    expect(status.textContent).not.toContain('synthetic retained failure');
    kind = 'checking'; workspace.render(); expect(status.textContent).toBe('更新を確認中…');
    readOnly = true; session.setSearchComposing(true); kind = 'failed'; workspace.render();
    expect(status.dataset.state).toBe('failed'); expect(status.textContent).toContain('synthetic retained failure');
    kind = 'idle'; workspace.render(); expect(status.textContent).toBe('未確定の操作があります');
    session.setSearchComposing(false); workspace.render(); expect(status.textContent).toBe('閲覧のみ');
    readOnly = false; workspace.render(); expect(status.textContent).toBe(saved ? '再開用データのみ' : 'ページ内のみ');
    expect(descendants(root).map(n => n.textContent).join('\n')).not.toContain('保存済み');
    workspace.dispose();
  });

  it('arms surface selection without an owner; blocks Scene/editor changes and cancels before any hit', () => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument()), root = record(w.root), s = w.session, original = s.snapshot;
    button(root, 'ピンを追加').fire('click');
    expect(s.pinContext().memory).toMatchObject({ choosingSurface: true, addTargetId: null, mode: null });
    expect(s.pinPreviewAnchor).toBeNull(); expect(s.pending).toBe('pinMove');
    expect(button(label(root, 'シーン'), '設備の確認').disabled).toBe(true);
    expect(navigate(s, f.detail)).toBe(false); expect(find(s, { kind: 'select', captionId: f.second })).toBe(false);
    expect(s.snapshot).toBe(original);
    button(root, '視点').fire('click'); expect(label(root, 'ピンの操作').hidden).toBe(false);
    button(label(root, 'ピンの操作'), '取り消す').fire('click'); button(root, '操作を取り消す').fire('click');
    expect(s.pending).toBeNull(); expect(s.pinContext().memory.mode).toBeNull(); expect(s.snapshot).toBe(original);
    expect(navigate(s, f.detail)).toBe(true); w.dispose();
  });
  it('accepts only a current explicit surface identity and keeps an existing pin owner during adjustment', () => {
    const s = new SyntheticSession(), original = s.snapshot, targets = s.pinCreationTargets();
    const equipment = targets.find(t => t.assetId === f.equipment)!, structure = targets.find(t => t.assetId === f.structure)!;
    expect(s.acceptPinCreation({ ...equipment, bindingId: 'stale' }, [1, 2, 3])).toBe(false);
    expect(s.acceptPinCreation(equipment, [1, 2, 3])).toBe(true); expect(s.snapshot).toBe(original);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }))).toBe(true);
    const id = s.memory.selectedCaptionId!, confirmed = s.snapshot;
    expect(confirmed.resources.captions[id]!.anchor).toMatchObject({ value: { assetId: f.equipment, positionAsset: [1, 2, 3] } });
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    expect(s.pinPreviewAnchor).toMatchObject({ assetId: f.equipment, positionAsset: [1, 2, 3] });
    expect(s.acceptPinSurface(structure, [4, 5, 6])).toBe(false); expect(s.snapshot).toBe(confirmed);
  });
  it('keeps Scene/list/add/adjust/window tools in the right area and active placement beside the stage', () => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument()), root = record(w.root);
    const stage = label(root, 'シーンの構成'), sidebar = label(root, '作業パネル');
    expect(sidebar.contains(label(root, 'ピンの追加・移動'))).toBe(true);
    expect(sidebar.contains(label(root, 'シーン'))).toBe(true);
    expect(sidebar.contains(button(root, 'ウィンドウを並べる'))).toBe(true);
    expect(stage.contains(button(root, 'ウィンドウを並べる'))).toBe(false);
    expect(stage.contains(label(root, 'ピンの操作'))).toBe(true);
    expect(sidebar.contains(label(root, 'キャプションの詳細'))).toBe(true);
    expect(sidebar.contains(button(root, '比較に表示'))).toBe(true);
    const numeric = by(root, n => n.className === 'lv-development-numeric');
    expect(numeric.tag).toBe('details'); expect(numeric.hidden).toBe(true);
    expect(stage.contains(label(root, 'キャプションの詳細'))).toBe(false);
    w.dispose();
  });
  it('shares one Caption through A/B/A and keeps each Scene selection, search and color memory', () => {
    const session = new SyntheticSession(); const original = session.snapshot;
    expect(find(session, { kind: 'select', captionId: f.shared })).toBe(true);
    const ctx = session.detailContext(); expect(ctx.source.kind === 'ready' && ctx.source.sceneCount).toEqual(value(2));
    edit(session, '共有した編集'); expect(navigate(session, f.detail)).toBe(false);
    expect(session.acceptDetail(apply(session))).toBe(true);
    find(session, { kind: 'search', query: '共有' }); find(session, { kind: 'color', color: '#a08045' });
    const remembered = session.memory;
    expect(navigate(session, f.detail)).toBe(true); expect(session.memory.selectedCaptionId).toBeNull();
    find(session, { kind: 'select', captionId: f.shared });
    const source = session.detailContext().source;
    expect(source.kind === 'ready' && source.caption.title).toEqual(value('共有した編集'));
    expect(session.memory.pinColors).toBeNull(); expect(session.memory.search).toBe('');
    expect(navigate(session, f.overview)).toBe(true); expect(session.memory).toBe(remembered);
    expect(Object.keys(session.snapshot.resources.captions)).toHaveLength(2);
    expect(session.snapshot.resources.captions[f.shared]!.anchor).toBe(original.resources.captions[f.shared]!.anchor);
    expect(original.resources.captions[f.shared]!.title).toEqual(value('設備の確認箇所'));
    expect(session.snapshot.state.token).toBe(session.snapshot.resources.token);
    expect(new SyntheticSession().snapshot.resources.captions[f.shared]!.title).toEqual(value('設備の確認箇所'));
  });

  it('excludes only the exact model membership while retaining Caption input and shared content', () => {
    const session = new SyntheticSession(); find(session, { kind: 'select', captionId: f.shared });
    edit(session, '未適用の入力'); const draft = session.detailContext().draft, resources = session.snapshot.resources;
    tab(session, 'models'); expect(toggle(session, false)).toBe(true);
    expect(session.detailContext().draft).toBe(draft); expect(session.memory.selectedCaptionId).toBe(f.shared);
    expect(session.snapshot.resources.assets).toBe(resources.assets); expect(session.snapshot.resources.captions).toBe(resources.captions);
    expect(session.composition.assets.map(a => a.assetId)).toEqual([f.structure]);
    expect(session.composition.captions.find(c => c.captionId === f.shared)?.marker).toBe('suppressed');
    expect(session.captionContext().source.kind === 'ready' && session.detailContext().source.kind).toBe('ready');
    const source = session.detailContext().source; expect(source.kind === 'ready' && source.sceneCount).toEqual(value(2));
    expect(session.acceptDetail(apply(session))).toBe(true);
    expect(navigate(session, f.detail)).toBe(true); expect(session.composition.assets.map(a => a.assetId)).toEqual([f.equipment]);
    expect(navigate(session, f.overview)).toBe(true);
    expect(find(session, { kind: 'showModel', captionId: f.shared })).toBe(true);
    expect(session.composition.assets.map(a => a.assetId)).toEqual([f.structure, f.equipment]);
  });

  it('refuses stale navigation, Caption apply and model membership plans without losing the draft', () => {
    const session = new SyntheticSession(); find(session, { kind: 'select', captionId: f.shared });
    const oldNavigation = planNavigation(session.snapshot.state, session.session, session.pending, { kind: 'scene', sceneId: f.detail });
    edit(session, '保持する'); const oldApply = apply(session), draft = session.detailContext().draft;
    const oldModel = planModelList(session.modelContext(), { kind: 'membership', assetId: f.equipment, included: false });
    expect(session.acceptModel(oldModel)).toBe(true); const changed = session.snapshot;
    expect(session.acceptNavigation(oldNavigation)).toBe(false);
    expect(session.acceptDetail(oldApply)).toBe(false); expect(session.detailContext().draft).toBe(draft);
    expect(session.detailContext().feedback.kind).toBe('failed');
    expect(session.acceptModel(oldModel)).toBe(false); expect(session.snapshot).toBe(changed);
    expect(session.acceptDetail(apply(session))).toBe(true); expect(hasCaptionDraft(session.detailContext().draft)).toBe(false);
  });

  it('uses pin colors for list rows too; null/all and empty/none stay distinct', () => {
    const session = new SyntheticSession();
    find(session, { kind: 'color', color: '#a08045' }); find(session, { kind: 'color', color: '#57758b' });
    expect(session.memory.pinColors).toEqual([]);
    const ctx = session.captionContext(); expect(captionListView(ctx.source, ctx.memory).rows).toHaveLength(0);
    expect(navigate(session, f.detail)).toBe(true); expect(session.memory.pinColors).toBeNull();
    expect(navigate(session, f.overview)).toBe(true); expect(session.memory.pinColors).toEqual([]);
    find(session, { kind: 'allColors' }); expect(session.memory.pinColors).toBeNull();
  });

  it('aggregates both search IMEs and detail input without blocking task changes', () => {
    const session = new SyntheticSession(); session.setSearchComposing(true);
    expect(session.pending).toBe('composition'); expect(navigate(session, f.detail)).toBe(false);
    expect(tab(session, 'models')).toBe(true); session.setSearchComposing(false);
    session.acceptModel(planModelList(session.modelContext(), { kind: 'compose', active: true }));
    expect(navigate(session, f.detail)).toBe(false); expect(tab(session, 'captions')).toBe(true);
    session.acceptModel(planModelList(session.modelContext(), { kind: 'compose', active: false }));
    expect(navigate(session, f.detail)).toBe(true);
  });

  it('walks mounted controls through edits, tabs, cancel confirmation and A/B/A without remounting the form', () => {
    const document = new RecordedDocument(), workspace = createDevelopmentWorkspace(document.asDocument()), root = record(workspace.root);
    const list = label(root, 'キャプション一覧'); by(list, n => n.className === 'lv-caption-select').fire('click');
    const title = label(root, 'タイトル'), body = label(root, '本文'), scene = label(root, 'シーン');
    title.value = '画面で編集'; title.focus(); title.fire('input');
    expect(button(scene, '設備の確認').disabled).toBe(true); button(root, 'モデル').fire('click');
    expect(label(root, 'タイトル')).toBe(title); expect(label(root, '本文')).toBe(body);
    const draft = workspace.session.detailContext().draft;
    const modelRoot = by(root, n => n.className === 'lv-model-browser');
    const equipment = by(modelRoot, n => n.tag === 'li' && n.children.some(c => c.textContent === '設備'));
    const check = label(equipment, 'このシーンに表示'); check.checked = false; check.fire('change');
    expect(check.checked).toBe(false); expect(workspace.session.detailContext().draft).toBe(draft);
    button(root, 'キャプション').fire('click'); button(root, '変更を適用').fire('click');
    expect(button(scene, '設備の確認').disabled).toBe(false); button(scene, '設備の確認').fire('click');
    by(label(root, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
    expect(title.value).toBe('画面で編集'); button(scene, '全体').fire('click');
    expect(title.value).toBe('画面で編集'); expect(label(root, 'タイトル')).toBe(title);
    title.value = '取り消す文章'; title.fire('input'); button(label(root, 'キャプションの詳細'), '取り消す').fire('click');
    expect(hasCaptionDraft(workspace.session.detailContext().draft)).toBe(true);
    button(root, '変更を取り消す').fire('click'); expect(title.value).toBe('画面で編集');
    expect(hasCaptionDraft(workspace.session.detailContext().draft)).toBe(false);
    workspace.dispose(); expect(root.children.some(n => n === record(workspace.root))).toBe(false);
  });

  it('discloses unsaved and unconnected capabilities rather than reporting a fake product success', () => {
    const document = new RecordedDocument(), workspace = createDevelopmentWorkspace(document.asDocument()), root = record(workspace.root);
    find(workspace.session, { kind: 'select', captionId: f.shared }); workspace.render();
    expect(button(root, '比較に表示').disabled).toBe(false);
    button(root, '比較に表示').fire('click'); expect(workspace.session.message).toBe('');
    const text = descendants(root).map(n => n.textContent).join('\n');
    expect(text).toContain('再読み込みで失われます'); expect(text).toContain('3D表示は未接続です。シーンの構成と座標入力を確認できます。');
    expect(text).toContain('ページ内のみ'); expect(text).not.toContain('保存済み');
    button(root, 'マテリアル').fire('click'); expect(label(root, 'タイトル')).toBeDefined();
    button(root, '視点').fire('click'); expect(button(root, '+X').disabled).toBe(true);
  });
});
