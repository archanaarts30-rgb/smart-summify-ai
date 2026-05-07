import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

/**
 * Replaces %VITE_XXX% placeholders in dist/manifest.json with the
 * corresponding env var values after Vite copies the file from public/.
 * Chrome reads manifest.json as a static file so Vite's normal HTML
 * env-injection does not apply to it — this plugin fills the gap.
 */
function manifestEnvPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'manifest-env-substitution',
    closeBundle() {
      const manifestPath = resolve(__dirname, 'dist/manifest.json');
      let content = readFileSync(manifestPath, 'utf-8');
      content = content.replace(/%VITE_([^%]+)%/g, (_, key) => {
        const value = env[`VITE_${key}`];
        if (!value) {
          console.warn(`[manifest-env] Warning: VITE_${key} is not set — placeholder left as-is.`);
          return `%VITE_${key}%`;
        }
        return value;
      });
      writeFileSync(manifestPath, content, 'utf-8');
      console.log('[manifest-env] dist/manifest.json env substitution done.');
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), manifestEnvPlugin(env)],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
          content: resolve(__dirname, 'src/content/index.ts'),
        },
        output: {
          entryFileNames: '[name].js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
      copyPublicDir: true,
    },
    resolve: {
      alias: { '@': resolve(__dirname, 'src') },
    },
  };
});
