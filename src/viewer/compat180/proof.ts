import { loadProofRoot, disposeModelResources } from './modelRuntime';
import { snapshotTargets, type NeutralTarget, type NeutralTargetTable } from './sceneProof';
import type { ModelFormat, LoadDeps } from '../modelLoader';
import { digestNativeBytes, hashOwnedBytes } from '../../nativeGs/sha256';

export function modelInputKey(format:ModelFormat,bytes:Uint8Array,deps:LoadDeps):string {
  return inputKey(format,digestNativeBytes(bytes).sha256,deps);
}
function inputKey(format: ModelFormat, sha256: string, deps: LoadDeps): string {
  return JSON.stringify([format,sha256,deps.gltfTextures??null,
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
export function readOwnedLegacyModelTargets(format:ModelFormat, bytes:Uint8Array, deps:LoadDeps):Promise<LegacyModelProof> {
  return checkOwnedModel(format, bytes, deps, () => modelInputKey(format, bytes, deps));
}

/** Regular validated GLB already owns an exact buffer. Use its former proof-copy space
 * for one browser digest at a time, outside the native image decoder. */
export function readOwnedGlbProof(bytes: Uint8Array<ArrayBuffer>, deps: Pick<LoadDeps, 'signal' | 'rasterResources'>, reviewTextureFrames = false): Promise<LegacyModelProof> {
  return checkOwnedModel('glb', bytes, deps, async () => inputKey('glb', await hashOwnedBytes(bytes), deps), reviewTextureFrames);
}

async function checkOwnedModel(format: ModelFormat, bytes: Uint8Array, deps: LoadDeps, key: () => string | Promise<string>, reviewTextureFrames = false): Promise<LegacyModelProof> {
  deps.signal?.throwIfAborted();
  const first = key();
  const before = typeof first === 'string' ? first : await first;
  deps.signal?.throwIfAborted();
  const root = await loadProofRoot(format, bytes, deps, reviewTextureFrames);
  try {
    deps.signal?.throwIfAborted();
    const last = key();
    const after = typeof last === 'string' ? last : await last;
    if (before !== after) throw Error('元のモデル入力が変更されました。');
    deps.signal?.throwIfAborted();
    const table = snapshotTargets(root);
    return Object.freeze({ inputKey: before, table: Object.freeze({ scene: table.scene, rows: freezeTargets(table.rows) }) });
  } finally { disposeModelResources(root); }
}
