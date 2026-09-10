// Client module transport/transform regression, not a browser evaluation or storage receipt.
import { expect, it } from 'vitest';
import { createServer } from 'vite';
import ts from 'typescript';

it('serves the complete saved-development client import graph with explicit Wasm assets', async () => {
  const server = await createServer({ configFile: 'vite.config.ts', clearScreen: false,
    cacheDir: '.artifacts/fixtures/saved-client-vite-cache',
    server: { host: '127.0.0.1', port: 0, strictPort: false, open: false } });
  try {
    await server.listen();
    const address = server.httpServer!.address();
    if (!address || typeof address === 'string') throw Error('missing development listener');
    const origin = `http://127.0.0.1:${address.port}`;
    const queue = ['/poc/scene-history/development-browser.ts'], visited = new Set<string>();
    let wasmAssets = 0;
    while (queue.length) {
      const url = new URL(queue.shift()!, origin).href;
      if (visited.has(url)) continue;
      expect(visited.size, 'bounded client graph').toBeLessThan(300); visited.add(url);
      expect(new URL(url).origin, 'no external runtime requests').toBe(origin);
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      expect(response.status, `client dependency ${new URL(url).pathname}`).toBe(200);
      const source = await response.text();
      expect(source, 'no browser external Node module').not.toContain('__vite-browser-external');
      const file = ts.createSourceFile('client.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const imports: string[] = [];
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier))
          imports.push(node.moduleSpecifier.text);
        if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0]))
          imports.push(node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(file);
      for (const specifier of imports) {
        const resolved = new URL(specifier, url);
        expect(specifier.startsWith('/') || specifier.startsWith('.'), 'all client imports resolved').toBe(true);
        expect(!resolved.pathname.endsWith('.wasm') || resolved.searchParams.has('url') || resolved.searchParams.has('init'),
          'Wasm must not be imported as a raw ESM module').toBe(true);
        queue.push(resolved.href);
      }
      if (new URL(url).pathname.endsWith('.wasm') && new URL(url).searchParams.has('url')) {
        const exportNode = file.statements.find(ts.isExportAssignment);
        expect(exportNode && ts.isStringLiteral(exportNode.expression), 'Wasm asset URL export').toBeTruthy();
        if (!exportNode || !ts.isStringLiteral(exportNode.expression)) throw Error('missing Wasm URL');
        const asset = new URL(exportNode.expression.text, url); expect(asset.origin).toBe(origin);
        const reply = await fetch(asset, { signal: AbortSignal.timeout(15000) }); expect(reply.status).toBe(200);
        expect([...new Uint8Array(await reply.arrayBuffer()).slice(0, 4)]).toEqual([0, 97, 115, 109]); wasmAssets++;
      }
    }
    expect([...visited].some(url => url.includes('/development-saved-browser.ts'))).toBe(true);
    expect([...visited].some(url => url.includes('/journal-format.ts'))).toBe(true);
    expect(wasmAssets).toBeGreaterThan(0);
  } finally { await server.close(); }
}, 60_000);
