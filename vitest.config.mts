import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['tests/domain/**/*.test.ts', 'tests/integration/**/*.test.ts', 'tests/i18n/**/*.test.ts'], environment: 'node', testTimeout: 30000 }
});
