// SCOPE-095 Amendment A / T007 — regression coverage for FR-007.
//
// Customer field report bd756151 ran `wxkanban-agent kit:configure` on a fresh
// project and got "Command 'kit:configure' is not permitted in the 'Design'
// stage." That message is the policy adapter's UNKNOWN-command fallback, not a
// stage gate: kit:configure was never registered in CLI_COMMAND_TO_CAPABILITY,
// the Capability enum, or the dispatch switch, so the handler built by spec
// 028/T020 was reachable only from its own tests.
//
// These tests pin all four registration points. The first one is the exact
// string the customer saw — if it ever comes back, this fails.

import { describe, it, expect, afterAll } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { LifecycleStage } from "../../../core/schemas/lifecycle";
import { Capability, gateTable } from "../../../core/policy/capabilities";
import {
  evaluateCommand,
  evaluateStageOnly,
  getAllowedCommandsForStage,
  isSpecGatedCommand,
} from "../../../core/policy/adapters/cli-adapter";
import { WorkflowEngine } from "../../../core/orchestrator/workflow-engine";
import { ProjectContext } from "../../../core/context/project-context";

// A real minted token shape: crypto.randomBytes(32).toString('base64url').
const REAL_TOKEN = "Zm9vYmFyLXRlc3QtdG9rZW4tdmFsdWUtMTIzNDU2Nzg5MA";
const PROJECT_ID = "1b7ff890-ab5d-476e-9fd6-2369af59457a";

const tempRoots: string[] = [];
// [SCOPE 095 / T007] BEGIN — per-test scratch project root
function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "kit-configure-wiring-"));
  tempRoots.push(root);
  return root;
}
// [SCOPE 095 / T007] END

afterAll(() => {
  for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
});

describe("FR-007 — kit:configure is a registered capability", () => {
  it("never reports the customer's stage-violation message, in any stage", () => {
    for (const stage of Object.values(LifecycleStage)) {
      const result = evaluateStageOnly(stage, "kit:configure");
      expect(result.reason).not.toBe(
        `Command 'kit:configure' is not permitted in the '${stage}' stage.`,
      );
      expect(result.allowed).toBe(true);
    }
  });

  it("is allowed in every lifecycle stage — a bootstrap command is never stage-gated", () => {
    for (const stage of Object.values(LifecycleStage)) {
      expect(evaluateCommand(stage, "kit:configure").allowed).toBe(true);
    }
  });

  it("does not require a verified spec (it runs before any spec exists)", () => {
    expect(gateTable[Capability.KitConfigure].requiresVerifiedSpec).toBe(false);
    expect(gateTable[Capability.KitConfigure].allowedPhases).toBe("all");
    expect(isSpecGatedCommand("kit:configure")).toBe(false);
  });

  it("is discoverable — listed in --help output for every stage", () => {
    for (const stage of Object.values(LifecycleStage)) {
      expect(getAllowedCommandsForStage(stage)).toContain("kit:configure");
    }
  });
});

describe("FR-007 — kit:configure dispatches to its handler", () => {
  function makeContext(): ProjectContext {
    return {
      projectId: PROJECT_ID,
      projectName: "kit-configure-wiring",
      description: "",
      lifecycleStage: LifecycleStage.Design,
      features: [],
      artifacts: [],
    };
  }

  it("writes .wxai/project.json through WorkflowEngine.dispatch", async () => {
    const root = makeRoot();
    const { result, audit } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:configure",
      { token: REAL_TOKEN, "project-id": PROJECT_ID, "project-root": root },
      "test-user",
    );

    expect(result.success).toBe(true);
    expect(audit.command).toBe("kit:configure");

    const written = join(root, ".wxai", "project.json");
    expect(existsSync(written)).toBe(true);
    const doc = JSON.parse(readFileSync(written, "utf-8")) as {
      kit: { apiToken: string; projectId: string; mcpBaseUrl: string };
    };
    expect(doc.kit.apiToken).toBe(REAL_TOKEN);
    expect(doc.kit.projectId).toBe(PROJECT_ID);
    expect(doc.kit.mcpBaseUrl).toBe("https://mcp.wxperts.com");
  });

  it("never echoes the raw token into the audit record", async () => {
    const root = makeRoot();
    const { audit } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:configure",
      { token: REAL_TOKEN, "project-id": PROJECT_ID, "project-root": root },
      "test-user",
    );
    expect(JSON.stringify(audit.result)).not.toContain(REAL_TOKEN);
  });

  it("reports the handler's validation failure instead of a policy rejection", async () => {
    const root = makeRoot();
    const { result } = await WorkflowEngine.dispatch(
      makeContext(),
      "kit:configure",
      { token: "short", "project-id": PROJECT_ID, "project-root": root },
      "test-user",
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain("does not look like a wxKanban API token");
    expect(result.error).not.toContain("not permitted in the");
  });
});
