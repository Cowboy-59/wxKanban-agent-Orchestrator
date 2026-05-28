import * as vscode from 'vscode';
import type { CockpitScope, CockpitTask } from '../types.js';

let panel: vscode.WebviewPanel | undefined;

// [SCOPE 042 / T017] BEGIN — showTaskDetail (read-only webview; scripts disabled)
export function showTaskDetail(task: CockpitTask, scope: CockpitScope): void {
  if (!panel) {
    panel = vscode.window.createWebviewPanel(
      'wxkanban.detail',
      'wxKanban Task',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: false, retainContextWhenHidden: false },
    );
    panel.onDidDispose(() => {
      panel = undefined;
    });
  }
  panel.title = `#${scope.specNumber} · ${truncate(task.title, 24)}`;
  panel.webview.html = renderHtml(task, scope);
  panel.reveal(vscode.ViewColumn.Beside, true);
}
// [SCOPE 042 / T017] END

// [SCOPE 042 / T017] BEGIN — renderHtml (escaped, read-only detail)
function renderHtml(task: CockpitTask, scope: CockpitScope): string {
  const desc = task.descriptionMarkdown?.trim()
    ? `<pre class="desc">${escapeHtml(task.descriptionMarkdown)}</pre>`
    : `<p class="muted">No description.</p>`;
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body { font-family: var(--vscode-font-family); padding: 0 12px; color: var(--vscode-foreground); }
  h2 { margin-bottom: 4px; }
  .meta { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 12px; }
  .badge { display: inline-block; padding: 1px 6px; border-radius: 3px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .desc { white-space: pre-wrap; word-wrap: break-word; background: var(--vscode-textCodeBlock-background); padding: 10px; border-radius: 4px; }
  .muted { color: var(--vscode-descriptionForeground); }
</style></head>
<body>
  <h2>${escapeHtml(task.title)}</h2>
  <div class="meta">
    Scope <strong>#${escapeHtml(scope.specNumber)}</strong> — ${escapeHtml(scope.title)}
    &nbsp;·&nbsp; status: <span class="badge">${escapeHtml(task.status)}</span>
  </div>
  ${desc}
  <p class="muted" style="margin-top:16px;font-size:11px;">Read-only (v1). Editing arrives with the bug-fix scope.</p>
</body></html>`;
}
// [SCOPE 042 / T017] END

// [SCOPE 042 / T017] BEGIN — detail-panel render helpers
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
// [SCOPE 042 / T017] END
