import * as A from '@automerge/automerge/slim';
import wasmUrl from '@automerge/automerge/automerge.wasm?url';
import { createVerifiedDevelopmentPair } from './development-verified';
import type { WorkingHistoryFactory } from '../../src/harness/projectScene/historyPort';

/** Invoked only by the serve-only, explicit development entry. Uses the existing local candidate. */
export async function loadDevelopmentHistory(): Promise<WorkingHistoryFactory> {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw new Error('開発用の更新エンジンを読み込めません。再読み込みしてください。');
  await A.initializeWasm(new Uint8Array(await response.arrayBuffer()));
  const pair = await createVerifiedDevelopmentPair(A);
  return () => pair;
}
