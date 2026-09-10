import * as A from '@automerge/automerge/slim';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { checkedProof, fail, type MetadataLimits, type MetadataProof } from './format';
import { ProjectMetadataSource } from './source';
import { digest, equalBytes, json, metadataPath, readReceipt, technicalId, writeReceipt } from './persistence';

export interface JournalStart {
  transactionId: string;
  predecessor: string | null;
  repositoryId: string;
  purpose: 'initialize' | 'localCommand';
  proof: MetadataProof;
  baseHeads: string[];
}
interface Part { ordinal: number; expectedChangeHash: string; dependencies: string[]; byteLength: number; bytesSha256: string }
export interface PreparedJournal { start: JournalStart; changes: Part[]; exactChangeSetDigest: string }
interface Durable { transactionId: string; exactChangeSetDigest: string }
export interface Publication extends Durable { heads: string[] }
export interface JournalEntry { start: JournalStart; prepared: PreparedJournal | null; publication: Publication | null }
const sorted = (s: readonly string[]) => [...s].sort();
async function seal(start: JournalStart, changes: Part[]): Promise<string> {
  if (start.purpose === 'initialize') return digest(new TextEncoder().encode(`lociview:private-initialization:jcs-v1\n${json({ start, changes })}`));
  // Exact 02 §8 local-command digest. This first service adds no new BlobRefs.
  const value = { transactionId: start.transactionId,
    target: { identity: start.proof.identity, metadataEnvelope: start.proof.envelope }, purpose: 'localCommand', stagedBlobs: [],
    metadataBatch: { kind: 'localCommand', baseHeads: start.baseHeads, changes } };
  return digest(new TextEncoder().encode(`lociview:v2:metadata-change-set:jcs-v1\n${json(value)}`));
}
function heads(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v)) ||
    json(value) !== json(sorted([...new Set(value)]))) fail('journal-heads');
}
function validateStart(s: JournalStart, limits: MetadataLimits): void {
  if (!s || Object.keys(s).sort().join(',') !== 'baseHeads,predecessor,proof,purpose,repositoryId,transactionId') fail('journal-start');
  technicalId(s.transactionId); technicalId(s.repositoryId); if (s.predecessor !== null) technicalId(s.predecessor);
  checkedProof(s.proof, limits); heads(s.baseHeads);
  if (s.purpose === 'initialize') {
    if (s.predecessor !== null || s.baseHeads.length || s.repositoryId !== s.transactionId) fail('journal-initialize');
  } else if (s.purpose !== 'localCommand' || s.predecessor === null || !s.baseHeads.length) fail('journal-purpose');
}

