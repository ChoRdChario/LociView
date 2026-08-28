import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForNativeGsServiceWorker } from '../../src/nativeGs/offline';

class FakeWorker extends EventTarget {
  state: ServiceWorkerState;

  constructor(state: ServiceWorkerState) {
    super();
    this.state = state;
  }

  transition(state: ServiceWorkerState): void {
    this.state = state;
    this.dispatchEvent(new Event('statechange'));
  }
}

class FakeRegistration extends EventTarget {
  active: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
}

function asRegistration(value: FakeRegistration): ServiceWorkerRegistration {
  return value as unknown as ServiceWorkerRegistration;
}

describe('native GS Service Worker activation', () => {
  afterEach(() => vi.useRealTimers());

  it('accepts an already active worker', async () => {
    const registration = new FakeRegistration();
    registration.active = new FakeWorker('activated');
    await expect(waitForNativeGsServiceWorker(asRegistration(registration))).resolves.toBe(registration.active);
  });

  it('rejects a failed first install instead of waiting forever', async () => {
    const registration = new FakeRegistration();
    const worker = new FakeWorker('installing');
    registration.installing = worker;
    const result = waitForNativeGsServiceWorker(asRegistration(registration));
    worker.transition('redundant');
    await expect(result).rejects.toThrow('installに失敗');
  });

  it('times out a stalled first install with an actionable failure', async () => {
    vi.useFakeTimers();
    const registration = new FakeRegistration();
    registration.installing = new FakeWorker('installing');
    const result = waitForNativeGsServiceWorker(asRegistration(registration), 25);
    const assertion = expect(result).rejects.toThrow('準備が完了しませんでした');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });
});
