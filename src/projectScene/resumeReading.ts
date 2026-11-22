import type { ResumeReading } from './validationCatalog';
import { captionMatchExcerpt } from '../ui/projectScene/captionListState';

/** Transient text reader. It owns no Project or file commands. */
export function createCaptionTextReading(document: Document, reading: Omit<ResumeReading, 'token'> & { incomplete?: boolean }, context: 'resume' | 'restore' | 'first-restore' | 'first-import' | 'review' = 'resume',
  initial?: { query: string; captionId: string | null }) {
  const root = document.createElement('section'), header = document.createElement('header'), heading = document.createElement('h1');
  const identity = document.createElement('div'), status = document.createElement('p'), layout = document.createElement('div');
  const stage = document.createElement('div'), panel = document.createElement('aside'), panelHeading = document.createElement('h2');
  const index = document.createElement('div'), back = document.createElement('button');
  const label = document.createElement('label'), search = document.createElement('input');
  const list = document.createElement('ul'), detail = document.createElement('section');
  const title = document.createElement('h3'), body = document.createElement('p'), empty = document.createElement('p');
  const importing = context === 'first-import';
  root.className = 'lv-project-workspace lv-resume-reading' + (importing ? ' lv-import-reading' : '');
  root.setAttribute('aria-label', importing ? '取り込み中の記録' : context === 'review' ? '共有シーンの記録' : context !== 'resume' ? '復元中の記録' : '再開中の記録');
  identity.className = 'lv-project-identity'; heading.textContent = reading.title;
  status.className = 'lv-operation-status'; status.dataset.busy = 'true';
  status.setAttribute('role', 'status'); status.textContent = importing ? '取り込み中です。記録を閲覧・検索できます。編集・保存は完了後に使えます。' : context === 'first-restore' ? '復元中です。最初のシーンの記録を読めます。編集・保存は完了後に使えます。' : context === 'restore' ? '復元しています。完了後に編集できます。' : '保存データを確認中です。記録は閲覧・検索できます。';
  identity.append(heading, status); header.append(identity); header.hidden = context === 'review';
  layout.className = 'lv-project-body'; layout.dataset.surface = 'panel';
  stage.className = 'lv-project-stage'; stage.setAttribute('aria-hidden', 'true');
  panelHeading.textContent = reading.sceneName ? `記録（${reading.sceneName}）` : '記録';
  index.className = 'lv-resume-index';
  back.type = 'button'; back.className = 'lv-resume-back'; back.textContent = '一覧へ戻る';
  title.tabIndex = -1;
  label.textContent = '検索'; search.type = 'search'; search.placeholder = 'タイトル・本文'; label.append(search);
  list.setAttribute('aria-label', '記録一覧'); detail.setAttribute('aria-label', '記録の詳細');
  detail.className = 'lv-resume-detail'; detail.append(back, title, body); detail.hidden = true;
  empty.textContent = '一致する記録がありません。'; empty.hidden = true;
  if (reading.incomplete) { const note = document.createElement('p'); note.textContent = importing ? '一部の記録は取り込み後に確認できます。' : '一部の情報は復元後に確認してください。'; panel.append(note); }
  index.append(label, empty, list); panel.append(panelHeading, index, detail);
  if (!importing) layout.append(stage);
  layout.append(panel); root.append(header, layout);
  let selected: string | null = null, composition: Promise<void> | undefined, finish: (() => void) | undefined;
  const mobile = () => document.defaultView?.matchMedia?.('(pointer: coarse) and (max-width: 760px), (pointer: coarse) and (max-width: 950px) and (max-height: 480px)').matches;
  let picked = false;
  function showRecord(record: ResumeReading['records'][number]) {
    selected = record.id; title.textContent = record.title.trim() ? record.title : '無題'; body.textContent = record.body; detail.hidden = false;
  }
  function makeRow(record: ResumeReading['records'][number]) {
    const row = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.textContent = record.title.trim() ? record.title : '無題'; button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      picked = true; showRecord(record);
      for (const item of rows) item.button.setAttribute('aria-pressed', String(item.record.id === selected));
      root.dataset.surface = 'detail';
      if (mobile()) title.focus?.({ preventScroll: true });
    });
    row.append(button); list.append(row);
    let excerpt: HTMLSpanElement | undefined;
    function showMatch(query: string) {
      const text = captionMatchExcerpt(record.title, record.body, query);
      if (text && !excerpt) {
        excerpt = document.createElement('span'); excerpt.className = 'lv-reader-match';
        excerpt.id = `lv-reader-match-${crypto.randomUUID()}`;
        excerpt.setAttribute('aria-hidden', 'true'); button.append(excerpt);
      }
      if (excerpt) {
        excerpt.textContent = text; excerpt.hidden = !text;
        if (text) button.setAttribute('aria-describedby', excerpt.id);
        else button.removeAttribute('aria-describedby');
      }
    }
    return { record, row, button, showMatch, text: `${record.title}\n${record.body}`.toLowerCase() };
  }
  // A shared archive can contain more records than a bounded restore preview.
  const batch = 100, paged = context === 'review' && reading.records.length > batch;
  let rows = paged ? [] : reading.records.map(makeRow), shown = batch;
  const more = document.createElement('button');
  if (paged) { more.type = 'button'; more.textContent = 'さらに表示'; index.append(more); }
  back.addEventListener('click', () => {
    root.dataset.surface = 'list';
    const row = rows.find(item => item.record.id === selected && !item.row.hidden);
    (row?.button ?? search).focus?.({ preventScroll: true });
  });
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    if (paged) {
      const matches = reading.records.filter(record => !query || `${record.title}\n${record.body}`.toLowerCase().includes(query));
      list.replaceChildren(); rows = matches.slice(0, shown).map(makeRow);
      for (const item of rows) {
        item.button.setAttribute('aria-pressed', String(item.record.id === selected));
        item.showMatch(query);
      }
      more.hidden = shown >= matches.length; empty.hidden = !!matches.length; return;
    }
    for (const item of rows) {
      item.row.hidden = !item.text.includes(query);
      if (!item.row.hidden) item.showMatch(query);
    }
    empty.hidden = rows.some(item => !item.row.hidden);
  };
  more.addEventListener('click', () => { const at = shown; shown += batch; filter(); rows[at]?.button.focus?.(); });
  if (initial) {
    search.value = initial.query;
    const record = reading.records.find(item => item.id === initial.captionId);
    if (record) { showRecord(record); rows.find(item => item.record.id === selected)?.button.setAttribute('aria-pressed', 'true'); }
  }
  if (paged || initial) filter();
  search.addEventListener('input', () => { shown = batch; if (!composition) filter(); });
  search.addEventListener('focus', () => { root.dataset.surface = 'list'; });
  search.addEventListener('compositionstart', () => { composition ??= new Promise(resolve => { finish = resolve; }); });
  search.addEventListener('compositionend', () => { filter(); finish?.(); composition = undefined; finish = undefined; });
  let scrolled: number | undefined, observedTop = 0;
  list.addEventListener('scroll', () => {
    if (list.scrollTop !== observedTop) scrolled = observedTop = list.scrollTop;
  });
  function selection() {
    const active = document.activeElement, focused = rows.find(item => item.button === active);
    // The full list has taller rows. Transfer a record, not the preview's pixel offset.
    const bounds = (list.scrollTop > 0 || focused) && list.clientHeight > 0 ? list.getBoundingClientRect() : undefined;
    const firstVisibleId = bounds && rows.find(item =>
      !item.row.hidden && item.row.getBoundingClientRect().bottom > bounds.top + list.clientTop)?.record.id;
    const focusedBounds = bounds && focused?.row.getBoundingClientRect();
    // Wheel scrolling leaves keyboard focus on the old button. Resume navigation
    // in the visible list without selecting a different record or scrolling back.
    const focusedRowId = focusedBounds && bounds && (focusedBounds.bottom <= bounds.top || focusedBounds.top >= bounds.bottom)
      ? firstVisibleId : focused?.record.id;
    const focus = active === search ? 'search' as const : focused ? 'row' as const :
      root.contains(active) ? mobile() && root.dataset.surface === 'list' ? 'row' as const : 'detail' as const : null;
    return { query: search.value, captionId: selected, focus, focusedRowId, firstVisibleId,
      surface: root.dataset.surface === 'detail' ? 'detail' as const : 'list' as const };
  }
  return { root, restoreScroll(top: number) { list.scrollTop = top; observedTop = list.scrollTop; }, readingPosition: () => ({
    focusedRowId: rows.find(item => item.button === document.activeElement)?.record.id, scrollTop: scrolled, picked
  }), composition: () => composition, selection,
    setProgress(message: string) { if (status.dataset.busy === 'true') status.textContent = `${message} 記録は閲覧・検索できます。編集・保存は完了後に使えます。`; },
    setReady() { status.textContent = importing ? '取り込みが完了しました。入力を終えると編集画面に移ります。' : '復元が完了しました。入力を終えると編集画面に移ります。'; status.dataset.busy = 'false'; }, dispose() { finish?.(); root.remove(); } };
}

/** Ordinary saved/staged-source reading retains its actual token. */
export function createResumeReading(document: Document, reading: ResumeReading, context: 'resume' | 'restore' = 'resume') {
  const view = createCaptionTextReading(document, reading, context);
  return { ...view, selection: () => ({ token: reading.token, sceneId: reading.sceneId, ...view.selection() }) };
}
