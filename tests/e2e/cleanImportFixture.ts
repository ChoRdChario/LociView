import { createWriteStream, openAsBlob } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { object } from '../../src/domain/projectGraphSupport';
import { validationMetadataLimits as limits } from '../../src/projectFiles/validation';
import { ProjectMetadataSource } from '../../src/projectMetadata/source';
import { BackupArchive } from '../../src/projectPackage/backupArchive';
import { inspectCleanSource } from '../../src/projectPackage/cleanSource';
import { rebuildCleanRecords, selectCleanRecords } from '../../src/projectPackage/cleanRecords';
import { writeCleanArchive } from '../../src/projectPackage/cleanArchive';
import { packageByteHash } from '../../src/projectPackage/manifest';

/** Exercise the legacy reader on current test assets without using the retired output UI. */
export async function writeCleanImportFixture(backupPath: string, cleanPath: string) {
  const { source, archive } = await BackupArchive.inspect(await openAsBlob(backupPath), limits);
  const records = await rebuildCleanRecords(await selectCleanRecords(source, limits), limits, undefined, source.semanticProfile);
  const clean = ProjectMetadataSource.bootstrap(object(records.schema), object(records.identity), limits, { time: 0, semanticProfile: source.semanticProfile })
    .initialize(records, { time: 0 });
  const { closure, summary } = await inspectCleanSource(clean, limits), metadata = clean.encodeFullSource();
  await writeCleanArchive({ metadataBytes: () => metadata, metadata: { path: 'metadata.am', sha256: packageByteHash(metadata), byteLength: metadata.length },
    blobs: closure.entries, bodyRefs: closure.semanticRefs, summary, proof: clean.proof, targetHeads: clean.heads, requiredCapabilities: clean.requiredCapabilities },
  { openReadOnly: async ref => archive.entryBlob(`blobs/sha256/${ref.digest}`) }, Writable.toWeb(createWriteStream(cleanPath)),
  { packageId: `pkg_${randomBytes(16).toString('hex')}`, createdByVersion: 'test-clean-import' });
  return cleanPath;
}
