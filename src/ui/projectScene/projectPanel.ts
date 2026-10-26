import type { MetadataEdit } from '../../projectMetadata/commands';
import type { ProjectWorkspacePorts, WorkspaceViewport, WorkspaceProvider, WorkspaceModelProposal } from './projectWorkspacePorts';

export type ProjectTask = 'captions' | 'models' | 'views' | 'materials';
export interface ProjectPanelHost {
  readonly ports: ProjectWorkspacePorts;
  source(): { provider: WorkspaceProvider; sceneId: string };
  viewport(): WorkspaceViewport;
  block(owner: ProjectTask, writes?: boolean, allowDrag?: boolean): string | null;
  changed(): void;
  message(text: string): void;
  execute(owner: ProjectTask, token: string, action: () => Promise<unknown>, complete: () => void): void;
  dispatch(owner: ProjectTask, token: string, command: MetadataEdit, complete: () => void): void;
}
export interface ProjectPanel {
  readonly root: HTMLElement;
  render(): void;
  hasChanges(): boolean;
  composing(): boolean;
  dispose(): void;
}
export interface ProjectModelPanel extends ProjectPanel {
  selectedPoint(): string | null;
  hidden(): readonly string[];
  proposal(): WorkspaceModelProposal | null;
  propose(next: WorkspaceModelProposal): boolean;
  show(assetId: string): void;
}
export const projectId = () => crypto.randomUUID().replaceAll('-', '');
export const newProjectId = (prefix: string) => `${prefix}_${projectId()}`;
/** Equality for already verified JSON UI receipts, not a wire encoder. */
export const sameProjectValue = (a: unknown, b: unknown): boolean => {
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, sorted((v as Record<string, unknown>)[key])])) : v;
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
};
export const panelNodes = (document: Document) => {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '') => { const node = document.createElement(tag); node.textContent = text; return node; };
  const button = (text: string, action: () => void) => { const node = make('button', text); node.type = 'button'; node.addEventListener('click', () => { if (!node.disabled) action(); }); return node; };
  return { make, button };
};
