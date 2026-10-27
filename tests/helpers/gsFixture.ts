/** Project-owned binary recipe, independently spelled out from01c source goldens. */
export function gsFixture(degree=4, rows?: number[][], ending='\n'):Uint8Array{
  const rest=3*((degree+1)**2-1),names=['x','y','z','nx','ny','nz','f_dc_0','f_dc_1','f_dc_2',...Array.from({length:rest},(_,i)=>`f_rest_${i}`),
    'opacity','scale_0','scale_1','scale_2','rot_0','rot_1','rot_2','rot_3'];
  rows??=[[0,-0,0,0,0,0,0,0,0,...Array(rest).fill(0),0,0,0,0,1,0,0,0]];
  const header=new TextEncoder().encode(['ply','format binary_little_endian 1.0',`element vertex ${rows.length}`,...names.map(n=>`property float ${n}`),'end_header',''].join(ending));
  const bytes=new Uint8Array(header.length+rows.length*names.length*4);bytes.set(header);const view=new DataView(bytes.buffer);
  rows.forEach((row,i)=>{if(row.length!==names.length)throw Error('invalid owned GS fixture');row.forEach((n,k)=>view.setFloat32(header.length+(i*names.length+k)*4,n,true));});return bytes;
}
