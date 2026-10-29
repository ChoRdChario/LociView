import { fileError } from './validation';
const bad=():never=>fileError('HEICの圧縮情報または画像サイズを確認できません。別のJPEGを書き出してください。');
export function hevcNal(input:Uint8Array,expected?:number){if(input.length<2||input[0]!&129||input[1]!>>3||(input[1]!&7)===0||expected!==undefined&&(input[0]!>>1&63)!==expected)return bad();}
/** HEVC coded-leaf dimensions must be bounded before native pixel allocation. */
export function hevcSps(input:Uint8Array){
  hevcNal(input,33);if(input.length<4)return bad();
  const rbsp:number[]=[];for(let i=2;i<input.length;i++){if(i>=4&&input[i]===3&&input[i-1]===0&&input[i-2]===0){if(i+1>=input.length||input[i+1]!>3)return bad();continue;}rbsp.push(input[i]!);}
  let at=0;const bits=(n:number)=>{if(at+n>rbsp.length*8)return bad();let value=0;for(let i=0;i<n;i++,at++)value=value*2+(rbsp[at>>3]!>>(7-(at&7))&1);return value;};const skip=(n:number)=>{if(at+n>rbsp.length*8)return bad();at+=n;};
  const ue=()=>{let n=0;while(!bits(1)){if(++n>24)return bad();}return 2**n-1+bits(n);};
  bits(4);const sub=bits(3);if(sub>6)return bad();bits(1);bits(2);bits(1);const profile=bits(5);skip(32+48+8);if(![1,2].includes(profile))return bad();
  const flags=Array.from({length:sub},()=>({profile:bits(1),level:bits(1)}));if(sub)skip((8-sub)*2);for(const f of flags){if(f.profile)skip(88);if(f.level)skip(8);}
  if(ue()>15)return bad();const chroma=ue();if(chroma!==1)return bad();const codedWidth=ue(),codedHeight=ue();let left=0,right=0,top=0,bottom=0;if(bits(1)){left=ue();right=ue();top=ue();bottom=ue();}
  const luma=ue()+8,color=ue()+8;if(luma!==color||![8,10].includes(luma)||profile===1&&luma!==8)return bad();const width=codedWidth-2*(left+right),height=codedHeight-2*(top+bottom);if(width<=0||height<=0)return bad();
  return{width,height,codedWidth,codedHeight};
}
