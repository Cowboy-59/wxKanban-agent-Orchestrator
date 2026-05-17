import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  handleImplementCommand,
  handleImplementBatchCommand,
  formatBatchSummaryTable,
  ImplementError,
  BatchImplementResult,
} from "../../core/orchestrator/command-handlers/implement";
import {
  buildImplementPrompt,
  parseProposal,
  ProposalParseError,
} from "../../core/orchestrator/implement-prompt";
import {
  loadSpecBundle,
  findTask,
  verifyTaskUnblocked,
  SpecNotFoundError,
  TaskNotFoundError,
} from "../../core/orchestrator/spec-loader";
import { markTaskDone } from "../../core/orchestrator/tasks-md-writer";
// Spec 019 R6a — implement no longer calls AIClient. Proposals are injected
// via `proposalJson` (string) or `proposal` (parsed array).

let workdir: string;
let specsDir: string;

function writeSampleSpec(scope: string, slug: string, taskTable: string[]) {
  const dir = join(specsDir, `${scope}-${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "spec.md"),
    `# Spec ${scope}: ${slug}\n\n## Overview\nTest spec.\n\n## Functional Requirements\nFR-001 — example.\n`,
  );
  writeFileSync(
    join(dir, "tasks.md"),
    [
      "# Tasks",
      "",
      "| # | Task | Priority | Status |",
      "|---|------|----------|--------|",
      ...taskTable,
    ].join("\n"),
  );
}

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "implement-test-"));
  specsDir = join(workdir, "specs");
  mkdirSync(specsDir, { recursive: true });
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(specsDir, { recursive: true, force: true });
  mkdirSync(specsDir, { recursive: true });
});

describe("Spec loader", () => {
  it("loads spec.md + tasks.md from a numbered directory", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const bundle = loadSpecBundle(specsDir, "099");
    expect(bundle.scope).toBe("099");
    expect(bundle.slug).toBe("demo");
    expect(bundle.tasks).toHaveLength(1);
    expect(bundle.tasks[0]?.id).toBe("T001");
  });

  it("throws SpecNotFoundError when scope dir is missing", () => {
    expect(() => loadSpecBundle(specsDir, "777")).toThrow(SpecNotFoundError);
  });

  it("findTask throws TaskNotFoundError for unknown task", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const bundle = loadSpecBundle(specsDir, "099");
    expect(() => findTask(bundle, "T999")).toThrow(TaskNotFoundError);
  });

  it("verifyTaskUnblocked succeeds with no dependencies", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const bundle = loadSpecBundle(specsDir, "099");
    const t = findTask(bundle, "T001");
    expect(() => verifyTaskUnblocked(bundle, t)).not.toThrow();
  });
});

describe("Implement prompt builder", () => {
  it("includes spec, task title, and { files: [...] } output instruction (Spec 019 R7 AC 6)", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const bundle = loadSpecBundle(specsDir, "099");
    const task = findTask(bundle, "T001");
    const { systemPrompt, userPrompt } = buildImplementPrompt({ bundle, task });
    // JSON-mode object shape (Spec 019 R7 AC 6 — replaces the bare-array
    // contract; Groq/OpenAI JSON-mode only guarantees object output).
    expect(systemPrompt).toMatch(/JSON object/);
    expect(systemPrompt).toMatch(/"files"/);
    expect(userPrompt).toMatch(/Sample task/);
    expect(userPrompt).toMatch(/T001/);
    expect(userPrompt).toMatch(/Spec 099/);
  });
});

