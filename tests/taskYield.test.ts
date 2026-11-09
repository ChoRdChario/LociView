import { afterEach, describe, expect, it, vi } from 'vitest';
import { yieldTask } from '../src/core/taskYield';

afterEach(() => vi.unstubAllGlobals());
describe('one owned cooperative task', () => {
  it('settles a real task without retaining its ports', async () => { await yieldTask(); });
  it.each(['unsupported', 'constructor', 'send', 'delivery', 'duplicate', 'close'] as const)('settles and cleans up %s without shared native ownership', async mode => {
    const failure = Error('owned port failure'), ports: { onmessage: (() => void) | null; onmessageerror: (() => void) | null; close: ReturnType<typeof vi.fn> }[] = [];
    class Channel {
      readonly port1 = { onmessage: null as (() => void) | null, onmessageerror: null as (() => void) | null,
        close: vi.fn(() => { if (mode === 'close') throw failure; }) };
      readonly port2 = { onmessage: null as (() => void) | null, onmessageerror: null as (() => void) | null, close: vi.fn(),
        postMessage: (value: unknown) => {
          expect(value).toBeNull(); if (mode === 'send') throw failure;
          queueMicrotask(() => { const handler = mode === 'delivery' ? this.port1.onmessageerror : this.port1.onmessage; handler?.(); if (mode === 'duplicate') handler?.(); });
        } };
      constructor() { if (mode === 'constructor') throw failure; ports.push(this.port1, this.port2); }
    }
    vi.stubGlobal('MessageChannel', mode === 'unsupported' ? undefined : Channel);
    const work = yieldTask(); if (mode === 'close') await expect(work).rejects.toBe(failure); else await work;
    expect(ports).toHaveLength(mode === 'unsupported' || mode === 'constructor' ? 0 : 2);
    for (const port of ports) { expect(port.close).toHaveBeenCalledOnce(); expect(port.onmessage).toBeNull(); expect(port.onmessageerror).toBeNull(); }
  });
});
