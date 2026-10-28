import pointText from '../../docs/specs/profiles/native-point-ply-rgb-1.profile.json?raw';
import proxyText from '../../docs/specs/profiles/native-proxy-glb-1.profile.json?raw';
import goldenText from '../../docs/specs/profiles/native-spatial-conversion-7.goldens.json?raw';
import { nativePointSourceDeclaration, nativeProxySourceDeclaration, nativeSpatialTransform } from '../domain/nativeSpatialSource';
import { same } from '../domain/projectGraphSupport';
import type { JsonObject } from '../domain/values';
import { digest } from '../projectMetadata/persistence';
import { isPointModel, type ValidatedModel } from './pointPly';
import { meshSourceFormat } from '../domain/meshSource';

let verified: Promise<void> | undefined;
async function verifyProfiles() {
  return verified ??= (async () => {
    for (const [text, declaration] of [[pointText, nativePointSourceDeclaration], [proxyText, nativeProxySourceDeclaration]] as const) {
      const parsed = JSON.parse(text);
      if (parsed.id !== declaration.id || await digest(new TextEncoder().encode(text)) !== declaration.specificationSha256 ||
        await digest(new TextEncoder().encode(goldenText)) !== parsed.goldens.sha256) throw Error('変換用モデル形式の版が一致しません。');
    }
  })();
}
export async function nativePointSourceProfile(): Promise<JsonObject> { await verifyProfiles(); return nativePointSourceDeclaration; }
export async function nativeProxySourceProfile(): Promise<JsonObject> { await verifyProfiles(); return nativeProxySourceDeclaration; }

/** Raw decoded facts remain in RepresentationFrame; only these public facts are Asset-frame. */
export function nativeSpatialModelBounds(record: JsonObject, model: ValidatedModel): {min: number[]; max: number[]} {
  const point = same(record.formatProfile, nativePointSourceDeclaration), proxy = same(record.formatProfile, nativeProxySourceDeclaration);
  if (!point && !proxy && !meshSourceFormat(record.formatProfile)) return model.bounds;
  const transform = nativeSpatialTransform(record.representationToAsset as JsonObject), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const add = (p: readonly number[]) => transform(p).forEach((n, i) => { min[i] = Math.min(min[i]!, n); max[i] = Math.max(max[i]!, n); });
  if (point) {
    if (!isPointModel(model)) throw Error('点群の本体を確認できません。');
    for (let i = 0; i < model.positions.length; i += 3) add([model.positions[i]!, model.positions[i + 1]!, model.positions[i + 2]!]);
  } else for (let mask = 0; mask < 8; mask++) add([0, 1, 2].map(i => model.bounds[(mask >> i) & 1 ? 'max' : 'min'][i]!));
  return {min, max};
}
