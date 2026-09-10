import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { A, FLAT_FORMAT, LIMIT, type Doc, type Target, type Ref, heads, index, sha, jsonBytes, parse, require } from './journal-format';
import { NodeFiles, NodePorts, TestGate } from './journal-node';
import { CasCandidate } from '../cas-io/candidate';
import { NodeIo } from '../cas-io/node-io';
import { openSavedDevelopmentHistory, freshDevelopmentId } from './development-saved';
import { developmentSourceSeed, sourceKey, readDevelopmentSource, developmentCommandSnapshot } from './development-source';
import { readDevelopmentService, serviceDomainSource } from './development-service';
import { developmentContentBytes } from './content-verifier';
import { verifierFor } from './development-verified';
import { syntheticVersions } from '../../src/harness/projectScene/modelFixture';
import { fixtureMedia } from '../../src/harness/projectScene/mediaHistory';
import { fixtureIds as f } from '../../src/harness/projectScene/fixture';
import { createTeamWorkspace } from '../../src/harness/projectScene/teamWorkspace';
import { RecordedDocument, RecordedNode, record } from '../../tests/ui/domRecorder';

const parent = resolve('.artifacts/fixtures'), key = `caption/${f.shared}/body`, title = `caption/${f.shared}/title`;
let root: string, seed: Doc, target: Target, cas: CasCandidate, io: NodeIo;
let actors: string[], bases: string[][], gates: TestGate[];
const portsAt = (n: number) => new NodePorts(new NodeFiles(resolve(root, `participant-${n}`)),
  new NodeFiles(resolve(root, `metadata-${n}`)), gates[n]!, cas, target, async doc => (await inspect(doc)).retained);
const open = (n: number, ports = portsAt(n)) => openSavedDevelopmentHistory({ ports, target, actor: actors[n]!, base: bases[n]!, inspect });
async function inspect(doc: Doc) {
  const commands = developmentCommandSnapshot(serviceDomainSource(readDevelopmentSource(A, doc as any)));
  return readDevelopmentService(doc, target, verifierFor(commands, async record => {
    const ref = record.blob as unknown as Ref;
    if (!await cas.hasVerified({ sha256: ref.digest, byteLength: ref.byteLength })) return undefined;
    const file = await io.read(`blobs/${ref.digest}`); if (!file || file.size !== ref.byteLength) return undefined;
    const bytes = new Uint8Array(file.size); let offset = 0;
    for await (const chunk of file.chunks()) { bytes.set(chunk, offset); offset += chunk.length; }
    require(offset === file.size, 'truncated fixture'); return bytes;
  }));
}
beforeEach(async () => {
  await mkdir(parent, { recursive: true }); root = await mkdtemp(resolve(parent, 'saved-host-'));
  const genesis = A.from({ cells: Object.fromEntries(Object.entries(developmentSourceSeed()).map(([k, v]) => [k, new A.ImmutableString(v)])) });
  target = { identity: JSON.parse(String(genesis.cells[sourceKey(['identity'])])), metadataEnvelope: { adapter: 'automerge',
    adapterFormatVersion: FLAT_FORMAT, lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(genesis)[0]! } } };
  seed = A.change(A.clone(genesis), { time: 0 }, d => {
    d.cells[sourceKey(['isolatedBridge', 'foundation'])] = new A.ImmutableString(new TextDecoder().decode(jsonBytes({
      caseId: 'saved-development', baselineHeads: heads(genesis) })));
  });
  actors = [freshDevelopmentId(), freshDevelopmentId()]; bases = [heads(seed), heads(seed)]; gates = [new TestGate(), new TestGate()];
  io = new NodeIo(resolve(root, 'cas')); cas = new CasCandidate(io);
  const records = [...syntheticVersions.map(v => v.closure.representation), ...fixtureMedia.map(m => m.record)];
  const refs = [...new Map(records.map(r => [r.blob.digest, r.blob as Ref])).values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
  for (const ref of refs) {
    const bytes = await developmentContentBytes(records.find(r => r.blob.digest === ref.digest)! as any); require(bytes, 'missing fixture');
    await cas.import(freshDevelopmentId(), { sha256: ref.digest, byteLength: ref.byteLength }, (async function* () { yield bytes; })());
  }
  for (let n = 0; n < 2; n++) await portsAt(n).initialize(seed, refs);
});
afterEach(async () => {
  require(resolve(root).startsWith(parent + sep + 'saved-host-'), 'unsafe cleanup'); await rm(root, { recursive: true, force: true });
});
const originals = async (n: number) => [...index(await portsAt(n).current())].map(([id, p]) => [id, sha(p.bytes)]).sort();
const nodes = (root: RecordedNode): RecordedNode[] => [root, ...root.children.flatMap(nodes)];

