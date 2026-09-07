import type { NativeExchangePurposeV1 } from './packageExchange';

export type NativeExportPurposeV1 = 'backup' | NativeExchangePurposeV1;

export type NativeExportIntentV1 =
  | { readonly projectId: string; readonly purpose: Exclude<NativeExportPurposeV1, 'review'> }
  | { readonly projectId: string; readonly purpose: 'review'; readonly reviewDisplaySetId: string };

export type NativeExportHandoffResolutionV1 =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'ready'; readonly intent: NativeExportIntentV1 };

const PROJECT_PARAM = 'exportProject';
const PURPOSE_PARAM = 'exportPurpose';
const DISPLAY_SET_PARAM = 'exportDisplaySet';

export function buildNativeExportHandoffUrlV1(baseUrl: string | URL, intent: NativeExportIntentV1): URL {
  const url = new URL(baseUrl);
  url.searchParams.delete('mode');
  url.searchParams.delete('project');
  url.searchParams.delete('session');
  url.searchParams.set(PROJECT_PARAM, intent.projectId);
  url.searchParams.set(PURPOSE_PARAM, intent.purpose);
  if (intent.purpose === 'review') url.searchParams.set(DISPLAY_SET_PARAM, intent.reviewDisplaySetId);
  else url.searchParams.delete(DISPLAY_SET_PARAM);
  return url;
}

export function resolveNativeExportHandoffV1(
  search: string,
  availableProjectIds: ReadonlySet<string>,
): NativeExportHandoffResolutionV1 {
  const params = new URLSearchParams(search);
  const projects = params.getAll(PROJECT_PARAM);
  const purposes = params.getAll(PURPOSE_PARAM);
  const displaySets = params.getAll(DISPLAY_SET_PARAM);
  if (projects.length === 0 && purposes.length === 0 && displaySets.length === 0) return { kind: 'none' };
  if (projects.length !== 1 || purposes.length !== 1 || displaySets.length > 1) {
    return { kind: 'invalid', message: '書き出す対象の指定が不完全または重複しています。' };
  }
  const projectId = projects[0]!;
  const purpose = purposes[0]!;
  if (!availableProjectIds.has(projectId)) {
    return { kind: 'invalid', message: '書き出すプロジェクトは、この端末の有効な一覧にありません。' };
  }
  if (purpose !== 'backup' && purpose !== 'collaboration' && purpose !== 'review' && purpose !== 'cleanCopy') {
    return { kind: 'invalid', message: '書き出しの目的を確認できません。' };
  }
  if (purpose === 'review') {
    if (displaySets.length !== 1 || displaySets[0] === '') {
      return { kind: 'invalid', message: '閲覧共有に含める表示セットが指定されていません。' };
    }
    return { kind: 'ready', intent: { projectId, purpose, reviewDisplaySetId: displaySets[0]! } };
  }
  if (displaySets.length !== 0) {
    return { kind: 'invalid', message: 'この書き出し目的には表示セットを指定できません。' };
  }
  return { kind: 'ready', intent: { projectId, purpose } };
}

export function clearNativeExportHandoffV1(url: URL): URL {
  const clean = new URL(url);
  clean.searchParams.delete(PROJECT_PARAM);
  clean.searchParams.delete(PURPOSE_PARAM);
  clean.searchParams.delete(DISPLAY_SET_PARAM);
  return clean;
}
