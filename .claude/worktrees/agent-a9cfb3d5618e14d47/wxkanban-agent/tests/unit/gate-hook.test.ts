/**
 * SCOPE-134 / T035 — the gate as it ACTUALLY runs: a PreToolUse hook.
 *
 * Found live 2026-09-25: canUseTool is never consulted under bypassPermissions, so the
 * gate had never run and push was ungated. These tests pin the two things that failure
 * taught: (1) BridgeSession hands the SDK a PreToolUse hook and NO canUseTool, and
 * (2) the hook's refusal always comes from us — at its own deadline or on abort — never
 * from the SDK timing the hook out, which would let the tool run.
 */
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock("../../apps/remote-bridge/src/sdk-loader", () => ({
  loadAgentSdk: async () => ({
    query: (params: { options?: Record<string, unknown> }) => {
      captured.options = params.options;
      // An iterator that never yields: enough for start() to wire up.
      return { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }), close() {} };
    },
  }),
}));

import { BridgeSession } from "../../apps/remote-bridge/src/session";
import { createGateHook, GATE_HOOK_TIMEOUT_S } from "../../apps/remote-bridge/src/override-gate";

// [SCOPE 134 / T035] BEGIN — gate hook tests
const handlers = {
  onSessionInit() {},
  onText() {},
  onToolUse() {},
  onAssistantDone() {},
  onResult() {},
  onError() {},
};

const pre = (command: string) =>
  ({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } }) as const;

describe("BridgeSession wires the gate as a PreToolUse hook", () => {
  it("passes hooks.PreToolUse for Bash, no canUseTool, and no git push block", async () => {
    const hook = createGateHook({ requestApproval: async () => false });
    await new BridgeSession({ cwd: ".", overrideGate: hook as never }, handlers).start();
    const o = captured.options as {
      canUseTool?: unknown;
      disallowedTools?: string[];
      permissionMode?: string;
      hooks?: { PreToolUse?: Array<{ matcher?: string; timeout?: number; hooks: unknown[] }> };
    };
    expect(o.canUseTool).toBeUndefined();
    expect(o.hooks?.PreToolUse?.[0]).toMatchObject({ matcher: "Bash", timeout: GATE_HOOK_TIMEOUT_S });
    expect(o.hooks?.PreToolUse?.[0].hooks[0]).toBe(hook);
    expect(o.disallowedTools).toEqual([]);
  });

  it("without a gate, git push stays hard-blocked", async () => {
    await new BridgeSession({ cwd: "." }, handlers).start();
    expect((captured.options as { disallowedTools?: string[] }).disallowedTools).toEqual(["Bash(git push:*)"]);
  });
});

describe("createGateHook", () => {
  const signal = () => ({ signal: new AbortController().signal });

  it("has no opinion on a non-gated call", async () => {
    const hook = createGateHook({ requestApproval: async () => true });
    expect(await hook(pre("npm test"), "t", signal())).toEqual({});
  });

  it("allows a gated call only on an explicit grant", async () => {
    const yes = createGateHook({ requestApproval: async () => true });
    const no = createGateHook({ requestApproval: async () => false });
    expect((await yes(pre("git push origin main"), "t", signal())).hookSpecificOutput?.permissionDecision).toBe("allow");
    expect((await no(pre("git push origin main"), "t", signal())).hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("denies at its OWN deadline, before the SDK could time the hook out", async () => {
    const hook = createGateHook({ requestApproval: () => new Promise<boolean>(() => undefined) }, 20);
    const out = await hook(pre("drizzle-kit push"), "t", signal());
    expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("denies when the SDK aborts", async () => {
    const ac = new AbortController();
    const hook = createGateHook({ requestApproval: () => new Promise<boolean>(() => undefined) });
    const pending = hook(pre("git push"), "t", { signal: ac.signal });
    ac.abort();
    expect((await pending).hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("the deadline sits inside the SDK timeout", async () => {
    const { GATE_DECISION_DEADLINE_MS } = await import("../../apps/remote-bridge/src/override-gate");
    expect(GATE_DECISION_DEADLINE_MS).toBeLessThan(GATE_HOOK_TIMEOUT_S * 1000);
  });
});
// [SCOPE 134 / T035] END
