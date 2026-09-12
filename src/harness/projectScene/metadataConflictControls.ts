import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';
import { captionFieldCandidates } from '../../projectMetadata/captionCandidates';
import { metadataFixtureLimits as limits } from './metadataFixture';
import type { Anchor } from '../../scene/types';
import { sceneNameCandidates } from '../../projectMetadata/sceneAuthoring';
import { normalizeSceneName } from '../../domain/values';

/** Temporary comparison forms. Only explicit commands reach the saved host. */
export function createMetadataConflictControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, changed: () => void) {
  const root = document.createElement('ul'); root.setAttribute('aria-label', '未解決の候補');
  type Form = { root: HTMLLIElement; token: string; select: HTMLSelectElement; text: HTMLTextAreaElement;
    apply: HTMLButtonElement; cancel: HTMLButtonElement; message: HTMLParagraphElement; composing: boolean; ready: boolean;
    isScene: boolean; recordId: string; heading: HTMLParagraphElement };
  const forms = new Map<string, Form>();
  const dirty = (f: Form) => !!f.select.value || !!f.text.value || f.composing;
  const hasChanges = () => [...forms.values()].some(dirty);
  const composing = () => [...forms.values()].some(f => f.composing);
  const blocked = () => session.readOnly || !!session.pending && session.pending !== 'text' || composing();
  const validInput = (f: Form) => {
    if (!f.isScene || f.select.value !== 'manual') return true;
    try { normalizeSceneName(f.text.value); return true; } catch { return false; }
  };
  const invalidNameMessage = '名前は256文字以内の1行で入力してください。空白だけの名前は使えません。';
  const render = () => {
    const provider = host.read().provider, seen = new Set<string>(), nodes: HTMLLIElement[] = [];
    if (provider?.kind === 'scene-provider') for (const field of provider.inspection.candidates.fields) {
      const isScene = field.path[0] === 'scenesById' && field.path[2] === 'name';
      if (field.path.length !== 3 || !isScene && (field.path[0] !== 'captionsById' || !['title', 'body', 'anchor', 'colorSrgb'].includes(field.path[2] ?? '')) || field.candidates.length < 2) continue;
      const recordId = field.path[1]!, fieldName = field.path[2] as 'title' | 'body' | 'anchor' | 'colorSrgb' | 'name', key = `${field.path[0]}/${recordId}/${fieldName}`;
      const isText = isScene || fieldName === 'title' || fieldName === 'body';
      seen.add(key); let form = forms.get(key);
      if (!form || form.token !== provider.token && !dirty(form)) {
        const item = document.createElement('li'), heading = document.createElement('p'), options = document.createElement('select');
        const text = document.createElement('textarea'), apply = document.createElement('button'), cancel = document.createElement('button');
        const message = document.createElement('p'), values = document.createElement('ul'), previewNote = document.createElement('p');
        const title = provider.resources.captions[recordId]?.title;
        const caption = title?.kind === 'value' ? title.value : `キャプション ${Object.keys(provider.resources.captions).indexOf(recordId) + 1}`;
        const label = isScene ? `${recordId === session.sceneId ? '現在のシーン' : `シーン ${Object.keys(provider.state.scenes).indexOf(recordId) + 1}`}：名前` :
          `${caption}：${{ title: 'タイトル', body: '本文', anchor: 'ピン位置', colorSrgb: 'ピンの色', name: '名前' }[fieldName]}`;
        heading.textContent = label; options.setAttribute('aria-label', `${label}の解消方法`);
        text.setAttribute('aria-label', `${label}の${isScene ? '入力' : '文言'}`); text.hidden = true;
        const option = (value: string, label: string) => {
          const o = document.createElement('option'); o.value = value; o.textContent = label; options.append(o);
        };
        option('', '残す内容を選択');
        let checked: ReturnType<typeof captionFieldCandidates> | undefined;
        let checkedScene: ReturnType<typeof sceneNameCandidates> | undefined;
        try {
          if (isScene) checkedScene = sceneNameCandidates(provider, recordId, limits);
          else if (!isText) checked = captionFieldCandidates(provider, recordId, fieldName as 'anchor' | 'colorSrgb', limits);
        }
        catch { /* Do not offer a subset of malformed, unknown or lifecycle-ambiguous candidates. */ }
        field.candidates.forEach((c, i) => {
          let value = c.value.kind === 'value' && typeof c.value.value === 'string' ? c.value.value : '確認が必要な値';
          const li = document.createElement('li');
          if (checked && fieldName === 'anchor' && c.value.kind === 'value') {
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
        if (isText) option('manual', isScene ? '名前を入力' : '文言を入力'); apply.type = cancel.type = 'button';
        apply.textContent = '競合を解消'; cancel.textContent = '取り消す'; message.setAttribute('role', 'status');
        const ready = isScene ? !!checkedScene : isText || !!checked;
        if (!ready) message.textContent = '候補を確認できないため解消できません。元の変更は保持しています。';
        item.append(heading, values, options, previewNote, text, apply, cancel, message);
        const current: Form = { root: item, token: provider.token, select: options, text, apply, cancel, message, composing: false, ready, isScene, recordId, heading };
        forms.set(key, current); form = current;
        options.addEventListener('change', () => {
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
        text.addEventListener('input', () => { render(); changed(); });
        text.addEventListener('compositionstart', () => { current.composing = true; render(); changed(); });
        text.addEventListener('compositionend', () => { current.composing = false; render(); changed(); });
        cancel.addEventListener('click', () => {
          if (session.workingBlock || current.composing) return;
          if (fieldName === 'anchor') session.setCaptionComparison(null);
          forms.delete(key); render(); changed();
        });
        apply.addEventListener('click', () => {
          if (blocked() || !current.ready || !validInput(current) || current.token !== host.read().source?.token || !options.value) return;
          const choice = options.value === 'manual' ? { kind: 'manual' as const, text: text.value } :
            { kind: 'candidate' as const, operationId: options.value };
          session.applyWorking(() => host.resolve(current.token, isScene ? { kind: 'resolveSceneName', sceneId: recordId, choice } :
            isText ? { kind: 'resolveCaptionText', captionId: recordId, field: fieldName as 'title' | 'body', choice } :
            { kind: 'resolveCaptionField', captionId: recordId, field: fieldName as 'anchor' | 'colorSrgb', operationId: options.value }), () => {
            if (fieldName === 'anchor') session.setCaptionComparison(null);
            forms.delete(key); session.refreshHistory(); render(); changed();
          }, error => { message.textContent = error instanceof Error ? error.message : '解消できません。入力は保持しています。'; render(); changed(); });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [key, form] of forms) {
      if (!seen.has(key)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(key); continue; } }
      if (form.isScene) {
        const index = Object.keys(session.snapshot.state.scenes).indexOf(form.recordId);
        const label = `${form.recordId === session.sceneId ? '現在のシーン' : index < 0 ? '状態を確認するシーン' : `シーン ${index + 1}`}：名前`;
        form.heading.textContent = label; form.select.setAttribute('aria-label', `${label}の解消方法`);
        form.text.setAttribute('aria-label', `${label}の入力`);
      }
      const stale = form.token !== host.read().source?.token;
      form.select.disabled = form.text.disabled = session.readOnly || !!session.workingBlock;
      form.apply.disabled = blocked() || stale || !form.ready || !validInput(form) || !form.select.value;
      form.cancel.disabled = !!session.workingBlock || form.composing;
      if (stale) form.message.textContent = '内容が更新されています。入力は保持しています。取り消して選び直してください。';
      else if (form.ready && !validInput(form) && !form.composing) form.message.textContent = invalidNameMessage;
      else if (form.message.textContent === invalidNameMessage) form.message.textContent = 'この選択・入力はまだ適用されていません。';
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択・入力はまだ適用されていません。';
    }
    // Preserve node identity, focus and IME when only acknowledgment state changes.
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges, composing };
}
