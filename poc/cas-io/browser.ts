import { NativeSha256 } from '../../src/nativeGs/sha256';
import { CasCandidate, type BlobRef, type Sink, type Source } from './candidate';
import { OpfsIo } from './opfs-io';
import { browserStressSource, STRESS_REF } from './stress-source';

const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const status = document.getElementById('status')!;
const log = document.getElementById('log')!;
const second = document.getElementById('second') as HTMLAnchorElement;
let active: AbortController | undefined;
const tx = (id: number) => id.toString(16).padStart(32, '0');
const note = (text: string) => { log.textContent += text + '\n'; };
function runId(): string | null {
  const match = /^#run=([0-9a-f]{32})$/.exec(location.hash); return match?.[1] ?? null;
}
function updateLink() { second.href = location.href; button('readback').disabled = !!active || !runId(); }
function assert(ok: boolean, message: string): asserts ok { if (!ok) throw new Error(message); }
async function expectFailure(action: () => Promise<unknown>, name: string) {
  try { await action(); } catch (error) { if (error instanceof Error && error.name === name) return; throw error; }
  throw new Error(`予定した ${name} が発生しませんでした。`);
}
async function* one(bytes: Uint8Array) { yield bytes; }
function describe(bytes: Uint8Array): BlobRef {
  const sha = new NativeSha256(); sha.update(bytes); return { sha256: sha.digestHex(), byteLength: bytes.length };
}
function digestSink(ref: BlobRef): Sink {
  const sha = new NativeSha256(); let length = 0;
  return {
    async write(bytes) { sha.update(bytes); length += bytes.length; },
    async commit() { assert(length === ref.byteLength && sha.digestHex() === ref.sha256, '出力内容が元データと一致しません。'); },
    async abort() {},
  };
}
async function checkSource(source: Source, ref: BlobRef, signal: AbortSignal) {
  assert(source.size === ref.byteLength, '保存された出力のサイズが一致しません。');
  const sink = digestSink(ref);
  for await (const bytes of source.chunks()) { signal.throwIfAborted(); await sink.write(bytes); }
  await sink.commit();
}
async function exerciseFailures(io: OpfsIo, run: string, signal: AbortSignal) {
  const store = new CasCandidate(io);
  const sample = new TextEncoder().encode('Synthetic OPFS recovery resource.'); const ref = describe(sample);
  await expectFailure(() => new CasCandidate(io, async at => {
    if (at === 'verifiedSourceReceipt') throw new DOMException('Injected interruption', 'AbortError');
  }).import(tx(2), ref, one(sample), signal), 'AbortError');
  const fresh = new CasCandidate(await OpfsIo.open(run));
  assert((await fresh.recover(tx(2), signal)).sha256 === ref.sha256, '中断状態から復旧できません。');
  const before = io.payloadWrites;
  await store.import(tx(3), ref, one(sample), signal);
  assert(io.payloadWrites === before, '重複するデータを書き直しています。');
  await store.export(ref, digestSink(ref), signal);
  note('PASS 検証済みデータから復旧・重複取込で内容を書き直さない');

  const other = new TextEncoder().encode('Unpublished OPFS synthetic data.'); const otherRef = describe(other);
  io.fault = { match: key => key.startsWith('blobs/'), afterBytes: 3,
    error: new DOMException('Injected quota', 'QuotaExceededError') };
  try { await expectFailure(() => store.import(tx(4), otherRef, one(other), signal), 'QuotaExceededError'); }
  finally { io.fault = undefined; }
  await expectFailure(() => store.export(otherRef, digestSink(otherRef), signal), 'CasError');
  await store.export(ref, digestSink(ref), signal);
  await fresh.recover(tx(4), signal);
  await fresh.export(otherRef, digestSink(otherRef), signal);
  note('PASS 容量不足の注入を区別・未完了データを拒否・元の内容を保持・再試行');

  const cancelledBytes = new TextEncoder().encode('Cancelled OPFS synthetic data.');
  const cancelledRef = describe(cancelledBytes); const cancel = new AbortController();
  async function* cancelled() { yield cancelledBytes; cancel.abort(); }
  await expectFailure(() => store.import(tx(5), cancelledRef, cancelled(), cancel.signal), 'AbortError');
  await expectFailure(() => store.export(cancelledRef, digestSink(cancelledRef), signal), 'CasError');
  note('PASS 中止した入力は未公開（容量不足は注入であり、端末容量の実測ではありません）');
}
async function withStatus(success: string, action: (signal: AbortSignal) => Promise<void>) {
  if (active) return;
  active = new AbortController(); button('run').disabled = true; button('cancel').disabled = false; updateLink();
  try { await action(active.signal); status.textContent = success; }
  catch (error) {
    const cancelled = error instanceof Error && error.name === 'AbortError';
    status.textContent = cancelled ? '中止 / 検証データを保持' : 'FAILED / 検証データを保持';
    note(`${error instanceof Error ? error.name + ': ' + error.message : '検証に失敗しました。'}`);
    note('ログとこのURLを残してください。「保存結果を確認」は大容量データの保存だけが対象です。未検証・破損状態では拒否します。');
    note('大容量データの保存開始前に止まった場合は復旧対象がありません。記録を残してから、新しい検証を実行してください。');
  } finally { active = undefined; button('run').disabled = false; button('cancel').disabled = true; updateLink(); }
}

