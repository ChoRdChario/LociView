import type { UiState } from '../ui/context';
import { projectResumeReference, type ProjectResumeReference } from '../ui/resumeReference';

const key = 'lociview.validation-ui.last-project-1';
/** Separate advisory UI setting. No Project, filesystem, database, journal or CAS access. */
export function createValidationUiState(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage) {
  const ui: Pick<UiState, 'projectSceneResume' | 'localDisplayName'> = { projectSceneResume: null, localDisplayName: '' };
  const checkedName = (value: string) => value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
  const localSettings = {
    read(): string { try { ui.localDisplayName = checkedName(storage().getItem('lociview.ui.display-name-1') ?? '') ?? ''; } catch { /* Keep current local preference. */ } return ui.localDisplayName ?? ''; },
    save(value: string): boolean { const checked = checkedName(value); if (checked === null) return false;
      try { storage().setItem('lociview.ui.display-name-1', checked); ui.localDisplayName = checked; return true; } catch { return false; } },
  };
  return { ui, localSettings, lastProject: {
    read(): ProjectResumeReference | null {
      try {
        const text = storage().getItem(key);
        // Only the exact closed writer shape is relevant; never parse a large UI setting.
        ui.projectSceneResume = text?.length === JSON.stringify({ run: '0'.repeat(32), mode: 'edit' }).length ? projectResumeReference(JSON.parse(text)) : null;
      } catch { ui.projectSceneResume = null; }
      return ui.projectSceneResume ? { ...ui.projectSceneResume } : null;
    },
    remember(reference: ProjectResumeReference): void {
      const checked = projectResumeReference(reference); if (!checked) return;
      ui.projectSceneResume = checked;
      try { storage().setItem(key, JSON.stringify(checked)); } catch { /* UI advice never changes Project acknowledgment. */ }
    },
  } };
}
