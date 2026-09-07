import { describe, expect, it } from 'vitest';
import {
  nativeCollaborationConflictMessageV1,
  nativeCollaborationOperationErrorMessageV1,
} from '../../src/nativeGs/collaborationUi';

describe('native collaboration UI messages', () => {
  it('explains unsupported saved state without exposing the internal error', () => {
    const message = nativeCollaborationOperationErrorMessageV1(
      new Error('native collaboration: unsupported Project state changed after the fixed baseline'),
    );
    expect(message).toContain('共同編集の対象外');
    expect(message).toContain('基準は自動更新していません');
    expect(message).toContain('以前の完全バックアップがある場合だけ');
    expect(message).toContain('元プロジェクトへ共同編集として統合はできません');
    expect(message).not.toContain('Project state');
  });

  it.each([
    ['native collaboration export: fixed baseline is missing', '固定基準がない'],
    ['native collaboration: Project has no fixed baseline', '固定基準がない'],
    ['native collaboration: baseline lineage does not match the Project', '別のプロジェクト'],
    ['native collaboration: baseline ID does not match its canonical content', '固定基準を検証できません'],
    ['native collaboration: baseline media is missing or changed in the current Project', 'メディアが不足または変更'],
  ])('maps a collaboration validation failure to actionable Japanese: %s', (internal, expected) => {
    const message = nativeCollaborationOperationErrorMessageV1(new Error(internal));
    expect(message).toContain(expected);
    expect(message).not.toBe(internal);
  });

  it('states that a same-field winner is not selected automatically', () => {
    const message = nativeCollaborationConflictMessageV1({
      code: 'caption-field-conflict', message: 'internal detail',
    });
    expect(message).toContain('勝者を自動選択していません');
    expect(message).not.toContain('internal detail');
  });
});
