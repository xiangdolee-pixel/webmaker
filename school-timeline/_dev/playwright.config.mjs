import { defineConfig } from '@playwright/test';

const PORT = 8740;
export default defineConfig({
  testDir: './e2e',
  outputDir: '../node_modules/.cache/pw-results',
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, locale: 'ko-KR', timezoneId: 'Asia/Seoul' },
  webServer: { command: `node _dev/serve.mjs ${PORT}`, cwd: '..', url: `http://localhost:${PORT}/`, reuseExistingServer: true },
  projects: [
    { name: 'mobile-360', use: { viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true } },
    { name: 'tablet-768', use: { viewport: { width: 768, height: 1024 } } },
    { name: 'desktop-1280', use: { viewport: { width: 1280, height: 860 } } },
  ],
});
