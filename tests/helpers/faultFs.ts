import { MemoryFS } from '../../src/platform/fs';

export type FaultMethod = 'appendText' | 'appendBytes' | 'writeText' | 'writeBytes' | 'remove';

export type FaultSelector = FaultMethod | 'write';

export type FaultOutcome = 'throw-before' | 'write-prefix-then-throw' | 'commit-then-throw';

export interface FaultEvent {
  startIndex: number;
  commitIndex: number | null;
  method: FaultMethod;
  path: string;
  outcome: 'pass' | FaultOutcome;
}

export interface FaultTextSnapshot {
  token: string;
  eventStartIndex: number;
  text: string | null;
}

export interface FaultFileSnapshot {
  token: string;
  eventIndex: number;
  files: ReadonlyMap<string, Uint8Array | null>;
}

interface TextWatch {
  token: string;
  method: FaultMethod;
  path: string;
  snapshotPath: string;
}

interface FileWatch {
  token: string;
  path: string;
  snapshotPaths: readonly string[];
}

interface ArmedFault {
  method: FaultSelector;
  path: string;
  message: string;
  outcome: FaultOutcome;
  prefixBytes?: number;
}

const encoder = new TextEncoder();

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

/** Deterministic one-shot I/O failure injector for durability characterization tests. */
export class FaultInjectingMemoryFS extends MemoryFS {
  readonly events: FaultEvent[] = [];
  readonly textSnapshots: FaultTextSnapshot[] = [];
  readonly fileSnapshots: FaultFileSnapshot[] = [];
  private fault: ArmedFault | null = null;
  private readonly textWatches: TextWatch[] = [];
  private readonly fileWatches: FileWatch[] = [];
  private readonly pendingProbes: Promise<void>[] = [];
  private eventIndex = 0;

  failNext(
    method: FaultMethod,
    path: string,
    message = `injected ${method} failure`,
  ): void {
    this.arm(method, path, message, 'throw-before');
  }

  failNextAfterCommit(
    method: FaultMethod,
    path: string,
    message = `injected ${method} commit-then-throw failure`,
  ): void {
    this.arm(method, path, message, 'commit-then-throw');
  }

  failNextAfterPrefix(
    method: Exclude<FaultMethod, 'remove'>,
    path: string,
    prefixBytes: number,
    message = `injected ${method} prefix-write failure`,
  ): void {
    if (!Number.isSafeInteger(prefixBytes) || prefixBytes < 1) {
      throw new Error('prefixBytes must be a positive safe integer');
    }
    this.arm(method, path, message, 'write-prefix-then-throw', prefixBytes);
  }

  failNextWrite(path: string, message = 'injected write failure'): void {
    this.arm('write', path, message, 'throw-before');
  }

  failNextWriteAfterCommit(
    path: string,
    message = 'injected write commit-then-throw failure',
  ): void {
    this.arm('write', path, message, 'commit-then-throw');
  }

  failNextWriteAfterPrefix(
    path: string,
    prefixBytes: number,
    message = 'injected write prefix-write failure',
  ): void {
    if (!Number.isSafeInteger(prefixBytes) || prefixBytes < 1) {
      throw new Error('prefixBytes must be a positive safe integer');
    }
    this.arm('write', path, message, 'write-prefix-then-throw', prefixBytes);
  }

  assertAllConsumed(): void {
    if (this.fault !== null) throw new Error(`unconsumed fault for ${this.fault.method} ${this.fault.path}`);
  }

  discardPendingFault(): boolean {
    const pending = this.fault !== null;
    this.fault = null;
    return pending;
  }

  watchTextAtStart(
    token: string,
    method: FaultMethod,
    path: string,
    snapshotPath: string,
  ): void {
    if (token === '' || path === '' || snapshotPath === '') {
      throw new Error('text watch token and paths must not be empty');
    }
    if (this.textWatches.some((watch) => watch.token === token)) {
      throw new Error(`duplicate text watch token: ${token}`);
    }
    this.textWatches.push({ token, method, path, snapshotPath });
  }

  watchFilesAfterCommit(token: string, path: string, snapshotPaths: readonly string[]): void {
    this.validateFileProbe(token, snapshotPaths);
    this.fileWatches.push({ token, path, snapshotPaths: [...snapshotPaths] });
  }

  markFiles(token: string, snapshotPaths: readonly string[]): number {
    this.validateFileProbe(token, snapshotPaths);
    const eventIndex = ++this.eventIndex;
    this.captureFiles(token, eventIndex, snapshotPaths);
    return eventIndex;
  }

  async settleProbes(): Promise<void> {
    const pending = this.pendingProbes.splice(0);
    await Promise.all(pending);
  }

  private validateFileProbe(token: string, snapshotPaths: readonly string[]): void {
    if (token === '' || snapshotPaths.length === 0 || snapshotPaths.some((path) => path === '')) {
      throw new Error('file probe token and paths must not be empty');
    }
    if (
      this.fileWatches.some((watch) => watch.token === token) ||
      this.fileSnapshots.some((snapshot) => snapshot.token === token)
    ) {
      throw new Error(`duplicate file probe token: ${token}`);
    }
  }

