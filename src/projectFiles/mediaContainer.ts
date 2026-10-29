import { checkFileLimits, fileError, type FileValidationLimits } from './validation';
import { avcSps, avcSample } from './avcMedia';

export const mediaInvalid = (): never => fileError('動画・音声の構造か圧縮方式に対応していません。MP4（H.264/AAC）、M4A（AAC）、MP3を選択してください。');
export const mediaText = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));
export interface MediaBox { readonly type: string; readonly start: number; readonly end: number }
/** Bounded ISO-BMFF framing, shared by the approved local media readers. */
export function mediaBoxes(bytes: Uint8Array, limits: FileValidationLimits) {
  checkFileLimits(limits); if (!bytes.length || bytes.length > limits.maxFileBytes || bytes.length > limits.maxValues) return mediaInvalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let items = 0, work = bytes.length;
  const charge = (n = 1) => { work += n; if (!Number.isSafeInteger(work) || work > limits.maxValues) mediaInvalid(); };
  const range = (at: number, n: number, end = bytes.length) => { if (!Number.isSafeInteger(n) || n < 0 || at < 0 || at + n > end) mediaInvalid(); };
  const u32 = (at: number, end = bytes.length) => { range(at, 4, end); return view.getUint32(at); };
  const u64 = (at: number, end = bytes.length) => { const hi = u32(at, end), lo = u32(at + 4, end), value = hi * 4294967296 + lo; if (!Number.isSafeInteger(value)) mediaInvalid(); return value; };
  const boxes = (at: number, end: number): MediaBox[] => {
    const result: MediaBox[] = [];
    while (at < end) { if (++items > limits.maxItems) mediaInvalid(); range(at, 8, end);
      let size = u32(at, end), header = 8; const type = mediaText(bytes, at + 4, 4);
      if (size === 1) { size = u64(at + 8, end); header = 16; }
      else if (!size) size = end - at;
      if (size < header || at + size > end || !/^[\x20-\x7e]{4}$/.test(type)) mediaInvalid();
      result.push({ type, start: at + header, end: at + size }); at += size; charge();
    } return result;
  };
  const one = (list: readonly MediaBox[], type: string) => { const found = list.filter(b => b.type === type); if (found.length !== 1) return mediaInvalid(); return found[0]!; };
  const full = (box: MediaBox, version = 0) => { range(box.start, 4, box.end); if (bytes[box.start] !== version || u32(box.start) % 16777216) mediaInvalid(); return box.start + 4; };
  return { view, range, u32, u64, boxes, one, full, charge };
}

export interface TimedMediaShape { readonly mediaKind: 'video' | 'audio'; readonly mediaType: 'video/mp4' | 'audio/mp4' | 'audio/mpeg'; readonly duration: number; readonly width?: number; readonly height?: number }

