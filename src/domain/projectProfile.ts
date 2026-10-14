import { reject } from './values';

/** Explicit semantic interpretation, never inferred from a document's minor version. */
export type ProjectSemanticProfile = 'map1' | 'map2';
export function projectSemanticProfile(value: unknown = 'map1'): ProjectSemanticProfile {
  if (value !== 'map1' && value !== 'map2') return reject('value', ['semanticProfile']);
  return value;
}
