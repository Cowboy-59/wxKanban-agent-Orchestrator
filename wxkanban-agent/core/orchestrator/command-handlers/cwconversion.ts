import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import { findTemplatesDir } from "../../scaffold/kit-root";

// cwConversion orchestrator command handler (the Clarion counterpart to
// wxconversion.ts — TXA/TXD/.clw source instead of a PDF).
//
// "Workflow engine, not AI client": this handler runs NO AI. It scaffolds the
// rebuild workspace (`pre-convert/` + `rebuild/{pages,db,scopes}`), installs the
// cwConversion skill DIRECTORY into the consumer's `.claude/`, prints the next
// steps, and hands off. The actual Clarion-source → modern-stack rebuild is
// driven interactively by the developer's editor AI following the installed
// skill (methodology fetched via project.get_command_prompt { command:
// "cwconversion" }).

export interface CwConversionOptions {
  /** Override the detected consumer project root (tests / explicit target). */
  projectRoot?: string;
  /** Override the kit templates directory (tests). */
  templatesDir?: string;
  /** Re-install the skill even if the consumer already has an (edited) copy. */
  force?: boolean;
  /**
   * Review mode: do NOT scaffold/install. Compare the converted source under
   * pre-convert/ against the generated rebuild/ artifacts and report what is
   * missing, stale (source changed since generated), orphaned, or flagged for
   * review — for the developer to choose what to regenerate/keep. Changes nothing.
   */
  review?: boolean;
}

export interface CwConversionAction {
  path: string;
  action: "created-dir" | "exists" | "created" | "skipped";
}

/** A single drift finding produced by `--review`. */
export type ReviewKind = "missing" | "stale" | "orphaned" | "review";
export interface ReviewFinding {
  kind: ReviewKind;
  item: string; // the element / artifact in question
  detail: string; // why it's flagged
  action: string; // the suggested command / choice to resolve it
}

export interface CwConversionResult {
  exitCode: 0 | 1 | 2;
  output: string;
  actions: CwConversionAction[];
  /** Populated only by `--review`. */
  findings?: ReviewFinding[];
}

const SKILL_DIRNAME = "cwConversion";

export function handleCwConversionCommand(
  opts: CwConversionOptions = {},
): CwConversionResult {
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

  // --review: compare pre-convert/ (source) vs rebuild/ (generated) and report
  // drift. No scaffolding, no skill install, no template needed.
  if (opts.review === true) {
    return reviewConversion(consumerRoot);
  }

  const templatesDir = resolve(opts.templatesDir ?? defaultSkillsTemplatesDir());
  const skillSrc = join(templatesDir, SKILL_DIRNAME);
  if (!existsSync(join(skillSrc, "SKILL.md"))) {
    return {
      exitCode: 1,
      output: `ERROR: cwConversion skill template not found at ${skillSrc}\n`,
      actions: [],
    };
  }

  const actions: CwConversionAction[] = [];
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
  //    The AI-agnostic home is _wxAI/skills/; Claude Code discovers skills at
  //    .claude/<name>/ (top-level, like wxICA), so install there too when the
  //    consumer uses Claude.
  const installTargets = [join(consumerRoot, "_wxAI", "skills", SKILL_DIRNAME)];
  if (existsSync(join(consumerRoot, ".claude"))) {
    installTargets.push(join(consumerRoot, ".claude", SKILL_DIRNAME));
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
    "cwConversion workspace ready.",
    "",
    "  pre-convert/        (per-element Markdown lands here; _discarded.md = not captured)",
    "  rebuild/pages/      (regenerated React/shadcn components)",
    "  rebuild/db/         (DDL + ER diagram; real FK constraints when the relation graph is recovered)",
    "  rebuild/scopes/     (VIEW queries scope + procedures scope + reports stub)",
    `  ${installedNote}`,
    "",
    "Next steps (run in your editor AI):",
    "  1. Invoke /cwConversion (with --txa/--txd, or --clw \"<dir>/*.clw\" for a generated-source handover).",
    "  2. Stage 1 — split the source into pre-convert/ Markdown. Pass the WHOLE .clw set (incl. *_BC*.clw)",
    "     so the foreign-key graph is recovered. Then review pre-convert/_discarded.md.",
    "  3. Stage 2 — regenerate windows as modern stack components (embeds wired).",
    "  4. Stage 3 — answer the target-DB question; generate schema + ER (TopSpeed/ISAM -> JSON note).",
    "  5. Stage 4 — VIEW/browse queries scope (clarion-views-to-scope.py).",
    "  6. Stage 5 — procedures + embeds + referential-integrity scope (clarion-procs-to-scope.py).",
    "  7. Stage 6 — reports stub (clarion-reports-to-stub.py).",
    "",
    "Pass Windows-style paths (E:/App/src/*.clw) — Git-Bash /e/... paths silently fail Python glob.",
    "Re-sync check: `wxkanban-agent cwconversion --review` compares pre-convert/ against",
    "rebuild/ and lists what is missing, stale, or orphaned — so you can choose what to redo.",
    "",
    "Requires Python 3 and Node + puppeteer. Produces Markdown/TSX/SQL only — runs no DB.",
    "",
  ].join("\n");

  return { exitCode: 0, output, actions };
}

