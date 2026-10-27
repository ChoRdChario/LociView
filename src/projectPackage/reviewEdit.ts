import type { WorkspaceFS } from '../platform/fs';
import { object, same, string } from '../domain/projectGraphSupport';
import { fail, type MetadataLimits, type MetadataProof } from '../projectMetadata/format';
import { ProjectMetadataSource } from '../projectMetadata/source';
import { newId, technicalId } from '../projectMetadata/persistence';
import { CleanArchive, writeCleanArchive } from './cleanArchive';
import { cleanInputDescriptor, packageReference } from './cleanInputDescriptor';
import { type CleanReconstruction } from './cleanRecords';
import { inspectCleanSource } from './cleanSource';
import { packageSourceLimits } from './contributionEvidence';
import { PACKAGE_LIMITS as L } from './contract';
import { packageByteHash } from './manifest';
import { ReviewArchive } from './reviewArchive';
import { prepareReviewEdit } from './reviewSnapshot';

export interface ReviewEditArchiveLease { readonly file:Blob; release():Promise<void> }
export interface ReviewEditArchivePort { write(produce:(destination:WritableStream<Uint8Array>,signal?:AbortSignal)=>Promise<unknown>):Promise<ReviewEditArchiveLease> }
/** Owned temporary output only; not a Project, publication or recovery authority. */
export function createReviewEditScratch(fs:WorkspaceFS):ReviewEditArchivePort & {cancel():void;dispose():Promise<void>} {
  const owned=new Set<string>(),pending=new Set<Promise<unknown>>(),active=new Set<()=>void>();let closed=false;
  const cancel=()=>{for(const stop of active)stop();};
  const remove=async(path:string)=>{await fs.remove(path);owned.delete(path);};
  return {write(produce){
    const work=(async()=>{
      if(closed)throw Error('画面を閉じました。');
      const path=`v2/transient-review-copy/${newId()}.zip`;let controller!:TransformStreamDefaultController<Uint8Array>;
      const abort=new AbortController(),stop=()=>{const reason=new DOMException('編集コピーの作成を取り消しました。','AbortError');abort.abort(reason);controller.error(reason);};
      const channel=new TransformStream<Uint8Array,Uint8Array>({start(value){controller=value;}});owned.add(path);active.add(stop);
      const stored=fs.writeStream(path,channel.readable),generated=Promise.resolve().then(()=>produce(channel.writable,abort.signal));void stored.catch(()=>{});void generated.catch(()=>{});
      try {
        await Promise.all([generated,stored]);
        if(closed)throw Error('画面を閉じました。');
        const saved=await fs.readStream(path);if(!saved?.blob)throw Error('編集コピーの一時ファイルを開けません。');
        const file=await saved.blob();if(file.size!==saved.size)throw Error('編集コピーの大きさが一致しません。');
        return {file,release:()=>remove(path)};
      }catch(error){abort.abort(error);controller.error(error);await Promise.allSettled([generated,stored]);
        try{await remove(path);}catch(cleanup){throw new AggregateError([error,cleanup],'編集コピーの作成と一時ファイルの解放に失敗しました。');}throw error;
      }finally{active.delete(stop);}
    })();pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});return work;
  },cancel,async dispose(){closed=true;cancel();await Promise.allSettled([...pending]);for(const path of [...owned])await remove(path);}};
}

