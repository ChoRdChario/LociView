import {describe,it,expect} from 'vitest';
import {meshMaterialSource,meshLightingIssue} from '../src/domain/meshMaterialSource';
import type {JsonObject} from '../src/domain/values';
const rep:JsonObject={contentKind:'mesh',role:'meshPrimary'};
const semantics=(lighting:'lit'|'unlit'='lit',mask=false,doubleSided=false)=>({coverage:mask?{kind:'mask',alphaCutoff:.5}:{kind:'opaque'},optics:'surface',lighting,doubleSided});
describe('provider-verified Mesh material source capability',()=>{
  it('admits the closed source matrix and only refuses explicit lighting reconstruction for authored unlit',()=>{
    for(const lighting of ['lit','unlit'] as const)for(const mask of [false,true])for(const side of [false,true]){
      const source=meshMaterialSource(rep,semantics(lighting,mask,side));expect(source).toEqual({coverage:mask?{kind:'mask',alphaCutoff:.5}:{kind:'opaque'},lighting,doubleSided:side});
      expect(meshLightingIssue(source!,{})).toBeNull();expect(meshLightingIssue(source!,{lighting:'unlit'})).toBeNull();expect(!!meshLightingIssue(source!,{lighting:'lit'})).toBe(lighting==='unlit');
    }
  });
  it('rejects nonvisual roles, unknown/partial semantics and coercible values',()=>{
    const roles:JsonObject[]=[{contentKind:'pointCloud',role:'pointPrimary'},{contentKind:'gaussianSplat',role:'gsPrimary'},{contentKind:'mesh',role:'interactionProxy'},{contentKind:'mesh'}];
    for(const r of roles)expect(meshMaterialSource(r,semantics())).toBeNull();
    expect(meshMaterialSource(rep,{...semantics(),coverage:{kind:'blend'}})).toEqual({coverage:{kind:'blend'},lighting:'lit',doubleSided:false});
    for(const s of [{...semantics(),lighting:['unlit']},{...semantics(),lighting:{toString:()=> 'unlit'}},{...semantics(),extra:true},{...semantics(),doubleSided:1},{...semantics(),coverage:{kind:'blend',alphaCutoff:.5}},{...semantics(),coverage:{kind:'mask'}},{...semantics(),coverage:{kind:'mask',alphaCutoff:NaN}},{...semantics(),coverage:{kind:'mask',alphaCutoff:2}},{...semantics(),optics:'transmission'}])expect(meshMaterialSource(rep,s)).toBeNull();
  });
});
