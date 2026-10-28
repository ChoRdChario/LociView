import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,lstat,symlink,readFile,realpath} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {ZipReader,Uint8ArrayReader,Uint8ArrayWriter} from '@zip.js/zip.js';

// Test-only immutable comparison build; no worktree, checkout, install or product writes.
const root=process.cwd(),revision='5e5bb9e',target=resolve(root,`.artifacts/e2e/smooth01g-baseline-${revision}`),stamp=resolve(target,'verified-build.json');
const commit=execFileSync('git',['rev-parse',revision],{encoding:'utf8',windowsHide:true}).trim(),lock=createHash('sha256').update(await readFile(resolve(root,'package-lock.json'))).digest('hex');
if(createHash('sha256').update(execFileSync('git',['show',`${commit}:package-lock.json`],{windowsHide:true,maxBuffer:4*1024*1024})).digest('hex')!==lock)throw Error('Comparison dependency lock differs from the fixed commit');
const identity=JSON.stringify({commit,lock});
try{if(await readFile(stamp,'utf8')===identity){console.log(`Existing exact comparison build ${commit}`);process.exit(0);}}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(target,{recursive:true});const bytes=execFileSync('git',['archive','--format=zip',commit,'src','docs/specs/profiles','index.html','vite.config.ts','package.json','package-lock.json','tsconfig.json'],{windowsHide:true,maxBuffer:32*1024*1024});
const archive=new ZipReader(new Uint8ArrayReader(bytes),{useWebWorkers:false});
try{for(const entry of await archive.getEntries()){
  const path=resolve(target,entry.filename);if(!path.startsWith(target+sep))throw Error('Comparison archive path escapes target');
  if(entry.directory)await mkdir(path,{recursive:true});else{await mkdir(dirname(path),{recursive:true});await writeFile(path,await entry.getData(new Uint8ArrayWriter()));}
}}finally{await archive.close();}
const modules=resolve(target,'node_modules');try{if(!(await lstat(modules)).isSymbolicLink())throw Error('Comparison node_modules must be a junction');}catch(error){if(error.code!=='ENOENT')throw error;await symlink(resolve(root,'node_modules'),modules,'junction');}
if((await realpath(modules)).toLowerCase()!==(await realpath(resolve(root,'node_modules'))).toLowerCase())throw Error('Comparison dependency junction points to another install');
execFileSync(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'build','--mode','project-scene-desktop'],{cwd:target,stdio:'inherit',windowsHide:true,env:{...process.env,BASE_PATH:'/'}});
await writeFile(stamp,identity);console.log(`Prepared exact comparison build ${commit}`);
