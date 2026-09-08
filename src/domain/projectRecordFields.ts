import { lifecycleFields, lifecycleValue } from './recordFields';
import { DomainValidationError, reject, scalarLength, singleLineControls, type JsonObject, type JsonValue } from './values';

type Path = readonly string[];
/** Exact finite binary64 value in units of 2^-1074; transient arithmetic, never persisted. */
function binaryInteger(n: number): bigint {
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, n);
  const bits = view.getBigUint64(0), exponent = Number((bits >> 52n) & 0x7ffn), fraction = bits & ((1n << 52n) - 1n);
  const magnitude = exponent ? ((1n << 52n) | fraction) << BigInt(exponent - 1) : fraction;
  return bits >> 63n ? -magnitude : magnitude;
}
/** Internal checks on the already cloned canonical tree. No raw input/authority API. */
export class ProjectRecordFields {
  unknown = false;
  object(v: JsonValue, p: Path): JsonObject {
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as JsonObject : reject('type', p);
  }
  shape(v: JsonValue, keys: readonly string[], p: Path): JsonObject {
    const o = this.object(v, p); if (Object.keys(o).some(k => !keys.includes(k))) this.unknown = true; return o;
  }
  required(o: JsonObject, k: string, p: Path): JsonValue { return Object.hasOwn(o, k) ? o[k]! : reject('missing', [...p, k]); }
  optional(o: JsonObject, k: string, p: Path, check: (v: JsonValue, path: Path) => void) { if (Object.hasOwn(o, k)) check(o[k]!, [...p, k]); }
  absent(o: JsonObject, keys: readonly string[], p: Path) { for (const k of keys) if (Object.hasOwn(o, k)) reject('value', [...p, k]); }
  text(v: JsonValue, max: number, p: Path, body = false): string {
    if (typeof v !== 'string') return reject('type', p); scalarLength(v, max, p);
    if ((body ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029]/u : singleLineControls).test(v)) reject('value', p);
    return v;
  }
  pattern(v: JsonValue, pattern: RegExp, p: Path): string { return typeof v === 'string' && pattern.test(v) ? v : reject('value', p); }
  id(v: JsonValue, prefix: string, p: Path) { if (typeof v !== 'string' || !new RegExp(`^${prefix}_[0-9a-f]{32}$`).test(v)) reject('id', p); return v as string; }
  digest(v: JsonValue, p: Path) { return this.pattern(v, /^[0-9a-f]{64}$/, p); }
  order(v: JsonValue, p: Path) { return this.pattern(v, /^[0-9A-Za-z]{1,64}$/, p); }
  enum(v: JsonValue, values: readonly (string | number | boolean)[], p: Path) { if (!values.includes(v as string)) reject('value', p); }
  number(v: JsonValue, p: Path): number { return typeof v === 'number' && Number.isFinite(v) ? v : reject('value', p); }
  positive(v: JsonValue, p: Path) { const n = this.number(v, p); if (n <= 0) reject('value', p); return n; }
  integer(v: JsonValue, p: Path) { const n = this.number(v, p); if (!Number.isSafeInteger(n) || n < 0) reject('value', p); return n; }
  unit(v: JsonValue, p: Path) { const n = this.number(v, p); if (n < 0 || n > 1) reject('value', p); return n; }
  list(v: JsonValue, max: number, p: Path, min = 0): readonly JsonValue[] {
    if (!Array.isArray(v)) return reject('type', p); if (v.length < min || v.length > max) reject('limit', p); return v;
  }
  vector(v: JsonValue, p: Path, length = 3): number[] { return this.list(v, length, p, length).map((n, i) => this.number(n, [...p, String(i)])); }
  color(v: JsonValue, p: Path) { this.vector(v, p).forEach((n, i) => this.unit(n, [...p, String(i)])); }
  normal(v: JsonValue, p: Path) { const a = this.vector(v, p); if (Math.abs(Math.hypot(...a) - 1) > 1e-12) reject('canonical', p); return a; }
  sorted(v: JsonValue, p: Path, check: (v: JsonValue, p: Path) => string, min = 0, max = 4096) {
    const a = this.list(v, max, p, min).map((v, i) => check(v, [...p, String(i)]));
    if (a.some((v, i) => i > 0 && a[i - 1]! >= v)) reject('canonical', p); return a;
  }
  mime(v: JsonValue, p: Path) {
    const text = this.pattern(v, /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/, p);
    if (text.length > 127) reject('limit', p);
  }
  lifecycle(v: JsonValue, p: Path) {
    const o = this.shape(v, lifecycleFields, p);
    try { lifecycleValue(o); } catch (e) {
      if (e instanceof DomainValidationError) throw new DomainValidationError(e.issue.code, [...p, ...e.issue.path.slice(1)]); throw e;
    }
  }
  transform(v: JsonValue, p: Path, reflection = false) {
    const o = this.shape(v, ['translation', 'rotationXYZW', 'uniformScale', ...(reflection ? ['reflection'] : [])], p);
    this.vector(this.required(o, 'translation', p), [...p, 'translation']);
    const q = this.vector(this.required(o, 'rotationXYZW', p), [...p, 'rotationXYZW'], 4);
    if (Math.abs(Math.hypot(...q) - 1) > 1e-12 || (q[3] || q[0] || q[1] || q[2] || 0) <= 0) reject('canonical', [...p, 'rotationXYZW']);
    this.positive(this.required(o, 'uniformScale', p), [...p, 'uniformScale']);
    if (reflection) this.enum(this.required(o, 'reflection', p), ['none', 'x'], [...p, 'reflection']);
    else this.absent(o, ['reflection'], p);
  }
  bounds(v: JsonValue, p: Path) {
    const o = this.shape(v, ['min', 'max'], p), min = this.vector(this.required(o, 'min', p), [...p, 'min']), max = this.vector(this.required(o, 'max', p), [...p, 'max']);
    if (min.some((v, i) => v > max[i]!)) reject('value', p);
  }
  blob(v: JsonValue, p: Path) {
    const o = this.shape(v, ['algorithm', 'digest', 'byteLength', 'mediaType'], p);
    this.enum(this.required(o, 'algorithm', p), ['sha256'], [...p, 'algorithm']); this.digest(this.required(o, 'digest', p), [...p, 'digest']);
    this.integer(this.required(o, 'byteLength', p), [...p, 'byteLength']); this.mime(this.required(o, 'mediaType', p), [...p, 'mediaType']);
  }
  tool(v: JsonValue, p: Path) {
    const o = this.shape(v, ['id', 'version'], p);
    this.pattern(this.required(o, 'id', p), /^[a-z0-9][a-z0-9.-]{0,63}$/, [...p, 'id']);
    const version = this.text(this.required(o, 'version', p), 128, [...p, 'version']);
    if (!version || /[\\/]/.test(version)) reject('value', [...p, 'version']);
  }
  sourceLocator(v: JsonValue, p: Path): string {
    const o = this.shape(v, ['kind', 'materialIndex', 'slotIndex'], p);
    this.enum(this.required(o, 'kind', p), ['gltfMaterial', 'representationMaterial', 'derivedMaterial'], [...p, 'kind']);
    const field = o.kind === 'gltfMaterial' ? 'materialIndex' : 'slotIndex';
    this.integer(this.required(o, field, p), [...p, field]); this.absent(o, [field === 'materialIndex' ? 'slotIndex' : 'materialIndex'], p);
    return `${o.kind}:${o[field]}`;
  }
  camera(v: JsonValue, p: Path) {
    const o = this.shape(v, ['position', 'target', 'up', 'projection'], p);
    const position = this.vector(this.required(o, 'position', p), [...p, 'position']), target = this.vector(this.required(o, 'target', p), [...p, 'target']);
    const up = this.normal(this.required(o, 'up', p), [...p, 'up']);
    // No numeric camera-range policy exists here. Exact binary arithmetic avoids
    // overflow and loss of a tiny perpendicular component when normalizing a huge direction.
    const d = target.map((v, i) => binaryInteger(v) - binaryInteger(position[i]!)), u = up.map(binaryInteger);
    if (d.every(n => n === 0n)) reject('value', p);
    if (u[1]! * d[2]! === u[2]! * d[1]! && u[2]! * d[0]! === u[0]! * d[2]! && u[0]! * d[1]! === u[1]! * d[0]!) reject('value', [...p, 'up']);
    const projection = this.shape(this.required(o, 'projection', p), ['kind', 'verticalFovRadians', 'verticalSpan'], [...p, 'projection']);
    this.enum(this.required(projection, 'kind', p), ['perspective', 'orthographic'], [...p, 'projection', 'kind']);
    const field = projection.kind === 'perspective' ? 'verticalFovRadians' : 'verticalSpan';
    const n = this.positive(this.required(projection, field, p), [...p, 'projection', field]);
    if (field === 'verticalFovRadians' && n >= Math.PI) reject('value', [...p, 'projection', field]);
    this.absent(projection, [field === 'verticalSpan' ? 'verticalFovRadians' : 'verticalSpan'], [...p, 'projection']);
  }
  background(v: JsonValue, p: Path) {
    const o = this.shape(v, ['kind', 'colorSrgb'], p); this.enum(this.required(o, 'kind', p), ['solid', 'transparent'], [...p, 'kind']);
    if (o.kind === 'solid') this.color(this.required(o, 'colorSrgb', p), [...p, 'colorSrgb']); else this.absent(o, ['colorSrgb'], p);
  }
  anchor(v: JsonValue, p: Path) {
    const o = this.shape(v, ['kind', 'assetId', 'assetFrameId', 'positionAsset', 'normalAsset', 'authoredAssetRevisionId', 'authoredAnchorCompatibilityId', 'hitEvidence', 'projectFrameId', 'positionProject', 'normalProject'], p);
    this.enum(this.required(o, 'kind', p), ['asset', 'project'], [...p, 'kind']);
    if (o.kind === 'project') {
      this.absent(o, ['assetId', 'assetFrameId', 'positionAsset', 'normalAsset', 'authoredAssetRevisionId', 'authoredAnchorCompatibilityId', 'hitEvidence'], p);
      this.id(this.required(o, 'projectFrameId', p), 'frm', [...p, 'projectFrameId']); this.vector(this.required(o, 'positionProject', p), [...p, 'positionProject']);
      this.optional(o, 'normalProject', p, (v, p) => this.normal(v, p)); return;
    }
    this.absent(o, ['projectFrameId', 'positionProject', 'normalProject'], p);
    for (const [field, prefix] of [['assetId', 'ast'], ['assetFrameId', 'frm'], ['authoredAnchorCompatibilityId', 'cmp']] as const) this.id(this.required(o, field, p), prefix, [...p, field]);
    this.optional(o, 'authoredAssetRevisionId', p, (v, p) => this.id(v, 'rev', p)); this.vector(this.required(o, 'positionAsset', p), [...p, 'positionAsset']);
    this.optional(o, 'normalAsset', p, (v, p) => this.normal(v, p));
    if (!Object.hasOwn(o, 'hitEvidence')) return;
    const ep = [...p, 'hitEvidence'], e = this.shape(o.hitEvidence!, ['method', 'confidence', 'source'], ep);
    this.enum(this.required(e, 'method', ep), ['manual', 'mesh', 'point-cloud', 'direct-splat', 'gpu-id-depth', 'proxy'], [...ep, 'method']);
    if (e.method === 'manual') { this.absent(o, ['normalAsset'], p); this.absent(e, ['confidence', 'source'], ep); return; }
    this.optional(e, 'confidence', ep, (v, p) => this.unit(v, p));
    if (!Object.hasOwn(e, 'source')) return;
    this.id(this.required(o, 'authoredAssetRevisionId', p), 'rev', [...p, 'authoredAssetRevisionId']);
    const sp = [...ep, 'source'], s = this.shape(e.source!, ['representationId', 'surfaceRef'], sp);
    this.id(this.required(s, 'representationId', sp), 'rep', [...sp, 'representationId']);
    if (!Object.hasOwn(s, 'surfaceRef')) return;
    const rp = [...sp, 'surfaceRef'], r = this.shape(s.surfaceRef!, ['kind', 'nodeIndex', 'primitiveIndex', 'triangleIndex', 'barycentric', 'pointIndex', 'sourceSplatIndex'], rp);
    const kind = e.method === 'point-cloud' ? 'pointSample' : e.method === 'mesh' || e.method === 'proxy' ? 'meshTriangle' : 'splatSample';
    this.enum(this.required(r, 'kind', rp), [kind], [...rp, 'kind']);
    const indices = kind === 'splatSample' ? ['sourceSplatIndex'] : ['nodeIndex', 'primitiveIndex', kind === 'meshTriangle' ? 'triangleIndex' : 'pointIndex'];
    indices.forEach(k => this.integer(this.required(r, k, rp), [...rp, k]));
    this.absent(r, ['nodeIndex', 'primitiveIndex', 'triangleIndex', 'pointIndex', 'sourceSplatIndex'].filter(k => !indices.includes(k)), rp);
    if (kind === 'meshTriangle') { const b = this.vector(this.required(r, 'barycentric', rp), [...rp, 'barycentric']); b.forEach(v => this.unit(v, rp));
      if (Math.abs(b.reduce((sum, n) => sum + n, 0) - 1) > 1e-6) reject('value', [...rp, 'barycentric']); }
    else this.absent(r, ['barycentric'], rp);
  }
}
