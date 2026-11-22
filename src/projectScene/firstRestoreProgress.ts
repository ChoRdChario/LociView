import type { FirstRestoreStage } from './validationHost';

// Each number names a phase that has started. Durations vary with the backup.
const stages: Record<FirstRestoreStage, readonly [number | null, string]> = {
  persist: [1, '復元の準備を保存しています。'],
  'open-staging': [1, '復元先を準備しています。'],
  initialize: [2, '記録・写真・モデルを保存して照合しています。'],
  projection: [3, '保存した記録を確認しています。'],
  display: [3, '3Dの表示を準備しています。'],
  select: [4, '復元先を確定しています。'],
  adopt: [4, '編集画面を開いています。'],
  'restore-existing': [null, 'バックアップの内容に切り替えています。'],
  'inspect-recovery': [null, '中断した復元を確認しています。'],
};

export function createFirstRestoreProgress(document: Document, numbered: boolean, earlyReading: boolean) {
  const root = document.createElement('div'), phase = document.createElement('p'), counter = document.createElement('span');
  const message = document.createElement('span'), track = document.createElement('div'), reading = document.createElement('p');
  root.className = 'lv-restore-progress'; root.setAttribute('role', 'status'); root.setAttribute('aria-atomic', 'false');
  counter.className = 'lv-restore-counter'; counter.hidden = true;
  track.className = 'lv-restore-steps'; track.setAttribute('aria-hidden', 'true'); track.hidden = true;
  const segments = Array.from({ length: 4 }, () => document.createElement('span'));
  track.append(...segments); phase.append(counter, message); root.append(phase, track, reading);
  message.textContent = '復元を始めています。';
  const pending = earlyReading ? '先に読める記録は、確認でき次第ここに表示します。' : '復元先の記録は、準備が済むと読めます。';
  reading.textContent = pending;
  return {
    root,
    stage(stage: FirstRestoreStage) {
      const [step, text] = stages[stage];
      const showSteps = numbered && step !== null;
      if (message.textContent !== text) message.textContent = text;
      counter.hidden = track.hidden = !showSteps;
      if (showSteps) {
        const label = `工程 ${step} / ${segments.length}`;
        if (counter.textContent !== label) counter.textContent = label;
        segments.forEach((segment, index) => { segment.dataset.state = index + 1 < step ? 'done' : index + 1 === step ? 'current' : 'waiting'; });
      }
    },
    readable(count: number) {
      reading.textContent = count ? '記録を閲覧・検索できます。編集・保存は復元後に使えます。' : '先に表示できる記録はありません。編集・保存は復元後に使えます。';
    },
    waiting() { reading.textContent = pending; },
  };
}
