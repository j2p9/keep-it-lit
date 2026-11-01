import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

const buildId = new Date().toISOString().replace(/\D/g, '').slice(0, 14);

export default defineConfig({
  // Relative paths so the same build works at https://<user>.github.io/keep-it-lit/
  base: './',
  plugins: [
    preact(),
    {
      name: 'kil-version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: buildId }) });
      },
    },
  ],
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || '1.0.0'),
  },
  build: { target: 'es2020', assetsInlineLimit: 0 },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  test: { include: ['tests/**/*.test.js'], environment: 'node' },
});
