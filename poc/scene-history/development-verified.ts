import type * as Automerge from '@automerge/automerge/slim';
import type { HistorySnapshot, MemoryUpdate } from '../../src/harness/projectScene/historyPort';
import { projectHistory } from '../../src/harness/projectScene/historyProjection';
import { freezeSynthetic, type SyntheticProject } from '../../src/harness/projectScene/fixture';
import { canonicalFixture } from '../../src/harness/projectScene/modelClosure';
import type { Field } from '../../src/scene/types';
import type { JsonValue } from '../../src/domain/values';
import type { ProjectContentVerifier } from '../../src/domain/projectContentChecks';
import { readProjectScene, type ProjectProviderRead } from '../../src/scene/projectProvider';
import { developmentContentVerifier } from './content-verifier';
import { developmentSourceSeed, readDevelopmentSource, developmentCommandSnapshot, developmentCandidateInput,
  developmentSourceLimits, encodeDevelopmentCommands } from './development-source';

type Api = typeof Automerge;
type Data = { cells: Record<string, Automerge.ImmutableString> };
type Doc = Automerge.Doc<Data>;
type Provider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export interface VerifiedDevelopmentSnapshot extends HistorySnapshot {
  readonly source: HistorySnapshot; readonly provider: Provider; readonly project: SyntheticProject;
}
export interface VerifiedDevelopmentHistory {
  read(): VerifiedDevelopmentSnapshot;
  status(): Readonly<{ kind: 'idle' | 'checking' | 'failed'; error?: string }>;
  write(token: string, changes: Readonly<Record<string, string>>): Promise<VerifiedDevelopmentSnapshot>;
  choose(token: string, key: string, candidateId: string): Promise<VerifiedDevelopmentSnapshot>;
  resolveAttachmentLifecycle(token: string, key: string, candidateIds: readonly string[], value: string): Promise<VerifiedDevelopmentSnapshot>;
  exportUpdate(): MemoryUpdate;
  receive(update: MemoryUpdate): Promise<{ snapshot: VerifiedDevelopmentSnapshot; added: number }>;
  /** Reuses the original staged document/changes; never regenerates retry IDs or bytes. */
  retry(): Promise<VerifiedDevelopmentSnapshot>;
}
const equal = (a: readonly string[], b: readonly string[]) => [...a].sort().join(',') === [...b].sort().join(',');
function fail(message = '更新を適用できません。元の編集は保持しています。'): never { throw new Error(message); }

/** Presentation extras keep their source IDs; the new provider alone supplies display authority. */
function projectFromProvider(commands: HistorySnapshot, provider: Provider): SyntheticProject {
  const known = projectHistory(commands), details = provider.details.mutable;
  const field = <T>(map: keyof typeof details, id: string, name: string) => details[map][id]?.[name] as Field<T> | undefined;
  const missing = <T>(): Field<T> => ({ kind: 'unresolved', reason: 'missing' });
  const colors = Object.fromEntries(Object.keys(provider.resources.captions).map(id => {
    const c = field<readonly number[] | undefined>('captionsById', id, 'colorSrgb');
    return [id, c?.kind === 'value' && c.value ? { kind: 'value' as const, value: `#${c.value.map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('')}` } : c?.kind === 'unresolved' ? c : missing<string>()];
  }));
  const modelNames = Object.fromEntries(Object.keys(provider.resources.assets).map(id => {
    const label = field<string>('assetsById', id, 'label'); return [id, label?.kind === 'value' ? label.value : '名称を確認'];
  }));
  const viewData = known.viewData && { ...known.viewData, records: Object.fromEntries(Object.entries(known.viewData.records).flatMap(([id, v]) => {
    const projected = provider.resources.views[id]; return projected ? [[id, { ...v, ...projected,
      name: field('viewsById', id, 'name')!, orderKey: field('viewsById', id, 'orderKey')! }]] : [];
  })) } as SyntheticProject['viewData'];
  const materialData = known.materialData && { ...known.materialData, records: Object.fromEntries(Object.entries(known.materialData.records).map(([id, m]) =>
    [id, { ...m, ...provider.resources.materials[id], appearance: field('materialOverridesById', id, 'appearance')!, compositing: field('materialOverridesById', id, 'compositing')! }])) } as SyntheticProject['materialData'];
  const mediaData = known.mediaData && { ...known.mediaData, records: Object.fromEntries(Object.entries(known.mediaData.records).map(([id, row]) => {
    const fields = details.captionAttachmentsById[id]!, availability = provider.details.attachments[id];
    const alt = fields.altText!, lifecycle = fields.lifecycle as typeof row.lifecycle;
    const active = lifecycle.kind === 'value' && lifecycle.value.state === 'active';
    return [id, { ...row, ...fields, id, lifecycle,
      altText: alt.kind === 'value' ? { kind: 'value', value: alt.value ?? '' } : alt,
      mediaResourceId: active && availability?.kind === 'unresolved' ? availability : fields.mediaResourceId,
      deleteEdit: row.deleteEdit || provider.issues.some(i => i.path[0] === 'captionAttachmentsById' && i.path[1] === id && i.code === 'concurrent-delete-edit') }];
  })) } as SyntheticProject['mediaData'];
  return freezeSynthetic({ ...known, state: provider.state, resources: provider.resources, colors, modelNames, viewData, materialData, mediaData,
    materialReviewData: known.materialData });
}

