import { fileError } from './validation';
const mediaInvalid = (): never => fileError('H.264の設定またはサンプルに対応していません。8ビットSDRのMP4を選択してください。');

/** Inspect the actual SPS rather than trusting avc1/profile labels. No pixel decode. */
export function avcSps(input: Uint8Array) {
  if ((input[0]! & 31) !== 7 || input.length < 5) return mediaInvalid();
  const rbsp: number[] = []; for (let i=1;i<input.length;i++) {
    if(i>=3&&input[i]===3&&input[i-1]===0&&input[i-2]===0){if(i+1===input.length||input[i+1]!>3)return mediaInvalid();continue;}rbsp.push(input[i]!);
  }
  let at=0;const bits=(n:number)=>{if(n>32||at+n>rbsp.length*8)return mediaInvalid();let v=0;for(let i=0;i<n;i++,at++)v=v*2+((rbsp[at>>3]!>>(7-(at&7)))&1);return v;};
  const ue=()=>{let n=0;while(!bits(1)){if(++n>24)return mediaInvalid();}return 2**n-1+bits(n);};const se=()=>{const n=ue();return n&1?(n+1)/2:-n/2;};
  const profile=bits(8);bits(8);bits(8);if(![66,77,88,100].includes(profile)||ue()>31)return mediaInvalid();
  if(profile===100){if(ue()!==1||ue()!==0||ue()!==0||bits(1))return mediaInvalid();if(bits(1))for(let i=0;i<8;i++)if(bits(1)){let last=8,next=8;for(let j=0;j<(i<6?16:64);j++){if(next)next=(last+se()+256)%256;last=next||last;}}}
  if(ue()>12)return mediaInvalid();const order=ue();if(order===0){if(ue()>12)return mediaInvalid();}else if(order===1){bits(1);se();se();const n=ue();if(n>255)return mediaInvalid();for(let i=0;i<n;i++)se();}else if(order!==2)return mediaInvalid();
  if(ue()>16)return mediaInvalid();bits(1);const w=ue()+1,h=ue()+1,frame=bits(1);if(!frame)bits(1);bits(1);let left=0,right=0,top=0,bottom=0;
  if(bits(1)){left=ue();right=ue();top=ue();bottom=ue();}
  const width=w*16-(left+right)*2,height=(2-frame)*h*16-(top+bottom)*2*(2-frame);if(width<=0||height<=0)return mediaInvalid();
  if(bits(1)) {if(bits(1)){const aspect=bits(8);if(aspect===255){bits(16);bits(16);}}if(bits(1))bits(1);
    if(bits(1)){bits(3);bits(1);if(bits(1)){const primaries=bits(8),transfer=bits(8),matrix=bits(8);if(![1,2,4,5,6,7].includes(primaries)||![1,2,4,5,6,7,13].includes(transfer)||![0,1,2,4,5,6,7].includes(matrix))return mediaInvalid();}}
  } return {width,height,profile,codedWidth:w*16,codedHeight:(2-frame)*h*16};
}

/** Every declared AVC sample must have complete owned length-prefixed NALs. */
export function avcSample(bytes:Uint8Array,start:number,end:number,lengthBytes:number,parameterSets:readonly Uint8Array[],charge:(n?:number)=>void){
  let at=start;while(at<end){if(at+lengthBytes>end)return mediaInvalid();let n=0;for(let i=0;i<lengthBytes;i++)n=n*256+bytes[at++]!;if(!n||at+n>end||bytes[at]!&128)return mediaInvalid();
    const type=bytes[at]!&31;if(type===7||type===8){if(!parameterSets.some(p=>{charge();if(p.length!==n)return false;charge(n);return p.every((v,i)=>v===bytes[at+i]);}))return mediaInvalid();}
    else if(![1,5,6,9,12].includes(type))return mediaInvalid();
    if(type===6){const rbsp:number[]=[];for(let i=at+1;i<at+n;i++){if(i>=at+3&&bytes[i]===3&&bytes[i-1]===0&&bytes[i-2]===0)continue;rbsp.push(bytes[i]!);}let q=0;
      while(q<rbsp.length&&!(rbsp[q]===128&&q===rbsp.length-1)){let t=0,size=0,v:number;do{if(q>=rbsp.length)return mediaInvalid();v=rbsp[q++]!;t+=v;}while(v===255);do{if(q>=rbsp.length)return mediaInvalid();v=rbsp[q++]!;size+=v;}while(v===255);if([4,137,144,147].includes(t)||q+size>rbsp.length)return mediaInvalid();q+=size;}}
    at+=n;
  }if(at!==end)return mediaInvalid();
}
