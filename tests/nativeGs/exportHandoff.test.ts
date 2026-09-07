import { describe, expect, it } from 'vitest';
import {
  buildNativeExportHandoffUrlV1,
  clearNativeExportHandoffV1,
  resolveNativeExportHandoffV1,
  type NativeExportIntentV1,
} from '../../src/nativeGs/exportHandoff';
import { NATIVE_TEST_IDS, testNativeId } from './nativeTestProject';

describe('native export one-shot handoff', () => {
  const available = new Set([NATIVE_TEST_IDS.project]);

  it('round-trips all four explicit purposes with a DisplaySet only for review', () => {
    const intents: NativeExportIntentV1[] = [
      { projectId: NATIVE_TEST_IDS.project, purpose: 'backup' },
      { projectId: NATIVE_TEST_IDS.project, purpose: 'collaboration' },
      { projectId: NATIVE_TEST_IDS.project, purpose: 'cleanCopy' },
      { projectId: NATIVE_TEST_IDS.project, purpose: 'review', reviewDisplaySetId: testNativeId('set', 2) },
    ];
    for (const intent of intents) {
      const url = buildNativeExportHandoffUrlV1('https://example.test/LociView/?mode=native-gs', intent);
      expect(url.pathname).toBe('/LociView/');
      expect(url.searchParams.has('mode')).toBe(false);
      expect(resolveNativeExportHandoffV1(url.search, available)).toEqual({ kind: 'ready', intent });
      expect(resolveNativeExportHandoffV1(clearNativeExportHandoffV1(url).search, available)).toEqual({ kind: 'none' });
    }
  });

  it('rejects duplicate, missing, extra and unavailable targets', () => {
    expect(resolveNativeExportHandoffV1(
      `?exportProject=${NATIVE_TEST_IDS.project}&exportProject=${NATIVE_TEST_IDS.project}&exportPurpose=backup`, available,
    ).kind).toBe('invalid');
    expect(resolveNativeExportHandoffV1(
      `?exportProject=${NATIVE_TEST_IDS.project}&exportPurpose=review`, available,
    ).kind).toBe('invalid');
    expect(resolveNativeExportHandoffV1(
      `?exportProject=${NATIVE_TEST_IDS.project}&exportPurpose=backup&exportDisplaySet=${testNativeId('set', 2)}`, available,
    ).kind).toBe('invalid');
    expect(resolveNativeExportHandoffV1(
      `?exportProject=${testNativeId('prj', 99)}&exportPurpose=backup`, available,
    ).kind).toBe('invalid');
  });
});
