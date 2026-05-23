import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import {
  copyTemplate,
  planCopies,
  type CopyResult,
  type TemplateMapping,
} from "../../scaffold/template-copy";
import {
  mergeDeps,
  readPackageJson,
  writePackageJson,
  type DepDiff,
  type DepsToAdd,
} from "../../scaffold/deps-merge";
import { confirm } from "../../scaffold/prompt";

export const TEMPLATE_MAPPINGS: TemplateMapping[] = [
  { srcRel: "tailwind.config.ts", destRel: "tailwind.config.ts" },
  { srcRel: "postcss.config.js", destRel: "postcss.config.js" },
  { srcRel: "components.json", destRel: "components.json" },
  { srcRel: "src/styles/globals.css", destRel: "src/styles/globals.css" },
  { srcRel: "src/lib/utils.ts", destRel: "src/lib/utils.ts" },
  { srcRel: "src/components/ui/button.tsx", destRel: "src/components/ui/button.tsx" },
  { srcRel: "src/components/ui/card.tsx", destRel: "src/components/ui/card.tsx" },
  { srcRel: "src/components/ui/input.tsx", destRel: "src/components/ui/input.tsx" },
  { srcRel: "src/components/ui/label.tsx", destRel: "src/components/ui/label.tsx" },
  { srcRel: "src/components/ui/dialog.tsx", destRel: "src/components/ui/dialog.tsx" },
  { srcRel: "src/components/ui/dropdown-menu.tsx", destRel: "src/components/ui/dropdown-menu.tsx" },
  { srcRel: "src/components/ui/table.tsx", destRel: "src/components/ui/table.tsx" },
  { srcRel: "src/components/ui/form.tsx", destRel: "src/components/ui/form.tsx" },
  { srcRel: "src/components/ui/select.tsx", destRel: "src/components/ui/select.tsx" },
  { srcRel: "src/components/ui/toast.tsx", destRel: "src/components/ui/toast.tsx" },
  { srcRel: "src/components/ui/calendar.tsx", destRel: "src/components/ui/calendar.tsx" },
  { srcRel: "src/components/ui/resource-calendar.tsx", destRel: "src/components/ui/resource-calendar.tsx" },
  { srcRel: "src/components/theme-provider.tsx", destRel: "src/components/theme-provider.tsx" },
  { srcRel: "src/components/mode-toggle.tsx", destRel: "src/components/mode-toggle.tsx" },
];

export const CLAUDE_MD_MARKER = "<!-- WXKANBAN-SCAFFOLD-FRONTEND -->";

export const CLAUDE_MD_NOTE = `${CLAUDE_MD_MARKER}

## Frontend Scaffold (wxkanban-agent scaffold:frontend)

UI primitives live in \`src/components/ui/\` and are **consumer-owned** after scaffold — the kit will not overwrite them on re-runs unless you pass \`--force\`.

To wire dark mode, wrap your app root with:

\`\`\`tsx
<ThemeProvider defaultTheme="system" storageKey="wxkanban-ui-theme">
  {/* ...your app... */}
</ThemeProvider>
\`\`\`

and drop \`<ModeToggle />\` into any header.

To add more shadcn components manually:

\`\`\`bash
npx shadcn@latest add <name>
\`\`\`
`;

export interface ScaffoldOptions {
  dryRun?: boolean;
  force?: boolean;
  yes?: boolean;
  projectRoot?: string;
  templatesDir?: string;
  /** For tests: skip the prompt entirely (returns answer instead). */
  promptOverride?: (overwriteCount: number) => Promise<boolean>;
  /** For tests: suppress logger side-effects. */
  silent?: boolean;
}

export interface FileAction {
  destRel: string;
  action: CopyResult | "would create" | "would overwrite" | "would skip" | "aborted" | "failed";
  error?: string;
}

export interface ScaffoldResult {
  exitCode: 0 | 1 | 2 | 3;
  output: string;
  actions: FileAction[];
  depsDiff: DepDiff | null;
  packageJsonChanged: boolean;
  claudeMdChanged: boolean;
}

