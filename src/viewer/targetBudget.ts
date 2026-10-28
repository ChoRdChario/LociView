import {compositionPolicy} from './compositionPolicy';

export interface TargetLayout {readonly cssWidth:number;readonly cssHeight:number;readonly devicePixelRatio:number;
  readonly renderScale:number;readonly width:number;readonly height:number;readonly bytes:number}
export interface TargetLease {readonly bytes:number;release():void}
export interface TargetBudget {readonly used:number;readonly available:number;reserve(bytes:number):TargetLease;subscribe(changed:()=>void):()=>void}

/** One document owner. Allocating/live/retiring targets stay charged until actual disposal. */
export function createTargetBudget():TargetBudget{
  let used=0,queued=false;const listeners=new Set<()=>void>();
  const changed=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;for(const notify of listeners)notify();});};
  return {get used(){return used;},get available(){return compositionPolicy.documentBytes-1-used;},
    reserve(bytes){if(!Number.isSafeInteger(bytes)||bytes<=0||used+bytes>=compositionPolicy.documentBytes)throw Error('透過表示の空き容量を確保できません。');
      used+=bytes;changed();let active=true;return Object.freeze({bytes,release(){if(!active)return;active=false;used-=bytes;changed();}});},
    subscribe(notify){listeners.add(notify);return()=>{listeners.delete(notify);};}};
}

/** One scalar before rounding; consumers must use these exact rounded dimensions. */
export function targetLayout(cssWidth:number,cssHeight:number,devicePixelRatio:number,available:number,maxDimension:number):TargetLayout{
  if(![cssWidth,cssHeight,devicePixelRatio,maxDimension].every(v=>Number.isFinite(v)&&v>0)||!Number.isSafeInteger(available)||available<compositionPolicy.bytesPerPixel)throw Error('透過表示の範囲を確保できません。');
  const dimensions=(s:number)=>({width:Math.max(1,Math.floor(cssWidth*devicePixelRatio*s+.5)),height:Math.max(1,Math.floor(cssHeight*devicePixelRatio*s+.5))});
  const fits=(s:number)=>{const {width,height}=dimensions(s);return width<=maxDimension&&height<=maxDimension&&width*height<=compositionPolicy.maximumPixels&&width*height*compositionPolicy.bytesPerPixel<=available;};
  let low=0,high=Math.min(1,2/devicePixelRatio);
  if(fits(high))low=high;else for(let i=0;i<52;i++){const middle=(low+high)/2;if(fits(middle))low=middle;else high=middle;}
  if(low<=0||!fits(low))throw Error('透過表示の範囲を確保できません。');const size=dimensions(low);
  return Object.freeze({cssWidth,cssHeight,devicePixelRatio,renderScale:low,...size,bytes:size.width*size.height*compositionPolicy.bytesPerPixel});
}
