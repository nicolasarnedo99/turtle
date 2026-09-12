import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/ui',
  testMatch: '**/*.spec.ts',
  use: { baseURL: 'http://127.0.0.1:4175', headless: true },
  webServer: { command: 'npx vite --config tests/ui/vite.config.ts', url: 'http://127.0.0.1:4175', reuseExistingServer: false },
});
