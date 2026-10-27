import type { Field,SceneState,SceneResources } from '../scene/types';
import type { ProjectSemanticProfile } from '../domain/projectProfile';
import type { DisplayModelVersion } from './modelTypes';
import type { ViewData } from './viewDisplay';
import type { MaterialData } from './materialDisplay';
import type { MediaData,MediaImage } from './mediaDisplay';
export {freezeDisplay} from './displaySupport';
export interface ProjectDisplay {
  /** Explicit identity for new saved workspaces; old fixtures retain their fixed identity. */
  readonly projectId?: string;
  readonly semanticProfile?: ProjectSemanticProfile;
  readonly validationFiles?: boolean;
  /** Explicit real saved catalog, including empty; omission is only for the old synthetic path. */
  readonly mediaChoices?: readonly MediaImage['record'][];
  readonly state: SceneState;
  readonly resources: SceneResources;
  readonly modelNames: Readonly<Record<string, string>>;
  readonly colors: Readonly<Record<string, Field<string>>>;
  /** UI-only distinction: standard display color is not a persisted color value. */
  readonly unsetCaptionColors?: readonly string[];
  /** Declared creation root; copied resources still have independent editable cells. */
  readonly captionTemplates: Readonly<Record<string, string>>;
  /** Immutable command-side owner/frame evidence, never a replacement for provider anchors. */
  readonly captionOwners: Readonly<Record<string, { readonly assetId: string; readonly assetFrameId: string }>>;
  readonly modelVersions?: readonly DisplayModelVersion[];
  readonly viewData?: ViewData;
  readonly materialData?: MaterialData;
  /** Exact known command candidates for explicit review only, never rendering authority. */
  readonly materialReviewData?: MaterialData;
  readonly mediaData?: MediaData;
}
