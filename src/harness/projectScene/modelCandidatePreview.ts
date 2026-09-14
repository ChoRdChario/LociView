import type { ProjectProviderRead } from '../../scene/projectProvider';
import { assetStatusCandidates } from '../../projectMetadata/assetStatus';
import { metadataImmutableReader } from '../../projectMetadata/records';
import type { MetadataLimits } from '../../projectMetadata/format';
import type { ReadonlyRenderModel } from './modelTypes';
import { projectBounds, type ReadonlyDisplay } from './viewportModel';
import type { ViewportFactory, SyntheticViewport } from './viewportHost';

export type ModelCandidateRenderer = (display: ReadonlyDisplay) => Promise<{ factory: ViewportFactory; dispose(): void }>;

/** An exact candidate read DTO, never an authoritative Asset projection or editable source. */
export function modelCandidateDisplay(provider: Extract<ProjectProviderRead, { kind: 'scene-provider' }>,
  sceneId: string, assetId: string, operationId: string, limits: MetadataLimits): ReadonlyDisplay {
  const candidate = assetStatusCandidates(provider, assetId, limits).find(c => c.operationId === operationId);
  if (!candidate || !Array.isArray(candidate.revision.representationIds) || candidate.revision.representationIds.length !== 1)
    throw Error('この候補の表示本体を確認できません。');
  const rep = metadataImmutableReader(provider, limits)('representationsById', candidate.revision.representationIds[0] as string);
  const model: ReadonlyRenderModel = { shape: 'render-glb', key: candidate.binding.id as string, assetId,
    assetToProject: candidate.binding.assetToProject as unknown as ReadonlyRenderModel['assetToProject'],
    representation: rep as ReadonlyRenderModel['representation'] };
  return { readOnly: true, token: provider.token, sceneId, projectFrameId: provider.resources.projectFrameId,
    models: [model], pins: [], selectedId: null, bounds: projectBounds(model.representation.logicalBoundsAsset, model.assetToProject) };
}

/** One disposable comparison surface. The caller owns stale-token checks and body-read authority. */
export function createModelCandidatePreview(document: Document, prepare: ModelCandidateRenderer, current: () => boolean) {
  const root = document.createElement('section'), heading = document.createElement('p'), note = document.createElement('p');
  const stage = document.createElement('section'), canvas = document.createElement('canvas'), status = document.createElement('p');
  const fit = document.createElement('button'), front = document.createElement('button'), retry = document.createElement('button'), close = document.createElement('button');
  root.hidden = true; root.setAttribute('aria-label', 'モデル候補のプレビュー'); stage.className = 'lv-development-viewport';
  canvas.tabIndex = 0; canvas.setAttribute('aria-label', 'モデル候補の3D表示'); status.setAttribute('role', 'status');
  note.textContent = '元の材質で表示します。シーンと記録は変更しません。';
  for (const [button, text] of [[fit, '全体表示'], [front, '正面'], [retry, '表示を再試行'], [close, 'プレビューを閉じる']] as const) {
    button.type = 'button'; button.textContent = text;
  }
  stage.append(canvas); root.append(heading, note, stage, status, fit, front, retry, close);
  let disposed = false, epoch = 0, loading = false, failure = '';
  let wanted: ReadonlyDisplay | undefined, runtime: SyntheticViewport | undefined, resident: Awaited<ReturnType<ModelCandidateRenderer>> | undefined;
  const release = () => { runtime?.dispose(); runtime = undefined; resident?.dispose(); resident = undefined; };
  const paint = () => {
    if (disposed) return;
    const observation = runtime?.read(), ready = !!observation?.ready && observation.display === wanted;
    canvas.style.visibility = current() && ready && !loading && !failure ? 'visible' : 'hidden';
    status.textContent = failure || (loading ? '候補を読み込んでいます。' : observation?.issue || '');
    fit.disabled = front.disabled = !ready; retry.hidden = loading || !failure && !!runtime && !observation?.issue;
  };
  const start = async (display: ReadonlyDisplay) => {
    const attempt = ++epoch; release(); loading = true; failure = ''; wanted = display; paint();
    let prepared: Awaited<ReturnType<ModelCandidateRenderer>> | undefined;
    try {
      prepared = await prepare(display);
      if (disposed || attempt !== epoch || !current()) return;
      resident = prepared; prepared = undefined;
      runtime = resident.factory(canvas, paint); // No edit, placement or pin-picking callbacks.
      runtime.update(display); runtime.setActive(true);
    } catch (error) {
      if (!disposed && attempt === epoch) { release(); failure = error instanceof Error ? error.message : '候補を表示できません。'; }
    } finally { prepared?.dispose(); if (!disposed && attempt === epoch) { loading = false; if (!current()) clear(); else paint(); } }
  };
  const clear = () => { ++epoch; release(); wanted = undefined; loading = false; failure = ''; root.hidden = true; };
  retry.addEventListener('click', () => { if (!disposed && !loading && wanted && current()) void start(wanted); });
  close.addEventListener('click', () => { if (!disposed) clear(); });
  const camera = (action: Parameters<SyntheticViewport['camera']>[0]) => {
    if (disposed || !current() || !runtime) return;
    try { runtime.camera(action); failure = ''; } catch (error) { failure = (error as Error).message; } paint();
  };
  fit.addEventListener('click', () => { if (!fit.disabled) camera({ kind: 'fit' }); });
  front.addEventListener('click', () => { if (!front.disabled) camera({ kind: 'axis', axis: '+z' }); });
  return { root, show(label: string, display: ReadonlyDisplay) {
    if (disposed || !current()) return; root.hidden = false; heading.textContent = `${label}のプレビュー（未適用）`; void start(display);
  }, render() { if (disposed) return; if (!current()) clear(); else paint(); },
  dispose() { if (disposed) return; clear(); disposed = true; root.remove(); } };
}
