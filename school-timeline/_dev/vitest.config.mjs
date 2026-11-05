import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { root: new URL('..', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), include: ['_dev/tests/**/*.test.js'] } });
