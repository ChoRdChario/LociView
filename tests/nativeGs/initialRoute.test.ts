import { describe, expect, it } from 'vitest';
import { resolveNativeInitialProjectRoute } from '../../src/nativeGs/initialRoute';

const PROJECT_A = 'prj_01K00000000000000000000000';

describe('native one-shot initial Project route', () => {
  it('opens only an exact validated list member with an explicit session mode', () => {
    const available = new Set([PROJECT_A]);
    expect(resolveNativeInitialProjectRoute(
      `?mode=native-gs&project=${PROJECT_A}&session=edit`,
      available,
    )).toEqual({ kind: 'open', projectId: PROJECT_A, mode: 'edit' });
    expect(resolveNativeInitialProjectRoute(
      `?mode=native-gs&project=${PROJECT_A}&session=view`,
      available,
    )).toEqual({ kind: 'open', projectId: PROJECT_A, mode: 'view' });
  });

  it('does not turn missing, duplicate, invalid or unknown URL values into an open path', () => {
    const available = new Set([PROJECT_A]);
    expect(resolveNativeInitialProjectRoute('?mode=native-gs', available)).toEqual({ kind: 'none' });
    for (const search of [
      `?project=${PROJECT_A}`,
      `?project=${PROJECT_A}&session=admin`,
      '?project=../../projects/victim&session=edit',
      `?project=${PROJECT_A}&project=${PROJECT_A}&session=edit`,
    ]) {
      expect(resolveNativeInitialProjectRoute(search, available).kind).toBe('invalid');
    }
  });
});
