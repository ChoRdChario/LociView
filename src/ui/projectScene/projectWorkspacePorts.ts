import type { MetadataEdit } from '../../projectMetadata/commands';
import type { CaptionDeletionImpact } from '../../scene/commands';
import type { ProjectProviderRead } from '../../scene/projectProvider';
import type { Anchor } from '../../scene/types';
import type { JsonObject } from '../../domain/values';
import type { Field } from '../../scene/types';
import type { MaterialSource } from './materialState';
import type { ViewCameraIntent, ViewRuntime, ViewSource } from './viewState';
import type { ViewFieldVersions } from './viewAuthoringState';
import type { CaptionSnapshot } from '../../projectMetadata/captionAuthoring';
import type { CaptionUndoInput, CaptionUndoCapture, CaptionUndoReceipt, CaptionUndoTarget, CaptionUndoSnapshot } from '../../projectMetadata/captionUndo';

export type WorkspaceAuthoringIntent =
  | { kind: 'duplicateCaption'; sceneId: string; sourceId: string }
  | { kind: 'duplicateScene'; sourceId: string; name: string }
  | { kind: 'deleteSceneContents'; sceneId: string }
  | { kind: 'reorderScene'; sceneId: string; direction: 'up' | 'down' }
  | { kind: 'createTag'; label: string; colorSrgb: number[] }
  | { kind: 'editTag'; tagId: string; label: string; colorSrgb: number[] }
  | { kind: 'deleteTag'; tagId: string }
  | { kind: 'setCaptionTag'; captionId: string; tagId: string; included: boolean };

export type WorkspaceProvider = Extract<ProjectProviderRead, { kind: 'scene-provider' }>;
export type Point3 = readonly [number, number, number];
export interface WorkspaceRecoveryGroup {
  readonly key: string; readonly label: string; readonly ready: boolean;
  readonly note?: string; readonly details?: readonly string[];
  readonly choices: readonly { id: string; label: string; anchor?: Anchor; editorName?: string | null }[];
  readonly manual?: 'name' | 'title' | 'body';
  readonly copyReady?: boolean;
  readonly target: { kind: 'name'; sceneId: string } | { kind: 'startup' } |
    { kind: 'text'; captionId: string; field: 'title' | 'body' } |
    { kind: 'field'; captionId: string; field: 'anchor' | 'colorSrgb' } |
    { kind: 'attachmentField'; captionId: string; attachmentId: string; field: 'altText' | 'orderKey' } |
    { kind: 'attachmentLifecycle'; captionId: string; attachmentId: string; operationIds: readonly string[] } |
    { kind: 'lifecycle'; captionId: string; operationIds: readonly string[] } |
    { kind: 'captionLifecycleConfirm'; captionId: string; operationIds: readonly string[] } |
    { kind: 'membership'; sceneId: string; captionId: string; edgeIds: readonly string[] };
}
export interface WorkspaceFile { readonly name: string; readonly size: number; readonly blob?: Blob; arrayBuffer(): Promise<ArrayBuffer> }
export interface WorkspacePlacement { readonly translation: Point3; readonly rotationXYZW: readonly [number, number, number, number]; readonly uniformScale: number }
export interface WorkspaceModelTarget { readonly kind: 'model'; readonly token: string; readonly sceneId: string; readonly assetId: string; readonly bindingId: string }
export interface WorkspaceModelProposal { readonly target: WorkspaceModelTarget; readonly placement: WorkspacePlacement; readonly mode: 'translate' | 'rotate' | 'scale'; readonly pivotAsset?: Point3;
  readonly fitReference?: { assetId: string; bindingId: string } }
export interface WorkspaceModelDetails { readonly target: WorkspaceModelTarget; readonly placement: WorkspacePlacement;
  readonly boundsAsset?: { readonly min: Point3; readonly max: Point3 }; readonly importedPlacement?: WorkspacePlacement;
  readonly gsProxyTarget?: {readonly sceneId:string;readonly assetId:string;readonly expectedBindingId:string;readonly gsRepresentationId:string;readonly gsPayloadDigest:string;readonly gsFamilyId:string;readonly expectedProxyId:string|null}; readonly replacementAvailable?: boolean; readonly pointCloud?: boolean; readonly rotationDegrees: readonly [string, string, string]; readonly sceneCount: Field<number> }
