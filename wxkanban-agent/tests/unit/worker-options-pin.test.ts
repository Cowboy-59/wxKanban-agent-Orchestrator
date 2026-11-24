/**
 * [SCOPE 159 / T007] UT-042 pin the worker query() options (SPEC-159 FR-022): the PreToolUse hook
 * is registered, the process mark is set, push credentials are gone, and project settings still
 * load (settingSources is not emptied). Changing any of these fails this test.
 */
import { mkdtempSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import { createAutopilotUnitRunner } from "../../apps/remote-bridge/src/autopilot-unit-runner";

describe("UT-042 worker query options are pinned", () => {
  it("registers the hook, marks the process, strips credentials, keeps project settings", async () => {
    process.env.GIT_ASKPASS = "x";
    let seen: Record<string, unknown> | undefined;
    const query = (({ options }: { options: Record<string, unknown> }) => {
      seen = options;
      return (async function* () {
        // ends at once: no result, the runner reports an error; only the options matter here
      })();
    }) as unknown as Parameters<typeof createAutopilotUnitRunner>[0]["query"];
    const repoRoot = mkdtempSync(join(tmpdir(), "wx-pin-"));
    const run = createAutopilotUnitRunner({ repoRoot, mcpUrl: "http://localhost:1", mcpToken: "t", query, timeoutMs: 1000 });
    await run({ num: "900", title: "pin" }, { resolveGate: async () => undefined });
    delete process.env.GIT_ASKPASS;

    const o = seen as { hooks?: { PreToolUse?: unknown[] }; env?: Record<string, string>; settingSources?: unknown };
    expect(o.hooks?.PreToolUse?.length).toBe(1);
    expect(o.env?.WXAI_WORKER).toBe("1");
    expect(o.env?.GIT_ASKPASS).toBeUndefined();
    expect(Object.entries(o.env ?? {}).find(([k]) => k.toLowerCase() === "path")?.[1]).toContain("worker-bin");
    expect(o.settingSources).toBeUndefined();
    expect(readFileSync(join(repoRoot, ".wxai", "worker-bin", "git"), "utf8")).toContain("WXAI_WORKER");
  });
});
