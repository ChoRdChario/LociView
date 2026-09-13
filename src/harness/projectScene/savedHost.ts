import type { openMetadataHost } from './metadataHost';
import type { SyntheticProject } from './fixture';

export type LocalOpenMode = 'view' | 'edit';
export interface SavedWorkspaceMode {
  readonly current: LocalOpenMode;
  readonly busy: boolean;
  readonly detail: string;
  change(target: LocalOpenMode, token: string | undefined, publish: (next: SyntheticProject) => void): Promise<void>;
}

/** Existing saved editor lifecycle, without synthetic receive/demo operations or body ownership. */
export type SavedWorkspaceHost = Pick<Awaited<ReturnType<typeof openMetadataHost>>,
  'authority' | 'read' | 'refresh' | 'hasPending' | 'resolve' | 'dispose' | 'limits'> & { mode?: SavedWorkspaceMode };
export interface SavedWorkspaceTools { root: HTMLElement; render(): void; hasChanges(): boolean; dispose(): void }
