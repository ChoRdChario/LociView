import { describe, expect, it, vi } from 'vitest';
import * as A from '@automerge/automerge';
import { createVerifiedDevelopmentPair } from './development-verified';
import { developmentContentBytes, developmentContentVerifier } from './content-verifier';
import { createTeamWorkspace } from '../../src/harness/projectScene/teamWorkspace';
import { projectHistory, captionKey } from '../../src/harness/projectScene/historyProjection';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { RecordedDocument, RecordedNode, record } from '../../tests/ui/domRecorder';
import { planCaptionList } from '../../src/ui/projectScene/captionListState';
import { editCaptionDraft, planCaptionApply } from '../../src/ui/projectScene/captionDetailState';
import { planModelList } from '../../src/ui/projectScene/modelListState';
import { planPinMode } from '../../src/ui/projectScene/pinModeState';
import { planNavigation } from '../../src/ui/projectScene/navigationState';
import { planCaptionInclude } from '../../src/ui/projectScene/captionIncludeState';
import { materialTargetKey, planMaterial, editMaterialDraft } from '../../src/ui/projectScene/materialState';
import { captionAttachments, fixtureMedia } from '../../src/harness/projectScene/mediaHistory';
import type { SyntheticSession } from '../../src/harness/projectScene/session';
import type { ViewportFactory } from '../../src/harness/projectScene/viewportHost';
import type { DisplayCapture } from '../../src/harness/projectScene/viewSession';
import { syntheticDisplay } from '../../src/harness/projectScene/viewportModel';

const nodes = (root: RecordedNode): RecordedNode[] => [root, ...root.children.flatMap(nodes)];
const by = (root: RecordedNode, check: (n: RecordedNode) => boolean) => {
  const n = nodes(root).find(check); if (!n) throw Error('Missing control'); return n;
};
const label = (root: RecordedNode, name: string) => by(root, n => n.attributes.get('aria-label') === name);
const button = (root: RecordedNode, name: string) => by(root, n => n.tag === 'button' && n.textContent === name);
const visible = (root: RecordedNode) => by(root, n => n.className === 'lv-development' && !n.hidden);
const selected = (s: SyntheticSession, id = f.shared) => expect(s.acceptList(planCaptionList(s.captionContext(), { kind: 'select', captionId: id }))).toBe(true);
const settled = async (s: SyntheticSession, failure = false) => {
  await vi.waitFor(() => expect(s.acknowledgment.state).not.toBe('checking'), { timeout: 10000, interval: 5 });
  expect(s.acknowledgment.state, s.acknowledgment.error || s.message).toBe(failure ? 'failed' : 'idle');
};
function edit(s: SyntheticSession, field: 'title' | 'body', raw: string) {
  const c = s.detailContext(); s.acceptDetail({ kind: 'draft', baseDraft: c.draft!, draft: editCaptionDraft(c.draft!, c.source, field, raw) });
  const plan = planCaptionApply(s.detailContext()); if (plan.kind !== 'apply') throw Error(plan.reason);
  expect(s.acceptDetail(plan)).toBe(false); // Async is not an acknowledgment.
}
const capture: DisplayCapture = { camera: { position: [0, 0, 8], target: [0, 0, 0], up: [0, 1, 0],
  projection: { kind: 'perspective', verticalFovRadians: 1 } }, background: { kind: 'solid', colorSrgb: [0.5, 0.5, 0.5] } };
const viewport: ViewportFactory = () => ({ update() {}, setActive() {}, camera() {}, retry() {}, dispose() {}, capture: () => capture,
  recall() {}, read: () => ({ ready: true, issue: null, token: 'synthetic-camera', dragging: false,
    projection: 'perspective', axis: null, pins: [] }) });
async function setMaterial(s: SyntheticSession, lighting: string) {
  const mat = (request: Parameters<typeof planMaterial>[1]) => s.acceptMaterial(planMaterial(s.materialContext(), request));
  mat({ kind: 'model', assetId: f.structure }); const source = s.materialContext().source; if (source.kind !== 'ready') throw Error();
  const surfaces = source.models.find(m => m.assetId === f.structure)!.surfaces; if (surfaces.kind !== 'value') throw Error();
  mat({ kind: 'surface', key: materialTargetKey(surfaces.value[0]!.target) }); mat({ kind: 'scope', scope: 'scene' }); mat({ kind: 'begin' });
  const draft = s.materialContext().draft!; s.acceptMaterial({ kind: 'draft', baseDraft: draft, draft: editMaterialDraft(draft, 'lighting', lighting) });
  mat({ kind: 'apply' }); await settled(s); expect(s.materialContext().draft, s.materials.message).toBe(null);
}
async function createCaption(s: SyntheticSession, assetId = f.equipment) {
  expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'target', assetId }))).toBe(true);
  expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'add' }))).toBe(true);
  s.changePinCoordinates({ coordinates: ['1', '2', '3'], familyId: s.pinCoordinateContext().families[0]!.id });
  expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }))).toBe(false);
  await settled(s); return s.memory.selectedCaptionId!;
}

