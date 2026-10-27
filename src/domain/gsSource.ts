/** Exact01c declaration. Source precision is independent of renderer packing. */
export const gsSourceDeclaration = Object.freeze({ id: 'development-validation-gs-ply-f32le-sh0-4-1', specificationSha256: 'e298cbb7b7202229ddfe4c834328854fc610109ccf38dbeb6a3f8d9d50954bee' });

export const gsOpacity = (x: number): number => x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
const zero = (n: number) => n === 0 ? 0 : n;
export function gsRotation(q: readonly number[]): number[][] {
  const [w = 0, x = 0, y = 0, z = 0] = q;
  return [[1 - 2 * (y*y + z*z), 2 * (x*y - z*w), 2 * (x*z + y*w)],
    [2 * (x*y + z*w), 1 - 2 * (x*x + z*z), 2 * (y*z - x*w)],
    [2 * (x*z - y*w), 2 * (y*z + x*w), 1 - 2 * (x*x + y*y)]];
}
export function gsActivatedGeometry(logScale: readonly number[], sourceQ: readonly number[]) {
  const [w = 0, x = 0, y = 0, z = 0] = sourceQ, n = Math.sqrt(((w*w + x*x) + y*y) + z*z);
  if (!(n > 0) || !Number.isFinite(n)) throw Error('gs-quaternion');
  let quaternion = sourceQ.map(v => v/n);
  if (quaternion.find(v => v !== 0)! < 0) quaternion = quaternion.map(v => -v);
  quaternion = quaternion.map(zero);
  const scale = logScale.map(Math.exp), variance = logScale.map(v => Math.exp(2*v));
  if ([...scale, ...variance].some(v => !Number.isFinite(v) || v <= 0)) throw Error('gs-scale');
  const r = gsRotation(quaternion), covariance = Array.from({ length: 3 }, () => [0, 0, 0]);
  for (let i = 0; i < 3; i++) for (let j = i; j < 3; j++) {
    const p = variance.map((v, k) => (r[i]![k]! * v) * r[j]![k]!);
    const v = zero((p[0]! + p[1]!) + p[2]!);
    if (!Number.isFinite(v) || i === j && v <= 0) throw Error('gs-covariance');
    covariance[i]![j] = covariance[j]![i] = v;
  }
  return { quaternion, scale, covariance };
}
export function gsTransformGeometry(mean: readonly number[], covariance: readonly (readonly number[])[],
  linear: readonly (readonly number[])[], translation: readonly number[]) {
  const dot = (a: readonly number[], b: readonly number[]) => (a[0]!*b[0]! + a[1]!*b[1]!) + a[2]!*b[2]!;
  const m = linear.map((r, i) => zero(dot(r, mean) + translation[i]!));
  const columns = [0,1,2].map(k => covariance.map(r => r[k]!));
  const t = linear.map(r => columns.map(c => dot(r,c)));
  const a = Array.from({ length: 3 }, () => [0,0,0]);
  for (let i=0;i<3;i++) for (let j=i;j<3;j++) a[i]![j] = a[j]![i] = zero(dot(t[i]!,linear[j]!));
  if ([...m, ...a.flat()].some(v => !Number.isFinite(v)) || a.some((r,i) => r[i]! <= 0)) throw Error('gs-transform');
  return { mean: m, covariance: a };
}
/** Explicit polynomial implementation; profile strings never become executable input. */
export function gsBasis([x=0,y=0,z=0]: readonly number[]): number[] {
  return [.28209479177387814, -.4886025119029199*y, .4886025119029199*z, -.4886025119029199*x,
    1.0925484305920792*x*y,-1.0925484305920792*y*z,.31539156525252005*(2*z*z-x*x-y*y),-1.0925484305920792*x*z,.5462742152960396*(x*x-y*y),
    -.5900435899266435*y*(3*x*x-y*y),2.890611442640554*x*y*z,-.4570457994644658*y*(4*z*z-x*x-y*y),.3731763325901154*z*(2*z*z-3*x*x-3*y*y),
    -.4570457994644658*x*(4*z*z-x*x-y*y),1.445305721320277*z*(x*x-y*y),-.5900435899266435*x*(x*x-3*y*y),
    2.5033429417967046*x*y*(x*x-y*y),-1.7701307697799304*y*z*(3*x*x-y*y),.9461746957575601*x*y*(7*z*z-1),-.6690465435572892*y*z*(7*z*z-3),
    .10578554691520431*(z*z*(35*z*z-30)+3),-.6690465435572892*x*z*(7*z*z-3),.47308734787878004*(x*x-y*y)*(7*z*z-1),
    -1.7701307697799304*x*z*(x*x-3*y*y),.6258357354491761*(x*x*(x*x-3*y*y)-y*y*(3*x*x-y*y))];
}
export const gsLinear = (c: number): number => c <= .04045 ? c/12.92 : ((c+.055)/1.055)**2.4;
export function gsColor(coefficients: readonly number[], unitDirection: readonly number[]) {
  const b = gsBasis(unitDirection); let sum = 0;
  for (let i=0;i<coefficients.length;i++) sum += b[i]!*coefficients[i]!;
  const nonlinear = Math.max(0, sum+.5); return { nonlinear, linear: gsLinear(nonlinear) };
}
