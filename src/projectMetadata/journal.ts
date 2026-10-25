import * as A from '@automerge/automerge/slim';
import type { ProjectWorkspaceFS } from '../platform/fs';
import { cloneCanonicalValue, type JsonObject } from '../domain/values';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import { checkedChanges, checkedProof, fail, type MetadataLimits, type MetadataProof } from './format';
import { ProjectMetadataSource } from './source';
import { digest, equalBytes, json, metadataPath, readReceipt, technicalId, withMetadataRead, writeReceipt } from './persistence';
import { initialWorkspaceChanges, planRemoteChanges } from './remote';
import { captureJournalRemote, checkJournalRemote, isPackageRemote, isContributionRemote, isBackupRestore, isBackupRestoreInput, validateJournalRemote, validateBackupRestore,
  remoteEvidenceBytes, remoteEvidenceDescriptors, remoteInputFromEvidence,
  type JournalRemoteProof, type JournalRemoteInput, type BackupRestoreInput } from './packageRemote';
import { assertContributionBaseInReceiver, frozenBaseSource } from '../projectPackage/contributionEvidence';
import { readManifestControl } from '../projectPackage/manifest';

export interface JournalStart {
  transactionId: string;
  predecessor: string | null;
  repositoryId: string;
  purpose: 'initialize' | 'localCommand' | 'remotePackageMerge' | 'importWorkspace' | 'restoreBackup' | 'importClean';
  proof: MetadataProof;
  baseHeads: string[];
}
interface Part { ordinal: number; expectedChangeHash: string; dependencies: string[]; byteLength: number; bytesSha256: string }
export interface PreparedJournal { start: JournalStart; changes: Part[]; exactChangeSetDigest: string; stagedBlobs?: JsonObject[]; remote?: JournalRemoteProof }
interface Durable { transactionId: string; exactChangeSetDigest: string }
export interface Publication extends Durable { heads: string[] }
export interface JournalEntry { start: JournalStart; prepared: PreparedJournal | null; durable: Durable | null; publication: Publication | null }
interface RestoredBasesBinding {
  schema: 'lociview-workspace-restored-bases-1'; transactionId: string;
  journal: { sha256: string; byteLength: number }; publication: { sha256: string; byteLength: number };
  exchangeBases: { sha256: string; byteLength: number };
}
const sorted = (s: readonly string[]) => [...s].sort();
async function seal(start: JournalStart, changes: Part[], stagedBlobs: readonly JsonObject[] = [], remote?: JournalRemoteProof): Promise<string> {
  if (start.purpose === 'initialize') return digest(new TextEncoder().encode(`lociview:private-initialization:jcs-v1\n${json({ start, changes })}`));
  // Exact 02 §8 local-command digest. Old receipts retain the empty-list digest.
  const value = { transactionId: start.transactionId,
    target: { identity: start.proof.identity, metadataEnvelope: start.proof.envelope }, purpose: start.purpose, stagedBlobs,
    metadataBatch: { kind: start.purpose, baseHeads: start.baseHeads, changes, ...(remote ?? {}) } };
  const version = remote && isPackageRemote(remote) ? 'v2' : 'v1';
  if (start.purpose === 'restoreBackup') return digest(new TextEncoder().encode(`lociview:v2:backup-restore:jcs-v1\n${json(value)}`));
  if (start.purpose === 'importClean') return digest(new TextEncoder().encode(`lociview:v2:clean-import:jcs-v1\n${json(value)}`));
  return digest(new TextEncoder().encode(`lociview:v2:metadata-change-set:jcs-${version}\n${json(value)}`));
}
function heads(value: unknown): asserts value is string[] {
  if (!Array.isArray(value) || value.some(v => typeof v !== 'string' || !/^[0-9a-f]{64}$/.test(v)) ||
    json(value) !== json(sorted([...new Set(value)]))) fail('journal-heads');
}
function validateStart(s: JournalStart, limits: MetadataLimits): void {
  if (!s || Object.keys(s).sort().join(',') !== 'baseHeads,predecessor,proof,purpose,repositoryId,transactionId') fail('journal-start');
  technicalId(s.transactionId); technicalId(s.repositoryId); if (s.predecessor !== null) technicalId(s.predecessor);
  checkedProof(s.proof, limits); heads(s.baseHeads);
  if (s.purpose === 'initialize' || s.purpose === 'importWorkspace' || s.purpose === 'restoreBackup' || s.purpose === 'importClean') {
    if (s.predecessor !== null || s.baseHeads.length || s.repositoryId !== s.transactionId) fail('journal-initialize');
  } else if (!['localCommand', 'remotePackageMerge'].includes(s.purpose) || s.predecessor === null || !s.baseHeads.length) fail('journal-purpose');
}