/** Existing explicit fixture selections establish construction authority; never a conflict winner. */
function verifierFor(commands: HistorySnapshot): ProjectContentVerifier {
  const known = projectHistory(commands), authorities = new Map<string, { variantFamilyId: string; representationId: string; payloadDigest: string }>();
  for (const [key, cell] of Object.entries(commands.cells)) if (/^asset\/ast_[0-9a-f]{32}\/binding$/.test(key)) {
    for (const target of cell.kind === 'value' ? [cell.value] : cell.candidates.map(c => c.value)) {
      const record = known.modelVersions!.find(v => v.closure.binding.id === target)?.closure.representation; if (!record) fail();
      authorities.set(record.id, { variantFamilyId: record.variantFamilyId, representationId: record.id, payloadDigest: record.payloadDigest });
    }
  }
  return developmentContentVerifier([...authorities.values()]);
}

/** Same isolated pinned candidate, with async admission before publication. No Repo/files/network. */
export async function createVerifiedDevelopmentPair(A: Api,
  makeVerifier: (commands: HistorySnapshot) => ProjectContentVerifier = verifierFor): Promise<readonly [VerifiedDevelopmentHistory, VerifiedDevelopmentHistory]> {
  const seed = A.from<Data>({ cells: Object.fromEntries(Object.entries(developmentSourceSeed()).map(([k, v]) => [k, new A.ImmutableString(v)])) });
  const base = A.getHeads(seed).sort();
  function index(bytes: readonly Uint8Array[]) {
    if (bytes.length > 128 || bytes.some(b => !(b instanceof Uint8Array) || b.length > 1024 * 1024) || bytes.reduce((n, b) => n + b.length, 0) > 8 * 1024 * 1024) fail();
    const result = new Map<string, { bytes: Uint8Array; deps: readonly string[] }>();
    for (const original of bytes) { const bytes = original.slice(), c = A.decodeChange(bytes); if (result.has(c.hash)) fail(); result.set(c.hash, { bytes, deps: c.deps }); }
    return result;
  }
  function reachable(changes: ReturnType<typeof index>, heads: readonly string[]) {
    const found = new Set<string>(), pending = [...heads];
    while (pending.length) { const id = pending.pop()!; if (found.has(id)) continue;
      const c = changes.get(id); if (!c) fail(); found.add(id); pending.push(...c.deps); }
    return found;
  }
  const rootsOf = (changes: ReturnType<typeof index>) => [...changes].filter(([, c]) => !c.deps.length).map(([id]) => id).sort();
  const roots = rootsOf(index(A.getAllChanges(seed)));
  function prepare(doc: Doc) {
    index(A.getAllChanges(doc));
    const source = readDevelopmentSource(A, doc), input = developmentCandidateInput(source), commands = developmentCommandSnapshot(source);
    projectHistory(commands); // Permanent source/command rejection must not trap a usable actor in retry.
    return { source, input, commands };
  }
  async function inspect({ source, input, commands }: ReturnType<typeof prepare>): Promise<VerifiedDevelopmentSnapshot> {
    const provider = await readProjectScene(input, developmentSourceLimits, makeVerifier(commands));
    if (provider.kind !== 'scene-provider') fail('プロジェクトの状態を確認できません。元の編集を保持しています。');
    const project = projectFromProvider(commands, provider);
    return freezeSynthetic({ ...commands, source, provider, project });
  }
  const initial = await inspect(prepare(seed));
  function participant(): VerifiedDevelopmentHistory {
    let doc = A.clone(seed), snapshot = initial, pending: Doc | undefined;
    let status: ReturnType<VerifiedDevelopmentHistory['status']> = { kind: 'idle' };
    const idle = () => { if (status.kind !== 'idle') fail(status.kind === 'checking' ? '更新を確認しています。' : '前の更新を保持しています。再試行してください。'); };
    const check = (token: string) => { idle(); if (token !== snapshot.token) fail('更新されています。操作を選び直してください。'); };
    async function publish(staged: Doc) {
      const prepared = prepare(staged);
      pending = staged; status = { kind: 'checking' };
      try { const next = await inspect(prepared); doc = staged; snapshot = next; pending = undefined; status = { kind: 'idle' }; return next; }
      catch (error) { status = { kind: 'failed', error: error instanceof Error ? error.message : '更新を確認できません。' }; throw error; }
    }
    const detached = () => A.clone(doc, { actor: A.getActorId(doc) });
    const write = (changes: Readonly<Record<string, string>>) => {
      const writes = encodeDevelopmentCommands(snapshot.source, changes);
      return publish(A.change(detached(), { time: 0, message: 'verified synthetic command' }, draft => {
        for (const [key, text] of Object.entries(writes)) {
          if (text === null) { if (!Object.hasOwn(draft.cells, key)) draft.cells[key] = new A.ImmutableString('null'); delete draft.cells[key]; }
          else { if (draft.cells[key]?.toString() === text) delete draft.cells[key]; draft.cells[key] = new A.ImmutableString(text); }
        }
      }));
    };
    return {
      read: () => snapshot, status: () => Object.freeze({ ...status }),
      async write(token, changes) {
        check(token); for (const key of Object.keys(changes)) if (snapshot.cells[key]?.kind === 'conflict') fail('競合する項目の内容を選択してください。');
        if (!Object.keys(changes).length) return snapshot; return write({ ...changes });
      },
      async choose(token, key, candidateId) {
        check(token); const cell = snapshot.cells[key]; if (cell?.kind !== 'conflict') fail();
        const candidate = cell.candidates.find(c => c.id === candidateId); if (!candidate) fail();
        let text = candidate.value;
        if (key.startsWith('attachment/') && key.endsWith('/lifecycle')) fail('添付の削除状態を明示的に選択してください。');
        if (key.startsWith('membership/') || key.endsWith('/lifecycle')) {
          const selected = JSON.parse(text), lifecycle = key.startsWith('membership/') ? selected.lifecycle.value : selected;
          const resolution = { ...lifecycle, eventId: `evt_${crypto.randomUUID().replaceAll('-', '')}`, reason: 'conflictResolution' };
          text = canonicalFixture(key.startsWith('membership/') ? { ...selected, lifecycle: { kind: 'value', value: resolution } } : resolution);
        }
        return write({ [key]: text });
      },
      async resolveAttachmentLifecycle(token, key, candidateIds, value) {
        check(token); const cell = snapshot.cells[key];
        if (!/^attachment\/att_[0-9a-f]{32}\/lifecycle$/.test(key) || cell?.kind !== 'conflict' || !equal(candidateIds, cell.candidates.map(c => c.id))) fail();
        const event = JSON.parse(value) as Record<string, JsonValue>;
        if (!event || !['active', 'deleted'].includes(String(event.state)) || event.reason !== 'conflictResolution') fail(); return write({ [key]: value });
      },
      exportUpdate() { idle(); const all = index(A.getAllChanges(doc)), origin = reachable(all, base), target = A.getHeads(doc).sort();
        return { base: [...base], target, roots: [...roots], changes: [...all].filter(([id]) => !origin.has(id)).map(([, c]) => c.bytes.slice()) }; },
      async receive(update) {
        idle(); if (!equal(update.base, base) || !equal(update.roots, roots)) fail();
        const local = index(A.getAllChanges(doc)), incoming = index(update.changes), combined = new Map([...local, ...incoming]);
        const origin = reachable(combined, base), target = reachable(combined, update.target);
        if (new Set(update.target).size !== update.target.length || [...origin].some(id => !target.has(id)) || !equal(rootsOf(combined), roots) ||
          !equal([...target].filter(id => !origin.has(id)), [...incoming.keys()])) fail();
        const added = [...incoming].filter(([id]) => !local.has(id)); if (!added.length) return { snapshot, added: 0 };
        const [staged] = A.applyChanges(detached(), added.map(([, c]) => c.bytes));
        if (A.getMissingDeps(staged, []).length || !equal([...index(A.getAllChanges(staged)).keys()], [...combined.keys()])) fail();
        return { snapshot: await publish(staged), added: added.length };
      },
      async retry() { if (status.kind !== 'failed' || !pending) fail('再試行する更新がありません。'); return publish(pending); },
    };
  }
  return [participant(), participant()];
}
