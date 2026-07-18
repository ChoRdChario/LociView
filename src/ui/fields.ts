// EntityRecord.fields の安全な読み出しヘルパ（UI層共用）

import type { EntityRecord } from '../core/reduce';

export function fStr(rec: EntityRecord, field: string, fallback = ''): string {
  const v = rec.fields[field];
  return typeof v === 'string' ? v : fallback;
}

export function fNum(rec: EntityRecord, field: string, fallback: number): number {
  const v = rec.fields[field];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function fStrArr(rec: EntityRecord, field: string): string[] {
  const v = rec.fields[field];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export interface AnchorData {
  modelAssetId?: string;
  position?: [number, number, number];
  normal?: [number, number, number];
  [k: string]: unknown;
}

export function fAnchor(rec: EntityRecord): AnchorData | null {
  const v = rec.fields.anchor;
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const a = v as AnchorData;
  if (a.position !== undefined && (!Array.isArray(a.position) || a.position.length !== 3)) return null;
  return a;
}
