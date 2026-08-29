export interface NativeBeforeUnloadTarget {
  addEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
  removeEventListener(type: 'beforeunload', listener: (event: BeforeUnloadEvent) => void): void;
}

export class NativeUnsavedChangesGuard {
  private dirty = false;
  private listening = false;

  constructor(private readonly target: NativeBeforeUnloadTarget) {}

  get isDirty(): boolean {
    return this.dirty;
  }

  markDirty(): void {
    if (this.dirty) return;
    this.dirty = true;
    this.target.addEventListener('beforeunload', this.onBeforeUnload);
    this.listening = true;
  }

  clear(): void {
    this.dirty = false;
    this.stopListening();
  }

  async confirmDiscard(confirm: () => Promise<boolean>): Promise<boolean> {
    return !this.dirty || await confirm();
  }

  dispose(): void {
    this.clear();
  }

  private stopListening(): void {
    if (!this.listening) return;
    this.target.removeEventListener('beforeunload', this.onBeforeUnload);
    this.listening = false;
  }

  private readonly onBeforeUnload = (event: BeforeUnloadEvent): void => {
    if (!this.dirty) return;
    event.preventDefault();
    event.returnValue = true;
  };
}
