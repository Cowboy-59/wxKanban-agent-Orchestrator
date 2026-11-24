// The local run log (SPEC-159 FR-073..FR-077, FR-079). Daily files under .wxai/run-log/, every
// line masked by redact.ts before it is written, so no unmasked copy exists. Retention: 30 days
// and 200 MB per project, oldest deleted first. Stays on the machine.

import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { formatRunLogLine, parseRunLog, type RoomMessage } from "../../../common-room/src/index";
import { redactSecrets } from "./redact";

// [SCOPE 159 / T016] BEGIN — Masked, daily, retained run log (FR-073, FR-074, FR-077)
export const RUN_LOG_DIR_REL = join(".wxai", "run-log");
export const RETENTION_DAYS = 30;
export const RETENTION_BYTES = 200 * 1024 * 1024;
const DAY_FILE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
const FEED_FILE = /^feed-(\d{4}-\d{2}-\d{2})\.jsonl$/;

export interface RunLogOptions {
  root: string;
  now?: () => Date;
  maxBytes?: number;
  retentionDays?: number;
}

const dayOf = (d: Date): string => d.toISOString().slice(0, 10);

export class RunLog {
  readonly dir: string;
  private readonly now: () => Date;
  private readonly maxBytes: number;
  private readonly retentionDays: number;

  constructor(o: RunLogOptions) {
    this.dir = join(o.root, RUN_LOG_DIR_REL);
    this.now = o.now ?? (() => new Date());
    this.maxBytes = o.maxBytes ?? RETENTION_BYTES;
    this.retentionDays = o.retentionDays ?? RETENTION_DAYS;
  }

  /** Write one message, masked first. Returns the count of secrets masked. */
  write(message: RoomMessage): number {
    const r = redactSecrets(message.body);
    const line = formatRunLogLine({ ...message, body: r.text }, this.now());
    this.append(`${dayOf(this.now())}.jsonl`, line);
    return r.masked;
  }

  /** The developer's own session feed, saved under the same rules: masked, daily, retained. */
  writeFeed(text: string, role: "developer" | "assistant" = "developer"): number {
    const r = redactSecrets(text);
    this.append(`feed-${dayOf(this.now())}.jsonl`, JSON.stringify({ at: this.now().toISOString(), role, text: r.text }));
    return r.masked;
  }

  private append(name: string, line: string): void {
    mkdirSync(this.dir, { recursive: true });
    appendFileSync(join(this.dir, name), `${line}\n`, "utf8");
    this.prune();
  }

  private files(): Array<{ name: string; day: string; size: number }> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .map((name) => ({ name, m: DAY_FILE.exec(name) ?? FEED_FILE.exec(name) }))
      .filter((f): f is { name: string; m: RegExpExecArray } => f.m !== null)
      .map((f) => ({ name: f.name, day: f.m[1] as string, size: statSync(join(this.dir, f.name)).size }))
      .sort((a, b) => (a.day === b.day ? a.name.localeCompare(b.name) : a.day.localeCompare(b.day)));
  }

  /** Delete files older than the retention window, then oldest first until under the size cap. */
  prune(): string[] {
    const removed: string[] = [];
    const cutoff = dayOf(new Date(this.now().getTime() - this.retentionDays * 86_400_000));
    let files = this.files();
    for (const f of files) {
      if (f.day < cutoff) {
        rmSync(join(this.dir, f.name), { force: true });
        removed.push(f.name);
      }
    }
    files = this.files();
    let total = files.reduce((n, f) => n + f.size, 0);
    for (const f of files) {
      if (total <= this.maxBytes || files.length - removed.length <= 1) break;
      rmSync(join(this.dir, f.name), { force: true });
      removed.push(f.name);
      total -= f.size;
    }
    return removed;
  }

  /** The developer may delete the log. */
  deleteAll(): number {
    const n = this.files().length;
    if (existsSync(this.dir)) rmSync(this.dir, { recursive: true, force: true });
    return n;
  }

  /** Read every message line back through the contract validator. */
  readMessages(): { lines: number; ok: number; refused: number } {
    let lines = 0;
    let ok = 0;
    let refused = 0;
    for (const f of this.files().filter((x) => DAY_FILE.test(x.name))) {
      const r = parseRunLog(readFileSync(join(this.dir, f.name), "utf8"));
      lines += r.lines.length + r.refused.length;
      ok += r.lines.length;
      refused += r.refused.length;
    }
    return { lines, ok, refused };
  }
}
// [SCOPE 159 / T016] END
