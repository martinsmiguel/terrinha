import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: ['index.html', 'poc.html', 'poc-hud.html', 'poc-avaliacao.html'],
      },
    },
    resolve: {
      alias: {
        '@': path.resolve('.'),
      },
    },
  };
});
