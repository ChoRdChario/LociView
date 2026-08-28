import {
  LOCAL_PROJECT_MUTATION_AUTHORITY,
  type ProjectWorkspaceFS,
} from '../../src/platform/fs';

export type ModeledFsContext = 'setup' | 'first' | 'second' | 'audit';
export type ModeledMutationMethod = 'appendText' | 'appendBytes' | 'writeText' | 'writeBytes' | 'writeStream' | 'remove';
export type ModeledMutationPhase = 'start' | 'commit' | 'reject';
export type ModeledGateRelease = 'overlap' | 'timeout' | 'abort';

export interface ModeledTrackedPath {
  path: string;
  /** A completed action is expected to commit this path. */
  required: boolean;
  /** Only append/blob commits participate in the serialization inequality. */
  contributesToOrdering: boolean;
}

export interface ModeledTransactionPlan {
  gatePath: string;
  first: readonly ModeledTrackedPath[];
  second: readonly ModeledTrackedPath[];
  /** Retained for caller documentation; snapshots always include all files. */
  snapshotPaths?: readonly string[];
  timeoutMs?: number;
}

export interface ModeledMutationEvent {
  tick: number;
  callId: number;
  context: 'first' | 'second';
  phase: ModeledMutationPhase;
  method: ModeledMutationMethod;
  path: string;
  required: boolean;
  contributesToOrdering: boolean;
}

export interface ModeledFileSnapshot {
  tick: number;
  event: ModeledMutationEvent;
  files: ReadonlyMap<string, Uint8Array | null>;
}

export interface ModeledPublication<T> {
  tick: number;
  context: 'first' | 'second';
  value: T;
  files: ReadonlyMap<string, Uint8Array | null>;
}

export interface ModeledGateObservation {
  releaseMode: ModeledGateRelease | null;
  gateStart: number | null;
  gateCommit: number | null;
  lastFirstCommit: number | null;
  firstSecondStart: number | null;
  serialized: boolean;
  missingRequired: Readonly<{
    first: readonly string[];
    second: readonly string[];
  }>;
  inFlight: number;
  events: readonly ModeledMutationEvent[];
  snapshots: readonly ModeledFileSnapshot[];
}

export interface ArmedModeledTransactionGate {
  reached: Promise<void>;
  abort(): void;
  finish(): Promise<ModeledGateObservation>;
}

interface Deferred {
  promise: Promise<void>;
  resolve: () => void;
}

interface ArmedState {
  plan: Required<ModeledTransactionPlan>;
  reached: Deferred;
  release: Deferred;
  releaseMode: ModeledGateRelease | null;
  gateCallId: number | null;
  secondOrderingStarted: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  finished: boolean;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

class SnapshotMemoryFS implements ProjectWorkspaceFS {
  readonly projectRoot = null;
  readonly mutationAuthority = LOCAL_PROJECT_MUTATION_AUTHORITY;
  private readonly files = new Map<string, Uint8Array>();

  async readText(path: string): Promise<string | null> {
    const bytes = this.files.get(path);
    return bytes === undefined ? null : decoder.decode(bytes);
  }

  async writeText(path: string, text: string): Promise<void> {
    this.files.set(path, encoder.encode(text));
  }

  async appendText(path: string, text: string): Promise<void> {
    await this.appendBytes(path, encoder.encode(text));
  }

  async appendBytes(path: string, data: Uint8Array): Promise<void> {
    const previous = this.files.get(path);
    const addition = new Uint8Array(data);
    if (previous === undefined) {
      this.files.set(path, addition);
      return;
    }
    const result = new Uint8Array(previous.length + addition.length);
    result.set(previous, 0);
    result.set(addition, previous.length);
    this.files.set(path, result);
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    return copyBytes(this.files.get(path) ?? null);
  }

  async readBytesFrom(path: string, offset: number): Promise<{ size: number; data: Uint8Array } | null> {
    if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('snapshot fs: invalid byte offset');
    const bytes = this.files.get(path);
    if (bytes === undefined) return null;
    return { size: bytes.length, data: bytes.slice(Math.min(offset, bytes.length)) };
  }

  async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.files.set(path, new Uint8Array(data));
  }

  async readStream(path: string): Promise<{ size: number; stream(): ReadableStream<Uint8Array> } | null> {
    const bytes = this.files.get(path);
    if (bytes === undefined) return null;
    const stable = new Uint8Array(bytes);
    return {
      size: stable.byteLength,
      stream: () => new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(stable));
          controller.close();
        },
      }),
    };
  }

  async writeStream(path: string, stream: ReadableStream<Uint8Array>): Promise<void> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        const copy = new Uint8Array(result.value);
        chunks.push(copy);
        size += copy.byteLength;
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    this.files.set(path, bytes);
  }

  async list(prefix: string): Promise<string[]> {
    return [...this.files.keys()].filter((path) => path.startsWith(prefix)).sort();
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  snapshotAll(): ReadonlyMap<string, Uint8Array> {
    return new Map([...this.files].map(([path, bytes]) => [path, new Uint8Array(bytes)]));
  }
}

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function copyBytes(bytes: Uint8Array | null): Uint8Array | null {
  return bytes === null ? null : new Uint8Array(bytes);
}

