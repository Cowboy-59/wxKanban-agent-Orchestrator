// [SCOPE 159 / T002] BEGIN — Common room import check tests (FR-091)
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error plain .mjs without types
import { checkImports } from "../../common-room/scripts/check-imports.mjs";

type Problem = { file: string; specifier: string; reason: string };

function fakeModule(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), "room-imports-"));
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), source);
  return dir;
}

describe("common room import check", () => {
  it("passes the real module", () => {
    const problems: Problem[] = checkImports(join(__dirname, "..", "..", "common-room"));
    expect(problems).toEqual([]);
  });

  it("fails on a bridge-internal import", () => {
    const problems: Problem[] = checkImports(fakeModule('import { x } from "../../apps/remote-bridge/src/x";\n'));
    expect(problems).toHaveLength(1);
    expect(problems[0]?.reason).toContain("outside");
  });

  it("fails on a database client", () => {
    const problems: Problem[] = checkImports(fakeModule('import postgres from "postgres";\n'));
    expect(problems).toHaveLength(1);
  });

  it("allows node built-ins and in-module relative imports", () => {
    const problems: Problem[] = checkImports(fakeModule('import { join } from "node:path";\nimport { y } from "./b";\n'));
    expect(problems).toEqual([]);
  });

  it("the module declares no dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "common-room", "package.json"), "utf-8"));
    expect(pkg.dependencies).toEqual({});
    expect(pkg.devDependencies).toBeUndefined();
  });
});
// [SCOPE 159 / T002] END
