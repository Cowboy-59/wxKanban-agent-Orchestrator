import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import * as path from 'path';

// Spec 042 / Phase 7 — unit tests for the cockpit's data + linking layer.
// These modules (projectContext, auth, mcpClient) carry no runtime `vscode`
// import, so they run under plain Node without an Extension Development Host.
//
// [SCOPE 083 Amendment A / FR-006] Services that DO import `vscode` (kitUpdate)
// resolve it to tests/stubs/vscode.ts instead. Added so the kit→Cockpit cache
// handoff can be tested for real: that contract crosses two codebases and is
// exactly where a field defect like b54b281e survives a green build on both
// sides. The stub implements only what the tests touch.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(here, 'tests/stubs/vscode.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/stubs/**'],
    environment: 'node',
  },
});
