import { describe, expect, it, vi } from 'vitest';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { createTestAttemptControl } from '../../scripts/fixtures/acquisition/attempt.mjs';
// @ts-expect-error Checked ESM scripts intentionally have no declaration files.
import { AcquisitionError } from '../../scripts/fixtures/acquisition/errors.mjs';

describe('Mode-B monotonic attempt control', () => {
  it('makes the overall deadline win before another failure is fixed', () => {
    let now = 0;
    const control = createTestAttemptControl({
      overallMs: 10,
      now: () => now,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    now = 10;
    expect(control.fix(new AcquisitionError('E_LOCAL_IO'))).toMatchObject({
      code: 'E_OVERALL_TIMEOUT',
    });
    expect(() => control.checkpoint()).toThrow(/E_OVERALL_TIMEOUT/u);
    control.close();
  });

  it('preserves the first fixed error across later timeout and cleanup failures', () => {
    let now = 0;
    const control = createTestAttemptControl({
      overallMs: 10,
      now: () => now,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    expect(control.fix(new AcquisitionError('E_DIGEST_MISMATCH'))).toMatchObject({
      code: 'E_DIGEST_MISMATCH',
    });
    now = 100;
    expect(control.fix(new AcquisitionError('E_RECEIPT_IO'))).toMatchObject({
      code: 'E_DIGEST_MISMATCH',
    });
    control.close();
  });

  it('checks both sides of an await and aborts downstream work at expiry', async () => {
    let now = 0;
    const control = createTestAttemptControl({
      overallMs: 10,
      now: () => now,
      setTimer: () => 1,
      clearTimer: () => undefined,
    });
    await expect(control.run(async () => {
      now = 10;
      return 'late';
    })).rejects.toMatchObject({ code: 'E_OVERALL_TIMEOUT' });
    expect(control.signal.aborted).toBe(true);
    control.close();
  });

  it('lets an admitted receipt commit cross the deadline without cancellation', () => {
    let now = 0;
    const clear = vi.fn();
    const control = createTestAttemptControl({
      overallMs: 10,
      now: () => now,
      setTimer: () => 7,
      clearTimer: clear,
    });
    const token = control.enterReceiptCommit();
    now = 100;
    expect(() => control.checkpoint()).not.toThrow();
    control.markCommitted(token);
    expect(control.committed).toBe(true);
    expect(clear).toHaveBeenCalledWith(7);
    control.close();
  });

  it('does not let a cancellation interrupt an admitted receipt commit', () => {
    const external = new AbortController();
    const control = createTestAttemptControl({
      overallMs: 10,
      setTimer: () => 1,
      clearTimer: () => undefined,
      externalSignal: external.signal,
    });
    const token = control.enterReceiptCommit();
    external.abort();
    expect(() => control.checkpoint()).not.toThrow();
    control.markCommitted(token);
    control.close();
  });

  it('maps explicit cancellation once and never lets it replace a prior error', () => {
    const external = new AbortController();
    const control = createTestAttemptControl({
      overallMs: 100,
      setTimer: () => 1,
      clearTimer: () => undefined,
      externalSignal: external.signal,
    });
    external.abort();
    expect(() => control.checkpoint()).toThrow(/E_CANCELLED/u);
    expect(control.fix(new AcquisitionError('E_LOCAL_IO'))).toMatchObject({ code: 'E_CANCELLED' });
    control.close();
  });
});
