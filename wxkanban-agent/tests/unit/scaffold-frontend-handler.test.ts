import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import { handleScaffoldFrontend, TEMPLATE_MAPPINGS, CLAUDE_MD_MARKER } from "../../core/orchestrator/command-handlers/scaffold-frontend";

const TEMPLATES_DIR = resolve(__dirname, "..", "..", "templates", "frontend");

let tmp: string;

// [SCOPE 036 / T029] BEGIN — setupConsumer test helper
function setupConsumer(): string {
  const root = mkdtempSync(join(tmpdir(), "scaffold-handler-"));
  mkdirSync(join(root, ".wxai"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "test-consumer", dependencies: { "wxkanban-agent": "^0.7.0" } }, null, 2),
  );
  return root;
}
// [SCOPE 036 / T029] END

beforeEach(() => {
  tmp = "";
});

afterEach(() => {
  if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("handleScaffoldFrontend - flag validation", () => {
  it("exit 3 on --dry-run + --force", async () => {
    tmp = setupConsumer();
    const result = await handleScaffoldFrontend({ dryRun: true, force: true, projectRoot: tmp, templatesDir: TEMPLATES_DIR });
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/mutually exclusive/);
  });
});

describe("handleScaffoldFrontend - consumer detection", () => {
  // Skip the no-projectRoot path: findConsumerRoot walks up from CWD and can
  // hit a real ancestor (the dev's own .wxai/), which would cause scaffold to
  // write into the kit itself. Coverage of the "no marker" branch lives in
  // scaffold-modules.test.ts where findConsumerRoot is tested with stopAt.

  it("exit 1 when templates dir missing", async () => {
    tmp = setupConsumer();
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: join(tmp, "nonexistent") });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/templates directory not found/);
  });
});

describe("handleScaffoldFrontend - dry run", () => {
  it("writes nothing and reports would-create for fresh project", async () => {
    tmp = setupConsumer();
    const result = await handleScaffoldFrontend({ dryRun: true, projectRoot: tmp, templatesDir: TEMPLATES_DIR });
    expect(result.exitCode).toBe(0);
    expect(result.actions.length).toBe(TEMPLATE_MAPPINGS.length);
    expect(result.actions.every((a) => a.action === "would create")).toBe(true);
    expect(existsSync(join(tmp, "tailwind.config.ts"))).toBe(false);
    expect(result.output).toMatch(/EXIT CODE WOULD BE: 0/);
    expect(result.output).toMatch(/PACKAGE\.JSON DELTA/);
  });

  it("reports would-skip when files already exist", async () => {
    tmp = setupConsumer();
    writeFileSync(join(tmp, "tailwind.config.ts"), "existing");
    const result = await handleScaffoldFrontend({ dryRun: true, projectRoot: tmp, templatesDir: TEMPLATES_DIR });
    expect(result.actions.find((a) => a.destRel === "tailwind.config.ts")?.action).toBe("would skip");
  });
});

describe("handleScaffoldFrontend - execute (fresh)", () => {
  it("writes all templates, updates package.json, appends CLAUDE.md", async () => {
    tmp = setupConsumer();
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(result.actions.every((a) => a.action === "created")).toBe(true);
    expect(existsSync(join(tmp, "tailwind.config.ts"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "ui", "button.tsx"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "ui", "resource-calendar.tsx"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "theme-provider.tsx"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "mode-toggle.tsx"))).toBe(true);
    expect(result.packageJsonChanged).toBe(true);
    expect(result.claudeMdChanged).toBe(true);

    const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
    expect(pkg.dependencies["clsx"]).toBeDefined();
    expect(pkg.dependencies["react-big-calendar"]).toBeDefined();
    expect(pkg.devDependencies["tailwindcss"]).toBeDefined();

    const claude = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    expect(claude).toContain(CLAUDE_MD_MARKER);
    expect(claude).toContain("ThemeProvider");
    expect(claude).toContain("ModeToggle");
  });
});

describe("handleScaffoldFrontend - execute (idempotency)", () => {
  it("second run is a no-op", async () => {
    tmp = setupConsumer();
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const pkgBefore = readFileSync(join(tmp, "package.json"), "utf-8");
    const buttonBefore = readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8");
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(result.actions.every((a) => a.action === "skipped")).toBe(true);
    expect(result.packageJsonChanged).toBe(false);
    expect(result.claudeMdChanged).toBe(false);
    expect(readFileSync(join(tmp, "package.json"), "utf-8")).toBe(pkgBefore);
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).toBe(buttonBefore);
  });
});

describe("handleScaffoldFrontend - execute (partial)", () => {
  it("only fills missing files, leaves existing alone", async () => {
    tmp = setupConsumer();
    mkdirSync(join(tmp, "src", "components", "ui"), { recursive: true });
    writeFileSync(join(tmp, "tailwind.config.ts"), "consumer-authored");
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "consumer-authored");
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(tmp, "tailwind.config.ts"), "utf-8")).toBe("consumer-authored");
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).toBe("consumer-authored");
    expect(result.actions.find((a) => a.destRel === "tailwind.config.ts")?.action).toBe("skipped");
    expect(result.actions.find((a) => a.destRel === "src/components/ui/button.tsx")?.action).toBe("skipped");
    expect(result.actions.find((a) => a.destRel === "src/components/ui/card.tsx")?.action).toBe("created");
  });
});

describe("handleScaffoldFrontend - --force matrix", () => {
  it("--force without confirmation (promptOverride returns false) aborts", async () => {
    tmp = setupConsumer();
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      force: true,
      silent: true,
      promptOverride: async () => false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/Aborted by user/);
  });

  it("--force --yes overwrites without prompting", async () => {
    tmp = setupConsumer();
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "manually-edited");
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      force: true,
      yes: true,
      silent: true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.actions.find((a) => a.destRel === "src/components/ui/button.tsx")?.action).toBe("overwritten");
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).not.toBe("manually-edited");
  });

  it("--force with promptOverride returning true overwrites", async () => {
    tmp = setupConsumer();
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    writeFileSync(join(tmp, "src", "components", "ui", "card.tsx"), "edited");
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      force: true,
      silent: true,
      promptOverride: async () => true,
    });
    expect(result.exitCode).toBe(0);
    expect(result.actions.find((a) => a.destRel === "src/components/ui/card.tsx")?.action).toBe("overwritten");
    expect(readFileSync(join(tmp, "src", "components", "ui", "card.tsx"), "utf-8")).not.toBe("edited");
  });
});

describe("handleScaffoldFrontend - CLAUDE.md idempotency", () => {
  it("does not duplicate the note on second run", async () => {
    tmp = setupConsumer();
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const first = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const second = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    expect(second).toBe(first);
    const markerCount = (second.match(new RegExp(CLAUDE_MD_MARKER, "g")) ?? []).length;
    expect(markerCount).toBe(1);
  });

  it("appends note when CLAUDE.md already exists with other content", async () => {
    tmp = setupConsumer();
    writeFileSync(join(tmp, "CLAUDE.md"), "# Existing\n\nUser content here.\n");
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const claude = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    expect(claude).toContain("User content here.");
    expect(claude).toContain(CLAUDE_MD_MARKER);
  });
});
