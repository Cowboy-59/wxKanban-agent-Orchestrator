import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { ensureHandoffGitignore } from "../../../core/handoff-gitignore"; // [SCOPE 149 / T003]

// [SCOPE 149 / T010] BEGIN — project agent refusal status file (FR-002)
// MODIFIED-BY: [SCOPE 149 / T003] — ensures the .gitignore entries before the status file is written (FR-005)
// A refused start leaves `.wxai/project-agent-status.json` ({ refused, at }) so a later
// preflight can name the cause. Holds a code and a time only: never a token, email or name.
// Every function here swallows its own errors; the refusal line on stdout is what matters.
const CODE_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/i;

export interface AgentStatus {
  refused: string;
  at: string;
}

export function statusPath(repoRoot: string): string {
  return join(repoRoot, ".wxai", "project-agent-status.json");
}

/** Writes the refusal atomically (temp file, then rename). Returns false when it could not. */
export function recordRefusal(repoRoot: string, code: string, now: Date = new Date()): boolean {
  const target = statusPath(repoRoot);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    ensureHandoffGitignore(repoRoot); // never throws, never creates a .gitignore
    mkdirSync(dirname(target), { recursive: true });
    const status: AgentStatus = {
      refused: CODE_PATTERN.test(code) ? code : "unknown",
      at: now.toISOString(),
    };
    writeFileSync(tmp, `${JSON.stringify(status)}\n`, "utf-8");
    renameSync(tmp, target);
    return true;
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      /* best effort */
    }
    return false;
  }
}

/** Removes the status file when present. Never throws. */
export function clearRefusal(repoRoot: string): void {
  try {
    const target = statusPath(repoRoot);
    if (existsSync(target)) unlinkSync(target);
  } catch {
    /* best effort */
  }
}

/** Reads the recorded refusal, or null when absent or not a valid { refused, at } record. */
export function readRefusal(repoRoot: string): AgentStatus | null {
  try {
    const raw: unknown = JSON.parse(readFileSync(statusPath(repoRoot), "utf-8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const rec = raw as Record<string, unknown>;
    const { refused, at } = rec;
    if (typeof refused !== "string" || typeof at !== "string") return null;
    if (!CODE_PATTERN.test(refused)) return null;
    if (Number.isNaN(new Date(at).getTime())) return null;
    return { refused, at };
  } catch {
    return null;
  }
}
// [SCOPE 149 / T010] END
