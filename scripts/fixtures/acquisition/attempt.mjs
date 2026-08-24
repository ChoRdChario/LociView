import { performance } from 'node:perf_hooks';
import { LIMITS } from './constants.mjs';
import { AcquisitionError, normalizeError } from './errors.mjs';

const COMMIT_TOKEN = Symbol('Mode-B receipt commit');

function defaultTimer(callback, milliseconds) {
  const timer = setTimeout(callback, milliseconds);
  timer.unref();
  return timer;
}

class AttemptControl {
  #now;
  #clearTimer;
  #deadline;
  #timer;
  #externalSignal;
  #externalAbort;
  #controller = new AbortController();
  #primary = null;
  #commitEntered = false;
  #committed = false;
  #closed = false;

  constructor({ overallMs, now, setTimer, clearTimer, externalSignal }) {
    if (
      !Number.isSafeInteger(overallMs) ||
      overallMs <= 0 ||
      typeof now !== 'function' ||
      typeof setTimer !== 'function' ||
      typeof clearTimer !== 'function'
    ) throw new TypeError('invalid attempt control');
    const started = now();
    if (!Number.isFinite(started)) throw new TypeError('invalid monotonic clock');
    this.#now = now;
    this.#clearTimer = clearTimer;
    this.#deadline = started + overallMs;
    this.#externalSignal = externalSignal;
    this.#externalAbort = () => {
      this.#select(new AcquisitionError('E_CANCELLED'));
    };
    if (externalSignal?.aborted) this.#externalAbort();
    else externalSignal?.addEventListener('abort', this.#externalAbort, { once: true });
    this.#timer = setTimer(() => {
      if (!this.#commitEntered && this.#primary === null && !this.#closed) {
        this.#select(new AcquisitionError('E_OVERALL_TIMEOUT'));
      }
    }, overallMs);
  }

  get signal() {
    return this.#controller.signal;
  }

  get primaryError() {
    return this.#primary;
  }

  get committed() {
    return this.#committed;
  }

  remainingMs() {
    return Math.max(0, this.#deadline - this.#now());
  }

  #expired() {
    return !this.#commitEntered && this.#now() >= this.#deadline;
  }

  #select(candidate) {
    if (this.#primary !== null) return this.#primary;
    if (
      this.#commitEntered &&
      (candidate.code === 'E_OVERALL_TIMEOUT' || candidate.code === 'E_CANCELLED')
    ) return candidate;
    if (this.#expired() && candidate.code !== 'E_OVERALL_TIMEOUT') {
      this.#primary = new AcquisitionError('E_OVERALL_TIMEOUT');
    } else {
      this.#primary = candidate;
    }
    if (!this.#controller.signal.aborted) this.#controller.abort();
    return this.#primary;
  }

  checkpoint() {
    if (this.#primary !== null) throw this.#primary;
    if (this.#expired()) throw this.#select(new AcquisitionError('E_OVERALL_TIMEOUT'));
    if (!this.#commitEntered && this.#externalSignal?.aborted) {
      throw this.#select(new AcquisitionError('E_CANCELLED'));
    }
  }

  fix(error, fallbackCode = 'E_LOCAL_IO', hopIndex = null) {
    const normalized = normalizeError(error, fallbackCode, hopIndex);
    return this.#select(normalized);
  }

  throwFixed(error, fallbackCode = 'E_LOCAL_IO', hopIndex = null) {
    throw this.fix(error, fallbackCode, hopIndex);
  }

  async run(operation, fallbackCode = 'E_LOCAL_IO', hopIndex = null) {
    this.checkpoint();
    let result;
    try {
      result = await operation();
    } catch (error) {
      this.throwFixed(error, fallbackCode, hopIndex);
    }
    this.checkpoint();
    return result;
  }

  enterReceiptCommit() {
    this.checkpoint();
    this.#commitEntered = true;
    this.#clearTimer(this.#timer);
    return COMMIT_TOKEN;
  }

  markCommitted(token) {
    if (token !== COMMIT_TOKEN || !this.#commitEntered || this.#primary !== null) {
      throw new TypeError('invalid receipt commit token');
    }
    this.#committed = true;
  }

  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#clearTimer(this.#timer);
    this.#externalSignal?.removeEventListener('abort', this.#externalAbort);
  }
}

export function createProductionAttemptControl({ externalSignal } = {}) {
  return new AttemptControl({
    overallMs: LIMITS.overallMs,
    now: () => performance.now(),
    setTimer: defaultTimer,
    clearTimer,
    externalSignal,
  });
}

export function createTestAttemptControl({
  overallMs = LIMITS.overallMs,
  now = () => performance.now(),
  setTimer = defaultTimer,
  clearTimer: clear = clearTimer,
  externalSignal,
} = {}) {
  return new AttemptControl({
    overallMs,
    now,
    setTimer,
    clearTimer: clear,
    externalSignal,
  });
}
