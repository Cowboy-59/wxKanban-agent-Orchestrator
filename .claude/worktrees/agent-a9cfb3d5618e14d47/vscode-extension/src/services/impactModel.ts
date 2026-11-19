// SCOPE-137 / T011 (FR-010) — Change Impact in the Cockpit: the pure half.
//
// Everything here is data in, data out, with no `vscode` import, so the rules that matter are
// unit-tested in plain Node: what the status bar says, when the agree panel may open by itself
// (only at an Impact Boundary or possible data loss — never for a change that only notifies),
// how a fence's CodeLens reads, and how an AI edit the hook already settled is recognized so the
// developer is not asked twice.
import { createHash } from 'crypto';

// [SCOPE 137 / T011] BEGIN — Change Impact report shape and view model (FR-010)
export type Decision = 'none' | 'notify' | 'ask' | 'stop';
export type Confidence = 'Confirmed' | 'Likely';

export interface ImpactLink {
  type: string;
  direction: 'dependent' | 'dependency';
  from: string;
  to: string;
  via?: string;
  confidence: Confidence;
}

export interface ImpactReason {
  kind: string;
  detail: string;
  scope?: string;
  files?: string[];
}

export interface DataLossFinding {
  kind: string;
  file: string;
  table?: string | null;
  column?: string;
  line?: number | null;
  text: string;
}

export interface ImpactReport {
  changedFiles: string[];
  broad: boolean;
  broadReason?: string | null;
  links: ImpactLink[];
  summary: { affected: number | null };
  notRead?: string[];
  scopes?: { ownScopes: string[]; reachedScopes: string[]; unfencedReached: number };
  classification: {
    mode: string;
    decision: Decision;
    boundary: boolean;
    reasons: ImpactReason[];
    dataLoss: DataLossFinding[];
    ownScopes: string[];
    signoff: { checked: boolean; reason?: string; count?: number };
  };
  origin?: 'hook';
  contentHash?: string;
  checkedAt?: string;
}

export interface AffectedFile {
  file: string;
  types: string[];
  confidence: Confidence;
  from: string;
}

export interface ImpactView {
  changed: string[];
  affected: AffectedFile[];
  decision: Decision;
  mode: string;
  boundary: boolean;
  reasons: ImpactReason[];
  dataLoss: DataLossFinding[];
  ownScopes: string[];
  reachedScopes: string[];
  broad: boolean;
  broadReason: string | null;
  notRead: string[];
  signoff: { checked: boolean; reason?: string };
}

/** One row per affected FILE (tables, keys and scopes are not files), strongest label first. */
export function toView(report: ImpactReport): ImpactView {
  const byFile = new Map<string, AffectedFile>();
  for (const l of report.links) {
    if (l.direction !== 'dependent' || l.to.includes(':')) continue;
    const row = byFile.get(l.to) ?? { file: l.to, types: [], confidence: 'Likely' as Confidence, from: l.from };
    if (!row.types.includes(l.type)) row.types.push(l.type);
    if (l.confidence === 'Confirmed') row.confidence = 'Confirmed';
    byFile.set(l.to, row);
  }
  const c = report.classification;
  return {
    changed: report.changedFiles,
    affected: [...byFile.values()].sort((a, b) => (a.confidence === b.confidence ? a.file.localeCompare(b.file) : a.confidence === 'Confirmed' ? -1 : 1)),
    decision: c.decision,
    mode: c.mode,
    boundary: c.boundary,
    reasons: c.reasons,
    dataLoss: c.dataLoss,
    ownScopes: c.ownScopes,
    reachedScopes: report.scopes?.reachedScopes ?? [],
    broad: report.broad,
    broadReason: report.broadReason ?? null,
    notRead: report.notRead ?? [],
    signoff: c.signoff,
  };
}
// [SCOPE 137 / T011] END

// [SCOPE 137 / T011] BEGIN — What the status bar says, and when the panel opens by itself (FR-010)
export interface StatusText {
  text: string;
  tooltip: string;
  severity: 'normal' | 'warning' | 'error';
}

/**
 * The status bar. An unanswered hand-edit crossing keeps it in the warning or error state until
 * the developer answers — a later quiet save must not hide it (FR-010).
 */
export function statusText(view: ImpactView | null, pending: { decision: Decision; file: string } | null): StatusText {
  if (pending) {
    return pending.decision === 'stop'
      ? { text: '$(error) Impact: data loss?', tooltip: `Possible data loss in ${pending.file}: Agree or Undo`, severity: 'error' }
      : { text: '$(warning) Impact: agree?', tooltip: `${pending.file} crossed an Impact Boundary: Agree or Undo`, severity: 'warning' };
  }
  if (!view) return { text: '$(references) Impact', tooltip: 'Change Impact: no change checked yet', severity: 'normal' };
  if (view.broad) return { text: '$(references) Impact: broad', tooltip: view.broadReason ?? 'Too many dependents to list', severity: 'warning' };
  const n = view.affected.length;
  const tip = `Change Impact for ${view.changed.join(', ')}: ${n} affected file(s), impactMode ${view.mode}. Click for details.`;
  if (view.decision === 'stop') return { text: `$(error) Impact: ${n} · data loss`, tooltip: tip, severity: 'error' };
  if (view.boundary) return { text: `$(warning) Impact: ${n}`, tooltip: tip, severity: 'warning' };
  return { text: `$(references) Impact: ${n}`, tooltip: tip, severity: 'normal' };
}