function mp3(bytes: Uint8Array, limits: FileValidationLimits): TimedMediaShape {
  checkFileLimits(limits); if (!bytes.length || bytes.length > limits.maxFileBytes || bytes.length > limits.maxValues) return mediaInvalid();
  let at = 0, end = bytes.length, frames = 0, duration = 0, sampleRate = 0, version = 0;
  if (mediaText(bytes, 0, 3) === 'ID3') {
    if (bytes.length < 10 || ![2,3,4].includes(bytes[3]!) || bytes[4] === 255 || bytes[5]! & (bytes[3] === 4 ? 15 : bytes[3] === 3 ? 31 : 63)) return mediaInvalid();
    let size = 0; for (let p = 6; p < 10; p++) { if (bytes[p]! & 128) return mediaInvalid(); size = size * 128 + bytes[p]!; }
    at = 10 + size; if (bytes[5]! & 16) { if (bytes[3] !== 4 || mediaText(bytes, at, 3) !== '3DI') return mediaInvalid(); at += 10; }
    if (at > end) return mediaInvalid();
  }
  if (end >= 128 && mediaText(bytes, end - 128, 3) === 'TAG') end -= 128;
  const rates1 = [0,32,40,48,56,64,80,96,112,128,160,192,224,256,320], rates2 = [0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
  while (at < end) {
    if (at + 4 > end || bytes[at] !== 255 || (bytes[at + 1]! & 224) !== 224 || ++frames > limits.maxItems || bytes.length + frames * 4 > limits.maxValues) return mediaInvalid();
    const a = bytes[at + 1]!, b = bytes[at + 2]!, c = bytes[at + 3]!, v = a >> 3 & 3, bitrate = b >> 4, rate = b >> 2 & 3;
    if (![2,3].includes(v) || (a >> 1 & 3) !== 1 || bitrate === 0 || bitrate === 15 || rate === 3 || (c & 3) === 2) return mediaInvalid();
    const hz = [44100,48000,32000][rate]! / (v === 3 ? 1 : 2), kbps = (v === 3 ? rates1 : rates2)[bitrate]!;
    if (sampleRate && (sampleRate !== hz || version !== v)) return mediaInvalid(); sampleRate = hz; version = v;
    const size = Math.floor((v === 3 ? 144000 : 72000) * kbps / hz) + (b >> 1 & 1), side = (c >> 6) === 3 ? (v === 3 ? 17 : 9) : (v === 3 ? 32 : 17);
    if (size < 4 + (a & 1 ? 0 : 2) + side || at + size > end) return mediaInvalid();
    at += size; duration += (v === 3 ? 1152 : 576) / hz;
  }
  if (!frames || !Number.isFinite(duration) || duration <= 0) return mediaInvalid();
  return { mediaKind: 'audio', mediaType: 'audio/mpeg', duration };
}

/** Complete sample-table/range inspection; compressed samples are decoded by the browser. */
export function timedMediaStructure(bytes: Uint8Array, limits: FileValidationLimits): TimedMediaShape {
  if (mediaText(bytes, 0, 3) === 'ID3' || bytes[0] === 255 && (bytes[1]! & 224) === 224) return mp3(bytes, limits);
  const r = mediaBoxes(bytes, limits), { boxes, one, u32, u64, range, full, charge, view } = r, top = boxes(0, bytes.length);
  if (top.some(b => !['ftyp','moov','mdat','free','skip','wide','uuid'].includes(b.type))) return mediaInvalid();
  const ftyp = one(top, 'ftyp'); range(ftyp.start, 8, ftyp.end); if ((ftyp.end - ftyp.start) % 4) return mediaInvalid();
  const brandCount=(ftyp.end-ftyp.start-4)/4;if(brandCount>limits.maxItems)return mediaInvalid();
  const knownBrand=(at:number)=>{charge();return ['isom','iso2','mp41','mp42','M4A ','avc1'].includes(mediaText(bytes,at,4));};
  let supportedBrand=knownBrand(ftyp.start);for(let p=ftyp.start+8;p<ftyp.end;p+=4){const known=knownBrand(p);supportedBrand ||= known;}
  if (!supportedBrand) return mediaInvalid();
  const data = top.filter(b => b.type === 'mdat'); if (!data.length) return mediaInvalid();
  const moov = boxes(one(top,'moov').start,one(top,'moov').end); if (moov.some(b=>['mvex','pssh'].includes(b.type))) return mediaInvalid();
  one(moov,'mvhd'); const tracks=moov.filter(b=>b.type==='trak'); if(!tracks.length||tracks.length>2)return mediaInvalid();
  const occupied: [number,number][] = []; let video: {width:number;height:number}|undefined, audio=false, duration=0;
  for(const track of tracks){
    const tc=boxes(track.start,track.end); if(tc.some(b=>['tref','senc'].includes(b.type)))return mediaInvalid(); one(tc,'tkhd');
    const md=one(tc,'mdia'), mc=boxes(md.start,md.end), hd=one(mc,'hdlr'); range(hd.start,12,hd.end);
    const handler=mediaText(bytes,hd.start+8,4);if(!['vide','soun'].includes(handler)||handler==='vide'&&video||handler==='soun'&&audio)return mediaInvalid();
    const mh=one(mc,'mdhd'), ver=bytes[mh.start]; if(ver!==0&&ver!==1)return mediaInvalid();full(mh,ver);
    const timeAt=mh.start+(ver?20:12), timescale=u32(timeAt,mh.end), declared=ver?u64(timeAt+4,mh.end):u32(timeAt+4,mh.end);if(!timescale||!declared)return mediaInvalid();
    const minf=one(mc,'minf'), mi=boxes(minf.start,minf.end), dinf=one(mi,'dinf'), dr=one(boxes(dinf.start,dinf.end),'dref'), dp=full(dr);
    if(u32(dp,dr.end)!==1)return mediaInvalid(); const urls=boxes(dp+4,dr.end);if(urls.length!==1||urls[0]!.type!=='url '||urls[0]!.end-urls[0]!.start!==4||u32(urls[0]!.start)!==1)return mediaInvalid();
    const st=one(mi,'stbl'), sc=boxes(st.start,st.end); if(sc.some(b=>['senc','saiz','saio','stz2'].includes(b.type)))return mediaInvalid();
    const sd=one(sc,'stsd'), sp=full(sd); if(u32(sp,sd.end)!==1)return mediaInvalid(); const entries=boxes(sp+4,sd.end);if(entries.length!==1)return mediaInvalid();const sample=entries[0]!, p=sample.start;
    range(p,8,sample.end);if(view.getUint16(p+6)!==1||bytes.subarray(p,p+6).some(n=>n!==0))return mediaInvalid();
    let videoSamples: {lengthBytes:number;sets:Uint8Array[]}|undefined;
    if(handler==='vide'){
      if(sample.type!=='avc1')return mediaInvalid();range(p,78,sample.end);const width=view.getUint16(p+24),height=view.getUint16(p+26);if(!width||!height||width*height>limits.maxPixels)return mediaInvalid();charge(width*height);
      const vc=boxes(p+78,sample.end), av=one(vc,'avcC'), a=av.start;range(a,7,av.end);
      if(bytes[a]!==1||![66,77,88,100].includes(bytes[a+1]!)||(bytes[a+4]!&252)!==252||(bytes[a+4]!&3)===2||(bytes[a+5]!&224)!==224)return mediaInvalid();
      const sets:Uint8Array[]=[];let q=a+6;const nal=(count:number,sps=false)=>{if(!count)return mediaInvalid();for(let i=0;i<count;i++){range(q,2,av.end);const n=view.getUint16(q);q+=2;range(q,n,av.end);if(!n)return mediaInvalid();const body=bytes.subarray(q,q+n);if(sps){const shape=avcSps(body);if(shape.width!==width||shape.height!==height||shape.profile!==bytes[a+1]||shape.codedWidth*shape.codedHeight>limits.maxPixels)return mediaInvalid();}else if((body[0]!&159)!==8)return mediaInvalid();sets.push(body);q+=n;charge(n);}};nal(bytes[a+5]!&31,true);range(q,1,av.end);nal(bytes[q++]!);
      if(q<av.end){if(bytes[a+1]!==100||av.end-q<4||bytes[q]!==253||bytes[q+1]!==248||bytes[q+2]!==248)return mediaInvalid();q+=3;const n=bytes[q++]!;if(n)nal(n);}if(q!==av.end)return mediaInvalid();
      for(const color of vc.filter(c=>c.type==='colr')){const t=mediaText(bytes,color.start,4);if(!['nclx','nclc'].includes(t))return mediaInvalid();range(color.start,10,color.end);if(![1,2,5,6,13].includes(view.getUint16(color.start+6)))return mediaInvalid();}
      if(vc.some(c=>['sinf','mdcv','clli'].includes(c.type)))return mediaInvalid();video={width,height};videoSamples={lengthBytes:(bytes[a+4]!&3)+1,sets};
    }else{
      if(sample.type!=='mp4a')return mediaInvalid();range(p,28,sample.end);if(view.getUint16(p+8)!==0||![1,2].includes(view.getUint16(p+16)))return mediaInvalid();
      const es=one(boxes(p+28,sample.end),'esds'), ep=full(es);
      const desc=(at:number,end:number,tag:number)=>{range(at,2,end);if(bytes[at++]!==tag)return mediaInvalid();let n=0,k=0,b:number;do{range(at,1,end);b=bytes[at++]!;n=n*128+(b&127);if(++k>4)return mediaInvalid();}while(b&128);range(at,n,end);return{start:at,end:at+n};};
      const e=desc(ep,es.end,3);if(e.end!==es.end)return mediaInvalid();range(e.start,3,e.end);if(bytes[e.start+2]!==0)return mediaInvalid();const d=desc(e.start+3,e.end,4);range(d.start,13,d.end);
      if(bytes[d.start]!==64||bytes[d.start+1]!==21)return mediaInvalid();const asc=desc(d.start+13,d.end,5);if(asc.end!==d.end||asc.end-asc.start<2)return mediaInvalid();
      const a=bytes[asc.start]!, b=bytes[asc.start+1]!, hzIndex=(a&7)*2+(b>>7), channels=b>>3&15;
      if(a>>3!==2||hzIndex>12||![1,2].includes(channels)||(b&7)||channels!==view.getUint16(p+16))return mediaInvalid();
      // AAC-LC with the optional standard disabled-SBR sync extension only.
      if(asc.end-asc.start!==2&&!(asc.end-asc.start===5&&bytes[asc.start+2]===86&&bytes[asc.start+3]===229&&bytes[asc.start+4]===0))return mediaInvalid();
      const sl=desc(d.end,e.end,6);if(sl.end!==e.end||sl.end-sl.start!==1||bytes[sl.start]!==2)return mediaInvalid();audio=true;
    }
    const sz=one(sc,'stsz'), zp=full(sz), fixed=u32(zp,sz.end), count=u32(zp+4,sz.end);if(!count||count>limits.maxItems||sz.end!==zp+8+(fixed?0:count*4))return mediaInvalid();charge(count);
    const sizes=Array.from({length:count},(_,i)=>fixed||u32(zp+8+i*4,sz.end));if(sizes.some(n=>!n))return mediaInvalid();
    const groups=new Map<string,number>();for(const group of sc.filter(b=>b.type==='sgpd')){const v=bytes[group.start]!;if(v!==1)return mediaInvalid();const gp=full(group,1),type=mediaText(bytes,gp,4),n=u32(gp+8,group.end);if(!['roll','prol'].includes(type)||groups.has(type)||u32(gp+4)!==2||n>count||group.end!==gp+12+n*2)return mediaInvalid();groups.set(type,n);charge(n);}
    for(const group of sc.filter(b=>b.type==='sbgp')){const v=bytes[group.start]!;if(v!==0&&v!==1)return mediaInvalid();const gp=full(group,v),type=mediaText(bytes,gp,4),at=gp+(v?8:4),n=u32(at,group.end);if(!groups.has(type)||v&&u32(gp+4)!==0||n>count||group.end!==at+4+n*8)return mediaInvalid();let samples=0;for(let i=0;i<n;i++){const size=u32(at+4+i*8),index=u32(at+8+i*8);if(!size||index>groups.get(type)!)return mediaInvalid();samples+=size;}if(samples!==count)return mediaInvalid();charge(n);}
    const offsets=sc.filter(b=>b.type==='stco'||b.type==='co64');if(offsets.length!==1)return mediaInvalid();const off=offsets[0]!,op=full(off),chunks=u32(op,off.end),stride=off.type==='stco'?4:8;
    if(!chunks||chunks>limits.maxItems||off.end!==op+4+chunks*stride)return mediaInvalid();charge(chunks);
    const mapping=one(sc,'stsc'), mp=full(mapping), maps=u32(mp,mapping.end);if(!maps||maps>chunks||mapping.end!==mp+4+maps*12)return mediaInvalid();
    const rows=Array.from({length:maps},(_,i)=>{const at=mp+4+i*12;return{first:u32(at),samples:u32(at+4),description:u32(at+8)};});
    if(rows[0]!.first!==1||rows.some((x,i)=>!x.samples||x.description!==1||x.first>chunks||i>0&&x.first<=rows[i-1]!.first))return mediaInvalid();
    let index=0,row=0;for(let i=0;i<chunks;i++){while(row+1<rows.length&&rows[row+1]!.first<=i+1)row++;const n=rows[row]!.samples;if(n>count-index)return mediaInvalid();const start=stride===4?u32(op+4+i*stride):u64(op+4+i*stride);let length=0;for(let j=0;j<n;j++){const size=sizes[index++]!;if(videoSamples){range(start+length,size);avcSample(bytes,start+length,start+length+size,videoSamples.lengthBytes,videoSamples.sets,charge);charge(size);}length+=size;}const end=start+length;
      if(!Number.isSafeInteger(end)||!data.some(b=>{charge();return start>=b.start&&end<=b.end;}))return mediaInvalid();occupied.push([start,end]);}
    if(index!==count)return mediaInvalid();
    const time=one(sc,'stts'), tp=full(time), ts=u32(tp,time.end);if(!ts||ts>count||time.end!==tp+4+ts*8)return mediaInvalid();let total=0,ticks=0;
    for(let i=0;i<ts;i++){const n=u32(tp+4+i*8),delta=u32(tp+8+i*8);if(!n||!delta)return mediaInvalid();total+=n;ticks+=n*delta;}if(total!==count||!Number.isSafeInteger(ticks)||ticks!==declared)return mediaInvalid();duration=Math.max(duration,ticks/timescale);
    for(const extra of sc.filter(b=>b.type==='ctts'||b.type==='stss')){const xp=full(extra,extra.type==='ctts'&&bytes[extra.start]===1?1:0),n=u32(xp,extra.end),step=extra.type==='ctts'?8:4;if(n>count||extra.end!==xp+4+n*step)return mediaInvalid();let seen=0,last=0;for(let i=0;i<n;i++){const v=u32(xp+4+i*step);if(extra.type==='ctts'){if(!v)return mediaInvalid();seen+=v;}else{if(v<=last||v>count)return mediaInvalid();last=v;}}if(extra.type==='ctts'&&seen!==count)return mediaInvalid();}
  }
  occupied.sort((a,b)=>a[0]-b[0]);if(occupied.some((r,i)=>i>0&&r[0]<occupied[i-1]![1])||!Number.isFinite(duration)||duration<=0)return mediaInvalid();
  return video?{mediaKind:'video',mediaType:'video/mp4',duration,...video}:{mediaKind:'audio',mediaType:'audio/mp4',duration};
}
