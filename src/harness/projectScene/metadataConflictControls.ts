import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';

/** Temporary comparison forms. Only explicit commands reach the saved host. */
export function createMetadataConflictControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, changed: () => void) {
  const root = document.createElement('ul'); root.setAttribute('aria-label', '未解決の候補');
  type Form = { root: HTMLLIElement; token: string; select: HTMLSelectElement; text: HTMLTextAreaElement;
    apply: HTMLButtonElement; cancel: HTMLButtonElement; message: HTMLParagraphElement; composing: boolean };
  const forms = new Map<string, Form>();
  const dirty = (f: Form) => !!f.select.value || !!f.text.value || f.composing;
  const hasChanges = () => [...forms.values()].some(dirty);
  const composing = () => [...forms.values()].some(f => f.composing);
  const blocked = () => session.readOnly || !!session.pending && session.pending !== 'text' || composing();
  const render = () => {
    const provider = host.read().provider, seen = new Set<string>(), nodes: HTMLLIElement[] = [];
    if (provider?.kind === 'scene-provider') for (const field of provider.inspection.candidates.fields) {
      if (field.path[0] !== 'captionsById' || !['title', 'body'].includes(field.path[2] ?? '') || field.candidates.length < 2) continue;
      const captionId = field.path[1]!, fieldName = field.path[2] as 'title' | 'body', key = `${captionId}/${fieldName}`;
      seen.add(key); let form = forms.get(key);
      if (!form || form.token !== provider.token && !dirty(form)) {
        const item = document.createElement('li'), heading = document.createElement('p'), options = document.createElement('select');
        const text = document.createElement('textarea'), apply = document.createElement('button'), cancel = document.createElement('button');
        const message = document.createElement('p'), values = document.createElement('ul');
        const title = provider.resources.captions[captionId]?.title;
        const caption = title?.kind === 'value' ? title.value : `キャプション ${Object.keys(provider.resources.captions).indexOf(captionId) + 1}`;
        const label = `${caption}：${fieldName === 'title' ? 'タイトル' : '本文'}`;
        heading.textContent = label; options.setAttribute('aria-label', `${label}の解消方法`);
        text.setAttribute('aria-label', `${label}の文言`); text.hidden = true;
        const option = (value: string, label: string) => {
          const o = document.createElement('option'); o.value = value; o.textContent = label; options.append(o);
        };
        option('', '残す内容を選択');
        field.candidates.forEach((c, i) => {
          const value = c.value.kind === 'value' && typeof c.value.value === 'string' ? c.value.value : '確認が必要な値';
          const li = document.createElement('li'); li.textContent = `候補 ${i + 1}：${value}`; values.append(li);
          option(c.operationId, `候補 ${i + 1} を残す`);
        });
        option('manual', '文言を入力'); apply.type = cancel.type = 'button';
        apply.textContent = '競合を解消'; cancel.textContent = '取り消す'; message.setAttribute('role', 'status');
        item.append(heading, values, options, text, apply, cancel, message);
        const current: Form = { root: item, token: provider.token, select: options, text, apply, cancel, message, composing: false };
        forms.set(key, current); form = current;
        options.addEventListener('change', () => { text.hidden = options.value !== 'manual'; render(); changed(); });
        text.addEventListener('input', () => { render(); changed(); });
        text.addEventListener('compositionstart', () => { current.composing = true; render(); changed(); });
        text.addEventListener('compositionend', () => { current.composing = false; render(); changed(); });
        cancel.addEventListener('click', () => {
          if (session.workingBlock || current.composing) return;
          forms.delete(key); render(); changed();
        });
        apply.addEventListener('click', () => {
          if (blocked() || current.token !== host.read().source?.token || !options.value) return;
          const choice = options.value === 'manual' ? { kind: 'manual' as const, text: text.value } :
            { kind: 'candidate' as const, operationId: options.value };
          session.applyWorking(() => host.resolve(current.token, { kind: 'resolveCaptionText', captionId, field: fieldName, choice }), () => {
            forms.delete(key); session.refreshHistory(); render(); changed();
          }, error => { message.textContent = error instanceof Error ? error.message : '解消できません。入力は保持しています。'; render(); changed(); });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [key, form] of forms) {
      if (!seen.has(key)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(key); continue; } }
      const stale = form.token !== host.read().source?.token;
      form.select.disabled = form.text.disabled = session.readOnly || !!session.workingBlock;
      form.apply.disabled = blocked() || stale || !form.select.value;
      form.cancel.disabled = !!session.workingBlock || form.composing;
      if (stale) form.message.textContent = '内容が更新されています。入力は保持しています。取り消して選び直してください。';
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択・入力はまだ保存されていません。';
    }
    // Preserve node identity, focus and IME when only acknowledgment state changes.
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges, composing };
}
