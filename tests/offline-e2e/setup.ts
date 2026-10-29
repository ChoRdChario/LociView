import {execFileSync} from 'node:child_process';
import {cp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
export default async function setup(){
  const root=resolve('.artifacts/e2e/offline-builds',process.env.LOCIVIEW_E2E_RUN!);await mkdir(root,{recursive:true});
  const build=(mode:string,identity?:string,base='/')=>execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build','--mode',mode],{stdio:'inherit',windowsHide:true,env:{...process.env,BASE_PATH:base,DESKTOP_OFFLINE_BUILD_ID:identity}});
  build('project-scene-desktop');
  for(const version of ['a','b']){build('project-scene-offline',`offline-test-${version}`);await cp('offline-desktop-dist',resolve(root,version),{recursive:true});}
  build('project-scene-offline','offline-subpath','/LociView/');await cp('offline-desktop-dist',resolve(root,'subpath'),{recursive:true});
  process.env.LOCIVIEW_OFFLINE_BUILDS=root;
}
