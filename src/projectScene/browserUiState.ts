import type { UiState } from '../ui/context';
import { editorName } from '../projectMetadata/editorAttribution';
import type { MetadataProof } from '../projectMetadata/source';
import { projectResumeReference, type ProjectResumeReference } from '../ui/resumeReference';

const key = 'lociview.validation-ui.last-project-1';
/** Separate advisory UI setting. No Project, filesystem, database, journal or CAS access. */
export function createValidationUiState(storage: () => Pick<Storage, 'getItem' | 'setItem'> = () => window.localStorage) {
  const ui: Pick<UiState, 'projectSceneResume' | 'localDisplayName' | 'projectEditorNames'> = { projectSceneResume: null, localDisplayName: '', projectEditorNames: {} };
  const checkedName = (value: string) => value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
  const localSettings = {
    read(): string { try { ui.localDisplayName = checkedName(storage().getItem('lociview.ui.display-name-1') ?? '') ?? ''; } catch { /* Keep current local preference. */ } return ui.localDisplayName ?? ''; },
    save(value: string): boolean { const checked = checkedName(value); if (checked === null) return false;
      try { storage().setItem('lociview.ui.display-name-1', checked); ui.localDisplayName = checked; return true; } catch { return false; } },
  };
  const scope = (proof: MetadataProof) => 'lociview.ui.editor-attribution-1:' + JSON.stringify([
    proof.identity.projectId, proof.identity.historyEpoch, proof.identity.lineageSeed, proof.envelope.lineageProof.rootChangeHash]);
  const preference = (value: unknown) => {
    const v = value as { enabled: boolean; name: string };
    if (!v || Object.keys(v).sort().join(',') !== 'enabled,name' || typeof v.enabled !== 'boolean' || typeof v.name !== 'string' ||
      v.name.length > 256 || /[\x00-\x1f\x7f]/.test(v.name)) throw Error('編集者名の設定を確認してください。');
    const name = v.name.trim(); if (v.enabled) editorName(name);
    return Object.freeze({ enabled: v.enabled, name });
  };
  const editorSettings = {
    read(proof: MetadataProof) {
      const scoped = scope(proof); let text: string | null;
      try { text = storage().getItem(scoped); }
      catch { return ui.projectEditorNames![scoped] ?? Object.freeze({ enabled: false, name: localSettings.read() }); }
      if (text === null) return Object.freeze({ enabled: false, name: localSettings.read() });
      if (text.length > 2048) throw Error('編集者名の設定を確認してください。');
      return ui.projectEditorNames![scoped] = preference(JSON.parse(text));
    },
    save(proof: MetadataProof, value: Readonly<{ enabled: boolean; name: string }>): boolean {
      try { const checked = preference(value), scoped = scope(proof); storage().setItem(scoped, JSON.stringify(checked));
        ui.projectEditorNames![scoped] = checked; return true; } catch { return false; }
    },
  };
  return { ui, localSettings, editorSettings, lastProject: {
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
