// Bridge-stamped worker identity and the gate-raiser record (SPEC-159 FR-019, FR-029).
// The bridge decides who a worker is when it launches it. A worker never names itself: a
// `sender` in its message is removed, the true identity is stamped, and the overwrite is counted.
// Pure: no I/O.

import type { SenderStamp } from "../../../common-room/src/index";

// [SCOPE 159 / T006] BEGIN — Worker identity registry and message stamping (FR-019)
export interface WorkerIdentity {
  /** Bridge-chosen worker id, unique per launched worker. */
  id: string;
  run: string;
  unit: string;
  persona: string;
  model: string;
}

export type StampResult =
  | { ok: true; raw: Record<string, unknown>; sender: SenderStamp; overwritten: boolean }
  | { ok: false; reason: "unknown_worker" | "not_an_object" };

export class WorkerRegistry {
  private readonly workers = new Map<string, WorkerIdentity>();
  private overwrites = 0;

  /** The bridge calls this when it launches a worker. */
  register(identity: WorkerIdentity): void {
    this.workers.set(identity.id, { ...identity });
  }

  /** A worker that finished or was stopped no longer posts. */
  unregister(workerId: string): void {
    this.workers.delete(workerId);
  }

  identityFor(workerId: string): WorkerIdentity | undefined {
    return this.workers.get(workerId);
  }

  /** The sender stamp for a worker: always built from the bridge's own record. */
  stampFor(workerId: string): SenderStamp | undefined {
    const w = this.workers.get(workerId);
    if (!w) return undefined;
    return { kind: "worker", id: w.id, run: w.run, unit: w.unit, persona: w.persona, model: w.model };
  }

  /** How many messages arrived claiming a sender and had it overwritten. */
  overwriteCount(): number {
    return this.overwrites;
  }

  /**
   * Prepare a worker's raw message for the room. A claimed `sender` is removed (whatever it
   * says, even the worker's own true identity) and counted; the stamp is the bridge's.
   */
  stamp(workerId: string, raw: unknown): StampResult {
    const sender = this.stampFor(workerId);
    if (!sender) return { ok: false, reason: "unknown_worker" };
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { ok: false, reason: "not_an_object" };
    const copy: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    const overwritten = "sender" in copy;
    if (overwritten) {
      delete copy["sender"];
      this.overwrites += 1;
    }
    return { ok: true, raw: copy, sender, overwritten };
  }
}
// [SCOPE 159 / T006] END

// [SCOPE 159 / T006] BEGIN — Gate-raiser record for the Cockpit (FR-029)
export interface RaisedGate {
  gateId: string;
  raisedBy: SenderStamp;
  raisedAt: string;
}

export class GateRaisers {
  private readonly gates = new Map<string, RaisedGate>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  /** A gate is now waiting, and this stamped identity raised it. */
  raise(gateId: string, raisedBy: SenderStamp): RaisedGate {
    const row: RaisedGate = { gateId, raisedBy: { ...raisedBy }, raisedAt: this.now().toISOString() };
    this.gates.set(gateId, row);
    return row;
  }

  raiserOf(gateId: string): SenderStamp | undefined {
    return this.gates.get(gateId)?.raisedBy;
  }

  /** The gate settled or was cancelled. */
  settle(gateId: string): void {
    this.gates.delete(gateId);
  }

  /** Every waiting gate with who raised it, oldest first: what the Cockpit shows. */
  waiting(): RaisedGate[] {
    return [...this.gates.values()].sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));
  }
}
// [SCOPE 159 / T006] END
