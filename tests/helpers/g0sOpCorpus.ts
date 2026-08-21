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
const WIRE_SHAPE_COMPLETION_CASE_IDS = new Set([
  'opaque-missing-user',
  'opaque-create-without-value',
  'opaque-uppercase-hlc-counter',
  'opaque-noncanonical-actor',
  'opaque-noncanonical-user',
  'opaque-known-kind-malformed-ulid',
]);
const WIRE_SHAPE_DISPATCH_CASE_IDS = new Set([
  'opaque-create-without-value',
  'opaque-known-kind-malformed-ulid',
]);

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

function validateCaseWire(
  wireJson: string,
  expectedSubject: OpCorpusSubject,
  label: string,
): Record<string, unknown> {
  const parsed: unknown = JSON.parse(wireJson);
  if (!isObject(parsed)) fail(label + ' must decode to an object');
  if (parsed.op !== expectedSubject.op) fail(label + '.op differs from subject');
  if (parsed.actor !== expectedSubject.actor) fail(label + '.actor differs from subject');
  if (parsed.e !== expectedSubject.kind) fail(label + '.e differs from subject');
  if (parsed.id !== expectedSubject.id) fail(label + '.id differs from subject');
  return parsed;
}

function validateDispatchProjection(
  input: Record<string, unknown>,
  wire: Record<string, unknown>,
  label: string,
): void {
  const projection = {
    t: wire.t,
    e: wire.e,
    id: wire.id,
    ...(Object.hasOwn(wire, 'v') ? { v: wire.v } : {}),
  };
  if (!isDeepStrictEqual(input, projection)) fail(label + ' differs from its wire projection');
}

function validateCompletedCaseShape(
  id: string,
  wire: Record<string, unknown>,
  expected: Record<string, unknown>,
  dispatchPresent: boolean,
  label: string,
): void {
  const missingUser = id === 'opaque-missing-user';
  const missingValue = id === 'opaque-create-without-value';
  const expectedKeys = ['op', 'hlc', 'actor', 'user', 't', 'e', 'id', 'v'].filter(
    (key) => !(missingUser && key === 'user') && !(missingValue && key === 'v'),
  );
  exactKeys(wire, expectedKeys, label + '.wireJson');
  if (wire.t !== 'create' || wire.e !== 'caption') {
    fail(label + ' must remain a caption create operation');
  }
  if (!missingValue && !isObject(wire.v)) fail(label + '.wireJson.v must be a plain object');

  const actorCanonical =
    typeof wire.actor === 'string' && /^a_[0-9A-HJKMNP-TV-Z]{13}$/u.test(wire.actor);
  if (id === 'opaque-noncanonical-actor') {
    if (wire.actor !== 'a_000000000000I' || actorCanonical) {
      fail(label + ' must isolate the prohibited Crockford actor character');
    }
  } else if (!actorCanonical) {
    fail(label + '.wireJson.actor must otherwise be canonical');
  }

  if (missingUser) {
    if (Object.hasOwn(wire, 'user')) fail(label + '.wireJson.user must be absent');
  } else if (id === 'opaque-noncanonical-user') {
    if (wire.user !== 'usr_80000000000000000000000000') {
      fail(label + ' must isolate the ULID leading-character user defect');
    }
  } else if (
    typeof wire.user !== 'string' ||
    !/^usr_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(wire.user)
  ) {
    fail(label + '.wireJson.user must otherwise be canonical');
  }

  if (id === 'opaque-known-kind-malformed-ulid') {
    if (wire.id !== 'cap_80000000000000000000000000') {
      fail(label + ' must isolate the caption ULID leading-character defect');
    }
  } else if (typeof wire.id !== 'string' || !/^cap_[0-7][0-9A-HJKMNP-TV-Z]{25}$/u.test(wire.id)) {
    fail(label + '.wireJson.id must otherwise be a canonical caption ID');
  }

  if (typeof wire.hlc !== 'string' || typeof wire.actor !== 'string') {
    fail(label + '.wireJson.hlc and actor must be strings');
  }
  const iso = wire.hlc.slice(0, 24);
  const counter = wire.hlc.slice(25, 29);
  if (
    wire.hlc[24] !== '-' ||
    wire.hlc[29] !== '-' ||
    wire.hlc !== `${iso}-${counter}-${wire.actor}` ||
    Number.isNaN(Date.parse(iso)) ||
    new Date(iso).toISOString() !== iso
  ) {
    fail(label + '.wireJson.hlc must otherwise be canonical and bind its actor');
  }
  if (id === 'opaque-uppercase-hlc-counter') {
    if (counter !== '00AF') fail(label + ' must isolate the uppercase HLC counter defect');
  } else if (!/^[0-9a-f]{4}$/u.test(counter)) {
    fail(label + '.wireJson.hlc counter must otherwise be canonical');
  }

  if (
    expected.canonicalEvidence !== 'opaque' ||
    expected.reducer !== 'none' ||
    expected.rawEvidence !== 'preserved'
  ) {
    fail(label + '.expected must remain opaque/none/preserved');
  }
  if (dispatchPresent !== WIRE_SHAPE_DISPATCH_CASE_IDS.has(id)) {
    fail(label + '.dispatchInputJson presence differs from the approved ingress boundary');
  }
}

