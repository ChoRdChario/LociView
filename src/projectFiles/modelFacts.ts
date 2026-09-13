import { readProjectScene } from '../scene/projectProvider';
import { metadataProviderReady, type MetadataModelFactPort, type MetadataModelFactPlan } from '../projectMetadata/session';
import type { ProjectMetadataSource } from '../projectMetadata/source';
import { json } from '../projectMetadata/persistence';
import type { ContentRequest } from '../domain/projectContentChecks';
import type { JsonObject } from '../domain/values';
import { validationMetadataLimits as limits, fileError } from './validation';
import type { ValidationContent } from './content';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { fileObject } from './validation';

/** Only a locally selected, owned GLB may introduce new facts. Old evidence is never repaired. */
export function validationModelFacts(content: ValidationContent): MetadataModelFactPort {
  return { planReceived: (base, next, bodyFor) => validationReceivedFacts(content, base, next, bodyFor), async plan(base, next) {
    const used = new Set<string>(), introduced = new Set<string>(); let work = 0;
    const charge = () => { if (++work > limits.maxWork) fileError('モデルの検証範囲を超えています。'); };
    for (const change of base.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById') used.add(w.path[1]!);
    }
    for (const change of next.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById' && !used.has(w.path[1]!)) introduced.add(w.path[1]!);
    }
    if (!introduced.size) return null;
    if (introduced.size !== 1) return fileError('一つの3Dモデルを選択してください。');
    const requests: ContentRequest[] = [], keys = new Set<string>(), ordinary = content.verifier(false);
    const provider = await readProjectScene(next.read(), limits, { scope: 'development-validation', verify: async request => {
      if (request.fact === 'media' || request.records.every(r => used.has(r.id as string))) return ordinary.verify(request);
      const r = request.records[0];
      if (request.records.length !== 1 || !r || !introduced.has(r.id as string) ||
        !['representation', 'family-envelope'].includes(request.fact) ||
        json(request.context) !== json(request.fact === 'representation' ? {} : { assetId: r.assetId, variantFamilyId: r.variantFamilyId }))
        return fileError('追加するモデルの検証情報を準備できません。');
      const key = json(request); if (!keys.has(key)) { keys.add(key); requests.push(request); }
      return content.inspectPreparedModel(request);
    } }, { verifyRetainedMedia: true });
    if (!metadataProviderReady(provider, limits) || provider.kind !== 'scene-provider' || !requests.length)
      return fileError('追加するモデルの参照を確認できません。');
    const record = requests[0]!.records[0]!, ref: JsonObject = content.preparedModelRef(record);
    const completed = new Set<string>(); let bodySaved = false;
    return { baseToken: base.token, finalToken: next.token, stagedBlobs: [ref], async stage() {
      if (!bodySaved) { await content.stagePreparedModel(record); bodySaved = true; }
      else await content.store.open(ref); // Never refill an acknowledged body after loss.
      for (const request of requests) {
        const key = json(request), result = await content.verifier(!completed.has(key)).verify(request) as { outcome?: string };
        if (result.outcome !== 'verified') return fileError('追加するモデルの検証情報を保存できません。');
        completed.add(key);
      }
    } };
  } };
}

