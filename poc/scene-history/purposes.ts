// Disposable semantic graph, NOT ProjectDocV2 wire or untrusted-file admission.
import { randomBytes } from 'node:crypto';
import { A, FORMAT, type Doc, type Ref, type Target, atHeads, heads, missing,
  require, same, validateRoot, refs } from './journal-format';

export type Purpose = 'teamWorkspace' | 'contribution' | 'backup' | 'review' | 'clean';
export type Node = Record<string, any> & { id: string; kind: string; active: boolean };
export interface Inventory {
  /** Already verified receipt/presence port; no payload reads for inspection. */
  verified: readonly Ref[];
  protected: readonly Ref[];
}
export interface Base {
  target: Target;
  heads: string[];
  inventory: Inventory;
  packageId: string;
}
export interface Workspace {
  doc: Doc;
  target: Target;
  inventory: Inventory;
  exchangeBases: readonly Base[];
}
export interface Snapshot { project: Record<string, any>; nodes: Record<string, Node> }
export interface Result {
  purpose: Purpose;
  historyBearing: boolean;
  standalone: boolean;
  mode: 'view' | 'edit' | 'restore' | 'merge';
  blobs: Ref[];
  target?: Target;
  metadata?: Uint8Array;
  changes?: Uint8Array[];
  baseHeads?: string[];
  targetHeads?: string[];
  exchangeBases?: readonly Base[];
  snapshot?: Snapshot;
  disclosure: readonly string[];
  preflight?: { sceneName: string; models: number; captions: number; media: number; entryView: 'included' | 'none' };
}
export interface Options {
  sceneId?: string;
  base?: Base;
  /** Explicit preflight confirmation, not a silent fallback boolean. */
  entryViewConfirmation?: '開始視点なし';
  /** Validated owner/method/content/role/surface relation; false means omit BOTH weak fields. */
  validEvidence?: (anchor: any, included: ReadonlyMap<string, Node>) => boolean;
}
type Shape = string | readonly Shape[] | { readonly [key: string]: Shape };
const vector = ['number'] as const;
const blob: Shape = { algorithm: 'string', digest: 'string', byteLength: 'number', mediaType: 'string' };
const anchor: Shape = { kind: 'string', 'assetId?': 'id', 'assetFrameId?': 'id', 'projectFrameId?': 'id',
  'positionAsset?': vector, 'positionProject?': vector, 'authoredAnchorCompatibilityId?': 'id',
  'authoredAssetRevisionId?': 'id', 'hitEvidence?': { method: 'string', 'confidence?': 'string',
    'source?': { representationId: 'id', 'surfaceRef?': { index: 'number' } } } };
const routing: Shape = { scope: { kind: 'string', 'sceneId?': 'id' },
  target: { assetId: 'id', variantFamilyId: 'id', materialLayoutId: 'id', logicalMaterialSlotId: 'id' } };
