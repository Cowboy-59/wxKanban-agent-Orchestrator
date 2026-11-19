// SPEC-151 (SCOPE-132 Amendment D) T004 — the project agent's connection record, with a fake fetch.
import { describe, expect, it, vi } from "vitest";
import {
  AgentAlreadyConnectedError,
  ConnectionRecord,
  type ConnectionInfo,
} from "../../apps/remote-bridge/src/connection-record";

const cfg = { appBaseUrl: "https://app.test", projectToken: "kit-token", supervisor: "KAIN" };
const info: ConnectionInfo = { machine: "LAPTOP", repo: "wxKanban", agentTag: "wxKanban", kitVersion: "1.7.90" };

type Call = { url: string; body: unknown; auth: string };
function fakeFetch(replies: Array<{ status: number; body?: unknown } | Error>) {
  const calls: Call[] = [];
  const impl = vi.fn(async (url: string, init: { headers: Record<string, string>; body?: string }) => {
    calls.push({ url, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.authorization });
    const next = replies.shift();
    if (!next) throw new Error("no reply queued");
    if (next instanceof Error) throw next;
    return { status: next.status, ok: next.status < 400, text: async () => JSON.stringify(next.body ?? {}) };
  });
  return { impl, calls };
}

describe("ConnectionRecord (FR-059 – FR-061)", () => {
  it("opens with the agent's info and the supervisor, then heartbeats and closes by id", async () => {
    const f = fakeFetch([{ status: 201, body: { connectionId: "c1", heartbeatSeconds: 60 } }, { status: 200 }, { status: 200 }]);
    const warn = vi.fn();
    const rec = new ConnectionRecord(cfg, info, warn, f.impl);
    expect(await rec.open()).toBe(true);
    expect(rec.id).toBe("c1");
    expect(f.calls[0]).toEqual({ url: "https://app.test/api/project-agent/connections", body: { ...info, supervisor: "KAIN" }, auth: "Bearer kit-token" });
    await rec.beat("working");
    expect(f.calls[1]).toMatchObject({ url: "https://app.test/api/project-agent/connections/c1/heartbeat", body: { state: "working" } });
    await rec.close();
    expect(f.calls[2].url).toBe("https://app.test/api/project-agent/connections/c1/close");
    expect(rec.id).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it("409 throws AgentAlreadyConnectedError naming the other machine", async () => {
    const f = fakeFetch([{ status: 409, body: { error: "agent_already_connected", machine: "DESKTOP", lastSeenAt: "2026-10-28T11:59:30.000Z" } }]);
    const rec = new ConnectionRecord(cfg, info, vi.fn(), f.impl);
    const err = await rec.open().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentAlreadyConnectedError);
    expect((err as AgentAlreadyConnectedError).code).toBe("agent_already_connected");
    expect((err as Error).message).toContain("DESKTOP");
  });

  it("an older app (404) or no server warns once and runs without a record", async () => {
    for (const reply of [{ status: 404 }, new Error("ECONNREFUSED")]) {
      const f = fakeFetch([reply]);
      const warn = vi.fn();
      const rec = new ConnectionRecord(cfg, info, warn, f.impl);
      expect(await rec.open()).toBe(false);
      expect(rec.id).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
      await rec.beat("idle");
      await rec.close();
      expect(f.calls).toHaveLength(1);
    }
  });

  it("a failed heartbeat changes nothing", async () => {
    const f = fakeFetch([{ status: 201, body: { connectionId: "c1" } }, new Error("timeout"), { status: 500 }]);
    const rec = new ConnectionRecord(cfg, info, vi.fn(), f.impl);
    await rec.open();
    await rec.beat("idle");
    await rec.beat("idle");
    expect(rec.id).toBe("c1");
  });

  it("410 reopens once; a second 410 does not reopen again", async () => {
    const f = fakeFetch([
      { status: 201, body: { connectionId: "c1" } },
      { status: 410, body: { error: "connection_closed" } },
      { status: 201, body: { connectionId: "c2" } },
      { status: 410, body: { error: "connection_closed" } },
    ]);
    const rec = new ConnectionRecord(cfg, info, vi.fn(), f.impl);
    await rec.open();
    await rec.beat("idle");
    expect(rec.id).toBe("c2");
    await rec.beat("idle");
    expect(f.calls).toHaveLength(4);
    expect(rec.id).toBe("c2");
  });

  it("410 then another machine holding the project: keeps running and stops claiming it", async () => {
    const f = fakeFetch([
      { status: 201, body: { connectionId: "c1" } },
      { status: 410 },
      { status: 409, body: { machine: "DESKTOP" } },
    ]);
    const warn = vi.fn();
    const rec = new ConnectionRecord(cfg, info, warn, f.impl);
    await rec.open();
    await rec.beat("idle");
    expect(rec.id).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("DESKTOP"));
  });

  it("close swallows a failure", async () => {
    const f = fakeFetch([{ status: 201, body: { connectionId: "c1" } }, new Error("ECONNRESET")]);
    const rec = new ConnectionRecord(cfg, info, vi.fn(), f.impl);
    await rec.open();
    await expect(rec.close()).resolves.toBeUndefined();
  });
});
