import type { ProjectDisplay } from './displayTypes';
import type { MetadataSessionRead } from '../projectMetadata/session';
import type { MetadataEdit } from '../projectMetadata/commands';
import type { MetadataLimits } from '../projectMetadata/format';
import type { SceneAuthoringCommand,CaptionDeletionCommand,CaptionDeletionImpact,AssetDeletionCommand,AssetDeletionImpact,PinParentCommand } from '../scene/commands';
import type { MediaFileAddition } from './mediaDisplay';
import type { ModelPlacementCommand,ModelFileAddition,ModelFileReplacement } from './modelTypes';
import type { WorkingResult } from './acknowledgment';
export interface ProjectAuthority {
  readonly storage?: 'saved-development';
  readonly writeScope?: 'caption-text';
  readonly capabilities?: Readonly<{ pins: boolean; membership: boolean; color: boolean; views?: boolean; materials?: boolean; media?: boolean; placement?: boolean; transform?: boolean; preparedRevision?: boolean; sceneAuthoring?: boolean }>;
  readonly readOnly?: boolean;
  read(): ProjectDisplay;
  authorScene?(token: string, command: SceneAuthoringCommand): WorkingResult<ProjectDisplay>;
  reparentPin?(token: string, command: PinParentCommand): WorkingResult<ProjectDisplay>;
  captionDeletionImpact?(token: string, captionId: string): CaptionDeletionImpact;
  deleteCaption?(token: string, command: CaptionDeletionCommand): WorkingResult<ProjectDisplay>;
  assetDeletionImpact?(token: string, assetId: string): AssetDeletionImpact;
  deleteAsset?(token: string, command: AssetDeletionCommand): WorkingResult<ProjectDisplay>;
  addMediaFile?(token: string, command: MediaFileAddition): WorkingResult<ProjectDisplay>;
  prepareGsProxy?: ReturnType<typeof import('./gsProxyWorkflow').createGsProxyWorkflow>['prepare'];
  commitGsProxy?: ReturnType<typeof import('./gsProxyWorkflow').createGsProxyWorkflow>['commit'];
  cancelGsProxy?: ()=>void;
  addModelFile?(token: string, command: ModelFileAddition): WorkingResult<ProjectDisplay>;
  replaceModelFile?(token: string, command: ModelFileReplacement): WorkingResult<ProjectDisplay>;
  transformModel?(token: string, command: ModelPlacementCommand): WorkingResult<ProjectDisplay>;
  status?(): Readonly<{ kind: 'idle' | 'checking' | 'failed'; error?: string; retryable?: boolean }>;
  retry?(): WorkingResult<ProjectDisplay>;
}
export type LocalOpenMode = 'view' | 'edit';
export interface SavedWorkspaceMode {
  readonly current: LocalOpenMode;
  readonly busy: boolean;
  readonly detail: string;
  /** Host-owned pending input, not an editor draft or a repair bypass. */
  readonly recoveryAvailable?: boolean;
  change(target: LocalOpenMode, token: string | undefined, publish: (next: ProjectDisplay) => void): Promise<void>;
}


export interface SavedWorkspaceHost {
  readonly authority:ProjectAuthority;readonly limits:MetadataLimits;readonly mode?:SavedWorkspaceMode;
  read():MetadataSessionRead;refresh():Promise<MetadataSessionRead>;hasPending():boolean;
  resolve(token:string,command:MetadataEdit):Promise<ProjectDisplay>;dispose():Promise<void>;
}
