// SPEC-143 T026 — the first kit session after an upgrade installs the routing hooks, once per version.
import { afterEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { spawnSync } from "child_process";
import {
  ensureRoutingHooksForKitVersion,
  resetRoutingHooksSyncForTests,
  ROUTING_MARKER_REL,
} from "../../core/orchestrator/routing-hooks-sync";

const REPO_ROUTING = resolve(__dirname, "..", "..", "..", "_wxAI", "routing");
const dirs: string[] = [];
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
  resetRoutingHooksSyncForTests();
});

// [SCOPE 143 / T026] BEGIN — routing-hooks-sync tests
function project(kitVersion: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "routing-sync-"));
  dirs.push(root);
  cpSync(REPO_ROUTING, join(root, "_wxAI", "routing"), { recursive: true });
  if (kitVersion) writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ kitVersion }));
  return root;
}

const hooksOf = (root: string): Record<string, unknown> =>
  (JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf-8")) as { hooks: Record<string, unknown> }).hooks;

describe("ensureRoutingHooksForKitVersion", () => {
  it("installs the hooks on the first run of a kit version and records the version", () => {
    const root = project("1.7.90");
    expect(ensureRoutingHooksForKitVersion(root)).toEqual({ ran: true, reason: "installed" });
    expect(Object.keys(hooksOf(root))).toContain("SessionStart");
    expect(JSON.parse(readFileSync(join(root, ROUTING_MARKER_REL), "utf-8")).kitVersion).toBe("1.7.90");
  });

  it("does not reinstall for the same version, so an uninstall holds until the next upgrade", () => {
    const root = project("1.7.90");
    ensureRoutingHooksForKitVersion(root);
    spawnSync(process.execPath, [join(root, "_wxAI", "routing", "install.mjs"), "--uninstall", "--root", root]);
    resetRoutingHooksSyncForTests();
    expect(ensureRoutingHooksForKitVersion(root).reason).toBe("already-synced");
    expect(existsSync(join(root, ".claude", "settings.json")) && Object.keys(hooksOf(root) ?? {})).not.toContain("SessionStart");

    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ kitVersion: "1.7.91" }));
    resetRoutingHooksSyncForTests();
    expect(ensureRoutingHooksForKitVersion(root).reason).toBe("installed");
    expect(Object.keys(hooksOf(root))).toContain("SessionStart");
  });

  it("runs at most once per process", () => {
    const root = project("1.7.90");
    ensureRoutingHooksForKitVersion(root);
    expect(ensureRoutingHooksForKitVersion(root).reason).toBe("already-synced");
  });

  it("does nothing without the routing kit or a kit version", () => {
    const bare = mkdtempSync(join(tmpdir(), "routing-sync-"));
    dirs.push(bare);
    mkdirSync(join(bare, ".claude"));
    expect(ensureRoutingHooksForKitVersion(bare).reason).toBe("no-routing-kit");
    resetRoutingHooksSyncForTests();
    expect(ensureRoutingHooksForKitVersion(project(null)).reason).toBe("no-kit-version");
  });
});
// [SCOPE 143 / T026] END
