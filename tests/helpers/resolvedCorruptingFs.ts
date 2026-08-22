import { FaultInjectingMemoryFS } from './faultFs';

export type ResolvedCorruptionMode = 'bitflip' | 'truncate';
export type ResolvedCorruptionTarget = string | ((path: string) => boolean);
const encoder = new TextEncoder();

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function copyNullable(bytes: Uint8Array | null): Uint8Array | null {
  return bytes === null ? null : new Uint8Array(bytes);
}

/**
 * Commits one deterministic wrong-byte result while resolving the write normally.
 * Later exact retries pass through unchanged. Verification reads are recorded only
 * inside the explicit production-action window, after the bad commit and before an
 * exact retry; helper probes and final assertions therefore cannot satisfy the oracle.
 */
export class ResolvedCorruptingMemoryFS extends FaultInjectingMemoryFS {
  private readonly expected: Uint8Array;
  private readonly target: ResolvedCorruptionTarget;
  private selectedTargetPath: string | null;
  private actionActive = false;
  private corruptionCommitted = false;
  private exactRetryCommitted = false;
  private readonly requestedWriteCopies: Uint8Array[] = [];
  private readonly verificationReadCopies: Array<Uint8Array | null> = [];

  injectionCount = 0;
  corruptBytes: Uint8Array | null = null;

  constructor(
    target: ResolvedCorruptionTarget,
    expectedBytes: Uint8Array,
    readonly mode: ResolvedCorruptionMode,
  ) {
    super();
    if (typeof target === 'string' && target === '') {
      throw new Error('resolved corruption target path must not be empty');
    }
    if (expectedBytes.length < 2) throw new Error('resolved corruption requires at least two bytes');
    this.target = target;
    this.selectedTargetPath = typeof target === 'string' ? target : null;
    this.expected = new Uint8Array(expectedBytes);
  }

  get targetPath(): string | null {
    return this.selectedTargetPath;
  }

  get injectedPath(): string | null {
    return this.corruptionCommitted ? this.selectedTargetPath : null;
  }

  get requestedWrites(): readonly Uint8Array[] {
    return this.requestedWriteCopies;
  }

  get verificationReads(): ReadonlyArray<Uint8Array | null> {
    return this.verificationReadCopies;
  }

  beginAction(): void {
    if (this.actionActive) throw new Error('resolved corruption action is already active');
    this.actionActive = true;
  }

  endAction(): void {
    if (!this.actionActive) throw new Error('resolved corruption action is not active');
    this.actionActive = false;
  }

  private async writeAttempt(
    path: string,
    data: Uint8Array,
    commit: (bytes: Uint8Array) => Promise<void>,
  ): Promise<void> {
    if (
      this.actionActive &&
      this.selectedTargetPath === null &&
      typeof this.target === 'function' &&
      this.target(path) &&
      bytesEqual(data, this.expected)
    ) {
      this.selectedTargetPath = path;
    }
    if (
      !this.actionActive ||
      path !== this.selectedTargetPath ||
      !bytesEqual(data, this.expected) ||
      this.exactRetryCommitted
    ) {
      await commit(data);
      return;
    }

    this.requestedWriteCopies.push(new Uint8Array(data));
    if (this.injectionCount === 0) {
      const corrupt = this.mode === 'bitflip'
        ? Uint8Array.from(data, (value, index) => index === 0 ? value ^ 0xff : value)
        : data.slice(0, data.length - 1);
      this.injectionCount = 1;
      this.corruptBytes = new Uint8Array(corrupt);
      await commit(corrupt);
      this.corruptionCommitted = true;
      return;
    }

    await commit(data);
    this.exactRetryCommitted = true;
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    await this.writeAttempt(path, data, (bytes) => super.writeBytes(path, bytes));
  }

  override async writeText(path: string, text: string): Promise<void> {
    await this.writeAttempt(path, encoder.encode(text), (bytes) => super.writeBytes(path, bytes));
  }

  override async appendBytes(path: string, data: Uint8Array): Promise<void> {
    await this.writeAttempt(path, data, (bytes) => super.appendBytes(path, bytes));
  }

  override async appendText(path: string, text: string): Promise<void> {
    await this.writeAttempt(path, encoder.encode(text), (bytes) => super.appendBytes(path, bytes));
  }

  override async readBytes(path: string): Promise<Uint8Array | null> {
    const bytes = await super.readBytes(path);
    if (
      path === this.selectedTargetPath &&
      this.actionActive &&
      this.corruptionCommitted &&
      !this.exactRetryCommitted
    ) {
      this.verificationReadCopies.push(copyNullable(bytes));
    }
    return bytes;
  }
}
