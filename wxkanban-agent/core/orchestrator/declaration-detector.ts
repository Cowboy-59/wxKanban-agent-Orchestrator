import { getLanguageEntry, isSuppressed } from "./language-matrix";

export type UnitKind =
  | "function"
  | "class"
  | "route"
  | "table"
  | "migration"
  | "component";

export interface Declaration {
  kind: UnitKind;
  name: string;
  startLine: number;
  endLine: number;
}

const TS_FUNCTION_RE =
  /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\*\s*)?([A-Za-z_$][\w$]*)\s*[<(]/;
const TS_EXPORTED_CONST_FN_RE =
  /^export\s+(?:default\s+|const\s+|let\s+|var\s+)([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/;
const TS_CLASS_RE =
  /^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/;
const TS_ROUTE_RE =
  /^(?:\s*)((?:app|router)\.(?:get|post|put|patch|delete|all|use))\s*\(\s*["'`]([^"'`]+)["'`]/;
const TS_PG_TABLE_RE =
  /^export\s+const\s+([A-Za-z_$][\w$]*)\s*=\s*pgTable\s*\(/;

const REACT_FN_COMPONENT_RE =
  /^(?:export\s+(?:default\s+)?)?(?:const\s+|let\s+|var\s+)([A-Z][\w$]*)\s*(?::[^=]+)?=\s*(?:React\.)?(?:forwardRef|memo|\([^)]*\)\s*=>|function)/;

function detectTypeScriptDeclarations(source: string): Declaration[] {
  const lines = source.split(/\r?\n/);
  const decls: Declaration[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";

    const fnMatch = line.match(TS_FUNCTION_RE);
    if (fnMatch && fnMatch[2]) {
      const startsAt = findDeclarationStart(lines, i);
      const endsAt = findBlockEnd(lines, i);
      decls.push({
        kind: looksLikeReactComponent(fnMatch[2], source)
          ? "component"
          : "function",
        name: fnMatch[2],
        startLine: startsAt + 1,
        endLine: endsAt + 1,
      });
      i = endsAt;
      continue;
    }

    const arrowFnMatch = line.match(TS_EXPORTED_CONST_FN_RE);
    if (arrowFnMatch && arrowFnMatch[1]) {
      const reactMatch = line.match(REACT_FN_COMPONENT_RE);
      const startsAt = findDeclarationStart(lines, i);
      const endsAt = findStatementEnd(lines, i);
      decls.push({
        kind: reactMatch ? "component" : "function",
        name: arrowFnMatch[1],
        startLine: startsAt + 1,
        endLine: endsAt + 1,
      });
      i = endsAt;
      continue;
    }

    const classMatch = line.match(TS_CLASS_RE);
    if (classMatch && classMatch[1]) {
      const startsAt = findDeclarationStart(lines, i);
      const endsAt = findBlockEnd(lines, i);
      decls.push({
        kind: /^[A-Z]/.test(classMatch[1]) && looksLikeReactClassComponent(lines, i)
          ? "component"
          : "class",
        name: classMatch[1],
        startLine: startsAt + 1,
        endLine: endsAt + 1,
      });
      i = endsAt;
      continue;
    }

    const pgTableMatch = line.match(TS_PG_TABLE_RE);
    if (pgTableMatch && pgTableMatch[1]) {
      const startsAt = findDeclarationStart(lines, i);
      const endsAt = findStatementEnd(lines, i);
      decls.push({
        kind: "table",
        name: pgTableMatch[1],
        startLine: startsAt + 1,
        endLine: endsAt + 1,
      });
      i = endsAt;
      continue;
    }

    const routeMatch = line.match(TS_ROUTE_RE);
    if (routeMatch) {
      const startsAt = findDeclarationStart(lines, i);
      const endsAt = findStatementEnd(lines, i);
      decls.push({
        kind: "route",
        name: `${routeMatch[1]} ${routeMatch[2]}`,
        startLine: startsAt + 1,
        endLine: endsAt + 1,
      });
      i = endsAt;
      continue;
    }
  }

  return decls;
}

function looksLikeReactComponent(name: string, source: string): boolean {
  if (!/^[A-Z]/.test(name)) return false;
  if (source.includes("return <") || source.includes("return (")) return true;
  return /\bJSX\.|React\./.test(source);
}

function looksLikeReactClassComponent(lines: string[], startIdx: number): boolean {
  const start = lines[startIdx] ?? "";
  return /extends\s+(?:React\.)?Component\b/.test(start);
}

function findDeclarationStart(lines: string[], idx: number): number {
  let i = idx - 1;
  while (i >= 0) {
    const prev = (lines[i] ?? "").trim();
    if (prev.length === 0) return idx;
    if (prev.startsWith("//") || prev.startsWith("/*") || prev.startsWith("*")) {
      i--;
      continue;
    }
    return idx;
  }
  return idx;
}

function findBlockEnd(lines: string[], startIdx: number): number {
  let depth = 0;
  let seenOpen = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "{") {
        depth++;
        seenOpen = true;
      } else if (ch === "}") {
        depth--;
        if (seenOpen && depth === 0) return i;
      }
    }
  }
  return lines.length - 1;
}

function findStatementEnd(lines: string[], startIdx: number): number {
  let parenDepth = 0;
  let braceDepth = 0;
  let seenAny = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i] ?? "";
    for (const ch of line) {
      if (ch === "(") {
        parenDepth++;
        seenAny = true;
      } else if (ch === ")") {
        parenDepth--;
      } else if (ch === "{") {
        braceDepth++;
        seenAny = true;
      } else if (ch === "}") {
        braceDepth--;
      }
    }
    if (seenAny && parenDepth <= 0 && braceDepth <= 0) {
      if (line.includes(";") || line.trim().endsWith(")") || line.trim().endsWith("}")) {
        return i;
      }
    }
  }
  return lines.length - 1;
}

function detectSqlMigration(source: string): Declaration[] {
  const lines = source.split(/\r?\n/);
  if (lines.length === 0) return [];
  let firstNonBlank = 0;
  while (firstNonBlank < lines.length && (lines[firstNonBlank] ?? "").trim() === "") {
    firstNonBlank++;
  }
  let lastNonBlank = lines.length - 1;
  while (lastNonBlank > firstNonBlank && (lines[lastNonBlank] ?? "").trim() === "") {
    lastNonBlank--;
  }
  if (firstNonBlank > lastNonBlank) return [];
  return [
    {
      kind: "migration",
      name: "migration",
      startLine: firstNonBlank + 1,
      endLine: lastNonBlank + 1,
    },
  ];
}

export function detectTopLevelDeclarations(
  source: string,
  extension: string,
): Declaration[] {
  if (isSuppressed(extension)) return [];
  getLanguageEntry(extension);
  const ext = extension.toLowerCase();
  if ([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].includes(ext)) {
    return detectTypeScriptDeclarations(source);
  }
  if (ext === ".sql") {
    return detectSqlMigration(source);
  }
  return [];
}
