// Isolated second page; preserve the existing 5184/5185 probes and their builds.
import { fileURLToPath } from 'node:url';
export default {
  server: { host: '127.0.0.1', port: 5186, strictPort: true },
  preview: { host: '127.0.0.1', port: 5186, strictPort: true },
  resolve: { alias: [{ find: /^@automerge\/automerge$/, replacement: '@automerge/automerge/slim' }] },
  build: { target: 'es2022', outDir: '../../.artifacts/fixtures/journal-browser-dist', assetsInlineLimit: 0,
    rollupOptions: { input: fileURLToPath(new URL('./journal.html', import.meta.url)) } },
};
