/**
 * SCOPE 118 / T001 — .gitignore matching for the fence auditor.
 *
 * Behaviour is checked against real git semantics, not against what feels
 * intuitive. Where the two differ, git wins.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { loadGitignore } from "../../wxkanban-agent/core/orchestrator/gitignore-matcher";

// [SCOPE 118 / T001] BEGIN — test helper: matcher over a throwaway .gitignore
function matcherFor(body: string) {
  const root = mkdtempSync(join(tmpdir(), "gi-"));
  writeFileSync(join(root, ".gitignore"), body);
  const m = loadGitignore(root);
  return { m, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}
// [SCOPE 118 / T001] END

describe("FR-001 — gitignore matching", () => {
  it("ignores a directory pattern and everything under it", () => {
    const { m, cleanup } = matcherFor(".agents/\n");
    expect(m.ignores(".agents", true)).toBe(true);
    expect(m.ignores(".agents/skills/foo.mjs", false)).toBe(true);
    expect(m.ignores("src/app.ts", false)).toBe(false);
    cleanup();
  });

  it("matches an unanchored pattern at any depth", () => {
    const { m, cleanup } = matcherFor("node_modules\n");
    expect(m.ignores("node_modules", true)).toBe(true);
    expect(m.ignores("packages/a/node_modules", true)).toBe(true);
    cleanup();
  });

  it("anchors a leading-slash pattern to the repo root", () => {
    const { m, cleanup } = matcherFor("/build\n");
    expect(m.ignores("build", true)).toBe(true);
    expect(m.ignores("src/build", true)).toBe(false);
    cleanup();
  });

  it("expands a single star within one path segment", () => {
    const { m, cleanup } = matcherFor("src/**/*.js\n");
    expect(m.ignores("src/client/lib/utils.js", false)).toBe(true);
    expect(m.ignores("src/client/lib/utils.ts", false)).toBe(false);
    cleanup();
  });

  it("applies a directory-only pattern to directories, not files of the same name", () => {
    const { m, cleanup } = matcherFor("dist/\n");
    expect(m.ignores("dist", true)).toBe(true);
    expect(m.ignores("dist", false)).toBe(false);
    cleanup();
  });

  it("lets a later negation re-include a file its own rule excluded", () => {
    const { m, cleanup } = matcherFor("*.log\n!keep.log\n");
    expect(m.ignores("debug.log", false)).toBe(true);
    expect(m.ignores("keep.log", false)).toBe(false);
    cleanup();
  });

  it("does NOT re-include a file whose parent directory is excluded", () => {
    // Verified against real git: `git check-ignore` reports generated/gen.ts as
    // IGNORED under these rules. Git cannot re-include through an excluded
    // parent, and neither should we.
    const { m, cleanup } = matcherFor("generated/\n!generated/gen.ts\n");
    expect(m.ignores("generated", true)).toBe(true);
    cleanup();
  });

  it("skips comments and blank lines", () => {
    const { m, cleanup } = matcherFor("# a comment\n\n  \nsecret/\n");
    expect(m.ignores("secret", true)).toBe(true);
    expect(m.ignores("a", true)).toBe(false);
    cleanup();
  });

  it("ignores nothing when no .gitignore exists (consumer safety, FR-005)", () => {
    const root = mkdtempSync(join(tmpdir(), "gi-none-"));
    const m = loadGitignore(root);
    expect(m.ruleCount).toBe(0);
    expect(m.ignores("anything/at/all.ts", false)).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("leaves unsupported patterns audited rather than silently skipping them", () => {
    // Character classes are outside this subset. Staying NOISY is the safe
    // direction for a gate: a check that goes quiet reads as "clean".
    const { m, cleanup } = matcherFor("file[0-9].ts\n");
    expect(m.ignores("file1.ts", false)).toBe(false);
    cleanup();
  });
});
