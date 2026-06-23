import { cpSync, existsSync, mkdirSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import { findTemplatesDir } from "../../scaffold/kit-root";

// wxConversion orchestrator command handler.
//
// "Workflow engine, not AI client": this handler runs NO AI. It scaffolds the
// from-PDF rebuild workspace (`pre-convert/` + `rebuild/{pages,db,scopes}`),
// installs the wxConversion skill DIRECTORY into the consumer's
// `.claude/skills/`, prints the next steps, and hands off. The actual PDF →
// modern-stack rebuild is driven interactively by the developer's editor AI
// following the installed skill.

export interface WxConversionOptions {
  /** Override the detected consumer project root (tests / explicit target). */
  projectRoot?: string;
  /** Override the kit templates directory (tests). */
  templatesDir?: string;
  /** Re-install the skill even if the consumer already has an (edited) copy. */
  force?: boolean;
}

export interface WxConversionAction {
  path: string;
  action: "created-dir" | "exists" | "created" | "skipped";
}

export interface WxConversionResult {
  exitCode: 0 | 1 | 2;
  output: string;
  actions: WxConversionAction[];
}

const SKILL_DIRNAME = "wxConversion";

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
  const skillSrc = join(templatesDir, SKILL_DIRNAME);
  if (!existsSync(join(skillSrc, "SKILL.md"))) {
    return {
      exitCode: 1,
      output: `ERROR: wxConversion skill template not found at ${skillSrc}\n`,
      actions: [],
    };
  }

  const actions: WxConversionAction[] = [];
  const rel = (abs: string) =>
    (abs.startsWith(consumerRoot) ? abs.slice(consumerRoot.length + 1) : abs)
      .split("\\")
      .join("/");
  const ensureDir = (abs: string) => {
    const existed = existsSync(abs);
    if (!existed) mkdirSync(abs, { recursive: true });
    actions.push({ path: rel(abs), action: existed ? "exists" : "created-dir" });
  };

  // 1) Workspace: pre-convert/ + rebuild/{pages,db,scopes}
  ensureDir(join(consumerRoot, "pre-convert"));
  for (const d of ["pages", "db", "scopes"]) {
    ensureDir(join(consumerRoot, "rebuild", d));
  }

  // 2) Install the skill directory (consumer-owned: skip if present unless --force).
  //    The AI-agnostic home is _wxAI/skills/; Claude Code also reads
  //    .claude/skills/, so install there too when the consumer uses Claude.
  const installTargets = [join(consumerRoot, "_wxAI", "skills", SKILL_DIRNAME)];
  if (existsSync(join(consumerRoot, ".claude"))) {
    installTargets.push(join(consumerRoot, ".claude", "skills", SKILL_DIRNAME));
  }
  const installedAt: string[] = [];
  for (const dest of installTargets) {
    const present = existsSync(dest);
    if (!present || opts.force === true) {
      cpSync(skillSrc, dest, { recursive: true });
      actions.push({ path: rel(dest), action: "created" });
      installedAt.push(rel(dest));
    } else {
      actions.push({ path: rel(dest), action: "skipped" });
    }
  }

  const installedNote =
    installedAt.length > 0
      ? `Skill installed at: ${installedAt.join(", ")}.`
      : `Skill already installed (kept your copy; pass --force to re-install).`;

  const output = [
    "wxConversion workspace ready.",
    "",
    "  pre-convert/        (per-element Markdown lands here)",
    "  rebuild/pages/      (regenerated React/shadcn components)",
    "  rebuild/db/         (DDL + ER diagram)",
    "  rebuild/scopes/     (queries scope + reports stub)",
    `  ${installedNote}`,
    "",
    "Next steps (run in your editor AI):",
    "  1. Invoke /wxConversion <doc.pdf> (or open the installed skill).",
    "  2. Stage 1 — split the PDF into pre-convert/ Markdown.",
    "  3. Stage 2 — regenerate pages as modern stack components (behavior wired).",
    "  4. Stage 3 — answer the target-DB question; generate schema + ER (HFSQL -> JSON note).",
    "  5. Stages 4-5 — queries scope + reports stub.",
    "",
    "Requires Python + PyMuPDF and Node + puppeteer. Produces Markdown/TSX/SQL only — runs no DB.",
    "",
  ].join("\n");

  return { exitCode: 0, output, actions };
}

function defaultSkillsTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv, "skills");
  return findTemplatesDir(__dirname, "skills");
}
