import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'server.ts',
    outDir: 'dist-server',
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'server.js' } },
  },
});
