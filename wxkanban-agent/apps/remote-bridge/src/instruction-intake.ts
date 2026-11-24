// The Project Agent takes any instruction (SPEC-159 FR-060..FR-064). Pure intake rules: who may
// instruct, what "run devplan" does, the connect-time list setting, schedules, the KAIN queue.
// Gates and hard blocks are unchanged and live elsewhere (FR-004, FR-021).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// [SCOPE 159 / T013] BEGIN — Who may instruct (FR-060)
export type Channel = "local" | "room";

export interface Instructor {
  channel: Channel;
  /** A supervisor post, stamped KAIN. */
  kain?: boolean;
  /** The sender's user id on the room channel. */
  userId?: string;
}

export interface IntakeContext {
  /** The one user id bound to the agent's own token; undefined when the token's user could not be resolved. */
  developerUserId?: string;
  /** Room Approver check by user id (FR-004). */
  isRoomApprover: (userId: string) => boolean;
}

export type Standing = "developer" | "kain" | "room_approver" | "discussion";

export const DISCUSSION_NOTE = "Not taken as an instruction: only the developer running the agent, KAIN or a Room Approver can instruct it.";

/** Local: whoever is at the machine. Room: by user id, never display name; unresolved token never falls back. */
export function standingOf(who: Instructor, ctx: IntakeContext): Standing {
  if (who.channel === "local") return "developer";
  if (who.kain) return "kain";
  if (!who.userId) return "discussion";
  if (ctx.developerUserId && who.userId === ctx.developerUserId) return "developer";
  if (ctx.isRoomApprover(who.userId)) return "room_approver";
  return "discussion";
}

export interface IntakeLogRow {
  at: string;
  standing: Standing;
  how: "instruction" | "scheduled" | "queued" | "discussion";
  text: string;
  /** KAIN instructions carry the stamp. */
  stamp?: "KAIN";
}
// [SCOPE 159 / T013] END

// [SCOPE 159 / T013] BEGIN — "run devplan" and the list wait (FR-061)
export const RUN_DEVPLAN = /^\s*run\s+devplan\s*[.!]?\s*$/i;
export const isRunDevplan = (text: string): boolean => RUN_DEVPLAN.test(text);

export type DevplanAction = "show_list_and_wait" | "start_now";

/** From the developer the list is shown and waits; from KAIN the run starts at once in devplan order. */
export function devplanAction(standing: Standing): DevplanAction | null {
  if (standing === "kain") return "start_now";
  if (standing === "developer" || standing === "room_approver") return "show_list_and_wait";
  return null;
}

/** While a list waits, only go, no and skip answer it (from the developer or KAIN); anything else is an instruction. */
export function listWaitRoutes(text: string, standing: Standing): "answer" | "instruction" | "discussion" {
  if (standing === "discussion") return "discussion";
  const answers = /^\s*(go|no|skip\b.*)\s*[.!]?\s*$/i.test(text);
  return answers && (standing === "developer" || standing === "kain") ? "answer" : "instruction";
}
// [SCOPE 159 / T013] END

// [SCOPE 159 / T013] BEGIN — Local agent config: connect-time list and schedules (FR-062, FR-063)
export const AGENT_CONFIG_REL = join(".wxai", "project-agent-config.json");
export const MAX_SCHEDULES = 10;
export type Day = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
const DAYS: readonly Day[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface Schedule {
  at: string;
  days: Day[];
  instruction: string;
}
export interface AgentConfig {
  showDevplanAtConnect: boolean;
  schedules: Schedule[];
}

/** A missing file, a damaged file or a missing key all mean off / none. */
export function loadAgentConfig(root: string): AgentConfig {
  const f = join(root, AGENT_CONFIG_REL);
  const off: AgentConfig = { showDevplanAtConnect: false, schedules: [] };
  if (!existsSync(f)) return off;
  try {
    const j = JSON.parse(readFileSync(f, "utf8")) as Partial<AgentConfig>;
    const schedules = (Array.isArray(j.schedules) ? j.schedules : [])
      .filter((s): s is Schedule => !!s && /^\d{2}:\d{2}$/.test(String(s.at)) && typeof s.instruction === "string" && Array.isArray(s.days))
      .slice(0, MAX_SCHEDULES);
    return { showDevplanAtConnect: j.showDevplanAtConnect === true, schedules };
  } catch {
    return off;
  }
}

/** The list shows at connect only when the setting is on. */
export const showListAtConnect = (c: AgentConfig): boolean => c.showDevplanAtConnect === true;

/** A slot fires once per day at its time; a missed slot is skipped, never replayed. */
export class ScheduleTicker {
  private readonly fired = new Set<string>();
  constructor(private readonly schedules: readonly Schedule[]) {}

  /** Call every 60 seconds with machine local time. Returns the instructions due now. */
  due(now: Date): Schedule[] {
    const day = DAYS[now.getDay()] as Day;
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const date = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
    const out: Schedule[] = [];
    this.schedules.forEach((s, i) => {
      const key = `${date}#${i}`;
      if (s.at === hhmm && s.days.includes(day) && !this.fired.has(key)) {
        this.fired.add(key);
        out.push(s);
      }
    });
    return out;
  }
}
// [SCOPE 159 / T013] END

// [SCOPE 159 / T013] BEGIN — One-at-a-time instruction queue with a log (FR-063, FR-064)
export class InstructionQueue {
  private readonly pending: Array<{ text: string; standing: Standing; how: IntakeLogRow["how"] }> = [];
  private busy = false;
  private readonly rows: IntakeLogRow[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  log(): IntakeLogRow[] {
    return [...this.rows];
  }

  /** Discussion is logged but never queued. KAIN instructions are stamped. */
  submit(text: string, standing: Standing, how: IntakeLogRow["how"] = "instruction"): "queued" | "discussion" {
    if (standing === "discussion") {
      this.rows.push({ at: this.now().toISOString(), standing, how: "discussion", text });
      return "discussion";
    }
    this.pending.push({ text, standing, how });
    return "queued";
  }

  /** Take the next instruction, only when none is running. Logs it as it starts. */
  next(): string | undefined {
    if (this.busy) return undefined;
    const n = this.pending.shift();
    if (!n) return undefined;
    this.busy = true;
    this.rows.push({ at: this.now().toISOString(), standing: n.standing, how: n.how, text: n.text, ...(n.standing === "kain" ? { stamp: "KAIN" as const } : {}) });
    return n.text;
  }

  finish(): void {
    this.busy = false;
  }

  get idle(): boolean {
    return !this.busy && this.pending.length === 0;
  }
}
// [SCOPE 159 / T013] END
