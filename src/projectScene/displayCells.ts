import type { AtomicHistory } from '../domain/atomicHistory';
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
  /** Complete original flat-cell final-write evidence, including absent candidates.
   * Paths/values are still development strings, not validated Project fields. */
  readonly originalAtomicHistory?: AtomicHistory;
}
