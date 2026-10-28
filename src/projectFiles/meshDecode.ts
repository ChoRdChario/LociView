import type { MeshSourceData, MeshSourceAddress } from '../domain/meshSource';
import type { JsonObject } from '../domain/values';
import { buildNeutralMesh } from '../viewer/meshSurface';
import { readLegacyModelProof } from '../viewer/compat180/proof';
import { assertTargetRows, assertTargetTables, snapshotTargets, type NeutralTarget, type NeutralTargetTable } from '../viewer/compat180/sceneProof';
import { captureGltfMeshOccurrenceProof } from './legacy180Occurrences';
import { decodeOccurrenceDisplay } from './glbOccurrences';
import { meshSourceInputKey } from './meshSourceBinding';

export interface MeshOccurrenceProofRow {readonly sourceAddress:MeshSourceAddress;readonly slotIndex:number;readonly childPath:readonly number[];readonly materialArraySlot:number;readonly target:NeutralTarget}
interface MeshProof {readonly inputKey:string;readonly rows:readonly MeshOccurrenceProofRow[];readonly table?:NeutralTargetTable}
function assertBijection(source:MeshSourceData,rows:readonly MeshOccurrenceProofRow[]){
  const slots=new Set<number>(),targets=new Set<string>();
  for(const row of rows){const target=JSON.stringify([row.childPath,row.materialArraySlot]);
    if(row.sourceAddress.slotIndex!==row.slotIndex||!Number.isSafeInteger(row.slotIndex)||row.slotIndex<0||slots.has(row.slotIndex)||targets.has(target))throw Error('元の材質と面の対応が重複しています。');
    slots.add(row.slotIndex);targets.add(target);
  }
  if(rows.length!==source.sourceSlots.length||source.sourceSlots.some(s=>!slots.has(s.slotIndex))||new Set(source.sourceSlots.map(s=>s.slotIndex)).size!==rows.length)throw Error('元の材質の対応を一意に確認できません。');
}
/** Exact source addresses are independent of decoded traversal/material-object reuse. */
async function captureOwned(source:MeshSourceData,signal?:AbortSignal):Promise<MeshProof>{
  signal?.throwIfAborted();const inputKey=meshSourceInputKey(source);
  if(source.format==='gltf'){
    const proof=await captureGltfMeshOccurrenceProof(source,signal),rows=source.sourceSlots.map(slot=>{const a=slot.address;if(a.kind!=='gltf-occurrence')throw Error('元の材質の対応を確認できません。');const row=proof.rows.find(r=>r.nodeIndex===a.nodeIndex&&r.primitiveIndex===a.primitiveIndex&&r.slotIndex===slot.slotIndex&&r.materialIndex===a.materialIndex);if(!row)throw Error('元の材質の面が不足しています。');return{sourceAddress:a,slotIndex:slot.slotIndex,childPath:[...row.childPath],materialArraySlot:row.materialArraySlot,target:row.target};});
    if(rows.length!==proof.rows.length||proof.inputKey!==inputKey||inputKey!==meshSourceInputKey(source))throw Error('元のモデル入力が変更されました。');assertBijection(source,rows);return{inputKey,rows};
  }
  const proof=await readLegacyModelProof(source.format,source.bytes,{signal}),rows=source.sourceSlots.map(slot=>{
    const a=slot.address,path=a.kind==='flat'?[]:a.kind==='obj-material-run'?[a.objectOrdinal]:null,index=a.kind==='obj-material-run'?a.materialRunOrdinal:0;if(!path)throw Error('元の材質の対応を確認できません。');
    const matches=proof.table.rows.filter(r=>JSON.stringify(r.childPath)===JSON.stringify(path)&&r.slot===index);if(matches.length!==1)throw Error('元の材質の面を一意に確認できません。');return{sourceAddress:a,slotIndex:slot.slotIndex,childPath:[...matches[0]!.childPath],materialArraySlot:index,target:matches[0]!};
  });
  if(rows.length!==proof.table.rows.length||inputKey!==meshSourceInputKey(source))throw Error('元のモデル入力が変更されました。');
  assertBijection(source,rows);
  const decoded=buildNeutralMesh(source);try{assertTargetTables(proof.table,snapshotTargets(decoded.root,proof.table.rows));}finally{decoded.dispose();}
  return{inputKey,rows,table:proof.table};
}
export function captureMeshOccurrenceProof(source:MeshSourceData,signal?:AbortSignal):Promise<MeshProof>{return captureOwned(structuredClone(source),signal);}

/** Actual180 proof/resources finish first; independently owned186 display follows. */
export async function decodeMeshSource(input:MeshSourceData,signal?:AbortSignal){
  const source=structuredClone(input),proof=await captureOwned(source,signal);signal?.throwIfAborted();
  if(source.format==='gltf'){
    const display=await decodeOccurrenceDisplay(source,true);try{signal?.throwIfAborted();if(proof.inputKey!==meshSourceInputKey(source)||display.occurrenceSlots.length!==proof.rows.length)throw Error('モデルの材質の数が一致しません。');
      for(const slot of display.occurrenceSlots){const old=proof.rows.find(r=>r.slotIndex===slot.slotIndex),a=old?.sourceAddress;if(!old||a?.kind!=='gltf-occurrence'||a.nodeIndex!==slot.nodeIndex||a.primitiveIndex!==slot.primitiveIndex)throw Error('元の材質と表示の対応が一致しません。');assertTargetRows([old.target],snapshotTargets(slot.node,[old.target],false).rows,false);}
      return display;
    }catch(error){display.dispose();throw error;}
  }
  const decoded=buildNeutralMesh(source);try{signal?.throwIfAborted();if(proof.inputKey!==meshSourceInputKey(source))throw Error('元のモデル入力が変更されました。');assertTargetTables(proof.table!,snapshotTargets(decoded.root,proof.table!.rows));
    const materialLocators=new Map([...decoded.materials].map(([m,slotIndex])=>[m,{kind:'representationMaterial',slotIndex} as JsonObject]));
    return{root:decoded.root,materialLocators,dispose:decoded.dispose};
  }catch(error){decoded.dispose();throw error;}
}
