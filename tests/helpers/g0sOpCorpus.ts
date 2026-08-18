import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';

export interface OpCorpusSubject {
  actor: string;
  op: number;
  kind: string;
  id: string;
}

export interface OpCorpusCase {
  id: string;
  logActor: string;
  wireJson: string;
  dispatchInputJson: string | null;
  subject: OpCorpusSubject;
  expected: {
    canonicalEvidence: 'accepted' | 'opaque';
    reducer: 'visible' | 'tombstone' | 'none';
    rawEvidence: 'preserved';
  };
}

export interface OpCorpusRelation {
  id: string;
  firstWireJson: string;
  secondWireJson: string;
  subject: OpCorpusSubject;
  expected: {
    decision: 'idempotent' | 'collision';
    orderIndependent: true;
  };
}

export interface OpCorpus {
  corpusVersion: 1;
  contract: 'V1CanonicalOperation+LegacyJcsV1';
  cases: OpCorpusCase[];
  relations: OpCorpusRelation[];
}

const MALFORMED_WIRE_CASE_IDS = new Set(['opaque-malformed-json']);

function fail(message: string): never {
  throw new Error(`G0S operation corpus: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} keys differ: [${actual.join(', ')}]`);
  }
}

function nonEmptyAscii(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0 || !/^[\x20-\x7e]+$/u.test(value)) {
    fail(`${label} must be non-empty ASCII wire text`);
  }
}

function subject(value: unknown, label: string): asserts value is OpCorpusSubject {
  if (!isObject(value)) fail(`${label} must be an object`);
  exactKeys(value, ['actor', 'op', 'kind', 'id'], label);
  for (const key of ['actor', 'kind', 'id'] as const) {
    if (typeof value[key] !== 'string' || value[key].length === 0) fail(`${label}.${key} is invalid`);
  }
  if (!Number.isSafeInteger(value.op) || (value.op as number) < 1) fail(`${label}.op is invalid`);
}

