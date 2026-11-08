import type { SplatMesh } from 'gaussian-splat-lite';
import { gsLinear } from '../domain/gsSource';

type PackedMesh = Pick<SplatMesh, 'isInitialized' | 'numSplats' | 'splats'>;
const yieldTask = () => new Promise<void>(resolve => setTimeout(resolve, 0));
/** Exact packed predicates, cooperatively checked before the queue adopts a mesh. */
export async function checkGsPacked(mesh: PackedMesh, source: { count: number; degree: number }, signal: AbortSignal,
  progress?: (checked: number) => void): Promise<void> {
  signal.throwIfAborted();
  if (!mesh.isInitialized || mesh.numSplats !== source.count || !mesh.splats ||
      mesh.splats.getNumSplats() !== source.count || mesh.splats.getNumSh() !== source.degree)
    throw Error('GSの全係数を表示できません。');
  const weights = Array.from({ length: source.degree * (source.degree + 2) }, (_, k) => Math.sqrt((2 * Math.floor(Math.sqrt(k + 1)) + 1) / (4 * Math.PI)));
  let deadline = performance.now() + 8;
  for (let i = 0; i < source.count; i++) {
    const s = mesh.splats.getSplat(i, true), c = s.center, z = s.scales, q = s.quaternion, rgb = s.color;
    if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z) ||
        !Number.isFinite(z.x) || !Number.isFinite(z.y) || !Number.isFinite(z.z) ||
        z.x <= 0 || z.y <= 0 || z.z <= 0 ||
        !Number.isFinite(Math.fround(z.x)) || !Number.isFinite(Math.fround(z.y)) || !Number.isFinite(Math.fround(z.z)) ||
        Math.fround(z.x) <= 0 || Math.fround(z.y) <= 0 || Math.fround(z.z) <= 0 ||
        !Number.isFinite(q.x) || !Number.isFinite(q.y) || !Number.isFinite(q.z) || !Number.isFinite(q.w) || q.lengthSq() <= 0 ||
        !Number.isFinite(s.opacity) || s.opacity < 0 || s.opacity > 1 ||
        !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b) || s.sh.length !== weights.length)
      throw Error('GSの描画データを確認できません。');
    let r = Math.abs(rgb.r), g = Math.abs(rgb.g), b = Math.abs(rgb.b);
    for (let k = 0; k < s.sh.length; k++) {
      const sh = s.sh[k]!;
      if (!Number.isFinite(sh.r) || !Number.isFinite(sh.g) || !Number.isFinite(sh.b)) throw Error('GSの描画データを確認できません。');
      r += Math.abs(sh.r) * weights[k]!; g += Math.abs(sh.g) * weights[k]!; b += Math.abs(sh.b) * weights[k]!;
    }
    if (!Number.isFinite(gsLinear(r)) || gsLinear(r) > 65504 || !Number.isFinite(gsLinear(g)) || gsLinear(g) > 65504 ||
        !Number.isFinite(gsLinear(b)) || gsLinear(b) > 65504) throw Error('GSの色を正しく合成できる範囲を超えています。');
    if ((i + 1) % 256 === 0 && performance.now() >= deadline) {
      signal.throwIfAborted(); progress?.(i + 1); await yieldTask(); signal.throwIfAborted(); deadline = performance.now() + 8;
    }
  }
  signal.throwIfAborted(); progress?.(source.count);
}
