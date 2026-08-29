export type NativeInitialProjectRoute =
  | { readonly kind: 'none' }
  | { readonly kind: 'invalid'; readonly message: string }
  | { readonly kind: 'open'; readonly projectId: string; readonly mode: 'view' | 'edit' };

/**
 * Resolves the one-shot ordinary-home handoff without treating a URL Project
 * ID as a filesystem path. Only IDs already present in the validated native
 * Project list may be opened.
 */
export function resolveNativeInitialProjectRoute(
  search: string,
  availableProjectIds: ReadonlySet<string>,
): NativeInitialProjectRoute {
  const params = new URLSearchParams(search);
  const projectValues = params.getAll('project');
  const sessionValues = params.getAll('session');
  if (projectValues.length === 0 && sessionValues.length === 0) return { kind: 'none' };
  if (projectValues.length !== 1 || sessionValues.length !== 1) {
    return { kind: 'invalid', message: '開くプロジェクトの指定が不完全または重複しています。' };
  }

  const projectId = projectValues[0]!;
  const mode = sessionValues[0]!;
  if (mode !== 'view' && mode !== 'edit') {
    return { kind: 'invalid', message: 'プロジェクトの開き方が不正です。' };
  }
  if (!availableProjectIds.has(projectId)) {
    return { kind: 'invalid', message: '指定されたプロジェクトは、この端末の有効な一覧にありません。' };
  }
  return { kind: 'open', projectId, mode };
}
