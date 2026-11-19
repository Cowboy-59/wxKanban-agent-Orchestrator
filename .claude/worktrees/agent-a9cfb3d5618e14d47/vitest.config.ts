import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    // Loads .env before any test imports src/server/config.ts, which exits the
    // process on missing vars. Without it, DB-backed suites cannot run at all.
    setupFiles: ["tests/setup.env.ts"],
    include: ["tests/**/*.test.ts"],
    // Some suites run the Change Impact engine or a real browser (SPEC-137..140). Under a full
    // parallel run one can pass the 5 s default and fail as a timeout rather than a defect.
    testTimeout: 20_000,
    // Exclude tests that require a live DB by default (they self-skip via fixtures).
    // Pure unit tests under tests/unit run in any environment.
    exclude: ["node_modules/", "dist/", ".history/"],
    coverage: {
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "tests/"],
    },
  },
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./src"),
      "@": path.resolve(__dirname, "./src"),
      "@client": path.resolve(__dirname, "./src/client"),
      "@shared": path.resolve(__dirname, "./src/shared"),
      "@server": path.resolve(__dirname, "./src/server"),
    },
  },
});
