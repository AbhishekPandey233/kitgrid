import fs from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// TLS_CERT_PATH/TLS_KEY_PATH are only set when a local dev cert is mounted (see
// docker-compose.yml) — falls back to plain HTTP when absent, or when the files themselves
// don't exist (e.g. CI, where certs/ is an empty bind mount), same pattern as the backend
// (server.js/env.tlsEnabled), so a native `npm run dev` without mkcert set up still works.
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
    // Vite's dev-server DNS-rebinding guard rejects any Host header not on this list.
    // "kitgrid" is the hostname a pentest VM resolves (via /etc/hosts) to this host's
    // VMware NAT IP — see Phase 32 setup notes.
    allowedHosts: ['localhost', 'kitgrid'],
    watch: {
      usePolling: true,
      interval: 300,
    },
  },
});
