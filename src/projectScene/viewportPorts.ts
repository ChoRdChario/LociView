import type { ViewCameraIntent,ViewAxis } from '../ui/projectScene/viewState';
import type { RenderDisplay,V3 } from './viewportModel';
import type { PinSurfaceTarget } from './viewportPicking';
import type { ModelPlacementTarget } from './pinGizmo';
import type { ModelManipulation } from './modelTransform';
import type { DisplayCapture } from './displayCapture';
import type { SolidBackground } from './viewDisplay';
export interface ViewportObservation {
  readonly token: string; readonly ready: boolean; readonly issue: string | null; readonly dragging: boolean;
  /** Exact immutable input used for this projection; absent receipts cannot place pins/lines. */
  readonly display?: RenderDisplay;
  /** Changes for geometry/camera lifetime, but not an Orbit start/end without movement. */
  readonly pickToken?: string;
  readonly manipulating?: boolean;
  readonly notice?: string | null;
  readonly loading?: boolean;
  readonly retryAvailable?: boolean;
  readonly projection: 'perspective' | 'orthographic'; readonly axis: ViewAxis | null;
  readonly pins: readonly { id: string; x: number; y: number; visible: boolean }[];
  readonly preview?: { readonly x: number; readonly y: number; readonly visible: boolean };
}
export interface ProjectViewport {
  setPointDiameter?(assetId: string, diameter: number): void; pointDiameter?(assetId: string): number;
  update(display: RenderDisplay): void; setActive(active: boolean): void;
  /** Reserve placement input before Orbit receives pointerdown; independent of gizmo activity. */
  setPinPointerActive?(active: boolean): void;
  read(): ViewportObservation; camera(intent: ViewCameraIntent): void; retry(): void; dispose(): void;
  capture?(): DisplayCapture; recall?(payload: DisplayCapture): void;
  /** Includes exact readback verification; thrown verification must roll back before publication. */
  setBackground?(background: SolidBackground, verify?: () => void): void;
  pick?(target: PinSurfaceTarget, xCss: number, yCss: number): V3 | null;
  pickCreation?(targets: readonly PinSurfaceTarget[], xCss: number, yCss: number): { target: PinSurfaceTarget; position: V3; point?: { readonly pointIndex: number } } | null;
}
export type ViewportFactory = (canvas: HTMLCanvasElement, changed: () => void,
  proposePin?: (target: PinSurfaceTarget, positionAsset: V3, phase?: 'begin' | 'adjust' | 'restore') => boolean,
  proposeModel?: (target: ModelPlacementTarget, positionProject: V3, manipulation?: ModelManipulation) => boolean) => ProjectViewport;
