/** Disposable working-state acknowledgment, never a durable-save receipt. */
export type WorkingResult<T> = T | Promise<T>;
export const afterWorking = <T, R>(result: WorkingResult<T>, done: (value: T) => R): WorkingResult<R> =>
  result instanceof Promise ? result.then(done) : done(result);
export type WorkingWrite = (token: string, changes: Readonly<Record<string, string>>,
  confirmed: () => void, failed: (error: unknown) => void) => boolean;
interface PendingWork { confirmed: () => void; failed: (error: unknown) => void;
  recovery: () => (() => WorkingResult<void>) | undefined }
export class WorkingAcknowledgment {
  private pending: PendingWork | undefined;
  private recovery: (() => WorkingResult<void>) | undefined;
  private listeners = new Set<() => void>();
  state: 'idle' | 'checking' | 'failed' = 'idle';
  error = '';
  get block() { return this.state === 'checking' ? '更新を確認しています。入力を保持しています。' :
    this.state === 'failed' ? '更新を適用できません。入力を保持しています。再試行してください。' : null; }
  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  private notify() { for (const listener of this.listeners) listener(); }
  run(action: () => WorkingResult<unknown>, confirmed: () => void, failed: (error: unknown) => void,
    recovery: PendingWork['recovery']): boolean {
    if (this.pending) { failed(new Error(this.block!)); return false; }
    const work = { confirmed, failed, recovery };
    this.pending = work;
    return this.execute(action, work);
  }
  private execute(action: () => WorkingResult<unknown>, work: PendingWork): boolean {
    this.state = 'checking'; this.error = ''; this.recovery = undefined;
    const succeed = () => {
      // Confirmation may read ordinary UI contexts. Keep the job until it succeeds.
      this.state = 'idle';
      try { work.confirmed(); this.pending = undefined; return true; }
      catch (error) { return reject(error); }
    };
    const reject = (error: unknown) => {
      this.error = error instanceof Error ? error.message : '更新を確認できません。';
      this.recovery = work.recovery();
      this.state = this.recovery ? 'failed' : 'idle';
      if (!this.recovery) this.pending = undefined;
      work.failed(error); return false;
    };
    try {
      const result = action();
      if (result instanceof Promise) {
        void result.then(succeed, reject).then(() => this.notify()); return false;
      }
      return succeed();
    } catch (error) { return reject(error); }
  }
  retry(): boolean {
    if (!this.pending || this.state !== 'failed' || !this.recovery) return false;
    const result = this.execute(this.recovery, this.pending); this.notify(); return result;
  }
}
