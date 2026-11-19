// One-shot bake script for SCOPE-104: merge the base wx-recording-themes files
// with Andy's personal settings.json [wxDark]/[wxLight] overlays into
// self-contained cockpit theme files. Run with: node scripts/bake-themes.mjs
// This is a build-time author tool, not shipped extension code.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'themes');

const BASE_DIR =
  'C:/Users/ccscowboy/.vscode/extensions/wxperts.wx-recording-themes-0.0.1/themes';
const SETTINGS = 'C:/Users/ccscowboy/AppData/Roaming/Code/User/settings.json';

// String-aware JSONC → JSON (won't clobber http:// inside string values).
function stripJsonc(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  let inStr = false;
  let strCh = '';
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === strCh) inStr = false;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = true;
      strCh = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  // remove trailing commas
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function readJsonc(p) {
  return JSON.parse(stripJsonc(readFileSync(p, 'utf8')));
}

// VS Code's tokenColorCustomizations named shorthands → TextMate scopes.
const SHORTHAND_SCOPES = {
  comments: ['comment', 'punctuation.definition.comment'],
  strings: ['string', 'string.template', 'meta.embedded.assembly'],
  keywords: ['keyword', 'keyword.control', 'storage', 'storage.type'],
  numbers: ['constant.numeric'],
  types: ['entity.name.type', 'support.type', 'entity.name.class', 'support.class'],
  functions: ['entity.name.function', 'support.function', 'meta.function-call.generic'],
  variables: ['variable', 'variable.other'],
};

function overlayTokenColors(baseTokenColors, tokenOverlay) {
  // Start from the base tokenColors, then APPEND overlays so they win (last match wins in TextMate).
  const result = Array.isArray(baseTokenColors) ? baseTokenColors.slice() : [];
  // 1) named shorthands → explicit rules
  for (const [key, scopes] of Object.entries(SHORTHAND_SCOPES)) {
    const color = tokenOverlay[key];
    if (typeof color === 'string' && color) {
      result.push({
        name: `wx ${key}`,
        scope: scopes,
        settings: { foreground: color },
      });
    }
  }
  // 2) explicit textMateRules appended last (highest precedence)
  if (Array.isArray(tokenOverlay.textMateRules)) {
    for (const rule of tokenOverlay.textMateRules) result.push(rule);
  }
  return result;
}

function bake(variant) {
  const base = readJsonc(join(BASE_DIR, `${variant}-color-theme.json`));
  const settings = readJsonc(SETTINGS);
  const colorOverlay = (settings['workbench.colorCustomizations'] || {})[`[${variant}]`] || {};
  const tokenOverlay = (settings['editor.tokenColorCustomizations'] || {})[`[${variant}]`] || {};

  const merged = {
    ...base,
    name: variant,
    colors: { ...(base.colors || {}), ...colorOverlay },
    tokenColors: overlayTokenColors(base.tokenColors, tokenOverlay),
  };

  mkdirSync(OUT, { recursive: true });
  const outPath = join(OUT, `${variant}-color-theme.json`);
  writeFileSync(outPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');

  console.log(
    `${variant}: colors=${Object.keys(merged.colors).length} ` +
      `(overlay +${Object.keys(colorOverlay).length}), ` +
      `tokenColors=${merged.tokenColors.length} ` +
      `(base ${Array.isArray(base.tokenColors) ? base.tokenColors.length : 0}), ` +
      `bg=${merged.colors['editor.background']} fg=${merged.colors['editor.foreground']} ` +
      `-> ${outPath}`,
  );
}

bake('wxDark');
bake('wxLight');
console.log('done.');
