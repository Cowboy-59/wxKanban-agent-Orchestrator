import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { handleArchiveFilesCommand } from "../../core/orchestrator/command-handlers/archive-files";

// Spec 103 / T007 — kit file-sync round-trips a scope/spec group to and from
// specs/_archive/ with no loss, and never overwrites an existing target.

let root: string;

function seedLiveGroup(specNumber: string, slug: string): void {
  const scopeDir = join(root, "specs", "Project-Scope");
  mkdirSync(scopeDir, { recursive: true });
  writeFileSync(join(scopeDir, `${specNumber}-${slug}.md`), `# Scope ${specNumber}\n`);

  const specDir = join(root, "specs", `${specNumber}-${slug}`);
  mkdirSync(join(specDir, "checklists"), { recursive: true });
  writeFileSync(join(specDir, "spec.md"), `# Spec ${specNumber}\n`);
  writeFileSync(join(specDir, "checklists", "requirements.md"), "checklist\n");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "archive-files-test-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("handleArchiveFilesCommand", () => {
  it("archives the scope doc and spec folder into specs/_archive/", async () => {
    seedLiveGroup("103", "archive-scope");

    const res = await handleArchiveFilesCommand({ specNumber: "103", action: "archive", projectRoot: root });

    expect(res.exitCode).toBe(0);
    expect(res.result?.moved.length).toBe(2);
    // Live locations gone.
    expect(existsSync(join(root, "specs", "Project-Scope", "103-archive-scope.md"))).toBe(false);
    expect(existsSync(join(root, "specs", "103-archive-scope"))).toBe(false);
    // Archive locations present, contents intact (nested files preserved).
    expect(existsSync(join(root, "specs", "_archive", "Project-Scope", "103-archive-scope.md"))).toBe(true);
    expect(existsSync(join(root, "specs", "_archive", "103-archive-scope", "spec.md"))).toBe(true);
    expect(readFileSync(join(root, "specs", "_archive", "103-archive-scope", "checklists", "requirements.md"), "utf8")).toBe("checklist\n");
  });

  it("round-trips: unarchive restores the group to its live location", async () => {
    seedLiveGroup("103", "archive-scope");
    await handleArchiveFilesCommand({ specNumber: "103", action: "archive", projectRoot: root });

    const res = await handleArchiveFilesCommand({ specNumber: "103", action: "unarchive", projectRoot: root });

    expect(res.exitCode).toBe(0);
    expect(res.result?.moved.length).toBe(2);
    expect(existsSync(join(root, "specs", "Project-Scope", "103-archive-scope.md"))).toBe(true);
    expect(existsSync(join(root, "specs", "103-archive-scope", "spec.md"))).toBe(true);
    expect(existsSync(join(root, "specs", "_archive", "103-archive-scope"))).toBe(false);
  });

  it("is a no-op when nothing matches (already in the target state)", async () => {
    // No files at all.
    const res = await handleArchiveFilesCommand({ specNumber: "103", action: "archive", projectRoot: root });
    expect(res.exitCode).toBe(0);
    expect(res.result?.moved.length).toBe(0);
    expect(res.result?.skipped.length).toBe(0);
    expect(res.output).toContain("nothing to move");
  });

  it("never overwrites: reports a skip when the target already exists", async () => {
    seedLiveGroup("103", "archive-scope");
    // Pre-create a conflicting archived scope doc.
    const archScopeDir = join(root, "specs", "_archive", "Project-Scope");
    mkdirSync(archScopeDir, { recursive: true });
    writeFileSync(join(archScopeDir, "103-archive-scope.md"), "PRE-EXISTING\n");

    const res = await handleArchiveFilesCommand({ specNumber: "103", action: "archive", projectRoot: root });

    expect(res.exitCode).toBe(0);
    // Scope doc skipped (target present, not overwritten), spec folder still moved.
    expect(res.result?.skipped).toContain(join("specs", "_archive", "Project-Scope", "103-archive-scope.md"));
    expect(readFileSync(join(archScopeDir, "103-archive-scope.md"), "utf8")).toBe("PRE-EXISTING\n");
    expect(existsSync(join(root, "specs", "Project-Scope", "103-archive-scope.md"))).toBe(true); // left in place
  });

  it("archives only the requested group, leaving other numbered groups in place", async () => {
    seedLiveGroup("102", "remote-bridge");
    seedLiveGroup("103", "archive-scope");

    await handleArchiveFilesCommand({ specNumber: "103", action: "archive", projectRoot: root });

    // Only 103 moved; 102 untouched.
    expect(existsSync(join(root, "specs", "_archive", "Project-Scope", "103-archive-scope.md"))).toBe(true);
    expect(existsSync(join(root, "specs", "Project-Scope", "102-remote-bridge.md"))).toBe(true);
    expect(existsSync(join(root, "specs", "_archive", "Project-Scope", "102-remote-bridge.md"))).toBe(false);
  });

  it("rejects a non-three-digit spec number", async () => {
    const res = await handleArchiveFilesCommand({ specNumber: "13", action: "archive", projectRoot: root });
    expect(res.exitCode).toBe(2);
  });
});