/**
 * One in-process model of two browser contexts sharing one workspace.
 *
 * Each facade has a distinct object identity while all I/O reaches the same
 * MemoryFS backing. Only explicitly configured canonical authority paths are
 * observed; private staging, journals and quarantine remain unconstrained.
 */
export class ModeledTransactionGateFS {
  private readonly backing = new SnapshotMemoryFS();
  private armed: ArmedState | null = null;
  private tick = 0;
  private callId = 0;
  private inFlight = 0;
  private readonly events: ModeledMutationEvent[] = [];
  private readonly pendingSnapshots: Array<Promise<ModeledFileSnapshot>> = [];

  context(context: ModeledFsContext): ProjectWorkspaceFS {
    const facade: ProjectWorkspaceFS = {
      projectRoot: null,
      mutationAuthority: LOCAL_PROJECT_MUTATION_AUTHORITY,
      readText: (path) => this.backing.readText(path),
      writeText: (path, text) => this.mutate(
        context,
        'writeText',
        path,
        () => this.backing.writeText(path, text),
      ),
      appendText: (path, text) => this.mutate(
        context,
        'appendText',
        path,
        () => this.backing.appendText(path, text),
      ),
      appendBytes: (path, data) => this.mutate(
        context,
        'appendBytes',
        path,
        () => this.backing.appendBytes(path, data),
      ),
      readBytes: (path) => this.backing.readBytes(path),
      readBytesFrom: (path, offset) => this.backing.readBytesFrom(path, offset),
      writeBytes: (path, data) => this.mutate(
        context,
        'writeBytes',
        path,
        () => this.backing.writeBytes(path, data),
      ),
      readStream: (path) => this.backing.readStream(path),
      writeStream: (path, stream) => this.mutate(
        context,
        'writeStream',
        path,
        () => this.backing.writeStream(path, stream),
      ),
      list: (prefix) => this.backing.list(prefix),
      exists: (path) => this.backing.exists(path),
      remove: (path) => this.mutate(
        context,
        'remove',
        path,
        () => this.backing.remove(path),
      ),
    };
    return Object.freeze(facade);
  }

  arm(plan: ModeledTransactionPlan): ArmedModeledTransactionGate {
    if (this.armed !== null) throw new Error('modeled transaction gate is already armed');
    if (plan.gatePath === '') throw new Error('modeled transaction gate path must not be empty');
    const timeoutMs = plan.timeoutMs ?? 150;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new Error('modeled transaction gate timeout must be a positive safe integer');
    }
    this.validateTrackedPaths('first', plan.first);
    this.validateTrackedPaths('second', plan.second);
    if ((plan.snapshotPaths ?? []).some((path) => path === '')) {
      throw new Error('modeled transaction snapshot paths must not be empty');
    }
    const gate = plan.first.find((entry) => entry.path === plan.gatePath);
    if (gate === undefined || !gate.required || !gate.contributesToOrdering) {
      throw new Error('gate path must be a required first ordering path');
    }

    const reached = deferred();
    const release = deferred();
    const armed: ArmedState = {
      plan: {
        gatePath: plan.gatePath,
        first: [...plan.first],
        second: [...plan.second],
        snapshotPaths: [...new Set(plan.snapshotPaths ?? [])].sort(),
        timeoutMs,
      },
      reached,
      release,
      releaseMode: null,
      gateCallId: null,
      secondOrderingStarted: false,
      timer: null,
      finished: false,
    };
    this.armed = armed;

