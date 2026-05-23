import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { PassThrough } from "stream";

import { findConsumerRoot, findConsumerRootInfo, pkgHasKitDep } from "../../core/scaffold/consumer-detect";
import { copyTemplate, writeTemplateString, planCopies } from "../../core/scaffold/template-copy";
import { mergeDeps, readPackageJson, writePackageJson } from "../../core/scaffold/deps-merge";
import { confirm } from "../../core/scaffold/prompt";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "scaffold-test-"));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("consumer-detect", () => {
  it("returns null when no marker found within stopAt boundary", () => {
    const inner = join(tmp, "a", "b");
    mkdirSync(inner, { recursive: true });
    expect(findConsumerRoot(inner, { stopAt: tmp })).toBeNull();
  });

  it("detects .wxai directory", () => {
    mkdirSync(join(tmp, ".wxai"));
    expect(findConsumerRoot(tmp)).toBe(tmp);
  });

  it("detects wxkanban-agent in dependencies", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { "wxkanban-agent": "^0.7.0" } }));
    expect(findConsumerRoot(tmp)).toBe(tmp);
  });

  it("detects wxkanban-agent in devDependencies", () => {
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ devDependencies: { "wxkanban-agent": "^0.7.0" } }));
    expect(findConsumerRoot(tmp)).toBe(tmp);
  });

  it("walks up the tree", () => {
    mkdirSync(join(tmp, ".wxai"));
    const sub = join(tmp, "a", "b", "c");
    mkdirSync(sub, { recursive: true });
    expect(findConsumerRoot(sub)).toBe(tmp);
  });

  it("findConsumerRootInfo reports marker source", () => {
    mkdirSync(join(tmp, ".wxai"));
    writeFileSync(join(tmp, "package.json"), JSON.stringify({ dependencies: { "wxkanban-agent": "^0.7.0" } }));
    const info = findConsumerRootInfo(tmp);
    expect(info?.hasWxai).toBe(true);
    expect(info?.hasKitDep).toBe(true);
  });

  it("pkgHasKitDep returns false for missing file", () => {
    expect(pkgHasKitDep(join(tmp, "nope.json"))).toBe(false);
  });

  it("pkgHasKitDep returns false for malformed JSON", () => {
    writeFileSync(join(tmp, "package.json"), "{not json");
    expect(pkgHasKitDep(join(tmp, "package.json"))).toBe(false);
  });
});

describe("template-copy", () => {
  it("creates a new file", () => {
    const src = join(tmp, "src.txt");
    const dest = join(tmp, "out", "dest.txt");
    writeFileSync(src, "hello");
    expect(copyTemplate(src, dest)).toBe("created");
    expect(readFileSync(dest, "utf-8")).toBe("hello");
  });

  it("skips existing file without overwrite", () => {
    const src = join(tmp, "src.txt");
    const dest = join(tmp, "dest.txt");
    writeFileSync(src, "new");
    writeFileSync(dest, "old");
    expect(copyTemplate(src, dest)).toBe("skipped");
    expect(readFileSync(dest, "utf-8")).toBe("old");
  });

  it("overwrites with opts.overwrite", () => {
    const src = join(tmp, "src.txt");
    const dest = join(tmp, "dest.txt");
    writeFileSync(src, "new");
    writeFileSync(dest, "old");
    expect(copyTemplate(src, dest, { overwrite: true })).toBe("overwritten");
    expect(readFileSync(dest, "utf-8")).toBe("new");
  });

  it("writeTemplateString creates nested dirs", () => {
    const dest = join(tmp, "a", "b", "c", "f.txt");
    expect(writeTemplateString("content", dest)).toBe("created");
    expect(readFileSync(dest, "utf-8")).toBe("content");
  });

  it("planCopies returns would-create / would-skip without writing", () => {
    const templatesRoot = join(tmp, "tpl");
    const consumerRoot = join(tmp, "consumer");
    mkdirSync(templatesRoot);
    mkdirSync(consumerRoot);
    writeFileSync(join(templatesRoot, "a.txt"), "a");
    writeFileSync(join(templatesRoot, "b.txt"), "b");
    writeFileSync(join(consumerRoot, "b.txt"), "existing");
    const plan = planCopies(
      [{ srcRel: "a.txt", destRel: "a.txt" }, { srcRel: "b.txt", destRel: "b.txt" }],
      templatesRoot,
      consumerRoot,
    );
    expect(plan[0].action).toBe("would create");
    expect(plan[1].action).toBe("would skip");
    expect(existsSync(join(consumerRoot, "a.txt"))).toBe(false);
  });

  it("planCopies with overwrite reports would overwrite", () => {
    const templatesRoot = join(tmp, "tpl");
    const consumerRoot = join(tmp, "consumer");
    mkdirSync(templatesRoot);
    mkdirSync(consumerRoot);
    writeFileSync(join(templatesRoot, "a.txt"), "a");
    writeFileSync(join(consumerRoot, "a.txt"), "existing");
    const plan = planCopies(
      [{ srcRel: "a.txt", destRel: "a.txt" }],
      templatesRoot,
      consumerRoot,
      { overwrite: true },
    );
    expect(plan[0].action).toBe("would overwrite");
  });
});

