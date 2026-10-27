import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectGsPly, gsPropertyNames, gsSourceProfile, hasGsPlySignature } from '../src/projectFiles/gsPly';
import { gsSourceDeclaration, gsActivatedGeometry, gsTransformGeometry, gsOpacity, gsColor } from '../src/domain/gsSource';
import { prepareValidationModel, prepareValidationProject } from '../src/projectFiles/initialProject';
import { validationModelDeclaration, inspectDeclaredValidationModel } from '../src/projectFiles/content';
import { gsFixture as gsBytes } from './helpers/gsFixture';
const gold = JSON.parse(readFileSync(new URL('../docs/specs/profiles/gs-ply-f32le-sh0-4-1.goldens.json',import.meta.url),'utf8'));
const limits={maxFileBytes:64*1024*1024,maxItems:100_000,maxValues:8_000_000,maxJsonBytes:1_000_000,maxPixels:1000};
const near=(a: number,e: number)=>expect(Math.abs(a-e)).toBeLessThanOrEqual(Math.max(1e-12,1e-12*Math.abs(e)));
const matrixNear=(a:number[][],e:number[][])=>a.forEach((r,i)=>r.forEach((n,k)=>near(n,e[i]![k]!)));
describe('01c exact GS source, independent of packed display',()=>{
  it('binds approved bytes and preserves every schema, row, duplicate and raw negative-zero bit before awaits',async()=>{
    expect(await gsSourceProfile()).toEqual(gsSourceDeclaration);
    for(const v of gold.schemaVectors){ const input=gsBytes(v.degree), kept=input.slice(), pending=inspectGsPly(input,limits);input.fill(0);
      const source=await pending;expect(source.bytes).toEqual(kept);expect(source.stride).toBe(v.recordBytes);expect(source.degree).toBe(v.degree);
      expect(source.materials).toEqual([]);expect(source.surfaceRanges).toEqual([{kind:'splatSample',count:1}]);
      expect(Object.is(new DataView(source.bytes.buffer).getFloat32(source.headerBytes+4,true),-0)).toBe(true);
    }
    const source=await inspectGsPly(gsBytes(0),limits);expect(source.bounds).toEqual(gold.geometryVectors[0].expectedPaddedBounds);
    expect(await inspectGsPly(gsBytes(4,undefined,'\r\n'),limits)).toMatchObject({degree:4,count:1});
  });
  it('matches independent quaternion/covariance, activation, color and frame oracles without shader/library authority',()=>{
    for(const v of gold.geometryVectors){const actual=gsActivatedGeometry(v.encodedLogScaleF32,v.encodedQuaternionWxyzF32);
      actual.quaternion.forEach((n,i)=>near(n,v.expectedNormalizedQuaternionWxyz[i]));matrixNear(actual.covariance,v.expectedCovariance);}
    for(const v of gold.opacityVectors) near(gsOpacity(v.encodedLogitF32),v.expectedAlpha);
    for(const v of gold.colorVectors){const coeff=Array.from({length:25},(_,i)=>v.rCoefficientsByBasis[String(i)]??0),actual=gsColor(coeff,v.unitDirectionRepresentation);
      near(actual.nonlinear,v.expectedRNonlinear);near(actual.linear,v.expectedRLinear);}
    for(const v of gold.frameVectors){const actual=gsTransformGeometry(v.meanRepresentation,v.covarianceRepresentation,[[0,-2,0],[-2,0,0],[0,0,2]],v.representationToAsset.translation);
      actual.mean.forEach((n,i)=>near(n,v.expectedMeanAsset[i]));matrixNear(actual.covariance,v.expectedCovarianceAsset);}
  });
  it('retains a verified stored envelope literally, refuses inward/excess bounds and validates complete transforms',async()=>{
    const bytes=gsBytes(0), source=await inspectGsPly(bytes,limits), representationToAsset={translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'};
    const retained=structuredClone(source.bounds);retained.min[0]!-=8*Number.EPSILON*4;
    expect((await inspectGsPly(bytes,limits,{representationToAsset,logicalBoundsAsset:retained})).bounds).toEqual(retained);
    for(const min of [-4,source.bounds.min[0]!-32*Number.EPSILON*4]) await expect(inspectGsPly(bytes,limits,{representationToAsset,logicalBoundsAsset:{min:[min,...source.bounds.min.slice(1)],max:source.bounds.max}})).rejects.toThrow();
    await expect(inspectGsPly(bytes,limits,{representationToAsset:{...representationToAsset,uniformScale:0}})).rejects.toThrow();
  });
  it('rejects malformed/partial schemas, ignored nonfinite values, all-empty, invalid scales and exact budgets',async()=>{
    const source=gsBytes(4), parsed=await inspectGsPly(source,limits), header=new TextDecoder().decode(source.subarray(0,parsed.headerBytes));
    for(const changed of [header.replace('f_rest_71','f_rest_70'),header.replace('property float nx','property double nx'),header.replace('element vertex 1','element vertex 0'),header.replace('end_header','element face 0\nend_header'),header.replace('ply\n','ply\r\n'),header.replace('format binary_little_endian','format ascii')]){
      const h=new TextEncoder().encode(changed), b=new Uint8Array(h.length+source.length-parsed.headerBytes);b.set(h);b.set(source.subarray(parsed.headerBytes),h.length);
      expect(hasGsPlySignature(b)).toBe(true);await expect(inspectGsPly(b,limits)).rejects.toThrow();}
    for(const [index,value] of [[3,NaN],[81,-Infinity],[81,-1000],[82,-1000],[85,0]]){const b=gsBytes(4);new DataView(b.buffer).setFloat32(parsed.headerBytes+index!*4,value!,true);await expect(inspectGsPly(b,limits)).rejects.toThrow();}
    await expect(inspectGsPly(new Uint8Array([...source,0]),limits)).rejects.toThrow();
    await expect(inspectGsPly(source,{...limits,maxValues:88})).rejects.toThrow();await expect(inspectGsPly(source,{...limits,maxFileBytes:source.length-1})).rejects.toThrow();
  });
  it('creates an unknown-unit GS Project with no material catalog and admits the exact saved tuple only',async()=>{
    const model=await prepareValidationModel({label:'全係数',bytes:gsBytes()},limits);expect(model.representation.materialCatalog).toBeUndefined();expect(model.representation.role).toBe('gsPrimary');
    await validationModelDeclaration(model.representation);expect((await inspectDeclaredValidationModel(model.representation,model.body.bytes,limits)).bounds).toEqual(model.representation.logicalBoundsAsset);
    for(const changed of [{contentKind:'pointCloud'},{role:'pointPrimary'},{formatProfile:{...gsSourceDeclaration,specificationSha256:'0'.repeat(64)}}])await expect(validationModelDeclaration({...model.representation,...changed} as any)).rejects.toThrow();
    const p=await prepareValidationProject({run:'0123456789abcdef0123456789abcdef',title:'GS',models:[{label:'GS',bytes:gsBytes()}]},limits);expect((p.records.project as any).frame.unit).toEqual({kind:'unknown'});
  });
  it('ignores inert terminator text, owns the context, keeps duplicates/count and inspects empty rows',async()=>{
    const original=gsBytes(0), source=await inspectGsPly(original,limits), header=new TextDecoder().decode(original.subarray(0,source.headerBytes)).replace('element vertex','comment end_header\nelement vertex');
    const h=new TextEncoder().encode(header), metadata=new Uint8Array(h.length+original.length-source.headerBytes);metadata.set(h);metadata.set(original.subarray(source.headerBytes),h.length);
    expect(hasGsPlySignature(metadata)).toBe(true);expect((await prepareValidationModel({label:'metadata',bytes:metadata},limits)).representation.role).toBe('gsPrimary');
    const context={representationToAsset:{translation:[0,0,0],rotationXYZW:[0,0,0,1],uniformScale:1,reflection:'none'},logicalBoundsAsset:structuredClone(source.bounds)},pending=inspectGsPly(original,limits,context);
    context.representationToAsset.translation[0]=100;context.logicalBoundsAsset.min[0]=-100;expect((await pending).bounds).toEqual(source.bounds);
    const row=[0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0],empty=[...row];empty[0]=1e20;empty[9]=-7;
    const duplicates=await inspectGsPly(gsBytes(0,[row,row,empty]),limits);expect(duplicates.count).toBe(3);expect(duplicates.bounds).toEqual(source.bounds);
    empty[3]=NaN;await expect(inspectGsPly(gsBytes(0,[row,empty]),limits)).rejects.toThrow();expect(gsPropertyNames(4)).toHaveLength(89);
  });
});
