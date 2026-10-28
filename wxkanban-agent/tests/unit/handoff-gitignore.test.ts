import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { ensureHandoffGitignore, HANDOFF_GITIGNORE_ENTRIES } from "../../core/handoff-gitignore";

// [SCOPE 149 / T003] BEGIN — Handoff gitignore tests
describe("ensureHandoffGitignore (SPEC-149 FR-005)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "handoff-gi-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const gi = () => join(root, ".gitignore");
  const lines = () => readFileSync(gi(), "utf8").split(/\r?\n/).map((l) => l.trim());

  it("appends both entries to an existing .gitignore", () => {
    writeFileSync(gi(), "node_modules/\n", "utf8");
    const r = ensureHandoffGitignore(root);
    expect(r.added).toEqual([...HANDOFF_GITIGNORE_ENTRIES]);
    expect(lines()).toContain("**/.wxai/handoff/");
    expect(lines()).toContain("**/.wxai/project-agent-status.json");
    expect(lines()).toContain("node_modules/");
  });

  it("a second run adds nothing and creates no duplicates", () => {
    writeFileSync(gi(), "node_modules", "utf8");
    ensureHandoffGitignore(root);
    const before = readFileSync(gi(), "utf8");
    expect(ensureHandoffGitignore(root).added).toEqual([]);
    expect(readFileSync(gi(), "utf8")).toBe(before);
    expect(lines().filter((l) => l === "**/.wxai/handoff/")).toHaveLength(1);
  });

  it("adds only the missing entry when one is already present", () => {
    writeFileSync(gi(), "**/.wxai/handoff/\n", "utf8");
    expect(ensureHandoffGitignore(root).added).toEqual([
      "**/.wxai/project-agent-status.json",
      "**/.wxai/retired-room-keys-notice.json", // [SCOPE 150 / T006]
      "**/.wxai/agent-room.json", // SPEC-151: the room token file
    ]);
  });

  it("does not create a .gitignore", () => {
    expect(ensureHandoffGitignore(root).added).toEqual([]);
    expect(existsSync(gi())).toBe(false);
  });

  it("adds nothing when .wxai/ is ignored wholesale", () => {
    writeFileSync(gi(), ".wxai/\n", "utf8");
    expect(ensureHandoffGitignore(root).added).toEqual([]);
    expect(readFileSync(gi(), "utf8")).toBe(".wxai/\n");
  });

  it("the kit .gitignore.snippet template carries both entries", () => {
    const snippet = readFileSync(join(__dirname, "..", "..", "templates", ".gitignore.snippet"), "utf8")
      .split(/\r?\n/)
      .map((l) => l.trim());
    for (const e of HANDOFF_GITIGNORE_ENTRIES) expect(snippet).toContain(e);
  });
});
// [SCOPE 149 / T003] END