/** Append-only private receipts. Incomplete receipt bytes are repair state, never rewritten silently. */
export class TransactionJournal {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly limits: MetadataLimits) {}
  path(tx: string, name: string) { return metadataPath(this.fs, `journal/${technicalId(tx)}/${name}`); }
  async entries(): Promise<JournalEntry[]> {
    const prefix = metadataPath(this.fs, 'journal/'), paths = await this.fs.list(prefix);
    const ids = [...new Set(paths.map(path => {
      const tail = path.slice(prefix.length);
      if (!/^[0-9a-f]{32}\/(staging\.json|blobsVerified\.json|metadataDurable\.json|published\.json|changes\/[0-9]{8}\.amchange)$/.test(tail)) fail('journal-path');
      return tail.split('/')[0]!;
    }))];
    if (ids.length > this.limits.maxChanges) fail('journal-count');
    const entries: JournalEntry[] = [];
    for (const id of ids) {
      const start = await readReceipt<JournalStart>(this.fs, this.path(id, 'staging.json'), this.limits);
      if (!start || start.transactionId !== id) fail('journal-start-missing');
      validateStart(start!, this.limits);
      const prepared = await readReceipt<PreparedJournal>(this.fs, this.path(id, 'blobsVerified.json'), this.limits);
      if (prepared) await this.validatePrepared(start!, prepared);
      const durable = await readReceipt<Durable>(this.fs, this.path(id, 'metadataDurable.json'), this.limits);
      const publication = await readReceipt<Publication>(this.fs, this.path(id, 'published.json'), this.limits);
      for (const receipt of [durable, publication]) if (receipt) {
        const keys = receipt === publication ? 'exactChangeSetDigest,heads,transactionId' : 'exactChangeSetDigest,transactionId';
        if (Object.keys(receipt).sort().join(',') !== keys || !prepared ||
          receipt.transactionId !== id || receipt.exactChangeSetDigest !== prepared.exactChangeSetDigest) fail('publication-receipt');
      }
      if (publication) { heads(publication.heads); if (!publication.heads.length || !durable) fail('publication-before-durable'); }
      entries.push({ start: start!, prepared, publication });
    }
    const chain: JournalEntry[] = []; let predecessor: string | null = null;
    while (chain.length < entries.length) {
      const children = entries.filter(e => e.start.predecessor === predecessor);
      if (children.length !== 1) fail('journal-chain');
      const child = children[0]!;
      if (chain.length && (!chain.at(-1)!.publication || child.start.repositoryId !== chain[0]!.start.repositoryId ||
        json(child.start.proof) !== json(chain[0]!.start.proof))) fail('journal-chain');
      chain.push(child); predecessor = child.start.transactionId;
    }
    return chain;
  }

  async stage(start: JournalStart, parts: readonly Uint8Array[]): Promise<PreparedJournal> {
    validateStart(start, this.limits);
    const changes: Part[] = [];
    for (const [ordinal, bytes] of parts.entries()) {
      const c = A.decodeChange(bytes);
      changes.push({ ordinal, expectedChangeHash: c.hash, dependencies: sorted(c.deps),
        byteLength: bytes.length, bytesSha256: await digest(bytes) });
    }
    const prepared = { start, changes, exactChangeSetDigest: await seal(start, changes) };
    await this.validatePrepared(start, prepared);
    await writeReceipt(this.fs, this.path(start.transactionId, 'staging.json'), start, this.limits);
    for (const [ordinal, bytes] of parts.entries()) {
      const path = this.path(start.transactionId, `changes/${String(ordinal).padStart(8, '0')}.amchange`);
      const prior = await this.fs.readBytes(path);
      if (prior) { if (!equalBytes(prior, bytes)) fail('journal-part-exists'); }
      else await this.fs.writeBytes(path, bytes);
      const read = await this.fs.readBytes(path); if (!read || !equalBytes(read, bytes)) fail('journal-part-write');
    }
    await this.validateParts(prepared);
    await writeReceipt(this.fs, this.path(start.transactionId, 'blobsVerified.json'), prepared, this.limits);
    return prepared;
  }

  private async validatePrepared(start: JournalStart, p: PreparedJournal): Promise<void> {
    if (!p || Object.keys(p).sort().join(',') !== 'changes,exactChangeSetDigest,start' || json(start) !== json(p.start) ||
      !Array.isArray(p.changes) || p.changes.length !== (start.purpose === 'initialize' ? 2 : 1) ||
      p.exactChangeSetDigest !== await seal(start, p.changes)) fail('journal-descriptors');
    let total = 0; const seen = new Set<string>();
    for (const [ordinal, part] of p.changes.entries()) {
      if (Object.keys(part).sort().join(',') !== 'byteLength,bytesSha256,dependencies,expectedChangeHash,ordinal' ||
        part.ordinal !== ordinal || !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0 ||
        part.byteLength > this.limits.maxChangeBytes || !/^[0-9a-f]{64}$/.test(part.bytesSha256) ||
        !/^[0-9a-f]{64}$/.test(part.expectedChangeHash) || seen.has(part.expectedChangeHash)) fail('journal-descriptor');
      seen.add(part.expectedChangeHash); total += part.byteLength; heads(part.dependencies);
      const expected = start.purpose === 'localCommand' ? start.baseHeads : ordinal === 0 ? [] : [p.changes[0]!.expectedChangeHash];
      if (json(part.dependencies) !== json(expected)) fail('journal-dependencies');
    }
    if (total > this.limits.maxTotalBytes) fail('journal-budget');
  }

  async validateParts(p: PreparedJournal): Promise<Uint8Array[]> {
    validateStart(p.start, this.limits); await this.validatePrepared(p.start, p);
    const parts: Uint8Array[] = [];
    for (const part of p.changes) {
      const path = this.path(p.start.transactionId, `changes/${String(part.ordinal).padStart(8, '0')}.amchange`);
      const file = await this.fs.readStream(path);
      if (!file || file.size !== part.byteLength) fail('journal-part-size');
      const bytes = await this.fs.readBytes(path);
      if (!bytes || bytes.length !== part.byteLength || await digest(bytes) !== part.bytesSha256) fail('journal-part-digest');
      const decoded = A.decodeChange(bytes!);
      if (decoded.hash !== part.expectedChangeHash || json(sorted(decoded.deps)) !== json(part.dependencies) ||
        (p.start.purpose === 'localCommand' && decoded.message !== `lociview:transaction:v1:${p.start.transactionId}`)) fail('journal-part-source');
      parts.push(bytes!);
    }
    if (p.start.purpose === 'initialize') ProjectMetadataSource.reopen(parts, p.start.proof, this.limits);
    return parts;
  }

  async publish(p: PreparedJournal, source: ProjectMetadataSource): Promise<void> {
    const [doc] = A.applyChanges(A.init(), source.originalChanges());
    const receipt: Publication = { transactionId: p.start.transactionId, exactChangeSetDigest: p.exactChangeSetDigest, heads: sorted(A.getHeads(doc)) };
    await writeReceipt(this.fs, this.path(p.start.transactionId, 'metadataDurable.json'),
      { transactionId: receipt.transactionId, exactChangeSetDigest: receipt.exactChangeSetDigest }, this.limits);
    await writeReceipt(this.fs, this.path(p.start.transactionId, 'published.json'), receipt, this.limits);
  }
}
