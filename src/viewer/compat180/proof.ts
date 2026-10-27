import { loadModel, disposeModelResources } from './modelRuntime';
import { snapshotTargets, type NeutralTarget, type NeutralTargetTable } from './sceneProof';
import type { ModelFormat, LoadDeps } from '../modelLoader';
import { digestNativeBytes } from '../../nativeGs/sha256';

export function modelInputKey(format:ModelFormat,bytes:Uint8Array,deps:LoadDeps):string {
  return JSON.stringify([format,digestNativeBytes(bytes).sha256,deps.gltfTextures??null,
    deps.mtlText===undefined?null:digestNativeBytes(new TextEncoder().encode(deps.mtlText)).sha256]);
}
interface LegacyModelProof { readonly inputKey:string; readonly table:NeutralTargetTable }

function freezeTargets(rows: readonly NeutralTarget[]): readonly NeutralTarget[] {
  return Object.freeze(rows.map(r => Object.freeze({ ...r, childPath:Object.freeze([...r.childPath]), namePath:Object.freeze([...r.namePath]),
    materialKeys:Object.freeze([...r.materialKeys]), world:Object.freeze([...r.world]) })));
}
/** Actual180 decoding and disposal finish before any neutral result can escape. */
export async function readLegacyModelTargets(format: ModelFormat, bytes: Uint8Array, deps: LoadDeps = {}): Promise<readonly NeutralTarget[]> {
  return (await readLegacyModelProof(format, bytes, deps)).table.rows;
}
export async function readLegacyModelProof(format: ModelFormat, bytes: Uint8Array, deps: LoadDeps = {}): Promise<LegacyModelProof> {
  const ownedBytes=bytes.slice(), ownedDeps:LoadDeps={...deps,...(deps.gltfTextures?{gltfTextures:{...deps.gltfTextures}}:{})};
  return readOwnedLegacyModelTargets(format,ownedBytes,ownedDeps);
}
/** Internal input from the facade's private synchronous capture; never returned. */
export async function readOwnedLegacyModelTargets(format:ModelFormat, bytes:Uint8Array, deps:LoadDeps):Promise<LegacyModelProof> {
  deps.signal?.throwIfAborted();
  const inputKey=modelInputKey(format,bytes,deps);
  const model = await loadModel(format, bytes, deps);
  try { deps.signal?.throwIfAborted();if(inputKey!==modelInputKey(format,bytes,deps))throw Error('元のモデル入力が変更されました。');
    const table=snapshotTargets(model.root);return Object.freeze({inputKey,table:Object.freeze({ scene:table.scene,rows:freezeTargets(table.rows) })}); }
  finally { disposeModelResources(model.root); }
}
