import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,mkdtemp,writeFile,readFile,realpath,readdir,symlink} from 'node:fs/promises';
import {resolve,dirname,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {ZipReader,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';

const sourceCommit='5e5bb9e0f56cafafc184d029b44fe36b5615ca70';
const toolchainCommit='2f98fe900f0791518a2a71939ff34b5382853622';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const textHash=text=>hash(text.replaceAll('\r\n','\n'));

// Test-only: both a known full lock and the complete runtime closure must match.
export function verifyComparisonDependencies(input){
  const baselinePackage=JSON.parse(input.baselinePackage),currentPackage=JSON.parse(input.currentPackage);
  const baselineLock=JSON.parse(input.baselineLock),currentLock=JSON.parse(input.currentLock);
  const baselineLockSha256=textHash(input.baselineLock),toolchainLockSha256=textHash(input.currentLock);
  assert(toolchainLockSha256===baselineLockSha256||toolchainLockSha256===textHash(input.approvedToolchainLock),'Comparison toolchain is not the original or approved lock');
  for(const lock of [baselineLock,currentLock])assert.equal(lock.lockfileVersion,3,'Comparison lock version');
  for(const key of ['dependencies','optionalDependencies','peerDependencies']){
    assert.deepEqual(currentPackage[key],baselinePackage[key],'Comparison runtime roots differ');
    assert.deepEqual(currentPackage[key],currentLock.packages[''][key],'Package and lock runtime roots differ');
  }
  assert.deepEqual(currentPackage.devDependencies,currentLock.packages[''].devDependencies,'Package and lock tools differ');
  const runtime=lock=>Object.fromEntries(Object.entries(lock.packages).filter(([path,value])=>path&&!value.dev&&!value.devOptional));
  const expected=runtime(baselineLock);assert.deepEqual(runtime(currentLock),expected,'Comparison runtime closure differs');
  return{baselineLockSha256,toolchainLockSha256,runtimeRecords:Object.keys(expected).length,
    dependencyMode:toolchainLockSha256===baselineLockSha256?'historical-lock':'approved-shared-toolchain'};
}

async function inventory(directory,part=''){
  const rows=[];
  for(const entry of (await readdir(join(directory,part),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
    assert(!entry.isSymbolicLink(),'Unexpected comparison artifact symlink');const path=join(part,entry.name);
    if(entry.isDirectory())rows.push(...await inventory(directory,path));
    else{const bytes=await readFile(join(directory,path));rows.push({path:path.replaceAll('\\','/'),bytes:bytes.length,sha256:hash(bytes)});}
  }
  return rows;
}

async function prepare(){
  assert(process.argv.length===4&&process.argv[2]==='--manifest','Pass --manifest <new private result path>');
  const root=process.cwd(),manifestPath=resolve(process.argv[3]),artifacts=resolve(root,'.artifacts/e2e');
  assert(manifestPath.startsWith(artifacts+sep),'Comparison manifest must stay in private E2E artifacts');
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8',windowsHide:true,maxBuffer:5*1024*1024});
  const baselinePackage=git('show',`${sourceCommit}:package.json`),baselineLock=git('show',`${sourceCommit}:package-lock.json`);
  const currentPackage=await readFile(resolve(root,'package.json'),'utf8'),currentLock=await readFile(resolve(root,'package-lock.json'),'utf8');
  const dependencies=verifyComparisonDependencies({baselinePackage,baselineLock,currentPackage,currentLock,approvedToolchainLock:git('show',`${toolchainCommit}:package-lock.json`)});
  const modules=await realpath(resolve(root,'node_modules'));
  const installation={modules,node:process.version,vite:JSON.parse(await readFile(resolve(modules,'vite/package.json'),'utf8')).version,
    installedLockSha256:textHash(await readFile(resolve(modules,'.package-lock.json'),'utf8'))};
  assert.equal(installation.vite,JSON.parse(currentLock).packages['node_modules/vite'].version,'Installed Vite differs from the approved lock');
  await mkdir(artifacts,{recursive:true});
  // Always fresh: never re-certify or overwrite a historical build/stamp.
  const target=await mkdtemp(resolve(artifacts,`smooth01g-source-${sourceCommit.slice(0,7)}-${dependencies.toolchainLockSha256.slice(0,12)}-`));
  console.log(`Preparing fixed source with shared installed tools in ${target}`);
  const bytes=execFileSync('git',['archive','--format=zip',sourceCommit,'src','docs/specs/profiles','index.html','vite.config.ts','package.json','package-lock.json','tsconfig.json'],{windowsHide:true,maxBuffer:32*1024*1024});
  const archive=new ZipReader(new Uint8ArrayReader(bytes),{useWebWorkers:false}),inputs=[];
  try{for(const entry of await archive.getEntries()){
    const path=resolve(target,entry.filename);assert(path.startsWith(target+sep),'Comparison archive path escapes target');
    if(entry.directory)await mkdir(path,{recursive:true});
    else{const data=await entry.getData(new Uint8ArrayWriter());await mkdir(dirname(path),{recursive:true});await writeFile(path,data,{flag:'wx'});inputs.push({path:entry.filename,bytes:data.length,sha256:hash(data)});}
  }}finally{await archive.close();}
  await symlink(modules,resolve(target,'node_modules'),'junction');
  assert.equal(await realpath(resolve(target,'node_modules')),modules,'Comparison installation differs');
  execFileSync(process.execPath,[resolve(modules,'vite/bin/vite.js'),'build','--mode','project-scene-desktop'],{cwd:target,stdio:'inherit',windowsHide:true,env:{...process.env,BASE_PATH:'/'}});
  for(const input of inputs){const data=await readFile(resolve(target,input.path));assert.equal(data.length,input.bytes);assert.equal(hash(data),input.sha256,'Comparison build changed a source input');}
  assert.equal(textHash(await readFile(resolve(modules,'.package-lock.json'),'utf8')),installation.installedLockSha256,'Installed dependency metadata changed during build');
  const output=resolve(target,'desktop-dist'),outputs=await inventory(output);
  const manifest={sourceCommit,toolchainCommit,...dependencies,installation,output,inputs,outputs,
    method:'Fixed product source and identical runtime closure, built with the same approved installed tools as the candidate; not a historical byte-identical build'};
  await mkdir(dirname(manifestPath),{recursive:true});await writeFile(manifestPath,JSON.stringify(manifest,null,2),{flag:'wx'});
  console.log(`Prepared comparison manifest ${manifestPath}`);
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await prepare();
