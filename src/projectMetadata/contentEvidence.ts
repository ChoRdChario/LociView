import { checkContentFacts, type ContentRequest, type ProjectContentVerifier } from '../domain/projectContentChecks';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkLimits, fail, type MetadataLimits } from './format';
import { assertTextPreparation, json, jsonDigest, metadataPath, readReceipt, readReceiptSnapshot, withMetadataRead, writeReceipt, type MetadataReadPorts } from './persistence';

export interface VerifiedInventoryPort {
  /** Exact full BlobRefs/profile closures; must read durable inventory and presence, not body bytes. */
  inspect(request: ContentRequest): Promise<'verified-present' | 'missing' | 'suspect' | 'unverified'>;
}
interface Evidence { key: JsonObject; facts: JsonObject; digest: string }
interface CapturedEvidence { request: ContentRequest; key: JsonObject }
export type ContentEvidenceTiming = (stage: string, milliseconds: number) => void;

function captureEvidence(input: ContentRequest, limits: MetadataLimits, version: string, scope: ProjectContentVerifier['scope']): CapturedEvidence {
  const request = cloneCanonicalValue(input, limits) as unknown as ContentRequest;
  const key = cloneCanonicalValue({ version, scope, fact: request.fact, records: request.records, context: request.context }, limits) as JsonObject;
  return { request, key };
}
/** Fresh bounded receipt reader only; facts remain conditional at each caller. */
async function readCapturedEvidence(fs: ProjectWorkspaceFS, limits: MetadataLimits, captured: CapturedEvidence, singleSnapshot = false) {
  const { request, key } = captured, path = metadataPath(fs, `evidence/${await jsonDigest(key)}.json`);
  const receipt = singleSnapshot ? await readReceiptSnapshot<Evidence>(await fs.readStream(path), limits)
    : await readReceipt<Evidence>(fs, path, limits);
  if (receipt && (Object.keys(receipt).sort().join(',') !== 'digest,facts,key' || json(receipt.key) !== json(key) ||
    receipt.digest !== await jsonDigest({ key, facts: receipt.facts }))) fail('content-evidence');
  return { request, key, path, receipt };
}

function measure<T>(timing: ContentEvidenceTiming | undefined, stage: string, action: () => Promise<T>): Promise<T> {
  if (!timing) return action();
  const started = performance.now();
  const finished = () => { try { timing(stage, performance.now() - started); } catch { /* Diagnostics have no authority. */ } };
  try { return action().finally(finished); }
  catch (error) { finished(); throw error; }
}

/** Only reads saved receipts and inspects Origin presence. Holds no executor or writer. */
class ReadonlyEvidence {
  private readonly textFacts?: Map<string, JsonObject>;
  constructor(private readonly limits: MetadataLimits, private readonly scope: ProjectContentVerifier['scope'],
    private readonly inventory: VerifiedInventoryPort, private readonly timing?: ContentEvidenceTiming,
    private readonly preparation?: MetadataReadPorts) {
    if (preparation) this.textFacts = new Map();
  }
  private async lookup(fs: ProjectWorkspaceFS, captured: CapturedEvidence) {
    if (this.preparation) assertTextPreparation(this.preparation);
    const key = this.textFacts ? json(captured.key) : '';
    const previous = this.textFacts?.get(key);
    if (previous) return { key, facts: previous };
    const { receipt } = await measure(this.timing, 'receipt-read', () => readCapturedEvidence(fs, this.limits, captured, !!this.textFacts));
    if (this.preparation) assertTextPreparation(this.preparation);
    return receipt && { key, facts: receipt.facts };
  }

  private accept(request: ContentRequest, found: { key: string; facts: JsonObject }) {
    checkContentFacts(request, found.facts);
    this.textFacts?.set(found.key, found.facts);
    return found.facts;
  }

  async hasEvidence(fs: ProjectWorkspaceFS, captured: CapturedEvidence) {
    const found = await this.lookup(fs, captured);
    if (this.preparation) assertTextPreparation(this.preparation);
    if (found) this.accept(captured.request, found);
    return !!found;
  }

