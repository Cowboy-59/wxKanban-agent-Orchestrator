// The local worker room (SPEC-159 FR-002): workers and the Manager talk through a journal under
// .wxai. It makes no network call and starts no service; it only appends to and reads a file.
// Every line is a common-room RoomMessage, checked by the one contract validator.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  parseStoredMessage,
  receiveMessage,
  type ContractResult,
  type RefusalCounter,
  type RoomMessage,
  type SenderStamp,
} from "../../../common-room/src/index";

// [SCOPE 159 / T003] BEGIN — Local worker room journal (FR-002)
export const LOCAL_ROOM_REL = join(".wxai", "local-room.jsonl");

/** The body prefix of the system line that re-asks a waiting gate after a restart. */
export const REASK_PREFIX = "reask:";

export interface LocalRoomOptions {
  root: string;
  projectId: string;
  now?: () => Date;
  counter?: RefusalCounter;
}

export class LocalRoom {
  private readonly file: string;
  private readonly now: () => Date;
  private seq = 0;
  /** The last seq already in the journal when this room was opened: that history is not an answer. */
  private readonly openedSeq: number;
  /** gate id -> seq of the re-ask line written since this room was opened */
  private readonly reasked = new Map<string, number>();

  constructor(private readonly opts: LocalRoomOptions) {
    this.file = join(opts.root, LOCAL_ROOM_REL);
    this.now = opts.now ?? (() => new Date());
    this.seq = this.readAll().reduce((max, m) => Math.max(max, m.seq), 0);
    this.openedSeq = this.seq;
  }

  /** The last seq in the journal; the next message gets this plus one. */
  lastSeq(): number {
    return this.seq;
  }

  /** Check and journal a message. The room stamps seq, sentAt and the sender stamp passed in. */
  post(raw: unknown, sender: SenderStamp): ContractResult<RoomMessage> {
    const checked = receiveMessage(raw, {
      now: this.now(),
      nextSeq: this.seq + 1,
      sender,
      expectedProjectId: this.opts.projectId,
      counter: this.opts.counter,
    });
    if (!checked.ok) return checked;
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, JSON.stringify(checked.value) + "\n", "utf8");
    this.seq = checked.value.seq;
    return checked;
  }

  /** Every journaled message with a seq above `afterSeq`, oldest first. A torn line is skipped. */
  read(afterSeq = 0): RoomMessage[] {
    return this.readAll().filter((m) => m.seq > afterSeq);
  }

  /**
   * Call once when the Manager starts. Each gate still waiting is re-asked exactly once: a system
   * line is journaled, and only a reply that comes after it counts. A second call for the same
   * gate in this process writes nothing.
   */
  resume(waitingGateIds: readonly string[]): number {
    let written = 0;
    for (const gateId of waitingGateIds) {
      if (this.reasked.has(gateId)) continue;
      const line = this.post(
        {
          contractVersion: "1.0.0",
          projectId: this.opts.projectId,
          source: "local",
          to: "agent",
          kind: "gate",
          body: `${REASK_PREFIX}${gateId}`,
        },
        { kind: "system", id: "local-room" },
      );
      if (line.ok) {
        this.reasked.set(gateId, line.value.seq);
        written += 1;
      }
    }
    return written;
  }

  /**
   * May this journaled message settle this gate? A line from before a restart never does. Once
   * a gate has been re-asked, only a line after the re-ask does. A line that is not a gate
   * answer by its kind never does.
   */
  countsAsAnswer(message: RoomMessage, gateId: string): boolean {
    if (message.kind !== "reply") return false;
    const floor = this.reasked.get(gateId);
    if (floor !== undefined) return message.seq > floor;
    return message.seq > this.openedSeq;
  }

  private readAll(): RoomMessage[] {
    if (!existsSync(this.file)) return [];
    const out: RoomMessage[] = [];
    for (const row of readFileSync(this.file, "utf8").split("\n")) {
      if (!row.trim()) continue;
      try {
        const parsed = parseStoredMessage(JSON.parse(row));
        if (parsed.ok) out.push(parsed.value);
      } catch {
        // a torn or foreign line is dropped, never replayed
      }
    }
    return out;
  }
}
// [SCOPE 159 / T003] END
