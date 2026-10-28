import * as THREE from 'three';
import type { MeshSourceData } from '../domain/meshSource';
import { releaseOwnedResources } from './compat180/resources';

/** Owned186 construction from checked neutral arrays. No file/package/Project access. */
export function buildNeutralMesh(source:MeshSourceData){
  const materials=new Map<THREE.Material,number>(),geometries=new Set<THREE.BufferGeometry>(),owned=new Set<THREE.Material>();
  let root:THREE.Object3D|undefined,closed=false;
  const dispose=()=>{if(closed)return;closed=true;releaseOwnedResources(root?[root]:[],[...geometries,...owned]);materials.clear();geometries.clear();owned.clear();};
  try{
    if(source.format==='gltf'||!source.primitives||!source.materialDescriptors)throw Error('モデルの表示データを確認してください。');
    if(source.format==='obj')root=new THREE.Group();
    for(const primitive of source.primitives){
      const g=new THREE.BufferGeometry(),input=primitive.geometry;geometries.add(g);
      g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(input.positions),3));g.setAttribute('normal',new THREE.BufferAttribute(new Float32Array(input.normals),3));
      if(input.colors)g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(input.colors),3));if(input.uvs)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(input.uvs),2));
      if(input.indices)g.setIndex(new THREE.BufferAttribute(input.indices instanceof Uint32Array?new Uint32Array(input.indices):new Uint16Array(input.indices),1));
      for(const group of input.groups)g.addGroup(group.start,group.count,group.materialIndex);
      const entries=primitive.materialSlots.map(slot=>{const d=source.materialDescriptors![slot];if(!d)throw Error('モデルの材質の対応を確認してください。');
        const color=new THREE.Color().setRGB(...d.colorSrgb,THREE.SRGBColorSpace),m=d.kind==='phong'?new THREE.MeshPhongMaterial({color,vertexColors:d.vertexColors,flatShading:d.flatShading}):new THREE.MeshStandardMaterial({color,vertexColors:d.vertexColors,flatShading:d.flatShading,metalness:.1,roughness:.8});
        m.name=d.name;owned.add(m);materials.set(m,slot);return m;});
      if(!entries.length)throw Error('モデルの材質がありません。');const mesh=new THREE.Mesh(g,entries.length===1?entries[0]!:entries);mesh.name=primitive.name;
      if(source.format==='obj')root!.add(mesh);else{if(root)throw Error('モデルの表示構成を確認してください。');root=mesh;}
    }
    if(!root)throw Error('表示できる面がありません。');root.updateMatrixWorld(true);return{root,materials,dispose};
  }catch(error){dispose();throw error;}
}
