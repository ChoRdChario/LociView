import { MemoryFS } from '../../src/platform/fs';

export type AppendFaultStep =
  | { kind: 'pass'; token: string }
  | { kind: 'throw-before'; token: string; errorName?: 'DurableWriteFault' | 'QuotaExceededError' }
  | {
      kind: 'write-prefix-then-throw';
      token: string;
      prefixBytes: number;
      errorName?: 'DurableWriteFault' | 'QuotaExceededError';
    }
  | { kind: 'commit-then-throw'; token: string; errorName?: 'DurableWriteFault' | 'QuotaExceededError' };

export type AppendOutcome = AppendFaultStep['kind'] | 'persistent-throw-before' | 'unplanned-pass';

export type DurableMutationMethod = 'appendText' | 'writeText' | 'writeBytes';

export interface DurableAppendEvent {
  index: number;
  path: string;
  method: DurableMutationMethod;
  requestedText: string | null;
  requestedBytes: number;
  beforeBytes: number;
  afterBytes: number;
  outcome: AppendOutcome;
  token: string | null;
  errorName: string | null;
}

interface PersistentFault {
  token: string;
  released: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class DurableWriteFault extends Error {
  constructor(
    readonly token: string,
    readonly outcome: Exclude<AppendOutcome, 'pass' | 'unplanned-pass'>,
  ) {
    super(`injected durable write fault: ${token}`);
    this.name = 'DurableWriteFault';
  }
}

export class DurableQuotaFault extends DOMException {
  constructor(readonly token: string) {
    super(`injected quota failure: ${token}`, 'QuotaExceededError');
  }
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

/** Deterministic byte-level mutation faults for G0-S durable-queue characterization. */
export class DurableWriteMemoryFS extends MemoryFS {
  readonly events: DurableAppendEvent[] = [];
  private readonly plans = new Map<string, AppendFaultStep[]>();
  private readonly persistent = new Map<string, PersistentFault>();
  private readonly monitoredPaths = new Set<string>();
  private eventIndex = 0;

  plan(path: string, ...steps: AppendFaultStep[]): void {
    if (path === '') throw new Error('durable write plan path must not be empty');
    if (steps.length === 0) throw new Error('durable write plan must contain at least one step');
    if (this.plans.has(path)) throw new Error(`durable write plan already exists for ${path}`);
    for (const step of steps) {
      if (step.token === '') throw new Error('durable write step token must not be empty');
      if (
        step.kind === 'write-prefix-then-throw' &&
        (!Number.isSafeInteger(step.prefixBytes) || step.prefixBytes < 1)
      ) {
        throw new Error('partial append prefixBytes must be a positive safe integer');
      }
    }
    this.monitoredPaths.add(path);
    this.plans.set(path, [...steps]);
  }

  failPersistently(path: string, token: string): void {
    if (path === '' || token === '') throw new Error('persistent fault path and token are required');
    if (this.persistent.has(path)) throw new Error(`persistent fault already exists for ${path}`);
    this.monitoredPaths.add(path);
    this.persistent.set(path, { token, released: false });
  }

  releasePersistent(path: string): void {
    const fault = this.persistent.get(path);
    if (fault === undefined) throw new Error(`no persistent fault for ${path}`);
    fault.released = true;
  }

  remainingSteps(path: string): readonly AppendFaultStep[] {
    return [...(this.plans.get(path) ?? [])];
  }

  private record(
    path: string,
    method: DurableMutationMethod,
    requestedText: string | null,
    requestedBytes: number,
    beforeBytes: number,
    afterBytes: number,
    outcome: AppendOutcome,
    token: string | null,
    errorName: string | null,
  ): void {
    this.events.push({
      index: ++this.eventIndex,
      path,
      method,
      requestedText,
      requestedBytes,
      beforeBytes,
      afterBytes,
      outcome,
      token,
      errorName,
    });
  }

  private makeFault(
    token: string,
    outcome: Exclude<AppendOutcome, 'pass' | 'unplanned-pass'>,
    errorName: 'DurableWriteFault' | 'QuotaExceededError' = 'DurableWriteFault',
  ): DurableWriteFault | DurableQuotaFault {
    return errorName === 'QuotaExceededError'
      ? new DurableQuotaFault(token)
      : new DurableWriteFault(token, outcome);
  }

  private async mutate(
    path: string,
    method: DurableMutationMethod,
    requested: Uint8Array,
    requestedText: string | null,
    append: boolean,
  ): Promise<void> {
    const before = (await super.readBytes(path)) ?? new Uint8Array();
    const target = append ? concatBytes(before, requested) : new Uint8Array(requested);
    const monitored = method === 'appendText' || this.monitoredPaths.has(path);
    if (!monitored) {
      await super.writeBytes(path, target);
      return;
    }

    const persistent = this.persistent.get(path);
    if (persistent !== undefined && !persistent.released) {
      this.record(
        path,
        method,
        requestedText,
        requested.length,
        before.length,
        before.length,
        'persistent-throw-before',
        persistent.token,
        'DurableWriteFault',
      );
      throw new DurableWriteFault(persistent.token, 'persistent-throw-before');
    }

    const queue = this.plans.get(path);
    const step = queue?.shift();
    if (queue !== undefined && queue.length === 0) this.plans.delete(path);
    if (step === undefined) {
      await super.writeBytes(path, target);
      this.record(
        path,
        method,
        requestedText,
        requested.length,
        before.length,
        target.length,
        'unplanned-pass',
        null,
        null,
      );
      return;
    }

    if (step.kind === 'throw-before') {
      const errorName = step.errorName ?? 'DurableWriteFault';
      this.record(
        path,
        method,
        requestedText,
        requested.length,
        before.length,
        before.length,
        step.kind,
        step.token,
        errorName,
      );
      throw this.makeFault(step.token, step.kind, errorName);
    }

    if (step.kind === 'write-prefix-then-throw') {
      if (step.prefixBytes >= requested.length) {
        throw new Error(`partial mutation prefix must be smaller than requested bytes for ${path}`);
      }
      const partial = requested.slice(0, step.prefixBytes);
      const after = append ? concatBytes(before, partial) : partial;
      await super.writeBytes(path, after);
      const errorName = step.errorName ?? 'DurableWriteFault';
      this.record(
        path,
        method,
        requestedText,
        requested.length,
        before.length,
        after.length,
        step.kind,
        step.token,
        errorName,
      );
      throw this.makeFault(step.token, step.kind, errorName);
    }

    await super.writeBytes(path, target);
    const errorName = step.kind === 'pass' ? null : (step.errorName ?? 'DurableWriteFault');
    this.record(
      path,
      method,
      requestedText,
      requested.length,
      before.length,
      target.length,
      step.kind,
      step.token,
      errorName,
    );
    if (step.kind === 'commit-then-throw') {
      throw this.makeFault(step.token, step.kind, step.errorName);
    }
  }

  override async appendText(path: string, text: string): Promise<void> {
    await this.mutate(path, 'appendText', encoder.encode(text), text, true);
  }

  override async writeText(path: string, text: string): Promise<void> {
    await this.mutate(path, 'writeText', encoder.encode(text), text, false);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.mutate(path, 'writeBytes', data, decoder.decode(data), false);
  }
}
