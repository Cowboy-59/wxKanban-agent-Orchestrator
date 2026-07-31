import { readdirSync, readFileSync, statSync } from "fs";
import { join, extname, relative } from "path";
import { LANGUAGE_MATRIX, isSuppressed } from "./language-matrix";
import {
  parseFences,
  MalformedFenceError,
  MODIFIED_BY_WARN_AT,
} from "./fence-emitter";
import { detectTopLevelDeclarations } from "./declaration-detector";
import { TaskIdIndex, taskExists } from "./task-id-index";
import { sha256 } from "./content-hash";

export type Severity = "error" | "warning" | "info";

export interface Finding {
  severity: Severity;
  code: string;
  file: string;
  line?: number;
  message: string;
  scope?: string;
  task?: string;
}

export interface AuditSummary {
  files: number;
  fences: number;
  errors: number;
  warnings: number;
  info: number;
}

export interface AuditResult {
  summary: AuditSummary;
  findings: Finding[];
  perScope: Record<string, { fences: number; tasks: Record<string, number> }>;
}

export interface ScanOptions {
  root: string;
  taskIndex: TaskIdIndex;
  legacyHashes?: Set<string>;
  ignoreDirs?: Set<string>;
  /**
   * [SCOPE 118 / T001] Consult `.gitignore` as well as DEFAULT_IGNORE.
   * Defaults to true; set false to restore the pre-118 filesystem-only walk.
   */
  respectGitignore?: boolean;
}

import { loadGitignore, type GitignoreMatcher } from "./gitignore-matcher";

const DEFAULT_IGNORE = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  ".cache",
  "drizzle",
  "src/db/migrations",
  ".wxai",
  // [SCOPE 081 / T004] Skill-bundled scripts (.claude/skills/**) are tooling, not
  // spec-traceable code units — exempt from fencing like JSON. Without this, a
  // shipped JS skill script (e.g. dev-plan's build-devplan-pdf.mjs) would trip
  // every consumer's `auditfences --strict`.
  ".claude/skills",
]);

export function scanTree(opts: ScanOptions): AuditResult {
  const findings: Finding[] = [];
  const perScope: AuditResult["perScope"] = {};
  let fileCount = 0;
  let fenceCount = 0;

  const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignoreDirs ?? [])]);
  const root = opts.root;

  // [SCOPE 118 / T001] Honour .gitignore in addition to DEFAULT_IGNORE. The
  // scanner walks the filesystem, so without this it audits directories git
  // was told to ignore — 885 of 1,893 errors on wxKanban came from installed
  // Claude skills and VS Code local history. DEFAULT_IGNORE remains the floor,
  // so a project with no .gitignore behaves exactly as before.
  const gitignore = opts.respectGitignore === false ? null : loadGitignore(root);

  walk(root, root, ignore, gitignore, (absPath, relPath) => {
    const ext = extname(absPath).toLowerCase();
    const entry = LANGUAGE_MATRIX[ext];
    if (!entry) return;
    if (entry.suppressed) return;

    fileCount++;
    let body: string;
    try {
      body = readFileSync(absPath, "utf-8");
    } catch {
      return;
    }

    const legacyHash = sha256(body);
    const isLegacy = opts.legacyHashes?.has(legacyHash) ?? false;

    const parseBody = ext === ".md" ? stripMarkdownCodeBlocks(body) : body;

    let parsed;
    try {
      parsed = parseFences(parseBody);
    } catch (err) {
      if (err instanceof MalformedFenceError) {
        findings.push({
          severity: "error",
          code: "MALFORMED_FENCE",
          file: relPath,
          message: err.message,
        });
        return;
      }
      throw err;
    }

    for (const fence of parsed.fences) {
      fenceCount++;
      const scopeKey = fence.ownerScope;
      const scopeStat = perScope[scopeKey] ?? { fences: 0, tasks: {} };
      scopeStat.fences++;
      scopeStat.tasks[fence.ownerTask] =
        (scopeStat.tasks[fence.ownerTask] ?? 0) + 1;
      perScope[scopeKey] = scopeStat;

      if (!taskExists(opts.taskIndex, fence.ownerScope, fence.ownerTask)) {
        // [SCOPE 118 / T003] A fence citing an unresolvable task is a BROKEN
        // REFERENCE, not a missing fence — the code is fenced, the label is
        // wrong. The remedy differs (correct the label or restore the spec,
        // rather than add a fence), so it is reported as a warning pending
        // triage and is exempt from --strict promotion.
        findings.push({
          severity: "warning",
          code: "UNKNOWN_TASK",
          file: relPath,
          line: fence.beginLineIdx + 1,
          message: `fence references unknown task: ${fence.ownerScope}/${fence.ownerTask} — broken reference, not a missing fence: correct the label or restore the spec`,
          scope: fence.ownerScope,
          task: fence.ownerTask,
        });
      }

      for (const mod of fence.modifiedBy) {
        if (!taskExists(opts.taskIndex, mod.scope, mod.task)) {
          findings.push({
            severity: "warning",
            code: "UNKNOWN_MODIFIER_TASK",
            file: relPath,
            line: mod.lineIdx + 1,
            message: `MODIFIED-BY references unknown task: ${mod.scope}/${mod.task}`,
            scope: mod.scope,
            task: mod.task,
          });
        }
      }

      if (fence.modifiedBy.length > MODIFIED_BY_WARN_AT) {
        findings.push({
          severity: "warning",
          code: "TOO_MANY_MODIFIERS",
          file: relPath,
          line: fence.beginLineIdx + 1,
          message: `fence has ${fence.modifiedBy.length} MODIFIED-BY entries (> ${MODIFIED_BY_WARN_AT}); consider refactor`,
          scope: fence.ownerScope,
          task: fence.ownerTask,
        });
      }
    }

    let decls;
    try {
      decls = detectTopLevelDeclarations(body, ext);
    } catch {
      return;
    }
    for (const decl of decls) {
      const enclosing = parsed.fences.find(
        (f) =>
          f.beginLineIdx + 1 <= decl.startLine &&
          f.endLineIdx + 1 >= decl.endLine,
      );
      if (enclosing) continue;
      if (isLegacy) {
        findings.push({
          severity: "info",
          code: "LEGACY_UNFENCED",
          file: relPath,
          line: decl.startLine,
          message: `legacy un-fenced ${decl.kind}: ${decl.name}`,
        });
      } else {
        findings.push({
          severity: "error",
          code: "UNFENCED_DECL",
          file: relPath,
          line: decl.startLine,
          message: `un-fenced top-level declaration: ${decl.kind} ${decl.name}`,
        });
      }
    }
  });

  const summary: AuditSummary = {
    files: fileCount,
    fences: fenceCount,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };

  return { summary, findings, perScope };
}

