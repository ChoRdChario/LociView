/** Nonpersistent synthetic test port, not a ProjectDoc schema or package format. */
export type HistoryCell = { readonly kind: 'value'; readonly value: string } |
  { readonly kind: 'conflict'; readonly candidates: readonly { readonly id: string; readonly value: string }[] };
export interface HistorySnapshot {
  readonly token: string;
  readonly cells: Readonly<Record<string, HistoryCell>>;
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
  exportUpdate(): MemoryUpdate;
  receive(update: MemoryUpdate): { readonly snapshot: HistorySnapshot; readonly added: number };
}
export type DevelopmentHistoryFactory = (seed: Readonly<Record<string, string>>,
  validate: (snapshot: HistorySnapshot) => void) => readonly [DevelopmentHistory, DevelopmentHistory];
