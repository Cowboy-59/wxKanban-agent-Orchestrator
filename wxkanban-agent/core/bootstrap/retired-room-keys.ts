// SPEC-150 FR-014: the plain remote mode is gone, so the room keys a developer once pasted
// into the repo-root `.env` are no longer read. On the first kit run that finds any of them
// this prints one notice saying so, then records that it did in a git-ignored state file so
// it never repeats. The kit never writes `.env`, and only key NAMES are matched: a value is
// never kept, logged or printed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { ensureHandoffGitignore } from "../handoff-gitignore";

// [SCOPE 150 / T006] BEGIN — Retired room key names
/** Keys the plain mode read and nothing reads now (SPEC-150 FR-011, FR-012). */
export const RETIRED_ROOM_KEYS: readonly string[] = [
  "YAPPCHATT_ROOM",
  "YAPPCHATT_TOKEN",
  "YAPPCHATT_EMAIL",
  "WXKANBAN_YAPPCHATT_ROOM",
  "WXKANBAN_YAPPCHAT_ROOM",
  "WXKANBAN_REMOTE_ROOM_ID",
  "WXKANBAN_YAPPCHATT_TOKEN",
  "WXKANBAN_YAPPCHAT_TOKEN",
  "WXKANBAN_CHAT_EMAIL",
  "WXKANBAN_CHAT_DISPLAY_NAME",
  "WXKANBAN_YAPPCHATT_URL",
  "WXKANBAN_YAPPCHAT_URL",
  "WXKANBAN_YAPPCHAT_BASE_URL",
  "WXKANBAN_WS_URL",
  "WXKANBAN_REMOTE_SEED",
  "WXKANBAN_REMOTE_RESUME",
];
// [SCOPE 150 / T006] END

// [SCOPE 150 / T006] BEGIN — Retired room key notice state path
export function retiredKeysNoticePath(repoRoot: string): string {
  return join(repoRoot, ".wxai", "retired-room-keys-notice.json");
}
// [SCOPE 150 / T006] END

// [SCOPE 150 / T006] BEGIN — Find retired room key names in .env
/** The retired key names set in the repo-root `.env`, in file order. Names only. */
export function findRetiredRoomKeys(repoRoot: string): string[] {
  const envPath = join(repoRoot, ".env");
  if (!existsSync(envPath)) return [];
  const retired = new Set(RETIRED_ROOM_KEYS);
  const found: string[] = [];
  try {
    for (const line of readFileSync(envPath, "utf-8").split(/\r?\n/)) {
      const name = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line)?.[1];
      if (name && retired.has(name) && !found.includes(name)) found.push(name);
    }
  } catch {
    return [];
  }
  return found;
}
// [SCOPE 150 / T006] END

// [SCOPE 150 / T006] BEGIN — One-time retired room key notice
/**
 * Prints the notice once per repo when retired keys are present. Returns true when it
 * printed. Never throws: a missing notice must not stop the agent or the CLI.
 */
export function noticeRetiredRoomKeys(
  repoRoot: string,
  print: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
  now: Date = new Date(),
): boolean {
  try {
    const statePath = retiredKeysNoticePath(repoRoot);
    if (existsSync(statePath)) return false;
    const found = findRetiredRoomKeys(repoRoot);
    if (found.length === 0) return false;
    print(
      `[wxkanban] .env still sets ${found.join(", ")}. The remote bridge no longer reads ` +
        "these (the Project Agent fetches its own room); you can delete them. This notice is shown once.",
    );
    ensureHandoffGitignore(repoRoot); // never throws, never creates a .gitignore
    mkdirSync(dirname(statePath), { recursive: true });
    writeFileSync(statePath, `${JSON.stringify({ shownAt: now.toISOString() })}\n`, "utf-8");
    return true;
  } catch {
    return false;
  }
}
// [SCOPE 150 / T006] END
