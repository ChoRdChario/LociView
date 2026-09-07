/** UI composition ports only. File inspection and writes stay in their services. */
export interface NativeHomeUi {
  readonly projects: HTMLElement;
  readonly creation: HTMLElement;
  readonly transfer: HTMLElement;
  /** Keep the ordinary home intake/list out of the post-model creation step. */
  onCreationPendingChange(listener: (pending: boolean) => void): () => void;
  acceptModelFile(file: File): Promise<void>;
  acceptPackageFile(file: File): void;
  readonly busy: boolean;
  /** Reserve the home before async container inspection/conversion/navigation. */
  beginIntake(): (() => void) | null;
}

export interface NativeHomeHost {
  isCurrent(): boolean;
  mount(root: HTMLElement, ui: NativeHomeUi): void;
  openProject(projectId: string, mode: 'view' | 'edit'): void;
}