const fields: Record<string, Record<string, Shape>> = {
  scene: { name: 'string', orderKey: 'string', 'defaultViewId?': 'id' },
  asset: { label: 'string', assetFrameId: 'id', activeBindingId: 'id' },
  binding: { assetId: 'id', assetRevisionId: 'id', transform: vector, 'parentBindingId?': 'id' },
  revision: { assetId: 'id', representationIds: ['id'],
    classes: [{ id: 'id', families: ['id'] }], 'parentRevisionId?': 'id' },
  representation: { assetId: 'id', blob, variantFamilyId: 'id', materialLayoutId: 'id',
    slotIds: ['id'], 'compositeGroupId?': 'id', 'derivedFrom?': 'id' },
  caption: { title: 'string', body: 'string', anchor },
  sceneAsset: { sceneId: 'id', assetId: 'id', orderKey: 'string' },
  sceneCaption: { sceneId: 'id', captionId: 'id', orderKey: 'string' },
  attachment: { captionId: 'id', mediaId: 'id', orderKey: 'string' },
  media: { label: 'string', blob },
  tag: { label: 'string' },
  tagMembership: { captionId: 'id', tagId: 'id' },
  view: { sceneId: 'id', name: 'string', projectFrameId: 'id', camera: { eye: vector, target: vector }, background: { color: 'string' } },
  material: { routing, appearance: { color: 'string' }, compositing: { mode: 'string' } },
};
const projectShape: Shape = { title: 'string', frameId: 'id', defaultSceneId: 'id' };
const immutable = new Set(['binding', 'revision', 'representation', 'media']);
const idPattern = /^(prj|hep|frm|ast|bnd|rev|rep|fam|lay|slot|cmp|grp|cap|att|tag|tgm|med|scn|sam|scm|view|ovr|evt|mig|iss|pkg|snp)_[0-9a-f]{32}$/;
export const freshId = (prefix: string) => `${prefix}_${randomBytes(16).toString('hex')}`;
export const atomic = (value: unknown) => new A.ImmutableString(JSON.stringify(value));
export function put(draft: Record<string, any>, node: Node): void {
  draft.nodes[node.id] ??= {};
  for (const [key, value] of Object.entries(node)) draft.nodes[node.id][key] = atomic(value);
}
export function bootstrap(): { doc: Doc; target: Target } {
  const identity = { projectId: freshId('prj'), historyEpoch: freshId('hep'), lineageSeed: randomBytes(32).toString('hex') };
  const doc = A.from<Record<string, any>>({ schema: { major: 2, minor: 0 },
    identity: Object.fromEntries(Object.entries(identity).map(([k, v]) => [k, new A.ImmutableString(v)])),
    project: {}, nodes: {}, migration: {}, contributors: {} });
  return { doc, target: { identity, metadataEnvelope: { adapter: 'automerge', adapterFormatVersion: FORMAT,
    lineageProof: { kind: 'automerge-root-change-v1', rootChangeHash: heads(doc)[0]! } } } };
}

