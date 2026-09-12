import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { MetadataProjectSession } from '../projectMetadata/session';
import type { MetadataStorageFactory } from '../projectMetadata/repository';
import { digest, equalBytes, metadataPath, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { ValidationContent, readValidationBody } from './content';
import { validationModelFacts } from './modelFacts';
import type { PreparedValidationProject } from './initialProject';
import type { PngDecoder } from './png';
import { fileError, validationMetadataLimits as metadataLimits, type FileValidationLimits } from './validation';

interface InitialReceipt { version: 'validation-initial-1'; proof: MetadataProof; byteLength: number; digest: string }
const initialPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'validation-initial.am');
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'validation-initial.json');

async function readInitial(fs: ProjectWorkspaceFS): Promise<ProjectMetadataSource> {
  const r = await readReceipt<InitialReceipt>(fs, receiptPath(fs), metadataLimits), file = await fs.readStream(initialPath(fs));
  if (!r || r.version !== 'validation-initial-1' || Object.keys(r).sort().join(',') !== 'byteLength,digest,proof,version' ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > metadataLimits.maxTotalBytes ||
    !file || file.size !== r.byteLength) return fileError('作成途中の初期記録を確認できません。');
  const bytes = await readValidationBody(file, metadataLimits.maxTotalBytes);
  if (await digest(bytes) !== r.digest) return fileError('作成途中の記録が一致しません。');
  const source = ProjectMetadataSource.fromFullSource(bytes, r.proof, metadataLimits);
  if (source.originalChanges().length !== 2) return fileError('初期記録の履歴を確認できません。');
  return source;
}
async function writeInitial(fs: ProjectWorkspaceFS, source: ProjectMetadataSource): Promise<void> {
  const bytes = source.encodeFullSource();
  // Manifest first binds the exact intended source; partial bytes stay repair state.
  await writeReceipt(fs, receiptPath(fs), { version: 'validation-initial-1', proof: source.proof, byteLength: bytes.length, digest: await digest(bytes) }, metadataLimits);
  const previous = await fs.readBytes(initialPath(fs));
  if (previous && !equalBytes(previous, bytes)) return fileError('作成途中の記録が一致しません。上書きはしていません。');
  if (!previous) await fs.writeBytes(initialPath(fs), bytes);
  const saved = await readInitial(fs);
  if (saved.token !== source.token || saved.originalChanges().some((b, i) => !equalBytes(b, source.originalChanges()[i]!)))
    return fileError('初期記録の保存を確認できません。');
}
export function validationProjectService(fs: ProjectWorkspaceFS, storage: MetadataStorageFactory, store: OriginBlobStore,
  limits: FileValidationLimits, decode?: PngDecoder) {
  const content = new ValidationContent(fs, store, limits, decode);
  return { content, session: new MetadataProjectSession(fs, storage, metadataLimits, allow => content.verifier(allow), content, validationModelFacts(content)) };
}
/** Capture once; repeated execution uses identical source/IDs/bytes after a failed attempt. */
export function prepareValidationCreation(input: PreparedValidationProject) {
  const source = ProjectMetadataSource.bootstrap(input.records.schema, input.records.identity, metadataLimits).initialize(input.records);
  const blobs = input.blobs.map(b => ({ ref: { ...b.ref }, bytes: b.bytes.slice() }));
  return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
    const before = await session.read();
    if (before.state !== 'empty') return fileError('作成先が空ではありません。保存済みProjectは変更していません。');
    for (const b of blobs) await store.put(new Blob([b.bytes.slice().buffer]).stream(), b.ref.mediaType, b.ref);
    await underWriteLease(fs, () => writeInitial(fs, source));
    return session.createFromSource(source);
  } };
}
/** A cold incomplete creation never regenerates its bootstrap or silently creates new content. */
export async function resumeValidationCreation(fs: ProjectWorkspaceFS, session: MetadataProjectSession, expectedProjectId?: string) {
  const state = await session.read();
  if (state.state === 'ready') return state;
  if (state.state !== 'pending' && state.state !== 'empty') return fileError('未完了の保存を確認してください。');
  const source = await readInitial(fs);
  if (expectedProjectId && source.proof.identity.projectId !== expectedProjectId)
    return fileError('保存領域と初期プロジェクトが一致しません。');
  return state.state === 'pending' ? session.recoverInitialization(source) : session.createFromSource(source);
}