describe("Proposal parser", () => {
  it("parses a valid JSON array", () => {
    const raw = JSON.stringify([
      { path: "src/x.ts", body: "export function x() {}", action: "create" },
    ]);
    const out = parseProposal(raw);
    expect(out).toHaveLength(1);
    expect(out[0]?.action).toBe("create");
  });

  it("strips ```json fences if the AI wraps the output", () => {
    const raw = '```json\n[{"path":"a.ts","body":"x","action":"create"}]\n```';
    const out = parseProposal(raw);
    expect(out[0]?.path).toBe("a.ts");
  });

  it("rejects non-array root", () => {
    expect(() => parseProposal('{"path":"x","body":"y","action":"create"}')).toThrow(
      ProposalParseError,
    );
  });

  it("rejects invalid action", () => {
    expect(() =>
      parseProposal(
        JSON.stringify([{ path: "x.ts", body: "y", action: "purge" }]),
      ),
    ).toThrow(ProposalParseError);
  });

  it("accepts delete action (spec 031 FR-001)", () => {
    const out = parseProposal(
      JSON.stringify([{ path: "x.ts", body: "", action: "delete" }]),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.action).toBe("delete");
    expect(out[0]?.body).toBe("");
  });

  it("rejection message lists all three valid actions", () => {
    try {
      parseProposal(
        JSON.stringify([{ path: "x.ts", body: "y", action: "purge" }]),
      );
      throw new Error("expected ProposalParseError");
    } catch (err) {
      expect((err as Error).message).toMatch(/'create', 'modify', or 'delete'/);
    }
  });
});

describe("tasks.md writer", () => {
  it("flips a todo task to done", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const tasksMd = join(specsDir, "099-demo", "tasks.md");
    const changed = markTaskDone(tasksMd, "T001");
    expect(changed).toBe(true);
    const after = readFileSync(tasksMd, "utf-8");
    expect(after).toMatch(/T001:.*done/);
  });

  it("is idempotent when task already done", () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | done |",
    ]);
    const tasksMd = join(specsDir, "099-demo", "tasks.md");
    const changed = markTaskDone(tasksMd, "T001");
    expect(changed).toBe(false);
  });
});

describe("Implement command handler — happy path with stub AI", () => {
  it("writes files, applies fence, marks task done", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Sample task | high | todo |",
    ]);
    const targetPath = "out/sample.ts";
    const aiPayload = JSON.stringify([
      {
        path: targetPath,
        body: `export function sampleFn(): number { return 42; }\n`,
        action: "create",
      },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: aiPayload,
    });
    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toContain(targetPath);

    const written = readFileSync(join(workdir, targetPath), "utf-8");
    expect(written).toMatch(
      /\/\/ \[SCOPE 099 \/ T001\] BEGIN — Sample task/,
    );
    expect(written).toMatch(/\/\/ \[SCOPE 099 \/ T001\] END/);

    const tasksMd = readFileSync(
      join(specsDir, "099-demo", "tasks.md"),
      "utf-8",
    );
    expect(tasksMd).toMatch(/T001:.*done/);
  });

  it("skips files without a detectable unit and surfaces a warning", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T002: Config-only task | high | todo |",
    ]);
    const aiPayload = JSON.stringify([
      {
        path: "out/just-constants.ts",
        body: `const X = 1;\nconst Y = 2;\n`,
        action: "create",
      },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T002",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: aiPayload,
    });
    expect(result.exitCode).toBe(0);
    expect(result.filesSkipped.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("just-constants.ts"))).toBe(
      true,
    );
  });

  it("--dry-run does not write files or flip tasks.md", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T003: Dry run task | high | todo |",
    ]);
    const aiPayload = JSON.stringify([
      {
        path: "out/dryrun.ts",
        body: `export function dryFn(): number { return 1; }\n`,
        action: "create",
      },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T003",
      projectRoot: workdir,
      specsRoot: "specs",
      dryRun: true,
      proposalJson: aiPayload,
    });
    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toHaveLength(0);
    const tasksMd = readFileSync(
      join(specsDir, "099-demo", "tasks.md"),
      "utf-8",
    );
    expect(tasksMd).toMatch(/T003:.*todo/);
  });

  it("returns 2 (spec-not-found) when scope dir is missing", async () => {
    const aiPayload = JSON.stringify([]);
    await expect(
      handleImplementCommand({
        scope: "777",
        task: "T001",
        projectRoot: workdir,
        specsRoot: "specs",
        proposalJson: aiPayload,
      }),
    ).rejects.toMatchObject({ exitCode: 2 });
  });

  it("returns 3 (AI failure) when AI output is not parseable JSON", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T001: Bad-AI task | high | todo |",
    ]);
    await expect(
      handleImplementCommand({
        scope: "099",
        task: "T001",
        projectRoot: workdir,
        specsRoot: "specs",
        proposalJson: "this is not json",
      }),
    ).rejects.toMatchObject({ exitCode: 3 });
  });
});

