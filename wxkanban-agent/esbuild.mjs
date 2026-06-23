// Phase 3 — bundle + minify the kit CLI/HTTP entry points so the orchestrator
// ships compiled JS instead of raw TypeScript. Local (relative) source is bundled
// into a single minified file per entry; npm packages stay external (installed via
// npm). Templates ship alongside at the package root and are located at runtime by
// findTemplatesDir() walking up from __dirname (works with this dist/ layout).
import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  minify: true,
  sourcemap: false,
  legalComments: "none",
  // Keep npm deps external (installed in node_modules); only OUR source is bundled.
  packages: "external",
  logLevel: "info",
};

await build({
  ...common,
  entryPoints: { cli: "apps/command-gateway/src/cli.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
});

await build({
  ...common,
  entryPoints: { http: "apps/command-gateway/src/http.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
});

console.log("esbuild: wrote dist/cli.cjs + dist/http.cjs");
