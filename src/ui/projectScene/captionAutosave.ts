export interface CaptionAutosaveHost {
  hasInput(): boolean;
  composing(): boolean;
  saveNext(): Promise<'saved' | 'blocked' | 'failed'>;
  retry(): Promise<boolean>;
  changed(): void;
}

/** UI scheduling only. The host retains immutable commands and all write fences. */
export function createCaptionAutosave(host: CaptionAutosaveHost, pause = 600) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<boolean> | undefined;
  let failed = false, disposed = false;

  function cancelTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }
  async function drain(): Promise<boolean> {
    while (!disposed && host.hasInput()) {
      if (host.composing()) return false;
      const result = await host.saveNext();
      if (result === 'failed') failed = true;
      if (result !== 'saved') return false;
    }
    return !disposed;
  }
  function start(retry: boolean): Promise<boolean> {
    cancelTimer();
    if (disposed || host.composing()) return Promise.resolve(false);
    if (active) return active;
    if (failed && !retry) return Promise.resolve(false);
    const work = Promise.resolve().then(async () => {
      if (retry) {
        if (!await host.retry()) return false;
        failed = false;
      }
      return drain();
    });
    active = work;
    host.changed();
    void work.finally(() => {
      if (active === work) active = undefined;
      if (!disposed) host.changed();
    }).catch(() => { /* The caller observes the same failed operation. */ });
    return work;
  }
  return {
    get saving() { return active !== undefined; },
    get failed() { return failed; },
    changed() {
      cancelTimer();
      if (!disposed && !active && !failed && host.hasInput() && !host.composing())
        timer = setTimeout(() => { timer = undefined; void start(false); }, pause);
    },
    flush: () => start(false),
    retry: () => start(true),
    cancel: cancelTimer,
    clearFailure() { if (!active) failed = false; },
    dispose() { disposed = true; cancelTimer(); return active ?? Promise.resolve(true); },
  };
}
