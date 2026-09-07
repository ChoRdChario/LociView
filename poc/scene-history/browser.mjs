// Disposable partial G1-C proof. No user input, model payload, package wire,
// production schema, OPFS journal, storage guarantee or app import is involved.
import * as A from '@automerge/automerge/slim';
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { Repo } from '@automerge/automerge-repo/slim';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';

await A.initializeWasm(await (await fetch(wasmUrl)).arrayBuffer());
const database = 'lociview-isolated-scene-history-20260908';
const lockName = `${database}:writer`;
const catalogKey = ['_probe', 'catalog'];
const encoder = new TextEncoder(); const decoder = new TextDecoder();
const control = new IndexedDBStorageAdapter(database);
const output = document.querySelector('#result'); const state = document.querySelector('#state');
const scalar = (x) => new A.ImmutableString(x);
const heads = (doc) => A.getHeads(doc).slice().sort();
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (truth, label) => { if (!truth) throw new Error(label); };
const log = (message) => { output.textContent += `${message}\n`; };
const snapshot = (doc) => Array.from(A.save(doc));
const restore = (bytes) => A.load(new Uint8Array(bytes));
const hashes = (doc) => A.getAllChanges(doc).map((b) => A.decodeChange(b).hash).sort();
const sha = async (bytes) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
  .map((x) => x.toString(16).padStart(2, '0')).join(''); // Small metadata only, NOT streaming CAS.
const readCatalog = async () => {
  const bytes = await control.load(catalogKey);
  return bytes ? JSON.parse(decoder.decode(bytes)) : null;
};
const writeCatalog = (value) => control.save(catalogKey, encoder.encode(JSON.stringify(value)));
let heldRelease; let heldTask;
const channel = new BroadcastChannel(`${database}:published`);
channel.onmessage = () => { observe().catch((error) => log(`FAIL ${error.message}`)); };

class ControlledStorage extends IndexedDBStorageAdapter {
  gate = null;
  failWrites = false;
  entered = null;
  async save(key, bytes) {
    const documentWrite = key[1] === 'snapshot' || key[1] === 'incremental';
    if (documentWrite && this.gate) { this.entered?.(); await this.gate; }
    if (documentWrite && this.failWrites) throw new DOMException('Injected quota exhaustion', 'QuotaExceededError');
    return super.save(key, bytes);
  }
}

// No Repo network adapter: only the single-writer facade can publish. An
// invalidation message reloads the last committed snapshot, never a live handle.
const makeRepo = (storage = new IndexedDBStorageAdapter(database)) => new Repo({ storage, network: [] });
async function durable(repo, handle, expected) {
  await repo.flush([handle.documentId]); // Version-pinned experimental API.
  // A fresh repository reads durable storage, not the mutating handle/cache.
  const check = makeRepo();
  const reopened = await check.find(handle.documentId, { signal: AbortSignal.timeout(5000) });
  assert(eq(heads(reopened.doc()), heads(expected)), 'durable heads differ');
  assert(eq(hashes(reopened.doc()), hashes(expected)), 'durable original history differs');
  const expectedBytes = new Map(A.getAllChanges(expected).map((b) => [A.decodeChange(b).hash, Array.from(b)]));
  for (const bytes of A.getAllChanges(reopened.doc())) {
    assert(eq(Array.from(bytes), expectedBytes.get(A.decodeChange(bytes).hash)), 'stored change bytes rewritten');
  }
  await check.shutdown();
}
async function exclusive(fn) {
  return navigator.locks.request(lockName, { ifAvailable: true }, async (lock) => {
    if (!lock) throw new Error('writer busy; read-only');
    return fn();
  });
}
function projectView(doc) {
  const captions = A.getConflicts(doc.caption, 'title');
  return { title: captions && Object.keys(captions).length > 1 ? 'CONFLICT' : String(doc.caption.title),
    body: String(doc.caption.body), modelRevision: String(doc.modelRevision) };
}
async function observe() {
  const catalog = await readCatalog();
  if (!catalog) { state.textContent = '未作成'; return; }
  // Reads never ask Repo for a prefix-bearing handle while pending.
  const view = projectView(restore(catalog.published));
  state.textContent = `${catalog.pending ? 'READ-ONLY / 未完了の統合あり' : 'READY'} ${JSON.stringify(view)}`;
  log(`OBSERVED ${JSON.stringify(view)}; base unchanged=${eq(catalog.base.heads, catalog.initialHeads)}`);
  assert(eq(catalog.base.heads, catalog.initialHeads), 'exchange base advanced');
  if (!catalog.pending) {
    const repo = makeRepo(); const handle = await repo.find(catalog.docId);
    await durable(repo, handle, restore(catalog.published)); await repo.shutdown();
    log('PASS independent Repo reopen: heads, hashes and original bytes');
  }
}