// These schemas pin only the synthetic field policy. Unknowns remain in original
// history; history-free output rejects rather than interpreting or dropping them.
function shape(value: any, policy: Shape, remap?: (id: string) => string): any {
  if (typeof policy === 'string') {
    if (policy === 'id') { require(typeof value === 'string' && idPattern.test(value), 'invalid nominal ID'); return remap ? remap(value) : value; }
    require(typeof value === policy && (policy !== 'number' || Number.isFinite(value)), `invalid ${policy}`); return value;
  }
  if (Array.isArray(policy)) {
    require(Array.isArray(value), 'invalid array'); return value.map(v => shape(v, policy[0]!, remap));
  }
  require(value && typeof value === 'object' && !Array.isArray(value), 'invalid object');
  const entries = Object.entries(policy);
  require(Object.keys(value).every(k => entries.some(([p]) => p.replace(/\?$/, '') === k)), 'unknown field');
  return Object.fromEntries(entries.flatMap(([p, s]) => {
    const key = p.replace(/\?$/, '');
    if (!(key in value)) { require(p.endsWith('?'), `missing ${key}`); return []; }
    return [[key, shape(value[key], s, remap)]];
  }));
}
function candidates(map: Record<string, any>, key: string): any[] {
  const conflict = A.getConflicts(map, key);
  return (conflict ? Object.values(conflict) : key in map ? [map[key]] : []).map(v => JSON.parse(String(v)));
}
function variants(map: Record<string, any>): any[] {
  let result: any[] = [{}];
  for (const key of Object.keys(map)) {
    const values = candidates(map, key);
    require(result.length * values.length <= 64, 'synthetic conflict budget');
    result = result.flatMap(r => values.map(v => ({ ...r, [key]: v })));
  }
  return result;
}
class Graph {
  readonly nodes = new Map<string, Node[]>();
  readonly projects: Record<string, any>[];
  unknown = false;
  constructor(readonly doc: Doc) {
    require(doc.schema?.major === 2, 'unsupported synthetic schema');
    for (const key of ['schema', 'project', 'nodes', 'migration', 'contributors'])
      require(Object.keys(A.getConflicts(doc, key) ?? {}).length <= 1, 'conflicting root map');
    for (const key of ['major', 'minor']) require(Object.keys(A.getConflicts(doc.schema, key) ?? {}).length <= 1, 'conflicting schema');
    this.unknown = Object.keys(doc).some(k => !['schema', 'identity', 'project', 'nodes', 'migration', 'contributors'].includes(k));
    this.inspect(() => shape(JSON.parse(JSON.stringify(doc.schema)), { major: 'number', minor: 'number' }));
    this.inspect(() => shape(JSON.parse(JSON.stringify(doc.identity)), { projectId: 'id', historyEpoch: 'id', lineageSeed: 'string' }));
    for (const p of variants(doc.migration)) this.inspect(() => shape(p, { 'activeBaselineBlobs?': [blob], 'registry?': 'string' }));
    for (const p of variants(doc.contributors)) this.inspect(() => shape(p, { 'label?': 'string' }));
    this.projects = variants(doc.project);
    for (const p of this.projects) this.inspect(() => shape(p, projectShape));
    for (const id of Object.keys(doc.nodes)) {
      require(Object.keys(A.getConflicts(doc.nodes, id) ?? {}).length <= 1, 'conflicting entity map');
      const versions = variants(doc.nodes[id]) as Node[];
      require(versions.length && versions.every(n => n.id === id && n.kind === versions[0]!.kind), 'invalid entity identity');
      this.nodes.set(id, versions);
      for (const n of versions) this.inspect(() => {
        require(fields[n.kind], 'unknown kind'); shape(n, { id: 'id', kind: 'string', active: 'boolean', ...fields[n.kind] });
      });
    }
  }
  private inspect(fn: () => void) {
    try { fn(); } catch (error) {
      if (String(error).includes('unknown ')) this.unknown = true;
      else throw error;
    }
  }
  get(id: string, strict = true): Node {
    const list = this.nodes.get(id); require(list?.length, `missing resource ${id}`);
    if (strict) require(list.length === 1 && list[0]!.active, `unresolved resource ${id}`);
    return list[0]!;
  }
  project(): Record<string, any> {
    require(this.projects.length === 1, 'unresolved project'); return this.projects[0]!;
  }
  relevant(id: string): boolean {
    const life = candidates(this.doc.nodes[id], 'active');
    return life.length > 1 || life.some(v => v === true);
  }
}
function blobSet(values: readonly Ref[]): Ref[] {
  const result = new Map<string, Ref>();
  for (const ref of values) {
    refs([ref]); const prior = result.get(ref.digest);
    require(!prior || same(prior, ref), 'inconsistent blob descriptor'); result.set(ref.digest, ref);
  }
  return [...result.values()].sort((a, b) => a.digest.localeCompare(b.digest));
}
function ensure(refs: readonly Ref[], inventory: Inventory): void {
  const verified = new Map(blobSet(inventory.verified).map(r => [r.digest, r]));
  for (const ref of refs) require(same(verified.get(ref.digest) ?? null, ref), `missing verified blob ${ref.digest}`);
}
function edges(n: Node, includeSources: boolean): string[] {
  switch (n.kind) {
    case 'asset': return [n.activeBindingId];
    case 'binding': return [n.assetId, n.assetRevisionId];
    case 'revision': return [n.assetId, ...n.representationIds];
    case 'representation': return [n.assetId, ...(includeSources && n.derivedFrom ? [n.derivedFrom] : [])];
    case 'caption': return n.anchor.kind === 'asset' ? [n.anchor.assetId] : [];
    case 'sceneAsset': return [n.sceneId, n.assetId];
    case 'sceneCaption': return [n.sceneId, n.captionId];
    case 'attachment': return [n.captionId, n.mediaId];
    case 'tagMembership': return [n.captionId, n.tagId];
    case 'view': return [n.sceneId];
    case 'material': return [n.routing.target.assetId, ...(n.routing.scope.kind === 'scene' ? [n.routing.scope.sceneId] : [])];
    default: return [];
  }
}
function roots(graph: Graph, historyBearing = true): string[] {
  return [...graph.nodes].filter(([id, list]) => historyBearing && list.length > 1 ||
    !immutable.has(list[0]!.kind) && graph.relevant(id)).map(([id]) => id);
}
function protectedClosure(graph: Graph, inventory: Inventory): Ref[] {
  const visited = new Set<string>(), pending = roots(graph), blobs: Ref[] = [];
  while (pending.length) {
    const id = pending.pop()!; if (visited.has(id)) continue; visited.add(id);
    const list = graph.nodes.get(id); require(list?.length, `missing resource ${id}`);
    for (const n of list) {
      if (!fields[n.kind]) continue; // Opaque inventory, never guessed unknown edges.
      if (n.blob) blobs.push(n.blob);
      pending.push(...edges(n, true));
    }
  }
  // Explicit synthetic registered-plan port. This does not validate a real recipe.
  for (const value of candidates(graph.doc.migration, 'activeBaselineBlobs')) blobs.push(...value);
  if (graph.unknown) blobs.push(...inventory.protected);
  const result = blobSet(blobs); ensure(result, inventory); return result;
}
export function gcAttempt(workspace: Workspace): 'refused' {
  validateRoot(workspace.doc, workspace.target);
  protectedClosure(new Graph(workspace.doc), workspace.inventory);
  // No destructive collector exists in this semantic port, including when known.
  return 'refused';
}

