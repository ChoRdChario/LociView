import type { openValidationHost } from './validationHost';
import type { SavedWorkspaceHost, LocalOpenMode, SavedWorkspaceMode } from './savedHost';
import type { SyntheticAuthority } from './historyProjection';
import type { SyntheticProject } from './fixture';

type Host = Awaited<ReturnType<typeof openValidationHost>>;
export type ValidationDisplayHost = Pick<Host, 'authority' | 'setDisplayPreparation'> & { content: Pick<Host['content'], 'model'> };

/** One stable editor/read facade; only the verified durable host/lease is replaced. */
export function createValidationModeHost(initial: Host, open: (mode: LocalOpenMode) => Promise<Host>, changed: (mode: LocalOpenMode) => void) {
  let current = initial, closed = false, switching = false, operation: Promise<void> | undefined;
  let prepare: ((next: SyntheticProject) => Promise<void>) | undefined, detach: (() => void) | undefined;
  const admit = () => { if (closed || switching) throw Error('画面の切替が完了するまでお待ちください。'); };
  const run = async <T>(action: () => T | Promise<T>) => { admit(); return action(); };
  const authority: SyntheticAuthority = {
    get storage() { return current.authority.storage; }, get writeScope() { return current.authority.writeScope; },
    get capabilities() { return current.authority.capabilities; },
    get readOnly() { return closed || switching || current.authority.readOnly; },
    read: () => current.authority.read(),
    status: () => switching ? { kind: 'checking' } : current.authority.status!(),
    write: (...a) => run(() => current.authority.write(...a)),
    authorScene: (...a) => run(() => current.authority.authorScene!(...a)),
    reparentPin: (...a) => run(() => current.authority.reparentPin!(...a)),
    captionDeletionImpact: (...a) => { admit(); return current.authority.captionDeletionImpact!(...a); },
    deleteCaption: (...a) => run(() => current.authority.deleteCaption!(...a)),
    assetDeletionImpact: (...a) => { admit(); return current.authority.assetDeletionImpact!(...a); },
    deleteAsset: (...a) => run(() => current.authority.deleteAsset!(...a)),
    addMediaFile: (...a) => run(() => current.authority.addMediaFile!(...a)),
    addModelFile: (...a) => run(() => current.authority.addModelFile!(...a)),
    transformModel: (...a) => run(() => current.authority.transformModel!(...a)),
    retry: () => run(() => current.authority.retry!()),
  };
  const mode: SavedWorkspaceMode = {
    get current() { return current.authority.readOnly ? 'view' : 'edit'; },
    get busy() { return switching; }, get detail() { return current.accessDetail ?? ''; },
    get recoveryAvailable() { return current.authority.readOnly && !current.workspaceFiles.error && current.read().state !== 'repair-required' &&
      !current.workspaceFiles.jobs.some(j => j.state === 'repair-required') &&
      current.workspaceFiles.jobs.some(j => ['incomplete', 'input-required', 'unbound-input', 'stale'].includes(j.state)); },
    async change(target, token, publish) {
      admit();
      if (token !== current.read().source?.token) throw Error('内容が更新されています。再開用データを確認してください。');
      if (current.authority.status?.().kind === 'checking' || !current.authority.readOnly && current.hasPending())
        throw Error('未完了の更新を復旧してから切り替えてください。');
      if (target === mode.current) return;
      switching = true;
      const previous = current;
      const work = (async () => {
        let candidate: Host | undefined, candidateDetach: (() => void) | undefined, committed = false;
        try {
          candidate = await open(target);
          if (closed) throw Error('画面を閉じました。');
          if (target === 'edit' && candidate.authority.readOnly) throw Error(candidate.accessDetail || '編集を開始できません。閲覧を続けられます。');
          if (candidate.read().state === 'repair-required') throw Error('再開用データの確認が必要です。元の表示を保持しています。');
          const next = candidate.display();
          if (!next && previous.display()) throw Error('再開用データを確認できません。元の表示を保持しています。');
          if (next) await prepare?.(next);
          if (closed) throw Error('画面を閉じました。');
          if (prepare) candidateDetach = candidate.setDisplayPreparation(prepare);
          current = candidate;
          try { if (next) publish(next); }
          catch (error) { current = previous; throw error; }
          committed = true; detach?.(); detach = candidateDetach;
          try { changed(mode.current); } finally { await previous.dispose(); }
        } finally {
          if (!committed) { candidateDetach?.(); await candidate?.dispose(); }
        }
      })();
      operation = work;
      try { await work; } finally { switching = false; if (operation === work) operation = undefined; }
    },
  };
  const host: SavedWorkspaceHost & ValidationDisplayHost & Pick<Host, 'workspaceFiles' | 'workspaceOutput'> = {
    authority, mode, limits: initial.limits, read: () => current.read(),
    hasPending: () => switching || current.hasPending(),
    refresh: () => run(() => current.refresh()), resolve: (...a) => run(() => current.resolve(...a)),
    workspaceFiles: {
      get jobs() { return current.workspaceFiles.jobs; }, get error() { return current.workspaceFiles.error; },
      get initialImport() { return current.workspaceFiles.initialImport; },
      refresh: () => run(() => current.workspaceFiles.refresh()),
      receive: (...a) => run(() => current.workspaceFiles.receive(...a)),
      importWorkspace: (...a) => run(() => current.workspaceFiles.importWorkspace(...a)),
      retry: (...a) => run(() => current.workspaceFiles.retry(...a)),
      reselectInput: (...a) => run(() => current.workspaceFiles.reselectInput(...a)),
      reselectImportedInput: (...a) => run(() => current.workspaceFiles.reselectImportedInput(...a)),
      abandonInput: (...a) => run(() => current.workspaceFiles.abandonInput(...a)),
      cancelStale: (...a) => run(() => current.workspaceFiles.cancelStale(...a)),
    },
    workspaceOutput: {
      get jobs() { return current.workspaceOutput.jobs; }, get error() { return current.workspaceOutput.error; },
      get bases() { return current.workspaceOutput.bases; },
      generate: (...a) => run(() => current.workspaceOutput.generate(...a)),
      generateBackup: (...a) => run(() => current.workspaceOutput.generateBackup(...a)),
      generateContribution: (...a) => run(() => current.workspaceOutput.generateContribution(...a)),
      retry: (...a) => run(() => current.workspaceOutput.retry(...a)),
      cancel: (...a) => run(() => current.workspaceOutput.cancel(...a)),
      verifyFile: (...a) => run(() => current.workspaceOutput.verifyFile(...a)),
      download: (...a) => run(() => current.workspaceOutput.download(...a)),
    },
    // The resident cache never retains a closed host's content service.
    content: { model: record => current.content.model(record) },
    setDisplayPreparation(callback) {
      admit(); if (prepare) throw Error('モデル表示の接続を確認してください。');
      prepare = callback; detach = current.setDisplayPreparation(callback);
      return () => { if (prepare === callback) { detach?.(); detach = undefined; prepare = undefined; } };
    },
    async dispose() { if (closed) return; closed = true;
      try { await operation; } catch { /* Failed candidate was released; retain original stored data. */ }
      detach?.(); prepare = undefined; detach = undefined; await current.dispose(); },
  };
  return host;
}
