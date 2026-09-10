// Serve-only synthetic saved history. No product Project format or user file admission.
import { A, LIMIT, type Doc, type Target, heads, index, atHeads, load, missing, ordered,
  require, same, canonical, jsonBytes, parse, sha, transaction, hash } from './journal-format';
import { JournalCandidate, type Ports } from './journal';
import { readDevelopmentSource, developmentCommandSnapshot, encodeDevelopmentCommands } from './development-source';
import { serviceDomainSource, type ServiceRead } from './development-service';
import { projectFromProvider, type VerifiedDevelopmentHistory, type VerifiedDevelopmentSnapshot } from './development-verified';
import { freezeSynthetic } from '../../src/harness/projectScene/fixture';
import type { MemoryUpdate } from '../../src/harness/projectScene/historyPort';

export const freshDevelopmentId = () => crypto.randomUUID().replaceAll('-', '');
interface Pending { kind: 'local' | 'remote'; tx: string; sourceId: string; digest: string; byteLength: number; localHash: string | null }
const sourcePath = (id: string) => `working/${id}.am`;
function decodePending(bytes: Uint8Array): Pending | null {
  const v = parse(bytes); if (v === null) return null;
  require(same(Object.keys(v).sort(), ['byteLength', 'digest', 'kind', 'localHash', 'sourceId', 'tx']), 'invalid working descriptor');
  transaction(v.tx); transaction(v.sourceId); hash(v.digest);
  require(['local', 'remote'].includes(v.kind) && Number.isSafeInteger(v.byteLength) && v.byteLength > 0 && v.byteLength <= LIMIT.metadata, 'invalid working source');
  if (v.kind === 'local') hash(v.localHash); else require(v.localHash === null, 'invalid remote working source');
  return v;
}
export interface SavedHistoryOptions {
  ports: Ports; target: Target; actor: string; base: readonly string[];
  inspect(doc: Doc): Promise<ServiceRead>;
}

