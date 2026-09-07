import { describe, expect, it } from 'vitest';
import {
  nativeImportDisclosureV1,
  sameNativeImportInspectionV1,
  type NativeImportInspectionIdentityV1,
  type NativeImportPurposeV1,
} from '../../src/nativeGs/importPreflight';

describe('Native incoming-file disclosure', () => {
  it.each([
    ['backup', false, 'LociViewの完全バックアップ', 'この端末に復元', 'restore'],
    ['collaboration', false, 'LociViewの共同編集用ファイル', '復元して編集', 'restore'],
    ['collaboration', true, 'LociViewの共同編集用ファイル', '対象プロジェクトを編集して開く', 'open-existing'],
    ['review', false, 'LociViewの閲覧共有用ファイル', '復元して閲覧', 'restore'],
    ['cleanCopy', false, 'LociViewの編集用コピー', '別のプロジェクトとして編集', 'restore'],
  ] as const)('distinguishes %s (existing=%s) before action', (purpose, exists, detected, label, action) => {
    const disclosure = nativeImportDisclosureV1(purpose, exists);
    expect(disclosure).toMatchObject({ detected, confirmLabel: label, action });
    expect(disclosure.sourceTreatment).toBe('選択したファイルは変更しません。');
  });

  it('invalidates a confirmation if any inspected identity or byte scope changes', () => {
    const base: NativeImportInspectionIdentityV1 = {
      purpose: 'review', projectId: 'prj_1', snapshotId: 'snp_1', generation: 3,
      manifestIdentity: '{"validated":true}',
      representationByteLength: 12, mediaByteLength: 4,
    };
    expect(sameNativeImportInspectionV1(base, { ...base })).toBe(true);
    const changes: Array<Partial<NativeImportInspectionIdentityV1>> = [
      { purpose: 'backup' as NativeImportPurposeV1 }, { projectId: 'prj_2' },
      { snapshotId: 'snp_2' }, { generation: 4 },
      { manifestIdentity: '{"validated":false}' },
      { representationByteLength: 13 }, { mediaByteLength: 5 },
    ];
    for (const change of changes) expect(sameNativeImportInspectionV1(base, { ...base, ...change })).toBe(false);
  });
});