describe("Delete action — handler branch (spec 031 FR-002, FR-003)", () => {
  it("removes the file and reports it in filesDeleted", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T100: Delete existing file | high | todo |",
    ]);
    const targetPath = "out/to-be-deleted.ts";
    const targetAbs = join(workdir, targetPath);
    mkdirSync(join(workdir, "out"), { recursive: true });
    writeFileSync(targetAbs, "export const x = 1;\n");

    const aiPayload = JSON.stringify([
      { path: targetPath, body: "", action: "delete" },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T100",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: aiPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesDeleted).toContain(targetPath);
    expect(result.filesWritten).toHaveLength(0);
    expect(() => readFileSync(targetAbs, "utf-8")).toThrow();
  });

  it("throws ImplementError(2) when the target file does not exist", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T101: Delete missing file | high | todo |",
    ]);
    const aiPayload = JSON.stringify([
      { path: "out/not-there.ts", body: "", action: "delete" },
    ]);
    await expect(
      handleImplementCommand({
        scope: "099",
        task: "T101",
        projectRoot: workdir,
        specsRoot: "specs",
        proposalJson: aiPayload,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringMatching(/cannot delete .*: file does not exist/),
    });
  });

  it("--dry-run does not remove the file but records the intent in filesSkipped", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T102: Dry-run delete | high | todo |",
    ]);
    const targetPath = "out/dryrun-delete.ts";
    const targetAbs = join(workdir, targetPath);
    mkdirSync(join(workdir, "out"), { recursive: true });
    writeFileSync(targetAbs, "export const y = 2;\n");

    const aiPayload = JSON.stringify([
      { path: targetPath, body: "", action: "delete" },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T102",
      projectRoot: workdir,
      specsRoot: "specs",
      dryRun: true,
      proposalJson: aiPayload,
    });

    expect(result.exitCode).toBe(0);
    expect(result.filesDeleted).toHaveLength(0);
    expect(result.filesSkipped).toContain(targetPath);
    expect(readFileSync(targetAbs, "utf-8")).toBe("export const y = 2;\n");
  });

  it("success message includes 'deleted N' when filesDeleted is non-empty", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T103: Message includes deleted count | high | todo |",
    ]);
    const targetPath = "out/message-test.ts";
    const targetAbs = join(workdir, targetPath);
    mkdirSync(join(workdir, "out"), { recursive: true });
    writeFileSync(targetAbs, "export const z = 3;\n");

    const aiPayload = JSON.stringify([
      { path: targetPath, body: "", action: "delete" },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T103",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: aiPayload,
    });

    expect(result.message).toMatch(/deleted 1/);
  });

  it("success message omits 'deleted N' for create-only proposals (backwards-compat)", async () => {
    writeSampleSpec("099", "demo", [
      "| 1 | T104: Create-only no deleted segment | high | todo |",
    ]);
    const aiPayload = JSON.stringify([
      {
        path: "out/created-only.ts",
        body: "export function createdOnly(): number { return 7; }\n",
        action: "create",
      },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T104",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: aiPayload,
    });

    expect(result.message).not.toMatch(/deleted/);
  });
});

describe("ImplementError exit codes", () => {
  it("carries the exitCode through the error chain", () => {
    const err = new ImplementError(2, "test");
    expect(err.exitCode).toBe(2);
    expect(err.message).toBe("test");
  });
});

