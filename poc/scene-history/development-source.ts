import { cloneCanonicalValue, type JsonObject, type JsonValue } from '../../src/domain/values';
import { projectRecordMaps } from '../../src/domain/projectRecords';
import type { ProjectCandidateInput } from '../../src/domain/projectCandidates';
import { inspectAtomicHistory, HistoryIndex, type AtomicHistory, type AtomicWrite, type AtomicHistoryInspection } from '../../src/domain/atomicHistory';
import type { HistoryCell, HistorySnapshot } from '../../src/harness/projectScene/historyPort';
import { historySeed, projectHistory } from '../../src/harness/projectScene/historyProjection';
import { previewHistory } from '../../src/harness/projectScene/historyPort';
import { createSyntheticProject, fixtureIds } from '../../src/harness/projectScene/fixture';
import { readFixtureModel, canonicalFixture } from '../../src/harness/projectScene/modelClosure';
import type * as Automerge from '@automerge/automerge/slim';
import { readFlatAtomicHistory } from './atomic-read';

// New page-memory source only. Never converts/replays a previously authored history.
export const developmentSourceLimits = Object.freeze({ maxNodes: 500_000, maxDepth: 32, maxStringScalars: 65_536, maxWork: 5_000_000 });
export const sourceKey = (path: readonly string[]) => JSON.stringify(path);
export const commandSourceKey = (key: string) => sourceKey(['developmentCommands', key]);
const declaration = { schema: { major: 2, minor: 0 }, recordMaps: Object.keys(projectRecordMaps) };
const declarationKey = sourceKey(['developmentRoot']);
const parse = (text: string): JsonValue => cloneCanonicalValue(JSON.parse(text), developmentSourceLimits);
function fail(message = '開発用の元データと操作の対応を確認できません。'): never { throw new Error(message); }
const object = (v: JsonValue): JsonObject => v && typeof v === 'object' && !Array.isArray(v) ? v as JsonObject : fail();
function pathOf(key: string): string[] {
  const path = parse(key);
  if (!Array.isArray(path) || !path.length || path.some(s => typeof s !== 'string' || !s.length) || sourceKey(path as string[]) !== key) fail();
  return path as string[];
}
const encode = (v: unknown) => canonicalFixture(v);
const plain = (cell: HistoryCell | undefined): string => cell?.kind === 'value' ? cell.value : fail();

/** Current sidecar cells are convenience only; originalAtomicHistory retains absent candidates too. */
export function readDevelopmentSource(A: typeof Automerge, doc: Automerge.Doc<{ cells: Record<string, Automerge.ImmutableString> }>): HistorySnapshot {
  const read = readFlatAtomicHistory(A, doc, { path: key => [key], value: (_key, text) => text }, developmentSourceLimits);
  return sourceSnapshot(read);
}
function sourceSnapshot(read: AtomicHistoryInspection): HistorySnapshot {
  if (read.kind === 'rejected') fail();
  const cells: Record<string, HistoryCell> = {}, cellVersions: Record<string, string> = {};
  for (const field of read.fields) {
    const key = field.path[0]!, candidates = field.candidates.flatMap(c => c.value.kind === 'value' && typeof c.value.value === 'string' ? [{ id: c.operationId, value: c.value.value }] : []);
    if (candidates.length) cells[key] = candidates.length === 1 ? { kind: 'value', value: candidates[0]!.value } : { kind: 'conflict', candidates };
    cellVersions[key] = JSON.stringify(field.candidates.map(c => c.operationId));
  }
  return { token: read.history.token, cells, cellVersions, originalAtomicHistory: read.history,
    causalChanges: read.history.changes.map(c => ({ id: c.id, deps: c.deps, writes: Object.fromEntries(c.writes.map(w =>
      [w.path[0]!, w.value.kind === 'absent' ? null : w.value.value as string])) })) };
}

/** UI-only sidecar, with exact original cell/change identities; never the Project read authority. */
export function developmentCommandSnapshot(source: HistorySnapshot): HistorySnapshot {
  const cells: Record<string, HistoryCell> = {}, versions: Record<string, string> = {};
  for (const [key, cell] of Object.entries(source.cells)) {
    const path = pathOf(key); if (path[0] !== 'developmentCommands') continue;
    if (path.length !== 2) fail();
    const text = (v: string) => { const decoded = parse(v); if (typeof decoded !== 'string') fail(); return decoded; };
    cells[path[1]!] = cell.kind === 'value' ? { kind: 'value', value: text(cell.value) } :
      { kind: 'conflict', candidates: cell.candidates.map(c => ({ id: c.id, value: text(c.value) })) };
    if (source.cellVersions?.[key]) versions[path[1]!] = source.cellVersions[key]!;
  }
  const causalChanges = source.causalChanges?.map(c => ({ id: c.id, deps: c.deps,
    writes: Object.fromEntries(Object.entries(c.writes).flatMap(([key, text]) => {
      const path = pathOf(key); if (path[0] !== 'developmentCommands') return [];
      if (path.length !== 2 || text === null) fail(); const v = parse(text); if (typeof v !== 'string') fail();
      return [[path[1]!, v]];
    })) }));
  return { token: source.token, cells, cellVersions: versions, causalChanges };
}