button('run').onclick = () => void withStatus('READY / この限定検証が完了', async signal => {
  const previous = runId();
  if (previous) {
    const link = document.createElement('a'); link.href = location.href; link.textContent = '前の検証結果';
    document.getElementById('previous')!.append(link);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  location.hash = 'run=' + Array.from(random, b => b.toString(16).padStart(2, '0')).join('');
  updateLink(); log.textContent = ''; note('合成データのみ。本番UI・iPhone・オフラインの合格判定ではありません。');
  status.textContent = '保存失敗と復旧を検証中';
  const run = runId()!;
  const io = await OpfsIo.open(run); await exerciseFailures(io, run, signal);
  const started = performance.now();
  const phases = { stagingReceipt: '保存の準備', stagedBytes: '入力の確認',
    verifiedSourceReceipt: '検証済みデータを保存', copiedBytes: '保存内容の確認',
    verifiedCopy: '保存内容の検証完了', publishedReceipt: '公開を確定',
    completeReceipt: '保存完了', cleanup: '一時データを片付け' };
  const store = new CasCandidate(io, async at => { status.textContent = phases[at]; });
  await store.import(tx(1), STRESS_REF, browserStressSource(undefined, signal, bytes => {
    status.textContent = `大容量データを準備中：${Math.round(bytes / STRESS_REF.byteLength * 100)}%`;
  }), signal);
  status.textContent = '保存済みデータを検証・出力中';
  await store.export(STRESS_REF, io.outputSink(), signal);
  await io.exclusive(async () => checkSource(await io.outputSource(), STRESS_REF, signal));
  const before = io.payloadReads; await store.recover(tx(1), signal);
  assert(io.payloadReads === before, '完了済みの再確認が本体を読み直しています。');
  note('PASS 500 MiB の保存・出力・サイズ/ハッシュ一致・完了済み再開で本体の再読込なし');
  note(JSON.stringify({ scope: 'synthetic-opfs-only', byteLength: STRESS_REF.byteLength,
    sha256: STRESS_REF.sha256, largestObservedChunk: io.largestChunk,
    elapsedMs: Math.round(performance.now() - started) }));
  note('続けてページを再読み込みし、「保存結果を確認」を選択してください。再実行は不要です。');
});
button('readback').onclick = () => void withStatus('READY / 保存済み本体の確認が完了', async signal => {
  const run = runId(); assert(!!run, '先に検証を実行してください。');
  status.textContent = '保存結果を再読込中';
  const io = await OpfsIo.open(run); const store = new CasCandidate(io);
  const actual = await store.recover(tx(1), signal);
  assert(actual.sha256 === STRESS_REF.sha256 && actual.byteLength === STRESS_REF.byteLength, '保存された参照が一致しません。');
  await store.export(STRESS_REF, digestSink(STRESS_REF), signal);
  note('PASS 再オープン：500 MiB の保存済み本体と元のハッシュが一致');
  note('本体の再確認のみです。中断した出力・その他の検証を完了した意味ではありません。');
});
button('cancel').onclick = () => active?.abort();
window.addEventListener('hashchange', updateLink);
if (runId()) status.textContent = '保存結果を確認できます';
updateLink();