// [--review] Compare the converted source (pre-convert/) against the generated
// rebuild/ artifacts and report drift. Mechanical only (file existence + mtime
// against the skill's input→output naming conventions); changes nothing, so it
// is safe to run repeatedly. The developer (or editor AI) turns the findings
// into regenerate/keep/delete choices.
function reviewConversion(consumerRoot: string): CwConversionResult {
  const pre = join(consumerRoot, "pre-convert");
  const rebuild = join(consumerRoot, "rebuild");
  const rel = (abs: string) =>
    (abs.startsWith(consumerRoot) ? abs.slice(consumerRoot.length + 1) : abs)
      .split("\\")
      .join("/");

  if (!existsSync(pre)) {
    return {
      exitCode: 2,
      output:
        "ERROR: no pre-convert/ found — nothing to review.\n" +
        "Run `wxkanban-agent cwconversion` and the conversion stages first.\n",
      actions: [],
      findings: [],
    };
  }

  const mtime = (p: string): number => {
    try {
      return statSync(p).mtimeMs;
    } catch {
      return 0;
    }
  };
  const listByExt = (dir: string, suffix: string): string[] => {
    try {
      return readdirSync(dir).filter((f) => f.endsWith(suffix)).sort();
    } catch {
      return [];
    }
  };

  const findings: ReviewFinding[] = [];

  // 0) Source changed since the last split? (Clarion source = .txa/.txd/.clw)
  const srcDir = join(consumerRoot, "conversion", "src");
  const indexMd = join(pre, "index.md");
  const sources = [
    ...listByExt(srcDir, ".txa"),
    ...listByExt(srcDir, ".txd"),
    ...listByExt(srcDir, ".clw"),
  ];
  if (sources.length && existsSync(indexMd)) {
    const newestSrc = Math.max(...sources.map((f) => mtime(join(srcDir, f))));
    if (newestSrc > mtime(indexMd)) {
      findings.push({
        kind: "stale",
        item: "pre-convert/ (split output)",
        detail: "a Clarion source export (.txa/.txd/.clw) is newer than pre-convert/index.md",
        action:
          're-run: python <skill>/scripts/clarion-app-split.py --txa conversion/src/<App>.txa --clw "conversion/src/*.clw" --out pre-convert',
      });
    }
  }

  // 1) Windows: <X>.page.md (+ <X>.controls.md) -> rebuild/pages/<X>.tsx.
  //    Pages with no .controls.md are intentionally not scaffolded — skip them.
  const pagesDir = join(rebuild, "pages");
  for (const file of listByExt(pre, ".page.md")) {
    const name = file.slice(0, -".page.md".length);
    const controls = join(pre, `${name}.controls.md`);
    if (!existsSync(controls)) continue;
    const tsx = join(pagesDir, `${name}.tsx`);
    const fix = `python <skill>/scripts/clarion-window-to-react.py --page pre-convert/${name}.controls.md --out rebuild/pages`;
    if (!existsSync(tsx)) {
      findings.push({
        kind: "missing",
        item: `window ${name}`,
        detail: `no rebuild/pages/${name}.tsx`,
        action: fix,
      });
    } else if (Math.max(mtime(controls), mtime(join(pre, file))) > mtime(tsx)) {
      findings.push({
        kind: "stale",
        item: `window ${name}`,
        detail: `pre-convert source is newer than rebuild/pages/${name}.tsx`,
        action: fix,
      });
    }
  }

  // 2) Aggregate scopes: VIEW queries / procedures / reports.
  const aggregates = [
    {
      suffix: ".view.md",
      out: join(rebuild, "scopes", "VIEW-queries-scope.md"),
      label: "VIEW queries scope",
      script: "clarion-views-to-scope.py --src pre-convert --out rebuild/scopes",
    },
    {
      suffix: ".proc.md",
      out: join(rebuild, "scopes", "PROC-procedures-scope.md"),
      label: "procedures / business-logic scope",
      script: "clarion-procs-to-scope.py --src pre-convert --out rebuild/scopes",
    },
    {
      suffix: ".report.md",
      out: join(rebuild, "scopes", "RPT-reports-stub.md"),
      label: "reports stub",
      script: "clarion-reports-to-stub.py --src pre-convert --out rebuild/scopes",
    },
  ];
  for (const a of aggregates) {
    const srcs = listByExt(pre, a.suffix);
    if (!srcs.length) continue;
    const fix = `python <skill>/scripts/${a.script}`;
    if (!existsSync(a.out)) {
      findings.push({
        kind: "missing",
        item: a.label,
        detail: `${srcs.length} ${a.suffix} source(s) but no ${rel(a.out)}`,
        action: fix,
      });
    } else if (Math.max(...srcs.map((f) => mtime(join(pre, f)))) > mtime(a.out)) {
      findings.push({
        kind: "stale",
        item: a.label,
        detail: `a ${a.suffix} source is newer than ${rel(a.out)}`,
        action: fix,
      });
    }
  }

  // 3) Database schema + ER from *.table.md (+ _schema.md).
  const tableMds = listByExt(pre, ".table.md");
  if (tableMds.length) {
    const erFile = join(rebuild, "db", "ER-diagram.md");
    const sqlFiles = listByExt(join(rebuild, "db"), ".sql");
    const fix =
      "python <skill>/scripts/clarion-dict-to-sql.py --dialect <db> --src pre-convert --out rebuild/db";
    if (!existsSync(erFile) && !sqlFiles.length) {
      findings.push({
        kind: "missing",
        item: "database schema + ER",
        detail: `${tableMds.length} *.table.md but nothing in rebuild/db/`,
        action: fix,
      });
    } else if (existsSync(erFile)) {
      const newest = Math.max(
        ...tableMds.map((f) => mtime(join(pre, f))),
        mtime(join(pre, "_schema.md")),
      );
      if (newest > mtime(erFile)) {
        findings.push({
          kind: "stale",
          item: "database schema + ER",
          detail: `a *.table.md / _schema.md is newer than ${rel(erFile)}`,
          action: fix,
        });
      }
    }
  }

  // 4) Orphaned windows: rebuild/pages/<X>.tsx with no pre-convert/<X>.page.md.
  for (const tsx of listByExt(pagesDir, ".tsx")) {
    const name = tsx.slice(0, -".tsx".length);
    if (!existsSync(join(pre, `${name}.page.md`))) {
      findings.push({
        kind: "orphaned",
        item: `rebuild/pages/${tsx}`,
        detail: "no matching pre-convert source (element renamed or removed?)",
        action: `delete rebuild/pages/${tsx}, or restore pre-convert/${name}.page.md`,
      });
    }
  }

  // 5) Elements dropped at split time, surfaced for a keep/drop decision.
  if (existsSync(join(pre, "_discarded.md"))) {
    findings.push({
      kind: "review",
      item: "pre-convert/_discarded.md",
      detail: "elements were not captured by any classifier at split time",
      action:
        "open pre-convert/_discarded.md and decide whether any unmapped element should be kept",
    });
  }

  // ---- report
  const lines = [
    "cwConversion review — pre-convert/ (source) vs rebuild/ (generated):",
    "",
  ];
  if (!findings.length) {
    lines.push("  ✓ rebuild/ is in sync with pre-convert/ — nothing missing or stale.");
    return { exitCode: 0, output: lines.join("\n") + "\n", actions: [], findings };
  }
  const groups: Array<{ kind: ReviewKind; head: string }> = [
    { kind: "missing", head: "MISSING (in source, not generated):" },
    { kind: "stale", head: "STALE (source changed since generated — regenerate):" },
    { kind: "orphaned", head: "ORPHANED (generated, no source):" },
    { kind: "review", head: "REVIEW (surfaced for a keep/drop decision):" },
  ];
  let n = 0;
  for (const g of groups) {
    const items = findings.filter((f) => f.kind === g.kind);
    if (!items.length) continue;
    lines.push(g.head);
    for (const f of items) {
      n += 1;
      lines.push(`  ${n}. ${f.item} — ${f.detail}`);
      lines.push(`       → ${f.action}`);
    }
    lines.push("");
  }
  lines.push(
    `${findings.length} item(s) need attention. Choose which to regenerate / keep / delete — nothing was changed.`,
  );
  return { exitCode: 0, output: lines.join("\n") + "\n", actions: [], findings };
}

function defaultSkillsTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv, "skills");
  return findTemplatesDir(__dirname, "skills");
}