function walk(
  root: string,
  current: string,
  ignore: Set<string>,
  gitignore: GitignoreMatcher | null,
  visit: (abs: string, rel: string) => void,
): void {
  let entries: string[];
  try {
    entries = readdirSync(current);
  } catch {
    return;
  }
  for (const name of entries) {
    const abs = join(current, name);
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (shouldIgnore(rel, ignore, name)) continue;
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    // [SCOPE 118 / T001] Skip anything git ignores. Checked after statSync
    // because directory-only patterns (`foo/`) need to know which it is.
    if (gitignore && gitignore.ignores(rel, st.isDirectory())) continue;
    if (st.isDirectory()) {
      walk(root, abs, ignore, gitignore, visit);
    } else if (st.isFile()) {
      visit(abs, rel);
    }
  }
}

function shouldIgnore(
  rel: string,
  ignore: Set<string>,
  basename: string,
): boolean {
  if (ignore.has(basename)) return true;
  for (const pattern of ignore) {
    if (!pattern.includes("/")) continue;
    if (rel === pattern || rel.startsWith(pattern + "/")) return true;
  }
  return false;
}

function stripMarkdownCodeBlocks(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    if (inFence) {
      out.push("");
      continue;
    }
    // CommonMark indented code blocks: 4+ leading spaces or a tab.
    if (/^(?:    |\t)/.test(line)) {
      out.push("");
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * [SCOPE 118 / T003] Findings exempt from --strict promotion.
 *
 * These are broken fence references, not missing fences. The code IS fenced;
 * the label points at a task that no longer resolves. Triage is deferred
 * (SCOPE-118 open question 1), and holding the gate red on them would defeat
 * the gate's purpose without fixing anything.
 */
const DEFERRED_CODES = new Set(["UNKNOWN_TASK", "UNKNOWN_MODIFIER_TASK"]);

export function promoteWarningsToErrors(result: AuditResult): AuditResult {
  const findings = result.findings.map((f) =>
    f.severity === "warning" && !DEFERRED_CODES.has(f.code)
      ? { ...f, severity: "error" as const }
      : f,
  );
  const summary: AuditSummary = {
    ...result.summary,
    errors: findings.filter((f) => f.severity === "error").length,
    warnings: findings.filter((f) => f.severity === "warning").length,
  };
  return { ...result, findings, summary };
}

export function captureBaselineHashes(opts: {
  root: string;
  ignoreDirs?: Set<string>;
  respectGitignore?: boolean;
}): Map<string, string> {
  const out = new Map<string, string>();
  const ignore = new Set([...DEFAULT_IGNORE, ...(opts.ignoreDirs ?? [])]);
  // [SCOPE 118 / T001] Baseline capture must use the same walk boundary as the
  // scan, or the baseline records files the scanner will never look at.
  const gitignore =
    opts.respectGitignore === false ? null : loadGitignore(opts.root);
  walk(opts.root, opts.root, ignore, gitignore, (abs, rel) => {
    const ext = extname(abs).toLowerCase();
    const entry = LANGUAGE_MATRIX[ext];
    if (!entry || entry.suppressed) return;
    try {
      const body = readFileSync(abs, "utf-8");
      out.set(rel, sha256(body));
    } catch {
      // skip
    }
  });
  return out;
}
