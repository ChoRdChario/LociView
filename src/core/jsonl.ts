// ops/*.jsonl の読み書き (docs/02 §4.1, §8)
// 不正行は例外にせずスキップして警告リストに積む（1行の破損でログ全体を失わない）。

import { parseJsonWithoutDuplicateMembers } from './json';
import { cloneValidatedOp, isCandidateV1OperationActive, type Op } from './schema';

export const MAX_LINE_CHARS = 65536;
export const MAX_LINES = 500_000;
const OPERATION_LOG_ACTOR = /^a_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{13}$/u;

export function v1OperationLogActor(path: string, opsPrefix: string): string | null {
  if (!opsPrefix.endsWith('/') || !path.startsWith(opsPrefix)) return null;
  const filename = path.slice(opsPrefix.length);
  if (!filename.endsWith('.jsonl') || filename.includes('/') || filename.includes('\\')) return null;
  const actor = filename.slice(0, -'.jsonl'.length);
  return OPERATION_LOG_ACTOR.test(actor) ? actor : null;
}

export interface JsonlParseError {
  line: number; // 1-based
  reason:
    | 'invalid JSON'
    | 'schema violation'
    | 'line too long'
    | 'too many lines'
    | 'divergent operation identity'
    | 'operation actor/path mismatch';
}

export interface JsonlParseResult {
  ops: Op[];
  /** Accepted operations with their original one-based source line. */
  entries: { op: Op; line: number }[];
  errors: JsonlParseError[];
}

export function serializeOps(ops: readonly Op[]): string {
  if (ops.length === 0) return '';
  return ops.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

export function parseOpsJsonl(
  text: string,
  options: Readonly<{ candidateReadOnly?: boolean }> = {},
): JsonlParseResult {
  const ops: Op[] = [];
  const entries: { op: Op; line: number }[] = [];
  const errors: JsonlParseError[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    errors.push({ line: 0, reason: 'too many lines' });
    return { ops, entries, errors };
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line === '') continue;
    if (line.length > MAX_LINE_CHARS) {
      errors.push({ line: i + 1, reason: 'line too long' });
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parseJsonWithoutDuplicateMembers(line);
    } catch {
      errors.push({ line: i + 1, reason: 'invalid JSON' });
      continue;
    }
    const op = cloneValidatedOp(parsed);
    if (op !== null && (!options.candidateReadOnly || isCandidateV1OperationActive(op))) {
      ops.push(op);
      entries.push({ op, line: i + 1 });
    } else {
      errors.push({ line: i + 1, reason: 'schema violation' });
    }
  }
  return { ops, entries, errors };
}
