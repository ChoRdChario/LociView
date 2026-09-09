import { describe, expect, it } from 'vitest';
import { value } from '../../src/scene/types';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { SyntheticSession } from '../../src/harness/projectScene/session';
import { createDevelopmentWorkspace } from '../../src/harness/projectScene/workspace';
import { planNavigation, type TaskId } from '../../src/ui/projectScene/navigationState';
import { captionListView, planCaptionList, type CaptionListIntent } from '../../src/ui/projectScene/captionListState';
import { editCaptionDraft, hasCaptionDraft, planCaptionApply } from '../../src/ui/projectScene/captionDetailState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { RecordedDocument, RecordedNode, record } from './domRecorder';

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
  it('keeps placement controls outside the editor and details/comparison entry in the right task area', () => {
    const w = createDevelopmentWorkspace(new RecordedDocument().asDocument()), root = record(w.root);
    const stage = label(root, 'シーンの構成'), sidebar = label(root, '作業パネル');
    expect(stage.contains(label(root, 'ピンの追加・移動'))).toBe(true);
    expect(stage.contains(label(root, 'ピンの操作'))).toBe(true);
    expect(sidebar.contains(label(root, 'キャプションの詳細'))).toBe(true);
    expect(sidebar.contains(button(root, 'ウィンドウを表示'))).toBe(true);
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

  it('never uses pin color choices to filter list rows; null/all and empty/none stay distinct', () => {
    const session = new SyntheticSession();
    find(session, { kind: 'color', color: '#a08045' }); find(session, { kind: 'color', color: '#57758b' });
    expect(session.memory.pinColors).toEqual([]);
    const ctx = session.captionContext(); expect(captionListView(ctx.source, ctx.memory).rows).toHaveLength(2);
    expect(captionListView(ctx.source, ctx.memory).rows.every(row => row.colorHidden)).toBe(true);
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
    expect(scene.disabled).toBe(true); button(root, 'モデル').fire('click');
    expect(label(root, 'タイトル')).toBe(title); expect(label(root, '本文')).toBe(body);
    const draft = workspace.session.detailContext().draft;
    const modelRoot = by(root, n => n.className === 'lv-model-browser');
    const equipment = by(modelRoot, n => n.tag === 'li' && n.children.some(c => c.textContent === '設備'));
    const check = label(equipment, 'このシーンに表示'); check.checked = false; check.fire('change');
    expect(check.checked).toBe(false); expect(workspace.session.detailContext().draft).toBe(draft);
    button(root, 'キャプション').fire('click'); button(root, '変更を適用').fire('click');
    expect(scene.disabled).toBe(false); scene.value = f.detail; scene.fire('change');
    by(label(root, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
    expect(title.value).toBe('画面で編集'); scene.value = f.overview; scene.fire('change');
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
    expect(button(root, 'ウィンドウを表示').disabled).toBe(false);
    button(root, 'ウィンドウを表示').fire('click'); expect(workspace.session.message).toBe('');
    const text = descendants(root).map(n => n.textContent).join('\n');
    expect(text).toContain('再読み込みで失われます'); expect(text).toContain('3D表示は未接続です。シーンの構成と座標入力を確認できます。');
    expect(text).toContain('未保存'); expect(text).not.toContain('保存済み');
    button(root, 'マテリアル').fire('click'); expect(label(root, 'タイトル')).toBeDefined();
    button(root, '視点').fire('click'); expect(button(root, '+X').disabled).toBe(true);
  });
});
