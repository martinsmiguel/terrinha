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
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'unit',
            include: ['tests/unit/**/*.test.ts'],
            // Testes que geram mundos procedurais passam isolados mas estouram os 5 s padrão sob carga.
            testTimeout: 30_000,
          },
        },
        {
          extends: true,
          test: {
            name: 'integration',
            include: ['tests/integration/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'perf',
            include: ['tests/perf/**/*.test.ts'],
            // O orçamento de 50 ms por tick mede tempo real: roda depois dos demais, sem disputar CPU com eles.
            sequence: { groupOrder: 1 },
          },
        },
      ],
    },
  };
});
