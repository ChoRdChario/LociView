import type { SavedWorkspaceHost } from './savedHost';
import type { SyntheticSession } from './session';
import { captionCopySource, captionMembershipGroups, assetMembershipGroups, type CaptionMembershipResolution, type AssetMembershipResolution } from '../../projectMetadata/membership';
import { newId } from '../../projectMetadata/persistence';
import { assetCopySource, prepareAssetMembershipCopy } from '../../projectMetadata/modelMembership';

/** The same saved host, with an explicit entity-level decision (not a duplicate button). */
export function createMetadataMembershipControls(document: Document, host: Pick<SavedWorkspaceHost, 'read' | 'resolve' | 'limits'>,
  session: SyntheticSession, composing: () => boolean, changed: () => void, kind: 'caption' | 'asset' = 'caption',
  blockedReason: () => string | null = () => null) {
  const limits = host.limits;
  let disposed = false;
  const root = document.createElement('ul'); root.setAttribute('aria-label', kind === 'asset' ? '重複したモデル登録' : '重複した登録');
  type Form = { root: HTMLLIElement; token: string; original: HTMLSelectElement; choice: HTMLSelectElement;
    apply: HTMLButtonElement; cancel: HTMLButtonElement; message: HTMLParagraphElement; copyReady: boolean; externalMessage?: string };
  const forms = new Map<string, Form>();
  const dirty = (f: Form) => !!f.original.value || !!f.choice.value;
  const hasChanges = () => [...forms.values()].some(dirty);
  const blocked = () => disposed || session.readOnly || !!session.pending && session.pending !== 'text' || composing() || !!blockedReason();
  const render = () => {
    if (disposed) return;
    const provider = host.read().provider, nodes: HTMLLIElement[] = [], seen = new Set<string>();
    const groups = provider?.kind === 'scene-provider' ? kind === 'caption' ? captionMembershipGroups(provider, limits) :
      assetMembershipGroups(provider, limits).map(({ assetId, ...g }) => ({ ...g, captionId: assetId })) : [];
    if (provider?.kind === 'scene-provider') for (const group of groups) {
      const { sceneId, captionId, edgeIds } = group, key = `${sceneId}/${captionId}`;
      seen.add(key); let form = forms.get(key);
      if (!form || form.token !== provider.token && !dirty(form)) {
        const item = document.createElement('li'), heading = document.createElement('p'), preview = document.createElement('p');
        const original = document.createElement('select'), choice = document.createElement('select'), message = document.createElement('p');
        const apply = document.createElement('button'), cancel = document.createElement('button');
        const title = kind === 'caption' ? provider.resources.captions[captionId]?.title : provider.details.mutable.assetsById[captionId]?.label;
        const scene = provider.state.scenes[sceneId]?.name;
        heading.textContent = `${scene?.kind === 'value' ? scene.value : 'シーン'}：${title?.kind === 'value' ? title.value : kind === 'caption' ? 'キャプション' : 'モデル'}の登録が重複しています。`;
        original.setAttribute('aria-label', '元として残す登録'); choice.setAttribute('aria-label', '重複の解消方法');
        const option = (select: HTMLSelectElement, value: string, label: string) => {
          const o = document.createElement('option'); o.value = value; o.textContent = label; select.append(o);
        };
        option(original, '', '元として残す登録を選択'); edgeIds.forEach((id, i) => option(original, id, `登録 ${i + 1}`));
        option(choice, '', '解消方法を選択'); option(choice, 'one', '一つを残す');
        option(choice, 'both', '両方残す（別々に編集）');
        let copy: ReturnType<typeof captionCopySource> | undefined;
        let modelCopy: ReturnType<typeof assetCopySource> | undefined;
        try { if (kind === 'caption') copy = captionCopySource(provider, captionId, limits); } catch { /* Explain the blocked copy, never substitute projected content. */ }
        try { if (kind === 'asset') {
          modelCopy = assetCopySource(provider, sceneId, captionId, limits);
        } } catch { /* Keep-one remains possible; incomplete copy never silently omits a dependency. */ }
        preview.textContent = kind === 'asset' ? `同じモデルへの登録が${edgeIds.length}件あります。「一つを残す」は重複登録だけを解除します。モデル本体・キャプション・他のシーンは変わりません。` +
          (modelCopy ? '「両方残す」は現在のモデル・配置・見え方を別項目にコピーします。キャプションは元モデルに残ります。' : '両方残すには、モデルと見え方の未解決の内容を先に確認してください。') :
          copy ? `同じ記録への登録が${edgeIds.length}件あります。「一つを残す」は重複した登録だけを解除します。「両方残す」は本文・ピン位置・添付${copy.attachments.length}件をコピーします。他のシーンの元の記録は変わりません。` :
          '同じ記録への登録です。両方残すには、記録と添付の未解決の内容を先に確認してください。他のシーンの元の記録は変わりません。';
        const otherScenes = [...new Set(Object.values(kind === 'caption' ? provider.state.captionMemberships : provider.state.assetMemberships).filter(e => e.resourceId === captionId &&
          e.sceneId !== sceneId && e.lifecycle.kind === 'value' && e.lifecycle.value.state === 'active').map(e => e.sceneId))];
        if (otherScenes.length) preview.textContent += ` 元の記録を参照するシーン：${otherScenes.map(id => {
          const name = provider.state.scenes[id]?.name; return name?.kind === 'value' ? name.value : '名称の確認が必要なシーン';
        }).join('、')}。`;
        apply.type = cancel.type = 'button'; apply.textContent = '登録の重複を解消'; cancel.textContent = '選択を取り消す';
        message.setAttribute('role', 'status'); item.append(heading, preview, original, choice, apply, cancel, message);
        const current: Form = { root: item, token: provider.token, original, choice, apply, cancel, message, copyReady: !!copy || !!modelCopy };
        forms.set(key, current); form = current;
        original.addEventListener('change', () => { if (!disposed) { render(); changed(); } });
        choice.addEventListener('change', () => { if (!disposed) { render(); changed(); } });
        cancel.addEventListener('click', () => { if (disposed || session.workingBlock || composing()) return; forms.delete(key); render(); changed(); });
        apply.addEventListener('click', () => {
          if (blocked() || current.token !== host.read().source?.token || !edgeIds.includes(original.value) ||
            !['one', 'both'].includes(choice.value) || choice.value === 'both' && !copy && !modelCopy) return;
          // Capture the explicit choice and allocate/seal once; retry never mints another copy.
          const originalMembershipId = original.value, decision = choice.value as 'one' | 'both', eventId = `evt_${newId()}`;
          const command: Promise<CaptionMembershipResolution | AssetMembershipResolution> = (async () => {
            if (kind === 'asset') return {
              kind: 'resolveAssetMembership', sceneId, assetId: captionId, observedMembershipIds: edgeIds,
              originalMembershipId, choice: decision, eventId,
              ...(decision === 'both' ? { copies: await Promise.all(edgeIds.filter(id => id !== originalMembershipId).map(id =>
                prepareAssetMembershipCopy(modelCopy!, id, prefix => `${prefix}_${newId()}`))) } : {}),
            };
            return { kind: 'resolveCaptionMembership', sceneId, captionId,
              observedMembershipIds: edgeIds, originalMembershipId, choice: decision, eventId,
              copies: decision === 'one' ? [] : edgeIds.filter(id => id !== originalMembershipId).map(sourceMembershipId => ({
                sourceMembershipId, captionId: `cap_${newId()}`, membershipId: `scm_${newId()}`,
                attachments: copy!.attachments.map(a => ({ sourceId: a.id as string, targetId: `att_${newId()}` })),
                tags: copy!.tags.map(t => ({ sourceId: t.id as string, targetId: `tgm_${newId()}` })),
              })) };
          })();
          session.applyWorking(async () => host.resolve(current.token, await command), () => {
            if (disposed) return;
            forms.delete(key); session.refreshHistory(); render(); changed();
          }, error => { if (!disposed) { message.textContent = error instanceof Error ? error.message : '解消できません。選択は保持しています。'; render(); changed(); } });
          render(); changed();
        });
      }
      nodes.push(form.root);
    }
    for (const [key, form] of forms) {
      if (!seen.has(key)) { if (dirty(form)) nodes.push(form.root); else { forms.delete(key); continue; } }
      const stale = form.token !== host.read().source?.token;
      const externalBlock = blockedReason();
      if (form.externalMessage && form.message.textContent === form.externalMessage) form.message.textContent = '';
      form.externalMessage = externalBlock || undefined;
      form.original.disabled = form.choice.disabled = session.readOnly || !!session.workingBlock || !!externalBlock;
      form.apply.disabled = blocked() || stale || !form.original.value || !form.choice.value || form.choice.value === 'both' && !form.copyReady;
      form.cancel.disabled = !!session.workingBlock || composing();
      if (stale) form.message.textContent = '内容が更新されています。選択は保持しています。取り消して選び直してください。';
      else if (externalBlock) form.message.textContent = externalBlock;
      else if (dirty(form) && !form.message.textContent) form.message.textContent = 'この選択はまだ適用されていません。';
    }
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLLIElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
  };
  render(); return { root, render, hasChanges, dispose: () => { disposed = true; forms.clear(); root.remove(); } };
}
