#!/usr/bin/env node
/**
 * inventory-functions.mjs — deterministic callable-unit inventory for the wxCreateTestPlan skill.
 *
 * Walks the TypeScript AST of a source tree and emits every unit a test could target:
 * exported functions, exported const arrow functions, class methods, internal helpers, Drizzle
 * `pgTable(...)` definitions, and — critically for wxKanban — Express `router.<verb>(...)` route
 * registrations (and MCP `registerTool(...)` sites where present), which live as call sites inside
 * closures and are therefore invisible to a grep for `export function`.
 *
 * Usage:
 *   node inventory-functions.mjs --root src/server [--out tests/.../inventory.json] [--md tests/.../INVENTORY.md]
 *
 * Options:
 *   --root <dir>   source dir to scan (scans <root>/src and <root>/scripts if present, otherwise
 *                  <root> itself). Default: src/server
 *   --out <file>   JSON output path. Default: <root>/tests/inventory.json
 *   --md <file>    Markdown output path. Omit to skip.
 *   --quiet        suppress the stdout summary
 *   --allow-empty  do not hard-stop when the tree holds no TypeScript (see below)
 *
 * Resolves `typescript` from the target package first, then this repo's root.
 *
 * STACK SCOPE: TypeScript only. On any other stack (C#/.NET, Python, Java, …) this exits 3 and
 * names what it found — it must never emit an empty-but-valid inventory, because the phases
 * downstream cannot tell that apart from a codebase that genuinely has nothing in it. See
 * `_wxAI/skills/wxCreateTestPlan/adapters/` for the per-stack substitutes.
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
const rootArg = arg('root', 'src/server');
const root = resolve(repoRoot, rootArg);
if (!existsSync(root)) {
  console.error(`inventory: --root "${rootArg}" does not exist (resolved to ${root})`);
  process.exit(1);
}
const outJson = resolve(repoRoot, arg('out', join(rootArg, 'tests', 'inventory.json')));
const outMd = arg('md') ? resolve(repoRoot, arg('md')) : null;
const quiet = flag('quiet');
const allowEmpty = flag('allow-empty');

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

// ---------------------------------------------------------------------------- stack guard

/**
 * Census of every file extension under `dir`, so an unsupported tree can be named rather than
 * merely reported as empty. Same skip-list as `walk`, so the numbers describe the same tree.
 */
function censusExtensions(dir, tally = new Map()) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) censusExtensions(full, tally);
    else {
      const dot = entry.lastIndexOf('.');
      const ext = dot > 0 ? entry.slice(dot) : '(no extension)';
      tally.set(ext, (tally.get(ext) || 0) + 1);
    }
  }
  return tally;
}

// This extractor targets TypeScript. Run against any other stack it used to walk the tree, match
// nothing, write a valid-looking inventory of ZERO units and exit 0 — and the phases downstream
// would then build a confident, empty test plan on top of it. An empty result that reads as a real
// one is worse than an error, so an unsupported tree is a hard stop with the stack named.
if (files.length === 0 && !allowEmpty) {
  const census = [...censusExtensions(root)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([ext, n]) => `${n} ${ext}`)
    .join(', ');
  console.error(
    `inventory: no supported source files found under "${rootArg}".\n` +
      '  This extractor targets TypeScript (Express routes, Drizzle tables, MCP tools).\n' +
      `  Found instead: ${census || 'nothing'}.\n` +
      '  Pick the adapter for the stack this project declares in stack.md:\n' +
      '    _wxAI/skills/wxCreateTestPlan/adapters/\n' +
      '  If an empty result is genuinely expected here, re-run with --allow-empty.',
  );
  process.exit(3);
}

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

// ---------------------------------------------------------------------------- classification

