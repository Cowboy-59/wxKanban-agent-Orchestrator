/**
 * SCOPE-137 / T011 (FR-010) — Change Impact in the Cockpit, the rules that do not need VS Code.
 *
 * The acceptance criteria this pins: the panel never opens by itself for a change that only
 * notifies; an unanswered crossing stays visible in the status bar until answered; an AI edit
 * the hook already settled is recognized (the hash must equal the kit's, byte for byte); and the
 * panel's HTML escapes every file name and reason it shows.
 */
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'url';
import * as path from 'path';
import {
  changeHash,
  diagnosticMessage,
  isHookSettled,
  lensTitle,
  renderPanelHtml,
  shouldAutoOpen,
  statusText,
  toView,
  type FenceUsage,
  type ImpactReport,
} from '../src/services/impactModel';

// [SCOPE 137 / T011] BEGIN — Cockpit Change Impact model tests
function report(decision: 'none' | 'notify' | 'ask' | 'stop', extra: Partial<ImpactReport> = {}): ImpactReport {
  return {
    changedFiles: ['src/server/service.ts'],
    broad: false,
    links: [
      { type: 'import', direction: 'dependent', from: 'src/server/service.ts', to: 'src/server/routes/items.ts', confidence: 'Confirmed' },
      { type: 'url-route', direction: 'dependent', from: 'src/server/service.ts', to: 'src/client/Items.tsx', confidence: 'Likely' },
      { type: 'table', direction: 'dependent', from: 'src/server/service.ts', to: 'src/client/Items.tsx', via: 'table:items', confidence: 'Confirmed' },
      { type: 'scope', direction: 'dependent', from: 'src/server/service.ts', to: 'scope:002', confidence: 'Confirmed' },
      { type: 'import', direction: 'dependency', from: 'src/server/service.ts', to: 'src/lib/util.ts', confidence: 'Confirmed' },
    ],
    summary: { affected: 2 },
    scopes: { ownScopes: ['001'], reachedScopes: ['002'], unfencedReached: 0 },
    classification: {
      mode: 'boundaries',
      decision,
      boundary: decision === 'ask',
      reasons: decision === 'ask' ? [{ kind: 'other-scope', scope: '002', files: ['src/client/Items.tsx'], detail: 'reaches SCOPE-002 code (1 file)' }] : [],
      dataLoss: decision === 'stop' ? [{ kind: 'drop-column', file: 'm.sql', table: 'items', column: 'sku', line: 1, text: 'ALTER TABLE items DROP COLUMN sku' }] : [],
      ownScopes: ['001'],
      signoff: { checked: false, reason: 'no wxKanban connection configured' },
    },
    ...extra,
  };
}

describe('SCOPE-137 T011 — Cockpit Change Impact (FR-010)', () => {
  it('lists affected FILES once each, strongest label first; tables, scopes and dependencies are not files', () => {
    const v = toView(report('notify'));
    expect(v.affected.map((a) => [a.file, a.confidence, a.types])).toEqual([
      ['src/client/Items.tsx', 'Confirmed', ['url-route', 'table']],
      ['src/server/routes/items.ts', 'Confirmed', ['import']],
    ]);
  });

  it('the panel never opens by itself for a change that only notifies, nor for an AI edit', () => {
    expect(shouldAutoOpen(toView(report('notify')), 'hand')).toBe(false);
    expect(shouldAutoOpen(toView(report('none')), 'hand')).toBe(false);
    expect(shouldAutoOpen(toView(report('ask')), 'hand')).toBe(true);
    expect(shouldAutoOpen(toView(report('stop')), 'hand')).toBe(true);
    expect(shouldAutoOpen(toView(report('ask')), 'hook')).toBe(false);
  });

  it('an unanswered crossing stays in the status bar until answered, whatever is checked after it', () => {
    const quiet = toView(report('notify'));
    expect(statusText(quiet, null)).toMatchObject({ text: '$(references) Impact: 2', severity: 'normal' });
    expect(statusText(quiet, { decision: 'ask', file: 'a.ts' })).toMatchObject({ text: '$(warning) Impact: agree?', severity: 'warning' });
    expect(statusText(null, { decision: 'stop', file: 'm.sql' })).toMatchObject({ severity: 'error' });
    expect(statusText(toView(report('ask')), null).severity).toBe('warning');
  });

  it('the Problems entry names the affected count, the scopes reached, and the boundary', () => {
    expect(diagnosticMessage(toView(report('ask')))).toBe('Change Impact: 2 file(s) affected · reaches SCOPE-002 · Impact Boundary');
  });

  it("recognizes an AI edit the hook settled: the Cockpit's hash equals the kit's", async () => {
    const kit = (await import(pathToFileURL(path.resolve(__dirname, '../../_wxAI/impact/lib/agreement.mjs')).href)) as {
      changeHash: (entries: Array<{ file: string; content: string }>) => string;
    };
    const content = "export const a = 'é';\r\n";
    expect(changeHash('src/a.ts', content)).toBe(kit.changeHash([{ file: 'src/a.ts', content }]));

    const now = Date.parse('2026-10-17T12:00:00Z');
    const settled = report('ask', { origin: 'hook', contentHash: changeHash('src/server/service.ts', 'new'), checkedAt: '2026-10-17T11:59:00Z' });
    expect(isHookSettled(settled, 'src/server/service.ts', 'new', now)).toBe(true);
    expect(isHookSettled(settled, 'src/server/service.ts', 'different', now)).toBe(false); // a hand edit on top
    expect(isHookSettled(settled, 'src/other.ts', 'new', now)).toBe(false);
    expect(isHookSettled(settled, 'src/server/service.ts', 'new', now + 11 * 60 * 1000)).toBe(false); // stale
    expect(isHookSettled({ ...settled, origin: undefined }, 'src/server/service.ts', 'new', now)).toBe(false);
  });

  it('a fence CodeLens says who uses it, and says so plainly when it exports nothing', () => {
    const base: FenceUsage = { line: 3, endLine: 9, scope: '137', task: 'T008', title: 't', symbols: ['decide'], usedByFiles: 3, usedByScopes: 1, files: [], scopes: ['137'], internal: false, confidence: 'Confirmed' };
    expect(lensTitle(base)).toBe('SCOPE-137 / T008 · used by 3 files · 1 scope');
    expect(lensTitle({ ...base, usedByFiles: 1, usedByScopes: 2, confidence: 'Likely' })).toBe('SCOPE-137 / T008 · used by 1 file · 2 scopes (Likely)');
    expect(lensTitle({ ...base, internal: true })).toMatch(/exports nothing — internal to this file/);
  });

  it('the panel escapes what it shows, offers Agree/Undo only when an answer is due, and gates Agree on data loss', () => {
    const hostile = report('stop', { changedFiles: ['<img src=x onerror=alert(1)>.ts'] });
    const html = renderPanelHtml(toView(hostile), { nonce: 'n0nce', cspSource: 'vscode-resource:', answer: true });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;.ts');
    expect(html).toContain("script-src 'nonce-n0nce'");
    expect(html).toContain('<button id="agree" disabled>');
    expect(html).toContain('I understand this change may lose data');
    const readOnly = renderPanelHtml(toView(report('notify')), { nonce: 'n', cspSource: 'x', answer: false });
    expect(readOnly).not.toContain('id="agree"');
    expect(readOnly).not.toContain('id="undo"');
  });
});
// [SCOPE 137 / T011] END
