import { ProjectRecordFields } from './projectRecordFields';
import { gsRotation } from './gsSource';
import type { JsonObject } from './values';

/** Exact07k additive declarations; existing01a/01c declarations remain immutable. */
export const nativePointSourceDeclaration = Object.freeze({ id: 'development-native-point-ply-rgb-1', specificationSha256: '8fa283ea34207e0604f66204d3d6f7f8275071a99fb79bc940e23aa0905a0994' });
export const nativeProxySourceDeclaration = Object.freeze({ id: 'development-native-proxy-glb-1', specificationSha256: 'af2e98b3627cbfbcb09f25f6d76233edbaf78b375769e8d79c2be651f6f45edd' });

/** Canonical07k source→Asset binary64 arithmetic. Binding is deliberately absent. */
export function nativeSpatialTransform(transform: JsonObject): (point: readonly number[]) => [number, number, number] {
  const check = new ProjectRecordFields(); check.transform(transform, [], true);
  if (check.unknown) throw Error('モデルの座標変換を確認できません。');
  const [x, y, z, w] = transform.rotationXYZW as number[], scale = transform.uniformScale as number;
  const linear = gsRotation([w!, x!, y!, z!]).map(row => row.map((v, i) => (scale * v) * (i === 0 && transform.reflection === 'x' ? -1 : 1)));
  const translation = transform.translation as number[];
  return point => linear.map((row, i) => {
    const n = ((row[0]! * point[0]! + row[1]! * point[1]!) + row[2]! * point[2]!) + translation[i]!;
    if (!Number.isFinite(n)) throw Error('モデルの座標変換が範囲を超えています。');
    return n === 0 ? 0 : n;
  }) as [number, number, number];
}
