import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
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
