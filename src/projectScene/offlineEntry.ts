import './styles.css';
import { createValidationBrowserWorkspace, validationBrowserLimits } from './validationBrowser';
import { createProductWorkspace } from './productWorkspace';
import { projectFilePolicy } from '../projectFiles/validation';
import { createGsResidency } from '../viewer/gsDecodeQueue';
import { createTargetBudget, targetLayout } from '../viewer/targetBudget';
import { createSmoothComposite } from '../viewer/smoothComposite';
import { createDesktopOffline,initializeDesktopOffline } from '../platform/desktopOffline';
import { createOfflineControls, createOfflineSettings } from '../ui/projectScene/offlineControls';

/** Separate build graph: admitted converters, never the original app/viewer entrypoints. */
export async function bootOfflineDesktopApp(root: HTMLElement) {
  if (import.meta.env.MODE !== 'project-scene-offline') throw Error('専用のオフラインPC版で開いてください。');
  const offline = createDesktopOffline(import.meta.env.BASE_URL, __DESKTOP_OFFLINE_BUILD_ID__);
  document.documentElement.classList.add('lv-project-page');
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent='LociViewを開いています。';
  root.replaceChildren(status);void initializeDesktopOffline(offline.port,navigator.onLine);let workspaceAttached=false;
  window.addEventListener('pagehide', event => { if (!event.persisted) offline.dispose(); });
  try{
  const policy = projectFilePolicy({ nonGs: validationBrowserLimits,
    gs: { ...validationBrowserLimits, maxFileBytes: 512 * 1024 * 1024, maxItems: 500_000, maxValues: 44_500_000 }, projectBodyBytes: 512 * 1024 * 1024 });
  const workspace = await createValidationBrowserWorkspace(document, {
    offline: offline.port, progressivePresentation: true, filePolicy: policy, residency: createGsResidency(500_000, 44_500_000),
    smoothDisplay: { budget: createTargetBudget(), plan: targetLayout, create: createSmoothComposite },
    mountEditor: (host, factory, tools, candidate, navigation) => createProductWorkspace(document, host, factory, tools, candidate, { ...navigation, compactFiles: true }),
  }, new URL(location.href).searchParams.get('run') ?? undefined);
  root.replaceChildren(workspace.root);workspaceAttached=true;
  window.addEventListener('beforeunload', event => { if (workspace.hasChanges()) { event.preventDefault(); event.returnValue = ''; } });
  // bfcache restoration must not resume a retired Project authority.
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  await workspace.ready;
  }catch(error){
    status.textContent=error instanceof Error?error.message:'プロジェクトを準備できませんでした。';
    const retry=document.createElement('button');retry.textContent='画面を開き直す';retry.addEventListener('click',()=>location.reload());
    if(workspaceAttached){root.append(status,retry);}
    else{
      const fallback=createOfflineControls(document,offline.port),settings=createOfflineSettings(document,fallback.root),frame=document.createElement('section'),heading=document.createElement('h1');
      frame.className='lv-validation-host lv-startup-failure';heading.textContent='LociView';frame.append(settings.root,heading,status,retry);root.replaceChildren(frame);
      window.addEventListener('pagehide',event=>{if(!event.persisted){settings.dispose();fallback.dispose();}});
    }
  }
}
