import {describe,it,expect} from 'vitest';
import {failurePresentation,metadataFailureText,storageFailureText} from '../../src/ui/projectScene/storageFeedback';
import {MetadataSourceError} from '../../src/projectMetadata/format';

describe('storage recovery feedback',()=>{
  it('keeps technical causes inspectable while preserving native classification and useful Japanese instructions',()=>{
    const fallback='処理を完了できません。再試行してください。';
    expect(failurePresentation(Error('WebGL context lost'),fallback)).toEqual({message:fallback,diagnostic:'WebGL context lost'});
    const wrapped='3D表示を停止しました。THREE.WebGLRenderer: Error creating WebGL context. 編集内容は保持しています。';
    expect(failurePresentation(wrapped,fallback)).toEqual({message:fallback,diagnostic:wrapped});
    expect(failurePresentation(Error('元のファイルを選び直してください。'),fallback)).toEqual({message:'元のファイルを選び直してください。'});
    expect(failurePresentation(new DOMException('browser quota','QuotaExceededError'),fallback).message).toContain('保存容量が不足');
    expect(failurePresentation(Error('QuotaExceededError'),fallback)).toEqual({message:fallback,diagnostic:'QuotaExceededError'});
    const combined=new AggregateError([new DOMException('full','QuotaExceededError'),Error('cleanup denied')],'一時ファイルの解放に失敗しました。');
    const shown=failurePresentation(combined,fallback);expect(shown.message).toBe(combined.message);expect(shown.diagnostic).toContain('cleanup denied');
  });
  it('explains unprepared recovery and unreadable receipts without claiming repair or masking other errors',()=>{
    expect(metadataFailureText(new MetadataSourceError('incomplete-staging-repair').message)).toContain('再開できません');
    expect(metadataFailureText(new MetadataSourceError('receipt-invalid').message)).toContain('データは削除しない');
    expect(metadataFailureText(new MetadataSourceError('receipt-read').message)).toContain('処理を停止');
    expect(metadataFailureText(new MetadataSourceError('receipt-readback').message)).toBeUndefined();
    expect(metadataFailureText('receipt-invalid')).toBeUndefined();
    expect(metadataFailureText(undefined)).toBeUndefined();
  });
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
