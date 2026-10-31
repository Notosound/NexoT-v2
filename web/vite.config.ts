import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Lógica compartida con los scripts de Node (mapeo de columnas de Excel)
      '@compartido': fileURLToPath(new URL('../src', import.meta.url)),
    },
  },
  server: { fs: { allow: ['..'] } },
});
