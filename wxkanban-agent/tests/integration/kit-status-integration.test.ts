import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { WorkflowEngine } from "../../core/orchestrator/workflow-engine";
import { LifecycleStage } from "../../core/schemas/lifecycle";
import { ProjectContext } from "../../core/context/project-context";
import {
  writeServiceEntry,
  RUNTIME_STATE_PATH,
} from "../../core/runtime/state-file";

let workdir: string;
let prevCwd: string;

function makeContext(): ProjectContext {
  return {
    projectId: "test-project-id",
    projectName: "kit-status-integration",
    description: "",
    lifecycleStage: LifecycleStage.Implementation,
    features: [],
    artifacts: [],
  };
}

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "kit-status-int-"));
  prevCwd = process.cwd();
  process.chdir(workdir);
});

afterAll(() => {
  process.chdir(prevCwd);
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  const file = join(workdir, RUNTIME_STATE_PATH);
  if (existsSync(file)) rmSync(file, { force: true });
});

describe("kit:status dispatched via WorkflowEngine — FR-009 integration", () => {
  it("kit:status is registered in CrossCuttingCommands and routes to the handler", async () => {
    // Spec 042 cleanup — gateway is the only locally-tracked service (MCP is hosted).
    writeServiceEntry(
      "gateway",
      {
        port: 3003,
        pid: process.pid,
        parentpid: 1,
        startedAt: new Date().toISOString(),
        cmd: "gw",
      },
      workdir,
    );
    const { result, audit } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:status",
      { format: "json" },
      "test-user",
    );
    expect(result.success).toBe(true);
    expect(audit.command).toBe("kit:status");
    const artifact = result.artifact as { summary: { healthy: number } };
    expect(artifact.summary.healthy).toBe(1);
  });

  it("dispatch reports failure when the gateway is missing", async () => {
    mkdirSync(join(workdir, ".wxai"), { recursive: true });
    writeFileSync(
      join(workdir, RUNTIME_STATE_PATH),
      JSON.stringify({ schemaVersion: 1, services: {} }),
    );
    const { result } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:status",
      {},
      "test-user",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("exited with code 1");
  });

  it("dispatch returns exit 2 path when runtime-state file is absent", async () => {
    const { result } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:status",
      { format: "json" },
      "test-user",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("exited with code 2");
  });

  it("kit:status is allowed in every lifecycle stage (cross-cutting)", async () => {
    for (const stage of Object.values(LifecycleStage)) {
      const ctx: ProjectContext = { ...makeContext(), lifecycleStage: stage };
      const { result } = await WorkflowEngine.dispatch(
        ctx,
        "kit:status",
        { format: "json" },
        "test-user",
      );
      // Either healthy success or honest stale/missing failure — but NEVER a policy block.
      if (!result.success) {
        expect(result.error).not.toContain("not permitted");
      }
    }
  });
});