async function create() {
  await exclusive(async () => {
    const previous = await readCatalog();
    assert(!previous?.pending, 'recover the pending synthetic run first');
    const storage = new ControlledStorage(database); const repo = makeRepo(storage);
    const root = A.from({ projectId: scalar(crypto.randomUUID()),
      caption: { title: scalar('Original'), body: scalar('Body') }, modelRevision: scalar('revision-1') });
    const handle = repo.import(A.save(root)); await durable(repo, handle, root);
    const base = { packageId: crypto.randomUUID(), heads: heads(root) };
    let catalog = { docId: handle.documentId, initialHeads: heads(root), base, published: snapshot(root), pending: null };
    await writeCatalog(catalog);
    log('PASS initial metadata durability; exchange base recorded separately');

    let enteredResolve; const entered = new Promise((r) => { enteredResolve = r; });
    let release; storage.gate = new Promise((r) => { release = r; }); storage.entered = enteredResolve;
    const changed = A.change(A.clone(handle.doc()), (d) => { d.caption.body = scalar('Durable participant edit'); });
    handle.update(() => A.clone(changed));
    let acknowledged = false;
    const barrier = durable(repo, handle, changed).then(() => { acknowledged = true; });
    await entered;
    await Promise.resolve();
    assert(!acknowledged, 'acknowledged before IndexedDB completion');
    assert(eq((await readCatalog()).published, catalog.published), 'published before barrier');
    storage.gate = null; release(); await barrier;
    catalog = { ...catalog, published: snapshot(changed) }; await writeCatalog(catalog);
    log('PASS blocked storage cannot acknowledge or publish; release persists exact bytes');

    const retry = A.change(A.clone(changed), (d) => { d.caption.title = scalar('Retry survived'); });
    storage.failWrites = true; handle.update(() => A.clone(retry));
    let rejected = false;
    try { await durable(repo, handle, retry); }
    catch (error) { assert(error.name === 'QuotaExceededError', 'unexpected failure'); rejected = true; }
    assert(rejected, 'failed write was acknowledged');
    assert(eq((await readCatalog()).published, catalog.published), 'failed write published');
    storage.failWrites = false; await durable(repo, handle, retry);
    await writeCatalog({ ...catalog, published: snapshot(retry) }); await repo.shutdown();
    log('PASS injected quota rejects acknowledgement; retry retains original change bytes');
  });
  channel.postMessage('published'); await observe();
}

