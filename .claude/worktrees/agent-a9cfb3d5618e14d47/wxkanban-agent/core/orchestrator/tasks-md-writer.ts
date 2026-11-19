import { readFileSync, writeFileSync, renameSync } from "fs";
import { dirname, join } from "path";

export function markTaskDone(tasksMdPath: string, taskId: string): boolean {
  const body = readFileSync(tasksMdPath, "utf-8");
  const lines = body.split(/\r?\n/);
  let changed = false;
  const re = new RegExp(`^(\\|.*${taskId}[:\\s.][^|]*\\|[^|]*\\|\\s*)([^|]+?)(\\s*\\|.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const m = line.match(re);
    if (!m) continue;
    const current = (m[2] ?? "").trim().toLowerCase();
    if (current === "done") return false;
    lines[i] = `${m[1]}done${m[3]}`;
    changed = true;
    break;
  }
  if (!changed) return false;
  const tmpPath = join(dirname(tasksMdPath), `.${taskId}.tasks.tmp`);
  writeFileSync(tmpPath, lines.join("\n"));
  renameSync(tmpPath, tasksMdPath);
  return true;
}
