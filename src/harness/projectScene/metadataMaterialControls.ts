import type { SavedWorkspaceHost } from './savedHost';
import type { SyntheticSession } from './session';
import { materialResolutionContext, selectedMaterialResolution, type MaterialResolution } from '../../projectMetadata/materialResolution';
import { describeMaterialCandidate } from './materialReview';
import { canonicalFixture } from './modelClosure';
import { validationMaterialSlots, validationMaterialIssue } from './validationMaterials';
import { newId } from '../../projectMetadata/persistence';
import type { JsonObject } from '../../domain/values';

/** Only explicit original atom/owner choices; no storage write or preview authority. */
export function createMetadataMaterialControls(document: Document, host: Pick<SavedWorkspaceHost, 'read' | 'resolve' | 'limits'>,
  session: SyntheticSession, composing: () => boolean, changed: () => void, blockedReason: () => string | null = () => null) {
  const root = document.createElement('section'); root.setAttribute('aria-label', 'マテリアルの更新候補');
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const n = document.createElement(tag); n.textContent = text; return n; };
  type Form = { root: HTMLFieldSetElement; token: string; choices: HTMLSelectElement[]; apply: HTMLButtonElement;
    cancel: HTMLButtonElement; message: HTMLParagraphElement; external?: string; command?: MaterialResolution };
  const forms = new Map<string, Form>(); let disposed = false;
  const dirty = (f: Form) => f.choices.some(c => !!c.value);
  const blocked = () => disposed || session.readOnly || !!session.pending || composing() || !!blockedReason();
  const describe = (field: string, value: JsonObject) => field === 'appearance' ? describeMaterialCandidate(field, canonicalFixture(value), session.snapshot) :
    `被覆：${({ inherit: '元の設定', opaque: '不透明', mask: 'マスク', ditherCoverage: 'ディザ', smoothBlend: '半透明' } as Record<string, string>)[(value.coverage as JsonObject).policy as string]}` +
    ((value.coverage as JsonObject).alphaCutoff !== undefined ? `・しきい値 ${(value.coverage as JsonObject).alphaCutoff}` : '') +
    `／光学：${({ inherit: '元の設定', surface: '表面', transmission: '透過' } as Record<string, string>)[value.optics as string]}`;
  function render() {
    if (disposed) return;
    const p = host.read().provider, seen = new Set<string>(), nodes: HTMLElement[] = [], buckets = new Set<string>();
    if (p?.kind === 'scene-provider') for (const id of Object.keys(p.details.mutable.materialOverridesById).sort()) {
      const record = p.details.mutable.materialOverridesById[id]!;
      // Duplicate diagnostics withhold DTO routing. Read the exact original atom
      // for review labels/scope; the command reader still validates its authority.
      const routeField = p.inspection.candidates.fields.find(f => f.path.join('/') === `materialOverridesById/${id}/routing`), routeAtom = routeField?.candidates[0];
      const rawRoute = routeField?.valid && !routeField.hasUnknownFields && routeField.candidates.length === 1 && routeAtom?.value.kind === 'value'
        ? routeAtom.value.value as JsonObject : undefined;
      if (record.lifecycle?.kind === 'value' && (record.lifecycle.value as JsonObject).state === 'deleted') continue;
      const scope = rawRoute?.scope as JsonObject | undefined, sceneId = scope?.kind === 'scene' ? scope.sceneId as string : session.sceneId;
      let ctx: ReturnType<typeof materialResolutionContext> | undefined;
      try { ctx = materialResolutionContext(p, sceneId, id, host.limits); } catch { /* Preserve nonactionable source and its diagnosis. */ }
      const target = rawRoute?.target as JsonObject | undefined;
      const slot = target && session.snapshot.modelVersions?.flatMap(v => v.closure.shape === 'saved-glb' ? validationMaterialSlots(v.closure) : [])
        .find(s => canonicalFixture(s.target) === canonicalFixture(target));
      const model = target && session.snapshot.modelNames[target.assetId as string], scene = session.snapshot.state.scenes[sceneId]?.name;
      const label = `${model ?? 'モデルを確認'}／${slot?.name ?? '材質'}／${scope?.kind === 'scene' ? scene?.kind === 'value' ? scene.value : 'シーンを確認' : 'プロジェクト共通'}`;
      const unresolved = ['appearance', 'compositing', 'routing', 'lifecycle'].some(f => record[f]?.kind !== 'value');
      const intents = ctx ? (() => { try { return { appearance: ctx.atoms(id, 'appearance'), compositing: ctx.atoms(id, 'compositing') }; } catch { return null; } })() : null;
      const conflict = !!intents && (intents.appearance.length > 1 || intents.compositing.length > 1);
      const bucket = ctx && canonicalFixture(ctx.routing), duplicate = !!ctx && ctx.ids.length > 1 && !buckets.has(bucket!);
      if (bucket) buckets.add(bucket);
      for (const kind of ['intent', 'duplicate'] as const) {
        if (kind === 'intent' ? !conflict : !duplicate) continue;
        const key = kind === 'intent' ? id : `duplicate/${bucket}`, context = ctx!, atomSet = intents!;
        seen.add(key); let form = forms.get(key);
        if (!form || form.token !== p.token && !dirty(form)) {
          const box = make('fieldset'), heading = make('legend', label), message = make('p'); message.setAttribute('role', 'status');
          box.setAttribute('aria-label', `${label}：${kind === 'intent' ? '見え方の競合' : '設定の重複'}`);
          const apply = make('button', kind === 'intent' ? '選択を確定' : '選んだ設定を残す'), cancel = make('button', '取り消す');
          apply.type = cancel.type = 'button'; box.append(heading);
          const current: Form = { root: box, token: p.token, choices: [], apply, cancel, message };
          const select = (label: string, choices: { id: string; text: string }[]) => {
            const row = make('label', label), control = make('select'), empty = make('option', '選択してください'); empty.value = ''; control.append(empty);
            control.setAttribute('aria-label', label);
            for (const c of choices) { const option = make('option', c.text); option.value = c.id; control.append(option); }
            row.append(control); box.append(row); current.choices.push(control);
            control.addEventListener('change', () => { if (disposed || session.workingBlock) return; current.command = undefined; message.textContent = ''; render(); changed(); });
            return control;
          };
          let command: () => MaterialResolution;
          if (kind === 'intent') {
            const read: Record<string, () => string> = {};
            for (const field of ['appearance', 'compositing'] as const) {
              const name = field === 'appearance' ? '見え方' : '被覆・光学', atoms = atomSet[field];
              if (atoms.length === 1) { box.append(make('p', `${name}：${describe(field, atoms[0]!.value)}`)); read[field] = () => atoms[0]!.operationId; }
              else { const choice = select(name, atoms.map((v, i) => ({ id: v.operationId, text: `候補 ${i + 1}：${describe(field, v.value)}` }))); read[field] = () => choice.value; }
            }
            command = () => ({ kind: 'resolveMaterialIntent', sceneId, overrideId: id, appearanceOperationId: read.appearance!(), compositingOperationId: read.compositing!() });
          } else {
            box.append(make('p', '同じ面に設定が重複しています。選ばなかった設定は解除され、履歴に残ります。'));
            const choice = select('残す設定', context.ids.map((owner, i) => {
              try { const a = context.atoms(owner, 'appearance'), c = context.atoms(owner, 'compositing');
                return { id: owner, text: `設定 ${i + 1}：${a.length === 1 && c.length === 1 ? describe('appearance', a[0]!.value) + '／' + describe('compositing', c[0]!.value) : '内容の競合を先に解消してください'}` };
              } catch { return { id: owner, text: `設定 ${i + 1}：内容を確認できません` }; }
            }));
            command = () => ({ kind: 'resolveMaterialDuplicates', sceneId, overrideId: choice.value, observedOverrideIds: context.ids.slice(), eventId: `evt_${newId()}` });
          }
          cancel.addEventListener('click', () => { if (disposed || session.workingBlock || composing()) return; forms.delete(key); render(); changed(); });
          apply.addEventListener('click', () => {
            if (blocked() || current.token !== host.read().source?.token || current.choices.some(c => !c.value)) return;
            let captured: MaterialResolution;
            try {
              captured = current.command ?? command();
              const checked = selectedMaterialResolution(p, captured, host.limits);
              if (!slot) throw Error('設定するモデルと材質を確認してください。');
              for (const intent of checked.intents.values()) { const issue = validationMaterialIssue(slot, intent, p.semanticProfile); if (issue) throw Error(issue); }
              current.command = captured;
            } catch (error) {
              message.textContent = error instanceof Error ? error.message : '選択した組み合わせを確認してください。'; render(); changed(); return;
            }
            session.applyWorking(() => host.resolve(current.token, captured), () => {
              if (disposed) return; forms.delete(key); session.refreshHistory(); render(); changed();
            }, error => { if (!disposed) { message.textContent = error instanceof Error ? error.message : '解消できません。選択は保持しています。'; render(); changed(); } });
            render(); changed();
          });
          box.append(apply, cancel, message); forms.set(key, current); form = current;
        }
        nodes.push(form.root);
      }
      if (unresolved && !conflict && (!ctx || ctx.ids.length < 2)) nodes.push(make('p', `${label}：適用先・状態・内容を確認できません。元の設定は保持しています。`));
    }
    for (const [key, f] of forms) {
      if (!seen.has(key)) { if (dirty(f)) nodes.push(f.root); else { forms.delete(key); continue; } }
      const stale = f.token !== host.read().source?.token, external = blockedReason();
      if (f.external && f.message.textContent === f.external) f.message.textContent = ''; f.external = external ?? undefined;
      for (const c of f.choices) c.disabled = session.readOnly || !!session.workingBlock || !!external;
      f.apply.disabled = blocked() || stale || f.choices.some(c => !c.value); f.cancel.disabled = !!session.workingBlock || composing();
      if (stale) f.message.textContent = '内容が更新されています。選択を取り消して選び直してください。';
      else if (external) f.message.textContent = external;
      else if (dirty(f) && !f.message.textContent) f.message.textContent = 'まだ適用されていません。';
    }
    for (const child of Array.from(root.children)) if (!nodes.includes(child as HTMLElement)) child.remove();
    for (const [i, node] of nodes.entries()) if (root.children[i] !== node) root.insertBefore(node, root.children[i] ?? null);
    root.hidden = !nodes.length;
  }
  render(); return { root, render, hasChanges: () => [...forms.values()].some(dirty), dispose: () => { disposed = true; forms.clear(); root.remove(); } };
}
