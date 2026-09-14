import type { SavedWorkspaceHost } from './savedHost';
import type { SyntheticSession } from './session';
import { captionFieldCandidates } from '../../projectMetadata/captionCandidates';
import type { Anchor } from '../../scene/types';
import { sceneNameCandidates } from '../../projectMetadata/sceneAuthoring';
import { normalizeSceneName } from '../../domain/values';
import { entryViewCandidates, viewFieldCandidates, type ViewChoiceField } from '../../projectMetadata/viewResolution';

type Provider = Parameters<typeof viewFieldCandidates>[0];
const fieldLabels = { title: 'タイトル', body: '本文', anchor: 'ピン位置', colorSrgb: 'ピンの色', name: '名前',
  orderKey: '並び順', camera: 'カメラ', background: '背景', defaultViewId: '開始視点' };
type ChoiceField = keyof typeof fieldLabels;
const viewLabel = (p: Provider, id: string) => {
  const views = p.details.mutable.viewsById, row = views[id], name = row?.name, scene = row?.sceneId;
  const sceneId = scene?.kind === 'value' && typeof scene.value === 'string' ? scene.value : '', scenes = p.details.mutable.scenesById;
  const sceneName = scenes[sceneId]?.name, sceneNumber = Object.keys(scenes).sort().indexOf(sceneId) + 1;
  const knownScene = sceneName?.kind === 'value' && typeof sceneName.value === 'string';
  const duplicateScene = knownScene && Object.values(scenes).filter(r => r.name?.kind === 'value' && r.name.value === sceneName.value).length > 1;
  const scope = knownScene ? `${sceneName.value}${duplicateScene ? `（シーン ${sceneNumber}）` : ''}` : sceneId ? `シーン ${sceneNumber}` : 'シーンを確認';
  const number = Object.keys(views).sort().indexOf(id) + 1;
  const known = name?.kind === 'value' && typeof name.value === 'string';
  const duplicate = known && Object.values(views).filter(r => r.name?.kind === 'value' && r.name.value === name.value &&
    r.sceneId?.kind === 'value' && r.sceneId.value === sceneId).length > 1;
  return `${scope} › ${known ? `${name.value}${duplicate ? `（視点 ${number}）` : ''}` : `視点 ${number}`}`;
};
/** Description only: values used by the command always come from complete original candidates. */
function viewDescription(p: Provider, id: string, field: ChoiceField, value: unknown, sceneId: string): string {
  if (field === 'defaultViewId') return value === undefined ? '開始視点なし' : viewLabel(p, value as string);
  if (field === 'name') return value as string;
  if (field === 'camera') {
    const camera = value as { position: number[]; target: number[]; up: number[];
      projection: { kind: string; verticalFovRadians?: number; verticalSpan?: number } };
    const projection = camera.projection.kind === 'perspective' ? `透視投影・縦画角 ${camera.projection.verticalFovRadians} rad` :
      `平行投影・縦幅 ${camera.projection.verticalSpan}`;
    return `${projection}／位置 ${camera.position.join(' / ')}／注視点 ${camera.target.join(' / ')}／上方向 ${camera.up.join(' / ')}`;
  }
  if (field === 'background') return `単色・sRGB ${(value as { colorSrgb: number[] }).colorSrgb.join(' / ')}`;
  const rows: { name: string; key: string }[] = []; let unresolved = false;
  for (const [otherId, r] of Object.entries(p.details.mutable.viewsById)) {
    if (otherId === id || r.sceneId?.kind === 'value' && r.sceneId.value !== sceneId) continue;
    if (r.lifecycle?.kind === 'value' && (r.lifecycle.value as { state?: string }).state === 'deleted') continue;
    if (r.id?.kind !== 'value' || r.id.value !== otherId || r.projectFrameId?.kind !== 'value' || r.projectFrameId.value !== p.resources.projectFrameId ||
      r.sceneId?.kind !== 'value' || r.lifecycle?.kind !== 'value' || (r.lifecycle.value as { state?: string }).state !== 'active' ||
      p.issues.some(i => i.path[0] === 'viewsById' && i.path[1] === otherId && i.code === 'concurrent-delete-edit') ||
      r.orderKey?.kind !== 'value' || typeof r.orderKey.value !== 'string') {
      unresolved = true; continue;
    }
    rows.push({ name: viewLabel(p, otherId), key: r.orderKey.value });
  }
  const key = value as string, before = rows.filter(r => r.key < key).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0).at(-1),
    after = rows.filter(r => r.key > key).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)[0], ties = rows.filter(r => r.key === key);
  return [before ? `「${before.name}」の後` : '先頭側', after ? `「${after.name}」の前` : '末尾側',
    ...(ties.length ? [`同じ順序：${ties.map(r => r.name).join('、')}`] : []), ...(unresolved ? ['未解決の視点は比較から除外'] : [])].join('／');
}

