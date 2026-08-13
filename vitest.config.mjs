import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.mjs'],
    // The preservation suite drives a real archiver against real temp trees, so
    // it is slower than a mocked unit test and must not be cut off mid-extract.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