async function preparePending(catalog) {
  const base = restore(catalog.published);
  const a = A.change(A.clone(base), (d) => { d.caption.title = scalar('Coordinator title'); });
  const b = A.change(A.clone(base), (d) => { d.modelRevision = scalar('revision-2'); });
  const diamond = A.change(A.merge(A.clone(a), b), (d) => { d.caption.body = scalar('Final remote body'); });
  const changes = A.getChanges(base, diamond);
  const parts = await Promise.all(changes.map(async (bytes) => ({ bytes: Array.from(bytes),
    digest: await sha(bytes), hash: A.decodeChange(bytes).hash, deps: A.decodeChange(bytes).deps.slice().sort() })));
  return { source: snapshot(diamond), base: catalog.published, parts, finalHeads: heads(diamond) };
}
async function validatePending(pending) {
  const base = restore(pending.base); const source = restore(pending.source);
  const expected = A.getChanges(base, source);
  assert(expected.length === pending.parts.length, 'incomplete batch');
  for (let i = 0; i < expected.length; i++) {
    const part = pending.parts[i]; const bytes = new Uint8Array(part.bytes); const decoded = A.decodeChange(bytes);
    assert(eq(Array.from(expected[i]), part.bytes), 'source-derived original part mismatch');
    assert(await sha(bytes) === part.digest && decoded.hash === part.hash, 'part integrity mismatch');
    assert(eq(decoded.deps.slice().sort(), part.deps), 'original dependency mismatch');
  }
  assert(eq(heads(source), pending.finalHeads), 'final heads mismatch');
  return source;
}
async function pause() {
  assert(!heldTask, 'this tab already holds writer');
  let startedResolve; let startedReject;
  const started = new Promise((resolve, reject) => { startedResolve = resolve; startedReject = reject; });
  heldTask = exclusive(async () => {
    const catalog = await readCatalog(); assert(catalog && !catalog.pending, 'create/recover first');
    const pending = await preparePending(catalog); await validatePending(pending);
    await writeCatalog({ ...catalog, pending });
    const repo = makeRepo(); const handle = await repo.find(catalog.docId);
    const [prefix] = A.applyChanges(A.clone(handle.doc()), [new Uint8Array(pending.parts[0].bytes)]);
    handle.update(() => prefix); await durable(repo, handle, prefix);
    await repo.shutdown();
    log(`PAUSED: 1/${pending.parts.length} original changes durable; zero prefix publication`);
    channel.postMessage('pending'); await observe();
    startedResolve();
    await new Promise((resolve) => { heldRelease = resolve; });
  }).catch((error) => { startedReject(error); log(`FAIL ${error.message}`); });
  await started;
  // Closing/reloading this tab now releases the browser-owned lock, but the
  // durable pending catalog continues to prevent a new writer from editing.
}
async function attempt() {
  const catalog = await readCatalog(); assert(catalog, 'create first');
  const viewBefore = projectView(restore(catalog.published));
  // One synthetic facade request, not an implementation of edit/export/GC.
  let denied = false;
  try { await exclusive(async () => { if ((await readCatalog()).pending) throw new Error('unfinished journal; read-only'); }); }
  catch (error) { denied = /read-only/.test(error.message); }
  if (catalog.pending) assert(denied, 'synthetic request escaped barrier');
  log(`${catalog.pending && denied ? 'PASS DENIED' : 'READY'} synthetic facade request`);
  assert(eq(projectView(restore((await readCatalog()).published)), viewBefore), 'prefix leaked');
  await observe();
}
async function recover() {
  if (heldRelease) { heldRelease(); await heldTask; heldTask = null; heldRelease = null; }
  await exclusive(async () => {
    const catalog = await readCatalog(); assert(catalog, 'create first');
    if (!catalog.pending) { log('PASS no pending batch; replay is a no-op'); return; }
    const final = await validatePending(catalog.pending);
    const repo = makeRepo(); const handle = await repo.find(catalog.docId);
    const known = new Set(hashes(handle.doc()));
    const allowed = new Set(hashes(final));
    assert([...known].every((h) => allowed.has(h)), 'unexpected writer during pending batch');
    const missing = catalog.pending.parts.filter((p) => !known.has(p.hash)).map((p) => new Uint8Array(p.bytes));
    const [next] = A.applyChanges(A.clone(handle.doc()), missing);
    assert(eq(heads(next), catalog.pending.finalHeads), 'recovery final heads mismatch');
    handle.update(() => next); await durable(repo, handle, final);
    await writeCatalog({ ...catalog, pending: null, published: snapshot(final) }); await repo.shutdown();
    log(`PASS recovered ${missing.length} missing original changes; one final publication; base unchanged`);
  });
  channel.postMessage('published'); await observe();
}
for (const [name, fn] of Object.entries({ create, pause, observe, attempt, recover })) {
  document.getElementById(name).addEventListener('click', () => {
    fn().catch((error) => { log(`FAIL ${error.name}: ${error.message}`); state.textContent = 'FAILED / 未保存状態を保持'; });
  });
}
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason?.name === 'QuotaExceededError') {
    event.preventDefault(); log('EXPECTED background save failure: injected quota');
  }
});
await observe();
