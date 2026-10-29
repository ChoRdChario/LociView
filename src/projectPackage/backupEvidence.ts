import * as A from '@automerge/automerge/slim';
import { canonical } from '../domain/projectGraphSupport';
import { ProjectRecordFields } from '../domain/projectRecordFields';
import type { JsonObject, JsonValue } from '../domain/values';
import { ProjectMetadataSource, type MetadataLimits, type MetadataProof } from '../projectMetadata/source';
import type { StoredBlobRef } from '../projectMetadata/blobStore';
import type { WorkspaceBaseRecord } from './workspaceBases';
import { PACKAGE_LIMITS as L, summaryAlgorithm, type AutomaticSummary, type Entry, type EvidenceRef } from './contract';
import { canonicalControl, packageByteHash, PackageControlError } from './manifest';
import { frozenBaseSource } from './contributionEvidence';
import { summarizeFullHistory } from './historySummary';
import { planWorkspaceClosure } from './closure';
import { protectedWorkspaceInventory } from './protectedInventory';
import { checkAbort } from './zipChecks';

const fail = (code: string): never => { throw new PackageControlError(code); };
const same = (a: unknown, b: unknown) => canonical(a as JsonValue) === canonical(b as JsonValue);
export const backupEncode = (value: unknown) => new TextEncoder().encode(canonical(value as JsonValue));
export type BackupBaseRecord = WorkspaceBaseRecord & { readonly label?: string };
export type BackupBaseTable = { readonly records: readonly BackupBaseRecord[] };
export interface BackupEvidenceBytes { readonly reference: EvidenceRef; readonly bytes: Uint8Array }
/** Portable historical observations, never a local receipt or permission to restore. */
export function readBackupBases(bytes: Uint8Array, proof: MetadataProof) {
  const c = new ProjectRecordFields(), root = c.shape(canonicalControl(bytes), ['records'], []);
  const rows = c.list(c.required(root, 'records', []), 16, []);
  let previous = '', dependencies = 0;
  const manifestSizes = new Map<string, number>();
  for (const value of rows) {
    const row = c.shape(value, ['identity', 'metadataEnvelope', 'workspacePackageId', 'workspaceManifestSha256', 'declaredHeads', 'evidence', 'completions', 'label'], []);
    if (!same(row.identity, proof.identity) || !same(row.metadataEnvelope, proof.envelope)) fail('backup-base-lineage');
    const key = c.id(c.required(row, 'workspacePackageId', []), 'pkg', []);
    if (key <= previous) fail('backup-base-order'); previous = key;
    c.digest(c.required(row, 'workspaceManifestSha256', []), []);
    const heads = (value: JsonValue) => { dependencies += c.sorted(value, [], (v, p) => c.digest(v, p), 1, L.heads).length; };
    heads(c.required(row, 'declaredHeads', []));
    const evidence = c.shape(c.required(row, 'evidence', []), ['manifest', 'metadata'], []);
    for (const key of ['manifest', 'metadata']) {
      const ref = c.shape(c.required(evidence, key, []), ['sha256', 'byteLength'], []);
      c.digest(c.required(ref, 'sha256', []), []); const n = c.integer(c.required(ref, 'byteLength', []), []);
      if (!n || n > (key === 'manifest' ? L.controlBytes : L.sourceBytes)) fail('backup-evidence-size');
      if (key === 'manifest') manifestSizes.set(ref.sha256 as string, n);
    }
    let prior = '';
    for (const value of c.list(c.required(row, 'completions', []), L.maxNodes, [], 1)) {
      const completion = c.object(value, []); c.enum(c.required(completion, 'observation', []), ['generated', 'imported'], []);
      c.shape(value, completion.observation === 'generated' ? ['observation'] : ['observation', 'publishedReceiverHeads'], []);
      if (completion.observation === 'imported') heads(c.required(completion, 'publishedReceiverHeads', []));
      const key = canonical(value); if (key <= prior) fail('backup-completion-order'); prior = key;
    }
    c.optional(row, 'label', [], (v, p) => { c.text(v, 256, p); });
  }
  if (c.unknown || dependencies > L.dependencyReferences) fail('backup-base-table');
  const baseControlBytes = [...manifestSizes.values()].reduce((n, size) => n + size, 0);
  if (baseControlBytes + bytes.length > L.controlsBytes) fail('backup-control-budget');
  return { table: root as unknown as BackupBaseTable, dependencies, baseControlBytes };
}
export function backupEvidenceRefs(table: BackupBaseTable): readonly EvidenceRef[] {
  const refs = new Map<string, EvidenceRef>();
  for (const row of table.records) for (const ref of [row.evidence.manifest, row.evidence.metadata]) {
    if (refs.has(ref.sha256) && refs.get(ref.sha256)!.byteLength !== ref.byteLength) fail('backup-evidence-length');
    refs.set(ref.sha256, ref);
  }
  const result = [...refs.values()].sort((a, b) => a.sha256 < b.sha256 ? -1 : 1);
  if (result.length > L.baseEvidenceCount || result.reduce((n, e) => n + e.byteLength, 0) > L.baseEvidenceBytes) fail('backup-evidence-budget');
  return Object.freeze(result);
}

