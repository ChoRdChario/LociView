/** Compatibility import for the development harness. */
export * from '../../projectScene/acknowledgment';
export type WorkingWrite = (token: string, changes: Readonly<Record<string, string>>,
  confirmed: () => void, failed: (error: unknown) => void) => boolean;
