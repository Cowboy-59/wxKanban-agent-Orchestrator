// Import check for the common room module (SPEC-159 FR-091). Fails (exit 1) when any file under
// the module's src/ imports a bridge internal, anything outside the module, or anything but a
// Node built-in. A database client is a bare package, so it is refused by the same rule.
//
//   node common-room/scripts/check-imports.mjs            checks this module
//   checkImports(dir)                                      checks any folder (used by the tests)

// [SCOPE 159 / T002] BEGIN — Common room import check (FR-091)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/g;
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

function listSource(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listSource(full));
    else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** Returns a list of { file, specifier, reason } for every import the module may not make. */
export function checkImports(moduleDir) {
  const root = resolve(moduleDir);
  const srcDir = join(root, "src");
  const problems = [];
  for (const file of listSource(srcDir)) {
    const text = readFileSync(file, "utf-8");
    for (const match of text.matchAll(SPECIFIER)) {
      const specifier = match[1];
      const shown = relative(root, file).split(sep).join("/");
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(file), specifier);
        if (target !== srcDir && !target.startsWith(srcDir + sep)) {
          problems.push({ file: shown, specifier, reason: "reaches outside the module's src/" });
        }
      } else if (!BUILTINS.has(specifier)) {
        problems.push({ file: shown, specifier, reason: "is not a Node built-in (no packages, no database client, no bridge)" });
      }
    }
  }
  return problems;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const moduleDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const problems = checkImports(moduleDir);
  if (problems.length > 0) {
    for (const p of problems) process.stderr.write(`common-room import check: ${p.file} imports "${p.specifier}", which ${p.reason}\n`);
    process.exit(1);
  }
  process.stdout.write("common-room import check: ok\n");
}
// [SCOPE 159 / T002] END
