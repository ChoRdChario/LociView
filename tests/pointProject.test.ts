import { createPointSurface } from '../src/viewer/pointSurface';
import * as THREE from 'three';
import { pickPointAwareCreation } from '../src/harness/projectScene/viewportPointPicking';
import * as A from '@automerge/automerge';
import { vi } from 'vitest';
import { MemoryFS } from '../src/platform/fs';
import { OriginBlobStore } from '../src/projectMetadata/blobStore';
import { MetadataProjectSession } from '../src/projectMetadata/session';
import type { MetadataStorageFactory } from '../src/projectMetadata/repository';
import { validationMetadataLimits as metadata } from '../src/projectFiles/validation';
import { prepareValidationProject } from '../src/projectFiles/initialProject';
import { prepareValidationCreation, validationProjectService } from '../src/projectFiles/creation';
import { newId, json } from '../src/projectMetadata/persistence';
import { surfaceAnchor } from '../src/ui/projectScene/projectWorkspacePorts';
import { prepareValidationResidents } from '../src/harness/projectScene/validationRender';
import { validationModelVersions } from '../src/harness/projectScene/validationProjection';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectPointPly, pointSourceProfile, pointSourceProfileSha256 } from '../src/projectFiles/pointPly';
import { defaultPointProfile, pointRegistrySnapshot, pointProfileTexts, verifyPointProfileTexts, validatePointRegistry,
  resolvePointPresentation, pointRadialCoverage, pointViewportSample, binaryPointCapability } from '../src/domain/pointPresentation';
const load = (name: string) => JSON.parse(readFileSync(new URL(`../docs/specs/profiles/${name}`, import.meta.url), 'utf8'));
const source = load('point-ply-rgb-1.goldens.json'), presentation = load('point-presentation-1.goldens.json');
const limits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 1000 };
const bytes = (text: string) => new TextEncoder().encode(text);

