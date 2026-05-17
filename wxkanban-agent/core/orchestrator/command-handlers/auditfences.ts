import { resolve } from "path";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { buildTaskIdIndex } from "../task-id-index";
import {
  AuditResult,
  scanTree,
  promoteWarningsToErrors,
  captureBaselineHashes,
} from "../auditfences-scanner";

export interface AuditFencesOptions {
  path?: string;
  format?: "text" | "json";
  strict?: boolean;
  baseline?: boolean;
  history?: string;
  specsRoot?: string;
  legacyFile?: string;
}

export interface AuditFencesHandlerResult {
  exitCode: 0 | 1 | 2;
  output: string;
  result?: AuditResult;
  baselineFile?: string;
}

const DEFAULT_LEGACY_FILE = ".wxai/auditfences-legacy.json";

export async function handleAuditFencesCommand(
  options: AuditFencesOptions,
): Promise<AuditFencesHandlerResult> {
  const root = resolve(process.cwd(), options.path ?? ".");
  const specsRoot = options.specsRoot
    ? resolve(process.cwd(), options.specsRoot)
    : resolve(process.cwd(), "specs");
  const legacyFile = resolve(
    process.cwd(),
    options.legacyFile ?? DEFAULT_LEGACY_FILE,
  );

  if (options.history) {
    return runHistory(options.history);
  }

  if (options.baseline) {
    return runBaseline(root, legacyFile);
  }

  const legacyHashes = loadLegacyHashes(legacyFile);
  const taskIndex = buildTaskIdIndex(specsRoot);
  let result = scanTree({ root, taskIndex, legacyHashes });
  if (options.strict) {
    result = promoteWarningsToErrors(result);
  }

  const output =
    options.format === "json"
      ? formatJson(result)
      : formatText(result);

  const exitCode = result.summary.errors > 0 ? 1 : 0;
  return { exitCode, output, result };
}

function runHistory(target: string): AuditFencesHandlerResult {
  const match = target.match(/^(\d{3})\/(T\d+)$/);
  if (!match) {
    return {
      exitCode: 2,
      output: `Invalid --history value '${target}'. Expected format: 026/T001`,
    };
  }
  return {
    exitCode: 0,
    output: `History lookup for ${target} requires DB access — not yet wired in this build (Phase 6 K-FR-2 brings the kit-migration applier online).`,
  };
}

function runBaseline(root: string, legacyFile: string): AuditFencesHandlerResult {
  const hashes = captureBaselineHashes({ root });
  const dir = legacyFile.replace(/[\\/][^\\/]*$/, "");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const payload = {
    capturedAt: new Date().toISOString(),
    files: Object.fromEntries(hashes),
  };
  writeFileSync(legacyFile, JSON.stringify(payload, null, 2));
  return {
    exitCode: 0,
    output: `Captured baseline for ${hashes.size} files → ${legacyFile}`,
    baselineFile: legacyFile,
  };
}

function loadLegacyHashes(legacyFile: string): Set<string> | undefined {
  if (!existsSync(legacyFile)) return undefined;
  try {
    const raw = readFileSync(legacyFile, "utf-8");
    const parsed = JSON.parse(raw) as { files?: Record<string, string> };
    if (!parsed.files) return undefined;
    return new Set(Object.values(parsed.files));
  } catch {
    return undefined;
  }
}

function formatText(result: AuditResult): string {
  const lines: string[] = [];
  for (const f of result.findings) {
    const loc = f.line ? `${f.file}:${f.line}` : f.file;
    lines.push(
      `${f.severity.toUpperCase().padEnd(7)} ${loc.padEnd(60)} ${f.code} — ${f.message}`,
    );
  }
  lines.push("");
  lines.push(
    `${result.summary.errors} errors, ${result.summary.warnings} warnings, ${result.summary.info} info  (${result.summary.fences} fences across ${result.summary.files} files)`,
  );
  if (Object.keys(result.perScope).length > 0) {
    lines.push("");
    lines.push("Per-scope counts:");
    for (const [scope, stat] of Object.entries(result.perScope)) {
      lines.push(`  ${scope}: ${stat.fences} fences`);
    }
  }
  return lines.join("\n");
}

function formatJson(result: AuditResult): string {
  return JSON.stringify(
    {
      summary: result.summary,
      findings: result.findings,
      perScope: result.perScope,
    },
    null,
    2,
  );
}

