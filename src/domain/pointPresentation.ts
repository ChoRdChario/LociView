import binaryText from '../../docs/specs/profiles/point-binary-1.profile.json?raw';
import ditherText from '../../docs/specs/profiles/point-dither-1.profile.json?raw';
import smoothText from '../../docs/specs/profiles/point-smooth-1.profile.json?raw';

export interface PointPresentationProfile {
  readonly id: string; readonly specificationSha256: string;
  readonly defaultDiameterCssPixels: number; readonly minimumDiameterCssPixels: number; readonly maximumDiameterCssPixels: number;
  readonly shape: 'disc'; readonly edgeCoverage: 'binary' | 'ditherCoverage' | 'smoothBlend'; readonly pickCoverageAlphaThreshold: number;
}
export interface PointProfileRegistrySnapshot { readonly defaultId: string; readonly profiles: readonly PointPresentationProfile[] }
export interface PointViewport { readonly cssWidth: number; readonly cssHeight: number; readonly devicePixelRatio: number; readonly renderScale: number }
export const pointProfileTexts = Object.freeze([binaryText, ditherText, smoothText]);
const hashes = {
  "lociview-point-binary-1": "c9e6893a6a57e315db9d9caef62eba143d227521a254364d7fd8010f5cec65d6",
  "lociview-point-dither-1": "38ffdbb6dbe4386da3600f48e0af8bcad2e23c2b61ca87a0cfd5b697ee57aed9",
  "lociview-point-smooth-1": "8c67bb7ea009926a09244ef154af005b243b14322a6a9d93079fd966b668cad7"
};
const profiles = pointProfileTexts.map(text => {
  const p = JSON.parse(text);
  return Object.freeze({ id: p.id as string, specificationSha256: hashes[p.id as keyof typeof hashes],
    defaultDiameterCssPixels: p.defaultDiameterCssPixels as number, minimumDiameterCssPixels: p.minimumDiameterCssPixels as number,
    maximumDiameterCssPixels: p.maximumDiameterCssPixels as number, shape: p.shape as 'disc', edgeCoverage: p.edgeCoverage as PointPresentationProfile['edgeCoverage'],
    pickCoverageAlphaThreshold: p.pickCoverageAlphaThreshold as number });
});
export const defaultPointProfile: PointPresentationProfile = profiles[0]!;
export const pointRegistrySnapshot: PointProfileRegistrySnapshot = Object.freeze({ defaultId: defaultPointProfile.id, profiles: Object.freeze(profiles) });
const keys = Object.keys(defaultPointProfile).sort().join(',');
const sameProfile = (a: PointPresentationProfile, b: PointPresentationProfile) => !!a && Object.keys(a).sort().join(',') === keys &&
  (Object.keys(b) as (keyof PointPresentationProfile)[]).every(k => a[k] === b[k]);
export function validatePointRegistry(snapshot: PointProfileRegistrySnapshot): void {
  if (!snapshot || snapshot.defaultId !== defaultPointProfile.id || snapshot.profiles.length !== 3 ||
    !profiles.every(p => snapshot.profiles.filter(candidate => sameProfile(candidate, p)).length === 1)) throw Error('点群の表示規則を確認できません。');
}
export function resolvePointPresentation(snapshot: PointProfileRegistrySnapshot, requested: PointPresentationProfile, diameter: number) {
  validatePointRegistry(snapshot);
  const profile = snapshot.profiles.find(p => sameProfile(p, requested)); if (!profile) throw Error('点群の表示形式が一致しません。');
  return Object.freeze({ profile, diameterCssPixels: Number.isFinite(diameter) ? Math.min(profile.maximumDiameterCssPixels, Math.max(profile.minimumDiameterCssPixels, diameter)) : profile.defaultDiameterCssPixels,
    diagnosedDefault: !Number.isFinite(diameter) });
}
let verified: Promise<void> | undefined;
/** Verify the exact approved text once; pure registry/value checks still run for each supplied snapshot. */
export function verifyPointProfileTexts(texts: readonly string[] = pointProfileTexts): Promise<void> {
  const check = async () => {
    if (texts.length !== 3) throw Error('点群の表示規則が不足しています。');
    for (let i = 0; i < texts.length; i++) {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texts[i]!)))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== profiles[i]!.specificationSha256) throw Error('点群の表示規則が一致しません。');
    }
  };
  return texts === pointProfileTexts ? (verified ??= check()) : check();
}
export function pointRadialCoverage(diameter: number, radius: number): 0 | 1 {
  if (!Number.isFinite(diameter) || diameter <= 0 || !Number.isFinite(radius) || radius < 0) throw Error('点の大きさと位置を確認してください。');
  return radius <= diameter / 2 ? 1 : 0;
}
export function pointViewportSample(view: PointViewport, x: number, y: number) {
  const { cssWidth: cw, cssHeight: ch, devicePixelRatio: dpr, renderScale: scale } = view;
  if (![cw, ch, dpr, scale].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= cw || y >= ch)
    throw Error('点群の表示範囲を確認できません。');
  const width = Math.max(1, Math.floor(cw * dpr * scale + 0.5)), height = Math.max(1, Math.floor(ch * dpr * scale + 0.5));
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) throw Error('点群の表示範囲を確認できません。');
  const i = Math.min(width - 1, Math.floor(x * width / cw)), j = Math.min(height - 1, Math.floor(y * height / ch));
  return { width, height, i, j, xCss: (i + 0.5) * cw / width, yCss: (j + 0.5) * ch / height };
}
export function binaryPointCapability(view: PointViewport, profile: PointPresentationProfile = defaultPointProfile): string | null {
  if (!sameProfile(profile, defaultPointProfile)) return 'この点群の表示方式はまだ利用できません。';
  if (![view.cssWidth, view.cssHeight, view.devicePixelRatio, view.renderScale].every(n => Number.isFinite(n) && n > 0) || view.devicePixelRatio > 2 || view.renderScale > 1)
    return 'この描画倍率では点群を表示できません。点群のデータと記録は保持しています。';
  return null;
}
