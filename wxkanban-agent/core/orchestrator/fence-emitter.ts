import { extname } from "path";
import {
  buildFenceLine,
  getLanguageEntry,
  isSuppressed,
} from "./language-matrix";
import {
  detectTopLevelDeclarations,
  Declaration,
  UnitKind,
} from "./declaration-detector";
import { sha256 } from "./content-hash";

export const MAX_DESCRIPTION_LENGTH = 60;
export const FULL_REPLACEMENT_THRESHOLD = 0.8;
export const MODIFIED_BY_WARN_AT = 5;

export interface TaskFenceRow {
  id?: string;
  filepath: string;
  unitkind: UnitKind;
  unitname: string;
  ownerscope: string;
  ownertask: string;
  description: string;
  contenthash: string;
  linestart: number;
  lineend: number;
}

export interface FenceDbWrite {
  kind: "create" | "update" | "history" | "modification";
  payload: Record<string, unknown>;
}

export interface EmitFenceOptions {
  filepath: string;
  currentContent: string | null;
  proposedContent: string;
  ownerScope: string;
  ownerTask: string;
  description: string;
  existingFences: TaskFenceRow[];
  mode?: "auto" | "replace" | "modify";
}

export interface EmitFenceResult {
  content: string;
  dbWrites: FenceDbWrite[];
  warnings: string[];
  skipped: boolean;
}

interface ParsedFence {
  beginLineIdx: number;
  endLineIdx: number;
  ownerScope: string;
  ownerTask: string;
  description: string;
  modifiedBy: {
    scope: string;
    task: string;
    description: string;
    lineIdx: number;
  }[];
  bodyStartIdx: number;
  bodyEndIdx: number;
  replacesNote?: string;
}

const COMMENT_PREFIX = `(?:\\/\\/|--|<!--|#|\\/\\*|\\{\\/\\*)`;
const FENCE_BEGIN_RE = new RegExp(
  `^\\s*${COMMENT_PREFIX}\\s*\\[SCOPE\\s+(\\d{3})\\s*\\/\\s*(T\\d+)\\]\\s+BEGIN\\s+—\\s+(.+?)(?:\\s+\\(replaces\\s+(\\d{3})\\/(T\\d+)\\))?\\s*(?:\\*\\/|-->)?\\s*$`,
);
const FENCE_END_RE = new RegExp(
  `^\\s*${COMMENT_PREFIX}\\s*\\[SCOPE\\s+(\\d{3})\\s*\\/\\s*(T\\d+)\\]\\s+END\\s*(?:\\*\\/|-->)?\\s*$`,
);
const MODIFIED_BY_RE = new RegExp(
  `^\\s*${COMMENT_PREFIX}\\s*\\[SCOPE\\s+(\\d{3})\\s*\\/\\s*(T\\d+)\\]\\s+MODIFIED-BY\\s+—\\s+(.+?)\\s*(?:\\*\\/|-->)?\\s*$`,
);

export function truncateDescription(text: string): string {
  if (text.length <= MAX_DESCRIPTION_LENGTH) return text;
  return text.slice(0, MAX_DESCRIPTION_LENGTH - 1) + "…";
}

export function parseFences(
  source: string,
): { fences: ParsedFence[]; lines: string[] } {
  const lines = source.split(/\r?\n/);
  const fences: ParsedFence[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    const beginMatch = line.match(FENCE_BEGIN_RE);
    if (beginMatch) {
      const beginScope = beginMatch[1] ?? "";
      const beginTask = beginMatch[2] ?? "";
      const desc = (beginMatch[3] ?? "").trim();
      const replacesScope = beginMatch[4];
      const replacesTask = beginMatch[5];
      const modifiedBy: ParsedFence["modifiedBy"] = [];
      let j = i + 1;
      while (j < lines.length) {
        const sub = lines[j] ?? "";
        const modMatch = sub.match(MODIFIED_BY_RE);
        if (modMatch) {
          modifiedBy.push({
            scope: modMatch[1] ?? "",
            task: modMatch[2] ?? "",
            description: (modMatch[3] ?? "").trim(),
            lineIdx: j,
          });
          j++;
          continue;
        }
        break;
      }
      const bodyStart = j;
      let endIdx = -1;
      for (let k = bodyStart; k < lines.length; k++) {
        const sub = lines[k] ?? "";
        const endMatch = sub.match(FENCE_END_RE);
        if (
          endMatch &&
          endMatch[1] === beginScope &&
          endMatch[2] === beginTask
        ) {
          endIdx = k;
          break;
        }
      }
      if (endIdx === -1) {
        throw new MalformedFenceError(
          `BEGIN at line ${i + 1} for ${beginScope}/${beginTask} has no matching END`,
        );
      }
      fences.push({
        beginLineIdx: i,
        endLineIdx: endIdx,
        ownerScope: beginScope,
        ownerTask: beginTask,
        description: desc,
        modifiedBy,
        bodyStartIdx: bodyStart,
        bodyEndIdx: endIdx - 1,
        replacesNote:
          replacesScope && replacesTask
            ? `${replacesScope}/${replacesTask}`
            : undefined,
      });
      i = endIdx + 1;
      continue;
    }
    i++;
  }
  return { fences, lines };
}

