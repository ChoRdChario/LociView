import {afterEach,expect,it,vi} from 'vitest';
import * as A from '@automerge/automerge';
import {glb,TestFS,lockManager,storageFactory,acknowledge} from './helpers/projectFileFixtures';
import {fixturePngDecoder} from './helpers/portableHeicFixtures';
import {OriginBlobStore} from '../src/projectMetadata/blobStore';
import {ProjectMutationCoordinator} from '../src/platform/projectLock';
import type {ProjectWorkspaceFS} from '../src/platform/fs';
import {newId} from '../src/projectMetadata/persistence';
import {validationMetadataLimits as metadata,type FileValidationLimits} from '../src/projectFiles/validation';
import {prepareValidationProject} from '../src/projectFiles/initialProject';
import {prepareValidationCreation,validationProjectService} from '../src/projectFiles/creation';
import {fixtureMedia,captionAttachments} from '../src/harness/projectScene/mediaHistory';
import {WorkingAcknowledgment} from '../src/harness/projectScene/acknowledgment';
import {openValidationHost,validationArea} from '../src/harness/projectScene/validationHost';
import {createValidationWorkspace,type ValidationWorkspacePorts} from '../src/harness/projectScene/validationWorkspace';
import {RecordedDocument,record,type RecordedNode} from './ui/domRecorder';
import {resolveScene} from '../src/scene/resolve';
import type {JsonObject} from '../src/domain/values';
import {ProjectMetadataSource} from '../src/projectMetadata/source';
import {WorkspaceReceiver} from '../src/projectFiles/receiveWorkspace';
import {WorkspaceSourceCapture} from '../src/projectPackage/workspaceSource';
import {writeWorkspaceArchive} from '../src/projectPackage/workspaceArchive';
import {WorkspaceBaseStore} from '../src/projectPackage/workspaceBases';
import {VerifiedContributionBase,ContributionSourceCapture} from '../src/projectPackage/contributionSource';
import {writeContributionArchive} from '../src/projectPackage/contributionArchive';
import type {JpegDecoder} from '../src/projectFiles/jpeg';
import type {PhotoDecoder} from '../src/projectFiles/photo';
import type {MediaDecoders} from '../src/projectFiles/media';