it('connects saved two-round edits/explicit choice/replay and fresh reopen with separate unchanged exchange bases', async () => {
  const left = await open(0), right = await open(1);
  await left.write(left.read().token, { [key]: '担当者の本文' });
  await right.write(right.read().token, { [title]: '参加者のタイトル' });
  await left.receive(right.exportUpdate()); await right.receive(left.exportUpdate());
  expect(left.read().cells[key]).toEqual({ kind: 'value', value: '担当者の本文' });
  expect(left.read().cells[title]).toEqual({ kind: 'value', value: '参加者のタイトル' });
  await left.write(left.read().token, { [title]: '担当者案' });
  await right.write(right.read().token, { [title]: '参加者案' });
  await left.receive(right.exportUpdate());
  const conflict = left.read().cells[title]; expect(conflict?.kind).toBe('conflict');
  if (conflict?.kind !== 'conflict') throw Error('missing conflict');
  await left.choose(left.read().token, title, conflict.candidates.find(c => c.value === '参加者案')!.id);
  await right.receive(left.exportUpdate());
  const replay = left.exportUpdate(); expect((await right.receive(replay)).added).toBe(0);
  const bytes = await originals(1), before = right.read().source.originalAtomicHistory;
  const reopened = [await open(0), await open(1)] as const;
  expect(reopened[1].read().source.originalAtomicHistory).toEqual(before); expect(await originals(1)).toEqual(bytes);
  for (let n = 0; n < 2; n++) expect(reopened[n]!.exportUpdate().base).toEqual(bases[n]);
  expect((await reopened[1].receive(replay)).added).toBe(0);
  const team = createTeamWorkspace(new RecordedDocument().asDocument(), () => reopened);
  expect(team.hasChanges()).toBe(false);
  expect(nodes(record(team.root)).some(n => n.textContent === '保存済み')).toBe(true);
  expect(nodes(record(team.root)).some(n => n.textContent.includes('変更は保存されず'))).toBe(false);
  team.dispose();
}, 120_000);

it('retries uncertain remote descriptor replacement and completed cleanup without losing the original source', async () => {
  const left = await open(0), ports = portsAt(1), right = await open(1, ports);
  await left.write(left.read().token, { [key]: '受信する元の内容' });
  ports.checkpoint = async name => { if (name === 'sourceStored') throw Error('remote staging interrupted'); };
  await expect(right.receive(left.exportUpdate())).rejects.toThrow('remote staging');
  ports.checkpoint = async () => {};
  const descriptor = parse((await ports.files.read('working.json', LIMIT.journal))!);
  const write = ports.files.write.bind(ports.files); let once = true;
  ports.files.write = async (key, bytes) => {
    if (key === 'working.json' && parse(bytes)?.tx !== descriptor.tx && once) {
      once = false; throw Error('descriptor replacement refused');
    }
    return write(key, bytes);
  };
  await expect(right.retry()).rejects.toThrow('descriptor replacement refused');
  expect(parse((await ports.files.read('working.json', LIMIT.journal))!)).toEqual(descriptor);
  await right.retry(); expect(right.read().cells[key]).toEqual({ kind: 'value', value: '受信する元の内容' });
  let clearOnce = true;
  ports.files.write = async (key, bytes) => {
    await write(key, bytes);
    if (key === 'working.json' && parse(bytes) === null && clearOnce) { clearOnce = false; throw Error('uncertain cleanup result'); }
  };
  await expect(right.write(right.read().token, { [key]: '保存済みだが確認応答を再試行' })).rejects.toThrow('uncertain cleanup');
  const original = await originals(1); await right.retry(); expect(await originals(1)).toEqual(original);
  expect(right.read().cells[key]).toEqual({ kind: 'value', value: '保存済みだが確認応答を再試行' });
}, 120_000);