describe("Batch mode — handleImplementBatchCommand (spec 031 FR-005..FR-008)", () => {
  function makeProposal(targetPath: string, body: string): string {
    return JSON.stringify([{ path: targetPath, body, action: "create" }]);
  }

  it("runs all todo tasks in file order and reports succeeded count", async () => {
    writeSampleSpec("099", "batch-happy", [
      "| 1 | T200: First task | high | todo |",
      "| 2 | T201: Second task | high | todo |",
    ]);
    const proposals: Record<string, string> = {
      T200: makeProposal(
        "out/batch-1.ts",
        "export function batchOne(): number { return 1; }\n",
      ),
      T201: makeProposal(
        "out/batch-2.ts",
        "export function batchTwo(): number { return 2; }\n",
      ),
    };
    const result = await handleImplementBatchCommand({
      scope: "099",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async (taskId) => proposals[taskId],
    });
    expect(result.exitCode).toBe(0);
    expect(result.summary.succeeded).toBe(2);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0]?.taskId).toBe("T200");
    expect(result.tasks[1]?.taskId).toBe("T201");
  });

  it("skips tasks whose proposalSource returns undefined", async () => {
    writeSampleSpec("099", "batch-skip", [
      "| 1 | T210: Will skip | high | todo |",
      "| 2 | T211: Also skip | high | todo |",
    ]);
    const result = await handleImplementBatchCommand({
      scope: "099",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async () => undefined,
    });
    expect(result.exitCode).toBe(0);
    expect(result.summary.succeeded).toBe(0);
    expect(result.summary.skipped).toBe(2);
  });

  it("default stop-on-failure halts after the first failed task", async () => {
    writeSampleSpec("099", "batch-stop", [
      "| 1 | T220: First task | high | todo |",
      "| 2 | T221: Failing task | high | todo |",
      "| 3 | T222: Never runs | high | todo |",
    ]);
    const proposals: Record<string, string> = {
      T220: makeProposal(
        "out/stop-1.ts",
        "export function stopOne(): number { return 1; }\n",
      ),
      T221: "this is not valid json",
      T222: makeProposal(
        "out/stop-3.ts",
        "export function stopThree(): number { return 3; }\n",
      ),
    };
    const result = await handleImplementBatchCommand({
      scope: "099",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async (taskId) => proposals[taskId],
    });
    expect(result.exitCode).toBe(3);
    expect(result.summary.succeeded).toBe(1);
    expect(result.summary.failed).toBe(1);
    expect(result.tasks).toHaveLength(2); // T222 not attempted
    expect(result.tasks[1]?.taskId).toBe("T221");
  });

  it("--continue-on-error proceeds past failures and reports aggregate", async () => {
    writeSampleSpec("099", "batch-continue", [
      "| 1 | T230: First | high | todo |",
      "| 2 | T231: Fails | high | todo |",
      "| 3 | T232: Still runs | high | todo |",
    ]);
    const proposals: Record<string, string> = {
      T230: makeProposal(
        "out/cont-1.ts",
        "export function cont1(): number { return 1; }\n",
      ),
      T231: "garbage not json",
      T232: makeProposal(
        "out/cont-3.ts",
        "export function cont3(): number { return 3; }\n",
      ),
    };
    const result = await handleImplementBatchCommand({
      scope: "099",
      projectRoot: workdir,
      specsRoot: "specs",
      continueOnError: true,
      proposalSource: async (taskId) => proposals[taskId],
    });
    expect(result.exitCode).toBe(3); // highest failure exit code propagates
    expect(result.summary.succeeded).toBe(2);
    expect(result.summary.failed).toBe(1);
    expect(result.tasks).toHaveLength(3);
  });

  it("throws ImplementError(2) on duplicate task ids in tasks.md", async () => {
    writeSampleSpec("099", "batch-dup", [
      "| 1 | T240: Duplicate | high | todo |",
      "| 2 | T240: Duplicate | high | todo |",
    ]);
    await expect(
      handleImplementBatchCommand({
        scope: "099",
        projectRoot: workdir,
        specsRoot: "specs",
        proposalSource: async () => undefined,
      }),
    ).rejects.toMatchObject({
      exitCode: 2,
      message: expect.stringMatching(/duplicate task id: T240/),
    });
  });

  it("skips tasks whose status is not 'todo'", async () => {
    writeSampleSpec("099", "batch-done", [
      "| 1 | T250: Already done | high | done |",
      "| 2 | T251: Still todo | high | todo |",
    ]);
    const result = await handleImplementBatchCommand({
      scope: "099",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async () => undefined,
    });
    // T250 (done) is filtered out; T251 (todo) is skipped because no proposal.
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.taskId).toBe("T251");
    expect(result.summary.skipped).toBe(1);
  });

  it("returns ImplementError(2) when the spec scope does not exist", async () => {
    await expect(
      handleImplementBatchCommand({
        scope: "888",
        projectRoot: workdir,
        specsRoot: "specs",
        proposalSource: async () => undefined,
      }),
    ).rejects.toMatchObject({ exitCode: 2 });
  });
});