/** Full original-record admission. The caller still owns receive-job/source retention and publication. */
export async function validationReceivedFacts(content: ValidationContent, base: ProjectMetadataSource, next: ProjectMetadataSource,
  bodyFor: (ref: JsonObject) => Blob): Promise<MetadataModelFactPlan> {
  if (json(base.proof) !== json(next.proof)) return fileError('受信先のプロジェクトが一致しません。');
  const oldIds = new Set<string>(), oldDigests = new Map<string, number>(), sizes = new Map<string, number>();
  const inspectionBudget = { maxNodes: limits.maxNodes, maxWork: limits.maxWork };
  const before = await base.inspectOriginal(inspectionBudget), after = await next.inspectOriginal(inspectionBudget);
  if (before.workUsed + after.workUsed > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
  let work = before.workUsed + after.workUsed, total = 0;
  for (const [inspection, old] of [[before, true], [after, false]] as const) for (const scalar of inspection.scalars) {
    if (++work > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
    if (!['representationsById', 'mediaResourcesById'].includes(scalar.path[0]!)) continue;
    if (old) oldIds.add(scalar.path[1]!);
    if (scalar.value.kind !== 'value') continue;
    const record = fileObject(scalar.value.value), check = new ProjectRecordFields(); check.blob(record.blob as JsonObject, []);
    if (check.unknown) return fileError('受信する本体の情報を確認してください。');
    const ref = record.blob as JsonObject, hash = ref.digest as string, size = ref.byteLength as number, previous = sizes.get(hash);
    if (previous !== undefined && previous !== size) return fileError('同じ本体の大きさが一致しません。');
    if (previous === undefined) { total += size; sizes.set(hash, size); }
    if (total > content.limits.maxFileBytes) return fileError('モデルと画像の合計がこの検証の上限を超えています。');
    if (old) oldDigests.set(hash, size);
  }
  const requests = new Map<string, ContentRequest>(), bodies = new Map<string, { ref: JsonObject; file: Blob }>();
  const results = new Map<string, unknown>(), ordinary = content.verifier(false);
  const provider = await readProjectScene(next.read(), limits, { scope: 'development-validation', verify: async request => {
    if (++work > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
    if (request.records.every(r => oldIds.has(r.id as string))) return ordinary.verify(request);
    const record = request.records[0];
    if (request.records.length !== 1 || !record || oldIds.has(record.id as string) ||
      !['media', 'representation', 'family-envelope'].includes(request.fact) ||
      json(request.context) !== json(request.fact === 'family-envelope' ? { assetId: record.assetId, variantFamilyId: record.variantFamilyId } : {}))
      return fileError('受信するモデルまたは画像の検証情報を確認できません。');
    const key = json(request); if (results.has(key)) return results.get(key);
    const ref = record.blob as JsonObject, hash = ref.digest as string;
    let result: unknown;
    if (oldDigests.has(hash)) {
      if (await content.store.inspect(ref) !== 'verified-present') return fileError('既存の本体を確認できません。受信ファイルからの補完はしていません。');
      result = await content.inspectStored(request);
    } else {
      const input = bodies.get(json(ref)) ?? { ref, file: bodyFor(ref) };
      if (!(input.file instanceof Blob) || input.file.size !== ref.byteLength) return fileError('受信する本体が不足しています。');
      result = await content.inspectReceived(request, input.file); bodies.set(json(ref), input);
    }
    results.set(key, result); requests.set(key, request); return result;
  } }, { verifyRetainedMedia: true });
  if (!metadataProviderReady(provider, limits) || provider.kind !== 'scene-provider') return fileError('受信後の参照を確認できません。');
  const staged: { ref: JsonObject; file: Blob }[] = [], completedBodies = new Set<string>(), completedFacts = new Set<string>();
  for (const [key, body] of [...bodies].sort(([a], [b]) => a < b ? -1 : 1)) {
    const presence = await content.store.inspect(body.ref);
    if (presence === 'unverified') staged.push(body); // No receipt yet; 'missing' means an acknowledged body was lost.
    else if (presence === 'verified-present') completedBodies.add(key);
    else return fileError('既存の本体に修復が必要です。');
  }
  return { baseToken: base.token, finalToken: next.token, stagedBlobs: staged.map(b => b.ref), async stage() {
    for (const [key, body] of bodies) {
      if (!completedBodies.has(key)) { await content.stageReceived(body.file, body.ref); completedBodies.add(key); }
      else if (await content.store.inspect(body.ref) !== 'verified-present') return fileError('記録済みの本体を確認できません。');
    }
    for (const [key, request] of requests) {
      // Reused old bodies and old records must never be repaired from incoming bytes.
      if (oldDigests.has((request.records[0]!.blob as JsonObject).digest as string) &&
        await content.store.inspect(request.records[0]!.blob as JsonObject) !== 'verified-present') return fileError('既存の本体を確認できません。');
      const result = await content.verifier(!completedFacts.has(key)).verify(request) as { outcome?: string };
      if (result.outcome !== 'verified') return fileError('受信した本体の検証情報を記録できません。');
      completedFacts.add(key);
    }
  } };
}
