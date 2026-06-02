import * as vscode from 'vscode';
import type { MyFeedbackItem } from '../types.js';

let panel: vscode.WebviewPanel | undefined;

// [SCOPE 043 / T011] BEGIN — showFeedbackDetail (read-only webview of a submitted item)
// Opens the full text the submitter originally entered (the persona `details`
// body) plus the auto-captured `context`, so a non-needs-info item can be
// re-read without leaving the editor. Scripts disabled — display-only, no
// edit/submit affordances (needs-info items keep their reply command).
export function showFeedbackDetail(item: MyFeedbackItem): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'wxkanban.feedbackDetail',
      'wxKanban Feedback',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false, retainContextWhenHidden: false },
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
  }
  panel.title = `Feedback · ${truncate(item.title, 24)}`;
  panel.webview.html = renderHtml(item);
  panel.reveal(vscode.ViewColumn.Beside, true);
}
// [SCOPE 043 / T011] END

// [SCOPE 043 / T011] BEGIN — renderHtml (escaped, read-only feedback detail)
function renderHtml(item: MyFeedbackItem): string {
  const metaBits = [
    `type: <span class="badge">${escapeHtml(item.type)}</span>`,
    `status: <span class="badge">${escapeHtml(item.status)}</span>`,
    item.severity ? `severity: <span class="badge">${escapeHtml(item.severity)}</span>` : '',
    item.classification ? `classified: <span class="badge">${escapeHtml(item.classification)}</span>` : '',
    `ref ${escapeHtml(item.referenceId.slice(0, 8))}`,
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const notes: string[] = [];
  if (item.duplicateOfId) notes.push('Already received — linked to an existing report.');
  if (item.clarificationQuestion) notes.push(`wxperts asked: ${item.clarificationQuestion}`);
  if (item.clarificationAnswer) notes.push(`Your reply: ${item.clarificationAnswer}`);
  if (item.declineReason) notes.push(`Declined: ${item.declineReason}`);
  const notesHtml = notes.length
    ? `<div class="notes">${notes.map((n) => `<p>${escapeHtml(n)}</p>`).join('')}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); padding: 0 12px; color: var(--vscode-foreground); }
  h2 { margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 14px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--vscode-descriptionForeground); margin: 18px 0 6px; }
  .field { margin-bottom: 10px; }
  .key { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 2px; }
  .val { white-space: pre-wrap; word-wrap: break-word; background: var(--vscode-textCodeBlock-background); padding: 8px 10px; border-radius: 4px; }
  .notes { border-left: 3px solid var(--vscode-textBlockQuote-border, #8884); padding: 4px 10px; margin: 12px 0; background: var(--vscode-textBlockQuote-background, transparent); }
  .notes p { margin: 4px 0; }
  .muted { color: var(--vscode-descriptionForeground); }
</style></head>
<body>
  <h2>${escapeHtml(item.title)}</h2>
  <div class="meta">${metaBits}</div>
  ${notesHtml}
  <h3>What you reported</h3>
  ${renderRecord(item.details)}
  <h3>Captured context</h3>
  ${renderRecord(item.context)}
  <p class="muted" style="margin-top:18px;font-size:11px;">Read-only — this is the report you submitted.</p>
</body></html>`;
}

function renderRecord(rec: Record<string, unknown> | null): string {
  if (!rec || typeof rec !== 'object' || Object.keys(rec).length === 0) {
    return `<p class="muted">Nothing recorded.</p>`;
  }
  const fields = Object.entries(rec)
    .filter(([, v]) => v !== null && v !== undefined && `${v}`.trim() !== '')
    .map(([k, v]) => {
      const value = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
      return `<div class="field"><div class="key">${escapeHtml(humanize(k))}</div><div class="val">${escapeHtml(value)}</div></div>`;
    });
  return fields.length ? fields.join('') : `<p class="muted">Nothing recorded.</p>`;
}
// [SCOPE 043 / T011] END

// [SCOPE 043 / T011] BEGIN — feedback-detail render helpers
function humanize(key: string): string {
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
// [SCOPE 043 / T011] END