describe('approved exact ordinary-point source and presentation (not renderer/device adoption)', () => {
  it('checks all source vectors against the owned Float32 arrays, colors, exact bounds and original bytes', async () => {
    for (const v of source.accepted) {
      const input = bytes(v.utf8), kept = input.slice(), promise = inspectPointPly(input, limits); input.fill(0);
      const model = await promise, expected = v.sameDecodedAs ? source.accepted.find((a: any) => a.name === v.sameDecodedAs) : v;
      expect(model.bytes).toEqual(kept); expect(Array.from(model.positions)).toEqual(expected.positionsFloat32.flat());
      if (expected.colorsLinearFloat32) expect(Array.from(model.colors)).toEqual(expected.colorsLinearFloat32.flat());
      expect(model.bounds).toEqual(expected.bounds); expect(model.surfaceRanges).toEqual([{ kind: 'pointSample', nodeIndex: 0, primitiveIndex: 0, count: expected.pointCount }]);
      expect(model.materials[0]).toMatchObject({ sourceSemantics: { lighting: 'unlit', coverage: { kind: 'opaque' } } });
      expect(Array.from(model.positions).some(n => Object.is(n, -0))).toBe(false);
    }
    expect(await pointSourceProfile()).toEqual({ id: 'development-validation-point-ply-rgb-1', specificationSha256: pointSourceProfileSha256 });
  });
  it('rejects overflow, unknown/mixed/GS grammar, trailing data and declared budgets before a decoded result', async () => {
    const text = source.accepted[0].utf8;
    for (const candidate of [text.replace('-1 0 -0', '1e39 0 0'), text.replace('-1 0 -0', 'NaN 0 0'), text.replace('255 0 0', '256 0 0'),
      text.replace('vertex 4', 'vertex 3'), text+'\n', text.slice(0,-1)+'\r', text.replace('end_header', 'element face 0\nend_header'),
      text.replace('property float z', 'property double z'), text.replace('property float z', 'property float f_dc_0'),
      text.replace('property float z', 'property float z\nproperty float nx'), text.replace('format ascii 1.0', 'format binary_little_endian 1.0')])
      await expect(inspectPointPly(bytes(candidate), limits)).rejects.toThrow();
    await expect(inspectPointPly(bytes(text), { ...limits, maxItems: 3 })).rejects.toThrow();
    await expect(inspectPointPly(bytes(text), { ...limits, maxValues: 23 })).rejects.toThrow();
    await expect(inspectPointPly(bytes(text.replace('-1 0 -0', '1'.repeat(1025)+' 0 0')), limits)).rejects.toThrow();
  });
  it('accepts only the full exact three-profile registry and binds approved text bytes', async () => {
    await verifyPointProfileTexts(); expect(() => validatePointRegistry(pointRegistrySnapshot)).not.toThrow();
    await expect(verifyPointProfileTexts([...pointProfileTexts.slice(0,2), pointProfileTexts[2]+' '])).rejects.toThrow();
    expect(() => validatePointRegistry({ ...pointRegistrySnapshot, profiles: [defaultPointProfile] })).toThrow();
    expect(() => resolvePointPresentation(pointRegistrySnapshot, { ...defaultPointProfile, maximumDiameterCssPixels: 21 }, 3)).toThrow();
    for (const v of presentation.diameter) {
      const n = typeof v.requested === 'number' ? v.requested : NaN;
      expect(resolvePointPresentation(pointRegistrySnapshot, defaultPointProfile, n)).toMatchObject({ diameterCssPixels: v.resolved, diagnosedDefault: !!v.diagnostic });
    }
    expect(binaryPointCapability({ cssWidth: 640, cssHeight: 480, devicePixelRatio: 3, renderScale: 1 })).toBeTruthy();
    expect(binaryPointCapability({ cssWidth: 640, cssHeight: 480, devicePixelRatio: 2, renderScale: 1 })).toBeNull();
    expect(binaryPointCapability({ cssWidth: 640, cssHeight: 480, devicePixelRatio: 1, renderScale: 1 }, pointRegistrySnapshot.profiles[1])).toBeTruthy();
  });
  it('uses the approved circle boundary and rounded top-left sample coordinates', () => {
    for (const v of presentation.radialCoverage) expect(pointRadialCoverage(v.diameter, v.radius)).toBe(v.g);
    const v = presentation.viewport, sample = pointViewportSample(v, ...v.pointer as [number, number]);
    expect(sample).toMatchObject({ width: v.width, height: v.height, i: v.sampleTopLeft[0], j: v.sampleTopLeft[1], xCss: v.sampleCenterCss[0], yCss: v.sampleCenterCss[1] });
    expect(() => pointViewportSample(v, v.cssWidth, 0)).toThrow();
  });
});