/** Dependency tags, matched against a unit's body text. Order is cosmetic only. */
const DEP_PATTERNS = [
  ['drizzle-db', /\bdb\s*\.\s*(select|insert|update|delete|query|execute|transaction)\b|\bdrizzle\b/],
  ['pg-raw', /\bpool\s*\.\s*query\b|\bsql`/],
  ['auth', /authenticateToken|requireAuth|requireRole|req\.userid|verifyToken|jwt\.(sign|verify)/],
  ['bcrypt', /\bbcrypt\b/],
  ['stripe', /\bstripe\b/i],
  ['email', /nodemailer|sendMail|sendEmail|\bSES\b|SendEmailCommand|mailgun/i],
  ['storage', /\bS3\b|PutObjectCommand|GetObjectCommand|s3Client|@aws-sdk\/client-s3/],
  ['ai', /gemini|GoogleGenerative|generativeai|\bopenai\b|@google\/generative/i],
  ['pm-api', /\bjira\b|monday\.com|mondaydotcom|\basana\b|\btrello\b|pmsystem/i],
  ['validation', /validateBody|validateQuery|validateParams/],
  ['audit', /\baudit\s*\(|auditLog|companyauditlogs/],
  ['env', /process\.env|\benv\s*\./],
  ['fs', /readFileSync|writeFileSync|existsSync|mkdirSync/],
  ['net', /\bfetch\s*\(|https?\.request|axios/],
  ['clock', /new Date\b|Date\.now|toISOString/],
  ['logger', /\blogger\s*\./],
  ['zod', /\bz\s*\.|zod/],
];

/** Anything here means the unit can change state somewhere — always HIGH risk. */
const MUTATION = /\bdb\s*\.\s*(insert|update|delete)\b|\bpool\s*\.\s*query\s*\(\s*[`'"]\s*(insert|update|delete)|\b(update|delete|complete|clear|fixup|set|push|create|revoke|invite|assign|archive)[A-Z]\w*\s*\(/;

/** Security-sensitive surface — HIGH risk even when read-only. */
const SECURITY = /secret|credential|password|passwordhash|token|jwt|bcrypt|authoriz|authent|requireRole|requireAuth/i;

/** HTTP verbs that mutate — an Express route on one of these is HIGH risk by default. */
const WRITE_VERBS = new Set(['post', 'put', 'patch', 'delete']);

function tagsFor(text) {
  return DEP_PATTERNS.filter(([, re]) => re.test(text)).map(([tag]) => tag);
}

function riskFor({ text, name, deps, mutates }) {
  if (mutates) return 'HIGH';
  if (SECURITY.test(name) || SECURITY.test(text)) return 'HIGH';
  if (deps.some((d) => ['auth', 'bcrypt', 'stripe', 'email', 'storage', 'pm-api', 'net'].includes(d))) return 'HIGH';
  if (deps.some((d) => ['drizzle-db', 'pg-raw', 'ai', 'audit', 'fs', 'env'].includes(d))) return 'MEDIUM';
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

/**
 * Names bound to an Express router in this file, resolved from their initialiser rather than
 * assumed from a fixed allow-list.
 *
 * The idiomatic one-Router-per-resource layout names each router after its resource
 * (`applicationsrouter`, `authRouter`), so matching only `router|app|r` finds whichever file
 * happens to use the bare name and misses every other — an under-count, not an empty result, so
 * nothing downstream can tell it apart from a small codebase. Resolving the binding matches a
 * router whatever it is called.
 */
function routerBindings(sf) {
  const names = new Set();

  const initialisesRouter = (init) => {
    if (!init || !ts.isCallExpression(init)) return false;
    const callee = init.expression;
    if (ts.isIdentifier(callee)) return /^(Router|express)$/.test(callee.text); // Router() | express()
    if (ts.isPropertyAccessExpression(callee)) return callee.name.text === 'Router'; // express.Router()
    return false;
  };

  const walkBindings = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      initialisesRouter(node.initializer)
    ) {
      names.add(node.name.text);
    }
    ts.forEachChild(node, walkBindings);
  };
  walkBindings(sf);
  return names;
}

/**
 * Fallback for routers this file receives rather than creates — a router passed in as a parameter
 * or imported from a barrel has no local initialiser to resolve.
 */
const ROUTER_NAME = /^(app|r|.*router)$/i;

// ---------------------------------------------------------------------------- extraction

const units = [];
const seenIds = new Set();
/** Files that declare a router but yielded no routes — see the under-count guard below. */
const silentRouterFiles = [];

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

  const isTsx = /\.tsx$/.test(file);
  const isClient = /[\\/](client|frontend)[\\/]/.test(rel);
  const isPage = isClient && /[\\/]pages[\\/]/.test(rel);

  const routerNames = routerBindings(sf);
  let routesInFile = 0;

  /** True for an identifier this file uses as a router. */
  const isRouterRef = (n) =>
    ts.isIdentifier(n) && (routerNames.has(n.text) || ROUTER_NAME.test(n.text));

  /**
   * Resolve the receiver of a `.get(...)`/`.post(...)` call to a router, covering both registration
   * styles: `router.get('/path', handler)` and the chained `router.route('/path').get(handler)`.
   * Returns the path carried by the chain, or null when the receiver is not a router — most
   * `.get(...)` calls in a codebase are Map/cache reads, not routes.
   */
  const routerChain = (receiver) => {
    if (isRouterRef(receiver)) return { chainedPath: null };
    if (
      ts.isCallExpression(receiver) &&
      ts.isPropertyAccessExpression(receiver.expression) &&
      receiver.expression.name.text === 'route' &&
      isRouterRef(receiver.expression.expression)
    ) {
      const p = receiver.arguments[0];
      return { chainedPath: p && ts.isStringLiteralLike(p) ? p.text : '<dynamic>' };
    }
    return null;
  };

  const visit = (node, enclosing) => {
    // --- Express routes: <router>.get('/path', ...middleware, handler)
    //     and the chained form: <router>.route('/path').get(handler)
    const chain =
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      /^(get|post|put|patch|delete|all)$/.test(node.expression.name.text)
        ? routerChain(node.expression.expression)
        : null;

    if (chain) {
      routesInFile += 1;
      const verb = node.expression.name.text.toLowerCase();
      const pathArg = chain.chainedPath === null ? node.arguments[0] : null;
      const routePath =
        chain.chainedPath !== null
          ? chain.chainedPath
          : pathArg && ts.isStringLiteralLike(pathArg)
            ? pathArg.text
            : `<dynamic@${lineOf(sf, node)}>`;
      // middleware = identifier/call args between the path and the final handler
      const rest = chain.chainedPath === null ? node.arguments.slice(1) : node.arguments.slice(0);
      const handler = rest[rest.length - 1];
      const middleware = rest
        .slice(0, -1)
        .map((a) => (ts.isCallExpression(a) ? a.expression.getText(sf) : a.getText(sf)))
        .map((s) => s.replace(/\s+/g, ' ').slice(0, 60));
      const text = node.getText(sf);
      const deps = tagsFor(text);
      const mutates = WRITE_VERBS.has(verb) || MUTATION.test(text);
      push({
        id: `route:${verb.toUpperCase()} ${routePath}`,
        file: rel,
        line: lineOf(sf, node),
        name: `${verb.toUpperCase()} ${routePath}`,
        kind: 'express-route',
        exported: true, // reachable over HTTP
        registeredBy: enclosing || null,
        signature: `(${middleware.join(', ')})`,
        middleware,
        deps: deps.includes('auth') || middleware.some((m) => /auth|requireAuth|requireRole/i.test(m)) ? [...new Set([...deps, 'auth'])] : deps,
        mutates,
        risk: riskFor({ text, name: routePath, deps, mutates }),
        loc: text.split('\n').length,
      });
      if (handler && handler.body) ts.forEachChild(handler.body, (c) => visit(c, `${verb.toUpperCase()} ${routePath}`));
      return;
    }

    // --- Drizzle tables: export const x = pgTable("name", {...})
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'pgTable'
    ) {
      const nameArg = node.arguments[0];
      const tableName = nameArg && ts.isStringLiteralLike(nameArg) ? nameArg.text : `<dynamic@${lineOf(sf, node)}>`;
      const cols = objectKeys(sf, node.arguments[1]);
      push({
        id: `table:${tableName}`,
        file: rel,
        line: lineOf(sf, node),
        name: tableName,
        kind: 'drizzle-table',
        exported: true,
        signature: `columns { ${cols.join(', ')} }`,
        inputs: cols,
        deps: ['drizzle-db'],
        mutates: false, // a table def is data, not behavior — but it is the CRUD target
        risk: 'MEDIUM',
        loc: node.getText(sf).split('\n').length,
      });
    }

    // --- UI flow edges: navigate('/x'), <Link to="/x">, <Route path="/x" ...>
    if (isClient) {
      // navigate('/path') or navigate(`/path`)
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'navigate' &&
        node.arguments[0] &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const to = node.arguments[0].text;
        push({
          id: `flow:navigate ${to}`,
          file: rel,
          line: lineOf(sf, node),
          name: `navigate → ${to}`,
          kind: 'ui-flow-edge',
          exported: true,
          signature: `from ${enclosing || rel} → ${to}`,
          to,
          deps: [],
          mutates: false,
          risk: 'MEDIUM',
          loc: 1,
        });
      }
      // <Route path="/x"> and <Link to="/x"> JSX attributes
      if (ts.isJsxAttribute(node) && node.name && /^(path|to)$/.test(node.name.getText(sf))) {
        const init = node.initializer;
        const val =
          init && ts.isStringLiteral(init)
            ? init.text
            : init && ts.isJsxExpression(init) && init.expression && ts.isStringLiteralLike(init.expression)
              ? init.expression.text
              : null;
        if (val && val.startsWith('/')) {
          const attr = node.name.getText(sf);
          push({
            id: `flow:${attr} ${val}@${lineOf(sf, node)}`,
            file: rel,
            line: lineOf(sf, node),
            name: `${attr === 'path' ? 'route' : 'link'} ${val}`,
            kind: attr === 'path' ? 'ui-route' : 'ui-flow-edge',
            exported: true,
            signature: `${attr}="${val}"`,
            to: val,
            deps: [],
            mutates: false,
            risk: 'LOW',
            loc: 1,
          });
        }
      }
    }

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

  if (routerNames.size > 0 && routesInFile === 0) {
    silentRouterFiles.push(`${rel} (declares ${[...routerNames].join(', ')})`);
  }
}

