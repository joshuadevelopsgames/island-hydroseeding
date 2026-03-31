import path from 'node:path';
import fs from 'node:fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isProd = mode === 'production';
  const BUILD_ID = isProd ? `p-${Date.now()}` : 'dev';

  return {
    define: {
      'import.meta.env.VITE_BUILD_ID': JSON.stringify(BUILD_ID),
    },
    plugins: [
      react(),
      {
        name: 'write-build-id',
        closeBundle() {
          if (!isProd) return;
          const out = path.resolve('dist/build-id.txt');
          fs.writeFileSync(out, BUILD_ID, 'utf8');
        },
      },
    ],
  };
});