const budget: FileValidationLimits = { maxFileBytes: 1_000_000, maxJsonBytes: 100_000, maxItems: 10_000, maxValues: 100_000, maxPixels: 10_000 };
const png = Uint8Array.from(atob(fixtureMedia[0]!.base64), c => c.charCodeAt(0));
const decode = vi.fn(async (bytes: Uint8Array) => ({...await fixturePngDecoder(bytes),close:vi.fn()}));
const disposals:(()=>void|Promise<void>)[]=[];
function owned<T extends {dispose():void|Promise<void>}>(resource:T):T {disposals.push(()=>resource.dispose());return resource;}
afterEach(async()=>{const errors:unknown[]=[];try{while(disposals.length)try{await disposals.pop()!();}catch(error){errors.push(error);}}finally{vi.restoreAllMocks();}if(errors.length)throw new AggregateError(errors,'fixture disposal');});
// Opt-in diagnostics only; no runtime clock, scheduling or assertion changes.
function phaseClock(){const start=performance.now(),cpu=process.cpuUsage();return(stage:string)=>{if(process.env.LOCIVIEW_TEST_PHASES==='1')console.info('[caption-recovery-phase]',JSON.stringify({stage,elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),memory:process.memoryUsage()}));};}

  function firstWorkspaceRecipient(jpeg?: JpegDecoder, photo?: PhotoDecoder, mediaDecoders?:MediaDecoders) {
    const fs = new TestFS(), factory = storageFactory(), locks = lockManager();
    const store = new OriginBlobStore(fs, { maxBlobBytes: budget.maxFileBytes, maxChunkBytes: 1_000_000, maxChunks: 10000, metadata }, locks);
    const reopen = () => {
      const { session } = validationProjectService(fs, factory, store, budget, decode, undefined, jpeg, photo,mediaDecoders);
      return { session, receiver: new WorkspaceReceiver(fs, fs, session, metadata, locks) };
    };
    return { fs, factory, store, locks, reopen, ...reopen() };
  }
  async function contributionFile(session: ReturnType<typeof validationProjectService>['session'], fs: ProjectWorkspaceFS, store: OriginBlobStore) {
    const current = await session.read(), bases = new WorkspaceBaseStore(fs, metadata, current.source!.proof), snapshot = await bases.snapshot(), row = snapshot.records[0]!;
    const base = await VerifiedContributionBase.select(bases, { workspacePackageId: row.workspacePackageId,
      workspaceManifestSha256: row.workspaceManifestSha256, heads: row.declaredHeads }, store, metadata);
    const capture = await ContributionSourceCapture.prepare(session, current.source!.token, base, store, metadata), chunks: BlobPart[] = [];
    await writeContributionArchive(capture, store, new WritableStream({ write(b) { chunks.push(b.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    return { file: new Blob(chunks), capture, snapshot, current };
  }
  it('restores a received Caption parent, explicitly reattaches, keeps independent duplicates and returns their edits through real files (recorded DOM)', async () => {
    const phase=phaseClock();phase('begin');
    // Seed only this workflow's entities. The generic received-asset fixture also
    // builds an unrelated local edit/merge and a second model, which every later
    // file validation would revisit without exercising another Caption behavior.
    const origin = firstWorkspaceRecipient(), recipient = firstWorkspaceRecipient(), run = newId();
    const prepared = structuredClone(await prepareValidationProject({ run, title: '記録の復元と重複',
      models: [{ label: 'モデル', bytes: glb() }], media: [{ label: '添付画像', bytes: png }] }, budget, decode));
    const project = prepared.records.project as JsonObject, initialSceneId = project.defaultSceneId as string,
      initialCaptionId = `cap_${newId()}`, membershipId = `scm_${newId()}`, attachmentId = `att_${newId()}`;
    const active = () => ({ state: 'active', reason: 'initial', eventId: `evt_${newId()}` });
    const image = Object.values(prepared.records.mediaResourcesById!)[0] as JsonObject;
    (prepared.records.captionsById as Record<string, JsonObject>)[initialCaptionId] = { id: initialCaptionId,
      title: '最初の記録', body: '', colorSrgb: [1, 0, 0], lifecycle: active(),
      anchor: { kind: 'project', projectFrameId: (project.frame as JsonObject).id!, positionProject: [0, 0, 0] } };
    (prepared.records.sceneCaptionMembershipsById as Record<string, JsonObject>)[membershipId] = { id: membershipId,
      sceneId: initialSceneId, captionId: initialCaptionId, orderKey: 'A', lifecycle: active() };
    (prepared.records.captionAttachmentsById as Record<string, JsonObject>)[attachmentId] = { id: attachmentId,
      captionId: initialCaptionId, mediaResourceId: image.id!, altText: '', orderKey: 'A', lifecycle: active() };
    const initial = await prepareValidationCreation(prepared).persist(origin.fs, origin.store, origin.session);
    const capture = await WorkspaceSourceCapture.prepare(origin.session, initial.source!.token, origin.store, metadata), chunks: BlobPart[] = [];
    await writeWorkspaceArchive(capture, origin.store, new WritableStream({ write: bytes => { chunks.push(bytes.slice() as BlobPart); } }),
      { packageId: `pkg_${newId()}`, createdByVersion: 'validation' });
    const f = { ...recipient, run, f: { captionId: initialCaptionId, image, file: new Blob(chunks) },
      options: { run, base: recipient.fs, coordinator: ProjectMutationCoordinator.browser(recipient.locks), store: recipient.store,
        fileLimits: budget, decode, packageLocks: recipient.locks, openStorage: async () => ({ factory: recipient.factory, dispose: async () => {} }) } };
    phase('seed-archive');
    const host = owned(await openValidationHost({ ...f.options, workspaceFile: f.f.file })), peer = firstWorkspaceRecipient();
    const seed = await peer.receiver.importWorkspace(f.f.file), captionId = f.f.captionId, sceneId = Object.keys(host.authority.read().state.scenes)[0]!;
    const originalAttachment = captionAttachments(host.authority.read().mediaData, captionId).ready[0]!.id;
    const oldEdge = Object.keys(host.authority.read().state.captionMemberships)[0]!;
    const provider = () => { const p = host.read().provider; if (p?.kind !== 'scene-provider') throw Error('provider'); return p; };
    const children = () => [provider().details.mutable.sceneCaptionMembershipsById[oldEdge], provider().details.mutable.captionAttachmentsById[originalAttachment]];
    const ports: ValidationWorkspacePorts = { fileLimits: budget, decode, list: async () => [], selected: vi.fn(), open: async () => host,
      render: async () => ({ factory: () => { throw Error('Recorded DOM has no GPU'); }, dispose() {} }) };
    // The navigation root does not expose its mounted session. Observe its normal
    // subscription once, without adding a product port or altering acknowledgment.
    const acknowledgments = new Set<WorkingAcknowledgment>(), subscribe = WorkingAcknowledgment.prototype.subscribe;
    const captureAcknowledgment = vi.spyOn(WorkingAcknowledgment.prototype, 'subscribe').mockImplementation(function (this: WorkingAcknowledgment, listener) {
      acknowledgments.add(this); return subscribe.call(this, listener);
    });
    let u!: ReturnType<typeof createValidationWorkspace>, root!: RecordedNode;
    const all = (n: RecordedNode): RecordedNode[] => [n, ...n.children.flatMap(all)];
    const named = (label: string, parent = root) => all(parent).find(n => n.attributes.get('aria-label') === label)!;
    const button = (text: string, parent = root) => all(parent).find(n => n.tag === 'button' && n.textContent === text)!;
    const choose = (node: RecordedNode, value: string) => { node.value = value; node.fire(node.tag === 'select' ? 'change' : 'input'); };
    try {
      u = owned(createValidationWorkspace(new RecordedDocument().asDocument(), ports, f.run)); root = record(u.root);
      await vi.waitFor(() => expect(all(root).some(n => n.textContent.startsWith('検証用プロジェクト。'))).toBe(true));
    }
    finally { captureAcknowledgment.mockRestore(); }
    phase('host-peer-mount');
    // Startup recovery and the mounted editor each own an acknowledgment.
    expect(acknowledgments.size).toBeGreaterThan(0); const ack = [...acknowledgments];
    const clickWrite = async (control: RecordedNode) => {
      expect(control.disabled).toBe(false);
      // The harness translates strings before the real Session command boundary.
      const command = vi.spyOn(host, 'dispatch');
      try {
        await acknowledge(ack, () => {
          control.fire('click');
          expect(command).toHaveBeenCalledTimes(1);
          expect(command.mock.results[0]!.type).toBe('return');
        });
        await command.mock.results[0]!.value;
      } finally { command.mockRestore(); }
    };
    const fileInput = named('更新ファイルを選択'), receive = fileInput.parent!.parent!;
    const receiveFile = async (file: Blob) => {
      Object.assign(fileInput, { files: [file] }); fileInput.fire('change'); receive.fire('submit', { preventDefault() {} });
      await vi.waitFor(() => expect(button('更新を受け取る').disabled).toBe(false), { timeout: 10000 });
      Object.assign(fileInput, { files: [] }); button('選択を取り消す', receive).fire('click');
    };
    const returnFile = async () => host.workspaceOutput.download(await host.workspaceOutput.generateContribution(
      host.read().source!.token, host.workspaceOutput.bases[0]!.selection));
    const selectCaption = (id: string) => {
      const snapshot = host.authority.read(), scene = resolveScene(snapshot.state, snapshot.resources, sceneId);
      if (scene.kind === 'blocked') throw Error('scene');
      const index = scene.composition.captions.findIndex(c => c.captionId === id); expect(index).toBeGreaterThanOrEqual(0);
      all(root).filter(n => n.className === 'lv-caption-select')[index]!.fire('click');
    };
    selectCaption(captionId); button('プロジェクトから削除').fire('click');
    let commandAck!: WorkingAcknowledgment;
    await acknowledge(ack, () => {
      button('削除する', named('削除の確認')).fire('click');
      const checking = ack.filter(owner => owner.state === 'checking'); expect(checking).toHaveLength(1); commandAck = checking[0]!;
    });
    await vi.waitFor(() => expect(host.authority.read().resources.captions[captionId]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'deleted' } }));
    const tombstones = children(); expect(tombstones.every(c => {
      const life = c?.lifecycle; return life?.kind === 'value' && (life.value as JsonObject).state === 'deleted';
    })).toBe(true);
    await peer.session.editCaption(seed.source!.token, captionId, 'body', '削除と同時の追記');
    await receiveFile((await contributionFile(peer.session, peer.fs, peer.store)).file);
    expect(provider().issues.some(i => i.code === 'concurrent-delete-edit')).toBe(true);
    const lifecycle = named('キャプションの削除・復元'), lifeChoice = all(lifecycle).find(n => n.tag === 'select')!, restoreButton = button('選択を確定', lifecycle);
    expect(lifeChoice.value).toBe(''); expect(button('選択を確定', lifecycle).disabled).toBe(true);
    expect(all(lifecycle).some(n => n.textContent.includes('削除済み・復元しません'))).toBe(true);
    const unchangedFields = () => provider().inspection.candidates.fields.filter(v => v.path.join('/') !== `captionsById/${captionId}/lifecycle`).map(v => ({ path: v.path, candidates: v.candidates }));
    const beforeRestore = unchangedFields(); choose(lifeChoice, 'active');
    await acknowledge(ack, () => button('選択を確定', lifecycle).fire('click'));
    await vi.waitFor(() => expect(host.authority.read().resources.captions[captionId]!.lifecycle).toMatchObject({ kind: 'value', value: { state: 'active', reason: 'restore' } }));
    expect(unchangedFields()).toEqual(beforeRestore); expect(children()).toEqual(tombstones);
    expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(0);
    phase('parent-restored');
    const restored = await peer.receiver.receive((await peer.session.read()).source!.token, await returnFile());
    phase('restore-returned');
    // Both parties see the restored parent, but neither sees the other's new registration yet.
    const include = all(root).find(n => n.className === 'lv-caption-include')!;
    choose(named('キャプション', include), captionId); await clickWrite(button('このシーンに追加', include));
    await vi.waitFor(() => expect(button('このシーンから外す', include)?.disabled).toBe(false));
    selectCaption(captionId); const media = named('メディア');
    button(f.f.image.label as string, named('メディアを選択', media)).fire('click'); await clickWrite(button('選択したメディアを添付', media));
    await vi.waitFor(() => expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toHaveLength(1));
    const attachment = captionAttachments(host.authority.read().mediaData, captionId).ready[0]!; expect(attachment.id).not.toBe(originalAttachment);
    await peer.session.edit(restored.source!.token, { kind: 'include', sceneId, resourceKind: 'caption', resourceId: captionId,
      membershipId: `scm_${newId()}`, orderKey: 'B', eventId: `evt_${newId()}` });
    await receiveFile((await contributionFile(peer.session, peer.fs, peer.store)).file);
    phase('reattached-duplicate-received');
    const duplicates = named('重複した登録'), original = named('元として残す登録', duplicates), choice = named('重複の解消方法', duplicates), copyButton = button('登録の重複を解消', duplicates);
    expect(original.value).toBe(''); expect(choice.value).toBe(''); expect(button('登録の重複を解消', duplicates).disabled).toBe(true);
    choose(original, original.children[1]!.value); choose(choice, 'both');
    const sourceCaption = host.authority.read().resources.captions[captionId], token = host.read().source!.token;
    button('別のプロジェクトを開く').fire('click');
    await vi.waitFor(() => expect(all(root).some(n => n.textContent.includes('プロジェクトを切り替えて'))).toBe(true)); expect(u.selected).toBe(f.run);
    Object.assign(fileInput, { files: [f.f.file] }); fileInput.fire('change'); receive.fire('submit', { preventDefault() {} });
    expect(host.read().source!.token).toBe(token); expect(button('登録の重複を解消', duplicates).disabled).toBe(true);
    Object.assign(fileInput, { files: [] }); button('選択を取り消す', receive).fire('click');
    f.fs.reject = path => path.endsWith('/published.json');
    await acknowledge(commandAck, () => button('登録の重複を解消', duplicates).fire('click'), 'failed');
    expect(host.authority.status!().kind).toBe('failed');
    expect(Object.keys(host.authority.read().resources.captions)).toEqual([captionId]); expect(choice.value).toBe('both');
    const paths = (await f.fs.list(`${validationArea}/${f.run}/`)).filter(p => p.endsWith('.amchange')), bytes = await Promise.all(paths.map(p => f.fs.readBytes(p)));
    f.fs.reject = () => false;
    await acknowledge(commandAck, () => button('更新を再試行', named('更新の確認')).fire('click'));
    expect(duplicates.children).toHaveLength(0);
    expect(await Promise.all(paths.map(p => f.fs.readBytes(p)))).toEqual(bytes);
    phase('duplicate-retried');
    const copyId = Object.keys(host.authority.read().resources.captions).find(id => id !== captionId)!; expect(copyId).toBeTruthy();
    expect(Object.keys(host.authority.read().resources.captions)).toHaveLength(2);
    const copiedAttachment = captionAttachments(host.authority.read().mediaData, copyId).ready[0]!;
    expect(copiedAttachment.id).not.toBe(attachment.id); expect(copiedAttachment.mediaResourceId).toEqual(attachment.mediaResourceId);
    selectCaption(copyId); const detail = named('キャプションの詳細');
    expect(named('本文', detail).readOnly, 'independent copy body must be editable').toBe(false);
    choose(named('本文', detail), 'コピーだけの追記');
    expect(button('変更を適用', detail).disabled, 'independent copy edit must be actionable').toBe(false);
    await clickWrite(button('変更を適用', detail));
    await vi.waitFor(() => expect(host.authority.read().resources.captions[copyId]!.body, JSON.stringify({
      status: host.authority.status?.(), originalBody: host.authority.read().resources.captions[captionId]!.body,
      selected: all(root).filter(n => n.className === 'lv-caption-select').map(n => n.attributes.get('aria-current')),
    })).toEqual({ kind: 'value', value: 'コピーだけの追記' }));
    // Host publication precedes UI acknowledgment; do not click through its busy state.
    await vi.waitFor(() => expect(button('説明を編集', media).disabled).toBe(false));
    button('説明を編集', media).fire('click'); choose(named('メディアの説明', media), 'コピーだけの添付説明');
    await clickWrite(button('説明を適用', media));
    await vi.waitFor(() => expect(captionAttachments(host.authority.read().mediaData, copyId).ready[0]!.altText).toEqual({ kind: 'value', value: 'コピーだけの添付説明' }));
    expect(host.authority.read().resources.captions[captionId]).toEqual(sourceCaption);
    expect(captionAttachments(host.authority.read().mediaData, captionId).ready).toEqual([attachment]); expect(children()).toEqual(tombstones);
    phase('independent-edits');
    const final = host.read().source!, file = await returnFile(), received = await peer.receiver.receive((await peer.session.read()).source!.token, file);
    expect(received.source!.token).toBe(final.token);
    // Concurrent branches admit multiple topological orders; identity is exact bytes by change hash.
    const changeMap = (source: ProjectMetadataSource) => new Map(source.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    expect(changeMap(received.source!)).toEqual(changeMap(final));
    expect((await peer.receiver.receive(received.source!.token, file)).source!.originalChanges()).toEqual(received.source!.originalChanges());
    const resolve = vi.spyOn(host, 'resolve'); await u.dispose(); restoreButton.fire('click'); copyButton.fire('click');
    expect(resolve).not.toHaveBeenCalled(); resolve.mockRestore();
    phase('final-return-replay');
    const cold = owned(await openValidationHost(f.options));
    expect(cold.read().source!.token).toBe(final.token); expect(changeMap(cold.read().source!)).toEqual(changeMap(final));
    expect(cold.authority.read().resources.captions[copyId]!.body).toEqual({ kind: 'value', value: 'コピーだけの追記' });
    expect(captionAttachments(cold.authority.read().mediaData, copyId).ready[0]).toMatchObject({ id: copiedAttachment.id,
      altText: { kind: 'value', value: 'コピーだけの添付説明' } });
    const originals = new Map(final.originalChanges().map(b => [A.decodeChange(b).hash, b]));
    for (const b of seed.source!.originalChanges()) expect(originals.get(A.decodeChange(b).hash)).toEqual(b);
    phase('cold-verified');
    await cold.dispose();
  }, 30000);
