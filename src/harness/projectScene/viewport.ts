import * as THREE from 'three';
import {fixtureModelBytes} from './modelClosure';
import {placementMatrix,type RenderDisplay,type SyntheticDisplay} from './viewportModel';
import type {SavedModelResidentPort} from './validationRender';
import type {GsResidency} from '../../viewer/gsDecodeQueue';
import {sceneViewportFactory as applicationFactory} from '../../projectScene/viewport';
/** Harness-only exact geometry source, never part of application file admission. */
export const sceneViewportFactory=(saved?:SavedModelResidentPort,residency?:GsResidency)=>applicationFactory(saved??{create(){throw Error('実モデルの表示本体が未接続です。');},dispose(){}},residency,(input,appearance)=>{
  if(appearance&&'issue' in appearance)throw Error(appearance.issue);
  const model=input as Extract<RenderDisplay['models'][number],{shape:'original'|'updated'}>;
        const raw = JSON.parse(new TextDecoder().decode(fixtureModelBytes(model.shape))) as { positions: number[]; indices: number[] };
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(raw.positions, 3));
        geometry.setIndex(raw.indices); geometry.computeVertexNormals();
        const params = { color: appearance ? new THREE.Color().setRGB(...appearance.colorLinear, THREE.LinearSRGBColorSpace) : new THREE.Color('#a8a29a'),
          side: appearance?.doubleSided ? THREE.DoubleSide : THREE.FrontSide, transparent: false, depthWrite: true, opacity: 1, visible: appearance?.visible ?? true };
        const material = appearance?.unlit ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 0.8 });
        const mesh = new THREE.Mesh(geometry, material), asset = new THREE.Group();
        mesh.matrix.copy(placementMatrix(model.representation.representationToAsset)); mesh.matrixAutoUpdate = false;
        asset.matrix.copy(placementMatrix(model.binding.assetToProject)); asset.matrixAutoUpdate = false;
        asset.add(mesh);
        return { mesh, asset };

});
export const createSyntheticViewport=sceneViewportFactory();
