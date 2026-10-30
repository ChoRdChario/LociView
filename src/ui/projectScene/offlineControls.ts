import type { DesktopOfflinePort } from '../../platform/desktopOfflinePorts';
import { contextHelp, mountContextHelp } from './contextHelp';

/** Owns the Settings envelope only; the app still owns the supplied control. */
export function createOfflineSettings(document: Document, content: HTMLElement) {
  const root=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');
  root.className='lv-home-settings';root.setAttribute('aria-label','ホームの設定');summary.textContent='設定';body.append(content);root.append(summary,body);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'&&root.open&&!event.isComposing&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();root.open=false;summary.focus();}});
  const dismiss=(event:Event)=>{if(root.open&&event.target&&!root.contains(event.target as Node))root.open=false;};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);
  return{root,body,dispose(){document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss);root.remove();}};
}

/** Local app preparation, independent of Project commands, drafts and saved status. */
export function createOfflineControls(document: Document, port: DesktopOfflinePort) {
  const root = document.createElement('section'); root.className = 'lv-offline-controls'; root.setAttribute('aria-label', 'オフライン利用');
  const stopHelp = mountContextHelp(document, root);
  const status = document.createElement('p'); status.className = 'lv-operation-status'; status.setAttribute('role', 'status');
  const prepare = document.createElement('button'); prepare.type = 'button';
  const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'アプリの更新・修復';
  const help = document.createElement('p'); help.textContent = 'アプリの準備はプロジェクトのバックアップではありません。ファイル保存で別に残してください。';
  const usageHelp = contextHelp(document, '通信できる間に準備すると、同じアドレス・ブラウザのプロファイルでオフライン起動できます。', [prepare]);
  const check = document.createElement('button'); check.type = 'button'; check.textContent = '準備状態を確認';
  const install = document.createElement('button'); install.type = 'button'; install.textContent = 'アプリをインストール';
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'オフライン準備を解除';
  const confirm = document.createElement('div'); confirm.hidden = true;
  const consequence = document.createElement('p'); consequence.textContent = '解除すると、すべての画面を閉じた後の起動には通信が必要です。同じアプリを開いてください。プロジェクトは残ります。';
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = '準備を解除';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '解除を取り消す';
  const body=document.createElement('div');
  confirm.append(consequence, accept, cancel);body.append(help, check, install, remove, confirm);details.append(summary,body);body.insertBefore(prepare,body.children[0]??null);root.append(status, details, usageHelp);
  details.addEventListener('keydown',event=>{if(event.key==='Escape'&&details.open&&!event.isComposing&&!event.defaultPrevented){event.preventDefault();event.stopPropagation();details.open=false;summary.focus();}});
  const dismiss=(event:Event)=>{if(details.open&&event.target&&!details.contains(event.target as Node))details.open=false;};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);
  let disposed = false, operating = false;
  const render = () => {
    if (disposed) return;
    const state = port.read(), pending = operating || state.phase === 'preparing' || state.phase === 'checking';
    status.textContent = state.message; status.dataset.busy = String(pending);status.hidden=!['error','blocked','update','reopen','removed'].includes(state.phase)&&!operating;
    prepare.textContent = state.phase==='error'?'再試行':'更新を確認';
    prepare.hidden = state.phase === 'blocked' || state.phase === 'update' || state.phase === 'reopen';
    prepare.disabled = check.disabled = remove.disabled = accept.disabled = pending;
    remove.hidden = !state.registered || !confirm.hidden; install.hidden = !port.installAvailable(); install.disabled = pending;
  };
  const run = async (action: () => Promise<void>) => { if (disposed || operating) return; operating = true; render(); try { await action(); } finally { operating = false; render(); } };
  prepare.addEventListener('click', () => { if (!prepare.disabled) void run(() => port.prepare()); });
  check.addEventListener('click', () => { if (!check.disabled) void run(() => port.recheck()); });
  install.addEventListener('click', () => { if (!install.disabled) void run(() => port.install()); });
  remove.addEventListener('click', () => { confirm.hidden = false;accept.focus();remove.hidden = true; });
  cancel.addEventListener('click', () => { remove.hidden=false;remove.focus();confirm.hidden = true;render(); });
  accept.addEventListener('click', () => { if (!accept.disabled) { confirm.hidden = true;details.open=false;summary.focus();void run(() => port.remove()); } });
  const stop = port.subscribe(render); render();
  return { root, dispose() { disposed = true;stop();stopHelp();document.removeEventListener('pointerdown',dismiss);document.removeEventListener('focusin',dismiss);root.remove(); } };
}
