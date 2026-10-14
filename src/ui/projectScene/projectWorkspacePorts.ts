import type { MetadataEdit } from '../../projectMetadata/commands';
import type { ProjectProviderRead } from '../../scene/projectProvider';
import type { Anchor } from '../../scene/types';
import type { JsonObject } from '../../domain/values';

export type WorkspaceProvider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type Point3 = readonly [number, number, number];
/** Ephemeral exact visible-surface identity. No persisted source provenance. */
export interface WorkspaceSurface {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly assetFrameId: string;
  readonly bindingId: string; readonly revisionId: string; readonly representationId: string;
  readonly familyId: string; readonly compatibilityId: string;
}
export interface WorkspacePinProposal { readonly target: WorkspaceSurface; readonly position: Point3; readonly captionId: string | null }
export interface WorkspaceViewportState {
  readonly token: string; readonly sceneId: string; readonly selectedId: string | null;
  readonly pin: WorkspacePinProposal | null; readonly choosing: boolean; readonly readOnly: boolean;
  readonly pinColors: readonly string[] | null;
  readonly available: boolean;
}
export interface WorkspaceViewport {
  update(state: WorkspaceViewportState): void;
  pick(xCss: number, yCss: number, assetId?: string): { target: WorkspaceSurface; position: Point3 } | null;
  read(): { token: string; pickToken: string; ready: boolean; dragging: boolean; issue: string | null; notice: string | null;
    pins: readonly { id: string; x: number; y: number; visible: boolean }[] };
  target(assetId: string): WorkspaceSurface | null;
  camera(action: 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'): void;
  retry(): void;
  dispose(): void;
}
export interface WorkspaceFileInteraction {
  readonly interactionPending: boolean | string | null;
  readonly acknowledgment: { readonly state: 'idle' | 'checking' | 'failed' };
  refreshHistory(): void;
}
export interface ProjectWorkspacePorts {
  read(): WorkspaceProvider;
  readonly readOnly: boolean;
  status(): { kind: 'idle' | 'checking' | 'failed'; error?: string; retryable?: boolean };
  dispatch(token: string, command: MetadataEdit): Promise<unknown>;
  retry(): Promise<unknown>;
  addMedia(token: string, input: { sceneId: string; captionId: string; attachmentId: string; eventId: string; orderKey: string;
    file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } }): Promise<unknown>;
  image(record: JsonObject): Promise<Blob>;
  createViewport(canvas: HTMLCanvasElement, changed: () => void,
    propose: (target: WorkspaceSurface, position: Point3) => boolean): WorkspaceViewport;
  changed(): void;
  otherPending(): boolean;
}
export const surfaceAnchor = (proposal: WorkspacePinProposal): Anchor & { hitEvidence: { method: 'manual' } } => ({ kind: 'asset',
  assetId: proposal.target.assetId, assetFrameId: proposal.target.assetFrameId, positionAsset: proposal.position,
  authoredAnchorCompatibilityId: proposal.target.compatibilityId, authoredAssetRevisionId: proposal.target.revisionId,
  hitEvidence: { method: 'manual' } });
