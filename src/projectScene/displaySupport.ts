import { cloneCanonicalValue, type JsonValue } from '../domain/values';
export type { ModelPlacement } from './modelTypes';
export function canonicalDisplay(input: unknown): string {
  const value = cloneCanonicalValue(input, { maxNodes: 4096, maxDepth: 16, maxStringScalars: 65_536 });
  const encode = (item: JsonValue): string => item && typeof item === 'object' ? Array.isArray(item)
    ? `[${item.map(encode).join(',')}]` : `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${encode((item as Record<string, JsonValue>)[key]!)}`).join(',')}}`
    : JSON.stringify(item);
  return encode(value);
}
export function freezeDisplay<T>(item: T): T {
  if (item && typeof item === 'object' && !Object.isFrozen(item)) {
    for (const child of Object.values(item)) freezeDisplay(child);
    Object.freeze(item);
  }
  return item;
}
