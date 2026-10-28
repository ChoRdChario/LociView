import policyText from '../../docs/specs/profiles/desktop-smooth-mrt-1.policy.json?raw';
import goldenText from '../../docs/specs/profiles/desktop-smooth-mrt-1.goldens.json?raw';

export const compositionPolicy = Object.freeze({ id:'lociview-desktop-smooth-mrt-1',
  maximumPixels:2_073_600, documentBytes:67_108_864, bytesPerPixel:36 });
let verified:Promise<void>|undefined;
export function verifyCompositionPolicy():Promise<void>{return verified??=(async()=>{
  const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
  if(await hash(policyText)!=='f62c6a8c59294e755bd287df2eb57a4e42247a2f0b442154f9c073345b2e5087'||
    await hash(goldenText)!=='4e47993fa3f11c653c7b6b1fb286ae30b0e35bc6e773e751e9843bf6aacf97ef')throw Error('透過表示の規則を確認できません。');
})();}

/** Shared by the owned Mesh and public-GS output adapters, after final alpha. */
export const compositionOutputShader=`
float lvA=clamp(LV_OUTPUT.a,0.0,1.0);
float lvW=clamp(pow(min(1.0,10.0*lvA)+0.01,3.0)*1000.0*pow(1.0-0.9*gl_FragCoord.z,3.0),0.01,30.0);
LV_OUTPUT=vec4(LV_OUTPUT.rgb*LV_PREMULTIPLIER*lvW,lvA*lvW);
if(lvA>=1.0)lvOptical=vec4(0.0,1.0,0.0,0.0);
else{float lvTau=lvA<0.001?lvA+lvA*lvA*0.5+lvA*lvA*lvA/3.0:-log(1.0-lvA);lvOptical=vec4(lvTau,0.0,0.0,0.0);}
`;