export interface WorkspaceViewPayload { readonly camera: JsonObject; readonly background: { readonly kind: 'solid'; readonly colorSrgb: Point3 } }
export interface WorkspaceMaterialReview { readonly key: string; readonly token: string; readonly sceneId: string; readonly overrideId: string;
  readonly label: string; readonly appearance: readonly { operationId: string; label: string }[];
  readonly compositing: readonly { operationId: string; label: string }[]; readonly owners: readonly { id: string; label: string }[] }
/** Ephemeral exact visible-surface identity. No persisted source provenance. */
export interface WorkspaceSurface {
  readonly token: string; readonly sceneId: string; readonly assetId: string; readonly assetFrameId: string;
  readonly bindingId: string; readonly revisionId: string; readonly representationId: string;
  readonly familyId: string; readonly compatibilityId: string;
}
export interface WorkspacePinProposal { readonly target: WorkspaceSurface; readonly position: Point3; readonly captionId: string | null; readonly point?: { readonly pointIndex: number } }
export interface WorkspaceViewportState {
  readonly token: string; readonly sceneId: string; readonly selectedId: string | null;
  readonly pin: WorkspacePinProposal | null; readonly choosing: boolean; readonly readOnly: boolean;
  readonly pinColors: readonly string[] | null;
  readonly available: boolean;
  readonly hiddenAssetIds?: readonly string[]; readonly model?: WorkspaceModelProposal | null;
  readonly windowMoving?: boolean;
  readonly comparison?: { token: string; captionId: string; anchor: Anchor } | null;
}
export interface WorkspaceViewport {
  update(state: WorkspaceViewportState): void;
  pick(xCss: number, yCss: number, assetId?: string, directCreation?: boolean): { target: WorkspaceSurface; position: Point3; point?: { readonly pointIndex: number } } | null;
  setPointDiameter?(assetId: string, diameter: number): void;
  pointDiameter?(assetId: string): number;
  reservePointer(active: boolean): void;
  read(): { token: string; sceneId: string; pickToken: string; ready: boolean; dragging: boolean; issue: string | null; notice: string | null;readonly loading?:boolean;readonly retryAvailable?:boolean;
    pins: readonly { id: string; x: number; y: number; visible: boolean; scale?: number; color?: string; status?: 'normal' | 'needsReview'; notice?: string }[]; readonly assetIds?: readonly string[]; readonly view?: ViewRuntime };
  target(assetId: string): WorkspaceSurface | null;
  camera(action: 'fit' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'): void;
  retry(): void;
  capture(): WorkspaceViewPayload;
  recall(payload: WorkspaceViewPayload): void;
  viewCamera(intent: ViewCameraIntent): void;
  background(background: WorkspaceViewPayload['background'], verify: () => void): void;
  dispose(): void;
}
export interface WorkspaceFileInteraction {
  readonly interactionPending: boolean | string | null;
  readonly acknowledgment: { readonly state: 'idle' | 'checking' | 'failed' };
  refreshHistory(): void;
}
export interface ProjectWorkspacePorts {
  authoring?: {
    beginUndo(token: string, command: CaptionUndoInput): CaptionUndoCapture | null;
    finishUndo(token: string, capture: CaptionUndoCapture): CaptionUndoReceipt | null;
    undoSnapshot(token: string, target: CaptionUndoTarget): CaptionUndoSnapshot;
    prepare(token: string, intent: WorkspaceAuthoringIntent): MetadataEdit;
    snapshot(token: string, captionId: string): CaptionSnapshot;
    sceneOrderChoices(token: string, sceneId: string): readonly { operationId: string; orderKey: string }[];
  };
  read(): WorkspaceProvider;
  projectStatus(): { readonly title: string | null; readonly resumable: boolean; readonly backup: 'verified' | 'unconfirmed' | 'unavailable' };
  openProject?(): void;
  projectNavigationBlocked?(): boolean;
  resumedLastProject?(): boolean;
  storageEstimate?(): Promise<Readonly<{ usage?: number; quota?: number }>>;
  localSettings?: { read(): string; save(displayName: string): boolean };
  editorSettings?: { read(): Readonly<{ enabled: boolean; name: string }>; save(value: Readonly<{ enabled: boolean; name: string }>): boolean };
  captionEditors?(captionId: string): readonly { label: string; names: readonly (string | null)[] }[];
  readonly readOnly: boolean;
  presentation?(): { readonly busy: boolean; readonly reason: string } | null;
  status(): { kind: 'idle' | 'checking' | 'failed'; error?: string; retryable?: boolean };
  dispatch(token: string, command: MetadataEdit): Promise<unknown>;
  retry(): Promise<unknown>;
  addMedia(token: string, input: { sceneId: string; captionId: string; attachmentId: string; eventId: string; orderKey: string;
    file: { name: string; size: number; arrayBuffer(): Promise<ArrayBuffer> } }): Promise<unknown>;
  image(record: JsonObject): Promise<Blob>;
  imageScope(): string;
  mediaDescription(text: string): string;
  captionDeletion(token: string, captionId: string): CaptionDeletionImpact;
  pinPositionInParent(token: string, captionId: string, assetId: string): Point3 | null;
  recovery(): readonly WorkspaceRecoveryGroup[];
  prepareCaptionMembership(token: string, sceneId: string, captionId: string, observedIds: readonly string[], keepId: string, choice: 'one' | 'both'): MetadataEdit;
  modelDetails(sceneId: string, assetId: string): WorkspaceModelDetails | null;
  modelPlacement(translation: readonly string[], rotation: readonly string[], scale: string): WorkspacePlacement;
  modelAngles(rotation: WorkspacePlacement['rotationXYZW']): readonly [string, string, string];
  modelReview(sceneId: string): { statuses: readonly { assetId: string; label: string; issue?: string; choices: readonly { operationId: string; label: string }[] }[];
    memberships: readonly { sceneId: string; assetId: string; edgeIds: readonly string[];
      label?: string; note?: string; details?: readonly string[]; copyReady?: boolean }[] };
  prepareGsProxy?(token:string,target:NonNullable<WorkspaceModelDetails['gsProxyTarget']>,file?:WorkspaceFile):Promise<{id:string;label:string;externalMaterialsUnavailable?:boolean}>;
  commitGsProxy?(token:string,id:string):Promise<unknown>;
  cancelGsProxy?():void;
  addModel(token: string, input: { sceneId: string; assetId: string; file: WorkspaceFile }): Promise<unknown>;
  modelSelectionNotice?(file:WorkspaceFile):Promise<{externalMaterialsUnavailable:boolean}>;
  replaceModel(token: string, input: { sceneId: string; assetId: string; expectedBindingId: string; file: WorkspaceFile }): Promise<unknown>;
  transformModel(token: string, input: { sceneId: string; assetId: string; expectedBindingId: string; bindingId: string; placement: WorkspacePlacement; fitReference?: { assetId: string; bindingId: string } }): Promise<unknown>;
  modelDeletion(assetId: string): { readonly dependencies: readonly { kind: string; id: string; uncertain: boolean }[] };
  prepareModelMembership(token: string, sceneId: string, assetId: string, observedIds: readonly string[], keepId: string, choice: 'one' | 'both'): Promise<MetadataEdit>;
  views(sceneId: string, selected: string | null): { source: ViewSource; versions: ViewFieldVersions | null; entryVersion: string;
    deletion: { sourceToken: string; viewId: string; issue: string | null } | null };
  viewOrder(before: string | null, after: string | null): string;
  viewReview(sceneId: string): readonly { key: string; label: string; choices: readonly { operationId: string; label: string }[];
    target: { kind: 'entry' } | { kind: 'view'; viewId: string; field: 'name' | 'orderKey' | 'camera' | 'background' } }[];
  materials(sceneId: string): { source: MaterialSource; review: readonly WorkspaceMaterialReview[] };
  createModelPreview?(): { root: HTMLElement; show(token: string, sceneId: string, assetId: string, operationId: string, label: string): void; render(sceneId: string): void; dispose(): void };
  createViewport(canvas: HTMLCanvasElement, changed: () => void,
    propose: (target: WorkspaceSurface, position: Point3, phase?: 'begin' | 'adjust' | 'restore') => boolean,
    proposeModel?: (proposal: WorkspaceModelProposal) => boolean): WorkspaceViewport;
  changed(): void;
  otherPending(): boolean;
}
export const surfaceAnchor = (proposal: WorkspacePinProposal): Anchor => ({ kind: 'asset',
  assetId: proposal.target.assetId, assetFrameId: proposal.target.assetFrameId, positionAsset: proposal.position,
  authoredAnchorCompatibilityId: proposal.target.compatibilityId, authoredAssetRevisionId: proposal.target.revisionId,
  hitEvidence: proposal.point ? { method: 'point-cloud', source: { representationId: proposal.target.representationId, surfaceRef: { kind: 'pointSample', nodeIndex: 0, primitiveIndex: 0, pointIndex: proposal.point.pointIndex } } } : { method: 'manual' } });
