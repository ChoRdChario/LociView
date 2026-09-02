import { opKey } from './reduce';
import type { Op } from './schema';

export interface LocatedV1Operation {
  readonly op: Op;
  readonly source: string;
  readonly line: number;
}

export interface V1OperationAdmission {
  readonly accepted: LocatedV1Operation[];
  readonly divergent: LocatedV1Operation[];
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
}

/**
 * Exact semantic duplicate operations are idempotent. A shared `(actor, op)`
 * with different decoded content activates neither candidate; no input-order
 * winner is selected.
 */
export function admitNonDivergentV1Operations(
  records: readonly LocatedV1Operation[],
): V1OperationAdmission {
  const groups = new Map<string, Map<string, LocatedV1Operation[]>>();
  for (const record of records) {
    const key = opKey(record.op);
    const variants = groups.get(key) ?? new Map<string, LocatedV1Operation[]>();
    const digestInput = canonicalJson(record.op);
    const instances = variants.get(digestInput) ?? [];
    instances.push(record);
    variants.set(digestInput, instances);
    groups.set(key, variants);
  }

  const accepted: LocatedV1Operation[] = [];
  const divergent: LocatedV1Operation[] = [];
  for (const variants of groups.values()) {
    if (variants.size === 1) {
      accepted.push(variants.values().next().value![0]!);
    } else {
      for (const instances of variants.values()) divergent.push(...instances);
    }
  }
  return { accepted, divergent };
}