describe('verified candidate through the existing mounted host; not browser or durable acceptance', () => {
  it('creates one new Caption through existing controls, preserves cancel/IME/filter input and retries the exact staged creation', async () => {
    let fail = false; const tokens: string[] = [];
    const pair = await createVerifiedDevelopmentPair(A, commands => {
      tokens.push(commands.token); if (fail) throw Error('Injected creation admission failure');
      return developmentContentVerifier(projectHistory(commands).modelVersions!.filter(v => Object.entries(commands.cells).some(([key, c]) =>
        key === `asset/${v.assetId}/binding` && c.kind === 'value' && c.value === v.projection.bindingId)).map(v => ({ variantFamilyId: v.closure.representation.variantFamilyId,
        representationId: v.closure.representation.id, payloadDigest: v.closure.representation.payloadDigest })));
    });
    const team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair), root = record(team.root), s = team.sessions[0]!;
    const work = visible(root), initial = s.snapshot;
    expect(button(work, 'ピンを追加').disabled).toBe(true);
    const target = label(work, '追加先モデル'); target.value = f.equipment; target.fire('change');
    expect(button(work, 'ピンを追加').disabled, s.message).toBe(false);
    button(work, 'ピンを追加').fire('click'); expect(s.pinCoordinates?.coordinates).toEqual(['', '', '']);
    const strip = label(work, 'ピンの操作'); expect(button(strip, '位置を確定').disabled).toBe(true);
    button(strip, '取り消す').fire('click'); button(strip, '操作を取り消す').fire('click');
    expect(s.snapshot).toBe(initial); expect(pair[0].exportUpdate().changes).toHaveLength(0);
    s.acceptList(planCaptionList(s.captionContext(), { kind: 'search', query: '絞り込みを保持' })); team.render();
    button(work, 'ピンを追加').fire('click'); const coords = label(work, 'ピン座標・開発用');
    const surfaceTarget = s.pinSurfaceTarget()!;
    expect(s.acceptPinSurface(surfaceTarget, [0.5, 0.25, 0])).toBe(true); team.render();
    expect(s.pinPreviewAnchor).toMatchObject({ positionAsset: [0.5, 0.25, 0] });
    for (const [axis, raw] of [['X', '1'], ['Y', '2'], ['Z', '3']]) { const input = label(coords, axis!); input.value = raw!; input.fire('input'); }
    const family = label(coords, 'ピンを置く表面'); family.value = s.pinCoordinateContext().families[0]!.id; family.fire('change');
    const x = label(coords, 'X'); x.fire('compositionstart'); expect(button(strip, '位置を確定').disabled).toBe(true);
    x.fire('compositionend'); expect(button(strip, '位置を確定').disabled).toBe(false);
    fail = true; button(strip, '位置を確定').fire('click'); expect(s.snapshot).toBe(initial); await settled(s, true);
    const stagedToken = tokens.at(-1), retained = s.pinCoordinates;
    expect(retained?.coordinates).toEqual(['1', '2', '3']); expect(s.snapshot).toBe(initial);
    expect(s.pinPreviewAnchor).toMatchObject({ positionAsset: [1, 2, 3] });
    expect(s.acceptPinSurface(surfaceTarget, [9, 9, 9])).toBe(false); expect(s.pinCoordinates).toBe(retained);
    button(strip, '位置を確定').fire('click'); expect(tokens.at(-1)).toBe(stagedToken);
    fail = false; button(work, '更新を再試行').fire('click'); await settled(s);
    expect(tokens.at(-1)).toBe(stagedToken); expect(s.snapshot.state.token).toBe(stagedToken);
    const id = s.memory.selectedCaptionId!; expect(id).not.toBe(f.shared); expect(id).not.toBe(f.second);
    expect(s.snapshot.resources.captions[id]).toMatchObject({ lifecycle: { value: { state: 'active', reason: 'initial' } },
      title: { value: '' }, body: { value: '' }, anchor: { value: { assetId: f.equipment, positionAsset: [1, 2, 3] } } });
    expect(Object.values(s.snapshot.state.captionMemberships).filter(e => e.resourceId === id).map(e => e.sceneId)).toEqual([f.overview]);
    expect(s.snapshot.state.assetMemberships).toEqual(initial.state.assetMemberships);
    expect(s.snapshot.resources.captions[f.shared]).toEqual(initial.resources.captions[f.shared]);
    expect(s.memory.search).toBe('絞り込みを保持'); expect(s.message).toContain('非表示');
    expect(s.pinCoordinates).toBe(null); expect(pair[0].exportUpdate().changes).toHaveLength(1);
    const title = label(work, 'タイトル'); title.value = '新しい記録'; title.fire('input'); button(work, '変更を適用').fire('click'); await settled(s);
    const actor = label(root, '操作する人'); actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(team.sessions[1]!);
    expect(team.sessions[1]!.snapshot.resources.captions[id]!.title).toEqual({ kind: 'value', value: '新しい記録' }); team.dispose();
  });

  it('keeps a newly created Caption as a copy root through two Scene memberships, media, explicit keep-both and second exchange', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair);
    const [a, b] = team.sessions as [SyntheticSession, SyntheticSession], root = record(team.root), actor = label(root, '操作する人');
    const id = await createCaption(a); edit(a, 'body', '元の記録'); await settled(a);
    a.media.add(a.mediaContext(), fixtureMedia[0]!.record.id); await settled(a);
    actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(b);
    const original = a.snapshot.resources.captions[id], originalMedia = captionAttachments(a.snapshot.mediaData, id).ready[0]!;
    for (const s of [a, b]) {
      s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
      s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId: id }));
      s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); await settled(s);
    }
    team.render(); button(root, '相手の更新を受け取る').fire('click'); await settled(b);
    const panel = label(root, '更新の競合'), radio = by(panel, n => n.type === 'radio'); radio.checked = true; radio.fire('change');
    button(panel, '別々のキャプションとして残す').fire('click'); await settled(b);
    const copyId = Object.keys(b.snapshot.resources.captions).find(c => ![f.shared, f.second, id].includes(c))!;
    expect(copyId).toBeDefined(); selected(b, copyId); edit(b, 'body', 'コピーだけの記録'); await settled(b);
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(a);
    expect(a.snapshot.resources.captions[id]).toEqual(original);
    expect(a.snapshot.resources.captions[copyId]!.body).toEqual({ kind: 'value', value: 'コピーだけの記録' });
    expect(a.snapshot.resources.captions[copyId]!.anchor).toEqual(original!.anchor);
    const copiedMedia = captionAttachments(a.snapshot.mediaData, copyId).ready[0]!;
    expect(copiedMedia.id).not.toBe(originalMedia.id); expect(copiedMedia.mediaResourceId).toEqual(originalMedia.mediaResourceId);
    expect(Object.values(a.snapshot.state.captionMemberships).filter(e => e.resourceId === copyId).map(e => e.sceneId)).toEqual([f.detail]);
    expect(pair[0].read().token).toBe(pair[1].read().token);
    const before = pair[0].exportUpdate().changes; button(root, '同じ更新を再受信').fire('click'); await settled(a);
    expect(pair[0].exportUpdate().changes).toEqual(before); team.dispose();
  });

  it('rejects a stale creation target and invalid coordinates without discarding the proposed input', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair);
    const s = team.sessions[0]!, before = s.snapshot;
    s.acceptPin(planPinMode(s.pinContext(), { kind: 'target', assetId: f.equipment })); s.acceptPin(planPinMode(s.pinContext(), { kind: 'add' }));
    s.changePinCoordinates({ coordinates: ['Infinity', '', '3'], familyId: s.pinCoordinateContext().families[0]!.id });
    expect(planPinMode(s.pinContext(), { kind: 'finish' }).kind).toBe('blocked'); expect(s.snapshot).toBe(before);
    s.changePinCoordinates({ coordinates: ['1', '2', '3'], familyId: s.pinCoordinateContext().families[0]!.id });
    const plan = planPinMode(s.pinContext(), { kind: 'finish' }), input = s.pinCoordinates;
    const version = s.snapshot.modelVersions!.find(v => v.assetId === f.equipment && v.label === '形状を更新したモデル')!;
    await pair[0].write(pair[0].read().token, { [`asset/${f.equipment}/binding`]: version.projection.bindingId }); s.refreshHistory();
    expect(s.acceptPin(plan)).toBe(false); expect(s.pinCoordinates).toBe(input);
    expect(Object.keys(s.snapshot.resources.captions)).toHaveLength(2);
    const c = s.pinContext(); expect(s.acceptPin(planPinMode(c, { kind: 'cancel', confirmedMode: c.memory.mode!, confirmedProposal: c.proposal }))).toBe(true);
    expect(s.pinCoordinates).toBe(null); team.dispose();
  });
  it('retains draft DOM and confirmed state while checking, then retries exact bytes without an actor/receive escape', async () => {
    let mode: 'normal' | 'wait' | 'fail' = 'normal', release: (() => void) | undefined;
    const observed: string[] = [];
    const pair = await createVerifiedDevelopmentPair(A, commands => {
      observed.push(commands.token); if (mode === 'fail') throw Error('Injected admission failure');
      const known = projectHistory(commands), authorities = known.modelVersions!.filter(v => Object.values(commands.cells).some(c =>
        c.kind === 'value' && c.value === v.projection.bindingId)).map(v => ({ variantFamilyId: v.closure.representation.variantFamilyId,
        representationId: v.closure.representation.id, payloadDigest: v.closure.representation.payloadDigest }));
      return developmentContentVerifier(authorities, async r => {
        if (mode === 'wait') { mode = 'normal'; await new Promise<void>(resolve => { release = resolve; }); }
        return developmentContentBytes(r);
      });
    });
    const team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair), root = record(team.root), s = team.sessions[0]!;
    const work = visible(root), actor = label(root, '操作する人');
    by(label(work, 'キャプション一覧'), n => n.className === 'lv-caption-select').fire('click');
    const input = label(work, 'タイトル'); input.value = '確認後に反映'; input.fire('input');
    const before = s.snapshot, draft = s.detailContext().draft;
    mode = 'wait'; button(work, '変更を適用').fire('click');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(s.snapshot).toBe(before); expect(s.detailContext().draft).toBe(draft); expect(actor.disabled).toBe(true);
    actor.value = '1'; actor.fire('change'); expect(actor.value).toBe('0');
    button(root, '相手の更新を受け取る').fire('click'); expect(s.snapshot).toBe(before);
    expect(label(work, 'タイトル')).toBe(input); expect(input.value).toBe('確認後に反映');
    expect((by(work, n => n.className === 'lv-development-content') as unknown as { inert: boolean }).inert).toBe(true);
    release!(); await settled(s); expect(s.snapshot.state).toBe(pair[0].read().provider.state);
    expect(s.snapshot.resources.captions[f.shared]!.title).toEqual({ kind: 'value', value: '確認後に反映' }); expect(s.pending).toBe(null);
    const confirmed = s.snapshot; input.value = '再試行の入力'; input.fire('input');
    mode = 'fail'; button(work, '変更を適用').fire('click'); await settled(s, true);
    const staged = observed.at(-1); expect(s.snapshot).toBe(confirmed); expect(input.value).toBe('再試行の入力');
    expect(button(work, '更新を再試行').hidden).toBe(false);
    mode = 'normal'; button(work, '更新を再試行').fire('click'); await settled(s);
    expect(observed.at(-1)).toBe(staged); expect(s.pending).toBe(null);
    expect(pair[0].read().cells[captionKey(f.shared, 'title')]).toEqual({ kind: 'value', value: '再試行の入力' });
    expect(pair[0].exportUpdate().changes).toHaveLength(2); team.dispose();
  });

  it('connects two rounds, explicit scalar choice, independent Caption copies and no-op receive on the same provider', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair);
    const root = record(team.root), actor = label(root, '操作する人'), [a, b] = team.sessions as [SyntheticSession, SyntheticSession];
    selected(a); selected(b); edit(a, 'title', '準備担当'); await settled(a); edit(b, 'title', '参加者'); await settled(b); team.render();
    actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(b);
    expect(b.snapshot.resources.captions[f.shared]!.title.kind).toBe('unresolved');
    const panel = label(root, '更新の競合'), confirm = button(panel, '選んだ内容を使用'); expect(confirm.disabled).toBe(true);
    const radio = by(panel, n => n.type === 'radio'); radio.checked = true; radio.fire('change'); confirm.fire('click'); await settled(b);
    actor.value = '0'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(a);
    expect(pair[0].read().token).toBe(pair[1].read().token);
    for (const s of [a, b]) {
      expect(s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }))).toBe(true);
      expect(s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'select', captionId: f.second }))).toBe(true);
      s.acceptInclude(planCaptionInclude(s.includeContext(), { kind: 'include' })); await settled(s);
    }
    team.render(); button(root, '相手の更新を受け取る').fire('click'); await settled(a);
    const duplicate = by(label(root, '更新の競合'), n => n.tag === 'fieldset'), choice = by(duplicate, n => n.type === 'radio');
    expect(button(duplicate, '別々のキャプションとして残す').disabled).toBe(true);
    choice.checked = true; choice.fire('change'); button(duplicate, '別々のキャプションとして残す').fire('click'); await settled(a);
    const copyId = Object.keys(a.snapshot.resources.captions).find(id => id !== f.shared && id !== f.second)!;
    expect(copyId).toBeDefined(); selected(a, copyId); edit(a, 'body', '独立した追記'); await settled(a);
    actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(b);
    expect(pair[1].read().project.resources.captions[copyId]!.body).toEqual({ kind: 'value', value: '独立した追記' });
    expect(b.snapshot.resources.captions[f.second]!.body).not.toEqual(b.snapshot.resources.captions[copyId]!.body);
    const original = pair[1].exportUpdate().changes.map(v => Buffer.from(v).toString('hex'));
    button(root, '同じ更新を再受信').fire('click'); await settled(b);
    expect(pair[1].exportUpdate().changes.map(v => Buffer.from(v).toString('hex'))).toEqual(original); team.dispose();
  });

  it('acknowledges models, pins, materials, media and a new Saved View only after verified publication', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair, viewport);
    const s = team.sessions[0]!, root = record(team.root); selected(s); team.render();
    s.acceptModel(planModelList(s.modelContext(), { kind: 'select', assetId: f.equipment }));
    const choice = s.modelUpdateContext().choices.find(v => v.label === '表面が同じ表示用モデル')!;
    s.acceptModelUpdate({ token: s.snapshot.state.token, sceneId: s.sceneId, assetId: f.equipment, bindingId: choice.projection.bindingId }); await settled(s);
    expect(s.snapshot.resources.assets[f.equipment]!.projection.kind).toBe('value');
    expect(s.beginModelPlacement()).toBe(true); s.changeModelPlacement(['3', '2', '1']); s.finishModelPlacement();
    expect(s.modelPlacement).not.toBe(null); await settled(s); expect(s.modelPlacement).toBe(null);
    expect(s.acceptPin(planPinMode(s.pinContext(), { kind: 'move' }))).toBe(true);
    s.changePinCoordinates({ coordinates: ['1', '2', '3'], familyId: null }); s.acceptPin(planPinMode(s.pinContext(), { kind: 'finish' }));
    expect(s.pinCoordinates).not.toBe(null); await settled(s); expect(s.pinCoordinates).toBe(null);
    const mat = (request: Parameters<typeof planMaterial>[1]) => s.acceptMaterial(planMaterial(s.materialContext(), request));
    mat({ kind: 'model', assetId: f.equipment }); const source = s.materialContext().source; if (source.kind !== 'ready') throw Error();
    const surfaces = source.models.find(m => m.assetId === f.equipment)!.surfaces; if (surfaces.kind !== 'value') throw Error();
    mat({ kind: 'surface', key: materialTargetKey(surfaces.value[0]!.target) }); mat({ kind: 'scope', scope: 'scene' }); mat({ kind: 'begin' });
    const draft = s.materialContext().draft!; s.acceptMaterial({ kind: 'draft', baseDraft: draft, draft: editMaterialDraft(draft, 'lighting', 'unlit') });
    mat({ kind: 'apply' }); expect(s.materialContext().draft).not.toBe(null); await settled(s); expect(s.materialContext().draft, s.materials.message).toBe(null);
    s.media.add(s.mediaContext(), fixtureMedia[0]!.record.id); expect(captionAttachments(s.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    await settled(s); const id = captionAttachments(s.snapshot.mediaData, f.shared).ready[0]!.id;
    s.media.begin(s.mediaContext(), id); s.media.input('添付の説明', false); s.media.apply(); expect(s.media.draft).not.toBe(null);
    await settled(s); expect(s.media.draft).toBe(null); s.media.remove(s.mediaContext(), id); await settled(s);
    expect(captionAttachments(s.snapshot.mediaData, f.shared).ready).toHaveLength(0);
    s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'task', task: 'views' })); team.render();
    const work = visible(root), author = label(work, '視点の作成と管理'); button(author, '視点を作る').fire('click');
    const name = label(author, '視点の名称'); name.value = '記録した視点'; name.fire('input'); button(author, '現在の表示を使用').fire('click');
    button(author, '視点を追加').fire('click'); await settled(s);
    expect(Object.values(s.snapshot.viewData!.records).some(v => v.name.kind === 'value' && v.name.value === '記録した視点')).toBe(true);
    expect(nodes(work).some(n => n.textContent === '編集中の視点を適用するか取り消してください。' && !n.hidden)).toBe(false);
    expect(s.views.pending).toBe(null);
    expect(button(author, '編集').disabled).toBe(false); button(author, '編集').fire('click');
    expect(label(author, '視点の名称').value).toBe('記録した視点'); team.dispose();
  });

  it('keeps duplicate material display unresolved while retaining an explicit source-based chooser', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair, viewport);
    const [a, b] = team.sessions as [SyntheticSession, SyntheticSession], root = record(team.root);
    await setMaterial(a, 'unlit'); await setMaterial(b, 'lit'); team.render();
    button(root, '相手の更新を受け取る').fire('click'); await settled(a);
    expect(Object.values(a.snapshot.materialData!.records).every(r => r.routing.kind === 'unresolved')).toBe(true);
    const review = label(root, 'マテリアルの重複'), radio = by(review, n => n.type === 'radio');
    expect(review.hidden).toBe(false); expect(button(review, '選んだ設定を残す').disabled).toBe(true);
    radio.checked = true; radio.fire('change'); button(review, '選んだ設定を残す').fire('click'); await settled(a);
    expect(Object.values(a.snapshot.materialData!.records).filter(r => r.lifecycle.kind === 'value' && r.lifecycle.value.state === 'active')).toHaveLength(1);
    expect(label(root, 'マテリアルの重複').hidden).toBe(true);
    expect(Object.values(a.snapshot.resources.materials).some(r => r.intent.kind === 'value')).toBe(true); team.dispose();
  });

  it('retains independent model-copy closure and placement through the mounted keep-both choice and second exchange', async () => {
    const pair = await createVerifiedDevelopmentPair(A), team = createTeamWorkspace(new RecordedDocument().asDocument(), () => pair, viewport);
    const [a, b] = team.sessions as [SyntheticSession, SyntheticSession], root = record(team.root), actor = label(root, '操作する人');
    for (const s of [a, b]) {
      s.acceptNavigation(planNavigation(s.snapshot.state, s.session, s.pending, { kind: 'scene', sceneId: f.detail }));
      s.acceptModel(planModelList(s.modelContext(), { kind: 'membership', assetId: f.structure, included: true })); await settled(s);
    }
    team.render(); button(root, '相手の更新を受け取る').fire('click'); await settled(a);
    const panel = label(root, '更新の競合'), radio = by(panel, n => n.type === 'radio'); radio.checked = true; radio.fire('change');
    button(panel, '別々のモデルとして残す').fire('click'); await settled(a);
    const copyId = Object.keys(a.snapshot.resources.assets).find(id => id !== f.structure && id !== f.equipment)!; expect(copyId).toBeDefined();
    expect(a.snapshot.resources.assets[copyId]!.projection.kind).toBe('value');
    const display = syntheticDisplay(a.snapshot, a.sceneId, null, null); expect(display.models.some(m => m.binding.assetId === copyId)).toBe(true);
    a.acceptModel(planModelList(a.modelContext(), { kind: 'select', assetId: copyId })); a.beginModelPlacement(); a.changeModelPlacement(['5', '4', '3']); a.finishModelPlacement(); await settled(a);
    const captionId = await createCaption(a, copyId);
    expect(a.acceptPin(planPinMode(a.pinContext(), { kind: 'move' }))).toBe(true);
    a.changePinCoordinates({ coordinates: ['4', '5', '6'], familyId: null }); a.acceptPin(planPinMode(a.pinContext(), { kind: 'finish' })); await settled(a);
    actor.value = '1'; actor.fire('change'); button(root, '相手の更新を受け取る').fire('click'); await settled(b);
    expect(b.snapshot.resources.assets[copyId]).toEqual(a.snapshot.resources.assets[copyId]);
    expect(b.snapshot.resources.captions[captionId]!.anchor).toMatchObject({ kind: 'value', value: { assetId: copyId, positionAsset: [4, 5, 6] } });
    expect(pair[0].read().token).toBe(pair[1].read().token); team.dispose();
  });
});