/** Pure explicit preparation. IDs, original bytes, metadata actor/root and private ZIP are frozen once. */
export class PreparedReviewEdit {
  private constructor(readonly id: string, readonly childId: string, readonly original: Blob,
    readonly review: ReviewArchive, readonly reconstruction: CleanReconstruction, readonly copy: Blob,
    readonly clean: CleanArchive, private scratch?:ReviewEditArchiveLease) {}
  get scratchByteLength(){return this.scratch?.file.size ?? 0;}
  async releaseScratch(){if(this.scratch){await this.scratch.release();this.scratch=undefined;}}
  get run() { return technicalId(string(this.clean.source.proof.identity.projectId).slice(4)); }
  descriptor() {
    const bytes = this.clean.source.encodeFullSource(), child = cleanInputDescriptor(this.childId, this.clean);
    const original = { sha256: this.review.archive.sha256, byteLength: this.original.size }, snapshot = packageReference(this.review.review.snapshot),
      recipe = packageReference(this.reconstruction), metadata = { sha256: packageByteHash(bytes), byteLength: bytes.length },
      copy = { sha256: this.clean.archive.sha256, byteLength: this.copy.size };
    return { schema: 'lociview-review-edit-1', jobId: this.id, childId: this.childId,
      original, snapshot, recipe, metadata, copy, destination: this.clean.source.proof, childInput: packageReference(child),
      roots: { blobs: child.roots.blobs, evidence: [...child.roots.evidence, original, snapshot, recipe, metadata, copy]
        .filter((e, i, all) => all.findIndex(r => r.sha256 === e.sha256) === i).sort((a, b) => a.sha256 < b.sha256 ? -1 : 1) } };
  }
  static async prepare(file: Blob, limits: MetadataLimits, archivePort?:ReviewEditArchivePort) {
    return this.prepareCaptured(await ReviewArchive.inspect(file.slice(), limits), limits, archivePort);
  }
  static async fromInspectedReview(review: ReviewArchive, limits: MetadataLimits, archivePort?:ReviewEditArchivePort) {
    return this.prepareCaptured(await review.reopen(limits), limits, archivePort);
  }
  private static async prepareCaptured(review: ReviewArchive, limits: MetadataLimits, archivePort?:ReviewEditArchivePort) {
    const original = review.archive.sourceSnapshot();
    const { records, reconstruction, semanticProfile } = await prepareReviewEdit(review.review, limits);
    const source = ProjectMetadataSource.bootstrap(object(records.schema), object(records.identity), packageSourceLimits(limits), { time: 0, semanticProfile }).initialize(records, { time: 0 });
    const description = await inspectCleanSource(source, limits), bytes = source.encodeFullSource();
    if(!archivePort&&original.size>64*1024*1024)fail('review-edit-native-output-required');
    const produce=(destination:WritableStream<Uint8Array>,signal?:AbortSignal)=>writeCleanArchive({ metadataBytes: () => bytes.slice(), proof: source.proof, targetHeads: source.heads,
      metadata: { path: 'metadata.am', sha256: packageByteHash(bytes), byteLength: bytes.length },
      blobs: description.closure.entries, bodyRefs: description.closure.semanticRefs, summary: description.summary },
    { openReadOnly: async ref => {
      const digest = 'digest' in ref ? ref.digest : undefined;
      const entry = review.review.closure.entries.find(e => e.sha256 === digest);
      if (!entry) return fail('review-edit-body');
      const blob = review.archive.entryBlob(entry.path);
      return { size: blob.size, stream: () => blob.stream(), blob: async () => blob };
    } }, destination, { packageId: `pkg_${newId()}`, createdByVersion: 'isolated-review-edit-1',signal });
    let scratch:ReviewEditArchiveLease|undefined;
    try {
      let copy:Blob;
      if(archivePort){scratch=await archivePort.write(produce);copy=scratch.file;}
      else {const parts:BlobPart[]=[];let size=0;
        await produce(new WritableStream<Uint8Array>({write(chunk){if((size+=chunk.length)>64*1024*1024)fail('review-edit-native-output-required');parts.push(chunk.slice().buffer);}}));copy=new Blob(parts);}
      const clean=await CleanArchive.inspect(copy,limits);
    return new PreparedReviewEdit(newId(), newId(), original, review, reconstruction, copy, clean,scratch);
    }catch(error){try{await scratch?.release();}catch(cleanup){throw new AggregateError([error,cleanup],'編集コピーの検査と一時ファイルの解放に失敗しました。');}throw error;}
  }
  /** Cold verification reconstructs records, never an Automerge actor or initialization. */
  static async restore(input: { id: string; childId: string; original: Blob; recipe: CleanReconstruction;
    metadata: Uint8Array; destination: MetadataProof; copy: Blob }, limits: MetadataLimits) {
    technicalId(input.id); technicalId(input.childId);
    const review = await ReviewArchive.inspect(input.original, limits), clean = await CleanArchive.inspect(input.copy, limits);
    const source = ProjectMetadataSource.fromFullSource(input.metadata, input.destination, packageSourceLimits(limits));
    const prepared = await prepareReviewEdit(review.review, limits, input.recipe), description = await inspectCleanSource(source, limits);
    if (!same(prepared.records, description.records) || source.token !== clean.source.token ||
      packageByteHash(input.metadata) !== packageByteHash(clean.source.encodeFullSource())) fail('review-edit-reconstruction');
    return new PreparedReviewEdit(input.id, input.childId, input.original.slice(), review, prepared.reconstruction, input.copy.slice(), clean);
  }
}
