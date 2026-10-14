import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { IndexHtmlTransformContext, Plugin, UserConfig } from 'vite';
import config from '../vite.config';

// Configuration assertions only. The actual build separately verifies plugin/output isolation.
vi.mock('vite-plugin-pwa', () => ({ VitePWA: (options: unknown) => ({ name: 'test-pwa', options }) }));
const resolve = (mode: string): UserConfig => config({ command: 'build', mode });

describe('approved static validation build', () => {
  it('keeps ordinary and Spark PWA graphs unchanged and excludes PWA/public assets only from validation', () => {
    const ordinary = resolve('production'), spark = resolve('spark-harness'), validation = resolve('project-scene-validation');
    expect(ordinary.build?.outDir).toBe('dist');
    expect(ordinary.build?.rollupOptions?.input).toEqual({ main: 'index.html' });
    expect(ordinary.publicDir).toBeUndefined();
    expect(ordinary.plugins).toEqual([expect.objectContaining({ name: 'test-pwa', options: expect.objectContaining({ registerType: 'prompt', injectRegister: null }) })]);
    expect(spark.build?.outDir).toBe('dev-dist');
    expect(spark.build?.rollupOptions?.input).toEqual({ dev: 'dev.html' });
    expect(spark.publicDir).toBeUndefined();
    expect(spark.plugins).toEqual([expect.objectContaining({ name: 'test-pwa', options: expect.objectContaining({ registerType: 'autoUpdate', injectRegister: 'inline' }) })]);
    expect(validation.build?.outDir).toBe('validation-dist');
    expect(validation.build?.rollupOptions?.input).toEqual({ dev: 'dev.html' });
    expect(validation.build?.assetsInlineLimit).toBe(0);
    expect(validation.publicDir).toBe(false);
    expect(validation.plugins).toEqual([expect.objectContaining({ name: 'lociview-static-validation-shell' })]);
  });

  it('uses the same HTML with an honest startup state, no old controls or public favicon', async () => {
    const plugin = resolve('project-scene-validation').plugins![0] as Plugin;
    const hook = plugin.transformIndexHtml;
    if (!hook || typeof hook === 'function' || !('handler' in hook)) throw Error('Expected pre-transform');
    expect(hook.order).toBe('pre');
    const html = await hook.handler(readFileSync('dev.html', 'utf8'), { path: '/dev.html', filename: 'dev.html' } as IndexHtmlTransformContext);
    expect(html).toContain('<title>LociView — ファイル検証</title>');
    expect(html).toContain('<p role="status">ファイル検証画面を準備しています。</p>');
    expect(html).toContain('src="/src/dev-entry.ts"');
    expect(html).not.toMatch(/rel="icon"|id="file-model"|id="btn-import"|data-sample=/);
    const browser = readFileSync('src/harness/projectScene/validationBrowser.ts', 'utf8');
    expect(browser).toContain("if (!import.meta.env.DEV && import.meta.env.MODE !== 'project-scene-validation')");
  });
});
