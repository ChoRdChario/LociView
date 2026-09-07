// Disposable, loopback-only harness. No PWA plugin or production build inputs.
export default {
  server: { host: '127.0.0.1', port: 5184, strictPort: true },
  preview: { host: '127.0.0.1', port: 5184, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
};
