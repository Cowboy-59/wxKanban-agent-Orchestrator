/**
 * SCOPE-134 / T013, T014 — the override gate.
 *
 * These are REAL behavioural tests, not structural guards: the classifier is pure and the
 * gate is a plain function, so both can be exercised directly. That matters here more
 * than anywhere else in this scope, because the thing being asserted is that an action
 * CANNOT happen — and a test that passes because nothing was wired up would prove nothing.
 *
 * The load-bearing one is "holds with the instruction absent" (FR-009). An agent told to
 * ask permission is one prompt edit away from not asking, and that failure is invisible
 * until the moment it matters. The gate is exercised here with no prompt, no instruction
 * and no session — if it still refuses, the safeguard is structural.
 */
import { describe, it, expect, vi } from "vitest";
import type { CanUseTool, PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import {
  classifyAction,
  createOverrideGate,
  denialMessage,
  type OverrideRequest,
} from "../../apps/remote-bridge/src/override-gate";

// [SCOPE 134 / T014] BEGIN — override gate behaviour

/** The SDK requires toolUseID and requestId; only `signal` is load-bearing for the gate. */
const signal = (ac?: AbortController): Parameters<CanUseTool>[2] => ({
  signal: (ac ?? new AbortController()).signal,
  toolUseID: "test-tool-use",
  requestId: "test-request",
});

const bash = (command: string): Record<string, unknown> => ({ command });

/**
 * Call the gate and refuse a null answer.
 *
 * Not a typing convenience: the SDK treats a null return as "no control_response sent,
 * tool blocked indefinitely". A gate that returned null would look like a very effective
 * safeguard while actually being a hang, so every call asserts it answered.
 */
async function decide(
  gate: CanUseTool,
  command: string,
  ac?: AbortController,
): Promise<PermissionResult> {
  const r = await gate("Bash", bash(command), signal(ac));
  if (!r) throw new Error("gate returned null — the SDK treats that as blocked with no response");
  return r;
}

describe("classifyAction — what is gated", () => {
  it("gates git push", () => {
    expect(classifyAction("Bash", bash("git push origin main"))?.action).toBe("gitpush");
  });

  it("gates git push behind a chained command", () => {
    // The realistic shape: an agent that runs tests first and pushes on success.
    expect(classifyAction("Bash", bash("npm test && git push origin main"))?.action).toBe("gitpush");
    expect(classifyAction("Bash", bash("npm run build; git push"))?.action).toBe("gitpush");
  });

  it("gates git push carrying flags", () => {
    expect(classifyAction("Bash", bash("git -C /repo push --force"))?.action).toBe("gitpush");
  });

  it("gates production data writes", () => {
    expect(classifyAction("Bash", bash("npx drizzle-kit push"))?.action).toBe("prodatawrite");
    expect(classifyAction("Bash", bash('psql "$DATABASE_URL" -c "delete from users"'))?.action).toBe("prodatawrite");
  });

  it("does NOT gate ordinary work", () => {
    // The gate's credibility depends on this. A gate that fires constantly trains
    // reflexive approval and stops being a safeguard.
    for (const cmd of [
      "npm test",
      "git status",
      "git commit -m 'wip'",
      "git pull --rebase",
      "ls -la",
      "npm install express",
      "rm -rf node_modules",
    ]) {
      expect(classifyAction("Bash", bash(cmd)), cmd).toBeNull();
    }
  });

  it("does NOT gate the words appearing in prose", () => {
    // An echo that merely mentions pushing is not a push.
    expect(classifyAction("Bash", bash('echo "remember to git-push later"'))).toBeNull();
    expect(classifyAction("Bash", bash('echo "pushing to the database"'))).toBeNull();
  });

  it("does not gate non-Bash tools", () => {
    expect(classifyAction("Read", { file_path: "/x" })).toBeNull();
    expect(classifyAction("Edit", { file_path: "/x" })).toBeNull();
  });

  it("is pure — same answer regardless of anything external", () => {
    const a = classifyAction("Bash", bash("git push"));
    const b = classifyAction("Bash", bash("git push"));
    expect(a).toEqual(b);
  });
});

describe("the gate suspends and defaults to no", () => {
  it("allows an ungated call without involving the operator at all", async () => {
    const requestApproval = vi.fn();
    const gate = createOverrideGate({ requestApproval });
    expect((await decide(gate, "npm test")).behavior).toBe("allow");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("asks before a gated call, and allows on a grant", async () => {
    const seen: OverrideRequest[] = [];
    const gate = createOverrideGate({
      requestApproval: async (req) => {
        seen.push(req);
        return true;
      },
    });
    expect((await decide(gate, "git push origin main")).behavior).toBe("allow");
    expect(seen).toHaveLength(1);
    expect(seen[0].action).toBe("gitpush");
    // The operator sees the actual command, not a paraphrase of it.
    expect(seen[0].detail).toBe("git push origin main");
  });

  it("REFUSES on denial", async () => {
    const gate = createOverrideGate({ requestApproval: async () => false });
    expect((await decide(gate, "git push")).behavior).toBe("deny");
  });

  it("REFUSES when the approval path throws", async () => {
    // A broken room connection must mean nothing happens, never everything is permitted.
    const gate = createOverrideGate({
      requestApproval: async () => {
        throw new Error("room disconnected");
      },
    });
    expect((await decide(gate, "git push")).behavior).toBe("deny");
  });

  it("REFUSES when the session is aborted mid-wait", async () => {
    // Silence is not consent: an operator who never answers is a refusal, not a pause
    // that eventually becomes a yes.
    const ac = new AbortController();
    const gate = createOverrideGate({
      requestApproval: () => new Promise<boolean>(() => undefined), // never settles
    });
    const pending = decide(gate, "git push", ac);
    ac.abort();
    expect((await pending).behavior).toBe("deny");
  });

  it("REFUSES immediately when already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const requestApproval = vi.fn();
    const gate = createOverrideGate({ requestApproval });
    expect((await decide(gate, "git push", ac)).behavior).toBe("deny");
    expect(requestApproval).not.toHaveBeenCalled();
  });

  it("never returns null — the SDK treats that as blocked indefinitely with no response", async () => {
    // `decide` throws on null, so reaching the assertion IS the assertion.
    const gate = createOverrideGate({ requestApproval: async () => false });
    for (const cmd of ["npm test", "git push"]) {
      expect((await decide(gate, cmd)).behavior).toMatch(/allow|deny/);
    }
  });

  it("reports every decision, granted or not, so the record is a by-product", async () => {
    const decisions: Array<[string, boolean]> = [];
    const gate = createOverrideGate({
      requestApproval: async () => false,
      onDecision: (req, granted) => decisions.push([req.action, granted]),
    });
    await decide(gate, "git push");
    await decide(gate, "npm test");
    // Only the gated one produces a decision; ordinary work is not an override event.
    expect(decisions).toEqual([["gitpush", false]]);
  });
});

describe("FR-009 — the gate holds with the instruction absent", () => {
  it("refuses a push with no prompt, no instruction and no session", async () => {
    // THE test. Nothing here tells the agent to ask. There is no prompt to edit, no
    // system message, no session state — only the runtime. If this passes, the ask is
    // structural; if it could be removed by changing what the agent was told, it is a
    // convention wearing a safeguard's clothes.
    const gate = createOverrideGate({ requestApproval: async () => false });
    const r = await decide(gate, "git push origin main");
    expect(r.behavior).toBe("deny");
    if (r.behavior === "deny") {
      expect(r.message).toContain("explicit grant");
    }
  });

  it("names why, so the agent can report it accurately", () => {
    expect(denialMessage("gitpush")).toMatch(/production/);
    expect(denialMessage("prodatawrite")).toMatch(/production database/);
  });
});
// [SCOPE 134 / T014] END
