// Seed runner — populate a wxktest_ clone from the command line.
//
//   npx tsx tests/seeds/run.ts --schema wxktest_119_ab12
//   npx tsx tests/seeds/run.ts --schema wxktest_119_ab12 --scope 119
//
// With --scope it loads `tests/seeds/<NNN-*>/seed.ts` and runs it, resolving whatever
// that seed declares in `requires` first. Without one it runs the base seed alone.
//
// Exit codes: 0 ok · 1 failed · 2 refused (safety guard)

import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createSeedContext, runSeed, type Seed } from "./harness.js";

// [SCOPE 120 / T005] BEGIN — Resolve which seed to run for a scope
const SEEDS_DIR = "tests/seeds";

function findScopeSeed(scope: string): string | null {
  const token = String(scope).padStart(3, "0");
  const dir = readdirSync(SEEDS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(`${token}-`))
    .map((d) => d.name)[0];
  return dir ? join(SEEDS_DIR, dir, "seed.ts") : null;
}
// [SCOPE 120 / T005] END

// [SCOPE 120 / T005] BEGIN — Entry point
const argv = process.argv.slice(2);
const arg = (f: string): string | null => {
  const i = argv.indexOf(`--${f}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

const schemaName = arg("schema");
const scope = arg("scope");

if (!schemaName) {
  console.error("REFUSED: --schema is required");
  process.exit(2);
}

let seedPath = `${SEEDS_DIR}/_base/seed.ts`;
if (scope) {
  const found = findScopeSeed(scope);
  if (!found) {
    console.log(`[seed] no seed directory for scope ${scope} — running the base seed only`);
  } else {
    seedPath = found;
  }
}

let ctx;
try {
  // createSeedContext refuses anything outside wxktest_ and verifies current_schema().
  ctx = await createSeedContext(schemaName);
} catch (err) {
  console.error(`REFUSED: ${(err as Error).message}`);
  process.exit(2);
}

try {
  console.log(`[seed] ${seedPath} → ${ctx.schemaName}`);
  const mod = await import(pathToFileURL(seedPath).href);
  const seed: Seed = mod.default ?? mod.baseSeed;
  if (!seed?.name) throw new Error(`${seedPath} has no default-exported Seed`);

  const results = await runSeed(ctx, seed);
  const ran = Object.keys(results);
  console.log(`[seed] ran ${ran.length} seed(s): ${ran.join(", ")}`);
  console.log(JSON.stringify({ schema: ctx.schemaName, seeds: ran, results }, null, 2));
} catch (err) {
  console.error(`[seed] FAILED: ${(err as Error).message}`);
  process.exitCode = 1;
} finally {
  await ctx.pool.end();
}
// [SCOPE 120 / T005] END
