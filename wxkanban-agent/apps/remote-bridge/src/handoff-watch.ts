import { existsSync, lstatSync, readdirSync, readFileSync, unlinkSync, watch, type FSWatcher } from "fs";
import { join } from "path";
import type { Logger } from "pino";
import { HANDOFF_DIR, HANDOFF_NAME_RE } from "./handoff-writer";
import { logHandoff } from "./handoff-log";

// [SCOPE 149 / T005] BEGIN — hand-off folder watcher: safe reads and 4-hour expiry (FR-006)
// MODIFIED-BY: [SCOPE 159 / T022] — an optional folder format (folder, name pattern, size cap, max age, parser) so the command lane reuses the same safe reads (FR-095)
//
// The Project Agent's side of the carrier. It watches `.wxai/handoff/` under the repo root and
// hands each valid file on, once, to the handoff queue (handoff-queue.ts). Everything in the
// folder is untrusted input, parsed at the boundary:
//
//   - only regular files directly in the folder, named `<timestamp>.md`, under a size cap;
//     symlinks, sub-folders and anything else are ignored, and a folder that is itself a
//     symlink is ignored whole, so no path outside the folder is ever followed;
//   - the header must carry a valid `created-at:` and `masked:`; anything else is ignored;
//   - a file older than 4 hours is deleted unposted and reported (no content) so a restarted
//     agent never posts a stale handoff.
//
// fs.watch is unreliable on Windows, so a periodic scan backs it up; the scan also runs once on
// start. The scan interval keeps an idle agent inside the 30-second target.

/** Larger than any writer output (2,000 characters, worst-case UTF-8) plus its header. */
export const HANDOFF_MAX_BYTES = 16 * 1024;
export const HANDOFF_MAX_AGE_MS = 4 * 60 * 60 * 1000;
export const HANDOFF_SCAN_MS = 10_000;
/** A created-at this far ahead of the agent's clock is not trusted. */
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export interface HandoffFile {
  name: string;
  path: string;
  createdAt: Date;
  masked: number;
  /** The fields, without the header. Already masked by the writer. */
  body: string;
}

export type HandoffRead =
  | { kind: "ok"; file: HandoffFile }
  | { kind: "expired"; name: string; createdAt: Date }
  | { kind: "ignored"; name: string; reason: string };

/** Parse a handoff file's text: the header lines, then a blank line, then the body. */
export function parseHandoff(text: string): { createdAt: Date; masked: number; body: string } | null {
  const m = /^created-at: (\S+)\r?\nmasked: (\d{1,6})\r?\n\r?\n([\s\S]*)$/.exec(text);
  if (!m) return null;
  const createdAt = new Date(m[1]);
  if (Number.isNaN(createdAt.getTime())) return null;
  return { createdAt, masked: Number(m[2]), body: m[3].trim() };
}

/** What a watched folder holds. The handoff folder is the default; the command lane passes its own. */
export interface WatchFormat {
  /** The folder, relative to the repo root. */
  relDir: string;
  nameRe: RegExp;
  maxBytes: number;
  maxAgeMs: number;
  /** A created-at this far ahead of the agent's clock is not trusted. */
  futureSkewMs: number;
  parse: (text: string) => { createdAt: Date; masked: number; body: string } | null;
}

export const HANDOFF_FORMAT: WatchFormat = {
  relDir: HANDOFF_DIR,
  nameRe: HANDOFF_NAME_RE,
  maxBytes: HANDOFF_MAX_BYTES,
  maxAgeMs: HANDOFF_MAX_AGE_MS,
  futureSkewMs: FUTURE_SKEW_MS,
  parse: parseHandoff,
};

/** Classify one directory entry. Never throws; never follows a symlink. */
export function readHandoffEntry(dir: string, name: string, now: Date, format: WatchFormat = HANDOFF_FORMAT): HandoffRead {
  if (!format.nameRe.test(name)) return { kind: "ignored", name, reason: "name" };
  const path = join(dir, name);
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return { kind: "ignored", name, reason: "gone" };
  }
  if (st.isSymbolicLink()) return { kind: "ignored", name, reason: "symlink" };
  if (!st.isFile()) return { kind: "ignored", name, reason: "not-file" };
  if (st.size > format.maxBytes) return { kind: "ignored", name, reason: "oversize" };
  let text: string;
  try {
    text = readFileSync(path, "utf-8");
  } catch {
    return { kind: "ignored", name, reason: "unreadable" };
  }
  const parsed = format.parse(text);
  if (!parsed) return { kind: "ignored", name, reason: "malformed" };
  if (parsed.createdAt.getTime() > now.getTime() + format.futureSkewMs) return { kind: "ignored", name, reason: "future" };
  if (now.getTime() - parsed.createdAt.getTime() > format.maxAgeMs) {
    return { kind: "expired", name, createdAt: parsed.createdAt };
  }
  return { kind: "ok", file: { name, path, ...parsed } };
}

