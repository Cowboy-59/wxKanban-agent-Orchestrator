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

// [SCOPE 149 / T008] BEGIN — bundle pino into the bridge bundles (FR-017)
// The handoff audit lines use Pino. A consumer's kit install may not have pino in its tree,
// so pino and everything it pulls in are bundled; every OTHER npm package stays external as
// before. Only bare imports made from our own source are externalized — imports made from
// inside node_modules (pino's own dependencies) are bundled with it.
const bundlePino = {
  name: "bundle-pino",
  setup(b) {
    // Bare specifiers only: relative ("./x", "../x") and absolute paths resolve as usual.
    b.onResolve({ filter: /^[^./\\]/ }, (args) => {
      if (args.kind === "entry-point" || /^[A-Za-z]:[\\/]/.test(args.path)) return undefined;
      if (/[\\/]node_modules[\\/]/.test(args.importer)) return undefined;
      if (args.path === "pino" || args.path.startsWith("pino/")) return undefined;
      return { path: args.path, external: true };
    });
  },
};
const { packages: _allExternal, ...bridgeCommon } = common;
const bridgeBuild = { ...bridgeCommon, plugins: [bundlePino] };
// [SCOPE 149 / T008] END

// [SCOPE 134 / T032] The project agent (remote bridge) ships compiled too, so the Cockpit
// can start it with plain node in a consumer project. The Agent SDK stays external.
// MODIFIED-BY: [SCOPE 149 / T008] — bundles pino; other npm packages stay external
await build({
  ...bridgeBuild,
  entryPoints: { "remote-bridge": "apps/remote-bridge/src/main.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
});

// [SCOPE 149 / T002] The HANDOFF REMOTE writer, loaded by bin/handoff-remote.mjs.
await build({
  ...bridgeBuild,
  entryPoints: { "handoff-remote": "apps/remote-bridge/src/handoff-main.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
});

// [SCOPE 155 / T002] The masking rules, standalone (no internal deps) so the plain-Node
// session-feed hook (_wxAI/remote/) can require() it without pulling in a bundler of its own.
await build({
  ...common,
  entryPoints: { redact: "apps/remote-bridge/src/redact.ts" },
  outdir: "dist",
  outExtension: { ".js": ".cjs" },
});

console.log("esbuild: wrote dist/cli.cjs + dist/http.cjs + dist/remote-bridge.cjs + dist/handoff-remote.cjs + dist/redact.cjs");
