#!/usr/bin/env node
/**
 * inventory-functions.mjs — deterministic callable-unit inventory for the test-sweep skill.
 *
 * Walks the TypeScript AST of a source tree and emits every unit a test could target:
 * exported functions, exported const arrow functions, class methods, internal helpers, and —
 * critically for this codebase — `server.registerTool(...)` handlers that live inside closures
 * and are therefore invisible to a grep for `export function`.
 *
 * Usage:
 *   node inventory-functions.mjs --root app [--out app/tests/inventory.json] [--md app/tests/INVENTORY.md]
 *
 * Options:
 *   --root <dir>   package or source dir to scan (scans <root>/src and <root>/scripts if present,
 *                  otherwise <root> itself). Default: app
 *   --out <file>   JSON output path. Default: <root>/tests/inventory.json
 *   --md <file>    Markdown output path. Omit to skip.
 *   --quiet        suppress the stdout summary
 *
 * Resolves `typescript` from the target package first, then this repo's root.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------- args

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const repoRoot = process.cwd();
const rootArg = arg('root', 'app');
const root = resolve(repoRoot, rootArg);
if (!existsSync(root)) {
  console.error(`inventory: --root "${rootArg}" does not exist (resolved to ${root})`);
  process.exit(1);
}
const outJson = resolve(repoRoot, arg('out', join(rootArg, 'tests', 'inventory.json')));
const outMd = arg('md') ? resolve(repoRoot, arg('md')) : null;
const quiet = flag('quiet');

// ---------------------------------------------------------------------------- typescript

const ts = await loadTypeScript(root, repoRoot);

async function loadTypeScript(...from) {
  for (const base of from) {
    try {
      const req = createRequire(join(base, 'package.json'));
      return (await import(pathToFileURL(req.resolve('typescript')).href)).default;
    } catch {
      /* try next */
    }
  }
  console.error(
    'inventory: could not resolve the "typescript" package.\n' +
      'Install it in the target package (cd app && npm i -D typescript) and re-run.',
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------- file walk

const SKIP_DIRS = new Set(['node_modules', 'dist', 'drizzle-out', '.git', 'coverage', '__pycache__']);
const SKIP_FILE = /\.(test|spec|d)\.ts$/;

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (/\.(ts|mts|tsx)$/.test(entry) && !SKIP_FILE.test(entry)) acc.push(full);
  }
  return acc;
}

const scanDirs = ['src', 'scripts'].map((d) => join(root, d)).filter(existsSync);
const files = (scanDirs.length ? scanDirs : [root]).flatMap((d) => walk(d)).sort();

// ---------------------------------------------------------------------------- classification

