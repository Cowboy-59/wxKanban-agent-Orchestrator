/**
 * [SCOPE 159 / T013] The Project Agent takes any instruction (FR-060..FR-064).
 * [SCOPE 159 / T021] Any person on the Project's user list instructs and answers the list wait (FR-094).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AGENT_CONFIG_REL,
  DISCUSSION_NOTE,
  InstructionQueue,
  ScheduleTicker,
  devplanAction,
  isRunDevplan,
  listWaitRoutes,
  loadAgentConfig,
  showListAtConnect,
  standingOf,
} from "../../apps/remote-bridge/src/instruction-intake";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "ii-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const ctx = { developerUserId: "u-dev", isProjectUser: (id: string) => id === "u-member" };

describe("UT-053 who may instruct", () => {
  it("local is the developer; room is by user id; KAIN is stamped", () => {
    expect(standingOf({ channel: "local" }, ctx)).toBe("developer");
    expect(standingOf({ channel: "room", userId: "u-dev" }, ctx)).toBe("developer");
    expect(standingOf({ channel: "room", userId: "u-member" }, ctx)).toBe("project_user");
    expect(standingOf({ channel: "room", kain: true }, ctx)).toBe("kain");
  });
  it("a person not on the Project's user list is discussion only (FR-094)", () => {
    expect(standingOf({ channel: "room", userId: "u-other" }, ctx)).toBe("discussion");
    expect(standingOf({ channel: "room" }, ctx)).toBe("discussion");
  });
  it("an unresolved token never falls back to any room member", () => {
    expect(standingOf({ channel: "room", userId: "u-dev" }, { isProjectUser: () => false })).toBe("discussion");
  });
  it("the discussion note names the Project's user list (FR-094)", () => {
    expect(DISCUSSION_NOTE).toBe(
      "Not taken as an instruction: only a person on this Project's user list, the developer running the agent or KAIN can instruct it.",
    );
  });
});

describe("UT-054 run devplan and the list wait", () => {
  it("developer shows the list and waits; KAIN starts at once; discussion does nothing", () => {
    expect(isRunDevplan("Run devplan")).toBe(true);
    expect(isRunDevplan("run devplan now please")).toBe(false);
    expect(devplanAction("developer")).toBe("show_list_and_wait");
    expect(devplanAction("project_user")).toBe("show_list_and_wait");
    expect(devplanAction("kain")).toBe("start_now");
    expect(devplanAction("discussion")).toBeNull();
  });
  it("during the wait only go, no, skip answer; other text is an instruction", () => {
    expect(listWaitRoutes("go", "developer")).toBe("answer");
    expect(listWaitRoutes("skip 3", "kain")).toBe("answer");
    expect(listWaitRoutes("fix the login bug", "developer")).toBe("instruction");
    expect(listWaitRoutes("go", "discussion")).toBe("discussion");
  });
  it("a project user's go, no or skip answers the list wait (FR-094)", () => {
    expect(listWaitRoutes("go", "project_user")).toBe("answer");
    expect(listWaitRoutes("no", "project_user")).toBe("answer");
    expect(listWaitRoutes("skip 2", "project_user")).toBe("answer");
    expect(listWaitRoutes("fix the login bug", "project_user")).toBe("instruction");
  });
});

describe("UT-055 config, schedule and queue", () => {
  it("connect shows no list with a missing file, a missing key or a damaged file", () => {
    const root = tmp();
    expect(showListAtConnect(loadAgentConfig(root))).toBe(false);
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(join(root, AGENT_CONFIG_REL), "{not json");
    expect(showListAtConnect(loadAgentConfig(root))).toBe(false);
    writeFileSync(join(root, AGENT_CONFIG_REL), JSON.stringify({ showDevplanAtConnect: true }));
    expect(showListAtConnect(loadAgentConfig(root))).toBe(true);
  });
  it("caps schedules at 10 and drops malformed slots", () => {
    const root = tmp();
    mkdirSync(join(root, ".wxai"), { recursive: true });
    const many = Array.from({ length: 14 }, () => ({ at: "09:00", days: ["mon"], instruction: "x" }));
    writeFileSync(join(root, AGENT_CONFIG_REL), JSON.stringify({ schedules: [...many, { at: "bad", days: [], instruction: "y" }] }));
    expect(loadAgentConfig(root).schedules).toHaveLength(10);
  });
  it("a slot fires once per day at its time and a missed slot is not replayed", () => {
    const t = new ScheduleTicker([{ at: "09:00", days: ["mon"], instruction: "run devplan" }]);
    const mon9 = new Date(2026, 10, 23, 9, 0, 5); // Monday 2026-11-23
    expect(t.due(mon9)).toHaveLength(1);
    expect(t.due(new Date(2026, 10, 23, 9, 0, 40))).toHaveLength(0);
    expect(t.due(new Date(2026, 10, 23, 9, 1, 0))).toHaveLength(0);
    expect(t.due(new Date(2026, 10, 24, 9, 0, 5))).toHaveLength(0); // Tuesday
  });
  it("the queue runs in order, one at a time, each logged; KAIN stamped; discussion not queued", () => {
    const q = new InstructionQueue(() => new Date(Date.UTC(2026, 10, 24)));
    expect(q.idle).toBe(true);
    expect(q.submit("first", "kain")).toBe("queued");
    expect(q.submit("second", "developer", "scheduled")).toBe("queued");
    expect(q.submit("chatter", "discussion")).toBe("discussion");
    expect(q.next()).toBe("first");
    expect(q.next()).toBeUndefined();
    q.finish();
    expect(q.next()).toBe("second");
    const log = q.log();
    expect(log.find((r) => r.text === "first")?.stamp).toBe("KAIN");
    expect(log.find((r) => r.text === "second")?.how).toBe("scheduled");
    expect(log.find((r) => r.text === "chatter")?.how).toBe("discussion");
  });
});
