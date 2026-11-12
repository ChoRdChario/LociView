import type { ResumeReading } from './validationCatalog';

/** Transient text reader. It owns no Project or file commands. */
export function createCaptionTextReading(document: Document, reading: Omit<ResumeReading, 'token'> & { incomplete?: boolean }, context: 'resume' | 'restore' | 'first-restore' = 'resume') {
  const root = document.createElement('section'), header = document.createElement('header'), heading = document.createElement('h1');
  const identity = document.createElement('div'), status = document.createElement('p'), layout = document.createElement('div');
  const stage = document.createElement('div'), panel = document.createElement('aside'), panelHeading = document.createElement('h2');
  const index = document.createElement('div'), back = document.createElement('button');
  const label = document.createElement('label'), search = document.createElement('input');
  const list = document.createElement('ul'), detail = document.createElement('section');
  const title = document.createElement('h3'), body = document.createElement('p'), empty = document.createElement('p');
  root.className = 'lv-project-workspace lv-resume-reading'; root.setAttribute('aria-label', context !== 'resume' ? '復元中のキャプション' : '再開中のキャプション');
  identity.className = 'lv-project-identity'; heading.textContent = reading.title;
  status.className = 'lv-operation-status'; status.dataset.busy = 'true';
  status.setAttribute('role', 'status'); status.textContent = context === 'first-restore' ? '復元中です。最初のシーンの記録を読めます。編集・保存は完了後に使えます。' : context === 'restore' ? '復元しています。完了後に編集できます。' : '再開を確認しています。';
  identity.append(heading, status); header.append(identity);
  layout.className = 'lv-project-body'; layout.dataset.surface = 'panel';
  stage.className = 'lv-project-stage'; stage.setAttribute('aria-hidden', 'true');
  panelHeading.textContent = reading.sceneName ? `キャプション（${reading.sceneName}）` : 'キャプション';
  index.className = 'lv-resume-index';
  back.type = 'button'; back.className = 'lv-resume-back'; back.textContent = '一覧へ戻る';
  title.tabIndex = -1;
  label.textContent = '検索'; search.type = 'search'; search.placeholder = 'タイトル・本文'; label.append(search);
  list.setAttribute('aria-label', 'キャプション一覧'); detail.setAttribute('aria-label', 'キャプションの詳細');
  detail.className = 'lv-resume-detail'; detail.append(back, title, body); detail.hidden = true;
  empty.textContent = '一致する記録がありません。'; empty.hidden = true;
  if (reading.incomplete) { const note = document.createElement('p'); note.textContent = '一部の情報は復元後に確認してください。'; panel.append(note); }
  index.append(label, empty, list); panel.append(panelHeading, index, detail); layout.append(stage, panel); root.append(header, layout);
  let selected: string | null = null, composition: Promise<void> | undefined, finish: (() => void) | undefined;
  const mobile = () => document.defaultView?.matchMedia?.('(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-width: 950px) and (max-height: 480px)').matches;
  const rows = reading.records.map(record => {
    const row = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.textContent = record.title.trim() ? record.title : '無題'; button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      selected = record.id;
      for (const item of rows) item.button.setAttribute('aria-pressed', String(item.record.id === selected));
      title.textContent = button.textContent; body.textContent = record.body; detail.hidden = false;
      root.dataset.surface = 'detail';
      if (mobile()) title.focus?.({ preventScroll: true });
    });
    row.append(button); list.append(row);
    return { record, row, button, text: `${record.title}\n${record.body}`.toLowerCase() };
  });
  back.addEventListener('click', () => {
    root.dataset.surface = 'list';
    const row = rows.find(item => item.record.id === selected && !item.row.hidden);
    (row?.button ?? search).focus?.({ preventScroll: true });
  });
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    for (const item of rows) item.row.hidden = !item.text.includes(query);
    empty.hidden = rows.some(item => !item.row.hidden);
  };
  search.addEventListener('input', () => { if (!composition) filter(); });
  search.addEventListener('focus', () => { root.dataset.surface = 'list'; });
  search.addEventListener('compositionstart', () => { composition ??= new Promise(resolve => { finish = resolve; }); });
  search.addEventListener('compositionend', () => { filter(); finish?.(); composition = undefined; finish = undefined; });
  return { root, composition: () => composition, selection: () => ({ query: search.value, captionId: selected, focus: document.activeElement === search ? 'search' as const :
      root.contains(document.activeElement) ? mobile() && root.dataset.surface === 'list' ? 'row' as const : 'detail' as const : null,
    surface: root.dataset.surface === 'detail' ? 'detail' as const : 'list' as const }), setReady() { status.textContent = '復元が完了しました。入力を終えると編集画面に移ります。'; status.dataset.busy = 'false'; }, dispose() { finish?.(); root.remove(); } };
}

/** Ordinary saved/staged-source reading retains its actual token. */
export function createResumeReading(document: Document, reading: ResumeReading, context: 'resume' | 'restore' = 'resume') {
  const view = createCaptionTextReading(document, reading, context);
  return { ...view, selection: () => ({ token: reading.token, sceneId: reading.sceneId, ...view.selection() }) };
}
