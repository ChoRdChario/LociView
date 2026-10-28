import sourceText from '../../docs/specs/profiles/point-ply-rgb-1.profile.json?raw';
import type { JsonObject } from '../domain/values';
import { checkFileLimits, fileError, type FileValidationLimits } from './validation';
import type { ValidatedGlb } from './glb';
import { verifyPointProfileTexts } from '../domain/pointPresentation';
import type { ValidatedGs } from './gsPly';
import type { MeshSourceData } from '../domain/meshSource';

export const pointSourceProfileId = 'development-validation-point-ply-rgb-1';
export const pointSourceProfileSha256 = 'c93909de6da2c44558d960c2620f967f8cd702b6171ae7df9e86df789ba35dd5';
export const pointSourceMediaType = 'application/ply';
const sourceSpec = JSON.parse(sourceText);
let checked: Promise<JsonObject> | undefined;
export function pointSourceProfile(): Promise<JsonObject> {
  return checked ??= (async () => {
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceText)))].map(n => n.toString(16).padStart(2, '0')).join('');
    if (sha !== pointSourceProfileSha256 || sourceSpec.id !== pointSourceProfileId) return fileError('点群の入力形式を確認できません。');
    await verifyPointProfileTexts(); return Object.freeze({ id: pointSourceProfileId, specificationSha256: sha });
  })();
}
export interface ValidatedPoint {
  readonly kind: 'point'; readonly bytes: Uint8Array; readonly positions: Float32Array; readonly colors: Float32Array;
  readonly bounds: { min: number[]; max: number[] }; readonly materials: readonly JsonObject[]; readonly surfaceRanges: readonly JsonObject[];
  readonly jpeg?: never; readonly occurrences?: never;
}
export type ValidatedModel = ValidatedGlb | ValidatedPoint | ValidatedGs | MeshSourceData;
export const isPointPly = (b: Uint8Array) => b.length >= 4 && b[0] === 112 && b[1] === 108 && b[2] === 121 && (b[3] === 10 || b[3] === 13 && b[4] === 10);
export const isPointModel = (m: ValidatedModel): m is ValidatedPoint => 'kind' in m && m.kind === 'point';
export const isGsModel = (m: ValidatedModel): m is ValidatedGs => 'kind' in m && m.kind === 'gs';
export const isGlbModel = (m: ValidatedModel): m is ValidatedGlb => !('kind' in m) || m.kind === 'glb';
export const isMeshSourceModel=(m:ValidatedModel):m is MeshSourceData=>'kind' in m&&m.kind==='mesh-source';
const fail = () => fileError('XYZとRGBを持つASCII PLY点群を確認してください。');
const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const signature = ['float x', 'float y', 'float z', 'uchar red', 'uchar green', 'uchar blue'];
const linear = (n: number) => { const c = n / 255; return Math.fround(c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4); };
/** Exact line framing and post-Float32 facts. No third-party/default decoder is an admission authority. */
export async function inspectPointPly(input: Uint8Array, limits: FileValidationLimits): Promise<ValidatedPoint> {
  checkFileLimits(limits);
  if (!isPointPly(input) || input.byteLength > limits.maxFileBytes) return fail();
  const bytes = input.slice(); await pointSourceProfile();
  let offset = 0;
  const line = (maximum: number, asciiHeader = false) => {
    const begin = offset; while (offset < bytes.length && bytes[offset] !== 10) { if (offset - begin >= maximum) return fail(); offset++; }
    const end = offset; if (offset < bytes.length) offset++;
    let text = ''; for (let i = begin; i < end; i++) { const b = bytes[i]!;
      if (b === 13 && (i !== end - 1 || end === bytes.length)) return fail();
      if (b !== 13 && !(b === 9 && !asciiHeader) && (b < 32 || b > 126)) return fail(); text += String.fromCharCode(b); }
    return { text: text.endsWith('\r') ? text.slice(0, -1) : text, terminated: end < bytes.length };
  };
  let first = true, format = false, count: number | undefined, ended = false;
  const props: string[] = [];
  while (offset < bytes.length && offset < 65536) {
    const row = line(65536 - offset, true), t = row.text;
    if (!row.terminated || offset > 65536) return fail();
    if (first) { first = false; if (t !== 'ply') return fail(); continue; }
    if (t === 'end_header') { ended = true; break; }
    if (t === '' || t === 'comment' || t === 'obj_info' || t.startsWith('comment ') || t.startsWith('obj_info ')) continue;
    if (t.startsWith('format ')) { if (format || t !== 'format ascii 1.0') return fail(); format = true; continue; }
    if (t.startsWith('element ')) {
      if (count !== undefined || !/^element vertex [0-9]+$/.test(t)) return fail(); count = Number(t.slice(15));
      if (!Number.isSafeInteger(count) || count < 1 || count > limits.maxItems || count > limits.maxValues / 6) return fileError('点群がこの検証の上限を超えています。');
      continue;
    }
    if (t.startsWith('property ') && count !== undefined) { props.push(t.slice(9)); if (props.length > 6) return fail(); continue; }
    return fail();
  }
  if (!ended || !format || count === undefined || props.join('|') !== signature.join('|')) return fail();
  const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3), min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < count; i++) {
    if (offset >= bytes.length) return fail(); const fields = line(1024).text.trim().split(/[ \t]+/);
    if (fields.length !== 6) return fail();
    for (let k = 0; k < 3; k++) {
      if (!decimal.test(fields[k]!)) return fail(); const raw = Number(fields[k]), n = Math.fround(raw);
      if (!Number.isFinite(raw) || !Number.isFinite(n)) return fileError('点群の座標が表示できる範囲を超えています。');
      positions[i * 3 + k] = n === 0 ? 0 : n; min[k] = Math.min(min[k]!, n) || 0; max[k] = Math.max(max[k]!, n) || 0;
      const rgb = fields[k + 3]!; if (!/^[0-9]+$/.test(rgb) || Number(rgb) > 255) return fail(); colors[i * 3 + k] = linear(Number(rgb));
    }
  }
  if (offset !== bytes.length) return fail();
  return { kind: 'point', bytes, positions, colors, bounds: { min, max }, materials: [{ sourceLocator: { kind: 'representationMaterial', slotIndex: 0 },
    sourceSemantics: { coverage: { kind: 'opaque' }, optics: 'surface', lighting: 'unlit', doubleSided: false } }],
    surfaceRanges: [{ kind: 'pointSample', nodeIndex: 0, primitiveIndex: 0, count }] };
}
