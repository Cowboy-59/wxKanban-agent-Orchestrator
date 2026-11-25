/**
 * [SCOPE 159 / T020] SC-002: the four worker blocks hold on every route, with real processes.
 * A worker reaches git through a node script, an npm script, `bash -c` or `--no-verify`; the hook
 * text check cannot see inside a script, so the process layer (mark + git shim on PATH) must refuse.
 * The decision never depends on the permission mode: the hook is a pure function of the call.
 */
import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BlockLog, buildWorkerEnv, installWorkerShims, makeWorkerPreToolUseHook } from "../../apps/remote-bridge/src/worker-guard";

const dir = mkdtempSync(join(tmpdir(), "wx-routes-"));
const shimDir = installWorkerShims(join(dir, "bin"), "git-real-never-reached");
const env = buildWorkerEnv(process.env, shimDir);
const node = process.execPath;

writeFileSync(join(dir, "push.mjs"), `import { execSync } from "node:child_process";\ntry { execSync("git push origin main", { stdio: "pipe" }); process.exit(0); } catch (e) { process.stderr.write(String(e.stderr)); process.exit(7); }\n`);
writeFileSync(join(dir, "commit.mjs"), `import { execSync } from "node:child_process";\ntry { execSync("git commit --no-verify -m x", { stdio: "pipe" }); process.exit(0); } catch (e) { process.stderr.write(String(e.stderr)); process.exit(7); }\n`);
writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "r", version: "1.0.0", scripts: { ship: "git push origin main", save: "git commit -m x" } }));

function run(cmd: string, args: string[]) {
  return spawnSync(cmd, args, { cwd: dir, env, encoding: "utf8", shell: false });
}

describe("SC-002 process layer refuses on every route", () => {
  it("node script that runs git push", () => {
    const r = run(node, [join(dir, "push.mjs")]);
    expect(r.status).toBe(7);
    expect(r.stderr).toMatch(/refused/);
  });

  it("node script that runs git commit --no-verify", () => {
    const r = run(node, [join(dir, "commit.mjs")]);
    expect(r.status).toBe(7);
    expect(r.stderr).toMatch(/refused/);
  });

  it("npm script that runs git push and git commit", () => {
    const npmCli = join(process.execPath, "..", "node_modules", "npm", "bin", "npm-cli.js");
    for (const s of ["ship", "save"]) {
      const r = run(node, [npmCli, "run", s]);
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/refused/);
    }
  });

  it("the unmarked env is not blocked by the shim (control: git --version reaches the shim and fails only for the fake real-git)", () => {
    const plain = { ...process.env, PATH: `${shimDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}` };
    delete plain.WXAI_WORKER;
    const r = spawnSync(node, ["-e", `try{require("child_process").execSync("git push",{stdio:"pipe"})}catch(e){process.stdout.write(String(e.stderr))}`], { cwd: dir, env: plain, encoding: "utf8" });
    expect(r.stdout).not.toMatch(/workers may not/);
  });
});

describe("SC-002 hook denies by direct command, any permission mode", () => {
  it("bash -c, --no-verify and direct commands are denied; the decision takes no mode input", async () => {
    const log = new BlockLog();
    const hook = makeWorkerPreToolUseHook("w1", log);
    const calls = [
      "git push",
      "git commit -m x",
      `bash -c "git push --no-verify"`,
      "git commit --no-verify -m x",
      "node _wxAI/askgate/ledger.mjs append --file e.json",
    ];
    for (const command of calls) {
      // Same input with and without a permission_mode field: bypassPermissions must change nothing.
      for (const extra of [{}, { permission_mode: "bypassPermissions" }, { permission_mode: "default" }]) {
        const out = (await hook({ tool_name: "Bash", tool_input: { command }, ...extra } as never)) as { hookSpecificOutput?: { permissionDecision?: string } };
        expect(out.hookSpecificOutput?.permissionDecision).toBe("deny");
      }
    }
    const reassign = (await hook({ tool_name: "mcp__wxkanban__project_update_task", tool_input: { taskId: "t", assignedToId: "u" } })) as { hookSpecificOutput?: { permissionDecision?: string } };
    expect(reassign.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(log.count()).toBe(calls.length * 3 + 1);
  });
});

void execFileSync;
