#!/usr/bin/env node
// [SCOPE 051 / FR-012] Hardcoded user-facing string guardrail.
//
// Heuristic lint that flags likely-hardcoded user-facing strings in React (.tsx)
// so they don't bypass the i18n locale layer (spec 051). It reports:
//   - JSX text nodes with real words ( <p>Save changes</p> )
//   - common user-facing string props ( placeholder="...", title="...", aria-label="..." )
// not wrapped in t(...).
//
// Intended for TARGETED use on new/changed files (e.g. in a pre-commit hook or
// `node scripts/check-hardcoded-strings.mjs <files...>`), NOT a whole-repo gate —
// the app-wide string extraction (spec 052) is what clears the existing backlog.
// Exit 1 if any candidates are found, else 0.
//
// Usage:
//   node scripts/check-hardcoded-strings.mjs src/client/pages/Foo.tsx [...]
//   node scripts/check-hardcoded-strings.mjs            # scans staged .tsx (git)

import fs from "node:fs";
import { execSync } from "node:child_process";

const PROP_RE = /\b(placeholder|title|aria-label|alt)\s*=\s*"([^"{}]*[A-Za-z]{2,}[^"{}]*)"/g;
// JSX text between tags: > Some words < — letters, length >= 2, not all-caps consts.
const TEXT_RE = />\s*([A-Z][a-z][^<>{}]{1,80}?)\s*</g;

// Lines to ignore: imports, comments, t( usage already present, code-ish tokens.
function isIgnorable(line) {
  const l = line.trim();
  return (
    l.startsWith("//") ||
    l.startsWith("*") ||
    l.startsWith("import ") ||
    l.includes("t(") ||
    l.includes("eslint")
  );
}

function scanFile(file) {
  let src;
  try {
    src = fs.readFileSync(file, "utf-8");
  } catch {
    return [];
  }
  const findings = [];
  src.split("\n").forEach((line, i) => {
    if (isIgnorable(line)) return;
    for (const re of [PROP_RE, TEXT_RE]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        const text = (m[2] ?? m[1] ?? "").trim();
        if (text && /[A-Za-z]{2,}/.test(text) && !text.startsWith("http")) {
          findings.push({ file, line: i + 1, text });
        }
      }
    }
  });
  return findings;
}

function resolveFiles() {
  const args = process.argv.slice(2).filter((a) => a.endsWith(".tsx"));
  if (args.length) return args;
  try {
    const out = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf-8" });
    return out.split("\n").filter((f) => f.endsWith(".tsx"));
  } catch {
    return [];
  }
}

const files = resolveFiles();
if (!files.length) {
  console.log("check-hardcoded-strings: no .tsx files to scan.");
  process.exit(0);
}

const all = files.flatMap(scanFile);
if (!all.length) {
  console.log(`check-hardcoded-strings: clean (${files.length} file(s)).`);
  process.exit(0);
}

console.error(`check-hardcoded-strings: ${all.length} candidate hardcoded string(s):`);
for (const f of all) {
  console.error(`  ${f.file}:${f.line}  "${f.text}"`);
}
console.error("\nWrap user-facing strings with t(\"...\") (spec 051). False positive? Move the");
console.error("string to a const or add it to the en-US bundle and reference it via t().");
process.exit(1);
