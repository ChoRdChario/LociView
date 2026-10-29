import { mediaBoxes, mediaText } from './mediaContainer';
import { fileError, type FileValidationLimits } from './validation';
import { hevcSps, hevcNal } from './hevcMedia';

export const heicGuidance = 'このブラウザでは、このHEIC/HEIF画像を読み込めません。元の画像を残し、端末で別のJPEGを書き出して選び直してください。';
const bad=():never=>fileError(heicGuidance);
export const isHeic=(b:Uint8Array)=>{if(mediaText(b,4,4)!=='ftyp'||b.length<16)return false;const n=new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(0);const brands=['heic','heix','hevc','hevx','heim','heis','hevm','hevs','mif1','msf1'];for(let p=8;p+4<=Math.min(n,b.length,128);p+=4)if(p!==12&&brands.includes(mediaText(b,p,4)))return true;return false;};

/** Self-contained single-primary HEIF item graph; auxiliary/depth/thumbnail items remain intact. */
export function heicStructure(bytes:Uint8Array,limits:FileValidationLimits){
  if(!isHeic(bytes))return bad();const{boxes,one,u32,u64,range,view,charge}=mediaBoxes(bytes,limits),top=boxes(0,bytes.length);
  if(top.some(b=>!['ftyp','meta','mdat','free','skip','uuid'].includes(b.type)))return bad();
  const meta=one(top,'meta');if(u32(meta.start)!==0)return bad();const mc=boxes(meta.start+4,meta.end),pitm=one(mc,'pitm');range(pitm.start,6,pitm.end);
  const version=bytes[pitm.start];if((version!==0&&version!==1)||u32(pitm.start)%16777216)return bad();const primary=version?u32(pitm.start+4,pitm.end):view.getUint16(pitm.start+4);
  if(mc.some(b=>['ipro','dinf'].includes(b.type)))return bad();const info=one(mc,'iinf');range(info.start,6,info.end);const iv=bytes[info.start];if(iv!==0&&iv!==1)return bad();const count=iv?u32(info.start+4,info.end):view.getUint16(info.start+4),entries=boxes(info.start+(iv?8:6),info.end);if(entries.length!==count||!count)return bad();
  const types=new Map<number,string>();for(const entry of entries){if(entry.type!=='infe')return bad();const p=entry.start,v=bytes[p];if(v!==2&&v!==3)return bad();const id=v===2?view.getUint16(p+4):u32(p+4,entry.end),off=p+(v===2?6:8);range(off,6,entry.end);if(types.has(id)||view.getUint16(off)!==0)return bad();const type=mediaText(bytes,off+2,4);if(!['hvc1','grid','Exif','mime'].includes(type))return bad();types.set(id,type);}
  if(!['hvc1','grid'].includes(types.get(primary)!))return bad();
  const locations=new Map<number,Uint8Array>(),iloc=one(mc,'iloc'),lp=iloc.start,lv=bytes[lp];if(![0,1,2].includes(lv!)||u32(lp)%16777216)return bad();range(lp,6,iloc.end);
  const offsetSize=bytes[lp+4]!>>4,lengthSize=bytes[lp+4]!&15,baseSize=bytes[lp+5]!>>4,indexSize=lv?bytes[lp+5]!&15:0;
  if([offsetSize,lengthSize,baseSize,indexSize].some(n=>![0,4,8].includes(n)))return bad();let at=lp+6;
  const number=(n:number)=>{range(at,n,iloc.end);const value=n===8?u64(at,iloc.end):n===4?u32(at,iloc.end):0;at+=n;return value;};
  const read16=()=>{range(at,2,iloc.end);const v=view.getUint16(at);at+=2;return v;};const lc=lv===2?number(4):read16();if(lc!==types.size)return bad();
  const idat=mc.filter(b=>b.type==='idat');if(idat.length>1)return bad();
  for(let i=0;i<lc;i++){const id=lv===2?number(4):read16(),method=lv?read16():0,ref=read16(),base=number(baseSize),n=read16();if(!types.has(id)||locations.has(id)||ref||method>1||!n||n>limits.maxItems)return bad();let size=0;const parts:Uint8Array[]=[];
    for(let j=0;j<n;j++){if(indexSize&&number(indexSize)!==0)return bad();let offset=base+number(offsetSize);const length=number(lengthSize);if(!length)return bad();if(method===1){if(!idat.length)return bad();offset+=idat[0]!.start;if(offset+length>idat[0]!.end)return bad();}else if(!top.some(b=>{charge();return b.type==='mdat'&&offset>=b.start&&offset+length<=b.end;}))return bad();range(offset,length);size+=length;charge(length);parts.push(bytes.subarray(offset,offset+length));}
    if(size>limits.maxFileBytes)return bad();const body=new Uint8Array(size);let dest=0;for(const part of parts){body.set(part,dest);dest+=part.length;}locations.set(id,body);
  }if(at!==iloc.end)return bad();
  const iprp=one(mc,'iprp'),pc=boxes(iprp.start,iprp.end),ipco=one(pc,'ipco'),properties=boxes(ipco.start,ipco.end),associations=new Map<number,number[]>();
  for(const ipma of pc.filter(b=>b.type==='ipma')){let p=ipma.start;const v=bytes[p]!,flags=u32(p)%16777216;if(v>1||flags>1)return bad();p+=4;const n=u32(p,ipma.end);p+=4;if(n>limits.maxItems)return bad();
    for(let i=0;i<n;i++){range(p,v?4:2,ipma.end);const id=v?u32(p):view.getUint16(p);p+=v?4:2;range(p,1,ipma.end);const c=bytes[p++]!,values=associations.get(id)??[];if(!types.has(id))return bad();for(let j=0;j<c;j++){range(p,flags?2:1,ipma.end);const raw=flags?view.getUint16(p):bytes[p]!;p+=flags?2:1;const index=raw&(flags?32767:127);if(index>properties.length)return bad();if(index){const prop=properties[index-1]!;if(raw&(flags?32768:128)&&!['ispe','hvcC','pixi','clap','irot','imir','colr','auxC','pasp'].includes(prop.type))return bad();values.push(index);}}associations.set(id,values);}
    if(p!==ipma.end)return bad();
  }
  const shapes=new Map<number,{width:number;height:number}>();for(const[id,type]of types){if(!['hvc1','grid'].includes(type))continue;const ps=(associations.get(id)??[]).map(i=>properties[i-1]!),ispe=one(ps,'ispe');if(u32(ispe.start)!==0||ispe.end-ispe.start!==12)return bad();const width=u32(ispe.start+4),height=u32(ispe.start+8);if(!width||!height||width*height>limits.maxPixels)return bad();charge(width*height);
    if(type==='hvc1'){const cfg=one(ps,'hvcC');range(cfg.start,23,cfg.end);if(bytes[cfg.start]!==1)return bad();let p=cfg.start+23,sps=0;const arrays=bytes[cfg.start+22]!;for(let i=0;i<arrays;i++){range(p,3,cfg.end);const type=bytes[p++]!&63,n=view.getUint16(p);p+=2;if(![32,33,34,39,40].includes(type)||!n||n>limits.maxItems)return bad();for(let j=0;j<n;j++){range(p,2,cfg.end);const len=view.getUint16(p);p+=2;range(p,len,cfg.end);if(!len)return bad();hevcNal(bytes.subarray(p,p+len),type);if(type===33){const shape=hevcSps(bytes.subarray(p,p+len));if(shape.width!==width||shape.height!==height||shape.codedWidth*shape.codedHeight>limits.maxPixels)return bad();sps++;}charge(len);p+=len;}}if(p!==cfg.end||!sps)return bad();
      const body=locations.get(id)!,lengthBytes=(bytes[cfg.start+21]!&3)+1;let q=0;while(q<body.length){if(q+lengthBytes>body.length)return bad();let n=0;for(let k=0;k<lengthBytes;k++)n=n*256+body[q++]!;if(n<2||q+n>body.length)return bad();hevcNal(body.subarray(q,q+n));const type=body[q]!>>1&63;if(type>31&&![35,38,39,40].includes(type))return bad();q+=n;charge();}
    }shapes.set(id,{width,height});}
  const references=new Map<number,number[]>(),children=new Map<number,Set<number>>();const child=(parent:number,id:number)=>{if(!shapes.has(parent)||!shapes.has(id))return bad();const set=children.get(parent)??new Set();set.add(id);children.set(parent,set);};
  for(const ref of mc.filter(b=>b.type==='iref')){const v=bytes[ref.start];if(v!==0&&v!==1||u32(ref.start)%16777216)return bad();for(const rel of boxes(ref.start+4,ref.end)){let p=rel.start;const wide=v===1;range(p,wide?4:2,rel.end);const id=wide?u32(p,rel.end):view.getUint16(p);p+=wide?4:2;range(p,2,rel.end);const n=view.getUint16(p);p+=2;const targets:number[]=[];for(let i=0;i<n;i++){range(p,wide?4:2,rel.end);targets.push(wide?u32(p):view.getUint16(p));p+=wide?4:2;}if(p!==rel.end||!types.has(id)||targets.some(id=>!types.has(id))||!['dimg','thmb','auxl','cdsc','prem'].includes(rel.type))return bad();
      if(rel.type==='dimg'){if(types.get(id)!=='grid'||references.has(id))return bad();references.set(id,targets);for(const t of targets)child(id,t);}
      if(rel.type==='thmb'||rel.type==='auxl'){if(id===primary||targets.length!==1)return bad();child(targets[0]!,id);}
    }}
  for(const[id,type]of types)if(type==='grid'){const body=locations.get(id)!;if(body.length<8||body[0]!==0||body[1]!>1)return bad();const wide=body[1]===1;if(body.length!==(wide?12:8))return bad();const dv=new DataView(body.buffer,body.byteOffset,body.byteLength),width=wide?dv.getUint32(4):dv.getUint16(4),height=wide?dv.getUint32(8):dv.getUint16(6),shape=shapes.get(id)!,tiles=references.get(id);if(width!==shape.width||height!==shape.height||!tiles||tiles.length!==(body[2]!+1)*(body[3]!+1)||tiles.some(t=>types.get(t)!=='hvc1'))return bad();}
  const visited=new Set<number>(),visiting=new Set<number>();const stack:[number,boolean][]=[[primary,false]];while(stack.length){const[id,exit]=stack.pop()!;if(exit){visiting.delete(id);visited.add(id);continue;}if(visiting.has(id))return bad();if(visited.has(id))continue;visiting.add(id);stack.push([id,true]);for(const c of children.get(id)??[])stack.push([c,false]);charge();}
  if(visited.size!==shapes.size)return bad();
  return shapes.get(primary)!;
}
