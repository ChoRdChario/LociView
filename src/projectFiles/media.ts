import { inspectProjectImage, projectImageMime, type PhotoDecoder } from './photo';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { heicStructure, heicGuidance, isHeic } from './heic';
export { isHeic };
import { timedMediaStructure, type TimedMediaShape } from './mediaContainer';
import { fileError, type FileValidationLimits } from './validation';

export type ProjectMediaMime = 'image/png'|'image/jpeg'|'image/webp'|'image/gif'|'image/heic'|'video/mp4'|'audio/mp4'|'audio/mpeg';
export const projectMediaKind=(mime:unknown):'image'|'video'|'audio'|null=>projectImageMime(mime)||mime==='image/heic'?'image':mime==='video/mp4'?'video':mime==='audio/mp4'||mime==='audio/mpeg'?'audio':null;
export interface DecodedTimedMedia {readonly duration:number;readonly width?:number;readonly height?:number}
export type TimedMediaDecoder=(bytes:Uint8Array,shape:TimedMediaShape)=>Promise<DecodedTimedMedia>;
export type HeicDecoder=(bytes:Uint8Array)=>Promise<{readonly width:number;readonly height:number;close():void}>;
export interface MediaDecoders {readonly timed?:TimedMediaDecoder;readonly heic?:HeicDecoder}
/** Routing hint only; inspectProjectMedia remains the admission authority. */
export const hasTimedOrHeicSignature=(b:Uint8Array)=>isHeic(b)||String.fromCharCode(...b.subarray(4,8))==='ftyp'||String.fromCharCode(...b.subarray(0,3))==='ID3'||b[0]===255&&(b[1]!&224)===224;

/** Current-data is the first decoded media data, not just metadata/canPlayType. */
export const browserTimedMediaDecoder:TimedMediaDecoder=async(bytes,shape)=>{
  if(typeof document==='undefined'||typeof URL.createObjectURL!=='function')return fileError('この環境では動画・音声の読み込みを確認できません。');
  const node=document.createElement(shape.mediaKind),url=URL.createObjectURL(new Blob([bytes.slice().buffer],{type:shape.mediaType}));
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{return await new Promise<DecodedTimedMedia>((resolve,reject)=>{
    node.preload='auto';node.muted=true;node.autoplay=false;
    node.addEventListener('loadeddata',()=>{if(node.readyState<2||!Number.isFinite(node.duration)||node.duration<=0)return;
      resolve({duration:node.duration,...(node instanceof HTMLVideoElement?{width:node.videoWidth,height:node.videoHeight}:{})});},{once:true});
    node.addEventListener('error',()=>reject(Error('このブラウザでは、この動画・音声を読み込めません。対応するブラウザで開くか、別の対応形式で書き出してください。')),{once:true});
    timer=setTimeout(()=>reject(Error('動画・音声を読み込めませんでした。ファイルとブラウザの対応を確認してください。')),20000);
    node.src=url;node.load();
  });}finally{if(timer)clearTimeout(timer);node.pause();node.removeAttribute('src');node.load();URL.revokeObjectURL(url);}
};
const nativeHeic:HeicDecoder=async bytes=>{if(typeof createImageBitmap!=='function')return fileError(heicGuidance);return createImageBitmap(new Blob([bytes.slice().buffer],{type:'image/heic'}),{imageOrientation:'from-image',colorSpaceConversion:'default',premultiplyAlpha:'none'});};
const mediaAbort=()=>new DOMException('選択を取り消しました。','AbortError');
async function boundedHeic(decode:HeicDecoder,bytes:Uint8Array,signal?:AbortSignal){
  if(signal?.aborted)throw mediaAbort();let ended=false,timer:ReturnType<typeof setTimeout>|undefined,onAbort:(()=>void)|undefined;
  const pending=Promise.resolve().then(()=>{if(signal?.aborted)throw mediaAbort();return decode(bytes);}).then(bitmap=>{if(ended){bitmap.close();throw signal?.aborted?mediaAbort():Error(heicGuidance);}return bitmap;});
  try{return await Promise.race([pending,new Promise<never>((_resolve,reject)=>{
    onAbort=()=>{ended=true;reject(mediaAbort());};signal?.addEventListener('abort',onAbort,{once:true});if(signal?.aborted)onAbort();
    timer=setTimeout(()=>{ended=true;reject(Error(heicGuidance));},20000);
  })]);}finally{ended=true;if(timer)clearTimeout(timer);if(onAbort)signal?.removeEventListener('abort',onAbort);}
}

/** Exact content-derived type. File names and browser MIME hints grant no admission. */
export async function inspectProjectMedia(bytes:Uint8Array,limits:FileValidationLimits,png?:PngDecoder,jpeg?:JpegDecoder,photo?:PhotoDecoder,decoders:MediaDecoders={},signal?:AbortSignal){
  if(signal?.aborted)throw mediaAbort();
  if(isHeic(bytes)){let bitmap:Awaited<ReturnType<HeicDecoder>>|undefined;try{const shape=heicStructure(bytes,limits);bitmap=await boundedHeic(decoders.heic??nativeHeic,bytes.slice(),signal);
      if(!(bitmap.width===shape.width&&bitmap.height===shape.height||bitmap.width===shape.height&&bitmap.height===shape.width))return fileError(heicGuidance);
    }catch{if(signal?.aborted)throw mediaAbort();return fileError(heicGuidance);}finally{bitmap?.close();}return{mediaKind:'image' as const,mediaType:'image/heic' as const};}
  // Damaged familiar images retain their existing strict diagnostics.
  const text=(n:number)=>String.fromCharCode(...bytes.subarray(0,n));
  if(bytes[0]===137&&text(4)==='\x89PNG'||bytes[0]===255&&bytes[1]===216||text(4)==='RIFF'||text(4)==='GIF8')return{mediaKind:'image' as const,mediaType:await inspectProjectImage(bytes,limits,png,jpeg,photo)};
  const shape=timedMediaStructure(bytes,limits),decoded=await(decoders.timed??browserTimedMediaDecoder)(bytes.slice(),shape);
  if(!Number.isFinite(decoded.duration)||decoded.duration<=0||decoded.duration>shape.duration+1||shape.mediaKind==='video'&&(decoded.width!==shape.width||decoded.height!==shape.height))return fileError('動画・音声の内容と情報が一致しません。');
  return{mediaKind:shape.mediaKind,mediaType:shape.mediaType};
}