export class MalformedFenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedFenceError";
  }
}

export class NoDetectableUnitError extends Error {
  constructor(filepath: string) {
    super(
      `Cannot emit fence for ${filepath}: no top-level declaration detected. Per FR-002, code must declare a fence-eligible unit (function, class, route, table, migration, or component).`,
    );
    this.name = "NoDetectableUnitError";
  }
}

function lineChangeRatio(
  oldBody: string[],
  newBody: string[],
): number {
  if (oldBody.length === 0 && newBody.length === 0) return 0;
  const oldSet = new Set(oldBody.map((l) => l.trimEnd()).filter((l) => l.length > 0));
  const newSet = new Set(newBody.map((l) => l.trimEnd()).filter((l) => l.length > 0));
  if (oldSet.size === 0 && newSet.size === 0) return 0;
  let unchanged = 0;
  for (const line of newSet) {
    if (oldSet.has(line)) unchanged++;
  }
  const total = Math.max(oldSet.size, newSet.size);
  if (total === 0) return 0;
  return 1 - unchanged / total;
}

function matchExistingFence(
  fences: ParsedFence[],
  decl: Declaration,
): ParsedFence | undefined {
  return fences.find((f) => {
    const baseDesc = f.description.split(" (replaces ")[0]?.trim() ?? "";
    return baseDesc.length > 0 && baseDesc.startsWith(decl.name.slice(0, 1));
  });
}

function findFenceCoveringRange(
  fences: ParsedFence[],
  startLine: number,
  endLine: number,
): ParsedFence | undefined {
  return fences.find(
    (f) =>
      f.beginLineIdx + 1 <= startLine && f.endLineIdx + 1 >= endLine,
  );
}

