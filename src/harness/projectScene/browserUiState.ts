import type { UiState } from '../../ui/context';
import { projectResumeReference, type ProjectResumeReference } from '../../ui/resumeReference';

const key = 'lociview.validation-ui.last-project-1';
/** Separate advisory UI setting. No Project, filesystem, database, journal or CAS access. */
export function createValidationUiState(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage) {
  const ui: Pick<UiState, 'projectSceneResume'> = { projectSceneResume: null };
  return { ui, lastProject: {
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