/** Append-only private receipts. Incomplete receipt bytes are repair state, never rewritten silently. */
export class TransactionJournal {
  constructor(private readonly fs: ProjectWorkspaceFS, private readonly limits: MetadataLimits) {}
  path(tx: string, name: string) { return metadataPath(this.fs, `journal/${technicalId(tx)}/${name}`); }
  async entries(): Promise<JournalEntry[]> {
    return withMetadataRead(this.fs, undefined, ({ fs }) => new TransactionJournal(fs, this.limits).entriesDirect());
  }

  private async entriesDirect(): Promise<JournalEntry[]> {
    const prefix = metadataPath(this.fs, 'journal/'), paths = await this.fs.list(prefix);
    const ids = [...new Set(paths.map(path => {
      const tail = path.slice(prefix.length);
      if (!/^[0-9a-f]{32}\/(staging\.json|blobsVerified\.json|metadataDurable\.json|published\.json|source-metadata\.am|source-manifest\.(json|sha256)|source-protected-inventory\.json|source-exchange-bases\.json|changes\/[0-9]{8}\.amchange|wire-changes\/[0-9]{8}\.amchange|derived-target-metadata\.am|base-evidence\/[0-9a-f]{64})$/.test(tail)) fail('journal-path');
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
      if (prepared && (!prepared.remote || !isPackageRemote(prepared.remote)) &&
        paths.some(path => path.startsWith(this.path(id, 'source-manifest.')))) fail('journal-source-kind');
      if (prepared) {
        const allowed = new Set(prepared.remote ? remoteEvidenceDescriptors(prepared.remote).map(([name]) => this.path(id, name)) : []);
        for (const path of paths.filter(path => path.startsWith(this.path(id, '')) && /\/(source-|wire-changes\/|base-evidence\/|derived-target-)/.test(path)))
          if (!allowed.has(path)) fail('journal-source-kind');
      }
      const durable = await readReceipt<Durable>(this.fs, this.path(id, 'metadataDurable.json'), this.limits);
      const publication = await readReceipt<Publication>(this.fs, this.path(id, 'published.json'), this.limits);
      for (const receipt of [durable, publication]) if (receipt) {
        const keys = receipt === publication ? 'exactChangeSetDigest,heads,transactionId' : 'exactChangeSetDigest,transactionId';
        if (Object.keys(receipt).sort().join(',') !== keys || !prepared ||
          receipt.transactionId !== id || receipt.exactChangeSetDigest !== prepared.exactChangeSetDigest) fail('publication-receipt');
      }
      if (publication) {
        heads(publication.heads); if (!publication.heads.length || !durable) fail('publication-before-durable');
        if (prepared?.remote && json(publication.heads) !== json(prepared.remote.expectedFinalHeads)) fail('remote-publication-heads');
      }
      entries.push({ start: start!, prepared, durable, publication });
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

  async begin(start: JournalStart): Promise<void> {
    validateStart(start, this.limits);
    await writeReceipt(this.fs, this.path(start.transactionId, 'staging.json'), start, this.limits);
  }
  async stage(start: JournalStart, parts: readonly Uint8Array[], stagedBlobs: readonly JsonObject[] = [],
    remote?: JournalRemoteInput): Promise<PreparedJournal> {
    validateStart(start, this.limits);
    parts = checkedChanges(parts, this.limits);
    if (remote) { remote = captureJournalRemote(remote, start.proof, this.limits); await validateJournalRemote(remote, start.proof, this.limits); }
    const changes: Part[] = [];
    for (const [ordinal, bytes] of parts.entries()) {
      const c = A.decodeChange(bytes);
      changes.push({ ordinal, expectedChangeHash: c.hash, dependencies: sorted(c.deps),
        byteLength: bytes.length, bytesSha256: await digest(bytes) });
    }
    const prepared = { start, changes, ...(stagedBlobs.length ? { stagedBlobs: [...stagedBlobs] } : {}),
      ...(remote ? { remote: remote.proof } : {}), exactChangeSetDigest: await seal(start, changes, stagedBlobs, remote?.proof) };
    await this.validatePrepared(start, prepared);
    const acknowledged = await readReceipt<PreparedJournal>(this.fs, this.path(start.transactionId, 'blobsVerified.json'), this.limits);
    if (acknowledged) {
      if (json(acknowledged) !== json(prepared)) fail('journal-prepared-exists');
      await this.validateParts(acknowledged);
      if (acknowledged.start.purpose === 'importWorkspace') await this.validateImport(acknowledged);
      else if (acknowledged.start.purpose === 'restoreBackup') await this.validateRestore(acknowledged);
      else if (acknowledged.remote) await this.readRemoteSource(acknowledged);
      return acknowledged; // Never refill a missing acknowledged original, even through direct staging.
    }
    await writeReceipt(this.fs, this.path(start.transactionId, 'staging.json'), start, this.limits);
    if (remote) {
      const originals = remoteEvidenceBytes(remote);
      for (const [name, original] of originals) {
        const path = this.path(start.transactionId, name), prior = await this.fs.readStream(path);
        if (prior) {
          if (prior.size !== original.length) fail('remote-source-size');
          const bytes = await this.fs.readBytes(path);
          if (!bytes || !equalBytes(bytes, original)) fail('remote-source-exists');
        } else await this.fs.writeBytes(path, original);
      }
      await this.readRemoteSource(prepared);
    }
    for (const [ordinal, bytes] of parts.entries()) {
      const path = this.path(start.transactionId, `changes/${String(ordinal).padStart(8, '0')}.amchange`);
      const prior = await this.fs.readBytes(path);
      if (prior) { if (!equalBytes(prior, bytes)) fail('journal-part-exists'); }
      else await this.fs.writeBytes(path, bytes);
      const read = await this.fs.readBytes(path); if (!read || !equalBytes(read, bytes)) fail('journal-part-write');
    }
    await this.validateParts(prepared);
    if (start.purpose === 'importWorkspace') await this.validateImport(prepared);
    if (start.purpose === 'restoreBackup') await this.validateRestore(prepared);
    await writeReceipt(this.fs, this.path(start.transactionId, 'blobsVerified.json'), prepared, this.limits);
    return prepared;
  }

  private async validatePrepared(start: JournalStart, p: PreparedJournal): Promise<void> {
    const imported = start.purpose === 'importWorkspace', restored = start.purpose === 'restoreBackup', remote = start.purpose === 'remotePackageMerge' || imported || restored;
    const packageSource = !!p?.remote && isPackageRemote(p.remote);
    const keys = remote ? ['changes,exactChangeSetDigest,remote,start', ...(packageSource ? ['changes,exactChangeSetDigest,remote,stagedBlobs,start'] : [])]
      : ['changes,exactChangeSetDigest,start', 'changes,exactChangeSetDigest,stagedBlobs,start'];
    if (!p || !keys.includes(Object.keys(p).sort().join(',')) || json(start) !== json(p.start) ||
      !Array.isArray(p.changes) || (remote ? !p.changes.length || p.changes.length > this.limits.maxChanges : p.changes.length !== (start.purpose === 'initialize' || start.purpose === 'importClean' ? 2 : 1))) fail('journal-descriptors');
    if (remote) checkJournalRemote(p.remote!, start.proof, this.limits);
    if (imported && (!packageSource || isContributionRemote(p.remote!) || isBackupRestore(p.remote!) || json(p.remote!.source.remoteHeads) !== json(p.remote!.expectedFinalHeads))) fail('import-source');
    if (restored ? !p.remote || !isBackupRestore(p.remote) : p.remote && isBackupRestore(p.remote)) fail('restore-source-purpose');
    if (p.exactChangeSetDigest !== await seal(start, p.changes, p.stagedBlobs, p.remote)) fail('journal-descriptors');
    if (p.stagedBlobs !== undefined) {
      if (!Array.isArray(p.stagedBlobs) || (packageSource || start.purpose === 'importClean' ? !p.stagedBlobs.length || p.stagedBlobs.length > this.limits.maxNodes :
        start.purpose !== 'localCommand' || p.stagedBlobs.length !== 1)) fail('journal-blob-delta');
      const lengths = new Map<string, number>(); let previous = '';
      for (const blob of p.stagedBlobs) {
        const check = new ProjectRecordFields(); check.blob(blob, []);
        if (check.unknown) fail('journal-blob-delta');
        if (packageSource || start.purpose === 'importClean') {
          const key = json(blob), before = lengths.get(blob.digest as string);
          if (key <= previous || before !== undefined && before !== blob.byteLength) fail('journal-blob-delta');
          previous = key; lengths.set(blob.digest as string, blob.byteLength as number);
        }
      }
    }
    let total = 0; const seen = new Set<string>();
    for (const [ordinal, part] of p.changes.entries()) {
      if (Object.keys(part).sort().join(',') !== 'byteLength,bytesSha256,dependencies,expectedChangeHash,ordinal' ||
        part.ordinal !== ordinal || !Number.isSafeInteger(part.byteLength) || part.byteLength <= 0 ||
        part.byteLength > this.limits.maxChangeBytes || !/^[0-9a-f]{64}$/.test(part.bytesSha256) ||
        !/^[0-9a-f]{64}$/.test(part.expectedChangeHash) || seen.has(part.expectedChangeHash)) fail('journal-descriptor');
      seen.add(part.expectedChangeHash); total += part.byteLength; heads(part.dependencies);
      const expected = start.purpose === 'localCommand' ? start.baseHeads : ordinal === 0 ? [] : [p.changes[0]!.expectedChangeHash];
      if (!remote && json(part.dependencies) !== json(expected)) fail('journal-dependencies');
    }
    if (total > this.limits.maxTotalBytes) fail('journal-budget');
  }

  async validateParts(p: PreparedJournal): Promise<Uint8Array[]> {
    const owned = cloneCanonicalValue(p, this.limits) as unknown as PreparedJournal;
    return withMetadataRead(this.fs, undefined, ({ fs }) => new TransactionJournal(fs, this.limits).validatePartsDirect(owned));
  }

  private async validatePartsDirect(p: PreparedJournal): Promise<Uint8Array[]> {
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
    if (p.start.purpose === 'importClean') ProjectMetadataSource.reopen(parts, p.start.proof, this.limits).assertFreshInitialization();
    return parts;
  }

  private async readRemoteInput(p: PreparedJournal): Promise<JournalRemoteInput> {
    if (!p.remote) return fail('remote-descriptor');
    const originals = new Map<string, Uint8Array>();
    for (const [name, ref] of remoteEvidenceDescriptors(p.remote)) {
      const path = this.path(p.start.transactionId, name), file = await this.fs.readStream(path);
      if (!file || file.size !== ref.byteLength) fail('remote-source-size');
      const bytes = await this.fs.readBytes(path);
      if (!bytes || bytes.length !== ref.byteLength || await digest(bytes) !== ref.sha256) return fail('remote-source-digest');
      originals.set(name, bytes);
    }
    return remoteInputFromEvidence(p.remote, originals);
  }
  /** Physical incoming inventory only, after the caller validates the published journal.
   * Base guarantees are not evidence that a Contribution supplied those bodies. */
  async receivedBlobs(p: PreparedJournal): Promise<readonly { sha256: string; byteLength: number }[]> {
    if (!p.remote || !isPackageRemote(p.remote)) return [];
    const read = async (name: string, ref: { sha256: string; byteLength: number }) => {
      const path = this.path(p.start.transactionId, name), file = await this.fs.readStream(path);
      if (!file || file.size !== ref.byteLength) return fail('remote-source-size');
      const bytes = await this.fs.readBytes(path);
      if (!bytes || bytes.length !== ref.byteLength || await digest(bytes) !== ref.sha256) return fail('remote-source-digest');
      return bytes;
    };
    return readManifestControl(await read('source-manifest.json', p.remote.source.manifest),
      await read('source-manifest.sha256', p.remote.source.checksum)).manifest.blobs;
  }
  private async readRemoteSource(p: PreparedJournal): Promise<ProjectMetadataSource> {
    return validateJournalRemote(await this.readRemoteInput(p), p.start.proof, this.limits);
  }

  /** Recovery re-derives completeness from the retained full source and exact durable base. */
  async validateRemote(p: PreparedJournal, base: ProjectMetadataSource): Promise<ProjectMetadataSource> {
    const parts = await this.validateParts(p);
    if (p.start.purpose !== 'remotePackageMerge' || !p.remote || isBackupRestore(p.remote) || json(base.heads) !== json(p.start.baseHeads)) fail('remote-base-heads');
    const input = await this.readRemoteInput(p), target = await validateJournalRemote(input, p.start.proof, this.limits);
    if ('wireParts' in input) assertContributionBaseInReceiver(frozenBaseSource(input.proof.source.base,
      input.baseManifestBytes, input.baseMetadataBytes, this.limits).source, base);
    const expected = planRemoteChanges(base, target, this.limits);
    if (parts.length !== expected.parts.length || parts.some((b, i) => !equalBytes(b, expected.parts[i]!)) ||
      json(expected.final.heads) !== json(p.remote!.expectedFinalHeads)) fail('remote-complete-set');
    return expected.final;
  }

  /** Initial import proves the entire original history without fabricating a receiver base. */
  async validateImport(p: PreparedJournal): Promise<ProjectMetadataSource> {
    if (p.start.purpose !== 'importWorkspace' || !p.remote || !isPackageRemote(p.remote) || p.remote.version !== 'lociview-package-remote-1') return fail('import-journal');
    const parts = await this.validateParts(p), source = await this.readRemoteSource(p), expected = initialWorkspaceChanges(source, this.limits);
    if (parts.length !== expected.length || parts.some((b, i) => !equalBytes(b, expected[i]!)) ||
      json(source.heads) !== json(p.remote.expectedFinalHeads)) fail('import-complete-set');
    return source;
  }

  async readRestoreInput(p: PreparedJournal): Promise<BackupRestoreInput> {
    if (p.start.purpose !== 'restoreBackup' || !p.remote || !isBackupRestore(p.remote)) return fail('restore-journal');
    await this.validatePrepared(p.start, p);
    const input = await this.readRemoteInput(p); if (!isBackupRestoreInput(input)) return fail('restore-journal'); return input;
  }
  /** Restoration initializes every original; neither a receiver union nor a current-value snapshot. */
  async validateRestore(p: PreparedJournal): Promise<ProjectMetadataSource> {
    return (await this.restoreOriginals(p)).source;
  }
  private async restoreOriginals(p: PreparedJournal) {
    const input = await this.readRestoreInput(p), parts = await this.validateParts(p);
    const result = await validateBackupRestore(input, p.start.proof, this.limits), { source } = result, expected = initialWorkspaceChanges(source, this.limits);
    if (parts.length !== expected.length || parts.some((b, i) => !equalBytes(b, expected[i]!)) ||
      json(source.heads) !== json(input.proof.expectedFinalHeads)) fail('restore-complete-set');
    return { ...result, input };
  }

  private async restoredBinding(p: PreparedJournal, publication: Publication): Promise<RestoredBasesBinding> {
    if (!p.remote || !isBackupRestore(p.remote) || p.start.purpose !== 'restoreBackup') return fail('restore-base-journal');
    const ref = async (value: unknown) => { const bytes = new TextEncoder().encode(json(value)); return { sha256: await digest(bytes), byteLength: bytes.length }; };
    return { schema: 'lociview-workspace-restored-bases-1', transactionId: p.start.transactionId,
      journal: await ref(p), publication: await ref(publication), exchangeBases: p.remote.source.exchangeBases };
  }
  /** Historical authority comes from this published initialization, never from fabricated local receipts. */
  async readRestoredBases(entries?: readonly JournalEntry[]) {
    const owned = entries === undefined ? undefined : structuredClone(entries);
    return withMetadataRead(this.fs, undefined, ({ fs }) => new TransactionJournal(fs, this.limits).readRestoredBasesDirect(owned));
  }

  private async readRestoredBasesDirect(entries?: readonly JournalEntry[]) {
    const chain = entries ?? await this.entries(), entry = chain.find(e => e.start.purpose === 'restoreBackup');
    const binding = await readReceipt<RestoredBasesBinding>(this.fs, metadataPath(this.fs, 'restored-bases.json'), this.limits);
    if (!entry) { if (binding) fail('restore-base-orphan'); return null; }
    if (chain[0] !== entry) return fail('restore-base-root');
    if (!entry.publication) return null; // A prepared binding is not a completed base observation.
    if (!entry.prepared || json(binding) !== json(await this.restoredBinding(entry.prepared, entry.publication))) return fail('restore-base-binding');
    return { binding: binding!, entry, ...await this.restoreOriginals(entry.prepared) };
  }

  async publish(p: PreparedJournal, source: ProjectMetadataSource): Promise<void> {
    const [doc] = A.applyChanges(A.init(), source.originalChanges());
    const receipt: Publication = { transactionId: p.start.transactionId, exactChangeSetDigest: p.exactChangeSetDigest, heads: sorted(A.getHeads(doc)) };
    if (p.remote && json(receipt.heads) !== json(p.remote.expectedFinalHeads)) fail('remote-final-heads');
    if (p.start.purpose === 'restoreBackup') {
      await this.validateRestore(p);
      const path = metadataPath(this.fs, 'restored-bases.json'), binding = await this.restoredBinding(p, receipt);
      if (await readReceipt(this.fs, this.path(p.start.transactionId, 'published.json'), this.limits)) {
        if (json(await readReceipt(this.fs, path, this.limits)) !== json(binding)) fail('restore-base-binding');
      } else await writeReceipt(this.fs, path, binding, this.limits);
    }
    await writeReceipt(this.fs, this.path(p.start.transactionId, 'metadataDurable.json'),
      { transactionId: receipt.transactionId, exactChangeSetDigest: receipt.exactChangeSetDigest }, this.limits);
    await writeReceipt(this.fs, this.path(p.start.transactionId, 'published.json'), receipt, this.limits);
  }
}
