#!/usr/bin/env node
/**
 * Inventory guard — SCOPE-127 / T013 (FR-013). One of the guards that carries the safety burden.
 *
 * Generation removes a human from the loop (owner decision 3), so the hard stops that used to sit
 * inside `inventory-functions.mjs` have to reach an inventory that script never saw: one an agent
 * produced by following a generated adapter's *Inventory source*. Read before weakening anything.
 *
 * The failures it prevents both have precedents:
 *
 *   - ZERO UNITS. Run against a C# repository, the TypeScript extractor walked 316 `.cs` files,
 *     matched nothing, wrote a valid-looking inventory of zero units and exited 0.
 *   - AN UNDER-COUNT (commit 6c7d9a5c, kit v1.7.55). A matcher that missed most routers produced a
 *     short but plausible inventory, and a plausible small number reads as a real result far more
 *     readily than an empty one does.
 *
 * The method is the same on every stack. A project adapter declares `**Inventory signal:** <glob>
 * :: <regex>` — the pattern of the stack's registration site. This counts that signal itself,
 * independently of whatever produced the inventory, and refuses when the two disagree:
 *
 *   1. the inventory has zero units                                         (--allow-empty: only if the signal is empty too)
 *   2. the signal matches nothing, while the inventory found units          → the adapter does not describe this codebase
 *   3. a file declares more units of a kind than the inventory lists for it → an under-count, named per file
 *
 * A signal names the kind it counts — `**Inventory signal (command):**` — and is compared only with
 * units of that kind in that file. Comparing whole-file totals let a missed command be covered by a
 * unit of another kind in the same file (second cold run of GENERATE.md, 2026-10-02).
 *
 * A shipped adapter that declares no signal passes through untouched: its own extractor carries its
 * guards, and wxKanban's own pipeline must not change (SC-6). A PROJECT adapter with no signal is
 * refused — `validate-adapter.mjs` already requires one.
 *
 * A path-scoped run passes `--scope <dir>` (repeatable) from its OWN target argument, and is checked
 * against that subtree only. The inventory's `scanned.dirs` is deliberately ignored for this: the
 * inventory is written by the agent being checked, and a cold run of GENERATE.md showed an
 * inventory narrowing its own `scanned.dirs` could hide every command it had missed. Registrations
 * outside the scope are counted and reported, never silently dropped.
 *
 * The comparison is a floor, not an identity. A file listing more units than registrations is fine
 * (exported helpers are units too); a file listing fewer is the signature of a miss.
 *
 *   node _wxAI/adapters/inventory-guard.mjs --adapter <adapter.md> --inventory <inventory.json>
 *        [--root <repo>] [--scope <dir>]... [--allow-empty] [--json]
 *
 * Exit codes:  0 consistent (or a shipped adapter with no signal)   3 refused   2 bad usage
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { originOf, parseInventorySignals } from "./validate-adapter.mjs";

/** Directories that hold build output, dependencies or kit files — never a project's own source. */
const SKIP_DIRS = new Set([
  "node_modules", ".git", "target", "dist", "build", "out", "obj", ".next", ".turbo",
  "coverage", ".wxai", "_wxAI", ".claude", ".venv", "venv", "__pycache__", ".dart_tool", "Pods",
]);

/** Files larger than this are generated or vendored, not hand-written registration sites. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const toPosix = (p) => String(p).replace(/\\/g, "/");

/** Glob → RegExp body. Supports `**`, `*`, `?` and `{a,b}` (alternatives may hold wildcards). */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
function globBody(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        i++;
        if (glob[i + 1] === "/") {
          i++;
          re += "(?:.*/)?";
        } else {
          re += ".*";
        }
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === "{") {
      const end = glob.indexOf("}", i);
      if (end < 0) {
        re += "\\{";
        continue;
      }
      re += `(?:${glob.slice(i + 1, end).split(",").map(globBody).join("|")})`;
      i = end;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  return re;
}
// [SCOPE 127 / T013] END

// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function globToRegExp(glob) {
  return new RegExp(`^${globBody(toPosix(glob).replace(/^\.\//, ""))}$`);
}
// [SCOPE 127 / T013] END

