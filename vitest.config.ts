import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: Object.fromEntries(
      (await import('fs'))
        .readFileSync('.env', 'utf-8')
        .split('\n')
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => line.split('=').map((s) => s.trim()))
        .filter(([k, v]) => k && v),
    ),
  },
});