// [SCOPE 036 / T025] BEGIN — core/orchestrator/command-handlers/scaffold-frontend.ts — CLI handler
export async function handleScaffoldFrontend(opts: ScaffoldOptions = {}): Promise<ScaffoldResult> {
  if (opts.dryRun && opts.force) {
    return {
      exitCode: 3,
      output: "ERROR: --dry-run and --force are mutually exclusive.\n",
      actions: [],
      depsDiff: null,
      packageJsonChanged: false,
      claudeMdChanged: false,
    };
  }

  const consumerRoot = opts.projectRoot ?? findConsumerRoot();
  if (!consumerRoot) {
    return {
      exitCode: 2,
      output:
        "ERROR: not in a wxkanban-agent consumer project.\n" +
        "Looked for: .wxai/, package.json (with wxkanban-agent in dependencies).\n" +
        "Run `wxkanban-agent init` first, or cd into a project root.\n",
      actions: [],
      depsDiff: null,
      packageJsonChanged: false,
      claudeMdChanged: false,
    };
  }

  const templatesDir = resolve(opts.templatesDir ?? defaultTemplatesDir());
  if (!existsSync(templatesDir)) {
    return {
      exitCode: 1,
      output: `ERROR: templates directory not found at ${templatesDir}\n`,
      actions: [],
      depsDiff: null,
      packageJsonChanged: false,
      claudeMdChanged: false,
    };
  }

  if (opts.dryRun) {
    return await runDryRun(consumerRoot, templatesDir);
  }

  return await runExecute(consumerRoot, templatesDir, opts);
}
// [SCOPE 036 / T025] END

// [SCOPE 036 / T028] BEGIN — runDryRun (FR-014 preview)
async function runDryRun(consumerRoot: string, templatesDir: string): Promise<ScaffoldResult> {
  const plan = planCopies(TEMPLATE_MAPPINGS, templatesDir, consumerRoot);
  const actions: FileAction[] = plan.map((p) => ({
    destRel: relativePath(p.destAbs, consumerRoot),
    action: p.action as FileAction["action"],
  }));

  const pkgPath = join(consumerRoot, "package.json");
  const pkg = readPackageJson(pkgPath) ?? {};
  const additions = loadDepsAdditions(templatesDir);
  const merged = mergeDeps(pkg, additions);
  const wouldChangeClaudeMd = predictClaudeMdChange(consumerRoot);

  const lines: string[] = [];
  lines.push("ACTION         PATH" + " ".repeat(36) + "REASON");
  for (const a of actions) {
    const action = a.action.padEnd(15);
    const path = a.destRel.padEnd(40);
    const reason = a.action === "would create" ? "missing" : "exists";
    lines.push(`${action}${path}${reason}`);
  }
  lines.push("");
  lines.push("PACKAGE.JSON DELTA");
  if (merged.diff.added.length === 0) {
    lines.push("  (no changes)");
  } else {
    for (const d of merged.diff.added) {
      lines.push(`  + ${d.kind}.${d.name}    ${d.version}`);
    }
  }
  lines.push("");
  lines.push("CLAUDE.md");
  lines.push(wouldChangeClaudeMd ? "  would append scaffold note" : "  no change (marker already present or N/A)");
  lines.push("");

  const wouldExit = computeExitCode(actions);
  lines.push(`EXIT CODE WOULD BE: ${wouldExit}`);

  return {
    exitCode: wouldExit,
    output: lines.join("\n") + "\n",
    actions,
    depsDiff: merged.diff,
    packageJsonChanged: merged.changed,
    claudeMdChanged: wouldChangeClaudeMd,
  };
}
// [SCOPE 036 / T028] END

// [SCOPE 036 / T028] BEGIN — predictClaudeMdChange (dry-run honesty)
function predictClaudeMdChange(consumerRoot: string): boolean {
  const claudePath = join(consumerRoot, "CLAUDE.md");
  if (!existsSync(claudePath)) return true;
  const current = readFileSync(claudePath, "utf-8");
  return !current.includes(CLAUDE_MD_MARKER);
}
// [SCOPE 036 / T028] END

