import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {beforeAll,describe,expect,it} from 'vitest';

type Inputs={baselinePackage:string;baselineLock:string;currentPackage:string;currentLock:string;approvedToolchainLock:string};
let verify:(input:Inputs)=>{dependencyMode:string;runtimeRecords:number};
beforeAll(async()=>{
  ({verifyComparisonDependencies:verify}=await import(pathToFileURL(resolve('scripts/prepare-smooth-baseline.mjs')).href));
});
function fixture():Inputs{
  const dependencies={model:'1.0.0'},oldTools={vite:'6.0.0'},tools={vite:'6.4.6'};
  const lock=(devDependencies:Record<string,string>)=>({lockfileVersion:3,packages:{
    '':{dependencies,devDependencies},
    'node_modules/model':{version:'1.0.0',integrity:'sha512-model',dependencies:{codec:'1.0.0'}},
    'node_modules/codec':{version:'1.0.0',integrity:'sha512-codec'},
    'node_modules/vite':{version:devDependencies.vite,dev:true},
  }});
  return{baselinePackage:JSON.stringify({dependencies,devDependencies:oldTools}),baselineLock:JSON.stringify(lock(oldTools)),
    currentPackage:JSON.stringify({dependencies,devDependencies:tools}),currentLock:JSON.stringify(lock(tools)),approvedToolchainLock:JSON.stringify(lock(tools))};
}
function editLock(input:Inputs,change:(lock:any)=>void){
  const lock=JSON.parse(input.currentLock);change(lock);input.currentLock=JSON.stringify(lock);
  // Even an explicitly approved toolchain must preserve the runtime closure.
  input.approvedToolchainLock=input.currentLock;
}

describe('smooth comparison dependency boundary',()=>{
  it('allows the historical full lock and the pinned approved shared toolchain',()=>{
    const input=fixture();expect(verify(input)).toMatchObject({dependencyMode:'approved-shared-toolchain',runtimeRecords:2});
    input.currentPackage=input.baselinePackage;input.currentLock=input.baselineLock;
    expect(verify(input).dependencyMode).toBe('historical-lock');
  });
  it('rejects unknown development-tool updates',()=>{
    const input=fixture(),lock=JSON.parse(input.currentLock);lock.packages['node_modules/vite'].version='6.9.9';input.currentLock=JSON.stringify(lock);
    expect(()=>verify(input)).toThrow('not the original or approved lock');
  });
  it('rejects runtime root changes despite an approved lock',()=>{
    const input=fixture(),pkg=JSON.parse(input.currentPackage);pkg.dependencies.model='2.0.0';input.currentPackage=JSON.stringify(pkg);
    editLock(input,lock=>{lock.packages[''].dependencies.model='2.0.0';});expect(()=>verify(input)).toThrow('runtime roots differ');
  });
  it.each(['node_modules/model','node_modules/codec'])('rejects changed direct or transitive runtime records: %s',path=>{
    const input=fixture();editLock(input,lock=>{lock.packages[path].version='2.0.0';});expect(()=>verify(input)).toThrow('runtime closure differs');
  });
  it('rejects integrity changes and runtime reclassification as development-only',()=>{
    for(const change of [(lock:any)=>{lock.packages['node_modules/codec'].integrity='changed';},(lock:any)=>{lock.packages['node_modules/codec'].dev=true;}]){
      const input=fixture();editLock(input,change);expect(()=>verify(input)).toThrow('runtime closure differs');
    }
  });
  it('rejects package/lock drift and malformed lock content',()=>{
    const input=fixture(),pkg=JSON.parse(input.currentPackage);pkg.devDependencies.vite='other';input.currentPackage=JSON.stringify(pkg);
    expect(()=>verify(input)).toThrow('Package and lock tools differ');input.currentLock='{';expect(()=>verify(input)).toThrow();
  });
  it('normalizes Windows line endings without allowing other unknown lock changes',()=>{
    const input=fixture();input.currentLock+='\n';input.approvedToolchainLock=input.currentLock;
    input.currentLock=input.currentLock.replaceAll('\n','\r\n');expect(verify(input).dependencyMode).toBe('approved-shared-toolchain');
    input.currentLock+=' ';expect(()=>verify(input)).toThrow('not the original or approved lock');
  });
  it('rejects missing and extra runtime records despite an approved toolchain',()=>{
    for(const change of [(lock:any)=>{delete lock.packages['node_modules/codec'];},(lock:any)=>{lock.packages['node_modules/extra']={version:'1.0.0'};}]){
      const input=fixture();editLock(input,change);expect(()=>verify(input)).toThrow('runtime closure differs');
    }
  });
});
