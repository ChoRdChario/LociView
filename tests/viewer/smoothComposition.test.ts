import {describe,it,expect,vi} from 'vitest';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createTargetBudget,targetLayout} from '../../src/viewer/targetBudget';
import {compositionPolicy,verifyCompositionPolicy} from '../../src/viewer/compositionPolicy';
import {patchSmoothCoverage,smoothCoverage,smoothAccumulationMaterial,mrtShader} from '../../src/viewer/smoothMaterial';
import {pointViewportSample,binaryPointCapability} from '../../src/domain/pointPresentation';

describe('01g fixed viewport policy and target ownership',()=>{
  it('pins independently generated scalar/composite vectors and immutable policy bytes',async()=>{
    const root='docs/specs/profiles/',policy=readFileSync(root+'desktop-smooth-mrt-1.policy.json'),golden=readFileSync(root+'desktop-smooth-mrt-1.goldens.json');
    expect(createHash('sha256').update(policy).digest('hex')).toBe('f62c6a8c59294e755bd287df2eb57a4e42247a2f0b442154f9c073345b2e5087');
    expect(createHash('sha256').update(golden).digest('hex')).toBe('4e47993fa3f11c653c7b6b1fb286ae30b0e35bc6e773e751e9843bf6aacf97ef');await verifyCompositionPolicy();
    const data=JSON.parse(golden.toString());expect(data.composites.find((v:any)=>v.name==='hdr-overlap').expected).toEqual(data.composites.find((v:any)=>v.name==='hdr-overlap-reversed').expected);
    expect(data.composites[0].expected.linear).toEqual([.1,.2,.3]);expect(data.composites[1].expected.reveal).toBe(0);
    expect(data.composites[2].expected.accum[0]).toBeCloseTo(53002.7591925,6);expect(compositionPolicy.bytesPerPixel).toBe(36);
  });
  it('counts old/new and all views until explicit proven release, strict64MiB and coalesced notifications',async()=>{
    const budget=createTargetBudget(),notify=vi.fn(),off=budget.subscribe(notify),old=budget.reserve(30_000_000),next=budget.reserve(30_000_000);
    expect(budget.used).toBe(60_000_000);expect(()=>budget.reserve(7_108_864)).toThrow();expect(budget.used).toBe(60_000_000);
    await Promise.resolve();expect(notify).toHaveBeenCalledTimes(1);old.release();old.release();expect(budget.used).toBe(30_000_000);
    next.release();expect(budget.used).toBe(0);const full=budget.reserve(67_108_863);expect(()=>budget.reserve(1)).toThrow();full.release();off();
    expect(()=>budget.reserve(NaN)).toThrow();expect(()=>budget.reserve(-1)).toThrow();
  });
  it.each([[3840,2160,1],[2560,1440,2],[991.125,577.25,1.25],[400,900,3],[1,1,1]])('commits one rounded layout for CSS, points and coverage: %j', (w,h,dpr)=>{
    const budget=createTargetBudget(),layout=targetLayout(w!,h!,dpr!,budget.available,8192),lease=budget.reserve(layout.bytes);
    expect(layout.bytes).toBe(layout.width*layout.height*36);expect(layout.bytes).toBeLessThan(67_108_864);expect(layout.width*layout.height).toBeLessThanOrEqual(2_073_600);
    const pixel=pointViewportSample(layout,w!*.75,h!*.5);expect([pixel.width,pixel.height]).toEqual([layout.width,layout.height]);
    expect(binaryPointCapability(layout)===null).toBe(dpr!<=2);lease.release();
  });
  it('plans only within available shared capacity and rejects empty/invalid requests before allocation',()=>{
    const budget=createTargetBudget(),first=targetLayout(1440,900,1,budget.available,8192),lease=budget.reserve(first.bytes),second=targetLayout(1440,900,1,budget.available,8192);
    const secondLease=budget.reserve(second.bytes);expect(budget.used).toBeLessThan(67_108_864);expect(second.renderScale).toBeLessThan(first.renderScale);
    expect(()=>targetLayout(100,100,1,0,8192)).toThrow();expect(()=>targetLayout(Infinity,10,1,1000,8192)).toThrow();expect(()=>targetLayout(0,10,1,1000,8192)).toThrow();secondLease.release();lease.release();
  });
});

describe('owned final-alpha hooks before MRT for all admitted material classes',()=>{
  it.each(['basic','standard','phong'] as const)('preserves raw source alpha and reapplies coverage across clone: %s',kind=>{
    const material=kind==='basic'?new THREE.MeshBasicMaterial():kind==='standard'?new THREE.MeshStandardMaterial():new THREE.MeshPhongMaterial();
    material.opacity=.8;material.alphaTest=.5;const sourceMap=new THREE.Texture();material.map=sourceMap;material.vertexColors=true;
    patchSmoothCoverage(material,{opacity:.5,sourceBlendOpacity:.8,chroma:{keyColorSrgb:[.2,.4,.6],tolerance:.1,softness:.2}});
    expect([material.opacity,material.alphaTest,material.transparent,material.depthWrite]).toEqual([.8,0,true,false]);
    const derived=smoothAccumulationMaterial(material),library=THREE.ShaderLib[kind==='standard'?'standard':kind];
    const shader={uniforms:{},vertexShader:library.vertexShader,fragmentShader:library.fragmentShader} as THREE.WebGLProgramParametersWithUniforms;
    derived.onBeforeCompile(shader,{} as THREE.WebGLRenderer);expect(derived.map).toBe(sourceMap);expect(derived.vertexColors).toBe(true);expect(smoothCoverage(derived)).toEqual(smoothCoverage(material));
    expect(shader.fragmentShader).toContain('float lvSourceAlpha=diffuseColor.a;');expect(shader.fragmentShader.indexOf('#include <alphamap_fragment>')).toBeLessThan(shader.fragmentShader.indexOf('float lvSourceAlpha='));
    expect(shader.fragmentShader).toContain('clamp(lvSourceAlpha*lvSmoothOpacity*lvChroma,0.0,1.0)');expect(shader.fragmentShader).toContain('void main(){lvSurfaceMain();');expect(shader.fragmentShader).toContain('layout(location=1) out vec4 lvOptical;');
    expect(shader.uniforms).toHaveProperty('lvSmoothOpacity');expect(derived.blendSrc).toBe(THREE.OneFactor);expect(derived.blendDst).toBe(THREE.OneFactor);
    derived.dispose();material.dispose();sourceMap.dispose();
  });
  it('source MASK cutoff zero precedes appearance and does not retain stock alphaTest',()=>{
    const m=new THREE.MeshBasicMaterial();patchSmoothCoverage(m,{opacity:.25,sourceMask:{opacity:.8,cutoff:0}});
    const shader={uniforms:{},vertexShader:'',fragmentShader:THREE.ShaderLib.basic.fragmentShader} as THREE.WebGLProgramParametersWithUniforms;m.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('diffuseColor.a>=lvSmoothSourceCutoff?1.0:0.0');expect(shader.uniforms.lvSmoothSourceCutoff!.value).toBe(0);expect(m.alphaTest).toBe(0);m.dispose();
  });
  it('rejects malformed settings/output shape without changing the source',()=>{
    const m=new THREE.MeshBasicMaterial(),hook=m.onBeforeCompile;expect(()=>patchSmoothCoverage(m,{opacity:NaN})).toThrow();expect(m.onBeforeCompile).toBe(hook);expect(m.transparent).toBe(false);
    expect(()=>mrtShader('void main(){}',true)).toThrow();expect(()=>mrtShader('out vec4 fragColor;void other(){}',true)).toThrow();m.dispose();
  });
});
