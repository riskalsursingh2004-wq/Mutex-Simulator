import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Bind to 0.0.0.0 so the sandbox preview can reach the dev server.
// allowedHosts is relaxed so the preview host header is accepted.
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
});
