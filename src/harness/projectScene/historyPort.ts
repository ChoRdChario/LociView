/** Nonpersistent synthetic test port, not a ProjectDoc schema or package format. */
export type HistoryCell = { readonly kind: 'value'; readonly value: string } |
  { readonly kind: 'conflict'; readonly candidates: readonly { readonly id: string; readonly value: string }[] };
export interface HistoryChange { readonly id: string; readonly deps: readonly string[]; readonly writes: Readonly<Record<string, string | null>> }
export interface HistorySnapshot {
  readonly token: string;
  readonly cells: Readonly<Record<string, HistoryCell>>;
  /** Exact atomic field operation identities, separate from materialized values. */
  readonly cellVersions?: Readonly<Record<string, string>>;
  /** Original command dependencies/final writes, not wall-clock times or persisted extension fields. */
  readonly causalChanges?: readonly HistoryChange[];
}
/** Local/plan preview only; the candidate derives its own evidence from original encoded changes. */
export function previewHistory(snapshot: HistorySnapshot, token: string, changes: Readonly<Record<string, string>>): HistorySnapshot {
  const prior = snapshot.causalChanges ?? [], parents = new Set(prior.flatMap(c => c.deps));
  return { token, cells: { ...snapshot.cells, ...Object.fromEntries(Object.entries(changes).map(([key, text]) => [key, { kind: 'value' as const, value: text }])) },
    cellVersions: { ...snapshot.cellVersions, ...Object.fromEntries(Object.keys(changes).map(key => [key, `${token}/${key}`])) },
    causalChanges: [...prior, { id: token, deps: prior.filter(c => !parents.has(c.id)).map(c => c.id), writes: changes }] };
}
export interface MemoryUpdate {
  readonly base: readonly string[];
  readonly target: readonly string[];
  readonly roots: readonly string[];
  readonly changes: readonly Uint8Array[];
}
export interface DevelopmentHistory {
  read(): HistorySnapshot;
  write(token: string, changes: Readonly<Record<string, string>>): HistorySnapshot;
  choose(token: string, key: string, candidateId: string): HistorySnapshot;
  /** Explicit fresh lifecycle command after reviewing the exact attachment conflict set. */
  resolveAttachmentLifecycle?(token: string, key: string, candidateIds: readonly string[], value: string): HistorySnapshot;
  exportUpdate(): MemoryUpdate;
  receive(update: MemoryUpdate): { readonly snapshot: HistorySnapshot; readonly added: number };
}
export type DevelopmentHistoryFactory = (seed: Readonly<Record<string, string>>,
  validate: (snapshot: HistorySnapshot, previous?: HistorySnapshot) => void) => readonly [DevelopmentHistory, DevelopmentHistory];
