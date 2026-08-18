import { beforeAll, describe, expect, it } from 'vitest';
import { parseOpsJsonl } from '../../src/core/jsonl';
import { visibleEntities } from '../../src/core/reduce';
import { ProjectStore, type Identity } from '../../src/core/store';
import { MemoryFS } from '../../src/platform/fs';

const USER: Identity = { userId: 'usr_G0S', deviceId: 'dev_G0S', displayName: 'g0s' };
const ACTOR = 'a_0000000000000';
const ENTITY_ID = 'cap_00000000000000000000000000';
const USER_ID = 'usr_00000000000000000000000000';
const HLC = `2026-08-19T00:00:00.000Z-0000-${ACTOR}`;

const BASE_OP = {
  op: 1,
  hlc: HLC,
  actor: ACTOR,
  user: USER_ID,
  t: 'create',
  e: 'caption',
  id: ENTITY_ID,
  v: { title: 'safe' },
} as const;

function rawWithPayload(payloadJson: string): string {
  return JSON.stringify({ ...BASE_OP, v: JSON.parse(payloadJson) as unknown });
}

describe('G0-S characterization: untrusted operations', () => {
  describe('reserved-key precondition', () => {
    let allRejected: boolean;

    beforeAll(() => {
      const lines = [
        JSON.stringify({ ...BASE_OP, e: '__proto__' }),
        JSON.stringify({ ...BASE_OP, e: 'constructor' }),
        JSON.stringify({ ...BASE_OP, e: 'prototype' }),
        JSON.stringify({ ...BASE_OP, id: '__proto__' }),
        JSON.stringify({ ...BASE_OP, id: 'constructor' }),
        rawWithPayload('{"__proto__":{"polluted":true}}'),
        rawWithPayload('{"prototype":{"polluted":true}}'),
        rawWithPayload('{"safe":{"constructor":{"prototype":{"polluted":true}}}}'),
      ];
      const outcomes = lines.map((line) => parseOpsJsonl(`${line}\n`));
      allRejected = outcomes.every(({ ops, errors }) => ops.length === 0 && errors.length === 1);
    });

    it.fails('G0S-OP: reserved map keys are rejected recursively before reaching the reducer', () => {
      expect(allRejected).toBe(true);
    });
  });

  describe('noncanonical-HLC precondition', () => {
    let outcome: { opened: boolean; activated: boolean; reported: boolean };

    beforeAll(async () => {
      const fs = new MemoryFS();
      const dir = 'projects/bad-hlc';
      await ProjectStore.create(fs, dir, 'bad hlc', USER);
      const invalidHlcOp = {
        ...BASE_OP,
        hlc: `2026-99-99T99:99:99.999Z-0000-${ACTOR}`,
        id: 'cap_00000000000000000000000001',
      };
      await fs.writeText(`${dir}/ops/${ACTOR}.jsonl`, `${JSON.stringify(invalidHlcOp)}\n`);

      let reopened: ProjectStore | null = null;
      try {
        reopened = await ProjectStore.open(fs, dir, USER);
      } catch {
        // Opening failure is the characterized unsafe outcome, not a setup error.
      }

      const activated =
        reopened !== null &&
        visibleEntities(reopened.state, 'caption').some((record) => record.id === invalidHlcOp.id);
      const reported = reopened !== null && reopened.loadErrors.some(({ file }) => file.endsWith(`${ACTOR}.jsonl`));
      outcome = { opened: reopened !== null, activated, reported };
    });

    it.fails('G0S-OP: noncanonical HLC is quarantined without crashing project open', () => {
      expect(outcome).toEqual({ opened: true, activated: false, reported: true });
    });
  });
});
