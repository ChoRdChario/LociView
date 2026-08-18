import { MemoryFS } from '../../src/platform/fs';

export type FaultMethod = 'appendText' | 'writeBytes';

interface ArmedFault {
  method: FaultMethod;
  path: string;
  message: string;
}

/** Deterministic one-shot I/O failure injector for durability characterization tests. */
export class FaultInjectingMemoryFS extends MemoryFS {
  private fault: ArmedFault | null = null;

  failNext(
    method: FaultMethod,
    path: string,
    message = `injected ${method} failure`,
  ): void {
    if (this.fault !== null) throw new Error(`fault already armed for ${this.fault.method} ${this.fault.path}`);
    this.fault = { method, path, message };
  }

  assertAllConsumed(): void {
    if (this.fault !== null) throw new Error(`unconsumed fault for ${this.fault.method} ${this.fault.path}`);
  }

  private maybeThrow(method: FaultMethod, path: string): void {
    const fault = this.fault;
    if (fault === null || fault.method !== method || fault.path !== path) return;
    this.fault = null;
    throw new Error(fault.message);
  }

  override async appendText(path: string, text: string): Promise<void> {
    this.maybeThrow('appendText', path);
    await super.appendText(path, text);
  }

  override async writeBytes(path: string, data: Uint8Array): Promise<void> {
    this.maybeThrow('writeBytes', path);
    await super.writeBytes(path, data);
  }
}
