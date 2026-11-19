/**
 * SCOPE-137 / T010 (FR-009) — the Remote Session Bridge runs unattended.
 *
 * The Change Impact hook is a command hook in the project's .claude/settings.json; it learns
 * that nobody is at the keyboard from WXAI_UNATTENDED / WXAI_REMOTE in its environment. So the
 * bridge's session must (1) set both, (2) keep everything else it inherits — the SDK's `env`
 * REPLACES the child environment — and (3) still load project settings, where the hook lives.
 */
import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ options: undefined as Record<string, unknown> | undefined }));

vi.mock("../../apps/remote-bridge/src/sdk-loader", () => ({
  loadAgentSdk: async () => ({
    query: (params: { options?: Record<string, unknown> }) => {
      captured.options = params.options;
      return { [Symbol.asyncIterator]: () => ({ next: () => new Promise(() => undefined) }), close() {} };
    },
  }),
}));

import { BridgeSession } from "../../apps/remote-bridge/src/session";

// [SCOPE 137 / T010] BEGIN — bridge session environment tests
const handlers = {
  onSessionInit() {},
  onText() {},
  onToolUse() {},
  onAssistantDone() {},
  onResult() {},
  onError() {},
};

describe("SCOPE-137 T010 — the bridge session is unattended and remote", () => {
  it("sets WXAI_UNATTENDED and WXAI_REMOTE, and keeps the inherited environment", async () => {
    process.env.SCOPE137_PROBE = "kept";
    await new BridgeSession({ cwd: "." }, handlers).start();
    const env = (captured.options as { env?: Record<string, string | undefined> }).env ?? {};
    expect(env.WXAI_UNATTENDED).toBe("1");
    expect(env.WXAI_REMOTE).toBe("1");
    expect(env.SCOPE137_PROBE).toBe("kept");
    expect(env.PATH ?? env.Path).toBeTruthy();
    delete process.env.SCOPE137_PROBE;
  });

  it("still loads project settings, where the Change Impact hook is installed", async () => {
    await new BridgeSession({ cwd: "." }, handlers).start();
    const sources = (captured.options as { settingSources?: string[] }).settingSources;
    // Omitted means user + project settings load; if it is ever set, it must include project.
    expect(sources === undefined || sources.includes("project")).toBe(true);
  });
});
// [SCOPE 137 / T010] END
