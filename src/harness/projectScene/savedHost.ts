import type { openMetadataHost } from './metadataHost';

/** Existing saved editor lifecycle, without synthetic receive/demo operations or body ownership. */
export type SavedWorkspaceHost = Pick<Awaited<ReturnType<typeof openMetadataHost>>,
  'authority' | 'read' | 'refresh' | 'hasPending' | 'resolve' | 'dispose' | 'limits'>;
export interface SavedWorkspaceTools { root: HTMLElement; render(): void; hasChanges(): boolean; dispose(): void }
