import {describe,it,expect} from 'vitest';
import {materialForDisplay,type MaterialIntent} from '../src/domain/materialIntent';
import {resolveMaterialCoverage,materialCoverageAlpha} from '../src/domain/materialCoverage';
import type {MeshMaterialSource} from '../src/domain/meshMaterialSource';
const source=(coverage:MeshMaterialSource['coverage']):MeshMaterialSource=>({coverage,lighting:'lit',doubleSided:false});
const intent=(appearance:MaterialIntent['appearance']={},coverage:MaterialIntent['compositing']['coverage']={policy:'inherit'}):MaterialIntent=>({appearance,compositing:{coverage,optics:'inherit'}});
describe('standard material coverage, not a smooth compositor acceptance',()=>{
  it('resolves source classes and active appearance without silently binarizing smooth intent',()=>{
    expect(resolveMaterialCoverage(source({kind:'opaque'}),intent()).kind).toBe('opaque');
    expect(resolveMaterialCoverage(source({kind:'mask',alphaCutoff:.5}),intent())).toMatchObject({kind:'mask',cutoff:.5});
    for(const [s,a]of [[source({kind:'blend'}),{}],[source({kind:'opaque'}),{opacity:.5}],[source({kind:'mask',alphaCutoff:0}),{chroma:{keyColorSrgb:[0,0,0],tolerance:0,softness:.2}}]]as const)
      expect(resolveMaterialCoverage(s,intent(a)).kind).toBe('smoothBlend');
    expect(resolveMaterialCoverage(source({kind:'blend'}),intent({opacity:.2},{policy:'mask',alphaCutoff:0})).kind).toBe('mask');
  });
  it('composes the original MASK and BLEND alpha before final cutoff, including zero and equality',()=>{
    const opaque=resolveMaterialCoverage(source({kind:'opaque'}),intent({opacity:.5},{policy:'mask',alphaCutoff:.5}));
    const mask=resolveMaterialCoverage(source({kind:'mask',alphaCutoff:.5}),intent({opacity:.5},{policy:'mask',alphaCutoff:0}));
    const blend=resolveMaterialCoverage(source({kind:'blend'}),intent({opacity:.5},{policy:'mask',alphaCutoff:.125}));
    expect(materialCoverageAlpha(opaque,.01,[0,0,0])).toBe(.5);
    expect(materialCoverageAlpha(mask,.49,[0,0,0])).toBe(0);
    expect(materialCoverageAlpha(mask,.5,[0,0,0])).toBe(.5);
    expect(materialCoverageAlpha(blend,.25,[0,0,0])).toBe(.125);
    expect(materialCoverageAlpha(blend,2,[0,0,0])).toBe(1);
    expect(materialCoverageAlpha(mask,0,[0,0,0])).toBeGreaterThanOrEqual(mask.cutoff!);
    const forced=resolveMaterialCoverage(source({kind:'blend'}),intent({},{policy:'opaque'}));
    expect(materialCoverageAlpha(forced,0,[0,0,0])).toBe(1);
  });
  it('uses zero softness as hard chroma and removes dormant map2 values before coverage resolution',()=>{
    const chroma={keyColorSrgb:[0,0,0],tolerance:0,softness:0};
    const hard=resolveMaterialCoverage(source({kind:'opaque'}),intent({chroma}));
    expect(hard.kind).toBe('mask');expect(materialCoverageAlpha(hard,1,[0,0,0])).toBe(0);
    expect(materialCoverageAlpha(hard,1,[.1,0,0])).toBe(1);
    const soft=resolveMaterialCoverage(source({kind:'opaque'}),intent({chroma:{...chroma,softness:1}}));
    expect(soft.kind).toBe('smoothBlend');expect(materialCoverageAlpha(soft,1,[.5,.5,.5])).toBe(.5);
    const dormant=materialForDisplay(intent({chroma:{...chroma,enabled:false,softness:1}}),'map2');
    expect(resolveMaterialCoverage(source({kind:'opaque'}),dormant).kind).toBe('opaque');
  });
});