/** One-to-one decoding only: no generated IDs, facet expansion or materialized-winner reconstruction. */
export function developmentCandidateInput(source: HistorySnapshot): ProjectCandidateInput {
  const raw = source.originalAtomicHistory; if (!raw) fail('元の変更履歴がありません。');
  if (source.token !== raw.token) fail();
  verifyDevelopmentCorrespondence(raw);
  const declarationWrites = raw.changes.flatMap(c => c.writes.filter(w => w.path.length === 1 && w.path[0] === declarationKey).map(w => ({ c, w })));
  if (declarationWrites.length !== 1 || declarationWrites[0]!.c.deps.length ||
    declarationWrites[0]!.w.value.kind !== 'value' || declarationWrites[0]!.w.value.value !== encode(declaration)) fail();
  const history: AtomicHistory = { token: source.token, heads: raw.heads, changes: raw.changes.map(c => ({ ...c,
    writes: c.writes.map((w): AtomicWrite => {
      if (w.path.length !== 1) fail();
      return { operationId: w.operationId, path: pathOf(w.path[0]!), value: w.value.kind === 'absent' ? w.value :
        { kind: 'value', value: typeof w.value.value === 'string' ? parse(w.value.value) : fail() } };
    }) })) };
  const inspected = inspectAtomicHistory(history, developmentSourceLimits); if (inspected.kind === 'rejected') fail();
  return { ...declaration, history: inspected.history };
}

/** Author canonical fields BEFORE a candidate change. A null output is an actual field deletion. */
export function encodeDevelopmentCommands(source: HistorySnapshot | undefined, commands: Readonly<Record<string, string>>): Readonly<Record<string, string | null>> {
  const previous = source ? developmentCommandSnapshot(source) : undefined;
  if (previous) projectHistory(previewHistory(previous, `preflight:${source!.token}`, commands), previous);
  const writes: Record<string, string | null> = {};
  const put = (path: string[], v: unknown) => { writes[sourceKey(path)] = encode(v); };
  const once = (path: string[], v: unknown) => {
    const key = sourceKey(path), text = encode(v), pending = writes[key], old = source?.cells[key];
    if (pending !== undefined && pending !== text) fail('固定データの識別情報が重複しています。');
    if (old && plain(old) !== text) fail('固定データを変更できません。');
    if (!old) writes[key] = text;
  };
  const fields = (map: string, id: string, values: JsonObject) => Object.entries(values).forEach(([field, v]) => once([map, id, field], v));
  for (const [key, text] of Object.entries(commands)) {
    const [kind, id, field, extra] = key.split('/'); if (!id || extra !== undefined || typeof text !== 'string') fail();
    writes[commandSourceKey(key)] = encode(text);
    if (kind === 'model' && field === undefined) {
      const closure = readFixtureModel(text); if (closure.binding.id !== id) fail();
      once(['assetBindingsById', closure.binding.id], closure.binding);
      once(['assetRevisionsById', closure.revision.id], closure.revision);
      once(['representationsById', closure.representation.id], closure.representation);
    } else if (kind === 'asset' && field === 'identity') {
      const meta = object(parse(text)); if (meta.id !== id) fail();
      fields('assetsById', id, { id, label: meta.label!, assetFrameId: meta.assetFrameId!,
        lifecycle: { state: 'active', eventId: meta.eventId!, reason: source ? 'conflictResolution' : 'initial' } });
    } else if (kind === 'asset' && field === 'binding') {
      put(['assetsById', id, 'status'], { kind: 'ready', activeBindingId: text });
    } else if (kind === 'caption') {
      if (field === 'template') {
        const meta = object(parse(text));
        fields('captionsById', id, { id, lifecycle: { state: 'active', eventId: meta.eventId!, reason: 'conflictResolution' } });
      } else if (field === 'title' || field === 'body') put(['captionsById', id, field], text);
      else if (field === 'anchor') put(['captionsById', id, 'anchor'], parse(text));
      else if (field === 'color') {
        if (!/^#[0-9a-f]{6}$/i.test(text)) fail();
        put(['captionsById', id, 'colorSrgb'], [1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16) / 255));
      } else fail();
    } else if (kind === 'membership' && field === undefined) {
      const edge = object(parse(text)), life = object(edge.lifecycle!), order = object(edge.orderKey!);
      if (edge.id !== id || life.kind !== 'value' || order.kind !== 'value' || !/^(sam|scm)_/.test(id)) fail();
      const caption = id.startsWith('scm_'), map = caption ? 'sceneCaptionMembershipsById' : 'sceneAssetMembershipsById';
      fields(map, id, { id, sceneId: edge.sceneId!, [caption ? 'captionId' : 'assetId']: edge.resourceId!, orderKey: order.value! });
      put([map, id, 'lifecycle'], life.value!);
    } else if (kind === 'view') {
      const map = 'viewsById';
      if (field === 'identity') fields(map, id, object(parse(text)));
      else if (field === 'name' || field === 'order') put([map, id, field === 'order' ? 'orderKey' : field], text);
      else if (field && ['camera', 'background', 'lifecycle'].includes(field)) put([map, id, field], parse(text));
      else fail();
    } else if (kind === 'scene' && field === 'entry') {
      const entry = parse(text), key = sourceKey(['scenesById', id, 'defaultViewId']);
      if (entry !== null) put(['scenesById', id, 'defaultViewId'], entry);
      else if (source) writes[key] = null; // explicit clear records absence, even when already absent
    } else if (kind === 'material' && field && ['routing', 'appearance', 'compositing', 'lifecycle'].includes(field)) {
      once(['materialOverridesById', id, 'id'], id); put(['materialOverridesById', id, field], parse(text));
    } else if (kind === 'media' && field === undefined) once(['mediaResourcesById', id], parse(text));
    else if (kind === 'attachment' && field && ['captionId', 'mediaResourceId', 'altText', 'orderKey', 'lifecycle'].includes(field)) {
      once(['captionAttachmentsById', id, 'id'], id); put(['captionAttachmentsById', id, field], field === 'lifecycle' ? parse(text) : text);
    } else fail('この接続版で扱わない操作です。');
  }
  return Object.freeze(writes);
}

