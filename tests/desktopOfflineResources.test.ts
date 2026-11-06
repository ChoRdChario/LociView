import { describe, expect, it, vi } from 'vitest';
import { createDesktopOfflineResources } from '../src/platform/desktopOfflineResources';

const url = 'https://example.test/LociView/assets/entry.js', key = url + '?__WB_REVISION__=fixed';
const bytes = 'same original build';
async function fixture() {
  const integrity = 'sha384-' + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-384', new TextEncoder().encode(bytes)))));
  const data = new Map<string, Response>();
  const match = vi.fn(async (target: string) => data.get(target)?.clone());
  const put = vi.fn(async (target: string, value: Response) => { data.set(target, value.clone()); });
  const open = vi.fn(async (name: string) => { expect(name).toBe('only-current-build'); return { match, put } as unknown as Cache; });
  const fetch = vi.fn(async (_request: Request) => new Response(bytes));
  const resources = createDesktopOfflineResources({ manifest: [{ url, revision: 'fixed', integrity }], cacheName: 'only-current-build',
    key: target => target === url ? key : undefined, caches: { open }, fetch, subtle: crypto.subtle });
  return { resources, data, fetch, match, put, integrity };
}
const gate = () => { let release!: () => void; const wait = new Promise<void>(yes => { release = yes; }); return { wait, release }; };

