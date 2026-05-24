// Regression test for BUG-2026-05-24-createspecs-dbpush-format-mismatch.
// `createspecs` emits tasks.md with the summary table `| # | Task | Priority | Status |`
// (integer in col 1, bare title in col 2, no T### prefix). The pre-fix
// `dbpush.parseTasksMd` required `T\d+` in col 2 and matched zero rows,
// silently reporting `tasksCreated: 0` for every spec. This test pins the
// round-trip so the two never diverge again.

import { describe, it, expect } from "vitest";
import { generateTasksMarkdown } from "../../core/orchestrator/command-handlers/createspecs";
import { parseTasksMd } from "../../dbpush";

describe("createspecs → dbpush tasks.md round-trip (BUG-2026-05-24)", () => {
  it("dbpush parses every task createspecs emits", () => {
    const md = generateTasksMarkdown({
      specNumber: "042",
      featureName: "Round Trip",
      featureDescription: "test",
      problem: "x",
      solution: "y",
      tasks: [
        { title: "First task", description: "do thing 1", priority: "high", status: "todo" },
        { title: "Second task", description: "do thing 2", priority: "medium", status: "todo" },
        { title: "Third task", description: "do thing 3", priority: "low", status: "todo" },
      ],
    });

    const parsed = parseTasksMd(md);
    expect(parsed.length).toBe(3);

    expect(parsed[0].id).toBe("T001");
    expect(parsed[0].title).toBe("First task");
    expect(parsed[0].status).toBe("todo");

    expect(parsed[1].id).toBe("T002");
    expect(parsed[1].title).toBe("Second task");

    expect(parsed[2].id).toBe("T003");
    expect(parsed[2].title).toBe("Third task");
  });

  it("synthesizes zero-padded T### from column-1 integer for 10+ tasks", () => {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      title: `Task ${i + 1}`,
      description: `desc ${i + 1}`,
      priority: "medium",
      status: "todo",
    }));
    const md = generateTasksMarkdown({
      specNumber: "043",
      featureName: "Many",
      featureDescription: "",
      problem: "",
      solution: "",
      tasks,
    });
    const parsed = parseTasksMd(md);
    expect(parsed.length).toBe(12);
    expect(parsed[9].id).toBe("T010");
    expect(parsed[10].id).toBe("T011");
    expect(parsed[11].id).toBe("T012");
  });

  it("ignores the header + separator rows", () => {
    const md = generateTasksMarkdown({
      specNumber: "044",
      featureName: "Skip headers",
      featureDescription: "",
      problem: "",
      solution: "",
      tasks: [{ title: "Only", description: "x", priority: "high", status: "todo" }],
    });
    const parsed = parseTasksMd(md);
    expect(parsed.length).toBe(1);
    expect(parsed[0].title).toBe("Only");
  });

  it("returns empty array when tasks.md has no table", () => {
    const md = generateTasksMarkdown({
      specNumber: "045",
      featureName: "Empty",
      featureDescription: "",
      problem: "",
      solution: "",
      tasks: [],
    });
    const parsed = parseTasksMd(md);
    expect(parsed.length).toBe(0);
  });
});
