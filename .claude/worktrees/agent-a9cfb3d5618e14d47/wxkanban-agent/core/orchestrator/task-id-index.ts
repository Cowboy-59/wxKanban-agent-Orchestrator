import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

export interface TaskIdIndex {
  scopes: Map<string, Set<string>>;
  source: Map<string, string>;
}

const SCOPE_DIR_RE = /^(\d{3})[-_]/;
const TASK_ROW_RE = /\bT(\d+)\s*[:.]?/;

export function buildTaskIdIndex(specsRoot: string): TaskIdIndex {
  const scopes = new Map<string, Set<string>>();
  const source = new Map<string, string>();

  let entries: string[] = [];
  try {
    entries = readdirSync(specsRoot);
  } catch {
    return { scopes, source };
  }

  for (const entry of entries) {
    const match = entry.match(SCOPE_DIR_RE);
    if (!match) continue;
    const scope = match[1] ?? "";
    const tasksPath = join(specsRoot, entry, "tasks.md");
    let body = "";
    try {
      const st = statSync(tasksPath);
      if (!st.isFile()) continue;
      body = readFileSync(tasksPath, "utf-8");
    } catch {
      continue;
    }
    source.set(scope, tasksPath);
    const set = scopes.get(scope) ?? new Set<string>();
    for (const line of body.split(/\r?\n/)) {
      if (!/^\s*\|/.test(line) && !/^\s*###/.test(line)) continue;
      const matches = line.matchAll(/T(\d+)/g);
      for (const m of matches) {
        set.add(`T${m[1]}`);
      }
    }
    scopes.set(scope, set);
  }
  return { scopes, source };
}

export function taskExists(
  index: TaskIdIndex,
  scope: string,
  task: string,
): boolean {
  const set = index.scopes.get(scope);
  if (!set) return false;
  return set.has(task);
}