  async verify(fs: ProjectWorkspaceFS, captured: CapturedEvidence, live = () => {}) {
    live();
    const { request } = captured;
    const found = await this.lookup(fs, captured);
    live();
    const presence = await measure(this.timing, 'original-presence', () => this.inventory.inspect(request));
    if (this.preparation) assertTextPreparation(this.preparation);
    live();
    if (found && presence === 'verified-present') {
      return { request, scope: this.scope, outcome: 'verified', facts: this.accept(request, found) };
    }
    return { request, scope: this.scope, outcome: presence === 'missing' ? 'missing' : 'failed' };
  }
}

/** Local executable evidence cache. Never accepts package-supplied verified bits. */
export class PersistentContentVerifier implements ProjectContentVerifier {
  readonly scope: ProjectContentVerifier['scope'];
  readonly withReadonlyContent?: NonNullable<ProjectContentVerifier['withReadonlyContent']>;
  private readonly limits: MetadataLimits;
  private readonly readonlyEvidence: ReadonlyEvidence;
  constructor(private readonly fs: ProjectWorkspaceFS, limits: MetadataLimits,
    private readonly executor: ProjectContentVerifier, private readonly version: string,
    private readonly inventory: VerifiedInventoryPort, private readonly allowNewEvidence = false,
    private readonly timing?: ContentEvidenceTiming, preparation?: MetadataReadPorts) {
    this.scope = executor.scope; this.limits = checkLimits(limits);
    if (!version || version.length > 128) fail('verifier-version');
    if (preparation) {
      assertTextPreparation(preparation);
      if (allowNewEvidence || preparation.fs !== fs) fail('text-preparation-read-only');
    }
    const evidence = new ReadonlyEvidence(this.limits, this.scope, inventory, preparation ? timing : undefined, preparation);
    this.readonlyEvidence = evidence;
    if (!allowNewEvidence) {
      const ownedLimits = this.limits, scope = this.scope;
      this.withReadonlyContent = action => withMetadataRead(fs, undefined, async ({ fs: readonlyFS }) => {
        let active = true;
        const live = () => { if (!active) fail('content-read-expired'); };
        const reader = { scope, verify: async (input: ContentRequest) => {
          live(); const captured = captureEvidence(input, ownedLimits, version, scope);
          const response = await evidence.verify(readonlyFS, captured, live);
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
    const captured = captureEvidence(input, this.limits, this.version, this.scope);
    return this.readonlyEvidence.hasEvidence(this.fs, captured);
  }
  async verify(input: ContentRequest): Promise<unknown> {
    if (!this.allowNewEvidence) {
      const captured = captureEvidence(input, this.limits, this.version, this.scope);
      return withMetadataRead(this.fs, undefined, async ({ fs }) => {
        return this.readonlyEvidence.verify(fs, captured);
      });
    }
    const { request, key, path, receipt } = await measure(this.timing, 'receipt-read', () => this.receipt(input));
    const presence = await measure(this.timing, 'inventory-before', () => this.inventory.inspect(request));
    if (receipt && presence === 'verified-present') {
      checkContentFacts(request, receipt.facts);
      return { request, scope: this.scope, outcome: 'verified', facts: receipt.facts };
    }
    if (!this.allowNewEvidence || presence === 'missing') return { request, scope: this.scope,
      outcome: presence === 'missing' ? 'missing' : 'failed' };
    this.fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    const result = cloneCanonicalValue(await measure(this.timing, 'executor', () => this.executor.verify(request)), this.limits) as JsonObject;
    if (result.outcome !== 'verified') return result;
    if (Object.keys(result).sort().join(',') !== 'facts,outcome,request,scope' ||
      json(result.request) !== json(request) || result.scope !== this.scope) fail('content-executor');
    const facts = result.facts as JsonObject; checkContentFacts(request, facts);
    if (await measure(this.timing, 'inventory-after', () => this.inventory.inspect(request)) !== 'verified-present') fail('content-inventory');
    const receiptValue = { key, facts, digest: await jsonDigest({ key, facts }) };
    await measure(this.timing, 'receipt-write', () => writeReceipt(this.fs, path, receiptValue, this.limits));
    return { request, scope: this.scope, outcome: 'verified', facts };
  }
}
