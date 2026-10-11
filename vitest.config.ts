import { defineConfig } from 'vitest/config';

// Unit tests run in Node without the Cloudflare/React plugins.
export default defineConfig({
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node' },
});