function memoryStorage(): MetadataStorageFactory {
  const rows = new Map<string, Uint8Array>(); const matches = (key: string, prefix: string[]) => prefix.every((p, i) => JSON.parse(key)[i] === p);
  return () => ({ load: async key => rows.get(JSON.stringify(key))?.slice(), save: async (key, bytes) => { rows.set(JSON.stringify(key), bytes.slice()); },
    remove: async key => { rows.delete(JSON.stringify(key)); }, loadRange: async prefix => [...rows].filter(([key]) => matches(key, prefix)).map(([key,data]) => ({ key: JSON.parse(key), data: data.slice() })),
    removeRange: async prefix => { for (const key of rows.keys()) if (matches(key,prefix)) rows.delete(key); } });
}
class PointFaultFS extends MemoryFS { rejectPublication = false; override async writeText(path: string, text: string) { if (this.rejectPublication && path.endsWith('/published.json')) throw Error('point-publication-fault'); return super.writeText(path,text); } }
async function pointService() {
  A.getHeads(A.init()); const fs = new PointFaultFS(), storage = memoryStorage();
  const store = new OriginBlobStore(fs, { maxBlobBytes: limits.maxFileBytes, maxChunkBytes: 100_000, maxChunks: 1000, metadata }, { async request(name, _options, callback) { return callback({name,mode:'exclusive'}); } } as LockManager);
  const service = validationProjectService(fs,storage,store,limits);
  const initial = prepareValidationCreation(await prepareValidationProject({ run:newId(), title:'点群', models:[{label:'元の点群.ply',bytes:bytes(source.accepted[0].utf8)}] },limits),'map2');
  const ready = await initial.persist(fs,store,service.session); expect(ready.state).toBe('ready');
  if (ready.provider?.kind !== 'scene-provider') throw Error('point-provider');
  const p = ready.provider, sceneId = p.state.defaultSceneId.kind === 'value' ? p.state.defaultSceneId.value : '', assetId = Object.keys(p.resources.assets)[0]!, projection = p.resources.assets[assetId]!.projection;
  if (projection.kind !== 'value') throw Error('point-projection');
  const rep = p.details.immutable.representationsById[projection.value.representationIds[0]!]!;
  if (rep.kind !== 'value') throw Error('point-representation');
  const target = { token:p.token,sceneId,assetId,assetFrameId:projection.value.assetFrameId,bindingId:projection.value.bindingId,revisionId:projection.value.revisionId,representationId:rep.value.id as string,familyId:rep.value.variantFamilyId as string,compatibilityId:projection.value.anchorCompatibilityIds[0]! };
  const anchor = surfaceAnchor({target,captionId:null,position:[-1,0,0],point:{pointIndex:0}});
  const command = {kind:'addPin' as const,sceneId,captionId:`cap_${newId()}`,membershipId:`scm_${newId()}`,eventId:`evt_${newId()}`,anchor,colorSrgb:[1,0,0] as [number,number,number]};
  return {...service,fs,store,storage,ready,p,target,command};
}
it('creates/adds owned point records and rejects plausible fabricated point anchors before journal writes', async () => {
  const r = await pointService(), files = await r.fs.list(''), writer = vi.spyOn(r.fs,'writeText'), binary = vi.spyOn(r.fs,'writeBytes');
  const base = r.command.anchor; if (base.kind !== 'asset') throw Error('anchor');
  for (const anchor of [{...base,positionAsset:[9,0,0]}, {...base,assetFrameId:`frm_${newId()}`}, {...base,authoredAssetRevisionId:`rev_${newId()}`},
    {...base,authoredAnchorCompatibilityId:`cmp_${newId()}`}, {...base,hitEvidence:{...base.hitEvidence,source:{...base.hitEvidence!.source!,surfaceRef:{kind:'pointSample',nodeIndex:0,primitiveIndex:0,pointIndex:999}}}}]) {
    await expect(r.session.edit(r.p.token,{...r.command,anchor} as typeof r.command)).rejects.toThrow();
    expect((await r.session.read()).source!.token).toBe(r.p.token); expect(await r.fs.list('')).toEqual(files);
  }
  expect(writer).not.toHaveBeenCalled(); expect(binary).not.toHaveBeenCalled();
  expect(() => r.ready.source!.prepareEdit(r.p.token,r.command,r.p,newId(),{} as any)).toThrow('point-anchor-proof');
});
it('retains sealed point evidence after publication interruption and cold retry without reselecting the point', async () => {
  const r = await pointService(); r.fs.rejectPublication = true;
  await expect(r.session.edit(r.p.token,r.command)).rejects.toThrow('point-publication-fault');
  const paths = (await r.fs.list('')).filter(p=>p.endsWith('.amchange')), originals = await Promise.all(paths.map(p=>r.fs.readBytes(p)));
  r.fs.rejectPublication = false;
  const cold = validationProjectService(r.fs,r.storage,r.store,limits); const proof = vi.spyOn(cold.content,'modelContent');
  const ready = await cold.session.retry(); expect(ready.state).toBe('ready'); expect(proof).not.toHaveBeenCalled();
  for (let i=0;i<paths.length;i++) expect(await r.fs.readBytes(paths[i]!)).toEqual(originals[i]);
  if (ready.provider?.kind !== 'scene-provider') throw Error('provider');
  expect(ready.provider.resources.captions[r.command.captionId]!.anchor).toEqual({kind:'value',value:r.command.anchor});
  const versions = await validationModelVersions(ready.provider), residents = await prepareValidationResidents(versions,cold.content), resident = residents.create(versions[0]!.closure as any);
  expect(resident.points!.positions).toEqual((await cold.content.modelContent((versions[0]!.closure as any).representation)).kind === 'point' ? Float32Array.from(source.accepted[0].positionsFloat32.flat()) : null);
  resident.dispose?.(); residents.dispose();
});

