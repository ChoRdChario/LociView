import {createServer,type Server} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,relative,extname,isAbsolute} from 'node:path';
/** Test-owned loopback origin. Stop/rebind the same port without touching other servers. */
export async function ownedServer(initialRoot:string,base='/'){
  let root=resolve(initialRoot),server:Server|undefined,port=0;
  let fault:((path:string)=>'missing'|'wrong'|'interrupted'|undefined)|undefined;
  const requests:string[]=[];
  const start=async()=>{
    server=createServer(async(req,res)=>{
      const requested=new URL(req.url??'/','http://localhost').pathname;requests.push(requested);
      if(requested==='/foreign/worker.js'||requested==='/foreign-worker.js') {res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});res.end("self.addEventListener('install',()=>{});");return;}
      if(!requested.startsWith(base)){res.writeHead(404);res.end('outside base');return;}
      const path='/'+requested.slice(base.length);
      const problem=fault?.(path);if(problem){res.writeHead(problem==='missing'?503:200,{'Content-Type':'application/javascript','Cache-Control':'no-store'});if(problem==='interrupted'){res.flushHeaders();res.write('partial');res.destroy();}else res.end('wrong build bytes');return;}
      try{const file=resolve(root,'.'+decodeURIComponent(path==='/'?'/index.html':path)),part=relative(root,file);if(part.startsWith('..')||isAbsolute(part))throw Error('outside');
        const bytes=await readFile(file),mime:Record<string,string>={'.html':'text/html','.js':'application/javascript','.css':'text/css','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
        res.writeHead(200,{'Content-Type':mime[extname(file)]??'text/plain','Cache-Control':'no-store'});res.end(bytes);
      }catch{res.writeHead(404);res.end('not found');}
    });
    await new Promise<void>((done,fail)=>{server!.once('error',fail);server!.listen(port,'127.0.0.1',()=>{port=(server!.address()as {port:number}).port;done();});});
  };
  const stop=async()=>{const owned=server;server=undefined;if(owned){owned.closeAllConnections();await new Promise<void>((done,fail)=>owned.close(error=>error?fail(error):done()));}};
  await start();return{get url(){return`http://127.0.0.1:${port}${base}`;},requests,stop,start,setRoot(path:string){root=resolve(path);},setFault(value:typeof fault){fault=value;}};
}
