import type { ResumeReading } from './validationCatalog';

/** Transient text reader. It owns no Project or file commands. */
export function createResumeReading(document: Document, reading: ResumeReading) {
  const root = document.createElement('section'), heading = document.createElement('h2');
  const label = document.createElement('label'), search = document.createElement('input');
  const list = document.createElement('ul'), detail = document.createElement('section');
  const title = document.createElement('h3'), body = document.createElement('p'), empty = document.createElement('p');
  root.className = 'lv-resume-reading'; root.setAttribute('aria-label', '再開中のキャプション');
  heading.textContent = reading.title;
  label.textContent = '検索'; search.type = 'search'; search.placeholder = 'タイトル・本文'; label.append(search);
  list.setAttribute('aria-label', 'キャプション一覧'); detail.setAttribute('aria-label', 'キャプションの詳細');
  detail.append(title, body); detail.hidden = true;
  empty.textContent = '一致する記録がありません。'; empty.hidden = true;
  root.append(heading, label, empty, list, detail);
  let selected: string | null = null, composition: Promise<void> | undefined, finish: (() => void) | undefined;
  const rows = reading.records.map(record => {
    const row = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.textContent = record.title.trim() ? record.title : '無題'; button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      selected = record.id;
      for (const item of rows) item.button.setAttribute('aria-pressed', String(item.record.id === selected));
      title.textContent = button.textContent; body.textContent = record.body; detail.hidden = false;
    });
    row.append(button); list.append(row);
    return { record, row, button, text: `${record.title}\n${record.body}`.toLowerCase() };
  });
  const filter = () => {
    const query = search.value.trim().toLowerCase();
    for (const item of rows) item.row.hidden = !item.text.includes(query);
    empty.hidden = rows.some(item => !item.row.hidden);
  };
  search.addEventListener('input', () => { if (!composition) filter(); });
  search.addEventListener('compositionstart', () => { composition ??= new Promise(resolve => { finish = resolve; }); });
  search.addEventListener('compositionend', () => { filter(); finish?.(); composition = undefined; finish = undefined; });
  return { root, composition: () => composition, selection: () => ({ token: reading.token, sceneId: reading.sceneId,
    query: search.value, captionId: selected, focus: document.activeElement === search ? 'search' as const :
      root.contains(document.activeElement) ? 'detail' as const : null }), dispose() { finish?.(); root.remove(); } };
}
