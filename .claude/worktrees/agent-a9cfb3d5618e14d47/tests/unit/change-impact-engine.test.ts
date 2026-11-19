// SCOPE-137 / T001 — the shared Change Impact engine.
//
// Two things matter here. First, the engine must keep producing exactly what
// project.report_change_impact (SCOPE-111) always got, because a changed
// retest selection silently changes which human signoffs are invalidated.
// Second, every report must say what it checked and what it could not read:
// a partial list that looks complete is worse than none (FR-004).
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  analyzeChange,
  classifyEdgeless,
  migrationTables,
} from "../../_wxAI/impact/lib/graph.mjs";
import { buildReport, renderSummary, parseLines, LINK_TYPES, provenProfiles, toImpactGraph } from "../../_wxAI/impact/change-impact.mjs";
import { FIXTURES, proveFixture } from "../../_wxAI/impact/prove.mjs";
import { validateAdapter, validateLinksProof } from "../../_wxAI/adapters/validate-adapter.mjs";
import { extractPolyglot } from "../../_wxAI/impact/lib/polyglot.mjs";
import { IMPACT_MODES, classifyImpact, dataLossChanges, dataLossIn, decide, readImpactMode, schemaRemovals, scopesAtLines } from "../../_wxAI/impact/lib/classify.mjs";
import { loadFacts } from "../../_wxAI/impact/lib/facts.mjs";
import { loadTypeScript, exportedDeclarations, changedExports } from "../../_wxAI/impact/lib/exports.mjs";
import { loadAliases, parseJsonc } from "../../_wxAI/impact/lib/aliases.mjs";
import { scanSchema } from "../../_wxAI/impact/lib/data.mjs";
import { extractKeys } from "../../_wxAI/impact/lib/strings.mjs";
import { fencedScopes } from "../../_wxAI/impact/lib/scopes.mjs";
import { urlMatchesRoute } from "../../_wxAI/impact/lib/routes.mjs";

const root = mkdtempSync(join(tmpdir(), "change-impact-"));
const put = (rel: string, body: string) => {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, body);
};

