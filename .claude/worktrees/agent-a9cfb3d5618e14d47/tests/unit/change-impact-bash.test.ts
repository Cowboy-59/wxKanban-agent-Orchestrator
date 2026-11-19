// SCOPE-137 / T018 — Bash commands judged like edits (Amendment A, FR-008a).
//
// The hook also runs before Bash. What must hold:
//   - a command that writes or deletes a file another scope depends on is denied like the edit
//     would be, and the developer's yes lets that exact command through once;
//   - SQL sent through a database client that may lose data stops, inline or from a -f file;
//   - commands that only read, or name data-loss words without running them, get no opinion;
//   - a quoted "> text" is never read as a redirect.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decideToolCall } from "../../_wxAI/impact/hook.mjs";
import { approve } from "../../_wxAI/impact/approve.mjs";
import { fromMsysPath, readBashCommand } from "../../_wxAI/impact/lib/shell.mjs";
import { HOOK_MATCHER } from "../../_wxAI/impact/install-hook.mjs";
import { FIXTURES } from "../../_wxAI/impact/prove.mjs";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
const noNet = { conn: null };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-bash-"));
  for (const [file, content] of Object.entries(FIXTURES.native.files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  mkdirSync(join(root, ".wxai"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.WXAI_UNATTENDED;
});

type Out = { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string } } | null;

const bash = (command: string) =>
  decideToolCall({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, cwd: root }, { root, deps: noNet }) as Promise<Out>;

const hashOf = (out: Out) => /--hash ([0-9a-f]{64})/.exec(out?.hookSpecificOutput?.permissionDecisionReason ?? "")?.[1] ?? "";

describe("SCOPE-137 T018 — reading a Bash command (FR-008a)", () => {
  it("finds the files a command writes or deletes", () => {
    expect(readBashCommand("echo hi > src/a.ts").writes).toEqual(["src/a.ts"]);
    expect(readBashCommand("echo x>>b.txt 2>err.log").writes).toEqual(["b.txt"]);
    expect(readBashCommand("cat a | tee out.ts").writes).toEqual(["out.ts"]);
    expect(readBashCommand("sed -i 's/a/b/' src/x.ts").writes).toEqual(["src/x.ts"]);
    expect(readBashCommand("mv old.ts new.ts")).toMatchObject({ writes: ["new.ts"], deletes: ["old.ts"] });
    expect(readBashCommand("rm -rf build src/y.ts").deletes).toEqual(["build", "src/y.ts"]);
    expect(readBashCommand("git checkout -- src/z.ts").writes).toEqual(["src/z.ts"]);
    expect(readBashCommand("Set-Content -Path a.ps1 -Value 1").writes).toEqual(["a.ps1"]);
  });

  it("ignores output thrown away, here-document bodies, and quoted text that looks like a redirect", () => {
    expect(readBashCommand("npm test > /dev/null 2>&1").writes).toEqual([]);
    expect(readBashCommand("cat <<'EOF'\nrm -rf src\n> src/a.ts\nEOF").deletes).toEqual([]);
    expect(readBashCommand('node approve.mjs --quote "> yes go"').writes).toEqual([]);
  });

  it("finds SQL sent through a database client, inline or by file", () => {
    expect(readBashCommand('psql -c "DROP TABLE x"').sql).toHaveLength(1);
    expect(readBashCommand("psql -f db/down.sql").sql[0]).toMatchObject({ file: "db/down.sql" });
    expect(readBashCommand('grep "DROP TABLE" a.sql').sql).toEqual([]);
  });

  it("the installed hook matches Bash as well as the edit tools", () => {
    expect(new RegExp(HOOK_MATCHER).test("Bash")).toBe(true);
    expect(new RegExp(HOOK_MATCHER).test("Edit")).toBe(true);
    expect(new RegExp(HOOK_MATCHER).test("Read")).toBe(false);
  });
});

describe("SCOPE-137 T018 — the hook on Bash (FR-008a)", () => {
  it("says nothing about a command that only reads", async () => {
    expect(await bash("ls -la && git status")).toBeNull();
    expect(await bash('grep -rn "DROP TABLE" src')).toBeNull();
    expect(await bash("npm test > /dev/null")).toBeNull();
  });

  it("denies a write into a file another scope depends on; the developer's yes lets that exact command through once", async () => {
    const command = "echo 'export {}' > src/server/service.ts";
    const first = await bash(command);
    expect(first?.hookSpecificOutput?.permissionDecision).toBe("deny");
    const reason = first?.hookSpecificOutput?.permissionDecisionReason ?? "";
    expect(reason).toMatch(/src\/server\/service\.ts \(by a Bash command\) crosses an Impact Boundary/);
    expect(reason).toMatch(/SCOPE-002/);
    const ok = await approve({ root, hash: hashOf(first), answer: "approve", quote: "yes, overwrite it", actor: "andy" });
    expect(ok.ok).toBe(true);
    expect(await bash(command)).toBeNull();
    expect((await bash(command))?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect((await bash("echo 'export {}' >> src/server/service.ts"))?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("judges a delete the same way", async () => {
    expect((await bash("rm src/server/service.ts"))?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("stops SQL that may lose data, inline or from a script, in every mode", async () => {
    const inline = await bash('psql "$DATABASE_URL" -c "DROP TABLE items"');
    expect(inline?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(inline?.hookSpecificOutput?.permissionDecisionReason).toMatch(/STOPPED — possible data loss in the database \(by a Bash command\)/);
    expect(inline?.hookSpecificOutput?.permissionDecisionReason).toMatch(/--data-loss/);

    writeFileSync(join(root, "down.sql"), "ALTER TABLE items DROP COLUMN name;\n");
    process.env.WXAI_UNATTENDED = "1";
    const script = await bash("psql -f down.sql");
    expect(script?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(script?.hookSpecificOutput?.permissionDecisionReason).toMatch(/items\.name/);

    expect(await bash('psql -c "SELECT count(*) FROM items"')).toBeNull();
  });

  it("a data-loss approval needs --data-loss, and then covers that command once", async () => {
    const command = 'psql -c "DROP TABLE items"';
    const first = await bash(command);
    await approve({ root, hash: hashOf(first), answer: "approve", quote: "yes", actor: "andy" });
    expect((await bash(command))?.hookSpecificOutput?.permissionDecision).toBe("deny");
    const again = await bash(command);
    await approve({ root, hash: hashOf(again), answer: "approve", quote: "yes, drop it, I know it loses data", actor: "andy", dataLoss: true });
    expect(await bash(command)).toBeNull();
  });

  it("reads a Git Bash drive path (/e/...) as the Windows path it is, so the write is judged (T020)", async () => {
    expect(fromMsysPath("/e/AI/file.ts", "win32")).toBe("E:/AI/file.ts");
    expect(fromMsysPath("/e", "win32")).toBe("E:/");
    expect(fromMsysPath("/usr/bin/x", "win32")).toBe("/usr/bin/x");
    expect(fromMsysPath("/e/AI/file.ts", "linux")).toBe("/e/AI/file.ts");
    if (process.platform !== "win32") return;
    const msys = `/${root[0].toLowerCase()}${root.slice(2).replace(/\\/g, "/")}/src/server/service.ts`;
    expect((await bash(`cp /tmp/x ${msys}`))?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("ignores files outside the project and the kit's own state", async () => {
    expect(await bash("echo x > ../elsewhere.ts")).toBeNull();
    expect(await bash("echo {} > .wxai/impact.json")).toBeNull();
  });
});
