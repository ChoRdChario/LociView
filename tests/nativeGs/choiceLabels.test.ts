import { describe, expect, it } from 'vitest';
import { nativeChoiceLabelsByIdV1 } from '../../src/nativeGs/choiceLabels';

describe('native choice labels', () => {
  it('adds stable human ordinals only when exact names collide', () => {
    const labels = nativeChoiceLabelsByIdV1([
      { id: 'a', name: '記録' },
      { id: 'b', name: '確認' },
      { id: 'c', name: '記録' },
    ]);
    expect([...labels]).toEqual([
      ['a', '記録（同名 1/2）'],
      ['b', '確認'],
      ['c', '記録（同名 2/2）'],
    ]);
  });
});
