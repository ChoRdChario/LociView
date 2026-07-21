import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA (docs/06 §5): アプリシェルを全precacheし、初回ロード後は完全オフラインで動作する。
// プロジェクトデータはOPFSが担当するためSWのキャッシュ対象にしない（責務分離）。
export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        dev: 'dev.html',
      },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt', // 更新は明示的に（作業中に勝手に切り替わらない）
      injectRegister: null, // 登録は src/platform/pwa.ts が行う
      filename: 'sw.js',
      workbox: {
        // three.js・全ローダ・WASMを含めてprecache（オフラインで全形式が開ける）
        globPatterns: ['**/*.{js,css,html,woff2,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/dev\.html/],
        cleanupOutdatedCaches: true,
      },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'LociView',
        short_name: 'LociView',
        description: 'ネット環境がなくても3Dモデルに記録を残し、複数人の記録を統合できるビューア',
        lang: 'ja',
        start_url: '/',
        scope: '/',
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
            action: '/',
            accept: {
              'application/zip': ['.lociview', '.zip'],
              'model/gltf-binary': ['.glb'],
            },
          },
        ],
        // 共有シートからの受け取り（Android。Phase 2で本格対応）
        share_target: {
          action: '/',
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
});
