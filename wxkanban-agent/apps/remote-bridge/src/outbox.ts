import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";

// SPEC-142 / T010: the Ask Gate (a separate process) cannot post to the room, so it appends
// one JSON line per blocker to .wxai/room-outbox.jsonl. The bridge owns the room connection,
// so it drains that file and posts each line through its normal post path.

export const OUTBOX_REL = join(".wxai", "room-outbox.jsonl");

interface OutboxLine {
  time?: string;
  text: string;
}

// [SCOPE 142 / T023] BEGIN — Bridge delivers queued blockers to the room (FR-010)
function parseLine(line: string): OutboxLine | undefined {
  try {
    const row = JSON.parse(line) as { text?: unknown; time?: unknown };
    if (typeof row.text !== "string" || !row.text.trim()) return undefined;
    return { text: row.text, time: typeof row.time === "string" ? row.time : undefined };
  } catch {
    return undefined; // a torn or foreign line is dropped, never posted
  }
}
// [SCOPE 142 / T023] END

/**
 * Post every queued line, oldest first. The file is claimed by rename first, so a line the
 * gate appends while we post lands in a fresh file and is picked up on the next drain.
 * Lines whose post fails are put back, so a room outage delays a blocker and never loses it.
 * Returns how many lines were posted.
 */
// [SCOPE 142 / T023] BEGIN — Bridge delivers queued blockers to the room (FR-010)
export async function drainOutbox(root: string, post: (text: string) => Promise<boolean>): Promise<number> {
  const file = join(root, OUTBOX_REL);
  if (!existsSync(file)) return 0;
  const claimed = `${file}.draining-${process.pid}`;
  try {
    renameSync(file, claimed);
  } catch {
    return 0; // another drain claimed it, or it vanished
  }

  const lines = readFileSync(claimed, "utf8").split("\n").filter((l) => l.trim());
  let posted = 0;
  const failed: string[] = [];
  for (const raw of lines) {
    const row = parseLine(raw);
    if (!row) continue;
    if (failed.length === 0 && (await post(row.text))) {
      posted += 1;
    } else {
      failed.push(raw); // keep order: once one fails, everything after it waits
    }
  }

  if (failed.length > 0) {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, failed.join("\n") + "\n", "utf8");
  }
  rmSync(claimed, { force: true });
  return posted;
}
// [SCOPE 142 / T023] END

/** Drain on a timer; returns the stop function. Errors are swallowed: this is best-effort relay. */
// [SCOPE 142 / T023] BEGIN — Bridge delivers queued blockers to the room (FR-010)
export function startOutboxDrain(
  root: string,
  post: (text: string) => Promise<boolean>,
  everyMs = 2000,
): () => void {
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    drainOutbox(root, post)
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, everyMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
// [SCOPE 142 / T023] END
