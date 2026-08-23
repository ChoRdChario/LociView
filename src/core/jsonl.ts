// ops/*.jsonl の読み書き (docs/02 §4.1, §8)
// 不正行は例外にせずスキップして警告リストに積む（1行の破損でログ全体を失わない）。

import { parseJsonWithoutDuplicateMembers } from './json';
import { cloneValidatedOp, type Op } from './schema';

export const MAX_LINE_CHARS = 65536;
export const MAX_LINES = 500_000;

export interface JsonlParseError {
  line: number; // 1-based
  reason: 'invalid JSON' | 'schema violation' | 'line too long' | 'too many lines';
}

export interface JsonlParseResult {
  ops: Op[];
  errors: JsonlParseError[];
}

export function serializeOps(ops: readonly Op[]): string {
  if (ops.length === 0) return '';
  return ops.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

export function parseOpsJsonl(text: string): JsonlParseResult {
  const ops: Op[] = [];
  const errors: JsonlParseError[] = [];
  const lines = text.split(/\r?\n/);
  if (lines.length > MAX_LINES) {
    errors.push({ line: 0, reason: 'too many lines' });
    return { ops, errors };
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
    if (op !== null) {
      ops.push(op);
    } else {
      errors.push({ line: i + 1, reason: 'schema violation' });
    }
  }
  return { ops, errors };
}
