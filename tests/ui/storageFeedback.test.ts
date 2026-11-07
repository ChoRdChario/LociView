import {describe,it,expect} from 'vitest';
import {storageFailureText} from '../../src/ui/projectScene/storageFeedback';
import {MetadataSourceError} from '../../src/projectMetadata/format';

describe('storage recovery feedback',()=>{
  it('identifies real native quota while warning that deleting site data destroys restart data',()=>{
    const message=storageFailureText(new DOMException('browser-specific quota text','QuotaExceededError'))!;
    expect(message).toContain('保存容量が不足');expect(message).toContain('再試行');expect(message).toContain('再開用データも消えます');
  });
  it('distinguishes the existing work-data inspection budget from physical quota and corruption',()=>{
    expect(storageFailureText(new MetadataSourceError('output-space-budget'))).toContain('端末の空き容量とは別');
    expect(storageFailureText(new MetadataSourceError('output-artifact-mismatch'))).toBeUndefined();
    expect(storageFailureText(new MetadataSourceError('output-space-read'))).toBeUndefined();
    expect(storageFailureText(Error('QuotaExceededError: output-space-budget'))).toBeUndefined();
  });
  it('keeps combined cleanup failure visible instead of reducing it to a quota message',()=>{
    const quota=new DOMException('full','QuotaExceededError'),combined=new AggregateError([quota,Error('cleanup denied')],'一時ファイルの解放に失敗しました。');
    expect(storageFailureText(combined)).toBeUndefined();expect(combined.errors).toContain(quota);
  });
});
