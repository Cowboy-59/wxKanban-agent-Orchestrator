import { unlinkSync } from "fs";
import type { Logger } from "pino";
import type { HandoffFile } from "./handoff-watch";
import { logHandoff } from "./handoff-log";

// [SCOPE 149 / T006] BEGIN — one-slot handoff queue: post when the agent is free (FR-006, FR-008)
//
// At most ONE handoff waits. A newer one replaces an older one that has not been posted yet; the
// older file is deleted unposted. A handoff is posted only when the agent is free (isBusy false),
// is deleted only after a successful post, and is never posted twice. A failed post stays pending
// and is retried on the next tick. Logging is allow-listed (handoff-log.ts): no summary text.

export interface HandoffQueueOptions {
  /** True while the agent is mid-turn, waiting on a gate, running triage, or has no session. */
  isBusy: () => boolean;
  /** Post the handoff; true when it landed in the room. */
  deliver: (file: HandoffFile) => Promise<boolean>;
  logger?: Logger;
  tickMs?: number;
  unlink?: (path: string) => void;
}

function defaultUnlink(path: string): void {
  try {
    unlinkSync(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export class HandoffQueue {
  private slot?: HandoffFile;
  private inFlight?: HandoffFile;
  private timer?: ReturnType<typeof setInterval>;
  private readonly unlink: (path: string) => void;

  constructor(private readonly opts: HandoffQueueOptions) {
    this.unlink = opts.unlink ?? defaultUnlink;
  }

  /** The handoff waiting to be posted, if any. */
  get pending(): HandoffFile | undefined {
    return this.slot ?? this.inFlight;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.drain(), this.opts.tickMs ?? 2000);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  offer(file: HandoffFile): void {
    const current = this.slot;
    if (!current) {
      this.slot = file;
      this.logEvent("queued", file);
    } else {
      // The older of the two is dropped unposted; on a tie the one offered later wins.
      const newcomerWins = file.createdAt.getTime() >= current.createdAt.getTime();
      const loser = newcomerWins ? current : file;
      this.slot = newcomerWins ? file : current;
      this.discard(loser);
      this.logEvent("replaced", loser);
    }
    void this.drain();
  }

  async drain(): Promise<void> {
    const file = this.slot;
    if (!file || this.inFlight || this.opts.isBusy()) return;
    // The file moves from the slot to in-flight, so a newcomer during the post takes the slot.
    this.slot = undefined;
    this.inFlight = file;
    let ok = false;
    try {
      ok = await this.opts.deliver(file);
    } catch {
      ok = false; // retried on the next tick
    }
    this.inFlight = undefined;
    if (ok) {
      try {
        this.unlink(file.path);
      } catch {
        // The post landed; a file that cannot be deleted must not be posted again.
      }
      this.logEvent("posted", file);
      return;
    }
    // Not posted: keep it pending, unless a newer handoff arrived meanwhile (the older is dropped).
    const newer = this.slotNow();
    if (!newer) {
      this.slot = file;
    } else if (file.createdAt.getTime() > newer.createdAt.getTime()) {
      const dropped = newer;
      this.slot = file;
      this.discard(dropped);
      this.logEvent("replaced", dropped);
    } else {
      this.discard(file);
      this.logEvent("replaced", file);
    }
  }

  /** The slot as it stands now: offer() may have filled it while a delivery was awaited. */
  private slotNow(): HandoffFile | undefined {
    return this.slot;
  }

  private discard(file: HandoffFile): void {
    try {
      this.unlink(file.path);
    } catch {
      /* best-effort: the watcher will not re-offer a name it has already seen */
    }
  }

  private logEvent(event: "queued" | "posted" | "replaced", file: HandoffFile): void {
    if (!this.opts.logger) return;
    logHandoff(this.opts.logger, event, {
      createdAt: file.createdAt.toISOString(),
      masked: file.masked,
      chars: file.body.length,
    });
  }
}
// [SCOPE 149 / T006] END
