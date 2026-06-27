import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { CockpitMcpClient } from './mcpClient.js';
import { resolveProjectContext } from './projectContext.js';
import { resolveToken } from './auth.js';

// [SCOPE 073 / T010] BEGIN — editor capture of scope dependencies.
// Watches specs/Project-Scope/*.md and, on save/create, harvests the scope's
// `**Depends On**` / `**Related Scopes**` lines and pushes them to the hosted MCP
// (project.set_scope_dependencies), which stores the edges and regenerates the
// scope-flow doc. This catches raw file edits that never go through create_specs —
// the server-side create_specs trigger covers the materialization path.
//
// Entirely best-effort: any failure is swallowed so it can never disrupt the editor.
// Debounced per-file so rapid saves coalesce into one capture.

const DEBOUNCE_MS = 1200;
const timers = new Map<string, NodeJS.Timeout>();

function parseScopeNumber(filePath: string): number | null {
  const m = path.basename(filePath).match(/^(\d{2,3})-/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : n;
}

function parseDeps(content: string): { dependsOnRaw: string; relatedRaw: string } {
  const c = content.replace(/\r/g, '');
  return {
    dependsOnRaw: c.match(/^\*\*Depends On\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '',
    relatedRaw: c.match(/^\*\*Related Scopes\*\*:\s*(.+)$/m)?.[1]?.trim() ?? '',
  };
}

async function capture(secrets: vscode.SecretStorage, uri: vscode.Uri): Promise<void> {
  try {
    const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
    const ctx = resolveProjectContext(folders);
    if (!ctx) return;

    const scopeNumber = parseScopeNumber(uri.fsPath);
    if (scopeNumber === null) return;

    const content = fs.readFileSync(uri.fsPath, 'utf-8');
    const { dependsOnRaw, relatedRaw } = parseDeps(content);

    const token = await resolveToken(secrets, ctx.projectRoot, ctx.projectId);
    if (!token) return;

    const client = new CockpitMcpClient({ baseUrl: ctx.mcpBaseUrl, token });
    await client.setScopeDependencies(ctx.projectId, scopeNumber, dependsOnRaw, relatedRaw);
  } catch {
    /* best-effort — never disrupt the editor */
  }
}

function schedule(secrets: vscode.SecretStorage, uri: vscode.Uri): void {
  const key = uri.fsPath;
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      void capture(secrets, uri);
    }, DEBOUNCE_MS),
  );
}

/** Register the scope-dependency file watcher. Safe to call once at activation. */
export function registerScopeDepsWatcher(
  context: vscode.ExtensionContext,
  secrets: vscode.SecretStorage,
): void {
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => f.uri.fsPath);
  const ctx = resolveProjectContext(folders);
  if (!ctx) return; // not a wxKanban project workspace

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(ctx.projectRoot, 'specs/Project-Scope/*.md'),
  );
  watcher.onDidChange((uri) => schedule(secrets, uri));
  watcher.onDidCreate((uri) => schedule(secrets, uri));
  context.subscriptions.push(watcher);
}
// [SCOPE 073 / T010] END