export function emitFence(opts: EmitFenceOptions): EmitFenceResult {
  const ext = extname(opts.filepath);
  if (isSuppressed(ext)) {
    return {
      content: opts.proposedContent,
      dbWrites: [],
      warnings: [],
      skipped: true,
    };
  }
  getLanguageEntry(ext);

  const description = truncateDescription(opts.description);
  const warnings: string[] = [];
  const dbWrites: FenceDbWrite[] = [];

  const decls = detectTopLevelDeclarations(opts.proposedContent, ext);
  if (decls.length === 0) {
    throw new NoDetectableUnitError(opts.filepath);
  }

  const proposedLines = opts.proposedContent.split(/\r?\n/);
  const proposedFences = parseFences(opts.proposedContent).fences;

  const outputLines = [...proposedLines];
  const insertions: { atLine: number; lines: string[] }[] = [];

  const sortedDecls = [...decls].sort((a, b) => b.startLine - a.startLine);

  for (const decl of sortedDecls) {
    const alreadyFenced = findFenceCoveringRange(
      proposedFences,
      decl.startLine,
      decl.endLine,
    );
    if (alreadyFenced) continue;

    const isJsxBody = ext === ".tsx" || ext === ".jsx";
    const inJsx = isJsxBody && isInsideJsx(proposedLines, decl.startLine - 1);

    const existing = matchPriorFence(opts.existingFences, decl);

    if (!existing) {
      const beginLine = buildFenceLine(
        ext,
        `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] BEGIN — ${description}`,
        inJsx,
      );
      const endLine = buildFenceLine(
        ext,
        `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] END`,
        inJsx,
      );
      insertions.push({ atLine: decl.endLine, lines: [endLine] });
      insertions.push({ atLine: decl.startLine - 1, lines: [beginLine] });

      const bodyHash = sha256(
        proposedLines.slice(decl.startLine - 1, decl.endLine).join("\n"),
      );
      dbWrites.push({
        kind: "create",
        payload: {
          filepath: opts.filepath,
          unitkind: decl.kind,
          unitname: decl.name,
          ownerscope: opts.ownerScope,
          ownertask: opts.ownerTask,
          description,
          contenthash: bodyHash,
          linestart: decl.startLine,
          lineend: decl.endLine,
        },
      });
      continue;
    }

    const newBody = proposedLines.slice(decl.startLine - 1, decl.endLine);
    const oldBody = (opts.currentContent ?? "")
      .split(/\r?\n/)
      .slice(existing.linestart - 1, existing.lineend);
    const ratio = lineChangeRatio(oldBody, newBody);
    const mode = opts.mode ?? "auto";
    const decision =
      mode === "replace"
        ? "replace"
        : mode === "modify"
        ? "modify"
        : ratio >= FULL_REPLACEMENT_THRESHOLD
        ? "replace"
        : "modify";

    if (decision === "replace") {
      const suffix = ` (replaces ${existing.ownerscope}/${existing.ownertask})`;
      const beginLine = buildFenceLine(
        ext,
        `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] BEGIN — ${description}${suffix}`,
        inJsx,
      );
      const endLine = buildFenceLine(
        ext,
        `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] END`,
        inJsx,
      );
      insertions.push({ atLine: decl.endLine, lines: [endLine] });
      insertions.push({ atLine: decl.startLine - 1, lines: [beginLine] });

      const newHash = sha256(newBody.join("\n"));
      dbWrites.push({
        kind: "history",
        payload: {
          filepath: opts.filepath,
          unitkind: decl.kind,
          unitname: decl.name,
          priorownerscope: existing.ownerscope,
          priorownertask: existing.ownertask,
          replacedbyscope: opts.ownerScope,
          replacedbytask: opts.ownerTask,
        },
      });
      dbWrites.push({
        kind: "update",
        payload: {
          previousId: existing.id,
          filepath: opts.filepath,
          unitkind: decl.kind,
          unitname: decl.name,
          ownerscope: opts.ownerScope,
          ownertask: opts.ownerTask,
          description,
          contenthash: newHash,
          linestart: decl.startLine,
          lineend: decl.endLine,
        },
      });
    } else {
      const modifiedByLine = buildFenceLine(
        ext,
        `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] MODIFIED-BY — ${description}`,
        inJsx,
      );
      const beginLine = buildFenceLine(
        ext,
        `[SCOPE ${existing.ownerscope} / ${existing.ownertask}] BEGIN — ${existing.description}`,
        inJsx,
      );
      const endLine = buildFenceLine(
        ext,
        `[SCOPE ${existing.ownerscope} / ${existing.ownertask}] END`,
        inJsx,
      );
      insertions.push({ atLine: decl.endLine, lines: [endLine] });
      insertions.push({
        atLine: decl.startLine - 1,
        lines: [beginLine, modifiedByLine],
      });

      const newHash = sha256(newBody.join("\n"));
      const oldHash = sha256(oldBody.join("\n"));
      const priorModificationCount = countPriorModifications(
        opts.existingFences,
        existing.id,
      );
      if (priorModificationCount + 1 > MODIFIED_BY_WARN_AT) {
        warnings.push(
          `Fence ${existing.ownerscope}/${existing.ownertask} for ${decl.name} now has ${priorModificationCount + 1} MODIFIED-BY entries (> ${MODIFIED_BY_WARN_AT}); consider refactor.`,
        );
      }
      dbWrites.push({
        kind: "modification",
        payload: {
          taskfenceid: existing.id,
          modifierscope: opts.ownerScope,
          modifiertask: opts.ownerTask,
          description,
          contenthashbefore: oldHash,
          contenthashafter: newHash,
        },
      });
      dbWrites.push({
        kind: "update",
        payload: {
          previousId: existing.id,
          filepath: opts.filepath,
          unitkind: decl.kind,
          unitname: decl.name,
          ownerscope: existing.ownerscope,
          ownertask: existing.ownertask,
          description: existing.description,
          contenthash: newHash,
          linestart: decl.startLine,
          lineend: decl.endLine,
        },
      });
    }
  }

  insertions.sort((a, b) => b.atLine - a.atLine);
  for (const ins of insertions) {
    outputLines.splice(ins.atLine, 0, ...ins.lines);
  }

  return {
    content: outputLines.join("\n"),
    dbWrites,
    warnings,
    skipped: false,
  };
}

function isInsideJsx(lines: string[], idx: number): boolean {
  for (let i = idx - 1; i >= 0; i--) {
    const line = lines[i] ?? "";
    if (/return\s*\(/.test(line) || /<[A-Z][\w]*/.test(line)) return true;
    if (/^\s*}/.test(line) || /^\s*\)/.test(line)) return false;
  }
  return false;
}

function matchPriorFence(
  fences: TaskFenceRow[],
  decl: Declaration,
): TaskFenceRow | undefined {
  return fences.find(
    (f) => f.unitkind === decl.kind && f.unitname === decl.name,
  );
}

function countPriorModifications(
  fences: TaskFenceRow[],
  fenceId: string | undefined,
): number {
  if (!fenceId) return 0;
  return 0;
}
