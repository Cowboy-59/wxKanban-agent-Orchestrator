import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { maskReason } from "./room-link"; // [SCOPE 144 / T027]
import { ensureHandoffGitignore } from "../../../core/handoff-gitignore"; // [SCOPE 149 / T003]

// [SCOPE 149 / T010] BEGIN — project agent refusal status file (FR-002)
// MODIFIED-BY: [SCOPE 144 / T027] — recordRoomLink() merges the Room Link fields into the same file (AB-1, FR-016, FR-017)
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

// [SCOPE 144 / T027] BEGIN — Room Link fields in the status file, for the Cockpit (AB-1, FR-016, FR-017)
// roomLink, since, failures and the masked reason are merged into the file; a refusal already in
// it is kept. No token, cookie, email or name: the reason goes through maskReason, and only the
// four named fields are ever written. Swallows its own errors.
export interface RoomLinkStatus {
  roomLink: "connected" | "reconnecting" | "error";
  since: string;
  failures: number;
  reason?: string;
}

const ROOM_LINK_STATES: readonly string[] = ["connected", "reconnecting", "error"];

/** Merges the Room Link state into the status file, atomically. Returns false when it could not. */
export function recordRoomLink(repoRoot: string, link: RoomLinkStatus): boolean {
  if (!ROOM_LINK_STATES.includes(link.roomLink)) return false;
  const target = statusPath(repoRoot);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    let existing: Record<string, unknown> = {};
    try {
      const raw: unknown = JSON.parse(readFileSync(target, "utf-8"));
      if (typeof raw === "object" && raw !== null && !Array.isArray(raw)) existing = raw as Record<string, unknown>;
    } catch {
      /* absent or unreadable: start fresh */
    }
    ensureHandoffGitignore(repoRoot);
    mkdirSync(dirname(target), { recursive: true });
    const { reason: _oldReason, ...rest } = existing;
    void _oldReason;
    const reason = link.roomLink === "connected" ? undefined : maskReason(link.reason);
    const merged: Record<string, unknown> = {
      ...rest,
      roomLink: link.roomLink,
      since: link.since,
      failures: Math.max(0, Math.floor(link.failures)),
      ...(reason ? { reason } : {}),
    };
    writeFileSync(tmp, `${JSON.stringify(merged)}
`, "utf-8");
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
// [SCOPE 144 / T027] END

// [SCOPE 144 / T030] BEGIN — a new start drops the last run's Room Link fields (AB-1, FR-017)
// A previous run's `error` record would show the Cockpit banner until this run's first status.
// Called once this process holds the worktree lock, so no other live bridge owns the record.
// A refusal ({ refused, at }) is kept for the SCOPE-149 preflight; an otherwise empty file is
// removed. Never throws.
export function clearRoomLink(repoRoot: string): void {
  const target = statusPath(repoRoot);
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    if (!existsSync(target)) return;
    const raw: unknown = JSON.parse(readFileSync(target, "utf-8"));
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      unlinkSync(target);
      return;
    }
    const { roomLink: _l, since: _s, failures: _f, reason: _r, ...rest } = raw as Record<string, unknown>;
    void [_l, _s, _f, _r];
    if (Object.keys(rest).length === 0) {
      unlinkSync(target);
      return;
    }
    writeFileSync(tmp, `${JSON.stringify(rest)}\n`, "utf-8");
    renameSync(tmp, target);
  } catch {
    try {
      unlinkSync(tmp);
    } catch {
      /* best effort */
    }
  }
}
// [SCOPE 144 / T030] END
