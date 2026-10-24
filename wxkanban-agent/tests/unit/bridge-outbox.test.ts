import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drainOutbox, OUTBOX_REL } from "../../apps/remote-bridge/src/outbox";

let root: string;
const file = () => join(root, OUTBOX_REL);
const queue = (...texts: string[]) => {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  for (const text of texts) appendFileSync(file(), JSON.stringify({ time: "t", text }) + "\n");
};

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "outbox-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("drainOutbox", () => {
  it("returns 0 and posts nothing when there is no outbox", async () => {
    const posted: string[] = [];
    expect(await drainOutbox(root, async (t) => (posted.push(t), true))).toBe(0);
    expect(posted).toEqual([]);
  });

  it("posts every line oldest first and removes the file", async () => {
    queue("Decision needed (DQ-01): may I load production data?", "second");
    const posted: string[] = [];
    expect(await drainOutbox(root, async (t) => (posted.push(t), true))).toBe(2);
    expect(posted).toEqual(["Decision needed (DQ-01): may I load production data?", "second"]);
    expect(existsSync(file())).toBe(false);
  });

  it("puts back the failed line and everything after it, in order", async () => {
    queue("one", "two", "three");
    let calls = 0;
    const post = async () => ++calls === 1; // first succeeds, then the room is down
    expect(await drainOutbox(root, post)).toBe(1);
    const left = readFileSync(file(), "utf8").trim().split("\n").map((l) => JSON.parse(l).text);
    expect(left).toEqual(["two", "three"]);
  });

  it("drops a torn or textless line instead of posting it", async () => {
    queue("good");
    appendFileSync(file(), "{not json\n" + JSON.stringify({ text: "   " }) + "\n");
    const posted: string[] = [];
    expect(await drainOutbox(root, async (t) => (posted.push(t), true))).toBe(1);
    expect(posted).toEqual(["good"]);
  });

  it("keeps a line appended while it was posting for the next drain", async () => {
    queue("first");
    const posted: string[] = [];
    await drainOutbox(root, async (t) => {
      posted.push(t);
      queue("arrived during the drain"); // the gate appends while we post
      return true;
    });
    expect(posted).toEqual(["first"]);
    expect(JSON.parse(readFileSync(file(), "utf8").trim()).text).toBe("arrived during the drain");
  });
});
