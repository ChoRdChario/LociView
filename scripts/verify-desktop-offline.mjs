import {readFileSync,readdirSync} from 'node:fs';
import {join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=process.argv[2]??'offline-desktop-dist',worker=readFileSync(join(root,'desktop-offline-sw.js'),'utf8');
function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):[join(path,entry.name)]);}
const resources=files(root).filter(path=>!path.endsWith('.map')&&!path.endsWith('desktop-offline-sw.js'));
for(const path of resources){const url=relative(root,path).replaceAll('\\','/'),integrity='sha384-'+createHash('sha384').update(readFileSync(path)).digest('base64');
 if(!worker.includes(JSON.stringify(url))||!worker.includes(integrity))throw Error(`Missing exact precache resource/integrity: ${url}`);}
if(files(root).some(path=>/native-gs-spark|(?:^|[\\/])sw\.js$/.test(path)))throw Error('Foreign/original worker/runtime reached offline artifact');
const manifest=JSON.parse(readFileSync(join(root,'desktop-offline.webmanifest'),'utf8'));
if(manifest.file_handlers||manifest.share_target)throw Error('Offline candidate added OS file/share handlers');
if(/skipWaiting\(|clients\.claim\(/.test(worker))throw Error('Forced worker activation');
console.log(`Desktop offline isolation PASS: ${resources.length} exact resources with SRI, dedicated worker/manifest, no Spark runtime or forced activation.`);
