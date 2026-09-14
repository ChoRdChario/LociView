import { Euler, Quaternion } from 'three';
import type { SavedWorkspaceHost } from './savedHost';
import type { SyntheticSession } from './session';
import { assetStatusCandidates } from '../../projectMetadata/assetStatus';
import { syntheticPreparedVersions } from './modelFixture';
import { createModelCandidatePreview, modelCandidateDisplay, type ModelCandidateRenderer } from './modelCandidatePreview';

/** Read-only comparisons until an explicit complete status choice is saved. */
export function createMetadataAssetStatusControls(document: Document, host: Pick<SavedWorkspaceHost, 'read' | 'resolve' | 'limits'>,
  session: SyntheticSession, composing: () => boolean, changed: () => void, options: {
    blockedReason?: () => string | null; preview?: ModelCandidateRenderer } = {}) {
  const limits = host.limits, external = () => options.blockedReason?.() ?? null;
  let disposed = false;
  const root = document.createElement('ul'); root.setAttribute('aria-label', 'モデルの競合');
  type Form = { root: HTMLLIElement; token: string; select: HTMLSelectElement; apply: HTMLButtonElement;
    cancel: HTMLButtonElement; message: HTMLParagraphElement; ready: boolean; externalMessage?: string;
    preview?: ReturnType<typeof createModelCandidatePreview>; previewButtons: HTMLButtonElement[] };
  const forms = new Map<string, Form>(), dirty = (f: Form) => !!f.select.value;
  const blocked = () => disposed || session.readOnly || !!session.pending && session.pending !== 'text' || composing() || !!external();
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider, nodes: HTMLLIElement[] = [], seen = new Set<string>();
    if (provider?.kind === 'scene-provider') for (const field of provider.inspection.candidates.fields) {
      if (field.path.length !== 3 || field.path[0] !== 'assetsById' || field.path[2] !== 'status' || field.candidates.length < 2) continue;
      const assetId = field.path[1]!; seen.add(assetId); let form = forms.get(assetId);
      if (!form || form.token !== provider.token && !dirty(form)) {
        form?.preview?.dispose();
        const item = document.createElement('li'), heading = document.createElement('p'), values = document.createElement('ul');
        const select = document.createElement('select'), apply = document.createElement('button'), cancel = document.createElement('button');
        const impact = document.createElement('p'), message = document.createElement('p'), label = provider.details.mutable.assetsById[assetId]?.label;
        heading.textContent = `${label?.kind === 'value' ? label.value : 'モデル'}：使用するモデルと配置を選択`;
        select.setAttribute('aria-label', '残すモデルと配置');
        const option = (value: string, label: string) => {
          const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o);
        };
        option('', '残すモデルと配置を選択');
        let candidates: ReturnType<typeof assetStatusCandidates> | undefined;
        try { candidates = assetStatusCandidates(provider, assetId, limits); } catch { /* No candidate may silently disappear. */ }
        const preview = options.preview ? createModelCandidatePreview(document, options.preview,
          () => !disposed && provider.token === host.read().source?.token) : undefined;
        const previewButtons: HTMLButtonElement[] = [];
        field.candidates.forEach((candidate, i) => {
          const li = document.createElement('li'), checked = candidates?.find(c => c.operationId === candidate.operationId);
          if (checked) {
            const known = syntheticPreparedVersions.find(v => v.assetId === assetId && v.projection.revisionId === checked.revision.id);
            const transform = checked.binding.assetToProject as { translation: number[]; rotationXYZW: number[]; uniformScale: number };
            const q = transform.rotationXYZW, e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), 'XYZ');
            const rotation = [e.x, e.y, e.z].map(n => (n * 180 / Math.PI).toFixed(1)).join(' / ');
            li.textContent = `候補 ${i + 1}：${known?.label ?? '保存されたモデル'} — 位置 ${transform.translation.join(' / ')}、回転 ${rotation}°、倍率 ${transform.uniformScale}`;
            option(candidate.operationId, `候補 ${i + 1} を残す`);
            if (preview) {
              const show = document.createElement('button'); show.type = 'button'; show.textContent = `候補 ${i + 1} を表示`;
              show.addEventListener('click', () => {
                if (disposed || show.disabled || provider.token !== host.read().source?.token) return;
                try { preview.show(`候補 ${i + 1}`, modelCandidateDisplay(provider, session.sceneId, assetId, candidate.operationId, limits)); }
                catch (error) { message.textContent = error instanceof Error ? error.message : '候補を表示できません。'; }
              });
              previewButtons.push(show); li.append(show);
            }
          } else li.textContent = `候補 ${i + 1}：モデルまたは配置を確認できません。`;
          values.append(li);
        });
        const sceneIds = [...new Set(Object.values(provider.state.assetMemberships).filter(e => e.resourceId === assetId &&
          (e.lifecycle.kind !== 'value' || e.lifecycle.value.state !== 'deleted')).map(e => e.sceneId))];
        const names = sceneIds.map(id => { const n = provider.state.scenes[id]?.name; return n?.kind === 'value' ? n.value : '名称を確認するシーン'; });
        impact.textContent = `選択はこのモデルを使う全シーンに反映されます${names.length ? `（${names.join('、')}）` : ''}。記録とピン位置は保持します。`;
        apply.type = cancel.type = 'button'; apply.textContent = 'このモデルと配置を使う'; cancel.textContent = '選択を取り消す';
        message.setAttribute('role', 'status');
        if (!candidates) message.textContent = '候補を確認できないため解消できません。保存した内容は保持しています。';
        item.append(heading, values, impact, select, apply, cancel, message);
        if (preview) item.append(preview.root);
        const current: Form = { root: item, token: provider.token, select, apply, cancel, message, ready: !!candidates, preview, previewButtons };
        forms.set(assetId, current); form = current;
        select.addEventListener('change', () => { if (!disposed && !session.workingBlock) { render(); changed(); } });
        cancel.addEventListener('click', () => { if (disposed || session.workingBlock || composing()) return; preview?.dispose(); forms.delete(assetId); render(); changed(); });
        apply.addEventListener('click', () => {
          if (blocked() || current.token !== host.read().source?.token || !candidates?.some(c => c.operationId === select.value)) return;
          const command = { kind: 'resolveAssetStatus' as const, assetId, operationId: select.value };
          session.applyWorking(() => host.resolve(current.token, command), () => {
            if (disposed) return; preview?.dispose(); forms.delete(assetId); session.refreshHistory(); render(); changed();
          }, error => { if (!disposed) { message.textContent = error instanceof Error ? error.message : '解消できません。選択は保持しています。'; render(); changed(); } });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [id, form] of forms) {
      if (!seen.has(id)) { if (dirty(form)) nodes.push(form.root); else { form.preview?.dispose(); forms.delete(id); continue; } }
      const stale = form.token !== host.read().source?.token;
      const externalBlock = external();
      if (form.externalMessage && form.message.textContent === form.externalMessage) form.message.textContent = '';
      form.externalMessage = externalBlock || undefined;
      form.select.disabled = !form.ready || session.readOnly || !!session.workingBlock || !!externalBlock;
      form.apply.disabled = !form.ready || blocked() || stale || !form.select.value;
      form.cancel.disabled = !!session.workingBlock || composing();
      for (const button of form.previewButtons) button.disabled = stale || !!session.workingBlock || composing() || !!externalBlock;
      form.preview?.render();
      if (stale) form.message.textContent = '内容が更新されています。選択は保持しています。取り消して選び直してください。';
      else if (externalBlock) form.message.textContent = externalBlock;
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択はまだ適用されていません。';
    }
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges: () => [...forms.values()].some(dirty), dispose() {
    if (disposed) return; disposed = true; for (const form of forms.values()) form.preview?.dispose(); forms.clear(); root.remove();
  } };
}