export interface HandoffWatcherOptions {
  repoRoot: string;
  /** The folder and its rules. Absent: the handoff folder. */
  format?: WatchFormat;
  /** A valid, current handoff. Called once per file name. */
  onReady: (file: HandoffFile) => void;
  /** A stale handoff was deleted unposted; post the short removal note. */
  onExpired: (createdAt: Date) => void;
  logger?: Logger;
  now?: () => Date;
  scanMs?: number;
}

export class HandoffWatcher {
  private timer?: ReturnType<typeof setInterval>;
  private fsWatcher?: FSWatcher;
  private debounce?: ReturnType<typeof setTimeout>;
  /** Names already handed on or already reported as ignored, so each is acted on once. */
  private readonly seen = new Set<string>();
  private readonly now: () => Date;
  private readonly dir: string;
  private readonly format: WatchFormat;

  constructor(private readonly opts: HandoffWatcherOptions) {
    this.now = opts.now ?? (() => new Date());
    this.format = opts.format ?? HANDOFF_FORMAT;
    this.dir = join(opts.repoRoot, this.format.relDir);
  }

  start(): void {
    this.scan();
    this.timer = setInterval(() => this.scan(), this.opts.scanMs ?? HANDOFF_SCAN_MS);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.debounce) clearTimeout(this.debounce);
    this.debounce = undefined;
    this.fsWatcher?.close();
    this.fsWatcher = undefined;
  }

  /** One pass over the folder. Public so tests drive it instead of waiting on timers. */
  scan(): void {
    if (!this.folderUsable()) return;
    this.armFsWatch();
    let names: string[];
    try {
      names = readdirSync(this.dir);
    } catch {
      return;
    }
    // Forget names that are gone, so a later file with a reused name is seen again.
    for (const n of [...this.seen]) if (!names.includes(n)) this.seen.delete(n);
    for (const name of names.sort()) {
      if (this.seen.has(name)) continue;
      // The writer's own atomic temp files: in flight, not ours yet, not worth a log line.
      if (name.startsWith(".") && name.endsWith(".tmp")) continue;
      const r = readHandoffEntry(this.dir, name, this.now(), this.format);
      if (r.kind === "ok") {
        this.seen.add(name);
        this.opts.onReady(r.file);
      } else if (r.kind === "expired") {
        try {
          unlinkSync(join(this.dir, name));
        } catch {
          continue; // could not delete: try again next scan rather than report a removal that did not happen
        }
        if (this.opts.logger) logHandoff(this.opts.logger, "expired", { createdAt: r.createdAt.toISOString() });
        this.opts.onExpired(r.createdAt);
      } else if (r.reason !== "gone") {
        this.seen.add(name);
        if (this.opts.logger) logHandoff(this.opts.logger, "ignored", { reason: r.reason });
      }
    }
  }

  /** The folder must exist and be a real directory: a symlinked folder is ignored whole. */
  private folderUsable(): boolean {
    if (!existsSync(this.dir)) return false;
    try {
      const st = lstatSync(this.dir);
      return st.isDirectory() && !st.isSymbolicLink();
    } catch {
      return false;
    }
  }

  private armFsWatch(): void {
    if (this.fsWatcher) return;
    try {
      this.fsWatcher = watch(this.dir, { persistent: false }, () => {
        if (this.debounce) clearTimeout(this.debounce);
        this.debounce = setTimeout(() => this.scan(), 250);
        this.debounce.unref?.();
      });
      this.fsWatcher.on("error", () => {
        // The folder went away or the platform gave up: the periodic scan carries on alone.
        this.fsWatcher?.close();
        this.fsWatcher = undefined;
      });
    } catch {
      this.fsWatcher = undefined;
    }
  }
}
// [SCOPE 149 / T005] END
