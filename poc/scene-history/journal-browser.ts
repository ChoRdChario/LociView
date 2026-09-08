// One isolated, resumable manual platform flow. Not application UI acceptance.
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { A, FORMAT, LIMIT, type Doc, type Ref, type Target, type Prepared, require,
  heads, index, sha, same, jsonBytes, parse, refs, load, decodeJournal } from './journal-format';
import { JournalCandidate } from './journal';
import { BrowserFiles, BrowserPorts, decodeSession, runLock } from './journal-browser-ports';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const state = el('state'), result = el('result'), value = el('value'), errorBox = el('error');
const startButton = el<HTMLButtonElement>('start'), observeButton = el<HTMLButtonElement>('observe');
const recoverButton = el<HTMLButtonElement>('recover');
const random = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
const tab = random();
const scalar = (s: string) => new A.ImmutableString(s);
const raw = (s: string) => new TextEncoder().encode(s);
const reference = (bytes: Uint8Array): Ref => ({ algorithm: 'sha256', digest: sha(bytes), byteLength: bytes.length, mediaType: 'application/octet-stream' });
const oldBytes = raw('Journal browser synthetic model version one');
const newBytes = raw('Journal browser synthetic model version two');
const oldRef = reference(oldBytes), newRef = reference(newBytes);
const change = (doc: Doc, fn: (d: Record<string, any>) => void) => A.change(A.clone(doc), { time: 0 }, fn);
const closure = (doc: Doc): Ref[] => {
  require(doc.schema?.major === 2 && doc.schema.minor === 0 && doc.resources && doc.captions, 'invalid synthetic domain');
  const candidates = A.getConflicts(doc.resources, 'model');
  const all = (candidates ? Object.values(candidates) : [doc.resources.model]).map(v => JSON.parse(String(v)) as Ref);
  const unique = [...new Map(all.map(ref => [ref.digest, ref])).values()].sort((a, b) => a.digest < b.digest ? -1 : 1);
  refs(unique); return unique;
};
let run: string, files: BrowserFiles, ports: BrowserPorts | undefined, busy = false;
let channel: BroadcastChannel | undefined;
interface Entry { time: string; tab: string; message: string }
async function logEntries(): Promise<Entry[]> {
  const bytes = await files.read('evidence.json', LIMIT.journal); if (!bytes) return [];
  const entries = parse(bytes);
  require(Array.isArray(entries) && entries.length <= 100 && entries.every(e =>
    e && same(Object.keys(e).sort(), ['message', 'tab', 'time']) && typeof e.message === 'string' && e.message.length <= 1200 &&
    typeof e.tab === 'string' && /^[0-9a-f]{32}$/.test(e.tab) && typeof e.time === 'string'), 'invalid saved evidence');
  return entries;
}
const renderLog = (entries: Entry[]) => { result.textContent = entries.map(e => `${e.time} [${e.tab.slice(0, 6)}] ${e.message}`).join('\n'); };
async function record(message: string) {
  require(message.length <= 1200, 'log message budget');
  // Evidence is not Project metadata. A separate lock serializes both tabs' logs.
  await navigator.locks.request(`${runLock(run)}:evidence`, async () => {
    const entries = await logEntries(); require(entries.length < 100, '結果ログの上限です。反復せず画面を保存してください');
    entries.push({ time: new Date().toISOString(), tab, message });
    await files.write('evidence.json', jsonBytes(entries)); renderLog(entries);
  });
}
async function failure(error: unknown) {
  const message = (error instanceof Error ? `${error.name}: ${error.message}` : String(error)).slice(0, 1000).normalize('NFC');
  state.textContent = 'FAILED / 未完了・未保存の状態を保持'; errorBox.textContent = message;
  if (files) {
    try { await record(`FAIL ${message}`); }
    catch { errorBox.textContent += '（結果ログの保存にも失敗しました。この画面を保存してください）'; }
  }
}
async function attach() {
  const bytes = await files.read('session.json', LIMIT.journal);
  if (bytes) ports = await BrowserPorts.open(run, files, decodeSession(bytes), closure);
}
const journalKey = (tx: string) => `journal/${tx}/journal.json`;
async function savedRemote(): Promise<Prepared | null> {
  require(ports, '検証は未作成です');
  const bytes = await files.read(journalKey(ports.session.remoteTx), LIMIT.journal); if (!bytes) return null;
  const journal = decodeJournal(bytes); require(journal.state !== 'staging', '統合準備が未完了です'); return journal;
}
async function observe(origin: string) {
  if (!ports) {
    renderLog(await logEntries()); state.textContent = '未作成'; value.textContent = ''; return;
  }
  const fresh = await ports.fresh(); const engine = new JournalCandidate(fresh, fresh.session.target);
  const view = await engine.view();
  if (view.repairRequired) {
    const detail = view.repairCause instanceof Error ? view.repairCause.message : String(view.repairCause ?? '原因不明');
    throw new Error(`保存内容を確認できません。${detail}`);
  }
  // This synthetic flow expects unambiguous fields; never expose a library winner.
  for (const key of ['title', 'body']) require(Object.keys(A.getConflicts(view.doc.captions, key) ?? {}).length <= 1, 'Captionの競合が未解決です');
  require(Object.keys(A.getConflicts(view.doc.resources, 'revision') ?? {}).length <= 1, 'モデルの競合が未解決です');
  value.textContent = JSON.stringify({ title: String(view.doc.captions.title), body: String(view.doc.captions.body),
    modelRevision: String(view.doc.resources.revision) }, null, 2);
  const control = await fresh.control(); const remote = await savedRemote();
  if (control.pending) {
    if (remote) require(same(heads(view.doc), remote.metadataBatch.baseHeads), '統合途中の内容が表示されました');
    state.textContent = 'READ-ONLY / 未完了の統合あり';
    await record(`PASS ${origin}: 旧表示を保持。未完了の統合あり（全体完了ではありません）`);
  } else {
    state.textContent = remote ? 'READY / 復旧後の保存内容を確認済み' : '保存済み / 統合の検証は未完了';
    await record(`PASS ${origin}: 独立Repoから公開済みheadsを確認（${remote ? '復旧後' : '初期保存'}）`);
  }
  renderLog(await logEntries());
}
async function start() {
  require(!await files.read('session.json', LIMIT.journal) && (await logEntries()).length === 0, '既存の検証を上書きできません');
  state.textContent = '保存を検証中';
  const identity = { projectId: `prj_${random()}`, historyEpoch: `hep_${random()}`, lineageSeed: random() + random() };
  const genesis = A.from<Record<string, any>>({ schema: { major: 2, minor: 0 },
    identity: Object.fromEntries(Object.entries(identity).map(([key, text]) => [key, scalar(text)])), resources: {}, captions: {} });
  const target: Target = { identity, metadataEnvelope: { adapter: 'automerge', adapterFormatVersion: FORMAT,
    lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(genesis)[0]! } } };
  const base = change(genesis, d => { d.resources.model = scalar(JSON.stringify(oldRef)); d.resources.revision = scalar('revision-1');
    d.captions.title = scalar('初期タイトル'); d.captions.body = scalar('初期の本文'); });
  // Temporary valid-shaped locator is replaced before initial persistence.
  ports = await BrowserPorts.open(run, files, { target, documentId: '1'.repeat(22), localTx: random(), remoteTx: random() }, closure);
  await ports.exclusive(async () => { await ports!.importBlob(random(), oldRef, oldBytes); await ports!.initialize(base, [oldRef]); });
  const engine = new JournalCandidate(ports, target);
  const readsBeforeLocal = ports.casIo.payloadReads;
  await engine.local(ports.session.localTx, random(), d => { d.captions.body = scalar('手元の追記'); });
  const local = await ports.current(); require(String(local.captions.body) === '手元の追記', 'local edit not durable');
  require(ports.casIo.payloadReads === readsBeforeLocal, 'local metadata path reread model payload');
  await record('PASS OPFS inventoryとIndexedDBの初期保存・手元の追記を独立Repoで確認');
  const a = change(local, d => { d.captions.title = scalar('共有されたタイトル'); });
  const b = change(local, d => { d.resources.model = scalar(JSON.stringify(newRef)); d.resources.revision = scalar('revision-2'); });
  const final = change(A.merge(A.clone(a), A.clone(b)), d => { d.captions.body = scalar('統合後の本文'); });
  await ports.exclusive(() => ports!.importBlob(random(), newRef, newBytes));
  const readsBeforeRemote = ports.casIo.payloadReads;
  const pause = new Error('intentional remote prefix stop');
  ports.checkpoint = async name => { if (name === 'metadataDurable:0') throw pause; };
  let paused = false;
  try { await engine.remote(ports.session.remoteTx, A.save(final), `pkg_${random()}`, [newRef]); }
  catch (error) { if (error !== pause) throw error; paused = true; }
  finally { ports.checkpoint = async () => {}; }
  require(paused, 'expected interruption missing');
  const fresh = await ports.fresh(); const stopped = new JournalCandidate(fresh, target);
  require(same(heads((await stopped.view()).doc), heads(local)), 'prefix published');
  for (const action of ['edit', 'export', 'gc'] as const) {
    let denied = false;
    try { await stopped.request(action); } catch (error) { denied = error instanceof Error && error.message.includes('unfinished journal'); }
    require(denied, `${action} escaped pending barrier`);
  }
  require(ports.casIo.payloadReads === readsBeforeRemote && fresh.casIo.payloadReads === 0, 'metadata path reread model payload');
  await record('PASS 3件中1件で意図的に中断。旧表示のみ・編集/出力/GC拒否・既存モデルの読込0バイト');
  channel!.postMessage('pending'); await observe('中断直後');
}
async function recover() {
  require(ports, '検証は未作成です'); state.textContent = '元の変更データから復旧中';
  const fresh = await ports.fresh(); const engine = new JournalCandidate(fresh, fresh.session.target);
  const control = await fresh.control(); const tx = control.pending ?? fresh.session.remoteTx;
  const before = fresh.casIo.payloadReads;
  const outcome = await engine.recover(tx);
  if (tx !== fresh.session.remoteTx) {
    await record('ローカル保存だけを復旧しました。統合の検証は未完了です'); await observe('部分復旧後'); return;
  }
  const j = await savedRemote(); require(j && j.state === 'metadataDurable', 'missing completed remote journal');
  const sourceBytes = await files.read(`journal/${tx}/source-metadata.am`, LIMIT.metadata); require(sourceBytes, 'missing original source');
  const source = load(sourceBytes, fresh.session.target);
  const current = await (await ports.fresh()).current();
  require(same(heads(current), j.metadataBatch.expectedFinalHeads) && same(heads(current), heads(source)), 'final heads mismatch');
  const expected = index(source), actual = index(current);
  require(same([...actual.keys()].sort(), [...expected.keys()].sort()) && [...actual].every(([h, p]) => sha(p.bytes) === sha(expected.get(h)!.bytes)), 'original change bytes differ');
  require((await fresh.control()).pending === null && fresh.casIo.payloadReads === before, 'pending state or payload reread');
  require(fresh.publications === (outcome === 'published' ? 1 : 0), 'incorrect publication count');
  await record(outcome === 'noop' ? 'PASS no-op: 元の変更を再追加せず、再公開も0回' :
    'PASS 復旧: 元の変更バイト・headsが一致。公開1回、既存モデルの読込0バイト');
  channel!.postMessage('published'); await observe('復旧後');
}
async function refreshButtons() {
  const prior = !!await files.read('session.json', LIMIT.journal) || (await logEntries()).length > 0;
  startButton.disabled = busy || prior;
  observeButton.disabled = busy || !ports; recoverButton.disabled = busy || !ports;
}
async function action(fn: () => Promise<void>) {
  if (busy) return; busy = true; errorBox.textContent = '';
  try { await refreshButtons(); await fn(); }
  catch (error) { await failure(error); }
  finally { busy = false; try { await refreshButtons(); } catch (error) { await failure(error); } }
}
async function main() {
  const response = await fetch(wasmUrl); require(response.ok, 'ローカルWASMを読み込めません');
  await A.initializeWasm(new Uint8Array(await response.arrayBuffer()));
  const params = new URLSearchParams(location.hash.slice(1));
  require([...params.keys()].every(k => k === 'run') && params.getAll('run').length <= 1, 'invalid run URL');
  run = params.get('run') ?? random(); require(run.length === 32 && /^[0-9a-f]{32}$/.test(run), 'invalid run');
  history.replaceState(null, '', `#run=${run}`); el<HTMLAnchorElement>('other').href = location.href;
  files = await BrowserFiles.open(run); await attach();
  channel = new BroadcastChannel(`${runLock(run)}:updates`);
  channel.onmessage = () => { if (!busy) void action(async () => { if (!ports) await attach(); await observe('他タブ通知後'); }); };
  startButton.onclick = () => void action(start);
  observeButton.onclick = () => void action(() => observe('手動確認'));
  recoverButton.onclick = () => void action(recover);
  await observe('ページ読込後'); await refreshButtons();
}
window.addEventListener('unhandledrejection', event => { event.preventDefault(); void failure(event.reason); });
void main().catch(failure);
