import { readProjectScene } from '../../scene/projectProvider';
import { metadataProviderReady, type MetadataModelFactPort } from '../../projectMetadata/session';
import { json } from '../../projectMetadata/persistence';
import type { ContentRequest } from '../../domain/projectContentChecks';
import { metadataFixtureLimits as limits } from './metadataFixture';
import type { MetadataFixtureContent } from './metadataStorage';
import { knownMetadataRepresentation } from './metadataModelRecords';

/** Existing exact fixture bytes only; no user-body staging or evidence repair. */
export function metadataModelFacts(content: MetadataFixtureContent): MetadataModelFactPort {
  return { async plan(base, next) {
    const used = new Set<string>(); let work = 0;
    const charge = () => { if (++work > limits.maxWork) throw Error('モデルの検証範囲を超えています。'); };
    for (const change of base.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById') used.add(w.path[1]!);
    }
    const requests: ContentRequest[] = [], introduced = new Set<string>();
    for (const change of next.read().history.changes) for (const w of change.writes) {
      charge(); if (w.path[0] === 'representationsById' && !used.has(w.path[1]!)) introduced.add(w.path[1]!);
    }
    if (!introduced.size) return null;
    const keys = new Set<string>(), ordinary = content.verifier(false);
    const provider = await readProjectScene(next.read(), limits, { scope: 'development-fixture', verify: async request => {
      if (request.records.every(r => used.has(r.id as string)) || request.fact === 'media') return ordinary.verify(request);
      const r = request.records[0];
      if (request.records.length !== 1 || !r || !introduced.has(r.id as string) || !knownMetadataRepresentation(r) ||
        !['representation', 'family-envelope'].includes(request.fact) ||
        json(request.context) !== json(request.fact === 'representation' ? {} : { assetId: r.assetId, variantFamilyId: r.variantFamilyId }))
        throw Error('コピーしたモデルの検証情報を準備できません。');
      const key = json(request); if (!keys.has(key)) { keys.add(key); requests.push(request); }
      return content.verifyModelRequest(request); // Actual read-only execution, not invented provisional facts.
    } }, { verifyRetainedMedia: true });
    if (!metadataProviderReady(provider, limits) || provider.kind !== 'scene-provider')
      throw Error('コピーしたモデルの参照・保存済み本体を確認できません。');
    if (!requests.length) return null; // Weak retained history does not acquire a body-read requirement.
    const completed = new Set<string>();
    return { baseToken: base.token, finalToken: next.token, async stage() {
      for (const request of requests) {
        const key = json(request), allow = !completed.has(key);
        const result = await content.verifier(allow).verify(request) as { outcome?: string };
        if (result.outcome !== 'verified') throw Error('コピーしたモデルの検証情報を保存できません。');
        completed.add(key); // Once acknowledged, retry must not replenish this request's evidence.
      }
    } };
  } };
}
