import { afterEach, expect, it, vi } from 'vitest';
import { createCaptionAutosave } from '../../src/ui/projectScene/captionAutosave';

afterEach(() => vi.useRealTimers());
function setup() {
  let text = '', saved = '', composing = false, release: (() => void) | undefined, failure = false;
  const submitted: string[] = [], retried: string[] = [];
  let retained = '';
  const drain = createCaptionAutosave({
    hasInput: () => text !== saved,
    composing: () => composing,
    async saveNext() {
      const plan = text; submitted.push(plan); retained = plan;
      await new Promise<void>(resolve => { release = resolve; });
      if (failure) return 'failed';
      saved = plan; return 'saved';
    },
    async retry() { retried.push(retained); if (failure) return false; saved = retained; return true; },
    changed() {},
  });
  return { drain, submitted, retried, input(value: string) { text = value; drain.changed(); },
    compose(value: boolean) { composing = value; drain.changed(); }, fail(value: boolean) { failure = value; },
    release() { release!(); }, saved: () => saved };
}
it('coalesces typing pauses, serializes saves and keeps the latest revision after an older acknowledgment', async () => {
  vi.useFakeTimers(); const h = setup();
  h.input('a'); await vi.advanceTimersByTimeAsync(300); h.input('ab');
  await vi.advanceTimersByTimeAsync(599); expect(h.submitted).toEqual([]);
  await vi.advanceTimersByTimeAsync(1); expect(h.submitted).toEqual(['ab']);
  h.input('abc'); h.input('abcd'); const done = h.drain.flush(); h.release();
  await vi.advanceTimersByTimeAsync(0); expect(h.submitted).toEqual(['ab', 'abcd']);
  h.release(); expect(await done).toBe(true); expect(h.saved()).toBe('abcd');
  await vi.advanceTimersByTimeAsync(2000); expect(h.submitted).toHaveLength(2);
  await h.drain.dispose();
});
it('never writes during composition or automatically retries a failed immutable plan', async () => {
  vi.useFakeTimers(); const h = setup(); h.compose(true); h.input('入力中');
  await vi.advanceTimersByTimeAsync(1000); expect(await h.drain.flush()).toBe(false); expect(h.submitted).toEqual([]);
  h.compose(false); h.fail(true); const first = h.drain.flush(); await vi.advanceTimersByTimeAsync(0); h.release();
  expect(await first).toBe(false); h.input('新しい入力'); await vi.advanceTimersByTimeAsync(2000);
  expect(h.submitted).toEqual(['入力中']); expect(await h.drain.flush()).toBe(false);
  h.fail(false); const retry = h.drain.retry(); await vi.advanceTimersByTimeAsync(0);
  expect(h.retried).toEqual(['入力中']); expect(h.submitted).toEqual(['入力中', '新しい入力']);
  h.release(); expect(await retry).toBe(true); expect(h.saved()).toBe('新しい入力'); await h.drain.dispose();
});
it('disposal waits for the started save and prevents a newer draft from dispatching', async () => {
  vi.useFakeTimers(); const h = setup(); h.input('確定する変更');
  const work = h.drain.flush(); await vi.advanceTimersByTimeAsync(0); h.input('未確定');
  const closed = h.drain.dispose(); h.release(); await closed; expect(await work).toBe(false);
  expect(h.submitted).toEqual(['確定する変更']); expect(h.saved()).toBe('確定する変更');
});
