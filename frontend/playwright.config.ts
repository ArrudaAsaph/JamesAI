import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3101', trace: 'retain-on-failure' },
  webServer: { command: 'npx next start --port 3101', url: 'http://localhost:3101', reuseExistingServer: false, timeout: 60000 },
});