describe("deps-merge", () => {
  it("adds missing deps and preserves existing pins", () => {
    const pkg = {
      dependencies: { react: "^18.0.0" },
      devDependencies: { vitest: "^1.0.0" },
    };
    const result = mergeDeps(pkg, {
      dependencies: { react: "^19.0.0", clsx: "^2.0.0" },
      devDependencies: { tailwindcss: "^4.0.0" },
    });
    expect(result.changed).toBe(true);
    expect((result.packageJson.dependencies as Record<string, string>).react).toBe("^18.0.0");
    expect((result.packageJson.dependencies as Record<string, string>).clsx).toBe("^2.0.0");
    expect((result.packageJson.devDependencies as Record<string, string>).tailwindcss).toBe("^4.0.0");
    expect(result.diff.added.map((d) => d.name).sort()).toEqual(["clsx", "tailwindcss"]);
    expect(result.diff.alreadyPresent.map((d) => d.name)).toEqual(["react"]);
  });

  it("reports changed=false when all deps present", () => {
    const pkg = { dependencies: { react: "^18.0.0" }, devDependencies: {} };
    const result = mergeDeps(pkg, { dependencies: { react: "^19.0.0" }, devDependencies: {} });
    expect(result.changed).toBe(false);
  });

  it("creates dependencies block if missing", () => {
    const pkg = {};
    const result = mergeDeps(pkg, { dependencies: { clsx: "^2.0.0" }, devDependencies: {} });
    expect((result.packageJson.dependencies as Record<string, string>).clsx).toBe("^2.0.0");
  });

  it("sorts dep keys alphabetically", () => {
    const pkg = { dependencies: { zod: "^3.0.0" }, devDependencies: {} };
    const result = mergeDeps(pkg, { dependencies: { clsx: "^2.0.0", "@radix-ui/react-label": "^2.0.0" }, devDependencies: {} });
    const keys = Object.keys(result.packageJson.dependencies as Record<string, string>);
    expect(keys).toEqual(["@radix-ui/react-label", "clsx", "zod"]);
  });

  it("readPackageJson + writePackageJson round-trip", () => {
    const p = join(tmp, "package.json");
    writeFileSync(p, JSON.stringify({ name: "x", dependencies: { a: "1" } }, null, 2));
    const data = readPackageJson(p);
    expect(data).not.toBeNull();
    (data as Record<string, unknown>).version = "1.0.0";
    writePackageJson(p, data as Record<string, unknown>);
    const reread = readPackageJson(p);
    expect((reread as Record<string, unknown>).version).toBe("1.0.0");
  });

  it("readPackageJson returns null for missing file", () => {
    expect(readPackageJson(join(tmp, "nope.json"))).toBeNull();
  });
});

describe("prompt", () => {
  it("assumeYes returns true without reading input", async () => {
    const result = await confirm("Overwrite?", { assumeYes: true });
    expect(result).toBe(true);
  });

  it("returns false in non-TTY mode without assumeYes", async () => {
    const result = await confirm("Overwrite?", { isTTY: false });
    expect(result).toBe(false);
  });

  it("returns true on 'y' answer in TTY mode", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const p = confirm("Overwrite?", { isTTY: true, input, output });
    input.write("y\n");
    expect(await p).toBe(true);
  });

  it("returns false on empty answer with default-no", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const p = confirm("Overwrite?", { isTTY: true, input, output });
    input.write("\n");
    expect(await p).toBe(false);
  });

  it("returns true on empty answer with defaultNo:false", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const p = confirm("Continue?", { isTTY: true, defaultNo: false, input, output });
    input.write("\n");
    expect(await p).toBe(true);
  });
});
