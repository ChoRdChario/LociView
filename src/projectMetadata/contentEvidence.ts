import { checkContentFacts, type ContentRequest, type ProjectContentVerifier } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkLimits, fail, type MetadataLimits } from './format';
import { json, jsonDigest, metadataPath, readReceipt, withMetadataRead, writeReceipt } from './persistence';

export interface VerifiedInventoryPort {
  /** Exact full BlobRefs/profile closures; must read durable inventory and presence, not body bytes. */
  inspect(request: ContentRequest): Promise<'verified-present' | 'missing' | 'suspect' | 'unverified'>;
}
interface Evidence { key: JsonObject; facts: JsonObject; digest: string }
interface CapturedEvidence { request: ContentRequest; key: JsonObject }

function captureEvidence(input: ContentRequest, limits: MetadataLimits, version: string, scope: ProjectContentVerifier['scope']): CapturedEvidence {
  const request = cloneCanonicalValue(input, limits) as unknown as ContentRequest;
  const key = cloneCanonicalValue({ version, scope, fact: request.fact, records: request.records, context: request.context }, limits) as JsonObject;
  return { request, key };
}
/** Fresh bounded receipt reader only; facts remain conditional at each caller. */
async function readCapturedEvidence(fs: ProjectWorkspaceFS, limits: MetadataLimits, captured: CapturedEvidence) {
  const { request, key } = captured, path = metadataPath(fs, `evidence/${await jsonDigest(key)}.json`);
  const receipt = await readReceipt<Evidence>(fs, path, limits);
  if (receipt && (Object.keys(receipt).sort().join(',') !== 'digest,facts,key' || json(receipt.key) !== json(key) ||
    receipt.digest !== await jsonDigest({ key, facts: receipt.facts }))) fail('content-evidence');
  return { request, key, path, receipt };
}

/** Local executable evidence cache. Never accepts package-supplied verified bits. */
export class PersistentContentVerifier implements ProjectContentVerifier {
  readonly scope: ProjectContentVerifier['scope'];
  readonly withReadonlyContent?: NonNullable<ProjectContentVerifier['withReadonlyContent']>;
  private readonly limits: MetadataLimits;
  constructor(private readonly fs: ProjectWorkspaceFS, limits: MetadataLimits,
    private readonly executor: ProjectContentVerifier, private readonly version: string,
    private readonly inventory: VerifiedInventoryPort, private readonly allowNewEvidence = false) {
    this.scope = executor.scope; this.limits = checkLimits(limits);
    if (!version || version.length > 128) fail('verifier-version');
    if (!allowNewEvidence) {
      const ownedLimits = this.limits, scope = this.scope;
      this.withReadonlyContent = action => withMetadataRead(fs, undefined, async ({ fs: readonlyFS }) => {
        let active = true;
        const live = () => { if (!active) fail('content-read-expired'); };
        const reader = { scope, verify: async (input: ContentRequest) => {
          live(); const captured = captureEvidence(input, ownedLimits, version, scope);
          const response = await verifyReadonlyEvidence(readonlyFS, ownedLimits, captured, scope, inventory, live);
          live(); return response;
        } };
        try { await action(reader); live(); } finally { active = false; }
      }, 'content.readonlyInspection');
    }
  }

  private receipt(input: ContentRequest) {
    return readCapturedEvidence(this.fs, this.limits, captureEvidence(input, this.limits, this.version, this.scope));
  }
  /** Presence of an owned exact receipt, even if its acknowledged CAS receipt was lost. */
  async hasEvidence(input: ContentRequest): Promise<boolean> {
    const { request, receipt } = await this.receipt(input);
    if (receipt) checkContentFacts(request, receipt.facts);
    return !!receipt;
  }
  async verify(input: ContentRequest): Promise<unknown> {
    if (!this.allowNewEvidence) {
      const captured = captureEvidence(input, this.limits, this.version, this.scope), limits = this.limits,
        scope = this.scope, inventory = this.inventory;
      return withMetadataRead(this.fs, undefined, async ({ fs }) => {
        return verifyReadonlyEvidence(fs, limits, captured, scope, inventory);
      });
    }
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

async function verifyReadonlyEvidence(fs: ProjectWorkspaceFS, limits: MetadataLimits, captured: CapturedEvidence,
  scope: ProjectContentVerifier['scope'], inventory: VerifiedInventoryPort, live = () => {}) {
  live(); const { request, receipt } = await readCapturedEvidence(fs, limits, captured); live();
  // Origin CAS stays separate and freshly observed on every request.
  const presence = await inventory.inspect(request); live();
  if (receipt && presence === 'verified-present') {
    checkContentFacts(request, receipt.facts);
    return { request, scope, outcome: 'verified', facts: receipt.facts };
  }
  return { request, scope, outcome: presence === 'missing' ? 'missing' : 'failed' };
}
