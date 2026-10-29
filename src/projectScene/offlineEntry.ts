import './styles.css';
import { createValidationBrowserWorkspace, validationBrowserLimits } from './validationBrowser';
import { createProductWorkspace } from './productWorkspace';
import { projectFilePolicy } from '../projectFiles/validation';
import { createGsResidency } from '../viewer/gsDecodeQueue';
import { createTargetBudget, targetLayout } from '../viewer/targetBudget';
import { createSmoothComposite } from '../viewer/smoothComposite';
import { createDesktopOffline } from '../platform/desktopOffline';
import { createOfflineControls } from '../ui/projectScene/offlineControls';

/** Separate build graph: admitted converters, never the original app/viewer entrypoints. */
export async function bootOfflineDesktopApp(root: HTMLElement) {
  if (import.meta.env.MODE !== 'project-scene-offline') throw Error('専用のオフラインPC版で開いてください。');
  const offline = createDesktopOffline(import.meta.env.BASE_URL, __DESKTOP_OFFLINE_BUILD_ID__);
  document.documentElement.classList.add('lv-project-page');
  const fallback=createOfflineControls(document,offline.port),status=document.createElement('p');status.setAttribute('role','status');status.textContent='プロジェクトを準備しています。';
  root.replaceChildren(fallback.root,status);void offline.port.recheck();
  window.addEventListener('pagehide', event => { if (!event.persisted) offline.dispose(); });
  try{
  const policy = projectFilePolicy({ nonGs: validationBrowserLimits,
    gs: { ...validationBrowserLimits, maxFileBytes: 512 * 1024 * 1024, maxItems: 500_000, maxValues: 44_500_000 }, projectBodyBytes: 512 * 1024 * 1024 });
  const workspace = await createValidationBrowserWorkspace(document, {
    offline: offline.port, progressivePresentation: true, filePolicy: policy, residency: createGsResidency(500_000, 44_500_000),
    introduction: new URL(location.href).searchParams.has('mode')?'LociViewは、3Dモデルに記録を付け、ファイルで作業を受け渡すアプリです。このPC版では、原本を新しいプロジェクトへ変換して開きます。元の形式のまま使う場合は、通信できる従来版を開いてください。':undefined,
    smoothDisplay: { budget: createTargetBudget(), plan: targetLayout, create: createSmoothComposite },
    mountEditor: (host, factory, tools, candidate, navigation) => createProductWorkspace(document, host, factory, tools, candidate, { ...navigation, compactFiles: true }),
  }, new URL(location.href).searchParams.get('run') ?? undefined);
  fallback.dispose();root.replaceChildren(workspace.root);
  window.addEventListener('beforeunload', event => { if (workspace.hasChanges()) { event.preventDefault(); event.returnValue = ''; } });
  // bfcache restoration must not resume a retired Project authority.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  await workspace.ready;
  }catch(error){status.textContent=error instanceof Error?error.message:'プロジェクトを準備できませんでした。';if(!status.isConnected)root.append(status);const retry=document.createElement('button');retry.textContent='画面を開き直す';retry.addEventListener('click',()=>location.reload());root.append(retry);}
}
