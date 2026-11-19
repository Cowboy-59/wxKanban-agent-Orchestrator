// SPEC-142 / T016 — OpenViking backend against a local mock HTTP server.
// The mock encodes the UNVERIFIED shapes in ADAPTER; it proves our code, not the real service.
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ADAPTER,
  BUDGET_MS,
  createOpenVikingBackend,
  repoNamespace,
  validateIndexable,
} from "../../../_wxAI/askgate/openviking.mjs";

type Doc = { namespace: string; id: string; tier: string; text: string };
const docs: Doc[] = [];
let mode: "ok" | "slow" | "http500" | "garbage" | "badshape" = "ok";
let seenKey: string | undefined;
let seenAgent: string | undefined;
const staging = mkdtempSync(join(tmpdir(), "ov-stage-"));
let server: Server;
let base = "";

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      seenKey = req.headers[ADAPTER.authHeader.toLowerCase()] as string | undefined;
      seenAgent = req.headers[ADAPTER.agentHeader.toLowerCase()] as string | undefined;
      const reply = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json" });
        res.end(typeof body === "string" ? body : JSON.stringify(body));
      };
      if (mode === "slow") return; // never answers
      if (mode === "http500") return reply(500, { error: "x" });
      if (mode === "garbage") return reply(200, "not json{");
      if (req.url === "/health") return reply(200, { status: "ok" });
      const body = raw ? JSON.parse(raw) : {};
      if (req.url === "/api/v1/resources") {
        const rel = String(body.path).replace(/^\/staging\//, "");
        const text = readFileSync(join(staging, rel), "utf8");
        docs.push({ namespace: body.namespace, id: rel.split("/").pop()!.replace(/\.md$/, ""), tier: body.namespace === "global" ? "global" : "repo", text });
        return reply(200, { ok: true });
      }
      if (req.url === "/api/v1/search/find") {
        if (mode === "badshape") return reply(200, { weird: true });
        const words = String(body.query).toLowerCase().split(/\W+/);
        const results = docs
          .filter((d) => d.namespace === body.namespace)
          .map((d) => ({ score: words.filter((w) => w && d.text.toLowerCase().includes(w)).length / words.length, content: d.text, metadata: { id: d.id, tier: d.tier } }))
          .filter((r) => r.score > 0);
        return reply(200, { results });
      }
      reply(404, {});
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections?.();
  server.close();
});

const mk = (extra = {}) => createOpenVikingBackend({ baseUrl: base, apiKey: "test-key", root: "/tmp/repo-a", stagingDir: staging, ...extra });

describe("openviking backend", () => {
  it("has the contract shape and a 2000 ms budget", () => {
    const b = mk();
    expect(b.name).toBe("openviking");
    expect(typeof b.available).toBe("function");
    expect(typeof b.search).toBe("function");
    expect(BUDGET_MS).toBe(2000);
  });

  it("reports available and sends the key header", async () => {
    mode = "ok";
    expect(await mk().available()).toBe(true);
    expect(seenKey).toBe("Bearer test-key");
    expect(seenAgent).toBe("wxai-askgate");
  });

  it("indexes a ledger entry and finds it, scoped by namespace", async () => {
    mode = "ok";
    const b = mk();
    const r = await b.index({ id: "D-0001", question: "How are endorsements prorated?", decision: "Daily, on the effective date.", rationale: "Matches billing." });
    expect(r.ok).toBe(true);
    expect(existsSync(join(staging, repoNamespace("/tmp/repo-a"), "D-0001.md"))).toBe(true);
    const ns = repoNamespace("/tmp/repo-a");
    const hits = await b.search("endorsements prorated", [ns]);
    expect(hits[0]).toMatchObject({ id: "D-0001", tier: "repo" });
    expect(hits[0].text).toContain("Daily");
    // another repo's namespace sees nothing
    expect(await b.search("endorsements prorated", [repoNamespace("/tmp/repo-b")])).toEqual([]);
  });

  it("puts a global pattern in the global namespace with tier global", async () => {
    mode = "ok";
    const b = mk();
    expect((await b.index({ id: "G-0001", tier: "global", text: "Every web sign-up confirms its email address." })).namespace).toBe("global");
    const hits = await b.search("sign-up confirms email", ["global"]);
    expect(hits[0]).toMatchObject({ id: "G-0001", tier: "global" });
  });

  it("refuses code and non-ledger ids", async () => {
    expect(validateIndexable({ id: "D-0002", text: "```ts\nconst a=1\n```" })).toMatch(/code/);
    expect(validateIndexable({ id: "src/app.ts", text: "x" })).toMatch(/id/);
    expect(validateIndexable({ id: "D-0003", text: "x".repeat(5000) })).toMatch(/long/);
    expect((await mk().index({ id: "bad", text: "x" })).ok).toBe(false);
  });

  it("fails soft: slow service times out inside the budget", async () => {
    mode = "slow";
    const b = mk({ timeoutMs: 150 });
    const t0 = Date.now();
    expect(await b.available()).toBe(false);
    await expect(b.search("q", ["global"])).rejects.toThrow(/timed out/);
    expect(Date.now() - t0).toBeLessThan(1500);
    expect(b.state.lastOk).toBe(false);
  });

  it("fails soft on HTTP error, non-JSON and unexpected shapes", async () => {
    for (const m of ["http500", "garbage"] as const) {
      mode = m;
      const b = mk();
      expect(await b.available()).toBe(false);
      await expect(b.search("q", ["global"])).rejects.toThrow();
    }
    mode = "badshape";
    await expect(mk().search("q", ["global"])).rejects.toThrow(/shape/);
  });

  it("is down when nothing listens", async () => {
    const b = createOpenVikingBackend({ baseUrl: "http://127.0.0.1:1", apiKey: null, timeoutMs: 500 });
    expect(await b.available()).toBe(false);
    expect((await b.ping()).up).toBe(false);
  });

  it("gives distinct stable namespaces per repo", () => {
    expect(repoNamespace("/a/x")).toBe(repoNamespace("/a/x"));
    expect(repoNamespace("/a/x")).not.toBe(repoNamespace("/b/x"));
  });
});
