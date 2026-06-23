import { cpSync, existsSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import { findTemplatesDir } from "../../scaffold/kit-root";

// wxConversionScope orchestrator command handler.
//
// "Workflow engine, not AI client": runs NO AI. It installs the
// wxConversionScope skill DIRECTORY into the consumer's `.claude/skills/`
// and verifies the from-PDF conversion artifacts exist (`pre-convert/`); the
// scopes themselves land in `specs/Project-Scope/`, owned by the existing
// buildscope/createSpecs pipeline, so nothing is scaffolded here. The actual
// scope generation is driven by the developer's editor AI following the skill.

export interface WxConversionScopeOptions {
  /** Override the detected consumer project root (tests / explicit target). */
  projectRoot?: string;
  /** Override the kit templates directory (tests). */
  templatesDir?: string;
  /** Re-install the skill even if the consumer already has an (edited) copy. */
  force?: boolean;
}

export interface WxConversionScopeAction {
  path: string;
  action: "created-dir" | "exists" | "created" | "skipped";
}

export interface WxConversionScopeResult {
  exitCode: 0 | 1 | 2;
  output: string;
  actions: WxConversionScopeAction[];
}

const SKILL_DIRNAME = "wxConversionScope";

export function handleWxConversionScopeCommand(
  opts: WxConversionScopeOptions = {},
): WxConversionScopeResult {
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
      output: `ERROR: wxConversionScope skill template not found at ${skillSrc}\n`,
      actions: [],
    };
  }

  // Conversion must have run first: the scope generator reads pre-convert/.
  const preConvert = join(consumerRoot, "pre-convert");
  if (!existsSync(preConvert)) {
    return {
      exitCode: 2,
      output:
        "ERROR: no pre-convert/ artifacts found.\n" +
        "Run `wxkanban-agent wxconversion <doc.pdf>` first to convert the PDF,\n" +
        "then run wxconversionscope to generate scopes from the result.\n",
      actions: [],
    };
  }

  const actions: WxConversionScopeAction[] = [];
  const rel = (abs: string) =>
    (abs.startsWith(consumerRoot) ? abs.slice(consumerRoot.length + 1) : abs)
      .split("\\")
      .join("/");

  // Install the skill directory (consumer-owned: skip if present unless --force).
  // The AI-agnostic home is _wxAI/skills/; Claude Code also reads .claude/skills/,
  // so install there too when the consumer uses Claude.
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
    "wxConversionScope ready.",
    "",
    `  pre-convert/   found (conversion artifacts present)`,
    `  ${installedNote}`,
    "",
    "Next step (run in your editor AI):",
    "  Invoke /wxConversionScope to begin scope generation (resumable).",
    "  Scopes are written under specs/Project-Scope/ via the BuildScope gated method;",
    "  after each scope choose [Yes] to continue or [Save] to stop and restart later.",
    "",
    "This command produces no scopes itself — it runs no AI and writes no database.",
    "",
  ].join("\n");

  return { exitCode: 0, output, actions };
}

function defaultSkillsTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv, "skills");
  return findTemplatesDir(__dirname, "skills");
}
