import { defineConfig } from 'vitest/config';

// Spec 042 / Phase 7 — unit tests for the cockpit's data + linking layer.
// These modules (projectContext, auth, mcpClient) carry no runtime `vscode`
// import, so they run under plain Node without an Extension Development Host.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
