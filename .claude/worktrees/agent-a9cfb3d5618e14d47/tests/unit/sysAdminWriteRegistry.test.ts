/**
 * SPEC-147 / T001 (FR-002) — every SysAdmin route that changes data is in the write registry.
 * Static, so it needs no database: it reads src/server/app.ts for every router mounted under
 * /api/sysadmin, then each router file for its POST/PUT/PATCH/DELETE calls (multi-line included).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYSADMIN_WRITE_REGISTRY } from "../../src/server/routes/sysAdminWriteRegistry.js";

// [SCOPE 147 / T001] BEGIN — discover the mounted SysAdmin routers and their mutating routes
const ROOT = path.resolve(__dirname, "../..");
const app = readFileSync(path.join(ROOT, "src/server/app.ts"), "utf8");

// local name in app.ts → { file, exported }: `import x from` (exported "default") and
// `import { a as b, c } from` (exported "a" / "c") are both understood.
const imports = new Map<string, { file: string; exported: string }>();
for (const m of app.matchAll(/^import\s+(\w+)\s+from\s+["']\.\/routes\/([\w./-]+)\.js["']/gm)) {
  imports.set(m[1], { file: m[2], exported: "default" });
}
for (const m of app.matchAll(/^import\s+\{([^}]+)\}\s+from\s+["']\.\/routes\/([\w./-]+)\.js["']/gm)) {
  for (const part of m[1].split(",")) {
    const [exported, local] = part.trim().split(/\s+as\s+/);
    if (exported) imports.set((local ?? exported).trim(), { file: m[2], exported: exported.trim() });
  }
}

const mounts: Array<{ mount: string; file: string; routerVar: string }> = [];
for (const m of app.matchAll(/app\.use\(\s*["'](\/api\/sysadmin[^"']*)["']\s*,\s*(\w+)\s*\)/g)) {
  const imp = imports.get(m[2]);
  if (!imp) continue;
  const src = readFileSync(path.join(ROOT, "src/server/routes", `${imp.file}.ts`), "utf8");
  const routerVar = imp.exported === "default" ? (src.match(/export\s+default\s+(\w+)/)?.[1] ?? "router") : imp.exported;
  mounts.push({ mount: m[1], file: imp.file, routerVar });
}

const discovered = new Map<string, string>();
const guardedFiles: Record<string, boolean> = {};
for (const { mount, file, routerVar } of mounts) {
  const src = readFileSync(path.join(ROOT, "src/server/routes", `${file}.ts`), "utf8");
  guardedFiles[`${file}:${routerVar}`] = new RegExp(`${routerVar}\\.use\\(\\s*requireSysAdmin\\s*\\)`).test(src);
  const routeRe = new RegExp(`${routerVar}\\.(post|put|patch|delete)\\(\\s*["']([^"']+)["']`, "g");
  for (const r of src.matchAll(routeRe)) {
    const key = `${r[1].toUpperCase()} ${mount}${r[2] === "/" ? "" : r[2]}`;
    discovered.set(key, file);
  }
}
const registryKeys = Object.keys(SYSADMIN_WRITE_REGISTRY);
// [SCOPE 147 / T001] END

// [SCOPE 147 / T001] BEGIN — the registry and the routers agree
describe("SysAdmin write registry (FR-002)", () => {
  it("finds the SysAdmin routers mounted in app.ts", () => {
    expect(mounts.length).toBeGreaterThanOrEqual(8);
  });

  it("every mounted SysAdmin router is guarded by requireSysAdmin router-wide", () => {
    expect(Object.entries(guardedFiles).filter(([, g]) => !g).map(([f]) => f)).toEqual([]);
  });

  it("every SysAdmin route that changes data is declared (US5)", () => {
    expect([...discovered.keys()].filter((k) => !(k in SYSADMIN_WRITE_REGISTRY))).toEqual([]);
  });

  it("every registry entry names a route that exists", () => {
    expect(registryKeys.filter((k) => !discovered.has(k))).toEqual([]);
  });

  it("covers the 87 routes re-counted at implement (84 scoped + 3 feature-snippets)", () => {
    expect(discovered.size).toBe(87);
  });

  it("every readOnly entry carries a reason; every write entry is well formed", () => {
    const bad: string[] = [];
    for (const [k, e] of Object.entries(SYSADMIN_WRITE_REGISTRY)) {
      if ("readOnly" in e) {
        if (!e.readOnly.trim()) bad.push(`${k}: empty readOnly reason`);
        continue;
      }
      if (!/^sysadmin_[a-z0-9_]+$/.test(e.action)) bad.push(`${k}: action ${e.action}`);
      if ((e.kind === "update" || e.kind === "delete") && !e.lookup) bad.push(`${k}: ${e.kind} without lookup`);
      if (e.kind === "bulk" && !e.idsField) bad.push(`${k}: bulk without idsField`);
    }
    expect(bad).toEqual([]);
  });
});
// [SCOPE 147 / T001] END
