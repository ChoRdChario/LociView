// Isolated loopback build; no application assets, PWA plugin or dependency install.
export default {
  publicDir: false,
  server: { host: '127.0.0.1', port: 5185, strictPort: true },
  preview: { host: '127.0.0.1', port: 5185, strictPort: true },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0, sourcemap: true },
};