/** Temporary comparison forms. Only explicit commands reach the saved host. */
export function createMetadataConflictControls(document: Document, host: Pick<SavedWorkspaceHost, 'read' | 'resolve' | 'limits'>,
  session: SyntheticSession, changed: () => void, config: { captionTextOnly?: boolean; blockedReason?: () => string | null } = {}) {
  const limits = host.limits;
  let disposed = false;
  const root = document.createElement('ul'); root.setAttribute('aria-label', '未解決の候補');
  type Form = { root: HTMLLIElement; token: string; select: HTMLSelectElement; text: HTMLTextAreaElement;
    apply: HTMLButtonElement; cancel: HTMLButtonElement; message: HTMLParagraphElement; composing: boolean; ready: boolean;
    isScene: boolean; isName: boolean; recordId: string; fieldName: ChoiceField; heading: HTMLParagraphElement; externalMessage?: string };
  const forms = new Map<string, Form>();
  const dirty = (f: Form) => !!f.select.value || !!f.text.value || f.composing;
  const hasChanges = () => [...forms.values()].some(dirty);
  const composing = () => [...forms.values()].some(f => f.composing);
  const blocked = () => disposed || session.readOnly || !!session.pending && session.pending !== 'text' || composing() || !!config.blockedReason?.();
  const validInput = (f: Form) => {
    if (!f.isName || f.select.value !== 'manual') return true;
    try { normalizeSceneName(f.text.value); return true; } catch { return false; }
  };
  const invalidNameMessage = '名前は256文字以内の1行で入力してください。空白だけの名前は使えません。';
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider, seen = new Set<string>(), nodes: HTMLLIElement[] = [];
    if (provider?.kind === 'scene-provider') for (const field of provider.inspection.candidates.fields) {
      if (config.captionTextOnly && (field.path[0] !== 'captionsById' || !['title', 'body'].includes(field.path[2] ?? ''))) continue;
      const isScene = field.path[0] === 'scenesById' && ['name', 'defaultViewId'].includes(field.path[2] ?? '');
      const isView = field.path[0] === 'viewsById' && ['name', 'orderKey', 'camera', 'background'].includes(field.path[2] ?? '');
      if (field.path.length !== 3 || !isScene && !isView && (field.path[0] !== 'captionsById' || !['title', 'body', 'anchor', 'colorSrgb'].includes(field.path[2] ?? '')) || field.candidates.length < 2) continue;
      const recordId = field.path[1]!, fieldName = field.path[2] as ChoiceField, key = `${field.path[0]}/${recordId}/${fieldName}`;
      const isEntry = fieldName === 'defaultViewId', isName = fieldName === 'name';
      const isText = isName || fieldName === 'title' || fieldName === 'body';
      seen.add(key); let form = forms.get(key);
      if (!form || form.token !== provider.token && !dirty(form)) {
        const item = document.createElement('li'), heading = document.createElement('p'), options = document.createElement('select');
        const text = document.createElement('textarea'), apply = document.createElement('button'), cancel = document.createElement('button');
        const message = document.createElement('p'), values = document.createElement('ul'), previewNote = document.createElement('p');
        const title = provider.resources.captions[recordId]?.title;
        const caption = title?.kind === 'value' ? title.value : `キャプション ${Object.keys(provider.resources.captions).indexOf(recordId) + 1}`;
        const label = isScene ? `${recordId === session.sceneId ? '現在のシーン' : `シーン ${Object.keys(provider.state.scenes).indexOf(recordId) + 1}`}：${fieldLabels[fieldName]}` :
          `${isView ? viewLabel(provider, recordId) : caption}：${fieldLabels[fieldName]}`;
        heading.textContent = label; options.setAttribute('aria-label', `${label}の解消方法`);
        text.setAttribute('aria-label', `${label}の${isName ? '入力' : '文言'}`); text.hidden = true;
        const option = (value: string, label: string) => {
          const o = document.createElement('option'); o.value = value; o.textContent = label; options.append(o);
        };
        option('', '残す内容を選択');
        let checked: ReturnType<typeof captionFieldCandidates> | undefined;
        let checkedScene: ReturnType<typeof sceneNameCandidates> | undefined;
        let checkedView: ReturnType<typeof viewFieldCandidates> | undefined;
        try {
          if (isEntry) checkedView = entryViewCandidates(provider, recordId, limits);
          else if (isView) checkedView = viewFieldCandidates(provider, recordId, fieldName as ViewChoiceField, limits);
          else if (isScene) checkedScene = sceneNameCandidates(provider, recordId, limits);
          else if (!isText) checked = captionFieldCandidates(provider, recordId, fieldName as 'anchor' | 'colorSrgb', limits);
        }
        catch { /* Do not offer a subset of malformed, unknown or lifecycle-ambiguous candidates. */ }
        field.candidates.forEach((c, i) => {
          let value = c.value.kind === 'value' && typeof c.value.value === 'string' ? c.value.value : '確認が必要な値';
          const li = document.createElement('li');
          if (checkedView) value = viewDescription(provider, recordId, fieldName, c.value.kind === 'value' ? c.value.value : undefined, checkedView.sceneId);
          else if (checked && fieldName === 'anchor' && c.value.kind === 'value') {
            const anchor = c.value.value as unknown as Anchor;
            const owner = anchor.kind === 'asset' ? provider.details.mutable.assetsById[anchor.assetId]?.label : undefined;
            value = anchor.kind === 'asset' ? `${owner?.kind === 'value' ? owner.value : 'モデル名を確認'} — 位置 ${anchor.positionAsset.join(' / ')}` :
              `プロジェクト内の位置 ${anchor.positionProject.join(' / ')}`;
            const projection = anchor.kind === 'asset' ? provider.resources.assets[anchor.assetId]?.projection : undefined;
            if (anchor.kind === 'asset' && (projection?.kind !== 'value' || !projection.value.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId)))
              value += '（モデルとの位置関係を要確認）';
          } else if (checked && fieldName === 'colorSrgb') {
            if (c.value.kind === 'absent') value = '未設定（標準色で表示）';
            else {
              const color = c.value.value as number[], hex = `#${color.map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('')}`;
              const swatch = document.createElement('span'); swatch.textContent = '●'; swatch.style.color = hex;
              li.append(swatch); value = `${hex}（${color.join(' / ')}）`;
            }
          }
          const description = document.createElement('span'); description.textContent = `候補 ${i + 1}：${value}`; li.append(description); values.append(li);
          option(c.operationId, `候補 ${i + 1} を残す`);
        });
        if (isText) option('manual', isName ? '名前を入力' : '文言を入力'); apply.type = cancel.type = 'button';
        apply.textContent = '競合を解消'; cancel.textContent = '取り消す'; message.setAttribute('role', 'status');
        const life = provider.resources.captions[recordId]?.lifecycle;
        const ready = isView || isEntry ? !!checkedView : isScene ? !!checkedScene : isText ? life?.kind === 'value' && life.value.state === 'active' : !!checked;
        if (!ready) message.textContent = '候補を確認できないため解消できません。元の変更は保持しています。';
        item.append(heading, values, options, previewNote, text, apply, cancel, message);
        const current: Form = { root: item, token: provider.token, select: options, text, apply, cancel, message, composing: false, ready, isScene, isName, recordId, fieldName, heading };
        forms.set(key, current); form = current;
        options.addEventListener('change', () => {
          if (disposed) return;
          text.hidden = options.value !== 'manual';
          if (fieldName === 'anchor') {
            session.setCaptionComparison(null); previewNote.textContent = '';
            const index = checked?.findIndex(c => c.operationId === options.value) ?? -1, candidate = checked?.[index];
            if (candidate?.value.kind === 'value' && current.token === session.snapshot.state.token) {
              const anchor = candidate.value.value as unknown as Anchor;
              const model = anchor.kind === 'asset' ? session.composition.assets.find(m => m.assetId === anchor.assetId) : undefined;
              const available = anchor.kind === 'project' ? anchor.projectFrameId === session.snapshot.resources.projectFrameId : model?.projection.assetFrameId === anchor.assetFrameId;
              previewNote.textContent = available ? '位置の比較表示です。確定するまで保存されません。' : 'モデル・座標の基準が現在のシーンにないため、位置を表示できません。';
              if (available) session.setCaptionComparison({ token: current.token, captionId: recordId, anchor, label: `候補 ${index + 1}（未確定）` });
            }
          }
          render(); changed();
        });
        text.addEventListener('input', () => { if (!disposed) { render(); changed(); } });
        text.addEventListener('compositionstart', () => { if (!disposed) { current.composing = true; render(); changed(); } });
        text.addEventListener('compositionend', () => { if (!disposed) { current.composing = false; render(); changed(); } });
        cancel.addEventListener('click', () => {
          if (disposed || session.workingBlock || current.composing) return;
          if (fieldName === 'anchor') session.setCaptionComparison(null);
          forms.delete(key); render(); changed();
        });
        apply.addEventListener('click', () => {
          if (blocked() || !current.ready || !validInput(current) || current.token !== host.read().source?.token || !options.value) return;
          const choice = options.value === 'manual' ? { kind: 'manual' as const, text: text.value } :
            { kind: 'candidate' as const, operationId: options.value };
          session.applyWorking(() => host.resolve(current.token, isEntry ? { kind: 'resolveEntryView', sceneId: recordId, operationId: options.value } :
            isView ? { kind: 'resolveViewField', sceneId: checkedView!.sceneId, viewId: recordId, field: fieldName as ViewChoiceField, choice } :
            isScene ? { kind: 'resolveSceneName', sceneId: recordId, choice } :
            isText ? { kind: 'resolveCaptionText', captionId: recordId, field: fieldName as 'title' | 'body', choice } :
            { kind: 'resolveCaptionField', captionId: recordId, field: fieldName as 'anchor' | 'colorSrgb', operationId: options.value }), () => {
            if (disposed) return;
            if (fieldName === 'anchor') session.setCaptionComparison(null);
            forms.delete(key); session.refreshHistory(); render(); changed();
          }, error => { if (!disposed) { message.textContent = error instanceof Error ? error.message : '解消できません。入力は保持しています。'; render(); changed(); } });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [key, form] of forms) {
      if (!seen.has(key)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(key); continue; } }
      if (form.isScene) {
        const index = Object.keys(session.snapshot.state.scenes).indexOf(form.recordId);
        const label = `${form.recordId === session.sceneId ? '現在のシーン' : index < 0 ? '状態を確認するシーン' : `シーン ${index + 1}`}：${fieldLabels[form.fieldName]}`;
        form.heading.textContent = label; form.select.setAttribute('aria-label', `${label}の解消方法`);
        form.text.setAttribute('aria-label', `${label}の入力`);
      }
      const stale = form.token !== host.read().source?.token;
      const externalBlock = config.blockedReason?.();
      if (form.externalMessage && form.message.textContent === form.externalMessage) form.message.textContent = '';
      form.externalMessage = externalBlock || undefined;
      form.select.disabled = form.text.disabled = session.readOnly || !!session.workingBlock || !!externalBlock;
      form.apply.disabled = blocked() || stale || !form.ready || !validInput(form) || !form.select.value;
      form.cancel.disabled = !!session.workingBlock || form.composing;
      if (stale) form.message.textContent = '内容が更新されています。入力は保持しています。取り消して選び直してください。';
      else if (externalBlock) form.message.textContent = externalBlock;
      else if (form.ready && !validInput(form) && !form.composing) form.message.textContent = invalidNameMessage;
      else if (form.message.textContent === invalidNameMessage) form.message.textContent = 'この選択・入力はまだ適用されていません。';
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択・入力はまだ適用されていません。';
    }
    // Preserve node identity, focus and IME when only acknowledgment state changes.
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges, composing, dispose: () => { disposed = true; forms.clear(); root.remove(); } };
}
