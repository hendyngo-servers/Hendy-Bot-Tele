import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const miniAppRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: miniAppRoot,
  plugins: [react()],
  build: {
    outDir: path.resolve(miniAppRoot, '../public'),
    emptyOutDir: true,
    assetsDir: 'assets'
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000'
    }
  }
});