/** Opens only acknowledged heads. A pending source survives both failed writes and host reload. */
export async function openSavedDevelopmentHistory(options: SavedHistoryOptions): Promise<VerifiedDevelopmentHistory> {
  const { ports, target, actor, inspect } = options, base = [...options.base]; transaction(actor);
  base.forEach(hash); require(base.length > 0 && same(base, [...new Set(base)].sort()), 'invalid exchange base');
  const engine = new JournalCandidate(ports, target);
  let doc: Doc, snapshot: VerifiedDevelopmentSnapshot;
  let state: ReturnType<VerifiedDevelopmentHistory['status']> = { kind: 'idle' };
  let pending: Pending | null = null, source: Uint8Array | undefined;
  async function project(value: Doc): Promise<VerifiedDevelopmentSnapshot> {
    const raw = readDevelopmentSource(A, value as any), clean = serviceDomainSource(raw);
    const commands = developmentCommandSnapshot(clean), result = await inspect(value);
    // This host authors ordinary commands, not migration guard choices.
    require(!result.guards.some(g => g.unresolved), 'source relation review is not connected in this host');
    return freezeSynthetic({ ...commands, source: clean, provider: result.provider,
      project: projectFromProvider(commands, result.provider) });
  }
  const initial = await engine.view();
  require(!initial.repairRequired, '保存内容を確認できません。データを保持しています。');
  doc = initial.doc; atHeads(doc, base); snapshot = await project(doc);
  const saved = await ports.files.read('working.json', LIMIT.journal);
  pending = saved ? decodePending(saved) : null;
  require(!initial.readOnly || pending, '未完了の保存に必要な元の更新情報がありません。データを保持しています。');
  if (pending || initial.readOnly) state = { kind: 'failed', error: '未完了の保存があります。復旧するまで前の内容を表示しています。' };
  const idle = () => require(state.kind === 'idle', '未完了の更新を再試行してください。');
  const check = (token: string) => { idle(); require(token === snapshot.token, '更新されています。操作を選び直してください。'); };
  const fail = (error: unknown): never => { state = { kind: 'failed', error: error instanceof Error ? error.message : '保存できません。入力を保持しています。' }; throw error; };
  async function retainedSource() {
    require(pending, 'missing retained work');
    const bytes = source ?? await ports.files.read(sourcePath(pending.sourceId), LIMIT.metadata);
    require(bytes && bytes.length === pending.byteLength && sha(bytes) === pending.digest, '元の更新データを確認できません。データを保持しています。');
    return bytes;
  }
  async function submit(): Promise<VerifiedDevelopmentSnapshot> {
    state = { kind: 'checking' };
    try {
      if (pending) {
        const bytes = await retainedSource(), staged = load(bytes, target);
        await ports.exclusive(async () => {
          const saved = await ports.files.read('working.json', LIMIT.journal), prior = saved ? decodePending(saved) : null;
          require(!prior || same(prior, pending), '別の更新が保存待ちです。元の入力を保持しています。');
          if (!prior) {
            const control = await ports.control();
            require(!control.pending && (same(control.publishedHeads, heads(doc)) ||
              missing(await ports.readAt(control.publishedHeads), staged).length === 0),
              '保存内容が更新されました。元の入力を保持しています。');
            await ports.files.write(sourcePath(pending!.sourceId), bytes);
            const reread = await ports.files.read(sourcePath(pending!.sourceId), LIMIT.metadata);
            require(reread && sha(reread) === pending!.digest, 'working source readback mismatch');
            await ports.files.write('working.json', jsonBytes(pending));
          }
        });
        // Retain failed input first; validate before acknowledgment/journal publication.
        await project(staged);
        const control = await ports.control();
        require(control.pending === null || control.pending === pending.tx, 'different unfinished update');
        const journal = await ports.files.read(`journal/${pending.tx}/journal.json`, LIMIT.journal);
        let completed = false;
        if (journal && (control.pending || parse(journal).state === 'metadataDurable')) {
          completed = await engine.recover(pending.tx) !== 'discarded-staging';
        }
        if (!completed) {
          if (pending.kind === 'local') {
            const part = index(staged).get(pending.localHash!);
            require(part && same(heads(staged), [pending.localHash!]), 'invalid retained local source');
            await engine.localOriginal(pending.tx, part.bytes);
          } else {
            if (journal) {
              const prior = pending, next = { ...pending, tx: freshDevelopmentId() };
              await ports.exclusive(async () => {
                const stored = await ports.files.read('working.json', LIMIT.journal);
                require(stored && same(decodePending(stored), prior), '保存待ちの更新が変わりました。元の入力を保持しています。');
                try { await ports.files.write('working.json', jsonBytes(next)); }
                catch (error) {
                  const reread = await ports.files.read('working.json', LIMIT.journal);
                  if (reread && same(decodePending(reread), next)) pending = next;
                  throw error;
                }
                pending = next;
              });
            }
            await engine.remote(pending.tx, bytes, `pkg_${pending.sourceId}`);
          }
        }
      } else {
        const control = await ports.control();
        require(control.pending, '再試行する更新がありません。');
        await engine.recover(control.pending);
      }
      const view = await engine.view(); require(!view.readOnly, '保存の復旧が必要です。');
      const next = await project(view.doc);
      await ports.exclusive(async () => {
        const control = await ports.control();
        require(!control.pending && same(control.publishedHeads, heads(view.doc)), '保存状態が変わりました。再確認してください。');
        const stored = await ports.files.read('working.json', LIMIT.journal);
        require(same(stored ? decodePending(stored) : null, pending), '保存待ちの更新が変わりました。元の入力を保持しています。');
        await ports.files.write('working.json', jsonBytes(null));
      });
      doc = view.doc; snapshot = next; pending = null; source = undefined; state = { kind: 'idle' }; return snapshot;
    } catch (error) { return fail(error); }
  }
  async function stage(value: Doc, kind: Pending['kind'], tx: string, localHash: string | null) {
    source = A.save(value); require(source.length <= LIMIT.metadata, 'development metadata budget');
    pending = { kind, tx, localHash, sourceId: freshDevelopmentId(), digest: sha(source), byteLength: source.length };
    return submit();
  }
  function write(changes: Readonly<Record<string, string>>) {
    const writes = encodeDevelopmentCommands(snapshot.source, changes), tx = freshDevelopmentId();
    const next = A.change(A.clone(doc, { actor }), { time: 0, message: `lociview:transaction:v1:${tx}` }, draft => {
      for (const [key, text] of Object.entries(writes)) {
        if (text === null) { if (!Object.hasOwn(draft.cells, key)) draft.cells[key] = new A.ImmutableString('null'); delete draft.cells[key]; }
        else { if (draft.cells[key]?.toString() === text) delete draft.cells[key]; draft.cells[key] = new A.ImmutableString(text); }
      }
    });
    return stage(next, 'local', tx, heads(next)[0]!);
  }
  return {
    storage: 'saved-development',
    read: () => snapshot, status: () => Object.freeze({ ...state }),
    async write(token, changes) {
      check(token); for (const key of Object.keys(changes)) require(snapshot.cells[key]?.kind !== 'conflict', '競合する項目の内容を選択してください。');
      return Object.keys(changes).length ? write({ ...changes }) : snapshot;
    },
    async choose(token, key, candidateId) {
      check(token); const cell = snapshot.cells[key]; require(cell?.kind === 'conflict', '候補を確認してください。');
      const selected = cell.candidates.find(c => c.id === candidateId); require(selected, '候補を確認してください。');
      require(!(key.startsWith('attachment/') && key.endsWith('/lifecycle')), '添付の削除状態を明示的に選択してください。');
      let text = selected.value;
      if (key.startsWith('membership/') || key.endsWith('/lifecycle')) {
        const v = JSON.parse(text), life = key.startsWith('membership/') ? v.lifecycle.value : v;
        const resolved = { ...life, eventId: `evt_${freshDevelopmentId()}`, reason: 'conflictResolution' };
        text = canonical(key.startsWith('membership/') ? { ...v, lifecycle: { kind: 'value', value: resolved } } : resolved);
      }
      return write({ [key]: text });
    },
    async resolveAttachmentLifecycle(token, key, candidateIds, value) {
      check(token); const cell = snapshot.cells[key], event = JSON.parse(value);
      require(/^attachment\/att_[0-9a-f]{32}\/lifecycle$/.test(key) && cell?.kind === 'conflict' &&
        same([...candidateIds].sort(), cell.candidates.map(c => c.id).sort()) &&
        ['active', 'deleted'].includes(event.state) && event.reason === 'conflictResolution', '削除状態を確認してください。');
      return write({ [key]: value });
    },
    exportUpdate() {
      idle(); const original = index(atHeads(doc, base));
      return { base: [...base], target: heads(doc), roots: [target.metadataEnvelope.lineageProof.rootChangeHash],
        changes: [...index(doc)].filter(([id]) => !original.has(id)).map(([, c]) => c.bytes.slice()) };
    },
    async receive(update: MemoryUpdate) {
      idle(); require(same(update.base, base) && same(update.roots, [target.metadataEnvelope.lineageProof.rootChangeHash]), '別の開発データの更新です。');
      require(update.changes.length <= LIMIT.count && update.changes.every(b => b.length <= LIMIT.part) &&
        update.changes.reduce((n, b) => n + b.length, 0) <= LIMIT.metadata, 'update byte budget');
      const ancestor = atHeads(doc, base), incoming = update.changes.map(b => b.slice());
      const hashes = incoming.map(b => A.decodeChange(b).hash); require(new Set(hashes).size === hashes.length, 'duplicate original change');
      const remote = A.applyChanges(A.clone(ancestor), ordered(incoming, new Set(index(ancestor).keys())))[0];
      require(!A.getMissingDeps(remote, []).length && same(heads(remote), update.target) &&
        same(missing(ancestor, remote).map(sha).sort(), incoming.map(sha).sort()), 'incomplete update source');
      const added = missing(doc, remote).length;
      // Even replay verifies source/closure; no fabricated save or discarded conflict.
      const next = await stage(remote, 'remote', freshDevelopmentId(), null);
      return { snapshot: next, added };
    },
    async retry() { require(state.kind === 'failed', '再試行する更新がありません。'); return submit(); },
  };
}