  private captureFiles(token: string, eventIndex: number, snapshotPaths: readonly string[]): void {
    const pendingReads = snapshotPaths.map((path) => ({ path, bytes: super.readBytes(path) }));
    this.pendingProbes.push((async () => {
      const files = new Map<string, Uint8Array | null>();
      for (const pending of pendingReads) files.set(pending.path, await pending.bytes);
      this.fileSnapshots.push({ token, eventIndex, files });
    })());
  }

  private arm(
    method: FaultSelector,
    path: string,
    message: string,
    outcome: FaultOutcome,
    prefixBytes?: number,
  ): void {
    if (this.fault !== null) throw new Error(`fault already armed for ${this.fault.method} ${this.fault.path}`);
    this.fault = { method, path, message, outcome, ...(prefixBytes === undefined ? {} : { prefixBytes }) };
  }

  private matchesFault(fault: ArmedFault, method: FaultMethod, path: string): boolean {
    return fault.path === path && (fault.method === method || (fault.method === 'write' && method !== 'remove'));
  }

  private async mutate(
    method: FaultMethod,
    path: string,
    operation: () => Promise<void>,
    prefixOperation?: (prefixBytes: number) => Promise<void>,
  ): Promise<void> {
    const startIndex = ++this.eventIndex;
    const pendingSnapshots = this.textWatches
      .filter((watch) => watch.method === method && watch.path === path)
      .map((watch) => ({ watch, text: super.readText(watch.snapshotPath) }));
    const recordSnapshots = async (): Promise<void> => {
      for (const pending of pendingSnapshots) {
        this.textSnapshots.push({
          token: pending.watch.token,
          eventStartIndex: startIndex,
          text: await pending.text,
        });
      }
    };
    const recordCommittedFiles = (commitIndex: number): void => {
      for (const watch of this.fileWatches.filter((candidate) => candidate.path === path)) {
        this.captureFiles(watch.token, commitIndex, watch.snapshotPaths);
      }
    };
    const fault = this.fault;
    const matches = fault !== null && this.matchesFault(fault, method, path);
    if (matches && fault.outcome === 'throw-before') {
      this.fault = null;
      await recordSnapshots();
      this.events.push({ startIndex, commitIndex: null, method, path, outcome: fault.outcome });
      throw new Error(fault.message);
    }

    if (matches && fault.outcome === 'write-prefix-then-throw') {
      this.fault = null;
      if (prefixOperation === undefined || fault.prefixBytes === undefined) {
        throw new Error(`prefix-write fault is unsupported for ${method}`);
      }
      await prefixOperation(fault.prefixBytes);
      const commitIndex = ++this.eventIndex;
      recordCommittedFiles(commitIndex);
      await recordSnapshots();
      this.events.push({
        startIndex,
        commitIndex,
        method,
        path,
        outcome: fault.outcome,
      });
      throw new Error(fault.message);
    }

    if (matches) this.fault = null;
    await operation();
    const commitIndex = ++this.eventIndex;
    recordCommittedFiles(commitIndex);
    await recordSnapshots();
    const outcome = matches ? fault.outcome : 'pass';
    this.events.push({ startIndex, commitIndex, method, path, outcome });
    if (matches) throw new Error(fault.message);
  }

  override async appendText(path: string, text: string): Promise<void> {
    await this.mutate(
      'appendText',
      path,
      () => super.appendText(path, text),
      async (prefixBytes) => {
        const requested = encoder.encode(text);
        if (prefixBytes >= requested.length) throw new Error('append prefix must be shorter than the request');
        const before = (await super.readBytes(path)) ?? new Uint8Array();
        await super.writeBytes(path, concatBytes(before, requested.slice(0, prefixBytes)));
      },
    );
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await this.mutate(
      'appendBytes',
      path,
      () => super.appendBytes(path, data),
      async (prefixBytes) => {
        if (prefixBytes >= data.length) throw new Error('append prefix must be shorter than the request');
        await super.appendBytes(path, data.slice(0, prefixBytes));
      },
    );
  }

  override async writeText(path: string, text: string): Promise<void> {
    await this.mutate(
      'writeText',
      path,
      () => super.writeText(path, text),
      async (prefixBytes) => {
        const requested = encoder.encode(text);
        if (prefixBytes >= requested.length) throw new Error('text prefix must be shorter than the request');
        await super.writeBytes(path, requested.slice(0, prefixBytes));
      },
    );
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.mutate(
      'writeBytes',
      path,
      () => super.writeBytes(path, data),
      async (prefixBytes) => {
        if (prefixBytes >= data.length) throw new Error('byte prefix must be shorter than the request');
        await super.writeBytes(path, data.slice(0, prefixBytes));
      },
    );
  }

  override async remove(path: string): Promise<void> {
    await this.mutate('remove', path, () => super.remove(path));
  }
}
