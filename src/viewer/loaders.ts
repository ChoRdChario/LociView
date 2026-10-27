import { loadCurrentModel, disposeModelResources, type LoadDeps, type LoadedModel, type ModelFormat } from './modelLoader';
import { readOwnedLegacyModelTargets, modelInputKey } from './compat180/proof';
import { snapshotTargets, assertTargetTables } from './compat180/sceneProof';

export type { ModelFormat, MaterialEntry, ModelStats, LoadedModel, LoadDeps, GltfTexturePolicy } from './modelLoader';
export { detectFormat, disposeModelResources, disposeMaterialResources, uploadModelTexturesAndReleaseBitmaps,
  decodeImageBitmapWithinMaxEdge } from './modelLoader';

/** One owned source/options snapshot; legacy objects are gone before main decode. */
export async function loadModel(format: ModelFormat, bytes: Uint8Array, deps: LoadDeps = {}): Promise<LoadedModel> {
  const owned = {bytes:bytes.slice(),deps:{...deps,...(deps.gltfTextures?{gltfTextures:{...deps.gltfTextures}}:{})}};
  const old = await readOwnedLegacyModelTargets(format, owned.bytes, owned.deps);
  owned.deps.signal?.throwIfAborted();
  const current = await loadCurrentModel(format, owned.bytes, owned.deps);
  try { owned.deps.signal?.throwIfAborted(); if(old.inputKey!==modelInputKey(format,owned.bytes,owned.deps))throw Error('元のモデル入力が変更されました。');
    assertTargetTables(old.table, snapshotTargets(current.root, old.table.rows)); return current; }
  catch(error) { disposeModelResources(current.root); throw error; }
}
