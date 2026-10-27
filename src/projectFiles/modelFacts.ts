import { resolveScene } from '../scene/resolve';
import { pointSourceDeclaration } from '../domain/pointSource';
import { nativePointSourceDeclaration, nativeProxySourceDeclaration, nativeSpatialTransform } from '../domain/nativeSpatialSource';
import { same } from '../domain/projectGraphSupport';
import type { Anchor } from '../scene/types';
import { readProjectScene, type ProjectProviderRead } from '../scene/projectProvider';
import { metadataProviderReady, type MetadataModelFactPort, type MetadataModelFactPlan } from '../projectMetadata/session';
import type { ProjectMetadataSource } from '../projectMetadata/source';
import { json } from '../projectMetadata/persistence';
import type { ContentRequest } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { validationMetadataLimits as limits, fileError } from './validation';
import { validationGsEquivalenceSource, type ValidationContent } from './content';
import { pointSourceMediaType } from './pointPly';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkProjectRecord } from '../domain/projectRecords';
import { fileObject } from './validation';

export { validationDeclaredBodyBytes } from './bodyBudget';
import { validationDeclaredBodyBytes } from './bodyBudget';

/** Route capability, not a Core schema rule. Weak history and separate-Asset
 * models remain independent of this active, exact projection check. */
export function assertValidationModelClosures(provider:Extract<ProjectProviderRead,{kind:'scene-provider'}>):void{
  let work=provider.inspection.workUsed;
  const charge=()=>{if(++work>limits.maxWork)fileError('モデルの対応検査が上限を超えています。');};
  for (const field of Object.values(provider.details.immutable.representationsById)) {
    charge(); if (field.kind !== 'value') continue;
    const r = field.value;
    if (!same(r.formatProfile, nativeProxySourceDeclaration)) continue;
    if (r.variantFamilyId === r.proxyForGsVariantFamilyId) return fileError('位置指定用の面とGSの識別情報が一致しません。');
    const edges = r.derivedFrom;
    if (!Array.isArray(edges) || edges.length > 1) return fileError('位置指定用の面の元モデルを確認できません。');
    if (edges.length) {
      const source = provider.details.immutable.representationsById[edges[0] as string];
      if (source?.kind !== 'value' || source.value.role !== 'gsPrimary' || source.value.assetId !== r.assetId ||
        source.value.variantFamilyId !== r.proxyForGsVariantFamilyId) return fileError('位置指定用の面とGSの対応が一致しません。');
    }
  }
  for(const asset of Object.values(provider.resources.assets)){
    charge();if(asset.lifecycle.kind!=='value'||asset.lifecycle.value.state!=='active'||asset.projection.kind!=='value')continue;
    const records=asset.projection.value.representationIds.map(id=>{charge();const field=provider.details.immutable.representationsById[id];
      if(field?.kind!=='value')return fileError('モデルの表示本体を確認できません。');return fileObject(field.value) as JsonObject;});
    const visual=records.filter(r=>r.role!=='interactionProxy'),proxy=records.filter(r=>r.role==='interactionProxy'),primary=visual[0];
    if(visual.length!==1||!primary||!['meshPrimary','pointPrimary','gsPrimary'].includes(primary.role as string)||records.some(r=>r.assetId!==asset.id)||
      (primary.role==='gsPrimary'?proxy.length>1||proxy.some(r=>r.proxyForGsVariantFamilyId!==primary.variantFamilyId):proxy.length!==0))
      return fileError('このモデルの表示本体の組み合わせには対応していません。');
  }
}

