import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "fs";
import { join, resolve } from "path";

import { findConsumerRoot } from "../../scaffold/consumer-detect";
import { findTemplatesDir } from "../../scaffold/kit-root";

// vbConversion orchestrator command handler (the VB6 counterpart to
// cwconversion.ts / wxconversion.ts — .vbp/.frm/.bas/.cls source).
//
// "Workflow engine, not AI client": runs NO AI. It scaffolds the rebuild
// workspace (`pre-convert/` + `rebuild/{pages,db,scopes}`), installs the
// vbConversion skill DIRECTORY, prints next steps, and hands off. The actual
// VB6 → modern-stack rebuild is driven by the developer's editor AI following
// the installed skill (methodology via project.get_command_prompt {command:
// "vbconversion"}).

export interface VbConversionOptions {
  projectRoot?: string;
  templatesDir?: string;
  force?: boolean;
  /** Review mode: compare pre-convert/ vs rebuild/ and report drift. Changes nothing. */
  review?: boolean;
}

export interface VbConversionAction {
  path: string;
  action: "created-dir" | "exists" | "created" | "skipped";
}

export type ReviewKind = "missing" | "stale" | "orphaned" | "review";
export interface ReviewFinding {
  kind: ReviewKind;
  item: string;
  detail: string;
  action: string;
}

export interface VbConversionResult {
  exitCode: 0 | 1 | 2;
  output: string;
  actions: VbConversionAction[];
  findings?: ReviewFinding[];
}

const SKILL_DIRNAME = "vbConversion";

export function handleVbConversionCommand(
  opts: VbConversionOptions = {},
): VbConversionResult {
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

  if (opts.review === true) {
    return reviewConversion(consumerRoot);
  }

  const templatesDir = resolve(opts.templatesDir ?? defaultSkillsTemplatesDir());
  const skillSrc = join(templatesDir, SKILL_DIRNAME);
  if (!existsSync(join(skillSrc, "SKILL.md"))) {
    return {
      exitCode: 1,
      output: `ERROR: vbConversion skill template not found at ${skillSrc}\n`,
      actions: [],
    };
  }

  const actions: VbConversionAction[] = [];
  const rel = (abs: string) =>
    (abs.startsWith(consumerRoot) ? abs.slice(consumerRoot.length + 1) : abs)
      .split("\\")
      .join("/");
  const ensureDir = (abs: string) => {
    const existed = existsSync(abs);
    if (!existed) mkdirSync(abs, { recursive: true });
    actions.push({ path: rel(abs), action: existed ? "exists" : "created-dir" });
  };

  ensureDir(join(consumerRoot, "pre-convert"));
  for (const d of ["pages", "db", "scopes"]) {
    ensureDir(join(consumerRoot, "rebuild", d));
  }

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
    "vbConversion workspace ready.",
    "",
    "  pre-convert/        (per-element Markdown lands here; _discarded.md = not captured)",
    "  rebuild/pages/      (regenerated React/shadcn components)",
    "  rebuild/db/         (reconstructed schema + ER; VB6 has no dictionary — confirm vs the .mdb)",
    "  rebuild/scopes/     (queries scope + business-logic scope + reports stub)",
    `  ${installedNote}`,
    "",
    "Next steps (run in your editor AI):",
    "  1. Invoke /vbConversion --vbp conversion/src/<App>.vbp (or --src \"conversion/src/*\").",
    "  2. Stage 1 — split .vbp/.frm/.bas/.cls into pre-convert/ Markdown. Review _discarded.md.",
    "  3. Stage 2 — regenerate forms as modern stack components (bound fields + events wired).",
    "  4. Stage 3 — answer the target-DB question; reconstruct schema (confirm types/PK vs the .mdb).",
    "  5. Stage 4 — queries scope (vb6-queries-to-scope.py).",
    "  6. Stage 5 — business-logic scope; Win32 Declare flagged non-portable (vb6-procs-to-scope.py).",
    "  7. Stage 6 — reports stub (vb6-reports-to-stub.py).",
    "",
    "Pass Windows-style paths (E:/App/src/*.frm) — Git-Bash /e/... paths silently fail Python glob.",
    "Re-sync check: `wxkanban-agent vbconversion --review` compares pre-convert/ against rebuild/.",
    "",
    "Requires Python 3 and Node + puppeteer. Produces Markdown/TSX/SQL only — runs no DB.",
    "",
  ].join("\n");

  return { exitCode: 0, output, actions };
}

