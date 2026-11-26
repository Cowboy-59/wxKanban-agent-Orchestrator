// What the Project Agent received and what it is doing, for the Cockpit Agent Room panel and the
// run log (SPEC-159 FR-083, FR-084). A small in-memory ring of masked, length-capped lines plus a
// working/idle state. It READS nothing and POSTS nothing: the bridge calls note() at the moments it
// already knows about (a room message in, a tool started, a reply out, a turn over), then writes
// snapshot() into the panel file.

import { redactSecrets } from "./redact";

// [SCOPE 159 / T018] BEGIN — Agent activity tracker for the Cockpit Agent room view (FR-083, FR-084)
export type ActivityKind ="received" | "tool" | "reply" | "handoff" | "result" | "link";

export interface ActivityEntry {
  at: string;
  kind: ActivityKind;
  text: string;
}

export interface AgentActivity {
  state: "idle" | "working";
  /** The tool or turn under way, masked; empty when idle. */
  current: string;
  /** Room link state as last reported: connected, reconnecting, and so on. */
  roomLink: string;
  startedAt: string;
  lastEventAt: string | null;
  /** Newest last. */
  entries: ActivityEntry[];
}

export const ACTIVITY_MAX_ENTRIES = 40;
export const ACTIVITY_MAX_CHARS = 200;

export interface ActivityTrackerOptions {
  max?: number;
  now?: () => Date;
}

export class ActivityTracker {
  private readonly max: number;
  private readonly now: () => Date;
  private readonly startedAt: string;
  private readonly entries: ActivityEntry[] = [];
  private state: "idle" | "working" = "idle";
  private current = "";
  private roomLink = "starting";
  private lastEventAt: string | null = null;

  constructor(o: ActivityTrackerOptions = {}) {
    this.max = o.max ?? ACTIVITY_MAX_ENTRIES;
    this.now = o.now ?? (() => new Date());
    this.startedAt = this.now().toISOString();
  }

  /** Record one event. The text is masked, flattened to one line and capped before it is kept. */
  note(kind: ActivityKind, text: string): void {
    const at = this.now().toISOString();
    const clean = redactSecrets(text).text.replace(/\s+/g, " ").trim().slice(0, ACTIVITY_MAX_CHARS);
    if (kind === "link") {
      this.roomLink = clean;
    } else if (kind === "received") {
      this.state = "working";
      this.current = "reading a message";
    } else if (kind === "tool") {
      this.state = "working";
      this.current = clean;
    } else if (kind === "result") {
      this.state = "idle";
      this.current = "";
    }
    this.lastEventAt = at;
    this.entries.push({ at, kind, text: clean });
    while (this.entries.length > this.max) this.entries.shift();
  }

  snapshot(): AgentActivity {
    return {
      state: this.state,
      current: this.current,
      roomLink: this.roomLink,
      startedAt: this.startedAt,
      lastEventAt: this.lastEventAt,
      entries: this.entries.map((e) => ({ ...e })),
    };
  }
}
// [SCOPE 159 / T018] END
