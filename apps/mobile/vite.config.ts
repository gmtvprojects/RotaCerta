import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// App do motorista (Ionic + Capacitor). Porta própria para rodar junto do web (5173).
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5175 },
});