function validateRelationCandidate(
  wireJson: string,
  expectedSubject: OpCorpusSubject,
  label: string,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(wireJson);
  if (!isObject(parsed)) fail(`${label} must decode to an object`);
  exactKeys(parsed, ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'], label);
  if (parsed.op !== expectedSubject.op) fail(`${label}.op differs from subject`);
  if (parsed.actor !== expectedSubject.actor) fail(`${label}.actor differs from subject`);
  if (parsed.e !== expectedSubject.kind) fail(`${label}.e differs from subject`);
  if (parsed.id !== expectedSubject.id) fail(`${label}.id differs from subject`);
  if (parsed.t !== 'create' && parsed.t !== 'update') fail(`${label}.t must write visibility`);
  if (!isObject(parsed.v)) fail(`${label}.v must be an object`);
  if (!/^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(expectedSubject.actor)) {
    fail(`${label}.actor is not a canonical corpus actor`);
  }
  if (typeof parsed.user !== 'string' || !/^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(parsed.user)) {
    fail(`${label}.user is not a canonical corpus identity`);
  }
  if (expectedSubject.kind === 'caption' && !/^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(expectedSubject.id)) {
    fail(`${label}.id is not canonical for the caption subject`);
  }
  if (
    typeof parsed.hlc !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z-[0-9a-f]{4}-a_[0-9A-Z]{13}$/u.test(parsed.hlc) ||
    !parsed.hlc.endsWith(`-${expectedSubject.actor}`) ||
    Number.isNaN(Date.parse(parsed.hlc.slice(0, 24)))
  ) {
    fail(`${label}.hlc is not canonical or does not bind the subject actor`);
  }
  return parsed;
}

export function loadOpCorpus(): OpCorpus {
  const file = new URL('../../fixtures/g0s/operations/corpus.v1.json', import.meta.url);
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  if (!isObject(parsed)) fail('root must be an object');
  exactKeys(parsed, ['corpusVersion', 'contract', 'cases', 'relations'], 'root');
  if (parsed.corpusVersion !== 1) fail('corpusVersion must be 1');
  if (parsed.contract !== 'V1CanonicalOperation+LegacyJcsV1') fail('contract is invalid');
  if (!Array.isArray(parsed.cases) || !Array.isArray(parsed.relations)) fail('cases and relations must be arrays');

  const ids = new Set<string>();
  for (const [index, raw] of parsed.cases.entries()) {
    const label = `cases[${index}]`;
    if (!isObject(raw)) fail(`${label} must be an object`);
    exactKeys(raw, ['id', 'logActor', 'wireJson', 'dispatchInputJson', 'subject', 'expected'], label);
    nonEmptyAscii(raw.id, `${label}.id`);
    if (!/^[a-z0-9][a-z0-9-]{2,95}$/u.test(raw.id)) fail(`${label}.id is invalid`);
    if (ids.has(raw.id)) fail(`${label}.id duplicates ${raw.id}`);
    ids.add(raw.id);
    nonEmptyAscii(raw.logActor, `${label}.logActor`);
    nonEmptyAscii(raw.wireJson, `${label}.wireJson`);
    if (raw.dispatchInputJson !== null) {
      nonEmptyAscii(raw.dispatchInputJson, `${label}.dispatchInputJson`);
      const input: unknown = JSON.parse(raw.dispatchInputJson);
      if (!isObject(input)) fail(`${label}.dispatchInputJson must decode to an object`);
    }
    subject(raw.subject, `${label}.subject`);
    if (!isObject(raw.expected)) fail(`${label}.expected must be an object`);
    exactKeys(raw.expected, ['canonicalEvidence', 'reducer', 'rawEvidence'], `${label}.expected`);
    if (raw.expected.canonicalEvidence !== 'accepted' && raw.expected.canonicalEvidence !== 'opaque') {
      fail(`${label}.expected.canonicalEvidence is invalid`);
    }
    if (!['visible', 'tombstone', 'none'].includes(raw.expected.reducer as string)) {
      fail(`${label}.expected.reducer is invalid`);
    }
    if (raw.expected.rawEvidence !== 'preserved') fail(`${label}.expected.rawEvidence is invalid`);
    let wireParses = true;
    try {
      JSON.parse(raw.wireJson);
    } catch {
      wireParses = false;
    }
    if (MALFORMED_WIRE_CASE_IDS.has(raw.id)) {
      if (wireParses) fail(`${label}.wireJson is designated malformed but parses`);
    } else if (!wireParses) {
      fail(`${label}.wireJson must be syntactically valid`);
    }
  }

  for (const [index, raw] of parsed.relations.entries()) {
    const label = `relations[${index}]`;
    if (!isObject(raw)) fail(`${label} must be an object`);
    exactKeys(raw, ['id', 'firstWireJson', 'secondWireJson', 'subject', 'expected'], label);
    nonEmptyAscii(raw.id, `${label}.id`);
    if (!/^[a-z0-9][a-z0-9-]{2,95}$/u.test(raw.id)) fail(`${label}.id is invalid`);
    if (ids.has(raw.id)) fail(`${label}.id duplicates ${raw.id}`);
    ids.add(raw.id);
    nonEmptyAscii(raw.firstWireJson, `${label}.firstWireJson`);
    nonEmptyAscii(raw.secondWireJson, `${label}.secondWireJson`);
    subject(raw.subject, `${label}.subject`);
    const first = validateRelationCandidate(raw.firstWireJson, raw.subject, `${label}.firstWireJson`);
    const second = validateRelationCandidate(raw.secondWireJson, raw.subject, `${label}.secondWireJson`);
    if (!isObject(raw.expected)) fail(`${label}.expected must be an object`);
    exactKeys(raw.expected, ['decision', 'orderIndependent'], `${label}.expected`);
    if (raw.expected.decision !== 'idempotent' && raw.expected.decision !== 'collision') {
      fail(`${label}.expected.decision is invalid`);
    }
    if (raw.expected.orderIndependent !== true) fail(`${label}.expected.orderIndependent must be true`);
    const structurallyEqual = isDeepStrictEqual(first, second);
    if ((raw.expected.decision === 'idempotent') !== structurallyEqual) {
      fail(`${label}.expected.decision disagrees with the parsed full operations`);
    }
  }

  return parsed as unknown as OpCorpus;
}