    return {
      reached: reached.promise,
      abort: () => this.releaseGate(armed, 'abort'),
      finish: () => this.finish(armed),
    };
  }

  capturePublication<T>(
    context: 'first' | 'second',
    value: T,
    _snapshotPaths?: readonly string[],
  ): Promise<ModeledPublication<T>> {
    const tick = ++this.tick;
    const files = new Map<string, Uint8Array | null>(this.backing.snapshotAll());
    return Promise.resolve({ tick, context, value, files });
  }

  private validateTrackedPaths(
    context: 'first' | 'second',
    entries: readonly ModeledTrackedPath[],
  ): void {
    if (entries.length === 0) throw new Error(`${context} tracked paths must not be empty`);
    const seen = new Set<string>();
    for (const entry of entries) {
      if (entry.path === '') throw new Error(`${context} tracked path must not be empty`);
      if (seen.has(entry.path)) throw new Error(`duplicate ${context} tracked path: ${entry.path}`);
      seen.add(entry.path);
    }
  }

  private trackedEntry(
    state: ArmedState,
    context: 'first' | 'second',
    path: string,
  ): ModeledTrackedPath | null {
    return state.plan[context].find((entry) => entry.path === path) ?? null;
  }

  private async mutate(
    context: ModeledFsContext,
    method: ModeledMutationMethod,
    path: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const state = this.armed;
    if (state === null || (context !== 'first' && context !== 'second')) {
      await operation();
      return;
    }
    const entry = this.trackedEntry(state, context, path);

    const callId = ++this.callId;
    const start: ModeledMutationEvent = {
      tick: ++this.tick,
      callId,
      context,
      phase: 'start',
      method,
      path,
      required: entry?.required ?? false,
      contributesToOrdering: entry?.contributesToOrdering ?? false,
    };
    this.events.push(start);
    this.inFlight += 1;

    if (context === 'second' && entry?.contributesToOrdering === true) {
      state.secondOrderingStarted = true;
      if (state.gateCallId !== null) this.releaseGate(state, 'overlap');
    }
    if (context === 'first' && path === state.plan.gatePath && state.gateCallId === null) {
      state.gateCallId = callId;
      state.reached.resolve();
      if (state.secondOrderingStarted) {
        this.releaseGate(state, 'overlap');
      } else {
        state.timer = setTimeout(() => this.releaseGate(state, 'timeout'), state.plan.timeoutMs);
      }
      await state.release.promise;
    }

    try {
      await operation();
      const commit: ModeledMutationEvent = { ...start, tick: ++this.tick, phase: 'commit' };
      this.events.push(commit);
      this.captureCommitSnapshot(state, commit);
    } catch (error) {
      this.events.push({ ...start, tick: ++this.tick, phase: 'reject' });
      throw error;
    } finally {
      this.inFlight -= 1;
    }
  }

  private captureCommitSnapshot(state: ArmedState, event: ModeledMutationEvent): void {
    void state;
    const files = new Map<string, Uint8Array | null>(this.backing.snapshotAll());
    this.pendingSnapshots.push(Promise.resolve({ tick: event.tick, event, files }));
  }

  private releaseGate(state: ArmedState, mode: ModeledGateRelease): void {
    if (state.releaseMode !== null) return;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;
    state.releaseMode = mode;
    state.release.resolve();
  }

  private async finish(state: ArmedState): Promise<ModeledGateObservation> {
    if (state !== this.armed) throw new Error('modeled transaction gate is no longer active');
    if (state.finished) throw new Error('modeled transaction gate was already finished');
    state.finished = true;
    if (state.timer !== null) clearTimeout(state.timer);
    state.timer = null;

    const snapshots = await Promise.all(this.pendingSnapshots);
    const scenarioEvents = this.events.filter((event) =>
      event.context === 'first' || event.context === 'second');
    const commitsFor = (context: 'first' | 'second') => new Set(
      scenarioEvents
        .filter((event) => event.context === context && event.phase === 'commit')
        .map((event) => event.path),
    );
    const firstCommits = commitsFor('first');
    const secondCommits = commitsFor('second');
    const missingRequired = {
      first: state.plan.first.filter((entry) => entry.required && !firstCommits.has(entry.path)).map((entry) => entry.path),
      second: state.plan.second.filter((entry) => entry.required && !secondCommits.has(entry.path)).map((entry) => entry.path),
    };
    const gateStart = scenarioEvents.find((event) =>
      event.callId === state.gateCallId && event.phase === 'start')?.tick ?? null;
    const gateCommit = scenarioEvents.find((event) =>
      event.callId === state.gateCallId && event.phase === 'commit')?.tick ?? null;
    const firstCommitTicks = scenarioEvents
      .filter((event) =>
        event.context === 'first' &&
        event.phase === 'commit' &&
        event.contributesToOrdering)
      .map((event) => event.tick);
    const secondStartTicks = scenarioEvents
      .filter((event) =>
        event.context === 'second' &&
        event.phase === 'start' &&
        event.contributesToOrdering)
      .map((event) => event.tick);
    const lastFirstCommit = firstCommitTicks.length === 0 ? null : Math.max(...firstCommitTicks);
    const firstSecondStart = secondStartTicks.length === 0 ? null : Math.min(...secondStartTicks);
    const serialized =
      lastFirstCommit !== null &&
      firstSecondStart !== null &&
      lastFirstCommit < firstSecondStart;

    return {
      releaseMode: state.releaseMode,
      gateStart,
      gateCommit,
      lastFirstCommit,
      firstSecondStart,
      serialized,
      missingRequired,
      inFlight: this.inFlight,
      events: [...scenarioEvents],
      snapshots,
    };
  }
}
