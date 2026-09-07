import { describe, expect, it } from 'vitest';
import { nativeExportStagePathV1 } from '../../src/nativeGs/exportStaging';
import { NATIVE_TEST_IDS, testNativeId } from './nativeTestProject';

describe('native fallback export staging ownership', () => {
  it('uses an attempt token so two windows cannot overwrite or clean up each other', () => {
    const first = nativeExportStagePathV1(
      NATIVE_TEST_IDS.project, testNativeId('snp', 1), 'review', '0'.repeat(32),
    );
    const second = nativeExportStagePathV1(
      NATIVE_TEST_IDS.project, testNativeId('snp', 1), 'review', '1'.repeat(32),
    );
    expect(first).not.toBe(second);
    expect(first).toContain('-review-');
    expect(() => nativeExportStagePathV1(
      '../foreign', testNativeId('snp', 1), 'backup', '0'.repeat(32),
    )).toThrow(/識別子/);
  });
});
