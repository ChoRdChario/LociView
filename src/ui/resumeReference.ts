/** Shared UI advice only. The catalog and actual opened Project remain authoritative. */
export interface ProjectResumeReference { readonly run: string; readonly mode: 'view' | 'edit' }
export function projectResumeReference(value: unknown): ProjectResumeReference | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join(',') === 'mode,run' && typeof record.run === 'string' && /^[0-9a-f]{32}$/.test(record.run) &&
    (record.mode === 'view' || record.mode === 'edit') ? { run: record.run, mode: record.mode } : null;
}
