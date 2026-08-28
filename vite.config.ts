import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA (docs/06 §5): アプリシェルを全precacheし、初回ロード後は完全オフラインで動作する。
// プロジェクトデータはOPFSが担当するためSWのキャッシュ対象にしない（責務分離）。
// GitHub Pagesはリポジトリ名のサブパス配信になるため、baseを環境変数で切り替える
const base = process.env.BASE_PATH ?? '/';

export default defineConfig(({ mode }) => {
  const isSparkHarness = mode === 'spark-harness';
  const input: Record<string, string> = isSparkHarness ? { dev: 'dev.html' } : { main: 'index.html' };

  return {
    base,
    build: {
      target: 'es2022',
      sourcemap: true,
      outDir: isSparkHarness ? 'dev-dist' : 'dist',
      // Keep the candidate GS bytes inspectable and independently cacheable.
      assetsInlineLimit: isSparkHarness ? 0 : undefined,
      rollupOptions: {
        // The product PWA and disposable renderer harness are separate build graphs.
        // Otherwise Workbox would precache Spark merely because its lazy chunk exists.
        input,
        output: isSparkHarness
          ? undefined
          : {
              chunkFileNames(chunk) {
                if (chunk.name === 'native-gs-spark') return 'assets/native-gs-spark-2.1.0.js';
                if (chunk.name === 'three-vendor') return 'assets/three-vendor-0.180.0.js';
                return 'assets/[name]-[hash].js';
              },
              manualChunks(id) {
                if (id.includes('/node_modules/three/') || id.includes('\\node_modules\\three\\')) return 'three-vendor';
                if (id.includes('@sparkjsdev/spark')) return 'native-gs-spark';
                return undefined;
              },
            },
      },
    },
    plugins: [
      isSparkHarness
        ? VitePWA({
            registerType: 'autoUpdate',
            injectRegister: 'inline',
            filename: 'sw.js',
            manifest: false,
            workbox: {
              globPatterns: ['**/*.{js,css,html,woff2,wasm,ply,obj}'],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: `${base}dev.html`,
              cleanupOutdatedCaches: true,
            },
            devOptions: { enabled: false },
          })
        : VitePWA({
            registerType: 'prompt', // 更新は明示的に（作業中に勝手に切り替わらない）
            injectRegister: null, // 登録は src/platform/pwa.ts が行う
            filename: 'sw.js',
            workbox: {
              // three.js・全ローダ・WASMを含めてprecache（オフラインで全形式が開ける）
              globPatterns: ['**/*.{js,css,html,woff2,wasm}'],
              // The GS runtime is cached only after the user explicitly prepares
              // the native GS path; ordinary v1 PWA installation must not fetch it.
              globIgnores: ['**/native-gs-spark-2.1.0.js'],
              runtimeCaching: [
                {
                  urlPattern: /\/assets\/native-gs-spark-2\.1\.0\.js$/,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'lociview-native-gs-runtime-v1',
                    // The same exact versioned URL is requested once by explicit
                    // preparation and later as an ES module. Hosts may return
                    // `Vary: Origin`; those request modes must share this entry.
                    matchOptions: { ignoreVary: true },
                    cacheableResponse: { statuses: [0, 200] },
                    expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  },
                },
              ],
              maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
              navigateFallback: `${base}index.html`,
              cleanupOutdatedCaches: true,
            },
            includeAssets: ['favicon.svg', 'icons/*.png'],
            manifest: {
              name: 'LociView',
              short_name: 'LociView',
              description: 'ネット環境がなくても3Dモデルに記録を残し、複数人の記録を統合できるビューア',
              lang: 'ja',
              start_url: base,
              scope: base,
              display: 'standalone',
              orientation: 'any',
              background_color: '#0f1115',
              theme_color: '#0f1115',
              icons: [
                { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
              // .lociview のダブルタップ起動（Android/デスクトップ。iOSは共有シート経由）
              file_handlers: [
                {
                  action: base,
                  accept: {
                    'application/zip': ['.lociview', '.zip'],
                    'model/gltf-binary': ['.glb'],
                  },
                },
              ],
              // 共有シートからの受け取り（Android。Phase 2で本格対応）
              share_target: {
                action: base,
                method: 'POST',
                enctype: 'multipart/form-data',
                params: {
                  files: [{ name: 'file', accept: ['application/zip', '.lociview'] }],
                },
              },
            },
            devOptions: { enabled: false },
          }),
    ],
  };
});
