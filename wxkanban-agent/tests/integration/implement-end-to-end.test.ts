import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, cpSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import {
  handleImplementCommand,
  handleImplementBatchCommand,
} from "../../core/orchestrator/command-handlers/implement";
// Spec 019 R6a — implement no longer calls AIClient. Proposals are injected
// via `proposalJson` (string) — no stub needed.

let workdir: string;
let specsDir: string;

function writeSpec(scope: string, slug: string, tasks: { id: string; title: string }[]) {
  const dir = join(specsDir, `${scope}-${slug}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "spec.md"),
    `# Spec ${scope}: ${slug}\n\n## Overview\nE2E test fixture.\n`,
  );
  const rows = tasks.map(
    (t, i) => `| ${i + 1} | ${t.id}: ${t.title} | high | todo |`,
  );
  writeFileSync(
    join(dir, "tasks.md"),
    [
      "# Tasks",
      "",
      "| # | Task | Priority | Status |",
      "|---|------|----------|--------|",
      ...rows,
    ].join("\n"),
  );
}

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), "implement-e2e-"));
  specsDir = join(workdir, "specs");
  mkdirSync(specsDir, { recursive: true });
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
});

beforeEach(() => {
  rmSync(specsDir, { recursive: true, force: true });
  mkdirSync(specsDir, { recursive: true });
  for (const p of ["src", "out"]) {
    const dir = join(workdir, p);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe("implement end-to-end — fixture spec/task", () => {
  it("writes multiple files, each fenced, in one invocation", async () => {
    writeSpec("099", "multifile", [
      { id: "T001", title: "Multi-file scaffold" },
    ]);
    const payload = JSON.stringify([
      {
        path: "src/serviceA.ts",
        body: `export function serviceA(): number { return 1; }\n`,
        action: "create",
      },
      {
        path: "src/serviceB.ts",
        body: `export function serviceB(): number { return 2; }\n`,
        action: "create",
      },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toEqual(
      expect.arrayContaining(["src/serviceA.ts", "src/serviceB.ts"]),
    );

    const a = readFileSync(join(workdir, "src/serviceA.ts"), "utf-8");
    const b = readFileSync(join(workdir, "src/serviceB.ts"), "utf-8");
    for (const body of [a, b]) {
      expect(body).toMatch(/\[SCOPE 099 \/ T001\] BEGIN/);
      expect(body).toMatch(/\[SCOPE 099 \/ T001\] END/);
    }
  });

  it("second invocation against the same task with same input is a no-op", async () => {
    writeSpec("099", "idempotent", [
      { id: "T001", title: "Idempotent run" },
    ]);
    const payload = JSON.stringify([
      {
        path: "src/idem.ts",
        body: `export function idem(): number { return 1; }\n`,
        action: "create",
      },
    ]);

    const first = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    expect(first.exitCode).toBe(0);
    const afterFirst = readFileSync(join(workdir, "src/idem.ts"), "utf-8");

    const second = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    expect(second.exitCode).toBe(0);
    const afterSecond = readFileSync(join(workdir, "src/idem.ts"), "utf-8");

    expect(afterSecond.replace(/[\r\n]+/g, "\n")).toBe(
      afterFirst.replace(/[\r\n]+/g, "\n"),
    );
  });

  it("--file filter limits the write to a single proposed file", async () => {
    writeSpec("099", "filterfile", [
      { id: "T001", title: "Filter test" },
    ]);
    const payload = JSON.stringify([
      { path: "src/keep.ts", body: `export function keep(): number { return 1; }\n`, action: "create" },
      { path: "src/skip.ts", body: `export function skip(): number { return 2; }\n`, action: "create" },
    ]);
    const result = await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      fileOverride: "src/keep.ts",
      proposalJson: payload,
    });
    expect(result.exitCode).toBe(0);
    expect(result.filesWritten).toEqual(["src/keep.ts"]);
    expect(existsSync(join(workdir, "src/skip.ts"))).toBe(false);
  });

  it("tasks.md status flips from todo to done on success", async () => {
    writeSpec("099", "statusflip", [
      { id: "T001", title: "Status flip test" },
    ]);
    const payload = JSON.stringify([
      { path: "src/flip.ts", body: `export function flip(): number { return 1; }\n`, action: "create" },
    ]);
    await handleImplementCommand({
      scope: "099",
      task: "T001",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalJson: payload,
    });
    const tasksMd = readFileSync(
      join(specsDir, "099-statusflip", "tasks.md"),
      "utf-8",
    );
    expect(tasksMd).toMatch(/T001:.*done/);
  });
});

// Spec 031 Phase 3 — Batch-mode integration test using the 999-Fixture scope.
describe("Batch-mode integration (spec 031 FR-013) — fixture scope", () => {
  function copyFixture(): void {
    const fixtureSrc = resolve(__dirname, "..", "fixtures", "specs", "999-Fixture");
    const fixtureDest = join(specsDir, "999-Fixture");
    cpSync(fixtureSrc, fixtureDest, { recursive: true });
  }

  it("runs all three fixture tasks in order against the copied fixture", async () => {
    copyFixture();

    // Canned proposals; T902 imports from T901, T903 from both — mid-batch
    // state visibility is exercised because each task's body references the
    // earlier task's on-disk output (the file was just written).
    const proposals: Record<string, string> = {
      T901: JSON.stringify([
        {
          path: "out/fixture-a.ts",
          body: "export function fixtureA(): number { return 1; }\n",
          action: "create",
        },
      ]),
      T902: JSON.stringify([
        {
          path: "out/fixture-b.ts",
          body:
            "import { fixtureA } from './fixture-a';\nexport function fixtureB(): number { return fixtureA() + 1; }\n",
          action: "create",
        },
      ]),
      T903: JSON.stringify([
        {
          path: "out/fixture-c.ts",
          body:
            "import { fixtureA } from './fixture-a';\nimport { fixtureB } from './fixture-b';\nexport function fixtureC(): number { return fixtureA() + fixtureB(); }\n",
          action: "create",
        },
      ]),
    };

    const result = await handleImplementBatchCommand({
      scope: "999",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async (taskId) => proposals[taskId],
    });

    expect(result.exitCode).toBe(0);
    expect(result.summary.succeeded).toBe(3);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.skipped).toBe(0);
    expect(result.tasks.map((t) => t.taskId)).toEqual(["T901", "T902", "T903"]);

    // All three files written
    expect(existsSync(join(workdir, "out/fixture-a.ts"))).toBe(true);
    expect(existsSync(join(workdir, "out/fixture-b.ts"))).toBe(true);
    expect(existsSync(join(workdir, "out/fixture-c.ts"))).toBe(true);

    // Each task's fence header is present (only T901's body has a top-level
    // function detectable by the declaration detector; T902 and T903 may or
    // may not get fences depending on import-line interactions, so we only
    // assert T901 strictly).
    const aContent = readFileSync(join(workdir, "out/fixture-a.ts"), "utf-8");
    expect(aContent).toMatch(/\/\/ \[SCOPE 999 \/ T901\] BEGIN — Create fixture file A/);

    // tasks.md statuses are flipped to done
    const tasksMd = readFileSync(join(specsDir, "999-Fixture", "tasks.md"), "utf-8");
    expect(tasksMd).toMatch(/T901:.*done/);
    expect(tasksMd).toMatch(/T902:.*done/);
    expect(tasksMd).toMatch(/T903:.*done/);
  });

  it("idempotent re-run skips already-done tasks", async () => {
    copyFixture();

    // Mark T901 + T902 as done before the run so only T903 should run
    const tasksMdPath = join(specsDir, "999-Fixture", "tasks.md");
    let tasksMd = readFileSync(tasksMdPath, "utf-8");
    tasksMd = tasksMd
      .replace(/T901: Create fixture file A \| high \| todo/, "T901: Create fixture file A | high | done")
      .replace(/T902: Create fixture file B that depends on A \| high \| todo/, "T902: Create fixture file B that depends on A | high | done");
    writeFileSync(tasksMdPath, tasksMd);

    const proposals: Record<string, string> = {
      T903: JSON.stringify([
        {
          path: "out/just-f003.ts",
          body: "export function justF3(): number { return 99; }\n",
          action: "create",
        },
      ]),
    };
    const result = await handleImplementBatchCommand({
      scope: "999",
      projectRoot: workdir,
      specsRoot: "specs",
      proposalSource: async (taskId) => proposals[taskId],
    });

    expect(result.exitCode).toBe(0);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]?.taskId).toBe("T903");
  });
});