describe('current-build boot resources (app-only integrity and ownership)', () => {
  it('keeps healthy reads and state checks offline, and rejects unknown URLs without I/O', async () => {
    const f = await fixture(); f.data.set(key, new Response(bytes));
    expect(await (await f.resources.read(url, true))!.text()).toBe(bytes);
    expect(await (await f.resources.read(url, false))!.text()).toBe(bytes);
    expect(await f.resources.check(url, false)).toBe(true);
    expect((await f.match.mock.results.at(-1)!.value)!.bodyUsed).toBe(true);
    expect(await f.resources.read('https://example.test/Project/private.zip', true)).toBeUndefined();
    expect(f.fetch).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
    f.data.clear(); expect(await f.resources.read(url, false)).toBeUndefined(); expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['missing', 'corrupt'])('repairs %s bytes once with exact request policy and real readback', async kind => {
    const f = await fixture(); if (kind === 'corrupt') f.data.set(key, new Response('different build'));
    const result = await f.resources.read(url, true); expect(await result!.text()).toBe(bytes);
    expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.put).toHaveBeenCalledTimes(1);
    const request = f.fetch.mock.calls[0]![0]; expect(request.url).toBe(url); expect(request.integrity).toBe(f.integrity);
    expect(request.mode).toBe('same-origin'); expect(request.redirect).toBe('error'); expect(request.credentials).toBe('same-origin'); expect(request.cache).toBe('reload');
    expect(f.match.mock.calls.length).toBeGreaterThanOrEqual(4);
    // Later loss is a new operation, not a retained success result.
    f.data.clear(); await f.resources.read(url, true); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it('shares one repair across independent callers and one caller cancellation does not abort the other', async () => {
    const f = await fixture(), entered = gate(), hold = gate(), first = new AbortController();
    f.fetch.mockImplementationOnce(async request => { entered.release(); await hold.wait; expect(request.signal.aborted).toBe(false); return new Response(bytes); });
    const a = f.resources.read(url, true, first.signal); const rejected = expect(a).rejects.toMatchObject({ name: 'AbortError' });
    await entered.wait; const b = f.resources.read(url, true); await vi.waitFor(() => expect(f.match.mock.calls.length).toBeGreaterThanOrEqual(3));
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    first.abort(); await rejected; hold.release(); expect(await (await b)!.text()).toBe(bytes); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('returns independent response bodies to concurrent boot and explicit repair callers', async () => {
    const f = await fixture(), entered = gate(), hold = gate();
    f.fetch.mockImplementationOnce(async () => { entered.release(); await hold.wait; return new Response(bytes); });
    const a = f.resources.read(url, true); await entered.wait; const b = f.resources.read(url, true);
    await vi.waitFor(() => expect(f.match.mock.calls.length).toBeGreaterThanOrEqual(3)); hold.release();
    const [one, two] = await Promise.all([a, b]); expect(one).not.toBe(two);
    expect(await one!.text()).toBe(bytes); expect(await two!.text()).toBe(bytes); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('aborts when all callers leave, writes no cache and permits a separate later attempt', async () => {
    const f = await fixture(), entered = gate(), abort = new AbortController();
    f.fetch.mockImplementationOnce(request => new Promise((_yes, no) => {
      request.signal.addEventListener('abort', () => no(request.signal.reason), { once: true }); entered.release();
    }));
    const work = f.resources.read(url, true, abort.signal), rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    await entered.wait; abort.abort(); await rejected; expect(f.put).not.toHaveBeenCalled();
    expect(await (await f.resources.read(url, true))!.text()).toBe(bytes); expect(f.fetch).toHaveBeenCalledTimes(2);
  });
  it.each(['wrong200', 'redirect', 'network', 'interrupted', 'put', 'readback', 'undefinedFailure'])('rejects %s and never adopts a failed repair', async fault => {
    const f = await fixture();
    if (fault === 'wrong200') f.fetch.mockResolvedValueOnce(new Response('other build'));
    if (fault === 'redirect') { const response = new Response(bytes); Object.defineProperty(response, 'redirected', { value: true }); f.fetch.mockResolvedValueOnce(response); }
    if (fault === 'network') f.fetch.mockRejectedValueOnce(Error('offline'));
    if (fault === 'undefinedFailure') f.fetch.mockRejectedValueOnce(undefined);
    if (fault === 'interrupted') f.fetch.mockResolvedValueOnce(new Response(new ReadableStream({ start(controller) { controller.error(Error('truncated')); } })));
    if (fault === 'put') f.put.mockRejectedValueOnce(Error('quota'));
    if (fault === 'readback') f.put.mockImplementationOnce(async () => { f.data.set(key, new Response('torn cache')); });
    if (fault === 'undefinedFailure') await expect(f.resources.read(url, true)).rejects.toBeUndefined();
    else await expect(f.resources.read(url, true)).rejects.toBeDefined();
    // The failed Promise does not become a successful fallback or poison the next explicit request.
    f.data.clear(); expect(await (await f.resources.read(url, true))!.text()).toBe(bytes);
  });
  it('bounds a stalled shared repair with the existing45s deadline', async () => {
    const f = await fixture(), entered = gate(); vi.useFakeTimers();
    try {
      f.fetch.mockImplementationOnce(request => new Promise((_yes, no) => {
        request.signal.addEventListener('abort', () => no(request.signal.reason), { once: true }); entered.release();
      }));
      const work = f.resources.read(url, true), rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      await entered.wait; await vi.advanceTimersByTimeAsync(45_000); await rejected; expect(f.put).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it('cancels an individual caller during native cache reads without later starting a fetch', async () => {
    const f = await fixture(), entered = gate(), hold = gate(), abort = new AbortController();
    f.match.mockImplementationOnce(async () => { entered.release(); await hold.wait; return undefined; });
    const work = f.resources.read(url, true, abort.signal), rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
    try {
      await entered.wait; abort.abort(); await rejected;
      hold.release(); await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(f.fetch).not.toHaveBeenCalled(); expect(f.put).not.toHaveBeenCalled();
    } finally { hold.release(); }
  });
  it('rejects a shared deadline even when native cache.put cannot be cancelled', async () => {
    const f = await fixture(), entered = gate(), hold = gate(); vi.useFakeTimers();
    try {
      f.put.mockImplementationOnce(async (target, response) => { entered.release(); await hold.wait; f.data.set(target, response.clone()); });
      const work = f.resources.read(url, true), rejected = expect(work).rejects.toMatchObject({ name: 'AbortError' });
      await entered.wait; await vi.advanceTimersByTimeAsync(45_000); await rejected;
      expect(f.data.size).toBe(0); hold.release(); await vi.advanceTimersByTimeAsync(0);
      // An already-started valid same-build write may complete; its timed-out caller never adopts it.
      expect(await f.resources.check(url, false)).toBe(true); expect(f.fetch).toHaveBeenCalledTimes(1);
    } finally { hold.release(); vi.useRealTimers(); }
  });
});
