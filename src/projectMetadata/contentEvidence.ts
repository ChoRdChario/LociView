import { checkContentFacts, type ContentRequest, type ProjectContentVerifier } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkLimits, fail, type MetadataLimits } from './format';
import { json, jsonDigest, metadataPath, readReceipt, writeReceipt } from './persistence';

export interface VerifiedInventoryPort {
  /** Exact full BlobRefs/profile closures; must read durable inventory and presence, not body bytes. */
  inspect(request: ContentRequest): Promise<'verified-present' | 'missing' | 'suspect' | 'unverified'>;
}
interface Evidence { key: JsonObject; facts: JsonObject; digest: string }

/** Local executable evidence cache. Never accepts package-supplied verified bits. */
export class PersistentContentVerifier implements ProjectContentVerifier {
  readonly scope: ProjectContentVerifier['scope'];
  private readonly limits: MetadataLimits;
  constructor(private readonly fs: ProjectWorkspaceFS, limits: MetadataLimits,
    private readonly executor: ProjectContentVerifier, private readonly version: string,
    private readonly inventory: VerifiedInventoryPort, private readonly allowNewEvidence = false) {
    this.scope = executor.scope; this.limits = checkLimits(limits);
    if (!version || version.length > 128) fail('verifier-version');
  }

  private async receipt(input: ContentRequest) {
    const request = cloneCanonicalValue(input, this.limits) as unknown as ContentRequest;
    const key = cloneCanonicalValue({ version: this.version, scope: this.scope,
      fact: request.fact, records: request.records, context: request.context }, this.limits) as JsonObject;
    const path = metadataPath(this.fs, `evidence/${await jsonDigest(key)}.json`);
    const receipt = await readReceipt<Evidence>(this.fs, path, this.limits);
    if (receipt && (Object.keys(receipt).sort().join(',') !== 'digest,facts,key' || json(receipt.key) !== json(key) ||
      receipt.digest !== await jsonDigest({ key, facts: receipt.facts }))) fail('content-evidence');
    return { request, key, path, receipt };
  }
  /** Presence of an owned exact receipt, even if its acknowledged CAS receipt was lost. */
  async hasEvidence(input: ContentRequest): Promise<boolean> {
    const { request, receipt } = await this.receipt(input);
    if (receipt) checkContentFacts(request, receipt.facts);
    return !!receipt;
  }
  async verify(input: ContentRequest): Promise<unknown> {
    const { request, key, path, receipt } = await this.receipt(input);
    const presence = await this.inventory.inspect(request);
    if (receipt && presence === 'verified-present') {
      checkContentFacts(request, receipt.facts);
      return { request, scope: this.scope, outcome: 'verified', facts: receipt.facts };
    }
    if (!this.allowNewEvidence || presence === 'missing') return { request, scope: this.scope,
      outcome: presence === 'missing' ? 'missing' : 'failed' };
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const result = cloneCanonicalValue(await this.executor.verify(request), this.limits) as JsonObject;
    if (result.outcome !== 'verified') return result;
    if (Object.keys(result).sort().join(',') !== 'facts,outcome,request,scope' ||
      json(result.request) !== json(request) || result.scope !== this.scope) fail('content-executor');
    const facts = result.facts as JsonObject; checkContentFacts(request, facts);
    if (await this.inventory.inspect(request) !== 'verified-present') fail('content-inventory');
    await writeReceipt(this.fs, path, { key, facts, digest: await jsonDigest({ key, facts }) }, this.limits);
    return { request, scope: this.scope, outcome: 'verified', facts };
  }
}
