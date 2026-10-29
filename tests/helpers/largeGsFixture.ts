import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {gsFixture} from './gsFixture';

export const largeGsDigest='995aca4e4f5f42acdf690171a00d9540d17e8f29e4ec22cfa06d1abd485a138d';
export const largeGsBytes=178_002_206;
export const updatedLargeGsDigest='373b652c8d0d372610437b1614054cb97a31772fe05a2be486ca0b51ac52420c';
async function verify(path:string,expected=largeGsDigest){
 const file=await stat(path);if(!file.isFile()||file.size!==largeGsBytes)throw Error('Owned large GS fixture size differs');
 const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);
 if(hash.digest('hex')!==expected)throw Error('Owned large GS fixture hash differs');return path;
}
/** Generated source, not a distributed sample. Fixed grid retains all 89 SH4 source floats. */
export async function largeGsFixture(generation:1|2=1){
 const updated=generation===2,expected=updated?updatedLargeGsDigest:largeGsDigest;
 const names=updated?['.artifacts/e2e/fixtures/desktop-sh4-500k-v2.ply']:['.artifacts/e2e/gs-large-workflow/500k-sh4.ply','.artifacts/e2e/fixtures/desktop-sh4-500k.ply'];
 for(const name of names){
  try{return await verify(resolve(name),expected);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
 }
 const path=resolve(updated?names[0]!:names[1]!);await mkdir(dirname(path),{recursive:true});
 const sample=gsFixture(4),header=Buffer.from(new TextDecoder().decode(sample.subarray(0,sample.length-356)).replace('element vertex 1','element vertex 500000'));
 const row=Buffer.alloc(356);for(const [index,value] of [[6,updated ? .7 : .15],[7,updated ? .1 : -.1],[8,-.12],[28,.25],[29,.1],[82,Math.log(.0007)],[83,Math.log(.0007)],[84,Math.log(.0007)],[85,1]])row.writeFloatLE(value!,index!*4);
 const block=Buffer.alloc(356*256);for(let i=0;i<256;i++)row.copy(block,i*356);
 const file=await open(path,'wx');
 const write=async(bytes:Buffer)=>{for(let offset=0;offset<bytes.length;){const result=await file.write(bytes,offset,bytes.length-offset);if(!result.bytesWritten)throw Error('Fixture write made no progress');offset+=result.bytesWritten;}};
 try{await write(header);for(let start=0;start<500_000;start+=256){const count=Math.min(256,500_000-start);
  for(let local=0;local<count;local++){const i=start+local,at=local*356;block.writeFloatLE((i%1000-500)/300,at);block.writeFloatLE((Math.floor(i/1000)-250)/300,at+4);block.writeFloatLE((i%7)/10000,at+8);}
  await write(block.subarray(0,count*356));}}
 finally{await file.close();}return verify(path,expected);
}
