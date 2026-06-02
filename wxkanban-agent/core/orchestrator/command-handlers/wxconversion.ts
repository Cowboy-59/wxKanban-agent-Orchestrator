import { existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import { copyTemplate, type CopyResult } from "../../scaffold/template-copy";

// Spec 044 — wxConversion orchestrator command handler.
//
// "Workflow engine, not AI client": this handler runs NO AI. It scaffolds the
// conversion workspace (`pre-convert/` + `pre-convert/screens/`), installs the
// wxConversion-analyst skill into the consumer's `.claude/skills/`, prints the
// next steps, and hands off. The actual WinDev → target conversion is driven
// interactively by the developer's editor AI following the installed skill.

export interface WxConversionOptions {
  /** Override the detected consumer project root (tests / explicit target). */
  projectRoot?: string;
  /** Override the kit templates directory (tests). */
  templatesDir?: string;
  /** Re-install the skill even if the consumer already has an (edited) copy. */
  force?: boolean;
  /** Suppress nothing here, but reserved to mirror scaffold-frontend's shape. */
  silent?: boolean;
}

export interface WxConversionAction {
  path: string;
  action: CopyResult | "created-dir" | "exists";
}

export interface WxConversionResult {
  exitCode: 0 | 1 | 2;
  output: string;
  actions: WxConversionAction[];
}

const SKILL_FILENAME = "wxConversion-analyst.md";

// [SCOPE 044 / T004] BEGIN — wxConversion scaffold-and-handoff handler
export function handleWxConversionCommand(
  opts: WxConversionOptions = {},
): WxConversionResult {
  const consumerRoot = opts.projectRoot ?? findConsumerRoot();
  if (!consumerRoot) {
    return {
      exitCode: 2,
      output:
        "ERROR: not in a wxkanban-agent consumer project.\n" +
        "Looked for: .wxai/, package.json (with wxkanban-agent in dependencies).\n" +
        "Run `wxkanban-agent init` first, or cd into a project root.\n",
      actions: [],
    };
  }

  const templatesDir = resolve(opts.templatesDir ?? defaultSkillsTemplatesDir());
  const skillSrc = join(templatesDir, SKILL_FILENAME);
  if (!existsSync(skillSrc)) {
    return {
      exitCode: 1,
      output: `ERROR: wxConversion skill template not found at ${skillSrc}\n`,
      actions: [],
    };
  }

  const actions: WxConversionAction[] = [];

  // 1) Conversion workspace.
  const preConvert = join(consumerRoot, "pre-convert");
  const screens = join(preConvert, "screens");
  actions.push(ensureDir(preConvert, consumerRoot));
  actions.push(ensureDir(screens, consumerRoot));

  // 2) Install the skill (consumer-owned: skipped if present unless --force).
  const skillDest = join(consumerRoot, ".claude", "skills", SKILL_FILENAME);
  const copyResult = copyTemplate(skillSrc, skillDest, { overwrite: opts.force === true });
  actions.push({ path: rel(skillDest, consumerRoot), action: copyResult });

  // 3) Next steps for the editor AI (the handler itself does no analysis).
  const installedNote =
    copyResult === "skipped"
      ? `Skill already installed at .claude/skills/${SKILL_FILENAME} (kept your copy; pass --force to re-install).`
      : `Skill installed at .claude/skills/${SKILL_FILENAME}.`;

  const output =
    [
      "wxConversion workspace ready.",
      "",
      `  pre-convert/          ${dirState(actions, "pre-convert")}`,
      `  pre-convert/screens/  ${dirState(actions, "pre-convert/screens")}`,
      `  ${installedNote}`,
      "",
      "Next steps (run in your editor AI):",
      "  1. Invoke /wxConversion (or open the installed skill) to start the guided conversion.",
      "  2. Part A — switch the WinDev app to text saves, then let the skill turn",
      "     .wdw/.wdg/.wdc into Markdown under pre-convert/ and capture screen images.",
      "  3. Scope — the skill drafts the Scope-of-Project Markdown from the converted source.",
      "  4. Part B (optional) — the skill asks whether to document the DB conversion; on yes",
      "     it writes only pre-convert/schema-mapping.md (HFSQL → target mapping + proposed DDL).",
      "",
      "This command produces Markdown only — it runs no AI, builds no database, and loads no data.",
      "",
    ].join("\n");

  return { exitCode: 0, output, actions };
}
// [SCOPE 044 / T004] END

// [SCOPE 044 / T004] BEGIN — helpers
function ensureDir(absPath: string, root: string): WxConversionAction {
  const existed = existsSync(absPath);
  if (!existed) mkdirSync(absPath, { recursive: true });
  return { path: rel(absPath, root), action: existed ? "exists" : "created-dir" };
}

function dirState(actions: WxConversionAction[], relPath: string): string {
  const a = actions.find((x) => x.path === relPath);
  return a?.action === "created-dir" ? "created" : "exists";
}

function rel(abs: string, root: string): string {
  const r = abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
  return r.split("\\").join("/");
}

function defaultSkillsTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv, "skills");
  return resolve(__dirname, "..", "..", "..", "templates", "skills");
}
// [SCOPE 044 / T004] END
