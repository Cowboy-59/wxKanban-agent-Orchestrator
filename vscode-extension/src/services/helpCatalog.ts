// [SCOPE 042 / Help] Command catalog for the Dev Cockpit "Help — Commands"
// section. Sourced dynamically from the project's _wxAI/commands/*.md so it
// reflects the slash commands actually shipped to the workspace and never drifts
// from a hand-maintained list. Read-only; local files only (works offline).
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface HelpParam {
  name: string;
  blurb: string;
}

export interface HelpCommand {
  name: string;
  blurb: string;
  docPath?: string;
  // [SCOPE 042 / Help] optional flags/arguments documented for this command.
  params: HelpParam[];
}

export interface HelpCatalog {
  standard: HelpCommand[];
  extended: HelpCommand[];
}

// The core lifecycle set (matched case-insensitively against the file basename).
// Everything else under _wxAI/commands falls into "Extended".
const STANDARD = new Set<string>([
  'buildscope',
  'createspecs',
  'implement',
  'wxconversion',
  'wxconversionscope',
  'cwconversion',
  'cwconversionscope',
  'vbconversion',
  'vbconversionscope',
  'dbpush',
  'validatescope',
  'analyzescope',
  'createtesttasks',
  'runqa',
  'runhuman',
  'preparerelease',
  'finalizerelease',
  'dev-plan', // [SCOPE 081 / T006]
]);

// Non-command docs that live alongside the commands but aren't slash commands.
const SKIP = /^(ENFORCEMENT_SUMMARY|README)$/i;

function clean(s: string): string {
  return s
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

/** Best-effort one-line excerpt: front-matter description → ## Purpose → first body line. */
export function extractBlurb(input: string): string {
  // Strip a leading UTF-8 BOM — several command files start with one, which
  // otherwise defeats the ^--- front-matter match.
  const md = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (fm) {
    const d = fm[1].match(/^description:\s*(.+)$/m);
    if (d) return clean(d[1]);
  }
  const purpose = md.match(/##\s+Purpose\s*\r?\n+([^\r\n]+)/i);
  if (purpose) return clean(purpose[1]);
  const body = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim();
    if (t && !t.startsWith('#') && !t.startsWith('---') && !t.startsWith('|')) return clean(t);
  }
  return '';
}

/**
 * Best-effort extraction of the OPTIONAL parameters documented for a command.
 *
 * The command files document flags in several styles, so this scans the WHOLE
 * document (not a single `## Arguments` section — buildscope/validatescope have
 * none) for bullet lines that introduce an optional flag/argument:
 *   - `--dry-run` (optional): Validate without making changes   (implement, dbpush)
 *   - `phase` (optional): Current lifecycle phase               (createspecs)
 *     - `--from-md <path>` — Read the Markdown file ...         (buildscope, indented)
 *   - `--source-only` — Run Part A only ...                     (wxconversion, em-dash)
 *   | `--fix` | Auto-fix minor issues ... |                      (validatescope, table row)
 *
 * A bullet or table cell whose backticked token looks like a flag (`-`/`--…`)
 * OR is explicitly marked `(optional)` qualifies. Anything marked `(required)`,
 * tool-name / related-command lists, and `key:`-style detail lines are ignored.
 * Names are de-duplicated (first occurrence wins) so a flag referenced again in
 * a "Behavior" note doesn't appear twice.
 */
export function extractParams(input: string): HelpParam[] {
  const md = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input;
  const params: HelpParam[] = [];
  const seen = new Set<string>();
  const add = (name: string, rest: string): void => {
    const isFlag = /^-/.test(name);
    const optional = /\(optional\)/i.test(rest);
    if (/\(required\)/i.test(rest)) return;
    // Keep only genuine flags or items explicitly tagged optional; this drops
    // example commands, MCP-tool lists, and `key:`-style nested detail lines.
    if (!isFlag && !optional) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    // Strip the leading `(optional)` marker and any separator (: — – - →).
    const blurb = rest.replace(/^\(optional\)/i, '').replace(/^\s*[:—–\-→]\s*/, '').trim();
    params.push({ name, blurb: clean(blurb) });
  };
  for (const line of md.split(/\r?\n/)) {
    // Bullet form: `- `--flag` — desc` (any indent), including createspecs `name` (optional).
    const bullet = line.match(/^\s*-\s+`([^`]+)`\s*(.*)$/);
    if (bullet) {
      add(bullet[1].trim(), bullet[2].trim());
      continue;
    }
    // Table form: `| `--flag` | desc |` (validatescope). Skip header/divider rows
    // (no backticked first cell).
    const row = line.match(/^\s*\|\s*`([^`]+)`\s*\|\s*([^|]*?)\s*\|/);
    if (row) add(row[1].trim(), row[2].trim());
  }
  return params;
}

/**
 * Load the command catalog from the first workspace folder that has an
 * `_wxAI/commands` directory. Returns empty arrays when none is found (the
 * caller then omits the Help section).
 */
export function loadCommandCatalog(): HelpCatalog {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  for (const root of folders) {
    const dir = path.join(root, '_wxAI', 'commands');
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.md'));
    } catch {
      continue;
    }
    const standard: HelpCommand[] = [];
    const extended: HelpCommand[] = [];
    for (const file of files.sort((a, b) => a.localeCompare(b))) {
      const name = file.replace(/\.md$/i, '');
      if (SKIP.test(name)) continue;
      let md = '';
      try {
        md = fs.readFileSync(path.join(dir, file), 'utf8');
      } catch {
        continue;
      }
      const cmd: HelpCommand = { name, blurb: extractBlurb(md), docPath: path.join(dir, file), params: extractParams(md) };
      (STANDARD.has(name.toLowerCase()) ? standard : extended).push(cmd);
    }
    return { standard, extended };
  }
  return { standard: [], extended: [] };
}
