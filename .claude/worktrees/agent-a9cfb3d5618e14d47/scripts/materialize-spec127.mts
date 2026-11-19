// Materialize the SPEC-127 folder from the database, so `implement 127/Tnnn` can resolve it.
//
// SCOPE-127's spec and its 19 tasks live in the wxKanban database and have never existed as a
// `specs/127-*/` folder. `implement` resolves a task by reading `specs/<scope>*/tasks.md`, so
// without a folder it fails with SpecNotFoundError no matter how complete the database is.
//
// This writes the folder FROM the database. It does not write back: the database keeps its 19
// task rows untouched, and nothing here calls create_specs — re-running that against an existing
// spec number is what damaged this record in the first place.
//
//   npx tsx scripts/materialize-spec127.mts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

interface Task {
  name: string;
  description: string | null;
  priority: string | null;
  status: string | null;
}

const DIR = join("specs", "127-test-pipeline-stack-adapters");
const SCOPE_DOC = join("specs", "Project-Scope", "127-test-pipeline-stack-adapters.md");
const TASKS_JSON = "scope127-tasks.json";

const tasks: Task[] = JSON.parse(readFileSync(TASKS_JSON, "utf-8"));
const scope = readFileSync(SCOPE_DOC, "utf-8");

mkdirSync(join(DIR, "checklists"), { recursive: true });

// spec.md is the scope document. It already carries the canonical headings, and using it verbatim
// keeps one source rather than a paraphrase that would drift from it.
writeFileSync(join(DIR, "spec.md"), scope, "utf-8");

/** `[127-T001] Title` -> id and title. */
function split(name: string): { id: string; title: string } {
  const m = /^\[127-(T\d+)\]\s*(.*)$/.exec(name);
  if (m) return { id: String(m[1]), title: String(m[2]).trim() };
  return { id: "T000", title: name };
}

// Pair each task with its parsed id/title BEFORE sorting, so the two never drift apart.
const rows = tasks
  .map((task) => ({ ...split(task.name), task }))
  .sort((a, b) => a.id.localeCompare(b.id));

const L: string[] = [
  "# Tasks: Test Pipeline Stack Adapters — Adapter Seam Across All Three Layers",
  "",
  "**Spec**: 127",
  "**Spec ID**: `ac79dae6-28e9-4ed2-a3bf-2ac0d199dada`",
  `**Total**: ${rows.length} tasks`,
  "**Source**: materialized from the wxKanban database, which is authoritative for status.",
  "",
  "Fence label for all code produced here: `[SCOPE 127 / Tnnn]`. Labels **must** be `Tnnn` — an",
  "`FR-nnn` label silently fails the `T\\d+` regex and registers as unfenced.",
  "",
  "---",
  "",
  "## Task Table",
  "",
  "This table is the machine-readable source the orchestrator parses. Its shape is required: a row",
  "number, then `Tnnn: Title`, then priority, then status.",
  "",
  "| #  | Task | Priority | Status |",
  "|----|------|----------|--------|",
];

rows.forEach((r, i) => {
  L.push(`| ${i + 1} | ${r.id}: ${r.title} | ${r.task.priority ?? "medium"} | ${r.task.status ?? "todo"} |`);
});

L.push("", "## Detail", "");
for (const r of rows) {
  L.push(`### ${r.id} — ${r.title}`, "");
  L.push((r.task.description ?? "(no description recorded)").trim(), "");
}

writeFileSync(join(DIR, "tasks.md"), L.join("\n"), "utf-8");

console.log(`wrote ${DIR}/spec.md  (${scope.split("\n").length} lines, from the scope document)`);
console.log(`wrote ${DIR}/tasks.md (${rows.length} tasks, from the database)`);
console.log(`first: ${rows[0]?.id} ${rows[0]?.title.slice(0, 50)}`);
console.log(`last:  ${rows[rows.length - 1]?.id} ${rows[rows.length - 1]?.title.slice(0, 50)}`);