/** Owned new GLB or fresh records reusing exact known bodies. Old evidence is never repaired. */
export function validationModelFacts(content: ValidationContent): MetadataModelFactPort {
  return { assertProvider:provider=>{assertValidationModelClosures(provider);validationDeclaredBodyBytes(provider,content.policy);}, async preparePointAnchor(source, provider, command): Promise<Anchor> {
    if (source.token !== provider.token || command.anchor.kind !== 'asset') return fileError('点の記録対象が更新されています。');
    const anchor = command.anchor, evidence = anchor.hitEvidence, reference = evidence?.source, index = reference?.surfaceRef;
    const scene = resolveScene(provider.state, provider.resources, command.sceneId);
    const projection = scene.kind === 'ready' ? scene.composition.assets.find(a => a.assetId === anchor.assetId)?.projection : undefined;
    const field = reference && provider.details.immutable.representationsById[reference.representationId];
    const record = field?.kind === 'value' ? field.value : undefined;
    if (!projection || !record || !reference || evidence?.method !== 'point-cloud' || !index || index.kind !== 'pointSample' || index.nodeIndex !== 0 || index.primitiveIndex !== 0 || !Number.isSafeInteger(index.pointIndex) || index.pointIndex < 0 ||
      projection.assetFrameId !== anchor.assetFrameId || projection.revisionId !== anchor.authoredAssetRevisionId || !projection.anchorCompatibilityIds.includes(anchor.authoredAnchorCompatibilityId) || !projection.representationIds.includes(reference.representationId) ||
      record.assetId !== anchor.assetId || record.contentKind !== 'pointCloud' || record.role !== 'pointPrimary' || ![pointSourceDeclaration, nativePointSourceDeclaration].some(p => json(record.formatProfile) === json(p))) return fileError('元の点と記録対象を確認できません。');
    const revision = provider.details.immutable.assetRevisionsById[projection.revisionId];
    if (revision?.kind !== 'value' || !(revision.value.anchorCompatibilityClasses as JsonObject[]).some(c => c.id === anchor.authoredAnchorCompatibilityId && (c.targetVariantFamilyIds as string[]).includes(record.variantFamilyId as string))) return fileError('点の互換性を確認できません。');
    const decoded = await content.modelContent(record, true);
    if (decoded.kind !== 'point' || index.pointIndex >= decoded.positions.length / 3) return fileError('元の点を確認できません。');
    const position = nativeSpatialTransform(record.representationToAsset as JsonObject)(Array.from(decoded.positions.subarray(index.pointIndex * 3, index.pointIndex * 3 + 3)));
    return { kind: 'asset', assetId: anchor.assetId, assetFrameId: projection.assetFrameId, positionAsset: position,
      authoredAssetRevisionId: projection.revisionId, authoredAnchorCompatibilityId: anchor.authoredAnchorCompatibilityId,
      hitEvidence: { method: 'point-cloud', source: { representationId: record.id as string, surfaceRef: { kind: 'pointSample', nodeIndex: 0, primitiveIndex: 0, pointIndex: index.pointIndex } } } };
  }, planReceived: (base, next, bodyFor, hasIncoming) => validationReceivedFacts(content, base, next, bodyFor, hasIncoming),
    planRestored: (next, bodyFor, refs) => restoredFacts(content, next, bodyFor, refs),
    planImported: (next, bodyFor, hasIncoming) => receivedFacts(content, null, next, bodyFor, hasIncoming), async plan(base, next) {
    const used = new Set<string>(), introduced = new Set<string>(), revisions=new Set<string>(), newRevisions=new Set<string>(); let work = 0;
    const charge = () => { if (++work > limits.maxWork) fileError('モデルの検証範囲を超えています。'); };
    for (const change of base.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById') used.add(w.path[1]!);
      if(w.path[0]==='assetRevisionsById')revisions.add(w.path[1]!);
    }
    for (const change of next.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById' && !used.has(w.path[1]!)) introduced.add(w.path[1]!);
      if(w.path[0]==='assetRevisionsById'&&!revisions.has(w.path[1]!))newRevisions.add(w.path[1]!);
    }
    if(!introduced.size&&!newRevisions.size)return null;
    const knownRefs = new Set<string>(), inspection = await base.inspectOriginal({ maxNodes: limits.maxNodes, maxWork: limits.maxWork });
    work += inspection.workUsed; charge();
    for (const scalar of inspection.scalars) {
      charge(); if (scalar.path[0] !== 'representationsById' || scalar.value.kind !== 'value') continue;
      const record = fileObject(scalar.value.value) as JsonObject, check = new ProjectRecordFields();
      checkProjectRecord(check, 'representationsById', record); if (!check.unknown) knownRefs.add(json(record.blob));
    }
    const requests: ContentRequest[] = [], keys = new Set<string>(), ordinary = content.verifier(false);
    let preparedRecord: JsonObject | undefined;
    const provider = await readProjectScene(next.read(), limits, { scope: 'development-validation', verify: async request => {
      if(request.fact==='surface-equivalence') {
        if(!request.records.some(r=>newRevisions.has(r.id as string)))return ordinary.verify(request);
        const gs=validationGsEquivalenceSource(request);if(!gs || !used.has(gs.id as string))return fileError('GSの同一表面を確認できません。');
        const result=await content.inspectStored(request), key=json(request);if(!keys.has(key)){keys.add(key);requests.push(request);}return result;
      }
      if (request.fact === 'media' || request.records.every(r => used.has(r.id as string))) return ordinary.verify(request);
      const r = request.records[0];
      if (request.records.length !== 1 || !r || !introduced.has(r.id as string) ||
        !['representation', 'family-envelope'].includes(request.fact) ||
        json(request.context) !== json(request.fact === 'representation' ? {} : { assetId: r.assetId, variantFamilyId: r.variantFamilyId }))
        return fileError('追加するモデルの検証情報を準備できません。');
      const key = json(request); if (!keys.has(key)) { keys.add(key); requests.push(request); }
      if (knownRefs.has(json(r.blob))) {
        if (await content.store.inspect(r.blob as JsonObject) !== 'verified-present') return fileError('既存のモデル本体を確認できません。入力からの補完はしていません。');
        return content.inspectStored(request);
      }
      if (introduced.size !== 1) return fileError('一つの3Dモデルを選択してください。');
      preparedRecord = r;
      return content.inspectPreparedModel(request);
    } }, { verifyRetainedMedia: record => content.retained(record) });
    if (!metadataProviderReady(provider, limits) || provider.kind !== 'scene-provider')
      return fileError('追加するモデルの参照を確認できません。');
    assertValidationModelClosures(provider);validationDeclaredBodyBytes(provider,content.policy);
    if (!requests.length) return null; // Weak-only records require no new facts/body reads.
    const record = preparedRecord, ref = record ? content.preparedModelRef(record) : undefined;
    const completed = new Set<string>(); let bodySaved = false;
    return { baseToken: base.token, finalToken: next.token, stagedBlobs: ref ? [ref] : [], async stage() {
      if (record && ref) {
        if (!bodySaved) { await content.stagePreparedModel(record); bodySaved = true; }
        else await content.store.open(ref); // Never refill an acknowledged body after loss.
      }
      for (const request of requests) {
        const body = (validationGsEquivalenceSource(request) ?? request.records[0]!).blob as JsonObject;
        if (knownRefs.has(json(body)) && await content.store.inspect(body) !== 'verified-present') return fileError('既存のモデル本体を確認できません。');
        const key = json(request), result = await content.verifier(!completed.has(key)).verify(request) as { outcome?: string };
        if (result.outcome !== 'verified') return fileError('追加するモデルの検証情報を保存できません。');
        completed.add(key);
      }
    } };
  } };
}