function snapshot(graph: Graph, purpose: 'review' | 'clean', options: Options): { snapshot: Snapshot; blobs: Ref[]; preflight?: Result['preflight'] } {
  require(!graph.unknown, 'unknown fields block history-free output');
  const review = purpose === 'review';
  const included = new Map<string, Node>(), hidden = new Map<string, Node>();
  const pending: string[] = [], displayed = new Set<string>();
  let selected: Node | undefined, omittedView: string | undefined;
  const authoritativeProject = review ? (() => {
    // An unrelated default-Scene conflict is not a selected-review conflict.
    const p: Record<string, any> = {};
    for (const key of ['title', 'frameId']) { const values = candidates(graph.doc.project, key);
      require(values.length === 1, `unresolved project ${key}`); p[key] = values[0]; }
    return p;
  })() : graph.project();
  if (review) {
    require(options.sceneId, 'select one durable Scene');
    const raw = graph.doc.nodes[options.sceneId]; require(raw, 'missing selected Scene');
    if (candidates(raw, 'defaultViewId').length > 1) {
      require(options.entryViewConfirmation === '開始視点なし', 'confirm 開始視点なし');
      const noDefault = variantsWithout(raw, 'defaultViewId');
      require(noDefault.length === 1 && noDefault[0].active, 'unresolved selected Scene');
      graph.nodes.set(options.sceneId, noDefault);
    }
    selected = graph.get(options.sceneId);
    require(selected.kind === 'scene', 'selection is not a Scene'); pending.push(selected.id);
    for (const [id, versions] of graph.nodes) {
      if (!graph.relevant(id)) continue;
      if (versions.some(n => ['sceneAsset', 'sceneCaption'].includes(n.kind) && n.sceneId === selected!.id)) {
        const n = graph.get(id); pending.push(id); if (n.kind === 'sceneAsset') displayed.add(n.assetId);
      }
    }
  } else pending.push(...roots(graph, false));

  const addHidden = (id: string) => {
    const asset = graph.get(id); require(asset.kind === 'asset', 'invalid anchor owner');
    const binding = graph.get(asset.activeBindingId);
    require(binding.kind === 'binding' && binding.assetId === id, 'invalid hidden binding');
    hidden.set(id, { id, kind: 'nonvisualOwner', active: true, assetFrameId: asset.assetFrameId, transform: binding.transform });
  };
  const add = (id: string) => {
    if (included.has(id)) return;
    let n: Node;
    n = graph.get(id); included.set(id, n);
    if (n.kind === 'caption') {
      if (n.anchor.kind === 'asset' && review && !displayed.has(n.anchor.assetId)) addHidden(n.anchor.assetId);
      else pending.push(...edges(n, !review));
      for (const [child, list] of graph.nodes) if (list.some(v => ['attachment', 'tagMembership'].includes(v.kind) &&
        v.captionId === id && graph.relevant(child))) pending.push(child);
    } else pending.push(...edges(n, !review));
    if (n.kind === 'scene') {
      if (n.defaultViewId) pending.push(n.defaultViewId);
      for (const [child, list] of graph.nodes) if (list.some(v => v.kind === 'view' && v.sceneId === id &&
        graph.relevant(child))) pending.push(child);
    }
  };
  // Recover only a default-view POINTER conflict, without choosing a value.
  // All other Scene fields and all nonoptional views stay authoritative.
  if (review) {
    if (selected!.defaultViewId) {
      const views = graph.nodes.get(selected!.defaultViewId);
      if (views && views.length > 1) {
        require(options.entryViewConfirmation === '開始視点なし', 'confirm 開始視点なし');
        require(views.every(v => v.kind === 'view' && v.sceneId === selected!.id), 'invalid optional entry view');
        omittedView = selected!.defaultViewId;
        selected = { ...selected! }; delete selected.defaultViewId;
        graph.nodes.set(selected.id, [selected]);
      }
    }
  }
  while (pending.length) { const id = pending.pop()!; if (id !== omittedView) add(id); }
  // Applicable material selection is driven by durable targets, never UI state.
  if (review) {
    for (const [id, list] of graph.nodes) if (list.some(n => n.kind === 'material' && graph.relevant(id) &&
      displayed.has(n.routing.target.assetId) && (n.routing.scope.kind === 'project' || n.routing.scope.sceneId === selected!.id))) add(id);
    while (pending.length) { const id = pending.pop()!; if (id !== omittedView) add(id); }
  }
  const keys = new Set<string>();
  for (const n of included.values()) {
    let key: string | undefined;
    if (n.kind === 'sceneAsset') key = `asset:${n.sceneId}:${n.assetId}`;
    if (n.kind === 'sceneCaption') key = `caption:${n.sceneId}:${n.captionId}`;
    if (n.kind === 'material') { const r = n.routing, t = r.target;
      key = `material:${JSON.stringify([r.scope.kind, r.scope.sceneId ?? null, t.assetId, t.variantFamilyId, t.materialLayoutId, t.logicalMaterialSlotId])}`; }
    if (key) { require(!keys.has(key), `duplicate semantic key ${n.id}`); keys.add(key); }
    if (n.kind === 'view') require(n.projectFrameId === authoritativeProject.frameId && included.get(n.sceneId)?.kind === 'scene', 'invalid view frame/owner');
    if (n.kind === 'scene' && n.defaultViewId) require(included.get(n.defaultViewId)?.sceneId === n.id, 'invalid entry view owner');
  }
  if (!review) require(included.get(authoritativeProject.defaultSceneId)?.kind === 'scene', 'invalid default Scene');
  for (const n of included.values()) if (n.kind === 'caption') {
    if (n.anchor.kind === 'asset') {
      const owner = included.get(n.anchor.assetId) ?? hidden.get(n.anchor.assetId);
      require(owner?.assetFrameId === n.anchor.assetFrameId, 'invalid anchor frame');
    } else require(n.anchor.kind === 'project' && n.anchor.projectFrameId === authoritativeProject.frameId, 'invalid Project anchor');
  }
  const idMap = new Map<string, string>();
  const remap = (id: string) => { let next = idMap.get(id);
    if (!next) { next = freshId(id.split('_')[0]!); idMap.set(id, next); } return next; };
  const output: Record<string, Node> = {};
  for (const n of [...included.values(), ...hidden.values()]) {
    const copy = structuredClone(n);
    delete copy.parentBindingId; delete copy.parentRevisionId;
    if (review) delete copy.derivedFrom;
    if (review && copy.kind === 'revision') {
      const used = new Set([...included.values()].filter(v => v.kind === 'caption' && v.anchor.assetId === copy.assetId)
        .map(v => v.anchor.authoredAnchorCompatibilityId));
      copy.classes = copy.classes.filter((c: any) => used.has(c.id));
    }
    if (copy.kind === 'caption' && copy.anchor.kind === 'asset') {
      const a = copy.anchor, evidence = a.hitEvidence;
      const owner = included.get(a.assetId), binding = owner && included.get(owner.activeBindingId);
      const revision = binding && included.get(binding.assetRevisionId);
      const compatible = revision?.classes.some((c: any) => c.id === a.authoredAnchorCompatibilityId);
      if (review || !evidence || evidence.method !== 'manual' &&
        !(included.has(a.authoredAssetRevisionId) && included.has(evidence.source?.representationId) && options.validEvidence?.(a, included))) {
        delete a.authoredAssetRevisionId; if (evidence) delete evidence.source;
      } else if (evidence.method === 'manual') {
        delete evidence.source;
        if (compatible) a.authoredAssetRevisionId = revision!.id; else delete a.authoredAssetRevisionId;
      }
    }
    const policy = copy.kind === 'nonvisualOwner' ? { assetFrameId: 'id', transform: vector } : fields[copy.kind]!;
    const rewritten = shape(copy, { id: 'id', kind: 'string', active: 'boolean', ...policy }, remap) as Node;
    output[rewritten.id] = rewritten;
  }
  const project = shape({ ...authoritativeProject, ...(review ? { defaultSceneId: selected!.id } : {}) }, projectShape, remap);
  const blobs = blobSet([...included.values()].flatMap(n => n.blob ? [n.blob] : []));
  return { snapshot: { project, nodes: output }, blobs, ...(review ? { preflight: {
    sceneName: selected!.name, models: displayed.size,
    captions: [...included.values()].filter(n => n.kind === 'caption').length,
    media: [...included.values()].filter(n => n.kind === 'media').length,
    entryView: selected!.defaultViewId ? 'included' as const : 'none' as const,
  } } : {}) };
}
function variantsWithout(map: Record<string, any>, excluded: string): any[] {
  let result: any[] = [{}];
  for (const key of Object.keys(map).filter(k => k !== excluded)) {
    const values = candidates(map, key); require(result.length * values.length <= 64, 'synthetic conflict budget');
    result = result.flatMap(r => values.map(v => ({ ...r, [key]: v })));
  }
  return result;
}

