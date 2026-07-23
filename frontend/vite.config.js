import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const { TLS_CERT_PATH, TLS_KEY_PATH } = process.env;
const hasTls =
  TLS_CERT_PATH && TLS_KEY_PATH && fs.existsSync(TLS_KEY_PATH) && fs.existsSync(TLS_CERT_PATH);
const https = hasTls ? { key: fs.readFileSync(TLS_KEY_PATH), cert: fs.readFileSync(TLS_CERT_PATH) } : undefined;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    https,
    allowedHosts: ['localhost', 'kitgrid'],
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
