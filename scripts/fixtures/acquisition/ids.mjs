import { randomBytes } from 'node:crypto';
import { fail } from './errors.mjs';

const PREFIX = /^[a-z][a-z0-9-]{1,15}(?![\s\S])/u;

export function createAttemptId(prefix = 'attempt') {
  if (!PREFIX.test(prefix)) fail('E_LOCAL_IO');
  let entropy;
  try { entropy = randomBytes(16).toString('hex'); } catch (error) { fail('E_LOCAL_IO', null, error); }
  return `${prefix}-${entropy}`;
}
