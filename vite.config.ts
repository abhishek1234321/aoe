import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const root = process.cwd();

const sharedConfig = {
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
    },
  },
} as const;

export default defineConfig(({ mode }) => {
  const isContentBuild = mode === 'content';
  const isWatch = process.argv.includes('--watch');
  const shouldMinify = process.env.VITE_MINIFY !== 'false';
  const shouldSourcemap = process.env.VITE_SOURCEMAP === 'true';

  if (isContentBuild) {
    return {
      ...sharedConfig,
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: shouldSourcemap,
        minify: shouldMinify ? 'esbuild' : false,
        rollupOptions: {
          input: {
            content: resolve(root, 'src/content/index.ts'),
          },
          output: {
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: () => 'content.js',
          },
        },
      },
    };
  }

  return {
    ...sharedConfig,
    build: {
      outDir: 'dist',
      // Keep dist intact during `--watch` so the content build output (content.js)
      // isn't wiped while both watch tasks run concurrently.
      emptyOutDir: !isWatch,
      sourcemap: shouldSourcemap,
      rollupOptions: {
        input: {
          popup: resolve(root, 'popup.html'),
          background: resolve(root, 'src/background/index.ts'),
        },
        output: {
          format: 'es',
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') {
              return 'background.js';
            }
            return 'assets/[name].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
