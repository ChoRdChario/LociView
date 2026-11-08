import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail } from '../projectMetadata/format';
import { withMetadataRead } from '../projectMetadata/persistence';

/** Cleanup-only size admission; never a substitute for parsing or write authority. */
export class OutputCleanupRead {
  private active = true;
  private constructor(private readonly fs: ProjectWorkspaceFS) {}
  assertOwner(fs: ProjectWorkspaceFS) {
    if (!this.active || fs !== this.fs) fail('output-cleanup-scope');
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
  }
  skipAttemptSize(fs: ProjectWorkspaceFS, path: string): boolean {
    this.assertOwner(fs);
    return /\/[0-9a-f]{32}\/artifacts\/[0-9a-f]{32}\.zip$/.test(path);
  }
  static run<T>(fs: ProjectWorkspaceFS, action: (fs: ProjectWorkspaceFS, scope: OutputCleanupRead) => Promise<T>): Promise<T> {
    fs.mutationAuthority.assertWorkspaceWriteAuthorized();
    return withMetadataRead(fs, undefined, async ({ fs }) => {
      const scope = new OutputCleanupRead(fs);
      try { scope.assertOwner(fs); return await action(fs, scope); }
      finally { scope.active = false; }
    });
  }
}