/** The fixed directory a glob starts in, so the walk does not visit the whole tree. */
const staticPrefix = (glob) => {
  const segs = toPosix(glob).replace(/^\.\//, "").split("/");
  const fixed = [];
  for (const s of segs.slice(0, -1)) {
    if (/[*?{]/.test(s)) break;
    fixed.push(s);
  }
  return fixed.join("/");
};

/** Every file under `root` whose repo-relative path matches `glob`. */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function matchGlob(root, glob) {
  const re = globToRegExp(glob);
  const start = resolve(root, staticPrefix(glob));
  const out = [];
  if (!existsSync(start)) return out;
  const walk = (dir) => {
    for (const d of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, d.name);
      if (d.isDirectory()) {
        if (!SKIP_DIRS.has(d.name)) walk(full);
      } else if (d.isFile()) {
        const rel = toPosix(relative(root, full));
        if (re.test(rel)) out.push(rel);
      }
    }
  };
  if (statSync(start).isDirectory()) walk(start);
  return out.sort();
}
// [SCOPE 127 / T013] END

/** Registration sites per file, counted from the adapter's own signal. */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function countSignal(root, signals) {
  // Keyed by file AND kind: a signal counts one kind of unit, and is compared only with units of
  // that kind (an unkinded signal, kind null, with every unit in the file).
  const hits = new Map();
  for (const s of signals) {
    for (const rel of matchGlob(root, s.glob)) {
      const full = resolve(root, rel);
      if (statSync(full).size > MAX_FILE_BYTES) continue;
      const n = [...readFileSync(full, "utf-8").matchAll(new RegExp(s.regex.source, s.regex.flags))].length;
      if (n === 0) continue;
      const key = `${rel}\u0000${s.kind ?? ""}`;
      const prev = hits.get(key);
      hits.set(key, { file: rel, kind: s.kind ?? null, registrations: (prev?.registrations ?? 0) + n });
    }
  }
  return hits;
}
// [SCOPE 127 / T013] END

/**
 * Check an inventory against the adapter's signal. Pure apart from reading files; never throws on a
 * finding — it returns `{ ok, reason, ... }` so every refusal is named.
 */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function guardInventory({ adapterPath, inventory, root = process.cwd(), allowEmpty = false, scope = [] }) {
  const src = readFileSync(adapterPath, "utf-8");
  const origin = originOf(adapterPath);
  const { signals, errors } = parseInventorySignals(src);
  const units = Array.isArray(inventory?.units) ? inventory.units : null;

  if (units === null) {
    return {
      ok: false,
      reason: "bad-inventory",
      message: 'The inventory has no "units" array. Every stack writes the same shape — see GENERATE.md.',
    };
  }

  if (errors.length > 0) {
    return { ok: false, reason: "bad-signal", message: `The adapter's Inventory signal does not parse: ${errors.join("; ")}` };
  }

  if (signals.length === 0) {
    if (origin === "shipped") {
      return {
        ok: true,
        reason: "shipped-no-signal",
        message: "Shipped adapter with no Inventory signal: its own extractor carries the inventory guards.",
        units: units.length,
      };
    }
    return {
      ok: false,
      reason: "no-signal",
      message:
        "This project adapter declares no **Inventory signal:**, so the inventory cannot be checked. " +
        "An unchecked inventory from an unverified adapter is exactly the confident wrong answer this " +
        "guard exists to stop.",
    };
  }

  // A path-scoped run is checked against that subtree only — otherwise every registration outside
  // it would read as an under-count. The scope comes from the CALLER (--scope, from the run's own
  // target argument), never from the inventory: the inventory is written by the same agent this
  // guard is checking, and an inventory that narrowed its own `scanned.dirs` could hide every unit
  // it missed (found by a cold run of GENERATE.md, 2026-10-02). Exclusions are reported, not silent.
  const scopes = scope.map((d) => toPosix(d).replace(/^\.\//, "").replace(/\/+$/, "")).filter((d) => d && d !== ".");
  const hits = countSignal(root, signals);
  let outOfScope = 0;
  if (scopes.length > 0) {
    for (const [key, h] of [...hits]) {
      if (!scopes.some((d) => h.file === d || h.file.startsWith(`${d}/`))) {
        outOfScope += h.registrations;
        hits.delete(key);
      }
    }
  }
  // Units per file, and per file AND kind — a kinded signal is compared only with its own kind, so
  // a file's count cannot be made up with units of another kind (second cold run, 2026-10-02).
  const perFile = new Map();
  const perFileKind = new Map();
  for (const u of units) {
    const f = toPosix(String(u?.file ?? "")).replace(/^\.\//, "");
    const k = `${f}\u0000${String(u?.kind ?? "").trim().toLowerCase()}`;
    perFile.set(f, (perFile.get(f) ?? 0) + 1);
    perFileKind.set(k, (perFileKind.get(k) ?? 0) + 1);
  }
  // Every result names the files the signal matched, so a reader can see WHAT was checked rather
  // than trust a count.
  const matched = [...hits.values()]
    .sort((a, b) => a.file.localeCompare(b.file) || String(a.kind).localeCompare(String(b.kind)))
    .map((h) => ({
      file: h.file,
      kind: h.kind,
      registrations: h.registrations,
      units: h.kind === null ? perFile.get(h.file) ?? 0 : perFileKind.get(`${h.file}\u0000${h.kind}`) ?? 0,
    }));
  const facts = {
    units: units.length,
    signalFiles: new Set(matched.map((m) => m.file)).size,
    signalHits: matched.reduce((a, m) => a + m.registrations, 0),
    matched,
    scope: scopes,
    outOfScope,
  };

  if (units.length === 0) {
    if (allowEmpty && facts.signalFiles === 0) {
      return { ok: true, reason: "empty-allowed", message: "Empty inventory, and the signal agrees.", ...facts };
    }
    return {
      ok: false,
      reason: "zero-units",
      message:
        `The inventory has ZERO units${facts.signalHits > 0 ? `, yet the adapter's own signal finds ${facts.signalHits} registration(s) in ${facts.signalFiles} file(s)` : ""}. ` +
        "A zero-unit inventory is never a result to plan against.",
      ...facts,
    };
  }

  if (facts.signalFiles === 0) {
    return {
      ok: false,
      reason: "signal-matches-nothing",
      message:
        `The inventory lists ${units.length} unit(s), but the adapter's Inventory signal ` +
        `(${signals.map((s) => `${s.glob} :: ${s.pattern}`).join("; ")}) matches nothing ` +
        `${scopes.length > 0 ? `under ${scopes.join(", ")}` : "in this tree"}. ` +
        "The adapter does not describe this codebase — fix its signal before trusting anything it produced.",
      ...facts,
    };
  }

  const underCounted = matched.filter((m) => m.units < m.registrations);
  if (underCounted.length > 0) {
    return {
      ok: false,
      reason: "under-count",
      message:
        `${underCounted.length} file(s) register more units than the inventory lists. This is the ` +
        "signature of an inventory that missed registrations — short but plausible, and every phase " +
        "downstream would treat it as complete. A unit's `file` must be the file where the signal " +
        "matches it, and its `kind` the kind the signal names.",
      underCounted,
      ...facts,
    };
  }

  return { ok: true, reason: "consistent", ...facts };
}
// [SCOPE 127 / T013] END

// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
function main(argv) {
  const args = argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const adapterPath = get("--adapter");
  const inventoryPath = get("--inventory");
  const root = get("--root") || process.cwd();
  const json = args.includes("--json");

  const scope = args.flatMap((a, i) => (a === "--scope" && args[i + 1] ? [args[i + 1]] : []));

  if (!adapterPath || !inventoryPath) {
    console.error(
      "usage: inventory-guard.mjs --adapter <adapter.md> --inventory <inventory.json> [--root <repo>] " +
        "[--scope <dir>]... [--allow-empty] [--json]",
    );
    process.exit(2);
  }
  if (!existsSync(adapterPath) || !existsSync(inventoryPath)) {
    console.error(`not found: ${!existsSync(adapterPath) ? adapterPath : inventoryPath}`);
    process.exit(2);
  }

  let inventory;
  try {
    inventory = JSON.parse(readFileSync(inventoryPath, "utf-8"));
  } catch (e) {
    console.error(`inventory is not valid JSON: ${e instanceof Error ? e.message : e}`);
    process.exit(3);
  }

  const r = guardInventory({ adapterPath, inventory, root, allowEmpty: args.includes("--allow-empty"), scope });

  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const out = r.ok ? console.log : console.error;
    out(
      r.ok
        ? `inventory-guard: OK (${r.reason}) — ${r.units} unit(s)` +
            (r.signalFiles !== undefined ? `; signal finds ${r.signalHits} registration(s) in ${r.signalFiles} file(s)` : "")
        : `inventory-guard: REFUSED (${r.reason})\n  ${r.message}`,
    );
    if (r.scope?.length) {
      out(`  scope: ${r.scope.join(", ")} — ${r.outOfScope} registration(s) outside it were not checked`);
    }
    for (const m of (r.matched ?? []).slice(0, 25)) {
      const flag = m.units < m.registrations ? "  << under-counted" : "";
      out(`    ${m.file}${m.kind ? ` [${m.kind}]` : ""}: ${m.registrations} registration(s), ${m.units} inventoried${flag}`);
    }
    if ((r.matched?.length ?? 0) > 25) out(`    … and ${r.matched.length - 25} more file(s) (--json lists all)`);
    if (!r.ok) out("  Do not plan against this inventory. Fix the inventory, or the adapter's signal, and re-run.");
  }

  process.exit(r.ok ? 0 : 3);
}
// [SCOPE 127 / T013] END

if (process.argv[1]?.endsWith("inventory-guard.mjs")) main(process.argv);
