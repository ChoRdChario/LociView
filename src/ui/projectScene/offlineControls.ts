import type { DesktopOfflinePort } from '../../platform/desktopOfflinePorts';
import { contextHelp, mountContextHelp } from './contextHelp';

/** Local app preparation, independent of Project commands, drafts and saved status. */
export function createOfflineControls(document: Document, port: DesktopOfflinePort) {
  const root = document.createElement('section'); root.className = 'lv-offline-controls'; root.setAttribute('aria-label', 'オフライン利用');
  const stopHelp = mountContextHelp(document, root);
  const status = document.createElement('p'); status.className = 'lv-operation-status'; status.setAttribute('role', 'status');
  const prepare = document.createElement('button'); prepare.type = 'button';
  const details = document.createElement('details'), summary = document.createElement('summary'); summary.textContent = 'オフラインの設定';
  const help = document.createElement('p'); help.textContent = 'アプリの準備はプロジェクトのバックアップではありません。ファイル保存で別に残してください。';
  const usageHelp = contextHelp(document, '通信できる間にアプリを準備すると、同じアドレス・ブラウザのプロファイルでオフライン起動できます。対応外の旧ファイルは、通信できる従来版で開いてください。', [prepare]);
  const check = document.createElement('button'); check.type = 'button'; check.textContent = '準備状態を確認';
  const install = document.createElement('button'); install.type = 'button'; install.textContent = 'アプリをインストール';
  const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = 'オフライン準備を解除';
  const confirm = document.createElement('div'); confirm.hidden = true;
  const consequence = document.createElement('p'); consequence.textContent = '解除すると、すべての画面を閉じた後のオフライン起動ができなくなります。プロジェクトは残ります。従来版へ戻るには、同じアドレスで静的PC版を配信し、通信できる状態で開いてください。';
  const accept = document.createElement('button'); accept.type = 'button'; accept.textContent = '準備を解除';
  const cancel = document.createElement('button'); cancel.type = 'button'; cancel.textContent = '解除を取り消す';
  const body=document.createElement('div');
  confirm.append(consequence, accept, cancel);body.append(help, check, install, remove, confirm);details.append(summary,body);root.append(status, prepare, details, usageHelp);
  details.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;summary.focus();}});
  const dismiss=(event:Event)=>{if(details.open&&event.target&&!details.contains(event.target as Node))details.open=false;};
  document.addEventListener('pointerdown',dismiss);document.addEventListener('focusin',dismiss);
  let disposed = false, operating = false;
  const render = () => {
    if (disposed) return;
    const state = port.read(), pending = operating || state.phase === 'preparing' || state.phase === 'checking';
    status.textContent = state.phase === 'unprepared' ? 'オフライン未準備' : state.message; status.dataset.busy = String(pending);
    prepare.textContent = state.registered ? state.phase==='error'?'準備をやり直す':'アプリの更新を確認' : 'オフラインで使う準備';
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
