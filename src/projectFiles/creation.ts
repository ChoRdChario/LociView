import type { PhotoDecoder } from './photo';
import type { ProjectWorkspaceFS } from '../platform/fs';
import type { OriginBlobStore } from '../projectMetadata/blobStore';
import { ProjectMetadataSource, type MetadataProof } from '../projectMetadata/source';
import { MetadataProjectSession } from '../projectMetadata/session';
import type { MetadataStorageFactory } from '../projectMetadata/repository';
import { digest, equalBytes, json, metadataPath, readReceipt, underWriteLease, writeReceipt } from '../projectMetadata/persistence';
import { ValidationContent, readValidationBody } from './content';
import { validationModelFacts } from './modelFacts';
import { captureGsBlob, gsBlobStream } from './gsPly';
import type { ValidationBody, PreparedValidationProject } from './initialProject';
import type { PngDecoder } from './png';
import type { JpegDecoder } from './jpeg';
import { fileError, validationMetadataLimits as metadataLimits, type ProjectFilePolicyInput } from './validation';

type InitialOriginRecipe = 'native-project-scene-recipe-8' | 'native-project-scene-recipe-7' | 'v1-project-scene-migration-recipe-6' | 'locimyu-project-scene-migration-recipe-4' | 'v1-project-scene-migration-recipe-5' | 'v1-project-scene-migration-recipe-4' | 'native-project-scene-recipe-5' | 'native-project-scene-recipe-6' | 'v1-project-scene-migration-recipe-3' | 'locimyu-project-scene-migration-recipe-3' | 'v1-project-scene-migration-recipe-1' | 'locimyu-project-scene-migration-recipe-1' |
  'v1-project-scene-migration-recipe-2' | 'locimyu-project-scene-migration-recipe-2' | 'native-project-scene-recipe-3' | 'native-project-scene-recipe-4';
const originRecipeKnown = (value: unknown): value is InitialOriginRecipe => typeof value === 'string' && [
  'native-project-scene-recipe-8', 'native-project-scene-recipe-7',
  'v1-project-scene-migration-recipe-1', 'v1-project-scene-migration-recipe-4', 'v1-project-scene-migration-recipe-5', 'locimyu-project-scene-migration-recipe-1',
  'v1-project-scene-migration-recipe-2', 'locimyu-project-scene-migration-recipe-2', 'native-project-scene-recipe-3', 'native-project-scene-recipe-4',
  'native-project-scene-recipe-5', 'native-project-scene-recipe-6', 'v1-project-scene-migration-recipe-3', 'locimyu-project-scene-migration-recipe-3',
  'locimyu-project-scene-migration-recipe-4', 'v1-project-scene-migration-recipe-6',
].includes(value);
type InitialReceipt = { proof: MetadataProof; byteLength: number; digest: string } & (
  { version: 'validation-initial-1' } | { version: 'validation-initial-2'; originRecipe: InitialOriginRecipe });
const initialPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'validation-initial.am');
const receiptPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'validation-initial.json');
const originPath = (fs: ProjectWorkspaceFS) => metadataPath(fs, 'validation-origin.json');
type InitialOrigin = { version: 'validation-origin-1'; originRecipe: InitialOriginRecipe; proof: MetadataProof; byteLength: number; digest: string };
async function readInitialOrigin(fs: ProjectWorkspaceFS) {
  const r = await readReceipt<InitialOrigin>(fs, originPath(fs), metadataLimits);
  if (r && (Object.keys(r).sort().join(',') !== 'byteLength,digest,originRecipe,proof,version' || r.version !== 'validation-origin-1' ||
    !originRecipeKnown(r.originRecipe) || !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 ||
    r.byteLength > metadataLimits.maxTotalBytes || !/^[0-9a-f]{64}$/.test(r.digest))) return fileError('作成途中の変換種別を確認できません。');
  return r;
}

