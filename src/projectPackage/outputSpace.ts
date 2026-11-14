import type { ProjectWorkspaceFS } from '../platform/fs';
import { fail } from '../projectMetadata/format';
import { withMetadataRead } from '../projectMetadata/persistence';
import { PACKAGE_LIMITS as L } from './contract';

/** One pure size observation; callers await its closing audit before any mutation. */
export function assertOutputSpace(original: ProjectWorkspaceFS, prefix: string, additional: number): Promise<void> {
  return withMetadataRead(original, undefined, async ({ fs }) => {
    const paths = await fs.list(prefix); if (paths.length > L.entryCount) return fail('output-space-budget');
    let total = additional + L.baseEvidenceBytes;
    for (const path of paths) {
      const file = await fs.readStream(path);
      if (!file || !Number.isSafeInteger(file.size) || file.size < 0) return fail('output-space-read');
      total += file.size; if (total > 2_147_483_648 - 16_777_216) fail('output-space-budget');
    }
  });
}
