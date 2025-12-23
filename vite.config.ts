import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = process.cwd();

const input = {
  popup: resolve(root, 'popup.html'),
  background: resolve(root, 'src/background/index.ts'),
  content: resolve(root, 'src/content/index.ts'),
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input,
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') {
            return 'background.js';
          }
          if (chunk.name === 'content') {
            return 'content.js';
          }
          return 'assets/[name].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
