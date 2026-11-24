// Manager routing for the local worker room (SPEC-159 FR-023, FR-025, FR-026, FR-027, FR-028, FR-032).
// Questions go up to the Manager, never sideways. Worker-to-worker lines are information only and
// the Manager sees them all. A handover is a proposal until the other worker accepts. Only the
// Manager assigns and reassigns. Pure: every lookup is injected.

import type { RoomMessage, SenderStamp } from "../../../common-room/src/index";

// [SCOPE 159 / T008] BEGIN — Where a worker message goes (FR-023, FR-026)
export type Recipient = "manager" | "worker" | "agent";

export interface Routed {
  /** Who gets it to act on. */
  deliverTo: Recipient;
  /** The Manager always sees a worker-to-worker line. */
  copyToManager: boolean;
  /** True when the line carries no instruction: it is shown, never acted on. */
  informationOnly: boolean;
  /** A line a worker addressed to KAIN, delivered to the Manager instead. */
  rerouted: boolean;
}

/** Decide where one journaled message goes. Only worker senders are rerouted. */
export function routeWorkerMessage(m: RoomMessage): Routed {
  if (m.sender.kind !== "worker") return { deliverTo: m.to === "worker" ? "worker" : "agent", copyToManager: false, informationOnly: false, rerouted: false };
  if (m.to === "kain") return { deliverTo: "manager", copyToManager: false, informationOnly: false, rerouted: true };
  if (m.to === "peer" || m.to === "worker") return { deliverTo: "worker", copyToManager: true, informationOnly: true, rerouted: false };
  return { deliverTo: "manager", copyToManager: false, informationOnly: false, rerouted: false };
}
// [SCOPE 159 / T008] END

// [SCOPE 159 / T008] BEGIN — The Manager's answer search order (FR-023, FR-025)
export type AnswerSource = "ledger" | "workmemory" | "compoundlearning" | "godlearnings";
export const SEARCH_ORDER: readonly AnswerSource[] = ["ledger", "workmemory", "compoundlearning", "godlearnings"];

export interface Answer {
  text: string;
  /** What the answer cites: a ledger id, a work-memory entry, a CompoundLearning id, a G-nnnn. */
  ref: string;
}

/** A lookup that is missing in R1 is simply not passed; the step is skipped. */
export type Lookup = (question: string) => Promise<Answer | undefined>;
export type Lookups = Partial<Record<AnswerSource, Lookup>>;

export interface AskedAnswered {
  question: string;
  askedBy: SenderStamp;
  /** user id, ledger id, work memory, CompoundLearning, or G-nnnn */
  answeredBy: string;
  source: AnswerSource | "kain" | "owner";
}

export type SearchOutcome =
  | { found: true; answer: Answer; source: AnswerSource; record: AskedAnswered }
  | { found: false; escalateTo: "kain-or-owner" };

/** Search ledger, work memory, CompoundLearning, god-learnings, in that order; then go to KAIN or the owner. */
export async function searchAnswer(question: string, askedBy: SenderStamp, lookups: Lookups): Promise<SearchOutcome> {
  for (const source of SEARCH_ORDER) {
    const look = lookups[source];
    if (!look) continue;
    let hit: Answer | undefined;
    try {
      hit = await look(question);
    } catch {
      hit = undefined; // a failing step is skipped, never fatal
    }
    if (hit) return { found: true, answer: hit, source, record: { question, askedBy, answeredBy: hit.ref, source } };
  }
  return { found: false, escalateTo: "kain-or-owner" };
}

/** The record for an answer that came from KAIN or the owner after the search found nothing. */
export function escalatedRecord(question: string, askedBy: SenderStamp, answeredBy: string, source: "kain" | "owner"): AskedAnswered {
  return { question, askedBy, answeredBy, source };
}
// [SCOPE 159 / T008] END

// [SCOPE 159 / T008] BEGIN — Assignments, handovers and next-free-task (FR-027, FR-028, FR-032)
export interface Assignment {
  taskId: string;
  workerId: string;
}

export interface AssignmentLogRow {
  at: string;
  taskId: string;
  from: string | null;
  to: string;
  by: string;
}

export class Assignments {
  private readonly owner = new Map<string, string>();
  private readonly logRows: AssignmentLogRow[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  ownerOf(taskId: string): string | undefined {
    return this.owner.get(taskId);
  }

  log(): AssignmentLogRow[] {
    return [...this.logRows];
  }

  /** Assign or reassign. Only the Manager may; a worker is refused and nothing changes. */
  assign(taskId: string, toWorker: string, by: SenderStamp): { ok: true } | { ok: false; reason: "not_manager" } {
    if (by.kind !== "manager") return { ok: false, reason: "not_manager" };
    const from = this.owner.get(taskId) ?? null;
    this.owner.set(taskId, toWorker);
    this.logRows.push({ at: this.now().toISOString(), taskId, from, to: toWorker, by: by.id });
    return { ok: true };
  }
}

export interface Handover {
  id: string;
  taskId: string;
  from: string;
  to: string;
  state: "proposed" | "accepted";
}

/** A handover is a proposal. Unaccepted, it changes nothing; accepted, the Manager's book moves it. */
export class Handovers {
  private readonly rows = new Map<string, Handover>();
  private n = 0;

  constructor(private readonly assignments: Assignments, private readonly manager: SenderStamp) {}

  propose(taskId: string, from: string, to: string): Handover {
    const row: Handover = { id: `h-${++this.n}`, taskId, from, to, state: "proposed" };
    this.rows.set(row.id, row);
    return row;
  }

  /** Only the named receiving worker accepts. Anyone else is refused. */
  accept(id: string, byWorker: string): { ok: true } | { ok: false; reason: "unknown" | "not_receiver" | "not_owner" } {
    const h = this.rows.get(id);
    if (!h) return { ok: false, reason: "unknown" };
    if (h.to !== byWorker) return { ok: false, reason: "not_receiver" };
    if (this.assignments.ownerOf(h.taskId) !== h.from) return { ok: false, reason: "not_owner" };
    this.assignments.assign(h.taskId, h.to, this.manager);
    h.state = "accepted";
    return { ok: true };
  }

  get(id: string): Handover | undefined {
    return this.rows.get(id);
  }
}

export interface NextTask {
  taskId: string;
  notice: string;
}

/** A blocked worker takes the next free task and tells the Manager, naming both. */
export function takeNextFree(blockedTask: string, workerId: string, freeTasks: readonly string[]): NextTask | undefined {
  const next = freeTasks.find((t) => t !== blockedTask);
  if (!next) return undefined;
  return { taskId: next, notice: `worker ${workerId} is blocked on ${blockedTask} and took ${next}` };
}
// [SCOPE 159 / T008] END