it('picks the source centre at canonical pixels, proves proximity visibility, and keeps other models as occluders', async () => {
  const r = await pointService(), versions = await validationModelVersions(r.p), cache = await prepareValidationResidents(versions,r.content), closure = versions[0]!.closure as any, selected = cache.create(closure);
  const resident = new Map([[r.target.assetId, selected]]), view = {cssWidth:200,cssHeight:200,devicePixelRatio:1,renderScale:1};
  const camera = new THREE.OrthographicCamera(-2,2,2,-2,0.1,20); camera.position.set(0,0,10); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  const display = {token:r.p.token,sceneId:r.target.sceneId,models:[closure]} as any;
  const pick = (x:number,y:number) => pickPointAwareCreation(display,[r.target],resident,camera,view,x,y,()=>undefined,24);
  selected.points!.configure(view,3);
  expect(pick(50,100)).toMatchObject({position:[-1,0,0],point:{pointIndex:0}});
  expect(pick(54,100)).toMatchObject({position:[-1,0,0],point:{pointIndex:0}});
  expect(pick(57,100)).toBeNull();
  const occluder = new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial()), asset = new THREE.Group(); occluder.position.set(-1,0,1); asset.add(occluder); asset.updateMatrixWorld(true);
  resident.set('other',{mesh:occluder,asset}); expect(pick(50,100)).toBeNull(); expect(pick(54,100)).toBeNull();
  asset.visible=false; expect(pick(54,100)?.point?.pointIndex).toBe(0); asset.visible=true;
  const meshTarget={...r.target,assetId:`ast_${newId()}`,bindingId:`bnd_${newId()}`,revisionId:`rev_${newId()}`,representationId:`rep_${newId()}`};
  const meshModel={...closure,binding:{...closure.binding,id:meshTarget.bindingId,assetId:meshTarget.assetId},revision:{...closure.revision,id:meshTarget.revisionId},representation:{...closure.representation,id:meshTarget.representationId}};
  resident.set(meshTarget.assetId,{mesh:occluder,asset}); const twins=new THREE.Group(), twinMesh=occluder.clone(); twins.add(twinMesh); twins.updateMatrixWorld(true); resident.set('twin',{mesh:twinMesh,asset:twins});
  const mixed={...display,models:[closure,meshModel]};
  expect(pickPointAwareCreation(mixed,[meshTarget],resident,camera,view,50,100,()=>undefined,24,{mesh:()=> 'covered',point:()=> 'hidden'})).toBeNull();
  resident.delete(meshTarget.assetId); resident.delete('twin');

  (occluder.material as THREE.MeshBasicMaterial).transparent=true; expect(pick(50,100)).toBeNull();
  selected.points!.configure({...view,devicePixelRatio:3},3); expect(pick(50,100)).toBeNull();
  expect(pickPointAwareCreation(display,[{...r.target,revisionId:`rev_${newId()}`}],resident,camera,view,50,100,()=>undefined,24)).toBeNull();
  occluder.geometry.dispose(); occluder.material.dispose(); selected.dispose?.(); cache.dispose();
});

it('shares the rounded projection for large translated coordinates and preserves original centres', () => {
  const positions=Float32Array.from([100000000,0,0]), surface=createPointSurface(positions,Float32Array.from([1,0,0])), asset=new THREE.Group(); asset.position.x=-99999999; asset.add(surface.mesh); asset.updateMatrixWorld(true);
  const view={cssWidth:200,cssHeight:200,devicePixelRatio:2,renderScale:1}; surface.configure(view,3);
  const camera=new THREE.OrthographicCamera(-2,2,2,-2,.1,20); camera.position.set(0,0,10); camera.lookAt(0,0,0); camera.updateMatrixWorld(true);
  const frame=surface.project(camera,24); expect(Array.from(frame.centersCss)).toEqual([150,100]); expect(positions[0]).toBe(100000000);
  expect(surface.mesh.geometry.getAttribute('pointScreen').getX(0)).toBe(frame.centersCss[0]); expect(surface.mesh.geometry.getAttribute('pointClip').getZ(0)).toBe(frame.depths[2]);
  asset.position.x=-100000000; asset.updateMatrixWorld(true); expect(Array.from(surface.project(camera,24).centersCss)).toEqual([100,100]); surface.dispose();
});