describe("Dry-run summary table formatter (spec 031 FR-009)", () => {
  function makeOutcome(
    taskId: string,
    overrides: Partial<{
      filesWritten: string[];
      filesDeleted: string[];
      warnings: string[];
    }> = {},
  ) {
    return {
      taskId,
      result: {
        exitCode: 0 as const,
        message: `implement 099/${taskId} — ok`,
        filesWritten: overrides.filesWritten ?? [],
        filesSkipped: [],
        filesDeleted: overrides.filesDeleted ?? [],
        warnings: overrides.warnings ?? [],
      },
    };
  }

  it("renders a summary table with one row per task", () => {
    const batchResult: BatchImplementResult = {
      exitCode: 0,
      tasks: [
        makeOutcome("T300", { filesWritten: ["a.ts"] }),
        makeOutcome("T301", { filesWritten: ["b.ts", "c.ts"] }),
        makeOutcome("T302", { filesDeleted: ["d.ts"] }),
      ],
      summary: {
        succeeded: 3,
        failed: 0,
        skipped: 0,
        totalFilesWritten: 3,
        totalFilesDeleted: 1,
        totalWarnings: 0,
      },
    };
    const out = formatBatchSummaryTable(batchResult);
    expect(out).toMatch(/T300/);
    expect(out).toMatch(/T301/);
    expect(out).toMatch(/T302/);
    expect(out).toMatch(/3 succeeded, 0 failed, 0 skipped/);
    expect(out).toMatch(/3 file write\(s\), 1 delete\(s\), 0 warning\(s\)/);
  });

  it("includes a per-task detail section when verbose=true", () => {
    const batchResult: BatchImplementResult = {
      exitCode: 0,
      tasks: [makeOutcome("T310", { filesWritten: ["x.ts"], warnings: ["w1"] })],
      summary: {
        succeeded: 1,
        failed: 0,
        skipped: 0,
        totalFilesWritten: 1,
        totalFilesDeleted: 0,
        totalWarnings: 1,
      },
    };
    const out = formatBatchSummaryTable(batchResult, { verbose: true });
    expect(out).toMatch(/--- Per-task detail ---/);
    expect(out).toMatch(/### T310/);
    expect(out).toMatch(/Written: x\.ts/);
    expect(out).toMatch(/Warning: w1/);
  });

  it("renders failed and skipped outcomes with their reasons", () => {
    const batchResult: BatchImplementResult = {
      exitCode: 3,
      tasks: [
        {
          taskId: "T320",
          result: { status: "failed", reason: "bad json" },
        },
        {
          taskId: "T321",
          result: { status: "skipped", reason: "no proposal provided" },
        },
      ],
      summary: {
        succeeded: 0,
        failed: 1,
        skipped: 1,
        totalFilesWritten: 0,
        totalFilesDeleted: 0,
        totalWarnings: 0,
      },
    };
    const out = formatBatchSummaryTable(batchResult);
    expect(out).toMatch(/failed: bad json/);
    expect(out).toMatch(/skipped: no proposal provided/);
  });
});