// [SCOPE 036 / T025] BEGIN — runExecute (real scaffold)
async function runExecute(
  consumerRoot: string,
  templatesDir: string,
  opts: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const plan = planCopies(TEMPLATE_MAPPINGS, templatesDir, consumerRoot, { overwrite: !!opts.force });
  const actions: FileAction[] = [];
  const lines: string[] = [];

  let overwriteCount = 0;
  if (opts.force) {
    overwriteCount = plan.filter((p) => p.action === "would overwrite").length;
    if (overwriteCount > 0) {
      const ok = opts.promptOverride
        ? await opts.promptOverride(overwriteCount)
        : await confirm(`Overwrite ${overwriteCount} existing file(s)?`, { assumeYes: !!opts.yes });
      if (!ok) {
        for (const p of plan) {
          actions.push({
            destRel: relativePath(p.destAbs, consumerRoot),
            action: "aborted",
          });
        }
        return {
          exitCode: 0,
          output: "Aborted by user.\n",
          actions,
          depsDiff: null,
          packageJsonChanged: false,
          claudeMdChanged: false,
        };
      }
    }
  }

  let anyFailed = false;
  for (const p of plan) {
    const destRel = relativePath(p.destAbs, consumerRoot);
    try {
      const result = copyTemplate(p.srcAbs, p.destAbs, { overwrite: !!opts.force });
      actions.push({ destRel, action: result });
      if (!opts.silent) lines.push(`${result.padEnd(13)} ${destRel}`);
    } catch (err: unknown) {
      anyFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      actions.push({ destRel, action: "failed", error: msg });
      if (!opts.silent) lines.push(`FAILED       ${destRel}  (${msg})`);
    }
  }

  const pkgPath = join(consumerRoot, "package.json");
  const pkg = readPackageJson(pkgPath) ?? {};
  const additions = loadDepsAdditions(templatesDir);
  const merged = mergeDeps(pkg, additions);
  let packageJsonChanged = false;
  if (merged.changed) {
    try {
      writePackageJson(pkgPath, merged.packageJson);
      packageJsonChanged = true;
      if (!opts.silent) {
        for (const d of merged.diff.added) {
          lines.push(`+ ${d.kind}.${d.name}  ${d.version}`);
        }
        lines.push("Run: npm install");
      }
    } catch (err: unknown) {
      anyFailed = true;
      const msg = err instanceof Error ? err.message : String(err);
      lines.push(`FAILED package.json mutation (${msg})`);
    }
  }

  const claudeMdChanged = appendClaudeMdNote(consumerRoot);
  if (claudeMdChanged && !opts.silent) lines.push("updated   CLAUDE.md (scaffold note appended)");

  const exitCode: 0 | 1 = anyFailed ? 1 : 0;
  return {
    exitCode,
    output: lines.join("\n") + (lines.length ? "\n" : ""),
    actions,
    depsDiff: merged.diff,
    packageJsonChanged,
    claudeMdChanged,
  };
}
// [SCOPE 036 / T025] END

// [SCOPE 036 / T025] BEGIN — appendClaudeMdNote (FR-012 idempotent append)
function appendClaudeMdNote(consumerRoot: string): boolean {
  const claudePath = join(consumerRoot, "CLAUDE.md");
  if (existsSync(claudePath)) {
    const current = readFileSync(claudePath, "utf-8");
    if (current.includes(CLAUDE_MD_MARKER)) return false;
    appendFileSync(claudePath, "\n\n" + CLAUDE_MD_NOTE);
    return true;
  }
  appendFileSync(claudePath, "# CLAUDE.md\n\n" + CLAUDE_MD_NOTE);
  return true;
}
// [SCOPE 036 / T025] END

// [SCOPE 036 / T025] BEGIN — loadDepsAdditions helper
function loadDepsAdditions(templatesDir: string): DepsToAdd {
  const depsPath = join(templatesDir, "deps.json");
  if (!existsSync(depsPath)) return { dependencies: {}, devDependencies: {} };
  try {
    const raw = JSON.parse(readFileSync(depsPath, "utf-8")) as Partial<DepsToAdd>;
    return {
      dependencies: raw.dependencies ?? {},
      devDependencies: raw.devDependencies ?? {},
    };
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }
}
// [SCOPE 036 / T025] END

// [SCOPE 036 / T025] BEGIN — computeExitCode + relativePath + defaultTemplatesDir helpers
function computeExitCode(actions: FileAction[]): 0 | 1 {
  return actions.some((a) => a.action === "failed") ? 1 : 0;
}

function relativePath(abs: string, root: string): string {
  const rel = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
  return rel.split("\\").join("/");
}

function defaultTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv);
  return resolve(__dirname, "..", "..", "..", "templates", "frontend");
}
// [SCOPE 036 / T025] END