export async function readValidationInitial(fs: ProjectWorkspaceFS): Promise<ProjectMetadataSource> {
  return (await readValidationInitialRecord(fs)).source;
}
/** Return the proof of actual retained bytes, not a re-encoding of the loaded document. */
async function readInitialReceipt(fs: ProjectWorkspaceFS) {
  const r = await readReceipt<InitialReceipt>(fs, receiptPath(fs), metadataLimits);
  if (!r) return null;
  const bound = r.version === 'validation-initial-2' && originRecipeKnown(r.originRecipe);
  if ((!bound && r.version !== 'validation-initial-1') || Object.keys(r).sort().join(',') !== (bound ? 'byteLength,digest,originRecipe,proof,version' : 'byteLength,digest,proof,version') ||
    !Number.isSafeInteger(r.byteLength) || r.byteLength <= 0 || r.byteLength > metadataLimits.maxTotalBytes ||
    typeof r.digest !== 'string') return fileError('作成途中の初期記録を確認できません。');
  return r;
}
export async function validationInitialOrigin(fs: ProjectWorkspaceFS) {
  const origin = await readInitialOrigin(fs); if (origin) return origin.originRecipe;
  const r = await readInitialReceipt(fs); return r?.version === 'validation-initial-2' ? r.originRecipe : undefined;
}
export async function readValidationInitialRecord(fs: ProjectWorkspaceFS) {
  const r = await readInitialReceipt(fs), file = await fs.readStream(initialPath(fs));
  if (!r || !file || file.size !== r.byteLength) return fileError('作成途中の初期記録を確認できません。');
  const bytes = await readValidationBody(file, metadataLimits.maxTotalBytes);
  if (await digest(bytes) !== r.digest) return fileError('作成途中の記録が一致しません。');
  const source = ProjectMetadataSource.fromFullSource(bytes, r.proof, metadataLimits);
  const origin = await readInitialOrigin(fs);
  if ((r.version === 'validation-initial-2' || origin) && (!origin || r.version !== 'validation-initial-2' ||
    json(origin) !== json({ version: 'validation-origin-1', originRecipe: r.originRecipe, proof: r.proof, byteLength: r.byteLength, digest: r.digest })))
    return fileError('作成途中の変換種別と初期記録が一致しません。');
  if (source.originalChanges().length !== 2) return fileError('初期記録の履歴を確認できません。');
  return { source, receipt: r };
}
export async function writeValidationInitial(fs: ProjectWorkspaceFS, source: ProjectMetadataSource, originRecipe?: InitialOriginRecipe): Promise<void> {
  const bytes = source.encodeFullSource();
  if (originRecipe) await writeReceipt(fs, originPath(fs), { version: 'validation-origin-1', originRecipe, proof: source.proof, byteLength: bytes.length, digest: await digest(bytes) }, metadataLimits);
  // Manifest first binds the exact intended source; partial bytes stay repair state.
  await writeReceipt(fs, receiptPath(fs), { version: originRecipe ? 'validation-initial-2' : 'validation-initial-1',
    ...(originRecipe ? { originRecipe } : {}), proof: source.proof, byteLength: bytes.length, digest: await digest(bytes) }, metadataLimits);
  const previous = await fs.readBytes(initialPath(fs));
  if (previous && !equalBytes(previous, bytes)) return fileError('作成途中の記録が一致しません。上書きはしていません。');
  if (!previous) await fs.writeBytes(initialPath(fs), bytes);
  const saved = await readValidationInitial(fs);
  if (saved.token !== source.token || saved.originalChanges().some((b, i) => !equalBytes(b, source.originalChanges()[i]!)))
    return fileError('初期記録の保存を確認できません。');
}
export function validationProjectService(fs: ProjectWorkspaceFS, storage: MetadataStorageFactory, store: OriginBlobStore,
  limits: ProjectFilePolicyInput, decode?: PngDecoder, checkContentRead?: () => Promise<void>, jpeg?: JpegDecoder, photo?: PhotoDecoder) {
  const content = new ValidationContent(fs, store, limits, decode, checkContentRead, jpeg, photo);
  return { content, session: new MetadataProjectSession(fs, storage, metadataLimits, allow => content.verifier(allow), content, validationModelFacts(content)) };
}
/** Capture once; repeated execution uses identical source/IDs/bytes after a failed attempt. */
export function prepareValidationCreation(input: PreparedValidationProject<ValidationBody>, semanticProfile: 'map1' | 'map2' = 'map1') {
  if (semanticProfile === 'map2' && (input.records.schema.major !== 2 || input.records.schema.minor !== 0 && input.records.schema.minor !== 1)) return fileError('作成するプロジェクトの版を確認してください。');
  const schema = semanticProfile === 'map2' ? { ...input.records.schema, minor: 1 } : input.records.schema;
  const source = ProjectMetadataSource.bootstrap(schema, input.records.identity, metadataLimits, { semanticProfile }).initialize({ ...input.records, schema });
  const blobs: ValidationBody[] = input.blobs.map(b => b.file ? {ref:{...b.ref},file:captureGsBlob(b.file)} : {ref:{...b.ref},bytes:b.bytes.slice()});
  return { source, async persist(fs: ProjectWorkspaceFS, store: OriginBlobStore, session: MetadataProjectSession) {
    const before = await session.read();
    if (before.state !== 'empty') return fileError('作成先が空ではありません。保存済みProjectは変更していません。');
    for (const b of blobs) await store.put(b.file ? gsBlobStream(b.file) : new Blob([b.bytes.slice().buffer]).stream(), b.ref.mediaType, b.ref);
    await underWriteLease(fs, () => writeValidationInitial(fs, source));
    return session.createFromSource(source);
  } };
}
/** A cold incomplete creation never regenerates its bootstrap or silently creates new content. */
export async function resumeValidationCreation(fs: ProjectWorkspaceFS, session: MetadataProjectSession, expectedProjectId?: string) {
  const state = await session.read();
  if (state.state === 'ready') return state;
  if (state.state !== 'pending' && state.state !== 'empty') return fileError('未完了の保存を確認してください。');
  if (await validationInitialOrigin(fs)) return fileError('変換記録と元ファイルから変換を再開してください。');
  const source = await readValidationInitial(fs);
  if (expectedProjectId && source.proof.identity.projectId !== expectedProjectId)
    return fileError('保存領域と初期プロジェクトが一致しません。');
  return state.state === 'pending' ? session.recoverInitialization(source) : session.createFromSource(source);
}