function reviewConversion(consumerRoot: string): VbConversionResult {
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
        "Run `wxkanban-agent vbconversion` and the conversion stages first.\n",
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
  const newestOf = (dir: string, suffixes: string[]): number => {
    let n = 0;
    for (const s of suffixes) {
      for (const f of listByExt(dir, s)) n = Math.max(n, mtime(join(dir, f)));
    }
    return n;
  };

  const findings: ReviewFinding[] = [];

  // 0) Source changed since the last split? (VB6 source = .vbp/.frm/.bas/.cls/.ctl)
  const srcDir = join(consumerRoot, "conversion", "src");
  const indexMd = join(pre, "index.md");
  const newestSrc = newestOf(srcDir, [".vbp", ".frm", ".bas", ".cls", ".ctl"]);
  if (newestSrc && existsSync(indexMd) && newestSrc > mtime(indexMd)) {
    findings.push({
      kind: "stale",
      item: "pre-convert/ (split output)",
      detail: "a VB6 source file (.vbp/.frm/.bas/.cls/.ctl) is newer than pre-convert/index.md",
      action:
        're-run: python <skill>/scripts/vb6-project-split.py --vbp conversion/src/<App>.vbp --out pre-convert',
    });
  }

  // 1) Forms: <X>.page.md (+ <X>.controls.md) -> rebuild/pages/<X>.tsx.
  const pagesDir = join(rebuild, "pages");
  for (const file of listByExt(pre, ".page.md")) {
    const name = file.slice(0, -".page.md".length);
    const controls = join(pre, `${name}.controls.md`);
    if (!existsSync(controls)) continue;
    const tsx = join(pagesDir, `${name}.tsx`);
    const fix = `python <skill>/scripts/vb6-form-to-react.py --page pre-convert/${name}.controls.md --out rebuild/pages`;
    if (!existsSync(tsx)) {
      findings.push({ kind: "missing", item: `form ${name}`, detail: `no rebuild/pages/${name}.tsx`, action: fix });
    } else if (Math.max(mtime(controls), mtime(join(pre, file))) > mtime(tsx)) {
      findings.push({ kind: "stale", item: `form ${name}`, detail: `pre-convert source is newer than rebuild/pages/${name}.tsx`, action: fix });
    }
  }

  // Does any form actually bind data? VB6 has no *.table.md, so the precise
  // signal that a DB model / queries scope is EXPECTED is a Data control or a
  // bound field in a controls sidecar — without it (a form with no data),
  // flagging them "missing" would be a false positive.
  const hasDataBinding = listByExt(pre, ".controls.md").some((f) => {
    try {
      return /\bVB\.Data\b|DataField|\.Adodc\b|RecordSource/i.test(readFileSync(join(pre, f), "utf-8"));
    } catch {
      return false;
    }
  });

  // 2) Aggregate scopes. Procedures/reports are tied to their own element sources
  //    (precise). The queries scope is expected only when a form binds data.
  const aggregates = [
    { suffixes: [".proc.md"], out: join(rebuild, "scopes", "PROC-procedures-scope.md"),
      label: "business-logic scope", script: "vb6-procs-to-scope.py --src pre-convert --out rebuild/scopes" },
    { suffixes: [".report.md"], out: join(rebuild, "scopes", "RPT-reports-stub.md"),
      label: "reports stub", script: "vb6-reports-to-stub.py --src pre-convert --out rebuild/scopes" },
  ];
  if (hasDataBinding) {
    aggregates.unshift({ suffixes: [".page.md", ".proc.md"], out: join(rebuild, "scopes", "QRY-queries-scope.md"),
      label: "queries scope", script: "vb6-queries-to-scope.py --src pre-convert --out rebuild/scopes" });
  }
  for (const a of aggregates) {
    const newest = newestOf(pre, a.suffixes);
    if (!newest) continue;
    const fix = `python <skill>/scripts/${a.script}`;
    if (!existsSync(a.out)) {
      findings.push({ kind: "missing", item: a.label, detail: `sources present but no ${rel(a.out)}`, action: fix });
    } else if (newest > mtime(a.out)) {
      findings.push({ kind: "stale", item: a.label, detail: `a source is newer than ${rel(a.out)}`, action: fix });
    }
  }

  // 3) Database: inferred from the bound Data controls — only expected when a form binds data.
  if (hasDataBinding) {
    const erFile = join(rebuild, "db", "ER-diagram.md");
    const sqlFiles = listByExt(join(rebuild, "db"), ".sql");
    const fix = "python <skill>/scripts/vb6-data-to-sql.py --dialect <db> --src pre-convert --out rebuild/db";
    if (!existsSync(erFile) && !sqlFiles.length) {
      findings.push({ kind: "missing", item: "database schema + ER", detail: "bound forms present but nothing in rebuild/db/", action: fix });
    } else if (existsSync(erFile) && newestOf(pre, [".controls.md", ".page.md"]) > mtime(erFile)) {
      findings.push({ kind: "stale", item: "database schema + ER", detail: `a form source is newer than ${rel(erFile)}`, action: fix });
    }
  }

  // 4) Orphaned forms: rebuild/pages/<X>.tsx with no pre-convert/<X>.page.md.
  for (const tsx of listByExt(pagesDir, ".tsx")) {
    const name = tsx.slice(0, -".tsx".length);
    if (!existsSync(join(pre, `${name}.page.md`))) {
      findings.push({
        kind: "orphaned",
        item: `rebuild/pages/${tsx}`,
        detail: "no matching pre-convert source (form renamed or removed?)",
        action: `delete rebuild/pages/${tsx}, or restore pre-convert/${name}.page.md`,
      });
    }
  }

  // 5) Elements dropped at split time.
  if (existsSync(join(pre, "_discarded.md"))) {
    findings.push({
      kind: "review",
      item: "pre-convert/_discarded.md",
      detail: "elements were not captured at split time",
      action: "open pre-convert/_discarded.md and decide whether any unmapped element should be kept",
    });
  }

  const lines = ["vbConversion review — pre-convert/ (source) vs rebuild/ (generated):", ""];
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
  lines.push(`${findings.length} item(s) need attention. Choose which to regenerate / keep / delete — nothing was changed.`);
  return { exitCode: 0, output: lines.join("\n") + "\n", actions: [], findings };
}

function defaultSkillsTemplatesDir(): string {
  const fromEnv = process.env.WXKANBAN_SCAFFOLD_TEMPLATES_DIR;
  if (fromEnv) return resolve(fromEnv, "skills");
  return findTemplatesDir(__dirname, "skills");
}
