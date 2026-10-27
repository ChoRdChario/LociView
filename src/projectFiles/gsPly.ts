import { NativeSha256 } from '../nativeGs/sha256';
import sourceText from '../../docs/specs/profiles/gs-ply-f32le-sh0-4-1.profile.json?raw';
import goldenText from '../../docs/specs/profiles/gs-ply-f32le-sh0-4-1.goldens.json?raw';
import { gsSourceDeclaration, gsActivatedGeometry, gsTransformGeometry, gsRotation, gsOpacity, gsLinear } from '../domain/gsSource';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';

export interface GsInspection {
  readonly kind: 'gs'; readonly degree: number; readonly count: number;
  readonly digest: string; readonly byteLength: number;
  readonly headerBytes: number; readonly stride: number;
  readonly displayIssue: string | null;
  readonly bounds: { min: number[]; max: number[] }; readonly materials: readonly JsonObject[]; readonly surfaceRanges: readonly JsonObject[];
  readonly jpeg?: never; readonly occurrences?: never;
}
export type ValidatedGsBytes = GsInspection & { readonly bytes: Uint8Array; readonly file?: never };
export type ValidatedGsFile = GsInspection & { readonly file: Blob; readonly bytes?: never };
export type ValidatedGs = ValidatedGsBytes | ValidatedGsFile;
type GsContext = { readonly representationToAsset: JsonObject; readonly logicalBoundsAsset?: JsonObject };
const fail = (): never => fileError('完全なSH0〜4属性を持つbinary little-endian PLYを確認してください。');
const spec = JSON.parse(sourceText);
let checked: Promise<JsonObject> | undefined;
export function gsSourceProfile(): Promise<JsonObject> {
  return checked ??= (async () => {
    const hash = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map(n=>n.toString(16).padStart(2,'0')).join('');
    if (await hash(sourceText) !== gsSourceDeclaration.specificationSha256 || spec.id !== gsSourceDeclaration.id ||
      await hash(goldenText) !== spec.goldens.sha256) return fail();
    return gsSourceDeclaration;
  })();
}
/** Bounded content signature only. Partial GS must never fall through to ordinary points. */
export function hasGsPlySignature(bytes: Uint8Array): boolean {
  const prefix = new TextDecoder('ascii').decode(bytes.subarray(0,Math.min(bytes.length,65536)));
  const end = prefix.search(/(?:^|\r?\n)end_header\r?\n/);
  return /(?:^|\r?\n)property[^\r\n]* (?:opacity|scale_[^\s]*|rot_[^\s]*|f_dc_[^\s]*|f_rest_[^\s]*)(?:\r?\n|$)/.test(end < 0 ? prefix : prefix.slice(0,end));
}
export function gsPropertyNames(degree: number): string[] {
  return ['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2',...Array.from({length:3*((degree+1)**2-1)},(_,i)=>`f_rest_${i}`),
    'opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
}
export function adjacentGsBound(value: number, up: boolean): number {
  if (!Number.isFinite(value)) return fail();
  if (value === 0) return up ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const d = new DataView(new ArrayBuffer(8)); d.setFloat64(0,value,false);
  const bits = d.getBigUint64(0,false); d.setBigUint64(0,bits + ((value > 0) === up ? 1n : -1n),false);
  const n = d.getFloat64(0,false); return Number.isFinite(n) ? n === 0 ? 0 : n : fail();
}
const GS_CHUNK_BYTES = 65536;
const ownContext = (context?: GsContext) => context &&
  cloneCanonicalValue(context,{maxNodes:256,maxDepth:16,maxStringScalars:1000}) as unknown as GsContext;

/** Native immutable range, captured before any asynchronous inspection. */
export function captureGsBlob(input: Blob): Blob {
  return Blob.prototype.slice.call(input,0,input.size,input.type);
}
/** Bound the producer itself, including platforms whose native stream chunks vary. */
export function gsBlobStream(file: Blob): ReadableStream<Uint8Array> {
  let offset=0,cancelled=false;
  return new ReadableStream<Uint8Array>({async pull(controller){
    if(offset===file.size){controller.close();return;}
    const end=Math.min(file.size,offset+GS_CHUNK_BYTES);
    const bytes=new Uint8Array(await Blob.prototype.slice.call(file,offset,end).arrayBuffer());
    if(cancelled)return;
    if(bytes.length!==end-offset)throw Error('GS source read changed');
    offset=end;controller.enqueue(bytes);
  },cancel(){cancelled=true;}},{highWaterMark:0});
}

/** Existing byte API owns input and context synchronously; original bits are returned. */
export async function inspectGsPly(input: Uint8Array, limits: FileValidationLimits, context?: GsContext): Promise<ValidatedGsBytes> {
  checkFileLimits(limits);
  if(input.byteLength>limits.maxFileBytes)return fileError('GSがこの検証の上限を超えています。');
  const bytes=input.slice(),captured=ownContext(context);
  let offset=0;
  const stream=new ReadableStream<Uint8Array>({pull(c){
    if(offset===bytes.length){c.close();return;}
    const end=Math.min(bytes.length,offset+GS_CHUNK_BYTES);c.enqueue(bytes.subarray(offset,end));offset=end;
  }},{highWaterMark:0});
  return {...await inspectGsPlyStream({size:bytes.length,stream:()=>stream},limits,captured),bytes};
}
export async function inspectGsPlyFile(input: Blob, limits: FileValidationLimits, context?: GsContext, signal?: AbortSignal): Promise<ValidatedGsFile> {
  const file=captureGsBlob(input),captured=ownContext(context);
  return {...await inspectGsPlyStream({size:file.size,stream:()=>gsBlobStream(file)},limits,captured,signal),file};
}

function parseGsHeader(bytes: Uint8Array, byteLength: number, limits: FileValidationLimits) {
  let offset = 0, crlf: boolean | undefined;
  const line = () => {
    const begin=offset; while (offset<bytes.length && bytes[offset]!==10 && offset<65536) offset++;
    if (offset===bytes.length || offset>=65536) return fail();
    const cr = bytes[offset-1]===13;
    if (crlf!==undefined && crlf!==cr) return fail(); crlf=cr;
    let text=''; for (let i=begin;i<offset-(cr?1:0);i++) { const n=bytes[i]!; if (n!==9 && (n<32 || n>126)) return fail(); text+=String.fromCharCode(n); }
    offset++; return text;
  };
  if (line()!=='ply' || line()!=='format binary_little_endian 1.0') return fail();
  let count: number | undefined; const properties: string[]=[];
  for (;;) {
    const text=line(); if (text==='end_header') break;
    if (/^(comment|obj_info)([ \t].*)?$/.test(text)) continue;
    if (/^element vertex [0-9]+$/.test(text) && count===undefined && properties.length===0) {
      count=Number(text.slice(15));
      if (!Number.isSafeInteger(count) || count<1 || count>0xffffffff || count>limits.maxItems) return fileError('GSの点数がこの検証の上限を超えています。');
    } else if (/^property float [a-zA-Z0-9_]+$/.test(text) && count!==undefined && properties.length<89) properties.push(text.slice(15));
    else return fail();
  }
  const degree=[0,1,2,3,4].find(d=>properties.join('|')===gsPropertyNames(d).join('|'));
  if (degree===undefined || count===undefined) return fail();
  const stride=properties.length*4, scalars=count*properties.length, size=count*stride;
  if (!Number.isSafeInteger(size) || scalars>limits.maxValues || size!==byteLength-offset) return fail();
  return {offset,degree,count,stride,properties};
}

/** Complete inspection and incremental hash; no retained whole-source array. */
export async function inspectGsPlyStream(input: {readonly size:number;stream():ReadableStream<Uint8Array>},
  limits: FileValidationLimits, context?: GsContext, signal?: AbortSignal): Promise<GsInspection> {
  checkFileLimits(limits);
  const byteLength=input.size;
  if(!Number.isSafeInteger(byteLength)||byteLength<=0||byteLength>limits.maxFileBytes)return fileError('GSがこの検証の上限を超えています。');
  context=ownContext(context);signal?.throwIfAborted();
  const reader=input.stream().getReader(),hash=new NativeSha256();
  let pending=new Uint8Array(0),at=0,observed=0,reads=0;
  const abort=()=>signal?.throwIfAborted();
  const onAbort=()=>{void reader.cancel(signal?.reason).catch(()=>{});};
  signal?.addEventListener('abort',onAbort,{once:true});
  const available=async()=>{
    while(at===pending.length){
      abort();const next=await reader.read();abort();
      if(++reads>byteLength+1)return fail(); // Includes empty chunks and final EOF.
      if(next.done){if(observed!==byteLength)return fail();return false;}
      if(!(next.value instanceof Uint8Array)||next.value.length>GS_CHUNK_BYTES||next.value.length>byteLength-observed)return fail();
      pending=next.value.slice();at=0;observed+=pending.length;hash.update(pending);
    }
    return true;
  };
  try {
    await gsSourceProfile();abort();
    const header=new Uint8Array(65536);let length=0,lineStart=0;
    for(;;){
      if(!await available()||length===header.length)return fail();
      const value=pending[at++]!;header[length++]=value;
      if(value===10){
        let end=length-1;if(header[end-1]===13)end--;
        const text=String.fromCharCode(...header.subarray(lineStart,end));lineStart=length;
        if(text==='end_header')break;
      }
    }
    const {offset,degree,count,stride,properties}=parseGsHeader(header.subarray(0,length),byteLength,limits);
    const record=new Uint8Array(stride),view=new DataView(record.buffer);
    const readRecord=async(target:Uint8Array)=>{
      let copied=0;
      while(copied<target.length){
        if(!await available())return fail();
        const take=Math.min(target.length-copied,pending.length-at);
        target.set(pending.subarray(at,at+take),copied);at+=take;copied+=take;
      }
    };
  const transform=context?.representationToAsset ?? { translation:[0,0,0], rotationXYZW:[0,0,0,1], uniformScale:1, reflection:'none' };
  const fields=new ProjectRecordFields(); fields.transform(transform,[],true); if(fields.unknown) return fail();
  const q=transform.rotationXYZW as number[], rotation=gsRotation([q[3]!,q[0]!,q[1]!,q[2]!]), scale=transform.uniformScale as number;
  const linear=rotation.map(r=>r.map((v,k)=>(scale*v)*(transform.reflection==='x' && k===0?-1:1)));
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity], sizes=[1,1,1];
  let nonempty=false,displayIssue:string|null=null; const rest=3*((degree+1)**2-1), end=9+rest;
  for(let row=0;row<count;row++) {
    await readRecord(record);
    try {
      const v=Array.from({length:properties.length},(_,k)=>view.getFloat32(k*4,true));
      if(v.some(n=>!Number.isFinite(n))) return fail();
      for(let channel=0;channel<3;channel++){
        let bound=.5;const bands=(degree+1)**2;
        for(let k=0;k<bands;k++){const coefficient=v[k===0?6+channel:9+channel*(bands-1)+k-1]!,l=Math.floor(Math.sqrt(k));
          bound+=Math.abs(coefficient)*Math.sqrt((2*l+1)/(4*Math.PI));if(k>0&&Math.abs(coefficient)>65536)displayIssue='このGSの係数は表示できる範囲を超えています。原本は保持しています。';}
        if(!Number.isFinite(gsLinear(bound))||gsLinear(bound)>65504)displayIssue='このGSの色は表示できる範囲を超えています。原本は保持しています。';
      }
      const geometry=gsActivatedGeometry(v.slice(end+1,end+4),v.slice(end+4,end+8));
      const transformed=gsTransformGeometry(v.slice(0,3),geometry.covariance,linear,transform.translation as number[]);
      if(gsOpacity(v[end]!)<.5/255) continue; nonempty=true;
      for(let k=0;k<3;k++) {
        const radius=4*Math.sqrt(transformed.covariance[k]![k]!), mean=transformed.mean[k]!;
        min[k]=Math.min(min[k]!,mean-radius); max[k]=Math.max(max[k]!,mean+radius); sizes[k]=Math.max(sizes[k]!,Math.abs(mean),radius);
      }
    } catch { return fail(); }
  }
  if(!nonempty) return fail();
  let bounds={ min:min.map((n,k)=>adjacentGsBound(n-64*Number.EPSILON*sizes[k]!,false)),
    max:max.map((n,k)=>adjacentGsBound(n+64*Number.EPSILON*sizes[k]!,true)) };
  if(context?.logicalBoundsAsset) {
    fields.bounds(context.logicalBoundsAsset,[]); if(fields.unknown) return fail();
    const retained=context.logicalBoundsAsset as unknown as typeof bounds;
    for(let k=0;k<3;k++) if(retained.min[k]!>min[k]! || retained.max[k]!<max[k]! ||
      Math.abs(retained.min[k]!-bounds.min[k]!)>16*Number.EPSILON*sizes[k]! || Math.abs(retained.max[k]!-bounds.max[k]!)>16*Number.EPSILON*sizes[k]!) return fail();
    bounds={ min:[...retained.min], max:[...retained.max] };
  }
    if(await available())return fail();abort();
    return {kind:'gs',degree,count,headerBytes:offset,stride,displayIssue,bounds,materials:[],surfaceRanges:[{kind:'splatSample',count}],digest:hash.digestHex(),byteLength};
  } finally {
    signal?.removeEventListener('abort',onAbort);
    try{await reader.cancel();}catch{/* Preserve inspection/read/abort failure. */}finally{reader.releaseLock();}
  }
}
