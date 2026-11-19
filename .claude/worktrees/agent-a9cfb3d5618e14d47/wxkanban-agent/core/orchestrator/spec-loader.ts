import { readdirSync, readFileSync, existsSync } from "fs";
import { join } from "path";

export interface SpecTask {
  id: string;
  title: string;
  status: string;
  dependencies: string[];
}

export interface SpecBundle {
  scope: string;
  slug: string;
  dir: string;
  specText: string;
  dataModelText?: string;
  contractsText?: string;
  quickstartText?: string;
  tasksMdPath: string;
  tasks: SpecTask[];
}

export class SpecNotFoundError extends Error {
  constructor(scope: string) {
    super(`No spec directory found for scope '${scope}' under specs/`);
    this.name = "SpecNotFoundError";
  }
}

export class TaskNotFoundError extends Error {
  constructor(scope: string, task: string) {
    super(`Task '${task}' not found in specs/${scope}*/tasks.md`);
    this.name = "TaskNotFoundError";
  }
}

export class TaskBlockedByDependenciesError extends Error {
  constructor(task: string, missing: string[]) {
    super(
      `Task '${task}' cannot run: dependencies not done — missing: ${missing.join(", ")}`,
    );
    this.name = "TaskBlockedByDependenciesError";
  }
}

export function loadSpecBundle(specsRoot: string, scope: string): SpecBundle {
  let entries: string[] = [];
  try {
    entries = readdirSync(specsRoot);
  } catch {
    throw new SpecNotFoundError(scope);
  }
  const match = entries.find((e) => e.startsWith(`${scope}-`));
  if (!match) throw new SpecNotFoundError(scope);

  const dir = join(specsRoot, match);
  const slug = match.slice(scope.length + 1);
  const specPath = join(dir, "spec.md");
  if (!existsSync(specPath)) throw new SpecNotFoundError(scope);

  const specText = readFileSync(specPath, "utf-8");
  const dataModelPath = join(dir, "data-model.md");
  const quickstartPath = join(dir, "quickstart.md");
  const contractsDir = join(dir, "contracts");

  let contractsText: string | undefined;
  if (existsSync(contractsDir)) {
    try {
      const files = readdirSync(contractsDir).filter((f) =>
        f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml"),
      );
      contractsText = files
        .map((f) => `# ${f}\n${readFileSync(join(contractsDir, f), "utf-8")}`)
        .join("\n\n---\n\n");
    } catch {
      contractsText = undefined;
    }
  }

  const tasksMdPath = join(dir, "tasks.md");
  if (!existsSync(tasksMdPath)) throw new SpecNotFoundError(scope);
  const tasks = parseTasks(readFileSync(tasksMdPath, "utf-8"));

  return {
    scope,
    slug,
    dir,
    specText,
    dataModelText: existsSync(dataModelPath)
      ? readFileSync(dataModelPath, "utf-8")
      : undefined,
    contractsText,
    quickstartText: existsSync(quickstartPath)
      ? readFileSync(quickstartPath, "utf-8")
      : undefined,
    tasksMdPath,
    tasks,
  };
}

const TABLE_ROW_RE =
  /^\|\s*(\d+)\s*\|\s*(T\d+)[:\s.]+([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;

function parseTasks(body: string): SpecTask[] {
  const tasks: SpecTask[] = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(TABLE_ROW_RE);
    if (!m) continue;
    const id = m[2] ?? "";
    const title = (m[3] ?? "").trim();
    const status = (m[5] ?? "").trim();
    tasks.push({ id, title, status, dependencies: [] });
  }
  return tasks;
}

export function findTask(bundle: SpecBundle, taskId: string): SpecTask {
  const t = bundle.tasks.find((x) => x.id === taskId);
  if (!t) throw new TaskNotFoundError(bundle.scope, taskId);
  return t;
}

export function verifyTaskUnblocked(
  bundle: SpecBundle,
  task: SpecTask,
): void {
  const missing = task.dependencies.filter((dep) => {
    const t = bundle.tasks.find((x) => x.id === dep);
    return !t || t.status.toLowerCase() !== "done";
  });
  if (missing.length > 0) {
    throw new TaskBlockedByDependenciesError(task.id, missing);
  }
}