function validateNfcNfdRelation(
  first: Record<string, unknown>,
  second: Record<string, unknown>,
  label: string,
): void {
  const firstValue = first.v;
  const secondValue = second.v;
  if (!isObject(firstValue) || !isObject(secondValue)) fail(label + '.v must be an object');
  const firstFuture = firstValue.future;
  const secondFuture = secondValue.future;
  if (!isObject(firstFuture) || !isObject(secondFuture)) {
    fail(label + '.v.future must be an object');
  }
  const firstLabel = firstFuture.label;
  const secondLabel = secondFuture.label;
  if (typeof firstLabel !== 'string' || typeof secondLabel !== 'string') {
    fail(label + '.v.future.label must be a string');
  }
  if (firstLabel === secondLabel || firstLabel.normalize('NFC') !== secondLabel.normalize('NFC')) {
    fail(label + ' must differ only by an NFC/NFD scalar sequence');
  }
  const firstShape = {
    ...first,
    v: { ...firstValue, future: { ...firstFuture, label: '<normalization-pair>' } },
  };
  const secondShape = {
    ...second,
    v: { ...secondValue, future: { ...secondFuture, label: '<normalization-pair>' } },
  };
  if (!isDeepStrictEqual(firstShape, secondShape)) {
    fail(label + ' candidates differ outside the normalization pair');
  }
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
    let dispatchInput: Record<string, unknown> | null = null;
    if (raw.dispatchInputJson !== null) {
      nonEmptyAscii(raw.dispatchInputJson, `${label}.dispatchInputJson`);
      const input: unknown = JSON.parse(raw.dispatchInputJson);
      if (!isObject(input)) fail(`${label}.dispatchInputJson must decode to an object`);
      dispatchInput = input;
    }
    subject(raw.subject, `${label}.subject`);
    if (raw.logActor !== raw.subject.actor) fail(`${label}.logActor differs from subject.actor`);
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
    } else {
      const wire = validateCaseWire(raw.wireJson, raw.subject, `${label}.wireJson`);
      if (dispatchInput !== null) {
        validateDispatchProjection(dispatchInput, wire, `${label}.dispatchInputJson`);
      }
      if (WIRE_SHAPE_COMPLETION_CASE_IDS.has(raw.id)) {
        validateCompletedCaseShape(
          raw.id,
          wire,
          raw.expected,
          dispatchInput !== null,
          label,
        );
      }
    }
  }
  for (const requiredId of WIRE_SHAPE_COMPLETION_CASE_IDS) {
    if (!ids.has(requiredId)) fail(`cases omit required wire-shape fixture ${requiredId}`);
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
    if (raw.id === 'same-key-nfc-nfd-divergent') {
      validateNfcNfdRelation(first, second, label);
    }
  }
  if (!ids.has('same-key-nfc-nfd-divergent')) {
    fail('relations omit required NFC/NFD divergence fixture');
  }

  return parsed as unknown as OpCorpus;
}
