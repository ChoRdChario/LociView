import { readProjectScene } from '../scene/projectProvider';
import { metadataProviderReady, type MetadataModelFactPort } from '../projectMetadata/session';
import { json } from '../projectMetadata/persistence';
import type { ContentRequest } from '../domain/projectContentChecks';
import type { JsonObject } from '../domain/values';
import { validationMetadataLimits as limits, fileError } from './validation';
import type { ValidationContent } from './content';

/** Only a locally selected, owned GLB may introduce new facts. Old evidence is never repaired. */
export function validationModelFacts(content: ValidationContent): MetadataModelFactPort {
  return { async plan(base, next) {
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
