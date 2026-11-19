// Keeps the HANDOFF REMOTE folder and the Project Agent status file out of version control
// on the client. Same pattern as license/entitlement-cache.ts: appends to an existing root
// `.gitignore` only, never creates one, skips entries already present, and does nothing
// when `.wxai/` is ignored wholesale.
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

// [SCOPE 149 / T003] BEGIN — Handoff gitignore entries
// MODIFIED-BY: [SCOPE 150 / T006] — the retired room key notice state (FR-014)
// MODIFIED-BY: [SCOPE 151 / T006] — the project agent's room token file, a live yca_ credential
export const HANDOFF_GITIGNORE_ENTRIES: readonly string[] = [
  "**/.wxai/handoff/",
  "**/.wxai/project-agent-status.json",
  "**/.wxai/retired-room-keys-notice.json",
  "**/.wxai/agent-room.json",
];
// [SCOPE 149 / T003] END

// [SCOPE 149 / T003] BEGIN — Ensure handoff gitignore entries
/**
 * SPEC-149 FR-005: make sure the handoff folder and the Project Agent status file are
 * gitignored. Returns the entries that were appended (empty when nothing changed).
 */
export function ensureHandoffGitignore(projectRoot: string): { added: string[] } {
  const giPath = join(projectRoot, ".gitignore");
  try {
    if (!existsSync(giPath)) return { added: [] };
    const gi = readFileSync(giPath, "utf8");
    if (/(^|\n)\.wxai\/\s*(\n|$)/.test(gi)) return { added: [] };
    const present = new Set(gi.split(/\r?\n/).map((l) => l.trim()));
    const added = HANDOFF_GITIGNORE_ENTRIES.filter((e) => !present.has(e));
    if (added.length === 0) return { added: [] };
    const sep = gi.endsWith("\n") ? "" : "\n";
    writeFileSync(
      giPath,
      `${gi}${sep}\n# wxKanban kit — HANDOFF REMOTE summaries and Project Agent status (per-developer; never commit)\n${added.join("\n")}\n`,
      "utf8",
    );
    return { added };
  } catch {
    // Non-fatal — the snippet still documents the entries.
    return { added: [] };
  }
}
// [SCOPE 149 / T003] END