/**
 * The agree panel opens by itself only for a hand edit that asks (an Impact Boundary, or
 * impactMode always) or stops (possible data loss). A change that only notifies opens nothing.
 * AI edits never open it: the hook already denied them and Claude asks in chat.
 */
export function shouldAutoOpen(view: ImpactView, origin: 'hand' | 'hook'): boolean {
  return origin === 'hand' && (view.decision === 'ask' || view.decision === 'stop');
}

/** Agree and Undo are offered only for a hand edit still waiting for its answer. */
export function needsAnswer(view: ImpactView, origin: 'hand' | 'hook'): boolean {
  return shouldAutoOpen(view, origin);
}

/** The Information-level Problems entry on a changed file. */
export function diagnosticMessage(view: ImpactView): string {
  const parts = [`Change Impact: ${view.affected.length} file(s) affected`];
  if (view.reachedScopes.length) parts.push(`reaches SCOPE-${view.reachedScopes.join(', SCOPE-')}`);
  if (view.boundary) parts.push('Impact Boundary');
  if (view.dataLoss.length) parts.push('possible data loss');
  return parts.join(' · ');
}
// [SCOPE 137 / T011] END

// [SCOPE 137 / T011] BEGIN — Fence CodeLens titles and AI-edit recognition (FR-010)
export interface FenceUsage {
  line: number;
  endLine: number;
  scope: string;
  task: string;
  title: string;
  symbols: string[];
  usedByFiles: number;
  usedByScopes: number;
  files: string[];
  scopes: string[];
  internal: boolean;
  confidence: Confidence;
}

export function lensTitle(f: FenceUsage): string {
  if (f.internal) return `SCOPE-${f.scope} / ${f.task} · exports nothing — internal to this file`;
  const files = `used by ${f.usedByFiles} file${f.usedByFiles === 1 ? '' : 's'}`;
  const scopes = `${f.usedByScopes} scope${f.usedByScopes === 1 ? '' : 's'}`;
  return `SCOPE-${f.scope} / ${f.task} · ${files} · ${scopes}${f.confidence === 'Likely' ? ' (Likely)' : ''}`;
}

/** The kit's change hash for one file (lib/agreement.mjs changeHash): file NUL content NUL. */
export function changeHash(file: string, content: string): string {
  return createHash('sha256').update(file).update('\0').update(content).update('\0').digest('hex');
}

/** An AI edit the hook already checked (and, at a boundary, had approved) — not a hand edit to ask about. */
export function isHookSettled(report: ImpactReport | null, file: string, content: string, now = Date.now()): boolean {
  if (!report || report.origin !== 'hook' || !report.contentHash || !report.checkedAt) return false;
  if (!report.changedFiles.includes(file)) return false;
  if (now - Date.parse(report.checkedAt) > 10 * 60 * 1000) return false;
  return report.contentHash === changeHash(file, content);
}
// [SCOPE 137 / T011] END

// [SCOPE 137 / T011] BEGIN — The agree panel's HTML (escaped; one nonce-bound script)
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * A small diagram: the changed file on the left, the scopes it reaches on the right. Plain SVG,
 * so it needs no script or library under the panel's strict policy.
 */
export function diagramSvg(view: ImpactView): string {
  const own = view.ownScopes.length ? `SCOPE-${view.ownScopes.join(', ')}` : 'no scope';
  const reached = view.reasons.filter((r) => r.kind === 'other-scope');
  const right = reached.length
    ? reached.map((r) => ({ label: `SCOPE-${r.scope}`, note: `${r.files?.length ?? 0} file(s)`, hot: true }))
    : [{ label: `${view.affected.length} file(s)`, note: 'same scope', hot: false }];
  const rowH = 34;
  const h = Math.max(right.length * rowH + 16, 60);
  const leftY = h / 2;
  const boxes = right.map((r, i) => {
    const y = 8 + i * rowH;
    return `<line x1="190" y1="${leftY}" x2="270" y2="${y + 13}" class="edge"/>` +
      `<rect x="270" y="${y}" width="170" height="26" rx="4" class="${r.hot ? 'hot' : 'box'}"/>` +
      `<text x="280" y="${y + 17}">${escapeHtml(r.label)} · ${escapeHtml(r.note)}</text>`;
  }).join('');
  const name = view.changed.length === 1 ? view.changed[0].split('/').pop() ?? view.changed[0] : `${view.changed.length} files`;
  return `<svg class="diagram" width="450" height="${h}" role="img" aria-label="Changed file and the scopes it reaches">` +
    `<rect x="4" y="${leftY - 20}" width="186" height="40" rx="4" class="box"/>` +
    `<text x="14" y="${leftY - 3}">${escapeHtml(name)}</text>` +
    `<text x="14" y="${leftY + 13}" class="muted">${escapeHtml(own)}</text>${boxes}</svg>`;
}

