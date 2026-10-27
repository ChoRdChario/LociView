import sourceText from '../../docs/specs/profiles/gs-ply-f32le-sh0-4-1.profile.json?raw';
import goldenText from '../../docs/specs/profiles/gs-ply-f32le-sh0-4-1.goldens.json?raw';
import { gsSourceDeclaration, gsActivatedGeometry, gsTransformGeometry, gsRotation, gsOpacity, gsLinear } from '../domain/gsSource';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';

export interface ValidatedGs {
  readonly kind: 'gs'; readonly bytes: Uint8Array; readonly degree: number; readonly count: number;
  readonly headerBytes: number; readonly stride: number;
  readonly displayIssue: string | null;
  readonly bounds: { min: number[]; max: number[] }; readonly materials: readonly JsonObject[]; readonly surfaceRanges: readonly JsonObject[];
  readonly jpeg?: never; readonly occurrences?: never;
}
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
/** Own all original bytes before awaits. Full finite/scalar and raw-support inspection precedes facts. */
export async function inspectGsPly(input: Uint8Array, limits: FileValidationLimits,
  context?: { readonly representationToAsset: JsonObject; readonly logicalBoundsAsset?: JsonObject }): Promise<ValidatedGs> {
  checkFileLimits(limits);
  if (input.byteLength > limits.maxFileBytes) return fileError('GSがこの検証の上限を超えています。');
  const bytes = input.slice();
  context=context ? cloneCanonicalValue(context,{maxNodes:256,maxDepth:16,maxStringScalars:1000}) as unknown as typeof context : undefined;
  await gsSourceProfile();
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
  if (!Number.isSafeInteger(size) || scalars>limits.maxValues || size!==bytes.length-offset) return fail();
  const transform=context?.representationToAsset ?? { translation:[0,0,0], rotationXYZW:[0,0,0,1], uniformScale:1, reflection:'none' };
  const fields=new ProjectRecordFields(); fields.transform(transform,[],true); if(fields.unknown) return fail();
  const q=transform.rotationXYZW as number[], rotation=gsRotation([q[3]!,q[0]!,q[1]!,q[2]!]), scale=transform.uniformScale as number;
  const linear=rotation.map(r=>r.map((v,k)=>(scale*v)*(transform.reflection==='x' && k===0?-1:1)));
  const min=[Infinity,Infinity,Infinity], max=[-Infinity,-Infinity,-Infinity], sizes=[1,1,1], view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  let nonempty=false,displayIssue:string|null=null; const rest=3*((degree+1)**2-1), end=9+rest;
  try {
    for(let row=0;row<count;row++) {
      const v=Array.from({length:properties.length},(_,k)=>view.getFloat32(offset+row*stride+k*4,true));
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
    }
  } catch { return fail(); }
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
  return {kind:'gs',bytes,degree,count,headerBytes:offset,stride,displayIssue,bounds,materials:[],surfaceRanges:[{kind:'splatSample',count}]};
}
