/**
 * [SCOPE 159 / T007] Worker hard blocks (SPEC-159 FR-021): UT-005, UT-006, UT-007.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BlockLog,
  buildWorkerEnv,
  classifyBashCommand,
  classifyWorkerCall,
  gitShimSource,
  installWorkerShims,
  isWorkerProcess,
  makeWorkerPreToolUseHook,
  referenceTransactionHookSource,
  refuseIfWorker,
} from "../../apps/remote-bridge/src/worker-guard";

describe("UT-005 each of the four is denied for a worker", () => {
  it("git push, git commit, ledger append, task reassign", () => {
    expect(classifyWorkerCall({ tool: "Bash", input: { command: "git push origin main" } })).toBe("git_push");
    expect(classifyWorkerCall({ tool: "Bash", input: { command: "git commit -m x" } })).toBe("git_commit");
    expect(classifyWorkerCall({ tool: "Bash", input: { command: "node _wxAI/askgate/ledger.mjs append --file e.json --approved-by a" } })).toBe("ledger_append");
    expect(classifyWorkerCall({ tool: "mcp__wxkanban__project_update_task", input: { taskId: "t", assignedToId: null } })).toBe("task_reassign");
  });

  it("the hook denies with a reason and logs the worker; the decision does not depend on permission mode", async () => {
    const log = new BlockLog();
    const hook = makeWorkerPreToolUseHook("w1", log);
    const out = (await hook({ tool_name: "Bash", tool_input: { command: "git push" } })) as { hookSpecificOutput: { permissionDecision: string } };
    expect(out.hookSpecificOutput.permissionDecision).toBe("deny");
    expect(log.count("git_push")).toBe(1);
    expect(log.all()[0]?.worker).toBe("w1");
  });
});

describe("UT-006 the Manager's permitted actions are not blocked", () => {
  it("reads, tests, other task edits and create_task pass", () => {
    for (const command of ["git status", "git diff", "git log -3", "npm test", "node scripts/x.mjs", "git add a.ts", "echo commit message"]) {
      expect(classifyBashCommand(command)).toBeNull();
    }
    expect(classifyWorkerCall({ tool: "mcp__wxkanban__project_update_task", input: { taskId: "t", status: "done" } })).toBeNull();
    expect(classifyWorkerCall({ tool: "mcp__wxkanban__project_create_task", input: { assignedToId: "u" } })).toBeNull();
    expect(classifyWorkerCall({ tool: "Edit", input: { file_path: "a.ts" } })).toBeNull();
  });
});

describe("UT-007 wrappers and flags are still caught", () => {
  it("bash -c, chained, flags before the subcommand, --no-verify, git.exe", () => {
    expect(classifyBashCommand(`bash -c "git commit --no-verify -m x"`)).toBe("git_commit");
    expect(classifyBashCommand(`sh -c 'cd a && git push --no-verify'`)).toBe("git_push");
    expect(classifyBashCommand("cd x; git -C repo push")).toBe("git_push");
    expect(classifyBashCommand("git.exe commit -m x")).toBe("git_commit");
    expect(classifyBashCommand("npm test && git push")).toBe("git_push");
    expect(classifyBashCommand(`powershell -Command "git commit -m x"`)).toBe("git_commit");
  });

  it("the process mark refuses and counts whatever route reached it", () => {
    const log = new BlockLog();
    const env = buildWorkerEnv({ PATH: "/usr/bin", GIT_ASKPASS: "x", SSH_AUTH_SOCK: "y", GH_TOKEN: "z" }, "/shim", ":");
    expect(isWorkerProcess(env)).toBe(true);
    expect(env.GIT_ASKPASS).toBeUndefined();
    expect(env.SSH_AUTH_SOCK).toBeUndefined();
    expect(env.GH_TOKEN).toBeUndefined();
    expect(env.PATH?.startsWith("/shim:")).toBe(true);
    for (const a of ["git_push", "git_commit", "ledger_append", "task_reassign"] as const) {
      expect(refuseIfWorker(a, env, log, "w1")).toMatch(/Workers may not/);
    }
    expect(log.count()).toBe(4);
    expect(refuseIfWorker("git_push", { PATH: "/usr/bin" }, log)).toBeNull();
  });

  it("shim and ref hook text carry the mark rule; the shim file is written", () => {
    expect(gitShimSource("/usr/bin/git")).toContain('"$WXAI_WORKER" = "1"');
    expect(gitShimSource("/usr/bin/git")).toContain("commit|push)");
    expect(referenceTransactionHookSource()).toContain("refs/heads/*|refs/tags/*");
    const dir = installWorkerShims(join(mkdtempSync(join(tmpdir(), "wx-shim-")), "bin"), "/usr/bin/git");
    expect(readFileSync(join(dir, "git"), "utf8")).toContain("exec \"/usr/bin/git\"");
    expect(readFileSync(join(dir, "git.cmd"), "utf8")).toContain("WXAI_WORKER");
  });
});
