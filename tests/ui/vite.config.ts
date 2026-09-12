import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@privy-io/react-auth': fileURLToPath(new URL('./auth-stub.tsx', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
});