it('retains original bytes before prepared and after durable interruption; mounted reopen recovers old publication without reauthoring', async () => {
  const ports = portsAt(0), driver = await open(0, ports), old = driver.read().token;
  ports.checkpoint = async name => { if (name === 'sourceStored') throw Error('injected pre-prepared interruption'); };
  await expect(driver.write(old, { [key]: '最初の編集バイトを保持' })).rejects.toThrow('injected');
  expect(driver.read().token).toBe(old); expect(driver.status().kind).toBe('failed');
  const work = parse((await ports.files.read('working.json', LIMIT.journal))!);
  const bytes = (await ports.files.read(`working/${work.sourceId}.am`, LIMIT.metadata))!;
  const expected = [...index(A.load(bytes))].map(([id, p]) => [id, sha(p.bytes)]).sort();
  const damaged = portsAt(0), originalRead = damaged.files.read.bind(damaged.files);
  damaged.files.read = (key, limit) => key === 'working.json' ? Promise.resolve(null) : originalRead(key, limit);
  await expect(open(0, damaged)).rejects.toThrow('必要な元の更新情報がありません');
  const reopened = await open(0), other = await open(1);
  expect(reopened.read().token).toBe(old); expect(() => reopened.exportUpdate()).toThrow();
  const team = createTeamWorkspace(new RecordedDocument().asDocument(), () => [reopened, other]);
  const rootNode = record(team.root), retry = nodes(rootNode).find(n => n.tag === 'button' && n.textContent === '更新を再試行' && !n.hidden)!;
  expect(retry).toBeDefined(); expect(team.sessions[0]!.workingBlock).toContain('未完了');
  retry.fire('click'); await vi.waitFor(() => expect(reopened.status().kind).toBe('idle'), { timeout: 20000 });
  expect(await originals(0)).toEqual(expected); expect(team.sessions[0]!.workingBlock).toBeNull();
  expect(team.hasChanges()).toBe(false); team.dispose();
  const nextPorts = portsAt(0), next = await open(0, nextPorts), previous = next.read().token;
  nextPorts.checkpoint = async name => { if (name.startsWith('partDurable')) throw Error('injected durable interruption'); };
  // Exact checkpoint spelling is verified against the actual journal below.
  const append = nextPorts.appendAndFlush.bind(nextPorts);
  nextPorts.appendAndFlush = async bytes => { await append(bytes); throw Error('injected durable interruption'); };
  await expect(next.write(previous, { [key]: '二回目の保存' })).rejects.toThrow('injected');
  const pending = parse((await nextPorts.files.read('working.json', LIMIT.journal))!);
  const original = (await nextPorts.files.read(`working/${pending.sourceId}.am`, LIMIT.metadata))!;
  const final = await open(0); expect(final.read().token).toBe(previous);
  await final.retry(); expect(await originals(0)).toEqual([...index(A.load(original))].map(([id, p]) => [id, sha(p.bytes)]).sort());
  expect(final.read().cells[key]).toEqual({ kind: 'value', value: '二回目の保存' });
  await expect(final.retry()).rejects.toThrow('再試行する更新');
}, 120_000);
