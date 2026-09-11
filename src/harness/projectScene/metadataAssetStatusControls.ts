import { Euler, Quaternion } from 'three';
import type { openMetadataHost } from './metadataHost';
import type { SyntheticSession } from './session';
import { assetStatusCandidates } from '../../projectMetadata/assetStatus';
import { metadataFixtureLimits as limits } from './metadataFixture';
import { syntheticPreparedVersions } from './modelFixture';

/** Read-only comparisons until an explicit complete status choice is saved. */
export function createMetadataAssetStatusControls(document: Document, host: Awaited<ReturnType<typeof openMetadataHost>>,
  session: SyntheticSession, composing: () => boolean, changed: () => void) {
  const root = document.createElement('ul'); root.setAttribute('aria-label', 'モデルの競合');
  type Form = { root: HTMLLIElement; token: string; select: HTMLSelectElement; apply: HTMLButtonElement;
    cancel: HTMLButtonElement; message: HTMLParagraphElement; ready: boolean };
  const forms = new Map<string, Form>(), dirty = (f: Form) => !!f.select.value;
  const blocked = () => session.readOnly || !!session.pending && session.pending !== 'text' || composing();
  const render = () => {
    const provider = host.read().provider, nodes: HTMLLIElement[] = [], seen = new Set<string>();
    if (provider?.kind === 'scene-provider') for (const field of provider.inspection.candidates.fields) {
      if (field.path.length !== 3 || field.path[0] !== 'assetsById' || field.path[2] !== 'status' || field.candidates.length < 2) continue;
      const assetId = field.path[1]!; seen.add(assetId); let form = forms.get(assetId);
      if (!form || form.token !== provider.token && !dirty(form)) {
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
        field.candidates.forEach((candidate, i) => {
          const li = document.createElement('li'), checked = candidates?.find(c => c.operationId === candidate.operationId);
          if (checked) {
            const known = syntheticPreparedVersions.find(v => v.assetId === assetId && v.projection.revisionId === checked.revision.id);
            const transform = checked.binding.assetToProject as { translation: number[]; rotationXYZW: number[]; uniformScale: number };
            const q = transform.rotationXYZW, e = new Euler().setFromQuaternion(new Quaternion(q[0], q[1], q[2], q[3]), 'XYZ');
            const rotation = [e.x, e.y, e.z].map(n => (n * 180 / Math.PI).toFixed(1)).join(' / ');
            li.textContent = `候補 ${i + 1}：${known?.label ?? '保存されたモデル'} — 位置 ${transform.translation.join(' / ')}、回転 ${rotation}°、倍率 ${transform.uniformScale}`;
            option(candidate.operationId, `候補 ${i + 1} を残す`);
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
        const current: Form = { root: item, token: provider.token, select, apply, cancel, message, ready: !!candidates };
        forms.set(assetId, current); form = current;
        select.addEventListener('change', () => { render(); changed(); });
        cancel.addEventListener('click', () => { if (session.workingBlock || composing()) return; forms.delete(assetId); render(); changed(); });
        apply.addEventListener('click', () => {
          if (blocked() || current.token !== host.read().source?.token || !candidates?.some(c => c.operationId === select.value)) return;
          session.applyWorking(() => host.resolve(current.token, { kind: 'resolveAssetStatus', assetId, operationId: select.value }), () => {
            forms.delete(assetId); session.refreshHistory(); render(); changed();
          }, error => { message.textContent = error instanceof Error ? error.message : '解消できません。選択は保持しています。'; render(); changed(); });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [id, form] of forms) {
      if (!seen.has(id)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(id); continue; } }
      const stale = form.token !== host.read().source?.token;
      form.select.disabled = !form.ready || session.readOnly || !!session.workingBlock;
      form.apply.disabled = !form.ready || blocked() || stale || !form.select.value;
      form.cancel.disabled = !!session.workingBlock || composing();
      if (stale) form.message.textContent = '内容が更新されています。選択は保持しています。取り消して選び直してください。';
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択はまだ保存されていません。';
    }
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges: () => [...forms.values()].some(dirty) };
}
