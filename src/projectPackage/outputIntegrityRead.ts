import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail, type MetadataLimits } from '../projectMetadata/format';
import { auditMetadataReadBoundary, json, withMetadataRead } from '../projectMetadata/persistence';
import { PACKAGE_LIMITS as L, type EvidenceRef } from './contract';
import { PackageArchive } from './zipArchive';
import { workspacePackageRoot } from './workspaceBases';

interface State {
  readonly fs: ProjectWorkspaceFS;
  readonly root: string | null;
  readonly authority: ProjectWorkspaceFS['mutationAuthority'];
  readonly policy: string;
  readonly signal?: AbortSignal;
  readonly timing?: (milliseconds: number) => void;
  readonly archives: Map<string, { binding: string; archive: Promise<PackageArchive> }>;
  readonly pending: Set<Promise<unknown>>;
  active: boolean;
}

/** Internal capability for one outputReady; only immutable ZIP integrity is shared. */
export class OutputIntegrityRead {
  private active = true;
  private constructor(private readonly state: State, private readonly fs: ProjectWorkspaceFS) {}
  assertOwner(fs: ProjectWorkspaceFS, limits: MetadataLimits) {
    const s = this.state;
    if (!this.active || !s.active || fs !== this.fs || s.fs.projectRoot !== s.root || s.fs.mutationAuthority !== s.authority || json(limits) !== s.policy)
      fail('output-integrity-owner');
    s.authority.assertEditable(); s.signal?.throwIfAborted();
  }
  /** Derived FS access is owned by this trusted callback, never registered by arbitrary callers. */
  async withMetadataRead(fs: ProjectWorkspaceFS, limits: MetadataLimits,
    action: (fs: ProjectWorkspaceFS, scope: OutputIntegrityRead) => Promise<void>): Promise<void> {
    this.assertOwner(fs, limits);
    await withMetadataRead(fs, undefined, async ({ fs: derived }) => {
      const view = new OutputIntegrityRead(this.state, derived);
      try { await action(derived, view); view.assertOwner(derived, limits); }
      finally { view.active = false; }
    });
    this.assertOwner(fs, limits);
  }
  archive(fs: ProjectWorkspaceFS, path: string, expected: EvidenceRef, binding: unknown, limits: MetadataLimits): Promise<PackageArchive> {
    const work = this.open(fs, path, expected, binding, limits), pending = this.state.pending;
    pending.add(work); void work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  }
  private async open(fs: ProjectWorkspaceFS, path: string, expected: EvidenceRef, binding: unknown, limits: MetadataLimits) {
    this.assertOwner(fs, limits);
    const prefix = workspacePackageRoot(fs), local = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    if (!/^(review-edit\/[0-9a-f]{32}\/(original|copy)\.zip|clean-input\/[0-9a-f]{32}\/input\.zip)$/.test(local)) fail('output-integrity-artifact');
    const ref = structuredClone(expected);
    if (!ref || !/^[0-9a-f]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.byteLength) || ref.byteLength < 22 || ref.byteLength > L.archiveBytes)
      fail('output-integrity-reference');
    const fingerprint = json({ expected: ref, binding });
    let captured = this.state.archives.get(path);
    if (captured && captured.binding !== fingerprint) fail('output-integrity-binding-changed');
    if (!captured) {
      const archive = (async () => {
        const input = await fs.readStream(path); this.assertOwner(fs, limits);
        if (!input?.blob || input.size !== ref.byteLength) return fail('output-integrity-input');
        const blob = await input.blob(); this.assertOwner(fs, limits);
        if (blob.size !== ref.byteLength) fail('output-integrity-input');
        const started = performance.now();
        let result: PackageArchive;
        try { result = await PackageArchive.inspect(blob, this.state.signal); }
        finally { try { this.state.timing?.(performance.now() - started); } catch { /* Diagnostics have no authority. */ } }
        this.assertOwner(fs, limits);
        if (result.sha256 !== ref.sha256 || result.byteLength !== ref.byteLength) fail('output-integrity-input');
        return result;
      })();
      captured = { binding: fingerprint, archive }; this.state.archives.set(path, captured);
    }
    const archive = await captured.archive; this.assertOwner(fs, limits);
    return archive.scopedCapturedRead(() => this.assertOwner(fs, limits), read => {
      this.state.pending.add(read); void read.then(() => this.state.pending.delete(read), () => this.state.pending.delete(read));
    });
  }
  static async run(fs: ProjectWorkspaceFS, limits: MetadataLimits, signal: AbortSignal | undefined,
    action: (scope: OutputIntegrityRead) => Promise<void>, timing?: (milliseconds: number) => void): Promise<void> {
    signal?.throwIfAborted(); await auditMetadataReadBoundary(fs); signal?.throwIfAborted();
    const state: State = { fs, root: fs.projectRoot, authority: fs.mutationAuthority, policy: json(limits), signal, timing,
      active: true, archives: new Map(), pending: new Set() };
    const scope = new OutputIntegrityRead(state, fs);
    try {
      await action(scope);
      if (state.pending.size) { await Promise.allSettled([...state.pending]); fail('output-integrity-unfinished'); }
      scope.assertOwner(fs, limits); await auditMetadataReadBoundary(fs); scope.assertOwner(fs, limits);
    } finally {
      // Await owned I/O even on cancellation; never abandon a scan or carry its proof to a retry.
      state.active = false; scope.active = false;
      await Promise.allSettled([...state.pending]); state.archives.clear();
    }
  }
}
