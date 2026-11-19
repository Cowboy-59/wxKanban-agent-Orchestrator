/**
 * [SCOPE 154 / T007] The per-unit watchdog timeout (the "times out" half of FR-006). No test file
 * existed for autopilot-unit-runner.ts before this task; these cover the watchdog specifically —
 * the done/parked/ask-round-trip paths are exercised indirectly through the result/ask file
 * contract, which is unit-tested by its own readUnitResult/readAskFile behavior here as well.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AUTOPILOT_UNIT_RESULT_DIR,
  createAutopilotUnitRunner,
} from "../../apps/remote-bridge/src/autopilot-unit-runner";
import type { GateResolver } from "../../apps/remote-bridge/src/autopilot-pipeline";

const noResolve: GateResolver = async () => undefined;

describe("createAutopilotUnitRunner — watchdog timeout (FR-006)", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), "autopilot-unit-runner-"));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it("aborts and reports a timed-out error when the session never responds within timeoutMs", async () => {
    // A fake `query()` that never yields anything until the abort fires, then rejects — the same
    // shape the real Agent SDK takes when its abortController fires mid-stream.
    const query = (({ options }: { options: { abortController: AbortController } }) =>
      (async function* () {
        await new Promise<void>((_resolve, reject) => {
          options.abortController.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
        // unreachable, but keeps this a valid async generator for the type checker
        // eslint-disable-next-line no-constant-condition
        if (false) yield undefined as never;
      })()) as unknown as Parameters<typeof createAutopilotUnitRunner>[0]["query"];

    const runUnit = createAutopilotUnitRunner({
      repoRoot,
      mcpUrl: "http://localhost:1",
      mcpToken: "tok",
      query,
      timeoutMs: 20,
    });

    const result = await runUnit({ num: "900", title: "Hang test" }, { resolveGate: noResolve });
    expect(result.ok).toBe(false);
    expect(result.error).toContain("timed out");
    expect(result.error).toContain("0 minutes"); // 20ms rounds to 0 minutes — exercises the wording, not the number
  });

  it("does not time out while waiting on a live gate round trip that outlives timeoutMs", async () => {
    // The real runner embeds its (runId-suffixed) result/ask file paths in the first prompt turn
    // rather than exposing them — read them back out of that turn so this fake session can write
    // to the exact paths readAskFile/readUnitResult will check.
    const extractPath = (text: string, label: "yet" | "to"): string => {
      const m = text.match(label === "yet" ? /yet: (\S+)/ : /to: (\S+)/);
      if (!m) throw new Error(`could not find "${label}:" path in prompt`);
      return m[1];
    };

    const query = (({ prompt, options }: { prompt: AsyncIterable<{ message: { content: string } }>; options: { cwd: string } }) =>
      (async function* () {
        const iter = prompt[Symbol.asyncIterator]();
        const first = await iter.next();
        const text = (first.value as { message: { content: string } }).message.content;
        const askAbs = join(options.cwd, extractPath(text, "yet"));
        const resultAbs = join(options.cwd, extractPath(text, "to"));

        mkdirSync(join(options.cwd, AUTOPILOT_UNIT_RESULT_DIR), { recursive: true });
        writeFileSync(askAbs, JSON.stringify({ question: "Round to the cent?", blocks: "invoices" }), "utf8");
        yield { type: "result", subtype: "success" };

        await iter.next(); // the runner's answer, pushed once ctx.resolveGate settles
        writeFileSync(resultAbs, JSON.stringify({ ok: true }), "utf8");
        yield { type: "result", subtype: "success" };
      })()) as unknown as Parameters<typeof createAutopilotUnitRunner>[0]["query"];

    const slowResolve: GateResolver = async () => {
      await new Promise((resolve) => setTimeout(resolve, 40)); // deliberately > timeoutMs below
      return { decision: "Yes, round half up.", ledgerId: "D-9001" };
    };

    const runUnit = createAutopilotUnitRunner({
      repoRoot,
      mcpUrl: "http://localhost:1",
      mcpToken: "tok",
      query,
      timeoutMs: 15,
    });

    const result = await runUnit({ num: "901", title: "Billing" }, { resolveGate: slowResolve });
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
