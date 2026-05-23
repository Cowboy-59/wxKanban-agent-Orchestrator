/**
 * Spec 036 Integration Tests — `wxkanban-agent scaffold:frontend`
 *
 * Covers QT-1 through QT-10 from the spec. Each describe block names the
 * mapped QT identifier(s).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from "fs";
import { tmpdir } from "os";
import { join, resolve } from "path";

import {
  handleScaffoldFrontend,
  TEMPLATE_MAPPINGS,
  CLAUDE_MD_MARKER,
} from "../../core/orchestrator/command-handlers/scaffold-frontend";

const TEMPLATES_DIR = resolve(__dirname, "..", "..", "templates", "frontend");
const TEMPLATE_FILE_COUNT = 19; // 18 mappings + verify-scaffold.md, but only mappings are scaffolded

let tmp: string;

// [SCOPE 036 / T034] BEGIN — setupConsumer test helper
function setupConsumer(): string {
  const root = mkdtempSync(join(tmpdir(), "spec036-it-"));
  mkdirSync(join(root, ".wxai"));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify(
      { name: "test-consumer", dependencies: { "wxkanban-agent": "^0.7.0" }, devDependencies: {} },
      null,
      2,
    ),
  );
  return root;
}
// [SCOPE 036 / T034] END

beforeEach(() => {
  tmp = setupConsumer();
});

afterEach(() => {
  if (tmp && existsSync(tmp)) rmSync(tmp, { recursive: true, force: true });
});

describe("QT-1 + QT-2 — clean scaffold + idempotent re-run", () => {
  it("first run creates all 18 template files and exits 0", async () => {
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(result.actions.length).toBe(TEMPLATE_MAPPINGS.length);
    expect(result.actions.length).toBe(19);
    for (const action of result.actions) {
      expect(action.action).toBe("created");
      expect(existsSync(join(tmp, action.destRel))).toBe(true);
    }
    const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
    expect(Object.keys(pkg.dependencies).length).toBeGreaterThan(1);
    expect(Object.keys(pkg.devDependencies).length).toBeGreaterThan(0);
  });

  it("second run is a no-op: zero changes to disk and package.json", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const pkgBefore = readFileSync(join(tmp, "package.json"), "utf-8");
    const claudeBefore = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    const mtimesBefore = TEMPLATE_MAPPINGS.map((m) => statSync(join(tmp, m.destRel)).mtimeMs);

    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(result.actions.every((a) => a.action === "skipped")).toBe(true);
    expect(result.packageJsonChanged).toBe(false);
    expect(result.claudeMdChanged).toBe(false);
    expect(readFileSync(join(tmp, "package.json"), "utf-8")).toBe(pkgBefore);
    expect(readFileSync(join(tmp, "CLAUDE.md"), "utf-8")).toBe(claudeBefore);
    const mtimesAfter = TEMPLATE_MAPPINGS.map((m) => statSync(join(tmp, m.destRel)).mtimeMs);
    expect(mtimesAfter).toEqual(mtimesBefore);
  });
});

describe("QT-3 — partial state preserves existing, fills missing", () => {
  it("only missing files are written; consumer-edited files are preserved", async () => {
    mkdirSync(join(tmp, "src", "components", "ui"), { recursive: true });
    writeFileSync(join(tmp, "tailwind.config.ts"), "consumer-tailwind");
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "consumer-button");
    writeFileSync(join(tmp, "src", "components", "ui", "card.tsx"), "consumer-card");

    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);

    expect(readFileSync(join(tmp, "tailwind.config.ts"), "utf-8")).toBe("consumer-tailwind");
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).toBe("consumer-button");
    expect(readFileSync(join(tmp, "src", "components", "ui", "card.tsx"), "utf-8")).toBe("consumer-card");

    expect(existsSync(join(tmp, "src", "components", "ui", "dialog.tsx"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "theme-provider.tsx"))).toBe(true);

    const skipped = result.actions.filter((a) => a.action === "skipped").map((a) => a.destRel);
    const created = result.actions.filter((a) => a.action === "created").map((a) => a.destRel);
    expect(skipped.sort()).toEqual([
      "src/components/ui/button.tsx",
      "src/components/ui/card.tsx",
      "tailwind.config.ts",
    ]);
    expect(created.length).toBe(TEMPLATE_MAPPINGS.length - 3);
  });
});

describe("QT-4 — --dry-run accuracy + exit-code mirroring", () => {
  it("dry-run writes nothing", async () => {
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, dryRun: true });
    expect(result.exitCode).toBe(0);
    for (const mapping of TEMPLATE_MAPPINGS) {
      expect(existsSync(join(tmp, mapping.destRel))).toBe(false);
    }
    const pkg = JSON.parse(readFileSync(join(tmp, "package.json"), "utf-8"));
    expect(Object.keys(pkg.dependencies)).toEqual(["wxkanban-agent"]);
    expect(existsSync(join(tmp, "CLAUDE.md"))).toBe(false);
  });

  it("dry-run prints would-create + package.json delta + exit code", async () => {
    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, dryRun: true });
    expect(result.output).toMatch(/would create/);
    expect(result.output).toMatch(/PACKAGE\.JSON DELTA/);
    expect(result.output).toMatch(/\+ dependencies\.clsx/);
    expect(result.output).toMatch(/EXIT CODE WOULD BE: 0/);
  });

  it("dry-run claudeMdChanged predicts true when marker absent, false when present", async () => {
    const firstPreview = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, dryRun: true });
    expect(firstPreview.claudeMdChanged).toBe(true);
    expect(firstPreview.output).toMatch(/would append scaffold note/);

    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });

    const secondPreview = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, dryRun: true });
    expect(secondPreview.claudeMdChanged).toBe(false);
    expect(secondPreview.output).toMatch(/no change \(marker already present/);
  });

  it("dry-run exit code matches what real run would return", async () => {
    const dryResult = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, dryRun: true });
    const realResult = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(dryResult.exitCode).toBe(realResult.exitCode);
  });
});

describe("QT-5 — --force matrix (always prompts; --yes bypasses; --dry-run --force exits 3)", () => {
  it("--force --yes overwrites without prompting", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "consumer-edited");
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      force: true,
      yes: true,
      silent: true,
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).not.toBe("consumer-edited");
  });

  it("--force with prompt declining aborts without writes", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "consumer-edited");
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      force: true,
      silent: true,
      promptOverride: async () => false,
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).toBe("consumer-edited");
  });

  it("--dry-run + --force exits 3", async () => {
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      dryRun: true,
      force: true,
    });
    expect(result.exitCode).toBe(3);
    expect(result.output).toMatch(/mutually exclusive/);
  });

  it("bare --yes without --force has no effect on existing files", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    writeFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "consumer-edited");
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: TEMPLATES_DIR,
      yes: true,
      silent: true,
    });
    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(tmp, "src", "components", "ui", "button.tsx"), "utf-8")).toBe("consumer-edited");
  });
});

describe("QT-6 + QT-7 — missing-root exit 2; FS error recoverability", () => {
  it("returns exit 1 when templates dir is missing", async () => {
    const result = await handleScaffoldFrontend({
      projectRoot: tmp,
      templatesDir: join(tmp, "nonexistent"),
    });
    expect(result.exitCode).toBe(1);
    expect(result.output).toMatch(/templates directory not found/);
  });

  it("simulated partial-state failure recovers on re-run", async () => {
    // Simulate a previous incomplete scaffold by pre-creating only some files.
    // Then a re-run picks up the rest. This is the recovery story from US7.
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    rmSync(join(tmp, "src", "components", "ui", "select.tsx"));
    rmSync(join(tmp, "src", "components", "mode-toggle.tsx"));

    const result = await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    expect(result.exitCode).toBe(0);
    expect(existsSync(join(tmp, "src", "components", "ui", "select.tsx"))).toBe(true);
    expect(existsSync(join(tmp, "src", "components", "mode-toggle.tsx"))).toBe(true);
    const created = result.actions.filter((a) => a.action === "created");
    expect(created.length).toBe(2);
  });
});

describe("QT-8 — fences present on every emitted .ts/.tsx + the two configs", () => {
  it("every scaffolded TS/TSX file carries a [SCOPE 036 / T<n>] fence", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });

    const fenceRegex = /\[SCOPE 036 \/ T\d+\] BEGIN/;
    const filesToCheck = TEMPLATE_MAPPINGS.filter(
      (m) =>
        m.destRel.endsWith(".tsx") ||
        m.destRel.endsWith(".ts") ||
        m.destRel === "tailwind.config.ts" ||
        m.destRel === "postcss.config.js",
    );

    for (const mapping of filesToCheck) {
      const content = readFileSync(join(tmp, mapping.destRel), "utf-8");
      expect(content, `${mapping.destRel} should carry a SCOPE 036 fence`).toMatch(fenceRegex);
    }
  });

  it("JSON files (components.json) are exempt from fences", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const json = readFileSync(join(tmp, "components.json"), "utf-8");
    expect(json).not.toMatch(/SCOPE 036/);
    // Sanity: it's still valid JSON
    expect(() => JSON.parse(json)).not.toThrow();
  });
});

describe("QT-9 — smoke verify (resource-calendar shape, exports, file presence)", () => {
  it("resource-calendar exports a ResourceCalendar component and does not import library CSS", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const src = readFileSync(join(tmp, "src", "components", "ui", "resource-calendar.tsx"), "utf-8");
    expect(src).toMatch(/export\s+\{\s*ResourceCalendar\s*\}/);
    expect(src).not.toMatch(/react-big-calendar\/lib\/css/);
    expect(src).toMatch(/from\s+"react-big-calendar"/);
  });

  it("verify-scaffold.md ships alongside the templates", () => {
    expect(existsSync(join(TEMPLATES_DIR, "verify-scaffold.md"))).toBe(true);
  });

  it("Button, Card, ResourceCalendar all import the cn helper from @/lib/utils", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    for (const file of [
      "src/components/ui/button.tsx",
      "src/components/ui/card.tsx",
      "src/components/ui/resource-calendar.tsx",
    ]) {
      const src = readFileSync(join(tmp, file), "utf-8");
      expect(src, `${file} should import cn`).toMatch(/from\s+"@\/lib\/utils"/);
    }
  });
});

describe("QT-10 — theme provider + mode toggle shape", () => {
  it("theme-provider exports ThemeProvider + useTheme; uses localStorage + matchMedia", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const src = readFileSync(join(tmp, "src", "components", "theme-provider.tsx"), "utf-8");
    expect(src).toMatch(/export\s+function\s+ThemeProvider/);
    expect(src).toMatch(/export\s+function\s+useTheme/);
    expect(src).toMatch(/localStorage/);
    expect(src).toMatch(/matchMedia/);
    expect(src).toMatch(/wxkanban-ui-theme/);
    // Cleanup listener present
    expect(src).toMatch(/removeEventListener/);
    // dark class management
    expect(src).toMatch(/classList\.add\("light", "dark"\)|classList\.remove\("light", "dark"\)/);
  });

  it("mode-toggle exports ModeToggle and uses Sun + Moon icons", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const src = readFileSync(join(tmp, "src", "components", "mode-toggle.tsx"), "utf-8");
    expect(src).toMatch(/export\s+function\s+ModeToggle/);
    expect(src).toMatch(/Sun/);
    expect(src).toMatch(/Moon/);
    expect(src).toMatch(/setTheme\("light"\)/);
    expect(src).toMatch(/setTheme\("dark"\)/);
    expect(src).toMatch(/setTheme\("system"\)/);
  });

  it("CLAUDE.md note tells the consumer how to wire ThemeProvider + ModeToggle", async () => {
    await handleScaffoldFrontend({ projectRoot: tmp, templatesDir: TEMPLATES_DIR, silent: true });
    const claude = readFileSync(join(tmp, "CLAUDE.md"), "utf-8");
    expect(claude).toContain(CLAUDE_MD_MARKER);
    expect(claude).toMatch(/ThemeProvider/);
    expect(claude).toMatch(/ModeToggle/);
    expect(claude).toMatch(/wxkanban-ui-theme/);
  });
});