/** Dependency tags, matched against a unit's body text. Order is cosmetic only. */
const DEP_PATTERNS = [
  ['gpmgt-db', /\bdb\s*\.\s*(select|insert|update|delete|query|execute|transaction)\b|\bdrizzle\b/],
  ['gpmgt-db-raw', /\bpool\s*\.\s*query\b|\bsql`/],
  ['pace', /getPaceClient|setPaceClient|\bpace\s*\.|EpaceDb|PaceSoap|RealPaceClient/],
  ['soap', /PaceSoap|soapRequest|<soap|envelope/i],
  ['auth', /requireRole|currentPrincipal|\bPrincipal\b/],
  ['audit', /\baudit\s*\(/],
  ['secrets', /resolveSecret|secretFn|SecretProvider|getSecretProvider/],
  ['tls', /buildTlsOptions|resolveSslMode|rejectUnauthorized|PGSSL/],
  ['env', /process\.env|\benv\s*\./],
  ['fs', /readFileSync|writeFileSync|existsSync|mkdirSync/],
  ['net', /\bfetch\s*\(|https?\.request|axios/],
  ['clock', /new Date\b|Date\.now|toISOString/],
  ['logger', /\blogger\s*\./],
  ['zod', /\bz\s*\./],
];

/** Anything here means the unit can change state somewhere — always HIGH risk. */
const MUTATION = /\bdb\s*\.\s*(insert|update|delete)\b|\bpool\s*\.\s*query\s*\(\s*[`'"]\s*(insert|update|delete)|\b(update|delete|complete|clear|fixup|set|push|create|revoke)[A-Z]\w*\s*\(/;

/** Security-sensitive surface — HIGH risk even when read-only. */
const SECURITY = /secret|credential|password|token|tls|ssl|certificate|requireRole|principal|authoriz|authent/i;

function tagsFor(text) {
  return DEP_PATTERNS.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

function riskFor({ text, name, deps, mutates }) {
  if (mutates) return 'HIGH';
  if (SECURITY.test(name) || SECURITY.test(text)) return 'HIGH';
  if (deps.some((d) => ['secrets', 'tls', 'auth', 'pace', 'soap', 'net'].includes(d))) return 'HIGH';
  if (deps.some((d) => ['gpmgt-db', 'gpmgt-db-raw', 'audit', 'fs', 'env'].includes(d))) return 'MEDIUM';
  return 'LOW';
}

// ---------------------------------------------------------------------------- AST helpers

function docFor(sf, node) {
  const ranges = ts.getLeadingCommentRanges(sf.text, node.pos) || [];
  const last = ranges[ranges.length - 1];
  if (!last) return '';
  return sf.text
    .slice(last.pos, last.end)
    .replace(/^\/\*\*?|\*\/$|^\/\//gm, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\*?\s?/, '').trim())
    .filter(Boolean)[0] || '';
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

function signatureOf(sf, node) {
  const params = (node.parameters || [])
    .map((p) => p.getText(sf).replace(/\s+/g, ' '))
    .join(', ');
  const ret = node.type ? `: ${node.type.getText(sf).replace(/\s+/g, ' ')}` : '';
  const asyncKw = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  return `${asyncKw}(${params})${ret}`.slice(0, 300);
}

const isExported = (node) =>
  !!node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

/** Extract literal string keys from an object-literal property (used for a tool's inputSchema). */
function objectKeys(sf, objLiteral) {
  if (!objLiteral || !ts.isObjectLiteralExpression(objLiteral)) return [];
  return objLiteral.properties
    .map((p) => (p.name ? p.name.getText(sf).replace(/['"]/g, '') : null))
    .filter(Boolean);
}

function stringProp(sf, objLiteral, key) {
  if (!objLiteral || !ts.isObjectLiteralExpression(objLiteral)) return '';
  const prop = objLiteral.properties.find((p) => p.name?.getText(sf).replace(/['"]/g, '') === key);
  if (!prop || !prop.initializer) return '';
  const t = prop.initializer.getText(sf);
  return /^['"`]/.test(t) ? t.slice(1, -1).replace(/\s+/g, ' ').slice(0, 240) : '';
}

// ---------------------------------------------------------------------------- extraction

const units = [];
const seenIds = new Set();

function push(unit) {
  let id = unit.id;
  let n = 2;
  while (seenIds.has(id)) id = `${unit.id}#${n++}`;
  seenIds.add(id);
  units.push({ ...unit, id });
}

for (const file of files) {
  const rel = relative(repoRoot, file).replace(/\\/g, '/');
  const source = readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, /* setParentNodes */ true);

  const visit = (node, enclosing) => {
    // --- MCP registrations: server.registerTool('name', {config}, handler)
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^register(Tool|Resource|Prompt)$/.test(node.expression.name.text)
    ) {
      const kindWord = node.expression.name.text.replace('register', '').toLowerCase();
      const [nameArg, configArg] = node.arguments;
      const toolName =
        nameArg && ts.isStringLiteralLike(nameArg) ? nameArg.text : `<dynamic@${lineOf(sf, node)}>`;
      const text = node.getText(sf);
      const deps = tagsFor(text);
      const mutates = MUTATION.test(text);
      const schemaProp = configArg?.properties?.find(
        (p) => p.name?.getText(sf).replace(/['"]/g, '') === 'inputSchema',
      );
      push({
        id: `${kindWord}:${toolName}`,
        file: rel,
        line: lineOf(sf, node),
        name: toolName,
        kind: `mcp-${kindWord}`,
        exported: true, // reachable over the protocol
        registeredBy: enclosing || null,
        signature: `inputSchema { ${objectKeys(sf, schemaProp?.initializer).join(', ')} }`,
        inputs: objectKeys(sf, schemaProp?.initializer),
        title: stringProp(sf, configArg, 'title'),
        doc: stringProp(sf, configArg, 'description'),
        deps,
        mutates,
        risk: riskFor({ text, name: toolName, deps, mutates }),
        loc: text.split('\n').length,
      });
    }

    // --- function declarations (exported and internal)
    if (ts.isFunctionDeclaration(node) && node.name) {
      const text = node.getText(sf);
      const deps = tagsFor(text);
      const mutates = MUTATION.test(text);
      const exported = isExported(node);
      push({
        id: `fn:${node.name.text}`,
        file: rel,
        line: lineOf(sf, node),
        name: node.name.text,
        kind: exported ? 'exported-function' : 'internal-function',
        exported,
        signature: signatureOf(sf, node),
        doc: docFor(sf, node),
        deps,
        mutates,
        risk: riskFor({ text, name: node.name.text, deps, mutates }),
        loc: text.split('\n').length,
      });
      node.body && ts.forEachChild(node.body, (c) => visit(c, node.name.text));
      return;
    }

    // --- exported const arrow / function expressions, and exported const objects of methods
    if (ts.isVariableStatement(node) && isExported(node)) {
      for (const decl of node.declarationList.declarations) {
        const init = decl.initializer;
        if (!init || !decl.name) continue;
        const baseName = decl.name.getText(sf);
        if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          const text = init.getText(sf);
          const deps = tagsFor(text);
          const mutates = MUTATION.test(text);
          push({
            id: `fn:${baseName}`,
            file: rel,
            line: lineOf(sf, decl),
            name: baseName,
            kind: 'exported-const-fn',
            exported: true,
            signature: signatureOf(sf, init),
            doc: docFor(sf, node),
            deps,
            mutates,
            risk: riskFor({ text, name: baseName, deps, mutates }),
            loc: text.split('\n').length,
          });
        } else if (ts.isObjectLiteralExpression(init)) {
          // e.g. `export const logger = { info(...) {...}, warn(...) {...} }`
          for (const prop of init.properties) {
            const isFn =
              ts.isMethodDeclaration(prop) ||
              (ts.isPropertyAssignment(prop) &&
                (ts.isArrowFunction(prop.initializer) || ts.isFunctionExpression(prop.initializer)));
            if (!isFn) continue;
            const fnNode = ts.isMethodDeclaration(prop) ? prop : prop.initializer;
            const member = prop.name.getText(sf).replace(/['"]/g, '');
            const text = fnNode.getText(sf);
            const deps = tagsFor(text);
            const mutates = MUTATION.test(text);
            push({
              id: `member:${baseName}.${member}`,
              file: rel,
              line: lineOf(sf, prop),
              name: `${baseName}.${member}`,
              kind: 'object-member-fn',
              exported: true,
              signature: signatureOf(sf, fnNode),
              doc: docFor(sf, prop),
              deps,
              mutates,
              risk: riskFor({ text, name: member, deps, mutates }),
              loc: text.split('\n').length,
            });
          }
        }
      }
    }

    // --- classes: every method + constructor
    if (ts.isClassDeclaration(node) && node.name) {
      const cls = node.name.text;
      const clsExported = isExported(node);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) && !ts.isConstructorDeclaration(member)) continue;
        const mName = ts.isConstructorDeclaration(member)
          ? 'constructor'
          : member.name.getText(sf).replace(/['"]/g, '');
        const isPrivate = member.modifiers?.some(
          (m) => m.kind === ts.SyntaxKind.PrivateKeyword,
        );
        const text = member.getText(sf);
        const deps = tagsFor(text);
        const mutates = MUTATION.test(text);
        push({
          id: `method:${cls}.${mName}`,
          file: rel,
          line: lineOf(sf, member),
          name: `${cls}.${mName}`,
          kind: 'class-method',
          exported: clsExported && !isPrivate,
          visibility: isPrivate ? 'private' : 'public',
          signature: signatureOf(sf, member),
          doc: docFor(sf, member),
          deps,
          mutates,
          risk: riskFor({ text, name: `${cls}.${mName}`, deps, mutates }),
          loc: text.split('\n').length,
        });
      }
    }

    ts.forEachChild(node, (c) => visit(c, enclosing));
  };

  ts.forEachChild(sf, (n) => visit(n, null));
}

// ---------------------------------------------------------------------------- output

const tally = (key) =>
  units.reduce((acc, u) => {
    const k = u[key] ?? 'none';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

const depTally = units
  .flatMap((u) => u.deps)
  .reduce((acc, d) => ((acc[d] = (acc[d] || 0) + 1), acc), {});

const RISK_ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
units.sort(
  (a, b) =>
    RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.file.localeCompare(b.file) || a.line - b.line,
);

const report = {
  generatedFor: rootArg,
  scanned: { dirs: scanDirs.map((d) => relative(repoRoot, d).replace(/\\/g, '/')), files: files.length },
  totals: {
    units: units.length,
    byKind: tally('kind'),
    byRisk: tally('risk'),
    mutating: units.filter((u) => u.mutates).length,
    byDependency: depTally,
  },
  units,
};

mkdirSync(dirname(outJson), { recursive: true });
writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n', 'utf8');

if (outMd) {
  const rows = [];
  rows.push('# Callable-unit inventory', '');
  rows.push(`Generated by \`test-sweep/scripts/inventory-functions.mjs\` for \`${rootArg}\`.`);
  rows.push(
    '',
    '> Machine-readable twin: `' + relative(repoRoot, outJson).replace(/\\/g, '/') + '`.',
    '> Regenerate and diff before re-planning; do not hand-edit.',
    '',
    '## Totals',
    '',
    `- Files scanned: **${files.length}**`,
    `- Callable units: **${units.length}**`,
    `- By risk: ${Object.entries(report.totals.byRisk).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `- By kind: ${Object.entries(report.totals.byKind).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    `- Mutating (state-changing): **${report.totals.mutating}**`,
    `- Dependencies: ${Object.entries(depTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`,
    '',
  );

  let currentFile = null;
  for (const u of [...units].sort(
    (a, b) => a.file.localeCompare(b.file) || a.line - b.line,
  )) {
    if (u.file !== currentFile) {
      currentFile = u.file;
      rows.push('', `## ${currentFile}`, '', '| Line | Unit | Kind | Risk | Mutates | Deps | Signature |', '|---:|---|---|---|:-:|---|---|');
    }
    rows.push(
      `| ${u.line} | \`${u.name}\` | ${u.kind} | ${u.risk} | ${u.mutates ? 'yes' : ''} | ${u.deps.join(', ')} | \`${(u.signature || '').replace(/\|/g, '\\|')}\` |`,
    );
  }
  rows.push('');
  mkdirSync(dirname(outMd), { recursive: true });
  writeFileSync(outMd, rows.join('\n'), 'utf8');
}

if (!quiet) {
  console.log(`inventory: ${units.length} units across ${files.length} files`);
  console.log(`  risk:  ${Object.entries(report.totals.byRisk).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  kind:  ${Object.entries(report.totals.byKind).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  wrote: ${relative(repoRoot, outJson)}${outMd ? ` , ${relative(repoRoot, outMd)}` : ''}`);
}
