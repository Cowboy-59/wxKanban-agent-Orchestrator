import { defineConfig, devices } from "@playwright/test";

// [SCOPE 111 / T043] BEGIN — Browser runner for the ui-flow gate
//
// Navigation-flow test items (gate: 'ui-flow') assert page-to-page movement and
// per-screen element state. Without this config they could be stored, displayed
// and signed off by hand, but never executed automatically — the prerequisite
// carried in from the shipped generation skill.
//
// tests/e2e already holds spec files written before this existed; they were
// unrunnable for the same reason.
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts$/,

  // A ui-flow item asserts a definite outcome, so a test that only passes on a
  // retry is a defect in the test or the app, not a flake to paper over.
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,

  // Fail the run rather than silently passing a suite someone left `.only` in.
  forbidOnly: Boolean(process.env.CI),

  timeout: 30_000,
  expect: { timeout: 5_000 },

  reporter: process.env.CI
    ? [["list"], ["json", { outputFile: "test-results/e2e-results.json" }]]
    : [["list"]],

  use: {
    // Never defaults to production. A ui-flow run drives real UI against a real
    // server, and this scope's whole DB-safety position is that a test target
    // is opt-in, never inherited.
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
// [SCOPE 111 / T043] END