/** Also retain bodies needed only by historical exchange bases; never repair an acknowledged CAS entry. */
async function restoredFacts(content: ValidationContent, next: ProjectMetadataSource, bodyFor: (ref: JsonObject) => Blob,
  input: readonly JsonObject[]): Promise<MetadataModelFactPlan> {
  const refs = cloneCanonicalValue(input, limits) as JsonObject[];
  const sizes = new Map<string, number>(), bodies = new Map<string, { ref: JsonObject; file: Blob }>();
  let total = 0;
  for (const ref of refs) {
    const check = new ProjectRecordFields(); check.blob(ref, []);
    if (check.unknown || !['model/gltf-binary', pointSourceMediaType, 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(ref.mediaType as string)) return fileError('復元する本体形式を確認してください。');
    const key = json(ref), size = ref.byteLength as number, previous = sizes.get(ref.digest as string);
    if (previous !== undefined && previous !== size) return fileError('復元する本体の大きさが一致しません。');
    if (previous === undefined) { total += size; sizes.set(ref.digest as string, size); }
    if (total > content.policy.projectBodyBytes || bodies.has(key)) return fileError('復元する本体が検証の範囲を超えています。');
    const file = bodyFor(ref); if (!(file instanceof Blob) || file.size !== size) return fileError('復元する本体が不足しています。');
    await content.assertBodySize(ref,file);
    bodies.set(key, { ref, file });
  }
  const introduced = new Set<string>();
  for (const [key, body] of bodies) {
    const state = await content.store.inspect(body.ref);
    if (state === 'unverified') introduced.add(key);
    else if (state !== 'verified-present') return fileError('記録済みの本体に修復が必要です。');
  }
  const facts = await receivedFacts(content, null, next, bodyFor, ref => bodies.has(json(ref))), handled = new Set((facts.stagedBlobs ?? []).map(json));
  if ([...handled].some(key => !bodies.has(key))) return fileError('復元する本体の一覧が一致しません。');
  const completed = new Set<string>();
  return { baseToken: null, finalToken: next.token, stagedBlobs: [...introduced].sort().map(key => bodies.get(key)!.ref), async stage() {
    await facts.stage();
    for (const [key, body] of bodies) {
      if (introduced.has(key) && !handled.has(key) && !completed.has(key)) { await content.stageReceived(body.file, body.ref); completed.add(key); }
      else if (await content.store.inspect(body.ref) !== 'verified-present') return fileError('記録済みの本体を確認できません。');
    }
    // Session consumes/verifies the complete inventory again immediately before publication.
  } };
}

/** Full original-record admission. The caller still owns receive-job/source retention and publication. */
export async function validationReceivedFacts(content: ValidationContent, base: ProjectMetadataSource, next: ProjectMetadataSource,
  bodyFor: (ref: JsonObject) => Blob, hasIncoming?: (ref: JsonObject) => boolean): Promise<MetadataModelFactPlan> {
  if (json(base.proof) !== json(next.proof)) return fileError('受信先のプロジェクトが一致しません。');
  return receivedFacts(content, base, next, bodyFor, hasIncoming);
}
async function receivedFacts(content: ValidationContent, base: ProjectMetadataSource | null, next: ProjectMetadataSource,
  bodyFor: (ref: JsonObject) => Blob, hasIncoming?: (ref: JsonObject) => boolean): Promise<MetadataModelFactPlan> {
  const oldIds = new Set<string>(), oldDigests = new Map<string, number>(), sizes = new Map<string, number>();
  const inspectionBudget = { maxNodes: limits.maxNodes, maxWork: limits.maxWork };
  const before = base ? await base.inspectOriginal(inspectionBudget) : null, after = await next.inspectOriginal(inspectionBudget);
  if ((before?.workUsed ?? 0) + after.workUsed > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
  let work = (before?.workUsed ?? 0) + after.workUsed, total = 0;
  for (const [inspection, old] of [[before, true], [after, false]] as const) for (const scalar of inspection?.scalars ?? []) {
    if (++work > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
    if(scalar.path[0]==='assetRevisionsById'){if(old)oldIds.add(scalar.path[1]!);continue;}
    if (!['representationsById', 'mediaResourcesById'].includes(scalar.path[0]!)) continue;
    if (old) oldIds.add(scalar.path[1]!);
    if (scalar.value.kind !== 'value') continue;
    const record = fileObject(scalar.value.value), check = new ProjectRecordFields(); check.blob(record.blob as JsonObject, []);
    if (check.unknown) return fileError('受信する本体の情報を確認してください。');
    const ref = record.blob as JsonObject, hash = ref.digest as string, size = ref.byteLength as number, previous = sizes.get(hash);
    if (previous !== undefined && previous !== size) return fileError('同じ本体の大きさが一致しません。');
    if (previous === undefined) { total += size; sizes.set(hash, size); }
    if (total > content.policy.projectBodyBytes) return fileError('モデルと画像の合計がこの検証の上限を超えています。');
    if (old) oldDigests.set(hash, size);
  }
  const requests = new Map<string, ContentRequest>(), bodies = new Map<string, { ref: JsonObject; file: Blob }>();
  const results = new Map<string, unknown>(), ordinary = content.verifier(false);
  const provider = await readProjectScene(next.read(), limits, { scope: 'development-validation', verify: async request => {
    if (++work > limits.maxWork) return fileError('受信内容が検証の上限を超えています。');
    if(request.records.every(r=>oldIds.has(r.id as string)))return ordinary.verify(request);
    if(request.fact==='surface-equivalence') {
      const gs=validationGsEquivalenceSource(request);if(!gs)return fileError('受信したGSの同一表面を確認できません。');
      const ref=gs.blob as JsonObject,key=json(ref);
      if(!oldDigests.has(ref.digest as string) && !bodies.has(key)) {
        const file=bodyFor(ref);if(!(file instanceof Blob)||file.size!==ref.byteLength)return fileError('GSの原本が不足しています。'); bodies.set(key,{ref,file});
      }
      const result=oldDigests.has(ref.digest as string)?await content.inspectStored(request):await content.inspectReceivedEquivalence(request,bodies.get(key)!.file);
      requests.set(json(request),request);return result;
    }
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
  } }, { verifyRetainedMedia: async record => !hasIncoming || hasIncoming(record.blob as JsonObject) || await content.retained(record) });
  if (!metadataProviderReady(provider, limits) || provider.kind !== 'scene-provider') return fileError('受信後の参照を確認できません。');
  assertValidationModelClosures(provider);validationDeclaredBodyBytes(provider,content.policy);
  const staged: { ref: JsonObject; file: Blob }[] = [], completedBodies = new Set<string>(), completedFacts = new Set<string>();
  for (const [key, body] of [...bodies].sort(([a], [b]) => a < b ? -1 : 1)) {
    const presence = await content.store.inspect(body.ref);
    if (presence === 'unverified') staged.push(body); // No receipt yet; 'missing' means an acknowledged body was lost.
    else if (presence === 'verified-present') completedBodies.add(key);
    else return fileError('既存の本体に修復が必要です。');
  }
  return { baseToken: base?.token ?? null, finalToken: next.token, stagedBlobs: staged.map(b => b.ref), async stage() {
    for (const [key, body] of bodies) {
      if (!completedBodies.has(key)) { await content.stageReceived(body.file, body.ref); completedBodies.add(key); }
      else if (await content.store.inspect(body.ref) !== 'verified-present') return fileError('記録済みの本体を確認できません。');
    }
    for (const [key, request] of requests) {
      // Reused old bodies and old records must never be repaired from incoming bytes.
      const record=validationGsEquivalenceSource(request) ?? request.records[0]!;
      if (oldDigests.has((record.blob as JsonObject).digest as string) &&
        await content.store.inspect(record.blob as JsonObject) !== 'verified-present') return fileError('既存の本体を確認できません。');
      const result = await content.verifier(!completedFacts.has(key)).verify(request) as { outcome?: string };
      if (result.outcome !== 'verified') return fileError('受信した本体の検証情報を記録できません。');
      completedFacts.add(key);
    }
  } };
}