// a.ts <- b.ts <- c.tsx ; b.ts -> util.ts ; d.ts is unrelated
put("src/a.ts", "export const a = 1;\n");
put("src/util.ts", "export const u = 2;\n");
put("src/b.ts", "import { a } from './a.js';\nimport { u } from './util';\nexport const b = a + u;\n");
put("src/c.tsx", "import { b } from './b';\nexport const C = () => b;\n");
put("src/d.ts", "export const d = 4;\n");
put("node_modules/x/index.js", "import '../../src/a';\n"); // skipped directory
put(
  "src/db/migrations/0001_init.sql",
  "-- touches nothing named in this comment: ghosttable\nALTER TABLE projects ADD COLUMN x int;\nCREATE INDEX idx ON tasks (projectid);\n",
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("SCOPE-137 T001 — shared engine graph", () => {
  it("reaches transitive dependents and keeps the shortest path", () => {
    const r = analyzeChange({ root, changedFiles: ["src/a.ts"] });
    const reached = r.reached.map((x: { dependentPath: string }) => x.dependentPath).sort();
    expect(reached).toEqual(["src/b.ts", "src/c.tsx"]);
    const c = r.reached.find((x: { dependentPath: string }) => x.dependentPath === "src/c.tsx");
    expect(c.path).toEqual(["src/a.ts", "src/b.ts", "src/c.tsx"]);
  });

  it("builds the forward direction too (what a file relies on)", () => {
    const r = analyzeChange({ root, changedFiles: ["src/b.ts"] });
    expect([...(r.dependencies.get("src/b.ts") ?? [])].sort()).toEqual(["src/a.ts", "src/util.ts"]);
  });

  it("ignores skipped directories like node_modules", () => {
    const r = analyzeChange({ root, changedFiles: ["src/a.ts"] });
    expect(r.reached.some((x: { dependentPath: string }) => x.dependentPath.startsWith("node_modules"))).toBe(false);
  });

  it("declares broad rather than truncating past the cap", () => {
    const r = analyzeChange({ root, changedFiles: ["src/a.ts"], max: 1 });
    expect(r.broad).toBe(true);
    expect(r.broadReason).toMatch(/exceeds the 1 cap/);
  });

  it("extracts migration tables and ignores tables named only in comments", () => {
    expect(classifyEdgeless("src/db/migrations/0001_init.sql")).toBe("migration");
    expect(migrationTables(root, "src/db/migrations/0001_init.sql").sort()).toEqual(["projects", "tasks"]);
  });
});

describe("SCOPE-137 T002 — aliases and component file types (FR-005)", () => {
  const aroot = mkdtempSync(join(tmpdir(), "change-impact-alias-"));
  const aput = (rel: string, body: string) => {
    const full = join(aroot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  // tsconfig with comments, a "./src/*" string a naive stripper would cut, and a trailing comma.
  aput(
    "tsconfig.json",
    '{\n  // comment\n  "compilerOptions": {\n    /* block */ "baseUrl": ".",\n    "paths": { "@/*": ["./src/*"], "#lib": ["./lib/index.ts"], },\n  },\n}\n',
  );
  aput("vite.config.ts", "export default { resolve: { alias: { '@ui': path.resolve(__dirname, './src/ui') } } };\n");
  aput("src/ui/Button.tsx", "export const Button = () => null;\n");
  aput("lib/index.ts", "export const lib = 1;\n");
  aput("src/pages/Home.vue", "<script setup lang=\"ts\">\nimport { Button } from '@/ui/Button';\n</script>\n");
  aput("src/pages/Card.svelte", "<script>\nimport { Button } from '@ui/Button';\n</script>\n");
  aput("src/pages/About.astro", "---\nimport { lib } from '#lib';\n---\n<h1>About</h1>\n");
  afterAll(() => rmSync(aroot, { recursive: true, force: true }));

  it("parses JSONC without cutting strings that contain /*", () => {
    expect(parseJsonc('{ "a": "./src/*", /* c */ "b": 1, }')).toEqual({ a: "./src/*", b: 1 });
  });

  it("reads tsconfig paths (wildcard and exact) and Vite aliases", () => {
    const prefixes = loadAliases(aroot).map((a: { prefix: string }) => a.prefix);
    expect(prefixes).toEqual(expect.arrayContaining(["@/", "#lib", "@ui/"]));
  });

  it("follows alias imports from .vue, .svelte and .astro files", () => {
    const button = analyzeChange({ root: aroot, changedFiles: ["src/ui/Button.tsx"] });
    expect(button.reached.map((x: { dependentPath: string }) => x.dependentPath).sort()).toEqual([
      "src/pages/Card.svelte",
      "src/pages/Home.vue",
    ]);
    const lib = analyzeChange({ root: aroot, changedFiles: ["lib/index.ts"] });
    expect(lib.reached.map((x: { dependentPath: string }) => x.dependentPath)).toEqual(["src/pages/About.astro"]);
  });
});

describe("SCOPE-137 T005 — data links (FR-002 (4)–(6))", () => {
  const droot = mkdtempSync(join(tmpdir(), "change-impact-data-"));
  const dput = (rel: string, body: string) => {
    const full = join(droot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  dput(
    "src/db/schema.ts",
    [
      'export const companies = pgTable("companies", { id: uuid("id") });',
      'export const projects = pgTable("projects", { id: uuid("id"), companyid: uuid("companyid").references(() => companies.id) });',
      "",
    ].join("\n"),
  );
  // Writer and reader share the projects table but never import each other.
  dput("src/server/ProjectWriter.ts", "import { projects } from '../db/schema';\nexport async function save(db) { await db.insert(projects).values({}); }\n");
  dput("src/server/ProjectReader.ts", "import { projects } from '../db/schema';\nexport async function list(db) { return db.select().from(projects); }\n");
  dput("src/server/RawReport.ts", "export async function r(client) { return client.query(`SELECT * FROM projects`); }\n");
  dput("src/server/Unrelated.ts", "export const x = 1;\n");
  dput("src/db/migrations/0002_companies.sql", "ALTER TABLE companies ADD COLUMN vat text;\n");
  afterAll(() => rmSync(droot, { recursive: true, force: true }));

  const reachedBy = (changed: string, type = "table") =>
    buildReport({ root: droot, changedFiles: [changed] })
      .links.filter((l: { type: string; direction: string }) => l.type === type && l.direction === "dependent");

  it("reads table declarations and foreign keys", () => {
    const files = ["src/db/schema.ts"];
    const s = scanSchema(droot, files);
    expect([...s.tables.values()].map((t: { sql: string }) => t.sql).sort()).toEqual(["companies", "projects"]);
    expect(s.fks).toEqual([{ from: "projects", to: "companies", file: "src/db/schema.ts" }]);
  });

  it("a writer reaches every reader of the table it writes, labeled by the reader's own evidence", () => {
    const reached = reachedBy("src/server/ProjectWriter.ts");
    const byFile = Object.fromEntries(reached.map((l: { to: string; confidence: string }) => [l.to, l.confidence]));
    expect(byFile["src/server/ProjectReader.ts"]).toBe("Confirmed"); // Drizzle
    expect(byFile["src/server/RawReport.ts"]).toBe("Likely"); // raw SQL
    expect(byFile["src/server/Unrelated.ts"]).toBeUndefined();
  });

  it("a reader's change does not fan out to other users of the table", () => {
    expect(reachedBy("src/server/ProjectReader.ts")).toEqual([]);
  });

  it("a migration reaches users of the table and, through the foreign key, users of tables referencing it", () => {
    const fk = reachedBy("src/db/migrations/0002_companies.sql", "foreign-key");
    expect(fk.map((l: { to: string }) => l.to)).toEqual(["table:projects"]);
    const users = reachedBy("src/db/migrations/0002_companies.sql").map((l: { to: string }) => l.to).sort();
    expect(users).toEqual(["src/server/ProjectReader.ts", "src/server/ProjectWriter.ts", "src/server/RawReport.ts"]);
  });
});

describe("SCOPE-137 T006 — named strings and scopes (FR-002 (7)–(8))", () => {
  const sroot = mkdtempSync(join(tmpdir(), "change-impact-strings-"));
  const sput = (rel: string, body: string) => {
    const full = join(sroot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  sput(
    "src/server/tools.ts",
    "// [SCOPE 010 / T001] BEGIN — tool\nexport function handle(name) { switch (name) { case 'project.create_specs': return 1; } }\n// [SCOPE 010 / T001] END\n",
  );
  sput(
    "src/client/caller.ts",
    "// [SCOPE 020 / T004] BEGIN — caller\nexport const call = () => mcp.call('project.create_specs');\n// [SCOPE 020 / T004] END\n",
  );
  sput("src/server/a.ts", "export const k = process.env.STRIPE_KEY;\nbus.emit('scope:changed', 1);\n");
  sput("src/server/b.ts", "export const k2 = process.env['STRIPE_KEY'];\n");
  sput("src/server/c.ts", "bus.on('scope:changed', () => {});\n");
  sput("src/server/d.ts", "// [SCOPE 030 / FR-001] BEGIN — not a real fence label\nexport const d = 1;\n");
  afterAll(() => rmSync(sroot, { recursive: true, force: true }));

  it("extracts tool names, env vars, and event names", () => {
    expect([...extractKeys("x('project.list_open_items'); process.env.DB_URL; emitter.on('job:done', f)")].sort()).toEqual([
      "env:DB_URL",
      "event:job:done",
      "tool:project.list_open_items",
    ]);
  });

  it("links files that share a name, labeled Likely", () => {
    const report = buildReport({ root: sroot, changedFiles: ["src/server/a.ts"] });
    const ns = report.links.filter((l: { type: string }) => l.type === "named-string");
    expect(ns.map((l: { to: string }) => l.to).sort()).toEqual(["src/server/b.ts", "src/server/c.ts"]);
    expect(ns.every((l: { confidence: string }) => l.confidence === "Likely")).toBe(true);
  });

  it("maps files to scopes through fences and flags scopes other than the change's own", () => {
    const report = buildReport({ root: sroot, changedFiles: ["src/server/tools.ts"] });
    expect(report.scopes.ownScopes).toEqual(["010"]);
    expect(report.scopes.reachedScopes).toEqual(["020"]);
    const other = report.links.find((l: { type: string; direction: string }) => l.type === "scope" && l.direction === "dependent");
    expect(other.otherScope).toBe(true);
  });

  it("ignores fence-like comments whose label is not Tnnn", () => {
    expect(fencedScopes("// [SCOPE 030 / FR-001] BEGIN — x")).toEqual([]);
    expect(fencedScopes("// [SCOPE 031 / T002] BEGIN — y")).toEqual(["031"]);
  });
});

describe("SCOPE-137 T004 — client URL to server route (FR-002 (3))", () => {
  const rroot = mkdtempSync(join(tmpdir(), "change-impact-routes-"));
  const rput = (rel: string, body: string) => {
    const full = join(rroot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  rput(
    "src/server/app.ts",
    "import projectsRoutes from './routes/projects.js';\nimport { adminRouter } from './routes/admin';\napp.use('/api/projects', requireAuth, projectsRoutes);\napp.use('/api/admin', adminRouter);\n",
  );
  rput("src/server/routes/projects.ts", "import { svc } from '../services/ProjectService';\nconst router = Router();\nrouter.get('/:projectId/tasks', h);\nrouter.post('/', h);\nexport default router;\n");
  rput("src/server/routes/admin.ts", "export const adminRouter = Router();\nadminRouter.post('/users/:id/verify', h);\n");
  rput("src/server/services/ProjectService.ts", "export const svc = 1;\n");
  rput("src/client/pages/Tasks.tsx", "export const T = () => fetch(`/api/projects/${id}/tasks?x=1`);\n");
  rput("src/client/pages/Admin.tsx", "export const A = () => fetch(`/api/admin/users/${userId}/verify`, { method: 'POST' });\n");
  rput("src/client/pages/Other.tsx", "export const O = () => fetch('/api/settings');\n");
  afterAll(() => rmSync(rroot, { recursive: true, force: true }));

  it("matches URL templates to routes segment by segment", () => {
    expect(urlMatchesRoute("/api/projects/${id}/tasks", "/api/projects/:projectId/tasks")).toBe(true);
    expect(urlMatchesRoute("/api/projects/${id}", "/api/projects/:projectId/tasks")).toBe(false);
    expect(urlMatchesRoute("/api/settings", "/api/projects")).toBe(false);
  });

  it("a route handler change reaches the screens that call it, through mount prefixes and named imports", () => {
    const report = buildReport({ root: rroot, changedFiles: ["src/server/routes/admin.ts"] });
    const url = report.links.filter((l: { type: string; direction: string }) => l.type === "url-route" && l.direction === "dependent");
    expect(url.map((l: { to: string }) => l.to)).toEqual(["src/client/pages/Admin.tsx"]);
    expect(url[0].confidence).toBe("Likely");
  });

  it("a service change reaches the route that imports it, then the screens calling that route", () => {
    const report = buildReport({ root: rroot, changedFiles: ["src/server/services/ProjectService.ts"] });
    const screens = report.links
      .filter((l: { type: string; direction: string }) => l.type === "url-route" && l.direction === "dependent")
      .map((l: { to: string }) => l.to);
    expect(screens).toEqual(["src/client/pages/Tasks.tsx"]);
  });
});

describe("SCOPE-137 T003 — facts cache and function-level references (FR-002 (2), FR-003)", () => {
  const froot = mkdtempSync(join(tmpdir(), "change-impact-facts-"));
  const fput = (rel: string, body: string) => {
    const full = join(froot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  fput(
    "src/lib/math.ts",
    "export function add(a: number, b: number) {\n  return a + b;\n}\n\nexport function sub(a: number, b: number) {\n  return a - b;\n}\n\nexport default function mul(a: number, b: number) {\n  return a * b;\n}\n",
  );
  fput("src/useAdd.ts", "import { add } from './lib/math';\nexport const x = add(1, 2);\n");
  fput("src/useSub.ts", "import { sub as minus } from './lib/math';\nexport const y = minus(3, 1);\n");
  fput("src/useNs.ts", "import * as m from './lib/math';\nexport const z = m.add(2, 2);\n");
  fput("src/useDefault.ts", "import mul from './lib/math';\nexport const w = mul(2, 3);\n");
  fput("src/barrel.ts", "export { add } from './lib/math';\n");
  fput("src/viaBarrel.ts", "import { add } from './barrel';\nexport const v = add(5, 5);\n");
  afterAll(() => rmSync(froot, { recursive: true, force: true }));

  it("reuses unchanged files and re-extracts a file changed outside the editor", () => {
    const cacheFile = join(froot, ".wxai", "impact-index", "facts.json");
    const files = ["src/lib/math.ts", "src/useAdd.ts"];
    const extract = (src: string) => ({ len: src.length });
    expect(loadFacts(froot, files, extract, { cacheFile }).stats).toMatchObject({ reused: 0, extracted: 2 });
    expect(loadFacts(froot, files, extract, { cacheFile }).stats).toMatchObject({ reused: 2, extracted: 0 });
    fput("src/useAdd.ts", "import { add } from './lib/math';\nexport const x = add(1, 2) + 1;\n"); // size changes
    expect(loadFacts(froot, files, extract, { cacheFile }).stats).toMatchObject({ reused: 1, extracted: 1 });
  });

  it("finds exported declarations and which ones a line range touched (TypeScript and fallback)", () => {
    const src = "export function add() {\n  return 1;\n}\n\nexport function sub() {\n  return 2;\n}\n";
    const ts = loadTypeScript(process.cwd());
    for (const parser of [ts, null]) {
      const { decls } = exportedDeclarations(src, "x.ts", parser);
      expect(changedExports(decls, [[5, 6]])).toEqual(["sub"]);
      expect(changedExports(decls, [[1, 1]])).toEqual(["add"]);
    }
  });

  it("narrows importers to those using the changed export, through aliases, namespaces, defaults and re-exports", () => {
    const report = buildReport({
      root: froot,
      changedFiles: ["src/lib/math.ts"],
      precise: true,
      ranges: parseLines("src/lib/math.ts:1-3"), // only `add` changed
      useCache: false,
    });
    const f = report.functionLevel.files[0];
    expect(f.symbols).toEqual(["add"]);
    expect(f.using.map((u: { file: string }) => u.file).sort()).toEqual(["src/useAdd.ts", "src/useNs.ts", "src/viaBarrel.ts"]);
    expect(f.notUsing.sort()).toEqual(["src/barrel.ts", "src/useDefault.ts", "src/useSub.ts"]);
    expect(report.linkTypes.notChecked).toEqual([]);
  });

  it("treats a changed default export as used by default importers only", () => {
    const report = buildReport({ root: froot, changedFiles: ["src/lib/math.ts"], precise: true, ranges: parseLines("src/lib/math.ts:9-11"), useCache: false });
    expect(report.functionLevel.files[0].using.map((u: { file: string }) => u.file)).toEqual(["src/useDefault.ts"]);
  });
});

describe("SCOPE-137 T007 — every offered stack (FR-004, FR-005)", () => {
  const proot = mkdtempSync(join(tmpdir(), "change-impact-poly-"));
  const pput = (rel: string, body: string) => {
    const full = join(proot, rel);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, body);
  };
  // A FastAPI backend with a React client, SQLAlchemy models, and an env var.
  pput("api/routers/items.py", "from app.models import Item\n@router.get('/api/items/{item_id}')\ndef read_item(item_id):\n    return session.query(Item).get(item_id)\n");
  pput("api/services/writer.py", "import os\nKEY = os.environ.get('PAY_KEY')\ndef save():\n    db.execute('INSERT INTO items (id) VALUES (1)')\n");
  pput("api/services/reader.py", "def list_items():\n    return db.execute('SELECT * FROM items')\n");
  pput("api/billing.py", "import os\nk = os.getenv('PAY_KEY')\n");
  pput("api/app/models.py", "class Item(Base):\n    __tablename__ = 'items'\n");
  pput("api/uses_models.py", "from app.models import Item\n");
  pput("web/src/pages/Item.tsx", "export const I = () => fetch(`/api/items/${id}`);\n");
  pput("web/src/pages/Other.tsx", "export const O = () => fetch('/api/other');\n");
  pput("tools/deploy.zig", "const x = 1;\n");
  pput("README.txt", "deploy instructions: run deploy\n");
  afterAll(() => rmSync(proot, { recursive: true, force: true }));

  const links = (changed: string, type?: string) =>
    buildReport({ root: proot, changedFiles: [changed], useCache: false })
      .links.filter((l: { type: string; direction: string }) => l.direction === "dependent" && (!type || l.type === type));

  it("a Python route change reaches the React screen that calls it (Likely)", () => {
    const url = links("api/routers/items.py", "url-route");
    expect(url.map((l: { to: string }) => l.to)).toEqual(["web/src/pages/Item.tsx"]);
    expect(url[0].confidence).toBe("Likely");
  });

  it("a Python writer reaches readers of the same table, and modules importing a changed module", () => {
    // The model that declares the table (__tablename__) is a user of it too.
    expect(links("api/services/writer.py", "table").map((l: { to: string }) => l.to).sort()).toEqual([
      "api/app/models.py",
      "api/services/reader.py",
    ]);
    expect(links("api/app/models.py", "import").map((l: { to: string }) => l.to).sort()).toEqual(["api/routers/items.py", "api/uses_models.py"]);
  });

  it("env vars read through a profile feed the named-string links", () => {
    expect(links("api/services/writer.py", "named-string").map((l: { to: string }) => l.to)).toEqual(["api/billing.py"]);
  });

  it("reports which stacks were read and how", () => {
    const report = buildReport({ root: proot, changedFiles: ["api/billing.py"], useCache: false });
    expect(report.languages.python).toMatchObject({ read: "built-in profile", confidence: "Likely" });
    expect(report.languages["js-ts"]).toMatchObject({ read: "native", confidence: "Confirmed" });
  });

  it("an unreadable file type is not read, but still gets a labeled text-mention check", () => {
    const report = buildReport({ root: proot, changedFiles: ["tools/deploy.zig"], useCache: false });
    expect(report.notRead).toEqual(["tools/deploy.zig"]);
    expect(report.readByFallback).toBe(true);
  });

  it("a MongoDB project reports collections and marks foreign keys not applicable", () => {
    const mroot = mkdtempSync(join(tmpdir(), "change-impact-mongo-"));
    mkdirSync(join(mroot, "src"), { recursive: true });
    writeFileSync(join(mroot, "stack.md"), "| Dimension | Choice |\n|---|---|\n| Database | MongoDB |\n");
    writeFileSync(join(mroot, "src/writer.ts"), "export const w = () => db.collection('orders').insertOne({});\n");
    writeFileSync(join(mroot, "src/reader.ts"), "export const r = () => db.collection('orders').find({});\n");
    const report = buildReport({ root: mroot, changedFiles: ["src/writer.ts"], useCache: false });
    expect(report.dataModel).toBe("document");
    expect(report.linkTypes.notApplicable.map((t: { type: string }) => t.type)).toEqual(["foreign-key"]);
    const t = report.links.filter((l: { type: string; direction: string }) => l.type === "table" && l.direction === "dependent");
    expect(t.map((l: { to: string; via: string }) => [l.to, l.via])).toEqual([["src/reader.ts", "table:collection:orders"]]);
    rmSync(mroot, { recursive: true, force: true });
  });
});

describe("SCOPE-137 T001 — honest report (FR-004)", () => {
  it("names checked and not-checked link types, and lists unreadable files", () => {
    const report = buildReport({ root, changedFiles: ["src/a.ts", "src/db/migrations/0001_init.sql", "docs/spec.pdf"] });
    expect(report.linkTypes.checked.map((t: { type: string }) => t.type).sort()).toEqual([
      "foreign-key", "import", "migration", "named-string", "scope", "table", "url-route",
    ]);
    expect(report.linkTypes.notChecked.map((t: { type: string }) => t.type).sort()).toEqual(["export-usage"]);
    expect(report.notRead).toEqual(["docs/spec.pdf"]);
    expect(report.links.some((l: { type: string; to: string }) => l.type === "migration" && l.to === "table:projects")).toBe(true);
    expect(report.links.every((l: { confidence: string }) => l.confidence === "Confirmed")).toBe(true);
  });

  it("never reports zero affected for a change it cannot read", () => {
    // .cs is now read through the C# profile (T007), so use a type no parser or profile reads.
    const report = buildReport({ root, changedFiles: ["app/Main.zig"] });
    expect(report.notRead).toEqual(["app/Main.zig"]);
    const summary = renderSummary(report);
    expect(summary).toMatch(/Not read \(file type not supported\):\*\* app\/Main\.zig/);
  });
});

describe("SCOPE-137 T015 — proof fixtures and the adapter validator rule (FR-014)", () => {
  it("SC-1: the JS/TS fixture seeds all eight link types, and every fixture passes", () => {
    const seeded = new Set(FIXTURES.native.cases.flatMap((c) => (c.expect ?? []).map((e) => e.type)));
    expect([...seeded].sort()).toEqual(LINK_TYPES.map((t) => t.type).sort());
    for (const [profile, fixture] of Object.entries(FIXTURES)) {
      const result = proveFixture(fixture);
      expect({ profile, problems: result.cases.flatMap((c) => c.problems) }).toEqual({ profile, problems: [] });
    }
  });

  it("every shipped adapter has a fixture for the profile it names", () => {
    for (const name of ["wxkanban-express", "dotnet-wpf"]) {
      const src = readFileSync(join("_wxAI", "adapters", `${name}.md`), "utf8");
      const profile = /^\*\*Links profile:\*\*\s*([\w-]+)/m.exec(src)?.[1] ?? "";
      expect(FIXTURES).toHaveProperty(profile);
    }
  });

  it("SC-8: a passed proof line is refused without a profile, without a fixture, or when the fixture fails", () => {
    const proof = (profile: string | null, line: string) =>
      `${profile ? `**Links profile:** ${profile}\n` : ""}**Links proof:** ${line}\n`;
    expect(validateLinksProof(proof("python", "not run — links stay Likely"))).toEqual([]);
    expect(validateLinksProof(proof(null, "passed")).map((f) => f.problem)).toEqual(["no-profile"]);
    expect(validateLinksProof(proof("python", "passed")).map((f) => f.problem)).toEqual(["no-fixture"]);
    const failing = () => ({ name: "x", profile: "csharp", passed: false, cases: [{ name: "c", passed: false, problems: ["missing table link to y"] }] });
    const refused = validateLinksProof(proof("csharp", "passed"), { prove: failing });
    expect(refused.map((f) => f.problem)).toEqual(["fixture-failed"]);
    expect(refused[0].detail).toMatch(/missing table link to y/);
    expect(validateLinksProof(proof("csharp", "passed"))).toEqual([]);
  });

  it("SC-8: the shipped adapters stay valid while their proof reads 'not run'", () => {
    for (const name of ["wxkanban-express", "dotnet-wpf"]) {
      const r = validateAdapter(join("_wxAI", "adapters", `${name}.md`));
      expect(r.failures.filter((f) => f.id === "links-proof")).toEqual([]);
    }
  });

  it("joins class-level route bases: ASP.NET relative only, Spring always", () => {
    const cs = extractPolyglot('[Route("api/items")]\n[HttpGet("{id}")]\n[HttpGet("/health")]\n', "A.cs");
    expect(cs?.routes).toEqual(expect.arrayContaining([["GET", "/api/items/:id"], ["GET", "/health"]]));
    expect(cs?.routes).not.toContainEqual(["GET", "/api/items/health"]);
    const java = extractPolyglot('@RequestMapping("/api/orders")\n@GetMapping("/{id}")\n', "A.java");
    expect(java?.routes).toContainEqual(["GET", "/api/orders/:id"]);
  });

  it("a proven profile's links carry the native label; unproven stay Likely", () => {
    const proj = mkdtempSync(join(tmpdir(), "impact-proven-"));
    try {
      const write = (rel: string, body: string) => {
        mkdirSync(join(proj, rel, ".."), { recursive: true });
        writeFileSync(join(proj, rel), body);
      };
      write("Api/Writer.cs", "public class W { void S(Item i) { _db.Items.Add(i); } }\n");
      write("Api/Report.cs", 'using Shop.Writer;\npublic class R { object A() => Q("SELECT * FROM items"); }\n');
      const link = (type: string) =>
        buildReport({ root: proj, changedFiles: ["Api/Writer.cs"], useCache: false }).links.find((l) => l.type === type);
      expect(link("table")?.confidence).toBe("Likely");
      write(".wxai/adapters/aspnet.md", "**Links profile:** csharp\n**Links proof:** passed\n");
      expect(provenProfiles(proj)).toEqual(new Set(["csharp"]));
      expect(link("table")?.confidence).toBe("Confirmed");
      // The C# fixture does not prove namespace imports, so they are not promoted.
      expect(link("import")?.confidence).toBe("Likely");
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

describe("SCOPE-137 T008 — Impact Boundary, data loss and impactMode (FR-006, FR-007)", () => {
  it("FR-007: the decision table, in every mode", () => {
    const cases: Array<[string, { hasImpact: boolean; boundary: boolean; dataLoss: boolean }, string[]]> = [
      ["no impact", { hasImpact: false, boundary: false, dataLoss: false }, ["none", "none", "none"]],
      ["impact, no boundary", { hasImpact: true, boundary: false, dataLoss: false }, ["notify", "notify", "ask"]],
      ["boundary", { hasImpact: true, boundary: true, dataLoss: false }, ["notify", "ask", "ask"]],
      ["data loss", { hasImpact: false, boundary: false, dataLoss: true }, ["stop", "stop", "stop"]],
    ];
    for (const [, input, expected] of cases) {
      expect(IMPACT_MODES.map((m) => decide(m, input))).toEqual(expected);
    }
  });

  it("FR-007: a missing setting behaves as boundaries; an unknown one too, with a warning", () => {
    const proj = mkdtempSync(join(tmpdir(), "impact-mode-"));
    try {
      expect(readImpactMode(proj)).toEqual({ mode: "boundaries", source: "default" });
      mkdirSync(join(proj, ".wxai"));
      writeFileSync(join(proj, ".wxai", "project.json"), JSON.stringify({ impactMode: "always" }));
      expect(readImpactMode(proj)).toEqual({ mode: "always", source: "project.json" });
      writeFileSync(join(proj, ".wxai", "project.json"), JSON.stringify({ impactMode: "never" }));
      expect(readImpactMode(proj).mode).toBe("boundaries");
      expect(readImpactMode(proj).warning).toMatch(/not one of/);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("SC-5: a drop-column migration is possible data loss; constraints and defaults are not", () => {
    const found = dataLossIn(
      'ALTER TABLE "items" DROP COLUMN "sku";\n' +
        "ALTER TABLE orders DROP CONSTRAINT orders_fk, DROP COLUMN note;\n" +
        "ALTER TABLE users ALTER COLUMN name DROP DEFAULT;\n" +
        "-- DROP TABLE commented_out;\n" +
        "DROP TABLE IF EXISTS legacy;\n" +
        "ALTER TABLE t ALTER COLUMN amount TYPE integer;\n",
    );
    expect(found.map((f) => [f.kind, f.table, f.column ?? null])).toEqual([
      ["drop-column", "items", "sku"],
      ["drop-column", "orders", "note"],
      ["drop-table", "legacy", null],
      ["column-type", "t", "amount"],
    ]);
  });

  it("mass deletes and updates without a filter are data loss; filtered ones and Map.delete are not", () => {
    const kinds = (src: string) => dataLossIn(src).map((f) => f.kind);
    expect(kinds("await db.delete(items);")).toEqual(["mass-delete"]);
    expect(kinds("await db.delete(items).where(eq(items.id, id));")).toEqual([]);
    expect(kinds("await db.update(items).set({ sku: null });")).toEqual(["mass-update"]);
    expect(kinds("cache.delete(key); seen.delete(id);")).toEqual([]);
    expect(kinds("DELETE FROM sessions;")).toEqual(["mass-delete"]);
    expect(kinds("DELETE FROM sessions WHERE expires < now();")).toEqual([]);
    expect(kinds("UPDATE users SET active = false;")).toEqual(["mass-update"]);
    expect(kinds("REFERENCES users(id) ON UPDATE CASCADE;")).toEqual([]);
    expect(kinds("await prisma.user.deleteMany();")).toEqual(["mass-delete"]);
    expect(kinds("await coll.deleteMany({ old: true });")).toEqual([]);
    expect(kinds("User.delete_all")).toEqual(["mass-delete"]);
  });

  it("only data loss the change introduces counts, plus columns removed from a Drizzle schema", () => {
    const before = 'export const items = pgTable("items", {\n  id: uuid("id"),\n  sku: text("sku"),\n  meta: jsonb("meta").default({ a: 1 }),\n});\nDELETE FROM scratch;\n';
    const after = 'export const items = pgTable("items", {\n  id: uuid("id"),\n  meta: jsonb("meta").default({ a: 1 }),\n});\nDELETE FROM scratch;\n';
    expect(dataLossChanges({ file: "s.ts", oldSrc: before, newSrc: after }).map((f) => [f.kind, f.table, f.column])).toEqual([
      ["drop-column", "items", "sku"],
    ]);
    expect(schemaRemovals(before, "").map((f) => f.kind)).toEqual(["drop-table"]);
  });

  it("scopesAtLines: the fence around the changed line, not every fence in the file", () => {
    const src = "// [SCOPE 026 / T001] BEGIN — a\nconst a = 1;\n// [SCOPE 026 / T001] END\n// [SCOPE 058 / T002] BEGIN — b\nconst b = 2;\n// [SCOPE 058 / T002] END\n";
    expect(scopesAtLines(src, [[2, 2]])).toEqual(["026"]);
    expect(scopesAtLines(src, [[5, 5]])).toEqual(["058"]);
  });

  it("FR-006: another scope's code and a shared table are boundaries; one scope alone is not", () => {
    const scopesByFile = new Map([["a.ts", ["001"]], ["b.ts", ["002"]], ["c.ts", ["001"]]]);
    const otherScope = classifyImpact({
      links: [{ type: "scope", direction: "dependent", to: "scope:002", files: ["b.ts"] }],
      ownScopes: ["001"], scopesByFile, affected: 1,
    });
    expect(otherScope.boundary).toBe(true);
    expect(otherScope.decision).toBe("ask");
    const sharedTable = classifyImpact({
      links: [{ type: "table", direction: "dependent", from: "a.ts", to: "b.ts", via: "table:items" }],
      ownScopes: ["001"], scopesByFile, affected: 1,
    });
    expect(sharedTable.reasons.map((r) => r.kind)).toEqual(["shared-table"]);
    const sameScope = classifyImpact({
      links: [
        { type: "scope", direction: "dependent", to: "scope:001", files: ["c.ts"] },
        { type: "table", direction: "dependent", from: "a.ts", to: "c.ts", via: "table:items" },
      ],
      ownScopes: ["001"], scopesByFile, affected: 1,
    });
    expect(sameScope.boundary).toBe(false);
    expect(sameScope.decision).toBe("notify");
    expect(sameScope.signoff.checked).toBe(false);
  });

  it("FR-006: a sign-off the caller reports is a boundary; data loss stops even in notify", () => {
    const withSignoff = classifyImpact({ links: [], ownScopes: ["001"], scopesByFile: new Map(), signoffs: [{ id: "x", title: "Checkout flow" }] });
    expect(withSignoff.reasons[0].detail).toMatch(/Checkout flow/);
    expect(withSignoff.decision).toBe("ask");
    const loss = classifyImpact({
      links: [], ownScopes: [], scopesByFile: new Map(), mode: "notify",
      dataLoss: [{ kind: "drop-column", table: "items", column: "sku", file: "m.sql", line: 1, text: "" }],
    });
    expect(loss.decision).toBe("stop");
  });

  it("the fixture's boundary conditions, end to end: other scope, shared table, and a drop-column migration", () => {
    const proj = mkdtempSync(join(tmpdir(), "impact-classify-"));
    try {
      for (const [file, content] of Object.entries(FIXTURES.native.files)) {
        mkdirSync(join(proj, file, ".."), { recursive: true });
        writeFileSync(join(proj, file), content);
      }
      const service = buildReport({ root: proj, changedFiles: ["src/server/service.ts"], useCache: false });
      expect(service.classification.ownScopes).toEqual(["001"]);
      expect(service.classification.reasons.map((r) => r.kind).sort()).toEqual(["other-scope", "shared-table"]);
      expect(service.classification.decision).toBe("ask");

      writeFileSync(join(proj, "src/db/migrations/0002_drop.sql"), 'ALTER TABLE "items" DROP COLUMN "sku";\n');
      const migration = buildReport({ root: proj, changedFiles: ["src/db/migrations/0002_drop.sql"], useCache: false, mode: "notify" });
      expect(migration.classification.decision).toBe("stop");
      expect(renderSummary(migration)).toMatch(/STOP: possible data loss/);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

describe("SCOPE-137 T008 — report to sign-off graph (FR-006)", () => {
  it("every reached file is a dependent, so a screen reached through a table is still checked", () => {
    const proj = mkdtempSync(join(tmpdir(), "impact-graph-"));
    try {
      for (const [file, content] of Object.entries(FIXTURES.native.files)) {
        mkdirSync(join(proj, file, ".."), { recursive: true });
        writeFileSync(join(proj, file), content);
      }
      const report = buildReport({ root: proj, changedFiles: ["src/server/service.ts"], useCache: false });
      const graph = toImpactGraph(report, "abc123");
      expect(graph.commitsha).toBe("abc123");
      expect(graph.changedFiles).toEqual(["src/server/service.ts"]);
      const reached = graph.dependents.map((d: { dependentPath: string }) => d.dependentPath);
      expect(reached).toEqual(expect.arrayContaining(["src/server/report.ts", "src/client/Items.tsx", "src/server/listener.ts"]));
      expect(reached.some((p: string) => p.includes(":"))).toBe(false);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