export function derive(workspace: Workspace, purpose: Purpose, options: Options = {}): Result {
  require(['teamWorkspace', 'contribution', 'backup', 'review', 'clean'].includes(purpose), 'unknown purpose');
  const { doc, target, inventory } = workspace; validateRoot(doc, target);
  const graph = new Graph(doc);
  if (purpose === 'review' || purpose === 'clean') {
    const built = snapshot(graph, purpose, options); ensure(built.blobs, inventory);
    const result: Result = { purpose, historyBearing: false, standalone: true,
      mode: purpose === 'review' ? 'view' : 'edit', ...built,
      disclosure: ['元のラベル・本文を含みます', 'モデル・メディア内部のメタデータは除去しません', '元の共同編集・移行履歴は引き継ぎません'] };
    if (purpose === 'clean') {
      const fresh = bootstrap(); const clean = A.change(fresh.doc, { time: 0 }, d => {
        for (const [k, v] of Object.entries(built.snapshot.project)) d.project[k] = atomic(v);
        for (const n of Object.values(built.snapshot.nodes)) put(d, n);
      });
      result.metadata = A.save(clean); result.target = fresh.target; result.targetHeads = heads(clean);
      validateRoot(clean, fresh.target);
    }
    return result;
  }
  const closure = protectedClosure(graph, inventory);
  const result: Result = { purpose, historyBearing: true, standalone: purpose !== 'contribution',
    mode: purpose === 'contribution' ? 'merge' : purpose === 'backup' ? 'restore' : 'edit',
    target: structuredClone(target), targetHeads: heads(doc), blobs: closure, disclosure: ['編集履歴を含みます'] };
  if (purpose === 'contribution') {
    const base = options.base;
    require(base && workspace.exchangeBases.some(b => same(b, base)), 'select a retained exchange base');
    require(same(base.target, target), 'wrong base lineage');
    require(base.heads.length > 0 && same(base.heads, [...new Set(base.heads)].sort()), 'invalid base heads');
    const baseDoc = atHeads(doc, base.heads); validateRoot(baseDoc, target);
    require(same(heads(baseDoc), base.heads), 'base is not an exact head set');
    const guaranteed = new Map(protectedClosure(new Graph(baseDoc), base.inventory).map(r => [r.digest, r]));
    result.blobs = closure.filter(r => !same(guaranteed.get(r.digest) ?? null, r));
    result.changes = missing(baseDoc, doc); result.baseHeads = [...base.heads];
  } else result.metadata = A.save(doc);
  if (purpose === 'backup') {
    // Explicit retention pins may exceed current roots; backup is complete recovery.
    result.blobs = blobSet([...closure, ...inventory.protected]); ensure(result.blobs, inventory);
    result.exchangeBases = structuredClone(workspace.exchangeBases);
    result.disclosure = [...result.disclosure, '交換の基準記録を含みます。相手の受領を証明するものではありません'];
  }
  return result;
}