export function renderPanelHtml(view: ImpactView, opts: { nonce: string; cspSource: string; answer: boolean }): string {
  const verdict = view.decision === 'stop'
    ? 'Possible data loss'
    : view.boundary ? 'This change crosses an Impact Boundary' : view.decision === 'notify' ? 'This change affects other code' : 'No impact found';
  const reasons = view.reasons.map((r) => `<li>${escapeHtml(r.detail)}</li>`).join('');
  const loss = view.dataLoss.map((d) => `<li><strong>${escapeHtml(d.kind)}</strong> ${escapeHtml([d.table, d.column].filter(Boolean).join('.'))} — ${escapeHtml(d.text)}</li>`).join('');
  const rows = view.affected.slice(0, 200).map((a) =>
    `<tr><td><a href="#" data-open="${escapeHtml(a.file)}">${escapeHtml(a.file)}</a></td><td>${escapeHtml(a.types.join(', '))}</td><td>${a.confidence}</td></tr>`,
  ).join('');
  const more = view.affected.length > 200 ? `<p class="muted">… and ${view.affected.length - 200} more.</p>` : '';
  const buttons = opts.answer
    ? `<div class="actions">
  ${view.dataLoss.length ? '<label><input type="checkbox" id="confirm"> I understand this change may lose data</label><br>' : ''}
  <button id="agree"${view.dataLoss.length ? ' disabled' : ''}>Agree</button>
  <button id="undo" class="secondary">Undo my save</button>
  <p class="muted">Agree records your acknowledgment in wxKanban. Undo puts the file back as it was before this save.</p>
</div>`
    : '';
  const csp = `default-src 'none'; style-src ${opts.cspSource} 'unsafe-inline'; script-src 'nonce-${opts.nonce}';`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); padding: 0 14px; color: var(--vscode-foreground); }
  h2 { margin-bottom: 2px; } .muted { color: var(--vscode-descriptionForeground); font-size: 12px; }
  .warn { color: var(--vscode-editorWarning-foreground); } .err { color: var(--vscode-editorError-foreground); }
  table { border-collapse: collapse; width: 100%; font-size: 12px; } td, th { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--vscode-panel-border); }
  .diagram text { fill: var(--vscode-foreground); font-size: 11px; } .diagram .muted { fill: var(--vscode-descriptionForeground); }
  .diagram .box { fill: none; stroke: var(--vscode-panel-border); } .diagram .hot { fill: none; stroke: var(--vscode-editorWarning-foreground); }
  .diagram .edge { stroke: var(--vscode-descriptionForeground); }
  .actions { margin: 14px 0; } button { padding: 4px 14px; margin-right: 6px; }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
</style></head>
<body>
  <h2 class="${view.decision === 'stop' ? 'err' : view.boundary ? 'warn' : ''}">${verdict}</h2>
  <p class="muted">${escapeHtml(view.changed.join(', '))} · impactMode ${escapeHtml(view.mode)} · ${view.affected.length} affected file(s)</p>
  ${diagramSvg(view)}
  ${loss ? `<h3 class="err">Possible data loss</h3><ul>${loss}</ul>` : ''}
  ${reasons ? `<h3>Why it is a boundary</h3><ul>${reasons}</ul>` : ''}
  ${view.signoff.checked ? '' : `<p class="muted">Human sign-offs: not checked (${escapeHtml(view.signoff.reason ?? 'unavailable')}).</p>`}
  ${buttons}
  <h3>Affected</h3>
  ${rows ? `<table><tr><th>File</th><th>Through</th><th>Confidence</th></tr>${rows}</table>${more}` : '<p class="muted">No other file is affected.</p>'}
  ${view.notRead.length ? `<p class="muted">Not read (file type not supported): ${escapeHtml(view.notRead.join(', '))} — checked by text mention only.</p>` : ''}
<script nonce="${opts.nonce}">
  const vscode = acquireVsCodeApi();
  for (const a of document.querySelectorAll('[data-open]')) a.addEventListener('click', (e) => { e.preventDefault(); vscode.postMessage({ type: 'open', file: a.dataset.open }); });
  const confirm = document.getElementById('confirm'); const agree = document.getElementById('agree');
  if (confirm && agree) confirm.addEventListener('change', () => { agree.disabled = !confirm.checked; });
  if (agree) agree.addEventListener('click', () => vscode.postMessage({ type: 'agree', dataLossConfirmed: confirm ? confirm.checked : false }));
  const undo = document.getElementById('undo'); if (undo) undo.addEventListener('click', () => vscode.postMessage({ type: 'undo' }));
</script>
</body></html>`;
}
// [SCOPE 137 / T011] END
