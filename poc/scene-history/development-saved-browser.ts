// Loaded only on explicit saved-development selection. Dedicated synthetic OPFS/IDB areas.
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { generateAutomergeUrl, parseAutomergeUrl } from '@automerge/automerge-repo/slim';
import { BrowserFiles, BrowserPorts, SAVED_AREA, decodeSession, type BrowserSession } from './journal-browser-ports';
import { A, FLAT_FORMAT, LIMIT, type Doc, type Target, type Ref, heads, jsonBytes, parse, require, same, target as checkTarget,
  transaction, hash } from './journal-format';
import { developmentSourceSeed, sourceKey, readDevelopmentSource, developmentCommandSnapshot } from './development-source';
import { developmentContentBytes } from './content-verifier';
import { verifierFor } from './development-verified';
import { readDevelopmentService, serviceDomainSource } from './development-service';
import { freshDevelopmentId, openSavedDevelopmentHistory } from './development-saved';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { fixtureMedia } from '../../src/harness/projectScene/mediaHistory';
import type { WorkingHistoryFactory } from '../../src/harness/projectScene/historyPort';

interface Participant { run: string; actor: string; base: string[] }
interface Pair { version: 1; state: 'initializing' | 'ready'; target: Target; participants: [Participant, Participant] }
function decodePair(bytes: Uint8Array): Pair {
  const p = parse(bytes);
  require(same(Object.keys(p).sort(), ['participants', 'state', 'target', 'version']) && p.version === 1 &&
    ['initializing', 'ready'].includes(p.state) && Array.isArray(p.participants) && p.participants.length === 2, 'invalid saved pair');
  checkTarget(p.target); require(p.target.metadataEnvelope.adapterFormatVersion === FLAT_FORMAT, 'different development profile');
  for (const row of p.participants) {
    require(same(Object.keys(row).sort(), ['actor', 'base', 'run']), 'invalid participant');
    transaction(row.run); transaction(row.actor);
    require(Array.isArray(row.base) && row.base.length === 1, 'invalid participant base'); row.base.forEach(hash);
  }
  require(p.participants[0].run !== p.participants[1].run && p.participants[0].actor !== p.participants[1].actor &&
    same(p.participants[0].base, p.participants[1].base), 'invalid participant separation');
  return p;
}
export async function loadSavedDevelopmentHistory(run: string, create: boolean): Promise<WorkingHistoryFactory> {
  transaction(run);
  // Serialize setup only. Journal commands retain their participant-specific leases.
  return navigator.locks.request(`${SAVED_AREA}:${run}:setup`, { mode: 'exclusive', ifAvailable: true }, async lock => {
    require(lock, '別のタブで準備中です。完了後に再読み込みしてください。');
    const pairFiles = await BrowserFiles.open(run, SAVED_AREA), existing = await pairFiles.read('pair.json', LIMIT.journal);
    let pair: Pair, seed: Doc | undefined;
    if (existing) {
      pair = decodePair(existing);
      require(pair.state === 'ready', '保存用データの準備が中断しています。元のデータを保持しています。');
    } else {
      require(create, '保存用データが見つかりません。元のリンクを確認してください。');
      const genesis = A.from({ cells: Object.fromEntries(Object.entries(developmentSourceSeed()).map(([k, v]) => [k, new A.ImmutableString(v)])) });
      const target: Target = { identity: JSON.parse(String(genesis.cells[sourceKey(['identity'])])), metadataEnvelope: {
        adapter: 'automerge', adapterFormatVersion: FLAT_FORMAT,
        lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(genesis)[0]! } } };
      seed = A.change(A.clone(genesis), { time: 0 }, draft => {
        draft.cells[sourceKey(['isolatedBridge', 'foundation'])] = new A.ImmutableString(new TextDecoder().decode(
          jsonBytes({ caseId: 'saved-development', baselineHeads: heads(genesis) })));
      });
      const participant = (): Participant => ({ run: freshDevelopmentId(), actor: freshDevelopmentId(), base: heads(seed!) });
      pair = { version: 1, state: 'initializing', target, participants: [participant(), participant()] };
      await pairFiles.write('pair.json', jsonBytes(pair)); // Retain failed/partial initialization; never reseed it.
    }
    const histories: Awaited<ReturnType<typeof openSavedDevelopmentHistory>>[] = [];
    for (const row of pair.participants) {
      const files = await BrowserFiles.open(row.run, SAVED_AREA);
      const savedSession = await files.read('session.json', LIMIT.journal);
      require(seed || savedSession, '参加者の保存情報がありません。データを保持しています。');
      const session: BrowserSession = savedSession ? decodeSession(savedSession) : { target: pair.target,
        documentId: parseAutomergeUrl(generateAutomergeUrl()).documentId, localTx: freshDevelopmentId(), remoteTx: freshDevelopmentId() };
      require(same(session.target, pair.target), 'different saved participant');
      let ports: BrowserPorts;
      const inspect = async (doc: Doc) => {
        const commands = developmentCommandSnapshot(serviceDomainSource(readDevelopmentSource(A, doc as any)));
        return readDevelopmentService(doc, pair.target, verifierFor(commands, async record => {
          const ref = record.blob as unknown as Ref;
          require(ref.byteLength <= LIMIT.part, 'synthetic content budget');
          if (!await ports.hasVerified(ref)) return undefined;
          const stored = await ports.casIo.read(`blobs/${ref.digest}`);
          if (!stored || stored.size !== ref.byteLength) return undefined;
          const bytes = new Uint8Array(stored.size); let at = 0;
          for await (const chunk of stored.chunks()) { require(at + chunk.length <= bytes.length, 'CAS size changed'); bytes.set(chunk, at); at += chunk.length; }
          require(at === bytes.length, 'CAS truncated'); return bytes;
        }));
      };
      ports = await BrowserPorts.open(row.run, files, session, async doc => (await inspect(doc)).retained,
        new IndexedDBStorageAdapter(`${SAVED_AREA}-${row.run}`), true);
      if (seed) await ports.exclusive(async () => {
        const records = [...syntheticVersions.map(v => v.closure.representation), ...fixtureMedia.map(m => m.record)];
        const refs = [...new Map(records.map(r => [r.blob.digest, r.blob as Ref])).values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
        for (const ref of refs) {
          const bytes = await developmentContentBytes(records.find(r => r.blob.digest === ref.digest)! as any);
          require(bytes, 'missing synthetic seed content'); await ports.importBlob(freshDevelopmentId(), ref, bytes);
        }
        await ports.initialize(seed!, refs);
      });
      const history = await openSavedDevelopmentHistory({ ports, target: pair.target, actor: row.actor, base: row.base, inspect });
      histories.push(history);
    }
    if (pair.state !== 'ready') await pairFiles.write('pair.json', jsonBytes({ ...pair, state: 'ready' }));
    return () => histories as unknown as ReturnType<WorkingHistoryFactory>;
  });
}