// ---------------------------------------------------------------------------- under-count guard

// The stack guard above catches an inventory of ZERO. It cannot catch an inventory of ONE drawn
// from a tree holding hundreds, which is what a route matcher that misses most routers produces —
// and a plausible small number reads as a real result far more readily than an empty one does. A
// file that builds a router and registers nothing on it is the signature of that miss, so it is a
// hard stop naming the files rather than a warning printed above a test plan built on the gap.
if (silentRouterFiles.length > 0 && !allowEmpty) {
  console.error(
    `inventory: ${silentRouterFiles.length} file(s) declare an Express router but produced no routes.\n` +
      '  This is almost always the extractor missing route registrations, not a codebase with\n' +
      '  empty routers — the resulting inventory would be short but plausible, and every phase\n' +
      '  downstream would treat it as complete.\n' +
      silentRouterFiles.map((f) => `    ${f}`).join('\n') +
      '\n  If these routers are genuinely empty, re-run with --allow-empty.',
  );
  process.exit(3);
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
  rows.push(`Generated by \`wxCreateTestPlan/scripts/inventory-functions.mjs\` for \`${rootArg}\`.`);
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

// Files were found but nothing in them classified. Unlike the zero-files case this is a real, if
// rare, legitimate state (a subtree of pure type declarations or re-exports), so it warns rather
// than stops — but it must not pass silently, because a plan built on zero units is worthless.
if (units.length === 0) {
  console.error(
    `inventory: WARNING — parsed ${files.length} TypeScript file(s) under "${rootArg}" but ` +
      'classified 0 callable units.\n' +
      '  Do not plan against this inventory until you have established why. Check that --root ' +
      'points at implementation code rather than types/re-exports.',
  );
}

if (!quiet) {
  console.log(`inventory: ${units.length} units across ${files.length} files`);
  console.log(`  risk:  ${Object.entries(report.totals.byRisk).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  kind:  ${Object.entries(report.totals.byKind).map(([k, v]) => `${k}=${v}`).join('  ')}`);
  console.log(`  wrote: ${relative(repoRoot, outJson)}${outMd ? ` , ${relative(repoRoot, outMd)}` : ''}`);
}