/** Exact declared genesis, including empty maps. No implicit read-time fixture filling. */
export function developmentSourceSeed(): Readonly<Record<string, string>> {
  const fixture = createSyntheticProject(), commands = historySeed();
  const writes = { ...encodeDevelopmentCommands(undefined, commands) };
  const put = (path: string[], v: unknown) => { writes[sourceKey(path)] = encode(v); };
  put(['developmentRoot'], declaration);
  put(['identity'], { projectId: fixtureIds.project, historyEpoch: `hep_${'0'.repeat(31)}1`, lineageSeed: '0'.repeat(64) });
  put(['project', 'title'], '共同編集の検証'); put(['project', 'defaultSceneId'], fixtureIds.overview);
  put(['project', 'frame'], { id: fixture.resources.projectFrameId, handedness: 'right', upAxis: '+Y', unit: { kind: 'unknown' } });
  for (const scene of Object.values(fixture.state.scenes)) {
    put(['scenesById', scene.id, 'id'], scene.id);
    for (const field of ['name', 'orderKey', 'lifecycle'] as const) {
      const v = scene[field]; if (v.kind !== 'value') fail(); put(['scenesById', scene.id, field], v.value);
    }
  }
  for (const caption of Object.values(fixture.resources.captions)) {
    if (caption.lifecycle.kind !== 'value') fail();
    put(['captionsById', caption.id, 'id'], caption.id); put(['captionsById', caption.id, 'lifecycle'], caption.lifecycle.value);
  }
  if (Object.values(writes).some(v => v === null)) fail();
  return Object.freeze(writes as Record<string, string>);
}

/** Verify every original command/change, not just whether the final sidecar agrees. */
function verifyDevelopmentCorrespondence(history: AtomicHistory): void {
  if (history.changes.length > 128 || history.changes.filter(c => !c.deps.length).length !== 1) fail();
  const index = new HistoryIndex(history, developmentSourceLimits.maxWork);
  let used = 0;
  for (const change of history.changes) {
    let expected: Readonly<Record<string, string | null>>;
    if (!change.deps.length) expected = developmentSourceSeed();
    else {
      const ancestorIds = index.ancestors(change.id);
      const parentChanges = history.changes.filter(c => ancestorIds.has(c.id));
      // A change may explicitly name a redundant ancestor dependency. Derive
      // the causal cut's actual tips without altering any original deps or IDs.
      const covered = new Set(parentChanges.flatMap(c => c.deps)), heads = parentChanges.filter(c => !covered.has(c.id)).map(c => c.id).sort();
      const parents = inspectAtomicHistory({ token: `memory-history:${heads.join(',')}`, heads, changes: parentChanges }, developmentSourceLimits);
      if (parents.kind === 'rejected') fail(`元の変更の参照関係を確認できません: ${JSON.stringify(parents.issue)}`); used += parents.workUsed;
      if (used + index.workUsed > developmentSourceLimits.maxWork) fail('検証する履歴がこの開発版の上限を超えています。');
      const commands: Record<string, string> = Object.create(null);
      for (const write of change.writes) {
        if (write.path.length !== 1) fail(); const path = pathOf(write.path[0]!);
        if (path[0] !== 'developmentCommands') continue;
        if (path.length !== 2 || write.value.kind !== 'value' || typeof write.value.value !== 'string') fail();
        const command = parse(write.value.value); if (typeof command !== 'string') fail(); commands[path[1]!] = command;
      }
      expected = encodeDevelopmentCommands(sourceSnapshot(parents), commands);
    }
    const actual = Object.fromEntries(change.writes.map(w => {
      if (w.path.length !== 1 || (w.value.kind === 'value' && typeof w.value.value !== 'string')) fail();
      return [w.path[0]!, w.value.kind === 'absent' ? null : w.value.value];
    }));
    const keys = Object.keys(expected);
    if (keys.length !== Object.keys(actual).length || keys.some(k => actual[k] !== expected[k])) fail();
  }
}
