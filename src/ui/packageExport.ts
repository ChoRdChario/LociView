import type { PackageExportStatus, PackageKind } from './saveStatus';

export interface PackageExportRun {
  readonly bytes: Uint8Array;
  readonly status: Extract<PackageExportStatus, { phase: 'download-started' }>;
}

/** Separates package generation from the observable start of a browser download. */
export async function generateAndStartPackageDownload(
  kind: PackageKind,
  coveredOpCount: number,
  generate: () => Promise<Uint8Array>,
  startDownload: (bytes: Uint8Array) => void,
  publish: (status: PackageExportStatus) => void,
): Promise<PackageExportRun> {
  if (!Number.isSafeInteger(coveredOpCount) || coveredOpCount < 0) {
    throw new Error('package export: invalid operation checkpoint');
  }
  publish(Object.freeze({ phase: 'generating', kind, coveredOpCount }));
  let bytes: Uint8Array;
  try {
    bytes = await generate();
  } catch (error) {
    publish(Object.freeze({ phase: 'failed', kind, coveredOpCount }));
    throw error;
  }

  publish(Object.freeze({ phase: 'generated', kind, bytes: bytes.length, coveredOpCount }));
  startDownload(bytes);
  const status = Object.freeze({
    phase: 'download-started' as const,
    kind,
    bytes: bytes.length,
    coveredOpCount,
  });
  publish(status);
  return { bytes, status };
}