/** Pure complete known-profile proof. No live store, output job or restore receipt. */
export async function inspectBackupOriginals(source: ProjectMetadataSource, tableBytes: Uint8Array,
  evidence: readonly BackupEvidenceBytes[], limits: MetadataLimits, signal?: AbortSignal) {
  checkAbort(signal);
  const { table, dependencies: declared } = readBackupBases(tableBytes, source.proof), expected = backupEvidenceRefs(table);
  if (!Array.isArray(evidence) || evidence.length !== expected.length || !same(evidence.map(e => e.reference), expected)) fail('backup-evidence-union');
  const byHash = new Map<string, Uint8Array>();
  for (const e of evidence) {
    if (e.bytes.length !== e.reference.byteLength || packageByteHash(e.bytes) !== e.reference.sha256) fail('backup-evidence-bytes');
    byHash.set(e.reference.sha256, e.bytes);
  }
  let work = 0, nodes = 0, operations = 0, dependencies = declared + source.heads.length, baseControlBytes = 0;
  let includesDeclaredEditorNames = false;
  const controlHashes = new Set<string>(), semantic = new Map<string, StoredBlobRef>();
  const charge = (n: number) => { work += n; if (work > L.inspectionWork) fail('backup-inspection-budget'); };
  const inspect = async (s: ProjectMetadataSource) => {
    includesDeclaredEditorNames ||= s.includesDeclaredEditorNames;
    for (const bytes of s.originalChanges()) {
      const change = A.decodeChange(bytes); operations += change.ops.length; dependencies += change.deps.length;
      if (operations > 100_000 || dependencies > L.dependencyReferences) fail('backup-source-budget');
    }
    const inspection = await s.inspectOriginal({ maxNodes: L.inspectionNodes - nodes, maxWork: L.inspectionWork - work }); checkAbort(signal);
    nodes += inspection.nodesUsed;
    const counts = summarizeFullHistory(inspection), closure = planWorkspaceClosure(inspection.candidates);
    if (counts.hasOpaque) fail('opaque-inventory-required');
    charge(counts.workUsed + closure.workUsed);
    for (const ref of closure.semanticRefs) semantic.set(canonical(ref as unknown as JsonValue), ref);
    return { inspection, counts, closure };
  };
  const current = await inspect(source), guaranteed: Entry[] = [];
  for (const row of table.records) {
    checkAbort(signal);
    const { completions: _historical, label: _label, ...proof } = row;
    const manifestBytes = byHash.get(row.evidence.manifest.sha256)!, metadataBytes = byHash.get(row.evidence.metadata.sha256)!;
    if (!controlHashes.has(row.evidence.manifest.sha256)) { baseControlBytes += manifestBytes.length; controlHashes.add(row.evidence.manifest.sha256); }
    if (baseControlBytes + tableBytes.length > L.controlsBytes) fail('backup-control-budget');
    const base = frozenBaseSource(proof, manifestBytes, metadataBytes, limits), description = await inspect(base.source);
    if (!same(description.closure.entries, base.manifest.blobs) || !same(description.counts.entityClasses, base.manifest.summary.entityClasses) ||
      !same(description.counts.fieldClasses, base.manifest.summary.fieldClasses)) fail('backup-base-source');
    guaranteed.push(...base.blobs);
  }
  const inventory = canonicalControl(backupEncode(protectedWorkspaceInventory(current.inspection.candidates, guaranteed, charge)));
  const entries = ((inventory as JsonObject).blobs as readonly JsonObject[]).map(b => Object.freeze({
    path: `blobs/sha256/${b.sha256}`, sha256: b.sha256 as string, byteLength: b.byteLength as number }));
  const summary: AutomaticSummary = Object.freeze({ algorithm: summaryAlgorithm(source.semanticProfile), scope: 'entireHistory', entityClasses: current.counts.entityClasses,
    fieldClasses: current.counts.fieldClasses, blobEntryCount: entries.length, blobBytes: entries.reduce((n, e) => n + e.byteLength, 0) });
  checkAbort(signal);
  return Object.freeze({ table, inventory, baseEvidence: expected, baseControlBytes, blobs: Object.freeze(entries),
    bodyRefs: Object.freeze([...semantic.values()]), summary, includesDeclaredEditorNames });
}
